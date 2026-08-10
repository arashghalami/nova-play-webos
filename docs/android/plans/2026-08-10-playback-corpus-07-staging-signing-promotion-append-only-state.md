# Playback Corpus Plan 7 — Staging, Signing, Promotion, and Append-Only State

## Status and authority

This is an implementation-planning document only. It authorizes no implementation, workflow YAML, staging, signature, policy activation, GitHub mutation, commit E or A, tag, Release, publication, or Android product work now.

Planning authority is the approved design `docs/android/specs/2026-08-09-playback-corpus-design.md`, Git blob `dc7edd395b0d6996d207236f84ea373c6f5b7371`, raw SHA-256 `d3a85e7971b826a70c0d308d52dfd938b208c4f832c0adcbb6ab5a4527400f34`, and approval record committed at `9f74b932ac7ba85f5b1896608131c9faa4a7d966`, reviewed at `d3183df450e9660aae72560e743292b02601d142`. It authorizes planning only. Phase 1 remains **OPEN**.

## Goal and bounded outcome

After Plans 5 and 6 are green, implement the protected control plane for durable draft staging, evidence commit E, signing-policy lifecycle, owner approval commit A, append-only event finalization, guarded annotated tagging, exact draft promotion, and unknown-outcome recovery.

The bounded outcome is a protected, fault-injected path that can publish only the exact approved staged bytes after every gate passes. It does not create the public verification receipt or close Phase 1.

## Prerequisites and dependency gate

Required inputs:

- Plan 1 green.
- Plan 2 contract layer.
- Plan 5 green candidate transaction.
- Plan 6 green capability probe/read-only adapter.

The exact dependency graph is:

```text
1 -> 2 -> (3 || 4; both green) -> 5
2 -> 6 in parallel with 3–5
5 + 6 -> 7 -> 8
```

Plan 7 starts only when both Plans 5 and 6 are green. Plan 8 starts only after Plan 7 is green. No capability, candidate, draft, environment approval, or signature can waive a predecessor failure.

## Scope and non-goals

### In scope

- Independently revalidated access-controlled draft Release staging of exact Plan 5 candidate assets after Plan 6 capability success.
- Stable staging receipt with exact numeric Release/asset identities and approved publication projection.
- Evidence commit E, including byte-for-byte copy of the proposed lock to `docs/android/playback-corpus-content.lock.json`, staging evidence, policy bindings, and atomic `EVIDENCE_POLICY_ACTIVATED`.
- Pinned genesis and non-genesis signing-policy chain, rotation/retirement/revocation validation, and protected policy transitions.
- Owner approval JSON/detached OpenSSH signature and path-limited direct-child commit A.
- Append-only event proposals, protected finalization, stale/CAS reconciliation, absorbing dispositions, and authority switch from S-bound pre-E policy to E-bound authority.
- Protected promotion preflight, explicit annotated corpus tag T pointing to S, exact approved draft-to-public patch, immutable Release enforcement, concurrency, idempotency, and query-before-retry recovery.
- Protected test-repository fault injection before any production privilege is eligible for approval.

### Non-goals

- No candidate generation, fixture parsing during promotion, schema redesign, capability fallback, receipt proposal/R, post-commit public verification, revocation publication response, or Phase 1 closure.
- Promotion never executes, decodes, extracts, or parses candidate media.
- No asset upload/remove/rename/relabel/replace after approval and no metadata mutation outside the signed strict projections.
- No blind mutation retry, moved/lightweight/baseline tag, redraft of a public Release, history rewrite, or deletion of approved/quarantined/published history.
- No Android/product/provider work; no DRM/encrypted or sensitive content.
- No `src/main.ts` or `src/library/catalog-repository.ts` refactor.
- No alteration of exact 24/13/32, 19+5, 16/2/2/4, cancellation alias, `NP-HLS-008`, codec/tool/legal/archive, or public-Release constraints.

## Affected file areas

Inputs and committed control areas:

- Plan 5/6 evidence under `tools/playback-corpus/`, `fixtures/playback-corpus/`, and `docs/android/`.
- `docs/android/playback-corpus-content.lock.json`
- `docs/android/playback-corpus-staging-receipt.json`
- `docs/android/playback-corpus-approval.json`
- `docs/android/playback-corpus-approval.sig`
- `docs/android/playback-corpus-events/<corpusVersion>/`
- `docs/android/signing/`
- focused staging/signing/event/promotion/recovery modules and tests under `tools/playback-corpus/`
- future `.github/workflows/playback-corpus-stage.yml`
- future `.github/workflows/playback-corpus-promote.yml`
- a focused protected event-finalization workflow under `.github/workflows/` if implementation review requires it.

This list identifies approved logical responsibilities, not a complete future file tree.

## Cross-plan inputs and outputs

Plan 7 consumes exact Plan 5 candidate/staging inputs and Plan 6 capability/read-side evidence. Stable outputs for Plan 8 are public Release/tag/asset observations, E/A Git identities, normative lock/staging/approval blobs, detached signature, policy/revocation/event chain, candidate/evidence identities, and promotion observations.

The signing-policy transition construction graph remains exactly:

```text
proposed signing-policy bytes
-> external signingPolicyDigest
-> signing-policy-transition proposal bytes
-> external policyTransitionProposalDigest
-> detached transition signature
-> protected commit
-> external post-commit Git/ref evidence
```

Policy bytes cannot contain proposal/signature or resulting commit/tree/blob/ref/post-commit evidence. The proposal contains only pre-commit facts and is signed under namespace `nova-play-signing-policy-transition-v1` by authority from the immediately prior valid policy. Policy, proposal, and detached signature are separate sibling artifacts in the protected commit. Post-commit evidence is computed afterward and remains external. No edge may be collapsed or reversed.

The E/approval topology remains:

```text
S-bound incident policy and validated staging inputs
-> proposed E tree projection and external identity
-> protected event finalizer constructs EVIDENCE_POLICY_ACTIVATED inside E
-> E commits the exact proposed-lock byte copy, staging evidence, and E-bound policy state
-> resulting E tree/blob identities are verified against the projection
-> exact approval bytes and external approvalDigest
-> detached owner signature
-> path-limited A, a direct child of E
```

A changes only the approval JSON, detached signature, and `OWNER_APPROVED` event path fixed by the design. A never amends E. Approval authority is checked against both E-bound policy and the highest valid policy at A's parent.

Event producers emit proposals without final sequence, prior digest, final digest, or filename. Only the protected finalizer allocates and commits final chain identity.

## Reviewable implementation work packages

### Work package 1 — Protected staging and exact staging receipt

- **Purpose:** revalidate the Plan 5 transaction and durably stage only exact approved candidate assets after capability success.
- **Expected changed file area:** staging modules/tests, staging workflow, and staging evidence under approved areas.
- **Test-first obligation:** cover wrong repository/run/attempt/artifact, missing/changed/extra asset, mutable draft change, stale candidate, unsupported capability, actor/permission mismatch, partial upload, unknown outcome, and no-op reconciliation.
- **Output/evidence:** exact numeric draft/asset identities, hashes, publication projection, staging receipt/digest, and staging observation.
- **Rollback boundary:** before approval, only identity-confirmed unapproved disposable staging objects may be cleaned; mismatch quarantines the transaction. Approved drafts are never altered.
- **Commit boundary:** staging implementation and its fault tests land separately from transaction-specific evidence.

### Work package 2 — E and append-only event authority transition

- **Purpose:** atomically establish normative content identity and E-bound authority without self-reference or stale event bytes.
- **Expected changed file area:** content lock, staging receipt, event/policy artifacts, finalizer modules/tests, and protected workflow.
- **Test-first obligation:** cover proposed-lock byte mismatch, proposed-E-tree mismatch, stale chain tip, sequence/digest gaps, branch CAS conflict, invalid S-bound authority, forbidden proposal final fields, prior-event mutation, and failed post-commit tree/blob verification.
- **Output/evidence:** E tree projection/identity, byte-identical normative lock, staging evidence, finalized `EVIDENCE_POLICY_ACTIVATED`, verified event chain, and E Git identities.
- **Rollback boundary:** reject the entire proposed E transaction before protected commit; after a valid append-only E, corrections are additive and never rewrite E/history.
- **Commit boundary:** E is one atomic path-reviewed evidence transaction.

### Work package 3 — Signing-policy chain and owner approval A

- **Purpose:** validate genesis/transitions and create owner authorization over the exact E-bound candidate/staging/publication transaction.
- **Expected changed file area:** `docs/android/signing/`, signing-policy transition artifacts/evidence, approval paths, signature verification modules/tests, and approval event.
- **Test-first obligation:** cover wrong namespace/principal/full key ID, altered Git blob bytes, genesis mismatch, stale parent/ref, replay, sequence gap, rotation overlap, retirement cutover/older E, dual E/A-parent failure, every revocation selector mode, mixed selectors, and path/parent violation.
- **Output/evidence:** complete valid policy chain, transition proposal/signature/post-commit evidence, exact approval bytes/digest/signature, and path-limited A directly parented by E.
- **Rollback boundary:** an invalid approval never advances; replace it with a new additive attempt after correction, never amend E or reuse signature authority.
- **Commit boundary:** policy transitions are independent protected commits with their full pre/post evidence; A is its own path-limited direct-child commit.

### Work package 4 — Protected promotion, concurrency, and recovery

- **Purpose:** publish only the signed draft projection after an independently repeated preflight and reconcile every unknown result by stable identity.
- **Expected changed file area:** promotion/recovery modules/tests, promotion workflow, and append-only promotion events.
- **Test-first obligation:** cover stale E/A/policy/revocation state, changed draft/assets/fields, tag collision/retarget, unauthorized mutation, concurrent attempt, unknown tag/publish outcome, exact staged/published recovery, mismatch quarantine, and prevention of blind retry.
- **Output/evidence:** annotated T -> S identity, exact promotion patch result, public immutable Release/asset identities, event proposals/final events, and reconciliation report.
- **Rollback boundary:** no public rollback exists. A failure before publication stops; a mismatch quarantines. A published mismatch is preserved and handed to Plan 8 additive revocation handling.
- **Commit boundary:** implementation and protected test-repository evidence precede any separately authorized production transaction; production evidence is append-only.

## Acceptance commands and evidence

Nonpublishing local/recorded-response validation uses the existing host commands below only for their current coverage; they do not cover future `tools/playback-corpus/` behavior or authorize a privileged operation:

```text
npm test
npm run build
git diff --check
```

Plan 7 must introduce one local aggregate contract/fault-validation command, or an equivalent explicitly documented command set, covering staging, E/event finalization, policy/signature, promotion, and recovery. Its public purpose is to validate every Plan 7 trust boundary using recorded or isolated test inputs without a production/public operation. It passes only when exact identities, signatures, ancestry, event finalization, authorization, concurrency, and recovery cases all match their approved outcomes; any stale input, unauthorized mutation path, blind-retry path, construction-graph mismatch, or missing case fails nonzero. Exact command naming and internal grouping remain implementation decisions.

Privileged acceptance is a separate protected test-repository exercise, authorized independently at implementation time. Its public purpose is to prove minimum permissions, environment review, exact identities/signatures, append-only finalization, immutable promotion, concurrency, and recovery. It passes only when every protected test transaction and fault case reaches its approved exact state with no unauthorized mutation; any mismatch, unresolved outcome, stale event, blind retry, or privilege breach fails the gate and leaves production blocked. It must not target production until a later explicit transaction authorization has passed every gate. Exact invocation, authorization mechanism, and evidence paths remain implementation decisions.

Required evidence:

- staging preflight/revalidation and exact receipt;
- E proposed-tree/resulting-tree/lock byte identities;
- complete append-only chain and stale/CAS fault matrix;
- exact policy-transition graph evidence;
- exact approval/signature, A path set, and A parent E;
- protected environment/reviewer evidence;
- tag/Release/asset identities and immutable enforcement;
- concurrent/unknown-outcome/query-before-retry/quarantine results;
- proof of no unauthorized mutation or media parsing.

No production or public operation is implied by a local green test.

## Failure/rollback boundary

Before publication, any stale identity, invalid signature/policy/event, capability regression, changed staging field, unknown unreconciled state, or permission breach stops and rejects/quarantines the transaction. After publication there is no edit/redraft rollback; preserve facts and hand a failure to Plan 8 additive verification/revocation. Prior events, approvals, policies, tags, and published assets are never rewritten.

## Independent review gate

Plan 7 is green only when an independent reviewer reports:

- Critical: **0**
- Important: **0**

The exact design §29 checkpoint is: protected test-repository fault injection; exact identity/signature; no stale events, blind retry, or unauthorized mutation; independent zero-Critical/Important review. Review must additionally confirm A is a direct child of E and that policy/proposal/signature/protected-commit/post-commit evidence remain distinct and acyclic.

## Implementation decisions deliberately deferred

Deferred choices include:

- internal staging/promotion module and workflow job decomposition;
- precise GitHub/Git mutation mechanics that satisfy the fixed signed projections;
- bounded read polling and reconciliation timing;
- protected event-finalizer workflow organization and lease/CAS mechanism;
- exact signing-policy artifact storage paths below `docs/android/signing/`;
- test-repository provisioning and cleanup under separate authority;
- diagnostic/event-report presentation.

Choices must use minimum privilege, independently repeated preflight, exact Git blob/API identity, query-before-retry, non-cancelling concurrency, fail-closed policy/signature checks, append-only history, and test-repository evidence. They may not collapse construction edges, weaken A/E ancestry, or create a fallback publication path.