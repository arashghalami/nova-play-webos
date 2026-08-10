# Playback Corpus Plan 6 — GitHub Capability Probe and Read-Only Adapter

## Status and authority

This is an implementation-planning document only. It authorizes no implementation, probe execution, workflow YAML, GitHub mutation, candidate, staging, signing, tag, Release, publication, or Android product work now.

Planning authority is the approved design at `docs/android/specs/2026-08-09-playback-corpus-design.md`, Git blob `dc7edd395b0d6996d207236f84ea373c6f5b7371`, raw SHA-256 `d3a85e7971b826a70c0d308d52dfd938b208c4f832c0adcbb6ab5a4527400f34`, and the approval record committed at `9f74b932ac7ba85f5b1896608131c9faa4a7d966`, reviewed at `d3183df450e9660aae72560e743292b02601d142`. This approval is for planning only. Phase 1 remains **OPEN**.

## Goal and bounded outcome

After Plans 1 and 2 are green, implement a repository/plan capability decision and a repository-numeric-ID-bound, read-only GitHub observation adapter. It must establish whether the actual GitHub plan, visibility, environments, reviewers, draft/public/immutable Release behavior, artifact retrieval, attestation, identity fields, and non-cancelling concurrency satisfy the approved design.

The outcome is immutable capability evidence and tested read-only observations. It grants no mutation, staging, or fallback authority.

## Prerequisites and dependency gate

Inputs:

- Plan 1 green repository/authority root.
- Plan 2 green schemas and public-fact/run-evidence contracts.

The exact dependency graph is:

```text
1 -> 2 -> (3 || 4; both green) -> 5
2 -> 6 in parallel with 3–5
5 + 6 -> 7 -> 8
```

Plan 6 may run in parallel with Plans 3–5 after Plan 2. Plans 5 and 6 must both be green before Plan 7. Plan 1 must be green before Plan 6 implementation starts.

## Scope and non-goals

### In scope

- Read-only adapter for exact repository textual/numeric identity, refs/Git objects, Releases/assets, Actions runs/attempts/artifacts, attestations, environments/reviewers, visibility, immutable settings, and observable tag behavior.
- Recorded-response and fault-injection tests for pagination, absent/nullable fields, identity mismatch, partial/unknown outcomes, and query-before-retry observations.
- A capability probe against an approved protected test repository or actual configuration that proves all eleven design §18 capabilities, including anonymous/collaborator draft visibility and post-public immutable enforcement.
- Immutable capability-probe fact record and run-specific supporting evidence.
- Hard stop and owner-decision output when any mandatory capability is absent, ambiguous, plan-gated, or behaviorally different.

### Non-goals

- No production repository mutation by the adapter.
- No Release creation/edit, asset upload/delete, tag/ref write, environment change, reviewer change, repository-setting change, publication, or cleanup.
- No staging/promotion implementation and no query-before-retry mutation algorithm.
- No silent fallback to Git artifacts, mutable tags, unprotected release creation, another hosting service, or a draft treated as both private and immutable.
- No candidate/media parsing, fixture generation, Android/product work, provider handling, or sensitive content.
- No refactor of `src/main.ts` or `src/library/catalog-repository.ts`.
- No alteration of exact 24/13/32, 19+5, 16/2/2/4, cancellation alias, or `NP-HLS-008` rules.

## Affected file areas

Inputs:

- Plan 1 authority documents under `docs/android/`.
- Plan 2 schemas/contracts under `tools/playback-corpus/`.

Approved future areas:

- focused GitHub read adapter, normalization, and probe logic under `tools/playback-corpus/src/`
- recorded responses, adapter contracts, and fault tests under `tools/playback-corpus/test/` and `tools/playback-corpus/fixtures-invalid/`
- capability evidence and owner-decision record under `docs/android/`
- a future probe workflow under `.github/workflows/` only if implementation review establishes it is needed and keeps it non-mutating against production.

Exact API library and file structure are deferred.

## Cross-plan inputs and outputs

Plan 6 consumes Plan 2 capability/public-fact schemas, normalization, hash contracts, repository identity rules, and evidence projections.

Stable outputs consumed by Plan 7:

- repository owner/name and immutable numeric ID binding;
- capability pass/fail record and `capabilityProbeDigest`;
- observed availability and behavior of numeric Release/asset IDs, annotated tags, immutable Releases, environments/reviewers, artifact retrieval, attestations, non-cancelling concurrency, and required identity fields;
- read-only lookup/normalization interface for preflight and query-before-retry reconciliation;
- fail-closed evidence for unsupported or ambiguous capability.

The adapter returns observations only. Plan 7 owns all privileged mutations and must independently re-read and validate trusted evidence.

## Reviewable implementation work packages

### Work package 1 — Repository-bound read-only adapter contract

- **Purpose:** normalize only approved stable GitHub/Git fields while rejecting wrong repository identity, ambiguous data, and undeclared variation.
- **Expected changed file area:** adapter/normalization modules, tests, and recorded responses under `tools/playback-corpus/`.
- **Test-first obligation:** start with wrong textual/numeric repository, pagination/duplicate identity, absent/nullable fields, mutable/transient-field exclusion, algorithm-qualified digest, permission denial, rate/error response, and malformed response cases.
- **Output/evidence:** endpoint/action coverage matrix, normalization golden vectors, and proof that no mutating operation is exposed.
- **Rollback boundary:** remove the adapter package; no repository state has changed.
- **Commit boundary:** one read-only adapter contract commit.

### Work package 2 — Capability decision model and immutable fact record

- **Purpose:** evaluate all mandatory §18 capabilities as hard pass/fail/ambiguous gates without fallback.
- **Expected changed file area:** probe evaluation modules, schemas/tests, and capability evidence format.
- **Test-first obligation:** define failure cases for every missing/ambiguous/plan-gated capability, collaborator/draft misconception, mutable post-public assets, missing numeric identity, unavailable required reviewer/environment, artifact/attestation failure, and cancelling concurrency.
- **Output/evidence:** eleven-capability decision matrix and canonical fact-record identity.
- **Rollback boundary:** discard non-authoritative evidence and leave Plan 7 blocked.
- **Commit boundary:** evaluation contract and tests land together.

### Work package 3 — Protected test-repository/actual-settings probe

- **Purpose:** gather actual behavior evidence without mutating the production repository.
- **Expected changed file area:** bounded probe harness/workflow if needed and `docs/android/` evidence.
- **Test-first obligation:** exercise the probe against controlled prearranged states and verify it cannot target an unapproved repository or broaden permissions.
- **Output/evidence:** actual plan/visibility/settings snapshot, actor-class observations, negative tests, screenshots/API evidence where appropriate, and exact repository numeric binding.
- **Rollback boundary:** test-repository disposable objects follow a separately approved test cleanup boundary; production remains untouched. Ambiguity blocks rather than triggers mutation.
- **Commit boundary:** implementation and actual evidence are reviewed separately so observations cannot silently change adapter semantics.

### Work package 4 — Fault-injection and Plan 7 handoff

- **Purpose:** prove deterministic read-side recovery observations for missing/changed/stale/unknown states and expose only the stable interface Plan 7 needs.
- **Expected changed file area:** adapter fault tests, handoff documentation, and capability result evidence.
- **Test-first obligation:** cover unknown API outcomes as observations, duplicate prevention inputs, tag collisions, changed assets/drafts, exact staged/published detection, and quarantine-required mismatch—without performing mutation.
- **Output/evidence:** fault matrix, adapter contract report, final capability verdict, and Plan 7 input inventory.
- **Rollback boundary:** a failed adapter/probe keeps Plan 7 blocked; no fallback.
- **Commit boundary:** final handoff/evidence commit follows independent review of implementation results.

## Acceptance commands and evidence

Existing nonpublishing commands:

```text
npm test
npm run build
git diff --check
```

These root commands retain existing host regression and formatting coverage; they do not cover future `tools/playback-corpus/` behavior or establish the capability gate.

Plan 6 must introduce:

- a local recorded-response adapter contract command whose public purpose is to validate repository binding, normalization, pagination, and read-side fault reconciliation without network access or mutation. It passes only when every declared adapter contract and fault case matches; any mismatch or missing case fails nonzero;
- an explicitly read-only capability probe command for the approved repository/test-repository target. Its public purpose is evidence collection and hard-gate evaluation. It passes only when all eleven mandatory capabilities are unambiguous and green under the exact observed settings; any absent, ambiguous, plan-gated, behaviorally different, unobserved, or unauthorized operation fails nonzero. It may authenticate only with read permissions appropriate to the facts being observed and must reject any operation outside the read allowlist.

Exact command names, target-selection mechanics, and evidence paths remain implementation decisions.

Some capabilities, such as immutable enforcement and draft actor behavior, require pre-existing controlled test states or a separately authorized test-repository setup. This plan does not authorize creating those states. Acceptance must distinguish evidence observation from setup and retain proof that production was not mutated.

Required evidence is the eleven-capability matrix, exact repository/plan/settings identity, actor-class observations, immutable behavior, environment/reviewer result, artifact/attestation result, adapter fault report, and independent API evidence.

No production mutation, staging, tag, public Release, or publication command is permitted.

## Failure/rollback boundary

Any absent, ambiguous, plan-gated, behaviorally different, or unobservable mandatory capability blocks Plan 7 and returns to the owner for a documented decision. Adapter identity/normalization faults also block. Delete only disposable local/test evidence allowed by its separate setup authorization; never alter production state or invent fallback authority.

## Independent review gate

Plan 6 is green only when an independent reviewer reports:

- Critical: **0**
- Important: **0**

The exact design §29 checkpoint is: all probe/adapter contract and fault-injection tests pass under actual settings plus independent zero-Critical/Important review. The review must confirm all eleven capabilities, repository numeric binding, read-only production behavior, and absence of silent fallback.

## Implementation decisions deliberately deferred

Deferred choices include:

- GitHub client library and internal adapter interfaces;
- REST versus GraphQL per observation where both provide the approved fact;
- recorded-response storage/redaction arrangement;
- how pre-existing controlled test states are provisioned under separate authority;
- bounded retry/polling mechanics for read-only observation;
- evidence report and screenshot organization.

Selections must minimize permissions, preserve exact stable projections, remain repository-numeric-ID-bound, be observable and fault-injectable, avoid production mutation, and make ambiguity fail closed. They may not decide a different hosting or privilege model.