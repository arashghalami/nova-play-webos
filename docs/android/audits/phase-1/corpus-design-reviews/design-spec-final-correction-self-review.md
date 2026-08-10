# Playback corpus design final-correction self-review

## Review metadata

| Field | Value |
|---|---|
| Reviewed specification | `docs/android/specs/2026-08-09-playback-corpus-design.md` |
| Review scope | Final contract corrections I-A through I-F |
| Review type | Documentation-only self-review |
| Normative effect | None; this report does not approve the specification or integrate normative documents |
| Authority state | Written specification still awaits owner approval; Plan 1 normative integration remains incomplete; Phase 1 remains OPEN |
| Critical findings | 0 |
| Important findings | 0 |

## I-A through I-F resolution matrix

| Correction | Corrected specification lines | Resolution evidence | Result |
|---|---:|---|---|
| I-A — closed reproducibility artifact registry | 339–416 | One closed registry assigns every artifact schema/type to exactly one of `deterministic-control`, `deterministic-public-fact`, or `run-evidence`; deterministic rows define canonical bytes, equality, permitted influences, forbidden ambient inputs, and identity; public-fact rows define fixed snapshots and normalization; run-evidence rows define mandatory identities, permitted variation, stable projections, and equivalence; candidate identity exclusions are forbidden; proposed/R receipts are deterministic-control | PASS |
| I-B — total executable media machines | 564–599 | Strict IDs/versions, initial state, finite event variants, total result schema, integer logical ticks, exact ordering key, empty-body SHA-256, nine-step precedence, strict pending entries, bounded positive `releaseAfter`, deterministic terminal cancellation, exact trace schema, all branch/boundary golden traces, and exact JCS/hash reproduction | PASS |
| I-C — deterministic signing trust state | 775–798 | Pinned sequence-0 genesis, exact raw SHA-256/Git blob/public-key bytes/principal/namespace/trust statement/schema versions, complete monotonic policy chain, protected transition authorization, dual E-bound/A-parent approval cutover, five exclusive selector modes, one scope-and-selector predicate, compromise and historical-validation tests | PASS |
| I-D — proposal/finalized append-only event protocol | 799–858 | Producers emit proposals without final chain fields; proposal-domain digest is separate; only the protected event finalizer allocates chain fields; stale/CAS reconciliation is explicit; S-bound pre-E policy and atomic `EVIDENCE_POLICY_ACTIVATED` transition are defined without breaking A’s direct-parent rule; all dispositions use the common finalizer and retain absorbing scope | PASS |
| I-E — total hash interoperability registry | 417–521 | Closed bidirectional registry rule covers every identity field exactly once; project SHA-256/native Git/OCI/attestation identities remain separate; receipt domain and raw identities are external and non-self-referential; five-key closure order and duplicate rejection are exact; every row and closure edge has golden-vector requirements | PASS |
| I-F — exact eight-plan implementation boundary | 1004–1081 | Exactly eight named plans define inputs, work, green checkpoints, independent reviews, acceptance evidence, rollback boundaries, no batch approval, one-program status, and exact dependency graph | PASS |

## Artifact registry completeness check

The registry at specification lines 339–416 is closed and schema-driven.

- Exactly three classes are permitted: `deterministic-control`, `deterministic-public-fact`, and `run-evidence`.
- Missing, extra, duplicate, inferred, or cross-class artifact membership fails `ARTIFACT_CLASS_MEMBERSHIP`.
- Deterministic-control rows include all requested registry, Markdown, schema/lock, hash-registry, recipe/set, source definition/primitive/set, toolchain/container/patch/capability, oracle, manifest, machine/trace, policy/schema, object/closure, lock, archive, licence/provenance, approval, and proposed/R receipt artifacts.
- Deterministic-public-fact rows include staging receipt, pre-copy final Release facts, revocation record, immutable capability-probe facts, and public Release/tag/asset projection.
- Run-evidence rows include candidate manifest, attestation, validation report, candidate/staging/promotion/verification observations, proposals, finalized events, incidents, detached signature, informational signed time, workflow logs, and diagnostics.
- Candidate comparison retains repository identity, source commit, workflow path/blob, run ID, run attempt, numeric artifact IDs, artifact digests, and attestation subject/issuer/signer identity.
- Every rerun is a distinct candidate even when deterministic content matches.
- `proposed-release-receipt.json` and its byte-identical R copy are deterministic-control; verification observations remain run-evidence.

Result: PASS.

## Machine totality and golden-trace check

Specification lines 564–599 define all three machines as total byte-level contracts.

- IDs/versions: `nova-play-hls-live-v1`, `nova-play-dash-live-v1`, and `nova-play-hls-delay-v1`.
- Strict canonical initial-state, event, pending-entry, response, result, and trace schemas are required.
- The finite event alphabet is represented by exact request, advance, release, cancel, and end variants.
- Same-tick order is exactly `(logicalTick, eventSequence, normalizedRequestKey)`.
- The empty body is exactly zero bytes with raw SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- Request precedence exactly separates invalid, terminal, unknown/unavailable, immediate, capacity, and insertion branches.
- `releaseAfter` has minimum 1 and a machine-policy maximum; zero, negative, non-integer, and over-maximum values are invalid.
- Natural or explicit terminal entry cancels all pending entries in canonical key order, emits terminal cancellation trace evidence, forbids post-terminal release, and leaves an empty pending map.
- Required golden traces cover every precedence branch, all full-queue combinations, terminal zero/one/multiple pending cases, release boundaries, same-tick order, HLS/DASH loop/window edges, delayed-A manifest/segment cases, and all bounds/failures.
- Implementations must reproduce exact trace JCS bytes and `traceHash`.

Result: PASS.

## Signing genesis, cutover, and revocation-predicate check

Specification lines 775–798 establish deterministic trust state.

- The future design approval record and Plan 1 root pin sequence 0, exact raw SHA-256, Git blob ID, complete public-key bytes, principal, namespace, owner trust statement, and schema/hash-registry versions.
- Every policy binds project/corpus scope, sequence, prior digest, active/retired keys, byte-derived key IDs, allowed principal/namespace, transition authorization, and policy digest.
- Transitions require the immediately prior valid policy and protected ancestry.
- Approval A checks both the E-bound policy and the highest valid A-parent policy; a signer must be active in both.
- Retirement blocks a new approval for an older unapproved E; overlap requires both keys active in both policies.
- `signedAt` is informational only.
- Revocation mode is exactly one of `key-wide`, `approval-set`, `policy-range`, `release-set`, or `receipt-set`.
- Mode-required selector fields are exclusive; set values are non-empty, sorted, and unique; policy bounds are inclusive integers.
- Matching is exactly scope match AND selected-mode predicate match.
- Historical verification requires pinned genesis, complete valid policy chain, E/A-parent checks, and complete current valid revocation chain.
- Golden tests cover genesis, rotation, retirement, older E after retirement, every selector, nonmatching scope, malformed mixed selectors, compromise, and historical validation.

Result: PASS.

## Event proposal, finalization, and pre-E authority check

Specification lines 799–858 separate proposals from finalized events.

- Proposals contain event/corpus/transaction/attempt, proposed state/disposition, actor/authority, references/evidence, observation time, and expected chain tip.
- Final sequence, prior digest, final digest, and final filename are forbidden from proposals.
- `eventProposalDigest` uses the separate `event-proposal` domain.
- Only the protected path-limited finalizer leases the chain, validates the complete tip, checks expected tip, allocates sequence, injects prior digest, computes the external digest/filename, commits atomically, and verifies the resulting blob/chain.
- Branch CAS failure requires reread/revalidation; a stale proposal is reconciled only while semantically valid and is never rewritten as if already final.
- S binds the pre-E incident policy and candidate identity binds its blob/digest.
- `EVIDENCE_POLICY_ACTIVATED` is finalized inside E using a non-self-referential proposed-tree projection; A remains E’s direct child.
- Before E, rejection/quarantine authority comes from the S-bound policy; after E, E-bound policy governs.
- `REJECTED`/`QUARANTINED` remain attempt-absorbing and `REVOKED` remains corpus-version-absorbing.
- Every transition is finalized through the same workflow; no producer preassigns sequence or imports finalized event bytes.

Result: PASS.

## Hash registry, receipt identities, and closure-ordering check

Specification lines 417–521 define the hash contract.

- Bidirectional validation rejects schema identity fields absent from the registry and registry rows absent from every owning schema.
- Every row fixes field name, owner, algorithm/domain, exact input, canonicalization, encoding, embedded/external status, equality use, and self-reference prohibition.
- Project SHA-256 values are lowercase 64-character hex.
- Git IDs, OCI digests, Actions digests, subject digests, and attestation digests retain native algorithm-qualified forms.
- `receiptDigest` is the receipt-domain hash of exact proposed-receipt JCS bytes.
- `receiptRawSha256` is raw SHA-256 of the same exact canonical file bytes.
- Both receipt identities are external, preventing self-reference; R copies the exact bytes.
- Post-commit verification checks the R blob raw hash, receipt-domain hash, public facts, and proposed-receipt/report references.
- Closure order is path UTF-8 bytes, fixed role ordinal, full before range, numeric offset, then numeric length.
- Tuples identical after all five keys are rejected.
- Golden vectors are required for every hash row and every closure sort edge.

Result: PASS.

## Exact eight-plan boundary and dependency check

Specification lines 1004–1081 define exactly:

1. Authority and normative integration.
2. Registry, schemas, canonicalization, and hash contracts.
3. Pinned toolchain and fixture generation.
4. Closures, oracles, archive, and replay machines.
5. Candidate, proposed lock, provenance, and legal gates.
6. GitHub capability probe and read-only API adapter.
7. Staging, signing, promotion, and append-only state.
8. Public verification, receipt, revocation, and closure handoff.

The dependency graph is exactly:

```text
1 -> 2 -> (3 || 4; both green) -> 5
2 -> 6 in parallel with 3–5
5 + 6 -> 7 -> 8
```

Plan 1 blocks every later plan until green. Plan 4 may develop in parallel with Plan 3 but cannot finish until compatibility passes. Plan 6 may run parallel to Plans 3–5 but must be green before Plan 7. Every plan requires its own document, commands/evidence, rollback boundary, and zero-Critical/Important independent review. The boundary is explicitly one program with eight plans.

Result: PASS.

## 24/13/32 regression check

- Exact media identities: 24.
- Origin accounting: 19 existing plus 5 new.
- Exact feature cases: 13.
- Exact lifecycle cases: 32.
- Cancellation aliases remain non-executing and do not create media identities or duplicate lifecycle executions.
- The specification remains a proposed target and does not replace the current normative corpus document.

Result: PASS.

## Authority and non-normative status check

Specification lines 3–22 and 1082–1161 preserve the authority boundary.

- Interactive design approval is recorded, but repository-verifiable written-spec approval remains pending.
- The specification has no current normative registry authority.
- The future approval record is not created by this correction.
- Plan 1 must perform atomic normative integration.
- Phase 1 remains OPEN.
- This self-review has no normative or approval effect.

Result: PASS.

## Placeholder, alternative, and Android-claim scan

- Placeholder scan (`TBD`, `TODO`, incomplete alternatives, implementation placeholders): none.
- Competing-design or unresolved-alternative scan: none.
- Stale two-class/open-registry wording: none.
- Stale one-plan/seven-workstream wording: none.
- Stale producer-preassigned event-chain wording: none.
- Android/device/backend success claims: none.
- Explicit non-claims remain present, and fixture validation is not represented as Android, decoder, Media3, WebView, lifecycle, Cast, download, cancellation, or performance proof.

Result: PASS.

## Final unresolved count

| Severity | Count |
|---|---:|
| Critical | 0 |
| Important | 0 |
| Total unresolved Critical/Important | 0 |

Design final correction self-review: PASS