# Assessment of `plans/main-refractor.md`

Produced 2026-08-09 by six independent agents investigating the repository
against the plan, then synthesised. Five reported; the sixth (core/platform
boundary) stalled after 33 tool calls and produced no report, so that angle is
under-covered here. Raw reports: `main-refactor-assessment-raw.md`.

The question being judged is **not** "should we split `main.ts`". It is:

> Turn this webOS-only IPTV app into an enterprise codebase producing three
> apps — webOS TV, Android TV, Android phone — sharing one engine so changes
> propagate to all three. Separately: `main.ts` is enormous; split it?

## Verdict: proceed with named changes

The destination — shared TypeScript engine, workspace packages, ports/adapters —
is right. As written the plan defers Android proof too long, overstates phone
reuse, and moves code outside guards that are hard-wired to today's layout.

## Agreed across agents

- **Share source, not the webOS bundle.** Each product needs its own entry, CSS
  graph, target config and artifact, consuming the same engine packages.
- **The baseline is healthy but exclusively webOS.** 48 files / 442 tests and the
  guarded build pass. Output is an ES2015 non-minified IIFE into `webos-app`
  (`vite.config.ts:79-102`). No Capacitor, Gradle or Android project exists.
- **Guards will not survive a workspace move unchanged.** Cycle checking covers
  only `src/` and relative imports (`scripts/check-import-cycles.mjs:4-13,55-94`);
  CSS guards target `src/style.css` and webOS output
  (`scripts/check-css-baseline.mjs:199-220`); the bundle guard hardcodes webOS
  artifacts (`scripts/check-webos-bundle.mjs:4-149`). New packages would be
  **false-green**.
- **Chromium 79 policy must be webOS-scoped.** A universal stylesheet either taxes
  Android or fails webOS checks.
- **Phone is not a responsive TV skin.** Shell, focus restoration, spatial
  navigation, remote forms, player controls and Back are TV-specific
  (`src/main.ts:1283-1324, 8250-8369, 8625-9042`).
- **`main.ts` should end as composition, but extraction is dangerous.** It holds
  heterogeneous global state (`src/main.ts:459-629`), and raw-source contract
  tests pin implementations inside it (e.g. `local-first-regression.test.ts:10-131`).
- **Android feasibility must be proven earlier than Phase 7.**

## Disagreements, and which side the evidence favours

| Question | Positions | Better supported |
|---|---|---|
| What comes first | Login extraction / `isWebOsRuntime()` / Android canary / guards | **Guards first** — the false-green paths are identified and exact; anything added before that is unpoliced |
| Is `AppState`/`AppContext` a sound bridge | ~90 globals demand it *vs* it is a typed god object | **God-object objection** — that block mixes durable state, DOM handles, media engines, timers, cancellation, focus, history and frame scheduling. Move ownership per feature/port |
| When to convert source-text tests | Big Phase-0 sweep *vs* atomic per extraction | **Atomic** — these encode ordering and boundary invariants; removing coupling early strips protection during the riskiest work |

## Plan assumptions that are FALSE

- One shared UI/styles package can serve TV and phone.
- Existing guards can simply be "kept" after moving code.
- `CatalogRepository` already has a stable interface to preserve — it is a large
  concrete IndexedDB class instantiated directly (`src/main.ts:461`).

## Plan assumptions that are UNPROVEN

- Capacitor WebView can handle the required HLS/DASH/MPEG-TS, tracks, subtitles,
  cancellation and lifecycle without Media3.
- A minimum Android / System WebView version has been chosen, which is what makes
  JS/DOM/CSS targets decidable at all.
- A broad state/view refactor can stay green before a second runtime consumes the
  abstractions.
- **The 70–85% UI reuse figure.** Every estimate was source classification, not
  device evidence.

## Risks, ranked

1. Discovering late that Android networking, playback, storage or lifecycle needs
   different boundaries.
2. Losing webOS protections because workspace code and target CSS fall outside the
   current guards.
3. Shipping a phone app built around unusable TV focus/forms/player behaviour.
4. A permanent `AppContext` god object destabilising the only shipping app.
5. Weakening source contracts during extraction, silently regressing artwork,
   sync, playback or provider boundaries.

## Recommended first move

A **guard-boundary change with no production-code movement**: make cycle checks
workspace-aware, scope the Chromium 79 CSS check to the webOS graph, and add
fixtures proving workspace cycles are caught and that Android-only modern CSS
passes unless webOS imports it. Safe because runtime code and artifacts do not
change, while the 442 tests and the webOS build stay blocking.

## What nobody established

Minimum Android/WebView versions; whether WebView suffices for every playback
case or Media3 is required; Android TV/phone device behaviour for focus, soft
keyboard, Back, lifecycle, interruption, PiP, process death, background playback;
whether background audio, downloads, casting or offline are product requirements;
Android storage durability and quotas; real device performance, memory, thermal,
battery and cellular behaviour; an empirical phone reuse percentage.
