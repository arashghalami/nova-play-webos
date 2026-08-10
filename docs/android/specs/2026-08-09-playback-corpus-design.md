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

### 11.6 Closed reproducibility artifact registry

This is the closed registry of every artifact schema/type in this design. An artifact has exactly one `artifactClass`; no artifact may be “other,” inferred into a class, or assigned to two classes. Schema validation enumerates these artifact names and classes. The registry validator computes the set of artifact schema/type names and requires exact set equality with the names below, then requires exactly one matching row per name. A missing, extra, duplicate, or cross-class name fails with `ARTIFACT_CLASS_MEMBERSHIP`. The contract/golden tests enumerate every schema/type and prove exact one-class membership.

For `deterministic-control`, the equality rule is `raw-byte` for exact files/binary objects and `JCS-byte` for strict structured objects. The required identity is the named raw or domain field in the final column. Permitted inputs are exhaustive; ambient time, hostname, locale, filesystem iteration order, random state, mutable network facts, run identity, and every input not named in the row are forbidden.

| Artifact name (`deterministic-control`) | Canonical source bytes | Equality | Only permitted influences | Required identity |
|---|---|---|---|---|
| normative registry extracted payload | Full strict registry RFC 8785 JCS | JCS-byte | approved registry JSON and schema version | `specDigest` |
| complete normative Markdown source | Complete UTF-8, no-BOM, LF-only file through EOF | raw-byte | approved Markdown bytes when raw bytes are a declared input | `rawMarkdownSha256` |
| JSON Schema | Exact UTF-8 schema file | raw-byte | approved schema source | `schemaHash` |
| schema lock | Full strict path-sorted lock JCS | JCS-byte | schema paths, sizes, and `schemaHash` values | `schemaLockHash` |
| hash registry | Full strict registry JCS | JCS-byte | approved hash-row definitions and registry version | `hashRegistryDigest` |
| recipe | Full strict recipe JCS | JCS-byte | registry binding, fixed recipe parameters, tool capabilities | `recipeHash` |
| recipe-set manifest | Recipe-ID UTF-8-byte-sorted strict JCS | JCS-byte | recipe IDs, versions, and `recipeHash` values | `recipeSetHash` |
| synthetic source definition | Full strict source-definition JCS | JCS-byte | approved primitive parameters and fixed seed | `sourceDefinitionHash` |
| deterministic generated source primitive | Exact generated primitive bytes | raw-byte | bound source definition and pinned generator | `primitiveHash` |
| primitive-set manifest | Normalized-path UTF-8-byte-sorted strict JCS `{path,size,primitiveHash}` array | JCS-byte | deterministic generated source primitives only | `primitiveSetHash` |
| source/toolchain lock | Full strict lock JCS | JCS-byte | pinned source, compiler, ABI, configure, licence, and capability inputs | `toolchainHash` |
| container Dockerfile | Exact UTF-8 Dockerfile | raw-byte | approved build stages and pinned base identity | `containerHash` |
| pinned patch | Exact patch bytes | raw-byte | approved patch source | `patchHash` |
| tool capability requirements | Full strict requirements JCS | JCS-byte | approved capability predicates | `capabilityRequirementsHash` |
| semantic oracle definition | Full strict oracle JCS | JCS-byte | registry semantics and fixed oracle rules | `oracleHash` |
| generated HLS manifest | Exact emitted UTF-8 playlist bytes | raw-byte | fixed objects, recipe, and machine projection | `manifestHash` |
| generated DASH manifest | Exact emitted UTF-8 MPD bytes | raw-byte | fixed objects, recipe, and machine projection | `manifestHash` |
| HLS-live machine definition | Full `nova-play-hls-live-v1` strict JCS | JCS-byte | fixed machine policy, recipe, and objects | `machineDefinitionHash` |
| DASH-live machine definition | Full `nova-play-dash-live-v1` strict JCS | JCS-byte | fixed machine policy, recipe, and objects | `machineDefinitionHash` |
| delay-machine definition | Full `nova-play-hls-delay-v1` strict JCS | JCS-byte | fixed machine policy, recipe, and objects | `machineDefinitionHash` |
| canonical machine conformance trace | Full canonical trace JCS | JCS-byte | machine definition and canonical event input | `traceHash` |
| signing policy artifact | Full strict policy JCS | JCS-byte | prior valid policy, protected transition authorization, fixed scope/keys | `signingPolicyDigest` |
| publication policy artifact | Full strict publication-policy JCS | JCS-byte | approved immutable publication rules | `immutableReleasePolicyHash` |
| incident policy artifact | Full strict S-bound incident-policy JCS | JCS-byte | approved pre-E proposal/finalization authorities | `incidentPolicyDigest` |
| signing-policy schema | Exact UTF-8 schema file | raw-byte | approved schema source | `schemaHash` |
| revocation-policy schema | Exact UTF-8 schema file | raw-byte | approved schema source | `schemaHash` |
| lock-listed regular-file object | Exact regular-file bytes | raw-byte | fixed source/recipe/toolchain inputs | `objectSha256` |
| closure tuple projection | Fully ordered closure-tuple array JCS | JCS-byte | lock-listed tuples only | `closureHash` |
| proposed content lock | Full strict JCS with no trailing newline | JCS-byte | registry, objects, closures, recipes, oracles, archive and legal records | `lockDigest` and `lockRawSha256` |
| E-committed content lock | Exact byte-copy of proposed content lock | raw-byte | proposed content-lock bytes only | `lockDigest` and `lockRawSha256` |
| deterministic archive projection | Fully ordered archive-projection JCS | JCS-byte | exact lock-listed object set and packaging policy | `archiveProjectionHash` |
| deterministic archive | Exact canonical compressed archive bytes | raw-byte | exact archive projection, object bytes, pinned packager/compressor | `archiveSha256` |
| stable licence/provenance source record | Full strict record JCS | JCS-byte | fixed declared source, licence, notice, caveat, and redistribution inputs | `licenceHash` |
| owner approval record | Full exact signed approval JCS with no trailing newline | JCS-byte | candidate/staging/publication bindings, applicable policies, owner statement, signer identity, informational `signedAt` | externally computed `approvalDigest` |
| proposed Release receipt | Full strict canonical JCS with no trailing newline; identity fields are external and absent from these bytes | JCS-byte | fixed verified final public-fact snapshot and bound transaction | externally computed `receiptDigest` and `receiptRawSha256` |
| R-committed Release receipt | Exact byte-copy of proposed Release receipt; identity fields remain external | raw-byte | proposed Release-receipt bytes only | externally computed `receiptDigest` and `receiptRawSha256` |

`proposed-release-receipt.json` and the byte-identical R receipt are therefore `deterministic-control`; the observations used to verify them are separate `run-evidence`.

For `deterministic-public-fact`, JCS bytes are deterministic from one fixed external fact snapshot but that snapshot can differ by transaction. Every row uses full strict RFC 8785 JCS, schema-declared member names, and JCS member ordering. Once committed or approved, its exact bytes are fixed. Source APIs are repository-numeric-ID-bound GitHub REST/GraphQL responses and Git object/tree/blob reads at the declared immutable ref; normalization retains only the exact fields named by the owning schema, converts API integer identities to JSON integers, preserves API UTF-8 strings exactly, sorts set-like arrays by their schema key using UTF-8 bytes or numeric order, and represents absent nullable fields as `null`. HTTP headers, request IDs, pagination cursors, ETags, rate limits, polling/retry counts, response time, wall-clock observation time, and diagnostics are excluded transient observations.

| Artifact name (`deterministic-public-fact`) | Exact source facts and normalization | Equality | Required identity |
|---|---|---|---|
| staging receipt | One draft Release/asset snapshot by repository, numeric Release ID, and numeric asset IDs; normalize exact schema fields and planned publication projection | JCS-byte after approval/E | `stagingDigest` |
| final Release receipt facts before byte-copy to R | One public immutable Release/tag/asset snapshot plus bound candidate/approval facts; normalize exact receipt schema fields | JCS-byte before construction of deterministic proposed receipt | `publicReleaseFactsDigest` |
| revocation record | Protected-tree record, selector facts, authority, and exact signature-bound policy sequence | JCS-byte after protected commit | `revocationDigest` |
| immutable GitHub capability-probe fact record | Named API/probe evidence at repository numeric ID and configuration snapshot; normalize declared immutable result fields | JCS-byte after approval | `capabilityProbeDigest` |
| public Release/tag/asset projection | Exact Git tag object and GitHub Release/asset API identity fields declared by publication schema | JCS-byte after publication | `publicReleaseProjectionDigest` |

`run-evidence` bytes may differ. Each stable binding projection is strict JCS. Mandatory identity fields may never be omitted from that projection; permitted variation is limited to the row’s listed fields; every other exclusion is forbidden. Equivalence means byte equality of the complete stable binding projection, except that candidate identity is intentionally distinct for every rerun.

| Artifact name (`run-evidence`) | Mandatory stable binding projection | Permitted run-varying fields | Equivalence rule |
|---|---|---|---|
| candidate manifest | Repository owner/name/numeric ID; source commit; workflow path/blob; run ID/attempt; numeric artifact IDs/names/sizes/digests; attestation subject/issuer/signer; runner/OCI/toolchain/recipe/oracle/schema/policy/proposed-lock/archive/report/evidence identities; transaction/attempt | observation times and bounded diagnostics only | Complete projection JCS equality; a rerun is never equivalent |
| provenance attestation envelope | Candidate identity; subject names/digests; predicate type; issuer; signer workflow identity; deterministic materials | envelope signature bytes and informational signed/observed time | Complete projection JCS equality |
| validation report | Candidate/transaction/attempt/run identity; validator/schema/oracle/policy versions; ordered checks/results; deterministic input/output identities | start/end/observation time and bounded diagnostics | Complete projection JCS equality |
| candidate observation | Candidate/transaction/attempt/run identity and named observed artifact/GitHub facts | observation time and bounded diagnostics | Complete projection JCS equality |
| staging observation | Candidate/transaction/attempt; numeric Release/asset identities and observed fields | polling count, observation time, bounded diagnostics | Complete projection JCS equality |
| promotion observation | Candidate/approval/transaction/attempt; tag/Release/asset identities and mutation result | polling count, observation time, bounded diagnostics | Complete projection JCS equality |
| verification observation | Candidate/approval/receipt/transaction/attempt and exact observed public identities | polling count, observation time, bounded diagnostics | Complete projection JCS equality |
| event proposal | Event/corpus/transaction/attempt identity, proposed state/disposition, actor/authority, expected chain tip, and all evidence references | informational observation time and bounded diagnostics | Complete proposal projection JCS equality |
| finalized append-only event | Event/corpus/transaction/attempt identity plus final sequence/prior digest/filename and complete proposal evidence | informational observation time only | Complete finalized-event projection JCS equality |
| incident | Corpus/transaction/attempt, actor/authority, subject identities, policy/check versions, findings and disposition | run/attempt observation time and bounded diagnostics | Complete projection JCS equality |
| detached owner signature | Approval digest, exact signer principal/namespace/full key ID, signature algorithm and signature bytes | signature nonce/material inherent to a distinct approval | Exact signature bytes plus binding projection equality |
| owner approval informational signed time | Approval digest and `signedAt` value | `signedAt` between distinct approvals only | Exact signed approval JCS equality; time grants no authority |
| workflow log | Repository/source/workflow/run/attempt/transaction and subject artifact identities | ordered log messages and timestamps subject to redaction | Binding projection equality; log bytes need not match |
| diagnostic record | Repository/source/workflow/run/attempt/transaction, check ID and subject identities | bounded diagnostic detail and observation time | Binding projection equality |

Candidate comparison must never exclude repository identity, source commit, workflow path/blob, run ID, run attempt, numeric artifact IDs, artifact digests, or attestation subject/issuer/signer identity. A rerun is a distinct candidate even when all deterministic content matches. No comparison may use a reduced projection that drops one of those fields.

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
| `receiptDigest` | SHA-256, `nova-play:receipt:v1` | Exact proposed-receipt JCS bytes | lowercase hex |
| `receiptRawSha256` | SHA-256, raw | Exact proposed-receipt file bytes; canonical JCS with no trailing newline | lowercase hex |
| `closureHash` | SHA-256, `nova-play:closure:v1` | Totally ordered closure-tuple JCS | lowercase hex |
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
| `stateDigest` | SHA-256, `nova-play:machine-state:v1` | RFC 8785 JCS of the complete resulting state in a transition result/response | lowercase hex |
| `priorStateDigest` | SHA-256, `nova-play:machine-state:v1` | RFC 8785 JCS of the complete state before one trace transition | lowercase hex |
| `resultingStateDigest` | SHA-256, `nova-play:machine-state:v1` | RFC 8785 JCS of the complete resulting state embedded separately in a trace row | lowercase hex |
| `bodyObjectSha256` | SHA-256, raw | Exact response-body object bytes | lowercase hex |
| `rawSha256` | SHA-256, raw | Exact bytes of the separately named file in a path-bound projection tuple | lowercase hex |
| `priorPolicyBlobHash` | SHA-256, raw | Exact content bytes of the immediately preceding policy-history Git blob, excluding the Git object header | lowercase hex |
| `priorRevocationDigest` | SHA-256, `nova-play:revocation:v1` | RFC 8785 JCS of the complete immediately preceding revocation object | lowercase hex |
| `approvalDigests` item | SHA-256, `nova-play:approval:v1` | RFC 8785 JCS of one exact signed approval object | lowercase hex |
| `receiptDigests` item | SHA-256, `nova-play:receipt:v1` | RFC 8785 JCS of one exact receipt object | lowercase hex |
| `actionsArtifactDigest` | GitHub Actions API-declared algorithm | Exact bytes of the named numeric Actions artifact | algorithm-qualified |
| `hashRegistryDigest` | SHA-256, `nova-play:hash-registry:v1` | Full strict hash-registry JCS excluding this externally computed value | lowercase hex |
| `sourceDefinitionHash` | SHA-256, `nova-play:source-definition:v1` | Full strict synthetic-source-definition JCS | lowercase hex |
| `patchHash` | SHA-256, raw | Exact pinned patch bytes | lowercase hex |
| `capabilityRequirementsHash` | SHA-256, `nova-play:capability-requirements:v1` | Full strict capability-requirements JCS | lowercase hex |
| `signingPolicyDigest` | SHA-256, `nova-play:signing-policy:v1` | Full strict signing-policy JCS without externally computed digest | lowercase hex |
| `incidentPolicyDigest` | SHA-256, `nova-play:incident-policy:v1` | Full strict S-bound incident-policy JCS | lowercase hex |
| `publicReleaseFactsDigest` | SHA-256, `nova-play:public-release-facts:v1` | Normalized final public-fact snapshot JCS | lowercase hex |
| `capabilityProbeDigest` | SHA-256, `nova-play:capability-probe:v1` | Immutable capability-probe fact-record JCS | lowercase hex |
| `publicReleaseProjectionDigest` | SHA-256, `nova-play:public-release-projection:v1` | Strict public Release/tag/asset projection JCS | lowercase hex |
| `eventProposalDigest` | SHA-256, `nova-play:event-proposal:v1` | Full strict event-proposal JCS with no final chain fields | lowercase hex |
| `hashRegistryVersion` | not a digest | Literal `nova-play-hash-registry-v1` | UTF-8 string |

The registry version is `nova-play-hash-registry-v1`. This table is the closed hash interoperability registry. Every `*Hash`, `*Digest`, Git ID, OCI digest, attestation digest, signature input, policy/event/revocation/proposal/trace, raw document, schema, recipe, tool/source, object, closure, archive, report, licence, receipt, and workflow identity field in every artifact schema must occur exactly once as a row. Each row fixes exact field name, owner artifact/schema, algorithm, domain/version or `raw`, exact bytes/projection, canonicalization, output encoding, embedded-versus-external computation, equality use, and prohibited self-reference; where this compact table shares a field across multiple owners, the owning schema enumerates those owners without creating another field row. Schema-to-registry and registry-to-schema validation is bidirectional: an identity field absent from this registry or a registry field absent from every owning schema fails. Every row has golden input bytes and expected output; native Git, OCI, Actions, subject, and attestation identifiers remain algorithm-qualified and are never coerced to project SHA-256.

All project SHA-256 values are lowercase 64-character hexadecimal. Generic `hash`, `domain hash`, or untyped `artifactDigests` members are forbidden. Object identity is always `objectSha256`. Git identity is the pair `gitObjectFormat`/`gitObjectId`; workflow identity additionally records raw `workflowBlobHash`. Every domain row is externally computed unless its owner schema explicitly embeds a reference to a separately stored object. No object hashes itself; every schema forbids its own identity field in the hashed projection. The approval signature input is exact approval JCS with no trailing newline.

A closure hash is the domain hash of a JCS array sorted by this total key, with no locale or default string collation: (1) normalized path UTF-8 bytes lexicographically; (2) the fixed role ordinal `manifest=0`, `playlist=1`, `mpd=2`, `init=3`, `segment=4`, `media=5`, `subtitle=6`, `fault=7`, `config=8`; (3) full-object tuple before ranged tuple; (4) numeric byte-range offset ascending; and (5) numeric byte-range length ascending. Two tuples still identical after all five keys are rejected. Every tuple includes:

```json
{
  "path": "lowercase/posix/path",
  "role": "manifest|playlist|mpd|init|segment|media|subtitle|fault|config",
  "size": 0,
  "objectSha256": "lowercase-64-hex",
  "byteRange": { "offset": 0, "length": 0 }
}
```

`byteRange` is either a valid explicit object with non-negative integer offset and positive integer length, or `null` for full-object identity. It is never inferred from a URL range header. The closure projection rejects a range beyond the declared regular-file size. Golden vectors cover every hash-registry row and closure ordering edges: UTF-8 path prefixes, every adjacent role ordinal, full versus range, offsets `2` versus `10`, equal offsets with differing lengths, and exact duplicates.

The receipt identity binding uses both externally computed fields: `receiptDigest`, the receipt-domain hash over exact proposed-receipt JCS bytes, and `receiptRawSha256`, raw SHA-256 over the exact proposed-receipt file bytes. Neither field is embedded in the proposed or R receipt, so neither hashes itself. The proposed-receipt report, event proposal, finalized event, approval/publication binding where applicable, and R verification evidence carry these fields. Although canonical JCS with no trailing newline makes their bound byte sequence identical, the algorithms/projections remain distinct. R copies those exact bytes. The post-commit verifier proves the R Git blob bytes have `receiptRawSha256`, recomputes `receiptDigest`, validates public facts against the receipt, and validates proposed-receipt/report references.

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

### 14.1 Total executable media-machine contract

The three machine IDs and versions are exactly `nova-play-hls-live-v1`, `nova-play-dash-live-v1`, and `nova-play-hls-delay-v1`. Each machine definition is strict canonical JCS and contains strict schemas for its definition, canonical initial state, event input, pending entry, response, result, and trace; a finite closed event alphabet; a total transition function over every valid state/event pair; and all bounds. Unknown fields or enum values fail schema validation.

The canonical initial state is the strict object `{"logicalTick":0,"loopsRemaining":<loopCount>,"nextRequest":0,"pending":{},"releaseCount":0,"requestCount":0,"segmentSequence":0,"terminal":false,"windowStart":0}`. All numeric values are bounded non-negative integers. Machine policy declares positive integer `segmentCount`, `windowWidth`, `maximumEvents`, `maximumTick`, `maximumRequests`, `maximumPending`, `maximumReleaseAfter`, and `maximumReleaseCount`, plus non-negative integer `loopCount`. Exceeding any bound returns the named deterministic failure (`EVENT_LIMIT`, `TICK_LIMIT`, `REQUEST_LIMIT`, `PENDING_LIMIT`, `RELEASE_LIMIT`, or `LOOP_LIMIT`) with no unlisted mutation.

The finite event alphabet is `REQUEST`, `ADVANCE`, `RELEASE_NEXT`, `CANCEL`, and `END`. Exact event variants are `{"type":"REQUEST","method":"GET","path":"<UTF-8 string>"}`, `{"type":"ADVANCE"}`, `{"type":"RELEASE_NEXT"}`, `{"type":"CANCEL","normalizedRequestKey":"<validated key>"}`, and `{"type":"END"}`; each rejects unknown fields. Input is a strict JCS array of `{"logicalTick":N,"eventSequence":N,"event":E}`. `logicalTick` is a non-negative integer no greater than `maximumTick`; `eventSequence` is its globally unique, contiguous zero-based input position. Before replay, envelopes are schema-validated. Invalid envelope/input returns `INVALID_INPUT` with detail `INVALID_ENVELOPE`, `EVENT_LIMIT`, or `TICK_LIMIT`, no trace, and the canonical initial state. A structurally invalid event returns `INVALID_INPUT` with detail `INVALID_EVENT`, a trace row, and no state mutation.

Requests are normalized and then ordered within a tick by exactly `(logicalTick, eventSequence, normalizedRequestKey)`, comparing integer components numerically and the normalized key as UTF-8 bytes. Non-request events use the schema-fixed empty key. The normalized request key is `GET` plus one U+0020 followed by the validated lowercase-ASCII POSIX-relative path. The complete input is already unique by `eventSequence`; no locale, raw request bytes, scheduler, wall clock, or default collation participates.

Every transition returns the strict result `{"machineResult":"OK|INVALID_INPUT|INVALID_REQUEST|EVENT_LIMIT|TICK_LIMIT|REQUEST_LIMIT|PENDING_LIMIT|RELEASE_LIMIT|LOOP_LIMIT","response":R-or-null,"stateDigest":"lowercase-64-hex"}`. A response is exactly `{"status":N,"headers":[["name","value"]],"bodyObjectSha256":"lowercase-64-hex","stateDigest":"lowercase-64-hex"}`: status is an integer; headers are the machine-row fixed ordered list; body identity is the raw SHA-256 of the exact body object; and `stateDigest` is the `nova-play:machine-state:v1` hash of resulting-state JCS. A no-body response has the zero-length empty byte string, never `{}`, `null`, a newline, or textual JSON, and raw SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. Every no-body 4xx, 410, queued response, or queue error uses that value unless its conformance row explicitly lock-lists another body object.

For every request, the total decision procedure is exactly:

1. Normalize and validate the request. Invalid requests return declared status 400 and machine result `INVALID_REQUEST`.
2. Evaluate machine-global terminal state. A terminal request returns the declared terminal status/body; queue capacity is not inspected.
3. Resolve requested resource identity.
4. An unknown resource returns declared 404; a known but unavailable live-window resource returns declared 410; queue capacity is not inspected.
5. Determine whether the response can be emitted immediately.
6. An immediate response is emitted; queue capacity is not inspected.
7. Only when insertion into the pending map is required is capacity tested.
8. A full pending map returns `PENDING_LIMIT`, the fixed queue response, and no insertion or state mutation.
9. Otherwise the exact pending entry is inserted and the declared queued response is returned.

Thus invalid, terminal, unknown, unavailable, and immediate requests never compete with `PENDING_LIMIT`. A valid request consumes its expected ordinal and request count only at the branch specified by its golden row; invalid input and `PENDING_LIMIT` do not mutate state.

A pending entry is the strict object `{"normalizedRequestKey":"...","bodyObjectSha256":"lowercase-64-hex","enqueueLogicalTick":N,"enqueueEventSequence":N,"releaseAfter":N,"releaseCountConsumed":N,"status":N,"headers":[["name","value"]],"terminalDisposition":"cancel-with-terminal-response"}`. Entries are keyed by normalized request key; duplicate insertion is schema-invalid. `releaseAfter` is a bounded positive integer with minimum 1 and maximum `maximumReleaseAfter`; zero, negative, non-integer, or over-maximum values are schema-invalid. `releaseCountConsumed` starts at zero and cannot exceed `releaseAfter`. `RELEASE_NEXT` increments the machine release count and every pending entry’s consumed count in normalized-request-key UTF-8-byte order, then emits/removes only the first eligible entry in that order. Remaining eligible entries wait for later `RELEASE_NEXT` events without another increment; this one-response rule preserves the exact transition-result schema and is subject to `maximumReleaseCount`.

HLS live exposes its manifest immediately while nonterminal and segments exactly within the inclusive `[windowStart,segmentSequence]`; known segments outside the current window are unavailable (410), and unknown paths are 404. DASH live applies the same rule to its MPD and concretized segment identities. Delay A requires pending insertion for each known configured path; delay B emits the same locked resource immediately. Manifest and segment delay rows are independently configured and tested.

`ADVANCE` increments `logicalTick`. If another segment exists, it advances `segmentSequence` and recomputes the inclusive window. Otherwise it consumes one loop and resets the window when `loopsRemaining > 0`; with no loop remaining it enters natural terminal state. `END` also enters terminal state. Entering terminal by either route deterministically cancels every pending entry in normalized-request-key UTF-8-byte order. Each cancellation emits a trace subevent with the machine’s declared terminal status, fixed ordered headers, empty-body hash above, and resulting state digest. No pending entry may release after terminal; the final state has an empty pending map. A terminal `ADVANCE`, `RELEASE_NEXT`, `CANCEL`, or `END` is a defined no-op result. All other valid state/event pairs, including missing cancellation targets and empty release operations, have an explicit deterministic row in the machine definition.

Canonical trace JCS is a strict array whose row schema is `{"logicalTick":N,"eventSequence":N,"normalizedRequestKey":"...","event":E,"priorStateDigest":"lowercase-64-hex","result":R,"terminalCancellations":[R...],"resultingState":S,"resultingStateDigest":"lowercase-64-hex"}`. Arrays preserve transition and cancellation order; no field is omitted. Each machine definition lock-lists exact trace JCS bytes and `traceHash`. Implementations must reproduce both exactly.

Normative golden traces cover: full queue plus unknown resource; full queue plus unavailable resource; full queue plus terminal machine; full queue plus immediately available resource; full queue plus insertion-required resource; natural terminal with zero, one, and multiple pending entries; `releaseAfter=1`; maximum `releaseAfter`; rejected zero and over-maximum values; same-tick request ordering; every precedence branch; every valid state/event pair; every bound and failure result; HLS and DASH loop/window boundaries; and delayed manifest and delayed segment behavior for A. Golden traces separately prove terminal cancellation order, no post-terminal release, and an empty final pending map. Real-device cancellation timing remains Phase 2 evidence.

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

### 20.1 Pinned genesis and policy chain

The future written-design approval record and Plan 1 authority root must pin signing-policy sequence `0`, the genesis policy’s exact raw SHA-256 and Git blob ID, complete authorized public-key bytes, principal `corpus-owner-v1`, namespace `nova-play-corpus-approval-v1`, an explicit owner trust statement, and exact policy-schema and hash-registry versions. No chain is valid without byte and ancestry equality to this genesis root.

Every strict policy contains corpus/project scope; monotonic `policySequence`; prior `signingPolicyDigest` (`null` only at genesis); active and retired key arrays; key IDs derived from exact complete public-key bytes; allowed principals/namespaces; transition-authority rules; and externally computed `signingPolicyDigest`. Policy history is contiguous. A transition is valid only when signed/authorized under the immediately prior valid policy and committed on protected ancestry. Unknown fields, gaps, duplicates, unpinned genesis, invalid transitions, or caller-selected policy tips fail closed.

Approval A validates against both the exact E-bound policy and the highest valid policy reachable at A’s parent. Its signer key must be active for the principal/namespace in both. A key retired by the A-parent policy therefore cannot create a new approval for an older unapproved E. Rotation overlap exists only when old and new keys are both active in both applicable policies. Signer-supplied `signedAt` is informational and never restores authority.

Policy and revocation discovery is repository-derived. Current verification independently resolves repository numeric ID, protected default ref, ref object ID, and exact `verificationCommit`; historical verification is separately labelled and non-authorizing. Historical validation always uses the pinned genesis, complete valid policy chain, both E-bound and A-parent checks, and the complete current valid revocation chain.

### 20.2 Single revocation-selector predicate

A strict revocation contains project/corpus scope, contiguous `revocationSequence`, `priorRevocationDigest` (`null` only at zero), reason, authority, and `selectorMode`, which is exactly one of `key-wide`, `approval-set`, `policy-range`, `release-set`, or `receipt-set`. Exactly the field required by that mode is present and non-empty; every other selector field is forbidden. Matching is the single predicate: scope matches **and** the selected mode predicate matches. No union, intersection, fallback, or empty-selector interpretation exists.

- `key-wide` requires one exact public-key ID and matches that ID.
- `approval-set` requires a non-empty UTF-8-byte-sorted unique array of exact approval digests.
- `policy-range` requires inclusive non-negative integer `minimumPolicySequence` and `maximumPolicySequence`, with minimum no greater than maximum.
- `release-set` requires a non-empty numerically sorted unique array of exact Release numeric IDs.
- `receipt-set` requires a non-empty UTF-8-byte-sorted unique array of exact receipt digests.

The complete current revocation chain is loaded from the protected verification tree, is contiguous, digest-linked, signed by authority active under the policy at first commit, and cannot be reduced by an API input. Compromise may revoke historical named approvals through `approval-set` or all approvals by an exact key through `key-wide`. A revoked approval cannot promote; an already published matching corpus version becomes `REVOKED`.

Golden tests cover pinned genesis, complete chain, rotation overlap, retirement cutover, an older E approved after retirement, every selector mode, nonmatching scope, malformed mixed selectors, compromise, and historical validation. Wall-clock time alone never authorizes.

## 21. Append-only state machine

Durable events live at `docs/android/playback-corpus-events/<corpusVersion>/`; filenames are `<8-digit-sequence>-<EVENT_TYPE>.json`. Producers never precompute final chain fields.

An event proposal is strict JCS containing event schema/type, corpus version, transaction ID, attempt ID, proposed state/disposition, actor and asserted authority, source/evidence/artifact/GitHub references, event evidence, run-specific informational observation time, and expected chain-tip digest. It must not contain final sequence, prior-event digest, final event digest, or final filename. Its external `eventProposalDigest` uses `nova-play:event-proposal:v1`.

Only the protected path-limited event-commit workflow finalizes. It (1) acquires a repository concurrency lease for the corpus-version chain; (2) reads the protected branch tip and complete event directory; (3) validates contiguous sequence and every prior digest; (4) compares the proposal’s expected chain tip; (5) rejects or reconciles a stale proposal; (6) allocates the next zero-padded sequence; (7) injects prior digest; (8) constructs strict final-event JCS; (9) computes external `eventDigest`; (10) creates the exact filename; (11) commits atomically without altering prior events; and (12) verifies the committed Git blob and resulting chain. On branch CAS failure it rereads/revalidates, finalizes against the new tip only when the proposal remains semantically valid, or requires a new proposal. It never rewrites a proposal as though it had been final.

Before candidate execution, S commits and binds a strict incident policy authorizing candidate/staging proposals and incident finalization before E. Candidate identity binds its exact Git blob and `incidentPolicyDigest`; E copies/references them. The exact transition is `EVIDENCE_POLICY_ACTIVATED`, finalized atomically as part of E by the event-commit workflow. It binds the S-bound policy blob/digest, the complete proposed E tree projection and its externally computed digest, the E-bound event/signing policy blob/digest, and the normative content-lock/staging identities; it does not contain E’s not-yet-created commit ID. After E commits and its resulting tree is verified against that projection, approval/publication/receipt/closure proposals require E-bound authority. A remains the direct child of E. No byte import is a transition.

Candidate, stage, promotion, and verifier components emit proposals. `OWNER_APPROVED`, `CORPUS_TAGGED`, `RELEASE_PUBLISHED`, `RECEIPT_PROPOSED`, `RECEIPT_COMMITTED`, `RECEIPT_VERIFIED`, incident, rejection, quarantine, revocation, and closure transitions all use the same finalizer. `REJECTED` and `QUARANTINED` remain absorbing for their transaction/attempt; `REVOKED` remains absorbing for the corpus version. No producer imports an event byte-for-byte or assigns its sequence.

Nominal progress:

```text
SPEC_COMMITTED
CANDIDATE_VALIDATED
DRAFT_STAGED
EVIDENCE_POLICY_ACTIVATED
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
| `DRAFT_STAGED` | Protected stage workflow | Capability probe passed; stage preflight/revalidation passes | draft numeric Release/asset IDs, staging receipt | `EVIDENCE_POLICY_ACTIVATED` |
| `EVIDENCE_POLICY_ACTIVATED` | Protected event finalizer | Atomically finalize this event inside E under S-bound authority, then verify E tree against its bound projection | S/E policy blobs/digests, proposed E tree projection/digest, resulting E tree/blob identities | `OWNER_APPROVED` |
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
| `REJECTED` | Before E: corpus owner or evaluator authorized by the S-bound incident policy; after E: authority in the E-bound policy | Rejection with transaction/candidate/staging identities and reason | Terminates transaction; new same-version attempt allowed only before publication |
| `QUARANTINED` | Before E: validating workflow or incident authority in the S-bound incident policy; after E: authority in the E-bound policy | Identity/security/unknown-state incident and observations | Terminates retained attempt; reuse forbidden; new attempt only after incident review |
| `REVOKED` | Corpus owner or revocation authority active in the applicable signing policy | Signed committed record with exactly one selector mode, matching scope, and reason | Terminates trust in corpus version; Release retained; corrected bytes require new version |

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
- Exact one-class membership for every artifact schema/type; no missing, duplicate, inferred, or cross-class artifact; candidate projections retain every identity-critical field and reruns remain distinct.
- Exact machine initial/event/pending/response/trace schemas; total transitions; empty-body hash; precedence/full-queue combinations; terminal cancellation; release-after boundaries; HLS/DASH loop/window boundaries; and delayed A manifest/segment golden bytes and hashes.
- Closed hash-registry bidirectional coverage, one golden vector per row, receipt domain/raw identities, closure five-key sorting edges, duplicate rejection, and native Git/OCI/attestation separation.
- Pinned signing genesis, complete ancestry, rotation overlap, retirement cutover including older E, dual E/A-parent checks, all five exclusive revocation selector modes, compromise, and historical validation.
- Event-proposal forbidden-final-field checks, proposal-domain hash, protected finalization, stale/CAS reconciliation, S-bound pre-E authority, exact E policy transition, append-only history, and absorbing dispositions.
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
| Overbuilding infrastructure before Android value | Bounded tooling scope, no generator-image publication, one program split into exactly eight independently reviewed plans | Tooling expansion that does not advance a listed acceptance gate |
| Two-person maintenance burden | Explicit ownership, readable schemas, small focused modules, capability probe, documented recovery | Maintainers cannot independently perform verification/recovery |
| Misread corpus success as product success | Explicit non-claims and device-claim tests | Any report/release language implies product/device proof |
| Sensitive-data leakage | Synthetic-only preference, acquisition controls, redaction policy, logs/asset scanning | Any provider/private/tester/credential data appears |

## 29. Exact eight-plan implementation boundary

This is one playback-corpus program with exactly eight implementation plans, not eight unrelated architectures. Every plan is independently executable and independently reviewed, has its own plan document, exact acceptance commands/evidence, rollback boundary, and independent zero-Critical/Important review. There is no batch approval across trust boundaries.

### Plan 1 — Authority and normative integration

**Input:** final written-design approval record.

**Work:** atomically integrate decision statuses, plan v3, requirements, device policy, corpus registry, baseline wording, and authority hashes.

**Green checkpoint:** one normative 24/13/32 root; no competing old 19-row authority; fresh-clone validation; independent zero-Critical/Important review. No later plan starts before Plan 1 is green.

### Plan 2 — Registry, schemas, canonicalization, and hash contracts

**Input:** Plan 1.

**Work:** extraction; exact registry schemas; closed artifact-class registry; total hash registry; JCS/golden vectors; semantic-oracle schemas; executable-machine schemas; event proposal/finalization schemas; signing/revocation schemas.

**Green checkpoint:** all contract, golden, and migration tests pass; independent zero-Critical/Important review.

### Plan 3 — Pinned toolchain and fixture generation

**Input:** Plan 2.

**Work:** source-build `linux/amd64` image; x264/x265/libfdk/FFmpeg locks and capability checks; primitives, recipes, all media generation; deterministic controls; legal/tool inputs.

**Green checkpoint:** tiny and full nonpublishing generation; deterministic-control rebuild; no unresolved fixture/tool/legal input; independent zero-Critical/Important review.

### Plan 4 — Closures, oracles, archive, and replay machines

**Inputs:** Plan 2 and stable fixture interfaces from Plan 3.

**Work:** HLS/DASH closure; total live/delay machines; oracles; negative fixtures; canonical archive; resource bounds.

It may develop against fixtures in parallel with Plan 3, but cannot finish green until Plan 3 output compatibility passes. Its green checkpoint is all closure/oracle/archive/machine golden and resource-bound tests passing plus independent zero-Critical/Important review.

### Plan 5 — Candidate, proposed lock, provenance, and legal gates

**Inputs:** Plans 2, 3, and 4 green.

**Work:** candidate manifest; proposed lock; full run identity; reports/attestations; per-row provenance and redistribution states; archive budget and candidate workflow.

**Green checkpoint:** protected nonpublishing candidate validates all 24 rows and fails closed; independent zero-Critical/Important review.

### Plan 6 — GitHub capability probe and read-only API adapter

**Inputs:** Plans 1 and 2.

**Work:** actual-plan/repository capability probe; numeric identities; draft/public/immutable behavior; environments/reviewers; artifact/attestation; query-before-retry read-only adapter.

It may run in parallel with Plans 3–5 and must be green before Plan 7. Its green checkpoint is all probe/adapter contract and fault-injection tests passing under actual settings plus independent zero-Critical/Important review.

### Plan 7 — Staging, signing, promotion, and append-only state

**Inputs:** Plans 5 and 6 green.

**Work:** staging; E; genesis/rotation/revocation policy; A; event proposal/finalization; protected promotion; tag; concurrency/recovery.

**Green checkpoint:** protected test-repository fault injection; exact identity/signature; no stale events, blind retry, or unauthorized mutation; independent zero-Critical/Important review.

### Plan 8 — Public verification, receipt, revocation, and closure handoff

**Input:** Plan 7.

**Work:** public verification; proposed receipt; R; post-commit verification; current revocation discovery; public failure handling; end-to-end fault injection; handoff to broader Phase 1 closure.

**Green checkpoint:** exact public receipt; revocation tests fail closed; independent zero-Critical/Important review.

The dependency graph is exactly:

```text
1 -> 2 -> (3 || 4; both green) -> 5
2 -> 6 in parallel with 3–5
5 + 6 -> 7 -> 8
```

All work remains under `tools/playback-corpus/`, `docs/android/`, `fixtures/playback-corpus/`, and `.github/workflows/` as specified in Section 6. It must not refactor `src/main.ts`, implement Android product behavior, alter provider handling, publish an image, or create public corpus artifacts before the gates permit it. A plan may refine file names under each logical directory but cannot change identity counts, authority boundaries, privilege separation, hash domains, approval semantics, or publication safety without an owner-approved design revision.

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
