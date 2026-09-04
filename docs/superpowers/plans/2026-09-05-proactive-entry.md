# Proactive Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a localized inline coaching choice immediately, then intervene sooner when the learner fails or stops progressing.

**Architecture:** Reuse the existing inline nudge state machine and renderer. Change only its timing gates, planning actions, localized strings, and focused source-level regression test.

**Tech Stack:** JavaScript, Chrome extension APIs, Vitest

---

### Task 1: Proactive inline entry

**Files:**
- Modify: `src/content/inline-nudge.js`
- Modify: `src/content/inline-nudge-bridge.js`
- Test: `src/content/inline-nudge.test.js`
- Test: `src/content/inline-nudge-bridge.test.js`

- [x] **Step 1: Write the failing test**

Assert the 1.5-second opening delay, 45-second stuck delay, 2-minute cooldown, three localized opening actions, and removal of stub-only gating.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/content/inline-nudge.test.js`

Expected: FAIL because the current source waits 35/90 seconds and exposes only two opening actions.

- [x] **Step 3: Write minimal implementation**

Rename the opening delay constant, reduce timing values, show planning once regardless of code shape, remove the unused stub detector, make failures immediate, add the localized hint action, and align CodeMirror overlays to the wrapper.

- [x] **Step 4: Run verification**

Run: `npm test -- src/content/inline-nudge.test.js && npm test && npm run build`

Expected: all tests pass and the extension build completes.

- [x] **Step 5: Commit**

```bash
git add src/content/inline-nudge.js src/content/inline-nudge.test.js docs/superpowers/plans/2026-09-05-proactive-entry.md
git commit -m "feat: make inline coach proactive"
```
