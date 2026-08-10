# Phase 1 Android native media-architecture audit

- **Audit date:** 2026-08-09
- **Baseline commit:** `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`
- **Status:** advisory evidence; **not** normative requirements. `docs/android/requirements.md`
  and `plans/main-refactor-v3.md` remain authoritative until an owner amends them.
  This audit proposes amendments (§F, §G); it does not enact them.
- **Scope:** the eleven approved Android media requirements and what they imply
  for Phase 2's backend ordering and gate structure. Covers `MediaSessionService`,
  `MediaSession`, foreground media service, notification/lock-screen controls,
  audio focus, becoming-noisy, Activity recreation, process death, Picture-in-Picture,
  `DownloadManager`/`DownloadService`, Cast SDK / `CastPlayer`, connectivity recovery,
  and cancellation. Read-only: no source, spike, dependency, or build change.
- **Primary-source policy:** native-ownership claims are grounded in official
  developer.android.com and AndroidX Media3 documentation (§I). Claims about
  *current* app behavior are grounded in the shipping source at the baseline
  commit (`src/main.ts`, `src/playback-fallback.ts`, `src/media-engines.ts`,
  `src/dash-player.ts`, `src/player-transport.ts`) and cited by line. Where the two
  disagree, the code is evidence of *what is*, the docs are evidence of *what the
  platform requires*, and neither is treated as a requirement decision.

---

## A. Executive verdict

**The eleven approved requirements are not one binary backend gate, and Phase 2
as written — "WebView first; Media3 only if A fails" — is incoherent with the
feature scope that `requirements.md` §4/§5 already approved.**

The requirements occupy **four independent ownership planes**, only one of which
is a playback-backend choice:

1. **Local decode/playback** — codec, container, track enumeration/switching,
   cancellation, decode-while-visible. This is the *only* genuine
   "WebView vs Media3" question.
2. **Session / service ownership** — background audio, media notification,
   lock-screen transport, headset/Bluetooth controls, transient/permanent audio
   focus, becoming-noisy, process-death survival, Activity recreation. Owned
   natively by `MediaSessionService` / `MediaSession` / `ExoPlayer`. **A WebView
   `HTMLMediaElement` cannot own this plane at all.**
3. **Downloads** — `DownloadService` wrapping `DownloadManager`. Orthogonal to
   the playback backend.
4. **Casting** — Cast SDK (`CastContext`/`SessionManager`) + Media3 `CastPlayer`
   behind a Capacitor plugin. Required regardless of backend; `requirements.md`
   §4.4 already states this.

**The decisive finding:** the plan's own escalation rule already fires *before
Phase 2 begins*. Plan §6 says a *"required native-service feature the WebView
design cannot provide **forces the Media3 proof**."* Background audio (§4.1),
lock-screen/notification controls, headset/BT transport, transient/permanent
audio focus, becoming-noisy, and process-death survival (§5) are exactly such
features, and they are approved and in scope. A WebView cannot satisfy them by
construction. So "prove WebView first, fall back to Media3" proves a foregone
conclusion at 20–28h of cost.

**Recommendation — be decisive: Media3-first for local playback, plus a capped
WebView diagnostic.** Make **Media3 (ExoPlayer) the presumptive local-playback
backend.** Keep WebView **only** as a hard time-boxed diagnostic (6–10h) that
captures cheap, otherwise-unobtainable evidence — mpegts.js behavior, AC-3
degradation, DASH track discovery, and cancellation determinism *inside a real
Android System WebView* — never as the gate the product waits on. Then replace
the single Phase 2 gate with **four independent gates** (§E).

Do not preserve WebView-first merely because v3 says so. The approved §4/§5 scope
overrode that ordering the moment it was signed.

---

## B. Requirement-to-native-component matrix

| # | Requirement | Native owner (Android / Media3) | WebView `HTMLMediaElement` robust? | Plane / gate |
|---|---|---|---|---|
| 1 | Background audio, screen off | `MediaSessionService` (foreground service) hosting **ExoPlayer** | **No** — backgrounded WebView is throttled; media element is window/Activity-bound | Session/service — Gate 2 |
| 2 | Media notification + lock-screen controls | `MediaSessionService` + `MediaSession`; Media3 auto-publishes the platform media notification from the session | **No** — no `MediaSession` surface exists from a WebView | Session/service — Gate 2 |
| 3 | Headset / Bluetooth controls | `MediaSession` media-button handling — Media3 routes media-button events to the session player | **No** — media-button / `MediaButtonReceiver` routing is native | Session/service — Gate 2 |
| 4 | Transient / permanent audio focus | **ExoPlayer** `AudioAttributes` with `setAudioAttributes(attrs, handleAudioFocus=true)` | Partial/fragile — Web interruption signals do not arbitrate system audio focus | Session/service — Gate 2 |
| 5 | Becoming-noisy (headset unplug) | **ExoPlayer** `ExoPlayer.Builder.setHandleAudioBecomingNoisy(true)` | **No** — `ACTION_AUDIO_BECOMING_NOISY` is a native broadcast | Session/service — Gate 2 |
| 6 | Picture-in-Picture + return to playback | **PiP Activity APIs** (`enterPictureInPictureMode`, `PictureInPictureParams`, `setAutoEnterEnabled`) + the player-state owner | Window entry via Activity only; return with preserved tracks/position depends on the state owner (Gate 1/2) | Phase 3 product integration |
| 7 | Process death + Activity recreation | Service-hosted **ExoPlayer** survives config-change recreation; persisted resume covers process death | **No** — WebView + media element die with the Activity; decode restarts from zero | Session/service — Gate 2 (+ Gate 1 for resume) |
| 8 | Resumable offline downloads | **`DownloadService`** wrapping **`DownloadManager`**; background-capable, `sendResumeDownloads`, resumes after process restart | **No** — WebView has no resumable background-download primitive | Downloads — Gate 3 |
| 9 | Cast discovery / handoff / transport / disconnect | **Cast SDK** (`CastContext`, `SessionManager`, `MediaRouteButton`) + Media3 **`CastPlayer`** behind a Capacitor plugin | **No** — Cast SDK cannot run inside the WebView | Casting — Gate 4 |
| 10 | Network loss/change recovery | **ExoPlayer** `LoadErrorHandlingPolicy` + native `ConnectivityManager` callbacks | Weak — today per-engine, one-shot only; no `online`/`offline` listener (`requirements.md` §6.5) | Local — Gate 1 (product-tuned in Phase 3) |
| 11 | Cancellation without stale events | **ExoPlayer** `stop()`/`release()` lifecycle | Yes in principle — `activeAttemptGeneration` + `isActiveAttempt` guard (`src/main.ts:3737`) is sound but must be *demonstrated* on-device | Local — Gate 1 |

Legend: Gate 1 = local playback backend selection; Gate 2 = session/service proof;
Gate 3 = downloads proof; Gate 4 = casting proof. See §E.

---

## C. WebView feasibility and lifecycle-ownership analysis

### C.1 What the current code is (evidence, not requirement)

- **No session surface exists.** No `MediaSession`, no audio-focus handling, no
  media notification anywhere in the codebase (`requirements.md` §6.2). The only
  keep-alive mechanism is `navigator.wakeLock.request('screen')`
  (`src/main.ts:8592`) combined with the webOS-only `webOSSystem.keepAlive()`
  (`src/main.ts:8601`). A **screen** wake lock is the wrong instrument for
  background *audio*.
- **`visibilitychange` does the inverse of background audio.** On hidden, the
  handler cancels the seek and pauses the video
  (`document.querySelector<HTMLVideoElement>('#video-player')?.pause()`,
  `src/main.ts:9080`) and does **not** release the wake lock. For webOS this is
  correct; for a phone with background audio in scope it stops the audio that
  must continue and holds the lock that should be released.
- **MPEG-TS collapses to mpegts.js only on Android.**
  `nativeTransportStream: Boolean(player.canPlayType('video/mp2t')) || isWebOs`
  and `preferNativeTransport: isWebOs` (`src/main.ts:3660`, `:3665`) both evaluate
  false on Android WebView, so every TS stream routes through mpegts.js with no
  native fallback (`requirements.md` §2.5). The webOS TS history transfers to
  Android not at all.
- **Cancellation is guarded but web-only.** `cleanupActiveTransport`
  (`src/main.ts:3691`) tears down Hls.js/mpegts/Dash.js and resets the element;
  stale callbacks are gated by `activeAttemptGeneration` + `isActiveAttempt`,
  which also checks `player.isConnected` (`src/main.ts:3737`). Sound design — but
  it is a browser design, and Activity recreation can destroy the WebView without
  ever firing `pagehide` (the event that calls `playerCleanup()` and therefore
  `persistProgress()`, `src/main.ts:9067`).

### C.2 Can a WebView `HTMLMediaElement` satisfy the requirements robustly?

- **Local-decode plane (rows 10–11 + the codec/track/container corpus):**
  *possibly*, and cheap to measure. HLS via Hls.js, DASH via Dash.js, TS via
  mpegts.js, progressive via native `<video>` already run in a plain Chromium,
  and WebView 100 is Chromium 100. Worth a capped diagnostic.
- **Session/service plane (rows 1–5, 7):** **no.** A backgrounded WebView is
  subject to timer and media throttling, and its media element is bound to the
  WebView's window. There is no path from a WebView to a `MediaSession`, to
  media-button routing, to `handleAudioFocus`, or to
  `setHandleAudioBecomingNoisy`. These are native surfaces by construction. The
  official background-playback guidance places ongoing playback inside a
  `MediaSessionService` running as a foreground service — a component a WebView
  cannot become.
- **AC-3 / E-AC-3 (`requirements.md` §2.3, corpus `NP-TS-003/004`):** a WebView
  cannot ship a bundled decoder; Media3 can add the AC-3 decoder extension. If
  the owner upgrades AC-3 from best-effort to mandatory (§9), WebView is
  eliminated for that row before Phase 2 even runs.

### C.3 Does a native service *controlling* an Activity-owned WebView solve decoder lifecycle ownership? — **No. Decisive.**

A native foreground service can raise process priority and can host a
`MediaSession` + notification whose buttons call *into* the WebView. It does
**not** move the decoder. The decoder remains inside the Activity-bound WebView,
and that is the ownership that the requirements actually test:

- **Activity recreation** (rotation, config change, dark-mode toggle) destroys and
  rebuilds the WebView → decode restarts from zero, violating `requirements.md`
  §5 ("resumes within 2s, no re-buffer from zero, no track reset").
- **Backgrounded / screen-off** with no attached window → the WebView is
  throttled → audio stops, violating §4.1.
- **Process death** kills the WebView and every JS timer with it; the guard state
  in `activeAttemptGeneration` evaporates, and `pagehide` is not guaranteed to
  fire first, so the last resume position may never be persisted.

Therefore a "native service wrapping a WebView" is an **audio-session shim over a
decoder that still dies with the Activity.** It can publish a notification for
audio that the OS has already throttled. It does not deliver rows 1, 2, 3, 5, or
7. Only a player whose decode lives in a service-scoped, config-change-surviving
component — **ExoPlayer inside a `MediaSessionService`** — owns this plane.

**Conclusion:** WebView is admissible, at most, for the local-decode plane, and
only as a capped diagnostic. It is disqualified from the session/service plane on
architectural grounds, not on measurement. Media3 is the presumptive backend.

---

## D. Recommended Phase 2 ordering

Replace the single "prove WebView, else Media3" spike with an ordered set whose
early steps are the cheapest disqualifiers.

1. **Corpus acquisition + checksums first (blocking).** Execute
   `playback-corpus.md` §5 steps 1–4 before any playback. Without
   `fixtures/playback-corpus.lock.json`, results are not reproducible across runs.
2. **Capped WebView diagnostic — 6–10h, hard cap, disposable.** Load today's
   `webos-app/` output unmodified in the minimal Capacitor shell on the physical
   phone. Record, for evidence only: mpegts.js TS behavior (`NP-TS-001/002`),
   AC-3/E-AC-3 degradation (`NP-TS-003/004`), DASH track discovery gaps
   (`NP-DASH-003/004`), and cancellation determinism (`NP-HLS-008`). This is a
   **diagnostic, not a gate**: it cannot "pass" the product onto WebView, because
   the session/service plane already disqualifies WebView (§C.3). Its output is
   the ADR's evidence base and a de-risking of the Media3 TS/codec corpus.
3. **Media3 local-playback proof (Gate 1).** Minimal Capacitor plugin fronting
   ExoPlayer. Run the full `playback-corpus.md` §3 matrix on the physical phone:
   core formats, HEVC, TS via ExoPlayer, DASH tracks, negative/degradation rows,
   cancellation. This is the real backend gate.
4. **Session/service proof (Gate 2).** `MediaSessionService` + `MediaSession` +
   ExoPlayer: background audio, notification, lock screen, headset/BT, transient
   vs permanent focus, becoming-noisy, Activity recreation, process-death resume.
   Exercise against `NP-HLS-001` (VOD) and `NP-HLS-003` (live).
5. **Downloads proof (Gate 3).** `DownloadService`/`DownloadManager`: download,
   progress, cancel, resume across app restart, offline playback, partial-write
   integrity. VOD only, no DRM (`requirements.md` §4.3).
6. **Casting proof (Gate 4).** Cast SDK + `CastPlayer` behind a Capacitor plugin:
   discovery, handoff with position, transport, disconnect-returns-to-device,
   HLS/DASH only with MPEG-TS presented as unavailable (`requirements.md` §4.4).
7. **ADR.** `docs/adr/android-playback-backend.md` records the backend (expected:
   Media3) and, separately, the independent pass/fail of Gates 2–4.

Steps 3–6 are independent and may be parallelized across the two engineers once
step 1 exists; step 2 is a prerequisite only for informing step 3's corpus, not a
blocker for it.

---

## E. Recommended independent decision gates

The current plan has one gate that can return WebView / Media3 / hybrid / STOP.
That conflates four decisions with different owners and different failure modes.
Split them:

| Gate | Question | Pass condition | STOP condition | Independent of |
|---|---|---|---|---|
| **Gate 1 — Local playback backend** | Which engine decodes the corpus on the phone? | Every mandatory `playback-corpus.md` row passes on the physical phone (Media3 expected) | No backend passes every mandatory row | Gates 2–4 |
| **Gate 2 — Session/service** | Do background audio, notification, controls, focus, becoming-noisy, recreation, and process-death resume work? | All `requirements.md` §4.1/§5 rows pass under a `MediaSessionService` | Platform cannot deliver background audio on a floor-API cohort device | Gates 1, 3, 4 |
| **Gate 3 — Downloads** | Is offline VOD resumable and integrity-safe? | Download resumes across restart; no partial file plays as complete | `DownloadService` cannot meet resume/integrity on the cohort | Gates 1, 2, 4 |
| **Gate 4 — Casting** | Does Cast discover/handoff/transport/disconnect for HLS/DASH? | All `requirements.md` §4.4 rows pass; TS cleanly unavailable | Cast SDK cannot handoff position or transport | Gates 1, 2, 3 |

Rules:
- **A single ADR records four verdicts, not one.** Gate 1 names the backend;
  Gates 2–4 each independently pass, fail, or defer.
- **Gate 2 failure does not necessarily STOP the product** — it may reduce §4.1
  scope by owner decision. Only Gate 1 STOP (no backend decodes the corpus) is a
  whole-initiative STOP, consistent with plan §8's kill criterion.
- **PiP (row 6) is not a Phase-2 gate.** It is Phase-3 product integration that
  consumes Gate 1's player and Gate 2's state ownership. Proving PiP in isolation
  before those exist proves nothing durable.
- **Casting cost is not in the Phase 3 estimate** (`requirements.md` §4.4 admits
  this). Gate 4 must carry its own line (§H).

---

## F. Exact amendments required in `plans/main-refactor-v3.md`

These are proposed edits for owner approval; this audit does not apply them.

1. **§6 Phase 2 title and framing.** Replace "Prove phone playback. The gate
   everything else waits on" with a four-gate framing: "Prove phone media
   architecture across four independent gates (local playback, session/service,
   downloads, casting)." The single-gate premise is the core defect.

2. **§6 Phase 2 step 2 ("Alternative A — WebView playback first").** Replace
   "WebView first" with: "Media3 is the presumptive local-playback backend
   (rationale: §4.1/§5 native-service requirements). A **capped 6–10h WebView
   diagnostic** runs first for evidence only and cannot select the backend."
   Cross-reference this audit.

3. **§6 Phase 2 step 5.** Split the omnibus "Prove lifecycle" bullet into an
   explicit Gate 2 with the `MediaSessionService`/`MediaSession`/ExoPlayer owners
   named for background audio, notification, lock screen, headset/BT, transient
   vs permanent focus, becoming-noisy, Activity recreation, and process-death
   resume.

4. **§6 Phase 2 "Decision point".** Replace the single WebView/Media3/hybrid/STOP
   rule with the four-verdict structure in §E: Gate 1 names the backend; Gates
   2–4 pass/fail/defer independently; only Gate 1 STOP is a whole-initiative STOP.

5. **§6 Phase 2 estimate.** Change "20–28 hours, plus 24–32 more if alternative B
   is needed" to the itemized ranges in §H. The "alternative B" contingency
   framing is obsolete once Media3 is presumptive.

6. **§6 Phase 3 step 5 / estimate.** Add Cast SDK + `CastPlayer` and
   `DownloadService` as first-class native surfaces with their own hours; note
   they are not covered by the existing 240–320h council estimate.

7. **§9 Decision register.** Replace the single "Playback backend / Phase 2"
   row with four rows (local backend, session/service, downloads, casting), each
   with its own alternatives and stop condition.

8. **§10 Unknowns / §4.** Add that "the existing `webos-app/` output runs
   unmodified … Phase 2 needs no build changes at all" (§4) is true only for the
   **capped WebView diagnostic**, not for the shipping backend, which is a native
   Media3 plugin requiring a Capacitor native project.

---

## G. Exact amendments required in `docs/android/requirements.md`

Proposed for owner approval; not applied here.

1. **§4.1 background-audio note.** Strengthen "most likely to force Media3" to a
   determination: background audio, lock-screen/notification controls,
   headset/BT, focus, and becoming-noisy are **owned by a native
   `MediaSessionService` + ExoPlayer and are not satisfiable by a WebView**, per
   this audit §C.3. They therefore make Media3 the presumptive backend rather
   than a fallback.

2. **§4.4 casting.** Already states Cast needs a Capacitor plugin "regardless of
   which backend"; add that this makes casting an **independent Gate 4**, not part
   of the local-playback decision, and that its cost is excluded from the Phase 3
   estimate.

3. **§4.3 downloads.** Add that resumable offline download is owned by
   `DownloadService`/`DownloadManager` and is an **independent Gate 3**, not a
   WebView capability.

4. **§4.2 PiP.** Add that PiP is Phase-3 product integration over Gate 1's player
   and Gate 2's state ownership, not a standalone Phase-2 backend gate.

5. **§6.2.** Note that the required remediation is not "add a MediaSession to the
   web app" but "host playback in a native `MediaSessionService`," since the
   session and the decoder must share a service-scoped lifecycle.

6. **§9 sign-off item (AC-3).** Record that if AC-3/E-AC-3 is upgraded to
   mandatory, WebView is eliminated for `NP-TS-003/004` before Phase 2, and the
   capped diagnostic's AC-3 rows become confirmatory only.

---

## H. Estimate corrections

The v3 Phase 2 figure ("20–28h, plus 24–32h if B is needed") assumes a WebView-vs-Media3
either/or. With Media3 presumptive and four independent gates, the realistic
bounded proof scopes are:

| Proof | Scope (bounded — proof only, not product) | Range |
|---|---|---|
| Corpus acquisition + checksums | Source/re-mux legal samples, SHA-256, lock file | 6–10h |
| Capped WebView diagnostic | Evidence-only: TS, AC-3, DASH tracks, cancellation in WebView 100 | 6–10h (hard cap) |
| Gate 1 — Media3 local playback | ExoPlayer plugin + full corpus matrix on device | 24–36h |
| Gate 2 — session/service | `MediaSessionService`, focus, becoming-noisy, recreation, process-death resume | 20–30h |
| Gate 3 — downloads | `DownloadService` add/resume/offline/integrity | 12–20h |
| Gate 4 — casting | Cast SDK + `CastPlayer` discovery/handoff/transport/disconnect | 16–28h |

- **Phase 2 total (all gates): ~84–134h**, versus the plan's 20–28h (+24–32h).
  The gap is the cost of scope that was approved in §4 but never priced into
  Phase 2.
- These are **proof** ranges, deliberately not a product estimate. The Phase 3
  240–320h council figure must additionally absorb production-grade downloads and
  casting, which it predates (`requirements.md` §4.4).
- Do not treat any range as a commitment before Gate 1 names the backend and the
  physical-device unknowns in §J are closed.

---

## I. Sources with full URLs

Official Android / AndroidX Media3 documentation consulted for this audit:

- Background playback with a MediaSessionService —
  https://developer.android.com/media/media3/session/background-playback
- Control and advertise playback using a MediaSession —
  https://developer.android.com/media/media3/session/control-playback
- Downloading media (DownloadManager / DownloadService) —
  https://developer.android.com/media/media3/exoplayer/downloading-media
- Add Cast to an Android app (getting started) —
  https://developer.android.com/media/media3/cast/getting-started
- `androidx.media3.cast.CastPlayer` API reference —
  https://developer.android.com/reference/androidx/media3/cast/CastPlayer
- `ExoPlayer.Builder` API reference (`setHandleAudioBecomingNoisy`) —
  https://developer.android.com/reference/androidx/media3/exoplayer/ExoPlayer.Builder
- Manage audio focus (`handleAudioFocus`) —
  https://developer.android.com/media/optimize/audio-focus
- Add support for Picture-in-Picture —
  https://developer.android.com/develop/ui/views/picture-in-picture

Repository evidence at the baseline commit: `src/main.ts`
(`:3660`, `:3665`, `:3691`, `:3737`, `:8592`, `:8601`, `:9067`, `:9070`, `:9080`),
`src/playback-fallback.ts`, `src/media-engines.ts`, `src/dash-player.ts`,
`src/player-transport.ts`, and the Phase 1 docs (`requirements.md`,
`playback-corpus.md`, `device-policy.md`, `baseline.md`).

---

## J. Remaining physical-device unknowns

Not resolvable from documentation or desktop; must be measured on the physical
phone and, per `device-policy.md` §3, across at least three device classes:

1. **HEVC Main/Main10 through the chosen backend** (`NP-HLS-004`, `NP-TS-002`) —
   hardware decode is near-universal but not architecturally guaranteed.
2. **AC-3 / E-AC-3 decode or clean degradation** (`NP-TS-003/004`) — licensed OEM
   feature; presence varies by handset and is narrower still under WebView.
3. **mpegts.js raw-TS reliability on-device** (`NP-TS-001`) — the highest-risk
   row; no native fallback exists on Android.
4. **Background-audio survival under OEM battery optimization** — Samsung, Xiaomi,
   and others apply aggressive background policies that a `MediaSessionService`
   must survive on real hardware.
5. **Activity-recreation resume latency** — the §5 "within 2 seconds, no
   re-buffer from zero" bar is unverified on any backend.
6. **Process-death resume-position staleness ≤10s** (`requirements.md` §5) —
   depends on persistence cadence under real force-stop.
7. **Cast handoff position accuracy and TS-unavailable messaging** on real
   receivers.
8. **Download resume across real force-stop / reboot and quota exhaustion**
   (also a Phase 3 IndexedDB-vs-SQLite input).
9. **WebView major version actually present on cohort devices** — the §1.2
   Play-updatable-WebView assumption, false on exactly the least-represented
   devices.
10. **Network-change (Wi-Fi ↔ cellular) recovery** — no handler exists today
    (`requirements.md` §6.5); behavior is unmeasured on either backend.
