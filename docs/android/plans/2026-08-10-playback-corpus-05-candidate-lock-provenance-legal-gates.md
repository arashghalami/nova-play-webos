# Playback Corpus Plan 5 — Candidate, Proposed Lock, Provenance, and Legal Gates

## Status and authority

This is an implementation-planning document only. It authorizes no implementation, workflow YAML, candidate run, fixture generation, staging, signing, GitHub mutation, tag, Release, publication, or Android product work now.

Planning authority is the approved design `docs/android/specs/2026-08-09-playback-corpus-design.md`, Git blob `dc7edd395b0d6996d207236f84ea373c6f5b7371`, raw SHA-256 `d3a85e7971b826a70c0d308d52dfd938b208c4f832c0adcbb6ab5a4527400f34`, and approval record at commit `9f74b932ac7ba85f5b1896608131c9faa4a7d966`, reviewed at `d3183df450e9660aae72560e743292b02601d142`. Approval grants planning only. Phase 1 remains **OPEN**.

## Goal and bounded outcome

After Plans 2, 3, and 4 are green, construct a protected, nonpublishing candidate transaction that validates all 24 media rows and produces exact candidate bytes, a non-authoritative proposed content lock, complete run identity, provenance/legal records, reports, attestations, and a separately finalized candidate-evidence-index.

The bounded outcome is a fail-closed candidate package eligible for later staging review. It grants neither content-lock authority nor redistribution/publication authority.

## Prerequisites and dependency gate

Inputs:

- Plan 1 green.
- Plan 2 green contracts.
- Plans 3 and 4 both green and mutually compatible.

The exact dependency graph is:

```text
1 -> 2 -> (3 || 4; both green) -> 5
2 -> 6 in parallel with 3–5
5 + 6 -> 7 -> 8
```

Plan 5 cannot start until Plans 3 and 4 are green. Plan 6 may proceed in parallel but Plans 5 and 6 both must be green before Plan 7.

## Scope and non-goals

### In scope

- Protected, secret-free, nonpublishing candidate execution from source/spec commit S.
- Exact candidate archive and `proposed-content-lock.json`, produced together and remaining non-authoritative.
- Per-row provenance, licence, notices, patent/codec caveats, redistribution basis, and owner-decision state for all 24 rows.
- Archive-budget, fixture/oracle/closure/toolchain/policy validation; execution-envelope reports; provenance attestation.
- Exact candidate run/attempt/transaction/repository/workflow/runner/OCI identity.
- Corrected acyclic candidate construction, preserving candidate core and evidence index as separate objects.
- Failure, rejection, and quarantine proposals under the S-bound incident policy.
- Protected nonpublishing candidate acceptance with no GitHub Release operation.

### Non-goals

- No staging or draft Release; no normative content lock; no E or A; no signing, tag, promotion, receipt, Release, or publication.
- No workflow authority for pull requests/forks and no repository secret in candidate execution.
- No legal-advice, legal-clearance, patent-licence, or warranty claim.
- No waiver or silent omission of a row with unresolved provenance/redistribution state.
- No provider/private/tester/device/credential/DRM/encrypted/real-IPTV content.
- No Android/product/device-support claim or implementation.
- No refactor of `src/main.ts` or `src/library/catalog-repository.ts`.
- No amendment of the approved identities: exact 24/13/32, 19+5, 16/2/2/4, non-executing cancellation aliases, and identity/lock-only `NP-HLS-008`.

## Affected file areas

Inputs and future implementation areas:

- Plan 1/2 control documents under `docs/android/`.
- Plan 2–4 modules, schemas, recipes, oracles, and tests under `tools/playback-corpus/`.
- ignored candidate/archive working bytes under `fixtures/playback-corpus/`.
- candidate/provenance/legal modules and tests under `tools/playback-corpus/src/` and `tools/playback-corpus/test/`.
- licence/provenance documentation under `docs/android/`.
- future candidate workflow only in `.github/workflows/playback-corpus-candidate.yml`, introduced during implementation after this plan is authorized.

No complete artifact directory tree or workflow implementation is fixed here.

## Cross-plan inputs and outputs

Plan 5 consumes Plan 2 contracts, Plan 3 toolchain/generated-object evidence, and Plan 4 closure/oracle/archive/machine evidence.

The corrected construction graph is exactly:

```text
deterministic candidate outputs finalize
-> candidate-manifest.json candidate-core bytes
-> external candidateDigest
-> reports, validation evidence, provenance attestation, and candidate payload artifacts bind candidateDigest
-> those payload artifacts already exist with numeric Actions artifact identities
-> candidate-evidence-index bytes bind candidateDigest, reports/evidence, attestation, and existing payload artifact identities
-> external candidateEvidenceDigest
-> the later carrier identity for the evidence index remains external
```

The candidate core contains only identities available before it is finalized. It excludes its own digest, post-upload artifact identities, attestation envelope digest, evidence whose bytes bind `candidateDigest`, `candidateEvidenceDigest`, and evidence-index carrier identity. The evidence index excludes its own digest and carrier identity. No self-hash or downstream back-edge is permitted.

Stable outputs consumed by Plan 7 are the validated candidate core/digest, evidence index/digest, proposed lock/raw identity, archive identity, reports, attestation, per-row provenance/legal states, S-bound incident policy, run/attempt/transaction identities, and candidate payload artifact identities.

## Reviewable implementation work packages

### Work package 1 — Candidate-core projection and transaction identity

- **Purpose:** finalize all deterministic outputs and then construct one candidate core containing only already-known identities.
- **Expected changed file area:** candidate projection modules, schemas/tests, and ignored candidate output.
- **Test-first obligation:** reject every omitted identity-critical field, future/post-upload field, self-reference, reduced rerun projection, wrong repository/workflow/run/attempt/transaction, or nondeterministic control mismatch.
- **Output/evidence:** exact candidate-core bytes, external `candidateDigest`, and projection coverage report.
- **Rollback boundary:** discard the candidate attempt; never patch a finalized core.
- **Commit boundary:** candidate-core implementation/tests form one reviewable trust-boundary commit.

### Work package 2 — Proposed lock, archive, and all-row validation

- **Purpose:** bind the exact generated objects, closures, recipes, oracles, archive, and legal records without claiming authority.
- **Expected changed file area:** proposed-lock/candidate validators, tests, and ignored output.
- **Test-first obligation:** cover all 24 rows, exact counts/classes, closure/object/archive reprojection, missing or unresolved inputs, budget limits, `NP-HLS-008` A/B identity, and non-executing aliases.
- **Output/evidence:** exact proposed-lock and archive identities, all-row report, and explicit non-authoritative status.
- **Rollback boundary:** discard proposed lock and archive together with the failed attempt.
- **Commit boundary:** validator/lock contract lands together; generated outputs remain uncommitted.

### Work package 3 — Provenance, redistribution, reports, and attestation

- **Purpose:** create complete evidence after `candidateDigest` exists, keeping generation success separate from redistribution approval.
- **Expected changed file area:** provenance/legal/report/attestation modules, tests, records under approved tooling/docs areas, and run artifacts.
- **Test-first obligation:** fail for any missing/ambiguous/expired/incompatible row entry, forbidden content/tool distribution, omitted caveat/notice, altered subject, or device/legal-clearance claim.
- **Output/evidence:** 24-row provenance matrix, validation reports, attestation identities, and publication-blocking disposition.
- **Rollback boundary:** failed evidence invalidates the attempt; deterministic bytes alone cannot advance.
- **Commit boundary:** each evidence family and its tests may be reviewed separately, but no candidate is green until the set is complete.

### Work package 4 — Candidate-evidence-index and protected nonpublishing gate

- **Purpose:** finalize the evidence index only after reports, attestation, and payload artifacts exist, then exercise the complete candidate path without staging.
- **Expected changed file area:** evidence-index modules/tests and future protected candidate workflow under `.github/workflows/`.
- **Test-first obligation:** reject absent/changed numeric artifact identities, digest/name/size mismatch, carrier back-edge, duplicate attempt reuse, secret/privilege exposure, unresolved row, or authoritative/public output.
- **Output/evidence:** exact evidence-index bytes, external `candidateEvidenceDigest`, external carrier observation, protected candidate report, and failure-injection results.
- **Rollback boundary:** quarantine or reject the attempt; never mutate or reuse its core/index as a different attempt.
- **Commit boundary:** protected workflow and index contract land only with all local/recorded-response tests green.

## Acceptance commands and evidence

Existing nonpublishing conventions:

```text
npm test
npm run build
git diff --check
```

These root commands retain existing host regression and formatting coverage; they do not cover future `tools/playback-corpus/` behavior or grant candidate authority.

Plan 5 must add:

- a local nonpublishing candidate-validation command whose public purpose is to validate the complete candidate construction from existing Plan 3/4 outputs without creating an authoritative/public object. It passes only when every required identity, all 24 rows, legal state, report, attestation, candidate-core/evidence-index boundary, and non-claim check succeeds; any mismatch or missing check fails nonzero;
- a protected nonpublishing candidate workflow acceptance path whose public purpose is to prove the same exact construction and upload evidence without Release/staging permission. It passes only when the protected source/run/attempt/transaction, payload artifacts, attestation, external index-carrier observation, and fail-closed privilege conditions all validate; any mismatch, unresolved state, unauthorized permission, or authoritative/public output fails the acceptance gate.

Exact command/workflow invocation and evidence-carrier paths remain implementation decisions.

Required evidence:

- candidate-core bytes and `candidateDigest`;
- exact candidate-core exclusion/coverage report;
- proposed lock, archive, all-24 validation, budget, and non-claim reports;
- complete 24-row provenance/legal matrix;
- report/attestation subjects and identities;
- numeric payload artifact identities;
- candidate-evidence-index bytes and `candidateEvidenceDigest`;
- evidence-index carrier identity recorded externally;
- fault-injection results for stale/missing/changed/elevated inputs.

No command may stage a Release, commit a normative lock, sign, tag, publish, or mutate public state.

## Failure/rollback boundary

Any unresolved row, identity mismatch, construction back-edge, missing evidence, legal ambiguity, sensitive content, budget breach, unknown candidate outcome, or privilege violation stops and rejects/quarantines the attempt. Candidate outputs remain non-authoritative and disposable. A rerun is a distinct attempt even when deterministic bytes match.

## Independent review gate

Plan 5 is green only when an independent reviewer reports:

- Critical: **0**
- Important: **0**

The exact design §29 checkpoint is: protected nonpublishing candidate validates all 24 rows and fails closed; independent zero-Critical/Important review. Review evidence must prove the corrected candidate core/evidence-index graph, complete provenance/legal gates, exact run identity, and absence of staging/public authority.

## Implementation decisions deliberately deferred

Deferred choices include:

- focused module and artifact-carrier organization;
- exact Actions artifact grouping and report presentation;
- attestation tooling compatible with the approved subject/issuer/signer contracts;
- nonpublishing workflow job decomposition and resource tuning;
- diagnostic taxonomy and quarantine report format;
- how maintainers collect owner decision evidence for each row within the fixed legal fields.

Selections must preserve the acyclic graph, exact stable projections, protected/secret-free candidate boundary, fail-closed legal gate, distinct rerun identity, and maintainable review surface. Convenience may not collapse core/index, generation/legal approval, or candidate/staging authority.