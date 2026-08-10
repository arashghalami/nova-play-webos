# Reproducible playback corpus design — independent review

## Metadata

| Field | Value |
|---|---|
| Review date | 2026-08-09 |
| Reviewer role | Final independent design reviewer; no normative or publication authority |
| Review base | `7a4a3b163d436dd1727b9fad5356536e27ef8a7f` |
| Review head | `3cfa188a3acaabf9163b5a9474f5f8af0fb2e55c` |
| Commit subject | `docs(android): specify reproducible playback corpus` |
| Reviewed specification | `docs/android/specs/2026-08-09-playback-corpus-design.md` |
| Existing corpus-design report read | `docs/android/audits/phase-1/corpus-design-reviews/design-spec-self-review.md` |
| Required supporting evidence read | Decision sheet and final review, Android requirements/device/corpus documents, refactor baseline, plan v3, `CLAUDE.md`, and `.gitignore` |
| Method | Complete document reads, direct committed-range inspection, exact-ID extraction, section counting, cross-document authority comparison, and security/recovery review |
| Severity totals | Critical: 1; Important: 14; Minor: 0 |
| Phase effect | This review does not approve publication, implement the corpus, or close Phase 1 |

## Strengths

- The commit range is narrowly scoped to the specification and its self-review.
- All 30 numbered top-level sections exist once and in order.
- Exact-ID extraction from the specification returns 24 media IDs, 13 feature IDs, and 32 lifecycle IDs, with no feature or lifecycle ID counted as media.
- The media set, 19-existing/5-new split, four-value class vocabulary, H.264 Main@L3.1 baseline rows, `NP-HLS-009`, `NP-HLS-010`, HEVC Main classes, `NP-TS-005`, mandatory DASH switching statement, `NP-HLS-008` identity/lock separation, cancellation aliases, and all 32 lifecycle meanings and anchors match the decision-sheet target.
- The design correctly separates registry, content lock, candidate, staging, approval, Release, receipt, event, and revocation concepts and generally avoids future Release coordinates and self-hashes.
- RFC 8785 JCS, domain-separated hashing, immutable schema/oracle versions, strict registry extraction, complete row closures, fixture-specific negative checks, and explicit no-device-claim language are strong foundations.
- Supply-chain controls are extensive: full-SHA action pins, unprivileged PR smoke tests, secretless candidate generation, independently revalidated write jobs, fixed argv use, cache distrust, SSRF controls, sandboxing, archive-entry defenses, and no media execution during promotion.
- Licensing language correctly limits CC0 to project-authored expression, separates GPL tooling from distributed bytes, preserves patent caveats, blocks the entire corpus for an unresolved row, and treats owner publication approval as technical due diligence rather than legal clearance.
- Draft Release terminology is mostly accurate: repository-access-controlled mutable staging is distinguished from immutable public publication.
- The design explicitly acknowledges tag/publication non-atomicity, disallows published-to-draft rollback, requires query-before-retry recovery, and keeps the corpus tag distinct from the historical webOS baseline tag.
- It consistently prohibits provider, private, credential, tester, device-captured, DRM, and real IPTV material and makes no Android playback claim.

## Issues

### Critical

#### C1 — Approval and normative authority are asserted without an approved or integrated authority root

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:8-17, 63-66, 94-105, 251-271, 691-712, 766-777, 841`.
- **Defect:** The specification labels itself “Owner-approved,” calls its decisions binding, describes `docs/android/playback-corpus.md` as an approved 24/13/32 registry, and labels a new Phase 1 sequence approved. The cited decision sheet remains explicitly awaiting owner approval and says it has no normative effect until approval and later integration. The current corpus document remains the old 19-row registry, while the active plan of record still defines a documentation-only Phase 1 and puts acquisition at the start of Phase 2. The specification therefore creates two competing authority systems and treats a recommendation as approval.
- **Impact:** Implementation and eventual publication could proceed under codec, registry, workflow, legal-risk, and Phase sequencing decisions that repository evidence does not authorize. This is an unsafe approval boundary, not a documentation nicety.
- **Exact correction:** Keep the design status proposed/non-normative until a repository-verifiable owner decision approves the relevant decisions. Then perform one atomic normative integration that updates or explicitly supersedes the active plan, requirements, device policy where affected, and corpus registry. Record which approved artifact is the authority root and remove every claim that the current 19-row document already contains the 24/13/32 registry. Design approval must remain distinct from the later per-candidate redistribution signature.

### Important

#### I1 — The feature registry lists IDs but omits the normative meanings and media references for 11 of 13 cases

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:41-45, 156-171, 791-800`.
- **Defect:** Section 30 enumerates `NP-DL-*`, `NP-CAST-*`, `NP-ERR-*`, and `NP-CANCEL-*`, but only the cancellation aliases receive execution semantics. Download, Cast, and error meanings, media anchors, and pass bars are absent. The current normative corpus file does not provide this 13-case target either.
- **Impact:** Two conforming implementations could migrate different feature meanings or references while both claiming the required 13 IDs. The machine registry cannot be reconstructed from the specification without treating the still-advisory decision sheet as a second normative source.
- **Exact correction:** Add a normative feature table containing every ID, exact meaning, referenced media row(s), execution owner, pass/fail rule, and alias behavior. Use the approved decision-sheet mapping verbatim after C1 is resolved, including download scope, pre-connection Cast rejection, explicit error surfaces, and non-executing cancellation aliases.

#### I2 — Content-lock commitment timing contradicts the candidate and evidence sequence

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:27-33, 98-105, 224-249, 277-287, 596-607, 672-687, 695-705`.
- **Defect:** The goals require generated bytes to be validated against a committed content lock, but the state machine and acceptance gates place candidate generation before evidence commit E, while E is described as committing the lock and staging evidence. It is unclear whether the candidate consumes a pre-existing committed lock, creates a proposed lock, or validates a lock generated in the same run.
- **Impact:** The authority direction between bytes, lock, candidate, S, and E is ambiguous. Implementations can choose incompatible two-pass or one-pass build models, and reviewers cannot tell which committed object authorized candidate generation.
- **Exact correction:** Choose one model. Either (a) S contains a previously validated lock and the authoritative candidate must reproduce exactly that lock/archive, or (b) the candidate produces a non-authoritative proposed lock, E commits it after validation/staging, and approval binds E. Update the goals, state table, gates, and authority diagram consistently and define the exact failure/rebuild rule when proposed bytes differ.

#### I3 — The approval object’s “domain hash” conflicts with the no-self-hash rule

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:295-300, 307-347, 552-566, 618-622`.
- **Defect:** The approval object is said to bind an “approval schema/policy version and domain hash,” while all artifact schemas forbid self-hashes and the idempotency key later uses `approvalDigest`. The text does not say whether this hash is the approval object’s own digest, a hash-domain identifier, or a hash of a separate policy object.
- **Impact:** An implementation may introduce an impossible circular approval hash or sign a projection different from the one used by promotion.
- **Exact correction:** State that the signed approval object contains no digest of itself. Define `approvalDigest` as an externally computed domain hash over the exact signed JCS bytes. If the intended field is a policy hash or hash-domain version identifier, name it precisely and define its separately stored input bytes.

#### I4 — Bit-identical “control artifacts” are not separated from run-varying evidence

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:86, 235-237, 283-287, 349-367, 401-419, 568-570, 614-624`.
- **Defect:** The design requires control artifacts to be bit-identical under the same lock/envelope, but the candidate manifest contains run/attempt identities and timestamps, and events contain timestamps and sequence links. The term “control artifacts” is not bounded to exclude these necessarily run-varying records.
- **Impact:** Reproducibility acceptance is impossible as written or may be weakened ad hoc by implementation. Identical content builds cannot produce bit-identical candidate/event records.
- **Exact correction:** Define two explicit classes: deterministic content-control artifacts and run-specific evidence artifacts. Enumerate each artifact in one class, define deterministic projections for the former, and require semantic/binding equivalence—not byte identity—for permitted run fields in the latter. Preserve exact byte identity for every already-published asset.

#### I5 — Two media identities retain unresolved fixture alternatives

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:181, 197, 200`.
- **Defect:** `NP-HLS-007` may be either a corrupt manifest or a fixed 404 target, and `NP-PROG-004` may be progressive MP4 or an “approved in-scope fMP4 surrogate.” These are materially different closures, fault oracles, parser paths, and track mechanisms.
- **Impact:** Independent implementations can produce incompatible fixtures and still satisfy the prose. Stable identity and oracle meaning are not fixed tightly enough for reproducible evidence.
- **Exact correction:** Select one exact form for each identity, including container, text format, and declared fault. If multiple subvariants are required, define named mandatory sub-closures under one identity, require all of them, and specify the aggregate oracle/lock projection as explicitly as `NP-HLS-008`.

#### I6 — The HE-AAC v1/v2 row has no implementable, approved generation path

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:78-80, 169, 193, 200, 417-419, 465-479`.
- **Defect:** `NP-TS-005` is specified as synthetic HE-AAC v1/v2, but the design neither names a pinned source-build encoder capable of producing both profiles under the stated legal/tooling policy nor selects the exceptional approved-reference-vector path. The blanket no-silent-nonfree rule is correct but leaves this mandatory row unresolved.
- **Impact:** The implementation may stall, silently add nonfree tooling, substitute AAC-LC, or use an unapproved vector. Any of those either blocks the corpus or corrupts a mandatory stable ID.
- **Exact correction:** Before implementation authority is granted, identify and pin a technically capable, licence-reviewed source-build encoder and output redistribution basis, or explicitly designate exact approved reference-vector inputs with hashes, provenance, licence, and bounded repackaging. If neither is defensible, return the row to the owner rather than hiding the choice in implementation.

#### I7 — The local-live and delayed A/B state machines are not byte-level executable contracts

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:218-220, 351-368, 379-399, 659-660`.
- **Defect:** The design gives high-level state rules but no versioned event alphabet, initial state serialization, logical-time unit, request-to-transition table, simultaneous-request ordering, response/status/body mapping, end condition, or exact release event for delayed responses. “Configured delays” also sits uneasily beside the prohibition on host-scheduler timing.
- **Impact:** Two servers can expose different live windows or cancellation timing while sharing the same media bytes and nominal oracle. Cancellation reproducibility and DASH/HLS live closure validation can diverge.
- **Exact correction:** Define versioned deterministic machine specifications for HLS live, DASH live, and `NP-HLS-008-A`: state schema, event names, total transition function, ordering rules, logical clock advancement, exact response projection, bounds, terminal/error behavior, and oracle traces. Define delay as a count of explicit logical release events, not elapsed host time, unless a bounded real-time rule is deliberately approved.

#### I8 — Network shutdown is incompatible with staging and promotion

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:432-459, 492-512, 514-528, 603-605, 624`.
- **Defect:** Section 16 says network is disabled for staging verification and promotion, yet those jobs must query GitHub, upload/query draft assets, create a tag, publish a Release, and reconcile unknown API outcomes.
- **Impact:** The prescribed workflow cannot be implemented literally. An implementer must silently weaken the security rule or cannot stage/publish.
- **Exact correction:** Scope network shutdown to the untrusted acquisition/parser/generator/validator/media-handling sandbox. Define separate trusted control-plane jobs with egress restricted to the required GitHub API and asset endpoints, no proxy, bounded transfers, pinned repository identity, and no parsing/execution of media.

#### I9 — Candidate identity does not explicitly include the complete required GitHub run identity

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:283-287, 401-415, 518-529, 552-564`.
- **Defect:** The candidate manifest mentions workflow hashes and “attempt identity,” but does not explicitly require repository owner/name and numeric ID, workflow identity/path/ref, run ID, run attempt, artifact IDs/names, and the provenance subject binding as candidate fields. Those details appear later in approval, which is too late to define candidate identity.
- **Impact:** Artifacts from a different repository, workflow, rerun, or artifact object could be ambiguously represented before staging, producing incompatible validation and promotion checks.
- **Exact correction:** Enumerate all candidate identity fields in the candidate schema and its digest projection: repository textual and numeric identity, source SHA, workflow path and Git blob hash, workflow run ID, attempt number, artifact IDs/names/digests, attestation subject/issuer identity, runner/container/toolchain identity, and provenance digest. Require every later artifact to bind that exact candidate digest.

#### I10 — Signing time, key rotation, and revocation semantics are delegated rather than defined

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:532-541, 552-566, 628, 639, 644-646, 744`.
- **Defect:** A versioned policy file is named, but the design does not define trusted-time evidence, key validity interval evaluation, rotation overlap, prospective versus retroactive revocation, compromise handling, approval behavior after revocation, or which policy version verifies historical approvals. A signer-supplied time alone can be backdated.
- **Impact:** Different verifiers can disagree on whether the same owner approval is valid, especially after key compromise or rotation. This is an approval and revocation interoperability gap.
- **Exact correction:** Specify an immutable signing-policy state machine: authoritative time source/evidence, validity interval inclusivity, policy hash pinned by E/A, rotation overlap rules, revocation effective time and reason, compromise semantics, historical-verification rules, and the exact additive records that invalidate or preserve prior approvals.

#### I11 — Append-only event and absorbing-disposition contracts are incomplete

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:568-610, 612-628, 630-646`.
- **Defect:** Events are “committed or retained in the protected evidence record according to their phase,” but no durable path, retention authority, transaction/version scope, or commit rule is fixed. `REJECTED`, `QUARANTINED`, and `REVOKED` lack the actor/guard/evidence/next-state rows required of nominal states, and it is unclear whether an absorbing disposition terminates one attempt, one corpus version, or the whole corpus.
- **Impact:** Partial failures and retries can produce incompatible histories, lost pre-commit events, or accidental permanent blocking. Revocation consumers cannot rely on one canonical append-only sequence.
- **Exact correction:** Define the event schema and durable repository/Release location, transaction ID and corpus-version scope, sequence allocation, commit/retention rule, and full transition rows for all three dispositions. State exactly which new transaction/version may follow each absorbing state and how retries link without rewriting prior events.

#### I12 — Release-receipt authority is sequenced circularly

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:301-305, 603-608, 630-646, 685-687, 703-710`.
- **Defect:** Public verification is required to verify the receipt/domain hash before `RECEIPT_COMMITTED`, while the receipt becomes normative only after independent verification and commit R occurs afterward. The design does not define whether verification creates a provisional receipt, verifies an existing uncommitted receipt, or verifies R after commit.
- **Impact:** The verifier and committer can use different receipt bytes, or receipt authority can become self-confirming without a post-commit byte check.
- **Exact correction:** Define a forward-only sequence: verifier deterministically produces a provisional receipt and verification report from public facts; R commits those exact bytes; an independent post-commit check verifies R’s Git blob, public facts, and report before the receipt becomes normative. Update the state table and acceptance gates to name each artifact and hash at each step.

#### I13 — The owner signature does not explicitly bind every mutable Release field

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:291-300, 552-566, 604, 616-624, 632-642`.
- **Defect:** The approval binds a Release name, visibility, immutable setting, and generic “publication settings,” but the exact signed projection does not enumerate Release body bytes and all mutable flags/metadata. Generic wording permits schema implementations with different coverage.
- **Impact:** Public-facing metadata or settings could change without invalidating the signature even though the design claims the signature binds the complete publication transaction.
- **Exact correction:** Define an exhaustive publication projection: repository ID, numeric draft Release ID, tag and target, exact name and body UTF-8 bytes, draft/prerelease/latest/discussion-related settings where supported, immutability setting, asset IDs/names/labels/content types/sizes/hashes, and any API field promotion may mutate. Reject unknown or unsupported mutable fields.

#### I14 — Hash encoding and raw-document projections are not fully specified

- **Exact spec file and lines:** `docs/android/specs/2026-08-09-playback-corpus-design.md:255-261, 307-347, 403-415, 552-564, 632-642`.
- **Defect:** The design defines a domain prefix but does not fix serialized digest encoding, uses unqualified “SHA-256” for some inputs and domain hashes for others, and describes the complete raw Markdown SHA-256 as being under an undefined “raw-document projection.” Source, workflow, licence, asset, and evidence hashes are not each assigned an explicit raw/domain/Git-object algorithm and byte projection.
- **Impact:** Independent implementations can hash different bytes or serialize the same digest differently, breaking lock, approval, signature, and verification interoperability.
- **Exact correction:** Add a normative hash registry listing every hash field, algorithm, domain string/version where applicable, exact input-byte projection, and lowercase-hex or other fixed encoding. Define the raw Markdown hash as exactly the complete file bytes or define a separate domain-hashed projection—never both ambiguously. Distinguish Git object IDs from SHA-256 content/domain hashes.

### Minor

None.

## Commit-scope verification

**PASS.** The reviewed range contains exactly two added paths:

1. `docs/android/specs/2026-08-09-playback-corpus-design.md`
2. `docs/android/audits/phase-1/corpus-design-reviews/design-spec-self-review.md`

The range has 1,035 inserted lines and no other committed path. Unrelated modified and untracked working-tree paths existed outside this commit and were not included in the reviewed range. This review did not stage, amend, commit, tag, or modify any path other than its authorized report.

## Registry verification

**PASS for exact ID sets and decision-sheet semantic mapping; NOT YET NORMATIVE because C1 and I1 remain.**

Programmatic extraction from the specification produced:

| Registry | Required | Found | Verdict |
|---|---:|---:|---|
| Media identities | 24 | 24 | Exact set |
| Feature cases | 13 | 13 | Exact ID set; meanings incomplete in the spec |
| Lifecycle cases | 32 | 32 | Exact set and 32/32 meaning/anchor match |
| Numbered top-level sections | 30 | 30 | Present once and ordered |

The media IDs are exactly `NP-HLS-001..010`, `NP-DASH-001..004`, `NP-TS-001..005`, `NP-PROG-001..004`, and `NP-FLV-001`. The feature IDs are exactly `NP-DL-001..004`, `NP-CAST-001..003`, `NP-ERR-001..004`, and `NP-CANCEL-001..002`. Lifecycle IDs are exactly `NP-LIFE-001..032`.

The specification preserves 19 existing plus five new media identities; the four exact classes; baseline H.264 Main@L3.1 rows; High@L4.1 only in `NP-HLS-009`; Main10 in `NP-HLS-010`; capability-classed HEVC Main; HE-AAC v1/v2 in `NP-TS-005`; mandatory DASH backend switching; identity/lock-only `NP-HLS-008`; non-executing cancellation aliases; all 32 lifecycle meanings/anchors; and non-media accounting for feature/lifecycle IDs.

## Authority and reproducibility verification

**FAIL pending correction.**

The architecture correctly separates most artifact roles and generally avoids future coordinates and self-hashes. Complete closures, versioned oracles, strict registry extraction, canonical packaging, and dual-mode intent are strong. However, the unapproved authority root, content-lock timing contradiction, approval-digest ambiguity, run-varying “bit-identical” artifacts, unresolved fixture alternatives, HE-AAC generation gap, underdefined state machines, candidate identity omissions, receipt sequence, and incomplete hash registry prevent an implementation-independent reproducibility contract.

No universal bit-identical encoder claim is made, which is correct. Exact already-published bytes are intended to remain immutable, also correct.

## Security and licensing verification

**FAIL pending correction.**

The SSRF, sandbox, archive, privilege, action-pinning, cache, metadata-injection, privacy, CC0, GPL-tooling, per-row provenance, patent-caveat, and all-24-row approval requirements are substantial and directionally correct. Promotion does not execute candidate code or media. The remaining blockers are the impossible network-shutdown wording, incomplete signing-time/key-revocation contract, incomplete candidate identity, incomplete signed publication projection, and unresolved lawful HE-AAC production path.

No provider/private/tester data, credentials, unpublished media locations, or Android success claims were found in the specification.

## Workflow and state-machine verification

**FAIL pending correction.**

The separation of smoke, candidate, stage, promote, and public verification jobs is sound. Non-cancelling concurrency, numeric-ID reconciliation, query-before-retry, no published-to-draft rollback, additive revocation, and tag/publication non-atomicity are explicit. The append-only event storage/transition contract, absorbing-disposition scope, receipt authority sequence, and complete signed publication projection are not implementation-ready.

## Phase 1 sequencing verification

**CONDITIONALLY CORRECT AS A TARGET; NOT AUTHORIZED AS CURRENT NORMATIVE SEQUENCE.**

Within the specification, S → candidate → staging → E → A → T → publication → verification → R → final verification → C is recognizable, corpus and baseline tags are distinct, unrelated working-tree paths are excluded, and no Phase 2 device success is implied. The sequence still needs the content-lock and receipt corrections above. More fundamentally, it cannot be called “approved” while the decision sheet remains awaiting approval and the active plan of record still defines a different Phase 1/Phase 2 boundary.

## Implementation-plan decomposition recommendation

Do not implement this as one undifferentiated plan or one large change. Use one program with eight independently executable plans and review gates:

1. **Authority and normative integration** — obtain repository-verifiable design approval; atomically reconcile the active plan, requirements, device policy, corpus registry, and this specification. This is the dependency root.
2. **Registry, schemas, canonicalization, and hash contracts** — implement exact 24/13/32 extraction, feature meanings, immutable schemas/oracles, hash registry, JCS, and migration tests.
3. **Pinned source-build toolchain and fixture generation** — build the `linux/amd64` container, settle HE-AAC and every row recipe, generate deterministic primitives, and prove toolchain/legal inputs.
4. **Closure, oracle, local-live, and archive engine** — implement exact HLS/DASH resolvers, executable state machines, normalized probe projection, semantic oracles, canonical archive, and invalid-fixture tests.
5. **Candidate, content lock, provenance, and legal gates** — implement the corrected lock timing model, complete candidate identity, per-row licensing, archive budget, validation reports, and attestation.
6. **GitHub capability probe and read-only API adapter** — prove actual repository/plan behavior and all recovery observations without staging or publication authority.
7. **Staging, owner signature, promotion, and append-only state** — implement protected write jobs, exhaustive signed transaction projection, key policy, event/disposition state machine, concurrency, and unknown-outcome recovery.
8. **Independent public verification, receipt, revocation, and fault injection** — implement the corrected provisional-receipt/R/post-commit sequence, public byte checks, revocation discovery, and end-to-end failure tests.

Dependency order is 1 → 2 → 3 → 4 → 5; plan 6 may begin after 2 and must pass before 7; plan 7 depends on 5 and 6; plan 8 depends on 7. Each plan should end with an independent Critical/Important review before its outputs become inputs to the next trust boundary. This decomposition is scope management, not itself a design defect.

## Prior-review-class resolution

The prior decision-sheet review classes were checked directly rather than inherited:

- The formerly unenumerated/drifted lifecycle registry is resolved: all 32 lifecycle IDs, meanings, and anchors match.
- The former `NP-HLS-008` media/behavior collapse is resolved: A/B identity and closure obligations are separate from runtime cancellation.
- The cancellation duplicate-execution ambiguity is resolved: `NP-CANCEL-001/002` are non-executing aliases of `NP-LIFE-031/032`.
- The 19/5 origin split and four-value class vocabulary are preserved.
- The former `NP-TS-004` cosmetic cross-reference is not carried into the specification’s fixture description as the same ambiguity.

The self-review’s “no unresolved findings” conclusion is not sustained. It did not reconcile the asserted approval against the still-awaiting decision record or the active normative documents, and it did not identify the authority, reproducibility, workflow, and recovery gaps listed above.

## File and Git facts

- Reviewed specification: 841 physical lines.
- Reviewed self-review: 194 physical lines.
- Reviewed commit range: two added files, 1,035 inserted lines.
- Commit-scope verdict: exact authorized committed scope for the specification task.
- Initial working tree contained pre-existing modified and untracked paths outside this review report.
- This task created or overwrote only `docs/android/audits/phase-1/corpus-design-reviews/design-spec-independent-review.md`.
- No Git index, tag, commit, Release, workflow, media, source, test, plan, normative document, specification, or self-review was modified by this review.

## Assessment

The committed design is unusually thorough and has strong registry fidelity, privacy boundaries, supply-chain controls, legal caveats, artifact separation, and non-claim discipline. It is not ready for owner review as an approved implementation authority because its claimed approval conflicts with the repository’s authority record and current normative documents. Fourteen additional implementation-significant ambiguities affect feature semantics, lock ordering, hash/signature projections, reproducibility classes, mandatory fixture generation, deterministic state machines, network isolation, candidate identity, key policy, event durability, receipt authority, and publication binding.

Critical = 1. Important = 14. Minor = 0.

Ready for owner review: NO