# Nova Play reproducible playback corpus design

## 1. Metadata and approval

| Field | Value |
|---|---|
| Date | 2026-08-09 |
| Status | Proposed written specification; interactive design approved; pending final written owner approval and normative integration |
| Design authority | Proposed architecture for corpus tooling and publication; no current repository normative authority |
| Phase status | Phase 1 remains **OPEN** |
| Repository | `arashghalami/nova-play-webos` |
| Scope authority | Interactive owner approval covers all 17 decisions and all four design sections; final written-spec approval and repository integration remain pending |
| Future primary normative registry | `docs/android/playback-corpus.md`, only after the atomic registry migration defined in Section 10 |
| Decision evidence | Interactive approval of all 17 decisions; repository-verifiable approval record not yet committed |
| Future design approval record | `docs/android/specs/2026-08-09-playback-corpus-design-approval.md` |
| Baseline source commit | `7a4a3b163d436dd1727b9fad5356536e27ef8a7f` |

The owner approved all 17 decisions and all four design sections interactively. That approval is not yet repository-verifiable written-spec approval and does not make this document or the future 24/13/32 registry normative. After correction, the owner must perform a final written review. This document becomes implementation-planning authority only when a dedicated committed design-approval record binds the exact corrected design commit SHA, design-file Git blob ID and raw SHA-256, owner identity and approval statement, date, the 17-decision approval reference, explicit authority to create implementation plans, and an explicit statement that normative integration remains Plan 1 and is not complete.

Written-spec approval is distinct from later per-candidate redistribution approval. The former authorizes planning from this design; the latter authorizes publication of exact candidate bytes. Neither substitutes for the other. This document never becomes the normative 24/13/32 registry. Plan 1 must atomically update the active plan, requirements, device policy, corpus registry, baseline wording, and decision statuses before generator or tooling implementation begins.

The corpus is a compatibility fixture corpus. It is not a product playback result, Android decoder result, Media3 result, WebView result, device-support certification, or provider-compatibility result.

## 2. Problem statement and goals

The Phase 2 corpus must make compatibility evidence repeatable without ingesting provider data, personal data, credentials, DRM, or unlicensed media. Existing sample rows describe required media and behavior, but a URL or a local one-off fixture is not sufficient evidence: URLs may change, public streams may disappear, tooling can drift, and a generated archive can silently differ from its prior form.

The goal is a legal, privacy-safe, reproducible corpus with these properties:

1. The exact authoritative corpus bytes are generated in a repository-owned source-build Linux container on GitHub Actions Linux.
2. A candidate run generates exact bytes and non-authoritative `proposed-content-lock.json` in one run, then validates those bytes against that proposed lock, semantic oracles, and transitive HLS/DASH closures.
3. A candidate is staged into a repository-access-controlled mutable draft Release only after validation and only when the capability probe proves that staging and promotion semantics are safe.
4. A named owner provides a technical-due-diligence approval over the exact staged transaction using a detached SSH signature.
5. A separately protected promotion publishes the approved staged bytes as an immutable public GitHub Release.
6. Independent verification checks public Release identity, bytes, lock bindings, receipts, and attestations without executing candidate media.
7. The committed control artifacts have clear provenance and an append-only history. Exact published media bytes remain available from the Release, not Git.

The archive contains deterministic synthetic audiovisual primitives wherever technically and legally possible. Public reference vectors are an exception only where a specific required bitstream cannot be produced lawfully and reliably from approved open source material and pinned build tooling.

## 3. Scope and non-goals

### In scope

- The proposed exact set of 24 media identities, 13 feature cases, and 32 lifecycle cases. It becomes the normative registry only through Plan 1 atomic integration.
- Synthetic source primitives, recipes, source-built encoder/toolchain provenance, archive production, archive validation, local-live replay, and bounded HLS/DASH closure generation.
- Content locking, candidate provenance, Release staging, cryptographic owner approval, protected promotion, Release verification, receipts, revocation, and audit history.
- A publication process for exact public corpus bytes and machine-readable control artifacts.
- Testing of corpus tooling and publication controls.

### Non-goals

The following are expressly out of scope and must not be inferred from any successful corpus generation, staging, Release, or verification:

- Android playback proof, decoder support, device codec support, or a supported-device claim.
- Media3 or WebView backend proof.
- Lifecycle, PiP, notification, download, Cast, cancellation, or product feature proof.
- Performance, thermal, endurance, visual-quality, battery, or benchmark claims.
- Provider data, private URLs, credentials, catalog payloads, tester data, or real IPTV fixtures.
- Android application implementation or any refactor of `src/main.ts`.
- Publishing the generator image, generator binaries, or container registry image.
- DRM, encrypted fixtures, key acquisition, EME, or protected-content testing.
- Creation of GitHub Releases, tags, workflows, fixtures, generated media, or implementation tooling by this design document.

Feature and lifecycle identifiers define future product-proof obligations. They are not additional media assets and do not cause media identity counts to exceed 24.

## 4. Interactively approved design decisions

The following owner decisions are approved interactive design inputs. They become binding written-spec inputs only after the dedicated design-approval record is committed; repository normative integration remains a separate Plan 1 transaction.

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

“Draft Release” always means **repository-access-controlled mutable staging**. It must never be represented as storage that is both private and immutable. A draft does not provide immutable publication, anonymous access, public availability, or a durable legal approval boundary.

## 5. Architecture and authority

The design has six authority planes:

1. **Future normative registry plane.** After Plan 1 atomic integration, `docs/android/playback-corpus.md` provides the 24 media rows, 13 feature cases, and 32 lifecycle cases. Until then, the current corpus document remains the repository authority and does not contain or approve 24/13/32.
2. **Tooling plane.** Repository-owned source, schemas, recipes, tests, and container inputs produce and validate candidate bytes. It has no authority to waive a registry ID.
3. **Candidate and proposed-lock plane.** A candidate run generates object bytes, archive bytes, and `proposed-content-lock.json` together. The proposed lock is non-authoritative and identifies exact objects, closures, recipes, oracle versions, and archive identity for that candidate.
4. **Evidence content-lock plane.** Evidence commit E copies the validated proposed lock byte-for-byte to `docs/android/playback-corpus-content.lock.json`. Only at E, after independent staging verification, does it become normative content identity for that transaction.
5. **Staging and approval plane.** A staging receipt records the mutable staging object as observed. The approval binds the exact candidate/staging transaction but does not publish it.
6. **Release and receipt plane.** Promotion creates an annotated corpus tag and publishes the staged Release. The release receipt records stable observed public facts. Independent verification verifies it.

Authority moves forward only through validated, append-only evidence. A later plane cannot rewrite a prior plane:

`future integrated registry -> candidate + proposed lock -> staging receipt -> evidence commit E + normative content lock -> owner approval -> published Release -> proposed receipt -> receipt commit R -> post-commit receipt verification`.

Source/spec/tooling commit S contains the integrated registry, schemas, oracles, recipes, tooling, policies, and workflows but no authoritative content lock for bytes that do not yet exist. Staging uploads the exact candidate bytes and proposed lock unchanged. Approval binds E, the committed lock Git blob, its raw hash, and candidate/staging identity. Any byte or lock change after E requires a new candidate, staging transaction, E, and approval. Generation must never be described as validation against a pre-existing committed lock.

A Release is authoritative for immutable distributable bytes; Git is authoritative for committed control artifacts and their Git blob bytes. The archive itself stays ignored and is never added to Git.

## 6. Repository layout

The implementation uses the following logical layout. Exact file splits within the listed directories may be refined by the implementation plan without weakening their responsibilities.

```text
tools/playback-corpus/
  README.md
  package.json
  package-lock.json
  container/
    Dockerfile
    sources.lock.json
    licenses/
  schemas/
  src/
  recipes/
  test/
  fixtures-invalid/

fixtures/playback-corpus/              # ignored working bytes

docs/android/
  playback-corpus.md                   # normative 24/13/32 specification
  playback-corpus-content.lock.json    # publication-location-free content lock
  playback-corpus-staging-receipt.json
  playback-corpus-approval.json
  playback-corpus-approval.sig
  playback-corpus-release-receipt.json
  playback-corpus-licenses.md
  playback-corpus-events/
    <corpusVersion>/
  signing/
    allowed_signers
    policy.json
  specs/
    2026-08-09-playback-corpus-design.md
    2026-08-09-playback-corpus-design-approval.md

.github/workflows/
  playback-corpus-smoke.yml
  playback-corpus-candidate.yml
  playback-corpus-stage.yml
  playback-corpus-promote.yml
  playback-corpus-verify-release.yml
```

`fixtures/playback-corpus/` is a subset of the existing ignored `fixtures/` policy. It may contain locally generated, downloaded, decompressed, or temporary candidate material only. It must not contain credentials, provider fixtures, private recordings, or data copied from devices. Generated archive bytes and extracted corpus bytes remain ignored. The public GitHub Release stores the exact durable archive and any declared public verification assets.

The tooling must use Node.js ESM with a narrow command surface: explicit argv arrays, schema-validated JSON, no shell interpolation of metadata, no ambient network after acquisition, and no automatic mutation of committed control files. The implementation plan must create focused modules rather than a monolithic publisher.

## 7. Corpus identities and generation strategy

The future atomically integrated normative registry has exactly 24 `mediaRows`, 13 `featureCases`, and 32 `lifecycleCases`. This specification fixes the target semantics but is not itself that registry. The media identity grammar is `NP-<PROTOCOL>-<NNN>`, with `PROTOCOL ∈ HLS | DASH | TS | PROG | FLV`. IDs are permanent, not reused, and backend-neutral.

Every media row has one of exactly these four class values:

- `pass`
- `capability-classed`
- `best-effort, clean-failure`
- `clean-fail`

The corpus has 19 existing and 5 new media identities. The five new identities are `NP-HLS-009`, `NP-HLS-010`, `NP-TS-005`, `NP-PROG-004`, and `NP-FLV-001`.

The H.264 mandatory baseline uses Main@L3.1 where the registry specifies H.264 baseline media. High@L4.1 is present only in `NP-HLS-009`. `NP-HLS-010` is a Main10 best-effort fixture. HEVC Main rows are capability-classed. `NP-TS-005` tests both HE-AAC v1 and v2. DASH track selection remains mandatory future backend evidence. `NP-HLS-008` is an identity/lock-only A/B bundle. `NP-CANCEL-001` and `NP-CANCEL-002` are non-executing aliases of `NP-LIFE-031` and `NP-LIFE-032`.

The following media-generation matrix is normative for tooling behavior, not a claim that any target device must decode any listed content.

| ID | Required fixture form and generation strategy | Class |
|---|---|---|
| `NP-HLS-001` | Synthetic H.264 Main@L3.1 + AAC-LC, fMP4 HLS VOD; deterministic master, media playlist, init segment, and fixed segments | pass |
| `NP-HLS-002` | Synthetic H.264 Main@L3.1 + AAC-LC HLS VOD with MPEG-TS segments and fixed segment boundaries | pass |
| `NP-HLS-003` | Pinned static H.264 Main@L3.1 + AAC-LC TS segment set replayed by the deterministic local-live state machine | pass |
| `NP-HLS-004` | Synthetic HEVC Main 8-bit + AAC-LC fMP4 HLS VOD using approved source-built x265 tooling | capability-classed |
| `NP-HLS-005` | Synthetic HLS VOD with two or more distinguishable language audio renditions, fixed group metadata and tones | pass |
| `NP-HLS-006` | Synthetic HLS VOD with two or more deterministic subtitle renditions and distinguishable cue content | pass |
| `NP-HLS-007` | One mandatory compound identity: A `hls-007-a/media.m3u8` has token `#EXTINF:broken,` at UTF-8 line 6; B `hls-007-b/master.m3u8` references deliberately absent `missing/child.m3u8`; C `hls-007-c/media.m3u8` references deliberately absent `missing/segment-0002.ts`. Each has its own oracle and closure hash; the row has a bundle aggregate | clean-fail |
| `NP-HLS-008` | Two independently playable byte-distinct synthetic HLS VOD closures: A with pinned delay-server manifest/segment delays and B with no injected delay | pass |
| `NP-HLS-009` | Synthetic 1080p H.264 High@L4.1 + AAC-LC fMP4 HLS VOD; only High@L4.1 row | best-effort, clean-failure |
| `NP-HLS-010` | Synthetic HEVC Main10 10-bit + AAC-LC fMP4 HLS VOD using approved source-built tooling | best-effort, clean-failure |
| `NP-DASH-001` | Synthetic static DASH fMP4 VOD, H.264 Main@L3.1 + AAC-LC, with concretized MPD closure | pass |
| `NP-DASH-002` | Pinned static DASH segments replayed by a deterministic local-live MPD/segment availability state machine | pass |
| `NP-DASH-003` | Synthetic static DASH with two or more distinguishable audio adaptation sets and fixed language metadata | pass |
| `NP-DASH-004` | Synthetic static DASH with deterministic text adaptation set(s), cue content, and fixed adaptation metadata | pass |
| `NP-TS-001` | Synthetic regular-file MPEG-TS, H.264 Main@L3.1 + AAC-LC | pass |
| `NP-TS-002` | Synthetic regular-file MPEG-TS, HEVC Main + AAC-LC using approved source-built HEVC tooling | capability-classed |
| `NP-TS-003` | Structurally valid regular-file MPEG-TS, H.264 + AC-3; video and audio must be independently inspectable | clean-fail |
| `NP-TS-004` | Structurally valid regular-file MPEG-TS, H.264 + E-AC-3; video and audio must be independently inspectable | clean-fail |
| `NP-TS-005` | Synthetic regular-file MPEG-TS, H.264 Main@L3.1 with separately selectable, audibly distinguishable HE-AAC v1 and HE-AAC v2 tracks | pass |
| `NP-PROG-001` | Synthetic progressive MP4, H.264 Main@L3.1 + AAC-LC | pass |
| `NP-PROG-002` | Synthetic progressive MP4 with two or more distinguishable language audio tracks | pass |
| `NP-PROG-003` | Valid and decodeable Matroska, H.264 + AAC, used only for later application-policy rejection evidence | clean-fail |
| `NP-PROG-004` | Progressive ISO BMFF MP4, H.264 Main@L3.1 + AAC-LC, with one embedded `tx3g`/`mov_text` subtitle track; fixed language, cue text, start/end times, track disposition, and stream order | pass |
| `NP-FLV-001` | Synthetic regular-file FLV, H.264 Main@L3.1 + AAC-LC | pass |

`NP-HLS-007-A`, `NP-HLS-007-B`, and `NP-HLS-007-C` are all mandatory. The exact token, line, and absent relative paths in the matrix are immutable oracle inputs. Their aggregate is a JCS array ordered A, B, C containing each sub-closure ID, oracle ID/version, and closure hash. Validation passes only when all three declared faults occur with no collateral fault. `NP-PROG-004`'s oracle verifies the embedded track and decoded cue projection; later `HTMLMediaElement.textTracks` or backend selection remains Phase 2 evidence.

`NP-TS-005` uses source-built `libfdk-aac` v2.0.3, annotated tag object `cac04476081a23c870fed05c36228cd02c5e7c3d`, as unpublished build-only tooling. The tag resolves to one commit recorded in `sources.lock.json`; acquisition accepts only that commit and an independently checked source-archive raw SHA-256. Authoritative FFmpeg is release `n7.1.1`, likewise bound to its resolved commit and source-archive raw SHA-256, configured with `--enable-libfdk-aac --enable-nonfree --disable-shared` and no hardware encoder. The capability probe must encode and identify MPEG-4 HE-AAC v1 and v2 from separate fixed PCM inputs; failure returns the row to owner decision. The source lock also records licences, compiler/ABI inputs, complete configure argv, and capability output. Generator image, FFmpeg/libfdk binaries or source, and container layers are never publicly distributed or cached. The MPEG-TS fixture has separately selectable, audibly distinguishable HE-AAC v1/v2 tracks. Tool legality and encoded-byte redistribution are separate; unresolved output basis blocks the corpus. This is not legal clearance or a patent licence. AAC-LC substitution and unapproved vectors are forbidden.

No row may silently fall back to a nonfree encoder, dependency, system binary, public CDN representation, hardware accelerator, dynamic package alias, or provider stream. If an approved public reference vector is necessary, its row must record the technical impossibility or legal constraint that prevented approved synthetic generation, exact source and licence basis, retrieval hash, immutable input identity where available, and a bounded local normalization/repackaging step. A public vector never grants a waiver from closure, oracle, archive, or redistribution review.

### 7.1 Exact feature-case registry

Feature cases define future normative behavior but are not media identities. The generator validates references and fixtures only; Android behavior remains Phase 2. The `Execution owner` column is authoritative. Each non-lifecycle feature case owns its own executions through the named harness: `NP-DL-*` through Gate 3, `NP-CAST-*` through Gate 4, and `NP-ERR-*` through the Phase 2 error-surface harness. That feature-case owner schedules and records exactly one execution per required media variant under its own feature ID. Cancellation aliases are owned by the referenced lifecycle case and schedule or record no additional execution.

| ID | Exact meaning | Media references | Execution owner | Pass/fail rule | Alias behavior |
|---|---|---|---|---|---|
| `NP-DL-001` | Progressive VOD download/offline/delete | `NP-PROG-001` | Gate 3 | Download and offline playback succeed; delete removes the playable copy | None |
| `NP-DL-002` | HLS VOD download/offline/delete | `NP-HLS-001` | Gate 3 | Complete closure downloads; offline playback succeeds; delete removes it | None |
| `NP-DL-003` | DASH VOD download/offline/delete | `NP-DASH-001` | Gate 3 | Complete closure downloads; offline playback succeeds; delete removes it | None |
| `NP-DL-004` | Interrupted-download integrity over all download cases | `NP-DL-001..003` required variants | Gate 3 | Partial output is never shown or playable | Consumes three feature cases; no media identity |
| `NP-CAST-001` | HLS handoff/position/transport/disconnect | `NP-HLS-001` | Gate 4 | Handoff position, transport, and disconnect meet the case oracle | None |
| `NP-CAST-002` | DASH handoff/position/transport/disconnect | `NP-DASH-001` | Gate 4 | Handoff position, transport, and disconnect meet the case oracle | None |
| `NP-CAST-003` | Pre-connection unsupported decision for transport-only forms | `NP-TS-001`, `NP-FLV-001` required variants | Gate 4 | Rejected before connection; no receiver attempt | Two required variants |
| `NP-ERR-001` | Explicit MKV application-policy rejection | `NP-PROG-003` | `NP-ERR-001` via Phase 2 error-surface harness | Explicit policy rejection; fixture unreadability is not a pass | None |
| `NP-ERR-002` | Explicit AC-3 unsupported-audio result | `NP-TS-003` | `NP-ERR-002` via Phase 2 error-surface harness | Unsupported audio is explicit; no silent success | None |
| `NP-ERR-003` | Explicit E-AC-3 unsupported-audio result | `NP-TS-004` | `NP-ERR-003` via Phase 2 error-surface harness | Unsupported audio is explicit; no silent success | None |
| `NP-ERR-004` | Explicit broken-HLS error within watchdog | `NP-HLS-007` | `NP-ERR-004` via Phase 2 error-surface harness | Every A/B/C sub-closure errors explicitly within watchdog; no indefinite spinner | Consumes complete bundle |
| `NP-CANCEL-001` | Cancel A during manifest load, then start B | `NP-LIFE-031` only | Lifecycle owner | Passes only with lifecycle result; schedules no execution | Non-executing alias |
| `NP-CANCEL-002` | Cancel A during playback, then start B | `NP-LIFE-032` only | Lifecycle owner | Passes only with lifecycle result; schedules no execution | Non-executing alias |

## 8. Synthetic source primitives and duration policy

Synthetic primitives must be sufficient to validate structure and decoded content without implying visual-quality assessment. The common source primitive set contains:

- A deterministic motion grid with known moving regions.
- A monotonically increasing frame counter visible on every frame.
- The stable corpus ID and variant label rendered into the frame.
- Aspect-ratio, resolution, and pixel-format markers.
- Deterministic color patches and luma transitions useful for decoded-signal checks.
- Deterministic audio tones, spoken-free cue patterns, and channel/lang identifiers.
- Distinguishable language tracks using different fixed tone sequences and cue timing.
- Deterministic subtitle cue text, timestamps, languages, and positioning.
- Fixed random seed, source dimensions, frame rate, sample rate, channel layout, stream metadata, time base, start timestamps, and mux timestamps.

The tooling must set and record a fixed `SOURCE_DATE_EPOCH`, explicit frame/sample rates, normalized metadata, and deterministic encoder/muxer arguments. It must reject ambient creation-time metadata, hostname data, current path data, unpinned locale behavior, and random sources.

Durations are row-specific, short, and budgeted. The recipe registry must define duration, segment duration, GOP/keyframe policy, bitrate ceiling, audio sample count, and cue schedule per row. A row uses the shortest duration capable of its oracle: basic VOD rows are short; track rows include enough cues/tone windows to prove selection; live replay rows contain a bounded multi-segment window; fault rows contain only the closure necessary for their declared fault. The candidate validator calculates total archive budget before staging and rejects a candidate above the compressed, extracted, file-count, file-size, or depth limits.

Live behavior is not fetched or captured from a changing live edge. It replays pinned static segments according to the local-live model in Section 14. The model proves corpus fixture semantics only, not production live-stream behavior.

## 9. Content-addressed archive and reuse model

A candidate run produces a canonical compressed archive plus a proposed content lock. The archive is a deterministic packaging projection of proposed-lock-listed objects. It has one archive hash and contains no self-hash, Release URL, Release ID, approval, signature, or receipt.

The object store is content-addressed by object bytes. Reuse is allowed only when every reuse reference includes the exact content object hash and the row closure explicitly references that object. Shared init segments, media segments, deterministic source primitives, or text assets may be reused, but a row’s closure remains complete on its own terms. A shared object never makes one row’s closure implicit.

For each row, the lock records:

- stable media ID and fixture class;
- object list and normalized archive path;
- closure root(s), including nested A/B roots for `NP-HLS-008`;
- object role, byte size, raw `objectSha256`, and any declared byte range;
- recipe ID and recipe hash, or approved public-vector provenance;
- immutable `oracleId` and `oracleVersion`;
- determinism class and semantic validation result;
- legal/provenance record and redistribution decision status.

Canonical packaging requirements:

- Archive input order is normalized path byte order.
- Paths use lowercase ASCII POSIX-relative names.
- Tar ownership is fixed to numeric UID/GID zero with normalized names, mode policy, and timestamp policy.
- No symlink, hardlink, special file, sparse file, traversal entry, case collision, duplicate path, or path outside the archive root is permitted.
- Compression algorithm, implementation version, flags, threading, and timestamp behavior are pinned and recorded.
- The archive contains regular files only and has no network dependency at extraction time.
- The validator reproduces the archive projection from lock-listed bytes before it treats an archive hash as valid.

Reuse is a byte-reuse optimization, not a semantic alias. A changed object hash changes every affected closure hash and therefore requires a new lock/candidate/approval transaction.

## 10. Normative registry extraction and migration

After Plan 1 atomic integration, the normative registry lives in `docs/android/playback-corpus.md` as one strict JSON payload between exactly one begin marker and exactly one end marker. The current file does not yet contain or approve the 24/13/32 target. The implementation must define fixed literal sentinels and reject a document with zero, multiple, reordered, indented-altered, or non-unique marker pairs.

The source file must be UTF-8 without BOM and LF-only. The extracted payload is the exact byte range after the end-of-line following the begin marker through the byte immediately before the line containing the end marker. The implementation records:

- `specDigest`: RFC 8785 JSON Canonicalization Scheme (JCS) bytes of parsed registry JSON, hashed in the `spec` domain;
- `rawMarkdownSha256`: raw SHA-256 of every byte of the complete Markdown file, from the first byte through EOF, with no parsing, normalization, exclusion, domain prefix, or self-field;
- `supersedesDocumentSha256`: raw SHA-256 of every byte of the complete prior normative document, from the first byte through EOF, with no parsing, normalization, exclusion, or domain prefix.

Registry JSON is strict: no duplicate keys, comments, trailing commas, non-finite numbers, invalid UTF-8, unrecognized enum values, or unknown fields. Schema validation rejects unknown fields at every level. Recipes may reference only a stable registry ID and the current `specDigest`; they may not duplicate normative row semantics in an independently authoritative registry.

The migration is atomic:

1. Record the hash of the current document under `supersedesDocumentSha256`.
2. Replace current 19-row wording with the complete written-approved 24/13/32 JSON registry and associated explanatory text in the same atomic integration commit.
3. Update the registry grammar to include `FLV`.
4. Validate exact media, feature, and lifecycle counts; duplicate detection; class vocabulary; references; and all lifecycle meanings before committing.
5. Reject any intermediate state with a competing registry, partial counts, legacy 19-row authority, or parallel unbound machine registry.

This proposed design supplies exact target IDs and semantics in Section 30; it does not replace `docs/android/playback-corpus.md`. Plan 1 atomically updates the active plan, requirements, device policy, corpus registry, baseline wording, and decision statuses before generator/tooling implementation.

## 11. Artifact schemas and authority lifecycle

All JSON artifacts are strict-schema documents with immutable content-pinned schema `$id` values and explicit schema versions. A schema change, oracle change, hash projection change, or canonicalization change requires a new artifact version; older versions remain verifiable by their own schema.

### 11.1 `corpus-content-lock.json`

The candidate output is `proposed-content-lock.json`; E copies its exact bytes to `docs/android/playback-corpus-content.lock.json`. It contains registry binding, objects, closures, recipes, legal/provenance facts, oracle references, and archive identity, with no Release/staging fields or self-hash.

The proposed lock is non-authoritative during candidate generation and staging. It becomes normative content identity only when E commits the byte-for-byte copy after independent staging validation. Approval binds E, the lock Git blob ID, `lockRawSha256`, and candidate/staging identity.

### 11.2 `candidate-manifest.json`

The candidate manifest and `candidateDigest` projection contain: GitHub server URL; repository owner/name and numeric repository ID; source SHA and protected-ref identity; candidate workflow path and Git blob hash; workflow run ID and attempt; every numeric Actions artifact ID, exact name, size, and digest; attestation subject name/digest, issuer, signer workflow identity, and attestation digest; runner OS/image/kernel/architecture; OCI index, selected manifest, config, and layer digests; toolchain, recipe, oracle, schema, and policy hashes; proposed-lock, archive, report, and evidence hashes; and transaction/attempt identity. It has no future Release location or self-hash. Every later object binds the exact externally computed `candidateDigest`.

It is produced by the protected candidate workflow and becomes authoritative candidate evidence only after all candidate validation gates pass.

### 11.3 `staging-receipt.json`

The committed project location is `docs/android/playback-corpus-staging-receipt.json`. It records the numeric draft Release ID, immutable asset IDs/names/sizes/hashes as observed, planned publication settings, planned annotated tag and target, API identity observations, and staging-preflight evidence. It has no self-hash.

It is created only by the staging workflow after protected revalidation. It becomes authoritative staging evidence when its stable observations match the staged assets and it is committed in evidence commit E.

### 11.4 `playback-corpus-approval.json`

The committed project location is `docs/android/playback-corpus-approval.json`, with detached signature `docs/android/playback-corpus-approval.sig`. It contains owner authorization over the exact candidate/staging transaction. It has no self-hash, no mutable status field, and no Release result that did not yet exist when signed.

It becomes authoritative only if its exact Git blob bytes validate against the committed detached signature, allowed signer policy, signature namespace, principal, validity, and transaction bindings in Section 20.

### 11.5 `playback-corpus-release-receipt.json`

The committed project location is `docs/android/playback-corpus-release-receipt.json`. It records actual published Release/tag/asset identity and hashes, immutable Release state, public verification result, and stable identity facts only. It has no self-hash. Retry observations, polling timestamps, and transient API diagnostics live in separately versioned event records, not in this receipt.

A post-public verifier first creates deterministic `proposed-release-receipt.json` plus a separate run-specific verification report. It verifies public facts and bindings without calling the proposal normative. R copies proposed receipt bytes byte-for-byte to the committed path. An independent post-commit verifier reads the Git blob, recomputes public facts, and verifies the earlier report and proposed-receipt hash. Only successful `RECEIPT_VERIFIED` makes the receipt normative.

### 11.6 Reproducibility artifact classes

| Class | Artifacts | Rule |
|---|---|---|
| Deterministic content-control | Strict registry canonical payload; schemas/schema locks; recipes/recipe set; synthetic primitives; oracle definitions; deterministic HLS/DASH manifests and state-machine definitions; proposed/content lock for identical object bytes; archive projection/archive for identical object bytes; fixed-input licence/provenance records | Bit-identical under the same source/spec/toolchain envelope |
| Run-specific evidence | Candidate manifest; provenance attestation envelope; run validation report; append-only events; staging receipt; approval signed time/signature; Release receipt; verification observations/incidents | Not byte-identical; stable projections bind equivalent deterministic artifacts and identities |

Deterministic projections are exhaustive: registry is full strict-registry JCS; each schema is exact UTF-8 bytes and schema lock is path-sorted JCS `{path,size,rawSha256}`; each recipe is full strict JCS and recipe set is ID-sorted JCS `{recipeId,recipeVersion,recipeHash}`; each primitive is exact bytes and primitive set is path-sorted `{path,size,rawSha256}`; each oracle/machine/manifest is full strict JCS or exact declared UTF-8 bytes; proposed/content lock is full strict JCS; archive projection is path-sorted `{path,size,objectSha256,mode,mtime}` and archive is exact compressed bytes; licence/provenance projection is full strict JCS.

Evidence-equivalence projections use RFC 8785 JCS and are exact per artifact:

| Evidence artifact | Included in stable projection | Excluded as run-varying |
|---|---|---|
| Candidate manifest | Repository/source/workflow identities; every artifact name/size/digest; attestation subject/issuer/signer; runner/OCI/toolchain/recipe/oracle/schema/policy/proposed-lock/archive/report/evidence hashes; semantic result | Transaction/attempt, run ID/attempt, numeric Actions artifact IDs, observation times |
| Provenance attestation | Subject names/digests, issuer, signer workflow identity, predicate type and deterministic-material digests | Envelope signature and signed/observed time |
| Validation report | Candidate digest, validator/schema/oracle/policy versions, per-check IDs/results, deterministic input/output hashes | Run ID, attempt ID, start/end/observation times, bounded diagnostics |
| Event | Corpus version, transaction/attempt, sequence, prior digest, state/disposition, actor/authority, Git/blob and artifact identities, event evidence | Informational observation time only |
| Staging receipt | Repository/candidate/proposed-lock identities, numeric Release/asset IDs, exact asset metadata/hashes, planned signed publication projection | Polling attempts, transient diagnostics, observation time |
| Approval | All signed JCS fields, including policy/key/candidate/staging/publication identities | Nothing from signed JCS; signature bytes and informational `signedAt` vary only between distinct approvals |
| Release receipt | Repository/tag/Release/asset numeric identities, exact public metadata/hashes, candidate/approval binding | Verification-run identity, observations, incidents, polling time |
| Verification/incident report | Subject artifact identities, policy/check versions, check IDs/results, observed immutable facts | Run/attempt, observation time, bounded diagnostics |

Identity-critical GitHub IDs are never excluded where the row includes them. Two runs are equivalent only when the complete corresponding included-member JCS bytes match. Already approved or published bytes remain exact and immutable.

## 12. Canonicalization and hash domains

All structured data uses RFC 8785 JCS. All domain hashes use UTF-8 bytes and:

```text
SHA-256("nova-play:<artifact-type>:<version>\0" || bytes)
```

SHA-256 values use lowercase 64-character hexadecimal unless an external API explicitly requires another validated representation. Raw hashes cover exact bytes. Domain hashes cover the exact UTF-8 prefix, NUL, and stated JCS/raw bytes. OCI and attestation digests retain algorithm-qualified native form.

| Field | Algorithm/domain | Exact input/serialization | Output |
|---|---|---|---|
| `specDigest` | SHA-256, `nova-play:spec:v1` | RFC 8785 JCS registry | lowercase hex |
| `rawMarkdownSha256` | SHA-256, raw | Complete Markdown file bytes | lowercase hex |
| `supersedesDocumentSha256` | SHA-256, raw | Complete prior file bytes | lowercase hex |
| `lockDigest` | SHA-256, `nova-play:lock:v1` | Exact lock JCS | lowercase hex |
| `lockRawSha256` | SHA-256, raw | Exact proposed/committed lock file bytes | lowercase hex |
| `candidateDigest` | SHA-256, `nova-play:candidate:v1` | Exact candidate JCS | lowercase hex |
| `stagingDigest` | SHA-256, `nova-play:staging:v1` | Exact staging JCS | lowercase hex |
| `approvalDigest` | SHA-256, `nova-play:approval:v1` | Exact signed approval JCS | lowercase hex |
| `receiptDigest` | SHA-256, `nova-play:receipt:v1` | Exact receipt JCS | lowercase hex |
| `closureHash` | SHA-256, `nova-play:closure:v1` | Sorted closure-tuple JCS | lowercase hex |
| `archiveSha256` | SHA-256, raw | Exact canonical compressed archive bytes | lowercase hex |
| `objectSha256` | SHA-256, raw | Exact lock-listed regular-file object bytes | lowercase hex |
| `assetSha256` | SHA-256, raw | Exact bytes of one named GitHub Release asset as downloaded | lowercase hex |
| `recipeHash` | SHA-256, `nova-play:recipe:v1` | RFC 8785 JCS of one complete strict recipe object | lowercase hex |
| `oracleHash` | SHA-256, `nova-play:oracle:v1` | RFC 8785 JCS of one complete strict oracle object | lowercase hex |
| `schemaHash` | SHA-256, raw | Exact UTF-8 bytes of one schema file | lowercase hex |
| `policyHash` | SHA-256, raw | Exact UTF-8 bytes of one non-approval policy file | lowercase hex |
| `approvalPolicyBlobHash` | SHA-256, raw | Exact content bytes of the E-bound approval-policy Git blob, excluding the Git object header | lowercase hex |
| `immutableReleasePolicyHash` | SHA-256, raw | Exact UTF-8 bytes of the immutable-Release policy artifact bound by approval | lowercase hex |
| `workflowBlobHash` | SHA-256, raw | Exact content bytes of one workflow Git blob, excluding the Git object header | lowercase hex |
| `licenceHash` | SHA-256, raw | Exact UTF-8 bytes of the complete licence/provenance record | lowercase hex |
| `reportHash` | SHA-256, raw | Exact bytes of the specifically named report artifact | lowercase hex |
| `evidenceHash` | SHA-256, raw | Exact bytes of the specifically named evidence artifact | lowercase hex |
| `eventDigest` | SHA-256, `nova-play:event:v1` | RFC 8785 JCS of the complete event object, which contains no `eventDigest` field | lowercase hex |
| `revocationDigest` | SHA-256, `nova-play:revocation:v1` | RFC 8785 JCS of the complete signed revocation object, which contains no `revocationDigest` field | lowercase hex |
| `attestationDigest` | Attestation-envelope-declared algorithm | Exact serialized attestation-envelope bytes | algorithm-qualified |
| `subjectDigest` | Subject-declared algorithm | Exact bytes of the named attestation subject | algorithm-qualified |
| `ociIndexDigest` | OCI descriptor algorithm | Exact OCI image-index bytes | algorithm-qualified |
| `ociManifestDigest` | OCI descriptor algorithm | Exact selected `linux/amd64` OCI manifest bytes | algorithm-qualified |
| `ociConfigDigest` | OCI descriptor algorithm | Exact OCI image-config bytes | algorithm-qualified |
| `ociLayerDigest` | OCI descriptor algorithm | Exact compressed bytes of one ordered OCI layer | algorithm-qualified |
| `gitObjectId` | `gitObjectFormat` | Git-defined object header and content bytes | native Git object ID |
| `primitiveHash` | SHA-256, raw | Exact bytes of one synthetic primitive file | lowercase hex |
| `manifestHash` | SHA-256, raw | Exact emitted UTF-8 HLS playlist or DASH MPD bytes | lowercase hex |
| `machineDefinitionHash` | SHA-256, raw | RFC 8785 JCS bytes of one complete machine-definition object | lowercase hex |
| `traceHash` | SHA-256, raw | RFC 8785 JCS bytes of one complete canonical trace array | lowercase hex |
| `archiveProjectionHash` | SHA-256, `nova-play:archive-projection:v1` | Archive projection JCS from §11.6 | lowercase hex |
| `schemaLockHash` | SHA-256, `nova-play:schema-lock:v1` | Schema-lock JCS from §11.6 | lowercase hex |
| `recipeSetHash` | SHA-256, `nova-play:recipe-set:v1` | Recipe-set JCS from §11.6 | lowercase hex |
| `primitiveSetHash` | SHA-256, `nova-play:primitive-set:v1` | Primitive-set JCS from §11.6 | lowercase hex |
| `stableProjectionHash` | SHA-256, `nova-play:stable-projection:v1` | Artifact-specific evidence projection JCS from §11.6 | lowercase hex |
| `sourceHash` | SHA-256, raw | Exact bytes of one acquired source archive or source input identified by path/URL and version | lowercase hex |
| `toolchainHash` | SHA-256, raw | Exact bytes of the complete source/toolchain lock file | lowercase hex |
| `containerHash` | SHA-256, raw | Exact UTF-8 bytes of the authoritative container build definition | lowercase hex |
| `validationReportHash` | SHA-256, raw | Exact bytes of the complete candidate validation report | lowercase hex |
| `verificationReportHash` | SHA-256, raw | Exact bytes of the complete public or post-commit verification report | lowercase hex |
| `provenanceHash` | SHA-256, raw | Exact serialized provenance-envelope bytes | lowercase hex |
| `priorEventDigest` | SHA-256, `nova-play:event:v1` | RFC 8785 JCS of the complete immediately preceding event object | lowercase hex |
| `priorStateHash` | SHA-256, `nova-play:machine-state:v1` | RFC 8785 JCS of the complete state before one transition | lowercase hex |
| `nextStateHash` | SHA-256, `nova-play:machine-state:v1` | RFC 8785 JCS of the complete state after one transition | lowercase hex |
| `bodyObjectSha256` | SHA-256, raw | Exact response-body object bytes | lowercase hex |
| `rawSha256` | SHA-256, raw | Exact bytes of the separately named file in a path-bound projection tuple | lowercase hex |
| `priorPolicyBlobHash` | SHA-256, raw | Exact content bytes of the immediately preceding policy-history Git blob, excluding the Git object header | lowercase hex |
| `priorRevocationDigest` | SHA-256, `nova-play:revocation:v1` | RFC 8785 JCS of the complete immediately preceding revocation object | lowercase hex |
| `approvalDigests` item | SHA-256, `nova-play:approval:v1` | RFC 8785 JCS of one exact signed approval object | lowercase hex |
| `receiptDigests` item | SHA-256, `nova-play:receipt:v1` | RFC 8785 JCS of one exact receipt object | lowercase hex |
| `actionsArtifactDigest` | GitHub Actions API-declared algorithm | Exact bytes of the named numeric Actions artifact | algorithm-qualified |
| `hashRegistryVersion` | not a digest | Literal `nova-play-hash-registry-v1` | UTF-8 string |

The registry version is `nova-play-hash-registry-v1`. Every schema hash field must use a field name listed in this table; generic `hash`, `domain hash`, or `artifact digests` fields are forbidden. Object identity is always `objectSha256`, raw SHA-256 over exact object bytes. Closure tuples use `objectSha256`, not a separate domain hash. Git object IDs are separately labelled `gitObjectFormat` and `gitObjectId`, never SHA-256 content hashes. Workflow identity records both Git object ID and raw `workflowBlobHash`.

No object hashes itself. Self-hash fields are forbidden by every artifact schema. Any hash field can hash only a separately defined projection or separately stored object. The archive is not listed as an embedded byte field in an object that hashes itself. The approval signature is over exact JCS bytes of the approval object with no trailing newline.

A closure hash is the domain hash of a JCS array sorted by normalized path and then role. Every tuple includes:

```json
{
  "path": "lowercase/posix/path",
  "role": "manifest|playlist|mpd|init|segment|media|subtitle|fault|config",
  "size": 0,
  "objectSha256": "lowercase-64-hex",
  "byteRange": { "offset": 0, "length": 0 }
}
```

`byteRange` is either a valid explicit object with non-negative integer offset and positive integer length, or `null` for full-object identity. It is never inferred from a URL range header. The closure projection also rejects duplicate path/role/range tuples and rejects a range beyond the declared regular-file size.

Unknown fields are rejected. Canonicalization, hash domain, oracle, schema, and projection versions are immutable contracts. A new version is required rather than silently changing an old projection.

## 13. Semantic oracles and validation

Each media row references an immutable `oracleId` and `oracleVersion`. An oracle describes fixture integrity and expected media semantics. It never claims Android support, decoder support, UI support, or product behavior.

Each oracle includes:

- fixture class and ID;
- expected container/manifest structure;
- normalized `ffprobe` projection and fixed tool version;
- excluded unstable fields, including absolute paths, probe clock time, host values, nondeterministic IDs, and implementation-dependent statistics;
- stream order and count;
- codecs, profiles, levels, pixel format, bit depth, dimensions, rational rates, channels, disposition, and language;
- deterministic subtitle cue evidence;
- duration, timestamp, segment, target-duration, and live-window tolerances;
- decoded synthetic-signal checks using defined frame/audio samples and tolerances;
- expected fault and forbidden collateral faults;
- closure shape, allowed resource roles, and byte-range constraints;
- determinism class: `control-bit-identical`, `encoded-version-bound`, or `reference-vector-bound`.

A validator must identify a fixture-specific declared fault rather than merely observing an error. `NP-HLS-007` validates exactly the declared broken manifest behavior and rejects extra unexpected missing dependencies, redirections, query-based escapes, network access, or unrelated parse faults.

Negative fixture requirements are specific:

- `NP-PROG-003` must be a valid, inspectable, decodeable MKV. Later Android rejection is application-policy evidence, not proof that the fixture was unreadable.
- `NP-TS-003` and `NP-TS-004` must be structurally valid AC-3 and E-AC-3 fixtures with decodable video structure and explicit audio codec evidence.
- Broken HLS variants must be precisely faulted and otherwise bounded.
- `NP-HLS-008-A` and `NP-HLS-008-B` must both independently validate and play in the generator-side fixture sense, be byte-distinct, and have independently valid closures. The media oracle has no runtime cancellation assertion.

A generator-side decode proves only fixture integrity. It does not prove any Android API level, device, product backend, application policy, download, Cast, lifecycle, cancellation, or UI behavior.

## 14. HLS/DASH closure and local-live model

HLS and DASH fixtures are bounded generated subsets. The resolver must operate only on fixture bytes or explicitly approved acquired bytes in a sandbox. It must reject any reference containing a scheme, authority, query, fragment, percent encoding, backslash, absolute path, dot segment, data URI, external `BaseURL`, `xlink`, DRM declaration, encryption declaration, or runtime dependency.

All paths must be lowercase ASCII POSIX-relative. The resolver enforces cycle detection and archive bounds before opening a resource. It permits regular files only. It rejects symlinks, hardlinks, devices, FIFOs, sockets, sparse files, path traversal, duplicate normalized paths, Unicode confusables outside the permitted character set, and case collisions.

HLS support is allowlisted to the generated forms required by this corpus: master/media playlists; version; target duration; media sequence; end list; independent segments where emitted; stream/media rendition declarations; map; segment entries; discontinuity only where recipe declares it; byte range only where lock tuples declare it; and program date/time only when deterministic and oracle-checked. Unsupported tags/forms fail validation. Encryption/key tags, session keys, iframe variants, external URI forms, variables, and unapproved redirects are forbidden.

DASH support is allowlisted to static and deterministic local-live MPDs with explicit periods, adaptation sets, representations, segment templates/timelines or explicit segment lists as selected by recipe. The resolver concretizes the representation/adaptation/segment closure; it does not leave an unresolved template, dynamic URL, remote `BaseURL`, `xlink`, DRM content protection, or external segment source. Every referenced object and byte range is lock-listed.

Each row explicitly references every shared object hash in its closure. A valid global object store is insufficient unless the row closure includes the object.

The executable contracts are `nova-play-hls-live-v1`, `nova-play-dash-live-v1`, and `nova-play-hls-delay-v1`. Each is strict canonical JCS bound by recipe, oracle, proposed lock, and candidate. Canonical initial state is `{"clock":0,"loopsRemaining":<recipe loopCount>,"nextRequest":0,"pending":[],"released":[],"requestCount":0,"sequence":0,"terminal":false,"windowStart":0}`; recipes also provide immutable non-negative integer `loopCount` and immutable positive integers `segmentCount`, `windowWidth`, `maximumEvents`, `maximumTick`, `maximumRequests`, `maximumPending`, and `maximumClock`.

Canonical machine input is a strict JCS array of envelopes `{"tick":N,"eventIndex":N,"event":E}` whose length may not exceed `maximumEvents`. `tick` and `eventIndex` are non-negative integers; `eventIndex` equals the envelope's zero-based input-array position and is therefore globally contiguous and unique. Ticks are nondecreasing in input order, start at zero, contain no empty group, and may not exceed `maximumTick`. They identify logical input batches only: state `clock` changes exclusively through `ADVANCE`, need not equal `tick`, and may not exceed `maximumClock`. Envelope shape is validated before replay; a malformed envelope makes the complete input invalid with deterministic validation error `INVALID_ENVELOPE` and produces no transition trace, so grouping and ordering remain defined.

Within a valid envelope, valid event shapes are exactly `{"type":"REQUEST","method":"...","path":"...","ordinal":N}`, `{"type":"ADVANCE"}`, `{"type":"RELEASE_NEXT"}`, `{"type":"CANCEL","ordinal":N}`, and `{"type":"END"}`. A request schema accepts any UTF-8 string for `method` and `path` so semantic method/path failures can deterministically return 400; request and cancel ordinals must be non-negative integers. An unknown or structurally invalid inner event produces `INVALID_EVENT`, a `null` response, and no state change.

Processing groups by ascending tick and sorts each complete group once by `(eventPriority,eventOrdinal,eventPath,eventBytes,eventIndex)`, where priorities are `REQUEST=0`, `CANCEL=1`, `RELEASE_NEXT=2`, `ADVANCE=3`, `END=4`, and invalid inner event `=5`; `eventOrdinal` is the event ordinal for valid `REQUEST`/`CANCEL` and `-1` otherwise; `eventPath` is the raw UTF-8 path bytes for a valid `REQUEST` and the empty byte string otherwise; `eventBytes` is the inner event's RFC 8785 JCS bytes. The final component deterministically orders otherwise identical events. The original envelope values are copied unchanged into the trace.

Validation precedence is envelope schema, event-count/tick bounds, inner-event schema, terminal state, event permission, clock/request-count bounds, ordinal, method, path, pending bound, then availability. A method is valid only when exactly uppercase `GET`; a path is valid only when lowercase ASCII POSIX-relative without scheme/authority/query/fragment/percent encoding/backslash/dot segment. A mismatched request ordinal produces `INVALID_ORDINAL`, status 409, and no state change. An invalid inner event produces `INVALID_EVENT`; input above `maximumEvents` produces pre-replay `EVENT_LIMIT`; an envelope above `maximumTick` produces `TICK_LIMIT`; an `ADVANCE` when `clock == maximumClock` produces `CLOCK_LIMIT`; a request when `requestCount == maximumRequests` produces `REQUEST_LIMIT`; and a queued request requiring insertion when `pending.length == maximumPending` produces `PENDING_LIMIT`. Each transition-bound error returns `null` and leaves state unchanged. Otherwise every valid-ordinal request increments both `nextRequest` and `requestCount`, including a 400, 404, or 410 request. Terminal requests still pass ordinal, method, and path validation before terminal path selection. Empty 400/404/409/410 responses use `[["content-length","0"]]`; locked responses use `[["content-length","<decimal-size>"],["content-type","<recipe-literal>"]]`. “Available” means present in the current machine projection; “another segment exists” means `sequence + 1 < segmentCount`.

The total common transition table applies only after earlier-precedence checks above:

| State/event | Next state | Response |
|---|---|---|
| structurally invalid inner event | unchanged | `null`, trace error `INVALID_EVENT` |
| input above `maximumEvents` | no replay | deterministic validation error `EVENT_LIMIT`; no trace |
| envelope above `maximumTick` | unchanged | `null`, trace error `TICK_LIMIT` |
| `ADVANCE` at `maximumClock` | unchanged | `null`, trace error `CLOCK_LIMIT` |
| any `REQUEST` at `maximumRequests` | unchanged | `null`, trace error `REQUEST_LIMIT` |
| queued valid available `REQUEST` at `maximumPending` | unchanged | `null`, trace error `PENDING_LIMIT` |
| any `REQUEST` with `ordinal != nextRequest` | unchanged | 409, fixed empty headers/body hash, trace error `INVALID_ORDINAL` |
| nonterminal `REQUEST`, valid ordinal but invalid method/path | `nextRequest += 1`; `requestCount += 1` | 400, fixed empty headers, `bodyObjectSha256` of fixed empty body |
| nonterminal `REQUEST`, valid unavailable path | `nextRequest += 1`; `requestCount += 1` | 404 with fixed headers/body hash |
| nonterminal `REQUEST`, valid available path | `nextRequest += 1`; `requestCount += 1`; queued delay mode appends `{ordinal,path,releaseAfter}` | HLS/DASH or immediate delay mode: 200 locked response; queued delay mode: `null` |
| nonterminal `ADVANCE` | `clock += 1`; if `sequence + 1 < segmentCount`, set `sequence=sequence+1` and `windowStart=max(0,sequence-windowWidth+1)` using the incremented sequence; else if `loopsRemaining > 0`, set `loopsRemaining=loopsRemaining-1`, `sequence=0`, and `windowStart=0`; otherwise set `terminal=true` | `null` |
| delay `RELEASE_NEXT` | decrement every positive `releaseAfter` in ordinal order, release/remove the lowest ordinal now at zero, append ordinal to `released`; if none pending, unchanged | released locked response or `null` |
| delay `CANCEL(N)` | remove pending ordinal N if present; otherwise unchanged | `null` |
| live-machine `RELEASE_NEXT` or `CANCEL` | unchanged | trace error `EVENT_NOT_ALLOWED` |
| nonterminal `END` | `terminal=true`, pending cleared | `null` |
| terminal `REQUEST`, valid ordinal but invalid method/path | `nextRequest += 1`; `requestCount += 1` | 400, fixed empty headers, `bodyObjectSha256` of fixed empty body |
| terminal `REQUEST`, valid ordinal/method/path to the recipe-literal manifest or MPD | `nextRequest += 1`; `requestCount += 1` | fixed 410 response |
| terminal `REQUEST`, valid ordinal/method/path to every other normalized path | `nextRequest += 1`; `requestCount += 1` | fixed 404 response |
| terminal `ADVANCE`, `RELEASE_NEXT`, `CANCEL`, or `END` | unchanged | `null` |

For `nova-play-hls-live-v1`, the recipe-literal manifest path is always available while nonterminal; segment path at recipe-array index `i` is available exactly when `windowStart <= i <= sequence`; every other normalized path is unavailable. Manifest response bytes are the locked projection of those inclusive indices. For `nova-play-dash-live-v1`, the recipe-literal MPD path is always available while nonterminal; segment path at recipe-array index `i` is available exactly when `windowStart <= i <= sequence`; every other normalized path is unavailable. The MPD response uses the locked projection with recipe-literal period/adaptation/representation IDs. For `nova-play-hls-delay-v1`, the exact keys of the recipe path-to-`releaseAfter` map are available and every other normalized path is unavailable. Recipes declare `mode` as `queued` for A or `immediate` for B. Queued mode appends pending state and returns `null`; immediate mode returns the locked response and never appends pending state. No host wall clock, scheduler, randomness, or upstream participates. Recipes fix maximum events, ticks, logical clock, requests, pending entries, segments, window width, loops, and response bytes.

A non-null response is the strict object `{"status":N,"headers":[["name","value"]],"bodyObjectSha256":"lowercase-64-hex"}` with no unknown fields. `status` is exactly the transition-table integer. Header names and values are lowercase ASCII strings in exact listed order: empty responses use `[["content-length","0"]]`; locked responses use `[["content-length","<decimal body byte size>"],["content-type","<recipe-literal>"]]`. `bodyObjectSha256` is raw SHA-256 of the exact empty-body object for empty responses or exact locked body object for locked responses. A pending or no-response transition uses JSON `null`.

Canonical trace JCS is an array of the processed input envelopes extended with `priorStateHash`, `nextStateHash`, `response`, and `traceError`; the closed trace-error enum is `null`, `INVALID_EVENT`, `TICK_LIMIT`, `CLOCK_LIMIT`, `REQUEST_LIMIT`, `PENDING_LIMIT`, `INVALID_ORDINAL`, or `EVENT_NOT_ALLOWED`. `INVALID_ENVELOPE` and `EVENT_LIMIT` are closed pre-replay validation-report errors and produce no transition trace. Events sharing `tick` form one group and are sorted by the total event key above before transitions. Each machine definition contains exact initial-state, success/window-advance, unavailable-path, invalid-request, invalid-event, invalid-envelope, terminal-invalid-request, terminal-manifest, terminal-other-path, same-tick-all-event-types, each exact bound edge and overflow, loop, natural-terminal, explicit-END, and bounds traces; the delay machine additionally contains queued-release, immediate-response, multiple-pending-order, early-release, missing-cancel, successful-cancel, and terminal-clears-pending traces. Validators replay every transition and compare complete trace JCS bytes. Real-device cancellation timing remains Phase 2 evidence.

## 15. Deterministic execution envelope

The candidate manifest records the complete execution envelope required to understand output provenance:

- OCI index digest and the selected `linux/amd64` manifest digest;
- selected image config and layer digests;
- runner image identifier, OS release, kernel, architecture, and virtualized CPU description;
- CPU policy, including fixed permitted CPU count and no hardware media acceleration;
- software encoder policy and fixed thread counts;
- exact source hashes, compiler/tool versions, configuration flags, capability probe output, and normalized argv arrays;
- fixed `TZ=UTC`, locale, `SOURCE_DATE_EPOCH`, umask, working-directory mapping, and environment allowlist;
- disabled or rejected proxy environment variables;
- deterministic path ordering, ownership, modes, timestamps, tar version/options, compression version/options, and archive implementation;
- network acquisition record and an explicit transition to network-disabled generation/validation;
- no unrecorded cache input or host tool may influence authoritative outputs.

The container is source-built from `container/Dockerfile` and `container/sources.lock.json`. Every source tarball, signature/checksum input, patch, compiler package, and build option is pinned. Floating tags, floating package ranges, mutable base image tags, and unpinned action references are prohibited.

The deterministic content-control artifacts in Section 11.6 must be bit-identical in the same envelope. Run-specific evidence must have equivalent stable projections. Encoded-byte change requires semantic revalidation and a new candidate, proposed lock, staging transaction, E, and approval. Existing public Release bytes never change.

## 16. Security, privacy, and supply-chain model

### Workflow and input controls

- GitHub Actions are pinned by full commit SHA, not a tag or branch.
- Candidate execution is never privileged for pull requests or forks.
- Candidate jobs receive no repository secrets. Required OIDC/attestation permissions are scoped to the protected candidate context.
- Cache contents are never authoritative inputs; caches may accelerate only data whose hash is independently checked.
- Metadata, paths, filenames, IDs, Release text, and JSON values are never interpolated into shell or workflow commands. Tooling uses fixed trusted command names and argv arrays.
- Candidate and stage inputs are schema-validated before use.

### Network and acquisition controls

Approved public-vector acquisition is exceptional and happens before network shutdown. It uses allowlisted HTTPS destinations and validates URL forms before resolution. Controls include:

- redirects disabled;
- proxy environment disabled;
- IPv4 and IPv6 loopback, link-local, multicast, unspecified, private, carrier-grade, documentation, benchmark, reserved, and otherwise non-public ranges rejected;
- DNS rebinding protection by validating CNAME and every A/AAAA answer, pinning the validated address for the request, and retaining TLS hostname verification;
- no fallback to a newly resolved address during a request;
- expected hash, size, content type, and time bounds;
- response body bounded before parse or archive extraction;
- no credentials, cookies, authorization headers, provider identifiers, or user input.

After approved acquisition, network is disabled only inside untrusted media generation, parser, validator, and package sandboxes. A candidate media sandbox needing network after that transition fails.

Trusted control-plane stage, promote, and verify jobs require network. Egress is restricted to approved GitHub API and asset endpoints; proxy environment is disabled; transfers are bounded; repository textual and numeric identity is pinned. These jobs never execute, decode, parse, or extract candidate media.

### Sandbox and archive controls

Parsers and generators run rootless in a sandbox with read-only inputs, isolated writable scratch, dropped Linux capabilities, `no-new-privileges`, seccomp, CPU/time/memory/PID/output limits, and no mount or network authority beyond the explicitly controlled phase. The implementation must reject all non-regular archive entries and unsafe extraction constructs.

Bounds are enforced independently before and after archive creation:

- compressed archive: at most 250 MiB;
- extracted material: at most 1 GiB;
- files: at most 10,000;
- individual file: at most 256 MiB;
- path depth: at most 12.

Promotion never executes, decodes, extracts, parses, or otherwise handles candidate media. It verifies prior signed hashes, Git blob bytes, Release identity, and GitHub asset metadata only.

No provider, private, tester, device, personal, credential, DRM, encrypted, or real IPTV content enters the corpus, archive, Release assets, receipts, logs, attestations, or committed reports.

## 17. Licensing and redistribution approval

Project-authored synthetic source signals are intended to be dedicated under CC0-1.0. CC0 does not grant codec patent rights, third-party library rights, trademark rights, or a licence to redistribute encoded output made with restricted tooling.

The licence model separates:

1. source primitive licence;
2. recipe/tool licence;
3. build-tool source and binary licence;
4. encoder output redistribution basis;
5. public-vector licence and attribution, where used;
6. codec/patent caveat;
7. owner publication decision.

GPL x264/x265 may be used only as pinned unpublished build tooling. The public archive must not contain generator binaries, container layers, x264/x265 binaries, x264/x265 source, or a claim that GPL tooling alone settles encoded-byte redistribution. No nonfree encoder or dependency may be selected silently. Any row requiring a nonfree component or unresolved redistribution basis blocks publication until the owner records a decision or the row is lawfully redesigned without changing its approved semantic requirement.

Every one of the 24 media rows must have a provenance/licence entry before publication. Each entry states source origin, tool licence, patent caveat, output redistribution basis, required notice/attribution, and owner decision. A missing, ambiguous, expired, altered, or incompatible entry blocks the full corpus publication; no row is silently waived.

The approval must include this exact statement:

> “I reviewed the recorded provenance, applicable licence notices,
> redistribution basis, codec/patent caveats, exact candidate hashes, and
> publication coordinates for this corpus candidate. I authorize publication of
> these exact staged bytes for this personally owned project. This record
> documents technical due diligence and risk acceptance; it is not legal advice,
> legal clearance, a patent licence, or a warranty. If organizational policy or
> applicable law requires additional review, publication remains blocked until
> that review is recorded.”

## 18. GitHub capability probe

The capability probe is a hard implementation prerequisite. No corpus candidate may stage or publish until a protected test repository or the actual repository configuration proves all required capabilities under the actual GitHub plan, repository visibility, and environment settings.

The probe must prove:

1. Required repository visibility before a public publication path is enabled.
2. Anonymous and collaborator draft-Release visibility behavior.
3. Numeric Release IDs and numeric asset IDs are returned and queryable.
4. Asset ID, name, size, and bytes remain stable across publishing a draft.
5. Explicit annotated-tag creation and target behavior are available and observable.
6. Immutable Releases are available and enforcement is effective after publication.
7. Protected Environments and required reviewers are available under the actual plan/settings.
8. An exact-run artifact can be downloaded using stable run/attempt/artifact identity.
9. Attestation generation and verification work for the selected artifact path.
10. Workflow concurrency can be configured non-cancelling.
11. Required API identity fields are available before and after publication.

The probe’s schema records exact API endpoints/actions, observed response fields, repository numeric ID, actor class, timestamps, screenshots or API evidence where appropriate, and negative tests. It must demonstrate that a collaborator cannot treat a mutable draft as immutable publication and that immutable Release enforcement prevents post-publication asset mutation.

If any mandatory capability is absent, ambiguous, plan-gated, or behaviorally different from this design, implementation stops and returns to the owner for a documented decision. There is no silent fallback to Git artifacts, mutable tags, unprotected release creation, drafts falsely treated as both private and immutable, manually remembered URLs, or a different hosting service.

## 19. Workflow and privilege separation

The workflows have distinct roles and minimum permissions:

| Workflow | Trigger/trust | Responsibilities | Permissions |
|---|---|---|---|
| `playback-corpus-smoke.yml` | Unprivileged PR | Tiny generated subset, schemas, path/closure/oracle tests; no authoritative output | `contents: read` |
| `playback-corpus-candidate.yml` | Protected source commit | Build authoritative candidate, validate, generate evidence and attestation | `contents: read`, narrowly scoped `id-token: write` and attestation write |
| `playback-corpus-stage.yml` | Protected workflow | Read-only preflight, then independently repeated protected staging job | preflight read-only; staging job `contents: write` only as required |
| `playback-corpus-promote.yml` | Protected environment plus owner approval | Read-only preflight, then independently repeated protected promotion job | preflight read-only; protected write job only as required |
| `playback-corpus-verify-release.yml` | `release: published` and manual reconciliation | Public verification and receipt evidence; no publication mutation | `contents: read` |

The stage job is separated from candidate because a candidate should not both generate arbitrary bytes and acquire durable staging authority. The promotion job is separated from stage because staging is mutable until owner approval and promotion is the irreversible public operation. The protected write steps must re-read all trusted evidence, recompute projections, and reject stale or changed inputs; they must not trust an earlier job’s success flag alone.

All workflows use `concurrency.group = repository numeric ID + corpus version + tag` and `cancel-in-progress: false`. Unprivileged code must not be able to influence a privileged checkout, workflow path, action reference, candidate artifact, environment selection, release name, tag name, target SHA, or approval input.

## 20. Cryptographic owner approval

Owner approval uses OpenSSH detached signatures with:

- namespace: `nova-play-corpus-approval-v1`;
- principal: `corpus-owner-v1`;
- full committed public key(s) in versioned `docs/android/signing/allowed_signers`;
- authorization from the exact signing-policy Git blob hash committed in E, never signer-supplied time;
- full key IDs derived from complete public-key bytes; fingerprints are diagnostic only;
- approval JSON and detached signature attributes marked `-text`;
- signature over exact JCS bytes with no trailing newline;
- verification from Git blob bytes, not a filesystem-reformatted copy.

Approval commit A is a direct child of evidence commit E. It changes only:

```text
docs/android/playback-corpus-approval.json
docs/android/playback-corpus-approval.sig
docs/android/playback-corpus-events/<corpusVersion>/<sequence>-OWNER_APPROVED.json
```

It does not amend E, change source, change the lock, change the staging receipt, modify workflows, create tags, or alter any corpus asset. Commit signing is optional and distinct from the required detached approval signature. Environment approval is also distinct: it controls workflow execution but does not replace owner authorization over exact bytes.

The signed approval object contains no digest of itself. `approvalDigest` is computed externally over the exact signed JCS bytes; signature and promotion hash exactly those same bytes. It explicitly contains `approvalSchemaVersion`, `approvalPolicyVersion`, `approvalPolicyBlobHash`, and `hashRegistryVersion`.

The approval object binds, at minimum:

- approval schema/policy/hash-registry versions and approval-policy blob hash;
- repository owner/name and immutable numeric repository ID;
- source/spec commit S and evidence commit E;
- approved workflow paths and their Git blob hashes;
- candidate workflow run ID, attempt ID, and artifact IDs;
- candidate, lock, archive, licence, oracle, validation-report, and evidence hashes;
- builder/container/attestation identity;
- GitHub server, repository owner/name and numeric ID, numeric draft Release ID, and every staged asset numeric ID/name/label/content type/size/raw SHA-256;
- exact annotated tag name, annotation UTF-8 bytes, tagger identity projection, and target S;
- `stagedReleaseProjection`, containing exact numeric Release ID, `tag_name`, `target_commitish`, `name`, exact UTF-8 `body` bytes, `draft=true`, `prerelease`, `make_latest`, `generate_release_notes=false`, `discussion_category_name` as one exact supported category name or JSON `null`, and every staged asset's numeric ID, `name`, `label` as an exact string or JSON `null`, `content_type`, size, and `assetSha256`;
- `promotionPatch`, containing exactly `draft=false`, the approved `prerelease`, and explicit approved `make_latest`; no asset operation and no omitted or additional Release mutation is allowed during promotion;
- `publishedReleaseProjection`, containing the same exact Release identity, metadata, and asset projection as staging except `draft=false`, plus repository visibility literal `public`, required anonymous availability, immutable-Release required setting, and `immutableReleasePolicyHash`;
- the exhaustive rule that assets are immutable after approval: promotion may not upload, remove, rename, relabel, replace, or alter asset metadata or bytes; every GitHub Release or asset field not present in these strict objects is forbidden, and a newly introduced mutable field requires a versioned policy revision before use;
- signer principal, full public-key ID, owner identity, informational `signedAt`, and exact Section 17 statement.

Promotion changes only signed fields. The bare word `latest` is never an unpinned alias; the API field is the explicit `make_latest` field/value. A changed bound field invalidates approval.

For policy v1, `signedAt` is informational. A key must be `active` for principal/namespace in the exact policy blob bound by E. Policy evolution follows protected Git ancestry and monotonic `policySequence`. Rotation adds a key; overlap exists only while both full key IDs are active. Retirement prevents new approvals under later policies but preserves history unless revoked. Compromise may retroactively revoke named approvals. Revoked approval cannot publish and makes a published version `REVOKED`; wall-clock time alone never authorizes.

Policy and revocation discovery is repository-derived, not caller-selected. For a current-validity decision, the verifier independently resolves and records repository numeric ID, protected default-ref name, ref object ID, and its exact tip as `verificationCommit`; a caller-supplied older commit fails. The verifier proves that tip is a descendant of E and loads policy history only from its Git tree. A newer trusted monotonic checkpoint may substitute only when policy defines and verifies that checkpoint. Historical/as-of verification is a separately labelled non-authorizing mode and cannot permit publication or make a current trust claim. Immutable policy records are `docs/android/signing/policy-history/<8-digit-policySequence>.json`; `docs/android/signing/policy.json` must be byte-identical to the highest-sequence history record. Sequence starts at zero, has no gap or duplicate, and each record contains exact `policySchemaVersion`, `policySequence`, `priorPolicyBlobHash` (`null` only at zero), repository numeric ID, principals, namespaces, full public-key bytes/IDs and states, revocation authorities, and policy-transition authorities. Every `priorPolicyBlobHash` must equal the raw SHA-256 of the preceding history blob, and every policy-transition detached signature must validate over exact policy JCS under an authority active in that preceding policy. Unknown policy files, fields, sequences, ancestry, or signatures fail closed.

The complete current revocation set is every Git blob matching `docs/android/signing/revocations/<8-digit-revocationSequence>-<revocationDigest>.json` in the `verificationCommit` tree, with its same-basename `.sig`; no API input or reduced list may override it. Revocation sequence starts at zero, is contiguous and unique, and path order must equal numeric sequence order. Each strict revocation JCS object contains exactly `revocationSchemaVersion`, `hashRegistryVersion`, repository owner/name and numeric ID, `revocationSequence`, `priorRevocationDigest` (`null` only at zero), `authorizingPolicySequence`, authority principal and full key ID, revoked full key ID, sorted unique exact `approvalDigests`, optional inclusive `policySequenceRange` or JSON `null`, sorted unique exact Release numeric IDs, sorted unique exact `receiptDigests`, corpus-version scope or JSON `null`, and non-empty reason. It contains no `revocationDigest` or time-based authority field. A new record's `authorizingPolicySequence` must equal the highest validated policy at the commit that first contains it, and its authority must be active there for namespace `nova-play-corpus-revocation-v1`; historical policies verify existing records but cannot authorize new records. The filename digest and each successor's `priorRevocationDigest` must equal the externally computed `revocationDigest`; the detached signature must validate exact JCS bytes against that current authority. Unknown fields, a missing sibling signature, a gap, duplicate, malformed scope, invalid signature, untrusted policy, or omitted tree record fails closed. Historical verification evaluates the approval against its E-bound policy and then applies this complete validated set through `verificationCommit`.

## 21. Append-only state machine

Durable events live at `docs/android/playback-corpus-events/<corpusVersion>/`; filenames are `<8-digit-sequence>-<EVENT_TYPE>.json`, where the uppercase event type is one of the enums in this section. The chain is corpus-version-wide: sequence starts at `00000000`, is contiguous and unique with no gap, and is atomically allocated by the protected committing workflow. Sequence zero has `priorEventDigest:null`; every later value equals the externally computed digest of the immediately preceding event. Filename sequence/type must equal object sequence/type. Committed transitions only append files and never modify or delete them.

Every event is strict versioned JCS with exactly `eventSchemaVersion`, `eventType`, `corpusVersion`, `transactionId`, `attemptId`, `sequence`, `priorEventDigest`, `state`, `disposition`, `actor`, `authority`, `gitIdentities`, `githubIdentities`, `artifactDigests`, `evidence`, and `observationTime`; nullable fields are present as JSON `null`, unknown fields are rejected, and every enum/type is schema-closed. `observationTime` is informational but remains included in the complete event JCS and therefore in `eventDigest`. Digest-map keys must be exact Section 12 field names.

Candidate/staging events that reach E are imported byte-for-byte into E. Failed pre-E attempts are durably committed by a protected evidence-only incident commit before retry; that commit may append only their events and incident evidence. `OWNER_APPROVED` is committed in A and binds approval/signature blob IDs and external `approvalDigest`, never A's commit ID. Promotion-produced `CORPUS_TAGGED`, `RELEASE_PUBLISHED`, and verifier-produced `RECEIPT_PROPOSED` events are imported with `RECEIPT_COMMITTED` into R. `RECEIPT_VERIFIED` and later closure events are appended in subsequent path-limited commits. A transaction/attempt absorbing disposition terminates that attempt but not this corpus-version chain; the next attempt receives new IDs and the next global sequence.

Nominal progress:

```text
SPEC_COMMITTED
CANDIDATE_VALIDATED
DRAFT_STAGED
EVIDENCE_COMMITTED
OWNER_APPROVED
CORPUS_TAGGED
RELEASE_PUBLISHED
RECEIPT_PROPOSED
RECEIPT_COMMITTED
RECEIPT_VERIFIED
PHASE_1_VERIFIED
PHASE_1_CLOSED
```

Absorbing dispositions are:

```text
REJECTED
QUARANTINED
REVOKED
```

| State/event | Actor | Guard | Evidence | Next state |
|---|---|---|---|---|
| `SPEC_COMMITTED` | Protected source maintainer | Normative registry migration and schemas validate | source commit S, registry/spec digest | `CANDIDATE_VALIDATED` |
| `CANDIDATE_VALIDATED` | Protected candidate workflow | Full lock, archive, envelope, oracle, licence, and attestation validation | candidate manifest, reports, attestation | `DRAFT_STAGED` |
| `DRAFT_STAGED` | Protected stage workflow | Capability probe passed; stage preflight/revalidation passes | draft numeric Release/asset IDs, staging receipt | `EVIDENCE_COMMITTED` |
| `EVIDENCE_COMMITTED` | Protected source maintainer | Evidence commit E contains stable receipt/lock/evidence facts only | E Git tree/blob hashes | `OWNER_APPROVED` |
| `OWNER_APPROVED` | Corpus owner | Detached signature validates from A Git blobs; A is direct child of E and path-limited | approval digest and signature | `CORPUS_TAGGED` |
| `CORPUS_TAGGED` | Protected promotion workflow | Protected environment approved; tag does not exist or matches exact planned annotated tag | annotated tag object and target S | `RELEASE_PUBLISHED` |
| `RELEASE_PUBLISHED` | Protected promotion workflow | Approved publication only | public facts | `RECEIPT_PROPOSED` |
| `RECEIPT_PROPOSED` | Independent public verifier | Public facts and bindings reconcile | proposed receipt + run report | `RECEIPT_COMMITTED` |
| `RECEIPT_COMMITTED` | Protected maintainer | R copies proposed bytes exactly | R Git blob | `RECEIPT_VERIFIED` |
| `RECEIPT_VERIFIED` | Independent post-commit verifier | R blob, public facts, prior report/hash reconcile | verification event | `PHASE_1_VERIFIED` |
| `PHASE_1_VERIFIED` | Independent closure reviewer | Full Phase 1 requirements beyond this corpus are satisfied | closure review, host verification evidence | `PHASE_1_CLOSED` |
| `PHASE_1_CLOSED` | Owner/closure authority | All external Phase 1 gates have independently passed | final closure record | terminal success |

| Disposition | Actor/authority | Guard/evidence | Scope and successor |
|---|---|---|---|
| `REJECTED` | Corpus owner or protected policy evaluator authorized by E-bound policy | Rejection with transaction/candidate/staging identities and reason | Terminates transaction; new same-version attempt allowed only before publication |
| `QUARANTINED` | Protected validating workflow or incident authority named by E-bound policy | Identity/security/unknown-state incident and observations | Terminates retained attempt; reuse forbidden; new attempt only after incident review |
| `REVOKED` | Corpus owner or revocation authority active in the applicable signing policy | Signed committed record naming key, approval/Release/receipt, scope, and reason | Terminates trust in corpus version; Release retained; corrected bytes require new version |

Absorbing scope is transaction/attempt for `REJECTED`/`QUARANTINED` and corpus version for `REVOKED`, never the whole program. History is not rewritten or deleted.

## 22. Idempotency, concurrency, and failure recovery

Candidate runs have distinct attempt IDs. A retry is a new attempt, even if it produces the same candidate digest. The candidate manifest records both stable run identity and attempt identity.

Before approval, staging may add only missing assets. Every already present asset must have the exact approved name, ID where preserved, size, and hash; otherwise the staging transaction quarantines. An approved draft is immutable by policy: it cannot gain, remove, rename, replace, or alter an asset or setting after approval. If staging needs change after approval, reject the transaction and begin a new candidate/staging/approval cycle.

The concurrency key is repository numeric ID + corpus version + tag. `cancel-in-progress` is false. Promotion uses idempotency key:

```text
candidateDigest + approvalDigest + tag
```

After any unknown GitHub API result, a workflow queries by numeric IDs and stable identity fields. It never blindly retries a mutation. If exact published state is found, it resumes at verification. If exact staged state is found, it resumes from the appropriate guarded preflight. Any mismatch quarantines. “Not sure whether it worked” is never evidence to recreate a Release, upload a second asset, retarget a tag, or publish another draft.

Tag and publish are not claimed atomic. The promotion event sequence records each observation. The corpus tag is an explicitly created annotated tag pointing to source/spec commit S. It is distinct from the local historical webOS baseline tag `baseline/webos-2026-08-09`. The corpus tag cannot be a lightweight tag, a moved tag, or the baseline tag.

A published Release verification failure immediately creates an additive revocation event/record, preserves all history and published facts, and requires a new corpus version for corrected bytes. It does not redraft, edit the prior Release, reuse approval, or replace Release assets. Cleanup may remove only unapproved disposable scratch/staging objects whose identity is confirmed; it cannot touch approved, quarantined, revoked, or published objects.

## 23. Release verification, receipts, and revocation

Public verification is independent from candidate generation and promotion. It obtains the public Release through the GitHub API and public asset endpoints, verifies immutable Release behavior where supported, downloads declared public assets under byte/hash limits, and checks:

- repository numeric ID and expected repository identity;
- annotated corpus tag name, object type, annotation, and target S;
- public Release numeric ID, name, state, publication settings, and immutable status;
- asset numeric IDs, names, byte sizes, content hashes, and archive hash;
- content lock, candidate, staging, approval, and receipt domain hashes;
- detached owner signature from Git blob bytes;
- workflow/attestation identity and verification result;
- exact correspondence between public Release assets and approved staging assets;
- absence of a post-publication draft transition or mutable asset substitution.

The release receipt contains stable final facts only. It does not contain polling attempts, transient HTTP errors, retry counters, or timestamps whose only purpose is operational observation. Those belong in append-only event records.

Published Releases never return to draft. Corrections create a new corpus version with a new tag, candidate, staging receipt, owner approval, published Release, receipt, and verification record. Revocation is additive: it identifies the revoked Release and reason, does not alter its historical receipt, and directs consumers to a later corrected version when one exists.

A Release can be technically valid while a project feature remains unproven. Verification must state that it verifies corpus provenance and bytes only, not Android/device/backend/product success.

## 24. Testing strategy

Implementation must use test-driven development for the tooling. The test suite is organized by trust boundary and includes intentionally invalid fixtures under `tools/playback-corpus/fixtures-invalid/`.

Required test coverage:

- JSON schema, unknown-field rejection, duplicate-key rejection, JCS canonicalization, domain hashing, no-self-hash rules, and schema-version migration behavior.
- Registry sentinel uniqueness, UTF-8 no-BOM/LF enforcement, exact byte-range extraction, `specDigest`, raw Markdown hash, prior-document hash, exact 24/13/32 counts, class vocabulary, and ID-reference checks.
- Normalized path, URI, DNS/IP policy, archive-entry, file-type, depth, count, size, case-collision, traversal, symlink/hardlink, sparse-file, and byte-range tests.
- Closure resolution, cycles, HLS tag allowlist, DASH concretization, shared-object explicit reference, fault containment, local-live state transitions, and `NP-HLS-008` delay-state transitions.
- Recipe normalization, source-lock validation, encoder capability detection, software-only enforcement, fixed-thread/environment enforcement, deterministic archive projection, and archive budget checks.
- Oracle parsing, normalized `ffprobe` projection, subtitle/audio cue evidence, decoded synthetic-signal checks, negative fixture rules, and forbidden-collateral-fault checks.
- Licence/provenance completeness for all 24 media rows and publication blocking for any missing or unresolved redistribution decision.
- Append-only event transitions, absorbing disposition behavior, direct-parent approval commit validation, approval field binding, SSH signature namespace/principal/allowed-signers/rotation/revocation checks, and Git blob byte verification.
- GitHub API adapters using recorded responses and fault injection: unknown outcomes, duplicate retry prevention, missing/changed assets, stale draft mutation, tag collision, partial failure, published-state recovery, and quarantine.
- Capability probe end-to-end under the actual repository configuration.
- Container capability tests and tiny PR smoke generation with no secrets and no authoritative publication outputs.
- Full protected candidate, stage/approval/promotion/reconciliation fault injection, concurrent promotion, immutable Release behavior, attestation verification, and independent public verification.
- Tests that assert absence of device claims. No fixture-validator success is permitted to produce Android, Media3, WebView, codec-support, lifecycle, Cast, download, or performance success language.

The smoke corpus is intentionally small and non-authoritative. It proves code paths, not the 24-row corpus. Full candidate results are required before staging.

## 25. Acceptance gates

A corpus version may proceed only when every prior gate passes:

1. **Design and registry gate:** dedicated final written approval is committed, then Plan 1 atomically integrates active plan, requirements, device policy, corpus registry, baseline wording, and decision statuses; registry is valid and exactly 24/13/32.
2. **Toolchain gate:** source-build container, locks, licences, action pins, execution-envelope capture, and deterministic control-artifact tests pass.
3. **Fixture gate:** every media row has a valid closure, recipe/provenance, immutable oracle reference, semantic validation, and archive-budget inclusion.
4. **Legal gate:** every media row has a recorded source/tool licence, patent caveat, redistribution basis, required notices, and owner decision; no unresolved row remains.
5. **Candidate gate:** protected candidate from S produces exact bytes, non-authoritative proposed lock, candidate manifest, archive, reports, and attestation in one run.
6. **Capability gate:** the GitHub capability probe passes under actual settings with no missing mandatory capability.
7. **Staging gate:** protected stage revalidates candidate artifacts and records exact durable draft asset facts in a staging receipt.
8. **Evidence gate:** E copies proposed lock bytes unchanged to the normative content-lock path and records staging evidence.
9. **Approval gate:** owner approval/signature commit A directly follows E, is path-limited, and verifies against allowed signers.
10. **Promotion gate:** protected environment and independently repeated preflight confirm approved identity, create corpus tag T -> S, and publish only approved draft metadata.
11. **Receipt proposal gate:** public verifier reconciles facts and emits proposed receipt plus separate report.
12. **Receipt verification gate:** R copies proposed bytes unchanged; independent post-commit verification checks the Git blob/public facts and appends `RECEIPT_VERIFIED`.
13. **Phase 1 closure gate:** all non-corpus Phase 1 obligations are independently complete. Corpus success alone cannot close Phase 1.

Any failure stops at the current gate. No requirement is waived by a green workflow, successful generation, draft existence, owner signature, or public Release.

## 26. Corrected Phase 1 sequencing

The proposed corrected sequence becomes authoritative only after written approval and Plan 1 integration:

1. Commit final written design approval record, then atomically integrate normative files before tooling.
2. Host tests/build and independent pre-source review.
3. Selective source/spec/tooling commit S, containing no authoritative content lock.
4. Candidate generates exact bytes and proposed lock in one run.
5. Stage exact candidate bytes and proposed lock unchanged.
6. Reverify staging against the proposed lock.
7. E copies proposed lock bytes unchanged to the normative content-lock path.
8. Owner approval/signature direct-child commit A.
9. Promotion creates corpus tag T -> S and publishes exact approved draft.
10. Public verifier creates proposed receipt and separate report.
11. R copies proposed receipt bytes unchanged.
12. Independent post-commit verifier appends `RECEIPT_VERIFIED`.
13. Local annotated webOS baseline tag on historical SHA, with no implicit push.
14. Final corpus verification plus `npm test` plus `npm run build`.
15. Independent closure review with zero Critical/Important findings.
16. Selective closure commit C.
17. Post-commit verification, then Phase 1 CLOSED.

The corpus tag T and the webOS baseline tag are different objects with different targets and meanings. T is an explicitly annotated corpus publication tag pointing to source/spec commit S. `baseline/webos-2026-08-09` is a local annotated historical rollback baseline on `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`; it is not a corpus tag, published Release tag, shipped release claim, or device-verification claim.

## 27. Explicit non-claims

The following statements are prohibited in tooling output, documentation, Release notes, receipts, attestations, or verification reports unless separately established outside this corpus design:

- “The corpus proves Android playback.”
- “The corpus proves Media3, WebView, MSE, or native playback support.”
- “The corpus proves a codec is supported on Android devices.”
- “The corpus proves lifecycle, PiP, background audio, notification, download, Cast, or cancellation behavior.”
- “The corpus proves provider compatibility, CORS behavior, cleartext reachability, or IPTV interoperability.”
- “The corpus is both private and immutable storage” in reference to a GitHub draft Release.
- “The Release is legal clearance,” “patent-cleared,” “warranted,” or equivalent.
- “A successful fixture decode proves product support.”
- “A host build, corpus build, or Release verification proves Android device success.”
- “Phase 1 is closed” before every Phase 1 gate in Section 26 is independently fulfilled.

The corpus may state only fixture integrity, content identity, provenance/approval evidence, Release identity, and verification results within the explicitly recorded envelope.

## 28. Risks and mitigations

| Risk | Mitigation | Stop/reassess threshold |
|---|---|---|
| GitHub feature or plan mismatch | Hard capability probe against actual settings before staging | Any mandatory probe capability absent, ambiguous, or unenforced |
| Draft mutation by privileged actor | Exact staging asset IDs/hashes, direct binding in owner approval, protected promotion recheck, approved-draft immutability rule | Any post-approval draft difference |
| Action or runner drift | Full-SHA action pins, container/runner envelope recording, source locks, deterministic control-artifact rebuild | Any unpinned input or control-artifact mismatch |
| Source-build and patent/licensing risk | Per-row provenance/licence/redistribution review; owner approval separate from generation | Any one of 24 rows lacks a defensible recorded basis |
| Non-bit-identical encoders | Dual-mode reproducibility, semantic oracles, new lock/approval after deliberate change | Unexplained encoded-byte difference or control artifact difference |
| Parser vulnerability | Rootless sandbox, no network, regular-file-only, strict bounds, invalid-fixture testing | Sandbox escape indicator, bound violation, unsafe archive form, or parser crash |
| Public-vector disappearance or licence change | Synthetic-first policy, retrieved hash/provenance, revalidation, no hidden URL dependence | Referenced bytes unavailable, changed, or licence basis invalid |
| Archive growth | Row budgets, aggregate archive/extraction limits, early budget validation | Any mandatory corpus exceeds limits without owner-approved redesign |
| GitHub API partial failure | Numeric IDs, idempotency key, query-before-retry, append-only quarantine | Unknown mutation outcome not reconciled exactly |
| Owner key compromise | Versioned allowed signers, validity/rotation/revocation, detached signatures, revocation events | Signature-policy anomaly, key compromise report, or invalid signer |
| Overbuilding infrastructure before Android value | Bounded tooling scope, no generator-image publication, one implementation plan split into testable tasks | Tooling expansion that does not advance a listed acceptance gate |
| Two-person maintenance burden | Explicit ownership, readable schemas, small focused modules, capability probe, documented recovery | Maintainers cannot independently perform verification/recovery |
| Misread corpus success as product success | Explicit non-claims and device-claim tests | Any report/release language implies product/device proof |
| Sensitive-data leakage | Synthetic-only preference, acquisition controls, redaction policy, logs/asset scanning | Any provider/private/tester/credential data appears |

## 29. Implementation boundaries

This document is intentionally focused enough for one implementation plan, but implementation should be decomposed into independently reviewable workstreams rather than a single large change:

1. Registry extraction/migration and strict schemas.
2. Deterministic container/toolchain and synthetic primitive/recipe generation.
3. Closure resolver, oracle engine, archive packager, and local-live test server.
4. Content lock/candidate/provenance/licence generation and validation.
5. Capability probe, GitHub API adapter, workflow definitions, and attestations.
6. Staging/approval/promotion/state-machine/recovery implementation.
7. Independent verification, receipts/revocation, and full fault-injection test suite.

All work remains under `tools/playback-corpus/`, `docs/android/`, `fixtures/playback-corpus/`, and `.github/workflows/` as specified in Section 6. It must not refactor `src/main.ts`, implement Android product behavior, alter provider handling, publish an image, or create public corpus artifacts before the gates permit it.

A later implementation plan may refine file names under each logical directory, but must not alter approved identity counts, artifact authority boundaries, privilege separation, hash domains, approval semantics, or publication safety rules without an owner-approved design revision.

## 30. Design approval record

### Future committed design-approval record

The future `docs/android/specs/2026-08-09-playback-corpus-design-approval.md` binds exact corrected design commit SHA, design Git blob ID and raw SHA-256, owner identity/statement, date, 17-decision approval reference, authority to create implementation plans, and the statement that Plan 1 normative integration remains incomplete. It is not created by this correction.

| Record | Current value |
|---|---|
| Interactive approval | All 17 decisions and four design sections approved in conversation |
| Written-spec approval | Pending final owner review |
| Repository normative authority | Pending approval record and Plan 1 atomic integration |
| Registry authority | Current corpus document remains authoritative and does not yet contain 24/13/32 |
| Corpus tooling authority | None granted by this proposal |
| Phase status | OPEN |
| Implementation state | Not started |
| Closure effect | None |

### Exact media IDs

| Family | IDs |
|---|---|
| HLS | `NP-HLS-001`, `NP-HLS-002`, `NP-HLS-003`, `NP-HLS-004`, `NP-HLS-005`, `NP-HLS-006`, `NP-HLS-007`, `NP-HLS-008`, `NP-HLS-009`, `NP-HLS-010` |
| DASH | `NP-DASH-001`, `NP-DASH-002`, `NP-DASH-003`, `NP-DASH-004` |
| MPEG-TS | `NP-TS-001`, `NP-TS-002`, `NP-TS-003`, `NP-TS-004`, `NP-TS-005` |
| Progressive | `NP-PROG-001`, `NP-PROG-002`, `NP-PROG-003`, `NP-PROG-004` |
| FLV | `NP-FLV-001` |

Media count: **24**. Origin count: **19 existing + 5 new**. Feature/lifecycle identifiers are not media identities.

### Exact feature IDs

| Family | IDs |
|---|---|
| Downloads | `NP-DL-001`, `NP-DL-002`, `NP-DL-003`, `NP-DL-004` |
| Cast | `NP-CAST-001`, `NP-CAST-002`, `NP-CAST-003` |
| Errors | `NP-ERR-001`, `NP-ERR-002`, `NP-ERR-003`, `NP-ERR-004` |
| Cancellation aliases | `NP-CANCEL-001`, `NP-CANCEL-002` |

Feature count: **13**. `NP-CANCEL-001` consumes only `NP-LIFE-031`; `NP-CANCEL-002` consumes only `NP-LIFE-032`. Neither schedules an execution, duplicates a lifecycle execution, or independently passes.

### Exact lifecycle IDs, meanings, and anchors

| ID | Exact meaning | Anchor(s) |
|---|---|---|
| `NP-LIFE-001` | App backgrounds to Home during VOD; audio continues uninterrupted, position advances, video decode may stop | `NP-HLS-001` |
| `NP-LIFE-002` | App backgrounds to Home during live playback; audio continues uninterrupted | `NP-HLS-003` |
| `NP-LIFE-003` | Foreground after VOD background audio; synchronized video rejoins current audio and selected audio/text tracks are preserved | `NP-HLS-001` |
| `NP-LIFE-004` | Foreground after live background audio; synchronized video rejoins current live playback and selected audio/text tracks are preserved | `NP-HLS-003` |
| `NP-LIFE-005` | Screen off/on during VOD; audio continues while off and video resumes synchronized when on | `NP-HLS-001` |
| `NP-LIFE-006` | Screen off/on during live playback; live audio continues while off and video resumes synchronized when on | `NP-HLS-003` |
| `NP-LIFE-007` | Activity recreation during VOD; survives or resumes within 2s without restarting from zero and preserves selected tracks | `NP-HLS-001` |
| `NP-LIFE-008` | Activity recreation during live playback; survives or resumes within 2s at current live position and preserves selected tracks | `NP-HLS-003` |
| `NP-LIFE-009` | VOD process death and relaunch; no automatic playback, return to item detail, offered resume no more than 10s stale | `NP-HLS-001` |
| `NP-LIFE-010` | Process death while backgrounded; notification removed and no zombie audio, with separate VOD/live outcomes | `NP-HLS-001` + `NP-HLS-003` |
| `NP-LIFE-011` | Transient audio-focus loss; pause then resume only when focus returns, separate VOD/live outcomes | `NP-HLS-001` + `NP-HLS-003` |
| `NP-LIFE-012` | Permanent audio-focus loss; pause and stop, never automatically resume, separate VOD/live outcomes | `NP-HLS-001` + `NP-HLS-003` |
| `NP-LIFE-013` | Becoming noisy/headphones unplugged; pause immediately, separate VOD/live outcomes | `NP-HLS-001` + `NP-HLS-003` |
| `NP-LIFE-014` | VOD media notification; correct title, artwork, play/pause/stop, and position | `NP-HLS-001` |
| `NP-LIFE-015` | Lock-screen metadata and controls; correct metadata and working play/pause/stop | `NP-HLS-001` |
| `NP-LIFE-016` | Headset/Bluetooth controls; play, pause, stop honored, separate VOD/live outcomes | `NP-HLS-001` + `NP-HLS-003` |
| `NP-LIFE-017` | Live media notification; correct metadata and play/pause/stop, no seek affordance | `NP-HLS-003` |
| `NP-LIFE-018` | PiP auto-entry on Home/recents during VOD; video continues in PiP | `NP-HLS-001` |
| `NP-LIFE-019` | PiP controls/presentation; play/pause works and aspect ratio is correct | `NP-HLS-001` |
| `NP-LIFE-020` | Restore from PiP; same playback position and selected audio/text tracks | `NP-HLS-001` |
| `NP-LIFE-021` | PiP exit while still backgrounded; transition to background audio rather than stop | `NP-HLS-001` |
| `NP-LIFE-022` | Stopped or errored player; PiP is not entered or offered | `NP-HLS-001` plus explicit stopped/error state |
| `NP-LIFE-023` | VOD network loss; detected within 10s with explicit connection-lost state and never indefinite spinner | `NP-HLS-001` |
| `NP-LIFE-024` | VOD network restoration; one automatic resume at last position, then manual retry affordance | `NP-HLS-001` |
| `NP-LIFE-025` | Live network loss; detected within 10s with explicit connection-lost state | `NP-HLS-003` |
| `NP-LIFE-026` | Live network restoration; one automatic reconnect at live edge, then manual retry affordance | `NP-HLS-003` |
| `NP-LIFE-027` | Wi-Fi/cellular change during VOD; loss then restoration at last position | `NP-HLS-001` |
| `NP-LIFE-028` | Wi-Fi/cellular change during live playback; loss then reconnect at live edge | `NP-HLS-003` |
| `NP-LIFE-029` | Android system Back in player; closes player/restores previous view, separate VOD/live outcomes | `NP-HLS-001` + `NP-HLS-003` |
| `NP-LIFE-030` | Android system Back at root view; backgrounds app and never shows a blank screen | none |
| `NP-LIFE-031` | Cancel A during manifest load, then start B; no stale callback, state, or audio from A; B starts successfully | `NP-HLS-008` |
| `NP-LIFE-032` | Cancel A during playback, then start B; no stale callback, state, or audio from A; B starts successfully | `NP-HLS-008` |

Lifecycle count: **32**. A `+` anchor requires independently recorded results for every listed media anchor. The table fixes future runtime meanings; it does not assert they have been implemented or proven.

**Design status conclusion:** all 17 decisions and four design sections were approved interactively, but this corrected written specification awaits final owner approval and its committed approval record before authorizing implementation planning. It never becomes the 24/13/32 registry; Plan 1 must atomically integrate normative files before tooling. Phase 1 remains **OPEN**.
