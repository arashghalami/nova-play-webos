# Playback-corpus design construction-graph correction self-review

## Repository and pre-correction identity

| Field | Value |
|---|---|
| Repository path | `D:\Work\Tools\iptv` |
| Branch | `master` |
| Pre-correction commit | `15a913dde327ece7b8cd4bec9b0b80ec0e8ea4cb` |
| Pre-correction commit parent | `04c9081463bc1219a7bcf1ff581c209c537bcf83` |
| Specification | `docs/android/specs/2026-08-09-playback-corpus-design.md` |
| Correction scope | `RB-C-001` and `RB-C-002` only |

This is a documentation-only correction. No code, schema, workflow, fixture, build, tag, push, publication, or Release was created or run. The baseline review and all normative integration documents were left unmodified.

## Pre/post specification identity

| Field | Pre-correction | Post-correction |
|---|---|---|
| Git blob ID | `f37929cc6597cef8dad7cbd3ca8941b96992afd9` | `dc7edd395b0d6996d207236f84ea373c6f5b7371` |
| Raw SHA-256 | `d2dfddb05f5e8952c229604e80ef5a7d82b1194d07dd89c3cbafecd1b8c8353a` | `d3a85e7971b826a70c0d308d52dfd938b208c4f832c0adcbb6ab5a4527400f34` |
| Byte count | 125,197 | 131,996 |
| Physical line count | 1,161 | 1,201 |

## Changed sections

- §5 Architecture and authority — forward-chain edge and the E/approval binding sentence now route through the candidate core, the `candidate-evidence-index`, and both `candidateDigest` and `candidateEvidenceDigest`.
- §11.2 `candidate-manifest.json` — redefined as the **candidate core** with a pre-finalization-only identity set and an explicit exclusion list.
- §11.2.1 `candidate-evidence-index` — new subsection defining the closed-registry evidence index and its external `candidateEvidenceDigest`.
- §11.6 closed reproducibility artifact registry — candidate manifest row narrowed to the core; added `candidate-evidence-index` (run-evidence), `signing-policy-transition proposal` (deterministic-control), `detached signing-policy-transition signature` (run-evidence), and `signing-policy-transition Git/ref evidence` (deterministic-public-fact); candidate-comparison paragraph split into core and index projections.
- §12 canonicalization and hash domains — added `candidateEvidenceDigest`, `policyTransitionProposalDigest`, and `policyTransitionEvidenceDigest` rows; clarified `candidateDigest` covers candidate-core JCS with no self-field.
- §20 approval object binding — approval binds both `candidateDigest` and `candidateEvidenceDigest`.
- §20.1 pinned genesis and policy chain — added the exact non-genesis transition construction order, the pre-commit-only proposal binding, the transition signature namespace and authority, the sibling-artifact commit rule, the post-commit Git/ref evidence, and the verification rejection set.
- §21 append-only state machine — `CANDIDATE_VALIDATED` evidence now lists the candidate-core manifest and the candidate-evidence-index.

## `RB-C-001` acyclic edge list

Directed edges (each identity depends only on inputs that already exist; no node depends on a downstream node):

```text
candidate inputs + pre-existing identities -> candidate-manifest core bytes
candidate-manifest core bytes -> candidateDigest
candidateDigest -> reports
candidateDigest -> attestation (subject/envelope)
candidateDigest -> payload Actions artifacts (numeric ID/name/size/API digest)
candidateDigest -> candidate-evidence-index bytes
reports -> candidate-evidence-index bytes
attestation -> candidate-evidence-index bytes
payload Actions artifacts -> candidate-evidence-index bytes
candidate-evidence-index bytes -> candidateEvidenceDigest
candidate-evidence-index bytes + candidateEvidenceDigest -> final index-carrier upload identity
final index-carrier upload identity -> staging observation/receipt
candidateEvidenceDigest -> staging observation/receipt
candidateDigest + candidateEvidenceDigest -> evidence commit E + owner approval A
```

There is no back-edge into `candidate-manifest core bytes` or into `candidate-evidence-index bytes`; the topological order candidate core → digest → reports/attestation/artifacts → index → index digest → carrier → staging → E/approval is total and acyclic.

## `RB-C-002` acyclic edge list

```text
proposed signing-policy bytes -> signingPolicyDigest
signingPolicyDigest -> signing-policy-transition proposal bytes
prior policy sequence/digest/blob + repo/ref + expected parent -> signing-policy-transition proposal bytes
signing-policy-transition proposal bytes -> policyTransitionProposalDigest
signing-policy-transition proposal bytes -> detached transition signature
detached transition signature -> protected commit (siblings: policy, proposal, signature)
proposed signing-policy bytes -> protected commit
signing-policy-transition proposal bytes -> protected commit
protected commit -> post-commit Git/ref evidence
post-commit Git/ref evidence -> policyTransitionEvidenceDigest
```

The proposed policy bytes precede the proposal; the proposal precedes the signature and its digest; the signature precedes the commit; the commit precedes the post-commit evidence and its digest. No node embeds a downstream identity, so the graph is acyclic.

## No-self / no-downstream identity confirmation

- Candidate core excludes its own `candidateDigest`, any post-upload Actions ID/digest, the attestation envelope digest, report/evidence identities, `candidateEvidenceDigest`, and the index-carrier identity.
- `candidate-evidence-index` excludes `candidateEvidenceDigest` and the later Actions identity of the artifact that carries the index.
- Proposed signing-policy bytes exclude proposal/signature identity, resulting commit/tree/blob identity, resulting protected-ref identity, and post-commit evidence identity.
- The transition proposal excludes `policyTransitionProposalDigest` and any resulting commit/ref identity; the post-commit Git/ref evidence excludes `policyTransitionEvidenceDigest`.

No artifact contains its own digest or any downstream identity.

## Preservation checks

| Check | Required | Found |
|---|---|---|
| Media identities | 24 | 24 |
| Feature identities | 13 | 13 |
| Lifecycle identities | 32 | 32 |
| Media origin split | 19 existing + 5 new | 19 + 5 |
| `pass` | 16 | 16 |
| `capability-classed` | 2 | 2 |
| `best-effort, clean-failure` | 2 | 2 |
| `clean-fail` | 4 | 4 |

Cancellation alias semantics, `NP-HLS-008` identity/lock-only scope, codec/tool/legal/publication/content decisions, approval A as a direct child of E, and the receipt/event/revocation/closure and eight-plan boundaries were left unchanged except for the required references to `candidateEvidenceDigest`/`candidateDigest`, the candidate-evidence-index, and the signing-policy-transition artifacts.

## Out-of-scope confirmation

Only `RB-C-001` and `RB-C-002` were addressed. All other baseline-review dispositions (every Resolved/Superseded historical finding, the registry counts, trust boundaries, state/transaction semantics, receipt/closure identities, and the "Important: None / Minor: None" results) were left out of scope and unchanged. The baseline review and all normative integration documents were not modified. Implementation-resolvable details — schemas, workflow YAML, storage paths, polling/retry/error-message/class/function details, GitHub/Git mechanics, and CI — were deliberately deferred to implementation planning.

## Self-review severity totals

| Severity | Count |
|---|---:|
| Critical | 0 |
| Important | 0 |
| Minor | 0 |

Both corrected construction graphs are acyclic, carry exact signed/hashed ownership, establish authority from pre-existing identities only, and admit independent verification. No Minor observation exposes a construction, authority, security, or verification blocker, so no further design expansion is warranted.
