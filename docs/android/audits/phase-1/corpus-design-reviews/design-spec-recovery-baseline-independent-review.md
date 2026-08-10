# Playback-corpus design recovery-baseline independent review

## Repository and reviewed-byte identity

| Field | Value |
|---|---|
| Repository path | `D:\Work\Tools\iptv` |
| Branch | `master` |
| Reviewed commit | `04c9081463bc1219a7bcf1ff581c209c537bcf83` |
| Reviewed commit parent | `4743b2ee77b6f8ff65af01193b653bda57670d47` |
| Specification | `docs/android/specs/2026-08-09-playback-corpus-design.md` |
| Specification Git blob ID | `f37929cc6597cef8dad7cbd3ca8941b96992afd9` |
| Specification raw SHA-256 | `d2dfddb05f5e8952c229604e80ef5a7d82b1194d07dd89c3cbafecd1b8c8353a` |
| Specification byte count | 125,197 |
| Specification physical line count | 1,161 |
| Review role | Independent documentation reviewer; no owner, normative, implementation, publication, or closure authority |
| Review effect | This report does not approve or correct the specification, integrate normative documents, authorize implementation or publication, or close Phase 1 |

The repository started at the expected branch and exact HEAD. The unavailable correction commit `cdbcc7c84643908413dc439dbc5796333c126b15` and its three reportedly associated but unrecoverable reports were treated as nonexistent and non-authoritative. No bytes, summaries, or reported conclusions from them were used as evidence.

## Scope and exclusions

This review inspected the canonical specification, all five currently present corpus-design reviews, the decision sheet and its final review, and the current requirements, device-policy, and playback-corpus documents. It independently re-evaluated the actual specification bytes rather than inheriting any prior pass/fail conclusion.

The bounded review covered:

- fixed owner decisions and the media, feature, and lifecycle registries;
- every normative artifact identity, hash, signature, authority, and construction edge;
- non-genesis signing-policy transition acyclicity;
- trust and authority boundaries;
- candidate, lock, staging, promotion, receipt, event, rejection, quarantine, revocation, and closure semantics;
- every Critical or Important finding in the currently available historical corpus-design reviews.

The old normative corpus differs from the proposed design. That is correctly disclosed as pending future atomic integration, not treated as a defect: the specification remains proposed and non-normative pending written approval and Plan 1 (`docs/android/specs/2026-08-09-playback-corpus-design.md:3-20, 95-110, 1082-1097, 1161`).

Excluded work: no specification or existing review was modified; no implementation plan, code, schema, workflow, fixture, test, infrastructure, build, publication, tag, push, or Release was created or run.

## Fixed decisions and registry results

### Exact registry counts

| Registry | Required | Found | Result | Evidence |
|---|---:|---:|---|---|
| Media identities | 24 | 24 | Exact | `:164-206, 1099-1109` |
| Feature identities | 13 | 13 | Exact | `:214-232, 1111-1120` |
| Lifecycle identities | 32 | 32 | Exact | `:234-253, 1122-1156` |
| Existing media | 19 | 19 | Exact | `:164-177` |
| New media | 5 | 5 | Exact | `:164-177` |

The media family counts are HLS 10, DASH 4, MPEG-TS 5, progressive 4, and FLV 1 (`:181-206`). The five new identities are exactly `NP-HLS-009`, `NP-HLS-010`, `NP-TS-005`, `NP-PROG-004`, and `NP-FLV-001` (`:164-177`). Compound closures do not create extra media identities (`:189-190, 208, 264`).

The required classification distribution is exact:

| Classification | Required | Found |
|---|---:|---:|
| `pass` | 16 | 16 |
| `capability-classed` | 2 | 2 |
| `best-effort, clean-failure` | 2 | 2 |
| `clean-fail` | 4 | 4 |

Evidence: the closed media matrix at `:181-206`.

`NP-CANCEL-001` and `NP-CANCEL-002` remain non-executing aliases consuming only `NP-LIFE-031` and `NP-LIFE-032`; they create neither media identities nor duplicate executions (`:231-232, 1118-1120`). `NP-HLS-008` remains identity/lock-only with independently valid A/B closures and no runtime cancellation assertion (`:190, 264, 548`).

### Seventeen owner decisions

All 17 approved decision subjects are preserved:

1. the exact 24/13/32 target and non-media accounting (`:44, 64, 164-253`);
2. the 19-existing/5-new split (`:164-177`);
3. the four-value media classification vocabulary and exact counts (`:168-206`);
4. baseline H.264 Main@L3.1 rows (`:183-205`);
5. High@L4.1 only in `NP-HLS-009` (`:191`);
6. HEVC Main10 in `NP-HLS-010` (`:192`);
7. HEVC Main capability classification (`:194, 199`);
8. HE-AAC v1/v2 in `NP-TS-005` (`:201, 210-212`);
9. one exact progressive MP4 subtitle fixture for `NP-PROG-004` (`:205, 208`);
10. exact FLV clean-fail scope (`:206`);
11. mandatory DASH backend switching evidence (`:193-196, 214-232`);
12. mandatory compound broken-HLS A/B/C closure (`:189, 208`);
13. `NP-HLS-008` identity/lock-only separation (`:190, 264, 548`);
14. non-executing cancellation aliases (`:231-232, 1118-1120`);
15. exact lifecycle meanings and anchors, including anchorless `NP-LIFE-030` (`:1122-1156`);
16. source/tool legality separated from generated-byte redistribution permission (`:664-691`);
17. generated-only/public-vector restrictions, complete provenance, archive/public-Release controls, and prohibition of provider, private, credential, DRM, device-captured, or real IPTV content (`:620-680, 693-713`).

The codec, tooling, legal, archive, public-Release, and content restrictions are therefore preserved. Publication remains all-or-nothing if any row lacks an adequate provenance/licence/redistribution entry (`:666-680`).

## Artifact graph and digest analysis

### Identity and signing matrix

| Artifact/evidence | Exact covered bytes or projection | Identity/signature | Construction dependencies and result |
|---|---|---|---|
| Registry/spec | Strict registry JCS; complete Markdown raw bytes | `specDigest`; `rawMarkdownSha256` (`:427-431`) | Source bytes first, external digests second; acyclic |
| Object/closure/archive | Exact object bytes; totally ordered closure-tuple JCS; exact canonical compressed archive bytes | `objectSha256`, `closureHash`, `archiveSha256` (`:439-442, 504-516`) | Objects → closure projection → archive projection/archive; duplicate tuples rejected; acyclic |
| Proposed/E lock | Exact strict lock JCS; E byte-copies it | `lockDigest`, `lockRawSha256` (`:311-313, 432-433`) | Candidate content → proposed lock → staging → E copy; identities external; acyclic |
| Candidate | Exact candidate JCS containing repository/workflow/run, every Actions artifact, attestation, OCI, toolchain, lock/archive/report/evidence, transaction and attempt identity | `candidateDigest` (`:315-319, 400, 434`) | **Cyclic as specified; see `RB-C-001`** |
| Attestation/subject | Exact serialized envelope; exact named subject bytes | native algorithm-qualified `attestationDigest` and `subjectDigest` (`:401, 455-456`) | Subject bytes → subject digest → envelope → envelope digest, unless the envelope/candidate cross-bindings are required in the same candidate artifact cycle; see `RB-C-001` |
| Staging | Normalized fixed draft Release/asset fact snapshot JCS | `stagingDigest` (`:321-325, 386-390, 435`) | Candidate → staging observation/snapshot → E; acyclic |
| Approval A | Exact signed approval JCS with no trailing newline; detached OpenSSH signature uses the same bytes | external `approvalDigest`; namespace `nova-play-corpus-approval-v1`; principal `corpus-owner-v1` (`:731-771`) | E → approval bytes/digest → detached signature → direct-child A; acyclic; A is required to remain a direct child of E (`:744-752`) |
| Signing policy | Full strict policy JCS without its external digest | `signingPolicyDigest` (`:368, 492, 775-783`) | Genesis is pinned externally. Non-genesis exact proposal/signature/post-commit evidence graph is incomplete; see `RB-C-002` |
| Receipt | Exact canonical proposed-receipt JCS/file bytes, copied unchanged into R | external `receiptDigest` and `receiptRawSha256` (`:333-337, 437-438, 518`) | Public facts → proposed receipt/report → R copy → post-commit verification; acyclic |
| Event | Proposal JCS excludes final chain fields; final event JCS excludes its own digest | `eventProposalDigest`, external `eventDigest`, `priorEventDigest` (`:453, 477, 497, 799-809`) | Proposal → protected lease/tip check → injected sequence/prior digest → commit → blob/chain verification; acyclic and append-only |
| Revocation | Complete signed revocation object without its own digest; selector mode is exclusive | `revocationDigest`, `priorRevocationDigest` (`:454, 484, 785-797`) | Prior valid policy/revocation tip → object/signature → protected commit → discovery; no self-hash |
| Git/ref | Git-defined header plus content; independently resolved repository/ref/verification commit | native `gitObjectFormat`/`gitObjectId` (`:461, 783`) | Post-commit evidence must follow commit; generic discovery exists, but policy-transition-specific evidence is not fully specified; see `RB-C-002` |
| OCI | Exact index, selected manifest, config, and ordered compressed layer bytes | native algorithm-qualified OCI digests (`:457-460`) | Layers/config → manifest → index; acyclic |
| Actions artifact | Exact bytes of named numeric Actions artifact | API-declared algorithm-qualified digest (`:487`) | Numeric artifact identity exists only after upload; requiring it inside its own candidate evidence creates `RB-C-001` |
| Public Release projection | Strict normalized Release/tag/asset projection | `publicReleaseProjectionDigest` (`:394, 496`) | Approved staging projection → promotion → external public facts; content identity remains separate from hosting state |
| Final closure | Ordered external Phase 1 evidence and closure record | event/closure identities under the append-only finalizer (`:824-849, 877-893`) | Receipt verification and all external Phase 1 gates precede closure; no corpus-only closure claim |

### Non-genesis policy transition

The required acyclic model would be:

```text
proposed policy bytes
-> external policy digest
-> transition proposal
-> detached signature
-> protected commit
-> external post-commit Git/ref evidence
```

The current text establishes proposed policy bytes and an external digest (`:368, 492`), requires prior-policy authorization and protected ancestry (`:779`), and requires repository-derived post-commit discovery (`:783`). However, the specification's claimed closed artifact registry (`:339-415`) has no distinct signing-policy transition proposal, no detached policy-transition signature row, and no policy-transition-specific post-commit Git/ref evidence row. The generic event proposal at `:407` does not define policy-transition signed bytes, and the only detached-signature row at `:410` is explicitly the owner approval signature. Consequently, the transition is not demonstrated cyclic, but its exact construction and independent-verification topology is **unproven**, as detailed in `RB-C-002`.

## Trust and authority boundaries

The specification correctly separates interactive input, future exact-hash written approval, Plan 1 normative integration, per-candidate redistribution approval, and final closure (`:3-20, 95-110, 1082-1097`). It pins the future genesis policy, complete public-key bytes, namespace, principal, and owner trust statement (`:731-742, 775-783`); requires A to be a path-limited direct child of E (`:744-752`); derives current policy/ref evidence from protected repository state (`:779-783`); and separates immutable content identity from mutable staging/hosting observations (`:309-337, 386-415`).

Pre-commit artifacts and post-commit evidence are generally separated: event producers emit proposals while the protected finalizer allocates final chain identity (`:799-809`), and receipt authority follows proposal → R → post-commit verification (`:333-337, 518`). Tool legality is explicitly distinct from encoded-byte redistribution permission (`:664-691`).

These strengths do not close the two authority-graph failures below.

## State and transaction semantics

The high-level transaction is forward-only (`:811-849`). `REJECTED` and `QUARANTINED` terminate only their transaction/attempt, while `REVOKED` terminates trust in the corpus version (`:851-857`). Retry creates a new attempt and may not rewrite history (`:859-875`). Post-approval staging mutation starts a new candidate/staging/approval cycle (`:861-863`). Unknown API outcomes are queried by numeric/stable identity and mismatches quarantine rather than blindly retrying (`:865-871`).

Receipt identities remain external and therefore do not self-reference (`:437-438, 518`). Event identities are finalized externally and do not self-reference (`:453, 497, 801-809`). Closure tuples have a five-part total order—normalized path bytes, fixed role ordinal, full before range, numeric offset, numeric length—and exact duplicates are rejected (`:504-516`). These state, receipt, closure, rejection, quarantine, revocation, and append-only-history requirements are deterministic apart from the separately identified candidate and signing-policy graph failures.

## Historical Critical/Important finding dispositions

The table includes every unique Critical or Important finding in the five currently available historical corpus-design review files. “Superseded” means the canonical specification replaced the defective mechanism with an explicit later rule; it does not mean an unavailable report was consulted.

| Stable finding | Current disposition | Current specification evidence |
|---|---|---|
| `IR1-C1` — authority root | Resolved | `:3-20, 95-110, 1082-1097` |
| `IR1-I1` — feature meanings/references | Resolved | `:214-232` |
| `IR1-I2` — lock timing | Resolved | `:30-36, 99-110, 309-319` |
| `IR1-I3` — approval self-hash | Resolved | `:327-331, 419-438, 731-754` |
| `IR1-I4` — deterministic versus run evidence | Superseded by closed three-class registry | `:339-415` |
| `IR1-I5` — unresolved fixture alternatives | Resolved | `:181-212` |
| `IR1-I6` — HE-AAC generation/legal path | Resolved | `:201, 210-212, 664-691` |
| `IR1-I7` — non-total media machines | Superseded by total-machine contract | `:564-598` |
| `IR1-I8` — network shutdown conflict | Resolved | `:631-646` |
| `IR1-I9` — candidate identity omissions | Resolved as to omitted fields; new self-dependency is separately reported as `RB-C-001` | `:315-319` |
| `IR1-I10` — signing rotation/revocation | Superseded by pinned genesis, dual-policy check, and selector predicate | `:731-797` |
| `IR1-I11` — append-only dispositions | Superseded by proposal/finalization and explicit scopes | `:799-857` |
| `IR1-I12` — receipt sequencing | Resolved | `:333-337, 844-847, 877-893` |
| `IR1-I13` — mutable Release fields | Resolved | `:754-773` |
| `IR1-I14` — hash projections | Superseded by closed hash registry and exact closure order | `:417-520` |
| `IR2-I-A` — incomplete artifact classes | Resolved for the artifacts it enumerates; the newly exposed policy-transition omission is `RB-C-002` | `:339-415` |
| `IR2-I-B` — media-machine byte totality | Resolved | `:564-598` |
| `IR2-I-C` — trust genesis/cutover/revocation predicate | Resolved for genesis/cutover/selectors; transition-byte topology remains `RB-C-002` | `:775-797` |
| `IR2-I-D` — event finalization/pre-E authority | Resolved | `:799-857` |
| `IR2-I-E` — hash registry/receipt/closure ordering | Resolved | `:417-518` |
| `IR2-I-F` — plan boundaries | Resolved | `:1004-1080` |

No historical Critical or Important finding is simply inherited as open. The two findings in this review arise from independent examination of the canonical bytes and are narrower graph defects not established by unavailable material.

## Findings

### Critical

#### `RB-C-001` — Candidate and Actions/attestation identities form an impossible construction cycle

1. **Exact evidence:** `docs/android/specs/2026-08-09-playback-corpus-design.md:317-319, 400-401, 415, 434, 455-456, 487, 722`.
2. **Conflicting graph edges/requirements:** the exact candidate JCS must contain every numeric Actions artifact ID/name/size/digest and the attestation digest (`:317, 400`), while `candidateDigest` hashes that exact JCS (`:434`). The candidate manifest is itself authoritative candidate evidence produced by the candidate workflow (`:319, 722`), and the provenance envelope's stable projection contains candidate identity (`:401`). Numeric artifact IDs and exact artifact-byte digests exist only after upload (`:487`), while attestation bytes/digest depend on candidate identity (`:401, 455-456`). Thus the graph requires candidate bytes/digest before artifacts and attestation, but also requires those resulting identities inside the candidate bytes.
3. **Concrete failure scenario:** a protected run constructs the manifest and computes `candidateDigest`, then uploads the candidate bundle and obtains its numeric artifact ID/digest and creates the attestation. Adding either result to the mandatory candidate JCS changes `candidateDigest`; regenerating the artifact or attestation changes their bytes/digests again. No finite fixed construction produces the required mutually bound exact bytes, and independent verifiers cannot know which iteration is authoritative.
4. **Smallest design-level correction:** split immutable pre-upload candidate content identity from externally produced run/publication evidence. Define a candidate core whose digest excludes identities that can exist only after that core is finalized, then define a separate externally hashed evidence/index object that binds the core digest to Actions artifact and attestation identities. Do not require either object to contain an identity derived from bytes that contain that same identity.

#### `RB-C-002` — Non-genesis signing-policy transition lacks exact signed bytes and a closed acyclic evidence topology

1. **Exact evidence:** `docs/android/specs/2026-08-09-playback-corpus-design.md:339-415, 368, 407, 410, 492, 775-783`.
2. **Conflicting graph edges/requirements:** the document claims a closed registry containing every artifact schema/type and rejects missing types (`:339-341`). It defines policy bytes/digest (`:368, 492`) and requires a transition to be authorized under the prior policy and committed on protected ancestry (`:779`), followed by repository-derived ref/commit discovery (`:783`). Yet the closed registry has no distinct policy-transition proposal, no detached policy-transition signature, and no transition-specific post-commit Git/ref evidence object. The generic event proposal (`:407`) does not define the policy transition's exact signed bytes, and the detached signature row (`:410`) is explicitly bound to owner approval, not policy transition.
3. **Concrete failure scenario:** two conforming maintainers can sign different projections—one signs only the proposed policy digest, another signs policy bytes plus prior policy and intended ref—and can record different pre/post-commit facts. Both can claim “signed/authorized” and “protected ancestry,” while an independent verifier has no normative schema, namespace, exact signature input, commit-target binding, or post-commit evidence projection with which to choose. A malicious substitution or replay across refs/projects cannot be rejected deterministically from the specified artifacts.
4. **Smallest design-level correction:** add the missing transition proposal, detached transition signature, and external post-commit Git/ref evidence types to the closed registry. Fix their namespace, authority, exact bytes/projections, and external digests so the mandatory order is exactly proposed policy bytes → external policy digest → proposal → detached signature → protected commit → external post-commit Git/ref evidence, with no commit/tree/blob/ref identity embedded in the proposed policy bytes.

### Important

None.

### Minor

None.

## Totals and verdict

| Severity | Count |
|---|---:|
| Critical | 2 |
| Important | 0 |
| Minor | 0 |

**Ready for written owner approval: NO**

A `YES` verdict requires Critical = 0 and Important = 0. The two Critical artifact/authority graph failures prevent deterministic construction and independent security verification even though registry counts, fixed decisions, state scopes, receipt identity, closure ordering, and the historical correction set otherwise pass.

## Integrity and non-authoritative-material confirmation

This review used only evidence present in the canonical repository/working-tree documents named in scope. The unavailable commit `cdbcc7c84643908413dc439dbc5796333c126b15` and all unavailable associated reports were treated as nonexistent. No reported conclusion from unavailable bytes was reconstructed or used.