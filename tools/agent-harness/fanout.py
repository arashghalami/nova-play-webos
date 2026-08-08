#!/usr/bin/env python3
"""Attack one problem with several delegated agents at once, then merge the results.

Each agent is an independent delegate.py run in its own process with its own
transcript, so they explore in parallel and cannot contaminate each other's
reasoning. Diversity is the point: a fleet of identical agents mostly agrees with
itself, so give each one a distinct lens (or a distinct model) and let the
disagreements surface what a single pass would miss.

  fanout.py -t "Why does the Live scan kill the renderer?" \
      --lens "memory and allocation pressure" \
      --lens "IndexedDB transaction lifetime and quota" \
      --lens "main-thread blocking and watchdog timeouts"

Heterogeneous fleets -- different models on the same question:

  fanout.py -t "Should main.ts be split, and how?" \
      --agent "gpt-5.6-sol|xhigh|argue FOR splitting, with a concrete seam list" \
      --agent "gpt-5.6-terra|xhigh|argue AGAINST splitting; what breaks?"

With --synthesize, a final model reads every report and produces one answer,
explicitly noting where the agents disagreed. Disagreement is signal; a synthesis
that hides it is worse than the raw reports.

Live progress: each agent's transcript path is printed as it starts. Tail any of
them, or steer one mid-flight via its .steer file (see delegate.py).
"""
import argparse
import concurrent.futures
import datetime
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

DELEGATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "delegate.py")
CONF = os.path.join(os.path.expanduser("~"), ".claude", ".openwebui.env")
DEFAULT_MODEL = "gpt-5.6-sol"
SYNTH_MODEL = "gpt-5.6-terra"


LIVE = {}          # idx -> Popen, so a deadline can terminate stragglers
LIVE_LOCK = threading.Lock()
MONITORED = {}     # idx -> (lens, tpath), for the stall monitor to inspect


def stall_monitor(stop_event, stall_warn_secs):
    """Warn (never kill) when a running agent's transcript goes quiet.

    A working-but-slow agent and a wedged one look identical from outside; the
    only cheap signal is whether its transcript is still being written. Every
    60s we compare each running agent's transcript mtime against a threshold and
    warn if it has been silent too long. Warnings repeat every threshold so a
    persistently stalled agent keeps surfacing, but no more often than that so a
    truly dead agent does not spam. Termination stays exclusively with the
    per-agent timeout / deadline in main(); this thread only reports.
    """
    last_warned = {}   # idx -> monotonic-ish time we last warned about it
    while not stop_event.wait(60):
        now = time.time()
        with LIVE_LOCK:
            snapshot = list(MONITORED.items())
        for idx, (lens, tpath) in snapshot:
            try:
                mtime = os.path.getmtime(tpath)
            except OSError:
                continue   # transcript not created yet; nothing to judge
            silent = now - mtime
            if silent < stall_warn_secs:
                continue
            if now - last_warned.get(idx, 0.0) < stall_warn_secs:
                continue   # at most once per threshold interval per agent
            last_warned[idx] = now
            print(f"  [{idx}] STALL WARNING: transcript silent for "
                  f"{silent / 60:.1f} min (threshold {stall_warn_secs / 60:.0f} "
                  f"min)\n      lens: {lens}\n      still running, NOT killed; "
                  f"log: {tpath}", file=sys.stderr, flush=True)


def run_agent(idx, model, effort, lens, task, root, max_iters, stamp, agent_timeout):
    """One agent, in its own process.

    Stragglers are the known failure mode of a fleet this size: most agents finish
    quickly and one wanders. Each gets its own timeout, and main() can terminate
    whatever is still running when the overall deadline passes, so a single slow
    agent never holds the other nine hostage.
    """
    slug = "".join(c if c.isalnum() else "-" for c in lens.lower())[:28]
    label = f"agent{idx}-{slug}"
    tpath = os.path.join(root, ".claude", "agent-runs", f"{stamp}-{label}.md")
    full = (f"{task}\n\nYour specific angle on this problem: {lens}\n\n"
            "Investigate from that angle specifically. Other agents are covering "
            "other angles, so go deep on yours rather than broad. Report what you "
            "found with file:line evidence, and say plainly what you could not verify.")
    argv = [sys.executable, DELEGATE, "-t", full, "-m", model, "-e", effort,
            "-C", root, "--max-iters", str(max_iters),
            "--transcript", tpath, "--label", label,
            "--patch", os.path.join(root, f"{label}.patch")]
    print(f"  [{idx}] start  {model} e={effort}\n"
          f"      lens: {lens}\n"
          f"      log:  {tpath}", file=sys.stderr, flush=True)
    t0 = time.time()
    proc = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True)
    with LIVE_LOCK:
        LIVE[idx] = proc
        MONITORED[idx] = (lens, tpath)
    try:
        out, err = proc.communicate(timeout=agent_timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        out, err = proc.communicate()
        print(f"  [{idx}] TIMEOUT after {agent_timeout}s -- partial log at {tpath}",
              file=sys.stderr, flush=True)
        return idx, model, lens, None, f"timed out after {agent_timeout}s", tpath, time.time() - t0
    finally:
        with LIVE_LOCK:
            LIVE.pop(idx, None)
            MONITORED.pop(idx, None)
    dt = time.time() - t0
    ok = proc.returncode == 0 and (out or "").strip()
    print(f"  [{idx}] {'done ' if ok else 'FAILED'} ({dt:.0f}s) {lens[:45]}",
          file=sys.stderr, flush=True)
    if not ok:
        return idx, model, lens, None, why_failed(err, proc.returncode), tpath, dt
    return idx, model, lens, out.strip(), None, tpath, dt


def why_failed(err, code):
    """Pull the actual reason out of stderr.

    delegate.py streams its per-step progress to stderr, so echoing the tail
    verbatim buries the cause under a wall of tool-call lines.
    """
    lines = [l.strip() for l in (err or "").splitlines() if l.strip()]
    for l in reversed(lines):
        if l.lower().startswith(("error:", "warning:", "traceback")) or "Error" in l:
            return f"exit={code}: {l[:300]}"
    tail = [l for l in lines if not l.lstrip().startswith("[")]
    return f"exit={code}: {(tail[-1] if tail else 'no output')[:300]}"


def load_cfg():
    cfg = {}
    for line in open(CONF, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            cfg[k.strip()] = v.strip().strip('"').strip("'")
    url = cfg["OPENWEBUI_URL"].rstrip("/")
    return (url[:-4] if url.endswith("/api") else url), cfg["OPENWEBUI_API_KEY"]


def synthesize(task, results, model):
    joined = "\n\n".join(
        f"===== AGENT {r[0]} ({r[1]}) -- lens: {r[2]} =====\n{r[3]}"
        for r in results if r[3])
    prompt = (f"Several independent agents investigated this problem:\n\n{task}\n\n"
              "Their reports follow. Produce ONE synthesis that: states the "
              "conclusions they agree on; calls out explicitly where they DISAGREE "
              "and which reading the evidence better supports; and lists what none "
              "of them established. Do not smooth over disagreement -- it is the "
              f"most useful signal here.\n\n{joined}")
    try:
        url, key = load_cfg()
    except Exception as e:
        return f"(synthesis failed reading config: {e})"
    body = {"model": model, "messages": [{"role": "user", "content": prompt}],
            "reasoning_effort": "high", "stream": False}
    req = urllib.request.Request(url + "/api/chat/completions",
                                 data=json.dumps(body).encode(), method="POST")
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            return json.loads(r.read())["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        return f"(synthesis failed: HTTP {e.code} {e.read()[:200].decode(errors='replace')})"
    except Exception as e:
        return f"(synthesis failed: {type(e).__name__}: {e})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-t", "--task", required=True)
    ap.add_argument("--lens", action="append", default=[],
                    help="an angle; uses the default model. Repeatable.")
    ap.add_argument("--agent", action="append", default=[],
                    help="'MODEL|EFFORT|LENS'. Repeatable. For mixed fleets.")
    ap.add_argument("-m", "--model", default=DEFAULT_MODEL)
    ap.add_argument("-e", "--effort", default="high")
    ap.add_argument("-C", "--root", default=".")
    ap.add_argument("--max-iters", type=int, default=25)
    ap.add_argument("--max-parallel", type=int, default=8)
    ap.add_argument("--agent-timeout", type=int, default=900,
                    help="seconds before an individual agent is killed (default 900)")
    ap.add_argument("--deadline", type=int, default=0,
                    help="seconds before the whole fanout reports with whatever "
                         "finished, terminating stragglers. 0 = wait for all.")
    ap.add_argument("--stall-warn-mins", type=int, default=15,
                    help="warn (never kill) when a running agent's transcript "
                         "has been silent this many minutes (default 15)")
    ap.add_argument("--synthesize", action="store_true")
    args = ap.parse_args()

    specs = [(args.model, args.effort, l) for l in args.lens]
    for a in args.agent:
        parts = a.split("|", 2)
        if len(parts) != 3:
            sys.exit(f"error: --agent needs 'MODEL|EFFORT|LENS', got: {a}")
        specs.append((parts[0].strip(), parts[1].strip(), parts[2].strip()))
    if not specs:
        sys.exit("error: give at least one --lens or --agent")

    root = os.path.realpath(args.root)
    stamp = f"{datetime.datetime.now():%Y%m%d-%H%M%S}"
    print(f"fanout: {len(specs)} agents, up to {args.max_parallel} at once\n",
          file=sys.stderr, flush=True)

    results, unfinished = [], []
    stop_monitor = threading.Event()
    monitor = threading.Thread(
        target=stall_monitor,
        args=(stop_monitor, max(1, args.stall_warn_mins) * 60),
        daemon=True)
    monitor.start()
    ex = concurrent.futures.ThreadPoolExecutor(max_workers=args.max_parallel)
    futs = {ex.submit(run_agent, i, m, e, l, args.task, root, args.max_iters,
                      stamp, args.agent_timeout): i
            for i, (m, e, l) in enumerate(specs, 1)}
    try:
        for f in concurrent.futures.as_completed(futs, timeout=args.deadline or None):
            results.append(f.result())
    except concurrent.futures.TimeoutError:
        unfinished = [futs[f] for f in futs if not f.done()]
        print(f"\n  deadline of {args.deadline}s reached; terminating "
              f"{len(unfinished)} straggler(s): {unfinished}", file=sys.stderr, flush=True)
        with LIVE_LOCK:
            for proc in list(LIVE.values()):
                proc.kill()
        for f in futs:
            if f.done():
                try:
                    r = f.result()
                    if r not in results:
                        results.append(r)
                except Exception:
                    pass
    ex.shutdown(wait=False)
    stop_monitor.set()
    results.sort(key=lambda r: r[0])

    # Persist the full combined output ourselves. If a caller pipes stdout
    # through `tail`/`head`, the reports are otherwise destroyed and have to be
    # rebuilt from transcripts; this file is the complete copy of record.
    combined = []

    def emit(text=""):
        # Print to stdout exactly as before AND capture for the persisted file,
        # so the two never drift.
        print(text)
        combined.append(text)

    ok = [r for r in results if r[3]]
    for idx, model, lens, rep, err, tpath, dt in results:
        emit(f"\n{'='*72}\nAGENT {idx} ({model}, {dt:.0f}s) -- {lens}\n{'='*72}\n")
        emit(rep if rep else f"[no report: {err}]\n[partial transcript: {tpath}]")
    for idx in unfinished:
        m, e, l = specs[idx - 1]
        emit(f"\n{'='*72}\nAGENT {idx} ({m}) -- {l}\n{'='*72}\n"
             f"[killed at the {args.deadline}s deadline; partial transcript kept]")

    if args.synthesize and len(ok) > 1:
        emit(f"\n{'='*72}\nSYNTHESIS\n{'='*72}\n")
        emit(synthesize(args.task, results, SYNTH_MODEL))
    elif args.synthesize:
        print("\n[synthesis skipped: fewer than two agents produced a report]",
              file=sys.stderr)

    out_path = os.path.join(root, ".claude", "agent-runs", f"{stamp}-fanout.md")
    try:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(combined) + "\n")
        saved = out_path
    except OSError as e:
        saved = None
        print(f"\nwarning: could not write combined output to {out_path}: {e}",
              file=sys.stderr, flush=True)

    print(f"\n[{len(ok)}/{len(specs)} agents reported]", file=sys.stderr)
    if saved:
        print(f"[full combined output saved to {saved}]", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
