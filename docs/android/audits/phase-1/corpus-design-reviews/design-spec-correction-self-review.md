# Reproducible playback corpus design correction — self-review

## Metadata

| Field | Value |
|---|---|
| Review date | 2026-08-10 |
| Corrected specification | `docs/android/specs/2026-08-09-playback-corpus-design.md` |
| Triggering review | `docs/android/audits/phase-1/corpus-design-reviews/design-spec-independent-review.md` |
| Scope | C1 and I1–I14 |
| Authority | Self-review only; no owner, normative, implementation, publication, or Phase 1 closure authority |

## Resolution matrix

| Finding | Status | Corrected specification locations | Verification |
|---|---|---|---|
| C1 — approval and authority | RESOLVED | §§1, 3–5, 10, 25–26, 30 | Distinguishes interactive approval, pending written approval, and pending normative integration; defines future approval record; keeps Phase 1 OPEN |
| I1 — exact feature registry | RESOLVED | §7.1 and §30 | All 13 IDs have meaning, references, execution owner, pass/fail rule, and alias behavior |
| I2 — content-lock timing | RESOLVED | §§2, 5, 9, 11.1, 25–26 | Candidate-produced proposed lock; E copies exact bytes and makes content identity normative |
| I3 — approval self-hash | RESOLVED | §§12, 20, 22 | Approval contains no own digest; external `approvalDigest` hashes exact signed JCS bytes |
| I4 — reproducibility classes | RESOLVED | §§4, 11.6, 15 | Exhaustive deterministic-content and run-specific-evidence classes with stable projections |
| I5 — fixture alternatives | RESOLVED | §7 and §13 | Mandatory HLS-007 A/B/C bundle and exact progressive MP4 `tx3g`/`mov_text` PROG-004 |
| I6 — HE-AAC path | RESOLVED | §§7, 17 | Pinned source-built unpublished `libfdk-aac`, nonfree FFmpeg configuration, non-distribution, and owner return path |
| I7 — executable state machines | RESOLVED | §14 | Three versioned machines define initial state, alphabet, normalization, transitions, logical clock, ordering, responses, bounds, traces, and logical release |
| I8 — network scope | RESOLVED | §16 | Shutdown limited to untrusted media sandboxes; trusted GitHub control plane has restricted egress and no media parsing |
| I9 — candidate identity | RESOLVED | §11.2 | Complete GitHub repository/run/artifact/attestation/runner/OCI/toolchain/evidence identity; later objects bind `candidateDigest` |
| I10 — key rotation/revocation | RESOLVED | §20 | Informational signer time, E-bound policy, monotonic sequence, overlap, retirement, additive revocation, compromise, and historical verification |
| I11 — events/dispositions | RESOLVED | §§6, 21 | Durable path, canonical names, import/append rules, complete event fields, disposition guards/evidence/scope/successors |
| I12 — receipt circularity | RESOLVED | §§5, 11.5, 21, 25–26 | Proposed receipt → R byte copy → independent Git-blob verification → `RECEIPT_VERIFIED` |
| I13 — signed Release projection | RESOLVED | §20 | Exhaustive tag, title/body, flags, explicit `make_latest`, immutability, assets, mutable API fields, unknown-field rejection |
| I14 — hash registry | RESOLVED | §12 | Field-by-field algorithm/domain/input/serialization/output rules; raw Markdown hashes; Git/OCI/attestation distinctions |

## Authority-status verification

PASS.

1. **Interactive owner approval:** the specification records that all 17 decisions and all four design sections were approved in conversation.
2. **Written-spec approval:** explicitly pending final owner review after correction.
3. **Repository normative authority:** explicitly pending a dedicated committed design-approval record and Plan 1 atomic integration.
4. The future approval record is defined but not created. It must bind the corrected design commit SHA, design Git blob ID and raw SHA-256, owner identity and statement, date, 17-decision reference, planning authority, and the fact that Plan 1 integration remains incomplete.
5. Written-spec approval and per-candidate redistribution approval are separate acts.
6. The current `docs/android/playback-corpus.md` is not represented as already containing or approving 24/13/32.
7. Phase 1 remains **OPEN**.

## 24/13/32 verification

PASS.

- Media identities: exactly 24 — HLS 001–010, DASH 001–004, TS 001–005, PROG 001–004, and FLV 001.
- Origin split: exactly 19 existing plus 5 new.
- Feature cases: exactly 13 — DL 001–004, CAST 001–003, ERR 001–004, CANCEL 001–002.
- Lifecycle cases: exactly 32 — LIFE 001–032, with meanings and anchors retained.
- Feature and lifecycle cases are explicitly not media identities.
- The tuple is a future normative target and becomes repository authority only through Plan 1 atomic integration.

## Fixture-choice verification

PASS.

- `NP-HLS-007` is one compound media identity with all three mandatory named sub-closures:
  - A: malformed media-playlist syntax at a fixed token/line.
  - B: valid master with a deliberately absent child playlist at a fixed relative path.
  - C: valid media playlist with a deliberately absent segment at a fixed relative path.
  Each has an oracle and closure hash; the row has one ordered aggregate.
- `NP-PROG-004` is progressive ISO BMFF MP4, H.264 Main@L3.1 + AAC-LC, with one embedded `tx3g`/`mov_text` track and fixed cue/track metadata.
- `NP-TS-005` is one synthetic MPEG-TS fixture with separately selectable, audibly distinguishable HE-AAC v1/v2 tracks, generated through the selected pinned libfdk-aac path.
- No “or surrogate” alternative remains.

## Lock, state-machine, network, and candidate checks

PASS.

- S has no authoritative content lock for not-yet-generated bytes.
- Candidate and proposed lock are generated and validated together.
- E copies proposed lock bytes exactly; later mutation requires a new transaction.
- HLS live, DASH live, and delayed HLS machines have versioned byte-level contracts and no host-clock dependency.
- Delay advances only through explicit `RELEASE_NEXT`.
- Network isolation applies to untrusted media sandboxes, while trusted control-plane jobs have bounded GitHub-only egress and never parse media.
- Candidate identity includes server/repository/ref/workflow/run/artifacts/attestation/runner/OCI/toolchain and evidence identity.

## Signing, event, receipt, Release, and hash checks

PASS.

- Approval has no self-digest; signature, promotion, and external `approvalDigest` use the same exact JCS bytes.
- Signer time is informational, and authorization derives from the E-bound policy blob.
- Key rotation, overlap, retirement, revocation, compromise, and historical verification are deterministic.
- Events have one durable append-only location and scoped terminal dispositions.
- Receipt authority is forward-only and includes independent post-commit Git-blob verification.
- Signed publication projection exhaustively binds mutable Release fields and uses explicit `make_latest`.
- The hash registry distinguishes domain hashes, raw hashes, Git object IDs, OCI digests, and attestation digests; no object hashes itself.

## Placeholder, alias, and Android-claim scan

PASS.

- No TBD, TODO, “implement later,” “or surrogate,” or unresolved fixture alternative is present in the corrected contract.
- No bare unpinned `latest` alias is used for publication behavior; the field is `make_latest`.
- Generator-side validation is not represented as Android, Media3, WebView, codec-support, lifecycle, Cast, download, cancellation, or product proof.
- Feature behavior remains future Android evidence; generator scope is references and fixture integrity.
- No Critical or Important finding is left unresolved by this correction.

Design correction self-review: PASS