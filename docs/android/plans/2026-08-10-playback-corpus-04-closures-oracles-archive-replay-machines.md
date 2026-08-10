# Playback Corpus Plan 4 — Closures, Oracles, Archive, and Replay Machines

## Status and authority

This document is an implementation plan only. It authorizes no implementation, schema, fixture, workflow, build, candidate, GitHub mutation, tag, Release, publication, or Android product change now.

Its authority is the approved design `docs/android/specs/2026-08-09-playback-corpus-design.md`, Git blob `dc7edd395b0d6996d207236f84ea373c6f5b7371`, raw SHA-256 `d3a85e7971b826a70c0d308d52dfd938b208c4f832c0adcbb6ab5a4527400f34`, and the approval record committed at `9f74b932ac7ba85f5b1896608131c9faa4a7d966`, based on review commit `d3183df450e9660aae72560e743292b02601d142`. The authorization is planning-only. Phase 1 remains **OPEN**.

## Goal and bounded outcome

After Plans 1 and 2 are green, implement complete bounded HLS/DASH closures, fixture-integrity semantic oracles, a canonical regular-file-only archive projection, and total deterministic HLS-live, DASH-live, and HLS-delay replay machines. The outcome is a fail-closed validation and replay boundary compatible with Plan 3 outputs and suitable for Plan 5 candidate construction; it is not Android, device, network-provider, or publication evidence.

## Prerequisites and dependency gate

Inputs:

- Plan 1 green authority root.
- Plan 2 green schemas, JCS, hash, oracle, machine, and artifact contracts.
- Stable Plan 3 fixture interfaces for final compatibility.

The exact graph is:

```text
1 -> 2 -> (3 || 4; both green) -> 5
2 -> 6 in parallel with 3–5
5 + 6 -> 7 -> 8
```

Plan 4 may develop against contract fixtures in parallel with Plan 3. It cannot finish green until Plan 3 output compatibility passes. Plans 3 and 4 both must be green before Plan 5. Plan 1 must be green before this implementation starts.

## Scope and non-goals

### In scope

- Complete allowlisted HLS and DASH closure resolution from local approved bytes only, including every explicit object/range and shared-object reference.
- Strict normalized-path, regular-file, archive-entry, cycle, URI/reference, tag/form, query/fragment, external-base, encryption/DRM, and resource-bound rejection.
- Immutable semantic oracles for all 24 media rows, including normalized probe projections, decoded synthetic-signal checks, subtitle/audio evidence, expected faults, and forbidden collateral faults.
- Exact negative-fixture behavior for `NP-HLS-007` A/B/C, valid/decodeable `NP-PROG-003`, structurally valid `NP-TS-003`/`004`, and independently valid byte-distinct `NP-HLS-008` A/B.
- Canonical archive projection and deterministic packaging verification.
- Total executable machines exactly `nova-play-hls-live-v1`, `nova-play-dash-live-v1`, and `nova-play-hls-delay-v1`, with canonical states, finite event alphabet, every valid transition, deterministic failures, bounds, traces, terminal cancellation, and queue precedence.
- Invalid fixtures and resource/fault-injection tests.

### Non-goals

- No media generation toolchain, candidate/proposed lock, legal approval, GitHub probe, staging, signing, promotion, receipt, or publication.
- No runtime cancellation assertion for `NP-HLS-008`; it remains identity/lock-only, and cancellation aliases remain non-executing.
- No Android, Media3, WebView, codec-support, lifecycle, download, Cast, performance, provider, or UI proof.
- No network dependence at replay/extraction time; no DRM/encrypted or provider/private/tester/device/real-IPTV content.
- No refactor of `src/main.ts` or `src/library/catalog-repository.ts`.
- No design amendment or new semantic alternative.

Inherited exact counts are 24/13/32, 19 existing + 5 new, and 16/2/2/4 classifications.

## Affected file areas

Inputs:

- Plan 1 registry at `docs/android/playback-corpus.md`.
- Plan 2 contract layer under `tools/playback-corpus/`.
- Plan 3 ignored fixture objects under `fixtures/playback-corpus/`.

Approved implementation areas:

- focused resolver, oracle, archive, replay, and sandbox modules under `tools/playback-corpus/src/`
- oracle and machine definitions under the approved `tools/playback-corpus/` logical layout
- tests under `tools/playback-corpus/test/`
- adversarial inputs under `tools/playback-corpus/fixtures-invalid/`
- ignored archive/extraction working bytes under `fixtures/playback-corpus/`
- bounded validation documentation under `docs/android/`.

Exact internal file names are not predetermined.

## Cross-plan inputs and outputs

Plan 4 consumes Plan 2 contracts and stable Plan 3 row/object/manifest interfaces.

Stable outputs for Plan 5:

- complete per-row closures and `closureHash` identities;
- immutable oracle IDs/versions/hashes and semantic results;
- canonical machine definitions/traces and hashes;
- deterministic archive projection and canonical archive bytes/hash;
- resource-bound and unsafe-input reports;
- fixture-compatibility evidence covering all 24 media rows.

Each closure is independently complete even when bytes are reused. The archive contains no self-hash, Release coordinate, approval, signature, or receipt. Oracle success means fixture integrity only. Machine traces never become Android execution evidence.

## Reviewable implementation work packages

### Work package 1 — Local closure and path-safety boundary

- **Purpose:** prove that every HLS/DASH row resolves to a complete bounded local closure with no implicit or unsafe dependency.
- **Expected changed file area:** resolver/path modules, allowlist definitions, tests, and invalid inputs.
- **Test-first obligation:** cover schemes, authorities, queries, fragments, percent encodings, backslashes, absolute/dot paths, external base/xlink, encryption/DRM, cycles, case collisions, non-regular files, sparse/link/special entries, ranges, missing explicit shared objects, and HLS/DASH unsupported forms.
- **Output/evidence:** complete closure inventory, closure golden vectors, and exhaustive rejection matrix.
- **Rollback boundary:** remove resolver outputs and invalidate every dependent archive/oracle result.
- **Commit boundary:** one closure/safety contract commit.

### Work package 2 — Semantic oracles and negative-fixture containment

- **Purpose:** validate exact fixture structure and decoded synthetic semantics without claiming product support.
- **Expected changed file area:** oracle definitions/evaluator, probe normalization, tests, and invalid fixtures.
- **Test-first obligation:** begin with expected per-row projections; stable-field exclusions; stream/cue/tone checks; precise declared-fault identification; and forbidden collateral-fault cases.
- **Output/evidence:** all-24 oracle result set, normalized probe evidence, decoded-signal evidence, and explicit non-claim scan.
- **Rollback boundary:** an oracle version or projection change invalidates dependent results and requires a new version.
- **Commit boundary:** oracle definitions and evaluator/tests land together by a reviewable complete semantic family.

### Work package 3 — Total replay machines and canonical traces

- **Purpose:** implement every approved state/event pair and deterministic resource/queue/terminal behavior for the three fixed machine versions.
- **Expected changed file area:** machine definitions, replay engine, trace canonicalization, golden tests, and invalid inputs.
- **Test-first obligation:** cover exact initial state and event envelopes, all precedence branches, full-queue combinations, all bounds/failure results, same-tick ordering, release boundaries, live window/loop edges, delayed A manifest/segments, immediate B, terminal cancellation ordering, empty body identity, and empty final pending state.
- **Output/evidence:** total transition coverage matrix, machine/trace hashes, canonical trace bytes, and bound-failure report.
- **Rollback boundary:** revert an entire machine version and all of its traces; never modify a version silently.
- **Commit boundary:** each machine version may be reviewed separately only after its totality proof is complete; shared engine changes require all affected machine suites green.

### Work package 4 — Canonical archive and Plan 3 compatibility

- **Purpose:** package exactly lock-projectable objects under deterministic regular-file-only rules and enforce global bounds.
- **Expected changed file area:** archive projection/packaging/verification modules, tests, and ignored working output.
- **Test-first obligation:** cover ordering, ownership/modes/timestamps, compressor identity, duplicate/case/path/link/sparse rejection, reprojection equality, and every compressed/extracted/count/size/depth ceiling.
- **Output/evidence:** archive projection/hash, deterministic archive rebuild, all bounds results, and compatibility report against final Plan 3 outputs.
- **Rollback boundary:** archive output is disposable; any object/projection/tool change invalidates and removes it.
- **Commit boundary:** archive implementation/tests form one reviewable boundary; archive bytes remain ignored.

## Acceptance commands and evidence

Existing nonpublishing regressions:

```text
npm test
npm run build
git diff --check
```

Plan 4 must add a nonpublishing local validation command under `tools/playback-corpus/` whose public purpose is to run closure, oracle, archive, machine golden, adversarial, and resource-bound tests using local approved bytes only. It passes only when all 24 closures/oracles and all three machine versions validate, the archive reprojects exactly, every totality/golden vector matches, and Plan 3 compatibility is green. It fails nonzero on any unresolved reference, collateral fault, unsafe file/path/form, non-total transition, bound breach, or non-claim violation.

Required evidence:

- closure inventory and hashes;
- all-24 oracle report;
- negative-fixture fault-containment report;
- machine total-transition and golden-trace matrices;
- canonical archive projection/rebuild identity;
- compressed archive ≤250 MiB, extracted material ≤1 GiB, ≤10,000 files, each ≤256 MiB, depth ≤12;
- Plan 3 compatibility report;
- no-network/no-sensitive-content/non-claim evidence.

No privileged or public operation is an acceptance command.

## Failure/rollback boundary

Any unresolved closure, unexpected fault, unsafe archive form, parser crash, non-total transition, golden mismatch, resource breach, or Plan 3 incompatibility stops Plan 4. Discard derived closures, traces, and archive bytes; preserve only clearly non-authoritative diagnostics. Change versions rather than silently altering accepted oracle/machine/projection contracts.

## Independent review gate

Plan 4 is green only when an independent reviewer reports:

- Critical: **0**
- Important: **0**

The exact design §29 checkpoint is: all closure/oracle/archive/machine golden and resource-bound tests passing, Plan 3 output compatibility passing, plus independent zero-Critical/Important review. The reviewer must confirm fixture-only claims, exact machines, negative-fixture containment, bounds, and no network/public operation.

## Implementation decisions deliberately deferred

Deferred choices include:

- focused parser/resolver/archive module structure;
- specific safe parser and sandbox libraries;
- normalized probe data representation where the oracle contract permits it;
- canonical compressor implementation consistent with the pinned packaging contract;
- exact resource ceilings below the approved maxima and test corpus organization;
- diagnostic formatting and performance tuning that does not affect canonical bytes.

Selections must be fail-closed, deterministic, total, bounded, independently testable, maintainable, and compatible with Plan 2 contracts and Plan 3 outputs. They may not broaden supported manifest forms, weaken safety, alter approved machine semantics, or turn fixture validation into a product claim.