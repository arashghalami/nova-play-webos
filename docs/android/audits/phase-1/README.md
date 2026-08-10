# Phase 1 audits index

This directory holds the **advisory** Phase 1 evidence for the Nova Play Android
phone initiative. Everything here is historical evidence and analysis, not a
requirement. These files inform owner decisions; they do not themselves amend any
normative document, and none of them closes Phase 1.

All files are grounded in the baseline commit
`7a4a3b163d436dd1727b9fad5356536e27ef8a7f` and dated 2026-08-09.

## Files in this directory

- **`codec-policy.md`** — codec-support audit for the API-26 / WebView-100 floor.
  Establishes the mandatory floor (H.264 Baseline + Main@L3.1, AAC-LC, HE-AAC),
  reclassifies H.264 High@L4.1 and HEVC Main10 as best-effort, HEVC Main as a
  capability class, and AC-3/E-AC-3 as best-effort with clean degradation. Grounded
  in the Android 8.0 CDD and Media3 documentation.
- **`native-media-architecture.md`** — audit of the eleven approved media
  requirements. Shows they occupy four ownership planes, argues Media3 is the
  presumptive backend with WebView as a capped diagnostic, and proposes four
  independent Phase 2 gates plus corrected estimates.
- **`playback-corpus-reproducibility.md`** — audit of the legal playback corpus.
  Finds coverage gaps and pinning/classification defects, and proposes a
  reproducibility model (gitignored fixtures, committed metadata lock, transitive
  closure hashing, deterministic local-live replay).
- **`closure-governance.md`** — audit of Phase 1 closure against the plan's work
  items and exit criterion. Covers the annotated baseline tag, selective-commit
  choreography, and the letter-vs-intent closure gap.
- **`decision-sheet.md`** — the **owner decision sheet** that reconciles the four
  audits above into one internally consistent set of recommended decisions
  (`P1-D01`..`P1-D17`), each `AWAITING APPROVAL`. Advisory until the owner
  approves it; only then may a later task integrate it into the normative
  documents.

## Where normative truth lives

The audits and the decision sheet are advisory. The authoritative documents are:

- `plans/main-refactor-v3.md`
- `docs/android/requirements.md`
- `docs/android/device-policy.md`
- `docs/android/playback-corpus.md`
- `docs/android/playback-corpus.lock.json` (once created)

If an audit and a normative document disagree, the normative document governs
until the owner approves a change.

## Repository rules for this directory

- **No verbatim conversation logs or model reasoning dumps.** Only distilled
  findings and decisions belong here.
- **No provider, credential, or private media data.** No panel hostnames,
  credentials, catalog payloads, or stream URLs. Only public reference / open
  -licence source families may be named; provider reachability stays uncommitted
  and redacted to shape only.
- **No duplicate "final-v2" reports.** One file per audit; supersede in place.
- **Corrections are dated addenda after closure**, appended to the relevant file
  rather than silently rewriting history.
- **The decision sheet must be owner-approved before any normative integration.**
  Nothing in `decision-sheet.md` amends `requirements.md`, `device-policy.md`,
  `playback-corpus.md`, or `plans/main-refactor-v3.md` until the owner signs the
  approval block and a later task performs the integration.
