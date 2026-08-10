# Nova Play main refactor v2 — execution plan

> **Status: NOT APPROVED — superseded on 2026-08-09. Do not execute this plan.**
>
> **The plan of record is `plans/main-refactor-v3.md`.**
>
> An LLM council reviewed it against constraints it did not know (two engineers,
> 40 hrs/week total, one Android TV box, one test phone, phone app required,
> real users on the shipping webOS app) and rejected its ordering. The binding
> decision is `plans/council-2026-08-09-main-refactor-v2.md`.
>
> What was rejected: Phase 0 guard work as the first change; Android TV before
> the phone; the phone at Phase 7 behind a Phase 6 gate permitting
> "Defer/stop phone"; Phase 5's move of the shipping app into `apps/webos`.
>
> What survives and is still worth reading: the per-target compatibility policy
> (§1), the false-green guard analysis (§1), the feature-owned state table (§3),
> the ten blocking Android questions (§4), the Phase 2 playback/lifecycle/track
> evidence matrix, and the atomic source-contract migration table (Phase 3).
> Phase 2 is the only phase to run now, as a disposable phone spike.

**Original status (historical):** proposed; execute in order. A failed decision gate stops later phases.

## 1. Verified starting point

### Hard constraints

- The shipping target is LG webOS 6.5.3 on Chromium 79, and unsupported CSS can fail silently (`CLAUDE.md:5-16`). The banned runtime globals and compositor-only webOS motion policy are build requirements, not review suggestions (`CLAUDE.md:18-26`).
- Credentials are device-local and must not be embedded in source, tests, fixtures, or the IPK (`CLAUDE.md:81-84`).
- Tests named `*-contract.test.ts` are behavioral contracts and must not be relaxed to make a refactor pass (`CLAUDE.md:78-80`).
- `src/main.ts` is currently 9,397 lines (`CLAUDE.md:57`). Its mutable block mixes profile/session, catalog and sync, playback engines and controls, search, navigation, EPG, artwork, caches, timers, and lifecycle state (`src/main.ts:457-614`). Splitting that file is necessary, but it is not the product outcome.

### Baseline verified on 2026-08-08

These commands were run in this planning worktree:

```text
$ npm test
Test Files  48 passed (48)
Tests       442 passed (442)
Duration    9.38s

$ node scripts/check-import-cycles.mjs
Verified 43 runtime source modules contain no relative import cycles.
```

Vitest also emitted mocked upstream 503 messages from metadata-proxy tests on stderr; the command exited 0. The assessment independently recorded the same 48-file/442-test baseline and a successful guarded webOS build (`plans/main-refactor-assessment.md:20-23`; `plans/main-refactor-assessment-raw.md:361-368`). The command output above must be replaced with the final verification output whenever this plan is revised.

### Why target-aware guards are the first implementation phase

The four build-time guard scripts and the active design contract are coupled to today’s single-app layout:

1. **Cycles:** `sourceRoot` is fixed to `src` (`scripts/check-import-cycles.mjs:4-6`). Resolution skips every non-relative specifier (`scripts/check-import-cycles.mjs:85-87`) and only tries relative `.ts` and `index.ts` candidates (`scripts/check-import-cycles.mjs:89-99`). A cycle crossing future workspace package names would therefore be false-green, matching the assessment’s explicit finding (`plans/main-refactor-assessment.md:26-30`).
2. **CSS baseline:** the only inputs are required `src/style.css` and optional generated `webos-app/style.css` (`scripts/check-css-baseline.mjs:177-203`). The scanner fixes the baseline at Chromium 79 (`scripts/css-baseline-scan.mjs:15`). CSS moved to an app or package could therefore escape the check; applying that policy to Android-only CSS would instead impose an unsupported Android ceiling (`plans/main-refactor-assessment.md:31-34`).
3. **CSS motion:** it scans the same two paths (`scripts/check-css-motion.mjs:42-63`), so moved webOS CSS could escape its compositor/will-change policy. The raw assessment identifies this as a webOS device policy rather than a universal phone policy (`plans/main-refactor-assessment-raw.md:68-75`).
4. **Bundle:** output, application bundle, HTML, and build metadata are fixed to `webos-app/`, `app.js`, `index.html`, and `build-info.json` (`scripts/check-webos-bundle.mjs:4-8`). It also prescribes webOS’s three standalone media assets (`scripts/check-webos-bundle.mjs:17-34`) and validates their order and metadata (`scripts/check-webos-bundle.mjs:57-89`). It cannot validate an Android artifact (`plans/main-refactor-assessment-raw.md:381-390`).
5. **Design contract:** `scripts/design-contract.test.mjs` reads `src/style.css` and checks TV visual tokens plus `public/appinfo.json` launch color (`scripts/design-contract.test.mjs:1-31,173-269`). A source move can strand those checks just as it can strand the CSS scanners; phone needs a target-owned contract, not silent inheritance of the TV contract (`plans/main-refactor-assessment-raw.md:394-399`).

The current build invokes the four build scripts only around one Vite/webOS build (`package.json:6-14`), while the design contract runs in the test layer. No existing dependency or script introduces Capacitor or an Android project (`package.json:16-29`; `plans/main-refactor-assessment.md:20-23`). **The first implementation change is Phase 0 guard work. No existing source or stylesheet may move, and no production workspace app/package may be added, until Phase 0 exits; isolated guard fixtures are the exception.**

### Compatibility policy must be per target

The current Vite configuration is intentionally webOS-specific: `webos-app` output, ES2015 syntax, an IIFE built from `src/main.ts`, and fixed `style.css` naming (`vite.config.ts:77-103`). The root TypeScript config likewise targets ES2015 and includes DOM libraries (`tsconfig.json:2-23`). Those are not Android requirements.

The end-state policy is:

| Target | JavaScript build target | CSS policy | Final bundle policy |
|---|---|---|---|
| webOS TV | ES2015, plus the existing banned-global scan | Chromium 79 baseline and current webOS motion guard on every stylesheet in its dependency closure and generated CSS | Existing IIFE/media-asset/probe checks |
| Android TV | Derived from the approved minimum Android System WebView in Phase 1; never implicitly 79 | Android-only CSS is not scanned against Chromium 79. Any CSS actually shared with webOS must satisfy webOS policy. | Capacitor web assets, native project, selected playback backend, and engine-build identity |
| Android phone | Same rule as Android TV unless its approved device policy differs | Phone-only CSS is not scanned against Chromium 79; do not import the TV stylesheet as a starting point | Capacitor web assets, native project, selected playback backend, and engine-build identity |
| `@nova/engine` source | No browser target of its own; each app transpiles the same source for its target | No CSS | No direct artifact; its source hash is recorded in each app build |

Android may use newer syntax and CSS when its approved WebView baseline supports them. Shared engine code must remain platform-neutral or use a port; webOS’s final bundle guard remains the backstop for anything consumed by webOS.

## 2. Changes from the original plan

This revision keeps the original destination—shared TypeScript source, workspace packages, ports/adapters, and a composition-only webOS entry—but changes the execution path as follows:

1. **Guard expansion precedes all source moves and workspace creation.** The original Phase 0 retained the existing cycle guard and began architecture/test work, then its Phase 1 moved code (`plans/main-refractor.md:441-467`). The assessment found that cycle checking covers only `src/` and relative imports, CSS guards name current paths, and the bundle guard hardcodes webOS artifacts; new workspaces would be false-green (`plans/main-refactor-assessment.md:26-34,45-48`). Phase 0 below therefore changes guards without moving production code.
2. **Android playback is proved before the repository is reorganized around Capacitor.** The original chose a Capacitor Android shell, preferred Media3, and deferred Android packaging to Phase 7 (`plans/main-refractor.md:26-35,166-181,544-553`). Playback, track control, cancellation, lifecycle, and even the minimum Android/WebView floor are unproven (`plans/main-refactor-assessment.md:66-71`). Phase 2 is now an isolated WebView-versus-Media3 proof; failure can stop Android without destabilizing webOS.
3. **The temporary `AppState`/`AppContext` migration is removed.** Original Phase 2 proposed `AppContext { state, services, platform }` as a bridge (`plans/main-refractor.md:468-480`). The assessment resolves the agent disagreement against that approach because the current state block combines durable state, DOM/media handles, timers, cancellation, focus, history, and scheduling (`plans/main-refactor-assessment.md:49-54`; `plans/main-refactor-assessment-raw.md:332-339`). State is instead owned by feature controllers and narrow ports from the first extraction.
4. **Contract migration is atomic, not an upfront cleanup.** Original Phase 0 proposed converting source-text tests before extraction (`plans/main-refractor.md:441-455`). Those tests encode ordering and provider/artwork/playback boundaries, so early removal would strip protection during the riskiest work (`plans/main-refactor-assessment.md:55-58`; `plans/main-refactor-assessment-raw.md:346-354`). Each assertion moves only with its owning implementation and an equivalent test.
5. **The shared UI assumption and numeric reuse estimate are removed.** The original proposed one `packages/ui` and claimed an unmeasured UI reuse range (`plans/main-refractor.md:36-55,126-136,221-246`). The assessment marks a shared TV/phone UI package false and every such percentage unproven; current shell, focus, forms, player controls, and Back behavior are TV-specific (`plans/main-refactor-assessment.md:35-37,61-72`; `plans/main-refactor-assessment-raw.md:232-264`). Phase 6 measures view reuse and explicitly decides whether the phone app proceeds.
6. **Chromium 79 becomes webOS-scoped rather than a shared target.** The original described one shared UI/style package but did not define per-target guard scope (`plans/main-refractor.md:84-136,559-568`). The assessment found that this would either tax Android or let moved webOS CSS evade checks (`plans/main-refactor-assessment.md:26-34`; `plans/main-refactor-assessment-raw.md:54-75`). Every app now has its own entry, target config, CSS graph, and artifact guard; CSS consumed by webOS remains Chromium-79-safe.
7. **`CatalogRepository` is treated as a concrete implementation, not an already-stable interface.** The original said its public interface should remain stable while it is later divided (`plans/main-refractor.md:633-646`). The assessment marks that premise false because `main.ts` directly instantiates a large concrete IndexedDB class (`plans/main-refactor-assessment.md:61-65`; `plans/main-refactor-assessment-raw.md:210-214`). Phase 3 first defines a consumer-driven `CatalogRepositoryPort`; it does not split the repository implementation in parallel with `main.ts`.
8. **Three products use distinct app entries, not one assumed TV/phone view tree.** The original proposed one Android project with TV/phone flavors (`plans/main-refractor.md:58-82`). A shared Gradle project remains an implementation option, but only if it packages distinct TV and phone web entries; the assessment requires separate entries, CSS graphs, target configs, and artifacts consuming the same source (`plans/main-refactor-assessment.md:20-25`; `plans/main-refactor-assessment-raw.md:290-311`). The target shape below names the products separately.
9. **Unknown product and device policy is made blocking rather than filled in by architecture.** The assessment established no minimum Android/WebView version and no requirements for background playback, downloads, casting, PiP, offline behavior, DRM/codec scope, storage durability, or real-device performance (`plans/main-refactor-assessment.md:89-95`). Phase 1 records those decisions before the playback spike; the Unknowns section does not invent answers or thresholds.
10. **The original package taxonomy is provisional, not a directory-creation checklist.** The original predeclared `domain`, `application`, `infrastructure`, `ui`, contract, and platform packages (`plans/main-refractor.md:84-159`). The assessment says the amount of platform-neutral code is not established and rejects the generic shared UI premise (`plans/main-refactor-assessment.md:61-72,89-95`). Phase 3 starts with one engine package and creates adapters only when the import graph and a consuming runtime require them.
11. **There is no numeric line target for `main.ts`.** The original specified approximately 20–100 lines (`plans/main-refractor.md:249-269`). The assessment supports composition-only entries but warns that shrinking this file is not evidence of three correct products (`plans/main-refactor-assessment-raw.md:145-149`). Completion is therefore expressed by dependency boundaries, contracts, and three artifacts rather than a line count.
12. **Generic lint/format/strict-mode work is not a prerequisite phase.** The original bundled those changes into Phase 0 (`plans/main-refractor.md:441-455`). The assessment’s recommended first move is specifically a guard-boundary change with no production movement because new packages otherwise false-green (`plans/main-refactor-assessment.md:79-87`). Target-specific type checking is added with each workspace; unrelated tooling changes should be separate, independently gated work rather than expanding this migration.
13. **Android credential and catalog-storage implementations are selected from requirements and evidence.** The original prescribed Keystore credentials and IndexedDB initially (`plans/main-refractor.md:166-181`). The assessment did not establish Android storage durability, quotas, backup requirements, or the needed credential policy (`plans/main-refactor-assessment.md:89-95`). Phase 1 makes credential policy blocking and Phase 4 decides IndexedDB versus SQLite from a device probe.
14. **Shared source uses `modules/`, not root `packages/`.** The original placed workspace source under `packages/` (`plans/main-refractor.md:84-159`), but this repository already ignores that path and writes `ares-package` output there (`.gitignore:12-15`; `package.json:15`). Using it for source would hide workspace files and collide with release output, so npm package `@nova/engine` lives at `modules/engine`.

## 3. Target package shape and ownership rules

Create this shape only after the Android playback decision in Phase 2:

```text
apps/
  webos/                 # shipping webOS composition root and TV view
  android-tv/            # Capacitor shell and Android TV view
  android-phone/         # created only after the phone decision
modules/
  engine/                # npm package @nova/engine: domain types, use cases, feature controllers, ports
  platform-web/          # browser adapters, only where proven reusable
  playback-webview/      # only if WebView is selected
  playback-media3/       # TypeScript Capacitor adapter, only if Media3 is selected
spikes/
  android-playback/      # isolated Phase 2 proof, deleted or archived after its ADR
```

Do **not** create a generic `ui-shared` package before Phase 6 measures actual view reuse.

### One engine, not one state bag

`modules/engine` must not export `AppState`, `AppContext`, a service locator, or one object containing all mutable feature state. The current mixed globals illustrate the ownership problem: profile/catalog state begins at `src/main.ts:457-477`, playback state at `src/main.ts:478-503`, navigation/search state at `src/main.ts:504-550`, and persistence/artwork/EPG caches at `src/main.ts:596-614`.

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

## 4. Open questions before Android work

Phase 0 guard work may proceed without these product answers, but **Phase 2 and all Android implementation are blocked until Phase 1 records an approved answer to every BLOCKING item in `docs/android/requirements.md`.** “Latest” and “TBD” are not answers.

### BLOCKING

These questions cover the Android facts the assessment could not establish (`plans/main-refactor-assessment.md:89-95`); the current repository has no Android project from which to infer answers (`plans/main-refactor-assessment.md:20-23`).

1. What is the minimum Android API level for TV and phone?
2. What is the minimum Android System WebView/Trichrome major version, and may deployment assume it updates through Play Store? Record policy for devices with pinned OEM WebViews.
3. Which physical devices form the supported matrix? Include each approved minimum-OS/minimum-WebView class and current Android TV and phone classes; record model, SoC, OS, WebView, memory class, and remote/input type.
4. Are **background audio**, **downloads**, **casting**, **picture-in-picture**, and **offline playback/catalog use** required? Answer yes/no separately and define suspend, resume, notification, and process-death behavior for each yes.
5. Which protocols, containers, video/audio codecs, subtitle forms, DRM systems, and live/VOD cases are mandatory beyond HLS, DASH, and MPEG-TS? Supply a legal, non-secret representative media corpus.
6. Must provider endpoints using cleartext HTTP work on Android? Define network-security policy rather than enabling cleartext globally by accident.
7. Where are Android credentials and tokens stored, what must survive reinstall/backup, and is hardware-backed storage required? Credentials must not be embedded in source, tests, fixtures, or app artifacts (`CLAUDE.md:81-84`); define log redaction and backup policy explicitly.
8. What playback behavior is required on app background/foreground, Activity recreation, process death, audio focus loss, HDMI disconnect, and network change?
9. What catalog-sync policy applies on metered, roaming, data-saver, offline, and changing networks, and which cases require explicit user consent? The existing eligibility path is browser-visibility based rather than Android connectivity-policy based (`plans/main-refactor-assessment-raw.md:246`).
10. Is Play Store distribution required for both Android form factors, and are TV-specific review requirements part of the first release?

### NON-BLOCKING for the playback spike, but blocking before production release

- Final package IDs, signing owners, release tracks, branding assets, analytics/crash provider, accessibility acceptance owner, localization list, and support/telemetry retention policy.
- Final phone information architecture and visual design. Phase 6 deliberately measures this rather than assuming TV reuse.

## 5. Ordered phases

## Phase 0 — Make guards workspace- and target-aware (no moves)

**Work**

1. Add `scripts/target-registry.mjs`. It declares each app’s source roots, CSS ownership/consumers, JS target, output artifacts, and artifact policy. It also discovers `apps/*`, `modules/*`, and root workspace declarations and fails if a source root or app is unregistered.
2. Refactor `check-import-cycles.mjs` to collect runtime TypeScript from every registered root and resolve both relative imports and workspace package exports/subpaths. Use TypeScript module resolution instead of extending the current regex. Keep type-only edges out of the runtime graph.
3. Parameterize the CSS scripts. Scan all source CSS consumed by webOS, wherever it lives, plus generated webOS CSS. Apply Chromium 79 only to webOS. Explicitly classify Android-only CSS as non-webOS; unclassified CSS fails closed.
4. Make `scripts/design-contract.test.mjs` resolve the registered webOS stylesheet and manifest rather than literal root paths. Preserve its current TV assertions. Require each later app registration to name its own design-contract policy.
5. Keep `check-webos-bundle.mjs` as the webOS artifact guard and add a registry dispatcher for app-specific guards. Preserve every current webOS check. Define Capacitor artifact and engine-identity policy before an Android app can be registered; do not pretend the webOS media-asset rules apply to Android.
6. Add guard fixtures/tests proving:
   - a cycle through `@nova/*` package imports fails;
   - forbidden webOS CSS under `apps/webos/` and a shared package fails;
   - the same modern feature in Android-only CSS is not rejected as Chromium-79-incompatible, but fails if imported by webOS;
   - unsafe webOS motion and a broken webOS design token fail after a path move;
   - an unregistered app/source/CSS root fails;
   - a missing or wrong target artifact fails.
7. Add `test:guards` for the fixture suite and introduce `build:webos`, while retaining `npm run build` as a webOS-compatible alias during migration.

**Exit criterion**

```text
npm run test:guards
npm test
npm run build:webos
```

All exit 0, including tests that invoke every intentionally failing fixture and assert its nonzero result. The registry covers current roots and fails closed when fixture workspaces or source roots are unregistered. No application source has moved and no production workspace has been created.

**Rollback**

Revert this guard-only phase as one change. Do not create workspaces or move source while it is absent; the pre-phase `npm run build` path remains unchanged.

## Phase 1 — Freeze evidence and approve Android requirements

**Work**

1. Record the last approved webOS release commit and save fresh `npm test`, cycle-check, and guarded-build output in `docs/refactor/baseline.md`; do not label an untested commit shippable.
2. Create `docs/android/requirements.md` with a named owner and explicit answer for every blocking question.
3. Add `scripts/check-android-requirements.mjs` and `npm run verify:android-requirements`; fail on missing fields, `TBD`, an empty device matrix, or absent yes/no feature decisions.
4. Define the legal playback corpus by stable sample ID and checksum. Keep provider credentials outside Git (`CLAUDE.md:81-84`); also require the corpus owner to document that committed samples/checksums contain no private provider URLs or payloads.

**Exit criterion**

```text
npm test
node scripts/check-import-cycles.mjs
npm run build:webos
npm run verify:android-requirements
```

All exit 0, and `docs/refactor/baseline.md` plus owner-approved `docs/android/requirements.md` exist. Phase 2 remains stopped otherwise.

**Rollback**

Revert only the requirements/validator commit. Keep shipping from the recorded approved webOS release while the guard changes remain independently useful.

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
5. Prove lifecycle behavior for background/foreground, Activity recreation, process death/relaunch, audio focus, and the exact required feature decisions from Phase 1. The current web app handles `pagehide` and hidden visibility by cancelling work/tearing down or pausing playback (`src/main.ts:9054-9084`; `plans/main-refactor-assessment-raw.md:266-270`); Android evidence must cover Capacitor/native lifecycle transitions too.
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

Delete/revert `spikes/android-playback/` and its dependencies. It has no import from the shipping webOS entry and no provider credentials. Continue shipping the approved webOS release recorded in Phase 1.

## Phase 3 — Establish the smallest shared engine and a second consumer

The assessment leaves a broad state/view refactor before a second runtime consumes its abstractions explicitly unproven (`plans/main-refactor-assessment.md:66-71`). This phase therefore moves only existing, tested, platform-neutral code and immediately consumes it from both TV builds.

**Work**

1. Add root npm workspaces under `modules/*`, create `modules/engine` with package name `@nova/engine`, add the playback adapter selected in Phase 2, and add an installable `apps/android-tv` canary. Keep `src/main.ts` as the shipping webOS entry. Do not use root `packages/` for source: it is the ignored output of `npm run package:webos` (`.gitignore:12-15`; `package.json:13`).
2. Generate `docs/architecture/package-boundaries.md` from the resolved import graph. Classify existing modules by actual dependencies; DOM, browser storage, media globals, and platform APIs stay outside the engine. The assessment confirms that reusable pure policy/data seams already exist but that there is no application composition boundary yet (`plans/main-refactor-assessment-raw.md:179-191,232-236`).
3. Move only graph-confirmed DOM-free modules already covered by tests—starting with `search.ts`, `content-rating.ts`, `playback-fallback.ts`, `player-transport.ts`, `track-selection.ts`, and `series-presentation.ts`—into `modules/engine`. Do not introduce feature state owners or a generic `Platform`/`AppContext` in this phase.
4. Make the Android-TV canary import at least playback planning and track policy from `@nova/engine`, compose the Phase 2 backend, and play the approved non-secret sample. It must not copy an engine module or import the webOS bundle.
5. Give `modules/engine` a DOM-free TypeScript config. Add executable boundary checks for the dependency direction in Section 3, direct `XtreamClient` bypasses, app-to-app imports, and duplicate engine implementations.
6. Add `verify:single-engine`: resolve each app’s workspace dependency, hash the exact engine source inputs recorded by each build, and fail if the app omits the package, vendors a second implementation, or records a different hash.
7. Move one module per green commit, with its tests and any owning source contract changed atomically. Never maintain a copied Android implementation beside the webOS implementation.

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
npm run test:android-tv-canary
npm run build:android-tv-canary
npm run verify:boundaries
npm run verify:single-engine
npm test
npm run build:webos
```

All exit 0. `docs/architecture/package-boundaries.md` exists; both webOS and the Android-TV canary resolve `@nova/engine`; the canary artifact and webOS build-info record the same engine-source hash; no app-local engine fork exists; and every moved contract has equivalent coverage at its new boundary without a skip or weakened assertion.

**Rollback**

Revert module moves in reverse order, then remove the canary, selected adapter, and now-unused workspace declarations. Because `src/main.ts` remains the shipping entry and each move ends green, the preceding webOS commit is buildable without an Android SDK.

## Phase 4 — Build the Android TV vertical product slice

**Work**

1. Expand the `apps/android-tv` canary into the product slice with its own entry, Vite/TypeScript/CSS policy, Capacitor project, and target-owned design/artifact guards. Compose the engine with the backend selected in Phase 2.
2. Build vertical increments in this order: local profile/credential flow; catalog sync and browse/search; details/guide; playback with track selection and cancel/channel switch; favorite/resume persistence; required lifecycle and connectivity behavior. Each increment adds only the feature owner and narrow ports it consumes, updates its raw-source contract atomically, and leaves both webOS and Android TV green.
3. Before moving catalog coordination, define a consumer-driven `CatalogRepositoryPort` over the operations used by that increment. Do not treat `IndexedDbCatalogRepository` as an existing interface or split its internals during this refactor; the assessment identifies it as a concrete class instantiated directly from `main.ts` (`plans/main-refactor-assessment.md:61-65`; `plans/main-refactor-assessment-raw.md:210-214`).
4. Preserve `ProviderBroker` as the provider choke point and adapt transport at composition. Keep D-pad focus, TV density, overlays, remote Back handling, and Android lifecycle in the Android-TV app/view layer; the assessment identifies shell/focus/input/Back as TV-specific (`plans/main-refactor-assessment.md:35-37`; `plans/main-refactor-assessment-raw.md:232-264`).
5. Implement the approved metered/roaming/data-saver/offline sync policy behind a narrow connectivity policy port. Do not copy the existing browser visibility check as Android network policy (`plans/main-refactor-assessment-raw.md:246`).
6. Run an Android persistence probe against the approved catalog corpus. Decision alternatives are **Web IndexedDB adapter** and **native SQLite adapter**. Select IndexedDB only if force-stop/relaunch, upgrade, quota, and interrupted-write recovery meet the approved requirements; otherwise prove SQLite behind the same `CatalogRepositoryPort`. Record STOP if neither passes.
7. Add app contract tests with fake engine ports and run the approved product/playback matrix on physical Android devices using device-local credentials only.
8. For each feature increment, run the affected sections of `TV_UX_REGRESSION_CHECKLIST.md` on the physical LG target; run the full checklist before Phase 4 exits and record commit/device/results in `docs/refactor/webos-phase4-device-report.md`. Host tests cannot establish physical focus, Back, playback, or rendering behavior (`plans/main-refactor-assessment-raw.md:361-370,422-425`).

**Exit criterion**

```text
npm test
npm run test:android-tv
npm run build:android-tv
npm run verify:android-tv-report
npm run verify:boundaries
npm run verify:single-engine
npm run build:webos
```

All exit 0. `docs/android/android-tv-slice-results.json` records every approved Android device and end-to-end row; `docs/refactor/webos-phase4-device-report.md` records a passing full physical-LG checklist for the exit commit; and the Android-TV artifact’s build info names the selected backend and the same engine-source hash as webOS. Each moved source contract has equivalent coverage at its new owner.

**Rollback**

Revert vertical increments in reverse order until `apps/android-tv` is the green Phase 3 canary; remove only adapters added by the reverted increments. If Android TV is abandoned, remove the canary and registry entry as Phase 3 describes. `build:webos` remains independent of the Android SDK and the approved webOS release remains available.

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

- **Proceed — distinct phone presentation:** build phone-owned routes, forms, navigation, styles, and player controls; import only individual view modules the experiment proves reusable alongside the engine/view-model contracts.
- **Defer/stop phone:** preserve webOS and Android TV, remove the experiment, and state plainly that the three-app goal has not been achieved. Do not count Phase 8 as complete for the original goal.

A single responsive TV/phone view tree is not an alternative: the assessment marks that shared-UI premise false based on the current TV shell, focus, forms, Back, and player behavior (`plans/main-refactor-assessment.md:35-37,61-65`; `plans/main-refactor-assessment-raw.md:232-264`). The decision owner considers product need, accessibility/usability evidence, and maintenance cost; there is no invented sharing threshold.

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

1. Add root CI commands that install once, test engine and adapters, run every registered shared and target-owned cycle/CSS/motion/design/artifact guard, build all apps, and validate device-report schemas separately from host automation.
2. Generate one artifact manifest containing commit, engine-source hash, target policy, playback backend, and output checksums for webOS TV, Android TV, and Android phone.
3. Make `verify:single-engine` compare all three build-info records and fail if an app omits `@nova/engine`, imports another app, contains a legacy engine implementation, or records a different engine-source hash.
4. Add a release-blocking scan for credentials and tokens in generated IPK/APK/AAB/WebView assets and captured logs. This extends the repository’s no-embedded-credentials rule (`CLAUDE.md:81-84`) to the Android artifacts and log surface identified by the assessment (`plans/main-refactor-assessment-raw.md:438-443`). Define any private-URL/catalog-payload signatures from the approved data policy rather than guessing them.
5. Keep release jobs independent: failure or rollback of one Android app must not prevent rebuilding the last approved webOS release.

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

## 6. Decision register

| Decision | Must be made by | Alternatives | Stop condition |
|---|---|---|---|
| Android requirements/device floor | Phase 1 | explicit supported versions/features | any blocking field unanswered |
| Playback backend | Phase 2 | WebView / Media3 / justified hybrid / STOP | no backend passes every mandatory row |
| Android catalog storage | Phase 4 | Web IndexedDB / native SQLite | neither survives required lifecycle/data corpus |
| Whether the distinct phone app proceeds | Phase 6 | distinct phone presentation / defer-stop | no acceptable touch/accessibility result or no product commitment |
| Three-app release | Phase 8 | release all / do not claim completion | missing app, report, artifact, or common engine hash |

## 7. Unknowns and how to resolve them

The assessment explicitly reports that none of the following was established (`plans/main-refactor-assessment.md:89-95`):

- **Android playback compatibility is unknown.** Resolve with the Phase 2 protocol/codec/track/lifecycle matrix on approved physical devices. Do not extrapolate from desktop Chrome or webOS.
- **Whether WebView or Media3 is the lower-risk backend is unknown.** Compare identical evidence; do not estimate before the spike.
- **View-layer reuse between TV and phone is unknown.** Resolve with the Phase 6 module-graph/line classification and usability experiment. No sharing percentage is asserted as an outcome.
- **How much current code is platform-neutral is unknown until import boundaries are generated.** Resolve with the Phase 3 dependency report; DOM, IndexedDB, and webOS dependencies determine adapter placement.
- **Android storage capacity, interruption behavior, and WebView persistence are unknown.** Resolve with the Phase 4 corpus, quota, force-stop, upgrade, and interrupted-write probe; select IndexedDB or SQLite from results.
- **Performance acceptance numbers are unspecified.** Capture startup, switch, seek, memory, thermal, battery, and lifecycle observations in spike/product reports, then require product/device owners to approve measured thresholds. This plan invents none.
- **Background audio, downloads, casting, PiP, offline use, DRM, and codec scope are unknown until Phase 1.** Their answers may change playback, storage, network, and native-service design.
- **Provider behavior over Android cleartext/CORS/network policy is unknown.** Resolve against the approved provider test cases during the spike or the first product slice; the absence of an Android project means this has not been tested (`plans/main-refactor-assessment-raw.md:265-286,317-322`).
- **Physical LG behavior after source movement is unknown.** Host tests do not prove D-pad, focus restoration, Back delivery, or playback on the TV; retain the existing physical-device checklist as a release artifact (`plans/main-refactor-assessment-raw.md:361-370,422-425`).
- **Effort and release dates are unknown.** Estimate only after Phase 2 selects a backend and Phase 3 produces the dependency graph; phase count is not an estimate.
