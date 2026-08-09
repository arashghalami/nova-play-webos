# Playback corpus design specification self-review

## Review metadata

| Field | Value |
|---|---|
| Reviewed specification | `docs/android/specs/2026-08-09-playback-corpus-design.md` |
| Review date | 2026-08-09 |
| Review scope | Completeness, internal consistency, registry fidelity, publication safety, ambiguity, non-claim discipline, and implementation-plan focus |
| Source evidence read | Required Phase 1 decision sheet/final review, Android requirements/device/corpus documents, refactor baseline, plan v3, `CLAUDE.md`, and `.gitignore` |
| Corpus-design review evidence | No pre-existing files were available under `docs/android/audits/phase-1/corpus-design-reviews/` when this specification task began |
| Authoritative review baseline | `docs/android/audits/phase-1/reviews/decision-sheet-final-review.md` |
| Phase status | OPEN; this review does not close Phase 1 |

## Checks performed

### 1. Required structure and design authority

- Verified the specification has the required exact title: `# Nova Play reproducible playback corpus design`.
- Verified all required top-level sections exist once and in order: Sections 1 through 30.
- Verified the document says it is an owner-approved design, implementation has not started, Phase 1 remains OPEN, and the document is architecture/design authority rather than a Phase 1 closure record.
- Verified it states that the specification does not itself amend the normative 24/13/32 registry and does not close Phase 1.
- Verified the document confines implementation to an implementation plan and does not create tooling, media, workflows, tags, Releases, or product code.

Result: PASS.

### 2. Binding-owner-decision coverage

Checked each approved decision against Sections 4, 15–23, and 25–26:

- repository-owned source-build Linux container and GitHub Actions Linux authority;
- `linux/amd64` OCI index/manifest/config/layer and execution-envelope recording;
- isolated Node.js ESM orchestration;
- synthetic-first content and limited public-vector exception;
- 250 MiB compressed, 1 GiB extracted, 10,000-file, 256 MiB-file, and depth-12 limits;
- unpublished pinned GPL x264/x265 tooling only, no silent nonfree input;
- separate generation and redistribution approval;
- exact public Release bytes, capability-gated repository-access-controlled mutable staging, and separately protected promotion;
- dual-mode reproducibility and immutable published bytes;
- no provider/private/tester data and no DRM/encrypted corpus-v1 fixture.

Result: PASS.

### 3. Repository layout and ignored-byte discipline

- Verified the required logical layout is present, including all specified tooling, documentation, signing, fixture, and workflow paths.
- Verified `fixtures/playback-corpus/` is described as an ignored subset of the repository’s existing ignored `fixtures/` policy.
- Verified generated/extracted/archive bytes remain outside Git while exact durable public bytes are Release assets.
- Verified the document does not prescribe publication of the generator image or generator binaries.

Result: PASS.

### 4. Registry, exact-ID, and count verification

Programmatic scan of the finished specification found:

| Identifier family | Required | Found | Result |
|---|---:|---:|---|
| Unique media IDs | 24 | 24 | PASS |
| Unique feature IDs | 13 | 13 | PASS |
| Unique lifecycle IDs | 32 | 32 | PASS |
| Required numbered top-level sections | 30 | 30 | PASS |

Manual checks confirmed:

- Media IDs are exactly `NP-HLS-001..010`, `NP-DASH-001..004`, `NP-TS-001..005`, `NP-PROG-001..004`, and `NP-FLV-001`.
- Feature IDs are exactly `NP-DL-001..004`, `NP-CAST-001..003`, `NP-ERR-001..004`, and `NP-CANCEL-001..002`.
- Lifecycle IDs are exactly `NP-LIFE-001..032`.
- The specification preserves the 19 existing / 5 new media-origin split.
- The fixed class vocabulary is exactly `pass`, `capability-classed`, `best-effort, clean-failure`, and `clean-fail`.
- H.264 Main@L3.1 baseline, `NP-HLS-009` High@L4.1-only status, `NP-HLS-010` Main10 best-effort status, HEVC Main capability-classing, and `NP-TS-005` HE-AAC v1/v2 are explicit.
- DASH audio/text selection remains mandatory future backend evidence.
- `NP-HLS-008` remains identity/lock-only; A/B are independently playable and byte-distinct.
- `NP-CANCEL-001/002` remain non-executing aliases consuming only `NP-LIFE-031/032`.
- Feature and lifecycle IDs are never counted as media identities.
- The Section 30 lifecycle appendix faithfully retains the final decision-sheet meanings and anchors, including no media anchor for `NP-LIFE-030` and independent-result semantics for `+` anchors.

Result: PASS.

### 5. Media, closure, oracle, and execution-envelope coverage

- Verified every media ID has a defined synthetic-first or tightly controlled reference-vector generation strategy.
- Verified explicit coverage of fMP4 HLS, TS-segment HLS, local-live replay, HEVC Main, Main10, H.264 High@L4.1, multi-audio, subtitles, broken manifests, the A/B delay bundle, static/live DASH, DASH audio/text adaptation, raw TS variants, AC-3/E-AC-3, HE-AAC v1/v2, progressive text, policy-rejected valid MKV, and FLV.
- Verified generator-side decode is restricted to fixture-integrity evidence.
- Verified exact registry extraction/migration constraints: UTF-8 no BOM, LF, exactly one marker pair, exact byte range, strict JSON, JCS `specDigest`, raw Markdown hash, `supersedesDocumentSha256`, recipe bindings, and atomic replacement of old 19-row wording.
- Verified lock/candidate/staging/approval/release-receipt schemas are distinct and have no circular Release field or self-hash.
- Verified RFC 8785 JCS, domain-separated SHA-256, closure tuple ordering/fields, unknown-field rejection, immutable schema IDs/versions, and signature-over-JCS rules.
- Verified HLS/DASH closure restrictions, explicit shared-object references, cycle/bound controls, local-live state machine, and deterministic A/B delay state machine.
- Verified the full deterministic execution envelope and source-build constraints.

Result: PASS.

### 6. Security, legal, capability, and workflow safety

- Verified action full-SHA pinning, no privileged fork/PR candidate execution, no candidate secrets, no authoritative cache inputs, and no shell interpolation of metadata.
- Verified SSRF protections include public-address filtering, CNAME/A/AAAA validation, DNS-rebinding protection, address pinning with TLS hostname verification, redirects disabled, proxy disabled, and response bounds.
- Verified rootless sandbox, read-only input, isolated scratch, capability drop, no-new-privileges, seccomp, resource limits, regular-files-only, and archive safety controls.
- Verified promotion does not parse or execute candidate media.
- Verified CC0 intent, separate GPL/tool/output redistribution treatment, every-row provenance/licence/patent/redistribution record, and the exact required owner disclaimer.
- Verified the GitHub capability probe is a hard prerequisite with all required mandatory capabilities and no silent fallback.
- Verified smoke/candidate/stage/promote/verify workflows have distinct trust/permission roles.
- Verified append-only states, absorbing dispositions, idempotency key, numeric-ID recovery, non-cancelling concurrency, quarantine, additive revocation, and new-version-only corrections.
- Verified SSH namespace/principal, Git-blob-byte verification, direct-child A-after-E rule, allowed-signer/policy files, and the full approval transaction binding set.

Result: PASS.

### 7. Explicit non-claims and Phase 1 sequence

- Verified the specification explicitly disclaims Android, device, codec, Media3/WebView, lifecycle, PiP, notification, download, Cast, cancellation, provider, performance, and legal-clearance claims.
- Verified the corrected 16-step Phase 1 sequence is present.
- Verified the corpus tag and local annotated webOS baseline tag have separate purposes and targets.
- Verified public Release verification is not presented as product/device verification.

Result: PASS.

### 8. Placeholder and ambiguity scan

Scanned the final specification for:

- `TBD`;
- `TODO`;
- incomplete placeholder forms;
- the word `latest`;
- ambiguous draft wording that could characterize a draft as private immutable storage;
- floating/unpinned aliases.

Initial findings and corrections:

| Finding | Correction made |
|---|---|
| One use of `Latest` in a prohibited-floating-input list | Reworded the list to prohibit floating tags/ranges, mutable base-image tags, and unpinned action references without using the flagged term |
| Three scan matches for the disallowed private/immutable draft phrase | Rephrased each to state that drafts must not be represented or treated as both private and immutable while retaining the required repository-access-controlled mutable-staging rule |

Final scan result: no `TBD`, no `TODO`, no placeholder wording, no `latest`, no unpinned aliases, and no ambiguous statement that a GitHub draft Release provides immutable private storage.

Result: PASS.

### 9. Old-authority and circularity check

- Verified that references to the earlier 19-row corpus occur only as historical migration/origin context and never as continuing normative authority.
- Verified the current design consistently identifies the 24/13/32 registry as the required normative target after its atomic migration.
- Verified content lock, candidate manifest, staging receipt, owner approval, and release receipt each prohibit self-hash fields.
- Verified the lock and candidate exclude future Release location; the staging receipt records staging only; the release receipt records stable published facts only.
- Verified no Release/self-hash circularity exists.

Result: PASS.

### 10. Critical/Important review-class closure

The final independent decision-sheet review reported zero Critical and zero Important findings. Its prior Important findings were:

1. unenumerated/drifted lifecycle registry;
2. `NP-HLS-008` media/behavior collapse;
3. cancellation duplicate-execution ambiguity.

This design explicitly preserves the corrected 32-case lifecycle mapping, makes `NP-HLS-008` identity/lock-only, locates runtime cancellation only in `NP-LIFE-031/032`, and makes `NP-CANCEL-001/002` non-executing aliases. It also retains the corrected 19/5 origin split and normalized four-value media class vocabulary.

No Critical or Important review-class issue remains unresolved in this specification. The final-review Minor cross-reference concerning `NP-TS-004` is not carried as ambiguous behavior: this design explicitly requires a structurally valid E-AC-3 fixture and separately confines the later unsupported-audio product behavior to future product evidence.

Result: PASS.

### 11. Scope and implementation-plan focus

The specification is too detailed to implement safely as one undifferentiated change, but it is focused enough for **one implementation plan** with seven explicitly stated, independently reviewable workstreams:

1. registry extraction and schemas;
2. deterministic toolchain and recipes;
3. closures, oracles, archive, and local-live server;
4. locks/candidates/provenance/licences;
5. capability probe, GitHub API, workflows, and attestations;
6. stage/approval/promotion/state recovery;
7. independent verification, receipts/revocation, and fault-injection tests.

This is explicit decomposition, not hidden scope expansion. It stays within the corpus tooling/publication authority and excludes Android app implementation.

Result: PASS.

## Findings

No unresolved findings.

The completed review found no Critical, Important, Minor, or blocking ambiguity in the final specification.

## Corrections made

1. Replaced the initial floating-input scan trigger with precise language prohibiting floating tags/ranges, mutable base-image tags, and unpinned action references.
2. Reworded draft-Release language to consistently define it as repository-access-controlled mutable staging and explicitly reject treating it as both private and immutable.
3. Confirmed after correction that no placeholder, self-hash circularity, old 19-row normative authority, Android/device success claim, or unresolved Critical/Important issue remains.

## Final verdict

The specification is internally consistent, implementation-ready, and sufficiently bounded for one decomposed implementation plan. It faithfully captures the owner-approved corpus architecture, the 24/13/32 registry constraints, fixture-only semantics, safety controls, approval boundaries, Release lifecycle, recovery rules, and Phase 1 non-closure status.

Design self-review: PASS