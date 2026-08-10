# Playback-corpus design construction-graph final independent review

## Repository and reviewed-byte identity

| Field | Value |
|---|---|
| Repository path | `D:\Work\Tools\iptv` |
| Branch | `master` |
| Reviewed commit (HEAD) | `52e6740e76a20671293eabc8340b82138ad3c696` |
| Reviewed commit parent | `15a913dde327ece7b8cd4bec9b0b80ec0e8ea4cb` |
| Reviewed commit subject | `docs(android): close corpus construction graphs` |
| Specification | `docs/android/specs/2026-08-09-playback-corpus-design.md` |
| Specification Git blob ID | `dc7edd395b0d6996d207236f84ea373c6f5b7371` |
| Specification raw SHA-256 | `d3a85e7971b826a70c0d308d52dfd938b208c4f832c0adcbb6ab5a4527400f34` |
| Specification byte count | 131,996 |
| Specification physical line count | 1,200 |
| Review role | Independent documentation reviewer; no owner, normative, implementation, publication, or closure authority |
| Review effect | This report does not approve, correct, or integrate the specification, does not authorize implementation or publication, and does not close Phase 1 |

The repository was at the expected branch, HEAD, parent, and subject before review. The specification bytes at HEAD are authoritative. The self-review verdict was not inherited; the corrected bytes were independently re-evaluated against the two closure targets. The unavailable commit `cdbcc7c84643908413dc439dbc5796333c126b15` and its unavailable reports were treated as nonexistent and were not used as evidence.

## Scope and explicit implementation-detail exclusions

This is a bounded final closure review of exactly three subjects:

1. closure of baseline finding `RB-C-001` (candidate/Actions/attestation construction cycle);
2. closure of baseline finding `RB-C-002` (non-genesis signing-policy transition topology);
3. regressions caused by their correction.

No broad architecture re-audit was performed, and no historical finding already passed by the recovery-baseline review was reopened. The following are deliberately deferred to implementation planning and are **not** treated as findings: concrete JSON schema members, workflow YAML, application/tooling code, tests, fixtures, GitHub/Git API algorithms, exact storage paths, polling/retry mechanics, and class/function designs. A design-level topology is treated as sufficient when construction order, authority, hash/signature ownership, prohibited back-edges, and independent verification are unambiguous.

## `RB-C-001` verdict

**Verdict: CLOSED.**

The specification now defines a single, consistent, acyclic construction chain and never readmits a post-finalization identity into the candidate core.

### Graph-edge proof

```text
candidate core bytes (pre-existing identities only)   :319
  -> candidateDigest (external; core has no self-digest) :321, 448
    -> reports / attestation / payload Actions artifacts :110, 327
      -> candidate-evidence-index bytes                 :327
        -> candidateEvidenceDigest (external)           :327, 449
          -> external index-carrier upload identity     :110, 329
            -> staging receipt                          :329, 331-335
              -> E + owner approval A                   :112, 780, 881
```

Point-by-point confirmation:

- Candidate core bytes contain only identities existing before finalization (server URL, repo owner/name/numeric ID, source SHA/protected ref, workflow path/blob, run/attempt, transaction/attempt, runner/OCI/toolchain/recipe/oracle/schema/policy hashes, proposed-lock and archive hashes) — `:319`. All later identities are excluded — `:321`.
- `candidateDigest` is external and absent from the core: `:321` ("its own digest" excluded), `:448` ("Exact candidate-core JCS, which contains no `candidateDigest`").
- Reports, attestation, and payload artifacts bind `candidateDigest`: `:110`, `:321` ("Every later object binds the exact externally computed `candidateDigest`").
- The evidence index binds the core digest and already-created evidence/artifact identities: `:327` (binds `candidateDigest`, reports/evidence, attestation subject/envelope, and numeric IDs/names/sizes/API digests of already-uploaded payload artifacts).
- `candidateEvidenceDigest` is external and absent from the index: `:329`, `:449`.
- The index excludes its own later carrier identity: `:329` ("must not contain the later Actions identity of the artifact that carries the index").
- Carrier identity is external evidence bound during staging: `:110`, `:329` ("staging receipt binds the verified index bytes and `candidateEvidenceDigest` to that external carrier identity").
- E and owner approval bind both `candidateDigest` and `candidateEvidenceDigest`: `:112`, `:780`.
- No surviving sentence requires Actions upload IDs, attestation-envelope digest, downstream report/evidence hashes, or the index-carrier identity inside the candidate core: the exclusion list `:321` and the index exclusion `:329` are the only mandates; `:319`/`:448` restrict the hashed projection to pre-finalization identities.
- Registry/hash/lifecycle/approval/evidence wording agrees: run-evidence rows split candidate core vs. index `:412-413`; comparison rule keeps both projections distinct with no reduced projection `:429`; hash domains `:448-449`; approval binding `:780`; `CANDIDATE_VALIDATED` evidence lists the candidate-core manifest, reports, attestation, and candidate-evidence-index `:878`.

The former cycle (candidate JCS required to contain post-upload artifact/attestation identities that in turn depended on `candidateDigest`) is eliminated. The topological order is total and acyclic with no back-edge into the candidate core or the evidence index.

## `RB-C-002` verdict

**Verdict: CLOSED.**

The non-genesis signing-policy transition now has a closed, acyclic, independently verifiable construction topology with fixed signed bytes, namespace, and authority.

### Graph-edge proof

```text
proposed policy bytes (no downstream identity)              :810
  -> signingPolicyDigest (external)                         :810, 507
    -> transition proposal bytes (pre-commit facts only)    :812
      -> policyTransitionProposalDigest (external)          :812, 508
        -> detached transition signature                    :814
          -> protected commit (policy+proposal+signature siblings) :816
            -> post-commit Git/ref evidence                 :816
              -> policyTransitionEvidenceDigest (external)   :816, 509
```

Point-by-point confirmation:

- Proposed policy bytes exclude proposal, signature, resulting Git/tree/blob, ref, and post-commit evidence identities: `:810`.
- The proposal binds only pre-commit facts, including expected protected parent and proposed policy identity: `:812`, `:379`.
- `policyTransitionProposalDigest` is external and absent from the proposal: `:812`, `:508` ("which contains no `policyTransitionProposalDigest`").
- The detached signature signs exact proposal JCS under namespace `nova-play-signing-policy-transition-v1`: `:814`, `:424`.
- Authority derives from the immediately prior valid policy at the expected parent: `:814`, `:796`.
- Policy, proposal, and signature are sibling commit artifacts: `:816`.
- None contains the resulting commit ID: `:810`, `:816` ("none of them contains the resulting commit ID").
- Git/ref evidence is produced only after commit: `:816`, `:406`.
- `policyTransitionEvidenceDigest` is external and absent from its evidence object: `:816`, `:509`.
- Repository/ref substitution, stale-parent replay, sequence gaps, policy substitution, unauthorized signatures, and commit/ref mismatch are deterministically rejectable at the design level: `:818` ("Verification rejects a wrong repository or ref, a stale parent, replay, sequence gaps, policy substitution, unauthorized signatures, and any ref/commit mismatch"), supported by pre-commit binding of repo/ref/parent/prior-policy identity `:812` and post-commit evidence binding `:816`.
- Closed artifact and hash registries agree with §20.1: artifact-class rows for the proposal (deterministic-control `:379`), detached transition signature (run-evidence `:424`), and Git/ref evidence (deterministic-public-fact `:406`); hash-domain rows `:507-509`; policy-invariant text `:796`.
- No policy-to-proposal/signature/Git-evidence back-edge remains: `:810` forbids downstream identities in the policy bytes; the closed registry now contains the previously missing types, so the `RB-C-002` "unproven/missing type" defect is resolved.

## Regression-count results

All preserved-invariant counts verified mechanically against the corrected bytes.

| Preserved item | Required | Found | Evidence |
|---|---|---|---|
| Media IDs | 24 | 24 | `:168, 177, 185-208, 1142-1148` |
| Feature IDs | 13 | 13 | `:220-234, 1152-1159` |
| Lifecycle IDs | 32 | 32 | `:1165-1198` |
| Media origin split | 19 existing + 5 new | 19 + 5 | `:177` |
| Class `pass` | 16 | 16 | `:185-208` |
| Class `capability-classed` | 2 | 2 | `:188, 200` |
| Class `best-effort, clean-failure` | 2 | 2 | `:193-194` |
| Class `clean-fail` | 4 | 4 | `:191, 201-202, 206` |
| Non-executing cancellation aliases | preserved | preserved | `:179, 233-234, 1159` |
| `NP-HLS-008` identity/lock-only behavior | preserved | preserved | `:179, 192, 565` |
| Approval A direct child of E | preserved | preserved | `:761, 820, 846, 881` |
| Receipt/event/revocation/closure semantics | preserved | preserved | `:343-347, 838-896, 916-934` |
| Codec/tooling/legal/publication/prohibited-content decisions | preserved | preserved | `:66-92, 212-214, 681-708, 1007-1022` |
| Eight future plan boundaries | 8 | 8 | `:1043-1119` |

Media family tally: HLS 10, DASH 4, MPEG-TS 5, Progressive 4, FLV 1 = 24 (`:1142-1146`). Feature tally: DL 4, Cast 3, ERR 4, CANCEL 2 = 13 (`:1154-1157`). Lifecycle `NP-LIFE-001`..`NP-LIFE-032` contiguous = 32 (`:1165-1196`). No regression detected in any preserved item.

## Findings

### Critical

None.

### Important

None.

### Minor

None affecting approval. The self-review reported the physical line count as 1,201; the reviewed blob is 1,200 physical lines. This is review-metadata bookkeeping in a non-authoritative sibling document, not a specification defect, and does not affect construction, authority, hashing, replay rejection, or approval.

## Totals and overall verdict

| Severity | Count |
|---|---:|
| Critical | 0 |
| Important | 0 |
| Minor | 0 |

Both baseline Critical findings are independently confirmed closed: the candidate construction chain (`RB-C-001`) and the non-genesis signing-policy transition (`RB-C-002`) are now acyclic, carry exact external hash/signature ownership, establish authority from pre-existing identities only, forbid downstream/self back-edges, and admit deterministic independent verification. The correction preserved every checked registry count, classification, alias, lifecycle, approval, receipt/event/revocation/closure, codec/legal/publication decision, and the eight-plan boundary set.

**Ready for written owner approval: YES**

This YES verdict explicitly states that concrete JSON schemas, workflow mechanics, GitHub/Git API behavior, storage paths, and tests remain for implementation planning (Plans 1–8) and are deliberately deferred; their absence is not an approval blocker at the design-topology level.

## Integrity and non-authoritative-material confirmation

This review used only the authoritative specification bytes at HEAD plus the two named review documents in scope. The self-review verdict was not inherited. The unavailable commit `cdbcc7c84643908413dc439dbc5796333c126b15` and all unavailable associated reports were treated as nonexistent, and no conclusion from unavailable bytes was reconstructed or used. No specification, code, schema, workflow, build, implementation plan, push, tag, publication, or Release was produced by this review.
