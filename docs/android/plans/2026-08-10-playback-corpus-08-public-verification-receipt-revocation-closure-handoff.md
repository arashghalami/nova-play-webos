# Playback Corpus Plan 8 — Public Verification, Receipt, Revocation, and Closure Handoff

## Status and authority

This is an implementation-planning document only. It authorizes no implementation, workflow YAML, public verification run, receipt, GitHub mutation, revocation, commit R, closure action, tag, Release, publication, or Android product work now.

Planning authority is the approved design `docs/android/specs/2026-08-09-playback-corpus-design.md`, Git blob `dc7edd395b0d6996d207236f84ea373c6f5b7371`, raw SHA-256 `d3a85e7971b826a70c0d308d52dfd938b208c4f832c0adcbb6ab5a4527400f34`, and approval record at commit `9f74b932ac7ba85f5b1896608131c9faa4a7d966`, reviewed at `d3183df450e9660aae72560e743292b02601d142`. It grants planning only. Phase 1 remains **OPEN**.

## Goal and bounded outcome

After Plan 7 is green, independently verify the exact public Release/tag/assets and all upstream bindings; construct a deterministic proposed receipt plus separate run report; copy the exact proposed bytes in commit R; verify R and current public/revocation facts after commit; handle public failures additively; and hand `RECEIPT_VERIFIED` evidence to the broader Phase 1 closure process.

The bounded outcome is verified corpus provenance and immutable public bytes only. It does not prove Android/product/device behavior and cannot itself close Phase 1.

## Prerequisites and dependency gate

Inputs:

- All earlier plan gates, with Plan 7 green.
- Exact public facts and protected control evidence produced by Plan 7.

The dependency graph remains exactly:

```text
1 -> 2 -> (3 || 4; both green) -> 5
2 -> 6 in parallel with 3–5
5 + 6 -> 7 -> 8
```

Plan 8 starts only after Plan 7 is green. `PHASE_1_VERIFIED` and `PHASE_1_CLOSED` remain outside corpus-only success and require all non-corpus Phase 1 obligations.

## Scope and non-goals

### In scope

- Independent repository-numeric-ID-bound public verification of annotated tag T -> S, public immutable Release, exact assets, content lock, candidate/evidence, staging, approval/signature, workflow/attestation, policy, event, and current revocation bindings.
- Bounded anonymous/public asset download and exact byte/hash verification.
- Deterministic `proposed-release-receipt.json` and separate run-specific verification report.
- Receipt proposal event, exact byte-copy commit R to `docs/android/playback-corpus-release-receipt.json`, and independent post-commit verification from R Git blob bytes/public facts/prior report.
- `RECEIPT_VERIFIED` append-only event as the point at which the receipt becomes normative.
- Current revocation-chain discovery and five-mode fail-closed selector evaluation.
- Additive public failure/revocation handling, end-to-end fault injection, historical fact retention, and handoff to independent broader Phase 1 closure review.
- Explicit non-claims in receipts, reports, events, and handoff evidence.

### Non-goals

- No edit, redraft, asset replacement, tag movement, history rewrite, receipt self-approval, or reuse of approval/receipt for corrected bytes.
- No automatic Phase 1 closure, Android/device/backend/codec/lifecycle/download/Cast/cancellation/UI proof, or release-shipping claim.
- No provider/private/tester/device/credential/DRM/encrypted/real-IPTV content.
- No execution, decode, parse, or extraction of candidate media in the trusted verifier. Public asset handling is limited to bounded download plus raw byte-size/hash verification.
- No `src/main.ts` or `src/library/catalog-repository.ts` refactor.
- No change to exact 24/13/32, 19+5, 16/2/2/4, cancellation alias, `NP-HLS-008`, legal, archive, authority, receipt, event, or publication constraints.

## Affected file areas

Inputs and approved future areas:

- Plan 7 control/evidence paths under `docs/android/` and `tools/playback-corpus/`.
- public verification, receipt, revocation, and handoff modules/tests under `tools/playback-corpus/`.
- `docs/android/playback-corpus-release-receipt.json`
- `docs/android/playback-corpus-events/<corpusVersion>/`
- revocation/policy history under the approved `docs/android/` control area.
- Phase 1 verification/closure evidence under `docs/android/audits/phase-1/`.
- future `.github/workflows/playback-corpus-verify-release.yml`.

Exact internal modules, receipt proposal carrier, and review-report splits remain implementation choices.

## Cross-plan inputs and outputs

Plan 8 consumes Plan 7 public Release/tag/asset identities, E/A Git blobs, normative lock/staging/approval/signature, policy/revocation/event chain, candidate/evidence identities, and promotion observations.

The receipt authority flow is fixed:

```text
independent public fact snapshot
-> publicReleaseFactsDigest
-> deterministic proposed-release-receipt.json bytes
-> external receiptDigest and receiptRawSha256
-> separate run-specific verification report
-> RECEIPT_PROPOSED event
-> R copies proposed receipt bytes byte-for-byte
-> RECEIPT_COMMITTED event
-> independent post-commit verifier reads R Git blob and recomputes public/current revocation facts
-> RECEIPT_VERIFIED event
-> receipt becomes normative
```

Neither proposed nor R receipt embeds `receiptDigest` or `receiptRawSha256`; no receipt hashes itself. R cannot alter proposal bytes. Retry observations and transient diagnostics remain separate run evidence.

Stable output to the broader closure process is exact `RECEIPT_VERIFIED` evidence plus a corpus-boundary handoff that states outstanding non-corpus Phase 1 gates. `PHASE_1_VERIFIED` and `PHASE_1_CLOSED` require independent external evidence and authority; Plan 8 does not synthesize it.

Revocation discovery always loads the complete current protected chain. Matching uses exactly one selector mode—`key-wide`, `approval-set`, `policy-range`, `release-set`, or `receipt-set`—with scope conjunction and no union/intersection/fallback/empty-selector meaning.

## Reviewable implementation work packages

### Work package 1 — Independent public verifier

- **Purpose:** reconcile exact immutable public facts and every upstream binding without trusting promotion success flags.
- **Expected changed file area:** verifier modules/tests, bounded downloader, recorded responses, and verification workflow.
- **Test-first obligation:** cover wrong repository/tag type/annotation/target, missing/extra/changed asset, hash/size/ID mismatch, mutable Release, anonymous-access failure, altered E/A/signature/policy/attestation, stale event chain, and non-claim violation.
- **Output/evidence:** normalized public fact snapshot/digest, exact asset verification, upstream binding matrix, and separate run report.
- **Rollback boundary:** verification failure changes no public object; preserve observations and initiate additive failure handling.
- **Commit boundary:** verifier implementation/tests land before any transaction-specific report.

### Work package 2 — Proposed receipt and exact R byte-copy

- **Purpose:** construct stable receipt bytes from one verified fact snapshot, then commit exactly those bytes without circular authority.
- **Expected changed file area:** receipt construction/tests, proposed receipt run artifact, committed receipt path, and receipt events.
- **Test-first obligation:** reject transient fields, self-identities, noncanonical bytes/newline, proposal/report mismatch, altered byte copy, wrong parent/path, or premature authority claim.
- **Output/evidence:** proposed bytes, `receiptDigest`, `receiptRawSha256`, verification report, `RECEIPT_PROPOSED`, exact R Git blob, and `RECEIPT_COMMITTED`.
- **Rollback boundary:** before R, discard a bad proposal and create a new verified proposal; after R, never amend the receipt—use additive correction/revocation and a new corpus version where required.
- **Commit boundary:** R is one path-bounded exact-byte-copy commit, separate from proposal generation and post-commit verification.

### Work package 3 — Current revocation discovery and post-commit verification

- **Purpose:** prove the committed R bytes and current trust state independently before normative receipt authority.
- **Expected changed file area:** post-commit verifier, revocation-chain evaluator, tests, and event evidence.
- **Test-first obligation:** cover incomplete/reordered/broken chains, caller-reduced chain, all five selector modes, mixed/empty selectors, scope mismatch, key compromise, historical/current distinction, revoked approval/release/receipt, R blob mismatch, and changed public facts.
- **Output/evidence:** current protected-ref/verification-commit identity, complete policy/revocation evaluation, R/public/report reconciliation, and either finalized `RECEIPT_VERIFIED` or the mandatory additive revocation event/record for a post-public verification failure.
- **Rollback boundary:** failure never makes the receipt normative; published history remains, and every post-public verification failure immediately makes the corpus version `REVOKED` through additive revocation evidence. `QUARANTINED` is not an alternative post-public disposition.
- **Commit boundary:** post-commit evidence/event is separate from R.

### Work package 4 — Public failure handling and closure handoff

- **Purpose:** exercise end-to-end failure recovery and provide a precise corpus-only boundary to Phase 1 closure reviewers.
- **Expected changed file area:** fault tests, additive revocation/event records, and `docs/android/audits/phase-1/` handoff/review evidence.
- **Test-first obligation:** cover post-public verification failure, revoked current state, immutable retained Release, corrected-version requirement, no redraft/edit/delete, no false Android/Phase 1 claim, and missing non-corpus gate evidence.
- **Output/evidence:** end-to-end fault matrix, additive revocation result where applicable, corpus verification handoff, and explicit list of still-required Phase 1 evidence.
- **Rollback boundary:** no public rollback; retain Release, receipt/history, and revocation facts. Corrections use a new version and transaction.
- **Commit boundary:** corpus handoff and independent broader closure review remain separate; this plan cannot commit `PHASE_1_CLOSED` absent external authority.

## Acceptance commands and evidence

Existing nonpublishing regressions:

```text
npm test
npm run build
git diff --check
```

Plan 8 must add a local aggregate recorded-response/fault-validation command covering public fact normalization, bounded raw asset byte/hash verification, receipt construction, exact byte-copy validation, post-commit/revocation evaluation, and non-claim scanning. Its public purpose is to validate the complete Plan 8 read and authority contract without GitHub mutation. It passes only when every declared public binding, receipt transition, complete-current-revocation check, and non-claim assertion succeeds; any mismatch or missing check fails nonzero. Exact command naming and internal test grouping remain implementation decisions.

A read-only public verification acceptance command may query GitHub/public asset endpoints and download bounded declared assets. It must use the exact repository numeric identity, make no mutation, and fail nonzero on any identity, byte, signature, policy, event, immutable-state, receipt, or revocation mismatch.

Commit R and additive event/revocation operations are privileged state transitions, not ordinary validation commands. Their public contract is to accept and finalize only schema-valid, authority-valid proposals whose expected protected state still matches, and to reject without mutation otherwise. They require their own approved gate and protected finalizer during implementation; exact command names and mechanics remain deferred, and a local test never authorizes them.

Required evidence:

- public fact snapshot and digest;
- exact tag/Release/asset/API identities and downloaded hashes;
- upstream lock/candidate/evidence/staging/approval/signature/policy/attestation verification;
- proposed receipt bytes, report, and dual receipt identities;
- exact R blob byte equality;
- complete current revocation discovery/evaluation;
- post-commit public reconciliation and `RECEIPT_VERIFIED`;
- public-failure fault matrix;
- corpus-only closure handoff and non-claim report.

## Failure/rollback boundary

Before R, any mismatch discards the proposal and stops. After R or publication, no destructive rollback is allowed: preserve exact history, immediately finalize additive revocation evidence for any post-public verification failure, retain the Release, and require a new corpus version for corrected bytes. A failed or revoked receipt never becomes or remains trusted merely because prior workflows were green.

## Independent review gate

Plan 8 is green only when an independent reviewer reports:

- Critical: **0**
- Important: **0**

The exact design §29 checkpoint is: exact public receipt; revocation tests fail closed; independent zero-Critical/Important review. The review must also prove proposal → R → post-commit authority order, exact Git blob/public facts, complete current revocation discovery, additive failure semantics, non-claims, and that Phase 1 remains OPEN pending broader closure gates.

## Implementation decisions deliberately deferred

Deferred choices include:

- internal verifier/downloader/receipt/revocation module boundaries;
- bounded read retry and polling behavior;
- recorded-response and public-report organization;
- proposed receipt artifact transport before R;
- exact R review/commit mechanics within the fixed byte-copy boundary;
- closure-handoff report layout and coordination with independent reviewers;
- presentation of current versus historical verification.

Choices must remain read-minimal, bounded, independently reproducible, repository-derived, fail-closed, append-only, and explicit about corpus-only claims. They may not embed receipt self-identities, reduce the revocation chain, mutate published history, or turn corpus verification into Phase 1 closure.