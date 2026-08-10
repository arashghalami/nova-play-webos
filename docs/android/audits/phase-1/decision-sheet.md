# Phase 1 owner decision sheet

- **Date:** 2026-08-09
- **Baseline commit:** `7a4a3b163d436dd1727b9fad5356536e27ef8a7f` (`docs(plans): council verdict on the three-app plan`)
- **Status:** awaiting owner approval
- **Sources (four advisory audits, all in this directory):**
  - [`codec-policy.md`](./codec-policy.md)
  - [`native-media-architecture.md`](./native-media-architecture.md)
  - [`playback-corpus-reproducibility.md`](./playback-corpus-reproducibility.md)
  - [`closure-governance.md`](./closure-governance.md)
- **Normative effect:** none until integrated. This sheet reconciles the four
  advisory audits into one internally consistent owner recommendation. It amends
  no normative document. `plans/main-refactor-v3.md`,
  `docs/android/requirements.md`, `docs/android/device-policy.md`, and
  `docs/android/playback-corpus.md` remain authoritative until the owner approves
  this sheet and a later task integrates the approved decisions into them.

This document does not vote or summarize. Where the four audits disagree, it
resolves the conflict against the pinned requirements, the primary evidence each
audit cites, delivery risk, and the strict intent-based Phase 1 closure standard
recorded as `P1-D01`.

---

## A. Integrated verdict

**Phase 1 is OPEN.** It is not "conditionally closed." The four audits are, taken
together, correct on substance but the closure-governance audit's
"CONDITIONALLY CLOSED" label understates what remains, and the
corpus-reproducibility audit's completeness verdict (FAIL, nothing pinned) is the
governing fact: an unlocked corpus alone keeps Phase 1 open under the intent-based
standard adopted here (`P1-D01`).

The integrated position across the four planes:

1. **Codec policy (from `codec-policy.md`).** The `requirements.md` §2.3 list is
   directionally right but overstated on three claims. The mandatory floor is
   H.264 Baseline + Main@L3.1, AAC-LC, and HE-AAC v1/v2 — genuinely guaranteed at
   API 26. H.264 High@L4.1 and HEVC Main10 are best-effort capability rows with
   clean-failure bars, not guarantees. HEVC Main is an eligibility attribute of a
   declared HEVC/HD capability class, not a universal mandatory. AC-3/E-AC-3 stay
   best-effort with an explicit unsupported-audio failure and no FFmpeg/Dolby
   decoder commitment in Phase 1. Adopted verbatim in section D.

2. **Backend architecture (from `native-media-architecture.md`).** The eleven
   approved requirements occupy four ownership planes, only one of which is a
   playback-backend choice. Background audio, MediaSession, notification, focus,
   becoming-noisy, Activity recreation, and process-lifecycle survival require
   native ownership a WebView cannot hold. **Media3 is the presumptive product
   backend; WebView is a capped 6–10h diagnostic only** and cannot be selected as
   the final product backend under the currently approved service requirements.
   Phase 2 is restructured into four independent gates. Adopted in section E.

3. **Corpus reproducibility (from `playback-corpus-reproducibility.md`).** The
   19-row set is legal-by-construction but incomplete and unpinned. Coverage gaps
   (FLV, HE-AAC, HEVC Main10, native TextTrack, H.264 High@L4.1 ceiling) are
   real. The reproducibility model — gitignored fixtures, committed metadata lock,
   transitive closure hashing, deterministic local-live replay — is adopted in
   sections F and G. **Two of that audit's own proposals are rejected**
   (deferring DASH switching to Phase 3; adding probe-only `NP-DASH-005/006`); see
   `P1-D09` and section N.

4. **Closure governance (from `closure-governance.md`).** The tag/commit/selective
   -staging discipline is adopted (section J). The tag recommendation
   `baseline/webos-2026-08-09` on `7a4a3b1`, described as a host-verified rollback
   baseline (not a shipped or device-verified release), is adopted. The one point
   overridden is the closure verdict itself: under `P1-D01`, corpus acquisition
   must complete before closure, so "conditionally closed" is downgraded to OPEN.

**Net owner ask.** Approve the codec floor and its capability classes, the
Media3-first four-gate architecture, the frozen 24-row media registry, the
feature/lifecycle ID taxonomy, the two cleartext policies (spike and product),
the controlled-beta timing seam, the baseline tag, and the estimate corrections.
None of these is enacted until approved and integrated.

---

## B. Conflicts between audits and their resolutions

Each conflict is resolved once here and carried into the decision register (C).

**B1. Closure state: "conditionally closed" vs "corpus FAIL / nothing pinned."**
`closure-governance.md §A` calls Phase 1 CONDITIONALLY CLOSED and treats corpus
checksums as a ratifiable Phase-2-first deferral.
`playback-corpus-reproducibility.md §A` says the corpus cannot yet reproducibly
prove the requirements because nothing is pinned. **Resolution:** the
intent-based standard (`P1-D01`) governs. Corpus acquisition may be labelled
"Phase 1 closure preflight," but it must complete before closure. Phase 1 is
therefore OPEN, not conditionally closed. The checksum-deferral-while-closed
recommendation is rejected (section N).

**B2. Backend ordering: "WebView first" (plan v3 §6) vs "Media3 presumptive"
(`native-media-architecture.md`).** The plan text still says prove WebView first;
the architecture audit shows the approved §4.1/§5 service scope disqualifies
WebView for the session/service plane by construction. **Resolution:** Media3 is
the presumptive product backend; WebView is a capped diagnostic only (`P1-D07`).
The architecture audit wins because it is grounded in the already-approved
feature scope, not in a preference.

**B3. WebView disqualification wording.** `native-media-architecture.md §C.3`
argues a native service wrapping an Activity-owned WebView cannot own the
decoder. The blunt phrasing "Activity recreation always destroys every WebView
configuration" is broader than the evidence. **Resolution:** state the narrower
defensible conclusion (`P1-D07`): relying on an Activity/WebView-owned decoder
cannot provide the approved service-scoped lifecycle guarantee, and a native
service sending commands to that decoder does not transfer decoder ownership.

**B4. DASH tracks: defer switching to Phase 3 (`playback-corpus-reproducibility.md
§D.2/§K`) vs mandatory backend control now.** The corpus audit reclassifies
`NP-DASH-003/004` to probe-only and proposes Phase-3 `NP-DASH-005/006` for
switching. **Resolution:** rejected (`P1-D09`, section N). Backend enumeration,
selection, an observable change, and selection preservation across the spike's
lifecycle cases are a mandatory Phase 2 gate. `NP-DASH-003/004` remain mandatory
selection rows. Only the production phone track-picker UI is Phase 3. No
`NP-DASH-005/006` are added.

**B5. Media-row inflation: corpus audit's 30 sample rows vs a bounded media
identity set.** `playback-corpus-reproducibility.md §D` folds download/cast
feature behaviors (`NP-DL-*`, `NP-CAST-*`) into the "sample-row total (30)."
**Resolution:** separate three layers (`P1-D11`): 24 `mediaRows` (media
identities), `featureCases` (download/Cast/cancellation/clean-error referencing
media rows), and `lifecycleCases` (enumerated IDs referencing VOD/live rows).
Feature cases are not counted as distinct media artifacts (section N).

**B6. AC-3 extension framing.** `requirements.md §2.3` says "Media3 can be built
with a bundled AC-3 decoder extension"; `codec-policy.md §C.3` shows there is no
drop-in AC-3 extension — it is a self-built FFmpeg cross-compile with separate
Dolby licensing and a non-Windows build host. **Resolution:** correct the wording
(`P1-D06`); no FFmpeg/Dolby decoder commitment in Phase 1.

**B7. HEVC/High guarantee wording.** `requirements.md §2.3` implies High@L4.1 and
Main10 are guaranteed/mandatory. `codec-policy.md §A` refutes both against the
Android 8.0 CDD. **Resolution:** correct to best-effort capability rows with
clean-failure bars (`P1-D03`, `P1-D05`); HEVC Main becomes capability-classed
(`P1-D04`).

**B8. Controlled-beta timing seam.** `device-policy.md §5` requires reducing to
named-device support if the cohort is unpopulated before Phase 3 begins, while §4
lists onboarding as Phase 4. `closure-governance.md §D.6` flags this as a seam.
**Resolution:** split feasibility from execution (`P1-D16`): a credible plan +
named-device fallback before Phase 3; 8–12 testers across ≥3 classes (including an
API-26 floor device) before the Phase 4 cohort release, else auto-reduce the
support claim.

**B9. Estimates.** Plan v3 prints Phase 2 as 20–28h (+24–32h) and Phase 3 as
240–320h; `native-media-architecture.md §H` withdraws the either/or figure and
prices ~84–134h of proof work. **Resolution:** withdraw the old figure; keep
~84–134h as an advisory planning range, not a commitment; flag the 240–320h
Phase 3 figure as excluding/underpricing Cast/downloads (`P1-D17`).

---

## C. Decision register

Every decision carries owner status `AWAITING APPROVAL`. IDs are unique and every
ID reappears in the section K approval block.

### P1-D01 — Phase 1 closure standard

- **Subject:** what it takes to call Phase 1 closed.
- **Recommended decision:** adopt the stronger intent-based standard. Phase 1 is
  OPEN until all of: codec policy owner-approved; backend/gate policy
  owner-approved; cleartext policy owner-approved for both the spike and eventual
  arbitrary user-entered providers; the legal corpus acquired/generated and
  reproducibly locked; the normative documents internally consistent; tests/build
  rerun green; the closure documents committed selectively; and an annotated
  neutral baseline tag exists. Corpus acquisition may be called "Phase 1 closure
  preflight" but must complete before closure.
- **Rationale:** the literal three-document exit paragraph (plan v3 §6) omits the
  tag (work item 1) and the corpus lock (work item 4). Closing on the letter
  while the tag is absent and nothing is pinned satisfies the letter and defeats
  the intent (`closure-governance.md §C`); the corpus is unpinned and therefore
  non-reproducible across runs (`playback-corpus-reproducibility.md §A`).
- **Consequence:** the closure-governance "conditionally closed" label is
  downgraded to OPEN; corpus hashes may not be deferred to Phase 2 and then have
  Phase 1 called closed.
- **Owner status:** `AWAITING APPROVAL`

### P1-D02 — Codec mandatory floor

- **Subject:** the API-26 guaranteed decode floor.
- **Recommended decision:** mandatory floor is H.264 Baseline and Main through
  Level 3.1; AAC-LC; HE-AAC v1/v2. These are architecturally guaranteed at API 26.
- **Rationale:** Android 8.0 CDD §5.3.4 (H.264 Baseline + Main@L3.1) and §5.1.2
  (AAC-LC, HE-AAC v1/v2) (`codec-policy.md §A/§B/§D`).
- **Consequence:** the Phase 2 pass bar for these is a hard pass, not a
  capability probe. VP9, AV1, Opus, FLAC, Vorbis are not required and not
  deliberately blocked.
- **Owner status:** `AWAITING APPROVAL`

### P1-D03 — H.264 High@L4.1

- **Subject:** status of H.264 High Profile at Level 4.1.
- **Recommended decision:** best-effort capability row with an explicit clean
  unsupported-video failure where absent; not a universal API-26 guarantee.
- **Rationale:** High Profile is not a handheld MUST at API 26; High@L4.2 is a
  Television-only requirement (CDD §5.3.4/T-1-1). Near-universal in practice but
  not architecturally guaranteed (`codec-policy.md §C.1`).
- **Consequence:** proven by media row `NP-HLS-009`; capability-classed across the
  cohort. Correct any wording implying High@L4.1 is guaranteed.
- **Owner status:** `AWAITING APPROVAL`

### P1-D04 — HEVC Main

- **Subject:** status of HEVC Main.
- **Recommended decision:** eligibility requirement for a declared HEVC/HD
  capability class; not universal across all beta devices. Pass is required only
  for devices in the declared HEVC/HD-capable class; a clean unsupported-video
  error is valid outside that class. Record profile, level, resolution, frame
  rate, bit depth, actual decoder, hardware/software status, backend, and
  WebView/MSE exposure where relevant.
- **Rationale:** HEVC Main decode is a platform MUST only at Main@L3/SD; HD is
  conditional on a hardware decoder, and MSE may not expose HEVC even where the
  platform decodes it (`codec-policy.md §C.2/§B`).
- **Consequence:** existing HEVC Main rows (`NP-HLS-004`, `NP-TS-002`) become
  capability-classed rather than universal Pass.
- **Owner status:** `AWAITING APPROVAL`

### P1-D05 — HEVC Main10

- **Subject:** status of 10-bit HEVC Main10.
- **Recommended decision:** best-effort capability row with clean failure; not
  universal.
- **Rationale:** no handheld MUST for 10-bit HEVC at API 26; the only Main10
  clause is Television UHD (Main10 L5, CDD §5.3.5/T-2-1) (`codec-policy.md §C.2`).
- **Consequence:** proven by media row `NP-HLS-010`, distinct from the 8-bit Main
  row so the boundary is measured. Correct any wording implying Main10 is
  guaranteed.
- **Owner status:** `AWAITING APPROVAL`

### P1-D06 — AC-3 / E-AC-3

- **Subject:** status of Dolby AC-3 / E-AC-3.
- **Recommended decision:** best-effort with an explicit unsupported-audio
  failure; silent video playback never counts as success; no FFmpeg/Dolby decoder
  commitment in Phase 1.
- **Rationale:** no Android version and no API-26 CDD clause mandates AC-3/E-AC-3
  on handhelds; not exposed by WebView/MSE in practice. There is no drop-in Media3
  AC-3 extension — it is a self-built FFmpeg cross-compile with separate Dolby
  licensing, per-ABI native builds, and a non-Windows build host
  (`codec-policy.md §C.3`).
- **Consequence:** `NP-TS-003`/`NP-TS-004` remain degradation rows. Correct the
  requirements wording implying Media3 has a drop-in AC-3 extension. If the owner
  later raises AC-3 to mandatory, WebView is eliminated for those rows and Phase 2
  starts on Media3.
- **Owner status:** `AWAITING APPROVAL`

### P1-D07 — Backend order

- **Subject:** which backend the product uses and WebView's role.
- **Recommended decision:** Media3 (ExoPlayer) is the presumptive product
  playback backend. WebView is a capped 6–10 hour diagnostic only and cannot be
  selected as the final product backend under the currently approved service
  requirements. The defensible disqualifier is stated narrowly: relying on an
  Activity/WebView-owned decoder cannot provide the approved service-scoped
  lifecycle guarantee, and a native service sending commands to that decoder does
  not transfer decoder ownership.
- **Rationale:** approved background audio, MediaSession, notification, focus,
  becoming-noisy, Activity recreation, and process-lifecycle survival require
  native ownership a WebView `HTMLMediaElement` cannot hold
  (`native-media-architecture.md §A/§C.3`; `requirements.md §4.1/§5`).
- **Consequence:** the plan's "prove WebView first, else Media3" ordering is
  replaced. The capped WebView diagnostic captures evidence (mpegts.js, AC-3
  degradation, DASH discovery, cancellation determinism) but cannot pass the
  product onto WebView. Do not assert "Activity recreation always destroys every
  WebView configuration"; use the narrower conclusion above.
- **Owner status:** `AWAITING APPROVAL`

### P1-D08 — Four independent Phase 2 gates

- **Subject:** Phase 2 gate structure and STOP semantics.
- **Recommended decision:** replace the single Phase 2 gate with four independent
  gates: (1) local playback backend; (2) session/service + minimal PiP/lifecycle
  proof; (3) downloads; (4) Cast. Only failure of mandatory local playback with no
  viable backend is an automatic whole-initiative STOP. Failure of another
  required gate requires an explicit owner scope change or STOP; it cannot
  silently become "deferred."
- **Rationale:** the eleven requirements occupy four ownership planes with
  different owners and failure modes; conflating them into one gate misprices the
  work and hides scope (`native-media-architecture.md §E`).
- **Consequence:** the ADR records four verdicts, not one. PiP is proven minimally
  within Gate 2's lifecycle scope in Phase 2; the production PiP product
  integration remains Phase 3.
- **Owner status:** `AWAITING APPROVAL`

### P1-D09 — DASH track control bar

- **Subject:** whether DASH track switching is a Phase 2 gate.
- **Recommended decision:** the selected Phase 2 backend must enumerate DASH audio
  and text adaptation sets, select them through the backend/plugin, demonstrate an
  observable audio/subtitle change, and preserve selection across the lifecycle
  cases the spike requires. `NP-DASH-003` and `NP-DASH-004` remain mandatory
  selection rows. The production phone track-picker UI may remain Phase 3. Do not
  add `NP-DASH-005/006` to defer switching.
- **Rationale:** `requirements.md §2.4/§5/§6.3` make DASH tracks mandatory and
  require preservation across lifecycle; deferring backend control to Phase 3
  would leave the mandatory bar unproven. This rejects the corpus audit's
  probe-only reclassification (`playback-corpus-reproducibility.md §D.2/§K`).
- **Consequence:** backend track control is a mandatory Gate 1/Gate 2 bar; only UI
  is deferred.
- **Owner status:** `AWAITING APPROVAL`

### P1-D10 — Canonical 24 media IDs

- **Subject:** the frozen media identity registry.
- **Recommended decision:** freeze exactly 24 collision-free media rows: the 19
  existing IDs (`NP-HLS-001..008`, `NP-DASH-001..004`, `NP-TS-001..004`,
  `NP-PROG-001..003`) plus exactly five additions — `NP-HLS-009` (H.264 High@L4.1,
  `best-effort, clean-failure`), `NP-HLS-010` (HEVC Main10, `best-effort,
  clean-failure`), `NP-TS-005` (HE-AAC v1/v2 decoder), `NP-PROG-004` (progressive
  text-track enumeration/switch), `NP-FLV-001` (FLV container/demux/decode).
  Extend the ID grammar to include `FLV`. Every row carries exactly one Class from
  the fixed four-value vocabulary defined in F.1 — `pass`, `capability-classed`,
  `best-effort, clean-failure`, `clean-fail`. No ID serves two purposes. The full
  registry is section F.
- **Rationale:** closes the mandatory coverage gaps (FLV, HE-AAC, Main10, native
  TextTrack, High@L4.1 ceiling) identified in
  `playback-corpus-reproducibility.md §B/§C` while keeping the identity set
  bounded and collision-free.
- **Consequence:** HEVC Main rows become capability-classed; High@L4.1 and Main10
  are best-effort with clean-failure bars; AC-3/E-AC-3 remain degradation rows;
  HLS/DASH baseline rows declare exact profiles; the matrix stays backend-neutral;
  MKV stays out of phone product scope as an application-policy rejection.
- **Owner status:** `AWAITING APPROVAL`

### P1-D11 — Feature and lifecycle IDs (three-layer taxonomy)

- **Subject:** distinguishing media identities from behavior cases.
- **Recommended decision:** define three layers — `mediaRows` (the 24 pinned/
  generated identities), the 13 `featureCases` (download, Cast, clean-error, and
  cancellation cases that reference one or more media rows), and the 32
  `lifecycleCases` (enumerated stable IDs referencing VOD/live media rows). Adopt
  13 stable feature IDs: `NP-DL-001..004` (progressive/HLS/DASH VOD download +
  interrupted-download integrity), `NP-CAST-001..003` (HLS handoff, DASH handoff,
  MPEG-TS unavailable before connection), `NP-ERR-001..004` (MKV/AC-3/E-AC-3/broken
  -manifest clean-failure surfaces), and `NP-CANCEL-001..002` (non-executing
  feature-taxonomy aliases that consume the single canonical executions of
  `NP-LIFE-031`/`NP-LIFE-032`; cancel during manifest load / mid-playback).
  Enumerate the lifecycle layer now as 32 concrete IDs `NP-LIFE-001..NP-LIFE-032`
  in an F.3 table with the canonical meaning fixed per requirement/event, one per
  `requirements.md §5` event and §4.1/§4.2 behavior — a fixed enumeration, not a
  prose-only set and not deferred to the executor. Net taxonomy counts: 24
  `mediaRows`, 13 `featureCases`, 32 `lifecycleCases`.
- **Rationale:** prevents inflating the media lock by counting every behavior as a
  distinct media artifact, while still making "every mandatory row" countable
  (`playback-corpus-reproducibility.md §D.4/§D.5`).
- **Consequence:** feature/lifecycle cases reference media rows and do not
  duplicate bytes; the media lock stays at 24 identities. Execution ownership is
  exact: `mediaRows` own bytes and lock integrity; `lifecycleCases` own runtime
  lifecycle/cancellation executions; `featureCases` either own their non-lifecycle
  feature execution (`NP-DL`, `NP-CAST`, `NP-ERR`) or are explicit non-executing
  aliases (`NP-CANCEL`) that consume a lifecycle result rather than scheduling
  their own execution. No test execution is double-counted.
- **Owner status:** `AWAITING APPROVAL`

### P1-D12 — Downloads scope

- **Subject:** first product download scope.
- **Recommended decision:** downloads are mandatory for progressive MP4, HLS VOD,
  and DASH VOD. Raw TS and FLV offline download are out of scope; live download is
  out of scope; no DRM. Covered by `NP-DL-001..003`, with `NP-DL-004` proving an
  interrupted write is never presented as playable.
- **Rationale:** `requirements.md §4.3` (VOD only, resumable, no DRM); download
  semantics differ per protocol (`playback-corpus-reproducibility.md §C.1/§D.4`).
- **Consequence:** Gate 3 exercises these against the referenced media rows.
- **Owner status:** `AWAITING APPROVAL`

### P1-D13 — Cast scope

- **Subject:** first product Cast scope.
- **Recommended decision:** Cast is required for HLS and DASH. MPEG-TS and FLV are
  explicitly unavailable, presented with a reason before attempting receiver
  playback (never a fail-after-connect). Covered by `NP-CAST-001` (HLS),
  `NP-CAST-002` (DASH), and `NP-CAST-003` (MPEG-TS unavailable before connection).
- **Rationale:** Chromecast receivers do not play MPEG-TS; Cast needs the Cast SDK
  behind a Capacitor plugin regardless of backend (`requirements.md §4.4`;
  `native-media-architecture.md §E`).
- **Consequence:** Gate 4 carries its own cost line and is not part of the local
  -playback decision.
- **Owner status:** `AWAITING APPROVAL`

### P1-D14 — Cleartext spike policy

- **Subject:** cleartext HTTP during the Phase 2 spike.
- **Recommended decision:** permit cleartext only for explicit approved test
  hosts. Spike network configuration may be locally generated/untracked when
  hostnames are private. Committed reports contain only redacted reachability
  shape (cleartext yes/no, CORS present/absent, status class), never hostnames or
  credentials.
- **Rationale:** `requirements.md §3` populates the allowlist from Phase 2
  provider test cases; `CLAUDE.md` and `playback-corpus-reproducibility.md §J`
  forbid committing provider material.
- **Consequence:** the spike proves reachability without leaking provider data.
- **Owner status:** `AWAITING APPROVAL`

### P1-D15 — Cleartext product policy

- **Subject:** cleartext HTTP for the eventual phone product with arbitrary
  user-entered providers.
- **Recommended decision:** because arbitrary user-entered HTTP providers are a
  stated requirement, app-level cleartext capability is likely required unless the
  product accepts a fixed-domain restriction or deploys an HTTPS relay. Recommend
  allowing cleartext for the Android app's provider transport while enforcing:
  HTTPS-only metadata proxy traffic, strict provider URL validation, an explicit
  user warning for HTTP, no redirects to unexpected hosts, and URL/credential
  redaction. State explicitly that Android network-security XML cannot dynamically
  add arbitrary runtime domains. This reverses the current "never global
  cleartext" wording and is therefore an explicit owner approval item.
- **Rationale:** a static per-domain allowlist cannot cover hostnames a user types
  at runtime (`requirements.md §3`; `closure-governance.md §D.5`). The static-XML
  allowlist is not a solution for arbitrary runtime hosts (section N).
- **Consequence:** integration would amend `requirements.md §3` to expose one
  explicit product cleartext decision rather than implying the allowlist solves
  the runtime-host case.
- **Owner status:** `AWAITING APPROVAL`

### P1-D16 — Controlled-beta timing

- **Subject:** when cohort feasibility versus onboarding must be satisfied.
- **Recommended decision:** before Phase 3 begins, record a credible recruitment
  plan and a named-device fallback; do not require all testers onboarded yet.
  Before the Phase 4 cohort release, 8–12 testers across at least three actual
  device classes must be onboarded, including an API-26 floor device, or
  automatically reduce the support claim to named-device support.
- **Rationale:** resolves the `device-policy.md §4/§5` seam (feasibility judged
  pre-Phase-3, execution is Phase 4) flagged in `closure-governance.md §D.6`.
- **Consequence:** an unpopulated cohort auto-reduces the reach claim in writing;
  it is not a discussion.
- **Owner status:** `AWAITING APPROVAL`

### P1-D17 — Baseline tag name/target and estimate correction

- **Subject:** the annotated baseline tag and the withdrawn/added estimates.
- **Recommended decision:** create one annotated tag `baseline/webos-2026-08-09`
  on `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`, described as a host-verified
  source rollback baseline (not shipped, not device-verified), with no implicit
  push. Withdraw the plan's Phase 2 "20–28h plus optional 24–32h" estimate;
  preserve the advisory ~84–134h proof estimate as a planning range, not a
  commitment; flag Phase 3's 240–320h estimate as excluding or underpricing
  production-grade Cast/download work until re-estimated.
- **Rationale:** `closure-governance.md §F` (tag form) and
  `native-media-architecture.md §H` (estimate correction); a SHA is not a tag.
- **Consequence:** the tag is the Phase 2 rollback anchor; the old either/or
  estimate is obsolete once Media3 is presumptive.
- **Owner status:** `AWAITING APPROVAL`

---

## D. Canonical codec policy

The Phase 2 pass bar, five layers kept separate (platform guarantee, device HW
availability, extractor support, decoder support, WebView/MSE exposure). A
codec/container being extractable never implies it is decodable.

**Mandatory floor — architecturally guaranteed at API 26:**

- H.264/AVC Baseline Profile and Main Profile through Level 3.1 (SD, incl. 720p30).
- AAC-LC.
- HE-AAC v1 and v2.

**Best-effort capability rows — common, not guaranteed, must degrade cleanly:**

- H.264 High@L4.1: best-effort capability row; explicit clean unsupported-video
  failure where absent; not a universal API-26 guarantee.
- HEVC Main10 (10-bit): best-effort capability row with clean failure; not
  universal.

**Eligibility requirement for a declared HEVC/HD capability class:**

- HEVC Main: pass required only for devices in the declared HEVC/HD-capable class;
  clean unsupported-video is valid outside that class; not universal across all
  beta devices. Record profile, level, resolution, frame rate, bit depth, actual
  decoder, hardware/software status, backend, and WebView/MSE exposure.

**Best-effort with explicit clean failure — not mandatory:**

- AC-3 (Dolby Digital) and E-AC-3 (Dolby Digital Plus): best-effort with an
  explicit unsupported-audio failure. Silent video playback never counts as
  success. No FFmpeg/Dolby decoder commitment in Phase 1.

**Not required, not deliberately blocked:** VP9, AV1, Opus, FLAC, Vorbis.

**Wording corrections required at integration:** remove any implication that
High@L4.1 is guaranteed; that Main10 is guaranteed; that Media3 has a drop-in
AC-3 extension; or that a codec/container being extractable means it is decodable.

Capability evidence per attempted decode is recorded at the backend (not from the
UI label or URL), reusing the shipping `PlaybackFailureKind` union, per
`codec-policy.md §F`.

---

## E. Canonical Phase 2 media architecture and gates

Media3 (ExoPlayer) is the presumptive product playback backend. A WebView
`HTMLMediaElement` cannot own the session/service plane; the narrow, defensible
disqualifier is that an Activity/WebView-owned decoder cannot provide the approved
service-scoped lifecycle guarantee, and a native service commanding that decoder
does not transfer decoder ownership.

The eleven requirements occupy four ownership planes: local decode/playback;
session/service; downloads; casting. Phase 2 proves them across four independent
gates.

| Gate | Question | Pass condition | STOP semantics |
|---|---|---|---|
| **Gate 1 — local playback backend** | Which engine decodes the corpus on the phone? | Every mandatory media row passes on the physical phone (Media3 expected), including DASH audio/text enumeration + selection + observable change (`P1-D09`) | No backend passes every mandatory local row → automatic whole-initiative STOP |
| **Gate 2 — session/service + minimal PiP/lifecycle** | Do background audio, notification, controls, focus, becoming-noisy, Activity recreation, process-death resume, minimal PiP, and track-selection preservation work? | All `requirements.md §4.1/§5` rows pass under a `MediaSessionService`; selection preserved across the spike lifecycle cases | Failure requires an explicit owner scope change or STOP; it cannot silently become "deferred" |
| **Gate 3 — downloads** | Is offline VOD resumable and integrity-safe? | `NP-DL-001..004` pass (progressive/HLS/DASH VOD; interrupted write never playable) | Failure requires an explicit owner scope change or STOP |
| **Gate 4 — casting** | Does Cast discover/handoff/transport/disconnect for HLS/DASH? | `NP-CAST-001..003` pass; MPEG-TS/FLV unavailable with a reason before connection | Failure requires an explicit owner scope change or STOP |

Rules:

- A single ADR records four verdicts. Gate 1 names the backend; Gates 2–4 each
  pass, fail, or trigger an explicit owner decision — never a silent defer.
- The capped 6–10h WebView diagnostic runs for evidence only and cannot select the
  backend.
- Corpus acquisition + lock is the blocking first task (closure preflight).
- Advisory proof planning range: ~84–134h (not a commitment). The old
  20–28h (+24–32h) figure is withdrawn. Phase 3's 240–320h is flagged as
  excluding/underpricing production-grade Cast and downloads until re-estimated.

---

## F. Canonical corpus taxonomy and exact ID registry

Three layers. Only `mediaRows` are media identities; `featureCases` and
`lifecycleCases` reference media rows and never duplicate bytes.

### F.1 `mediaRows` — exactly 24 unique media identities

ID grammar extended to `NP-<PROTOCOL>-<NNN>`, `PROTOCOL ∈ HLS | DASH | TS | PROG |
FLV`. Numbers are permanent and never reused. The matrix is backend-neutral: the
actual backend/engine is recorded evidence, not an expected-row field, and no row
names an engine or an MSE/native path in its identity. Rows declare exact
profiles, not generic H.264. The baseline codec floor rows carry H.264 Main@L3.1
(the API-26 guaranteed floor per `codec-policy.md §A`); only `NP-HLS-009` carries
High@L4.1, deliberately, as the best-effort ceiling row.

The **Origin** column is `existing` for the 19 pre-existing rows and `new` for the
five additions (`NP-HLS-009`, `NP-HLS-010`, `NP-TS-005`, `NP-PROG-004`,
`NP-FLV-001`), so the 19 + 5 = 24 split is verifiable in-sheet without opening the
corpus audit.

Every row carries exactly one **Class** from this fixed four-value vocabulary; the
section G validator keys on these strings, so no other class string may appear:

- `pass` — must play or behave correctly on every in-scope device; any failure is
  a hard fail.
- `capability-classed` — pass required only for devices in the declared
  capability class (e.g. HEVC/HD); a clean unsupported-media error is valid
  outside that class.
- `best-effort, clean-failure` — not guaranteed at the API-26 floor; where the
  capability is absent the row must fail cleanly with an explicit
  unsupported-media error, never silently.
- `clean-fail` — the row is expected not to play; the pass condition is that it
  fails cleanly and explicitly (never silently, never presented as success).

**Core format (13):**

| ID | Proves | Protocol / container / codec | Origin | Class |
|---|---|---|---|---|
| `NP-HLS-001` | Baseline HLS VOD | HLS / fMP4 / H.264 Main@L3.1 + AAC-LC | existing | pass |
| `NP-HLS-002` | HLS with TS segments | HLS / MPEG-TS seg / H.264 Main@L3.1 + AAC-LC | existing | pass |
| `NP-HLS-003` | Live HLS continuity + live edge | HLS live / TS / H.264 Main@L3.1 + AAC-LC (local-live replay, §G) | existing | pass |
| `NP-HLS-004` | HEVC Main 8-bit HLS | HLS / fMP4 / HEVC Main 8-bit + AAC-LC | existing | capability-classed |
| `NP-HLS-009` | H.264 High@L4.1 1080p ceiling | HLS / fMP4 / H.264 High@L4.1 + AAC-LC | new | best-effort, clean-failure |
| `NP-HLS-010` | HEVC Main10 10-bit | HLS / fMP4 / HEVC Main10 + AAC-LC | new | best-effort, clean-failure |
| `NP-DASH-001` | Baseline DASH VOD | DASH / fMP4 / H.264 Main@L3.1 + AAC-LC | existing | pass |
| `NP-DASH-002` | DASH live | DASH live / fMP4 / H.264 Main@L3.1 + AAC-LC (local-live replay, §G) | existing | pass |
| `NP-TS-001` | Raw MPEG-TS over HTTP (highest risk) | MPEG-TS / H.264 Main@L3.1 + AAC-LC | existing | pass |
| `NP-TS-002` | MPEG-TS carrying HEVC | MPEG-TS / HEVC Main + AAC-LC | existing | capability-classed |
| `NP-TS-005` | HE-AAC v1 + v2 decode, two selectable audio tracks | MPEG-TS / H.264 Main@L3.1 + HE-AAC v1 & v2 (both decode audibly; distinguishable and selectable) | new | pass |
| `NP-PROG-001` | Progressive MP4 | MP4 / H.264 Main@L3.1 + AAC-LC | existing | pass |
| `NP-FLV-001` | FLV container/demux/decode | FLV / H.264 Main@L3.1 + AAC-LC | new | pass |

**Track enumeration and switching (6):**

| ID | Proves | Shape | Origin | Class |
|---|---|---|---|---|
| `NP-HLS-005` | HLS audio renditions switch | HLS / ≥2 audio languages; observable backend change | existing | pass |
| `NP-HLS-006` | HLS subtitle renditions switch | HLS / ≥2 subtitle renditions; observable | existing | pass |
| `NP-DASH-003` | DASH audio adaptation sets enumerate + select | DASH / ≥2 audio adaptation sets; mandatory backend selection (`P1-D09`) | existing | pass |
| `NP-DASH-004` | DASH text adaptation sets enumerate + select | DASH / ≥1 text adaptation set; mandatory backend selection (`P1-D09`) | existing | pass |
| `NP-PROG-002` | Progressive multi-audio enumeration/switch | MP4 / ≥2 audio tracks | existing | pass |
| `NP-PROG-004` | Progressive text-track enumeration/switch | MP4 or in-scope surrogate / ≥1 in-band or fMP4 text track; `mode='showing'`, observable | new | pass |

**Negative / degradation (5):**

| ID | Proves | Shape | Origin | Class |
|---|---|---|---|---|
| `NP-PROG-003` | MKV out-of-scope fails cleanly (application-policy rejection) | Matroska / H.264 + AAC; explicit unsupported-format | existing | clean-fail |
| `NP-TS-003` | AC-3 audio, decodable video | MPEG-TS / H.264 + AC-3; explicit unsupported-audio, silent success = fail | existing | clean-fail |
| `NP-TS-004` | E-AC-3 variant | MPEG-TS / H.264 + E-AC-3; as `NP-TS-003` | existing | clean-fail |
| `NP-HLS-007` | Broken manifest surfaces error | HLS / corrupt or 404 manifest; within watchdog window | existing | clean-fail |
| `NP-HLS-008` | Pinned A/B cancellation fixture bundle | Two byte-distinct, independently playable HLS VOD closures: A supports deterministic delayed-manifest/delayed-segment serving; B is a distinct normal stream | existing | pass |

`NP-HLS-008` pass condition (identity/lock only, per §G): A independently plays;
B independently plays; A and B are byte-distinct; both member closure hashes
validate; the bundle aggregate hash validates; and the pinned delay-server
configuration validates. No runtime cancellation-behavior assertion (no stale
callback, no stale state, no stale audio, B starts clean after cancellation) is
part of this media-row pass condition — those assertions belong exclusively to
the lifecycle cases `NP-LIFE-031`/`NP-LIFE-032` (F.3).

Registry count: 13 core + 6 track + 5 negative = **24 unique media rows**
(the 19 `existing` rows + the five `new` additions `NP-HLS-009`, `NP-HLS-010`,
`NP-TS-005`, `NP-PROG-004`, `NP-FLV-001`, per the Origin column). MKV
(`NP-PROG-003`) proves an application-policy rejection, not an accidental decoder
failure, and stays out of phone product scope even if Media3 can extract it.

### F.2 `featureCases` — reference media rows; not media identities

| ID | Proves | References |
|---|---|---|
| `NP-DL-001` | Download progressive VOD, offline playback, delete | `NP-PROG-001` |
| `NP-DL-002` | Download HLS VOD (closure fetch + repackage) | `NP-HLS-001` |
| `NP-DL-003` | Download DASH VOD (closure fetch + repackage) | `NP-DASH-001` |
| `NP-DL-004` | Interrupted download integrity (partial never playable) | any of `NP-DL-001..003` |
| `NP-CAST-001` | Cast HLS handoff (position, transport) | `NP-HLS-001` |
| `NP-CAST-002` | Cast DASH handoff (position, transport) | `NP-DASH-001` |
| `NP-CAST-003` | MPEG-TS unavailable before connection (with reason) | `NP-TS-001` |
| `NP-ERR-001` | MKV application-policy rejection surfaces an explicit unsupported-format error | `NP-PROG-003` |
| `NP-ERR-002` | Unsupported-audio (AC-3) surfaces explicitly; silent video never counts as success | `NP-TS-003` |
| `NP-ERR-003` | Unsupported-audio (E-AC-3) surfaces explicitly; silent video never counts as success | `NP-TS-004` |
| `NP-ERR-004` | Broken HLS manifest surfaces an error within the watchdog window | `NP-HLS-007` |
| `NP-CANCEL-001` | Non-executing feature-taxonomy alias — consumes the single canonical execution/result of `NP-LIFE-031` | `NP-HLS-008` |
| `NP-CANCEL-002` | Non-executing feature-taxonomy alias — consumes the single canonical execution/result of `NP-LIFE-032` | `NP-HLS-008` |

Feature-case count: 4 `NP-DL` + 3 `NP-CAST` + 4 `NP-ERR` + 2 `NP-CANCEL` =
**13 feature cases**. Downloads first-scope: mandatory for progressive MP4, HLS
VOD, DASH VOD; raw TS and FLV offline out of scope; live download out of scope; no
DRM. Cast first-scope: HLS and DASH; MPEG-TS/FLV explicitly unavailable with a
reason before attempting receiver playback. The `NP-ERR-*` cases assert the
clean-failure user-facing behavior for the negative media rows.

`NP-CANCEL-001` and `NP-CANCEL-002` are non-executing feature-taxonomy aliases,
not independent executions. The executor schedules only `NP-LIFE-031` and
`NP-LIFE-032`; the result document references those two result IDs from
`NP-CANCEL-001`/`NP-CANCEL-002` respectively. No second cancellation execution is
scheduled for the feature aliases, and neither alias can override, waive, or
independently pass when its lifecycle result fails or is absent.

### F.3 `lifecycleCases` — enumerated stable IDs referencing VOD/live rows

Every `requirements.md §5` event and every §4.1/§4.2 feature behavior is promoted
to a concrete, stable `NP-LIFE-<NNN>` ID in this canonical registry — not left
prose-only and not deferred to the executor. Exactly **32 cases**,
`NP-LIFE-001..NP-LIFE-032`. These are not media-pinned identities: they are
scored on observed behavior and only reference media rows. Downloads and Cast
behaviors are **not** lifecycle cases — they live in F.2 (`NP-DL-*`,
`NP-CAST-*`).

The **Media anchor(s)** column names the row(s) each case is exercised against.
A `+` anchor (e.g. `NP-HLS-001` **+** `NP-HLS-003`) requires independently
recorded results for every listed anchor — it is not satisfied by a single
merged observation. VOD-only cases anchor `NP-HLS-001`; live-only cases anchor
`NP-HLS-003`; the cancellation pair anchors the `NP-HLS-008` A/B bundle;
`NP-LIFE-030` (System Back at a root view) has no playback media anchor because
it is a root-view navigation case with no active playback dependency.

| ID | Requirement / event | Media anchor(s) | Required observation |
|---|---|---|---|
| `NP-LIFE-001` | App backgrounds to Home during VOD | `NP-HLS-001` | Audio continues uninterrupted; position advances; video decode may stop |
| `NP-LIFE-002` | App backgrounds to Home during live playback | `NP-HLS-003` | Audio continues uninterrupted |
| `NP-LIFE-003` | Foreground after VOD background audio | `NP-HLS-001` | Video rejoins audio at its current position, synchronized; selected audio/text tracks preserved |
| `NP-LIFE-004` | Foreground after live background audio | `NP-HLS-003` | Video rejoins current live playback, synchronized; selected audio/text tracks preserved |
| `NP-LIFE-005` | Screen off/on during VOD | `NP-HLS-001` | Audio continues while off; video resumes synchronized when on |
| `NP-LIFE-006` | Screen off/on during live playback | `NP-HLS-003` | Live audio continues while off; video resumes synchronized when on |
| `NP-LIFE-007` | Activity recreation during VOD | `NP-HLS-001` | Playback survives or resumes within 2s without restarting from zero; selected audio/text tracks preserved |
| `NP-LIFE-008` | Activity recreation during live playback | `NP-HLS-003` | Playback survives or resumes within 2s at current live position; selected audio/text tracks preserved |
| `NP-LIFE-009` | VOD process death and relaunch | `NP-HLS-001` | No automatic playback; return to item detail with offered resume position no more than 10s stale |
| `NP-LIFE-010` | Process death while backgrounded | `NP-HLS-001` + `NP-HLS-003` | Notification removed and no zombie audio; separate VOD and live outcomes required |
| `NP-LIFE-011` | Transient audio-focus loss | `NP-HLS-001` + `NP-HLS-003` | Pause, then resume only when focus returns; separate VOD and live outcomes required |
| `NP-LIFE-012` | Permanent audio-focus loss | `NP-HLS-001` + `NP-HLS-003` | Pause and stop; never automatically resume; separate VOD and live outcomes required |
| `NP-LIFE-013` | Becoming noisy / headphones unplugged | `NP-HLS-001` + `NP-HLS-003` | Pause immediately; separate VOD and live outcomes required |
| `NP-LIFE-014` | VOD media notification | `NP-HLS-001` | Correct title, artwork, play/pause/stop, and position |
| `NP-LIFE-015` | Lock-screen metadata and controls | `NP-HLS-001` | Correct metadata and working play/pause/stop |
| `NP-LIFE-016` | Headset/Bluetooth media controls | `NP-HLS-001` + `NP-HLS-003` | Play, pause, and stop honored; separate VOD and live outcomes required |
| `NP-LIFE-017` | Live media notification | `NP-HLS-003` | Correct metadata and play/pause/stop controls; no seek affordance |
| `NP-LIFE-018` | PiP auto-entry on Home/recents during VOD | `NP-HLS-001` | Video continues in PiP |
| `NP-LIFE-019` | PiP controls and presentation | `NP-HLS-001` | Play/pause works and aspect ratio is correct |
| `NP-LIFE-020` | Restore from PiP | `NP-HLS-001` | Same playback position and selected audio/text tracks |
| `NP-LIFE-021` | PiP exit while still backgrounded | `NP-HLS-001` | Transitions to background audio rather than stopping |
| `NP-LIFE-022` | Stopped or errored player | `NP-HLS-001` plus explicit stopped/error state | PiP is not entered or offered |
| `NP-LIFE-023` | VOD network loss | `NP-HLS-001` | Detected within 10s with explicit connection-lost state; never indefinite spinner |
| `NP-LIFE-024` | VOD network restoration | `NP-HLS-001` | One automatic resume attempt at last position, then manual retry affordance |
| `NP-LIFE-025` | Live network loss | `NP-HLS-003` | Detected within 10s with explicit connection-lost state |
| `NP-LIFE-026` | Live network restoration | `NP-HLS-003` | One automatic reconnect at live edge, then manual retry affordance |
| `NP-LIFE-027` | Wi-Fi/cellular change during VOD | `NP-HLS-001` | Behaves as loss then restoration at last position |
| `NP-LIFE-028` | Wi-Fi/cellular change during live playback | `NP-HLS-003` | Behaves as loss then reconnect at live edge |
| `NP-LIFE-029` | Android system Back in player | `NP-HLS-001` + `NP-HLS-003` | Closes player and restores previous view; separate VOD and live outcomes required |
| `NP-LIFE-030` | Android system Back at root view | none — root view, no playback media anchor | Backgrounds app and never shows a blank screen |
| `NP-LIFE-031` | Cancel A during manifest load, then start B | `NP-HLS-008` | No stale callback, state, or audio from A; B starts successfully; canonical execution consumed by `NP-CANCEL-001` |
| `NP-LIFE-032` | Cancel A during playback, then start B | `NP-HLS-008` | No stale callback, state, or audio from A; B starts successfully; canonical execution consumed by `NP-CANCEL-002` |

Rules: IDs are not renumbered, merged, split, or reinterpreted from these
canonical meanings. Rotation/config-change coverage and generic track
-preservation evidence are not separate IDs — they are represented as result
fields/subcases of `NP-LIFE-007`/`NP-LIFE-008` (VOD/live Activity recreation
respectively). `NP-LIFE-009` includes both the process-death navigation behavior
and the <=10s resume-freshness bound as one stable ID; freshness is not split
into another ID. Downloads and Cast stay outside `lifecycleCases` (F.2 owns
them).

Lifecycle-case count: **32** (`NP-LIFE-001..NP-LIFE-032`). The taxonomy (stable
IDs, concrete anchors, and required observations) is fixed here; the executor
records measured results against these fixed IDs and may not renumber them.

---

## G. Corpus tooling/lock layout and invariants

Required before Phase 1 closes (as closure preflight):

- Generated/fetched media in `fixtures/playback-corpus/` (gitignored).
- Production-quality corpus tooling in `tools/playback-corpus/`.
- Normative committed metadata lock in `docs/android/playback-corpus.lock.json`.
- Normative corpus specification in `docs/android/playback-corpus.md`.

The later executor may create `tools/playback-corpus/README.md`, the
acquisition/generation/validation/local-server tooling, and committed
source/recipe metadata.

**Lock requirements:**

- no private provider data;
- exact source licence/provenance;
- exact pinned tool versions and normalized argument arrays (no unpinned version
  aliases);
- source hashes, output hashes, byte sizes, ffprobe-derived metadata;
- complete HLS/DASH transitive closure hashes (manifest → child playlists →
  representations → init segments → media segments → open/test keys), manifests
  rewritten to relative paths so no host leaks;
- deterministic local-live replay over pinned bytes (a local server replays a
  pinned VOD closure as a sliding live window); public live edges are never
  checksum-pinned and may only be an advisory, non-pass smoke observation;
- feature/lifecycle cases reference media rows rather than duplicate bytes;
- one aggregate lock hash;
- a validator that rejects missing, duplicate, waived, extra, or hash-mismatched
  IDs.

**`NP-HLS-008` A/B cancellation fixture bundle.** `NP-HLS-008` stays a single
media row but pins a two-part fixture bundle, because the cancellation cases
(`NP-CANCEL-001`/`002`, `NP-LIFE-031`/`032`) need one stream slow enough to cancel
mid-load/mid-play and a distinct second stream that must start clean afterward.
The lock therefore records two named sub-closures under this one row:

- **`NP-HLS-008-A`** — a deterministic delayed HLS VOD closure: a normal pinned
  HLS VOD closure served through a pinned deterministic delay-server configuration
  (fixed manifest/segment delay values in the lock) so cancellation always lands
  during manifest load or during playback, reproducibly.
- **`NP-HLS-008-B`** — a distinct, independently-playable normal HLS VOD closure
  (no injected delay) that must start cleanly after A is cancelled.

Each sub-closure owns its own complete transitive-closure aggregate hash; the
bundle owns one additional aggregate hash over both sub-closures plus the pinned
delay-server configuration. A and B are byte-distinct so "B starts clean" cannot
be satisfied by leftover A state. This is still one media identity
(`NP-HLS-008`); the sub-closures are not separate media rows.

Media bytes are never committed to Git. The committed lock is metadata-only.
Generated rows carry a pinned ffmpeg recipe (tool version, normalized argv, source
hash, recipe hash) plus an output hash, since ffmpeg output is not bit-identical
across builds.

---

## H. Cleartext policy requiring owner approval

One explicit owner decision, in two parts. The existing static domain allowlist
does not solve arbitrary user-entered Xtream hosts.

**Phase 2 spike (`P1-D14`):** cleartext only for explicit approved test hosts;
configuration may be locally generated/untracked when hostnames are private;
committed reports contain only redacted reachability shape.

**Eventual phone product (`P1-D15`):** because arbitrary user-entered HTTP
providers are a stated requirement, app-level cleartext capability is likely
required unless the product accepts a fixed-domain restriction or deploys an HTTPS
relay. Recommended: allow cleartext for the Android app's provider transport while
enforcing HTTPS-only metadata proxy traffic, strict provider URL validation, an
explicit user warning for HTTP, no redirects to unexpected hosts, and
URL/credential redaction.

Android network-security XML cannot dynamically add arbitrary runtime domains.
This reverses the current "never global cleartext" wording in `requirements.md
§3` and is therefore an explicit owner approval item, not an auditor call.

---

## I. Controlled-beta timing (`P1-D16`)

- **Before Phase 3 begins:** record a credible recruitment plan and a named-device
  fallback. Do not require all testers onboarded yet. Feasibility-to-populate is
  the pre-Phase-3 gate.
- **Before the Phase 4 cohort release:** 8–12 testers across at least three actual
  device classes must be onboarded, including an API-26 floor device, or
  automatically reduce the support claim to named-device support. Onboarding is the
  Phase 4 activity.

This splits the `device-policy.md §4/§5` seam cleanly: feasibility is judged
before Phase 3; execution (onboarding, telemetry, rehearsed rollback) is Phase 4.

---

## J. Baseline/tag/commit policy (`P1-D17`)

- **Annotated tag:** `baseline/webos-2026-08-09`.
- **Target:** `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`.
- **Description:** a host-verified source rollback baseline — not shipped, not
  device-verified. The message states the Phase 1 host-verified webOS baseline
  (48/442 tests green, four build guards green), that it is the Phase 2 rollback
  target, and that it is not device-verified or shipped pending on-device and
  `package:webos` checks. It must be annotated (its own object + message), not a
  lightweight tag or a bare SHA.
- **No implicit tag push.** Creation is local; pushing to `origin/master` is a
  separate explicit owner step.
- **Selective commit only.** Never `git add .` or `git add -A`; stage only the
  intended Phase 1 closure paths explicitly.
- **Exact final staging scope will be reassessed after normative integration.**
- **Unrelated pre-existing working-tree changes** (`.gitignore`, `CLAUDE.md`,
  the `plans/main-refactor-v2.md` NOT-APPROVED banner) remain excluded unless
  inspected and explicitly adopted by the owner.

---

## K. Exact owner approval block

Copy/paste-ready. Mark each decision, then complete the final line.

```
Phase 1 owner decision — decision-sheet.md
Baseline: 7a4a3b163d436dd1727b9fad5356536e27ef8a7f

P1-D01 closure standard .................... APPROVE / REJECT
P1-D02 codec mandatory floor ............... APPROVE / REJECT
P1-D03 H.264 High@L4.1 ..................... APPROVE / REJECT
P1-D04 HEVC Main ........................... APPROVE / REJECT
P1-D05 HEVC Main10 ......................... APPROVE / REJECT
P1-D06 AC-3 / E-AC-3 ....................... APPROVE / REJECT
P1-D07 backend order ....................... APPROVE / REJECT
P1-D08 four Phase 2 gates .................. APPROVE / REJECT
P1-D09 DASH track control bar .............. APPROVE / REJECT
P1-D10 canonical 24 media IDs .............. APPROVE / REJECT
P1-D11 feature/lifecycle IDs ............... APPROVE / REJECT
P1-D12 downloads scope ..................... APPROVE / REJECT
P1-D13 Cast scope .......................... APPROVE / REJECT
P1-D14 cleartext spike policy .............. APPROVE / REJECT
P1-D15 cleartext product policy ............ APPROVE / REJECT
P1-D16 controlled-beta timing .............. APPROVE / REJECT
P1-D17 tag name/target + estimate correction APPROVE / REJECT

Owner decision: APPROVE ALL / APPROVE WITH EXCEPTIONS: ... / REJECT
```

---

## L. Phase 1 closure checklist

Under `P1-D01`, Phase 1 is closed only when every item is satisfied. Corpus
acquisition is closure preflight, not a Phase 2 deferral.

- [ ] Codec policy owner-approved (`P1-D02`..`P1-D06`).
- [ ] Backend/gate policy owner-approved (`P1-D07`, `P1-D08`, `P1-D09`).
- [ ] Cleartext policy owner-approved for the spike (`P1-D14`) and the eventual
      arbitrary user-entered product providers (`P1-D15`).
- [ ] Legal corpus acquired/generated and reproducibly locked:
      `fixtures/playback-corpus/` populated (gitignored),
      `tools/playback-corpus/` present,
      `docs/android/playback-corpus.lock.json` committed (metadata-only),
      the full three-layer taxonomy enumerated (24 `mediaRows`, 13 `featureCases`,
      32 `lifecycleCases` per `P1-D11`/section F), one aggregate lock hash (plus the
      `NP-HLS-008` A/B bundle hash), validator rejects missing/duplicate/waived/
      extra/hash-mismatched IDs.
- [ ] Normative documents internally consistent (requirements §2.3 wording,
      corpus doc ID grammar incl. `FLV`, plan v3 §6 four-gate framing, DASH
      selection bar) after integration of the approved decisions.
- [ ] `npm test` and `npm run build` rerun green (host-side).
- [ ] Closure documents committed selectively (path-scoped; never `git add .`).
- [ ] Annotated neutral baseline tag `baseline/webos-2026-08-09` exists on
      `7a4a3b163d436dd1727b9fad5356536e27ef8a7f` (not pushed implicitly).

---

## M. Explicit deferrals

Consciously deferred, and ratified as deferrals rather than silently dropped:

- **Production phone track-picker UI** for DASH/HLS/native tracks → Phase 3.
  Backend track control remains a mandatory Phase 2 gate (`P1-D09`).
- **Production-grade PiP product integration** → Phase 3. A minimal PiP/lifecycle
  proof stays inside Gate 2 (`P1-D08`).
- **Android credential storage and catalog persistence** (IndexedDB vs SQLite),
  download/offline storage durability under force-stop/upgrade/quota/interrupted
  write → Phase 3 on probe evidence.
- **Runtime user-entered cleartext-domain resolution mechanism** → Phase 3 on
  cohort evidence; the product-level capability decision itself is `P1-D15`.
- **Phase 3 re-estimation** including production Cast and downloads → after a
  backend is named (`P1-D17`).
- **Cohort onboarding, telemetry surface, rehearsed rollback, signing, package ID,
  distribution, Play review, localization, accessibility** → Phase 4 (`P1-D16`).
- **Android TV** → reopened only after a successful phone cohort release.
- **AC-3/E-AC-3 decoder work** (self-built FFmpeg) → out of Phase 1; a Phase 2
  backend consideration only, with no commitment (`P1-D06`).

---

## N. Items rejected from the advisory reports

- **Checksum deferral while still calling Phase 1 closed** — rejected
  (`closure-governance.md §A/§C` "conditionally closed" with checksums as a
  ratifiable Phase-2-first deferral). Under `P1-D01`, corpus acquisition is
  closure preflight and must complete before closure.
- **WebView as a selectable final backend under current requirements** — rejected
  (plan v3 §6 "WebView first" outcome). Media3 is presumptive; WebView is a capped
  diagnostic only (`P1-D07`).
- **"Activity recreation always destroys every WebView configuration"** — rejected
  as overbroad (`native-media-architecture.md §C.3` phrasing). Use the narrower
  ownership-based conclusion (`P1-D07`).
- **DASH selection deferred to Phase 3** — rejected
  (`playback-corpus-reproducibility.md §K` / `§D.2`). Backend selection is a
  mandatory Phase 2 gate (`P1-D09`).
- **Probe-only DASH rows** — rejected. `NP-DASH-003/004` remain mandatory
  selection rows, not probe rows (`P1-D09`).
- **Adding `NP-DASH-005/006` to defer switching** — rejected. No such IDs are
  created (`P1-D09`).
- **Duplicate / colliding IDs** — rejected. No ID serves two purposes; the media
  registry is exactly 24 unique identities (`P1-D10`).
- **Treating feature cases as duplicate media artifacts** — rejected. The corpus
  audit's "30 sample rows" count folded `NP-DL-*`/`NP-CAST-*` into media rows; the
  three-layer taxonomy keeps 24 media identities and references them from feature/
  lifecycle cases (`P1-D11`).
- **Static XML allowlist as a solution for arbitrary runtime hosts** — rejected as
  a complete solution (`requirements.md §3`). Android network-security XML cannot
  add arbitrary runtime domains; the product needs an explicit cleartext decision
  (`P1-D15`).
- **Calling the baseline a release** — rejected (plan v3 work item 1 "approved
  webOS release commit"). It is a host-verified source rollback baseline, not
  shipped or device-verified (`P1-D17`).
