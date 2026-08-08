#!/usr/bin/env python3
"""Run a task on a remote model, executing its tool calls locally.

The remote model drives a loop: it asks to read files, grep, or run commands;
this runner executes them here and feeds results back; it iterates until it
calls finish(). Only the final report returns to the caller, so an agent can
burn a hundred thousand tokens exploring a repo without any of it entering the
coordinator's context.

TWO TOOL PROTOCOLS
  native  - the API's `tools` parameter. Correct for anthropic_tool_call.*.
  prompt  - tools described in the system prompt; the model replies with a
            ```tool {...}``` block that we parse. This is what Cline calls
            "disable native tools", and it is REQUIRED for gpt-5.6-*: that
            family rejects `tools` whenever reasoning_effort is set, so native
            mode forces effort=none and throws away the thinking that makes
            them worth using. Prompt mode keeps reasoning at high/xhigh.
  auto    - native for anthropic_tool_call.*, prompt for everything else.

VISIBILITY
  Every step is appended live to a transcript (--transcript, default under
  .claude/agent-runs/) and echoed to stderr: the model's own narration, the
  tool call, and a preview of the result. Tail it to watch the agent think:
      tail -f .claude/agent-runs/<name>.md

STEERING
  Before each turn the runner reads <transcript>.steer. Anything you put there
  is injected as a user message and the file is cleared, so you can redirect a
  run in flight without killing it:
      echo "stop reading main.ts, focus on src/library" > <transcript>.steer

SAFETY (deliberately conservative -- widen only on request)
  * paths confined to the repo root; .. and absolute escapes refused
  * commands matched against an argv allowlist; shell=False throughout, so no
    pipes, globbing, chaining or substitution is possible
  * write_file never touches disk; writes are emitted as a patch for review
  * hard iteration cap
  * transport timeouts (client-side read timeout) and non-advancing replies
    (a 200 that carried no tool action) are both treated as the same
    retryable condition and retried with jittered backoff, never crashing
    the run; genuinely terminal HTTP auth failures (401/403) still exit
"""
import argparse
import datetime
import difflib
import fnmatch
import json
import os
import random
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

CONF = os.path.join(os.path.expanduser("~"), ".claude", ".openwebui.env")
DEFAULT_MODEL = "anthropic_tool_call.claude-opus-4-8-think"
MAX_RESULT_CHARS = 100_000
CMD_TIMEOUT = 600

# Per-request read timeout, seconds. Tradeoff: reasoning models at xhigh effort
# legitimately take minutes to reply, so this must stay generous or we would
# abort perfectly healthy calls. But an unbounded wait is worse -- a single
# wedged upstream connection would hang the whole run forever with no recovery,
# turning one slow call into a dead run. A bounded-but-generous timeout lets the
# retry path (see call_model) recover instead.
REQUEST_TIMEOUT = 600

# Argv prefix rules. Each element is an fnmatch pattern, so a rule can name a
# path shape. Matched element-wise over the first len(rule) argv entries, never
# through a shell.
#
# These are patterns, not literals, because the literal form was silently broken:
# ["node", "scripts"] required argv[1] to be exactly "scripts", so every real
# invocation (node scripts/check-css-motion.mjs) was refused by a rule that
# looked like it permitted them.
ALLOWED_CMDS = [
    ["npm", "test"], ["npm", "run", "build"], ["npm", "run", "build:*"],
    ["npx", "vitest", "run"], ["npx", "vitest", "run", "*"], ["npx", "tsc"],
    ["git", "status"], ["git", "diff"], ["git", "log"],
    ["node", "scripts/*"],
    ["python", "-m", "py_compile", "*"],
    ["python", "tools/agent-harness/*"],   # symmetric with node scripts/*: run a self-test
]

TOOL_DOCS = [
    ("read_file", {"path": "repo-relative path", "start_line": 1, "end_line": 200},
     "Read a UTF-8 text file, or just a line range. start_line/end_line are optional. "
     "Files larger than 30,000 chars CANNOT be read whole -- grep to find the lines you "
     "need, then read that range. Re-reading a file you already read returns a pointer."),
    ("list_dir", {"path": "repo-relative path"},
     "List files and directories."),
    ("grep", {"pattern": "regex", "glob": "optional, e.g. src/**/*.ts"},
     "Search file contents. Prefer this over reading large files whole."),
    ("run_command", {"argv": ["npm", "test"]},
     "Run an allowlisted command. No shell: pipes and globs will not work. "
     "Allowed: " + "; ".join(" ".join(a) for a in ALLOWED_CMDS)),
    ("write_file", {"path": "...", "content": "full new contents"},
     "Write a whole file. Requires the COMPLETE new contents, so use it only for "
     "small or brand-new files; for an existing file prefer replace_in_file."),
    ("replace_in_file", {"path": "...", "old_string": "exact text to find",
                         "new_string": "replacement text"},
     "Edit part of a file. old_string must match byte-for-byte and appear EXACTLY "
     "once; include surrounding lines to make it unique. This is the correct way to "
     "edit a large file you cannot read whole."),
    ("finish", {"summary": "your final report"},
     "Call when done."),
]


def load_cfg():
    cfg = {}
    if os.path.exists(CONF):
        for line in open(CONF, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                cfg[k.strip()] = v.strip().strip('"').strip("'")
    url = cfg.get("OPENWEBUI_URL") or os.environ.get("OPENWEBUI_URL")
    key = cfg.get("OPENWEBUI_API_KEY") or os.environ.get("OPENWEBUI_API_KEY")
    if not url or not key:
        sys.exit(f"error: set OPENWEBUI_URL and OPENWEBUI_API_KEY in {CONF}")
    url = url.rstrip("/")
    return (url[:-4] if url.endswith("/api") else url), key


def link_node_modules(root, wt):
    """Point the worktree's node_modules at the real one.

    `git worktree add` gives a clean checkout with no node_modules, so npx/vitest
    would fail there and the agent could not verify anything. A junction (Windows,
    no admin needed) or symlink costs nothing and is gitignored already.
    """
    src, dst = os.path.join(root, "node_modules"), os.path.join(wt, "node_modules")
    if not os.path.isdir(src) or os.path.exists(dst):
        return
    try:
        if os.name == "nt":
            subprocess.run(["cmd", "/c", "mklink", "/J", dst, src],
                           capture_output=True, timeout=60)
        else:
            os.symlink(src, dst)
    except (OSError, subprocess.SubprocessError) as e:
        print(f"warning: could not link node_modules into the worktree: {e}",
              file=sys.stderr)


def make_worktree(root, label):
    """Disposable worktree on its own branch, so real writes stay off the main tree."""
    wt = os.path.join(root, ".claude", "worktrees", label)
    branch = "agent/" + label
    subprocess.run(["git", "worktree", "remove", "--force", wt],
                   cwd=root, capture_output=True)
    subprocess.run(["git", "branch", "-D", branch], cwd=root, capture_output=True)
    os.makedirs(os.path.dirname(wt), exist_ok=True)
    r = subprocess.run(["git", "worktree", "add", "-b", branch, wt, "HEAD"],
                       cwd=root, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"error: could not create worktree: {r.stderr.strip()}")
    link_node_modules(root, wt)
    print(f"worktree:   {wt}  (branch {branch})", file=sys.stderr, flush=True)
    return wt, branch


def worktree_diff(wt):
    subprocess.run(["git", "add", "-A"], cwd=wt, capture_output=True)
    r = subprocess.run(["git", "diff", "--cached"], cwd=wt,
                       capture_output=True, text=True)
    return r.stdout


class Runner:
    SKIP_DIRS ={".git", "node_modules", "dist", "packages", "webos-app", ".kilo", ".gstack"}
    MAX_READ_CHARS = 30_000     # ~7.5k tokens; above this, force grep or a line range

    def __init__(self, root, write_mode="stage"):
        """write_mode 'disk' writes for real; 'stage' accumulates a review patch.

        Staging is safe but makes an agent unable to verify itself: run_command
        executes against the on-disk tree, so a staged edit is invisible to the
        tests that are supposed to prove it. Worktree runs use 'disk' precisely so
        that implement-then-verify is coherent; the isolation comes from the
        worktree, not from withholding the writes.
        """
        self.root = os.path.realpath(root)
        self.write_mode = write_mode
        self.pending = {}
        self.read_whole = set()
        self.calls = 0
        self.refused = 0

    def _resolve(self, path):
        full = os.path.realpath(os.path.join(self.root, path))
        if full != self.root and not full.startswith(self.root + os.sep):
            raise ValueError(f"path escapes the repo root: {path}")
        return full

    def read_file(self, path, start_line=None, end_line=None):
        """Read a file, or a line range of one.

        Whole-file reads of large files are the main way an agent run dies: one
        86 KB stylesheet read twice cost ~45k tokens and blew the context. So
        oversized reads are refused with directions rather than served, and a
        repeated whole-file read returns a pointer instead of the content again.
        """
        if path in self.pending:
            return f"(pending, not yet on disk)\n{self.pending[path]}"
        text = open(self._resolve(path), encoding="utf-8", errors="replace").read()

        if start_line is not None or end_line is not None:
            lines = text.splitlines(True)
            a = max(1, int(start_line or 1))
            b = min(len(lines), int(end_line or a + 200))
            body = "".join(lines[a - 1:b])
            head = f"({path} lines {a}-{b} of {len(lines)})\n"
            if len(body) > self.MAX_READ_CHARS:
                body = body[:self.MAX_READ_CHARS] + "\n...[range too large; narrow it]"
            return head + body

        if path in self.read_whole:
            return (f"You already read all of {path} earlier in this run; the content "
                    "is above. Re-read a specific range with start_line/end_line if you "
                    "need to look again.")

        if len(text) > self.MAX_READ_CHARS:
            n = text.count("\n") + 1
            return (f"refused: {path} is {len(text):,} chars ({n:,} lines), over the "
                    f"{self.MAX_READ_CHARS:,}-char whole-read limit. Use grep to locate "
                    "what you need, then read_file with start_line/end_line. Reading a "
                    "file this size whole will exhaust the context and kill this run.")

        self.read_whole.add(path)
        return text

    def list_dir(self, path="."):
        full = self._resolve(path)
        out = []
        for name in sorted(os.listdir(full)):
            if name in self.SKIP_DIRS:
                continue
            p = os.path.join(full, name)
            out.append(f"{name}/" if os.path.isdir(p) else
                       f"{name}  ({os.path.getsize(p):,} b)")
        return "\n".join(out) or "(empty)"

    def grep(self, pattern, glob=None):
        argv = ["rg", "-n", "--no-heading", "-S", pattern]
        if glob:
            argv += ["-g", glob]
        try:
            r = subprocess.run(argv, cwd=self.root, capture_output=True,
                               text=True, timeout=120, shell=False)
            return r.stdout or "(no matches)"
        except subprocess.TimeoutExpired:
            return "error: search timed out"
        except FileNotFoundError:
            pass                       # ripgrep absent on this machine; fall through
        return self._grep_py(pattern, glob)

    def _grep_py(self, pattern, glob=None):
        try:
            rx = re.compile(pattern, re.IGNORECASE)
        except re.error as e:
            return f"error: bad regex: {e}"
        hits, truncated = [], False
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if d not in self.SKIP_DIRS]
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, self.root).replace(os.sep, "/")
                if glob and not fnmatch.fnmatch(rel, glob) and not fnmatch.fnmatch(fn, glob):
                    continue
                try:
                    with open(full, encoding="utf-8", errors="strict") as fh:
                        for n, line in enumerate(fh, 1):
                            if rx.search(line):
                                hits.append(f"{rel}:{n}:{line.rstrip()[:300]}")
                                if len(hits) >= 2000:
                                    truncated = True
                                    break
                except (OSError, UnicodeDecodeError):
                    continue
                if truncated:
                    break
            if truncated:
                break
        if not hits:
            return "(no matches)"
        return "\n".join(hits) + ("\n...[stopped at 2000 matches]" if truncated else "")

    def run_command(self, argv):
        if not isinstance(argv, list) or not all(isinstance(a, str) for a in argv):
            return "error: argv must be a list of strings"
        def permitted(rule):
            return len(argv) >= len(rule) and all(
                fnmatch.fnmatch(argv[i], rule[i]) for i in range(len(rule)))

        if not any(permitted(rule) for rule in ALLOWED_CMDS):
            self.refused += 1
            return (f"refused: {' '.join(argv)} is not allowlisted.\n"
                    "Allowed patterns: " + "; ".join(" ".join(a) for a in ALLOWED_CMDS)
                    + "\nDo not retry the same command; it will be refused again.")
        # On Windows npm/npx/node are .cmd shims that shell=False cannot resolve by
        # bare name. Resolve the real executable rather than reaching for a shell.
        exe = shutil.which(argv[0])
        if exe is None:
            for ext in (".cmd", ".exe", ".bat"):
                exe = shutil.which(argv[0] + ext)
                if exe:
                    break
        if exe is None:
            return f"error: {argv[0]} not found on PATH"
        try:
            r = subprocess.run([exe] + argv[1:], cwd=self.root, capture_output=True,
                               text=True, timeout=CMD_TIMEOUT, shell=False)
        except subprocess.TimeoutExpired:
            return f"error: timed out after {CMD_TIMEOUT}s"
        except OSError as e:
            return f"error: cannot run {argv[0]}: {e}"
        return f"exit={r.returncode}\n--- stdout ---\n{r.stdout}\n--- stderr ---\n{r.stderr}"

    def _current(self, path):
        """Contents an edit should apply to: staged version if any, else disk."""
        if self.write_mode == "stage" and path in self.pending:
            return self.pending[path]
        return open(self._resolve(path), encoding="utf-8", errors="replace").read()

    def _commit(self, path, content):
        self.read_whole.discard(path)          # contents changed; allow a re-read
        if self.write_mode == "disk":
            full = self._resolve(path)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "w", encoding="utf-8", newline="") as fh:
                fh.write(content)
            return True
        self.pending[path] = content
        return False

    def write_file(self, path, content):
        self._resolve(path)
        wrote = self._commit(path, content)
        return (f"wrote {path} ({len(content):,} chars)." if wrote else
                f"staged {path} ({len(content):,} chars). Not written to disk.")

    def replace_in_file(self, path, old_string, new_string):
        """Exact-match single replacement.

        The only way to edit a file too large to read whole -- requiring full
        contents for a write made an 82 KB stylesheet uneditable. Refuses on zero
        or multiple matches rather than guessing which occurrence was meant.
        """
        self._resolve(path)
        try:
            text = self._current(path)
        except OSError as e:
            return f"error: cannot read {path}: {e}"
        n = text.count(old_string)
        if n == 0:
            return (f"error: old_string not found in {path}. It must match the file "
                    "byte-for-byte including indentation. grep for a nearby unique "
                    "line and copy it exactly.")
        if n > 1:
            return (f"error: old_string appears {n} times in {path}; it must be unique. "
                    "Include surrounding lines to disambiguate.")
        wrote = self._commit(path, text.replace(old_string, new_string))
        return (f"replaced 1 occurrence in {path}"
                + ("." if wrote else " (staged, not on disk)."))

    def patch(self):
        chunks = []
        for path, new in sorted(self.pending.items()):
            try:
                old = open(self._resolve(path), encoding="utf-8", errors="replace").read()
            except OSError:
                old = ""
            chunks.extend(difflib.unified_diff(
                old.splitlines(True), new.splitlines(True),
                fromfile="a/" + path, tofile="b/" + path))
        return "".join(chunks)

    def dispatch(self, name, args):
        self.calls += 1
        fn = getattr(self, name, None)
        if fn is None or name.startswith("_") or name not in {d[0] for d in TOOL_DOCS}:
            return f"error: no such tool {name}"
        try:
            out = fn(**args)
        except Exception as e:
            return f"error: {type(e).__name__}: {e}"
        return out if len(out) <= MAX_RESULT_CHARS else \
            out[:MAX_RESULT_CHARS] + f"\n...[truncated at {MAX_RESULT_CHARS:,} chars]"


class Transcript:
    """Live, flushed-on-write log so a human can tail the run as it happens."""

    def __init__(self, path, header):
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self.path = path
        self.fh = open(path, "w", encoding="utf-8")
        self.write(header)

    def write(self, text):
        self.fh.write(text + "\n")
        self.fh.flush()
        os.fsync(self.fh.fileno())

    def step(self, i, narration, tool, args, result):
        if narration:
            self.write(f"\n### [{i}] thinking\n\n{narration.strip()}")
        if tool:
            brief = json.dumps(args)[:300]
            self.write(f"\n### [{i}] {tool}({brief})\n")
            self.write("```\n" + (result or "")[:1500] +
                       ("\n...[truncated in transcript]" if len(result or "") > 1500 else "") +
                       "\n```")
        print(f"  [{i:>2}] {tool or 'reply'}"
              f"{'  ' + json.dumps(args)[:70] if args else ''}", file=sys.stderr, flush=True)

    def close(self):
        self.fh.close()


BASE_RULES = """You are a delegated engineering agent working in a repository.

Gather evidence with the tools before concluding anything; never guess file
contents or command output.

Budget your context deliberately. Files over 30,000 characters cannot be read
whole and the attempt is refused: grep for what you need, then read_file with
start_line/end_line. Never re-read a file you have already read -- scroll back
instead. Running out of context kills the run and wastes all the work.

Edit with replace_in_file, not write_file, whenever the file already exists:
write_file needs the complete contents, which is impossible for a large file.

You cannot run arbitrary shell commands, only the allowlisted ones. A refused
command will be refused every time -- do not retry it, find another way.

Narrate briefly what you are doing and why before each tool call: a human is
watching this run live and may redirect you.

When done, call finish() with a report that states what you verified and how,
and says plainly what you could NOT verify. An honest gap is worth more than a
confident guess."""

PROMPT_PROTOCOL = """

## Using tools

To call a tool, end your reply with exactly one fenced block:

```tool
{"name": "<tool>", "args": {...}}
```

Write your reasoning as normal text before the block. Emit ONE block per reply
and nothing after it. Do not invent tools.

Available tools:
"""


def prompt_system():
    lines = [BASE_RULES, PROMPT_PROTOCOL]
    for name, args, desc in TOOL_DOCS:
        lines.append(f"- `{name}` args={json.dumps(args)}\n    {desc}")
    return "\n".join(lines)


OPTIONAL_ARGS = {"glob", "start_line", "end_line"}


def native_tools():
    out = []
    for name, args, desc in TOOL_DOCS:
        props, required = {}, []
        for k, v in args.items():
            if isinstance(v, list):
                props[k] = {"type": "array", "items": {"type": "string"}}
            elif isinstance(v, bool) or isinstance(v, int):
                props[k] = {"type": "integer"}
            else:
                props[k] = {"type": "string"}
            if k not in OPTIONAL_ARGS:
                required.append(k)
        out.append({"type": "function", "function": {
            "name": name, "description": desc,
            "parameters": {"type": "object", "properties": props, "required": required}}})
    return out


TOOL_BLOCK = re.compile(r"```tool\s*(\{.*?\})\s*```", re.S)
THINK_BLOCK = re.compile(r"<think>.*?</think>", re.S)


def chat(url, key, payload):
    req = urllib.request.Request(url + "/api/chat/completions",
                                 data=json.dumps(payload).encode(), method="POST")
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        # Auth failures are terminal: retrying a bad/expired key is pointless,
        # so exit rather than burn the retry budget.
        if e.code in (401, 403):
            sys.exit(f"error: HTTP {e.code}\n{e.read()[:600].decode(errors='replace')}")
        # Other HTTP errors (e.g. 5xx from a struggling gateway) are transient:
        # hand a sentinel back so call_model retries instead of dying.
        return {"_transient": f"HTTP {e.code} after {REQUEST_TIMEOUT}s"}
    except (TimeoutError, socket.timeout):
        # Client-side read timeout. TimeoutError is NOT a subclass of URLError,
        # so it would otherwise propagate and kill the whole run. Note that the
        # same slow upstream can instead surface as a 200 whose content is a
        # bare "Error:" (str(TimeoutError()) is ""); advances() rejects that,
        # so both symptoms funnel into the identical retry path.
        return {"_transient": f"read timeout after {REQUEST_TIMEOUT}s"}
    except urllib.error.URLError as e:
        # Connection-level failure (DNS, refused, reset). Transient: retry.
        return {"_transient": f"cannot reach gateway: {e.reason}"}


def advances(resp, mode):
    # True when the reply gives the loop something to act on. WHY this exists:
    # "no tool calls" must never again be conflated with "the model is done".
    # A reply with no tool_calls (native) or no tool block (prompt) used to be
    # accepted as the final answer, so a gateway hiccup that returned a bare
    # "Error:" with no tool_calls got reported as a run's result. finish is
    # itself a tool, so a genuine completion still advances the loop.
    # A transient transport failure (see chat) is signalled by the sentinel
    # dict, which has no "choices"; it never advances, so call_model retries.
    # Test key PRESENCE, not truthiness: an empty message ({"_transient": ""})
    # is still a transport failure, and a truthiness test would fall through to
    # resp["choices"] and reintroduce the KeyError this sentinel exists to
    # prevent. The isinstance guard keeps a None or list from raising here.
    if isinstance(resp, dict) and "_transient" in resp:
        return False
    msg = resp["choices"][0]["message"]
    if mode == "native":
        return bool(msg.get("tool_calls"))
    return TOOL_BLOCK.search(msg.get("content") or "") is not None


def log_anomaly(anomaly_path, turn, attempt, mode, payload, resp):
    # One JSON object per line, appended. NOTE: the gateway returns usage as
    # null, so we deliberately do NOT rely on token counts to detect anomalies;
    # the signal is purely "the reply did not advance the loop".
    request_bytes = len(json.dumps(payload).encode())
    # Classify by key PRESENCE, not truthiness: a falsey sentinel such as
    # {"_transient": ""} is still a transport failure and has no "choices".
    # A truthiness test would mislabel it "no_advance" and then index it as a
    # normal response, reintroducing the KeyError the sentinel exists to prevent.
    is_transient = isinstance(resp, dict) and "_transient" in resp
    transient = resp.get("_transient") if isinstance(resp, dict) else None
    rec = {
        "turn": turn,
        "attempt": attempt,
        "mode": mode,
        "model": payload.get("model"),
        # "cause" distinguishes the two ways a call fails to advance the loop:
        # "transport" is a client-side/gateway transport failure (e.g. a read
        # timeout), "no_advance" is a well-formed 200 that carried no tool
        # action. Keeping them apart matters when correlating with the gateway
        # operator: only the latter implies the model itself misbehaved.
        "cause": "transport" if is_transient else "no_advance",
        "transient": transient,
        "messages_in_request": len(payload.get("messages") or []),
        "request_bytes": request_bytes,
        "response": resp,
    }
    if not is_transient:
        msg = resp["choices"][0]["message"]
        # top-level "id" is the gateway's correlation id -- the only handle for
        # reporting this upstream.
        rec["response_id"] = resp.get("id")
        rec["finish_reason"] = resp["choices"][0].get("finish_reason")
        rec["content"] = msg.get("content")
    with open(anomaly_path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec) + "\n")


def call_model(url, key, payload, mode, tr, anomaly_path, turn):
    # Wraps chat() with retries when the reply does not advance the loop.
    # Retrying is side-effect free: it happens BEFORE any tool of that turn
    # executes, so nothing on disk has changed yet. 4 attempts total.
    #
    # Jitter matters because several agents run in parallel via fanout.py; a
    # fixed backoff would make them all retry in lockstep and re-hammer a
    # struggling gateway at the same instants.
    backoffs = [2, 8, 20]      # seconds before attempts 2, 3, 4
    resp = None
    for attempt in range(1, 5):
        # Pre-call heartbeat: the transcript is otherwise only written AFTER a
        # reply arrives, so a legitimately slow xhigh call is indistinguishable
        # from a wedged one. Emit one short line to transcript AND stderr the
        # instant a call (or retry) starts, so a working-but-slow agent stays
        # visible. This fires per attempt, so retries are seen as they happen.
        req_bytes = len(json.dumps(payload).encode())
        n_msgs = len(payload.get("messages") or [])
        hb = (f"[{turn:>2}] calling {payload.get('model')} "
              f"(attempt {attempt}/4, {n_msgs} msgs, ~{req_bytes} bytes) ...")
        if tr is not None:
            tr.write(f"\n_{hb}_")
        print("  " + hb, file=sys.stderr, flush=True)
        resp = chat(url, key, payload)
        if advances(resp, mode):
            return resp, True
        log_anomaly(anomaly_path, turn, attempt, mode, payload, resp)
        # Presence, not truthiness: a falsey sentinel ({"_transient": ""}) is
        # still a transport failure, so classify it as one for the log message.
        is_transient = isinstance(resp, dict) and "_transient" in resp
        transient = resp.get("_transient") if isinstance(resp, dict) else None
        reason = (f"transport failure ({transient})" if is_transient
                  else "reply carried no tool action")
        print(f"  [{turn:>2}] anomaly: {reason} "
              f"(attempt {attempt}/4)", file=sys.stderr, flush=True)
        if attempt < 4:
            delay = backoffs[attempt - 1] * random.uniform(0.75, 1.25)
            time.sleep(delay)
    return resp, False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-t", "--task", required=True)
    ap.add_argument("-m", "--model", default=DEFAULT_MODEL)
    ap.add_argument("-e", "--effort", default="high",
                    choices=["none", "low", "medium", "high", "xhigh"])
    ap.add_argument("--tool-mode", default="auto", choices=["auto", "native", "prompt"])
    ap.add_argument("-C", "--root", default=".")
    ap.add_argument("--max-iters", type=int, default=30)
    ap.add_argument("--patch", default="agent.patch")
    ap.add_argument("--transcript")
    ap.add_argument("--label", default="agent")
    ap.add_argument("--write", action="store_true",
                    help="real writes in --root without creating a worktree. Only safe "
                         "when --root is already a disposable worktree; otherwise the "
                         "agent edits your actual tree.")
    ap.add_argument("--worktree", action="store_true",
                    help="run in a disposable git worktree with REAL writes, so the "
                         "agent can run tests against its own edits")
    args = ap.parse_args()

    mode = args.tool_mode
    if mode == "auto":
        mode = "native" if args.model.startswith("anthropic_tool_call.") else "prompt"
    if mode == "native" and not args.model.startswith("anthropic_tool_call.") \
            and args.effort != "none":
        print(f"warning: {args.model} rejects native tools with reasoning_effort; "
              f"forcing effort=none. Use --tool-mode prompt to keep reasoning.",
              file=sys.stderr)
        args.effort = "none"

    url, key = load_cfg()
    main_root = os.path.realpath(args.root)
    wt_path = None
    if args.worktree:
        wt_path, wt_branch = make_worktree(main_root, args.label)
    run = Runner(wt_path or args.root, "disk" if (wt_path or args.write) else "stage")

    tpath = args.transcript or os.path.join(
        args.root, ".claude", "agent-runs",
        f"{datetime.datetime.now():%Y%m%d-%H%M%S}-{args.label}.md")
    steer_path = tpath + ".steer"
    tr = Transcript(tpath, "\n".join([
        f"# {args.label}", "",
        f"- model: `{args.model}`  effort: `{args.effort}`  tools: `{mode}`",
        f"- steer: write guidance into `{os.path.basename(steer_path)}` to redirect mid-run",
        "", "## Task", "", args.task, "", "---"]))
    print(f"transcript: {tpath}", file=sys.stderr, flush=True)

    # Sibling files next to the transcript.
    anomaly_path = tpath[:-3] + ".anomalies.jsonl" if tpath.endswith(".md") \
        else tpath + ".anomalies.jsonl"
    messages_path = tpath[:-3] + ".messages.jsonl" if tpath.endswith(".md") \
        else tpath + ".messages.jsonl"

    # Message journalling: every message appended to msgs is written here as one
    # JSON line, write-only, for post-mortem analysis of a dead run.
    #
    # A --resume flag is deliberately NOT implemented: replaying a journalled turn
    # would re-execute tools that already wrote to disk (write_file, replace_in_file,
    # run_command), which needs idempotency keys before it is safe.
    def journal(m):
        with open(messages_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(m) + "\n")

    def add_msg(m):
        msgs.append(m)
        journal(m)

    system = prompt_system() if mode == "prompt" else BASE_RULES
    msgs = []
    add_msg({"role": "system", "content": system})
    add_msg({"role": "user", "content": args.task})
    sent = recv = 0
    final = None
    nudges = 0        # consecutive replies that carried no tool action
    wrap_up = False   # take the partial-report path (cap reached, or gave up)

    for i in range(1, args.max_iters + 1):
        if os.path.exists(steer_path):                 # human course-correction
            guidance = open(steer_path, encoding="utf-8").read().strip()
            if guidance:
                add_msg({"role": "user",
                         "content": f"[operator guidance] {guidance}"})
                tr.write(f"\n### [{i}] OPERATOR GUIDANCE\n\n> {guidance}")
                print(f"  [{i:>2}] <-- operator guidance injected", file=sys.stderr, flush=True)
            open(steer_path, "w").close()

        payload = {"model": args.model, "messages": msgs, "stream": False}
        if args.effort != "none":
            payload["reasoning_effort"] = args.effort
        if mode == "native":
            payload["tools"] = native_tools()
            payload["tool_choice"] = "auto"

        resp, ok = call_model(url, key, payload, mode, tr, anomaly_path, i)
        u = resp.get("usage") or {}
        sent += u.get("prompt_tokens") or 0
        recv += u.get("completion_tokens") or 0
        # resp may be the transient sentinel (no "choices") when ok is False, so
        # extract defensively rather than indexing -- otherwise the very timeout
        # we are hardening against would crash here instead of being retried.
        choices = resp.get("choices")
        msg = choices[0]["message"] if choices else {}
        content = msg.get("content") or ""

        if not ok:
            # The reply never advanced after 4 attempts. Do NOT end the run on
            # gateway garbage. Nudge: tell the model it called no tool so nothing
            # ran, and it must call exactly one tool or finish. Allow at most 2
            # such nudges; on the third give-up, stop the loop and fall through to
            # the iteration-cap wrap-up so a partial report is still produced.
            nudges += 1
            if nudges >= 3:
                tr.write("\n**model returned no tool action 3 times; giving up "
                         "and requesting a wrap-up**")
                print(f"  [{i:>2}] no tool action after retries x3; wrapping up",
                      file=sys.stderr, flush=True)
                wrap_up = True
                break
            tr.step(i, content, "NO_TOOL_ACTION", {}, "nudging for a tool call")
            add_msg({"role": "assistant", "content": content})
            add_msg({"role": "user", "content":
                     "You called no tool, so nothing ran. Call exactly one tool "
                     "now to make progress, or call finish if you are genuinely "
                     "done."})
            continue
        nudges = 0

        if mode == "native":
            calls = msg.get("tool_calls")
            # ok is True, so calls is non-empty here (advances() guarantees it).
            # Reasoning models surface <think> blocks in content. Replaying those
            # verbatim into the next request feeds the upstream API a thinking block
            # it did not author and cannot verify, which is a plausible cause of the
            # gateway returning a bare "Error:" a few turns in. Send the prose only.
            replay = THINK_BLOCK.sub("", content).strip()
            add_msg({"role": "assistant", "content": replay, "tool_calls": calls})
            stop = False
            for c in calls:
                name = c["function"]["name"]
                try:
                    cargs = json.loads(c["function"]["arguments"] or "{}")
                except json.JSONDecodeError as e:
                    result = f"error: unparseable arguments: {e}"
                    cargs = {}
                else:
                    if name == "finish":
                        final = cargs.get("summary", "")
                        stop = True
                        result = "ok"
                    else:
                        result = run.dispatch(name, cargs)
                tr.step(i, content if c is calls[0] else None, name, cargs, result)
                add_msg({"role": "tool", "tool_call_id": c["id"], "content": result})
            if stop:
                break
        else:
            # ok is True, so a tool block is present here (advances() guarantees it).
            m = TOOL_BLOCK.search(content)
            narration = content[:m.start()].strip()
            try:
                call = json.loads(m.group(1))
                name, cargs = call["name"], call.get("args", {})
            except Exception as e:
                add_msg({"role": "assistant", "content": content})
                add_msg({"role": "user",
                         "content": f"That tool block was unparseable ({e}). "
                                    "Re-emit exactly one valid ```tool block."})
                tr.step(i, narration, "PARSE_ERROR", {}, str(e))
                continue
            if name == "finish":
                final = cargs.get("summary", "")
                tr.step(i, narration, "finish", {}, "ok")
                break
            result = run.dispatch(name, cargs)
            tr.step(i, narration, name, cargs, result)
            add_msg({"role": "assistant", "content": content})
            add_msg({"role": "user",
                     "content": f"Result of {name}:\n\n{result}"})
        if wrap_up:
            break
    else:
        wrap_up = True     # ran to the iteration cap without a finish()

    if wrap_up:
        # The cap is a budget, not a failure. An agent that spent 6 turns reading
        # real files has findings worth keeping, so spend one more call asking for
        # them rather than discarding the whole run for want of a finish(). This
        # same path also serves the give-up case (model returned no tool action
        # after retries + nudges), so a partial report is always produced.
        tr.write(f"\n**hit the {args.max_iters}-iteration cap; requesting a wrap-up**")
        print(f"  [--] cap reached; asking for a partial report", file=sys.stderr, flush=True)
        add_msg({"role": "user", "content":
                 f"You have reached the {args.max_iters}-iteration limit and cannot "
                 "call any more tools. Write your final report NOW in plain prose "
                 "(no tool block) from what you established so far. State clearly "
                 "which parts are incomplete and what you would have checked next."})
        wrap = {"model": args.model, "messages": msgs, "stream": False}
        if args.effort != "none":
            wrap["reasoning_effort"] = args.effort
        resp = chat(url, key, wrap)
        u = resp.get("usage") or {}
        sent += u.get("prompt_tokens") or 0
        recv += u.get("completion_tokens") or 0
        # A transient failure on this single wrap-up call has no retry wrapper;
        # treat it as an empty report rather than crashing on the missing key.
        choices = resp.get("choices")
        final = ((choices[0]["message"].get("content") if choices else "") or "").strip()
        final = TOOL_BLOCK.sub("", final).strip()      # strip a stray block if emitted
        if final:
            final = (f"[PARTIAL - stopped at the {args.max_iters}-iteration cap]\n\n"
                     + final)

    if final:
        print(final)
        tr.write("\n---\n\n## Final report\n\n" + final)

    if wt_path:
        diff = worktree_diff(wt_path)
        patch_abs = os.path.join(main_root, args.patch)
        with open(patch_abs, "w", encoding="utf-8", newline="") as fh:
            fh.write(diff)
        files = diff.count("\n+++ ")
        note = (f"worktree {wt_path} on branch {wt_branch}: {files} file(s) changed "
                f"-> {args.patch}")
        tr.write(f"\n**{note}**")
        print(f"\n[{note}]", file=sys.stderr)
        if not diff.strip():
            print("warning: the agent changed nothing in the worktree",
                  file=sys.stderr)
    elif run.pending:
        with open(args.patch, "w", encoding="utf-8", newline="") as fh:
            fh.write(run.patch())
        note = f"staged {len(run.pending)} file(s) -> {args.patch}"
        tr.write(f"\n**{note}** (review: `git apply --check {args.patch}`)")
        print(f"\n[{note}; review with: git apply --check {args.patch}]", file=sys.stderr)

    tail = (f"[{args.model} e={args.effort} tools={mode}: {run.calls} tool calls"
            f"{f', {run.refused} refused' if run.refused else ''}"
            f"{f', {sent:,} tok sent / {recv:,} tok returned' if sent or recv else ''}]")
    tr.write("\n" + tail)
    tr.close()
    print(tail, file=sys.stderr)

    # A blank or bare-"Error:" report means the gateway or context limit killed the
    # run. Exiting 0 there would let fanout count it as a success and hide the loss.
    if not final or re.fullmatch(r"\s*Error:?\s*", final):
        print("error: model returned no usable report -- likely a context-limit or "
              f"gateway failure. Transcript: {tpath}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
