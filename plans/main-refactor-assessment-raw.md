

===== agent2-the-chromium-79-tax--the-who =====
## Final report

# Judgment: PROCEED WITH NAMED CHANGES — do not execute the plan as written

The plan has the right high-level choice—shared TypeScript source plus platform adapters—but it does **not** currently solve the Chromium 79 problem. It recognizes that webOS emits an ES2015/IIFE and draws a separate Android box (`plans/main-refractor.md:22,40-82`), but never defines per-target TypeScript libs, Vite targets, CSS entry graphs, polyfill/API policy, minification, or guard scope. Its CI section merely lists a webOS compatibility build beside two Android builds (`plans/main-refractor.md:559-568`). That is not enough to prevent the webOS baseline from infecting Android.

The direct answer is: **share source, not a compiled bundle and not one universal stylesheet.** The common engine must be bundled separately for webOS TV, Android TV, and Android phone. Code executed on all three needs a Chromium-79-compatible runtime API contract unless it is explicitly polyfilled or capability-injected; modern syntax, modern CSS, Android APIs, optimization, and presentation must remain target-owned.

## Why the current pipeline would tax Android

### 1. The only build is a webOS product build

The root manifest has one `build` chain and one `package:webos` command, with no workspaces or Android build scripts (`package.json:1-16`). That chain type-checks once, invokes one Vite configuration, then runs webOS bundle and CSS guards (`package.json:7-8`).

The Vite output is deliberately webOS-specific:

- `webos-app` output;
- ES2015 target;
- minification disabled because a minified chunk caused false TDZ reads on the TV;
- one IIFE entry named `NovaPlay`;
- one non-split stylesheet (`vite.config.ts:79-102`).

The same config rejects media engines inside the IIFE and copies legacy/standalone Dash.js, HLS.js, and MPEG-TS assets into the webOS package (`vite.config.ts:34-76`). Those are valid webOS constraints, but they must not become Android defaults. Reusing this output in Capacitor would give Android the non-minified webOS artifact, legacy vendor policy, and single-IIFE shape.

The live `npm run build` passed and reported one 647.42 kB unminified `app.js`, one 86.18 kB stylesheet, and the separate capability worker. This verifies that the current webOS pipeline is healthy; it does not establish an Android pipeline.

### 2. TypeScript configuration is also global

The only TypeScript config has `target: ES2015`, `lib: [ES2020, DOM, DOM.Iterable]`, and `noEmit: true` (`tsconfig.json:2-15`). It covers both `src` and the Cloudflare Worker (`tsconfig.json:23`). Therefore it is neither a precise Chromium-79 API contract nor a modern Android contract. `noEmit` also means Vite, not TypeScript, controls deployed syntax.

This distinction matters: target transpilation can lower syntax, but it does not by itself provide missing runtime APIs. The current output guard checks only seven named globals (`scripts/check-webos-bundle.mjs:4-17,36-49`), while TypeScript exposes the broader ES2020 and current DOM declarations. There is no configured polyfill layer in `package.json:17-29` or `vite.config.ts:1-105`. A multi-target design needs explicit API compatibility rules, not one inherited `lib` setting and a short deny list.

### 3. CSS is where the Chromium tax is presently absolute

`src/main.ts` directly imports the sole stylesheet (`src/main.ts:1`). The baseline guard always scans `src/style.css` and optionally the emitted webOS stylesheet (`scripts/check-css-baseline.mjs:187-212`). It rejects post-79 properties, selectors, at-rules, functions, and units, including `aspect-ratio`, `inset`, `:focus-visible`, `:is`, container queries, modern viewport units, and modern color functions (`scripts/check-css-baseline.mjs:84-181`). Its scan does not exempt declarations inside phone-only media queries (`scripts/check-css-baseline.mjs:215-295`).

Consequently, putting Android-phone CSS into a shared `packages/ui/styles` sheet would either:

1. keep Android permanently at the Chromium 79 CSS floor; or
2. break the webOS build as soon as the phone uses a modern feature.

The existing narrow-width rules demonstrate why responsive CSS is not a phone architecture: they collapse TV layouts but retain the help bar and the global remote-style `:focus` ring (`src/style.css:1304-1392`). The stylesheet explicitly avoids `:focus-visible` because Chromium 79 invalidates the selector list (`src/style.css:1371-1387`).

The motion guard is also source-global. It scans the same source and generated sheets (`scripts/check-css-motion.mjs:46-67`), rejects non-transform/opacity transitions and stylesheet `will-change`, and bans unsupported focus selectors (`scripts/check-css-motion.mjs:75-130`). Its `will-change` and `:focus-visible` rules are explicitly justified by TV GPU and Chromium-79 behavior (`scripts/css-motion-scan.mjs:256-306`). Those are excellent webOS safeguards, not universal Android-phone presentation rules.

Moving styles to the plan’s proposed `packages/ui` without changing these scripts would also make `src/style.css` disappear even though both guards currently require it. “Keep the guards” is not an executable migration instruction.

### 4. Chromium accommodations already exist below the build config

There are useful platform branches in `main.ts`: catalog page size, image decode concurrency, armed-image caps, playback pitch, and playback speed vary when webOS is detected (`src/main.ts:262-322,352-390,4706-4711,4945`). But one guide limit is unconditionally tied to the webOS page size (`src/main.ts:282,2821`). These policies belong in a typed platform/performance capability object, not in repeated runtime detection.

Other accommodations need classification rather than wholesale extraction:

- Track labels use a small language map because `Intl.DisplayNames` is unavailable on Chromium 79 (`src/track-selection.ts:77-91`). Modern targets could inject a richer display-name service, while the shared fallback remains valid.
- The catalog publication algorithm was changed after repeated manifest rewrites stalled Chromium 79, but the resulting O(1)-per-section design benefits every platform and should remain shared (`src/library/catalog-repository.ts:746-763`).
- IndexedDB metadata updates keep `get` and `put` in one callback because old webOS engines may auto-commit across `await` (`src/library/catalog-repository.ts:1443-1457`). That belongs in the web IndexedDB implementation; a future native Android repository should satisfy the same contract without copying this workaround.

This is the correct boundary: share domain/application behavior and universally beneficial algorithms; vary runtime implementations and performance policies.

## Required changes to the plan

### 1. Make a runtime/build matrix the real Phase 0 gate

Before `AppState`, views, or a long extraction campaign, record and enforce:

- **webOS:** preserve the current ES2015, non-minified, single-IIFE build and standalone media assets until physical-device evidence supports a change.
- **Android TV:** compile shared source again for the documented minimum supported Android System WebView; use its own TV CSS and Android playback/input adapters.
- **Android phone:** compile shared source again for the same documented modern engine floor, but with a separate touch UI entry and phone CSS.

Do not write `esnext` based on optimism. The Android target must derive from an explicit minimum Android/WebView support policy.

### 2. Share workspace source, never the webOS artifact

Use the proposed domain/application packages, but have three application entries consume them directly. A suitable shape is:

- `apps/webos-web`: webOS entry, webOS CSS, current Vite plugin/guards;
- `apps/android-tv-web`: TV entry and TV CSS, copied into the Android TV flavor;
- `apps/android-phone-web`: phone entry and phone CSS, copied into the phone flavor;
- `apps/android`: one Capacitor/Gradle project with `tv` and `phone` flavors;
- `packages/domain`, `packages/application`, and platform contracts as shared source.

A core change then propagates because all three builds resolve the same workspace package—not because Android embeds `webos-app/app.js`.

### 3. Split CSS ownership explicitly

Create three layers:

- baseline-safe shared tokens/component structure used by all targets;
- shared TV presentation where genuinely common;
- webOS, Android-TV, and phone overlays/implementations.

Only CSS reachable from the webOS entry should face the Chromium-79 baseline. Parameterize the CSS guards with a webOS source manifest/module graph and continue scanning the emitted webOS stylesheet. Android-only `:focus-visible`, `aspect-ratio`, container queries, dynamic viewport units, and phone motion must not be scanned as webOS source.

Add a boundary test containing a modern feature in Android-only CSS: Android builds must pass; importing that fixture into webOS must fail. Keep the strict motion guard on webOS. Applying a similar policy to Android TV can be a deliberate TV-performance decision, but Android phone must not inherit it accidentally.

### 4. Separate authoring, emitted-syntax, and runtime-API contracts

Introduce a checks-only `tsconfig.base.json`, then target/package configs:

- domain should not receive DOM globals;
- shared application code should expose only the common API floor or injected ports;
- webOS platform code uses the webOS DOM/API contract;
- Android platform code can use the documented modern contract;
- the metadata Worker gets its own runtime config.

Keep the existing artifact-specific webOS JS guard, but strengthen runtime API compatibility beyond seven textual names. Decide explicitly, API by API, whether a shared feature uses a baseline implementation, feature detection, a webOS polyfill, or a platform adapter.

### 5. Make `PlatformCapabilities` concrete

The plan’s capability idea should include the policies already present in code:

- catalog page size;
- guide visible-request limit;
- image decode concurrency and observed-image cap;
- focus model and CSS capability profile;
- language display-name provider;
- playback speed/pitch support;
- storage/transaction implementation;
- media engine and track APIs.

Composition should select these once. Shared controllers consume them; they should not repeatedly inspect `PalmSystem` or user-agent strings.

### 6. Prove target separation in CI

Required gates should include:

- `build:webos` with all current guards and bundle-shape checks;
- Android-TV web build plus Gradle flavor build;
- Android-phone web build plus Gradle flavor build;
- shared engine tests and adapter contract tests;
- dependency-boundary checks preventing Android styles/adapters from entering the webOS graph;
- bundle assertions proving standalone webOS media assets are not an Android requirement;
- the differential CSS/API fixture described above.

### 7. Change the sequencing

The plan delays Android until Phase 7 (`plans/main-refractor.md:544-553`) and recommends a first increment with no Android build canary (`plans/main-refractor.md:650-661`). Reverse that risk:

1. Rename/preserve the current pipeline as `build:webos` without behavior changes.
2. Move the stylesheet import and composition into a webOS entry.
3. Add minimal Android-TV and phone web builds that import one real shared engine slice.
4. Prove differential targets and CSS guard scope.
5. Extract the runtime policy object.
6. Only then proceed through state, views, controllers, and playback.

Otherwise the repository can spend months creating packages whose public APIs and CSS ownership were never tested against a second runtime.

## The `main.ts` sub-question

Yes, split it—but target separation dictates the first cuts. Extract the webOS entry/style import, platform detection, launch provisioning, compatibility policy, and adapter composition before generic state slices. The eventual 20–100 line composition root proposed in the plan is sensible, but shrinking the file is not evidence that the repo can produce three correctly targeted products.

## Verification performed

- `npm run build`: passed TypeScript, import-cycle, webOS bundle, Chromium-79 CSS, motion, and worker-build gates.
- `npm test`: 48 files and 442 tests passed, including catalog auto-commit regression coverage.
- `git status`: no tracked changes; it reports `plans/main-refractor.md` as untracked. I made no repository edits.

## What I could NOT verify

- The required Android minimum SDK, minimum System WebView/Chromium version, or therefore the exact modern Vite/TypeScript target: no Android/Capacitor/Gradle configuration exists in the inspected manifest.
- Any Android TV or phone build, packaging, Media3 bridge, flavor asset wiring, or physical-device behavior: those artifacts do not exist yet.
- Whether Capacitor WebView playback is sufficient for any stream class; that requires the physical-device evidence the plan itself defers.
- Exhaustive Chromium-79 JavaScript API compatibility. The current build proves only the configured syntax target and seven prohibited textual globals, not every DOM or ECMAScript API.
- Physical LG behavior after the proposed restructuring; no restructuring was implemented, and I did not install a package on the TV.
- Whether the untracked plan file predated this run from Git’s perspective; I only verified the final status and did not modify it.

[gpt-5.6-sol e=xhigh tools=prompt: 35 tool calls, 1,093,488 tok sent / 23,458 tok returned]


===== agent3-ground-truth--check-the-plan =====
## Final report

## GROUND-TRUTH VERDICT: Proceed, but with named corrections. The plan is factually accurate about the code — unusually so — but it under-states two hard blockers to the three-app goal, and its own "first increment" picks the wrong first vertical slice.

## What I verified true, claim by claim (file:line)

**File sizes / shape — all accurate.**
- `src/main.ts` read as "of 9397" lines; on disk 316,849 bytes. It is a flat module of top-level functions as CLAUDE.md says. Confirmed the entire top-level function inventory via grep.
- `catalog-repository.ts` is 150,099 bytes / ~4,900 lines (`src/library/catalog-repository.ts`).
- `style.css` 86,172 bytes.

**"Large set of mutable module-level variables" — verified and worse than stated.** `src/main.ts:459-617` plus 4642-4644, 5113-5114 and 1519 = ~90 top-level `let` bindings (`profile`, `client`, `catalog`, `view`, `settings`, `playerItem`, `activeHls/activeMpegts/activeDash`, `favorites`, `resumeEntries`, `guide`, focus/navigation state, etc.). The diagnostics probe at the file end mutates these globals directly (`src/main.ts:9216-9236` sets `catalog=null`, `view='home'`). This is the real obstacle to state extraction and the plan's Phase 2 (`AppContext`) is the correct response.

**"Browser globals accessed directly throughout" — overwhelmingly true.** ~80 `document.*` call sites across every render/handler function (grep of `document.querySelector|createElement|body|activeElement` returns the whole file). `history.replaceState/pushState/back` at 1001/1006/1011. `navigator.userAgent` at 354. `window.confirm` at 5918, `window.prompt` at 7622, `window.open` at 5680. The plan's platform-port abstraction is well-motivated.

**webOS entanglement — verified and concentrated.** `isWebOsRuntime()` (`main.ts:350-355`, sniffs `webOSSystem`/`PalmSystem`/UA); it fans out to catalog page size (374), preserve-pitch (381), audible-rate (385), deferred-image concurrency/caps (4704-4711, 4945). Launch-param provisioning `provisionProfileFromLaunchParams()` reads `webOSSystem.launchParams` (401-405). Keep-alive reads `webOSSystem.keepAlive` (8586-8621). Native audio-track hack for webOS at 7293-7334. The Back/popstate "webOS fires both keydown AND popstate" logic is deeply woven through the keydown handler (8625+) and popstate handler (8968-9060) — this is the single hardest thing to move and the plan's Phase 6 (input intents) rightly defers it to last.

**Key codes / D-pad — the seam the plan names already exists and is pure.** `src/remote-input.ts` maps keyCodes incl. webOS 461/10009 (Back) and color codes are in `main.ts:8381-8392` (403-406). `navigation.ts` verified DOM-free (grep for document/window = no matches). So the plan's claim that `navigation.ts`, `frame-navigation.ts`, `remote-input.ts`, `focus-scroll.ts` are reusable pure deps is TRUE.

**Storage seams — accurate.** `localStorage` owned by `storage.ts:651/669/684`; credentials (`username`/`password`) stored in profiles via localStorage (`storage.ts:216-236, 711-712`). IndexedDB owned by `catalog-repository.ts` (`indexedDB.open` at 651-656). Plan's "credentials in localStorage, Android should use Keystore" is correct.

**Provider seam — accurate and stronger than plan implies.** `ProviderTransport` interface with Browser/Denied/Fixture implementations (`provider-transport.ts`), injected through `XtreamClient` constructor default `appProviderTransport()` (`xtream-client.ts:694`) and threaded via `ProviderBroker` (`provider-broker.ts:117-118, 32`). `main.ts:460` does `new ProviderBroker(profile)` with no transport — so a Capacitor-native transport is a one-line composition change. Plan is right to say "retain and expand."

**Playback partial separation — accurate.** `renderPlayer()` spans `main.ts:3535-4472` (~937 lines) with ~25 nested closures (startHlsAttempt/startMpegtsAttempt/startDashAttempt/startNativeAttempt at 3941/4027/4088/4124) closing over module globals `activeHls/activeMpegts/activeDash`. It already delegates planning to `planPlaybackAttempts` from `playback-fallback.ts` (3681) and reuses `player-transport.ts`. Media engines are loaded as external UMD globals via `media-engines.ts` (`hlsConstructor()`/`mpegtsEngine()` read `globalThis.Hls`/`.mpegts`), enforced by `vite.config.ts:41`. Plan's `PlaybackPort`/`PlaybackSession` framing matches reality.

**Source-text contract tests — verified, this is the plan's most important correct warning.** 7 test files read `main.ts` via `import.meta.glob('./**/*.ts', {as:'raw'})`: `artwork-backfill-contract`, `artwork-quality-contract`, `deferred-image-contract`, `player-title-source-contract`, `track-selection-contract`, `provider-boundary`, `local-first-regression`. `local-first-regression.test.ts` alone has ~55 `expect(mainSource).toMatch(...)` assertions pinning exact function signatures and call sequences INSIDE main.ts (e.g. line 115 pins `function createCatalogSyncCoordinator(nextClient: ProviderBroker)`). These will break on ANY function move even with identical behavior. "More than 100 assertions" is credible and verified in spirit. Plan's Phase-0 "convert source-text tests to behavioral contracts first" is not optional — it is the literal precondition for extraction.

**tsconfig — accurate.** No `"strict": true` (`tsconfig.json`); has `noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`, `erasableSyntaxOnly`. No eslint/prettier/lint scripts in package.json. Plan's Phase-0 tooling asks are real gaps.

**No Android/Capacitor anything exists** (grep capacitor|android|gradle|media3 across ts + package.json = no matches). Build emits a single ES2015 IIFE to `webos-app/` (`vite.config.ts:80-98`).

## Where the plan is WRONG or dangerously incomplete (my angle)

1. **The build guards are hard-wired to Chromium 79 and will block, not just fail to help, a modern Android build.** `check-css-baseline.mjs:199` scans `src/style.css` against `CHROMIUM_BASELINE` unconditionally, and it is wired into the one `npm run build` (package.json). The plan's "shared `ui/styles`" package means the SAME style.css feeds both webOS and Android — but Android WebView (modern Chromium) WANTS `inset`, `aspect-ratio`, `:focus-visible`, which this guard BANS. The plan never resolves this: you cannot have one shared stylesheet that is simultaneously Chromium-79-clean AND uses modern CSS for phone. Either the guard must become webOS-target-scoped (run only on the webOS build output), or the shared UI needs a webOS-restricted token layer + platform CSS overrides. The plan's structure diagram implies a single `ui/styles` and is silent on this. This is a concrete, named change I would require before Phase 7.

2. **"70-85% UI sharing" is contradicted by the code.** The UI layer is not just styling — it is `handleSpatialNavigation` (8307), geometric `navigationLayout()` (8232), focus snapshot/restore (1143-1254), the Back-button double-event reconciliation across keydown+popstate, and `renderShell`-based full-innerHTML re-rendering. None of that transfers to a touch phone; it is the TV interaction model the prompt calls "a fundamentally different interaction model." The plan admits phone is different but its percentage estimates (and the "Android TV and phone share one Android codebase via flavors") oversell reuse for phone. Android TV ≈ webOS TV (D-pad) is genuinely high-reuse; Android PHONE shares view-models/domain but essentially none of the navigation/focus/back subsystem. The plan should have split its estimate: ~90% for Android TV, but the phone's entire input+navigation+shell layer is net-new. Verified basis: the touch surface today is near-zero — only `mousemove`→revealControls (4379) and click delegation (5257/5278); `style.css` has exactly two breakpoints (`max-width:1050px`, `680px`) and `hover` rules that webOS already has to neutralize (`style.css:3962-3964`). "Already has responsive breakpoints and some touch behavior" (plan's positive-foundations bullet) is technically true but trivially thin.

3. **Wrong first vertical slice.** The plan's "first increment" extracts Login and Settings. But Settings (`renderSettings` 3477-3534, `saveCurrentSettings` 7604-7645) reads `isWebOsRuntime()` for preserve-pitch UI (3479/3492) and calls `window.prompt` for the parental PIN (7622) — it is more platform-entangled than the plan assumes, not "lowest-risk." Login (`renderLogin` 1363) is the genuinely clean slice. I would do Login first alone, prove the test-migration mechanic on it, and only then Settings — while explicitly extracting the `isWebOsRuntime`/`window.prompt` calls into the platform port during that slice.

4. **catalog-repository.ts is the propagation risk the plan defers too casually.** It is 150KB and it directly owns `indexedDB` (651). It is imported into main.ts as a `new IndexedDbCatalogRepository()` singleton (main.ts:461) used at 30+ sites. The plan says "split it later, keep its interface stable" — correct — but its public surface is a single class with ~40 methods, not an interface, so "stable interface" requires FIRST extracting an interface type. The plan should name that as a Phase-0 deliverable, not a later nicety.

## Bottom line
The plan is grounded in the real code — every structural claim I checked holds, and its risk ordering (state bridge → pure presenters → views → controllers → playback → input last) matches where the entanglement actually is. It correctly identifies the source-text contract tests as the gating hazard. PROCEED, with these named changes: (a) resolve the Chromium-79 CSS-guard-vs-modern-Android contradiction before any shared-UI package; (b) re-scope reuse estimates and net-new work honestly for phone's input/nav/back/shell; (c) make Login (not Settings) the first slice and extract `isWebOsRuntime`/`window.prompt`/`webOSSystem` ports during it; (d) add "extract a CatalogRepository interface" to Phase 0.

## What I could NOT verify
- I could not run the test suite or `tsc` to confirm the 442-tests/48-files count or that it is currently green — I only read the test SOURCES (the plan's "100+ source assertions" claim I confirmed by reading assertions, not by counting a passing run).
- I did not confirm that Android WebView on the target devices actually needs the modern CSS features, nor that WebView playback of HLS/DASH/MPEG-TS is insufficient (the plan's Media3 contingency) — that requires physical-device evidence I have no access to.
- I did not audit metadata-proxy/worker.ts or the library-engine journal/contracts docs; my angle was platform entanglement in the app, not the proxy or engine internals.
- I did not verify the exact runtime behavior of the webOS Back double-event handling; I read the code and its comments but cannot confirm the device actually fires both events as documented.

[anthropic_tool_call.claude-opus-4-8-think e=high tools=native: 55 tool calls, 1 refused]


===== agent4-the-phone-problem--this-app- =====
## Final report

## Verdict: reject as written

The plan does **not** credibly reach the Android-phone goal. Retain its no-copy workspace/engine direction, but reject its proposed shared phone UI. Android phone needs a separate presentation application and interaction stack. Sharing should stop at domain, data/library, DOM-free application use cases, view-model data, and playback policy—not TV views, shell, forms, navigation, or player controls.

The plan contradicts itself: it claims 70–85% UI reuse (`plans/main-refractor.md:38-55`) while correctly listing phone requirements such as touch scrolling, compact navigation, portrait/landscape player layouts, touch scrubbers, Android back, and removal of TV focus/help chrome (`plans/main-refractor.md:201-260`). Those requirements define a different presentation architecture, not a few UI variants.

### Verified phone blockers

- The app binds to `#app` and browser globals immediately, then creates provider, repository, UI, player, focus, navigation, and sync state as module globals (`src/main.ts:354-388`, `src/main.ts:442-620`). There is no reusable application composition boundary today.
- Every normal screen uses a TV shell with arrow/OK/color-key/BACK instructions (`src/main.ts:1283-1315`). Every render restores browser focus and scrolls it around topbar/helpbar geometry (`src/main.ts:1088-1115`, `src/main.ts:1191-1255`). Phone must not import this shell.
- Spatial navigation reads element geometry, maintains sticky columns and zone-return state, and moves focus/scroll on D-pad presses (`src/main.ts:8250-8369`). Color-key and numeric-channel handling are global (`src/main.ts:8371-8473`), while the main key router owns remote Back, OK, D-pad seek, long-press OK, and frame-coalesced movement (`src/main.ts:8625-8927`).
- Click delegation through `data-action` is a useful seam (`src/main.ts:5251-5296`), but `handleAction()` is not an application-intent layer: it changes globals, renders views, reads `window.scrollY`, drives history, mutates video DOM, shows toasts, and invokes browser dialogs (`src/main.ts:5359-5918`).
- Forms are actively TV-specific. Login and search inputs are `readonly` and say “Press OK to type” (`src/main.ts:1383-1393`, `src/main.ts:1811-1828`); host editing uses the same pattern (`src/main.ts:5943-5955`). A state machine removes/restores `readonly`, forces the caret/focus, and blurs on completion (`src/main.ts:1164-1181`), controlled by global key handling (`src/main.ts:8683-8710`). This cannot be reused as normal Android soft-keyboard behavior.
- The player surface itself says “Press OK to show controls” and renders a remote-oriented control dock (`src/main.ts:3535-3606`). Immersive mode makes controls transparent and disables their pointer events (`src/style.css:1149-1153`). The only direct reveal listener is mouse movement (`src/main.ts:4379`); no touch/pointer player handler exists. On a narrow viewport CSS merely makes the TV control dock horizontally scrollable and still leaves arrow/OK/RED help visible (`src/style.css:3063-3101`).
- The stylesheet explicitly defines a “10-foot type scale,” remote focus timing, and TV overscan spacing (`src/style.css:33-47`, `src/style.css:65-105`). `touch-action: pan-y` only permits scrolling (`src/style.css:113-129`). Narrow rules mostly stack TV layouts and hide guide information (`src/style.css:1323-1364`, `src/style.css:1958-1978`); focus rings remain unconditional (`src/style.css:1380-1389`, `src/style.css:2005-2013`).
- Browser lifecycle handling only tears down on `pagehide`, cancels sync/pauses video while hidden, and restarts library initialization when visible (`src/main.ts:9054-9091`). There is no Android audio-focus, interruption, media-session, PiP, process-death restoration, or background-playback policy.
- Cellular policy is unsafe for a phone. The code documents a roughly 150 MB automatic whole-section acquisition and offers only a build-time kill switch (`src/main.ts:360-368`). Runtime eligibility checks only active profile/client, non-player view, and `document.hidden`, then schedules and reschedules incomplete sync (`src/main.ts:7654-7675`, `src/main.ts:7829-7858`). There is no metered/Wi-Fi/data-saver/roaming/user-consent decision.
- Android is completely greenfield. `package.json` has only webOS packaging and no Capacitor/Android dependency or script (`package.json:5-29`). Vite emits an ES2015 unminified IIFE directly into `webos-app`, with standalone media-engine assets (`vite.config.ts:40-102`). The sole HTML entry loads `src/main.ts` into one `#app` (`index.html:9-11`).
- A provider seam exists, but it is still browser-shaped: `ProviderTransport` exposes `RequestInit`/`Response`, its implementation calls global `fetch`, and selection reads `import.meta.env` (`src/provider-transport.ts:1-12`, `src/provider-transport.ts:42-60`).
- Persistence is not cleanly separable. `storage.ts` combines credentials, preferences, favorites, resume, and provider-access state (`src/storage.ts:1-18`, `src/storage.ts:145-230`), then serializes them through `localStorage` (`src/storage.ts:605-684`). Android credentials require a distinct Keystore-backed port, not reuse of this module wholesale.

## Realistic phone reuse

**About 50% of current production `src/`, with a defensible range of 45–55%. Presentation implementation reuse is at most 15–20%.**

I derived this from the production-file inventory, excluding tests. `main.ts` plus `style.css` alone are about 403 KB and hold the TV shell, focus, rendering, forms, player UI, history, and orchestration; the repository guide identifies them as 9,397 lines and 86 KB (`CLAUDE.md:55-58`). The reusable mass is the extracted library/data and pure-policy modules imported at `src/main.ts:1-145`: provider/domain types, search/rating/metadata, playback planning, track policy, and most catalog/sync code.

Practical split:

- **40–45% reusable largely as existing code:** provider/Xtream/domain logic, search/rating/metadata helpers, playback source/fallback policy, and most IndexedDB catalog/sync logic.
- **Another ~10% recoverable after extraction:** favorite/resume/catalog/detail/search/playback application policy currently trapped inside `main.ts`, once DOM/history/focus/render effects are removed.
- **15–20% maximum presentation reuse:** tokens, icons, selected card/metadata concepts, and view-model shapes. Not the shell, routes, page composition, focus lifecycle, readonly forms, guide UI, or player controls.

That is still meaningful sharing and is sufficient for engine changes to propagate automatically. It does not support the plan’s 70–85% UI claim.

## Required replacement architecture

Use shared workspace packages but separate product entries:

```text
packages/domain
packages/application          # DOM-free commands/state/use cases
packages/data                 # provider, metadata, catalog/sync
packages/playback-policy      # source/fallback/resume/live policy
packages/platform-contracts

apps/tv-web                   # shared webOS + Android-TV presentation
apps/webos
apps/android-tv
apps/android-phone            # separate views/styles/routes/player UI
```

One Gradle project with `tv` and `phone` flavors is acceptable only if flavors select different built web entry points/assets and manifests. It must not imply one shared view tree. Android phone should mount `phone-main.ts` with phone routes, ordinary editable forms, scrolling, sheets, styles, gestures, and player controls while importing the same application/data packages.

Add explicit ports for connectivity/download policy, secure credentials versus ordinary preferences, Android lifecycle/saved state, audio focus/interruption/media session/PiP, system Back/deep links, orientation/window insets/soft keyboard, and native playback. Catalog acquisition must require a runtime Wi-Fi/metering/user policy.

## Corrected execution order

Do not defer input separation to Phase 6 and phone layouts to Phase 7 (`plans/main-refractor.md:521-552`). Move the form-factor boundary to the beginning:

1. Define domain/application/data boundaries and enforce no DOM imports into shared application code.
2. Define form-factor/input, lifecycle, connectivity/download, storage, and playback contracts immediately.
3. Turn `data-action` into typed DOM-free commands whose controllers return state/effects rather than rendering or focusing.
4. Extract provider/library/search/detail/resume/favorite/playback policy first.
5. Name the existing renderer `tv-ui`; put spatial navigation, focus restoration, remote keys, readonly text editing, helpbar, and TV player there—not in a generic shared `ui` package.
6. Build an early physical-phone vertical slice: secure login, home, catalog scrolling/search, details, Android Back, connectivity policy, and a playback stub. Use it to prove the ports before moving all views.
7. Build wholly separate phone presentation and touch player behavior.
8. Have all three entry points import workspace packages directly, with CI building webOS IPK, Android-TV, and Android-phone artifacts on every engine change.

## `main.ts` sub-question

Yes, split it—but the primary boundary is **shared engine versus TV adapter**, not simply smaller files. The giant state block (`src/main.ts:442-620`), player subsystem (`src/main.ts:3535-4545`), action router (`src/main.ts:5359-5918`), and remote/lifecycle stack (`src/main.ts:8625-9091`) are concrete extraction boundaries. `main.ts` should eventually be composition only. Existing TV behavior/contracts must remain intact, but TV source ownership must not become a requirement for phone UI.

## What I could NOT verify

- There is no Android project/artifact, so I could not verify Capacitor WebView behavior, IndexedDB durability/quotas, cleartext providers, CORS, Android Back, soft keyboard, process death, Media3, tracks/subtitles, PiP, signing, or Play packaging.
- I could not verify whether product requirements call for background playback, PiP, downloads, casting, or foreground-only playback; these need explicit decisions.
- I did not run tests/build: no code was changed, and existing webOS tests cannot validate a nonexistent phone target. Findings were verified by source and configuration inspection.
- The 45–55% estimate is a source-inventory/concern classification, not a device benchmark. It can only become empirical after a phone vertical slice exists.
- I could not verify physical-phone ergonomics, cellular consumption, thermal/battery impact, or playback reliability because there is no phone artifact to install.

[gpt-5.6-sol e=xhigh tools=prompt: 46 tool calls, 1,671,696 tok sent / 30,186 tok returned]


===== agent5-execution-and-sequencing--ca =====
## Final report

## Judgement — reject the plan as written; proceed only with the named sequencing changes

The plan’s destination is broadly sound: shared TypeScript engine, thin platform adapters, TV/phone UI variants, and no copied application code. But its execution order does **not** provide an incremental, always-green route to three products. It postpones Android feasibility until Phase 7 (`plans/main-refractor.md:526-542`) while first proposing a broad state/view/controller restructuring of the only shipping product. That is backwards.

### Why its ordering is unsafe

1. **Phase 2 (`AppState` / `AppContext`) is a system-wide ownership rewrite, not a safe bridge.**
   `main.ts` combines durable data, view state, cancellation controllers, active media engines, player timers, DOM editing state, focus restoration, history flags, and spatial-navigation scheduling in module lifetime (`src/main.ts:459-629`). The frame scheduler itself closes over mutable runtime state and invokes the spatial handler from `requestAnimationFrame` (`src/main.ts:554-577`). Moving this early into an AppState only creates a typed god object; it does not establish platform boundaries.

2. **Phase 3 view extraction cannot precede navigation/input extraction as the plan says.**
   `renderShell()` cancels pending movement, snapshots focus, replaces the entire app DOM, invokes post-render binding, records the rendered view, and asynchronously restores focus and scroll (`src/main.ts:1283-1324`). `bindEvents()` owns stable delegated event installation plus every-render focus-ID generation, zone assignment, image admission, and deferred loading (`src/main.ts:5240-5357`). Independently mounted views can silently break D-pad focus or event ownership while passing pure tests.

3. **History cannot be Phase 1 while input is Phase 6.**
   The webOS Back protocol is shared between `keydown` and `popstate`: keydown sets absorption/cancellation flags (`src/main.ts:8610-8657`), and `popstate` consumes them for continue-menu, player, and Search routes (`src/main.ts:8958-9042`). Splitting these into different owners/phases is a behavior regression waiting to happen.

4. **Contract-test migration must be atomic per extraction, not broad Phase-0 cleanup.**
   Root tests inspect `main.ts` source for artwork persistence and function bodies (`src/artwork-backfill-contract.test.ts:17-104`), deferred-image behavior (`src/deferred-image-contract.test.ts:24-74`), local-first/sync/EPG invariants (`src/local-first-regression.test.ts:10-131`), player source binding (`src/player-title-source-contract.test.ts:33-84`), provider boundaries (`src/provider-boundary.test.ts:27-30`), and track selection (`src/track-selection-contract.test.ts:21-34`). Per `CLAUDE.md:70-72`, these are requirements. Every move must preserve/move its contract in the same commit, not weaken coverage first.

5. **An early workspace migration would evade current safeguards.**
   The import-cycle guard scans only non-test `.ts` under literal `src/` and only relative imports (`scripts/check-import-cycles.mjs:4-13,55-94`). The CSS baseline guard scans literal `src/style.css` and generated webOS CSS (`scripts/check-css-baseline.mjs:199-217`). New `packages/` code and alias imports would be false-green until those guards are upgraded.

### Correct executable sequence

**Commit 1 — smallest safe, reversible code change:**
Extract only `isWebOsRuntime()` (`src/main.ts:350-356`) into `src/platform/webos-runtime.ts`, add focused tests, and retain all behavior/callers. It is used at known sites (`src/main.ts:350,370,378,382,386,3479,3652,4705,4711,4945`) and touches neither render lifecycle, input/history protocol, playback nor bundle shape. Gate: `npm test`, `npm run build`, then physical webOS smoke checklist.

**Commit 2 — strengthen migration guards before moving architecture:**
Make cycle/CSS guard scan roots explicit and package-aware; add guard fixtures proving workspace cycles, Chromium-incompatible shared CSS, and webOS-invalid bundle usage fail. Do not move production source yet.

**Commit 3 — add Android as an additive feasibility gate before the rewrite:**
Create an Android/Capacitor shell that consumes a generated artifact from the shared source, never a copied codebase. Build TV and phone variants and require real-device evidence for provider transport/cleartext/CORS, HLS/DASH/MPEG-TS, tracks/subtitles, lifecycle, Android Back, TV D-pad, and phone touch. Decide from evidence whether WebView playback is sufficient or Media3 is necessary. The plan has no existing Android implementation to rely on: no Capacitor/Android/platform-contract references were found in searched source/config/package files.

**Only after Commit 3 succeeds:**
1. Move already-tested pure engine modules first; `main.ts` already imports storage, provider, search/navigation, playback planning, and library modules (`src/main.ts:1-154`).
2. Extract only platform ports proven necessary by Android evidence—credentials, playback, network transport, wake lock, external links—not one speculative monolithic `Platform` object.
3. Keep `renderShell`, focus restoration, delegated events, spatial navigation, and Back coordination as one owner until their replacement has equivalent integration/characterization coverage.
4. Extract `main.ts` feature-by-feature: one feature’s owned markup/view-model/actions/state/contracts per commit. Playback remains last.

### Safe abandonment points

- **After Commit 2:** webOS is functionally unchanged, with a tiny isolated runtime seam and stronger migration gates.
- **After Commit 3:** webOS is still intact; Android viability has either been proven or disproven before destabilizing state/view/playback.
- **Do not stop after a global AppContext/AppState conversion.** That is the plan’s dangerous halfway state: changed ownership everywhere, no demonstrated Android consumer, and no clean rollback boundary.

### Verified

- `npm test` passed: **48 test files / 442 tests**.
- `npm run build` passed: TypeScript; 43-runtime-module cycle check; Vite ES2015 IIFE build; webOS bundle/media guard; Chromium-79 CSS baseline guard; CSS motion guard; library Worker build.
- The webOS build is tied to an ES2015 non-minified IIFE entry at `src/main.ts` (`vite.config.ts:80-103`), and the production HTML loads standalone Dash/HLS/MPEG-TS before `app.js` (`public/index.html:19-24`). The bundle guard verifies those artifact properties (`scripts/check-webos-bundle.mjs:4-149`).
- No tracked modifications were introduced by this assessment (`git diff` was empty). `git status` showed only the untracked plan file.

### What I could NOT verify

- Physical webOS behavior: D-pad traversal, focus restoration, Back delivery, playback, and visual device regressions could not be run here.
- Android TV/phone build, Capacitor compatibility, Media3 need, playback/input/lifecycle behavior, and store packaging could not be verified because no Android project exists.
- `npm run package:webos` was not run because it requires local metadata-proxy configuration and packaging tooling; its prerequisite guarded production build passed.

[gpt-5.6-terra e=high tools=prompt: 32 tool calls, 1,956,557 tok sent / 13,104 tok returned]


===== agent6-guards--contracts-and-ci--fo =====
## Final report

JUDGEMENT — REJECT AS WRITTEN; PROCEED ONLY WITH A GUARD/CI REWRITE FIRST

From the guards/contracts/CI angle, plans/main-refractor.md does not yet get the repo to three safely propagating apps. It proposes a reasonable package direction and says CI should build all three, but it treats enforcement as a checklist item rather than designing the target-specific guard architecture needed to prevent the exact device-only regressions this repo currently catches. I would reject the plan as written and proceed only after named changes below.

CURRENT ENFORCEMENT

1. The build pipeline is webOS-specific and sequential: package.json:6-7 runs tsc, the import-cycle guard, Vite build, webOS bundle guard, CSS baseline guard, CSS motion guard, and the worker build. package.json:8 packages only via ares-package after the build and metadata-proxy requirement.
2. The observed baseline is green: npm test passed 48 files and 442 tests; npm run build passed TypeScript, 43 runtime-module cycle scanning, artifact generation, webOS bundle validation, both CSS guards over source and generated CSS, and the worker build.
3. Import-cycle enforcement is src-rooted and excludes tests: scripts/check-import-cycles.mjs:5-7 and :47-65. In the proposed workspace it will silently stop policing packages/* and app code unless rewritten to accept explicit roots and package-boundary edges. The plan says to keep the existing guard (plans/main-refractor.md:252), but unchanged retention loses enforcement over the proposed shared engine and adapters.
4. The webOS bundle guard is wholly target/artifact-specific. It hardcodes webos-app/app.js, index.html, and build-info.json (scripts/check-webos-bundle.mjs:4-8); bans post-ES2015 globals (:10-19); requires standalone Dash/HLS/MPEG-TS assets, script ordering, minimum sizes, and markers (:20-77); verifies media engines are not bundled in the app IIFE (:91-106); and rejects leaked probe symbols or compiled sync kill-switches (:108-145). This must remain a mandatory webOS release gate. It cannot be treated as a generic guard for Android. The plan does not specify an equivalent Android artifact guard or how the media boundary changes when Android uses Media3 (plans/main-refractor.md:533-545, :607-612).
5. The CSS baseline guard is explicitly webOS/Chromium-79 policy. It scans src/style.css and optionally generated webos-app/style.css (scripts/check-css-baseline.mjs:199-220), rejects properties/features above Chromium 79 (:65-181, :241-313), and fail-closes unresolved flex/grid gap (:313-360). If shared CSS is modernized for phones, this guard either blocks valid Android CSS or gets weakened globally and permits webOS defects. The correct design is separate target scans: mandatory Chromium-79-safe webOS stylesheet scanning, plus Android-TV and phone policy scans; shared TV CSS consumed by webOS remains under the strict guard.
6. The CSS motion guard is a device-performance policy. It scans source and generated webOS CSS (scripts/check-css-motion.mjs:31-51), rejects unresolved/all/paint transitions and keyframed paint, rejects stylesheet will-change, and bans unsupported selectors (:53-121). It must remain mandatory for webOS TV CSS and likely shared Android-TV TV presentation, but phone motion may need a distinct policy. The plan gives no per-target policy or guard invocation (plans/main-refractor.md:241-260, :607-623).
7. There is a fifth contract layer outside the four build guards: scripts/design-contract.test.mjs:1-17 documents screenshot-preventing requirements; it scans src/style.css (:27-31), checks neutral surfaces, focus colour, semantic colour tokens and typography (:173-239, :293-354), and checks public/appinfo.json launch colour against the canvas (:249-260). The plan's CI list does not explicitly retain this design contract as a webOS target gate (plans/main-refractor.md:607-623). It must remain mandatory for webOS/Android TV shared TV presentation, with a separate phone design contract.

CONTRACT TESTS

The source contracts are active and implementation-coupled. src/artwork-backfill-contract.test.ts:11-18 loads raw runtime sources and selects ./main.ts; assertions at :30-109 pin imports, exact function bodies, bounded artwork resolution, and profile hydration. Similar raw-source coupling exists in artwork-quality-contract.test.ts, deferred-image-contract.test.ts, player-title-source-contract.test.ts, and track-selection-contract.test.ts. src/local-first-regression.test.ts:3-15 and later assertions inspect main.ts. src/provider-boundary.test.ts:3-30 requires main.ts to import provider-broker and not xtream-client. The observed 48/442 green suite confirms these tests are active.

These are requirements, not disposable tests: artwork backfill and bounded resolution are pinned at src/artwork-backfill-contract.test.ts:30-109; player title/source identity and exactly-one native player.src assignment are pinned at src/player-title-source-contract.test.ts:36-85; provider access through the broker is pinned at src/provider-boundary.test.ts:4-32.

The plan's instruction to convert source-text tests to behavioral/unit contracts where practical (plans/main-refractor.md:252-254) is directionally right but too vague. Move each contract atomically with its owning shared implementation, or replace it only after an equivalent test exists. Retain source/architecture contracts for boundaries behavior tests cannot prove: no direct Xtream imports, no media-engine bundling, no credential leakage, dependency direction, and target artifact shape. Add shared-contract tests once for the engine and adapter-contract suites for webOS, Android TV, and phone.

TARGET POLICY

Shared gates: strict typecheck across all workspaces; import cycles across every package/app root; executable dependency-boundary checks; shared behavior/contracts; secret/artifact leakage scan. The current tsconfig.json:1-28 is not strict and includes only src plus the worker (:28), so proposed packages and Android code would not be checked without new configs.

WebOS-only mandatory gates: ES2015/banned-global and bundle-shape guard; standalone media asset existence/order/size/marker and no-IIFE-bundling checks; probe/build-info checks (scripts/check-webos-bundle.mjs:20-145); Chromium-79 CSS baseline over source and generated webOS CSS; D-pad motion guard; Cinema design contract and appinfo launch-background contract; IPK packaging and metadata-proxy configuration (package.json:8 and scripts/require-metadata-proxy.mjs); simulator and physical-TV evidence. The checklist explicitly requires LG simulator and physical TV runs with the real remote (TV_UX_REGRESSION_CHECKLIST.md:1-7) and detailed focus, Back, and playback checks (:9-124).

Android TV gates: Gradle/Capacitor tv-flavor build; manifest/leanback/banner/input checks; TV focus/input/back adapter contracts; TV CSS/motion policy; emulator and physical D-pad smoke tests; Media3 adapter contracts for HLS/DASH/MPEG-TS/subtitles/audio and cancellation/fallback.

Android phone gates: phone-flavor build/install and artifact checks; back/lifecycle/orientation/touch/accessibility/secure-storage tests; a phone UI contract rather than TV spatial-focus assertions; WebView/bridge/Keystore and network-policy tests.

CI GAP

The plan's CI block (plans/main-refractor.md:607-623) lists checks but does not specify target ownership, guard invocation, contract partitioning, or physical-device evidence. The repository root has no visible Android project, workflow directory, or lint/format/typecheck scripts; package.json:6-10 contains only dev/build/test/proxy/package commands.

Required blocking jobs:
1. shared-quality: workspace install/lockfile validation, strict typecheck, lint/format, dependency-boundary and cycle checks, shared tests, security scan.
2. webos-guard: actual webOS build; Chromium-79 baseline; TV motion/design contracts; bundle/media/probe guards; webOS contracts; worker and metadata-proxy checks.
3. android-tv: tv flavor build, manifest/artifact checks, shared tests, TV adapter contracts, TV CSS/motion checks, emulator D-pad smoke tests.
4. android-phone: phone flavor build, artifact checks, shared tests, phone adapter/bridge/storage contracts, emulator touch/back smoke tests.
5. physical-release-evidence: release-only LG simulator/physical-TV and Android device evidence. CI cannot honestly infer this from unit/build jobs.

CI must also prove propagation: all entry points resolve the same workspace package revision and no app contains copied shared source. Add reproducible build metadata to all artifacts and compare shared-engine revision/version.

REQUIRED PLAN CHANGES

1. Make import-cycle checking workspace-aware and add executable package-boundary checks.
2. Split CSS into explicit target policies; preserve strict Chromium-79 and TV motion/design contracts for webOS.
3. Keep check-webos-bundle.mjs as a webOS artifact guard and add Android artifact guards.
4. Add distinct required build:webos, build:android:tv, and build:android:phone commands, each running target guards plus shared checks.
5. Create a shared-contract suite; move raw-source contracts atomically and retain architecture/media/artifact invariants.
6. Add blocking CI workflows/jobs.
7. Add release-blocking credential/token scans over IPK/APK/AAB/WebView bundles and logs, consistent with TV_UX_REGRESSION_CHECKLIST.md:67-70.
8. Preserve a webOS release lane during every main.ts extraction; do not defer current device protections until Android exists.

BOTTOM LINE

Reject as written. The architecture could support the three-app goal, but the enforcement section is a list of intentions and fails to specify which policies are global, webOS-only, TV-only, and phone-specific. Without that separation, implementation will either weaken Chromium-79/D-pad protections for phone CSS or leave new packages and Android artifacts outside existing guards. Revise the plan with target-aware guards, executable package boundaries, preserved/migrated contracts, and separate required CI jobs before implementation.

WHAT I COULD NOT VERIFY

- No Android/Capacitor/Gradle project or Android artifact behavior was present to inspect; exact Android manifest, WebView, Media3, Keystore, and Gradle requirements remain design requirements.
- No CI provider/workflow configuration was found; proposed CI jobs are recommendations, not existing infrastructure.
- No LG simulator, physical TV, Android emulator, or device playback tests were run. Passing npm test and npm run build does not verify device behavior.
- I verified source-text contract coupling and active tests, but did not independently count the exact total of more than 100 source assertions.
- I inspected the complete design-contract test in ranges and confirmed its assumptions, but did not run it as a standalone command outside npm test.

[gpt-5.6-luna e=high tools=prompt: 30 tool calls, 1,333,803 tok sent / 8,200 tok returned]
