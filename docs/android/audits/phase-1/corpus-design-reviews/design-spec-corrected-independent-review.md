# Corrected playback-corpus design — final independent review

## Metadata

| Field | Value |
|---|---|
| Review date | 2026-08-10 |
| Reviewer role | Final independent reviewer; did not author or correct the specification; no owner, normative, implementation, publication, or Phase 1 closure authority |
| Initial design commit | `3cfa188a3acaabf9163b5a9474f5f8af0fb2e55c` |
| Corrected design commit | `4743b2ee77b6f8ff65af01193b653bda57670d47` |
| Corrected commit parent | `3cfa188a3acaabf9163b5a9474f5f8af0fb2e55c` |
| Corrected commit subject | `docs(android): correct playback corpus authority contracts` |
| Corrected specification | `docs/android/specs/2026-08-09-playback-corpus-design.md` |
| Triggering review | `docs/android/audits/phase-1/corpus-design-reviews/design-spec-independent-review.md` |
| Correction self-review | `docs/android/audits/phase-1/corpus-design-reviews/design-spec-correction-self-review.md` |
| Other reviewed authority inputs | Approved decision sheet and final review; current Android requirements, device policy, corpus document, and plan v3 |
| Method | Full-document review, committed-range inspection, raw-byte and Git-object verification, exact-ID extraction and semantic comparison, adversarial authority/hash/workflow/state review, and independent decomposition review |
| Finding totals | Critical: 0; Important: 6; Minor: 0 |
| Review effect | This report does not approve the design, create the future design-approval record, integrate normative files, authorize implementation/publication, or close Phase 1 |

## Strengths

- The correction now distinguishes interactive owner approval, final written-spec approval, repository normative integration, and later per-candidate redistribution approval (`docs/android/specs/2026-08-09-playback-corpus-design.md:8-20, 66-69, 929-944, 1008`).
- The future committed design-approval record has a fixed path and required bindings, while the specification correctly says that record does not yet exist (`docs/android/specs/2026-08-09-playback-corpus-design.md:15, 18, 931-940`).
- The exact 24 media, 13 feature, and 32 lifecycle sets match the approved decision target. All 13 feature rows now state meaning, references, execution owner, pass/fail rule, and alias behavior (`docs/android/specs/2026-08-09-playback-corpus-design.md:214-232`).
- Candidate bytes and a non-authoritative proposed lock are generated together; E later copies the validated lock bytes and gives that transaction its normative content identity (`docs/android/specs/2026-08-09-playback-corpus-design.md:30-36, 99-110, 309-313, 841-845, 859-864`).
- The approval object expressly has no self-hash. External `approvalDigest` is defined over the exact signed JCS bytes (`docs/android/specs/2026-08-09-playback-corpus-design.md:327-331, 373-383, 436, 669-690`).
- `NP-HLS-007` is one mandatory A/B/C compound fixture, `NP-PROG-004` is one progressive MP4 with embedded `tx3g`/`mov_text`, and `NP-TS-005` has a pinned source-built libfdk-aac path separated from redistribution approval (`docs/android/specs/2026-08-09-playback-corpus-design.md:189, 201, 205, 208-212`).
- Network shutdown is now limited to untrusted media sandboxes, while trusted control-plane jobs receive restricted GitHub egress and never parse media (`docs/android/specs/2026-08-09-playback-corpus-design.md:567-596`).
- Candidate identity binds complete repository, workflow, run/attempt, artifact, attestation, runner, OCI, toolchain, and evidence identity (`docs/android/specs/2026-08-09-playback-corpus-design.md:315-319`).
- Receipt authority now moves forward through proposal, R byte-copy, and independent post-commit verification (`docs/android/specs/2026-08-09-playback-corpus-design.md:333-337, 759-763, 847-848, 866-868`).
- The signed Release projection is substantially exhaustive and forbids unapproved asset or metadata mutation (`docs/android/specs/2026-08-09-playback-corpus-design.md:692-709`).
- Device/product non-claims are explicit and repeated at generation, validation, verification, testing, and acceptance boundaries (`docs/android/specs/2026-08-09-playback-corpus-design.md:22, 50-64, 179, 216, 456, 482, 809, 829, 877-892`).
- Supply-chain, privacy, archive, provenance, licensing, and unknown-outcome controls are strong and appropriately fail closed (`docs/android/specs/2026-08-09-playback-corpus-design.md:556-649, 773-809`).

## Issues

### Critical

None.

### Important

#### I-A — Reproducibility artifact classes and equivalence projections are not exhaustive

- **Exact current references:** `docs/android/specs/2026-08-09-playback-corpus-design.md:337, 339-361, 391-419, 538-554`.
- **Defect:** Section 11.6 establishes useful deterministic-content and run-specific-evidence classes, but its claim that the deterministic projections are exhaustive is not true. Authoritative acquired source inputs, the source/toolchain lock, container definition, workflow blobs, signing/promotion policy artifacts, lock-listed objects, closure projections, canonical traces, policy-history records, revocation records/signatures, and the deterministic proposed receipt are named elsewhere without an explicit one-class assignment and exact equivalence projection here. The Release receipt is classified as run-specific even though the proposed receipt is required to contain stable facts and be copied byte-for-byte into R. The candidate stable projection also excludes run/attempt and numeric artifact IDs while those are identity-critical candidate fields; line 361 does not resolve which identity rule controls.
- **Impact:** Two implementations can disagree about what must rebuild bit-identically, what may vary, and which run identity must remain in an equivalence comparison. A green reproducibility check can therefore compare different projections or omit an authority-bearing input.
- **Exact correction:** Replace Section 11.6 with a closed artifact registry. Assign every named input/output/signature/record to exactly one of `deterministic-control`, `deterministic-public-fact`, or `run-evidence`; give every row an exact full-byte or JCS projection and permitted exclusions; classify proposed/committed receipt bytes explicitly; and state that candidate equivalence never excludes repository, workflow run/attempt, numeric artifact IDs, or attestation subject identity when the candidate identity is being compared.

#### I-B — The three executable media machines remain non-total at byte level

- **Exact current references:** `docs/android/specs/2026-08-09-playback-corpus-design.md:496-534`.
- **Defect:** The correction provides extensive state-machine detail but leaves independently observable branches ambiguous. Validation precedence places the pending bound before availability (`:504`), while the transition table applies `PENDING_LIMIT` only to an available queued request (`:515`); an unavailable request at a full queue therefore has competing `PENDING_LIMIT` and 404 outcomes. A naturally terminal delay machine can retain pending requests, so the same precedence can also conflict with terminal 410/404 rows (`:520-528`). The exact empty response-body bytes represented by `bodyObjectSha256` are not fixed (`:504, 516-518, 525-527, 532`). The delay recipe's `releaseAfter` values are used in state and transitions without an explicit integer domain and enqueue projection (`:519, 521, 530`). These gaps affect complete trace bytes and hashes.
- **Impact:** Correct implementations can emit different status codes, state hashes, response hashes, and canonical traces for the same valid input. That defeats the implementation-independent machine contract required by original I7.
- **Exact correction:** Define pending-capacity checking only after a request is established as nonterminal, available, queued, and insertion-requiring; state that terminal/unavailable requests never test queue capacity. Define the exact zero-length body as an empty byte string and give its fixed raw SHA-256, or lock-list a uniquely named empty object. Require `releaseAfter` to be a bounded positive integer, define the exact pending-entry strict schema, and add conformance traces for full-queue unavailable, full-queue terminal, natural terminal with pending entries, zero/maximum release delay, and every precedence collision.

#### I-C — Signing-policy rotation and revocation still lack a complete deterministic trust state

- **Exact current references:** `docs/android/specs/2026-08-09-playback-corpus-design.md:669-715`.
- **Defect:** The design correctly makes signer time informational and adds policy/revocation chains, but it does not define the immutable trust anchor for policy sequence zero. It requires every policy transition to be authorized by a preceding policy without defining how the genesis policy is authenticated (`:713`). Because approval authorization is E-bound and `signedAt` cannot authorize, the rule that retirement blocks “new approvals under later policies” does not decide whether a retired key may create A after retirement for an older unapproved E whose bound policy still marked it active (`:674, 680, 711-713`). Revocation objects simultaneously name a revoked key, approval digests, policy range, Release IDs, receipt digests, and corpus scope without defining whether nonempty selectors are unioned, intersected, or independently revoking (`:715`). Current verification therefore has no total scope-matching rule.
- **Impact:** Verifiers can disagree on policy-chain validity, retirement cutover, and whether an approval/Release/receipt is revoked. A retired or compromised key may retain an unintended approval path.
- **Exact correction:** Bind policy sequence zero by raw hash and owner trust statement in the written design-approval/Plan 1 authority root. Require A to validate against both the E-bound policy and the highest valid policy at A's parent, with an explicit sequence-based retirement rule independent of wall time. Define revocation selector semantics as a strict predicate, including required/optional emptiness, union/intersection behavior, corpus-version matching, key-wide versus object-specific scope, and test vectors for every selector combination.

#### I-D — Event production cannot satisfy the promised byte-for-byte append chain

- **Exact current references:** `docs/android/specs/2026-08-09-playback-corpus-design.md:680-688, 717-723, 750-771, 844-848, 863-868`.
- **Defect:** Sequence and `priorEventDigest` are members of exact event JCS and are atomically allocated by the protected committing workflow (`:719-721`), but promotion and verification are required to produce events that R later imports byte-for-byte (`:723`). Those producers cannot know the final global sequence or prior digest if any incident/disposition commit advances the chain before R. No reservation, compare-and-swap, exclusive lease, stale-proposal rejection, or commit-time finalization rule exists. In addition, pre-E `REJECTED`/`QUARANTINED` events can be required before an E-bound policy exists, while their authority is defined by that E-bound policy (`:723, 767-768`).
- **Impact:** Valid concurrent or recovery activity can make event bytes stale, break the digest chain, or force a committing workflow either to rewrite supposedly immutable proposed events or import invalid sequence values. Pre-E incident authority is circular.
- **Exact correction:** Make producers emit strict event proposals that exclude sequence, prior digest, and final event digest. The path-limited committing workflow must compare the current chain tip, allocate sequence, inject the prior digest, finalize JCS, and commit atomically; stale proposals must retry without mutating prior history. Alternatively define a repository-backed reservation protocol with expiry and CAS semantics. Bind pre-E incident authority to an S-bound incident policy; switch to the E-bound policy only after E exists.

#### I-E — The hash registry is not yet a total interoperability registry

- **Exact current references:** `docs/android/specs/2026-08-09-playback-corpus-design.md:337, 373-436, 438-450`.
- **Defect:** Most fields now have exact algorithms and encodings, and Git/OCI/attestation identities are correctly distinguished. Two implementation-significant gaps remain. First, `closureHash` sorts only by normalized path and role (`:384, 438`), while valid tuples may share path and role but differ by byte range (`:450`); this is not a total order. Second, receipt sequencing requires verification of an unnamed “proposed-receipt hash” (`:337`) without saying whether that value is `receiptDigest`, a raw file hash, or a new field. This contradicts the prohibition on generic hash terminology (`:434`).
- **Impact:** Identical valid closures can obtain different hashes, and R/post-commit verifiers can bind different receipt-byte projections.
- **Exact correction:** Define closure tuple order as normalized path UTF-8 bytes, fixed role-enum order, full-object before ranged object, then numeric byte-range offset and length; reject any remaining duplicate. Replace “proposed-receipt hash” with the exact registered field. If both semantic JCS and byte-copy identity are required, retain `receiptDigest` and add a separately named `receiptRawSha256` with exact raw-file bytes and lowercase-hex encoding.

#### I-F — The implementation boundary still collapses the required eight review gates into one seven-workstream plan

- **Exact current references:** `docs/android/specs/2026-08-09-playback-corpus-design.md:18-20, 283-303, 833-875, 913-927`.
- **Defect:** The authority and acceptance sections make Plan 1 a prerequisite, but Section 29 says the design is focused enough for one implementation plan and enumerates seven workstreams beginning with registry/schema work. It omits authority/normative integration as its own first plan and combines the capability probe, API adapter, workflows, and attestations. This conflicts with the initial independent review's eight-plan trust-boundary decomposition and with the corrected design's own “Plan 1 before tooling” rule.
- **Impact:** A future planner can legitimately produce one oversized plan, start schema/tooling before the authority checkpoint, or couple a read-only capability decision to privileged workflow implementation. Independent rejection and rollback boundaries are lost.
- **Exact correction:** Replace Section 29's one-plan/seven-workstream statement with the exact eight-plan decomposition in this report. State dependencies and green review artifacts for each plan, and prohibit a later plan from beginning before all required predecessor Critical/Important findings are zero.

### Minor

None.

## C1 and I1-I14 resolution matrix

| Finding | Result | Exact current specification evidence and reasoning |
|---|---|---|
| C1 — approval and normative authority | **RESOLVED** | Lines `8-20` distinguish interactive approval, pending final written approval, and pending Plan 1 integration; lines `15, 18, 931-940` define the future committed approval record; lines `44, 68-69, 99, 285-303, 837, 855-873, 1008` keep the 24/13/32 target non-normative until integration. Written-spec approval is separate from candidate redistribution approval at `20`. Current untracked normative inputs remain a Plan 1 prerequisite, not authority granted by this design. |
| I1 — feature meanings and references | **RESOLVED** | Lines `214-232` provide all 13 IDs with exact meanings, media/feature references, execution owner, pass/fail rule, and alias behavior. Lines `958-967` preserve the exact set and cancellation non-execution rule. |
| I2 — lock timing | **RESOLVED** | Lines `31, 101-110, 256-281, 309-313, 841, 844, 859-864` consistently use candidate-produced non-authoritative proposed lock, staging validation, E byte-copy, then approval. S has no future-byte content lock. |
| I3 — approval self-hash | **RESOLVED** | Lines `329, 382, 436, 669-690` prohibit approval self-hash and define external `approvalDigest` over exact signed JCS bytes. |
| I4 — control artifacts versus run evidence | **PARTIALLY RESOLVED** | Lines `339-361` create the two required classes and stable projections, but omit multiple named authority/control artifacts and do not reconcile proposed-receipt determinism or candidate identity exclusions. See I-A. |
| I5 — exact HLS-007 and PROG-004 fixture form | **RESOLVED** | Lines `189, 205, 208` require all HLS-007 A/B/C sub-closures and one exact progressive ISO BMFF MP4 with embedded `tx3g`/`mov_text`; no surrogate alternative remains. |
| I6 — HE-AAC generation/legal path | **RESOLVED** | Lines `201, 210-212, 600-627` pin libfdk-aac v2.0.3 and FFmpeg n7.1.1, source/commit/archive checks and nonfree configuration, prohibit distribution/substitution, separate tool legality from encoded-byte redistribution, and return failure to owner decision. |
| I7 — executable live/delay machines | **PARTIALLY RESOLVED** | Lines `496-534` add machine IDs, state, alphabet, ordering, transitions, logical events, responses, bounds, and traces. Queue/availability precedence, terminal pending behavior, empty response bytes, and delay-entry types remain ambiguous. See I-B. |
| I8 — network shutdown scope | **RESOLVED** | Lines `567-596` limit shutdown to untrusted media sandboxes and separately authorize bounded, pinned GitHub egress for trusted stage/promote/verify jobs that never parse media. |
| I9 — complete candidate identity | **RESOLVED** | Lines `315-319` enumerate server, repository textual/numeric identity, source/ref, workflow path/blob, run/attempt, artifact IDs/names/sizes/digests, attestation, runner, OCI, toolchain, policy, lock/archive/report/evidence, and transaction identity; later objects bind `candidateDigest`. |
| I10 — key rotation/revocation semantics | **PARTIALLY RESOLVED** | Lines `669-715` address informational time, E-bound policy, monotonic policy/revocation chains, overlap, retirement, compromise, current and historical verification. Genesis trust, retirement cutover for old E, and revocation selector semantics remain incomplete. See I-C. |
| I11 — event/disposition protocol | **PARTIALLY RESOLVED** | Lines `717-771` add durable location, per-version sequence, attempt scope, exact fields, retry links, and absorbing dispositions. Commit-time sequence allocation conflicts with byte-for-byte import of pre-produced events, and pre-E incident authority is circular. See I-D. |
| I12 — receipt circularity | **RESOLVED** | Lines `333-337, 759-763, 847-848, 866-868` define proposed receipt plus report, R exact-byte copy, then independent post-commit Git-blob/public-fact verification before normative authority. |
| I13 — owner signature over mutable Release fields | **RESOLVED** | Lines `692-709` bind repository/draft IDs, exact tag annotation/target, exact name/body, all listed flags, discussion category, every asset field/hash, promotion patch, public/immutable state, and unknown/new mutable-field rejection. |
| I14 — exact hash contracts | **PARTIALLY RESOLVED** | Lines `363-436` now define algorithms, domains, input projections, encodings, raw/Git/OCI/attestation distinctions, and no-self-hash rules. Closure ordering and proposed-receipt hash identity remain ambiguous. See I-E. |

**Resolution result:** C1, I1, I2, I3, I5, I6, I8, I9, I12, and I13 are RESOLVED. I4, I7, I10, I11, and I14 are PARTIALLY RESOLVED. No original finding is wholly UNRESOLVED.

## Commit-scope and file-integrity verification

**Verdict: PASS WITH AN EVIDENTIARY LIMITATION.**

`4743b2e` is a direct child of `3cfa188` and changes exactly three paths:

| Status | Path | Corrected-commit Git blob |
|---|---|---|
| `M` | `docs/android/specs/2026-08-09-playback-corpus-design.md` | `e2c5ca4d45faca29a36110190ab340e1fc3bbdfe` |
| `A` | `docs/android/audits/phase-1/corpus-design-reviews/design-spec-correction-self-review.md` | `feaa92856484e01af5e04689c168c7f786f7e894` |
| `A` | `docs/android/audits/phase-1/corpus-design-reviews/design-spec-independent-review.md` | `f18aed011bfa66273915d30108df6c7434b5258c` |

The corrected commit contains no fourth path. Its numeric diff is:

- correction self-review: 103 additions, 0 deletions;
- initial independent review: 245 additions, 0 deletions;
- corrected specification: 262 additions, 95 deletions.

The initial design commit contains only the old specification blob among these three paths:

- old specification blob: `f6454f924eed558d96098dff386fa07a2244b16d`;
- old specification raw SHA-256: `f45babb3999810612c17f56e1d844d85aa4a7215784716980b656e91bdf5bcce`;
- old specification: 69,685 bytes, 841 physical lines, valid UTF-8 without BOM, zero CRLF/bare-CR sequences, no final LF.

Corrected committed/current-byte facts:

| Path | Raw SHA-256 | Bytes | Lines | UTF-8/BOM | Line endings | Final LF |
|---|---|---:|---:|---|---|---|
| corrected specification | `2d5a2c76b86f092651a6985513fff4b5b3cb5252d9d51fe04bf410e48caab396` | 107,348 | 1,008 | valid / none | LF-only; 0 CRLF, 0 bare CR | yes |
| initial independent review | `048d64471aea3f3c923e2f83b936e02641f926809b031bdab74d845386f077c0` | 30,208 | 245 | valid / none | LF-only; 0 CRLF, 0 bare CR | no |
| correction self-review | `1c48a3642bf2fba71c7f6daa753aa63fd180e83da5a216e544b6e3ec5ac46f8d` | 7,637 | 103 | valid / none | LF-only; 0 CRLF, 0 bare CR | no |

The three committed blobs matched the index and working-tree bytes before this report was created. The unrelated modified/untracked working-tree paths observed before review were preserved and were not staged or changed by this task.

The limitation is precise: the initial independent-review path is absent from parent `3cfa188` and first appears as an added blob in `4743b2e`. Git therefore proves that its committed bytes are intact now, but cannot independently prove “unchanged” relative to an earlier committed version of that report. Its own lines `229-237` say it was created after reviewing `3cfa188`, which is consistent with this history.

## Registry verification

**Verdict: PASS — exact 24/13/32 target sets and approved meanings; still non-normative pending written approval and Plan 1.**

Programmatic exact-set comparison found no missing, extra, duplicate, or silently renamed ID between the corrected specification and approved decision target.

### Media IDs — exact set of 24

- HLS: `NP-HLS-001` through `NP-HLS-010`.
- DASH: `NP-DASH-001` through `NP-DASH-004`.
- MPEG-TS: `NP-TS-001` through `NP-TS-005`.
- Progressive: `NP-PROG-001` through `NP-PROG-004`.
- FLV: `NP-FLV-001`.

The 19-existing/5-new split is preserved, with the five new IDs exactly `NP-HLS-009`, `NP-HLS-010`, `NP-TS-005`, `NP-PROG-004`, and `NP-FLV-001` (`docs/android/specs/2026-08-09-playback-corpus-design.md:164-177, 946-956`). The class distribution is exactly 16 `pass`, 2 `capability-classed`, 2 `best-effort, clean-failure`, and 4 `clean-fail` (`:168-206`).

### Feature IDs — exact set of 13

- Download: `NP-DL-001` through `NP-DL-004`.
- Cast: `NP-CAST-001` through `NP-CAST-003`.
- Errors: `NP-ERR-001` through `NP-ERR-004`.
- Cancellation: `NP-CANCEL-001`, `NP-CANCEL-002`.

All meanings, media/feature references, owners, and pass bars are explicit at lines `214-232`. Cancellation aliases remain non-executing: `NP-CANCEL-001` consumes only `NP-LIFE-031`; `NP-CANCEL-002` consumes only `NP-LIFE-032` (`:231-232, 958-967`).

### Lifecycle IDs — exact set of 32

The set is exactly `NP-LIFE-001` through `NP-LIFE-032`. All 32 meanings and anchors match the approved decision target at lines `969-1006`; plus-anchors require separate results, `NP-LIFE-030` has no media anchor, and `NP-LIFE-031/032` anchor to `NP-HLS-008`.

The current `docs/android/playback-corpus.md` remains the old 19-media normative source and does not yet contain the 24/13/32 machine registry. That is disclosed, not silently changed (`docs/android/specs/2026-08-09-playback-corpus-design.md:99, 283-303, 938-941`). Plan 1 must reconcile current requirements, device policy, corpus document, active plan v3, baseline wording, and decision statuses atomically.

## Authority and reproducibility verification

**Verdict: WITH FIXES.**

Authority direction is no longer circular at the design-approval or content-lock level:

`interactive input -> final written design approval record -> Plan 1 normative integration -> S -> candidate + proposed lock -> staging -> E + normative lock -> A -> T/publication -> proposed receipt -> R -> post-commit verification`.

The corrected specification does not grant itself normative registry authority, does not treat interactive approval as repository-verifiable written approval, and does not confuse written design approval with per-candidate redistribution approval (`docs/android/specs/2026-08-09-playback-corpus-design.md:8-20, 95-112, 929-944`).

The currently untracked requirements/device/corpus/decision/plan documents are not silently imported into `4743b2e`; their reconciliation is intentionally deferred to Plan 1. No generator/tooling implementation is authorized before that transaction (`:18-20, 295-303, 837, 855-864, 1008`).

Reproducibility remains short of approval because the artifact-class registry is not exhaustive, machine traces are not total for all valid states, and closure/receipt hashing still admits divergent projections (I-A, I-B, I-E).

## Security, licensing, and workflow verification

**Verdict: WITH FIXES.**

Verified controls include:

- exceptional allowlisted acquisition with redirect/proxy/IP/DNS-rebinding/size/hash controls (`docs/android/specs/2026-08-09-playback-corpus-design.md:567-580`);
- rootless bounded media sandboxes and trusted GitHub-only control planes (`:580-596`);
- no provider/private/tester/device/personal/credential/DRM/real-IPTV material (`:598`);
- source/tool/output/legal separation, complete 24-row provenance gate, and no legal-clearance overclaim (`:600-627`);
- mandatory actual-plan GitHub capability probe and no silent hosting/privilege fallback (`:629-649`);
- separate candidate, staging, promotion, and verification jobs, non-cancelling concurrency, and independent privileged revalidation (`:651-665`);
- complete candidate and Release transaction identity (`:315-319, 692-709`);
- no Android/device/product-success claim (`:877-892`).

`NP-TS-005` is technically pinned and legally separated, but remains correctly publication-blocked if its encoded-output redistribution basis cannot be recorded (`:210, 614-627, 840`).

Security/workflow approval is withheld because the signing-policy genesis/retirement/revocation predicate is incomplete and the event import protocol cannot safely finalize concurrent append-only history (I-C, I-D). No impossible assumption about draft privacy or immutable publication is accepted; the capability probe must stop and return to the owner if actual GitHub behavior differs (`:631-649`).

## State-machine and sequencing verification

**Verdict: WITH FIXES.**

The corrected high-level sequence is forward-only and removes the original receipt circularity. It distinguishes S, proposed lock, E, A, T, publication, proposed receipt, R, post-commit receipt verification, closure review, and C (`docs/android/specs/2026-08-09-playback-corpus-design.md:833-875`).

The append-only state model now defines:

- one durable per-version event directory;
- contiguous sequence and prior-event digest;
- strict event fields;
- transaction and attempt identity;
- nominal states;
- `REJECTED`, `QUARANTINED`, and `REVOKED`;
- attempt-versus-version absorbing scope;
- retry with new IDs and continued global sequence (`:717-771`).

It is not yet executable under concurrency because final sequence fields cannot be known by an event producer before the committing workflow locks the chain tip. Pre-E incident authority also cannot depend on E. These are implementation blockers described in I-D.

The media-machine definitions are substantially stronger than the initial design but still need the precedence/body/delay corrections in I-B before canonical traces can be implementation-independent.

## Implementation-plan decomposition

**Verdict: THE EIGHT-PLAN DECOMPOSITION IS REQUIRED AND SUFFICIENT WITH THE DEPENDENCIES BELOW; SECTION 29 MUST BE CORRECTED.**

1. **Authority and normative integration.**
   - Inputs: final written design approval record binding exact corrected commit/blob/raw hash.
   - Work: atomically reconcile active plan v3, requirements, device policy, corpus registry, baseline wording, and decision statuses.
   - Green checkpoint: fresh-clone authority graph has one normative 24/13/32 root, exact document hashes, no competing 19-row claim, and independent zero-Critical/Important review.
   - Dependencies: none; mandatory root.

2. **Registry, schema, canonicalization, and hash contracts.**
   - Inputs: Plan 1 authority root.
   - Work: strict registry extraction, 24/13/32 schemas, artifact schemas, JCS, closed artifact classes, complete hash registry, event proposal/finalization schema, and machine schemas.
   - Green checkpoint: schema/hash golden vectors and migration tests pass; independent review finds no projection ambiguity.
   - Dependencies: Plan 1.

3. **Pinned toolchain and generation.**
   - Inputs: Plan 2 contracts.
   - Work: source-build container, source locks, libfdk/FFmpeg/x264/x265 capability checks, primitives, recipes, fixture generation, and deterministic controls.
   - Green checkpoint: tiny and full non-publishing generation tests, toolchain/legal-input evidence, and deterministic-control rebuild pass.
   - Dependencies: Plan 2.

4. **Closures, oracles, archive, and executable replay machines.**
   - Inputs: Plan 2 schemas; stable recipe/object interfaces from Plan 3.
   - Work: HLS/DASH resolvers, corrected total live/delay machines, semantic oracles, canonical archive, invalid fixtures, and bounds.
   - Green checkpoint: golden closures/traces/archive, all A/B/C faults, subtitle/audio checks, and adversarial archive tests pass.
   - Dependencies: Plan 2; may develop in parallel with Plan 3 against fixtures, but cannot finish green until Plan 3 outputs pass.

5. **Candidate, proposed-lock, provenance, and legal gates.**
   - Inputs: Plans 2, 3, and 4.
   - Work: candidate manifest, complete GitHub identity, proposed lock, validation reports, attestations, per-row licence/provenance and archive budgets.
   - Green checkpoint: a protected non-publishing candidate validates all 24 rows and fails closed on any legal/provenance gap.
   - Dependencies: Plans 2-4.

6. **GitHub capability probe and read-only API adapter.**
   - Inputs: Plan 1 repository authority and Plan 2 API schemas.
   - Work: actual-plan capability tests, numeric identity collection, draft/public/immutable behavior, environment/reviewer behavior, artifact and attestation probes, query-before-retry adapter.
   - Green checkpoint: signed/committed probe evidence with no staging/publication mutation in the production repository and independent capability review.
   - Dependencies: Plans 1-2; may run in parallel with Plans 3-5; must finish before Plan 7.

7. **Staging, signing, promotion, and append-only state.**
   - Inputs: Plans 5 and 6.
   - Work: staging, E, corrected policy genesis/rotation/revocation semantics, A, event proposal/finalization, protected promotion, concurrency and recovery.
   - Green checkpoint: protected test-repository fault injection proves exact staging identity, signature binding, no stale-event import, no blind retry, and no unauthorized mutation.
   - Dependencies: Plans 5 and 6.

8. **Public verification, receipt, revocation, and closure integration.**
   - Inputs: Plan 7.
   - Work: independent public verification, exact proposed receipt hash, R, post-commit verification, current revocation discovery, published-failure handling, and end-to-end fault injection.
   - Green checkpoint: public facts reproduce exact receipt/asset hashes; revocation tests fail closed; independent zero-Critical/Important review permits handoff to the broader Phase 1 closure process.
   - Dependencies: Plan 7.

Exact dependency order is `1 -> 2`; then `3` and `4` may partially overlap, but both must be green before `5`; `6` may run after `2` in parallel with `3-5`; `7` requires both `5` and `6`; `8` requires `7`. Each plan can and must end at a green independently reviewed checkpoint. Plan 8 cannot itself close Phase 1 because non-corpus obligations remain external (`docs/android/specs/2026-08-09-playback-corpus-design.md:849, 862-873, 890`).

## File and Git facts

- HEAD reviewed: `4743b2ee77b6f8ff65af01193b653bda57670d47`.
- Parent reviewed: `3cfa188a3acaabf9163b5a9474f5f8af0fb2e55c`.
- Corrected commit scope: exactly three paths; no workflow, media, implementation, normative registry, requirements, device policy, plan, tag, or Release path was committed.
- Corrected specification: 1,008 physical lines.
- Initial independent review: 245 physical lines.
- Correction self-review: 103 physical lines.
- All three are valid UTF-8 without BOM and contain no CRLF or bare CR. The specification has a final LF; both committed review files do not.
- The corrected specification's committed blob/raw hash/current bytes matched before report creation.
- The initial independent review is an added path in `4743b2e`, not a path present in `3cfa188`; “unchanged” cannot be established against a prior Git blob.
- Pre-existing unrelated modified and untracked working-tree paths were observed before review and preserved.
- This review created only `docs/android/audits/phase-1/corpus-design-reviews/design-spec-corrected-independent-review.md`.
- This review did not modify the corrected specification, either earlier review, decision sheet, requirements, device policy, corpus document, plan, source, workflow, media, test, Git index, commit, tag, or Release.

## Assessment

The corrected design resolves the authority overclaim, feature registry, proposed-lock timing, approval self-hash, fixture alternatives, HE-AAC path, network scope, candidate identity, receipt sequencing, and signed Release projection. Its 24/13/32 registry target is exact, its legal/privacy/non-claim posture is disciplined, and its architecture is substantially closer to an implementation-independent contract.

It is not ready for written owner approval because six Important defects remain. The blockers are not requests for implementation detail: they affect exact reproducibility classes, byte-level state-machine outcomes, cryptographic trust and revocation, append-only event finalization, hash interoperability, and the required review-gated plan boundaries. The correction self-review's assertion that every C1/I1-I14 finding is resolved is therefore not sustained.

Critical = 0. Important = 6. Minor = 0.

Ready for written owner approval: WITH FIXES