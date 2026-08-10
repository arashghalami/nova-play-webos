# Phase 1 codec-policy audit

- **Audit date:** 2026-08-09
- **Baseline commit:** `7a4a3b163d436dd1727b9fad5356536e27ef8a7f` (`docs(plans): council verdict on the three-app plan`)
- **Status:** advisory evidence; not normative requirements. This document informs the owner sign-off on `docs/android/requirements.md` §2.3; it does not itself amend that document.
- **Scope:** codec-support policy for the Nova Play Android phone app at the Phase 1 floor of **API 26 (Android 8.0)** with a **System WebView major ≥ 100** floor. Resolves the `requirements.md` §9 sign-off items for H.264 High@L4.1, HEVC Main, HEVC Main10, AAC-LC, HE-AAC, AC-3 and E-AC-3, and qualifies the Media3 AC-3 decoder-extension claim. Out of scope: architecture changes, backend selection (that is the Phase 2 gate), and any format not already routed by the shipping code.
- **Primary-source policy:** conclusions are grounded first in `developer.android.com`, the Android Compatibility Definition Document (CDD) for Android 8.0 on `source.android.com`, and the AndroidX Media3 official documentation and source. Vendor marketing and unsourced generalizations are excluded. Code claims are grounded in the shipping source at the baseline commit (`src/main.ts`, `src/media-engines.ts`, `src/playback-fallback.ts`). Full URLs are in section G.

---

## A. Executive verdict

The `requirements.md` §2.3 codec list is **directionally sound but overstated on three specific claims**, each of which changes the Phase 2 pass bar. Corrected verdicts:

1. **H.264 "up to High@L4.1 … Guaranteed on every API 26+ device" — reject as written.** API 26 (CDD §5.3.4) guarantees only **Baseline Profile + Main Profile Level 3.1** decode (SD, including 720p30). **High Profile is not a handheld MUST at any level;** High Profile Level 4.2 is a *Television*-only requirement (CDD §5.3.4/T-1-1). H.264 High@L4.1 is near-universal on real handsets but is **not an architectural guarantee** — it is a best-effort ceiling to be measured in Phase 2, not a floor.

2. **HEVC Main/Main10 "Mandatory" across all devices — reject as written; split the claim.** HEVC **Main decode capability** *is* a handheld MUST at API 26 (CDD §5.3/H-0-2), but only guaranteed at **Main Profile Level 3 Main tier / SD**; HD HEVC is a MUST **only where a hardware decoder exists** (§5.3.5/C-1-2). **Main10 (10-bit) is not mandated on handhelds at all** at API 26 — the only Main10 clause is Television UHD (Main10 Level 5, §5.3.5/T-2-1). Separately, the app reaches HEVC through **WebView MSE**, and MSE may not expose HEVC even where the platform decoder exists, so a universal "Mandatory pass" is unsupportable without device evidence.

3. **AC-3 / E-AC-3 "best-effort, must degrade cleanly" — accept.** Correct: no Android version and no API-26 CDD clause mandates AC-3 or E-AC-3 decode on handhelds. The only inaccuracy is the trailing claim that "Media3 can be built with a bundled AC-3 decoder extension," which is true only in a heavily qualified sense (section C.3).

**Resolution of the §9 sign-off question.** Sign off **HEVC Main as an eligibility requirement for a declared HEVC/HD capability class** (not a universal mandatory), **HEVC Main10 as best-effort with clean degradation**, **AC-3/E-AC-3 as best-effort with clean degradation** (unchanged), and **restate the H.264 floor as Baseline + Main@L3.1, with High@L4.1 a best-effort ceiling validated in Phase 2** rather than a guarantee. AAC-LC and HE-AAC remain **mandatory** and are genuinely guaranteed at API 26 (CDD §5.1.2).

---

## B. Verified codec-support table

The five layers required by the task are kept explicitly separate:

- **API 26 platform guarantee** — a MUST in the Android 8.0 CDD (`source.android.com`).
- **Device-dependent decoder availability** — present in practice but conditional, optional, or OEM-licensed; not guaranteed.
- **Media3 extractor support** — whether ExoPlayer can *demux* the container (independent of decode).
- **Decoder support** — whether a decoder can actually decode the sample (platform `MediaCodec` or a Media3 software extension).
- **WebView / MSE exposure** — what the app's actual Android path (Hls.js / Dash.js / mpegts.js over Media Source Extensions, plus native `<video>`) can reach; this is narrower than the platform decoder set.

| Codec / profile | API 26 platform guarantee (CDD 8.0) | Device-dependent HW availability | Media3 extractor | Decoder support | WebView / MSE exposure |
|---|---|---|---|---|---|
| **H.264 Baseline** | MUST decode (§5.3/H-0-1; §5.3.4/C-1-1) | Universal | MP4, FMP4, MPEG-TS, Matroska, FLV | Platform `MediaCodec` | Guaranteed (`avc1.*`) |
| **H.264 Main@L3.1 (SD, 720p30)** | MUST decode (§5.3.4/C-1-1, C-1-2) | Universal | as above | Platform `MediaCodec` | Guaranteed |
| **H.264 720p / 1080p** | Conditional MUST only if display height ≥ resolution (§5.3.4/C-2-1, C-2-2), at Baseline/Main | Near-universal | as above | Platform `MediaCodec` | Likely; not architecturally guaranteed |
| **H.264 High@L4.1** | **No platform guarantee** (High Profile not a handheld MUST; High@L4.2 is TV-only, §5.3.4/T-1-1) | Near-universal in practice | as above | Device decoder if present | **Device-dependent; must be measured** |
| **AAC-LC** | MUST decode (§5.1.2/C-1-1) | Universal | MP4, ADTS, MPEG-TS, 3GP | Platform `MediaCodec` | Guaranteed (`mp4a.40.2`) |
| **HE-AAC v1/v2** | MUST decode (§5.1.2/C-1-2, C-1-3; platform page: Android 4.1+) | Universal | as above | Platform `MediaCodec` | Generally yes; SBR/PS handling varies by WebView — measure |
| **HEVC Main** | Decoder MUST exist (§5.3/H-0-2) but only guaranteed at **Main@L3 / SD**; HD only if HW decoder (§5.3.5/C-1-1, C-1-2) | HD HEVC near-universal on real phones | MP4, Matroska, MPEG-TS | Platform `MediaCodec` (SD guaranteed; HD device-dependent) | **Not guaranteed even when the platform decodes it;** `MediaSource.isTypeSupported("…hev1/hvc1…")` is WebView- and device-dependent |
| **HEVC Main10 (10-bit)** | **No handheld guarantee** (Main10 L5 is TV-UHD only, §5.3.5/T-2-1) | Common on mid/high-end | as above | Device decoder if present | Device-dependent; typically weaker than Main |
| **AC-3 (Dolby Digital)** | **Not mandated** (absent from §5.1.2 decode list) | Licensed OEM add-on (many Samsung/Sony); often HDMI passthrough only | MPEG-TS, MP4 extractable | **Only** via manually built Media3 FFmpeg extension (`ac3`), else OEM `MediaCodec` | **Not exposed** by WebView/MSE in practice |
| **E-AC-3 (Dolby Digital Plus)** | **Not mandated** (absent from §5.1.2 decode list) | Licensed OEM add-on | MPEG-TS, MP4 extractable | **Only** via FFmpeg extension (`eac3`), else OEM `MediaCodec` | **Not exposed** by WebView/MSE in practice |

**Container / protocol context (primary sources).**

- Media3 extracts MP4, FMP4, M4A, **Matroska**, WebM, **MPEG-TS**, MPEG-PS, FLV, ADTS, Ogg, WAV, FLAC and AMR (Media3 supported-formats page). Extraction is independent of decode: a container being demuxable does not imply its samples decode.
- The Android platform's native network protocols are RTSP, HTTP/HTTPS progressive, and HTTP/HTTPS live streaming "**MPEG-2 TS media files only**" (platform supported-formats page, Network protocols). This confirms `requirements.md` §2.1: the platform's native HLS is TS-only and is not the app's path; the app is MSE-driven via Hls.js, which is why native HLS is effectively unavailable in the Android WebView.
- The shipping code names **no codec anywhere**: codec strings arrive at runtime (`HlsBufferCodecsData.video.codec`; mpegts `MEDIA_INFO.videoCodec`) and are probed only generically via `MediaSource.isTypeSupported(\`${container}; codecs="${codec}"\`)` (`src/main.ts:3979`). `nativeTransportStream` and `preferNativeTransport` both collapse to `false` on Android (`src/main.ts:3660,3665`). Native HLS detection is `canPlayType` only (`src/main.ts:3648-3651`). These code facts are verified at the baseline commit.

---

## C. Claims in requirements.md that are inaccurate or too broad

### C.1 — §2.3 row: "H.264 / AVC, up to High@L4.1 … Guaranteed on every API 26+ device"

Inaccurate. The API 26 guarantee is **Baseline + Main@L3.1** (CDD §5.3.4/C-1-1, C-1-2). High Profile has **no** handheld MUST; High@L4.2 exists only as a Television requirement (§5.3.4/T-1-1). The phrase conflates "practically ubiquitous" with "architecturally guaranteed." Even 720p/1080p decode is only a *conditional* MUST tied to display height (§5.3.4/C-2-1, C-2-2), and then at Baseline/Main, not High. **Recommended:** state the floor as Baseline + Main@L3.1; classify High@L4.1 as best-effort, validated by a Phase 2 corpus row.

### C.2 — §2.3 row: "HEVC / H.265, Main and Main10 … Mandatory"

Too broad on two counts. (a) **Main10 is not guaranteed on API-26 handhelds** — there is no handheld MUST for 10-bit HEVC; the only Main10 clause is Television UHD (Main10 Level 5, §5.3.5/T-2-1). (b) HEVC **Main** decode is a *platform* MUST but only at **Main@L3 / SD**; HD is conditional on the presence of a hardware decoder (§5.3.5/C-1-2). Because the app reaches HEVC through **WebView MSE**, platform decoder existence does not imply MSE exposure. The parenthetical in the row ("Hardware decode is near-universal but not architecturally guaranteed") is more accurate than the row's own "Mandatory" class label — **the class label is the defect.** Recommended: HEVC Main as an eligibility requirement for a declared capability class; Main10 as best-effort with clean degradation.

### C.3 — §2.3 warning: "Media3 can be built with a bundled AC-3 decoder extension"

Misleadingly simple; does not survive primary evidence. Verified against the Media3 supported-formats page and the `decoder_ffmpeg` module README:

- **No dedicated AC-3 extension exists.** AC-3/E-AC-3 decode is available **only through the Media3 FFmpeg software-decoder extension**, which maps sample formats to FFmpeg decoders `ac3` and `eac3` and must have those decoders selected at build time.
- **Publication:** the FFmpeg module is **not published on Google's Maven repository** (README, referencing ExoPlayer issue 2781). It cannot be pulled as a normal Gradle dependency; the project must be cloned and depended on locally.
- **Build:** the FFmpeg native library must be **built manually** with the Android NDK before Gradle can bundle it, and the desired decoders must be explicitly enabled (`ENABLED_DECODERS=(... ac3 eac3)`).
- **ABI:** native binaries must be cross-compiled per ABI — `armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64` — and bundled into the APK, with corresponding APK-size cost.
- **Licensing:** the README's own License Note states that although the module code is Apache-2.0, "using this module also requires building and including one or more external libraries … These are licensed separately." AC-3 and E-AC-3 are **Dolby-patented**; shipping a Dolby decoder is a **Dolby licensing** obligation independent of FFmpeg's own licensing and independent of whether the decode works technically.
- **Maintenance:** a self-maintained FFmpeg pin (README recommends the `release/6.0` branch), recurring per-ABI rebuilds, and ongoing NDK/toolchain upkeep.
- **Windows-host implication:** the README explicitly does **not** support building this module on Windows (it suggests following the Linux steps under PowerShell without support). This repo's host is `win32`, so producing the AC-3-capable binaries would require a Linux/macOS build host, WSL, or CI — a real logistical cost, not a checkbox.

Net: "Media3 can be built with a bundled AC-3 decoder extension" is *possible* but is **not a drop-in**. It is a self-built FFmpeg cross-compile carrying separate Dolby licensing exposure and a non-Windows build requirement. Since this sentence is the stated reason AC-3 "is the row most likely to force the Media3 proof," the qualification is decision-relevant and should be recorded.

### C.4 — §2.2 (minor): "WebM … a restricted Matroska profile"

Acceptable simplification. WebM is a Matroska-derived container, not formally a "profile," but the distinction is not decision-relevant. No change required beyond optional wording.

**Verified accurate (no change needed):** every *code-derived* statement in §2 — no codec named in source; runtime-only codec strings; generic `isTypeSupported` probing; `nativeTransportStream`/`preferNativeTransport` collapsing to false on Android; native HLS via `canPlayType` only; DRM absent — matches the source at the baseline commit.

---

## D. Recommended owner sign-off wording, ready to paste

> **§2.3 codec sign-off — resolved 2026-08-09, as amended below.** Grounded in the Android 8.0 CDD, the Android platform media-formats documentation, and the AndroidX Media3 supported-formats documentation (see the Phase 1 codec-policy audit for full citations).
>
> **Mandatory floor (architecturally guaranteed at API 26):**
> - **H.264/AVC Baseline Profile and Main Profile up to Level 3.1** (SD, including 720p30). This is the guaranteed decode floor per CDD §5.3.4.
> - **AAC-LC** and **HE-AAC (v1 and v2)** audio decode, per CDD §5.1.2.
>
> **Best-effort ceiling (common, not guaranteed; validated in Phase 2, degrade cleanly):**
> - **H.264 High Profile, including High@L4.1.** Near-universal on real handsets but not a handheld guarantee at API 26 (High@L4.2 is a Television-only requirement). Treated as a best-effort capability, proven by a Phase 2 corpus row, not assumed.
>
> **Eligibility requirement for a declared HEVC/HD capability class:**
> - **HEVC/H.265 Main Profile.** Platform decode is guaranteed only at Main@L3/SD; HD HEVC depends on a hardware decoder and on WebView/MSE exposure. HEVC support is therefore an *eligibility* attribute of a device class, recorded per device in Phase 2, not a universal pass/fail applied to every beta handset.
>
> **Best-effort with clean degradation (not mandatory):**
> - **HEVC Main10 (10-bit).** Not mandated on API-26 handhelds. Where absent, playback must degrade cleanly with an explicit unsupported-video error.
> - **AC-3 (Dolby Digital) and E-AC-3 (Dolby Digital Plus).** Not mandated on any Android handset and not exposed by WebView/MSE in practice. When video decodes but audio does not, the app must detect it and surface an explicit unsupported-audio error, and must never present silent playback as success. Adding AC-3/E-AC-3 decode requires the self-built Media3 FFmpeg extension, which carries separate Dolby licensing, per-ABI native builds, a non-Windows build host, and ongoing maintenance; it is out of Phase 1 scope and is a Phase 2 backend consideration only.
>
> **Not required (unchanged):** VP9, AV1, Opus, FLAC, Vorbis — not refused if a device happens to decode them.
>
> **Consequence for Phase 2:** with AC-3/E-AC-3 confirmed best-effort and HEVC Main scoped to a capability class rather than a universal mandatory, the Phase 2 spike may begin on Alternative A (WebView) and prove it, rather than starting on Media3. Should the owner later raise AC-3/E-AC-3 or HEVC Main to universal-mandatory, WebView is very likely eliminated and Phase 2 should start on Media3.

---

## E. Exact corpus rows to add / change / remove

Against `docs/android/playback-corpus.md` at the baseline commit. Identity scheme `NP-<PROTOCOL>-<NNN>` is preserved; numbers are permanent and never reused.

### Change

- **`NP-HLS-004`** (HLS · fMP4 · HEVC Main + AAC-LC). Change expected result from unqualified **Pass** and the label "the HEVC-mandatory sign-off row" to **capability-classed**: *Pass on devices in the declared HEVC/HD capability class; clean unsupported-video error otherwise.* HEVC Main is no longer a universal mandatory (section C.2), so a blanket Pass would move the bar incorrectly on non-HEVC WebView devices.
- **`NP-TS-002`** (MPEG-TS · HEVC Main + AAC-LC). Same change: result is capability-classed, not universal Pass. HEVC over MPEG-TS through mpegts.js/MSE is doubly device-dependent (transport demux plus MSE HEVC exposure).
- **`NP-TS-003`** and **`NP-TS-004`** (AC-3 / E-AC-3 with decodable video). Keep as negative/degradation rows, and annotate that the "silent playback presented as success is a fail" bar is confirmed by primary sources: AC-3/E-AC-3 are not mandated and not exposed by WebView/MSE. Retain the note that if the owner raises AC-3/E-AC-3 to mandatory these become pass/fail rows WebView is unlikely to satisfy.

### Add

- **`NP-HLS-009`** — **H.264 High@L4.1, 1080p, HLS · fMP4 · H.264 High@L4.1 + AAC-LC.** Proves the best-effort H.264 ceiling explicitly rather than assuming it. Records profile, level, and hardware/software decoder status. Expected: Pass on the tested handset; capability-classed across the cohort.
- **`NP-PROG-004`** — **HE-AAC audio, MP4 progressive · H.264 Main + HE-AAC v1/v2.** No current row exercises HE-AAC even though it is mandatory; today HE-AAC is only implicit. Proves the SBR/PS path through the WebView audio decoder. Expected: Pass.
- **`NP-HLS-010`** — **HEVC Main10 (10-bit), HLS · fMP4 · HEVC Main10 + AAC-LC.** Proves the best-effort 10-bit path and its clean degradation. Expected: capability-classed Pass; clean unsupported-video error where absent. Distinct from `NP-HLS-004` (8-bit Main) so the 8-bit vs 10-bit boundary is measured, not assumed.

### Remove

- **None.** Per corpus rule 6 and plan §6, a mandatory row is escalated, not silently dropped. No row is removed by this audit; three are re-classified from universal-mandatory to capability-classed (above), which is a change, not a removal.

---

## F. Phase 2 runtime capability evidence schema

Each corpus row records one capability-evidence object per attempted decode, at the backend, not from the UI label or the URL. This is what turns the code-reading and documentation findings above into measured device facts. Fields:

| Field | Type | Source / meaning |
|---|---|---|
| `sampleId` | string | Corpus ID, e.g. `NP-HLS-009`. |
| `codec` | string | Codec family as reported by the engine (`HlsBufferCodecsData`, mpegts `MEDIA_INFO`), never assumed from the URL. |
| `profile` | string | e.g. `H.264 High`, `HEVC Main`, `HEVC Main10`. Parsed from the codec string / engine metadata. |
| `level` | string | e.g. `4.1`, `3.1`. From the codec string where present. |
| `bitDepth` | integer | 8 or 10. Distinguishes HEVC Main from Main10. |
| `resolution` | string | `width x height` of the decoded video, e.g. `1920x1080`. |
| `frameRate` | number | Measured decoded frame rate (fps). |
| `bitrate` | integer | Observed stream bitrate (bps) where available. |
| `decoderName` | string | The actual decoder chosen, e.g. `OMX.qcom.video.decoder.hevc` / `c2.android.*`, or the MSE/WebView decoder identity where obtainable. |
| `hardwareAccelerated` | enum | `hardware` \| `software` \| `unknown`. Whether the selected decoder is HW-backed. |
| `mseTypeSupported` | boolean | Result of `MediaSource.isTypeSupported(container; codecs=...)` for the row's codec string on this device/WebView. |
| `audioCodec` | string | Audio codec as reported by the engine (e.g. `mp4a.40.2`, `ac-3`, `ec-3`). |
| `audioDecoded` | boolean | Whether audible audio was confirmed on the device. |
| `videoDecoded` | boolean | Whether a first decoded video frame was confirmed on the device. |
| `adaptiveSupported` | boolean | Whether dynamic resolution/frame-rate switching within the stream worked (CDD §5.3/C-1-1 behavior), where the row is adaptive. |
| `failureClass` | enum | One of the existing `PlaybackFailureKind` values in `src/playback-fallback.ts`: `manifest`, `network`, `authorization`, `timeout`, `codec`, `decode`, `no-video-frames`, `audio-only`, `media-source`, `drm`, `unsupported`, `protocol`, `unknown`. `audio-only` is the canonical class for the "picture, no sound" AC-3/E-AC-3 failure. |
| `engine` | enum | Actual engine walked: `native` \| `hls` \| `mpegts` \| `dash` (from `planPlaybackAttempts`), which may differ from the expected engine. |
| `webViewMajor` | integer | Runtime System WebView major version (required by `device-policy.md` §4), recorded per result so codec facts are attributable to a WebView. |
| `deviceClass` | string | Cohort device-class label (OEM/SoC · API level · WebView major) per `device-policy.md` §3; never anything identifying a person. |

Reuse the existing `PlaybackFailureKind` union verbatim so evidence classification matches the shipping fallback logic rather than inventing a parallel taxonomy. Results land in `docs/android/playback-spike-results.json` per plan §6, with credentials and private URLs redacted.

---

## G. Sources with full URLs

Primary sources, consulted 2026-08-09:

1. Android platform — Supported media formats (codecs, containers, network protocols):
   https://developer.android.com/media/platform/supported-formats
2. Android Compatibility Definition Document, Android 8.0 (API 26) — §5.1 audio, §5.2 encoding, §5.3 decoding (H.264 §5.3.4, HEVC §5.3.5), handheld (H-) and television (T-) requirements:
   https://source.android.com/docs/compatibility/8.0/android-8.0-cdd
3. AndroidX Media3 / ExoPlayer — Supported formats (progressive containers, sample formats, software decoder extensions, FFmpeg decoder-name mapping including `ac3`/`eac3`):
   https://developer.android.com/media/media3/exoplayer/supported-formats
4. AndroidX Media3 — FFmpeg decoder module README (license note, Maven non-publication, NDK build steps, ABIs, `ENABLED_DECODERS`, Windows-host caveat):
   https://github.com/androidx/media/blob/release/libraries/decoder_ffmpeg/README.md
5. ExoPlayer issue 2781 — why decoder extensions are not distributed via Maven (referenced by source 4):
   https://github.com/google/ExoPlayer/issues/2781

Repository sources at baseline commit `7a4a3b163d436dd1727b9fad5356536e27ef8a7f` (for code-derived claims only): `src/main.ts` (capability block ~L3648-3666; codec probe L3979), `src/media-engines.ts`, `src/playback-fallback.ts`, `docs/android/requirements.md`, `docs/android/playback-corpus.md`, `docs/android/device-policy.md`, `plans/main-refactor-v3.md`.

---

## H. Remaining unknowns requiring physical-device evidence

None of the following can be resolved from documentation; each is a Phase 2 measurement on the physical phone and across cohort device classes:

1. **H.264 High@L4.1 decode in the WebView/MSE path** on the tested handset and across classes — whether `isTypeSupported` reports it and whether a first frame decodes at 1080p.
2. **HEVC Main exposure through MSE**, not merely platform decoder existence — many WebViews do not advertise `hev1`/`hvc1` even where `MediaCodec` decodes HEVC.
3. **HEVC Main10 (10-bit)** availability and clean degradation where absent.
4. **HEVC over MPEG-TS via mpegts.js** — transport demux plus MSE HEVC exposure combined (`NP-TS-002`).
5. **AC-3 / E-AC-3 behavior in the WebView** — confirm the expected "picture, no sound" mode and that it is detected and surfaced as `audio-only`, never silent success (`NP-TS-003`, `NP-TS-004`).
6. **HE-AAC SBR/PS decode** through the WebView audio path (`NP-PROG-004`).
7. **Actual decoder identity and hardware/software status** per codec — obtainable from Media3 in Alternative B, but only inferable in the WebView path; the degree to which it is observable is itself an unknown.
8. **Per-class variation** — codec stacks, OEM WebView forks, and level/profile limits differ by handset (`device-policy.md` §2); the one owned phone establishes feasibility on that phone only.

**Unresolved primary-source conflict:** none. The Android platform supported-formats page and the Android 8.0 CDD are consistent (the CDD adds the profile/level MUSTs the formats page omits), and the Media3 documentation and FFmpeg README agree on AC-3/E-AC-3 being extension-only. No primary source was found to contradict another.
