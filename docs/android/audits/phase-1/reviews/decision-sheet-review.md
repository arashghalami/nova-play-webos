# Decision-sheet independent review

- **Review of:** [`../decision-sheet.md`](../decision-sheet.md) (Phase 1 owner decision sheet, 803 lines)
- **Reviewer role:** independent senior reviewer (read-only; no normative authority)
- **Date:** 2026-08-09
- **Baseline commit:** `7a4a3b163d436dd1727b9fad5356536e27ef8a7f` (`docs(plans): council verdict on the three-app plan`)
- **Sources cross-checked:** `codec-policy.md`, `native-media-architecture.md`, `playback-corpus-reproducibility.md`, `closure-governance.md`, `README.md`, and the normative set (`plans/main-refactor-v3.md`, `docs/android/requirements.md`, `docs/android/device-policy.md`, `docs/android/playback-corpus.md`).
- **Method:** section-by-section read of the decision sheet, programmatic extraction of every `P1-D##` and `NP-*` identifier, field-completeness check on each decision block, registry arithmetic, and cross-reference reconciliation against the four audits and the normative documents.

## Strengths

- **Correct governing verdict.** The sheet keeps Phase 1 **OPEN** and refuses the closure-governance "conditionally closed" label, anchoring on the corpus-reproducibility FAIL (nothing pinned) as the governing fact (§A, `P1-D01`). This is the defensible reading of an intent-based closure standard and matches `playback-corpus-reproducibility.md §A`.
- **Clean conflict ledger.** Section B resolves each audit-to-audit disagreement exactly once (B1–B9) and carries each resolution into a numbered decision, so no conflict is resolved twice or left dangling.
- **Decision register is complete and well-formed.** All 17 decisions `P1-D01..P1-D17` are unique and sequential, each carries the full field set (Subject, Recommended decision, Rationale, Consequence, Owner status `AWAITING APPROVAL`), and every ID reappears verbatim in the section K approval block. This was verified programmatically, not by eye.
- **Media registry is bounded and collision-free.** The section F registry is exactly 24 unique `mediaRows` (13 core + 6 track + 5 negative), the arithmetic on L562 is correct, and the 19 → 24 delta names precisely the five additions. No ID serves two purposes.
- **Codec floor is correctly grounded.** Section D separates platform guarantee from device availability, extractor, decoder, and MSE exposure, and pins the mandatory floor to the Android 8.0 CDD clauses the codec audit cites. High@L4.1 and Main10 are correctly demoted to best-effort with clean-failure bars; HEVC Main is correctly capability-classed.
- **Backend disqualifier is stated narrowly.** `P1-D07` and section E explicitly retire the overbroad "Activity recreation always destroys every WebView configuration" phrasing and substitute the defensible ownership-based conclusion. This is the correct handling of B3.
- **Privacy discipline is explicit and consistent.** The cleartext decisions (`P1-D14`/`P1-D15`, section H) and the corpus lock invariants (section G) require redaction-to-shape, forbid committing provider material, and correctly state that Android network-security XML cannot add arbitrary runtime domains — consistent with `README.md`, `CLAUDE.md`, and `requirements.md §3`.

## Issues

### Critical

- **None.** No defect rises to blocking-on-substance: the governing verdict, codec floor, backend policy, media registry, and closure standard are all internally consistent and correctly grounded in the cited evidence.

### Important

- **`docs/android/audits/phase-1/decision-sheet.md` L585–592 (section F.3 `lifecycleCases`) — the third taxonomy layer is not enumerated, contradicting its own governing decision.**
  - **What is wrong:** `P1-D11` (L327–334) commits to "three layers" and states the lifecycle layer must use "stable lifecycle IDs (`NP-LIFE-001..NNN`) *rather than a prose-only set*." But F.3 never enumerates them: it leaves the literal placeholder `NP-LIFE-001..NNN` and defers assignment ("The executor assigns the concrete numbers when the lifecycle set is enumerated"). Two of the three declared layers (`mediaRows`, `featureCases`) are fully enumerated (24 and 7 IDs respectively); the third is still a promise.
  - **Why it matters:** `P1-D01`'s closure standard and section L both require the taxonomy to be countable so a validator can reject missing/extra IDs. A lifecycle layer that resolves to `..NNN` cannot be validated, cannot be counted, and cannot back the "every mandatory row is countable" rationale on L335–337. It also reproduces the exact "prose-only set" that `P1-D11` says it is replacing — the decision and the section that implements it disagree.
  - **Exact correction:** either (a) enumerate the lifecycle IDs now by promoting each `requirements.md §5` event and §4 behavior to a concrete `NP-LIFE-001..NP-LIFE-0NN` row in an F.3 table (mirroring F.2), or (b) if enumeration must wait for the executor, downgrade `P1-D11`'s wording from "define ... stable lifecycle IDs" to "define the lifecycle *ID grammar* `NP-LIFE-<NNN>`; the executor enumerates the set as the first integration task," so the decision no longer claims the IDs are fixed here when they are not. Recommend (a).

### Minor

- **`docs/android/audits/phase-1/decision-sheet.md` L562 vs L306–311 — the "19 existing + five new" provenance is asserted but the 19-row baseline is never itemised in this sheet.**
  - **What is wrong:** L306–311 and L562–564 state the registry is "the 19 existing IDs ... plus exactly five additions," but the pre-existing 19 are only listed as compressed ranges (`NP-HLS-001..008`, etc.) in `P1-D10`; a reader cannot confirm the 19/5 split without opening `playback-corpus-reproducibility.md`. The claim is true (verified: the five new IDs are `NP-HLS-009`, `NP-HLS-010`, `NP-TS-005`, `NP-PROG-004`, `NP-FLV-001`), but the sheet asks the owner to freeze a registry whose baseline half is not shown in the same document.
  - **Why it matters:** the sheet is meant to be the single self-contained approval artifact (§A "Net owner ask"); requiring a cross-open to verify the 19 weakens that.
  - **Exact correction:** add a "(new)" / "(existing)" marker column to the F.1 tables (four rows already carry "(new)"; mark the remaining new ones and leave existing rows unmarked, or add an explicit "existing 19" note under L564). No ID changes.

- **`docs/android/audits/phase-1/decision-sheet.md` L308 / L531 — `NP-HLS-009` is labelled both "capability/degradation" and "best-effort, clean-failure," while `NP-HLS-004` uses "capability-classed."**
  - **What is wrong:** three near-adjacent class vocabularies ("capability/degradation" in `P1-D10`, "best-effort, clean-failure" in the F.1 table, "capability-classed" for HEVC Main) describe the pass semantics for High@L4.1 and Main10. They are reconcilable but not identical strings.
  - **Why it matters:** section G specifies a validator that keys on row class; inconsistent class labels risk the validator treating them as distinct classes at integration.
  - **Exact correction:** normalise to the section D vocabulary — use "best-effort, clean-failure" for `NP-HLS-009`/`NP-HLS-010`/`NP-TS-003`/`NP-TS-004` and "capability-classed" for `NP-HLS-004`/`NP-TS-002` everywhere, including inside `P1-D10` (L318–319 already uses the correct terms; align L308–309 to match).


## Decision-ID verification

Programmatic extraction of every `P1-D##` token in `decision-sheet.md`, then a field-completeness check on each register block.

- **Count and range:** 17 distinct IDs, `P1-D01` through `P1-D17`, sequential with no gaps and no duplicates. PASS.
- **Register presence (section C):** all 17 appear as `### P1-D##` headed blocks. PASS.
- **Approval-block presence (section K, L701–717):** all 17 appear exactly once in the copy/paste approval block, in register order, each with an `APPROVE / REJECT` line. PASS.
- **Field completeness:** every block carries all five required fields — `Subject`, `Recommended decision`, `Rationale`, `Consequence`, `Owner status: AWAITING APPROVAL`. Verified block-by-block (17/17 `SRaCO`). PASS.
- **Owner status:** every register block ends `AWAITING APPROVAL`; none is pre-approved or normative. The 18th `AWAITING APPROVAL` occurrence is the intro sentence at L155, not a stray decision. PASS.
- **Non-normative discipline:** the sheet states (L11–16, L74) that it amends no normative document until approved and integrated; no decision block asserts immediate normative force. PASS.
- **No lifecycle-ID contradiction inside the register itself:** `P1-D11` is internally complete as a *decision*; the enumeration gap is in its *implementing section* (F.3) — recorded as an Important issue above, not a decision-ID defect.

**Decision-ID verdict: PASS.** All 17 IDs are unique, sequential, fully specified, and awaiting approval.

## Media-ID verification

Programmatic extraction of every `NP-<PROTOCOL>-<NNN>` token, de-duplicated, then scoped to the section F.1 registry.

- **Registry size:** section F.1 contains exactly 24 unique `mediaRows`. PASS.
- **Protocol distribution:** HLS ×10 (`001..010`), DASH ×4 (`001..004`), TS ×5 (`001..005`), PROG ×4 (`001..004`), FLV ×1 (`001`). Sums to 24. PASS.
- **Registry arithmetic (L562):** "13 core + 6 track + 5 negative = 24" — recomputed from the three F.1 tables and correct. PASS.
- **19 → 24 delta:** the five additions `NP-HLS-009`, `NP-HLS-010`, `NP-TS-005`, `NP-PROG-004`, `NP-FLV-001` are exactly the coverage gaps named in `P1-D10` (High@L4.1 ceiling, Main10, HE-AAC, native TextTrack, FLV). PASS.
- **ID grammar:** grammar extended to `PROTOCOL ∈ HLS | DASH | TS | PROG | FLV` (L518), and `NP-FLV-001` is the only new-protocol row. Consistent. PASS.
- **Collision check:** no `NP-*` media ID appears with two different meanings; feature IDs (`NP-DL-*`, `NP-CAST-*`) live in a separate F.2 layer and only *reference* media rows. PASS.
- **Rejected/placeholder IDs are not smuggled into the registry:** `NP-DASH-005/006` appear only in B4, `P1-D09`, and section N as explicitly *rejected* additions (L60, L110, L115, L294, L789) and are absent from F.1. `NP-LIFE-001` appears only as the placeholder token in `P1-D11` and F.3, not as a media row. PASS.
- **Cross-reference integrity:** every media ID referenced by a gate (section E), a feature case (F.2), or a codec decision (`P1-D03..D06`, e.g. `NP-HLS-009`, `NP-HLS-010`, `NP-TS-003/004`, `NP-HLS-004`, `NP-TS-002`) exists in F.1. No dangling reference. PASS.

**Media-ID verdict: PASS.** Exactly 24 collision-free media identities; grammar, arithmetic, and the 19+5 provenance all reconcile.

## Feature/lifecycle taxonomy verification

The sheet declares three layers in `P1-D11` and implements them in section F.

- **Layer 1 — `mediaRows` (F.1):** enumerated, 24 IDs. PASS (see Media-ID verification).
- **Layer 2 — `featureCases` (F.2):** enumerated, 7 IDs — `NP-DL-001..004` and `NP-CAST-001..003`. Each references a concrete media row (progressive/HLS/DASH VOD for downloads; HLS/DASH/TS for Cast) and none duplicates media bytes. Scope statements (downloads VOD-only, Cast HLS/DASH-only, TS/FLV unavailable-with-reason) match `P1-D12`/`P1-D13` and the section E gate table. PASS.
- **Layer 3 — `lifecycleCases` (F.3):** **NOT enumerated.** F.3 leaves the placeholder `NP-LIFE-001..NNN` and defers concrete numbering to the executor, which contradicts `P1-D11`'s promise of "stable lifecycle IDs ... rather than a prose-only set." Recorded as the single Important issue. FAIL (for enumeration; the *grammar* and anchor rows `NP-HLS-003`/`NP-HLS-001` are specified).
- **Layering discipline:** the three-layer separation itself is sound — feature and lifecycle cases reference media rows and never inflate the 24-identity media lock, correctly rejecting the corpus audit's "30 sample rows" folding (B5, section N). PASS.

**Taxonomy verdict: WITH FIXES.** Two of three layers are fully enumerated and correct; the lifecycle layer must be enumerated (or `P1-D11` reworded to grammar-only) before the taxonomy matches its own decision.

## Security and privacy review

- **No provider/credential leakage in the sheet.** No panel hostnames, credentials, catalog payloads, or stream URLs appear. The single concrete host reference is the credential-free metadata proxy concept (HTTPS-only), consistent with the standing constraint that the proxy never accepts IPTV credentials. PASS.
- **Cleartext spike (`P1-D14`, section H):** cleartext limited to explicit approved test hosts; spike network config may be locally generated/untracked when hostnames are private; committed reports carry only redacted reachability shape (cleartext yes/no, CORS present/absent, status class). Consistent with `requirements.md §3`, `README.md`, and `playback-corpus-reproducibility.md §J`. PASS.
- **Cleartext product (`P1-D15`, section H):** correctly identifies that arbitrary user-entered HTTP providers likely force app-level cleartext, and enforces compensating controls (HTTPS-only proxy traffic, strict URL validation, explicit HTTP warning, no redirects to unexpected hosts, URL/credential redaction). Correctly states Android network-security XML cannot add arbitrary runtime domains, and flags this as an explicit owner reversal of the "never global cleartext" wording rather than an auditor call. This is the right escalation, not an overreach. PASS.
- **Corpus lock privacy (section G):** no private provider data in the lock; manifests rewritten to relative paths so no host leaks; public live edges never checksum-pinned; media bytes never committed (metadata-only lock). Consistent with the gitignored-fixtures model. PASS.
- **Baseline tag (section J, `P1-D17`):** no implicit push; described as a host-verified source rollback baseline, explicitly *not* shipped or device-verified — avoids overclaiming a release. Correct handling of the device-measurements-pending constraint. PASS.
- **Redaction of estimates/measurements:** the sheet reports host-side "48/442 tests green, four build guards green" as host-verified only and defers device numbers — no fabricated device-pass claims. PASS.

**Security and privacy verdict: PASS.** No leakage; both cleartext policies and the corpus-lock invariants are privacy-preserving and correctly escalate the product cleartext reversal to the owner.

## Recommendations

1. **Resolve the F.3 lifecycle enumeration (Important).** Preferred: enumerate `NP-LIFE-001..NP-LIFE-0NN` now as an F.3 table mapping each `requirements.md §5` event and §4 behavior to a stable ID and anchor row (`NP-HLS-003` live, `NP-HLS-001` VOD). Alternative: reword `P1-D11` to commit only to the lifecycle *grammar*, with enumeration as the first integration task. Do not leave `P1-D11` claiming fixed IDs while F.3 defers them.
2. **Show the 19-row baseline in-sheet (Minor).** Add an existing/new marker to the F.1 tables so the 19+5 = 24 split is verifiable without opening the corpus audit.
3. **Normalise row-class vocabulary (Minor).** Use "best-effort, clean-failure" and "capability-classed" consistently across `P1-D10` and the F.1 tables so the section G validator keys on stable class strings.
4. **No change required** to the governing verdict, codec floor, backend policy, gate structure, media registry size, cleartext policies, tag policy, or closure checklist — these are correct as written.

## Assessment

The decision sheet is substantively sound: the OPEN verdict is correctly grounded in the corpus FAIL, all 17 decisions are complete and awaiting approval, the 24-row media registry is collision-free and arithmetically correct, the codec floor and backend disqualifier are narrowly and correctly stated, and the privacy/cleartext posture is right. The one material defect is that the `lifecycleCases` layer (F.3) is not enumerated, which contradicts `P1-D11`'s own "stable IDs, not prose" commitment; the remaining two issues are cosmetic.

**Ready for owner approval: WITH FIXES.** — Technical reason: the three-layer taxonomy the owner is asked to freeze (`P1-D11`) is only two-thirds enumerated; the lifecycle layer must be enumerated (or `P1-D11` reworded to grammar-only) so the closure validator required by `P1-D01`/section L can count and reject lifecycle IDs. All other decisions are approvable as written.
