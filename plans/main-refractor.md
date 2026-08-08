# Repository assessment

The repository has a strong technical foundation, but it is currently a **single-platform webOS application**, not yet a multi-platform product codebase.

Positive foundations already present:

- TypeScript domain types and many extracted/tested pure modules.
- Provider access is behind `ProviderBroker` and `ProviderTransport`.
- Playback planning is partly separated into `playback-fallback.ts`, `player-transport.ts`, and media engine adapters.
- A substantial local-first library engine exists under `src/library/`.
- Import-cycle, webOS compatibility, CSS baseline, motion, and design-contract guards are unusually good.
- The application already has responsive CSS breakpoints and some touch behavior.
- There is extensive regression coverage.

Current architectural constraints:

- `src/main.ts` is **9,397 lines** and owns nearly every application concern.
- It contains a very large set of mutable module-level variables.
- Rendering, state transitions, DOM updates, provider calls, navigation, playback, persistence, webOS integration, and diagnostics are coupled.
- Browser globals (`window`, `document`, `history`, `navigator`) are accessed directly throughout application logic.
- `storage.ts` directly owns `localStorage`; the catalog repository directly owns IndexedDB.
- The Vite build emits one webOS-specific ES2015 IIFE.
- There is no Android project or Android packaging pipeline.
- More than 100 contract-test assertions inspect the source text of `main.ts`. These tests protect important behavior, but they make safe extraction harder because moving a function can fail tests even when behavior remains correct.
- `tsconfig.json` has useful checks, but does not currently enable full `strict` mode.
- Credentials are stored in `localStorage`. That may be the practical webOS boundary, but Android should use Keystore-backed secure storage.

So yes: **`main.ts` should be broken down**, but not with one large rewrite.

---

# Recommended cross-platform strategy

## Use the existing TypeScript/web engine as the shared product engine

Do not rewrite this in Flutter, React Native, or three native applications. Those approaches would discard the existing webOS work and make propagation harder.

The best fit is:

- **webOS:** existing packaged HTML/CSS/TypeScript app.
- **Android TV:** shared web application hosted in a Capacitor Android shell, with TV-specific manifest/input/layout configuration.
- **Android phone:** the same Capacitor Android project with a phone product flavor.
- **Native Android adapters where necessary:** Media3/ExoPlayer playback, secure credentials, network transport, lifecycle, wake lock, and external intents.

This can share approximately:

- 90–95% of domain and application logic;
- 80–90% of catalog, metadata, sync, and state logic;
- 70–85% of UI components;
- less of playback and platform integration.

Trying to share 100% would produce a poor phone UI and unreliable playback. The correct goal is **one engine and shared feature code, with thin platform and form-factor adapters**.

## Three generated products

```text
Shared TypeScript engine and UI packages
                 |
        +--------+---------+
        |                  |
    webOS build       Android shell
    ES2015/IIFE       Capacitor + Kotlin
        |                  |
      IPK          +-------+-------+
                   |               |
              Android TV      Android phone
              APK/AAB         APK/AAB
```

The Android project can use Gradle product flavors:

- `tv`
- `phone`

That gives separate manifests, launcher behavior, orientation, capabilities, icons, versioning, and store artifacts while retaining one Android codebase.

## What “automatically propagates” means

Shared code must be imported as workspace packages. It must never be copied between applications.

A change to `packages/core`, `packages/application`, or `packages/ui` is consumed by all platform entry points. CI then builds and tests all three products.

App-store releases will still be required. Source propagation can be automatic; production deployment cannot safely bypass webOS packaging or Google Play release processes.

---

# Target enterprise repository structure

I recommend evolving this repository into an npm-workspaces monorepo:

```text
apps/
  player-web/
    src/
      main.ts
      bootstrap.ts
    vite.config.ts
    index.html

  webos/
    public/
      appinfo.json
      icons/
    vite.config.ts
    package scripts

  android/
    capacitor.config.ts
    android/
      app/
        src/
          main/
          tv/
          phone/

packages/
  domain/
    src/
      catalog/
      playback/
      profiles/
      search/
      epg/
      metadata/
      shared/

  application/
    src/
      state/
      actions/
      controllers/
      use-cases/
      services/

  infrastructure/
    src/
      provider/
      catalog/
      metadata/
      persistence/
      sync/

  ui/
    src/
      components/
      views/
      view-models/
      navigation/
      artwork/
      styles/

  platform-contracts/
    src/
      platform.ts
      playback.ts
      storage.ts
      input.ts
      lifecycle.ts
      dialogs.ts

  platform-webos/
    src/
      webos-platform.ts
      html-media-player.ts
      web-storage.ts
      remote-input.ts

  platform-android/
    src/
      capacitor-platform.ts
      media3-player.ts
      secure-storage.ts
      android-input.ts

metadata-proxy/
scripts/
docs/
```

This can be introduced gradually. It is not necessary to move the entire repository before extracting `main.ts`.

---

# Required platform contracts

Application code should not directly call browser or webOS APIs. It should depend on ports such as:

```ts
interface Platform {
  capabilities: PlatformCapabilities
  credentials: CredentialStore
  preferences: PreferencesStore
  providerTransport: ProviderTransport
  playback: PlaybackPort
  input: InputPort
  lifecycle: LifecyclePort
  navigation: NavigationPort
  dialogs: DialogPort
  wakeLock: WakeLockPort
  externalLinks: ExternalLinkPort
}
```

Important implementations:

| Contract | webOS | Android |
|---|---|---|
| Playback | HTML video + HLS/DASH/MPEG-TS engines | Prefer native Media3/ExoPlayer plugin |
| Credentials | Existing guarded local storage initially | Android Keystore-backed storage |
| Catalog | IndexedDB | IndexedDB initially; native persistence only if evidence requires it |
| Provider network | Browser fetch | Native Capacitor transport if CORS/cleartext/provider behavior requires it |
| Input | LG remote/browser keys | TV D-pad/media keys or touch |
| Back navigation | webOS history/key behavior | Android back dispatcher |
| Wake lock | browser/webOS keepAlive | Android wake lock/keep-screen-on |
| External links | `window.open` | Android intent |
| Dialogs | temporary browser implementation | native or shared modal implementation |

`ProviderTransport` is already a useful seam and should be retained and expanded rather than replaced.

---

# TV and phone UI policy

Do not force one identical layout onto all devices.

Use shared:

- design tokens;
- cards and metadata components;
- view models;
- actions and state;
- catalog/detail/search logic;
- accessibility labels;
- playback control concepts.

Use form-factor variants:

```ts
type FormFactor = 'tv' | 'phone'
type InputMode = 'remote' | 'touch' | 'keyboard'
```

TV requirements:

- spatial focus;
- large focus targets;
- 10-foot typography;
- remote shortcuts;
- overscan-safe layout;
- no dependence on hover/touch gestures.

Phone requirements:

- touch scrolling;
- bottom or compact navigation;
- portrait and landscape player layouts;
- touch scrubber and sheets;
- Android system back;
- no visible TV help bar or focus ring during normal touch use.

Android TV and webOS can share most TV presentation, but platform-specific input/back/playback remains behind adapters.

---

# How to break down `main.ts`

## Desired final responsibility

The final `main.ts` should be approximately 20–100 lines:

```ts
import { createApplication } from '@nova/application'
import { createWebOsPlatform } from '@nova/platform-webos'
import { mountApplication } from '@nova/ui'

const platform = createWebOsPlatform()
const application = createApplication({ platform })

mountApplication({
  root: document.querySelector('#app'),
  application,
})

application.start()
```

It should only:

1. identify the platform;
2. create adapters;
3. compose the application;
4. mount it;
5. start lifecycle handling.

## Proposed decomposition of current responsibilities

### `application/state/`

Move the module-level mutable values into typed state slices:

```text
app-state.ts
profile-state.ts
catalog-state.ts
guide-state.ts
search-state.ts
details-state.ts
player-state.ts
navigation-state.ts
sync-state.ts
```

Avoid exposing writable globals. State changes should occur through explicit actions or controller methods.

A small typed store is sufficient; Redux is not required. The important properties are:

- deterministic transitions;
- subscriptions;
- explicit effects;
- testability without DOM;
- no direct cross-feature variable mutation.

### `application/controllers/`

```text
app-controller.ts
profile-controller.ts
catalog-controller.ts
details-controller.ts
guide-controller.ts
search-controller.ts
playback-controller.ts
library-sync-controller.ts
```

Controllers coordinate repositories and state. They must not render HTML.

### `ui/views/`

```text
login-view.ts
home-view.ts
catalog-view.ts
details-view.ts
person-view.ts
guide-view.ts
search-view.ts
settings-view.ts
player-view.ts
```

Each view should consume a view model and return/render UI. It should not fetch provider data or mutate unrelated feature state.

### `ui/components/`

Extract reusable renderers currently embedded in `main.ts`:

```text
icons.ts
stream-card.ts
category-card.ts
episode-card.ts
person-card.ts
metadata.ts
content-guidance.ts
pager.ts
sync-indicator.ts
toast.ts
dialogs.ts
```

### `ui/navigation/`

```text
spatial-navigation-controller.ts
focus-manager.ts
history-router.ts
remote-key-router.ts
numeric-channel-input.ts
navigation-zones.ts
```

The existing pure `navigation.ts`, `frame-navigation.ts`, `remote-input.ts`, and `focus-scroll.ts` become dependencies of these controllers.

### `ui/artwork/`

```text
artwork-presenter.ts
deferred-image-loader.ts
artwork-resolution-controller.ts
image-fallback.ts
```

The existing pure artwork modules remain reusable.

### `playback/`

```text
playback-session.ts
html-media-adapter.ts
playback-attempt-runner.ts
player-controls.ts
track-controller.ts
resume-controller.ts
live-channel-controller.ts
```

`renderPlayer()` is currently a major subsystem with nested transport functions. It should become a `PlaybackSession` with dependencies injected explicitly.

### `platform/`

```text
runtime.ts
browser-history.ts
browser-lifecycle.ts
webos-launch-params.ts
webos-keep-alive.ts
browser-dialogs.ts
```

Code such as `isWebOsRuntime()`, launch-parameter provisioning, `window.confirm`, `window.prompt`, and webOS keep-alive belongs here.

### `diagnostics/`

The large development probe object near the end of `main.ts` should move to:

```text
diagnostics/install-library-probes.ts
diagnostics/video-sizing-probe.ts
diagnostics/sync-probe.ts
```

Production composition should not import probe implementations unless the feature is enabled.

---

# Safe extraction order

A big-bang split would be risky because of global state, DOM coupling, webOS behavior, and source-inspection tests. Use a strangler migration.

## Phase 0 — Architecture safety net

- Add an architecture decision record for the shared web engine + Capacitor strategy.
- Record current test/build/device baselines.
- Add `typecheck`, `lint`, and formatting scripts.
- Move toward TypeScript `strict` in staged increments.
- Add dependency-boundary rules:
  - domain cannot import DOM/platform/infrastructure;
  - application cannot import concrete platform adapters;
  - UI cannot call provider clients directly;
  - platform packages cannot import feature views.
- Keep the existing import-cycle guard.
- Convert source-text tests to behavioral/unit contracts where practical. Tests may inspect the owning extracted module temporarily, but should not require every implementation to remain in `main.ts`.

## Phase 1 — Extract platform utilities and pure presenters

Lowest-risk moves:

- webOS runtime detection and launch parameters;
- formatting, escaping, title normalization;
- icon renderer;
- stream display helpers;
- sorting;
- history wrapper;
- wake-lock/platform capability wrapper.

This immediately establishes platform seams without changing feature behavior.

## Phase 2 — Introduce `AppState` and composition context

Replace free global variables with:

```ts
interface AppContext {
  state: AppState
  services: ApplicationServices
  platform: Platform
}
```

Initially, existing functions may receive `context`. Later they move into feature controllers.

Do not put every concern into one permanent “god context”; use it only as the migration bridge.

## Phase 3 — Extract views one at a time

Recommended order:

1. Login
2. Settings
3. Home
4. Catalog
5. Details/person
6. Guide
7. Search
8. Player last

For each view:

- define a view model;
- move template generation;
- move event intent to typed actions;
- add focused unit tests;
- keep browser/device regression checks;
- remove that view’s dependencies on global variables.

## Phase 4 — Extract controllers and side effects

Move provider/library/search/EPG/sync coordination from event handlers into controllers. `handleAction()` should shrink into action routing and eventually disappear in favor of feature-owned handlers.

## Phase 5 — Extract playback as a subsystem

Do this only after state and platform contracts are established.

Playback needs:

- a `PlaybackPort`;
- an HTML implementation for webOS/browser;
- a Media3 implementation for Android where required;
- common playback attempt planning;
- common resume/live-channel policy;
- platform-specific media evidence and track APIs.

Preserve the existing title/source binding and fallback contract tests.

## Phase 6 — Extract input and navigation

Separate normalized intents from physical events:

```ts
type InputIntent =
  | { type: 'move'; direction: NavigationDirection }
  | { type: 'select' }
  | { type: 'back' }
  | { type: 'channel'; offset: number }
  | { type: 'digit'; value: number }
  | { type: 'color'; color: RemoteColor }
```

webOS, Android TV, keyboard, and phone touch controls then produce the same application intents.

## Phase 7 — Add Android packaging

- Add Capacitor.
- Add Android shell.
- Create `tv` and `phone` product flavors.
- Add Android platform adapters.
- Add Media3 plugin if WebView playback evidence is insufficient.
- Add Keystore-backed credentials.
- Add TV launcher/banner/leanback manifest.
- Add phone orientation and touch layouts.
- Test provider HTTP/HTTPS, cleartext policy, CORS, HLS, DASH, MPEG-TS, subtitles, and audio tracks on physical devices.

## Phase 8 — CI and release automation

Every pull request should run:

```text
format check
lint
strict typecheck
unit tests
architecture/import-cycle checks
webOS Chromium compatibility guards
webOS production build
Android TV build
Android phone build
browser/phone/TV-input smoke tests
dependency/security audit
```

Release workflows should produce:

- signed webOS IPK;
- Android TV APK/AAB;
- Android phone APK/AAB;
- checksums, version metadata, and release notes.

Use one version source and derive `appinfo.json`, Android `versionName/versionCode`, and build metadata from it.

---

# Enterprise improvements beyond file structure

## Engineering governance

- Add ADRs under `docs/architecture/`.
- Define package ownership and public APIs.
- Ban cross-package deep imports.
- Add pull-request templates and release checklists.
- Use a dependency update policy.
- Keep generated Android/webOS artifacts out of Git.
- Add a sanitized configuration schema and startup validation.

## Testing pyramid

- Domain: fast pure unit tests.
- Application: controller/store tests with fake ports.
- Infrastructure: IndexedDB/provider/metadata contract tests.
- UI: view-model and component tests.
- End-to-end:
  - TV keyboard/D-pad tests;
  - mobile viewport/touch tests;
  - playback adapter contract tests;
  - physical-device release checklist.

The existing contract tests are valuable, but source-regex tests should gradually become behavior contracts. Source-layout assertions create false coupling during refactors.

## Security

- Android credentials in Keystore, not WebView local storage.
- Keep provider URLs and credentials out of logs and crash reports.
- Add Content Security Policy suitable for packaged apps.
- Make Android cleartext traffic an explicit, documented compatibility policy.
- Validate platform-bridge messages.
- Redact playback/provider URLs from diagnostics.
- Keep metadata proxy secrets server-side as currently designed.

## Observability

Add a platform-neutral telemetry interface with:

- sanitized structured events;
- feature and platform version;
- playback engine/failure category without URLs;
- sync health;
- storage health;
- crash reporting opt-in and privacy controls.

---

# Important caution about the library engine

`src/library/catalog-repository.ts` is also approximately 4,900 lines. It will likely become the next decomposition target, but do not refactor it simultaneously with `main.ts`. Finish application/platform boundaries first, then split the repository internally by:

- schema/open/upgrade;
- catalog reads;
- publication/writes;
- details/EPG caches;
- search indexes;
- recovery/maintenance;
- storage budget.

Its public repository interface should remain stable while its implementation is divided.

---

# Recommended first implementation increment

The first code change should not add Android immediately. It should establish the architecture that Android will consume:

1. Add an ADR and target package boundaries.
2. Introduce `PlatformCapabilities` and a `Platform` composition interface.
3. Extract webOS runtime, launch parameters, lifecycle, dialogs, wake lock, and history.
4. Introduce typed `AppState`.
5. Extract Login and Settings as the first vertical slices.
6. Update their tests from `main.ts` source ownership to module/behavior ownership.
7. Keep all webOS tests, build guards, and physical behavior passing.
8. Only then scaffold Capacitor and Android flavors.

This provides meaningful risk reduction without destabilizing playback or the local-first library.

If you want this architecture implemented, toggle to Act mode. The implementation should begin with the ADR, package-boundary skeleton, platform contracts, and the first safe `main.ts` extraction rather than attempting the entire migration in one change.