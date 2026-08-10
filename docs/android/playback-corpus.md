# Phase 2 playback corpus

**Phase:** `plans/main-refactor-v3.md` Phase 1, step 4.
**Recorded:** 2026-08-09.
**Owner:** Arash Ghalamifard (`sghalamifard@adaptavist.com`).
**Status:** row set approved. **Acquisition and checksums are outstanding** — see §5.

The corpus is the fixed set of samples Phase 2 must produce a result for. Plan §6
Phase 2's exit criterion is a result for **every mandatory row** on the physical
phone; this file is what "every row" means, so that the bar cannot quietly move
once results start coming in.

Rows are derived from `docs/android/requirements.md` §2 (formats) and §5
(lifecycle). Where a row exists to prove a specific finding, that finding is cited.

---

## 1. Rules

1. **Legal only.** Every sample is a public reference stream or openly licensed
   content (Blender open movies are CC-BY). No ripped, paid or provider content.
2. **No private provider URLs or payloads in this repository** — per `CLAUDE.md`.
   Provider-side reachability is a separate, uncommitted test set: §4.
3. **Stable identity is the sample ID, not the URL.** Reference-stream URLs rot
   and are re-encoded in place. The ID plus the checksum is the contract.
4. **Checksums pin the artifact.** A row's result is only comparable across runs
   if the bytes are the same. Recorded at acquisition, per §5.
5. **Fixtures are not committed.** `fixtures/` is gitignored (`CLAUDE.md`) and
   several samples are large. The repository commits the *manifest* — ID, source,
   checksum — and the acquisition script. Not the media.
6. **A failing row is a result, not a gap.** Rows marked *expected failure* pass
   by failing cleanly. Silent failure is a fail.

---

## 2. Identity scheme

```
NP-<PROTOCOL>-<NNN>
```

`PROTOCOL` ∈ `HLS` | `DASH` | `TS` | `PROG`. Numbers are permanent: a retired row
keeps its number and is marked retired. Never renumber, never reuse.

---

## 3. Mandatory rows

Every row must be exercised on the **physical phone**. Per plan §6, an emulator
does not count. For each, Phase 2 records the evidence listed in §3.4.

### 3.1 Core format matrix

| ID | Proves | Protocol / container / codecs | Expected engine on Android | Expected result |
|---|---|---|---|---|
| `NP-HLS-001` | Baseline HLS VOD works at all | HLS · fMP4 · H.264 + AAC-LC | Hls.js | Pass |
| `NP-HLS-002` | HLS with TS segments — the common IPTV shape | HLS · MPEG-TS segments · H.264 + AAC-LC | Hls.js | Pass |
| `NP-HLS-003` | Live HLS continuity and live edge | HLS live · TS · H.264 + AAC-LC | Hls.js | Pass |
| `NP-HLS-004` | HEVC decode through MSE (`requirements.md` §2.3) | HLS · fMP4 · HEVC Main + AAC-LC | Hls.js | Pass — **the HEVC-mandatory sign-off row** |
| `NP-DASH-001` | Baseline DASH VOD | DASH · fMP4 · H.264 + AAC-LC | Dash.js | Pass |
| `NP-DASH-002` | DASH live | DASH live · fMP4 · H.264 + AAC-LC | Dash.js | Pass |
| `NP-TS-001` | **Raw MPEG-TS over HTTP — the highest-risk row** (`requirements.md` §2.5) | MPEG-TS · H.264 + AAC-LC | mpegts.js, **no native fallback** | Pass |
| `NP-TS-002` | MPEG-TS carrying HEVC | MPEG-TS · HEVC Main + AAC-LC | mpegts.js | Pass |
| `NP-PROG-001` | Progressive MP4 via native `<video>` | MP4 · H.264 + AAC-LC | native | Pass |

> `NP-TS-001` and `NP-TS-002` exist because on webOS `nativeTransportStream` is
> forced true and native transport is *preferred*, while on Android both collapse
> to false. The webOS device's entire MPEG-TS history transfers to Android not at
> all. If any row in this corpus is going to fail, expect it here.

### 3.2 Track enumeration and switching

Per plan §6 Phase 2, a track row passes only on an **observable audio or subtitle
change validated at the backend** — never by a UI label.

| ID | Proves | Shape | Path exercised |
|---|---|---|---|
| `NP-HLS-005` | HLS audio renditions enumerate and switch | HLS · ≥2 audio renditions, distinct languages | `hls.audioTracks` / `hls.audioTrack` in `cycleAudioTrack` |
| `NP-HLS-006` | HLS subtitle renditions enumerate and switch | HLS · ≥2 subtitle renditions | `hls.subtitleTracks` / `hls.subtitleTrack` in `cycleSubtitleTrack` |
| `NP-DASH-003` | **DASH audio adaptation sets** — no discovery path exists today (`requirements.md` §6.3) | DASH · ≥2 audio adaptation sets | none — **new work, expected to fail before it is built** |
| `NP-DASH-004` | **DASH text adaptation sets** — same gap | DASH · ≥1 text adaptation set | none — **new work, expected to fail before it is built** |
| `NP-PROG-002` | Native `AudioTrackList` switching | MP4 · ≥2 audio tracks | `video.audioTracks[i].enabled` in `cycleAudioTrack` |

> `NP-DASH-003` and `NP-DASH-004` are expected to fail on first run. That is the
> point: they convert a code-reading finding into a measured one, and they are the
> acceptance rows for the DASH track work Phase 3 must do.

### 3.3 Negative and degradation rows

These pass by failing **explicitly and legibly**. A hang, a silent stall, an
indefinite spinner, or picture-without-sound presented as success is a fail.

| ID | Proves | Shape | Required behavior |
|---|---|---|---|
| `NP-PROG-003` | MKV is out of scope and fails cleanly (`requirements.md` §2.2) | Matroska · H.264 + AAC | Explicit unsupported-format error. Routes to `native` by default extension handling and is expected not to decode. |
| `NP-TS-003` | **AC-3 audio with decodable video** — the worst failure mode available (`requirements.md` §2.3) | MPEG-TS · H.264 + AC-3 | If audio cannot decode: explicit unsupported-audio error. **Silent playback presented as success is a fail.** |
| `NP-TS-004` | E-AC-3 variant of the above | MPEG-TS · H.264 + E-AC-3 | As `NP-TS-003`. |
| `NP-HLS-007` | A broken manifest surfaces an error rather than hanging | HLS · deliberately corrupt / 404 manifest | Explicit playback error within the watchdog window; fallback chain exhausts via `describePlaybackFailure`. |
| `NP-HLS-008` | Cancellation leaves nothing behind (plan §6 Phase 2 step 4) | any two distinct HLS rows | Cancel A during manifest load, and again mid-playback. No stale callback, state or audio from A. B then starts cleanly. |

> `NP-TS-003` and `NP-TS-004` decide more than they look like they do. If the
> owner upgrades AC-3 from best-effort to mandatory (`requirements.md` §9), these
> stop being degradation rows and become pass/fail rows that WebView is unlikely
> to satisfy — which would start Phase 2 on Media3 instead of proving A first.

### 3.4 Evidence required per row

Per plan §6 Phase 2 step 3, each row records:

- manifest/container and codec identification, as reported by the engine
  (`HlsBufferCodecsData`, mpegts.js `MEDIA_INFO`) — not as assumed from the URL;
- first decoded video frame, and audible audio, both confirmed on the device;
- seek / pause / resume, where applicable;
- enumerated audio and subtitle tracks, successful selection, and observable
  change validated at the backend;
- live continuity, where applicable;
- errors and backend events, **with credentials and private URLs redacted**;
- selected engine and the fallback chain actually walked, since
  `planPlaybackAttempts` may reach a different engine than expected.

Results land in `docs/android/playback-spike-results.json`.

### 3.5 Lifecycle rows

Not sample-based. Every row of `docs/android/requirements.md` §5 is a mandatory
Phase 2 proof row, exercised against `NP-HLS-003` (live) and `NP-HLS-001` (VOD)
at minimum, plus the §4 feature behaviors: background audio, PiP, downloads and
casting. They are defined there and not duplicated here.

---

## 4. Provider reachability — separate, and never committed

Plan §6 Phase 2 step 6 requires proving cleartext/CORS behavior against approved
provider test cases. Those are **not part of this corpus** and must not enter the
repository: real panel hostnames, credentials and payloads are device-local only
per `CLAUDE.md`.

They are held outside version control. What may be committed is the *shape* of
the result — cleartext permitted/blocked, CORS present/absent, redirect behavior,
HTTP status class — with hostnames and credentials redacted. The resulting
allowlist populates the network security config per `requirements.md` §3.

---

## 5. Acquisition and checksums — outstanding

**This is the incomplete part of Phase 1, and it is stated rather than papered
over.**

Phase 1 is documentation-only, so no sample has been fetched and therefore **no
checksum has been computed**. Fetching writes to `fixtures/`, which is outside
`docs/`. The row set above is fixed; the artifacts behind it are not yet pinned.

The required procedure, to run as the **first task of Phase 2**, before any
playback is attempted:

1. Source each row from public reference streams — candidate sources: Apple's
   HLS example streams, the DASH-IF test vectors, Unified Streaming's demo
   assets, and Blender open movies (Big Buck Bunny, Sintel, Tears of Steel) for
   locally re-muxed rows. **Verify each URL at acquisition time**; published
   reference URLs move and are re-encoded in place.
2. Rows that no public stream provides — notably the AC-3 and multi-audio TS
   rows — are produced locally by re-muxing openly licensed source with ffmpeg.
   Commit the ffmpeg invocation, not the output.
3. Record for each row: resolved source URL, acquisition date, byte size, and
   **SHA-256**.
4. Write that manifest to `fixtures/playback-corpus.lock.json`, and commit a
   copy of the manifest (not the media) alongside this document.
5. A row whose sample cannot be legally sourced is **escalated, not dropped**.
   Removing a mandatory row silently is the failure mode plan §6 warns about:
   "Do not waive a row to preserve a preferred architecture."

Until step 4 exists, Phase 2 results are reproducible only within a single
session, and any cross-run comparison is unsound.
