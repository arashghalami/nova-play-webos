# Nova Play multi-platform — execution plan v3

**Status:** active. Supersedes `plans/main-refactor-v2.md` (not approved, banner
at its head). Authority: `plans/council-2026-08-09-main-refactor-v2.md`.

**Goal.** Put a working Nova Play phone app in the hands of Android users while
webOS keeps shipping uninterrupted. Not "three apps on a shared engine" — that
is a possible consequence of this plan, never its objective.

A failed decision gate stops later phases. Nothing here is started before its
predecessor's exit criterion is met.

---

## 1. Standing constraints

These are facts about the team, not preferences, and every phase below is sized
against them.

| Constraint | Value |
|---|---|
| Engineers | 2 |
| Total capacity | 40 hrs/week combined |
| Reserved for webOS support + release | 8–12 hrs/week (**not** available to Android) |
| Available for Android | 28–32 hrs/week |
| Physical Android devices owned | 1 TV box, 1 phone |
| CI hardware | none |
| Staging population | none — webOS users are production |
| Appetite | incremental over months; no big-bang, no long dark period |

The phone app is a business requirement. Android TV is not, yet.

**Verified baseline, 2026-08-09:** `npm test` → 48 files / 442 tests passed,
9.20s. `src/main.ts` 9,397 lines. `src/style.css` 86,172 bytes. Build is
`tsc && check-import-cycles && vite build && check-webos-bundle &&
check-css-baseline && check-css-motion && build:library-probe-worker`
(`package.json:8`).

---

## 2. What changed from v2, and why

v2 is a disciplined plan that made architecture the critical path to a required
product. The reordering:

1. **The playback spike runs first, not fifth.** v2's Phase 2 becomes this
   plan's Phase 2, with nothing ahead of it but a four-hour requirements pass.
   The spike lives in `spikes/`, imports nothing from the shipping app, and its
   own rollback cannot damage webOS — so nothing needs to protect it.
2. **Guard work is deferred and earned, not preemptive.** v2's Phase 0 built a
   target registry, a TypeScript-resolution cycle checker, parameterized CSS
   scanners and six failing fixtures before any product existed. Those guards
   protect *source movement*. Until source moves, they protect nothing. See §5.
3. **Phone before Android TV.** v2 built a full Android TV vertical slice
   (Phase 4) before the required phone (Phase 7). Reversed. Android TV is now
   out of scope entirely until the phone ships to real users.
4. **v2's Phase 5 is deleted.** Moving the shipping webOS app into `apps/webos`
   delivers no capability and destabilizes the only product with users.
5. **v2's Phase 6 is deleted.** It gated the phone's existence behind a
   measurement that was permitted to conclude "Defer/stop phone." The phone is
   required; a gate that can cancel it is incoherent. The *measurement* still
   happens — as Phase 3 build evidence, informing what gets shared, not whether
   the product exists.
6. **Device support becomes an explicit Phase 1 decision.** v2 demanded a
   supported-device matrix across OS/WebView classes while the team owns two
   devices. That is unsatisfiable; §3 forces a named, honest choice instead.
7. **The shared engine is earned by duplication, not assumed.** No
   `modules/engine`, no `@nova/engine`, no `verify:single-engine`, no ports or
   adapters until the same logic is being fixed twice in two shipping products.

**What survives from v2 unchanged and is lifted below:** the per-target
compatibility policy (§4), the false-green guard analysis (§5), the blocking
Android questions (Phase 1), the playback/track/lifecycle evidence matrix
(Phase 2), the feature-owned state table and atomic contract-migration table
(§7, for whenever extraction happens).

---

## 3. The device-support decision — make it in Phase 1, not later

Two devices establish feasibility **on those two devices**. They do not
establish Android compatibility. Android codec stacks, OEM System WebViews,
memory classes and lifecycle behavior vary materially between handsets.

Choose exactly one and record it in `docs/android/device-policy.md`:

- **Named-device support.** Ship supporting only the tested phone model, API
  level and WebView major version. State it in the install instructions. Honest,
  free, and severely limits reach.
- **Controlled beta.** Recruit an estimated 8–12 testers spanning **at least
  three** OEM / API level / WebView classes. Ship to them only, with sanitized
  crash, lifecycle, playback-backend, protocol, OS and WebView telemetry, and a
  rollback path. Costs recruitment and a telemetry surface; earns a defensible
  support claim.
- **Fund a device set.** Buy a minimum representative set. Costs money, saves
  calendar.

**There is no fourth option.** A one-row "supported matrix" presented as Android
support is fiction, and every schedule built on it is fiction too. If none of
the three is achievable, this plan's reach claim must be reduced to option one
before Phase 3 begins.

---

## 4. Per-target compatibility policy

Lifted from v2 §1. The webOS column is current shipping reality; the phone
column takes effect when Phase 3 starts.

| Target | JS build target | CSS policy | Artifact policy |
|---|---|---|---|
| webOS TV | ES2015 + banned-global scan | Chromium 79 baseline and the motion guard on every stylesheet in its dependency closure and generated CSS | existing IIFE / media-asset / probe checks |
| Android phone | derived from the WebView floor approved in Phase 1; **never implicitly 79** | phone CSS is not scanned against Chromium 79. Any CSS actually shared with webOS must satisfy webOS policy. Do not start from the TV stylesheet. | Capacitor web assets + native project + selected playback backend |

**Chromium 79 is a floor, not a ceiling.** The existing `webos-app/` output runs
unmodified on any modern Android System WebView — which is why Phase 2 needs no
build changes at all. Verified: `isWebOsRuntime()` (`src/main.ts:350`) is a pure
feature detector; all 34 webOS references in `main.ts` are ternary branches on
that boolean or optional-chained no-ops (`system?.keepAlive?.(true)`,
`src/main.ts:8599`, `:8617`); launch params early-return when absent
(`:403–407`). The app already runs in a plain desktop browser via `npm run dev`,
which is the same environment as a bare Capacitor WebView.

---

## 5. Guard policy — deferred, and earned

The four build guards go false-green on anything outside their hardcoded paths.
This analysis is v2's and it is correct:

| Guard | Scope | Blind to |
|---|---|---|
| `check-import-cycles.mjs` | `sourceRoot` fixed to `src`; relative specifiers only | any workspace package name |
| `check-css-baseline.mjs` | `src/style.css` + generated `webos-app/style.css` | CSS at any other path |
| `check-css-motion.mjs` | same two paths | same |
| `check-webos-bundle.mjs` | `webos-app/`, `app.js`, `index.html`, `build-info.json` | any non-webOS artifact |
| `design-contract.test.mjs` | literal `src/style.css` + `public/appinfo.json` | a moved stylesheet |

**The rule for this plan:** guards are extended **in the same commit as the
first code movement they need to police** — never preemptively, never as a
phase of their own.

Until then two things hold, and both go in writing at the top of any spike or
app directory:

1. Nothing outside `src/` and `webos-app/` is policed. It passes because nothing
   looks at it.
2. A green `npm run build` is evidence about webOS only. Never cite it as
   coverage of phone code.

Phase 3 adds exactly one guard when the phone app gets its own stylesheet: keep
phone CSS out of the webOS closure. Nothing more until something else moves.

---

## 6. Phases

### Phase 1 — Pin the requirements the spike actually needs

**Estimated 4 hours.** Deliberately not v2's full ten-question gate: answer only
what the phone playback spike cannot proceed without. The rest stay open and
become blocking before Phase 4.

**Work**

1. Tag the current approved webOS release commit. Record the tag, the `npm test`
   result and the guarded-build result in `docs/refactor/baseline.md`. Do not
   label an untested commit shippable.
2. Create `docs/android/requirements.md` answering, with a named owner:
   - **minimum Android API level and minimum System WebView major version** for
     the phone, and whether deployment may assume Play-Store WebView updates;
   - **mandatory protocols, containers, video/audio codecs and subtitle forms**
     beyond HLS, DASH and MPEG-TS; whether any DRM is in scope;
   - **must cleartext-HTTP provider endpoints work**, and the resulting network
     security policy — not a global cleartext enable;
   - **background audio, PiP, downloads, casting, offline** — yes/no each, and
     for each yes, the required suspend/resume/notification/process-death
     behavior;
   - **required playback behavior** on background/foreground, Activity
     recreation, process death, audio focus loss and network change.
3. Record the §3 device-support decision in `docs/android/device-policy.md`.
4. Define the legal playback corpus by stable sample ID and checksum. No private
   provider URLs or payloads in the committed corpus, per `CLAUDE.md`.

Deferred to Phase 4, not answered now: credential storage policy, catalog
storage durability, Play distribution, package IDs, signing, branding,
analytics, localization, accessibility acceptance owner.

**Exit criterion.** `docs/refactor/baseline.md`, `docs/android/requirements.md`
and `docs/android/device-policy.md` exist, owner-approved, with no field reading
`TBD` or `latest`. `npm test` and `npm run build` still exit 0.

**Rollback.** Documents only. Revert the commit.

---

### Phase 2 — Prove phone playback. The gate everything else waits on

**Estimated 20–28 hours**, plus 24–32 more if alternative B is needed. This is a
disposable spike, not the phone app and not an extraction.

**Work**

1. Create `spikes/android-phone-playback/`: the smallest Capacitor shell that
   loads **today's `webos-app/` output unmodified**. No build changes, no
   refactor, no catalog or provider implementation beyond what is needed to
   reach a stream.
2. **Alternative A — WebView playback** first, using the engine families already
   vendored: Hls.js, Dash.js, mpegts.js and native video. Install on the
   physical phone. An emulator does not count.
3. For every mandatory corpus row, record:
   - manifest/container and codec identification;
   - first decoded video frame and audible audio;
   - seek / pause / resume where applicable;
   - enumerated audio and subtitle tracks, successful selection, and
     *observable* audio or subtitle change — validated at the backend, not by UI
     label. The current implementation has separate HLS-rendition and native
     `AudioTrackList` paths (`src/main.ts:7284`, `cycleAudioTrack`), so both
     enumeration and actual switching are required evidence;
   - live continuity where applicable;
   - errors and backend events, with credentials and private URLs redacted.
4. **Prove cancellation.** Start stream A, cancel during manifest load, then
   again mid-playback; assert no stale callback, state or audio from A; then
   start B successfully. The browser player already requires explicit teardown
   for HLS, mpegts and DASH and removes the media source during cleanup
   (`cleanupActiveTransport`, `src/main.ts:3691`). The spike must *demonstrate*
   equivalent behavior on Android, not assume it.
5. **Prove lifecycle**: background/foreground, Activity recreation, process
   death and relaunch, audio focus loss, network change, plus every feature
   answered yes in Phase 1. The web app currently handles `pagehide` by
   disabling tracing, cancelling spatial navigation, tearing down the deferred
   image observer and cancelling catalog sync (`src/main.ts:9054`); Capacitor
   and native lifecycle transitions are not the same events and must be covered
   on their own terms.
6. **Prove provider reach**: cleartext/CORS behavior against the approved
   provider test cases. Device-local credentials only.
7. If A fails the decision rule, implement **alternative B — Media3** behind a
   minimal Capacitor plugin in the same spike and rerun the identical matrix.
   Do not begin any extraction while choosing.
8. Save sanitized results in `docs/android/playback-spike-results.json` and the
   decision in `docs/adr/android-playback-backend.md`.

**Decision point**

- **WebView** only if every mandatory row passes on the phone, required tracks
  are controllable, cancellation leaves no stale playback or events, and all
  required lifecycle behavior is demonstrable.
- Any mandatory format/codec/track/lifecycle failure, inaccessible required
  tracks, non-deterministic teardown, or a required native-service feature the
  WebView design cannot provide **forces the Media3 proof**. Do not waive a row
  to preserve a preferred architecture.
- **Media3** only if its rerun passes the same matrix.
- **Neither passes → STOP.** Record "unsupported Android requirements." Do not
  reorganize the shipping app around either assumption. Change the requirements
  or stop the Android initiative.
- A per-format hybrid is a third alternative only if the ADR demonstrates why
  one backend cannot meet the matrix, and accepts the extra cancellation, track,
  lifecycle and test surface. It is not the default compromise.

**Exit criterion.** `docs/android/playback-spike-results.json` has a result for
every mandatory corpus and lifecycle row on the physical phone, and
`docs/adr/android-playback-backend.md` names WebView, Media3, hybrid or STOP.
`npm test` and `npm run build` unaffected and green.

**Rollback.** Delete `spikes/android-phone-playback/`. It has no import from the
shipping entry and no committed credentials. Keep shipping the Phase 1 tag.

> **This ADR commit is the abandonment checkpoint.** It is the last point at
> which nothing has been restructured and the cost of stopping is zero. If the
> answer is STOP, or if the team's appetite has changed, stop here.

---

### Phase 3 — Ship a phone app real users can install

**Estimated 240–320 engineering hours** — roughly **9–13 calendar weeks** at
28–32 Android hrs/week. Council estimate, not a commitment; re-estimate after
Phase 2 names a backend.

Indicative split: 40–60h shell, credentials and provider connectivity; 80–100h
browse/search/details; 60–80h playback, tracks, cancellation, resume; 40–60h
lifecycle, persistence, packaging, device QA.

**Work**

1. Create `apps/android-phone/` — a distinct Capacitor product with its own
   entry, Vite/TypeScript config, CSS graph and artifact. **Not** a copy of the
   TV app, **not** the TV stylesheet with breakpoints.
2. Compose the Phase 2 backend. Build vertical increments, each ending green and
   installable: credentials and provider connectivity → catalog sync and
   browse/search → details → playback with track selection and cancellation →
   favorites/resume persistence → required lifecycle and connectivity behavior.
3. **Phone-owned presentation from the first APK:** touch scrolling, soft
   keyboard search, system Back, portrait and landscape player layouts, touch
   scrubber and sheets, one-handed controls, accessibility focus. No TV help
   bar, no focus ring during touch use, no spatial navigation.
4. **Duplicate composition glue rather than extracting it.** Copying wiring code
   into the phone app is cheaper and safer than pulling controllers out of
   `main.ts` while both products are moving.
5. **Share a module only when both products actively consume it**, moving it
   with its tests in one green commit. Realistic first candidates, all already
   DOM-free and tested: `search.ts`, `content-rating.ts`, `playback-fallback.ts`,
   `player-transport.ts`, `track-selection.ts`, `series-presentation.ts`. Do not
   create a package to hold them until there are more than a handful; a
   relative import across the workspace is fine until it isn't.
6. **The first shared module is what triggers guard work** (§5), in that commit:
   make `check-import-cycles` see both roots, and keep phone CSS out of the
   webOS closure. Nothing more.
7. Any raw-source contract test guarding moved code migrates **in the same
   commit**: add the equivalent behavioral test, prove it red by breaking the
   invariant, then remove the source assertion. Never an upfront sweep. See §7.
8. Decide Android credential storage and catalog persistence here, from evidence
   — hardware-backed vs local, IndexedDB vs SQLite — against force-stop,
   relaunch, upgrade, quota and interrupted-write probes.
9. webOS stays untouched. `npm run build` and `npm run package:webos` keep
   working exactly as today throughout.

**Exit criterion.** An installable APK completing login → catalog browse →
search → details → playback with track switching → resume, on the physical
phone. `npm test` green, `npm run build` green, webOS device checklist unchanged
and passing. Results in `docs/android/phone-slice-results.json`.

**Rollback.** Remove `apps/android-phone/` and any guard extension it added.
Revert shared-module moves in reverse order; each was green on its own commit.

---

### Phase 4 — Controlled release

**Work**

1. Signing, package ID, distribution track, per the §3 device policy.
2. Sanitized telemetry: crash, lifecycle, playback backend, protocol, OS and
   WebView version. No provider URLs, no credentials, no catalog payloads.
3. Answer the requirements deferred from Phase 1: credential policy, backup and
   reinstall survival, Play distribution and review requirements, localization,
   accessibility acceptance.
4. Release-blocking scan for credentials and tokens in the generated APK/AAB,
   WebView assets and captured logs — extending `CLAUDE.md`'s no-embedded-
   credentials rule to Android artifacts.
5. Ship to the beta cohort. Keep the webOS release job fully independent: an
   Android failure or rollback must never block rebuilding the approved webOS
   release.

**Exit criterion.** The cohort is running the app; telemetry is arriving
sanitized; a rollback has been rehearsed at least once.

**Then, and only then**, reopen the Android TV question with real data on
support burden, shared-code drift and actual maintenance cost.

---

## 7. Reference material for whenever extraction happens

Not scheduled. Consult when Phase 3 step 5 or a later product forces it.

**Feature-owned state, not one state bag.** If controllers are ever extracted,
each owns private state and exposes typed commands, immutable snapshots and
events; controllers do not mutate one another; no `AppState`, no `AppContext`,
no service locator. The ownership table is `main-refactor-v2.md` §3.

**Atomic source-contract migration.** Over 100 assertions inspect `main.ts`
source text and pin real ordering and boundary invariants. Each migrates only
with the code it guards. The full mapping — `artwork-quality-contract`,
`artwork-backfill-contract`, `deferred-image-contract`,
`player-title-source-contract`, `track-selection-contract`,
`local-first-regression`, `provider-boundary` — is `main-refactor-v2.md`
Phase 3.

**`CatalogRepository` has no interface to preserve.** It is a ~4,900-line
concrete IndexedDB class instantiated directly at `src/main.ts:461`. Any port
must be consumer-driven, defined over the operations one increment actually
uses. Do not split its internals and refactor `main.ts` at the same time.

---

## 8. Kill criteria

Check these weekly. Any one triggers a stop-and-reassess, not a discussion.

| Signal | Threshold |
|---|---|
| No installable APK completing login → browse → playback | 2 consecutive weeks after Phase 3 starts |
| Capacity spent on verification/tooling rather than product | > 25% in any 2-week window |
| No end-to-end phone slice | after 160 engineering hours in Phase 3 |
| webOS regression reported by a real user and attributed to this work | any, immediately |
| Phase 2 mandatory row failing with no backend passing | immediately → STOP per §6 |

**The abandonment checkpoint is the Phase 2 ADR commit.** Before it, nothing has
moved and stopping costs nothing. After Phase 3 begins, the honest reduction is:
keep the phone app, drop everything about sharing, maintain two codebases
deliberately. Never leave source half-migrated between `src/` and `apps/`.

**The likeliest failure is not technical.** It is running out of months while
every gate stays green. That is what the hour estimates and the weekly check
exist to make visible.

---

## 9. Decision register

| Decision | Made in | Alternatives | Stop condition |
|---|---|---|---|
| Device support policy | Phase 1 | named-device / controlled beta / fund a device set | none achievable → reduce reach claim to named-device |
| Playback backend | Phase 2 | WebView / Media3 / justified hybrid / STOP | no backend passes every mandatory row |
| Android credential storage | Phase 3 | local / hardware-backed | approved policy unmet by either |
| Android catalog persistence | Phase 3 | IndexedDB / native SQLite | neither survives the lifecycle and data corpus |
| Whether to share a module | Phase 3, per module | share / duplicate | not consumed by both products |
| Whether Android TV proceeds | after Phase 4 | proceed / never | phone support burden already saturates capacity |

---

## 10. Unknowns

Carried from v2 §7, minus the ones this plan resolves by sequencing.

- **Android playback compatibility** — resolved by Phase 2 on the physical
  phone. Do not extrapolate from desktop Chrome or from webOS.
- **WebView vs Media3 risk** — compare identical evidence; do not estimate
  before the spike.
- **Phone view-layer reuse** — deliberately not measured in advance. Phase 3
  discovers it by building; whatever ends up genuinely shared is the answer.
- **Android storage capacity, quota and interruption behavior** — Phase 3
  probe.
- **Performance acceptance numbers** — none invented here. Capture startup,
  channel switch, seek, memory, thermal and battery observations in Phase 2 and
  Phase 3 reports, then have the product owner approve measured thresholds.
- **Effort beyond Phase 2** — the Phase 3 range is an advisory council estimate.
  Re-estimate once a backend is named.
