# Inline Coach and Guest Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render CodeCoach guidance as native-looking ghost text across supported editors, provide complete Korean and English inline UI, and replace the promotional guest card with a quiet text action.

**Architecture:** Keep coaching state and request policy in `inline-nudge.js`; replace only the page-world renderer in `inline-nudge-bridge.js`. Monaco uses injected-text decorations, CodeMirror uses an inline bookmark when available, and Ace plus unsupported CodeMirror versions use a shared coordinate overlay. Guest onboarding remains in its existing side-panel module, and streaming parsing is moved to a small pure helper so chunk-boundary behavior can be tested directly.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript content scripts, Monaco/CodeMirror/Ace browser APIs, Vitest with jsdom, OpenAI Responses API SSE.

**Spec:** `docs/superpowers/specs/2026-09-04-inline-coach-guest-entry-design.md`

## Global Constraints

- Do not change guest quotas, pricing, backend prompts, or API-key storage policy.
- Never write inline coaching text into the user's source model.
- Keep Korean and English information structure equivalent.
- Preserve full-solution blocking, request routing, and stale request-ID checks.
- Add no runtime dependency.

---

### Task 1: Make Response Streaming Boundary-Safe

**Files:**
- Create: `src/background/coach-stream.js`
- Create: `src/background/coach-stream.test.js`
- Modify: `src/background/coach-router.js`
- Modify: `.github/workflows/proactive-coach.yml`

**Interfaces:**
- Produces: `createSseTextParser(): { push(chunk: string): string, finish(): string }`
- Produces: `progressiveTextParts(text: string): string[]`
- Consumes: decoded text chunks from `Response.body.getReader()`.

- [ ] **Step 1: Write failing parser tests**

```js
import { createSseTextParser, progressiveTextParts } from "./coach-stream.js";

it("parses LF, CRLF, and a final event without a blank terminator", () => {
  const parser = createSseTextParser();
  expect(parser.push('data: {"type":"response.output_text.delta","delta":"Hel"}\r\n\r\n')).toBe("Hel");
  expect(parser.push('data: {"type":"response.output_text.delta","delta":"lo"}')).toBe("");
  expect(parser.finish()).toBe("lo");
});

it("preserves whitespace when progressively revealing buffered guest text", () => {
  expect(progressiveTextParts("one  two\nthree").join("")).toBe("one  two\nthree");
});
```

- [ ] **Step 2: Run `npm test -- src/background/coach-stream.test.js`**

Expected: FAIL because `coach-stream.js` does not exist.

- [ ] **Step 3: Implement the pure stream helper**

```js
export function createSseTextParser() {
  let buffer = "";
  const consume = (flush = false) => {
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = flush ? "" : events.pop() || "";
    return (flush ? events : events).map(parseEvent).join("");
  };
  return {
    push(chunk) { buffer += chunk; return consume(false); },
    finish() { return consume(true); }
  };
}
```

Implement `parseEvent` to concatenate only `response.output_text.delta` data records and ignore malformed events and `[DONE]`.

- [ ] **Step 4: Route `coach-router.js` through the helper**

Create one parser per BYOK response, call `decoder.decode()` once after reader completion, feed the decoder tail and `finish()`, and emit every non-empty delta while preserving accumulated `rawText`. Replace the local regex in `emitProgressiveText` with `progressiveTextParts`.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- src/background/coach-stream.test.js && npm test`

Expected: parser tests and all root tests PASS.

- [ ] **Step 6: Add syntax coverage and commit**

Add `node --check src/background/coach-stream.js` to the workflow.

```bash
git add src/background/coach-stream.js src/background/coach-stream.test.js src/background/coach-router.js .github/workflows/proactive-coach.yml
git commit -m "fix: harden inline response streaming"
```

### Task 2: Replace View-Zone Cards With Ghost Text

**Files:**
- Create: `src/content/inline-nudge-bridge.test.js`
- Modify: `src/content/inline-nudge-bridge.js`

**Interfaces:**
- Consumes: `{ source, token, lineNumber, view }` window messages from `inline-nudge.js`.
- Produces: `CODING_HINT_COACH_INLINE_ACTION` messages with `{ token, action, value }`.
- Maintains: one active decoration or overlay and one control row per editor.

- [ ] **Step 1: Write a failing Monaco regression test**

Load the bridge IIFE into jsdom with a fake Monaco editor. Send a render message and assert:

```js
expect(model.deltaDecorations).toHaveBeenCalled();
expect(editor.changeViewZones).not.toHaveBeenCalled();
expect(document.querySelector(".codecoach-inline-controls")).not.toBeNull();
```

Click the hint action and assert the emitted action message keeps the render token.

- [ ] **Step 2: Write failing CodeMirror and Ace fallback tests**

Provide fake CodeMirror `setBookmark` and Ace `renderer.textToScreenCoordinates` results. Assert CodeMirror receives an inline widget, the Ace ghost overlay is attached inside the editor container at the requested line, and both are removed after `SOURCE_HIDE`. Add one CodeMirror case without `setBookmark` and assert it uses the shared coordinate overlay.

- [ ] **Step 3: Run `npm test -- src/content/inline-nudge-bridge.test.js`**

Expected: FAIL because the current bridge calls `changeViewZones` and renders `.codecoach-inline-native` cards.

- [ ] **Step 4: Implement the minimal ghost renderer**

For Monaco, call `model.deltaDecorations` with `options.after.content` and `inlineClassName: "codecoach-inline-ghost"`. For CodeMirror, pass a ghost node to `setBookmark` at the target line's end column. For Ace and unsupported CodeMirror versions, position `.codecoach-inline-ghost-overlay` from editor coordinates. Render controls separately as `.codecoach-inline-controls`; only create the input when `view.showInput` is true.

- [ ] **Step 5: Isolate controls and keep them synchronized**

Stop pointer, mouse, click, keyboard, input, paste, and composition propagation from controls. Reposition on editor scroll/content/cursor callbacks plus `ResizeObserver`; remove every subscription, observer, timer, decoration, and node in `hideInline()`.

- [ ] **Step 6: Run focused tests and syntax check**

Run: `npm test -- src/content/inline-nudge-bridge.test.js && node --check src/content/inline-nudge-bridge.js`

Expected: all editor renderer tests PASS and syntax check exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/content/inline-nudge-bridge.js src/content/inline-nudge-bridge.test.js
git commit -m "fix: render coaching as editor ghost text"
```

### Task 3: Complete Inline Korean and English UI

**Files:**
- Create: `src/content/inline-nudge.test.js`
- Modify: `src/content/inline-nudge.js`

**Interfaces:**
- Consumes: sanitized settings returned by `GET_SETTINGS`.
- Produces: localized semantic `view` payloads for the bridge.
- Reacts to: `chrome.storage.local.onChanged` by refreshing settings.

- [ ] **Step 1: Write failing localization tests**

Run the content-script IIFE with fake runtime responses for `uiLanguage: "ko"` and `uiLanguage: "en"`. Trigger planning and guest-start states. Assert exact paired copy including:

```js
expect(koreanView.primaryLabel).toBe("접근 적기");
expect(englishView.primaryLabel).toBe("Write approach");
expect(koreanGuest.primaryLabel).toBe("무료로 시작");
expect(englishGuest.primaryLabel).toBe("Start free");
```

Assert a storage change causes a fresh `GET_SETTINGS` request before the next render.

- [ ] **Step 2: Run `npm test -- src/content/inline-nudge.test.js`**

Expected: at least the storage-change assertion FAILS because no listener exists.

- [ ] **Step 3: Normalize all inline copy**

Keep one `STRINGS` object with complete `ko` and `en` keys. Replace mixed AI-marketing phrases with concise coaching copy while retaining separate UI and response language responsibilities.

- [ ] **Step 4: Refresh language on settings changes**

Register `chrome.storage.local.onChanged`; call `refreshSettings()` and rerender the current semantic state on the next state transition. Do not translate already generated model output.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- src/content/inline-nudge.test.js && node --check src/content/inline-nudge.js`

```bash
git add src/content/inline-nudge.js src/content/inline-nudge.test.js
git commit -m "fix: localize inline coaching states"
```

### Task 4: Distill Guest Onboarding to a Text Action

**Files:**
- Modify: `landing/extension-policy.test.ts`
- Modify: `src/sidepanel/guest-onboarding.js`

**Interfaces:**
- Consumes: `GET_SETTINGS`, `GET_GUEST_STATUS`, and `START_GUEST_TRIAL` responses.
- Produces: one localized text-style guest action and optional state/error note.

- [ ] **Step 1: Update the policy test first**

Replace the old copy assertions with:

```ts
expect(onboarding).toContain("먼저 무료로 사용하기");
expect(onboarding).toContain("Try free first");
expect(onboarding).not.toContain("codecoach-guest-divider");
expect(onboarding).not.toContain("guestCtaSub");
```

- [ ] **Step 2: Run `npm test -- landing/extension-policy.test.ts`**

Expected: FAIL because the purple guest card and divider still exist.

- [ ] **Step 3: Implement the text-style action**

Remove the divider and two-line card markup. Use one button with the localized free count, transparent background, underline offset, visible focus ring, and distinct loading/disabled text. Keep state notes hidden unless a request fails or the quota is exhausted.

- [ ] **Step 4: Run focused tests and visual DOM checks**

Run: `npm test -- landing/extension-policy.test.ts && node --check src/sidepanel/guest-onboarding.js`

Expected: copy and removed-style assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add landing/extension-policy.test.ts src/sidepanel/guest-onboarding.js
git commit -m "fix: simplify guest onboarding entry"
```

### Task 5: Release Verification and PR Update

**Files:**
- Create: `CODECOACH_DIFFERENTIAL_REVIEW_2026-09-04.md`
- Modify only if verification finds a scoped defect.

**Interfaces:**
- Consumes: all changes from Tasks 1-4.
- Produces: a reviewed PR #7 branch with reproducible verification evidence.

- [ ] **Step 1: Run the full verification suite**

```bash
npm test
npm run typecheck
npm run build
npm --prefix functions test
node --check src/background/coach-router.js
node --check src/background/coach-stream.js
node --check src/content/inline-nudge-bridge.js
node --check src/content/inline-nudge.js
node --check src/sidepanel/guest-onboarding.js
git diff --check origin/main...HEAD
```

- [ ] **Step 2: Perform manual editor smoke checks**

Load the unpacked extension in a test browser, verify one LeetCode Monaco problem and one Programmers problem in Korean and English, and confirm narrow-width text remains visible. Record any browser limitation explicitly if a live authenticated editor cannot be reached.

- [ ] **Step 3: Write the differential review report**

Document files reviewed, external-call risk in streaming, test coverage, caller count, remaining limitations, and final recommendation in `CODECOACH_DIFFERENTIAL_REVIEW_2026-09-04.md`.

- [ ] **Step 4: Commit verified artifacts**

```bash
git add CODECOACH_DIFFERENTIAL_REVIEW_2026-09-04.md
git commit -m "docs: record PR 7 differential review"
```

- [ ] **Step 5: Push the existing PR branch**

```bash
git push origin fix-inline-interactions-streaming
gh pr checks 7 --repo tkim602/CodeCoach --watch
```

Expected: PR #7 points to the new head and all required checks PASS.
