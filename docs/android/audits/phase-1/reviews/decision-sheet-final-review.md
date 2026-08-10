# Phase 1 decision-sheet final independent review

## Metadata

- **Date:** 2026-08-09
- **Reviewer role:** final independent reviewer (read-only; no normative
  authority). This report is the only file this task created.
- **Baseline commit:** `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`
  (`docs(plans): council verdict on the three-app plan`); confirmed
  `git rev-parse HEAD` == this SHA and `git tag -l` is **empty** (no tag exists).
- **Reviewed file:** `docs/android/audits/phase-1/decision-sheet.md` (940
  physical lines, valid strict UTF-8, no BOM, no replacement characters, no
  mojibake).
- **Prior reports read in full:** `reviews/decision-sheet-review.md` (108
  lines), `reviews/decision-sheet-rereview.md` (178 lines),
  `reviews/decision-sheet-correction-verification.md` (178 lines).
- **Supporting Phase 1 documents read in full:** `README.md`, `codec-policy.md`,
  `native-media-architecture.md`, `playback-corpus-reproducibility.md`,
  `closure-governance.md`, `docs/android/requirements.md`,
  `docs/android/device-policy.md`, `docs/android/playback-corpus.md`,
  `plans/main-refactor-v3.md`.
- **Method:** section-by-section read of the corrected decision sheet;
  programmatic extraction of every `P1-D##`, `NP-*` media/feature/lifecycle ID;
  field-by-field comparison of the 32-row F.3 table against the canonical
  lifecycle mapping supplied in the dispatch; reconciliation of each decision
  against its detailed canonical section and against the four advisory audits and
  the normative documents; read-only Git inspection. Verification of current
  content was performed directly, not inherited from the prior reviews.

## Strengths

- **Governing verdict is correct and unchanged.** Phase 1 is explicitly OPEN
  (§A, L27–32) and stays OPEN pending owner approval, corpus lock, normative
  integration, green re-verification, selective commit, and the annotated tag
  (§L L859–882, `P1-D01` L158–177). The intent-based closure standard governs
  over the closure-governance "conditionally closed" label.
- **Decision register and approval block are exact.** 17 unique sequential
  headings `P1-D01..P1-D17`; all 17 reappear once, in register order, in the
  section K approval block with `APPROVE / REJECT`; every block carries Subject,
  Recommended decision, Rationale, Consequence, and `AWAITING APPROVAL`; no
  decision is pre-approved.
- **Media registry is bounded and collision-free.** F.1 is exactly 24 unique
  identities with the required protocol distribution, a verifiable 19 existing /
  5 new Origin split, and the fixed four-value Class vocabulary.
- **Lifecycle registry now matches the canonical mapping exactly.** All 32
  `NP-LIFE-001..NP-LIFE-032` rows match the required ID → event → anchor →
  observation mapping (32/32); `NP-LIFE-030` correctly carries no playback media
  anchor; `+` anchors require independently recorded results.
- **Media/behavior separation is now clean.** `NP-HLS-008` is identity/lock-only
  in F.1; runtime cancellation lives only in `NP-LIFE-031/032`; `NP-CANCEL-001/
  002` are explicit non-executing aliases that cannot schedule a second execution
  or independently pass.
- **Codec, architecture, cleartext, corpus, and governance posture are correctly
  grounded** in the four advisory audits and the Android 8.0 CDD clauses those
  audits cite, with no provider/credential/private-media leakage anywhere in the
  sheet.

## Issues

### Critical

- **None.** No provider/credential/private-media disclosure, no false codec or
  backend decision, no silently waived mandatory requirement, no registry or
  approval-mechanic defect, and no security/privacy regression was found.

### Important

- **None.** The two Important findings from the re-review (canonical lifecycle
  registry drift; `NP-HLS-008` media/behavior collapse plus cancellation
  duplicate-execution ambiguity) are both fully resolved in the current file
  (see Prior-finding closure). No new Important issue was introduced.

### Minor

- **`docs/android/audits/phase-1/decision-sheet.md` L594 — `NP-TS-004` states its
  required behavior only as a cross-reference (`as \`NP-TS-003\``) rather than
  restating it inline.**
  - **Defect:** the E-AC-3 negative row's Shape/behavior cell reads
    "MPEG-TS / H.264 + E-AC-3; as `NP-TS-003`" instead of restating the explicit
    unsupported-audio / silent-success-is-fail behavior directly.
  - **Impact:** cosmetic only. The class is still the correct `clean-fail`
    string, the row is still a distinct media identity, and `NP-ERR-003` (L625)
    states the user-visible clean-failure requirement for E-AC-3 explicitly. It
    does not affect any stable ID, validator key, pass bar, security control,
    scope, or owner decision meaning, so it remains Minor and does not block
    approval.
  - **Exact correction (optional):** replace "as `NP-TS-003`" with the full
    text, e.g. "MPEG-TS / H.264 + E-AC-3; explicit unsupported-audio, silent
    success = fail", mirroring L593. No ID, class, or count changes.

## Decision register and approval-block verification

- **17 sequential headings:** `### P1-D01`..`### P1-D17` at L158, 179, 191, 203,
  219, 231, 248, 269, 286, 303, 326, 356, 368, 382, 396, 417, 431 — unique, no
  gaps, no duplicates. PASS.
- **Field completeness:** every register block carries **Subject**, **Recommended
  decision**, **Rationale**, **Consequence**, and **Owner status:
  `AWAITING APPROVAL`** (17/17). PASS.
- **Approval block (section K, L836–852):** all 17 IDs appear exactly once, in
  register order, each with an `APPROVE / REJECT` entry; the final owner line
  (L854) is `APPROVE ALL / APPROVE WITH EXCEPTIONS / REJECT`. PASS.
- **No pre-approval:** no register block is marked approved; the only non-register
  `AWAITING APPROVAL` occurrences are the section-C explanatory sentence (L155)
  and the register bodies. PASS.
- **Recommendation vs canonical section:** each recommendation matches its
  detailed section — `P1-D02..D06` ↔ §D; `P1-D07/D08/D09` ↔ §E; `P1-D10/D11` ↔
  §F; `P1-D14/D15` ↔ §H; `P1-D16` ↔ §I; `P1-D17` ↔ §J. No recommendation conflicts
  with its canonical section. PASS.
- **Phase 1 OPEN pending the full gate set:** §A L27–32 and §L L859–882 list
  approval, corpus lock, normative integration, green re-run, selective commit,
  and annotated tag as outstanding. PASS.

**Decision register verdict: PASS.**

## Media registry verification

- **Count and set:** F.1 contains exactly 24 unique media IDs —
  `NP-HLS-001..010`, `NP-DASH-001..004`, `NP-TS-001..005`, `NP-PROG-001..004`,
  `NP-FLV-001`. PASS.
- **Registry arithmetic (L606):** 13 core + 6 track + 5 negative = 24, recomputed
  from the three F.1 tables. PASS.
- **Origin split:** exactly 19 `existing` and five `new` (`NP-HLS-009`,
  `NP-HLS-010`, `NP-TS-005`, `NP-PROG-004`, `NP-FLV-001`), verifiable in-sheet via
  the Origin column (L540–543, L563–596, L607–608). PASS.
- **Class vocabulary:** only `pass`, `capability-classed`,
  `best-effort, clean-failure`, and `clean-fail` occur (defined L545–557; used in
  every F.1 row). PASS.
- **Baseline mandatory rows:** carry H.264 Main@L3.1 + AAC-LC (L563–575);
  High@L4.1 appears only in `NP-HLS-009` (L567); `NP-HLS-010` is HEVC Main10
  `best-effort, clean-failure` (L568); `NP-HLS-004` and `NP-TS-002` are
  `capability-classed` (L566, L572). PASS.
- **`NP-TS-005`:** covers distinguishable/selectable audibly decoded HE-AAC v1 and
  v2 (L573). PASS.
- **DASH selection mandatory:** `NP-DASH-003/004` are mandatory backend-selection
  rows under `P1-D09` (L583–584, L286–301); enumeration + selection + observable
  change remain mandatory Phase 2 evidence. PASS.
- **Backend-neutral:** F.1 records the engine as evidence, not identity, and names
  no engine/MSE/native path in any row (L532–538). PASS.
- **MKV:** `NP-PROG-003` is an application-policy rejection, not an accidental
  decoder failure (L592, L608–610). PASS.
- **No collision / meaning switch:** no media ID serves two purposes; feature IDs
  live in F.2 and only reference media rows; `NP-DASH-005/006` appear only as
  explicitly rejected additions (L60, L110, L115, L294, L926). PASS.

**Media registry verdict: PASS.**

### NP-HLS-008 media/behavior separation

- Member A independently playable, member B independently playable, A/B
  byte-distinct, member A closure hash, member B closure hash, bundle aggregate
  hash, and deterministic delay-server configuration are all present — F.1 pass
  condition L598–604 (six identity/lock clauses) and §G L743–760. PASS.
- The F.1 pass condition explicitly **excludes** runtime cancellation assertions
  and redirects them to `NP-LIFE-031/032` (L598–604). PASS.
- §G explains why the fixture exists (B proves clean startup after A is cancelled,
  L753–758) **without** making runtime cancellation success part of F.1's
  identity/lock pass condition. PASS.
- Runtime cancellation behavior exists only in `NP-LIFE-031/032` (L694–695), is
  consumed through non-executing aliases `NP-CANCEL-001/002` (F.2 L627–628,
  L637–642), only lifecycle 031/032 are scheduled as executions, aliases schedule
  no second execution, and aliases cannot override/waive/independently pass when
  the lifecycle result fails or is absent (L637–642; `P1-D11` L347–353). PASS.

## Feature taxonomy verification

- **Count and set:** F.2 has exactly 13 unique feature IDs — `NP-DL-001..004`,
  `NP-CAST-001..003`, `NP-ERR-001..004`, `NP-CANCEL-001..002` (L616–628, count
  sentence L630). PASS.
- **Media references exist in F.1:** downloads → `NP-PROG-001`/`NP-HLS-001`/
  `NP-DASH-001`; Cast → `NP-HLS-001`/`NP-DASH-001`/`NP-TS-001`; errors →
  `NP-PROG-003`/`NP-TS-003`/`NP-TS-004`/`NP-HLS-007`; cancellations →
  `NP-HLS-008`. All targets present in F.1. PASS.
- **Feature cases are not media identities** and do not duplicate bytes (§F intro
  L527–528, `P1-D11` L347–349). PASS.
- **Downloads scope:** progressive MP4 / HLS VOD / DASH VOD only; raw TS, FLV,
  live, and DRM out of scope (L630–633, `P1-D12` L356–366). PASS.
- **Cast scope:** HLS and DASH; TS/FLV unavailable with a reason before receiver
  playback (L633–634, `P1-D13` L368–380, gate table L510). PASS.
- **Error cases require explicit user-visible clean failures** (`NP-ERR-001..004`,
  L623–626, L634–635). PASS.
- **Cancellation aliases follow the single-execution rule** (L637–642). PASS.

**Feature taxonomy verdict: PASS.**

## Lifecycle registry verification

Exactly 32 unique sequential IDs `NP-LIFE-001..NP-LIFE-032` (F.3 table
L664–695). Field-by-field comparison against the canonical mapping:

| # | ID | Canonical meaning | Sheet row | Result |
|---|---|---|---|---|
| 1 | 001 | VOD app-background/Home — HLS-001 | L664 VOD Home, HLS-001 | MATCH |
| 2 | 002 | live app-background/Home — HLS-003 | L665 live Home, HLS-003 | MATCH |
| 3 | 003 | VOD foreground after bg audio — HLS-001 | L666 | MATCH |
| 4 | 004 | live foreground after bg audio — HLS-003 | L667 | MATCH |
| 5 | 005 | VOD screen off/on — HLS-001 | L668 | MATCH |
| 6 | 006 | live screen off/on — HLS-003 | L669 | MATCH |
| 7 | 007 | VOD Activity recreation — HLS-001 | L670 | MATCH |
| 8 | 008 | live Activity recreation — HLS-003 | L671 | MATCH |
| 9 | 009 | VOD process death/relaunch, detail, resume ≤10s stale — HLS-001 | L672 | MATCH |
| 10 | 010 | process death backgrounded, notif removed/no zombie — HLS-001+003 | L673 | MATCH |
| 11 | 011 | transient focus loss, pause then resume — HLS-001+003 | L674 | MATCH |
| 12 | 012 | permanent focus loss, pause/stop/no resume — HLS-001+003 | L675 | MATCH |
| 13 | 013 | becoming noisy, immediate pause — HLS-001+003 | L676 | MATCH |
| 14 | 014 | VOD notification title/artwork/actions/position — HLS-001 | L677 | MATCH |
| 15 | 015 | lock-screen metadata/actions — HLS-001 | L678 | MATCH |
| 16 | 016 | headset/Bluetooth controls — HLS-001+003 | L679 | MATCH |
| 17 | 017 | live notification, no seek — HLS-003 | L680 | MATCH |
| 18 | 018 | VOD PiP auto-entry — HLS-001 | L681 | MATCH |
| 19 | 019 | PiP controls and aspect — HLS-001 | L682 | MATCH |
| 20 | 020 | restore from PiP with position/tracks — HLS-001 | L683 | MATCH |
| 21 | 021 | PiP exit backgrounded to background audio — HLS-001 | L684 | MATCH |
| 22 | 022 | stopped/error denies PiP — HLS-001 + explicit state | L685 | MATCH |
| 23 | 023 | VOD network loss ≤10s, explicit state — HLS-001 | L686 | MATCH |
| 24 | 024 | VOD restoration, one auto attempt then retry — HLS-001 | L687 | MATCH |
| 25 | 025 | live network loss ≤10s, explicit state — HLS-003 | L688 | MATCH |
| 26 | 026 | live restoration at live edge, one auto then retry — HLS-003 | L689 | MATCH |
| 27 | 027 | VOD Wi-Fi/cellular change, restore last position — HLS-001 | L690 | MATCH |
| 28 | 028 | live Wi-Fi/cellular change, reconnect live edge — HLS-003 | L691 | MATCH |
| 29 | 029 | Android Back in player, restore previous view — HLS-001+003 | L692 | MATCH |
| 30 | 030 | Android Back at root, background app/no blank — no media anchor | L693 (`none — root view, no playback media anchor`) | MATCH |
| 31 | 031 | cancel A during manifest load, then B; no stale A — HLS-008 | L694 | MATCH |
| 32 | 032 | cancel A during playback, then B; no stale A — HLS-008 | L695 | MATCH |

**Exact result: 32/32 rows match the canonical mapping.**

Additional lifecycle checks:
- Every `+` anchor requires independently recorded results for each anchor
  (intro L654–656; each `+` row states "separate VOD and live outcomes
  required"). PASS.
- No VOD/live case with different observations is merged (VOD/live are separate
  IDs wherever observations differ, e.g. 001/002, 003/004, 023/025, 024/026,
  027/028). PASS.
- `NP-LIFE-009` includes the ≤10s freshness bound as one stable ID and is not
  split (L672, rules L699–704). PASS.
- `NP-LIFE-030` has no playback media anchor (L693). PASS.
- Selected audio/text preservation present in foreground (003/004), Activity
  recreation (007/008), and PiP restoration (020). PASS.
- No placeholder (`..NNN`) remains; no additional lifecycle ID alters these
  meanings (rules L697–708). PASS.

**Lifecycle registry verdict: PASS (32/32).**

## Architecture, gates, and codec verification

Architecture (§A2, §E, `P1-D07/D08/D09`):
- Media3 presumptive product backend; WebView a capped 6–10h diagnostic only that
  cannot select the backend (L49–51, L248–267, L495–500, L516–517). PASS.
- Four independent Phase 2 gates — local playback; session/service + minimal
  PiP/lifecycle; downloads; Cast (gate table L505–510, `P1-D08` L269–284). PASS.
- Only "no viable mandatory local playback backend" auto-stops the whole
  initiative; any other gate failure requires explicit owner scope change or
  STOP, never silent defer (L507–510, L276–277). PASS.
- DASH switching remains mandatory backend proof (`P1-D09` L286–301, gate 1 row
  L507). PASS.
- Old Phase 2 estimate withdrawn; ~84–134h is advisory only; old Phase 3
  240–320h flagged as excluding/underpricing production Cast/download scope
  (§E L519–521, `P1-D17` L437–440). PASS.

Codec (§D, `P1-D02..D06`):
- Mandatory API-26 floor: H.264 Baseline/Main through L3.1, AAC-LC, HE-AAC v1/v2
  (L455–460). PASS.
- H.264 High@L4.1 best-effort (L463–464); HEVC Main capability-classed
  (L468–473); HEVC Main10 best-effort (L465–466); AC-3/E-AC-3 best-effort with
  explicit unsupported-audio failure and silent-video-never-success (L477–479).
  PASS.
- No Phase 1 FFmpeg/Dolby decoder commitment (L479, `P1-D06` L234–236); extractor
  support never equated with decoder availability (L451–453, L483–485). PASS.

## Security, privacy, and governance verification

- Spike cleartext limited to approved test hosts with private values kept local
  and redacted-to-shape (`P1-D14` L382–394, §H L774–776). PASS.
- Eventual arbitrary user-entered HTTP support is an explicit owner decision that
  reverses the "never global cleartext" wording (`P1-D15` L396–415, §H L778–788).
  PASS.
- Android network-security XML is stated as unable to dynamically allowlist
  runtime hosts (L406–407, L786). PASS.
- Metadata proxy remains HTTPS-only (L403, L782). PASS.
- Strict provider URL validation, HTTP warning, unexpected-redirect control, and
  URL/credential redaction all required (L403–406, L782–784). PASS.
- No provider hostname, credential, catalog payload, private media URL, or
  personal tester data appears anywhere in the sheet. PASS.
- Controlled-beta timing: credible recruitment plan + named-device fallback
  before Phase 3; 8–12 testers / ≥3 classes / API-26 floor device before Phase 4
  release, else automatic named-device reduction (`P1-D16` L417–429, §I
  L792–803). PASS.
- Tag `baseline/webos-2026-08-09` annotated on
  `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`, host-verified only (not
  shipped/device-verified), not implicitly pushed (§J L807–824, `P1-D17`
  L431–445). PASS.
- Advisory vs normative status explicit (L11–16, L74; README L36–46). PASS.

**Security/governance verdict: PASS.**

## Corpus layout and validator verification

Intended layout (§G L714–719): ignored bytes `fixtures/playback-corpus/`;
production tooling `tools/playback-corpus/`; normative lock
`docs/android/playback-corpus.lock.json`; normative spec
`docs/android/playback-corpus.md`. PASS.

Lock requirements (§G L725–741, L756–765): licence/provenance; pinned tools and
normalized argument arrays; input/output hashes and sizes; ffprobe-derived
metadata; complete HLS/DASH transitive closure; deterministic local-live replay;
one aggregate hash (plus the `NP-HLS-008` A/B bundle hash); strict rejection of
missing, duplicate, extra, waived, or hash-mismatched IDs; no media bytes or
private provider material committed. All present. PASS.

**Corpus verdict: PASS.**

## Prior-finding closure

| Prior finding | Origin | Status | Evidence |
|---|---|---|---|
| Unenumerated lifecycle registry (`..NNN`) | first review (Important) | **CLOSED** | F.3 enumerates 32 concrete IDs, no placeholder (L664–695). |
| Lifecycle semantic drift (001–030 wrong meanings) | re-review (Important) | **CLOSED** | 32/32 canonical mapping now matches (table above); correction-verification confirmed and this review re-verified directly. |
| `NP-HLS-008` media/behavior collapse | re-review (Important) | **CLOSED** | F.1 pass condition is identity/lock-only; behavior moved to `NP-LIFE-031/032` (L598–604). |
| Cancellation duplicate-execution ambiguity | re-review (Important) | **CLOSED** | `NP-CANCEL-001/002` are explicit non-executing aliases; only 031/032 scheduled; aliases cannot override/waive/pass (L637–642). |
| 19 existing / 5 new not visible in F.1 | first review (Minor) | **CLOSED** | Origin column present on every row; five additions named (L540–543, L607–608). |
| Class-vocabulary not normalized | first review (Minor) | **CLOSED** | Fixed four-value vocabulary defined and used (L545–557). |

**Prior-finding closure verdict: all resolved.**

## File and Git facts

- **Decision-sheet actual physical line count:** 940.
- **Final-review physical line count:** see the closing note returned to the
  caller (this file).
- **Encoding:** strict UTF-8, no BOM, no U+FFFD replacement characters, no
  mojibake markers.
- **Git status (read-only, unstaged):** `M .gitignore`, `M CLAUDE.md`,
  `M plans/main-refactor-v2.md`, `?? docs/android/`, `?? docs/refactor/`,
  `?? plans/main-refactor-v3.md`. `HEAD` == baseline SHA; `git tag -l` empty.
  These modified/untracked paths pre-exist this task.
- **Mutation scope:** this task created only
  `docs/android/audits/phase-1/reviews/decision-sheet-final-review.md` (inside
  the already-untracked `docs/android/` tree). No decision sheet, prior review,
  correction-verification, README, advisory audit, normative document, source,
  test, Git index, tag, or commit was modified. Nothing was staged, committed, or
  tagged.

## Assessment

The corrected decision sheet is internally consistent and correctly grounded in
the four advisory audits and the pinned normative documents. All exact registries
pass: 17 sequential decisions with a matching approval block, 24 collision-free
media identities with the correct 19/5 origin split and four-value class
vocabulary, 13 feature cases, and a lifecycle registry that matches the canonical
mapping 32/32. `NP-HLS-008` is a clean identity/lock-only fixture with runtime
cancellation confined to `NP-LIFE-031/032` and consumed through non-executing
`NP-CANCEL` aliases. Architecture, gates, codec policy, cleartext/security
posture, controlled-beta timing, baseline tag, and corpus/validator requirements
are all correct, with no leakage and no silently waived mandatory requirement.
The four Important findings from earlier reviews are all closed. The sole
remaining issue is one cosmetic Minor cross-reference (`NP-TS-004` behavior text),
which cannot affect any stable ID, validator, pass bar, security control, scope,
or owner decision meaning. Critical = 0, Important = 0, Minor = 1. The approval
block is safe to present to the owner unchanged.

Ready for owner approval: YES

Technical reason: zero Critical and zero Important issues; the decision register,
media registry, feature taxonomy, 32/32 lifecycle registry, architecture/codec
policy, and security/governance controls all pass, no mandatory requirement is
silently deferred or waived, and the only defect is a cosmetic Minor
cross-reference that does not change any decision meaning.
