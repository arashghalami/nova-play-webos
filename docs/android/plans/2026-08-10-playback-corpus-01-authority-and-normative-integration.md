# Playback Corpus Plan 1 — Authority and Atomic Normative Integration

## Status and authority

This is an implementation-planning document only. It authorizes no execution, normative edit, tooling, schema, fixture, workflow, build, tag, Release, publication, or Android product change.

Planning authority is the approved design at `docs/android/specs/2026-08-09-playback-corpus-design.md`, Git blob `dc7edd395b0d6996d207236f84ea373c6f5b7371`, raw SHA-256 `d3a85e7971b826a70c0d308d52dfd938b208c4f832c0adcbb6ab5a4527400f34`, approved by `docs/android/specs/2026-08-09-playback-corpus-design-approval.md` at commit `9f74b932ac7ba85f5b1896608131c9faa4a7d966`. The approval reviewed the design at commit `d3183df450e9660aae72560e743292b02601d142` and authorizes exactly the eight plans in design §29.

Plan 1 implementation has not started. The current 19-row corpus remains repository authority until this plan is executed atomically and accepted. Phase 1 remains **OPEN**.

## Goal and bounded outcome

Create one reviewable normative-integration transaction that replaces the competing 19-row authority with exactly 24 media, 13 feature, and 32 lifecycle identities and reconciles every active authority-bearing document named by the design. The outcome is one unambiguous authority root, with the old normative document hash and new authority identities recorded, and no tooling implementation.

The integrated counts remain 19 existing media plus five new media, with classification counts 16 `pass`, 2 `capability-classed`, 2 `best-effort, clean-failure`, and 4 `clean-fail`. Cancellation aliases remain non-executing, and `NP-HLS-008` remains identity/lock-only.

## Prerequisites and dependency gate

Input: the committed approval record identified above.

The program dependency graph is exactly:

```text
1 -> 2 -> (3 || 4; both green) -> 5
2 -> 6 in parallel with 3–5
5 + 6 -> 7 -> 8
```

Plan 1 has no implementation predecessor, but its identity gate must match the approved design and approval record before work begins. Plan 1 must be green before any later-plan implementation starts. Planning documents for later plans confer no authority to bypass this gate.

## Scope and non-goals

### In scope

- Atomically reconcile decision statuses, `plans/main-refactor-v3.md`, Android requirements, device policy, corpus registry, Phase 1 baseline wording, and authority hashes.
- Replace the current 19-row normative wording with the approved exact 24/13/32 registry in `docs/android/playback-corpus.md`.
- Establish that file as the single registry authority and preserve the approved ID meanings, anchors, execution ownership, classes, and non-claims.
- Record `supersedesDocumentSha256` from the complete pre-migration normative document bytes and establish the new `specDigest` and `rawMarkdownSha256` contracts.
- Pin signing-policy sequence `0` in the authority root as required by design §20.1: exact genesis raw SHA-256 and Git blob ID, complete authorized public-key bytes, principal `corpus-owner-v1`, namespace `nova-play-corpus-approval-v1`, owner trust statement, and exact policy-schema and hash-registry versions.
- Reconcile Phase 1 sequencing without closing Phase 1.

### Non-goals

- No corpus tooling, schema implementation, workflow YAML, fixture generation, lock, candidate, staging, signature, tag, receipt, publication, or GitHub mutation.
- No acquisition or legal conclusion for encoded bytes.
- No Android product implementation and no proof of device, codec, backend, lifecycle, download, Cast, cancellation, or UI behavior.
- No refactor of `src/main.ts` or `src/library/catalog-repository.ts`; no provider-handling change.
- No amendment or reopening of the approved design.

## Affected file areas

Expected existing authority-bearing files:

- `docs/android/specs/2026-08-09-playback-corpus-design.md` — immutable planning input; do not modify.
- `docs/android/specs/2026-08-09-playback-corpus-design-approval.md` — immutable approval input; do not modify.
- `docs/android/audits/phase-1/decision-sheet.md` — reconcile approved decision statuses without rewriting audit history.
- `docs/android/requirements.md`
- `docs/android/device-policy.md`
- `docs/android/playback-corpus.md` — sole destination for the integrated registry.
- `plans/main-refactor-v3.md`
- Existing Phase 1 baseline/closure wording under `docs/android/audits/phase-1/` and repository guidance only where the pre-change authority audit proves it carries an active conflicting statement.

No complete new file tree is authorized. Any authority manifest or review evidence needed for the atomic transaction stays under `docs/android/`.

## Cross-plan inputs and outputs

Inputs are the exact approved design and approval-record identities stated above, plus the complete bytes of the current normative files.

Stable outputs consumed by Plan 2:

- one normative registry source in `docs/android/playback-corpus.md`;
- exact 24 media, 13 feature, and 32 lifecycle identities and references;
- `specDigest`, `rawMarkdownSha256`, and `supersedesDocumentSha256` authority rules;
- one reconciled Phase 1 sequence and authority graph;
- the pinned signing-policy genesis root and its authority bindings.

The design remains planning authority; it does not become the registry. Recipes, schemas, and machines may later reference the integrated registry but may not duplicate it as a second authority. All codec/tool/legal/content/archive/public-Release constraints remain inherited from the approved design. No public operation is authorized by Plan 1.

## Reviewable implementation work packages

### Work package 1 — Pre-change authority inventory and frozen migration inputs

- **Purpose:** identify every active 19-row or conflicting Phase 1 authority statement and capture complete pre-change bytes and hashes before editing.
- **Expected changed file area:** review evidence under `docs/android/`; authority inputs remain unchanged in this package.
- **Test-first obligation:** define failing authority-audit cases for duplicate roots, partial counts, stale 19-row claims, missing hashes, and an unpinned genesis before changing normative files.
- **Output/evidence:** path-by-path authority inventory; pre-change raw hash evidence; exact approved identity inventory; proposed atomic path set.
- **Rollback boundary:** discard review-only changes; no normative file has changed.
- **Commit boundary:** one reviewable inventory commit may be used only if it carries no normative effect and is explicitly marked as pre-integration evidence.

### Work package 2 — Atomic registry and authority reconciliation

- **Purpose:** update all authority-bearing documents in one transaction so no intermediate commit claims mixed 19-row and 24/13/32 authority.
- **Expected changed file area:** `docs/android/playback-corpus.md`, `docs/android/requirements.md`, `docs/android/device-policy.md`, `plans/main-refactor-v3.md`, the decision-status location, and only verified active baseline wording.
- **Test-first obligation:** run the failing authority cases from package 1 against the proposed tree before accepting the migration.
- **Output/evidence:** exact registry counts and IDs, class counts, references, lifecycle meanings/anchors, feature execution owners, cancellation alias rules, `NP-HLS-008` identity-only rule, authority hashes, and reconciled Phase 1 OPEN wording.
- **Rollback boundary:** revert the entire atomic integration commit; never retain a partial subset.
- **Commit boundary:** one indivisible normative-integration commit.

### Work package 3 — Fresh-clone authority verification

- **Purpose:** prove that repository history and a fresh checkout resolve to one authority root without relying on local untracked inputs.
- **Expected changed file area:** independent review evidence under `docs/android/audits/phase-1/`; no normative amendments.
- **Test-first obligation:** the verifier must begin from the declared rejection conditions and independently recompute all counts, references, raw identities, and competing-authority scans.
- **Output/evidence:** fresh-clone command transcript, exact commit/tree/blob/raw-hash inventory, one-root result, and explicit confirmation that Phase 1 remains OPEN.
- **Rollback boundary:** reject the integration commit and return to the pre-integration authority state if any identity or claim differs.
- **Commit boundary:** independent review evidence is separate from the normative integration commit.

## Acceptance commands and evidence

These are nonpublishing validation commands. They do not stage, tag, publish, or mutate GitHub:

```text
git diff --check
npm test
npm run build
```

`npm run build` is an existing host regression command and may create ignored local build output; it grants no corpus or Android authority. The implementation review must also introduce and run a fresh-clone authority-audit command from the exact proposed integration commit. Its public purpose is to verify the complete integrated authority graph without relying on local untracked inputs. It passes only when the one-root, count, reference, class, approval, prior-document, genesis, and Phase 1 OPEN checks all succeed; any duplicate registry root, legacy normative 19-row claim, count/reference/class mismatch, approval identity mismatch, missing prior-document hash, unpinned genesis identity, Phase 1 closure claim, or missing check fails nonzero. Exact command naming and report location remain implementation decisions.

Required retained evidence:

- exact fresh-clone commit and tree identity;
- changed-path set for the atomic integration;
- prior and resulting raw document hashes and Git blob IDs;
- exact 24/13/32 and 19+5 inventories;
- 16/2/2/4 classification count;
- reference and alias validation;
- authority graph showing one root;
- host test/build results, explicitly scoped to existing host coverage;
- independent review report.

No candidate generation, staging, signing, or public command belongs in this plan.

## Failure/rollback boundary

Any mismatch stops Plan 1. Revert the complete normative-integration transaction rather than repairing only one authority-bearing file. Audit and review history may remain as non-authoritative evidence, but mixed authority, partial registries, or an unpinned genesis may not remain on the implementation branch. A corrected attempt is a new atomic integration review; it does not silently amend the approved design.

## Independent review gate

Plan 1 is green only when an independent reviewer reports:

- Critical: **0**
- Important: **0**

The exact design §29 checkpoint evidence is: one normative 24/13/32 root; no competing old 19-row authority; fresh-clone validation; independent zero-Critical/Important review. The review must additionally identify the exact integration commit, changed paths, registry/hash/genesis identities, and confirm that no later-plan implementation or Phase 1 closure occurred.

## Implementation decisions deliberately deferred

The following choices may be selected and tested during implementation:

- literal registry sentinel text and explanatory Markdown arrangement;
- the form and location of non-normative authority-audit evidence under `docs/android/`;
- the exact fresh-clone harness and report formatting;
- focused file organization for genesis-policy material within the approved `docs/android/signing/` area;
- commit-message wording beyond preserving the indivisible integration boundary.

Selections must favor strict byte reproducibility, one obvious authority root, fresh-clone verifiability, minimal changed scope, existing repository conventions, and fail-closed detection. They may not alter identities, counts, semantics, authority boundaries, hash domains, approval meaning, or Phase 1 status.