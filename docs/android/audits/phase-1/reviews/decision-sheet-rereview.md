# Corrected decision-sheet independent re-review

## Metadata

- **Date:** 2026-08-09
- **Baseline:** `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`
- **Reviewed revision facts:** current `decision-sheet.md` is a valid UTF-8, non-mojibake file with 908 physical lines. It declares Phase 1 OPEN and is advisory pending owner approval/integration. The prior editor's reported 763-line count does not match the current file; the directly measured count is 908 (a difference of 145 lines).
- **Read-only scope and permitted output:** this was a read-only re-review of the listed decision sheet, prior review, requirements, four advisory audits, and index. The only task-created path is this report: `docs/android/audits/phase-1/reviews/decision-sheet-rereview.md`. Initial Git status already contained unrelated modified and untracked paths; nothing was staged, committed, tagged, or otherwise changed.

## Strengths

- `P1-D11` now states the exact intended taxonomy counts: 24 `mediaRows`, 13 `featureCases`, and 32 `lifecycleCases` (decision sheet L326-347). F.2 has the full 13-ID feature taxonomy, and F.3 has 32 unique sequential IDs `NP-LIFE-001..NP-LIFE-032`; no `..NNN` lifecycle placeholder remains (L597-676).
- F.1 is now self-verifying for origin: its rows explicitly mark 19 `existing` and five `new` rows (L533-536, L554-589). The class column uses only `pass`, `capability-classed`, `best-effort, clean-failure`, and `clean-fail` (L538-550).
- The 24 media identities exactly match the required protocol distribution: HLS 001-010, DASH 001-004, TS 001-005, PROG 001-004, and FLV 001. Baseline media rows use H.264 Main@L3.1 plus AAC-LC; only `NP-HLS-009` is High@L4.1; `NP-HLS-010` is Main10 best-effort; and `NP-HLS-004`/`NP-TS-002` are capability-classed (L523-595).
- F.1 is backend-neutral: it expressly excludes engine/MSE/native-path identity commitments, and no F.1 row pre-commits to WebView, Media3, Hls.js, Dash.js, mpegts.js, or native video (L525-531).
- The corrected sheet preserves the substantive governing decisions: Media3 presumptive with a 6-10h WebView diagnostic only; four independent gates and explicit scope-change-or-STOP treatment; explicit owner decisions for cleartext spike/product policy; HTTPS-only metadata proxy; controlled-beta timing; the unchanged annotated-tag target; and the corrected estimate range (L25-74, L486-514, L737-792).
- `NP-HLS-008` is correctly specified in section G as a two-member lock bundle: delayed deterministic A, distinct normal B, per-member closure hashes, bundle aggregate hash, and pinned delay-server configuration (L711-728). That is the correct lock-level fixture design.

## Issues

### Critical

- **None.** No provider/credential/private-media disclosure, codec/backend false decision, silent waiver, or other Critical issue was found.

### Important

- **Stable lifecycle IDs do not implement the required canonical lifecycle registry.**
  - **File and current lines:** `docs/android/audits/phase-1/decision-sheet.md` L641-670.
  - **What is wrong:** F.3 has the right count and contiguous syntax, but IDs `NP-LIFE-001..030` have different meanings from the required canonical mapping. It repeatedly shifts, merges, and splits canonical cases. For example, `001` merges VOD and live Home instead of being VOD-only; `002` is screen-off rather than live Home; `009` is PiP entry rather than VOD process death/relaunch; and network, Back, and track-preservation cases are all assigned different stable numbers. The two-anchor rule at L633-637 usefully requires independent VOD and live results when observations are identical, but it cannot repair an incorrect stable-ID mapping. The root-view Back row also incorrectly carries playback anchors at L667 even though root Back normally has no active playback media anchor.
  - **Why it matters:** the correction request required semantic stability, not merely 32 countable labels. Tooling, result evidence, feature cross-references, and later owner-approved integration will attach evidence to the wrong IDs. Combining same-observation VOD/live coverage can be evidence-safe only when both results are recorded independently; it cannot override the prescribed canonical IDs. The root Back anchor additionally invites an irrelevant playback dependency for a non-player navigation case.
  - **Exact correction:** replace F.3 L641-670 with the required canonical meanings for `NP-LIFE-001..030` in order, retaining `031`/`032` as cancellation. For two-anchor rows, retain an explicit result schema requiring separate VOD and live outcomes; do not merge cases whose observations differ, notably VOD resume-at-position versus live resume-at-live-edge. Make `NP-LIFE-030` root Back use `none (root view; no playback media anchor)` rather than `NP-HLS-001 + NP-HLS-003`. Keep any extra rotation/config or track-preservation coverage as evidence fields/subcases without renumbering the canonical registry.

- **`NP-HLS-008` still puts cancellation behavior in the F.1 media-row pass condition, and F.2 does not explicitly prohibit a duplicate cancellation execution.**
  - **File and current lines:** `docs/android/audits/phase-1/decision-sheet.md` L589, L612-622, and L671-672.
  - **What is wrong:** F.1 defines the fixture correctly as A/B media closures but appends the behavioral assertion “no stale callback/state/audio; B starts clean” to the media-row description at L589. That is a lifecycle/cancellation result, not an identity/playability or lock-integrity condition. F.2 says the cancellation cases have the “same observation as” F.3 and later says they “share their pass observation,” but it never explicitly identifies them as non-executing cross-references to the one F.3 execution.
  - **Why it matters:** this repeats the behavior/media taxonomy collapse the correction was required to remove. It allows a media identity to pass or fail based on runtime cancellation behavior, and it leaves ambiguity over whether `NP-CANCEL-001/002` cause duplicate executions of `NP-LIFE-031/032`.
  - **Exact correction:** change F.1 `NP-HLS-008` to an identity-only condition: member A and member B are independently playable, byte-distinct locked closures and the per-member/bundle hashes plus delay-server configuration validate. Move “no stale callback/state/audio; B starts clean” exclusively to `NP-LIFE-031/032`. At F.2 L612-622, state that `NP-CANCEL-001` is a non-executing feature-taxonomy cross-reference to the single recorded execution of `NP-LIFE-031`, and equivalently `NP-CANCEL-002` to `NP-LIFE-032`; the feature records must consume that result and must not schedule a second execution.

### Minor

- **`NP-LIFE-019` is not self-contained because its required observation is only a cross-reference.**
  - **File and current lines:** `docs/android/audits/phase-1/decision-sheet.md` L659.
  - **What is wrong:** the Activity-recreation config/dark-mode row says only “As `NP-LIFE-018`” in the Required observation column rather than stating the observation directly.
  - **Why it matters:** it is understandable, but it weakens the claim that every lifecycle row independently has a concrete, validator-ready observation and makes a row-level result schema need an indirect lookup.
  - **Exact correction:** replace the cross-reference with the full observation: “Playback survives or resumes within 2s at the same position; no re-buffer from zero, no track reset,” including the explicit selected-audio/subtitle preservation requirement where the final canonical registry assigns it.

## Original-review finding status

| Prior finding | Status | Evidence |
|---|---|---|
| Important: F.3 lifecycle IDs were unenumerated/prose-only | **Partly fixed; not fully acceptable** | F.3 now contains exactly 32 concrete sequential IDs and no `..NNN` placeholder (L624-676), fixing the countability defect. However, the stable ID meanings do not follow the required canonical mapping (Important issue above). |
| Minor: 19 existing / five new provenance was not visible in F.1 | **Fixed** | Every F.1 row has an Origin value, and the sheet explicitly identifies the five additions (L533-536, L554-593). |
| Minor: F.1 class vocabulary was not normalized | **Fixed** | Section F.1 defines and uses exactly the four required strings (L538-550, L554-589). |

## Lifecycle semantic mapping

F.3's two-anchor rule (L633-637) requires both VOD and live variants to run and pass independently. That is an equivalent evidence improvement only where the required observation is identical. It does not make a different numeric meaning compliant with the mandated stable registry.

All Phase 1 §4.1/§4.2/§5 behaviors remain represented somewhere in current F.3, although often under the wrong stable ID:

| Requirement behavior | Current F.3 representation | Coverage result |
|---|---|---|
| Background audio; screen off/on; foreground | `NP-LIFE-001..004` | Represented; canonical VOD/live IDs drift. |
| Notification, lock screen, headset/Bluetooth, focus, becoming noisy, backgrounded process death, live no-seek | `NP-LIFE-005..008`, `015..017`, `028` | Represented; canonical IDs drift. |
| PiP entry, controls/aspect, restore, background exit, stopped/error denial | `NP-LIFE-009..014` | Represented; canonical IDs drift. |
| Activity recreation, process death/relaunch, <=10s freshness, selected audio/subtitle preservation | `NP-LIFE-018..021`, `030` | Represented but wrongly renumbered; process-death and freshness evidence are split. |
| VOD/live loss and restoration; VOD/live Wi-Fi/cellular change | `NP-LIFE-022..025` | Represented, but loss/change are merged two-anchor rows and stable IDs drift. |
| Player Back and root Back | `NP-LIFE-026..027` | Represented; root Back has an incorrect playback anchor and both IDs drift. |
| Cancellation during manifest load and playback | `NP-LIFE-031..032` | Correctly represented and correctly numbered. |

| Required ID and canonical meaning | Current same-ID F.3 meaning | Status |
|---|---|---|
| 001 VOD app-background/Home | Home on VOD + live | Meaning drift: merges canonical 001/002; independent anchors preserve evidence but not canonical ID meaning. |
| 002 live app-background/Home | Screen off on VOD + live | Meaning drift. |
| 003 VOD foreground after background audio | Screen on on VOD + live | Meaning drift. |
| 004 live foreground after background audio | Foreground on VOD + live | Meaning drift: merges canonical 003/004. |
| 005 VOD screen off/on | Media notification on VOD + live | Meaning drift. |
| 006 live screen off/on | Lock-screen controls on VOD + live | Meaning drift. |
| 007 VOD Activity recreation | Headset/Bluetooth controls on VOD + live | Meaning drift. |
| 008 live Activity recreation | Process death while backgrounded | Meaning drift. |
| 009 VOD process death/relaunch to detail with <=10s-stale resume | PiP entry on VOD + live | Meaning drift. |
| 010 Process death while backgrounded, no notification/zombie audio | PiP transport on VOD + live | Meaning drift. |
| 011 Transient audio-focus loss | PiP aspect ratio on VOD + live | Meaning drift. |
| 012 Permanent audio-focus loss | PiP restore on VOD + live | Meaning drift. |
| 013 Becoming noisy/headphones unplugged | PiP exit while backgrounded on VOD + live | Meaning drift. |
| 014 VOD media notification | No PiP for stopped/errored player on VOD + live | Meaning drift. |
| 015 Lock-screen metadata/controls | Transient audio-focus loss on VOD + live | Meaning drift. |
| 016 Headset/Bluetooth controls | Permanent audio-focus loss on VOD + live | Meaning drift. |
| 017 Live notification with no seek | Becoming noisy on VOD + live | Meaning drift. |
| 018 VOD PiP auto-entry | Activity recreation/rotation on VOD + live | Meaning drift. |
| 019 PiP controls and aspect ratio | Activity recreation/config-dark mode on VOD + live | Meaning drift; the observation is also indirect. |
| 020 Restore from PiP with position/tracks | VOD process death/relaunch | Meaning drift. |
| 021 PiP exit while backgrounded -> background audio | VOD resume freshness | Meaning drift. |
| 022 No PiP for stopped/errored player | Network loss on VOD + live | Meaning drift; merge is evidence-safe only because loss observation is identical and both results are required. |
| 023 VOD network loss | VOD network restoration | Meaning drift. |
| 024 VOD network restoration | Live network restoration | Meaning drift. |
| 025 Live network loss | Wi-Fi/cellular change on VOD + live | Meaning drift. |
| 026 Live network restoration | System Back in player on VOD + live | Meaning drift. |
| 027 VOD Wi-Fi/cellular change | System Back at root with playback anchors | Meaning drift and semantically wrong root-view anchor. |
| 028 Live Wi-Fi/cellular change | Live no-seek notification | Meaning drift. |
| 029 System Back in player | Live foreground/live-edge continuity | Meaning drift. |
| 030 System Back at root | Track-selection preservation | Meaning drift. |
| 031 Cancellation during manifest load | Cancellation during manifest load | **Exact match.** |
| 032 Cancellation during playback | Cancellation during playback | **Exact match.** |

**Lifecycle mapping verdict:** **FAIL / WITH FIXES.** The original enumeration/count issue is fixed, and every row has an event and anchor set, but the required stable meanings are wrong for 001-030. Section F.3 must be renumbered/recomposed to the canonical registry before owner approval.

## Feature taxonomy verification

- F.2 contains exactly the required 13 unique stable IDs: `NP-DL-001..004`, `NP-CAST-001..003`, `NP-ERR-001..004`, and `NP-CANCEL-001..002` (L599-615).
- Each feature case references an existing F.1 media identity: progressive/HLS/DASH VOD downloads reference `NP-PROG-001`, `NP-HLS-001`, and `NP-DASH-001`; Cast references `NP-HLS-001`, `NP-DASH-001`, and `NP-TS-001`; errors reference the appropriate negative rows; cancellations reference `NP-HLS-008` (L601-613).
- Downloads and Cast remain F.2 feature cases and are not lifecycle cases or media identities (L615-622, L624-631).
- All negative cases retain explicit user-visible requirements: unsupported format/audio, no silent audio failure, and manifest error within the watchdog window (L608-611).
- The cancellation feature IDs cross-reference F.3, but the sheet needs the explicit non-duplicate-execution wording identified in the Important issue.

**Feature taxonomy verdict:** **WITH FIXES.** The exact taxonomy and media references are correct; cancellation must be expressly a single shared lifecycle execution rather than an ambiguously duplicated feature execution.

## Media registry verification

Programmatic F.1 extraction verified 24 unique media IDs and the exact required set:

- HLS: `NP-HLS-001..010`
- DASH: `NP-DASH-001..004`
- TS: `NP-TS-001..005`
- PROG: `NP-PROG-001..004`
- FLV: `NP-FLV-001`

Additional checks passed:

- Origin split is exactly 19 `existing` / five `new` (L533-536, L554-589).
- Class vocabulary is exactly `pass`, `capability-classed`, `best-effort, clean-failure`, and `clean-fail` (L538-550).
- Mandatory baseline rows use H.264 Main@L3.1 plus AAC-LC; only `NP-HLS-009` carries High@L4.1; `NP-HLS-010` is HEVC Main10 best-effort (L529-531, L556-568).
- `NP-HLS-004` and `NP-TS-002` are capability-classed; `NP-TS-005` expressly has distinguishable/selectable, audibly decoded HE-AAC v1 and v2 tracks (L559-566).
- MKV remains a clean application-policy rejection, not an accidental decoder failure (L585, L593-595).
- DASH audio/text enumeration and selection remain mandatory backend evidence under `P1-D09` (L286-301, L576-577, L500-502).
- F.1 identity rows are backend-neutral. No forbidden engine/product-path pre-commit was found.

`NP-HLS-008`'s lock design in section G passes the fixture-separation check, but its F.1 description fails the media-behavior separation check described in the Important issue.

**Media registry verdict:** **WITH FIXES.** The 24-ID registry, origin/class normalization, and codec semantics pass; `NP-HLS-008` must remove runtime cancellation behavior from the media-row pass condition.

## Decision-ID and approval-block verification

Programmatic register and approval-block checks passed:

- Exactly 17 sequential unique decision headings: `P1-D01..P1-D17` (L158-438).
- All 17 register blocks contain **Subject**, **Recommended decision**, **Rationale**, **Consequence**, and owner status `AWAITING APPROVAL`.
- Section K contains all 17 IDs exactly once, in order, with `APPROVE / REJECT` entries (L796-823).
- No decision is silently marked approved. The additional `AWAITING APPROVAL` occurrence is the section-C explanatory statement, not a decision status (L153-177).
- `P1-D11`'s numerical totals agree with F.1/F.2/F.3 (24/13/32), but its promised fixed stable lifecycle registry does not agree semantically with the required canonical mapping.

**Decision/approval-block verdict:** **WITH FIXES.** The decision and approval mechanics pass; `P1-D11` needs F.3's stable meanings corrected before the owner can safely approve that decision.

## Security, privacy, and governance verification

- Phase 1 remains explicitly **OPEN**, not shipped, conditionally closed, or device-verified (L25-32, L829-850).
- Media3 remains presumptive and WebView remains a capped 6-10h diagnostic only (L45-52, L248-267, L486-514).
- The four gates remain independent. Non-local gate failures require an explicit owner scope change or STOP, never silent deferral (L269-284, L498-510).
- Both cleartext decisions remain owner decisions; the metadata proxy is HTTPS-only; reports/locks forbid provider URLs, hostnames, credentials, catalog payloads, and private media data (L375-408, L693-730, L737-756).
- Controlled-beta timing remains correctly divided between pre-Phase-3 feasibility and pre-Phase-4 cohort onboarding (L410-422, L760-771).
- The annotated tag name and target remain `baseline/webos-2026-08-09` on the stated baseline, described only as a host-verified rollback baseline, not shipped/device-verified; the old estimate is withdrawn and ~84-134h remains advisory (L424-438, L775-792).
- Normative effect remains none pending owner approval and later integration (L11-16, L59-74; README L29-46).

**Security, privacy, and governance verdict:** **PASS.**

## File-fact verification

- **Decision-sheet physical line count:** 908, measured directly from UTF-8 decoded physical lines.
- **Reported 763-line count:** does not match the current file. The current count is 145 lines higher.
- **UTF-8/mojibake:** UTF-8 decoding succeeds; no replacement characters or common mojibake markers were found.
- **Task mutation scope:** the permitted rereview report did not exist before this task. Initial Git status already showed unrelated changes and untracked documentation. This task created only this report and did not stage, tag, commit, alter the reviewed sheet, or modify source/tests/normative/audit documents.

## Assessment

The correction fixed the original countability failure and both prior Minor findings, and the codec, media-row inventory, decision mechanics, security posture, and governance remain strong. Owner approval remains blocked because the purportedly stable lifecycle registry does not use the requested canonical meanings and `NP-HLS-008` still mixes media-fixture identity with runtime cancellation behavior.

Ready for owner approval: WITH FIXES
Reason: restore the canonical 001-030 lifecycle meanings and keep cancellation behavior exclusively in the shared F.2/F.3 behavior evidence, not the F.1 media identity.