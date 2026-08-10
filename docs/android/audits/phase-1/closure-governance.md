# Phase 1 closure-governance audit

## Metadata

- **Audit date:** 2026-08-09 (read-only inspection).
- **Baseline commit:** `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`
  (short `7a4a3b1`, branch `master`, subject
  `docs(plans): council verdict on the three-app plan`,
  authored/committed `2026-08-09T03:03:26+02:00`).
- **Status:** advisory evidence, **not the closure decision**. Closure is an
  owner act. This file records findings only; it does not itself close Phase 1
  and mutates no repository state beyond its own creation.
- **Scope:** Phase 1 of `plans/main-refactor-v3.md` ("Pin the requirements the
  spike actually needs"), assessed strictly against its own four work items and
  its exit criterion. Sources read: `plans/main-refactor-v3.md`,
  `plans/council-2026-08-09-main-refactor-v2.md`, `docs/refactor/baseline.md`,
  `docs/android/requirements.md`, `docs/android/device-policy.md`,
  `docs/android/playback-corpus.md`, `CLAUDE.md`, `.gitignore`, `package.json`,
  plus read-only Git state. No file was edited, staged, tagged, or committed;
  no artifact was generated.

### Observed Git state at audit time

Recorded by observation, not assumption:

- `git rev-parse HEAD` → `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`.
- Branch `master`; upstream `origin/master`; `rev-list --left-right --count
  origin/master...HEAD` → `0  0` (fully in sync, nothing to push/pull).
- `git tag -l` → **empty. This repository has never been tagged.**
- `git status --porcelain` (working tree):
  - `M .gitignore`
  - `M CLAUDE.md`
  - `M plans/main-refactor-v2.md`
  - `?? docs/android/`
  - `?? docs/refactor/`
  - `?? plans/main-refactor-v3.md`
- No file under `src/`, `public/`, `scripts/`, or any build config differs from
  `7a4a3b1`. The runtime source is byte-identical to the baseline commit.
- Absent (correctly, for a documentation-only phase): `docs/adr/`, `spikes/`,
  `apps/`, `modules/engine`, `fixtures/playback-corpus.lock.json`,
  `docs/android/playback-spike-results.json`, and any committed corpus
  acquisition script.
- Note: this audit adds one new untracked path (`docs/android/audits/`) via the
  `docs/android/` entry that is already untracked; it introduces no change to any
  previously listed file.

---

## A. Closure verdict: CONDITIONALLY CLOSED

Phase 1's three named documents exist, the host-side gates are green, and the
runtime source is unmoved from the baseline. Closure is **not** yet earned
because a small, bounded, engineering-free set of owner actions remains:

1. `docs/android/requirements.md` is **not fully owner-approved** — §2.3 (the
   codec list) is explicitly held for owner sign-off (§9).
2. The **annotated baseline tag required by work item 1 does not exist.** A
   commit SHA is not a tag (see §C and §F).
3. Two documented deferrals need conscious owner ratification rather than silent
   acceptance: corpus checksums (§B item 4, §J) and the exit-criterion/work-item
   gap (§C).

None of these requires touching source, the build, or webOS. That is precisely
the profile of *conditionally closed* rather than *closed*.

It is **not OPEN**: all three documents are present and substantive, the test and
build gates pass, source has not moved, and every remaining gap is stated
in-document with a defined resolution step.

---

## B. Work-item-by-work-item audit

### Item 1 — Tag the approved webOS release commit; record tag, `npm test`, and guarded-build results in `baseline.md`

- Baseline commit correctly identified: `7a4a3b1` equals HEAD and
  `origin/master`. **PASS.**
- `npm test` (48 files / 442 tests) and the full guarded `npm run build` (four
  guards, verbatim output, artifact sizes) recorded. **PASS.**
- **Tag not created.** `baseline.md §4` states this openly and defers tag
  creation to an explicit owner instruction. **INCOMPLETE.**
- Wording caution: the work item calls `7a4a3b1` the "approved webOS release
  commit," but the same item and `baseline.md §3–§4` correctly insist it is
  host-verified only — **not device-verified, not shipped**. See §C.

### Item 2 — `docs/android/requirements.md` answering the spike-blocking questions, with a named owner

- Owner named. API floor 26, WebView floor 100, the Play-updatable-WebView
  assumption with an explicit runtime guard, protocols/containers/subtitles,
  DRM out of scope (by inspection), cleartext policy, all four feature scopes,
  and the full lifecycle matrix are answered concretely and grounded in a source
  inventory. **PASS on substance.**
- **Not fully approved:** header reads "approved, except §2.3"; §9 lists the
  codec list as the one open item requiring owner sign-off. **INCOMPLETE (one
  field).**
- Minor identity note: the document owner email
  (`sghalamifard@adaptavist.com`) differs from the Git author identity
  (`arash_792002@yahoo.com`). Same person, two identities; not blocking, but it
  should be reconcilable so "owner-approved" is auditable.

### Item 3 — Record the §3 device-support decision in `docs/android/device-policy.md`

- Controlled beta chosen; "at least three device classes" defined; the automatic
  reduction-to-named-device fallback rule stated; telemetry, rehearsed rollback,
  and webOS-release independence enumerated as Phase 4 obligations. No open
  fields. **PASS (fully approved).**

### Item 4 — Define the legal playback corpus by stable sample ID and checksum

- **19 mandatory rows** across a permanent `NP-<PROTOCOL>-<NNN>` identity scheme
  (`NP-HLS-001..008`, `NP-DASH-001..004`, `NP-TS-001..004`, `NP-PROG-001..003`),
  with engine expectations, per-row evidence spec, negative/degradation rows,
  and provider-reachability held separate and uncommitted. Row set approved.
  **PASS on identity.**
- **Checksums not recorded.** `playback-corpus.md §5` states acquisition and
  SHA-256 are outstanding and reassigns them to the **first task of Phase 2**.
  The work item text says "by stable sample ID **and checksum**." **PARTIAL —
  IDs done, checksums deferred.** See the deferral analysis in §C and §J.

---

## C. Exit-criterion audit

### Literal exit paragraph (v3 §6, Phase 1)

> "`docs/refactor/baseline.md`, `docs/android/requirements.md` and
> `docs/android/device-policy.md` exist, owner-approved, with no field reading
> `TBD` or `latest`. `npm test` and `npm run build` still exit 0."

| Binary check | Result |
|---|---|
| Three named documents exist | **PASS** |
| Owner-approved | **FAIL** — `requirements.md` §2.3/§9 codec list unsigned |
| No field reading `TBD` / `latest` | **PASS** — none present in the Phase 1 docs |
| `npm test` exit 0 | **PASS** — 48 files / 442 tests (host-side) |
| `npm run build` exit 0 | **PASS** — four guards green (host-side) |

### Literal paragraph versus complete intent

The literal paragraph names only the three documents. It is **silent on work
item 1's tag and work item 4's corpus**, both of which are unambiguous Phase 1
work. This matters:

- The **tag** is the rollback anchor Phase 2 depends on by name ("keep shipping
  the Phase 1 tag"). A missing tag means the rollback target is referenced only
  by a 40-character SHA that no ref points at.
- The **corpus** is what fixes Phase 2's "every mandatory row" bar so it cannot
  drift once results arrive.

Closing on the literal text while the tag is absent and checksums are unpinned
would satisfy the letter and defeat the intent. **Governance recommendation:**
treat *codec sign-off* and *annotated tag creation* as hard closure gates; treat
*corpus checksums* as a consciously ratified Phase-2-first deferral (below).

### Is the baseline an "approved release"?

No — not in the device sense. `npm test` and `npm run build` are host-side only;
neither executes on OLED55G1RLA / webOS 6.5.3. `npm run package:webos` was
deliberately not run (it requires `VITE_METADATA_PROXY_URL` and yields an IPK
artifact, not a source fact). Per `CLAUDE.md`, an entire defect class on this
target is invisible until a device screenshot is compared to intent. The honest
label is **verified-green source baseline / rollback anchor — not a
device-verified or shipped release.** `baseline.md §3–§4` already says this; the
plan's phrase "approved webOS release commit" must be read only in that
constrained sense.

### A SHA is not a tag

Work item 1 requires a *tag*. The repository has none. An unannotated SHA
provides no ref, no annotation, no message, and no durable, human-legible
rollback handle. Do **not** treat `7a4a3b1` as satisfying the tag requirement;
it identifies the commit, it does not discharge the work item.

### May checksum acquisition be deferred?

- **Literal consequence:** work item 4 says "ID **and** checksum." With
  checksums outstanding, item 4 is *not literally complete*, and the corpus is
  reproducible only within a single Phase 2 session — cross-run comparison is
  unsound until `fixtures/playback-corpus.lock.json` exists.
- **Governance consequence:** deferral is *defensible and arguably correct*.
  Phase 1 is documentation-only; fetching writes to gitignored `fixtures/`
  (outside `docs/`), and honest SHA-256 values cannot be produced without
  acquiring artifacts — which Phase 1 forbids. The **row set is frozen**, so the
  acceptance bar cannot move; only the byte-pinning is deferred. The risk is not
  a moving bar but non-reproducibility across runs, which is contained entirely
  within Phase 2 and does not touch webOS or source.
- **Verdict:** deferral is acceptable **only if owner-ratified in writing** and
  executed as the first Phase 2 task, exactly as `playback-corpus.md §5`
  prescribes. Silent acceptance is not acceptable; ratified deferral is.

### Baseline "working tree at capture" is stale

`baseline.md §1` lists the capture-time working tree as `M .gitignore`,
`M CLAUDE.md`, `M plans/main-refactor-v2.md`, `?? plans/main-refactor-v3.md`. The
current tree additionally contains `?? docs/android/` and `?? docs/refactor/`
(the Phase 1 documents themselves, plus this audit). This is not build-affecting
(docs do not enter the build), but the snapshot should be refreshed in the same
commit that lands the docs so the "verified against the committed state" claim
stays literally true.

---

## D. Contradictions requiring edits

1. **"Approved release" vs "not device-verified."** v3 item 1 says *approved
   webOS release commit*; `baseline.md` says it is not shippable without device
   and package verification. **Edit:** rename to "approved baseline / rollback
   commit," or append "(host-verified source baseline, not a device-verified
   release)."

2. **Exit criterion omits tag and corpus.** The three-document exit text does
   not mention item 1's tag or item 4's corpus. **Edit:** add the tag (and,
   ideally, the corpus lock) to the Phase 1 exit criterion, or explicitly
   annotate them as work items intentionally outside the exit gate.

3. **WebView-first vs required native-service features.** `requirements.md §4.1`
   (background audio) and §4.4 (Casting) are mandatory and both state a WebView
   cannot provide them (a foreground media service; the Cast SDK behind a
   Capacitor plugin). v3 §6 runs "WebView first." Not a strict contradiction —
   it is the decision rule's trigger — but the docs should state plainly that
   **§4.1 and §4.4 alone can force Media3 regardless of codec results**, so
   "WebView first" is a starting hypothesis, not an expected outcome. **Edit:**
   cross-reference §4.1/§4.4 from v3 Phase 2's decision point.

4. **Mandatory DASH tracks vs expected Phase 2 failure.** `requirements.md
   §2.4/§6.3` mark DASH audio/text tracks mandatory; corpus `NP-DASH-003` and
   `NP-DASH-004` are "expected to fail before it is built." Coherent only under
   the "a failing row is a result" rule, but "Mandatory" beside an expected-fail
   result reads as a contradiction. **Edit:** relabel those rows "Mandatory
   (acceptance row for Phase 3 DASH-track work); first-run expected fail" so the
   two senses of "mandatory" do not collide.

5. **Static cleartext allowlist vs arbitrary user-entered providers.**
   `requirements.md §3` mandates a per-domain allowlist and simultaneously
   concedes it cannot cover runtime user-typed panel hostnames, punting the
   resolution to Phase 3 on cohort evidence. This is a real tension parked, not
   solved. **Edit:** none required for Phase 1 (it is honestly flagged); the
   Phase 3 decision register should carry it explicitly.

6. **Controlled-beta timing seam.** `device-policy.md §5` requires reducing to
   named-device support if the cohort cannot be populated *before Phase 3
   begins*, while §4 lists recruitment/onboarding as a *Phase 4* deliverable. So
   cohort *feasibility* is judged before Phase 3 while cohort *execution* is
   Phase 4. **Edit:** clarify that feasibility-to-populate is the pre-Phase-3
   gate and onboarding is the Phase 4 activity.

7. **Downloads/Cast scope vs the Phase 3 estimate.** `requirements.md §4.3`
   (downloads/offline) and §4.4 (Casting) add scope; both note Casting's cost is
   "not covered by the Phase 3 estimate, which was sized before this scope was
   set." v3 §6 Phase 3 still prints 240–320h. **Edit:** flag the Phase 3 range as
   excluding Cast (and downloads/offline storage) pending re-estimation after
   Phase 2 names a backend — consistent with v3's own "re-estimate once a backend
   is named."

8. **Phone-first vs three-app/shared-engine objective.** v3 §1/§2 and `CLAUDE.md`
   are internally consistent: "three apps on a shared engine" is explicitly *not*
   the objective; shared modules are earned only by dual-consumption.
   `plans/main-refactor-v2.md` (the shared-`@nova/engine` program) is
   banner-marked NOT APPROVED, and the working-tree modification to v2 adds
   exactly that banner. **No edit needed** — the apparent contradiction with v2
   is resolved by supersession. This confirms the objective is the phone product,
   not a monorepo shape.

---

## E. Required owner decisions

1. **Sign off `requirements.md §2.3` codec list** — specifically HEVC
   Main/Main10 as *mandatory* and AC-3/E-AC-3 as *best-effort with clean
   degradation*. This is the one field blocking "owner-approved," and it changes
   Phase 2's starting backend: AC-3 mandatory implies starting on Media3 rather
   than proving WebView first.
2. **Authorize creation of the annotated baseline tag** (§F) — a deliberate,
   deferred repository mutation the plan reserves for explicit owner instruction.
3. **Ratify the corpus checksum deferral** — accept, in writing, that
   acquisition and SHA-256 move to Phase 2's first task (recommended), or require
   them before declaring Phase 1 closed. Checksums cannot be honestly produced
   under a documentation-only phase, so ratify-as-deferred is the coherent
   choice.
4. **Ratify the exit-criterion patch** adding the tag (and optionally the corpus
   lock) to the Phase 1 exit criterion, closing the letter-vs-intent gap in §C.
5. **Reconcile the owner identity** used in the docs versus Git, so
   "owner-approved" is auditable against commit authorship.

---

## F. Exact annotated-tag recommendation

Create one **annotated** tag on `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`.

- **Recommended name:** `baseline/webos-2026-08-09` — neutral, dated, and
  descriptive of what it anchors (the pre-Android webOS source baseline). It
  makes no shipped/release claim.
- **Acceptable alternative:** `refactor-baseline-2026-08-09`.
- **Avoid:** `v1.0`, `release`, `latest`, `stable`, or any name implying a
  device-verified or shipped release — the baseline is host-verified only (§C).
- **Semantics — annotated, not lightweight:** the tag must carry a message and
  its own object so it is a durable, legible rollback handle with an author and
  date. A lightweight tag (a bare pointer) or a raw SHA does not discharge work
  item 1.
- **Suggested message content (no secrets, no provider data):** that this marks
  the Phase 1 host-verified webOS baseline (48/442 tests green, four build guards
  green), that it is the Phase 2 rollback target, and that it is explicitly not
  device-verified or shipped pending on-device and `package:webos` checks.
- **Do not push implicitly:** creation is local; pushing the tag to
  `origin/master` is a separate explicit owner step.

This audit does **not** create the tag; it only recommends its exact form.

---

## G. Selective-commit choreography

Do not perform this; it is the recommended sequence for the owner. The working
tree mixes Phase 1 deliverables with unrelated edits, so the commit must be
path-selective. Unrelated changes must be excluded.

**In scope for the Phase 1 closure commit (Phase 1 deliverables only):**

- `docs/refactor/baseline.md` (new)
- `docs/android/requirements.md` (new)
- `docs/android/device-policy.md` (new)
- `docs/android/playback-corpus.md` (new)
- `plans/main-refactor-v3.md` (new — the plan of record these docs execute)
- `plans/main-refactor-v2.md` (modified — solely the NOT-APPROVED supersession
  banner; include only because it is the direct, minimal counterpart to adopting
  v3)
- Optionally this audit file, `docs/android/audits/phase-1/closure-governance.md`

**Explicitly excluded as unrelated working-tree changes — do not stage:**

- `.gitignore` (Android build-output ignores — belongs with the first Android
  code movement, not Phase 1 docs)
- `CLAUDE.md` (agent-guide edits — a separate documentation concern)

  If the owner judges the `CLAUDE.md` "Where the multi-platform refactor stands"
  section and the `.gitignore` Android-output rules to be part of adopting v3,
  they may be committed **together in that same Phase 1 commit** — but that is an
  owner call, not an automatic inclusion, and they should never be swept in
  silently.

**Recommended order:**

1. Refresh `baseline.md §1`'s working-tree snapshot so it reflects the tree
   actually committed (adds the two `docs/` untracked entries), in this same
   commit.
2. Stage only the in-scope paths explicitly (path-scoped `git add`, never
   `git add -A` / `git add .`).
3. Commit with a message scoped to Phase 1 closure (e.g. `docs(android): pin
   Phase 1 requirements, device policy, corpus, and webOS baseline`).
4. **After** the commit lands, create the annotated tag from §F on
   `7a4a3b1` — or, if the owner prefers the tag to point at the closure commit
   rather than the pre-docs commit, decide that explicitly; the plan's language
   ("tag the current approved webOS release commit") points at `7a4a3b1`, so the
   default is to tag `7a4a3b1`.
5. Handle `.gitignore` and `CLAUDE.md` in their own separate commit(s) if not
   folded in at step 2 by explicit owner choice.

---

## H. Final binary closure checklist

Each item is pass/fail. Phase 1 is CLOSED only when every hard gate is checked.

**Hard gates (block closure):**

- [ ] `requirements.md` §2.3 codec list signed off by the owner (removes the
      last "approved-except" caveat).
- [ ] Annotated baseline tag (§F) created on
      `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`; name makes no shipped claim.
- [x] `docs/refactor/baseline.md` exists and records commit, `npm test`, and
      guarded-build results.
- [x] `docs/android/requirements.md` exists with a named owner.
- [x] `docs/android/device-policy.md` exists and records the §3 decision (fully
      approved).
- [x] `docs/android/playback-corpus.md` exists with the frozen 19-row set and a
      stable ID scheme.
- [x] No Phase 1 doc field reads `TBD` or `latest`.
- [x] `npm test` exits 0 (48 files / 442 tests, host-side).
- [x] `npm run build` exits 0 (four guards green, host-side).
- [x] Runtime source unmoved from the baseline commit.

**Ratified deferrals (block closure only if not explicitly ratified):**

- [ ] Corpus checksums / `fixtures/playback-corpus.lock.json` ratified as a
      Phase-2-first task rather than a Phase 1 completion.
- [ ] Exit-criterion letter-vs-intent gap ratified (tag + corpus acknowledged as
      Phase 1 work beyond the literal three-document paragraph).

**Explicitly NOT closure gates (do not block Phase 1):**

- On-device webOS verification and `npm run package:webos` — these belong to the
  next release cut, not to a documentation-only phase.

---

## I. Evidence that must be retained

- The baseline commit SHA and, once created, the annotated tag name and its
  message.
- `docs/refactor/baseline.md` verbatim `npm test` and `npm run build` output,
  including the four guard "Verified" lines and artifact sizes, with the
  toolchain version.
- The four Phase 1 documents in their owner-approved state, plus the recorded
  owner identity for each sign-off (including the eventual §2.3 codec sign-off).
- This audit file as the advisory record behind the closure decision.
- The observed Git facts at audit time (HEAD, 0/0 sync with `origin/master`,
  empty tag list, working-tree set) as the pre-closure snapshot.
- When Phase 2 begins: `fixtures/playback-corpus.lock.json` (source URL,
  acquisition date, byte size, SHA-256 per row) and the committed acquisition /
  ffmpeg invocations — media itself stays out of the repository per `CLAUDE.md`.
- All retained evidence must remain free of credentials, provider hostnames,
  private URLs, and catalog payloads, per `CLAUDE.md`.

---

## J. Items explicitly deferred to Phase 2 or later

**To Phase 2 (first tasks):**

- Corpus acquisition and SHA-256 checksums;
  `fixtures/playback-corpus.lock.json` and the committed manifest copy.
- The playback/lifecycle/track/cancellation/provider-reach proof matrix on the
  physical phone; `docs/android/playback-spike-results.json` and
  `docs/adr/android-playback-backend.md` (WebView / Media3 / hybrid / STOP).
- Populating the cleartext allowlist from approved provider test cases
  (device-local, redacted).

**To Phase 3:**

- `apps/android-phone/`; the first shared module and the guard extension it
  triggers; Android credential-storage and catalog-persistence decisions
  (IndexedDB vs SQLite); download/offline storage durability; the
  runtime-user-entered cleartext-domain resolution; re-estimation of Phase 3
  effort (including Cast and downloads scope) once a backend is named.

**To Phase 4 and later:**

- Cohort recruitment/onboarding, sanitized telemetry surface, rehearsed
  rollback, signing, package ID, distribution track, Play review, backup/reinstall
  survival, localization, accessibility acceptance owner; and the Android TV
  question, reopened only after a successful phone cohort release.

**Standing scope reductions to keep visible:**

- MKV/Matroska playback dropped on the phone (clean unsupported-format error is
  the requirement).
- AC-3/E-AC-3 best-effort with clean degradation (pending the §2.3 sign-off that
  could promote it to mandatory and force Media3 first).
- DASH audio/text track discovery is new work; `NP-DASH-003/004` are acceptance
  rows expected to fail on first run.
