# Phase 1 playback-corpus reproducibility audit

- **Audit date:** 2026-08-09
- **Baseline commit:** `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`
- **Status:** advisory evidence; not a corpus lock. This report proposes formats and rows; it pins nothing. No `fixtures/`, no `fixtures/playback-corpus.lock.json`, and no committed manifest exist at this commit.
- **Scope:** `docs/android/{requirements,playback-corpus,device-policy}.md`, `plans/main-refactor-v3.md`, `CLAUDE.md`, `.gitignore`, `package.json`, `src/playback-fallback.ts`, `src/media-engines.ts`, and targeted `src/main.ts` (capabilities `:3648-3666`, HLS codec probe `:3979`, DASH attempt `:4088-4121`, mpegts audio-only `:4069`, track cycling `:7284-7360`, lifecycle `:9054`/`:9070`). Read-only audit; no media acquired or generated.
- **Privacy policy:** This file contains no provider URLs, credentials, catalog payloads, private panel hostnames, chain-of-thought, prompt text, raw transcript, or media bytes. Only public reference/open-licence source families are named. This obeys `CLAUDE.md` (credentials are device-local only) and `playback-corpus.md` §1/§4.

The current corpus is **19 sample rows**: 9 core-format, 5 track, 5 negative/degradation, plus a non-sample lifecycle set (`playback-corpus.md` §3.5) that defers to `requirements.md` §5.

---

## A. Corpus completeness verdict

**FAIL — the corpus cannot yet reproducibly prove every pinned Phase 1 requirement, but it is fixable without committing any private provider material.** Four independent defects each block the claim:

1. **Nothing is pinned.** `playback-corpus.md` §5 states acquisition and checksums are outstanding; no `fixtures/`, lock file, or committed manifest exist at the baseline commit. Every result is therefore single-session reproducible only — the document says so itself. Cross-run comparison is unsound until a closure lock exists.
2. **Coverage gaps on mandatory requirements:** FLV, HE-AAC, HEVC **Main10** (10-bit), native `TextTrack` switching, downloads-by-protocol, and Cast (HLS/DASH + TS-unavailable) have no adequate row. H.264 is present only as un-profiled "H.264", not the mandated High@L4.1 ceiling.
3. **Classification contradictions:** live rows cannot be SHA-256 checksum-pinned as static artifacts; one top-level HLS/DASH SHA-256 cannot pin a dependency closure; and `NP-DASH-003/004` are simultaneously *mandatory* and *"expected to fail before it is built"*, colliding with the plan's "do not waive a row" / "any mandatory track failure forces the Media3 proof" decision rule.
4. **The corpus pre-commits the backend.** The "Expected engine on Android" column hard-codes Hls.js/Dash.js/mpegts.js/native — the WebView answer — before Phase 2's ADR chooses WebView vs Media3. The reproducibility contract must be backend-neutral.

The **row-set intent is sound and legal-by-construction** (public reference + CC-BY Blender + locally remuxed; media never committed). The failures are in coverage, pinning, and classification — not in legality.


---

## B. Requirement-to-row traceability table

Mandatory requirements from `requirements.md` §2/§4/§5, traced to `playback-corpus.md` rows.

| Requirement (source) | Row(s) | Status |
|---|---|---|
| HLS protocol §2.1 | NP-HLS-001/002/003 | Covered |
| MPEG-TS protocol §2.1/§2.5 | NP-TS-001/002 | Covered (backend-assumed) |
| MPEG-DASH protocol §2.1 | NP-DASH-001/002 | Covered |
| Progressive/native §2.1 | NP-PROG-001 | Covered |
| fMP4 container §2.2 | NP-HLS-001/004, NP-DASH-001/002 | Covered |
| MP4 progressive §2.2 | NP-PROG-001 | Covered |
| MPEG-TS container §2.2 | NP-TS-001/002 | Covered |
| **FLV container §2.2 (mandatory)** | none | GAP |
| MKV out-of-scope clean-fail §2.2 | NP-PROG-003 | Covered (valid negative) |
| H.264 up to **High@L4.1** §2.3 | NP-* "H.264" (no profile/level) | Under-specified |
| AAC-LC §2.3 | NP-* "AAC-LC" | Covered |
| **HE-AAC §2.3 (mandatory)** | none | GAP |
| HEVC **Main** §2.3 | NP-HLS-004, NP-TS-002 | Covered |
| **HEVC Main10 §2.3 (mandatory)** | none (all HEVC rows are 8-bit Main) | GAP |
| AC-3 / E-AC-3 best-effort §2.3 | NP-TS-003/004 | Covered (degradation) |
| HLS subtitle renditions §2.4 | NP-HLS-006 | Covered |
| **Native `TextTrack` switch §2.4 (mandatory)** | NP-PROG-002 is audio-only | GAP |
| **DASH text adaptation sets §2.4 (mandatory)** | NP-DASH-004 | Contradictory (mandatory + expected-fail) |
| DASH audio adaptation sets §5/§6.3 | NP-DASH-003 | Contradictory (same) |
| HLS audio renditions | NP-HLS-005 | Covered |
| Native `AudioTrackList` switch | NP-PROG-002 | Covered |
| Broken-manifest clean error | NP-HLS-007 | Covered |
| Cancellation leaves nothing (plan step 4) | NP-HLS-008 | Covered |
| Background audio §4.1 | §3.5 lifecycle vs NP-HLS-001/003 | Referenced, not enumerated |
| PiP §4.2 | §3.5 | Referenced, not enumerated |
| **Downloads by protocol §4.3 (mandatory)** | none | GAP |
| **Cast HLS + DASH; TS-unavailable §4.4** | none | GAP |
| Lifecycle events §5 (12 rows) | §3.5 defers to requirements §5 | Not enumerated as pinned IDs |


---

## C. Missing or incorrect rows

### C.1 Missing rows (each is a mandatory requirement with no adequate row)

- **FLV** — `requirements.md` §2.2 marks FLV mandatory. `mediaKindForUrl` (`playback-fallback.ts:106`) maps `.flv` to `transport-stream`, which routes to mpegts.js (`attemptsForSource:213`). No row exercises it. **Also incorrect:** `requirements.md` §2.1 files `.flv` under the "MPEG-TS" row with MIME `video/mp2t`. FLV is not MPEG-TS; mpegts.js demuxes FLV through a separate FLV demuxer, so NP-TS-001/002 evidence does not transfer to FLV. FLV needs its own row and its own container label.
- **HE-AAC** — §2.3 mandatory; every audio row is AAC-LC. HE-AAC (AAC-LC + SBR/PS) exercises a distinct decoder path and is a real Android field risk. No row.
- **HEVC Main10** — §2.3 mandates "Main and Main10". NP-HLS-004 and NP-TS-002 are both 8-bit Main. 10-bit is a separate hardware-decode capability (many decoders do Main but not Main10). No row.
- **Native `TextTrack` switching** — §2.4 mandates enumerate + switch via `mode='showing'`; the path is `cycleSubtitleTrack`/`video.textTracks` (`main.ts:7340,7348`). NP-PROG-002 covers only `AudioTrackList`. No native-text row.
- **Downloads by supported protocol** — §4.3 mandatory (VOD). Download semantics differ per protocol (progressive = byte copy; HLS/DASH = segment-closure fetch + repackage; raw TS). No download row and no "interrupted write must never present a partial file as playable" proof row.
- **Cast HLS and DASH** — §4.4 mandates casting for HLS and DASH, and MPEG-TS presenting Cast as unavailable with a reason. No cast rows and no TS-cast-unavailable negative row.

### C.2 Incorrect / under-specified rows

- **H.264 High@L4.1** — rows say only "H.264". The mandated ceiling (High profile, Level 4.1, 1080p) is exactly the field-decode limit worth pinning. Make profile/level explicit and add a dedicated 1080p High@L4.1 ceiling row.
- **`NP-TS-003/004` backend feasibility** — the rows assume mpegts.js surfaces an AC-3/E-AC-3 unsupported-audio signal at decode. mpegts.js typically demuxes AAC/MP3 in TS, not AC-3, so it may reject at demux (`ErrorDetails.MEDIA_CODEC_UNSUPPORTED`, `media-engines.ts:80`) rather than produce the "video plays, audio silently fails" mode. The observation contract must accept a demux-level rejection as a clean pass. Note also `main.ts:4069` only raises `audio-only` when `hasVideo === false && hasAudio` — the inverse of the AC-3 case — so the explicit unsupported-audio surface these rows require is new work, not existing behavior.

### C.3 Contradictory / impossible-as-written classifications

- **Mandatory + expected-to-fail-until-Phase-3:** `NP-DASH-003` and `NP-DASH-004`. Plan §6 exit criterion demands a result for every mandatory row, and the decision rule says any mandatory track failure forces the Media3 proof and forbids waiving a row. A row that is defined to fail cannot also be a Phase-2 pass gate. Resolution in §D and §K: reclassify as **capability-probe rows** (Phase 2 records enumeration-count evidence; the pass bar is "engine exposes the adaptation sets", not "Nova Play UI switches them"), and move the *switching* assertion to a Phase-3 acceptance row with its own ID.
- **Live rows as checksum-pinned:** NP-HLS-003 and NP-DASH-002 are live; a live edge has no stable byte stream, so a single SHA-256 is impossible. Resolved in §E by the deterministic local-live model.
- **Single top-level manifest checksum:** hashing only the `.m3u8`/`.mpd` pins none of the child playlists, representations, segments, or keys the playback actually consumes. Resolved by closure hashing in §E/§F.


---

## D. Revised row matrix (backend-neutral)

Backend-neutrality rule: rows state **protocol / container / codec-profile / track shape / expected observation**, never a named engine. The "engine actually reached" is *recorded evidence* (`planPlaybackAttempts` output), not a row precondition. This lets the same matrix score WebView, Media3, or a hybrid without edits.

Result vocabulary: `pass` · `clean-fail` (explicit, legible error) · `probe` (record measured capability; no pass/fail gate at Phase 2) · `n/a`.

### D.1 Core format (revised) — 9 kept + 4 added = 13

| ID | Proves | Protocol / container / codec | Expected observation |
|---|---|---|---|
| NP-HLS-001 | Baseline HLS VOD | HLS / fMP4 / H.264 High@L4.0 + AAC-LC | pass |
| NP-HLS-002 | HLS with TS segments | HLS / MPEG-TS seg / H.264 Main + AAC-LC | pass |
| NP-HLS-003 | Live HLS continuity + live edge | HLS live / TS / H.264 + AAC-LC | pass (live model, §E) |
| NP-HLS-004 | HEVC Main via MSE | HLS / fMP4 / HEVC Main 8-bit + AAC-LC | pass |
| NP-HLS-009 | **HEVC Main10** 10-bit via MSE (new) | HLS / fMP4 / HEVC Main10 + AAC-LC | pass |
| NP-HLS-010 | **H.264 High@L4.1 1080p ceiling** (new) | HLS / fMP4 / H.264 High@L4.1 + AAC-LC | pass |
| NP-DASH-001 | Baseline DASH VOD | DASH / fMP4 / H.264 + AAC-LC | pass |
| NP-DASH-002 | DASH live | DASH live / fMP4 / H.264 + AAC-LC | pass (live model, §E) |
| NP-TS-001 | Raw MPEG-TS over HTTP (highest risk) | MPEG-TS / H.264 + AAC-LC | pass |
| NP-TS-002 | MPEG-TS carrying HEVC | MPEG-TS / HEVC Main + AAC-LC | pass |
| NP-TS-005 | **HE-AAC audio** (new) | MPEG-TS / H.264 + HE-AAC v1 | pass |
| NP-PROG-001 | Progressive MP4 via native video | MP4 / H.264 + AAC-LC | pass |
| NP-FLV-001 | **FLV container** (new) | FLV / H.264 + AAC-LC | pass |

### D.2 Track enumeration and switching (revised) — 5 kept + 1 added = 6

| ID | Proves | Shape | Expected observation |
|---|---|---|---|
| NP-HLS-005 | HLS audio renditions switch | HLS / >=2 audio langs | pass (observable backend change) |
| NP-HLS-006 | HLS subtitle renditions switch | HLS / >=2 subtitle renditions | pass |
| NP-PROG-002 | Native `AudioTrackList` switch | MP4 / >=2 audio tracks | pass |
| NP-PROG-004 | **Native `TextTrack` switch** (new) | MP4 or MKV-in-scope-surrogate / >=1 in-band or fMP4 text track | pass (`mode='showing'`, observable) |
| NP-DASH-003 | DASH audio adaptation sets present | DASH / >=2 audio adaptation sets | **probe** (enumeration recorded; switching = Phase-3 row NP-DASH-005) |
| NP-DASH-004 | DASH text adaptation sets present | DASH / >=1 text adaptation set | **probe** (enumeration recorded; switching = Phase-3 row NP-DASH-006) |

### D.3 Negative / degradation (revised) — 5 kept = 5

| ID | Proves | Shape | Expected observation |
|---|---|---|---|
| NP-PROG-003 | MKV out-of-scope fails cleanly | Matroska / H.264 + AAC | clean-fail (explicit unsupported-format) |
| NP-TS-003 | AC-3 audio, decodable video | MPEG-TS / H.264 + AC-3 | clean-fail (explicit unsupported-audio; silent success = fail) |
| NP-TS-004 | E-AC-3 variant | MPEG-TS / H.264 + E-AC-3 | clean-fail (as NP-TS-003) |
| NP-HLS-007 | Broken manifest surfaces error | HLS / corrupt or 404 manifest | clean-fail within watchdog window |
| NP-HLS-008 | Cancellation leaves nothing | any two distinct HLS rows | pass (no stale callback/state/audio; B starts clean) |

### D.4 Feature rows (new; §4 requirements previously only referenced) — 6 added

| ID | Proves | Shape | Expected observation |
|---|---|---|---|
| NP-DL-001 | Download progressive VOD offline | MP4 progressive | pass (playable offline; deletable) |
| NP-DL-002 | Download HLS VOD offline | HLS closure fetch + repackage | pass |
| NP-DL-003 | Download DASH VOD offline | DASH closure fetch + repackage | pass |
| NP-DL-004 | Interrupted write never playable | any of the above, killed mid-write | clean-fail (partial file rejected, not shown as playable) |
| NP-CAST-001 | Cast HLS and DASH | HLS + DASH to a receiver | pass (handover, position, transport control) |
| NP-CAST-002 | MPEG-TS cast unavailable | MPEG-TS-only stream | clean-fail (Cast presented unavailable with reason; no fail-after-connect) |

### D.5 Lifecycle rows

Promote the 12 `requirements.md` §5 events and the four §4 feature behaviors to enumerated IDs (`NP-LIFE-001..NNN`) exercised against NP-HLS-003 (live) and NP-HLS-001 (VOD) at minimum, so "every mandatory row" is countable rather than a prose reference. Not media-pinned; scored on observed behavior.

**Revised sample-row total: 13 core + 6 track + 5 negative + 6 feature = 30 sample rows** (was 19), plus the enumerated lifecycle set.


---

## E. Reproducibility model for each media shape

The governing rule: **a row is reproducible only if every byte the player consumes to produce the recorded evidence is pinned.** A top-level manifest hash fails this because HLS/DASH manifests are *indirection* — they name child playlists, representations, initialization segments, media segments and (where present) key URIs. Two runs can hash-match on the `.m3u8`/`.mpd` while serving different segments after an in-place re-encode. Therefore each shape below defines a **closure**: the transitive set of resources, each hashed, plus an aggregate closure hash over the sorted list of `(relative-path, sha256, bytes)` tuples.

### E.1 Single-file progressive / TS / FLV
- Closure = the one artifact.
- Pin: `sha256`, `bytes`, and engine-reported `stream_metadata` (container, video codec/profile/level, audio codec/profile, resolution, duration).
- Deterministic: static bytes; nothing else to resolve.

### E.2 HLS dependency closure
- Fetch the master `.m3u8`; parse and recurse into every variant/media playlist; enumerate every segment (`.ts`/`.m4s`/`.mp4`), every `EXT-X-MAP` init segment, and every `EXT-X-KEY` URI.
- Hash each resource. Record `key_present: true/false`; if a key is fetched it is hashed like any resource (test/open keys only — no DRM in scope, `requirements.md` §2.6). Never store key *material* separately from the closure; never store a provider key.
- Aggregate closure hash over all tuples. Rewrite manifests to **relative paths** at acquisition so the closure is host-independent and no origin URL leaks into the lock.

### E.3 DASH dependency closure
- Fetch the `.mpd`; enumerate every Representation across every AdaptationSet (video, all audio adaptation sets, all text adaptation sets — this is exactly what NP-DASH-003/004 probe); resolve `SegmentTemplate`/`SegmentList`/`SegmentBase` + init segments to a concrete segment list; include every referenced segment.
- Hash each; aggregate closure hash. Record per-adaptation-set metadata (lang, codec, `contentType`) so the track-probe rows are pinned to a known set count.

### E.4 Deterministic generated / remuxed fixtures
- Source = an openly licensed input (Blender CC-BY) plus a **pinned ffmpeg recipe**: exact tool version, full argument vector, and the source input hash.
- Reproducibility is two-layer: (1) **recipe hash** = sha256 of the normalized command + input hash + tool version; (2) **output hash** = sha256 of the produced artifact. ffmpeg output is not bit-identical across builds/timestamps, so the *recipe* is the portable contract and the *output hash* pins one materialization. Strip non-deterministic metadata (`-map_metadata -1`, `-fflags +bitexact`, fixed muxer) to maximize reproducibility, and record both hashes.

### E.5 Live behavior — deterministic, not public-edge
- A public live edge is inherently unpinnable (moving window, re-encoded in place, may be geo/time-gated). Do **not** checksum a public live stream.
- Deterministic model: a **local test server replays a fixed, pinned VOD closure as a sliding live window** (looping segments with rewritten media sequence / availability times) so live-edge, continuity and reconnect behavior are exercised against **pinned bytes**. The closure hash pins the segments; the server config (window length, target duration, loop policy) is pinned in the lock.
- The public live endpoint may still be run as a **separate, non-pinned smoke observation** classified as `advisory` — never as the mandatory pass evidence. See §J classification.


---

## F. Proposed lock-file schema

Written to `fixtures/playback-corpus.lock.json` (gitignored working copy) with a committed copy alongside the corpus doc **containing manifest metadata only — never media, never a provider URL**. Public source URLs are permitted since they are public reference streams; provider material is forbidden entirely.

```jsonc
{
  "schema": "nova-play.corpus-lock/1",
  "baseline_commit": "7a4a3b163d436dd1727b9fad5356536e27ef8a7f",
  "generated_utc": "<ISO-8601>",
  "generator": { "tool": "acquire-corpus", "version": "<semver>" },
  "rows": [
    {
      "id": "NP-HLS-001",
      "shape": "hls",                     // progressive|ts|flv|hls|dash|dash-live|hls-live|remux
      "classification": "pinned",          // pinned | generated | live-local | advisory
      "source": {
        "family": "apple-hls-examples",    // named public/open family only
        "license": "public-reference | CC-BY-3.0 | CC-BY-4.0",
        "retrieved_utc": "<ISO-8601>",
        "public_url": "<public reference URL or null for generated>"
      },
      "closure": {
        "aggregate_sha256": "<hex>",
        "resource_count": 42,
        "total_bytes": 12345678,
        "resources": [
          { "path": "master.m3u8", "role": "manifest",  "sha256": "<hex>", "bytes": 512 },
          { "path": "v0/playlist.m3u8", "role": "child-playlist", "sha256": "<hex>", "bytes": 900 },
          { "path": "v0/init.mp4", "role": "init-segment", "sha256": "<hex>", "bytes": 1200 },
          { "path": "v0/seg0.m4s", "role": "segment", "sha256": "<hex>", "bytes": 400000 },
          { "path": "keys/k0.bin", "role": "key", "sha256": "<hex>", "bytes": 16 }
        ]
      },
      "stream_metadata": {
        "container": "fmp4",
        "video": { "codec": "h264", "profile": "high", "level": "4.0", "width": 1280, "height": 720 },
        "audio": [ { "codec": "aac-lc", "channels": 2, "lang": "en" } ],
        "text": [],
        "duration_s": 30.0
      },
      "recipe": null,                      // present only when classification=generated
      "live": null                          // present only when classification=live-local
    },
    {
      "id": "NP-TS-005",
      "shape": "remux",
      "classification": "generated",
      "source": { "family": "blender-open-movies", "license": "CC-BY-3.0",
                  "retrieved_utc": "<ISO-8601>", "public_url": "<open source URL>" },
      "closure": { "aggregate_sha256": "<hex>", "resource_count": 1, "total_bytes": 5000000,
                   "resources": [ { "path": "np-ts-005.ts", "role": "media", "sha256": "<hex>", "bytes": 5000000 } ] },
      "stream_metadata": { "container": "mpeg-ts",
        "video": { "codec": "h264", "profile": "high", "level": "4.1" },
        "audio": [ { "codec": "he-aac-v1" } ], "text": [] },
      "recipe": {
        "tool": "ffmpeg", "tool_version": "<exact version string>",
        "source_sha256": "<hex of Blender input>",
        "argv": ["-i","<input>","-c:v","libx264","-profile:v","high","-level","4.1",
                 "-c:a","libfdk_aac","-profile:a","aac_he","-fflags","+bitexact","-map_metadata","-1","<output>"],
        "recipe_sha256": "<hex over normalized argv + source_sha256 + tool_version>"
      },
      "live": null
    },
    {
      "id": "NP-HLS-003",
      "shape": "hls-live",
      "classification": "live-local",
      "source": { "family": "generated-from-pinned-vod", "license": "CC-BY-3.0",
                  "retrieved_utc": "<ISO-8601>", "public_url": null },
      "closure": { "aggregate_sha256": "<hex>", "resource_count": 20, "total_bytes": 8000000, "resources": [] },
      "stream_metadata": { "container": "mpeg-ts",
        "video": { "codec": "h264" }, "audio": [ { "codec": "aac-lc" } ], "text": [] },
      "recipe": null,
      "live": { "server": "local-live-replay", "target_duration_s": 6, "window_segments": 5, "loop": true }
    }
  ]
}
```

Invariants: every row has a non-null `closure.aggregate_sha256`; `generated` rows require a non-null `recipe`; `live-local` rows require a non-null `live` and a pinned closure; `pinned` rows require `recipe==null && live==null`; no `resources[].path` may be absolute or contain a host.


---

## G. Proposed result-file schema

Written to `docs/android/playback-spike-results.json` (plan §6 Phase 2). The schema is designed so a **waived or omitted row is structurally invalid**: results are validated against the lock, and a missing row or a `null`/absent result fails validation rather than passing silently.

```jsonc
{
  "schema": "nova-play.corpus-results/1",
  "baseline_commit": "7a4a3b163d436dd1727b9fad5356536e27ef8a7f",
  "lock_ref": { "file": "fixtures/playback-corpus.lock.json", "aggregate_of_aggregates_sha256": "<hex>" },
  "device": { "class": "A", "api_level": 26, "webview_major": 100, "backend": "webview|media3|hybrid" },
  "run_utc": "<ISO-8601>",
  "results": [
    {
      "id": "NP-HLS-001",
      "closure_aggregate_sha256": "<hex>",     // MUST equal the lock row; mismatch = invalid run
      "outcome": "pass",                        // pass | clean-fail | probe | error
      "engine_reached": "hls",                  // recorded evidence, not a gate
      "fallback_chain": ["hls"],                // planPlaybackAttempts walk actually taken
      "evidence": {
        "container_reported": "fmp4",
        "video_codec_reported": "avc1.640028",
        "audio_codec_reported": "mp4a.40.2",
        "first_video_frame": true,
        "audible_audio": true,
        "seek_ok": true, "pause_resume_ok": true,
        "tracks_enumerated": { "audio": 1, "text": 0 },
        "track_switch_observed": null,
        "live_continuity_ok": null,
        "backend_events": ["<redacted, no URLs/credentials>"]
      }
    }
  ],
  "validation": {
    "expected_row_ids": ["<every id from the lock>"],
    "present_row_ids":  ["<every id in results>"],
    "missing": [],                              // MUST be empty to be a valid run
    "extra": [],
    "waived": []                               // field exists ONLY to be asserted empty; any entry = invalid
  }
}
```

Anti-waiver rules enforced by a validator (later execution, not now):
1. `validation.missing` must be empty — every lock row id must appear in `results`.
2. No `results[].outcome` may be null/absent; the only legal values are the four enumerated.
3. Each `results[].closure_aggregate_sha256` must equal the lock — a run against unpinned bytes is rejected.
4. `probe` is legal only for rows the lock marks probe-eligible (NP-DASH-003/004); using it elsewhere is invalid.
5. `validation.waived` must be `[]`; the field is present precisely so its emptiness is asserted, closing the "silently drop a mandatory row" hole plan §6 warns about.


---

## H. Candidate legal sources and generation methods, with confidence

Confidence reflects whether the licence and technical shape can be **verified at acquisition**, not a promise the URL is live today. No source is asserted suitable until the executor verifies its licence and stream shape (`playback-corpus.md` §5 step 1). URLs are deliberately not enumerated here; families are named.

| Rows | Candidate family | Method | Licence basis | Confidence |
|---|---|---|---|---|
| NP-HLS-001, 004 | Apple HLS example streams (fMP4, H.264 + HEVC) | fetch closure | Public reference (Apple developer samples) | High |
| NP-HLS-002 | Apple/other TS-segment HLS examples | fetch closure | Public reference | High |
| NP-HLS-005, 006 | Multi-audio / multi-subtitle HLS test vectors | fetch closure | Public reference | Medium (exact >=2-lang set varies) |
| NP-DASH-001, 002, 003, 004 | DASH-IF test vectors; Unified Streaming demo assets | fetch closure | Public reference test vectors | High for 001/002; Medium for adaptation-set counts |
| NP-HLS-009 (HEVC Main10) | HEVC Main10 test vector, or remux from open Main10 source | fetch or ffmpeg | Public reference / CC-BY | Low–Medium (10-bit public HLS scarce; generation may be required) |
| NP-HLS-010 (H.264 High@L4.1) | remux Blender open movie to High@L4.1 | ffmpeg recipe | CC-BY-3.0/4.0 | High (generation deterministic) |
| NP-TS-001, 002 | remux Blender to raw TS (H.264 / HEVC) | ffmpeg recipe | CC-BY | High |
| NP-TS-005 (HE-AAC) | remux Blender audio to HE-AAC in TS | ffmpeg (needs HE-AAC encoder, e.g. libfdk_aac) | CC-BY | Medium (encoder availability/licensing of the ffmpeg build) |
| NP-TS-003, 004 (AC-3 / E-AC-3) | remux Blender to AC-3 / E-AC-3 in TS | ffmpeg recipe | CC-BY source; AC-3 encoder in ffmpeg | Medium |
| NP-PROG-001 | Blender progressive MP4 | direct or remux | CC-BY | High |
| NP-PROG-002 (multi-audio MP4) | remux Blender with 2 audio tracks | ffmpeg recipe | CC-BY | High |
| NP-PROG-004 (native TextTrack) | MP4/fMP4 with in-band or sidecar-muxed text track | ffmpeg / test vector | CC-BY / public reference | Medium (native in-band text support is the thing under test) |
| NP-PROG-003 (MKV clean-fail) | remux Blender to Matroska | ffmpeg recipe | CC-BY | High |
| NP-FLV-001 | remux Blender to FLV (H.264 + AAC) | ffmpeg recipe | CC-BY | High |
| NP-HLS-007 | locally authored corrupt/truncated manifest | generate | n/a (self-authored) | High |
| NP-HLS-008 | any two distinct HLS rows above | reuse | as above | High |
| NP-HLS-003, NP-DASH-002 (live) | local live-replay server over a pinned VOD closure | generate (§E.5) | CC-BY closure | High |
| NP-DL-001..004 | reuse progressive/HLS/DASH rows | exercise download path | as above | High (source); download behavior is new work |
| NP-CAST-001, 002 | reuse HLS/DASH/TS rows against a Cast receiver | exercise cast path | as above | Medium (requires a physical receiver; not media-limited) |

Generation strategy summary: prefer **public reference** for HLS/DASH baselines and **deterministic ffmpeg remux from Blender CC-BY** for every codec/container permutation a public stream does not cleanly provide, committing the recipe not the output (`playback-corpus.md` §5 step 2).


---

## I. Acquisition executor checklist

The acquisition script (Phase 2, task 1, before any playback) must, for every row, record:

1. **Source and licence** — named family + licence identifier (`public-reference`, `CC-BY-3.0`, `CC-BY-4.0`); refuse to proceed on an unverifiable licence.
2. **Retrieval date** — ISO-8601 UTC per resource.
3. **Tool versions** — exact version strings for every tool touched (fetcher, ffmpeg, any packager), verbatim, never `latest`.
4. **Command** — the full normalized argument vector for generated rows; the resolved public URL for fetched rows.
5. **Source hashes** — sha256 + bytes of every input (fetched resource or ffmpeg source).
6. **Output hashes** — sha256 + bytes of every produced/fetched artifact.
7. **Stream metadata** — container, video codec/profile/level/resolution, each audio codec/profile/lang/channels, each text track lang, duration — read from the bytes (ffprobe), not assumed from the URL.
8. **Complete closure hashes** — every manifest, child playlist, representation, init segment, media segment, and key (open/test keys only), plus the aggregate closure hash; manifests rewritten to relative paths so no host leaks.
9. **Recipe hash** for generated rows; **live config** for live-local rows.
10. **Determinism flags** for ffmpeg (`-fflags +bitexact`, `-map_metadata -1`, fixed muxer) and a note where bit-exactness is not achievable, so the recipe is the portable contract and the output hash pins one materialization.
11. **Write targets** — media to gitignored `fixtures/`; the lock to `fixtures/playback-corpus.lock.json` with a committed metadata-only copy; never commit media.
12. **Escalate, never drop** — a row whose sample cannot be legally sourced is escalated per `playback-corpus.md` §5 step 5, not silently removed.

---

## J. Privacy and secret controls

Applies to URLs, manifests, logs, and generated locks; enforces `CLAUDE.md` (device-local credentials, sanitize captures) and `playback-corpus.md` §4.

1. **No provider material anywhere** in the corpus, lock, or results — no panel hostnames, credentials, catalog payloads, or stream URLs. Provider reachability stays uncommitted (`playback-corpus.md` §4); only redacted *shape* (cleartext yes/no, CORS present/absent, status class) may be recorded.
2. **Manifests rewritten to relative paths** at acquisition so no origin host — provider or otherwise — is embedded in a committed closure. This also removes tokenized/signed query strings that public CDNs sometimes attach.
3. **Keys are closure resources, not secrets** — only open/test ClearKey-style keys used by public vectors are ever hashed; DRM is out of scope (`requirements.md` §2.6), so no licence material exists to leak. Never store real provider keys.
4. **Log/backend-event redaction** — `results[].evidence.backend_events` must be scrubbed of URLs and credentials before commit (`playback-corpus.md` §3.4). The result validator should reject any string matching a URL or credential pattern.
5. **Metadata proxy stays HTTPS-only and un-allowlisted** (`requirements.md` §3) — never appears in the corpus.
6. **Two evidence classes for live:** `live-local` (pinned, mandatory) vs `advisory` (public-edge smoke, non-pinned, never the pass gate). Advisory rows must carry no captured provider data.
7. **Committed lock is metadata-only** — media bytes live only in gitignored `fixtures/`; APK/AAB embedding of the bundle stays gitignored (`.gitignore`, `CLAUDE.md`) so no closure leaks through a build artifact.
8. **No chain-of-thought, prompt text, or transcript** in any committed audit/result artifact — this report included.

---

## K. Blockers that may require a requirement change

1. **DASH track work is Phase 3, but §5 requires track preservation across lifecycle.** NP-DASH-003/004 cannot be Phase-2 pass gates (no discovery path exists, `requirements.md` §6.3). Resolution taken here: reclassify as **probe** rows in Phase 2 and add Phase-3 acceptance rows (NP-DASH-005/006). If the owner insists DASH track *switching* is a Phase-2 mandatory pass, either Phase 3 work moves into the spike or the requirement is deferred — an owner decision, not an auditor one.
2. **AC-3 / E-AC-3 pending owner sign-off (`requirements.md` §9).** If upgraded from best-effort to mandatory, NP-TS-003/004 flip from clean-fail rows to pass rows that WebView is unlikely to satisfy, which per plan §6 starts Phase 2 on Media3. The corpus is built against the working assumption (best-effort) until sign-off; the flip changes the pass bar, not the bytes.
3. **HEVC Main10 mandatory but public 10-bit HLS is scarce.** NP-HLS-009 likely requires generation, and Main10 hardware decode is "not architecturally guaranteed" (`requirements.md` §2.3). A device that fails Main10 is a real requirement-vs-reality conflict the owner must adjudicate (drop Main10 to best-effort, or accept reduced device reach).
4. **HE-AAC / AC-3 generation depends on encoder availability.** NP-TS-005/003/004 need an ffmpeg build with the right encoders (e.g. libfdk_aac); a stock build may lack them, forcing either a documented toolchain requirement or a sourced test vector. Verify at acquisition.
5. **Cast and downloads are entirely new native surface** (`requirements.md` §4.3/§4.4; Cast "cannot be implemented inside the WebView"). NP-CAST-* and NP-DL-* cannot be proven by media alone; they need a physical Cast receiver and the download path built. If Phase 2 is scoped to playback only, these rows belong to a named later gate rather than the Phase-2 exit criterion — an explicit scoping decision the plan currently leaves implicit.
6. **FLV mislabelled as MPEG-TS (`requirements.md` §2.1).** The doc groups `.flv` under the `video/mp2t` row; the identity scheme (`playback-corpus.md` §2) has no FLV token. Adding NP-FLV-001 requires extending `PROTOCOL` to include `FLV`, a corpus-doc change beyond this audit's write scope — flagged for the execution prompt.
