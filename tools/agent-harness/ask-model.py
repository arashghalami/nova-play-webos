#!/usr/bin/env python3
"""Send a prompt plus file contents to an OpenAI-compatible endpoint and print the reply.

Exists so Claude Code can offload big-input/small-output work (summarize, extract,
inventory) without the input ever entering its own context: this script reads the
files from disk, and only the model's answer comes back on stdout.

Config, from the environment or from ~/.claude/.openwebui.env (KEY=value lines,
so the API key never has to be pasted into a chat transcript):
    OPENWEBUI_URL       e.g. https://open-webui.adaptavist.net  (a trailing /api is fine)
    OPENWEBUI_API_KEY   from OpenWebUI: Settings -> Account -> API Keys
    OPENWEBUI_MODEL     optional default model id

Usage:
    ask-model.py -p "List every function that touches resume state." src/main.ts
    ask-model.py -m gpt-5.6-sol -e high -p "Summarize the conclusions." docs/**/2026-08-04.md
    ask-model.py --list-models

Exits non-zero with the server's message on failure -- it never returns a partial
or fabricated answer silently.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

TIMEOUT = 300
CHAR_CAP = 600_000  # ~150k tokens; refuse rather than silently truncate past this


CONF = os.path.join(os.path.expanduser("~"), ".claude", ".openwebui.env")
_file_cfg = {}
if os.path.exists(CONF):
    for line in open(CONF, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            _file_cfg[k.strip()] = v.strip().strip('"').strip("'")


def cfg(name, default=None):
    """The config file wins over the environment.

    It is this tool's explicit configuration; an environment variable of the same
    name is ambient and may have been exported by something else entirely (a stale
    OPENWEBUI_API_KEY JWT from another tool cost an afternoon of 401s once). The
    override is announced rather than silent.
    """
    fromfile, fromenv = _file_cfg.get(name), os.environ.get(name)
    if fromfile and fromenv and fromfile != fromenv:
        print(f"note: using {name} from {CONF}, ignoring the differing "
              f"environment variable of the same name", file=sys.stderr)
    v = fromfile or fromenv or default
    if v is None:
        sys.exit(
            f"error: {name} is not set.\n"
            f"  Put it in {CONF} as  {name}=...\n"
            "  (Get a key from OpenWebUI: Settings -> Account -> API Keys.)"
        )
    return v


def base_url():
    """Accepts the host with or without a trailing /api so paths never double up."""
    u = cfg("OPENWEBUI_URL").rstrip("/")
    return u[:-4] if u.endswith("/api") else u


def post(path, payload=None, method="POST"):
    url = base_url() + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + cfg("OPENWEBUI_API_KEY"))
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:800]
        sys.exit(f"error: {url} returned HTTP {e.code}\n{body}")
    except urllib.error.URLError as e:
        sys.exit(f"error: cannot reach {url}: {e.reason}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", help="files to include as context")
    ap.add_argument("-p", "--prompt", help="the instruction")
    ap.add_argument("-m", "--model", default=os.environ.get("OPENWEBUI_MODEL"))
    ap.add_argument("--list-models", action="store_true")
    # Left unset by default: reasoning models (gpt-5.6-*) reject any value but 1.
    ap.add_argument("--temperature", type=float)
    ap.add_argument("-e", "--effort", choices=["none", "low", "medium", "high", "xhigh"],
                    help="reasoning effort; sent as reasoning_effort (model-dependent)")
    args = ap.parse_args()

    if args.list_models:
        data = post("/api/models", method="GET")
        for m in data.get("data", data if isinstance(data, list) else []):
            print(m.get("id", m))
        return

    if not args.prompt:
        ap.error("-p/--prompt is required (or use --list-models)")
    if not args.model:
        ap.error("no model: pass -m or set OPENWEBUI_MODEL")

    parts, total = [], 0
    for path in args.files:
        try:
            text = open(path, "r", encoding="utf-8", errors="replace").read()
        except OSError as e:
            sys.exit(f"error: cannot read {path}: {e}")
        total += len(text)
        if total > CHAR_CAP:
            sys.exit(f"error: input exceeds {CHAR_CAP:,} chars at {path}. "
                     "Pass fewer files, or split the request.")
        parts.append(f"===== FILE: {path} =====\n{text}")

    content = args.prompt if not parts else args.prompt + "\n\n" + "\n\n".join(parts)

    payload = {
        "model": args.model,
        "messages": [{"role": "user", "content": content}],
        "stream": False,
    }
    if args.temperature is not None:
        payload["temperature"] = args.temperature
    if args.effort:
        payload["reasoning_effort"] = args.effort
    resp = post("/api/chat/completions", payload)

    try:
        print(resp["choices"][0]["message"]["content"])
    except (KeyError, IndexError):
        sys.exit("error: unexpected response shape:\n" + json.dumps(resp)[:800])

    u = resp.get("usage") or {}
    if u:
        print(f"\n[sent {u.get('prompt_tokens','?')} tok to {args.model}; "
              f"returned {u.get('completion_tokens','?')} tok]", file=sys.stderr)


if __name__ == "__main__":
    main()
