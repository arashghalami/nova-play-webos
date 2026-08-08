# Agent harness

Three scripts that let Claude Code delegate work to models on the Adaptavist
OpenWebUI gateway. The point is token economy: the delegated model reads files,
greps, and runs tests in its own context, and only its final report comes back —
so an agent can spend 300,000 tokens investigating a repo without any of it
entering the coordinator's context window.

Pure Python 3 stdlib. No `pip install`, no venv.

| Script | Use |
|---|---|
| `ask-model.py` | One shot. Send a prompt plus files, get an answer. No tools. |
| `delegate.py` | An agent loop. The model reads, greps, edits and runs commands; the harness executes them locally. |
| `fanout.py` | Several `delegate.py` agents in parallel on one problem, each with a different lens, optionally synthesized. |

## Setup

```sh
mkdir -p ~/.claude/bin
cp tools/agent-harness/*.py ~/.claude/bin/
```

Create `~/.claude/.openwebui.env` with **your own** key
(OpenWebUI → Settings → Account → API Keys):

```
OPENWEBUI_URL=https://open-webui.adaptavist.net
OPENWEBUI_MODEL=gpt-5.6-sol
OPENWEBUI_API_KEY=sk-...
```

That file lives outside any repo on purpose. **Never commit it.** It is read in
preference to environment variables of the same name, because a stale
`OPENWEBUI_API_KEY` exported by some other tool will otherwise shadow it and
produce confusing 401s.

Check it works:

```sh
python ~/.claude/bin/ask-model.py --list-models
```

The permission rules that stop Claude Code prompting on every call are in this
repo's `.claude/settings.json`.

## Which model, and why it matters

```sh
python ~/.claude/bin/ask-model.py --list-models
```

- **`gpt-5.6-sol` / `terra` / `luna`** — deep reasoning, `none`…`xhigh`.
- **`anthropic_tool_call.claude-opus-4-8-think`** — the only model here that
  supports *native* tool calling together with reasoning.

The `gpt-5.6-*` family **rejects native tools whenever `reasoning_effort` is
set**. The gateway's answer is "set reasoning_effort to none", which throws away
the thinking that makes them worth using. `delegate.py` solves this with
`--tool-mode prompt`: tools are described in the system prompt and the model
replies with a ```tool``` block the harness parses. This is what Cline calls
"disable native tools", and it keeps reasoning at `high`/`xhigh`.

`--tool-mode auto` (the default) picks native for `anthropic_tool_call.*` and
prompt for everything else. Do not pass `--tool-mode native` to a `gpt-5.6-*`
model: it silently degrades to `effort=none`.

## Usage

One-shot analysis — big input, small output is where this pays:

```sh
python ~/.claude/bin/ask-model.py -m gpt-5.6-sol -e high \
  -p "Summarize what each entry concluded and flag contradictions." \
  docs/library-engine/journal/2026-08-04.md
```

An agent that investigates but changes nothing (writes become a review patch):

```sh
python ~/.claude/bin/delegate.py -m gpt-5.6-terra -e high \
  -t "Audit docs/library-engine/api-manifest.md against src/."
```

An agent that implements and verifies its own work, in a disposable worktree:

```sh
python ~/.claude/bin/delegate.py --worktree -m gpt-5.6-terra -e high \
  --label my-fix -t "Fix X. Run npm test and iterate until it passes."
```

Several agents at once, from different angles:

```sh
python ~/.claude/bin/fanout.py --synthesize --deadline 900 \
  -t "Why does the Live scan kill the renderer?" \
  --lens "memory and allocation pressure" \
  --lens "IndexedDB transaction lifetime" \
  --agent "anthropic_tool_call.claude-opus-4-8-think|high|main-thread blocking"
```

## Watching and steering a run

Every run writes a live transcript to `.claude/agent-runs/` containing the
model's narration, each tool call, and a preview of every result:

```sh
tail -f .claude/agent-runs/<stamp>-<label>.md
```

To redirect an agent mid-run without killing it, write into the `.steer` file
beside its transcript. The next turn picks it up as operator guidance:

```sh
echo "stop reading main.ts, focus on src/library" > .claude/agent-runs/<name>.md.steer
```

## Safety model

Two modes, and the difference matters:

- **Default (staged).** `write_file`/`replace_in_file` accumulate a patch;
  nothing on disk changes. Safe, but the agent *cannot verify its own work* —
  `run_command` runs against the unchanged tree, so tests prove nothing about
  staged edits.
- **`--worktree`.** A disposable `git worktree` on branch `agent/<label>`, with
  `node_modules` linked in. Writes are real, so tests genuinely verify. Your
  working tree is untouched and unreachable. Review the branch, then merge or
  delete it.

Use `--worktree` for anything that implements. Use the default for read-only
investigation.

In both modes:

- every path is confined to the repo root; `..` and absolute escapes are refused
- commands must match the `ALLOWED_CMDS` patterns in `delegate.py`, matched
  element-wise over argv with **no shell at all** — no pipes, globs, chaining or
  substitution
- there is a hard iteration cap; hitting it triggers a wrap-up call so the work
  is reported rather than discarded

`ALLOWED_CMDS` is the security boundary and is tuned to this project
(`npm`, `npx vitest`, `npx tsc`, `git status/diff/log`, `node scripts/*`).
Another repo needs its own entries. Widen it deliberately, not reflexively.

## Context discipline

Running out of context kills a run and wastes everything it did. The harness
enforces what it can:

- files over 30,000 chars cannot be read whole — grep, then read a line range
- re-reading a file already read returns a pointer, not the content again
- a single tool result is truncated at 100,000 chars

If an agent dies mid-run with a bare `Error:`, context exhaustion is the first
thing to suspect; the transcript shows exactly what it read.

## Known limits

- **Only exercised on Windows.** The worktree links `node_modules` with a
  junction (`mklink /J`, no admin needed). The POSIX `os.symlink` branch is
  written but untested — if you are on macOS or Linux, expect to debug that
  first.
- **Native tool calling with `anthropic_tool_call.*` has failed repeatedly** in
  long agent loops, returning a bare `Error:` after 10–20 tool calls. The cause
  was never established. `--tool-mode prompt` works with that model and is the
  reliable path until someone diagnoses it properly.
- `usage` is not always returned by the gateway, so token counts in the run
  footer are sometimes `0`. That means "not reported", not "free".
- The synthesis step in `fanout.py` is a single model call over the agents'
  reports; it is only as good as they were, and it is told to surface
  disagreements rather than smooth them over. Read the disagreements.

## Anything sent leaves your machine

Every prompt and every file goes to `open-webui.adaptavist.net`, where it can be
logged and retained. Think about what you are sending before you send a repo's
source through it.
