# Android phone app — pinned requirements

**Phase:** `plans/main-refactor-v3.md` Phase 1, step 2.
**Recorded:** 2026-08-09.
**Owner:** Arash Ghalamifard (`sghalamifard@adaptavist.com`).
**Status:** approved, except §2.3 (codec list) which is flagged for explicit
owner sign-off before Phase 2 builds its corpus.

This document answers **only** what the Phase 2 playback spike cannot proceed
without. Everything else stays open and becomes blocking before Phase 4 — see §8.

Companion documents: `docs/android/device-policy.md` (device support),
`docs/refactor/baseline.md` (the webOS baseline this is measured against),
`docs/android/playback-corpus.md` (the legal sample corpus).

**Provenance.** §2 and §6 are grounded in an inventory of the current shipping
implementation (`src/main.ts`, `src/media-engines.ts`, `src/playback-fallback.ts`,
`src/player-transport.ts`, `src/dash-player.ts`, `src/track-selection.ts`). Where
this document states what the code does today, that statement is evidence. Where
it states what Android must do, that is a requirement and is marked as such.

---

## 1. Platform floor

| Field | Value |
|---|---|
| Minimum Android API level | **26** (Android 8.0 Oreo) |
| Minimum System WebView major | **100** |
| May deployment assume Play-Store WebView updates? | **Yes** — with the guard in §1.2 |
| JS build target for the phone | derived from WebView 100, **never** the webOS ES2015 / Chromium 79 target |

### 1.1 What the floor does and does not mean

WebView 100 is a Chromium 100 engine. Per plan §4, **Chromium 79 is a floor, not
a ceiling** — but the inverse matters more here: the phone app must never inherit
the webOS restrictions. The Chromium 79 CSS baseline guard, the ES2015 target,
the banned-globals scan and the compositor-only motion policy are *webOS-target
rules*. They do not bind phone code, and per plan §5 they will not even see it.

Concretely, the phone app may use `inset`, `:focus-visible`, `aspect-ratio`,
`structuredClone`, `AbortSignal.timeout` and paint-property transitions. The
D-pad repaint budget that motivates the motion policy does not exist on a touch
UI.

### 1.2 The assumption that must be verified, not trusted

Assuming a Play-updatable WebView is reasonable and it is also the single most
likely source of a field-only failure, because it is false on exactly the devices
least represented in the team's hands: OEM-forked WebViews, devices without Play
Services, and devices whose users never update.

Therefore:

1. The app **must read and report the actual runtime WebView major version**, not
   assume it. This is one of the telemetry fields required by
   `docs/android/device-policy.md` §4.
2. The app **must refuse to run, with an explicit message, below WebView 100**
   rather than fail obscurely inside a playback engine.
3. At least one controlled-beta cohort device must sit at API 26 — the floor
   itself — per `device-policy.md` §3.

---

## 2. Protocols, containers, codecs and subtitles

### 2.1 Mandatory protocols and manifests

Beyond HLS, DASH and MPEG-TS, **no additional protocol is in scope.** The
existing implementation handles exactly these, and the phone app inherits that
surface unchanged:

| Protocol | Detection today | Engines today | Android requirement |
|---|---|---|---|
| HLS | `.m3u8`, `application/vnd.apple.mpegurl`, `application/x-mpegURL` | native `<video>`, Hls.js | **Mandatory.** Hls.js is the expected path; native HLS is not available on Android WebView. |
| MPEG-TS | `.ts`, `.m2ts`, `.flv`, `video/mp2t` | native `<video>`, mpegts.js | **Mandatory.** See §2.5 — this is the highest-risk row. |
| MPEG-DASH | `.mpd` extension only | Dash.js | **Mandatory.** |
| Progressive / unclassified | any other extension → native | native `<video>` | **Mandatory**, subject to the container limits in §2.2. |

There is no content sniffing anywhere — routing is by URL extension and MIME
probe only. That is accepted as-is for the phone; the spike must not add sniffing.

### 2.2 Containers

| Container | Requirement | Note |
|---|---|---|
| MPEG-TS (`.ts`, `.m2ts`) | **Mandatory** | See §2.5. |
| fMP4 (HLS and DASH segments) | **Mandatory** | Handled inside MSE by Hls.js / Dash.js. |
| MP4 progressive | **Mandatory** | Routes to native `<video>`. Well supported on Android WebView. |
| FLV | **Mandatory** | Routed to mpegts.js today. |
| **MKV / Matroska** | **Out of scope for the phone.** | See below. |
| WebM | Not required, not refused. | Android WebView supports it; nothing routes to it deliberately. |

**MKV is deliberately dropped on the phone, and this is a real capability
reduction.** The current code plays MKV through native `<video>` — a webOS
platform capability. Android System WebView does not decode general Matroska;
it supports WebM, which is a restricted Matroska profile. A `.mkv` URL will route
to `native` (the default for unrecognized extensions) and is expected to fail.

This must be handled as an explicit, user-visible unsupported-format error, not
as a generic playback failure. It is a **mandatory Phase 2 corpus row** recorded
as an expected failure — proving it fails *cleanly* is the requirement.

### 2.3 Codecs — flagged for owner sign-off

**The codebase names no codec anywhere.** There is no codec fallback table, no
`canPlayType` probe against a literal codec string, and no HEVC/AV1/VP9/AAC/AC-3
capability check. Codec strings are entirely runtime-provided by the engines
(`HlsBufferCodecsData.video.codec`, mpegts.js `MEDIA_INFO.videoCodec`) and probed
generically via ``MediaSource.isTypeSupported(`${container}; codecs="${codec}"`)``.

That means the codec requirement **cannot be derived from the code** — it has to
be stated. Stated here, for sign-off:

| Codec | Class | Rationale |
|---|---|---|
| H.264 / AVC, up to High@L4.1 | **Mandatory** | Guaranteed on every API 26+ device. The overwhelming majority of Xtream Codes output. |
| AAC-LC | **Mandatory** | Guaranteed on every API 26+ device. |
| HE-AAC | **Mandatory** | Guaranteed on API 26+. |
| HEVC / H.265, Main and Main10 | **Mandatory** | Common in IPTV HD/UHD tiers. Hardware decode is near-universal but **not architecturally guaranteed** — a Phase 2 pass/fail row, not an assumption. |
| **AC-3 / E-AC-3 (Dolby Digital / Plus)** | **Best-effort, must degrade cleanly** | See the warning below. |
| VP9 | Not required | Absent from IPTV provider output in practice. |
| AV1 | Not required | Not guaranteed below API 29 and hardware-dependent above it. |
| Opus, FLAC, Vorbis | Not required | Not refused if a device happens to decode them. |

> **AC-3 / E-AC-3 is the codec most likely to break this product on Android, and
> it is common in IPTV.** Android does **not** mandate AC-3 decode on handsets —
> it is a licensed OEM addition, present on many Samsung and Sony devices and
> absent on many others, and WebView exposure is narrower still. A stream whose
> video decodes and whose audio does not is the worst failure mode available:
> picture, no sound, no error.
>
> Required behavior: when audio cannot be decoded but video can, the app **must
> detect it and surface an explicit unsupported-audio error**, and must not
> present silent playback as success. This is a **mandatory Phase 2 row** and it
> is the row most likely to force the Media3 proof, since Media3 can be built
> with a bundled AC-3 decoder extension and a WebView cannot.

### 2.4 Subtitles

| Form | Requirement |
|---|---|
| HLS subtitle renditions (`hls.subtitleTracks`) | **Mandatory** — enumerate and switch. |
| Native `TextTrack` / `<video>` text tracks | **Mandatory** — enumerate and switch via `mode = 'showing'`. |
| DASH text adaptation sets | **Mandatory** — see §6.3; not currently discovered. |
| CEA-608 / 708 embedded captions | Not required. Not handled today either. |
| Sidecar files (SRT, external WebVTT, TTML) | **Out of scope.** No `<track>` creation code exists and none is to be added. |
| Embedded MKV subtitles | **Out of scope** — follows MKV, §2.2. |

No subtitle *file format* is named anywhere in the code; rendering is entirely
delegated to the engine or the native text-track implementation. That stays true
on the phone.

### 2.5 The MPEG-TS risk, stated explicitly

Today's engine capability table contains:

```
nativeTransportStream: Boolean(player.canPlayType('video/mp2t')) || isWebOs
preferNativeTransport: isWebOs
```

Both terms collapse on Android. `isWebOs` is `false`, and Android WebView returns
empty from `canPlayType('video/mp2t')`. Therefore:

- `nativeTransportStream` → **false**
- `preferNativeTransport` → **false**

**Every MPEG-TS stream on Android routes exclusively through mpegts.js**, with no
native fallback behind it, and HLS is preferred ahead of transport where both
are available. On webOS the exact opposite holds: native transport is forced on
and preferred first.

This is the single largest behavioral divergence between the two targets, it is
invisible in a desktop browser test, and it means **the webOS device's MPEG-TS
evidence transfers to Android not at all.** Phase 2 must treat every MPEG-TS
corpus row as unproven and prove it against mpegts.js on the physical phone.

### 2.6 DRM

**Not in scope.** Verified by inspection: zero occurrences of
`requestMediaKeySystemAccess`, `MediaKeys`, Widevine, PlayReady, ClearKey,
`drmSystems` or `protectionData` anywhere under `src/`. No license acquisition,
no EME. Xtream Codes panels do not serve DRM-protected content.

If DRM ever enters scope it invalidates this document's backend analysis and
Phase 2 must be rerun; it does not get added quietly.

---

## 3. Network security policy — cleartext HTTP

**Cleartext HTTP provider endpoints must work.** Xtream Codes panels are
frequently plain HTTP, and refusing cleartext would fail against a large share of
real providers.

**Policy: per-domain allowlist via an Android network security configuration.
Not a global `cleartextTrafficPermitted="true"`.**

| Rule | Value |
|---|---|
| App-wide default | `cleartextTrafficPermitted="false"` |
| Cleartext permitted for | named provider domains only, in `res/xml/network_security_config.xml` |
| Metadata proxy (`VITE_METADATA_PROXY_URL`) | **HTTPS only, no exception.** TMDB/Trakt secrets terminate there; it is never allowlisted. |
| Allowlist source of truth | the committed network security config |
| Populated | in Phase 2, from the approved provider test cases |

The allowlist is empty in Phase 1 because the Phase 2 provider test cases define
it, and per `CLAUDE.md` no provider hostname is committed before it has been
approved as non-sensitive. That is a **specified mechanism with a defined
population step**, not an unfilled field.

**Known consequence, accepted:** a static allowlist cannot cover provider
hostnames a user types at runtime. If the cohort shows that user-entered panels
fall outside the allowlist often enough to matter, the choice is between a
runtime-configurable exception and reverting to a global cleartext enable — a
Phase 3 decision made on cohort evidence, not now.

---

## 4. Feature scope

All four are **in scope**. Each "yes" below is a mandatory Phase 2 lifecycle
proof row, and together they are the reason §5 and §6 are as demanding as they are.

### 4.1 Background audio — **in scope**

Playback continues with the screen off or the app backgrounded.

Required behavior:

| Situation | Required |
|---|---|
| App backgrounded / screen off | Audio continues uninterrupted. Video decode may stop; audio must not. |
| Notification | A media notification with title, artwork, and play/pause/stop. |
| Lock screen | Transport controls and metadata present. |
| Headset / Bluetooth controls | Play, pause and stop honored. |
| Audio focus loss (transient, e.g. a call) | Pause, then resume when focus returns. |
| Audio focus loss (permanent, e.g. another player) | Pause and stop. Do not resume. |
| Becoming-noisy (headphones unplugged) | Pause immediately. |
| Process death while backgrounded | Notification is removed. No zombie audio. |
| Live streams | Same as above; no seek affordance in the notification. |

> **This requirement directly contradicts the current implementation.** See §6.1.
> It is also the requirement most likely to force Media3: a WebView that the OS
> is free to throttle when backgrounded is a weak foundation for guaranteed
> background audio, whereas a foreground media service is the platform's
> intended mechanism.

### 4.2 Picture-in-Picture — **in scope**

Video continues in a floating window on Home or app-switch.

Required: enter PiP on Home/recents while playing; play/pause in the PiP window;
correct aspect ratio; tap-to-restore returning to the same position and the same
selected audio and subtitle tracks; PiP exit while backgrounded transitions to
background audio (§4.1), not to a stop; no PiP for a stopped or errored player.

### 4.3 Downloads / offline — **in scope**

Required: download a VOD item (series episode or movie) for offline playback;
progress visible and cancellable; resumable across app restart; playable with no
network; explicit storage accounting and user-initiated deletion; interrupted
writes must never leave a partial file presented as playable.

Explicitly **not** in scope: downloading live channels, and downloading anything
DRM-protected (§2.6).

> Storage durability under force-stop, upgrade, quota exhaustion and interrupted
> write is a **Phase 3 decision** (plan §9: IndexedDB vs native SQLite), taken on
> probe evidence. Phase 1 fixes only that the capability is required.

### 4.4 Casting — **in scope**

Required: discover Cast receivers on the local network; cast a playing stream;
transport control from the phone while casting; correct handover of playback
position; disconnect returns playback to the device.

> **Scope limit, deliberate:** casting is required to work for **HLS and DASH**.
> Chromecast receivers do not play MPEG-TS. An MPEG-TS-only stream must present
> casting as unavailable with a clear reason rather than fail after connecting.
>
> Casting cannot be implemented inside the WebView. It needs the Cast SDK behind
> a Capacitor plugin regardless of which backend Phase 2 selects, and its cost is
> not covered by the Phase 3 estimate, which was sized before this scope was set.

---

## 5. Required playback behavior on lifecycle events

Every row is a mandatory Phase 2 proof row on the physical phone. "Preserved
state" means: stream, position, selected audio track and selected subtitle track.

| Event | Required behavior |
|---|---|
| App backgrounded (Home) | Audio continues per §4.1, or PiP per §4.2. Video may stop. Position preserved. |
| App foregrounded | Video resumes at the audio's current position, in sync. Preserved state intact. |
| Screen off / on | Audio continues. Video resumes on screen-on. |
| **Activity recreation** (rotation, config change, dark-mode toggle) | Playback survives, or resumes within 2 seconds at the same position with preserved state. No re-buffer from zero, no track reset. |
| **Process death and relaunch** | Playback does not resume automatically. The app returns to the item's detail view offering resume at the last persisted position. Resume position must be no more than **10 seconds** stale. |
| Audio focus loss, transient | Pause. Resume on focus return. |
| Audio focus loss, permanent | Pause and stop. Do not resume. |
| Headphones disconnected | Pause immediately. |
| **Network lost mid-stream** | Detected within 10 seconds. Explicit "connection lost" state — never an indefinite spinner. |
| **Network restored** | Live: reconnect at the live edge. VOD: resume at the last position. Automatic, one attempt, then a manual retry affordance. |
| Network changed (Wi-Fi ↔ cellular) | Same as lost-then-restored. Must not silently stall. |
| System Back at the player | Closes the player and returns to the previous view — Android system Back, not the webOS key/`popstate` path. |
| System Back at a root view | Backgrounds the app. Does not exit to a blank screen. |
| Stream cancellation | Cancel during manifest load and cancel mid-playback both leave no stale callback, no stale state and no audio from the cancelled stream. A subsequent stream starts cleanly. |

**Resume-position staleness is the binding number.** 10 seconds is chosen because
resume is persisted today on `timeupdate` and on `pause`, and process death gives
no opportunity to flush. If the phone app cannot hold 10 seconds, the persistence
cadence changes — the requirement does not.

---

## 6. What this requires changing — findings from the current implementation

These are not Phase 1 work. They are recorded here because they are the concrete
gap between §4/§5 and what exists, and Phase 2 must not rediscover them.

### 6.1 `visibilitychange` pauses the video — directly contradicts §4.1

The current `visibilitychange` handler, on hidden, cancels seeking and **pauses
the video**. On webOS that is correct. With background audio in scope it is
exactly wrong: backgrounding the phone app would stop the audio it is required to
continue.

Compounding this, the hidden branch does **not** call `playerCleanup()` and does
**not** release the wake lock, so the current handler both stops what should
continue and holds what should be released.

### 6.2 No audio focus, no MediaSession, no notification

There is **no** audio-focus handling, **no** `MediaSession` metadata or action
handlers, and no media notification anywhere in the codebase. §4.1's headset
controls, lock-screen transport, transient-focus pause/resume and
becoming-noisy behavior are all new surface.

The only related mechanism is `requestKeepAwake()` / `releaseKeepAwake()`, which
combines `navigator.wakeLock.request('screen')` with the webOS-only
`webOSSystem.keepAlive()`. On Android the webOS call is a no-op and a *screen*
wake lock is the wrong instrument for background audio.

### 6.3 DASH track discovery is missing

Audio and subtitle track enumeration exists on two paths only: HLS renditions
(`hls.audioTracks` / `hls.subtitleTracks`) and native `AudioTrackList` /
`textTracks`. There is **no DASH audio-group or text-adaptation-set discovery**.
On webOS this is masked because native transport is preferred and DASH is rare.
On Android, §2.4 requires DASH text tracks and §5 requires track preservation
across lifecycle events, so this is new work.

Both existing paths are `cycleAudioTrack` / `cycleSubtitleTrack` — cycling only,
with no listing UI and **no persistence of the selection**. §5 requires preserved
track selection across Activity recreation, so selection must become state, not
a transient cycle index.

### 6.4 Teardown depends on library `destroy()`, and is untested under abrupt death

`cleanupActiveTransport` relies on `hls.destroy()`, mpegts `pause/unload/
detachMediaElement/destroy`, and `dash.reset()`. Dash.js registers `ERROR` and
`STREAM_INITIALIZED` listeners and removes neither explicitly. The native path
does `pause()`, `removeAttribute('src')`, `load()` — it does not detach the
element, and nothing anywhere revokes an object URL.

Stale callbacks are guarded by `activeAttemptGeneration` + `isActiveAttempt`,
which also checks `player.isConnected`. That is a sound design and it is the
thing Phase 2 must *demonstrate* rather than assume, because Activity recreation
can destroy the WebView without ever firing `pagehide` — the event that calls
`playerCleanup()` and therefore `persistProgress()`.

### 6.5 No network-change handling exists

There is no `online` or `offline` listener and no reconnect path. Recovery today
is per-engine and one-shot: Hls.js gets one `startLoad()` for a fatal network
error and one `recoverMediaError()`, after which `failAttempt` advances the
fallback chain. §5's network rows are entirely new behavior.

### 6.6 `pagehide` disables performance tracing permanently

`pagehide` disables `performanceTrace` with no re-enable path. On webOS the app
is going away. On Android a WebView routinely survives `pagehide` and becomes
visible again, silently losing tracing for the rest of the process lifetime.

---

## 7. Guard scope — what a green build does not cover

Per plan §5, restated because it binds everything above.

Nothing outside `src/` and `webos-app/` is policed. `check-import-cycles` reads
only `src` and relative specifiers; `check-css-baseline` and `check-css-motion`
read only `src/style.css` and the generated `webos-app/style.css`;
`check-webos-bundle` reads only `webos-app/`; `design-contract.test.mjs` reads
literal `src/style.css` and `public/appinfo.json`.

**A green `npm run build` is evidence about webOS only. It must never be cited as
coverage of phone code.** Guards are extended in the same commit as the first
code movement they need to police — never preemptively.

---

## 8. Deliberately deferred to Phase 4

Per plan §6 Phase 1, these stay open and become blocking before Phase 4:

credential storage policy · catalog storage durability · Play distribution ·
package IDs · signing · branding · analytics · localization · accessibility
acceptance owner.

Note that §4.3 makes **catalog and download storage durability** a Phase 3
decision on probe evidence, ahead of the Phase 4 credential-policy work.

---

## 9. Open item requiring owner sign-off

**§2.3, the codec list.** Every other field in this document is either an owner
decision already taken or a fact read out of the code. The codec list is neither:
the codebase names no codec, so the mandatory set was stated from the shape of
Xtream Codes output and Android's guaranteed decoder set.

Sign-off is needed specifically on:

1. **HEVC Main/Main10 as mandatory** — if it is best-effort instead, the Phase 2
   pass bar drops and the corpus changes.
2. **AC-3 / E-AC-3 as best-effort with clean degradation** — if it is mandatory
   instead, WebView is very likely eliminated as a backend before Phase 2 begins,
   and Phase 2 should start on Media3 rather than proving A first.

Until signed off, treat §2.3 as the working assumption Phase 2's corpus is built
against, and nothing later than the corpus commit.
