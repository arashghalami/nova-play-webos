# Decision-sheet final correction verification

## Metadata

- **Date:** 2026-08-09
- **Baseline:** `7a4a3b163d436dd1727b9fad5356536e27ef8a7f`
- **Corrected file:** `docs/android/audits/phase-1/decision-sheet.md`
- **Authorized paths:**
  - `docs/android/audits/phase-1/decision-sheet.md`
  - `docs/android/audits/phase-1/reviews/decision-sheet-correction-verification.md`
- **Status:** editor verification; independent final review still required.

This is a concise factual change record produced by the editor who applied the
correction, not an independent review. It documents what changed and what a
programmatic pass over the corrected file found. It does not substitute for the
separate independent final review.

## Corrections applied

1. **Canonical lifecycle registry restored.** F.3's `NP-LIFE-001..030` table was
   replaced in place with the exact canonical ID-to-meaning mapping supplied in
   the dispatch (VOD/live split per event, root Back with no media anchor,
   process-death/freshness combined under `NP-LIFE-009`). `NP-LIFE-031/032`
   (cancellation) were left as previously verified — already an exact match — and
   their required-observation text now explicitly names the consuming
   `NP-CANCEL-001/002` alias. The intro/anchor prose above the table and the rules
   paragraph below it were rewritten to state the `+`-anchor independent-result
   rule, the `NP-LIFE-030` no-anchor case, the rotation/config-change and
   track-preservation non-duplication rule, and the `NP-LIFE-009`
   freshness-not-split rule.
2. **`NP-HLS-008` made identity-only in F.1.** The F.1 row's *Shape* text was
   replaced with the identity/lock-only description, and a new paragraph directly
   under the F.1 table states the six-part identity/lock pass condition and
   explicitly excludes the four runtime-cancellation assertions, redirecting them
   to `NP-LIFE-031/032`.
3. **`NP-CANCEL-001/002` made non-executing aliases in F.2.** The F.2 table rows
   for both IDs were replaced with alias-only *Proves* text, and the paragraph
   after the F.2 table now states explicitly: the executor schedules only
   `NP-LIFE-031`/`NP-LIFE-032`; the result document references those result IDs
   from the `NP-CANCEL-*` aliases; no second cancellation execution is scheduled;
   and neither alias can override, waive, or independently pass when its
   lifecycle result fails or is absent.
4. **`P1-D11` consequence extended.** The existing 24/13/32 counts and decision
   ID/owner status were kept unchanged; one consequence sentence was added
   stating execution ownership: `mediaRows` own bytes/lock integrity,
   `lifecycleCases` own runtime lifecycle/cancellation executions, `featureCases`
   either own their own non-lifecycle execution (`NP-DL`, `NP-CAST`, `NP-ERR`) or
   are explicit non-executing aliases (`NP-CANCEL`), and no test execution is
   double-counted. The `NP-CANCEL-001..002` mention inside `P1-D11`'s recommended
   decision was also updated to state the alias/consumption relationship
   in-place.

No other section, decision ID, approval block, count, status, or unrelated prose
was touched.

## Canonical lifecycle registry verification

- **Count:** 32 (`NP-LIFE-001..NP-LIFE-032`), unchanged from before the
  correction.
- **Sequential range:** 001 through 032 inclusive, no gaps, no `..NNN`
  placeholder, no duplicate ID.
- **Exact ID-to-meaning comparison result:** every one of the 32 rows in the
  corrected F.3 table was compared field-by-field (ID, requirement/event, media
  anchor(s), required observation) against the canonical registry supplied in
  the dispatch. **Result: exact match on all 32 IDs, including `031`/`032`,
  which the independent re-review had already found to be an exact match before
  this correction.**
- **Root Back anchor result:** `NP-LIFE-030` ("Android system Back at root
  view") anchor is `none — root view, no playback media anchor`, matching the
  canonical requirement exactly; the prior incorrect `NP-HLS-001 + NP-HLS-003`
  anchor was removed.
- **Multi-anchor independent-result rule:** the F.3 intro paragraph states a `+`
  anchor "requires independently recorded results for every listed anchor — it
  is not satisfied by a single merged observation," matching the canonical rule
  for `NP-LIFE-010/011/012/013/016/029`.

## Cancellation taxonomy verification

- **`NP-HLS-008` identity-only result:** the F.1 row's *Shape* field now reads
  only the identity/bundle description; the paragraph beneath the F.1 table
  states the pass condition as six identity/lock clauses (A plays, B plays,
  byte-distinct, both member hashes, bundle hash, delay-server configuration)
  and explicitly states no runtime cancellation-behavior assertion is part of
  the media-row pass condition. **Result: yes, identity-only.**
- **`NP-CANCEL` aliases:** F.2 `NP-CANCEL-001` and `NP-CANCEL-002` are labelled
  "Non-executing feature-taxonomy alias" in the *Proves* column, each naming the
  lifecycle ID whose canonical execution/result it consumes.
- **Canonical executions:** stated explicitly in F.2's post-table paragraph and
  in `P1-D11`'s consequence — the executor schedules only `NP-LIFE-031` and
  `NP-LIFE-032`.
- **Duplicate execution count expected = 0:** confirmed by the explicit
  sentence "No second cancellation execution is scheduled for the feature
  aliases," and by the alias rows themselves carrying no independent pass
  condition of their own.

## Invariants preserved

- All 17 decision IDs (`P1-D01..P1-D17`), their five-field structure, and owner
  status `AWAITING APPROVAL` are unchanged except for the one added consequence
  sentence in `P1-D11` (its decision ID and owner status untouched).
- Section K's approval block: unchanged, all 17 IDs present once, in order, with
  `APPROVE / REJECT` lines.
- Phase 1 `OPEN` status (section A): unchanged.
- F.1's 24 media IDs, Origin split (19 existing / 5 new), and Class vocabulary:
  unchanged except for `NP-HLS-008`'s *Shape* text and pass-condition paragraph.
- F.2's 13 feature IDs: unchanged except for the two `NP-CANCEL-*` *Proves*
  cells and the post-table paragraph.
- Section G's `NP-HLS-008` lock invariants (member A hash, member B hash,
  bundle aggregate hash, deterministic delay-server configuration): untouched,
  still present verbatim.
- Codec policy (section D), Media3/WebView policy (section E), the four gates
  (section E table), DASH selection (`P1-D09`), download/Cast scope
  (`P1-D12`/`P1-D13`), cleartext decisions (`P1-D14`/`P1-D15`), controlled-beta
  timing (`P1-D16`), tag/estimate policy (`P1-D17`), sections H/I/J/M/N: not
  modified by this task.
- All `AWAITING APPROVAL` statuses: unchanged in count and placement.
- The independent re-review report and the README were not modified by this
  task.

## File and Git facts

- Corrected file: `docs/android/audits/phase-1/decision-sheet.md`, 940 physical
  lines after this correction (measured directly from the file after writing).
- This verification report is the second and only other file this task
  created or modified.
- `git status --porcelain` for `docs/android/audits/phase-1/` shows the whole
  directory as untracked (`??`) both before and after this task — pre-existing
  from earlier work, not caused by this task. No files were staged, committed,
  or tagged by this task.
- No provider hostnames, credentials, private URLs, raw prompt text, or
  chain-of-thought reasoning were introduced into either file.

## Verification

1. **17 unique sequential decisions, all in approval block:** confirmed
   programmatically — headings `P1-D01`..`P1-D17` each occur exactly once, in
   order, and section K lists all 17 in the same order with `APPROVE / REJECT`.
2. **24 F.1 media IDs:** confirmed programmatically — exactly 24 unique
   `NP-(HLS|DASH|TS|PROG|FLV)-NNN` IDs inside the F.1 table region.
3. **13 F.2 feature IDs:** confirmed programmatically — exactly 13 unique
   `NP-(DL|CAST|ERR|CANCEL)-NNN` IDs inside the F.2 table region.
4. **32 F.3 lifecycle IDs, sequential 001-032:** confirmed programmatically —
   exactly 32 unique `NP-LIFE-NNN` IDs, `001` through `032`, no gaps.
5. **Each lifecycle ID's normalized meaning matches the canonical registry:**
   confirmed by manual field-by-field comparison of all 32 rows against the
   dispatch's canonical table — **0 mismatches**.
6. **`NP-LIFE-030` has no media anchor:** confirmed — its anchor cell reads
   `none — root view, no playback media anchor`.
7. **Multi-anchor cases require separate results for both anchors:** confirmed
   — the F.3 intro paragraph states this rule explicitly for every `+` row.
8. **F.1 `NP-HLS-008` contains no runtime cancellation assertions:** confirmed
   — the *Shape* cell and the pass-condition paragraph contain only
   identity/lock clauses; the four excluded assertions are named as explicitly
   removed and relocated to `NP-LIFE-031/032`.
9. **Section G retains A/B member and bundle lock invariants:** confirmed —
   member A hash, member B hash, bundle aggregate hash, and the deterministic
   delay-server configuration requirement are all still present verbatim in
   section G.
10. **`NP-CANCEL-001/002` are explicitly non-executing aliases to
    `NP-LIFE-031/032`:** confirmed — F.2 table cells and the post-table
    paragraph state this explicitly for both IDs.
11. **Only the lifecycle cases schedule cancellation executions:** confirmed —
    stated explicitly ("the executor schedules only `NP-LIFE-031` and
    `NP-LIFE-032`").
12. **Counts agree in P1-D11, F.1/F.2/F.3, and section L:** confirmed — 24/13/32
    appears consistently in `P1-D11`, the F.1/F.2/F.3 registry-count sentences,
    and section L's closure-checklist item; all five occurrences in the file
    match.
13. **No sensitive data or raw reasoning introduced:** confirmed by inspection
    of both files — no hostnames, credentials, tokens, private URLs, prompt
    text, or chain-of-thought content appears in either file.
14. **Only the two authorized paths changed because of this task:** confirmed —
    `git status` shows no newly created or modified path outside
    `docs/android/audits/phase-1/decision-sheet.md` and
    `docs/android/audits/phase-1/reviews/decision-sheet-correction-verification.md`
    attributable to this task (the pre-existing untracked `docs/android/`
    directory state predates this task and was not altered outside these two
    files).
