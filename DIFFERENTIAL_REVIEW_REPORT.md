# Differential Review: PR #7

Date: 2026-09-04

Base: `011cece` (`origin/main`)

Reviewed head: `318aa3a` plus this report and README correction

## Executive Summary

No release-blocking security or correctness findings remain in the reviewed diff. The highest-risk path is the BYOK request to the OpenAI Responses API; the change preserves the existing authorization, page allow-list, prompt construction, `store: false`, and output-token limit while replacing buffered parsing with SSE parsing.

## Scope And Risk

- Repository size: 141 tracked files, including 91 JavaScript/TypeScript files. Focused review strategy used.
- High risk: `src/background/coach-router.js`, `src/background/coach-stream.js` because they handle an external API request and streamed model output.
- Medium risk: `src/content/inline-nudge.js`, `src/content/inline-nudge-bridge.js`, `src/sidepanel/guest-onboarding.js` because they change extension/page messaging and user actions.
- Low risk: tests, workflow syntax checks, design documents, and README metadata.

## Findings

No new exploitable security issue was found.

The page-world bridge still communicates through `window.postMessage`, so supported-site JavaScript can observe renderer messages. This trust boundary predates this diff. Action handling still requires the current short-lived token and the isolated content script retains policy and request routing. This is recorded as residual low risk rather than a regression.

## Security Invariants Checked

- BYOK credentials remain read only in the background request path and are sent only to `https://api.openai.com/v1/responses`.
- The request still uses `store: false`, bounded output tokens, and the existing server-built coaching instructions.
- Guest requests continue to send context and the user message to the Firebase backend without accepting client-built instructions.
- Streamed text and localized UI labels are inserted with `textContent` or editor decoration content, not interpreted as HTML.
- Monaco decorations, CodeMirror bookmarks, Ace overlays, controls, subscriptions, and observers have explicit cleanup paths.
- No API key pattern, `.env`, `.DS_Store`, `__MACOSX`, private key, or credential file is tracked in the reviewed tree.

## Blast Radius

- `coach-router.js`: one runtime importer, `src/background/service-worker.js`.
- `coach-stream.js`: one runtime importer, `coach-router.js`.
- Both inline scripts: loaded only by the two supported problem-page match groups in `manifest.json`.
- `guest-onboarding.js`: one runtime importer, `src/sidepanel/sidepanel.ai.js`.

## Tests And Coverage

- SSE parsing covers split chunks, CRLF, malformed events, unrelated events, and unterminated final events.
- Renderer tests cover Monaco injected text, CodeMirror bookmarks and fallback coordinates, Ace overlays, cleanup, action tokens, and keyboard event isolation.
- Localization tests cover paired Korean/English inline copy and live settings refresh through `chrome.storage.onChanged`.
- Existing policy tests cover guest quotas, route allow-lists, server-side prompt ownership, output limits, and access-mode routing.

## Residual Validation Gap

Automated editor doubles cover all three editor adapters. A final unpacked-extension smoke test on live LeetCode and Programmers remains desirable because those sites can change private DOM/editor integration details independently of this repository.
