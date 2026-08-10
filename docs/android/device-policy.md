# Android device-support policy

**Phase:** `plans/main-refactor-v3.md` Phase 1, step 3. Records the §3 decision.
**Decided:** 2026-08-09.
**Owner:** Arash Ghalamifard (`sghalamifard@adaptavist.com`).
**Status:** approved. Binding on Phase 3 and Phase 4.

---

## 1. Decision

**Controlled beta.**

Nova Play's Android phone app ships to a recruited cohort of **8–12 testers
spanning at least three distinct device classes**, with sanitized telemetry and a
rehearsed rollback path. It is not offered to the open Play Store, and it is not
described as "Android support," until the cohort has produced evidence across
those classes.

The two alternatives in plan §3 were considered and rejected for now:

| Alternative | Why not |
|---|---|
| Named-device support | Free and honest, but limits reach to the single tested handset. Kept as the **mandatory fallback** — see §5. |
| Fund a device set | Buys calendar time with money. Not chosen; may be revisited if recruitment stalls. |

There is no fourth option. A one-row supported matrix presented as Android
support is fiction, and so is any schedule built on it.

---

## 2. Why a cohort, and not the two devices we own

The team owns **one Android phone and one Android TV box**. Those two devices
establish feasibility *on those two devices*. They do not establish Android
compatibility.

What varies materially between handsets, and is therefore unmeasurable from a
sample of one:

- **Codec stacks** — hardware decoder availability, level and profile limits, and
  which containers the platform will hand to the WebView at all.
- **OEM System WebView** — vendor forks, update channel, and whether the user's
  WebView actually tracks the Play Store release.
- **Memory class** — governs when the OS kills a backgrounded Activity, which is
  precisely the surface Phase 2 must prove.
- **Lifecycle behavior** — OEM battery-optimization and background-execution
  policies differ sharply and directly affect background audio, which §4 of
  `requirements.md` puts in scope.

Every one of those is a Phase 2 or Phase 3 failure mode. A cohort is the cheapest
instrument that can see them.

---

## 3. What "at least three device classes" means

A **device class** is a distinct combination of:

1. **OEM / SoC family** — e.g. Samsung/Exynos, Google/Tensor, Xiaomi/Snapdragon,
   a MediaTek-based budget handset.
2. **Android API level** — at or above the floor in `docs/android/requirements.md`.
3. **System WebView major version** — as reported at runtime, not as assumed.

Two testers on the same OEM, API level and WebView major are **one class**, not
two. The cohort is only valid if at least three classes are genuinely populated;
recruiting twelve testers who all own the same phone satisfies the headcount and
none of the purpose.

Target composition, to be met before Phase 4 ships to the cohort:

| Slot | Requirement |
|---|---|
| Class A | The team's own tested phone. Baseline; already covered. |
| Class B | A different OEM/SoC family from Class A. |
| Class C | A different API level from A and B, at or above the floor — preferably the floor itself. |
| Remainder | Free allocation, biased toward budget handsets and toward whichever OEM the tester base actually uses. |

At least one cohort device **must sit at the minimum supported API level**.
A floor nobody tests is not a floor; it is a guess.

---

## 4. Obligations this policy creates

Each of these is a Phase 4 deliverable, listed here so the cost of the decision
is visible at the point it was taken rather than discovered later.

1. **Recruitment.** Identify and onboard 8–12 testers meeting §3. Record each
   tester's device class — nothing identifying the person — in the cohort roster.
2. **A sanitized telemetry surface.** Crash, lifecycle transition, selected
   playback backend, stream protocol, OS version and WebView version.
   **Never** provider URLs, credentials, panel hostnames, catalog payloads or
   anything derived from them. This is `CLAUDE.md`'s device-local-credentials
   rule applied to telemetry, and it is release-blocking, not advisory.
3. **A rehearsed rollback.** Not a documented rollback — a rehearsed one.
   Plan §6 Phase 4's exit criterion requires it to have been exercised at least
   once before the cohort is considered live.
4. **Independence from webOS release.** An Android rollback must never block
   rebuilding and reshipping the approved webOS release. The two release paths
   share no gate.

---

## 5. The reduction rule

If, by the time Phase 3 begins, the cohort cannot be populated to §3 —
fewer than three genuine device classes, or fewer than eight testers — then
**this policy reduces to named-device support** and the product's reach claim
reduces with it, in writing, in the install instructions.

That reduction is automatic. It is not a discussion, and it does not require the
cohort to have failed at anything: an unpopulated cohort is simply an untested
claim, and the plan forbids shipping one.

Per plan §3, this decision must be settled **before Phase 3 begins**, not before
release.

---

## 6. What this policy does not decide

Deferred to Phase 4 by plan §6, and deliberately left open here:

- Signing keys, package ID, and distribution track (internal testing, closed
  testing, or sideloaded APK).
- Play Store review requirements.
- Backup and reinstall survival.
- Localization and accessibility acceptance.

Deferred until after Phase 4 by plan §6:

- **Android TV.** Out of scope entirely until the phone app is in the cohort's
  hands. The TV box the team owns is not a reason to start; it is only a reason
  the question stays answerable later.
