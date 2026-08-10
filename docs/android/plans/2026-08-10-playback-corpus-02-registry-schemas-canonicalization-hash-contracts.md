# Playback Corpus Plan 2 — Registry, Schemas, Canonicalization, and Hash Contracts

## Status and authority

This is an implementation-planning document only. It authorizes no execution, schema creation, tooling, fixture, workflow, build, integration, GitHub mutation, tag, Release, publication, or Android product change.

Planning authority is `docs/android/specs/2026-08-09-playback-corpus-design.md`, Git blob `dc7edd395b0d6996d207236f84ea373c6f5b7371`, raw SHA-256 `d3a85e7971b826a70c0d308d52dfd938b208c4f832c0adcbb6ab5a4527400f34`, and its approval record at commit `9f74b932ac7ba85f5b1896608131c9faa4a7d966`, reviewed at `d3183df450e9660aae72560e743292b02601d142`. The approval authorizes planning only. Phase 1 remains **OPEN**.

## Goal and bounded outcome

Implement, after Plan 1 is green, the strict interoperability contracts that every later plan consumes: extraction of the one normative registry, closed schemas and artifact classes, RFC 8785 canonicalization, the total approved hash registry, and versioned oracle, executable-machine, event, signing, receipt, and revocation contracts.

The bounded outcome is a tested contract layer, not generated media or an operational workflow. It freezes only the approved cross-plan byte projections, names, classes, versions, authority direction, and no-self-hash rules.

## Prerequisites and dependency gate

Required input: Plan 1 green, including one normative 24/13/32 registry root and pinned authority/genesis identities.

The program dependency graph is exactly:

```text
1 -> 2 -> (3 || 4; both green) -> 5
2 -> 6 in parallel with 3–5
5 + 6 -> 7 -> 8
```

Plan 2 starts only after Plan 1 is green. Plans 3, 4, and 6 consume Plan 2. Plans 3 and 4 may proceed in parallel after Plan 2; both must be green before Plan 5. Plan 6 may proceed in parallel with Plans 3–5 but must be green before Plan 7.

## Scope and non-goals

### In scope

- Exact-byte extraction from the Plan 1 registry, including sentinel uniqueness, UTF-8/no-BOM/LF rules, strict JSON, and authority hashes.
- Strict, versioned schemas for the design §11.6 closed artifact registry, exact one-class membership, approved artifact lifecycle, and unknown-field rejection.
- RFC 8785 JCS behavior, complete design §12 hash-domain registry, native identity separation, golden vectors, and universal no-self-hash enforcement.
- Contracts for semantic oracles; HLS-live, DASH-live, and HLS-delay machines; canonical traces; event proposals/finalization; candidate core and candidate-evidence-index; content locks; staging/approval/receipt; signing-policy transition; revocation; and stable evidence projections.
- Contract migration rules that preserve verification of prior versions.

### Non-goals

- No toolchain build, fixture generation, archive creation, GitHub probing, candidate run, staging, signing, promotion, receipt construction, or public operation.
- No selection of implementation classes, function signatures, error-message text, retry timing, or GitHub API algorithm.
- No duplicate normative registry and no schema field beyond what is needed to realize the approved design.
- No Android behavior, provider handling, DRM/encrypted content, or real IPTV content.
- No refactor of `src/main.ts` or `src/library/catalog-repository.ts`.
- No amendment or reinterpretation of the approved design.

The inherited identity invariants are exact 24 media / 13 feature / 32 lifecycle identities, 19 existing + 5 new, classification counts 16/2/2/4, non-executing cancellation aliases, and identity/lock-only `NP-HLS-008`.

## Affected file areas

Existing inputs:

- `docs/android/playback-corpus.md` after Plan 1.
- `docs/android/specs/2026-08-09-playback-corpus-design.md`.
- Plan 1 authority and independent-review evidence under `docs/android/`.

Approved logical implementation areas:

- `tools/playback-corpus/schemas/`
- focused modules under `tools/playback-corpus/src/`
- contract and golden tests under `tools/playback-corpus/test/`
- intentionally invalid structured inputs under `tools/playback-corpus/fixtures-invalid/`
- package metadata confined to `tools/playback-corpus/`
- versioned contract documentation under `docs/android/` where needed.

Exact internal file splits are deliberately not fixed here.

## Cross-plan inputs and outputs

Plan 2 consumes the Plan 1 normative registry, `specDigest`, raw Markdown identity, superseded-document identity, and pinned authority/genesis root.

Stable outputs for adjacent plans are:

- one exact registry-extraction contract;
- strict schema lock and closed artifact-class registry;
- `nova-play-hash-registry-v1` with bidirectional schema coverage and golden vectors;
- RFC 8785 and domain-hash service behavior;
- immutable schema/oracle/machine/event/signing/revocation versions;
- candidate-core and candidate-evidence-index separation;
- proposed-lock, staging, approval, proposed-receipt/R, event proposal/finalization, policy transition, and revocation validation contracts;
- canonical stable-projection rules for deterministic-control, deterministic-public-fact, and run-evidence artifacts.

The candidate core may contain only pre-finalization identities. The later evidence index binds already-created reports, attestation, and uploaded candidate artifacts; neither object identifies or hashes itself. Event proposals omit final chain fields. Proposed receipt bytes omit their own identities and are later copied unchanged to R. Signing-policy bytes, transition proposal, detached signature, protected commit, and post-commit evidence remain separate.

## Reviewable implementation work packages

### Work package 1 — Registry extraction and migration contract

- **Purpose:** turn the sole Plan 1 registry into exact validated bytes and authority identities without introducing a second registry.
- **Expected changed file area:** `tools/playback-corpus/src/`, `tools/playback-corpus/schemas/`, and focused tests/invalid inputs.
- **Test-first obligation:** begin with failures for absent/multiple/reordered/altered sentinels, BOM, CRLF, duplicate keys, unknown fields, partial counts, invalid references/classes, and altered prior-document identity.
- **Output/evidence:** exact extraction vectors; 24/13/32, 19+5, 16/2/2/4, alias, lifecycle-anchor, and `NP-HLS-008` checks; computed authority identities.
- **Rollback boundary:** remove this package without affecting the Plan 1 registry.
- **Commit boundary:** one independently reviewable registry-contract commit.

### Work package 2 — Closed schemas and artifact-class membership

- **Purpose:** provide strict versioned validation for every approved artifact/type and prove exact one-class membership.
- **Expected changed file area:** schemas, schema lock, contract tests, and invalid structured examples under `tools/playback-corpus/`.
- **Test-first obligation:** add failing cases for missing, extra, duplicate, inferred, or cross-class names; unknown fields; wrong versions; and prohibited self or future references.
- **Output/evidence:** exact-set equality report, schema-lock identity, migration vectors, and artifact lifecycle validation.
- **Rollback boundary:** schemas and their tests roll back together; no consumer may merge against an incomplete schema set.
- **Commit boundary:** one closed-registry contract commit.

### Work package 3 — JCS and total hash registry

- **Purpose:** implement one interoperable canonicalization and hashing boundary for all project, Git, OCI, Actions, subject, and attestation identities.
- **Expected changed file area:** focused canonicalization/hash modules, hash-registry data, and golden tests.
- **Test-first obligation:** cover every design §12 row, receipt raw/domain distinction, closure sort edges, duplicate tuple rejection, lowercase encoding, native algorithm-qualified identities, and no-self-hash projections before implementation.
- **Output/evidence:** one golden vector per hash row, bidirectional schema/registry coverage, and no generic or untyped hash member.
- **Rollback boundary:** revert the whole hash-contract package if any projection is ambiguous; no partial registry is usable.
- **Commit boundary:** one canonicalization/hash-contract commit.

### Work package 4 — Oracle, machine, authority, and lifecycle schemas

- **Purpose:** expose stable validation contracts required by Plans 3–8 without implementing those behaviors.
- **Expected changed file area:** schemas and contract tests for oracles, machines/traces, locks/candidate evidence, GitHub facts, events, signing policy/transitions, approvals, receipts, and revocations.
- **Test-first obligation:** prove approved construction order, forbidden back-edges, A/E bindings, five exclusive revocation selector modes, event proposal/final separation, and proposed/R receipt byte identity.
- **Output/evidence:** versioned schemas, cross-schema reference report, construction-DAG tests, and consumer compatibility fixtures containing structured metadata only.
- **Rollback boundary:** roll back one trust-boundary schema family and all consumers introduced with it; never weaken a published version in place.
- **Commit boundary:** commits may be separated by trust boundary only when each closes its own schema/test set and does not leave the registry incomplete.

## Acceptance commands and evidence

Existing nonpublishing repository conventions remain:

```text
npm test
npm run build
git diff --check
```

The Plan 2 implementation must introduce a local, nonpublishing contract-test command under `tools/playback-corpus/`. Its public purpose is to run registry, schema, JCS, hash, migration, construction-DAG, and invalid-input tests without generating media, contacting GitHub, or changing committed control files. It passes only when every closed registry has exact set equality and every golden vector matches; any unknown field, missing contract, self-reference, projection mismatch, or migration ambiguity fails nonzero.

Required evidence:

- exact command and environment;
- registry extraction and count report;
- schema-lock and hash-registry identities;
- one golden result per hash row;
- exact artifact-class membership report;
- migration compatibility results;
- construction-DAG evidence for candidate/evidence, policy transition, event finalization, and receipt authority;
- host regressions scoped accurately.

No privileged, publishing, generation, staging, or GitHub-mutating acceptance command is permitted in this plan.

## Failure/rollback boundary

A mismatch in one schema/hash projection blocks every downstream plan that consumes it. Roll back the affected contract package and any same-transaction consumers; never patch stored artifacts or silently change an existing version. A semantic change requires a new version and migration evidence. Plan 1 authority remains intact and Phase 1 remains OPEN.

## Independent review gate

Plan 2 is green only when an independent reviewer reports:

- Critical: **0**
- Important: **0**

The exact design §29 checkpoint evidence is: all contract, golden, and migration tests pass; independent zero-Critical/Important review. The review must also confirm complete hash-registry/schema coverage, exact one-class artifact membership, no self-hashes or future back-edges, and no media/workflow/publication implementation.

## Implementation decisions deliberately deferred

Deferred choices include:

- internal module boundaries and naming;
- the compliant RFC 8785 implementation strategy;
- schema validator and duplicate-key detection library;
- test runner organization and golden-vector storage format;
- schema file grouping and version migration harness;
- diagnostic wording and ordering where the design does not fix it.

Choices must be deterministic, strict, maintainable by two people, test-first, compatible with Node.js ESM, free of ambient inputs, and demonstrably equivalent to the approved byte/hash contracts. They may not add fields or projections merely for implementation convenience.