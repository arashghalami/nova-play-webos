# Playback corpus written-design approval record

## 1. Approval metadata

| Field | Value |
|---|---|
| Date | 2026-08-10 |
| Owner | `arashghalami`, identified as the repository owner |
| Repository | `arashghalami/nova-play-webos` |
| Approval type | Written-design approval (authorizes implementation planning only) |

This record is the dedicated, committed design-approval record required by the
specification's Section 1 and Section 30. It advances authority externally; it
does not modify the approved specification bytes.

## 2. Approved design identity (verified)

| Field | Value |
|---|---|
| Design path | `docs/android/specs/2026-08-09-playback-corpus-design.md` |
| Correction commit | `52e6740e76a20671293eabc8340b82138ad3c696` |
| Design Git blob | `dc7edd395b0d6996d207236f84ea373c6f5b7371` |
| Design raw SHA-256 | `d3a85e7971b826a70c0d308d52dfd938b208c4f832c0adcbb6ab5a4527400f34` |
| Byte count | 131996 |
| Physical line count | 1200 |

## 3. Final independent review identity (verified)

| Field | Value |
|---|---|
| Review path | `docs/android/audits/phase-1/corpus-design-reviews/design-spec-construction-graph-final-independent-review.md` |
| Review commit | `d3183df450e9660aae72560e743292b02601d142` |
| Review Git blob | `b507b7106437352fc9f8b26e455a4b58c9b63196` |
| Review raw SHA-256 | `048a790dfa6702c9e00db4432ddf53bdf3e5e234a82a42ecd5b5905a38e87e83` |
| Verdict | Critical 0, Important 0 |
| Ready for written owner approval | YES |

## 4. Approval evidence

On 2026-08-10 the repository owner `arashghalami` replied with exactly the
literal word:

> approved

That literal reply directly answered and adopted the immediately preceding
scoped approval statement reproduced verbatim in full in Section 5. The owner's
adoption is by the literal reply `approved`; the owner did **not** type the
longer statement verbatim. The literal reply and the adopted statement are
distinct: the reply is the act of approval, and the reproduced statement is the
scope that the reply adopts.

## 5. Reproduced approval statement (adopted in full)

> I approve the Phase 1 Android playback-corpus written design at
> docs/android/specs/2026-08-09-playback-corpus-design.md, Git blob
> dc7edd395b0d6996d207236f84ea373c6f5b7371, raw SHA-256
> d3a85e7971b826a70c0d308d52dfd938b208c4f832c0adcbb6ab5a4527400f34, as reviewed
> at commit d3183df450e9660aae72560e743292b02601d142. This approval authorizes
> implementation planning only. It does not authorize implementation, normative
> integration, publication, tagging, a Release, or Phase 1 closure.
> Implementation-resolvable details remain deferred to the implementation plans.

## 6. 17-decision reference

The owner interactively approved, per the design's Scope authority (Section 1)
and design-approval record (Section 30), **all 17 decisions and all four design
sections**. The interactively approved design decisions enumerated in Section 4
of the exact approved design blob (`dc7edd395b0d6996d207236f84ea373c6f5b7371`)
are reproduced here for reference exactly as recorded in that section:

| Decision | Interactively approved design |
|---|---|
| Authoritative toolchain | Repository-owned, source-build Linux container |
| Authoritative execution | GitHub Actions Linux |
| Architecture | `linux/amd64`; record exact OCI index, selected manifest, config, layers, and execution envelope |
| Orchestration | Isolated Node.js ESM tooling under `tools/playback-corpus/` |
| Content policy | Synthetic-first deterministic audiovisual primitives |
| Reference vectors | Only when an approved legal/technical row cannot be generated lawfully and reliably |
| Archive ceiling | Canonical compressed archive no larger than 250 MiB |
| Extracted ceiling | No more than 1 GiB |
| File-system bounds | At most 10,000 files; each no larger than 256 MiB; path depth at most 12 |
| GPL encoders | x264/x265 permitted only as pinned unpublished build tooling |
| Nonfree controls | No silent nonfree encoder or dependency |
| Legal gate | Generation success and encoded-byte redistribution approval are separate gates |
| Owner action | Owner signs a technical-due-diligence publication approval |
| Approval limitation | Approval is not legal advice, legal clearance, patent licence, or warranty |
| Durable bytes | Exact published bytes are retained in a public GitHub Release |
| Staging | Access-controlled draft Release is durable pre-approval staging only after capability-probe success |
| Privilege model | Two-stage generation/staging plus separately protected promotion |
| Reproducibility | Deterministic content-control artifacts are bit-identical in one pinned envelope; run-specific evidence uses stable equivalence projections; encoded bytes may change only after deliberate toolchain/version change, semantic revalidation, a new candidate transaction, and a new approval; published bytes are immutable |
| Sensitive material | No provider, private, credential, or tester data |
| Cryptography | No DRM or encrypted fixtures in corpus v1 |

This approval also adopts **all four design sections** that the owner approved
interactively, as recorded in the design's Scope authority (Section 1) and its
design-approval record (Section 30). The approved design blob characterises the
interactive scope as "all 17 decisions and all four design sections"; this
record reproduces that scope faithfully and does not add, rename, or reinterpret
any decision or section beyond the approved bytes.

## 7. Explicit authority granted

This written-design approval authorizes exactly one downstream activity:

- Creation of exactly **eight implementation plans** as defined by design
  Section 29 (Plan 1 through Plan 8), each independently executable,
  independently reviewed, and bounded as specified.

## 8. Explicit non-authority

This approval does **not** authorize any of the following:

- No implementation.
- No normative integration.
- No corpus generation.
- No workflow execution.
- No candidate authority and no content-lock authority.
- No signing-policy genesis activation.
- No tag, no publication, no Release, and no push.
- No Phase 1 closure.

## 9. Plan 1 and Phase status

- **Plan 1 normative integration remains incomplete.** Plan 1 (Authority and
  normative integration, design Section 29) is the required first implementation
  plan. No repository file becomes the normative 24/13/32 registry, and no later
  plan begins, until Plan 1 is completed and green.
- **Phase 1 remains OPEN.** This written-design approval does not close Phase 1
  and does not satisfy any Phase 1 closure obligation.

## 10. Separation from future per-candidate redistribution approval

This is a **written-design approval** only. It is distinct from, and does not
substitute for, the later per-candidate cryptographic redistribution approval
that authorizes publication of exact candidate bytes. Neither approval implies
the other.
