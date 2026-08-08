# Nova Play main refactor v2 — execution plan

**Status:** proposed; execute in order. A failed decision gate stops later phases.

## 1. Verified starting point

### Hard constraints

- The shipping target is LG webOS 6.5.3 on Chromium 79, and unsupported CSS can fail silently (`CLAUDE.md:5-14`). The banned runtime globals and compositor-only webOS motion policy are build requirements, not review suggestions (`CLAUDE.md:25-34`).
- Credentials and private catalog data must remain device-local and must never enter source, fixtures, logs, or packages (`CLAUDE.md:73-74`).
- Tests named `*-contract.test.ts` are behavioral contracts and must not be relaxed to make a refactor pass (`CLAUDE.md:68-72`).
- `src/main.ts` is currently 9,397 lines (`CLAUDE.md:48-54`). Its mutable block mixes profile/session, catalog and sync, playback engines and controls, search, navigation, EPG, artwork, caches, timers, and lifecycle state (`src/main.ts:457-614`). Splitting that file is necessary, but it is not the product outcome.

### Baseline verified on 2026-08-08

These commands were run in the clean planning worktree:

```text
$ npm test
Test Files  48 passed (48)
Tests       442 passed (442)
Duration    9.38s

$ node scripts/check-import-cycles.mjs
Verified 43 runtime source modules contain no relative import cycles.
```

Vitest also emitted mocked upstream 503 messages from metadata-proxy tests on stderr; the command exited 0. The current complete build also exited 0 and reported 43 cycle-checked modules, a successful webOS Vite build, a passing bundle check, two passing Chromium-79 stylesheet scans, two passing motion scans, and a successful probe-worker build.

### Why guards are Phase 1

All four current guards are coupled to today’s single-app layout:

1. **Cycles:** `sourceRoot` is fixed to `src` (`scripts/check-import-cycles.mjs:4-6`). Resolution skips every non-relative specifier (`scripts/check-import-cycles.mjs:70-78`) and only tries relative `.ts` and `index.ts` candidates (`scripts/check-import-cycles.mjs:80-91`). A cycle crossing future workspace package names would therefore be false-green.
2. **CSS baseline:** the only inputs are required `src/style.css` and optional generated `webos-app/style.css` (`scripts/check-css-baseline.mjs:177-203`). The scanner itself fixes the baseline at Chromium 79 (`scripts/css-baseline-scan.mjs:15`). CSS moved to an app or UI package could therefore escape the check.
3. **CSS motion:** it scans the same two paths (`scripts/check-css-motion.mjs:42-63`), so moved webOS CSS could escape its compositor/will-change policy.
4. **Bundle:** output, application bundle, HTML, and build metadata are fixed to `webos-app/`, `app.js`, `index.html`, and `build-info.json` (`scripts/check-webos-bundle.mjs:4-8`). It also prescribes webOS’s three standalone media assets (`scripts/check-webos-bundle.mjs:17-34`) and validates their order and metadata (`scripts/check-webos-bundle.mjs:57-89`). It cannot validate a new app artifact.

The current build script invokes those checks only around one Vite/webOS build (`package.json:6-14`). No existing dependency or script introduces Capacitor or an Android project (`package.json:16-29`). **No existing source or stylesheet may move until Phase 1 exits.**

### Compatibility policy must be per target

The current Vite configuration is intentionally webOS-specific: `webos-app` output, ES2015 syntax, an IIFE built from `src/main.ts`, and fixed `style.css` naming (`vite.config.ts:77-103`). The root TypeScript config likewise targets ES2015 and includes DOM libraries (`tsconfig.json:2-23`). Those are not Android requirements.

The end-state policy is:

| Target | JavaScript build target | CSS policy | Final bundle policy |
|---|---|---|---|
| webOS TV | ES2015, plus the existing banned-global scan | Chromium 79 baseline and current webOS motion guard on every stylesheet in its dependency closure and generated CSS | Existing IIFE/media-asset/probe checks |
| Android TV | Derived from the approved minimum Android System WebView in Phase 0; never implicitly 79 | Android-only CSS is not scanned against Chromium 79. Any CSS actually shared with webOS must satisfy webOS policy. | Capacitor web assets, native project, selected playback backend, and engine-build identity |
| Android phone | Same rule as Android TV unless its approved device policy differs | Phone-only CSS is not scanned against Chromium 79; do not import the TV stylesheet as a starting point | Capacitor web assets, native project, selected playback backend, and engine-build identity |
| `@nova/engine` source | No browser target of its own; each app transpiles the same source for its target | No CSS | No direct artifact; its source hash is recorded in each app build |

Android may use newer syntax and CSS when its approved WebView baseline supports them. Shared engine code must remain platform-neutral or use a port; webOS’s final bundle guard remains the backstop for anything consumed by webOS.

## 2. Target package shape and ownership rules

Create this shape only after the Android playback decision in Phase 2:

```text
apps/
  webos/                 # shipping webOS composition root and TV view
  android-tv/            # Capacitor shell and Android TV view
  android-phone/         # created only after the phone decision
packages/
  engine/                # domain types, use cases, feature controllers, ports
  platform-web/          # fetch/IndexedDB/browser lifecycle adapters where proven reusable
  playback-webview/      # only if WebView is selected
  playback-media3/       # TS Capacitor adapter; only if Media3 is selected
spikes/
  android-playback/      # isolated Phase 2 proof, deleted or archived after its ADR
```

Do **not** create a generic `ui-shared` package before Phase 6 measures actual view reuse.

### One engine, not one state bag

`packages/engine` must not export `AppState`, `AppContext`, a service locator, or one object containing all mutable feature state. The current mixed globals illustrate the ownership problem: profile/catalog state begins at `src/main.ts:457-477`, playback state at `src/main.ts:478-503`, navigation/search state at `src/main.ts:504-550`, and persistence/artwork/EPG caches at `src/main.ts:596-614`.

Replace them with private, feature-owned state:

| Owner | Owns | Narrow dependencies | Does not own |
|---|---|---|---|
| `ProfileSession` | active profile identity, settings, account snapshot | `ProfileRepository`, `CredentialStorePort` | catalog, player, view/navigation |
| `CatalogController` | active section/category/page, acquisition and sync status | `ProviderPort`, `CatalogRepositoryPort`, `Clock` | DOM, focus, playback transport |
| `SearchController` | query, local results, explicit live-search status | catalog read port, provider search port | catalog sync scheduler, renderer |
| `EpgController` | capability and now/next/schedule requests | EPG repository/provider ports | guide focus/layout |
| `ArtworkController` | overrides, resolution queue, caps, failure semantics | artwork repository/resolver | image elements and rendering |
| `PlaybackSession` | selected item, attempt plan, diagnostics, resume intent, track model | `PlaybackPort`, resume repository, clock | `<video>`, Media3 objects, app route history |
| app-local navigation | route history, focus, D-pad or touch interaction, overlays | immutable feature snapshots and commands | provider, repository, playback engine internals |
| platform playback adapter | HLS/DASH/TS/native or Media3 handles, cancellation and lifecycle | selected platform APIs | catalog/search/profile state |

Each owner exposes typed commands, immutable snapshots, and events. Controllers do not mutate one another. An app composition root may construct them and route explicit events such as `profileChanged(profileId)`, but it stores no duplicate feature state and passes no all-purpose context object.

`src/types.ts` currently mixes domain candidates such as `LibrarySection`, profiles, settings, and categories with UI-only `AppView` (`src/types.ts:1-24`). Split types by owner; do not move that file wholesale into the engine.

### Enforced dependency direction

```text
apps/* -> selected platform adapters -> @nova/engine
apps/* -> @nova/engine
@nova/engine -X-> apps/*, DOM, Capacitor, webOS globals, Hls.js, Dash.js, Media3
one app -X-> another app
```

Every app must declare the same root-workspace `@nova/engine` dependency. `verify:single-engine` will reject legacy engine implementations under an app, cross-app imports, or an app build whose generated engine source hash differs from the other app builds.

## 3. Open questions before Android work

Phase 1 guard work may proceed, but **Phase 2 and all Android implementation are blocked until every BLOCKING item is answered in `docs/android/requirements.md`.** “Latest” and “TBD” are not answers.

### BLOCKING

1. What is the minimum Android API level for TV and phone?
2. What is the minimum Android System WebView/Trichrome major version, and may deployment assume it updates through Play Store? Record policy for devices with pinned OEM WebViews.
3. Which physical devices form the supported matrix? Include at least each minimum-OS/minimum-WebView class and one current Android TV and phone class; record model, SoC, OS, WebView, memory class, and remote/input type.
4. Are **background audio**, **downloads**, **casting**, **picture-in-picture**, and **offline playback/catalog use** required? Answer yes/no separately and define suspend, resume, notification, and process-death behavior for each yes.
5. Which protocols, containers, video/audio codecs, subtitle forms, DRM systems, and live/VOD cases are mandatory beyond HLS, DASH, and MPEG-TS? Supply a legal, non-secret representative media corpus.
6. Must provider endpoints using cleartext HTTP work on Android? Define network-security policy rather than enabling cleartext globally by accident.
7. Where are Android credentials and tokens stored, what must survive reinstall/backup, and is hardware-backed storage required? This must satisfy the repository rule against credentials in source, fixtures, logs, or packages (`CLAUDE.md:73-74`).
8. What playback behavior is required on app background/foreground, Activity recreation, process death, audio focus loss, HDMI disconnect, and network change?
9. Is Play Store distribution required for both Android form factors, and are TV-specific review requirements part of the first release?

### NON-BLOCKING for the playback spike, but blocking before production release

- Final package IDs, signing owners, release tracks, branding assets, analytics/crash provider, accessibility acceptance owner, localization list, and support/telemetry retention policy.
- Final phone information architecture and visual design. Phase 6 deliberately measures this rather than assuming TV reuse.

## 4. Ordered phases

## Phase 0 — Freeze evidence and approve Android requirements

**Work**

1. Tag or record the last shippable webOS commit and save the baseline command output above in `docs/refactor/baseline.md`.
2. Create `docs/android/requirements.md` with an owner and explicit answer for every blocking question.
3. Add `scripts/check-android-requirements.mjs` and `npm run verify:android-requirements`; fail on missing fields, `TBD`, an empty device matrix, or absent yes/no feature decisions.
4. Define the legal playback corpus by stable sample ID and checksum. Keep URLs, provider credentials, and private payloads outside Git.

**Exit criterion**

```text
npm test
node scripts/check-import-cycles.mjs
npm run build
npm run verify:android-requirements
```

All exit 0, and `docs/refactor/baseline.md` plus approved `docs/android/requirements.md` exist. Android work remains stopped otherwise.

**Rollback**

Revert only the requirements/validator commit. The recorded webOS tag and current build remain the shipping path.

## Phase 1 — Make guards workspace- and target-aware (no moves)

**Work**

1. Add `scripts/target-registry.mjs`. It declares each app’s source roots, CSS ownership/consumers, JS target, output artifacts, and bundle policy. It also discovers `apps/*`, `packages/*`, and root workspaces and fails if any source root or app is unregistered.
2. Refactor `check-import-cycles.mjs` to collect runtime TypeScript from every registered root and resolve both relative imports and workspace package exports/subpaths. Use TypeScript module resolution instead of extending the current regex. Keep type-only edges out of the runtime graph.
3. Parameterize the CSS scripts. Scan all source CSS consumed by webOS, wherever it lives, plus generated webOS CSS. Apply Chromium 79 only to webOS. Explicitly classify Android-only CSS as non-webOS; unclassified CSS fails closed.
4. Replace the hardcoded bundle entry with a dispatcher that validates every registered app. Preserve all existing webOS checks. Add Capacitor artifact and engine-identity policies to the registry before an Android app can be registered.
5. Add guard fixtures/tests proving:
   - a cycle through `@nova/*` package imports fails;
   - forbidden webOS CSS under `apps/webos/` and a shared package fails;
   - the same modern feature in Android-only CSS is not rejected as Chromium-79-incompatible;
   - unsafe webOS motion after a path move fails;
   - an unregistered app/source/CSS root fails;
   - a missing or wrong target artifact fails.
6. Introduce `build:webos` while retaining `npm run build` as a webOS-compatible alias during migration.

**Exit criterion**

```text
npm run test:guards
npm test
npm run build:webos
```

All pass, including every intentionally red fixture. The target registry covers both current roots and the future `apps/*`/`packages/*` locations. No application source has moved.

**Rollback**

Revert this phase as one guard-only change. Do not begin Phase 2 or move code if it is reverted; the existing webOS build remains available from the Phase 0 tag.

## Phase 2 — Prove Android playback before reorganizing

This is an isolated technical spike, not the Android app and not the engine extraction.

**Work**

1. Create `spikes/android-playback/`, a minimal Capacitor app with one screen, one media surface, lifecycle logging, track controls, cancel/switch controls, and no catalog/provider implementation.
2. First implement alternative **A — WebView playback** using the same browser engine families already used by the repo: Hls.js, Dash.js, MPEG-TS, and native video (`package.json:25-29`). Test on every approved physical-device row, not only an emulator.
3. For every required media-corpus row, record:
   - manifest/container and codec identification;
   - first decoded video frame and audible audio;
   - seek/pause/resume where applicable;
   - enumerated audio and subtitle tracks, successful selection, and observable audio/subtitle change;
   - live continuity where applicable;
   - errors and backend events without credentials or private URLs.
4. Prove cancellation: start A, cancel during manifest load and again during playback, assert no stale callback/state/audio from A, then start B successfully. The current browser player already needs explicit destruction/reset for HLS, MPEG-TS, and DASH and removes the media source during cleanup (`src/main.ts:3689-3717`); the spike must show equivalent behavior on Android rather than assume it.
5. Prove lifecycle behavior for background/foreground, Activity recreation, process death/relaunch, audio focus, and the exact required feature decisions from Phase 0. The current web app handles `pagehide` and hidden visibility by cancelling work/tearing down or pausing playback (`src/main.ts:9054-9084`); Android evidence must cover Capacitor/native lifecycle transitions too.
6. Validate tracks through the backend, not just UI labels. The current implementation has separate HLS rendition and native `audioTracks`/`textTracks` paths (`src/main.ts:7284-7361`), so both enumeration and actual switching are required evidence.
7. If WebView fails the decision rule below, implement alternative **B — Media3 playback** in the same spike behind a minimal Capacitor plugin and rerun the identical corpus and lifecycle matrix. Do not begin package extraction while choosing.
8. Save raw sanitized results in `docs/android/playback-spike-results.json` and the decision in `docs/adr/android-playback-backend.md`.

**Decision point: WebView vs Media3**

- Select **WebView** only if every mandatory row passes on every supported device class, required tracks are controllable, cancellation leaves no stale playback/events, and all required lifecycle/background behavior is demonstrable.
- A failure of any mandatory format/codec/track/lifecycle row, inaccessible required tracks, non-deterministic teardown, or a required native service feature that the WebView design cannot provide **forces the Media3 proof**. Do not waive a row to preserve a preferred architecture.
- Select **Media3** only if its rerun passes that same matrix.
- If neither backend passes, record **STOP — unsupported Android requirements**. Do not reorganize the shipping app around either assumption. Resolve requirements or stop the three-app initiative.
- A hybrid per-format backend is a third alternative only if the ADR demonstrates why one backend cannot meet the matrix and accepts the additional cancellation, track, lifecycle, and test surface. It is not the default compromise.

**Exit criterion**

```text
npm run spike:android:test
npm run spike:android:build
npm run verify:android-playback-report
```

All pass. `docs/android/playback-spike-results.json` contains a result for every required corpus/device/lifecycle row, and `docs/adr/android-playback-backend.md` names WebView, Media3, hybrid, or STOP. Phases 3–8 require a selected backend with all mandatory rows passing.

**Rollback**

Delete/revert `spikes/android-playback/` and its dependencies. It has no import from the shipping webOS entry and no provider credentials. The Phase 0 webOS tag remains releasable.

## Phase 3 — Establish one engine and extract by feature

**Work**

1. Add root npm workspaces and `packages/engine`, plus only the platform/playback adapter selected by Phase 2. Keep `src/main.ts` as the webOS composition/view entry during this phase.
2. Generate `docs/architecture/package-boundaries.md` from the resolved import graph. Classify existing modules by actual dependencies; do not label browser/DOM/IndexedDB code “engine” merely because it is reusable today.
3. Extract in small commits:
   1. domain types and pure algorithms (`search.ts`, `content-rating.ts`, `playback-fallback.ts`, `player-transport.ts`, `track-selection.ts`, `series-presentation.ts`, cache primitives);
   2. provider use cases behind `ProviderPort`, preserving the single broker choke point;
   3. catalog/sync/search/EPG use cases behind repository/provider ports;
   4. the feature owners listed in Section 2;
   5. the selected playback contract: `load`, `cancel`, `play/pause/seek`, track enumeration/selection, lifecycle, events, and diagnostics.
4. Keep browser storage, browser media objects, webOS launch APIs, DOM rendering, and navigation/focus in adapters or the webOS app. `packages/engine` receives no DOM library in its tsconfig.
5. Add boundary checks for dependency direction, forbidden all-purpose context/state types, cross-feature mutable-state imports, direct `XtreamClient` bypasses, and duplicate engine implementations.
6. Make every extraction a behavior-preserving webOS change with its own green commit. Never maintain a copied “Android engine” beside the old implementation.

### Atomic source-contract migration

The source-text tests inspect `main.ts` through raw globs and pin real ordering/boundary behavior. Migrate each assertion only in the commit that moves the code it guards; first add an equivalent behavioral/adapter test, prove it red by breaking the invariant, then move/remove the old source assertion. Never perform an upfront sweep.

| Existing contract | Invariant to preserve | Migration paired with |
|---|---|---|
| `artwork-quality-contract.test.ts` | explicit shapes, load-settle check, fallback → unavailable → backfill order (`src/artwork-quality-contract.test.ts:20-78`) | `ArtworkController` plus webOS image adapter extraction |
| `artwork-backfill-contract.test.ts` | demand-driven VOD-only queue, caps, transient-failure behavior, override ordering and profile hydration (`src/artwork-backfill-contract.test.ts:27-110`) | artwork queue/store extraction |
| `deferred-image-contract.test.ts` | inert pending attributes, one capped promoter, scheduler wiring, armed-only observer (`src/deferred-image-contract.test.ts:25-78`) | webOS deferred-image controller/view extraction; do not make it engine state |
| `player-title-source-contract.test.ts` | title and source from one selection, one attach writer, no partial content swap (`src/player-title-source-contract.test.ts:43-85`) | `PlaybackSession` and webOS player-view extraction |
| `track-selection-contract.test.ts` | HLS plus native audio/subtitle fallback (`src/track-selection-contract.test.ts:31-55`) | `PlaybackPort` and each selected adapter’s contract tests |
| `local-first-regression.test.ts` | startup, browse/search, guide/EPG, sync and probe boundaries (`src/local-first-regression.test.ts:8-134`) | split assertion-by-assertion with the corresponding catalog/search/EPG/sync extraction |
| `provider-boundary.test.ts` | only the broker reaches `XtreamClient` (`src/provider-boundary.test.ts:8-29`) | workspace-aware provider boundary in the same commit as provider movement |

**Exit criterion**

```text
npm run test:engine
npm run verify:boundaries
npm run verify:single-engine
npm test
npm run build:webos
```

All pass. `docs/architecture/package-boundaries.md` exists, the webOS app consumes `@nova/engine`, no app-local engine fork exists, every migrated contract has an equivalent test at its new boundary, and no contract is skipped or weakened.

**Rollback**

Each extraction commit is independently revertible. Revert back to the preceding green webOS commit and remove now-unused workspace packages; because the webOS entry remains in place throughout, rollback never depends on an Android artifact.

## Phase 4 — Build the Android TV vertical product slice

**Work**

1. Create `apps/android-tv` with its own Vite/TypeScript/CSS policy and Capacitor native project. Compose the shared engine with the backend selected in Phase 2.
2. Implement one end-to-end slice: device-local profile creation, catalog sync/read, browse/search, details/guide, playback, track selection, cancellation/channel switch, favorite/resume persistence, and required lifecycle behavior.
3. Keep D-pad focus, TV density, overlays, remote Back handling, and Android lifecycle in the Android TV app/view layer. Reuse engine snapshots and commands, not `src/main.ts` globals or a cloned webOS entry.
4. Run an Android persistence probe against the approved catalog corpus. Decision alternatives are **Web IndexedDB adapter** and **native SQLite adapter**. Select IndexedDB only if force-stop/relaunch, upgrade, quota, and interrupted-write recovery pass the requirements; otherwise implement SQLite behind the same `CatalogRepositoryPort`.
5. Add app contract tests with fake engine ports and physical-device verification using local credentials only.

**Exit criterion**

```text
npm run test:android-tv
npm run build:android-tv
npm run verify:android-tv-report
npm run build:webos
```

All pass. `docs/android/android-tv-slice-results.json` records every approved device row and end-to-end step, and the Android TV artifact’s build info names the selected backend and the same engine source hash as webOS.

**Rollback**

Remove the `apps/android-tv` workspace and its registry entry. Revert any adapter added only for it. `@nova/engine` and the independently built webOS app remain releasable; do not make `build:webos` depend on an Android SDK.

## Phase 5 — Move the webOS app into its workspace

**Work**

1. Move the webOS composition root, renderer, and styles from root `src` into `apps/webos` in feature-sized commits. Move/update each raw-source contract in the same commit as its guarded code.
2. Preserve the current generated artifact contract and packaging command while changing source locations. `npm run build` remains an alias for `build:webos`, and `package:webos` continues to produce the webOS package path used today (`package.json:6-14`).
3. Confirm all CSS imported by webOS—including CSS in any shared TV package—runs through Chromium 79 and motion checks. Android-only CSS must remain outside that closure.
4. Run the existing webOS device regression checklist on the physical LG target; record build commit and result.

**Exit criterion**

```text
npm test
npm run verify:boundaries
npm run verify:single-engine
npm run build:webos
```

All pass. `docs/refactor/webos-workspace-device-report.md` exists with an approved physical-device run, and `apps/webos` is the sole webOS source root registered for shipping.

**Rollback**

Revert the workspace-move commits and build from the preceding green root entry. The engine API remains unchanged, so Android TV need not be rolled back with this phase.

## Phase 6 — Measure phone UI reuse and decide whether phone proceeds

Current reuse below the view-model layer is **unmeasured**. Do not use any prior UI-reuse estimate or treat a phone as a responsive TV stylesheet.

**Experiment**

1. Create `experiments/android-phone-ui`, consuming the same engine/view-model contracts but implementing touch-first versions of three representative flows: browse/search, title/series details, and player controls/lifecycle.
2. Test portrait and landscape on the approved minimum and current phone rows. Include touch scrolling, soft keyboard/search, system Back, accessibility focus, track selection, and one-handed player controls. Do not begin by importing the TV stylesheet.
3. Add `scripts/report-ui-reuse.mjs`. From the resolved build module graph, exclude engine, ports, adapters, and view-models; for the remaining view layer report:
   - exact shared modules imported from the same path and hash;
   - Android-TV-only and phone-only modules;
   - copied/modified modules, counted as target-specific;
   - absolute file counts and nonblank source lines in each bucket.
4. Save the generated data in `docs/android/phone-ui-reuse.json` and usability findings in `docs/android/phone-ui-experiment.md`. No target percentage is set in advance; the evidence informs the decision.

**Decision point: phone application**

Choose exactly one in `docs/adr/android-phone-product.md`:

- **Proceed — separate phone view:** share engine/view-models and only empirically shared view modules.
- **Proceed — shared responsive view:** allowed only if the experiment shows the exact same view modules work without TV interaction assumptions and both form factors pass usability review.
- **Defer/stop phone:** preserve webOS and Android TV, remove the experiment, and state plainly that the three-app goal has not been achieved. Do not count Phase 8 as complete for the original goal.

The decision owner considers product need, accessibility/usability evidence, and maintenance cost; there is no invented sharing threshold.

**Exit criterion**

```text
npm run experiment:phone:test
npm run experiment:phone:build
npm run report:phone-ui-reuse
npm run verify:phone-decision
```

All pass. Both measurement artifacts and the phone ADR exist. Phase 7 runs only for a Proceed decision.

**Rollback**

Delete the experiment and its registry entry. It has no shipping route. webOS and Android TV artifacts continue to build from the same engine.

## Phase 7 — Build Android phone as a distinct app

**Work**

1. Create `apps/android-phone` from the approved Phase 6 direction, not from a copy of the TV app.
2. Compose the same `@nova/engine`, repository adapter, credential policy, and selected playback backend. Implement phone-owned navigation, touch layouts, keyboard/search, system Back, orientation, accessibility, lifecycle, and any approved phone-only background/PiP/casting/download behavior.
3. Import only view modules proven reusable by the experiment. Keep phone CSS Android-only unless a module is genuinely consumed by webOS.
4. Run the complete phone product flow and playback corpus on every supported phone row.

**Exit criterion**

```text
npm run test:android-phone
npm run build:android-phone
npm run verify:android-phone-report
npm run verify:single-engine
```

All pass. `docs/android/android-phone-results.json` covers every required device/flow row, and its build info contains the same engine source hash as the TV apps.

**Rollback**

Remove `apps/android-phone` and phone-only adapters/styles. Do not revert the engine or either TV app unless a shared contract itself is faulty.

## Phase 8 — Make the three artifacts the release gate

**Work**

1. Add root CI commands that install once, test engine and adapters, run all four target-aware guards, build all apps, and validate device-report schemas separately from host automation.
2. Generate one artifact manifest containing commit, engine source hash, target policy, playback backend, and output checksums for webOS TV, Android TV, and Android phone.
3. Make `verify:single-engine` compare all three build-info records and fail if an app omits `@nova/engine`, imports another app, contains a legacy engine implementation, or records a different engine source hash.
4. Keep release jobs independent: failure or rollback of one Android app must not prevent rebuilding the last approved webOS release.

**Exit criterion**

```text
npm ci
npm run verify
npm run build:all
npm run verify:artifacts
```

All pass in CI. The manifest contains one webOS package, one Android TV APK/AAB, and one Android phone APK/AAB built from one engine source hash. This phase cannot exit after a Phase 6 Defer/stop decision.

**Rollback**

Roll back the affected app/release job to its last green tag. Keep the common engine at the newest version accepted by all remaining shipping apps; if an engine regression is involved, revert that engine commit and rebuild all three rather than patching app-local forks.

## 5. Decision register

| Decision | Must be made by | Alternatives | Stop condition |
|---|---|---|---|
| Android requirements/device floor | Phase 0 | explicit supported versions/features | any blocking field unanswered |
| Playback backend | Phase 2 | WebView / Media3 / justified hybrid / STOP | no backend passes every mandatory row |
| Android catalog storage | Phase 4 | Web IndexedDB / native SQLite | neither survives required lifecycle/data corpus |
| Phone UI architecture and whether phone proceeds | Phase 6 | separate phone view / proven responsive shared view / defer-stop | no acceptable touch/accessibility result or no product commitment |
| Three-app release | Phase 8 | release all / do not claim completion | missing app, report, artifact, or common engine hash |

## 6. Unknowns and how to resolve them

- **Android playback compatibility is unknown.** Resolve with the Phase 2 protocol/codec/track/lifecycle matrix on approved physical devices. Do not extrapolate from desktop Chrome or webOS.
- **Whether WebView or Media3 is the lower-risk backend is unknown.** Compare identical evidence; do not estimate before the spike.
- **View-layer reuse between TV and phone is unknown.** Resolve with the Phase 6 module-graph/line classification and usability experiment. No sharing percentage is asserted here.
- **How much current code is platform-neutral is unknown until import boundaries are generated.** Resolve with the Phase 3 dependency report; DOM/IndexedDB/webOS references decide adapter placement.
- **Android storage capacity, interruption behavior, and WebView persistence are unknown.** Resolve with the Phase 4 corpus, quota, force-stop, upgrade, and interrupted-write probe; select IndexedDB or SQLite from results.
- **Performance acceptance numbers are unspecified.** Capture startup, switch, seek, memory, and lifecycle observations in spike/product reports, then have product/device owners set requirements from evidence. This plan invents no threshold.
- **Background audio, downloads, casting, PiP, offline, DRM, and codec scope are unknown until Phase 0.** Their answers may change the backend and native service design.
- **Effort and release dates are unknown.** Estimate only after Phase 2 selects a backend and Phase 3 produces the dependency graph; no effort number is implied by phase count.

## 7. Evidence limitation for this revision

At authoring time, the clean checkout did not contain `plans/main-refractor.md`, `plans/main-refactor-assessment.md`, or `plans/main-refactor-assessment-raw.md`, and no available Git ref had path history for those names. The unrelated existing file under `plans/` was not used as a substitute. This revision therefore honors the established FALSE/UNPROVEN findings supplied with the task and independently verified repository evidence above, but it cannot claim to have incorporated additional raw-agent details that were unavailable.
