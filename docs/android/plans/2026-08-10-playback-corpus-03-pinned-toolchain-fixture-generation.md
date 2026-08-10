# Playback Corpus Plan 3 — Pinned Toolchain and Deterministic Fixture Generation

## Status and authority

This is an implementation-planning document only. It authorizes no source code, test code, container definition, fixture, schema, workflow, build, acquisition, candidate, staging, tag, Release, publication, or Android product work now.

Planning authority is the exact approved design `docs/android/specs/2026-08-09-playback-corpus-design.md`, blob `dc7edd395b0d6996d207236f84ea373c6f5b7371`, raw SHA-256 `d3a85e7971b826a70c0d308d52dfd938b208c4f832c0adcbb6ab5a4527400f34`, and approval record committed at `9f74b932ac7ba85f5b1896608131c9faa4a7d966`, whose reviewed parent is `d3183df450e9660aae72560e743292b02601d142`. Only planning is approved. Phase 1 remains **OPEN**.

## Goal and bounded outcome

After Plans 1 and 2 are green, produce a pinned, unpublished `linux/amd64` source-build generation envelope and deterministic generators for all 24 approved media identities. The outcome is ignored local fixture bytes plus stable recipes, source/tool/legal inputs, deterministic controls, and compatibility outputs for Plan 4—not a candidate, content lock, publication, or Android proof.

## Prerequisites and dependency gate

Required inputs:

- Plan 1 green authority root.
- Plan 2 green registry/schema/JCS/hash contracts.

The exact program graph is:

```text
1 -> 2 -> (3 || 4; both green) -> 5
2 -> 6 in parallel with 3–5
5 + 6 -> 7 -> 8
```

Plan 3 may develop in parallel with Plan 4 after Plan 2. Both Plans 3 and 4 must be green before Plan 5. Plan 4 may use stable fixture interfaces while Plan 3 is underway, but final compatibility must pass. Plan 6 may proceed independently in parallel. Plan 1 must already be green.

## Scope and non-goals

### In scope

- Repository-owned, source-built `linux/amd64` container inputs with exact OCI index, selected manifest, config, layers, and execution-envelope evidence.
- Pinned FFmpeg `n7.1.1`, x264, x265, and `libfdk-aac` v2.0.3 annotated tag object `cac04476081a23c870fed05c36228cd02c5e7c3d`, with resolved commits, archive hashes, licences, complete configure arguments, compiler/ABI inputs, and capability outputs.
- Software-only deterministic primitive, recipe, and all-24-row media generation.
- Exact mandatory fixture forms, including `NP-HLS-007` A/B/C, byte-distinct independently valid `NP-HLS-008` A/B, H.264 High@L4.1 only at `NP-HLS-009`, HEVC Main10 at `NP-HLS-010`, HE-AAC v1/v2 at `NP-TS-005`, embedded `tx3g`/`mov_text` at `NP-PROG-004`, and FLV at `NP-FLV-001`.
- Fixed source definitions, seeds, timestamps, metadata, threading, environment allowlist, normalized argv, and network-disabled generation after bounded acquisition.
- Tiny non-authoritative smoke mode and full nonpublishing generation mode.
- Deterministic-control rebuild evidence and stable fixture interface compatibility with Plan 4.

### Non-goals

- No closure resolver, semantic oracle engine, canonical archive, replay machine, candidate, proposed lock, GitHub workflow, staging, signing, promotion, receipt, or publication.
- No generator image, tool binary, source tree, or container-layer publication or authoritative cache.
- No silent encoder/dependency/system-binary/hardware fallback and no substitution for mandatory approved forms.
- No legal-clearance claim; tool legality and encoded-byte redistribution remain separate.
- No provider/private/tester/device/credential/DRM/encrypted/real-IPTV content.
- No Android product behavior or device support claim.
- No changes to `src/main.ts` or `src/library/catalog-repository.ts`.

Inherited registry invariants remain exact 24/13/32, 19+5, 16/2/2/4, non-executing cancellation aliases, and identity/lock-only `NP-HLS-008`.

## Affected file areas

Existing inputs:

- Plan 1 integrated `docs/android/playback-corpus.md`.
- Plan 2 schemas/hash contracts under `tools/playback-corpus/`.
- Approved design and authority evidence under `docs/android/`.

Approved logical future areas:

- `tools/playback-corpus/container/`
- `tools/playback-corpus/recipes/`
- focused generator and envelope modules under `tools/playback-corpus/src/`
- tests under `tools/playback-corpus/test/`
- licence/source records under `tools/playback-corpus/container/licenses/` and `docs/android/` as required
- ignored generated working bytes under `fixtures/playback-corpus/`.

The implementation plan does not preselect a complete internal file tree.

## Cross-plan inputs and outputs

Plan 3 consumes Plan 2 registry IDs, recipe/source/toolchain schemas, deterministic-control classes, hash domains, and oracle/machine interface contracts.

Stable outputs consumed by Plan 4 and Plan 5:

- source/toolchain lock and tool capability evidence;
- authoritative execution-envelope identity;
- recipe set and deterministic primitive set;
- all 24 row object bytes in ignored working storage;
- stable row/object/manifest metadata needed to resolve closures and evaluate oracles;
- deterministic-control rebuild report;
- per-row tool and preliminary legal-input records, explicitly distinct from final redistribution decisions.

Every row remains bound to the normative ID and `specDigest`. `NP-HLS-008` outputs are fixture identities only and make no cancellation claim. Generator-side decode proves fixture integrity only.

## Reviewable implementation work packages

### Work package 1 — Pinned source-build envelope and capability gate

- **Purpose:** establish one auditable `linux/amd64` software-only envelope with no ambient or floating input.
- **Expected changed file area:** `tools/playback-corpus/container/`, source/tool locks, capability requirements, focused tests, and licence records.
- **Test-first obligation:** first reject mutable base/action/package inputs, unresolved source commits/hashes, forbidden proxy/cache/system tools, hardware acceleration, wrong architecture, capability gaps, and unrecorded configure/compiler/ABI data.
- **Output/evidence:** complete source lock; OCI identities; capability report; licence inventory; network-transition and environment projection.
- **Rollback boundary:** remove the entire envelope package and its evidence; no generated bytes are reusable without its exact identity.
- **Commit boundary:** one independently reviewable toolchain/capability commit.

### Work package 2 — Deterministic source primitives and recipes

- **Purpose:** define the shortest approved deterministic audiovisual inputs and row-bound recipes needed for all semantics.
- **Expected changed file area:** source definitions, recipes, generator modules, and golden tests under `tools/playback-corpus/`.
- **Test-first obligation:** cover ambient time/path/host/locale/randomness rejection, fixed seed and metadata, stream/cue/tone distinctions, duration/budget constraints, recipe-to-`specDigest` binding, and forbidden semantic duplication.
- **Output/evidence:** primitive/recipe-set identities and same-envelope byte-rebuild evidence.
- **Rollback boundary:** recipe and primitive changes invalidate all dependent generated objects; roll them back together.
- **Commit boundary:** one deterministic-input contract commit.

### Work package 3 — Mandatory row generation

- **Purpose:** generate all approved media forms without fallback or semantic substitution.
- **Expected changed file area:** focused generators/tests and ignored `fixtures/playback-corpus/` working bytes.
- **Test-first obligation:** begin with per-row capability/shape expectations and explicit failure for missing mandatory A/B/C, HE-AAC versions, embedded subtitle, profile/bit-depth, track distinction, or software-only condition.
- **Output/evidence:** all-24 generation inventory, exact normalized argv and envelope binding, object identities, and per-row tool/legal input status.
- **Rollback boundary:** discard generated working bytes for any affected recipe/toolchain identity; do not carry them into a candidate.
- **Commit boundary:** generated bytes remain uncommitted; focused generator/test commits may be grouped by reviewable media family only when every group is independently testable.

### Work package 4 — Tiny/full nonpublishing reproducibility gate

- **Purpose:** demonstrate the smoke path and complete generation path without giving either candidate or publication authority.
- **Expected changed file area:** local command surface, tests, and non-authoritative reports under approved tooling/documentation areas.
- **Test-first obligation:** prove that smoke cannot emit authoritative output and that full mode fails for any unresolved fixture/tool/legal input or deterministic-control mismatch.
- **Output/evidence:** tiny run result, full run inventory, deterministic-control second-build comparison, and Plan 4 interface compatibility report.
- **Rollback boundary:** all run outputs are disposable ignored material; retain only non-authoritative reports that clearly bind their inputs.
- **Commit boundary:** command/report contract is separate from generated fixture bytes.

## Acceptance commands and evidence

Existing repository regressions:

```text
npm test
npm run build
git diff --check
```

These root commands retain existing host regression and formatting coverage; they do not cover future `tools/playback-corpus/` behavior or grant corpus authority. The following future command contracts provide Plan 3 acceptance coverage.

Plan 3 must introduce two explicitly nonpublishing local command purposes under `tools/playback-corpus/`:

1. **Tiny generation:** exercises a small non-authoritative subset, emits only ignored working bytes and reports, uses no secrets, and passes only after the pinned subset and its reports validate; any unpinned input, contract mismatch, or missing check fails nonzero.
2. **Full generation:** generates and validates the complete 24-row object inventory in the pinned envelope, emits no candidate/content-lock/public artifact, and passes only after all 24 rows, mandatory capabilities, tool/legal inputs, deterministic controls, and Plan 4 handoff interfaces validate; any missing mandatory row, capability, tool/legal input, deterministic-control mismatch, forbidden content/input, or missing check fails nonzero.

Acceptance runs must include two same-envelope deterministic-control builds and compare every design-classified bit-identical artifact. Encoded-version-bound outputs must be semantically handed to Plan 4 rather than assumed bit-identical across toolchain changes.

Required evidence includes exact source/tool/container/OCI identities, normalized execution envelope, acquisition-to-network-disabled transition, capability outputs, row inventory, deterministic comparison, no-fallback scan, no-sensitive-content scan, and Plan 4 compatibility.

No staging, GitHub mutation, signing, tag, Release, or publication command is permitted.

## Failure/rollback boundary

Any unpinned input, unresolved mandatory capability, control-byte mismatch, forbidden fallback, unsafe content, or unresolved tool/legal input stops Plan 3. Discard affected ignored bytes and reports; do not advance them to Plan 5. A deliberate toolchain/version change requires regenerated outputs, semantic revalidation, a new candidate transaction later, and never changes existing published bytes.

## Independent review gate

Plan 3 is green only when an independent reviewer reports:

- Critical: **0**
- Important: **0**

The exact design §29 checkpoint evidence is: tiny and full nonpublishing generation; deterministic-control rebuild; no unresolved fixture/tool/legal input; independent zero-Critical/Important review. The review must confirm `linux/amd64`, unpublished toolchain constraints, mandatory row forms, no fallback/sensitive content, and no candidate/public authority.

## Implementation decisions deliberately deferred

Deferred choices include:

- exact pinned x264/x265 commits and source-build base identity, selected through capability, licence, immutability, and reproducibility review;
- internal generator/module boundaries;
- precise shortest valid row durations and bitrate budgets within approved semantics and global archive bounds;
- deterministic primitive rendering implementation;
- sandbox/runtime technology and local report presentation;
- whether an approved public vector is needed for a row only after synthetic generation is proven technically or legally infeasible.

Each choice must be testable, fully pinned, software-only, lawful enough to proceed to the separate redistribution gate, reproducible in the declared envelope, minimal in scope, and consistent with the approved mandatory semantics. An unresolved choice blocks rather than triggers a silent substitute.