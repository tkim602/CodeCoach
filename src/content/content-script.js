(function () {
  const LEETCODE_BLOCKED_PREFIXES = ["/contest", "/assessment", "/interview", "/explore", "/discuss"];
  const LEETCODE_BLOCKED_PROBLEM_SECTIONS = new Set(["editorial", "solutions", "solution"]);
  const PROGRAMMERS_HOSTS = new Set(["school.programmers.co.kr", "programmers.co.kr", "www.programmers.co.kr"]);
  const PROGRAMMERS_BLOCKED_PREFIXES = [
    "/competitions",
    "/skill_checks",
    "/assignments",
    "/certifications",
    "/job_positions",
    "/career",
    "/pr",
    "/users",
    "/learn/challenges"
  ];
  // Result detection uses visible DOM text only.
  // No network responses are intercepted, no cookies or auth headers are accessed.

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "GET_CONTEXT") return false;

    collectContext()
      .then((context) => sendResponse({ ok: true, context }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  });

  let lastContextSignature = "";
  let lastUrl = location.href;
  let submissionWatchUntil = 0;
  let lastSubmissionSignature = "";
  let lastObservedAction = { kind: "unknown", label: "", at: 0 };
  let pendingSubmission = null;
  let lastEditorChangeAt = 0;
  let lastResultForCode = null;
  let submissionDetectionTimer = null;
  // Code cached from monaco-bridge.js (MAIN world). Always reflects the full editor contents,
  // not just the visible viewport. Updated continuously by the bridge.
  let bridgeCachedCode = "";
  let bridgeCachedLanguage = "";

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== "CODING_HINT_COACH_EDITOR_STATE") return;
    if (typeof event.data.code === "string" && event.data.code.length > 0) {
      bridgeCachedCode = event.data.code;
      if (event.data.language) bridgeCachedLanguage = event.data.language;
    }
  });

  function requestBridgeRefresh() {
    try { window.postMessage({ source: "CODING_HINT_COACH_REQUEST_EDITOR_STATE" }, "*"); } catch {}
  }
  const pushContextUpdate = debounce(async () => {
    try {
      const context = await collectContext();
      const signature = [
        context.url,
        context.allowed,
        context.problemUrl,
        context.language,
        context.code,
        context.problemContext,
        context.selectedContext,
        JSON.stringify(context.testResults || {})
      ].join("\n---\n");

      if (signature === lastContextSignature) return;
      lastContextSignature = signature;
      sendRuntimeMessage({ type: "PAGE_CONTEXT_UPDATED", context });
    } catch {}
  }, 50);

  let fastSyncUntil = 0;
  installLiveContextWatchers();
  setTimeout(pushContextUpdate, 500);
  setTimeout(pushContextUpdate, 1800);
  setTimeout(pushContextUpdate, 3500);
  setTimeout(pushContextUpdate, 7000);

  async function collectContext() {
    const signals = collectPageSignals();
    const eligibility = evaluatePage(location.href, signals);
    const editor = await extractEditorState();
    const selectedContext = getSelectedText();
    const testResults = getExecutionResultSnapshot(editor.code || "");

    return {
      allowed: eligibility.allowed,
      pageStatus: eligibility.status,
      platform: eligibility.platform,
      platformName: eligibility.platformName,
      reason: eligibility.reason,
      url: location.href,
      problemUrl: eligibility.problemUrl,
      problemSlug: eligibility.problemSlug,
      problemId: eligibility.problemId,
      courseId: eligibility.courseId,
      lessonId: eligibility.lessonId,
      title: getProblemTitle(eligibility.platform),
      problemContext: getProblemContext(eligibility.platform),
      language: editor.language || detectSelectedLanguage() || detectLanguage(editor.code),
      code: editor.code || "",
      selectedLine: selectedContext && selectedContext.length < 500 ? selectedContext : "",
      selectedContext,
      testResults,
      favIconUrl: getPageFavIconUrl(),
      capturedAt: new Date().toISOString()
    };
  }

  function getPageFavIconUrl() {
    const link = document.querySelector("link[rel~='icon']");
    if (link?.href) return link.href;
    return "";
  }

  function installLiveContextWatchers() {
    ["keydown", "input", "change", "paste", "compositionend"].forEach((eventName) => {
      document.addEventListener(eventName, activateFastSync, true);
    });
    document.addEventListener("mouseup", pushContextUpdate, true);
    document.addEventListener("selectionchange", pushContextUpdate, true);
    document.addEventListener("click", markSubmissionWatchIfNeeded, true);

    const observer = new MutationObserver((mutations) => {
      const shouldUpdate = mutations.some((mutation) => {
        const target = mutation.target;
        const element = target instanceof Element ? target : target.parentElement;
        if (!element) return false;
        return Boolean(element.closest?.(".monaco-editor, .ace_editor, .CodeMirror") || element.matches?.("textarea"));
      });
      const resultChanged = mutations.some((mutation) => {
        const target = mutation.target;
        const element = target instanceof Element ? target : target.parentElement;
        if (!element) return false;
        return hasResultLikeText(element.innerText || element.textContent || "");
      });
      if (shouldUpdate) activateFastSync();
      if (resultChanged) armSubmissionWatchForVisibleResult();
      if (Date.now() < submissionWatchUntil) queueSubmissionResultDetection();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // SPA navigation detection via popstate event + 250ms polling. Polling catches
    // pushState/replaceState changes from frameworks like React Router (which don't
    // fire popstate). The slight delay (max 250ms) is imperceptible in practice.
    const onNavigation = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      lastContextSignature = "";
      lastSubmissionSignature = "";
      pushContextUpdate();
      setTimeout(pushContextUpdate, 500);
      setTimeout(pushContextUpdate, 1500);
      setTimeout(pushContextUpdate, 3500);
    };
    window.addEventListener("popstate", onNavigation);
    setInterval(() => {
      if (Date.now() < fastSyncUntil && document.hasFocus()) {
        pushContextUpdate();
      }

      if (location.href !== lastUrl) {
        onNavigation();
      }

      if (Date.now() < submissionWatchUntil) {
        queueSubmissionResultDetection();
      }
    }, 250);
  }

  function activateFastSync(event) {
    if (isEditorInteractionTarget(event?.target)) {
      lastEditorChangeAt = Date.now();
    }
    fastSyncUntil = Date.now() + 3000;
    pushContextUpdate();
  }

  function isEditorInteractionTarget(target) {
    const element = target instanceof Element ? target : null;
    if (!element) return false;
    return Boolean(
      element.matches?.("textarea, input") ||
      element.closest?.(".monaco-editor, .ace_editor, .CodeMirror, textarea, input")
    );
  }

  function markSubmissionWatchIfNeeded(event) {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest?.("button, [role='button'], a, input[type='button'], input[type='submit']");
    const label = normalizeProblemText([
      button?.innerText,
      button?.textContent,
      button?.getAttribute?.("aria-label"),
      button?.getAttribute?.("title"),
      button?.getAttribute?.("value")
    ].filter(Boolean).join(" ")).toLowerCase();
    if (!label) return;
    const isSubmitLike = [
      "submit",
      "제출",
      "채점",
      "제출하기",
      "run submit",
      "submit code"
    ].some((needle) => label.includes(needle));
    if (!isSubmitLike) return;

    const now = Date.now();
    lastObservedAction = { kind: "submit", label, at: now };
    submissionWatchUntil = now + 90000;

    // Pre-capture what's currently visible as a result, so we can filter stale results.
    const preSubmitResultText = getVisibleResultLineText();

    const signals = collectPageSignals();
    const eligibility = evaluatePage(location.href, signals);

    // Ask the MAIN-world bridge for the freshest code right now.
    requestBridgeRefresh();

    // Set pendingSubmission immediately using the bridge cache (full code, not viewport).
    pendingSubmission = {
      platform: eligibility.platform,
      problemTitle: getProblemTitle(eligibility.platform),
      problemUrl: eligibility.problemUrl,
      code: bridgeCachedCode || "",
      language: bridgeCachedLanguage || detectSelectedLanguage() || "",
      clickedAt: now,
      codeHash: quickCodeSignature(bridgeCachedCode || ""),
      prevResultText: preSubmitResultText
    };

    // Async refinement: if bridge cache is empty, try the service-worker MAIN-world fetch.
    if (!pendingSubmission.code) {
      extractEditorState().then((editor) => {
        if (editor.code && pendingSubmission && pendingSubmission.clickedAt === now) {
          pendingSubmission.code = editor.code;
          pendingSubmission.language = editor.language || pendingSubmission.language;
          pendingSubmission.codeHash = quickCodeSignature(editor.code);
        }
      }).catch(() => {});
    }

    // Retry schedule: polls at increasing intervals to catch slow judges.
    [1200, 2500, 4000, 7000, 12000, 20000, 35000, 60000].forEach((delay) => {
      setTimeout(queueSubmissionResultDetection, delay);
    });
  }

  function isUnambiguousSubmissionResult(text) {
    // "Accepted" alone also appears in LeetCode problem stats (e.g. "7M Accepted submissions").
    // Require submission-specific markers to avoid false positives on page load.
    return (
      /\d+\s*\/\s*\d+\s*testcases?\s*passed/i.test(text) ||
      /정답입니다|틀렸습니다/.test(text) ||
      /submitted\s+at\b/i.test(text) ||
      /채점\s*결과|실행\s*결과/.test(text)
    );
  }

  function armSubmissionWatchForVisibleResult() {
    const bodyText = document.body?.innerText || "";
    if (!hasResultLikeText(bodyText)) return;
    if (recentActionKind() === "unknown") {
      // Only infer a submit if the text is unambiguously a submission result —
      // not just "Accepted" from the problem stats acceptance-rate sidebar.
      if (!isUnambiguousSubmissionResult(bodyText)) {
        pushContextUpdate();
        return;
      }
      lastObservedAction = { kind: "submit", label: "dom-inferred", at: Date.now() };
      submissionWatchUntil = Date.now() + 60000;
    }
    queueSubmissionResultDetection();
    pushContextUpdate();
  }

  function hasResultLikeText(text) {
    return /(정답입니다|틀렸습니다|\baccepted\b|wrong answer|runtime error|compile error|time limit exceeded|memory limit exceeded)/i.test(String(text || ""));
  }

  function queueSubmissionResultDetection() {
    if (submissionDetectionTimer) return;
    submissionDetectionTimer = setTimeout(async () => {
      submissionDetectionTimer = null;
      await detectAndReportSubmissionResult();
    }, 450);
  }

  async function detectAndReportSubmissionResult() {
    if (Date.now() >= submissionWatchUntil) return;
    const detected = getBestDetectedResult();
    if (!detected.status) return;
    if (recentActionKind() !== "submit") return;

    // Give LeetCode time to clear the previous result and render the new one.
    // Without this delay, the stale prior-result text still showing during the
    // judging loading state gets misattributed to the new submit.
    if (pendingSubmission && Date.now() - pendingSubmission.clickedAt < 2500) return;

    const context = await collectContext();
    if (!context.allowed) return;

    // Prefer code captured at submit-click time; fall back to current editor state.
    const code = pendingSubmission?.code?.trim() || context.code?.trim();
    if (!code) return;

    const mergedContext = {
      ...context,
      code,
      language: pendingSubmission?.language || context.language,
      title: pendingSubmission?.problemTitle || context.title,
      problemUrl: pendingSubmission?.problemUrl || context.problemUrl
    };

    const testResults = createExecutionSnapshot(detected);
    const snapshotStatus = snapshotStatusForDetected(detected);
    const codeSignature = quickCodeSignature(code);
    lastResultForCode = {
      codeSignature,
      recordedAt: Date.now(),
      testResults
    };
    const signature = [
      mergedContext.problemUrl,
      snapshotStatus,
      await hashText(code),
      String(lastObservedAction.at || ""),
      detected.resultText
    ].join("\n");
    if (signature === lastSubmissionSignature) return;
    lastSubmissionSignature = signature;
    sendRuntimeMessage({
      type: "SUBMISSION_RESULT_DETECTED",
      context: { ...mergedContext, testResults },
      resultEventId: testResults.eventId,
      status: snapshotStatus,
      resultText: detected.resultText,
      testResults
    });

    // Exactly one save per submit click. Closing the watch window prevents stale
    // result text from a prior submission (e.g. an old Accepted in the submissions
    // sidebar) from being detected as a second event after the real result is saved.
    submissionWatchUntil = 0;
    pendingSubmission = null;
  }

  function getBestDetectedResult() {
    // DOM-only detection: reads visible page text, no network interception.
    return detectSubmissionResult();
  }

  function detectSubmissionResult() {
    if (PROGRAMMERS_HOSTS.has(location.hostname)) {
      return detectProgrammersFinalSubmissionResult();
    }

    if (location.hostname === "leetcode.com" || location.hostname === "www.leetcode.com") {
      return detectLeetCodeFinalSubmissionResult();
    }

    return emptyDetectedResult();
  }

  function detectProgrammersFinalSubmissionResult() {
    // Priority scan: known Programmers result containers (modal, result area, grade area).
    const priorityText = getVisibleTextForSelectors([
      "[class*='result']",
      "[class*='Result']",
      "[id*='result']",
      "[class*='grade']",
      "[class*='Grade']",
      "[class*='modal']",
      "[class*='Modal']",
      "[role='dialog']",
      "[class*='submit']",
      "[class*='score']",
      "div.modal-header > h4",
      "#modal-dialog",
      ".modal-body"
    ]);

    // Fallback: any visible line on the page containing a result keyword.
    const lineText = getVisibleResultLineText();

    const combined = normalizeProblemText([priorityText, lineText].filter(Boolean).join("\n"));
    if (!combined) return emptyDetectedResult();

    const result = detectSubmissionResultFromText(combined, { kind: "submit", source: "dom" });
    if (!result.status) return emptyDetectedResult();

    const cases = parseDomResultCases();
    return {
      ...result,
      cases: cases.length ? cases : result.cases,
      kind: "submit",
      source: "dom"
    };
  }

  function detectLeetCodeFinalSubmissionResult() {
    // Use ANCHORED context to avoid matching stale text (sidebar history, problem
    // stats, "Accepted submissions" counts). Each status keyword must appear next
    // to a context marker that only the current result panel renders.
    const bodyText = normalizeProblemText(document.body?.innerText || "").slice(0, 60000);

    // Each entry: status keyword + REQUIRED nearby context marker.
    // "test\s*cases?" allows both "testcases" and "test cases" spellings.
    const failureRules = [
      { label: "Wrong Answer", regex: /\bWrong Answer\b[\s\S]{0,1500}?(\d+\s*\/\s*\d+\s+test\s*cases?\s+passed|Last Executed Input|Expected[:\s])/i },
      { label: "Runtime Error", regex: /\bRuntime Error\b[\s\S]{0,1500}?(IndentationError|SyntaxError|NameError|TypeError|ZeroDivisionError|IndexError|KeyError|AttributeError|RuntimeError|RecursionError|ValueError|ArithmeticError|UnboundLocalError|StopIteration|OverflowError|Line\s+\d+|Solution\.|Last Executed Input)/i },
      { label: "Time Limit Exceeded", regex: /\bTime Limit Exceeded\b[\s\S]{0,1500}?(Last Executed Input|exceeded|seconds?)/i },
      { label: "Memory Limit Exceeded", regex: /\bMemory Limit Exceeded\b[\s\S]{0,1500}?(Last Executed Input|memory|MB)/i },
      { label: "Compile Error", regex: /\bCompile Error\b[\s\S]{0,1500}?(Line\s+\d+|error[:\s]|expected|undefined|undeclared|cannot find symbol|missing)/i }
    ];

    for (const rule of failureRules) {
      const match = bodyText.match(rule.regex);
      if (match) {
        const localStart = Math.max(0, match.index - 50);
        const localText = bodyText.slice(localStart, match.index + 1800);
        const metrics = parseLeetCodeMetrics(localText);
        const cases = [{ id: "submission", label: rule.label, status: "failed", detail: match[0].slice(0, 400) }];
        return {
          status: "failed",
          resultText: clipResultText(localText),
          summary: summarizeTestResults("failed", cases, metrics),
          cases, metrics, kind: "submit", source: "dom"
        };
      }
    }

    // Success: Accepted + full testcase count + at least one strong submission-result marker.
    // Allows both "testcases" and "test cases" spellings, and accepts Runtime/Memory/Beats/Submitted at as the anchor.
    const accepted = bodyText.match(/\bAccepted\b\s+(\d+)\s*\/\s*(\d+)\s+test\s*cases?\s+passed[\s\S]{0,2000}?(Runtime\s|Memory\s|Beats|Submitted at)/i);
    if (accepted) {
      const passed = Number(accepted[1]);
      const total = Number(accepted[2]);
      if (passed > 0 && passed === total) {
        const localStart = Math.max(0, accepted.index - 50);
        const localText = bodyText.slice(localStart, accepted.index + 2000);
        const metrics = parseLeetCodeMetrics(localText);
        const cases = [{
          id: "submission",
          label: `${passed} / ${total} testcases passed`,
          status: "passed",
          detail: `Accepted - ${passed} / ${total} testcases passed`
        }];
        return {
          status: "passed",
          resultText: clipResultText(localText),
          summary: summarizeTestResults("passed", cases, metrics),
          cases, metrics, kind: "submit", source: "dom"
        };
      }
    }

    return emptyDetectedResult();
  }

  const LEETCODE_STATUS_PATTERN = /\b(Accepted|Wrong Answer|Runtime Error|Compile Error|Time Limit Exceeded|Memory Limit Exceeded)\b(?:\s+(\d+)\s*\/\s*(\d+)\s*testcases\s*passed)?/i;
  const LEETCODE_STATUS_GLOBAL_PATTERN = /\b(Accepted|Wrong Answer|Runtime Error|Compile Error|Time Limit Exceeded|Memory Limit Exceeded)\b/gi;

  function getBestLeetCodeResultCandidate() {
    const candidates = [];
    const selectors = [
      '[data-e2e-locator*="submission"]',
      '[data-e2e-locator*="result"]',
      '[data-cy*="submission"]',
      '[data-cy*="result"]',
      '[class*="submission"]',
      '[class*="Submission"]',
      '[class*="result"]',
      '[class*="Result"]',
      '[role="tabpanel"]',
      "main",
      "section",
      "body"
    ];
    const seen = new Set();
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => {
        if (seen.has(node) || !isVisibleElement(node)) return;
        seen.add(node);
        const nodeText = normalizeProblemText(node.innerText || node.textContent || "");
        if (!nodeText) return;
        for (const match of nodeText.matchAll(LEETCODE_STATUS_GLOBAL_PATTERN)) {
          const start = Math.max(0, match.index || 0);
          const text = nodeText.slice(start, start + 3000);
          const detailedMatch = text.match(LEETCODE_STATUS_PATTERN);
          if (!detailedMatch) continue;
          candidates.push({
            text,
            match: detailedMatch,
            score: scoreLeetCodeResultCandidate(node, text, detailedMatch)
          });
        }
      });
    }
    return candidates.sort((a, b) => b.score - a.score || b.text.length - a.text.length)[0] || null;
  }

  function scoreLeetCodeResultCandidate(node, text, match) {
    const tag = node.tagName?.toLowerCase?.() || "";
    const status = String(match?.[1] || "").toLowerCase();
    const localText = leetCodeLocalResultWindow(text);
    let score = 0;
    if (/\d+\s*\/\s*\d+\s*testcases\s*passed/i.test(localText)) score += 70;
    if (/Runtime\s+[\d.]+\s*(?:ms|s)/i.test(localText)) score += 32;
    if (/Memory\s+[\d.]+\s*(?:MB|KB|GB)/i.test(localText)) score += 32;
    if (status === "accepted" && /Runtime|Memory/i.test(localText)) score += 20;
    if (/\bsubmitted at\b|testcases passed/i.test(localText)) score += 12;
    if (tag !== "body" && tag !== "main") score += 10;
    if (tag === "body") score -= 30;
    if (tag === "main") score -= 12;
    const statuses = [...localText.matchAll(LEETCODE_STATUS_GLOBAL_PATTERN)];
    if (statuses.length > 1) score -= Math.min(30, statuses.length * 6);
    return score;
  }

  function leetCodeLocalResultWindow(text) {
    const statuses = [...String(text || "").matchAll(LEETCODE_STATUS_GLOBAL_PATTERN)];
    if (statuses.length > 1 && statuses[1].index > 0) {
      return text.slice(0, statuses[1].index);
    }
    return String(text || "").slice(0, 1400);
  }

  function parseLeetCodeMetrics(text) {
    const metrics = {};
    const runtime = String(text || "").match(/Runtime\s+([\d.]+\s*(?:ms|s))\s*(?:Beats\s*([\d.]+%))?/i);
    const memory = String(text || "").match(/Memory\s+([\d.]+\s*(?:MB|KB|GB))\s*(?:Beats\s*([\d.]+%))?/i);
    if (runtime) {
      metrics.runtime = runtime[1];
      if (runtime[2]) metrics.runtimeBeats = runtime[2];
    }
    if (memory) {
      metrics.memory = memory[1];
      if (memory[2]) metrics.memoryBeats = memory[2];
    }
    return metrics;
  }

  function emptyDetectedResult() {
    return { status: "", resultText: "", summary: "", cases: [], kind: "unknown", source: "dom" };
  }

  function getResultHeaderText() {
    return getVisibleTextForSelectors([
      "div.modal-header > h4",
      "#modal-dialog h4",
      ".modal-header h4",
      "[class*='modal'] h4",
      "[class*='Modal'] h4",
      "[role='dialog'] h1",
      "[role='dialog'] h2",
      "[role='dialog'] h3",
      "[role='dialog'] h4"
    ]);
  }

  function getResultContainerText() {
    return getVisibleTextForSelectors([
      "#output",
      "#output-title",
      ".console-message",
      ".testcase-result",
      ".modal-body",
      "#modal-dialog",
      "[role='dialog']"
    ]);
  }

  function getVisibleTextForSelectors(selectors) {
    const seen = new Set();
    const texts = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => {
        if (seen.has(node) || !isVisibleElement(node)) return;
        seen.add(node);
        const text = normalizeProblemText(node.innerText || node.textContent || "");
        if (text) texts.push(text);
      });
    }
    return texts.join("\n");
  }

  function getVisibleResultLineText() {
    const lines = normalizeProblemText(document.body?.innerText || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => hasResultLikeText(line));
    return lines.slice(-20).join("\n");
  }

  function isVisibleElement(node) {
    if (!(node instanceof Element)) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function parseDomResultCases() {
    const texts = [];
    const rowSelectors = [
      "#output tr",
      "#modal-dialog tr",
      "[role='dialog'] tr",
      ".console-message",
      ".testcase-result",
      "[class*='testcase']",
      "[class*='TestCase']"
    ];

    for (const selector of rowSelectors) {
      document.querySelectorAll(selector).forEach((node) => {
        if (!isVisibleElement(node)) return;
        const text = normalizeProblemText(node.innerText || node.textContent || "");
        if (text) texts.push(text);
      });
    }

    document.querySelectorAll("td.result.passed, td.result.failed, .result.passed, .result.failed, [class*='passed'], [class*='failed']").forEach((node) => {
      if (!isVisibleElement(node)) return;
      const row = node.closest?.("tr") || node;
      const text = normalizeProblemText(row.innerText || row.textContent || "");
      if (text) texts.push(text);
    });

    return mergeCases(...texts.map((text) => parseDetectedCases(text.split("\n").map((line) => line.trim()).filter(Boolean))));
  }

  function detectSubmissionResultFromText(rawText, options = {}) {
    const text = normalizeProblemText(rawText || "").slice(-16000);
    const lower = text.toLowerCase();
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const cases = mergeCases(options.cases || [], parseDetectedCases(lines));
    const failurePatterns = [
      /wrong answer/i,
      /time limit exceeded/i,
      /runtime error/i,
      /compile error/i,
      /실패/,
      /오답/,
      /틀렸습니다/,
      /시간\s*초과/,
      /런타임\s*에러/,
      /컴파일\s*에러/
    ];
    const successPatterns = [
      /\baccepted\b/i,
      /정답입니다/,
      /정답\s*!?/
    ];
    const hasResultMarker = [
      "accepted",
      "wrong answer",
      "time limit exceeded",
      "runtime error",
      "compile error",
      "submission",
      "submitted",
      "정답입니다",
      "정답",
      "틀렸습니다"
    ].some((needle) => lower.includes(needle.toLowerCase()));
    if (!hasResultMarker && !cases.length) return { status: "", resultText: "", summary: "", cases: [], kind: options.kind || "unknown", source: options.source || "dom" };

    const failedCases = cases.filter((item) => item.status === "failed").length;
    const passedCases = cases.filter((item) => item.status === "passed").length;
    let status = "";
    if (failedCases > 0 || failurePatterns.some((pattern) => pattern.test(text))) {
      status = "failed";
    } else if ((cases.length && passedCases === cases.length && /\baccepted\b|정답입니다/.test(lower)) || successPatterns.some((pattern) => pattern.test(text))) {
      status = "passed";
    }

    return {
      status,
      resultText: clipResultText(text),
      summary: summarizeTestResults(status, cases),
      cases,
      kind: normalizeKind(options.kind) || inferKindFromText(text) || "unknown",
      source: options.source || "dom"
    };
  }

  function getExecutionResultSnapshot(code = "") {
    const codeSignature = quickCodeSignature(code);
    if (
      lastResultForCode &&
      lastResultForCode.codeSignature === codeSignature &&
      Date.now() - lastResultForCode.recordedAt < 30 * 60 * 1000 &&
      lastObservedAction.at <= lastResultForCode.recordedAt
    ) {
      return lastResultForCode.testResults;
    }

    if (lastResultForCode && lastResultForCode.codeSignature !== codeSignature && lastEditorChangeAt > lastResultForCode.recordedAt) {
      return null;
    }

    if (Date.now() >= submissionWatchUntil) return null;
    if (recentActionKind() !== "submit") return null;
    const detected = getBestDetectedResult();
    if (!detected.status && !detected.cases?.length) return null;
    const testResults = createExecutionSnapshot(detected);
    if (detected.status) {
      lastResultForCode = {
        codeSignature,
        recordedAt: Date.now(),
        testResults
      };
    }
    return testResults;
  }

  function createExecutionSnapshot(detected) {
    return {
      status: detected.status || "unknown",
      summary: detected.summary || summarizeTestResults(detected.status, detected.cases || []),
      resultText: detected.resultText || "",
      cases: detected.cases || [],
      metrics: detected.metrics || null,
      kind: detected.kind || "unknown",
      source: detected.source || "dom",
      eventId: currentResultEventId(detected),
      capturedAt: new Date().toISOString()
    };
  }

  function currentResultEventId(detected) {
    const actionAt = Date.now() - lastObservedAction.at < 90000 ? lastObservedAction.at : Date.now();
    const kind = normalizeKind(detected.kind) || recentActionKind() || "unknown";
    return [
      location.hostname,
      location.pathname,
      kind,
      actionAt
    ].join(":");
  }

  function snapshotStatusForDetected(detected) {
    if (detected.status === "failed") return "failed";
    if (detected.status === "passed") return "passed";
    return "";
  }

  function parseDetectedCases(lines) {
    const cases = [];
    const seen = new Set();
    lines.forEach((line, index) => {
      const direct = line.match(/(?:테스트|test\s*case|testcase|case)\s*#?\s*(\d+)?[^\n]{0,100}?(통과|실패|성공|정답|오답|passed|failed|accepted|wrong answer)/i);
      const label = direct || line.match(/^(?:테스트|test\s*case|testcase|case)\s*#?\s*(\d+)/i);
      if (!label) return;

      const rawStatus = direct?.[2] || lines.slice(index, index + 4).join(" ").match(/(통과|실패|성공|정답|오답|passed|failed|accepted|wrong answer)/i)?.[1] || "";
      const status = normalizeCaseStatus(rawStatus);
      if (!status) return;

      const caseId = label[1] || String(cases.length + 1);
      const key = `${caseId}:${status}`;
      if (seen.has(key)) return;
      seen.add(key);
      cases.push({
        id: caseId,
        label: line.slice(0, 120),
        status,
        detail: lines.slice(index, index + 5).join("\n").slice(0, 700)
      });
    });
    return cases.slice(0, 30);
  }

  function normalizeCaseStatus(value) {
    const text = String(value || "").toLowerCase();
    if (/통과|성공|정답|passed|accepted/.test(text)) return "passed";
    if (/실패|오답|failed|wrong answer/.test(text)) return "failed";
    return "";
  }

  function summarizeTestResults(status, cases, metrics = null) {
    const metricText = metrics && Object.keys(metrics).length
      ? ` Runtime: ${[metrics.runtime, metrics.runtimeBeats && `beats ${metrics.runtimeBeats}`].filter(Boolean).join(", ")}. Memory: ${[metrics.memory, metrics.memoryBeats && `beats ${metrics.memoryBeats}`].filter(Boolean).join(", ")}.`
      : "";
    if (!cases?.length) return status ? `Detected status: ${status}.${metricText}` : "";
    const passed = cases.filter((item) => item.status === "passed").length;
    const failed = cases.filter((item) => item.status === "failed").length;
    const sample = cases
      .slice(0, 8)
      .map((item) => `case ${item.id}: ${item.status}`)
      .join(", ");
    return `Detected status: ${status || "unknown"}. Passed ${passed}, failed ${failed}. ${sample}.${metricText}`;
  }

  function mergeCases(...groups) {
    const seen = new Set();
    const merged = [];
    for (const group of groups) {
      for (const item of group || []) {
        const key = `${item.id || merged.length + 1}:${item.status}:${item.label || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
    }
    return merged.slice(0, 30);
  }

  function recentActionKind() {
    return Date.now() - lastObservedAction.at < 90000 ? lastObservedAction.kind : "unknown";
  }

  function normalizeKind(value) {
    return value === "run" || value === "submit" ? value : "";
  }

  function inferActionKindFromUrl(url) {
    const text = String(url || "").toLowerCase();
    if (/submit|submission|score|judge|채점/.test(text)) return "submit";
    if (/run|execute|compile|test|실행/.test(text)) return "run";
    return "";
  }

  function inferKindFromText(text) {
    const lower = String(text || "").toLowerCase();
    if (/정답입니다|accepted|제출|채점 결과|submission/.test(lower)) return "submit";
    if (/실행 결과|run|execute|compile/.test(lower)) return "run";
    return "";
  }

  function clipResultText(text) {
    const seen = new Set();
    const lines = String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const key = line.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return lines.slice(-16).join("\n").slice(0, 1200);
  }

  async function hashText(text) {
    try {
      const data = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest("SHA-256", data);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      return String(text || "").slice(0, 200);
    }
  }

  function quickCodeSignature(text) {
    const value = String(text || "");
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return `${value.length}:${hash}`;
  }

  function collectPageSignals() {
    const bodyText = (document.body?.innerText || "").slice(0, 24000);
    const bodyTextLower = bodyText.toLowerCase();

    const premiumLocked = [
      "subscribe to unlock",
      "premium subscription",
      "upgrade to premium",
      "this problem is available to premium",
      "구매 후 수강",
      "강의 구매",
      "결제 후 이용",
      "유료 강의"
    ].some((needle) => bodyTextLower.includes(String(needle).toLowerCase()));

    const officialContentVisible = /\/problems\/[^/]+\/(editorial|solutions|solution)(\/|$)/i.test(location.pathname);
    const privateAssessment = [
      "skill check",
      "certification",
      "assessment",
      "private test",
      "스킬체크",
      "인증시험",
      "코딩역량인증시험",
      "과제 테스트",
      "테스트 응시"
    ].some((needle) => bodyTextLower.includes(String(needle).toLowerCase()));

    return {
      premiumLocked,
      paidLocked: premiumLocked,
      officialContentVisible,
      privateAssessment,
      hasEditor: Boolean(document.querySelector(".monaco-editor, .ace_editor, .CodeMirror, textarea"))
    };
  }

  async function extractEditorState() {
    // Prefer the bridge cache — it always has the full code from monaco.getValue(),
    // not just the visible viewport.
    if (bridgeCachedCode) {
      return { code: bridgeCachedCode, language: bridgeCachedLanguage || detectSelectedLanguage() || "" };
    }

    if (PROGRAMMERS_HOSTS.has(location.hostname)) {
      const visible = getVisibleEditorText();
      if (visible.code) return visible;

      const textarea = getTextareaCode();
      if (textarea.code) return textarea;

      const mainWorld = await getMainWorldEditorState();
      if (mainWorld.code) return mainWorld;

      return { code: "", language: "" };
    }

    const mainWorld = await getMainWorldEditorState();
    if (mainWorld.code) return mainWorld;

    const visible = getVisibleEditorText();
    if (visible.code) return visible;

    const textarea = getTextareaCode();
    if (textarea.code) return textarea;

    return { code: "", language: "" };
  }

  function getMainWorldEditorState() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "GET_MAIN_WORLD_EDITOR_STATE" }, (response) => {
          void chrome.runtime.lastError;
          resolve(response?.ok ? (response.state || { code: "", language: "" }) : { code: "", language: "" });
        });
      } catch {
        resolve({ code: "", language: "" });
      }
    });
  }

  function getVisibleEditorText() {
    const selectors = [
      ".monaco-editor .view-lines .view-line",
      ".ace_editor .ace_line",
      ".CodeMirror-code pre",
      ".CodeMirror-line"
    ];

    for (const selector of selectors) {
      const lineNodes = [...document.querySelectorAll(selector)];
      const lines = lineNodes
        .map((node) => node.innerText || node.textContent || "")
        .map((line) => line.replace(/\u00a0/g, " "))
        .filter((line, index, all) => line.trim() || index < all.length - 1);

      const code = lines.join("\n").trim();
      if (code) {
        return {
          code,
          language: detectSelectedLanguage() || detectLanguage(code)
        };
      }
    }

    return {
      code: "",
      language: ""
    };
  }

  function getTextareaCode() {
    const preferred = document.querySelector("textarea#code, textarea[name='code']");
    const preferredValue = preferred?.value || preferred?.textContent || "";
    if (preferredValue.trim() && scoreCodeLikeText(preferredValue) > 0) {
      return {
        code: preferredValue.trim(),
        language: detectSelectedLanguage() || detectLanguage(preferredValue)
      };
    }

    const candidates = [...document.querySelectorAll("textarea")]
      .map((node) => ({
        node,
        value: node.value || node.textContent || ""
      }))
      .filter((item) => item.value.trim().length > 20)
      .sort((a, b) => scoreCodeLikeText(b.value) - scoreCodeLikeText(a.value));

    const best = candidates[0];
    if (!best || scoreCodeLikeText(best.value) <= 0) {
      return {
        code: "",
        language: ""
      };
    }

    return {
      code: best.value.trim(),
      language: detectSelectedLanguage() || detectLanguage(best.value)
    };
  }

  function scoreCodeLikeText(text) {
    let score = 0;
    if (/[{}()[\];]/.test(text)) score += 1;
    if (/\b(def|class|function|return|public|private|const|let|var|import|from)\b/.test(text)) score += 2;
    if (text.includes("\n")) score += 1;
    if (/solution|answer|code/i.test(text)) score += 1;
    return score;
  }

  function getSelectedText() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return "";
    return selection.toString().trim().slice(0, 3000);
  }

  function getProblemTitle(platform) {
    let title = document.title
      .replace(/\s+-\s+LeetCode\s*$/i, "")
      .replace(/\s*\|\s*프로그래머스 스쿨\s*$/i, "")
      .replace(/\s*\|\s*프로그래머스\s*$/i, "")
      .replace(/\s*-\s*프로그래머스\s*$/i, "")
      .trim();

    if (title && !["leetcode", "programmers", "프로그래머스", "프로그래머스 스쿨"].includes(title.toLowerCase())) {
      return title.slice(0, 160);
    }

    const selector = platform === "programmers"
      ? "h1, h2, .challenge-title, .lesson-title"
      : '[data-cy="question-title"], a[href^="/problems/"], h1';
    const heading = document.querySelector(selector);
    return (heading?.textContent || "").trim().slice(0, 160);
  }

  function getProblemContext(platform) {
    const selectors = platform === "leetcode"
      ? [
          '[data-track-load="description_content"]',
          '[data-cy="question-content"]',
          'div[class*="question-content"]',
          'div[class*="description"]',
          "main",
          "body"
        ]
      : platform === "programmers"
        ? [
            ".challenge-content",
            ".challenge-description",
            ".lesson-content",
            ".markdown",
            "main",
            "body"
          ]
        : [];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const text = trimBeforeEditor(normalizeProblemText(node?.innerText || node?.textContent || ""));
      if (platform === "leetcode" && shouldSkipLeetCodeContext(selector, text)) continue;
      if (text.length > 80) return text.slice(0, 3000);
    }

    return "";
  }

  function normalizeProblemText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\u200b/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function shouldSkipLeetCodeContext(selector, text) {
    const lower = String(text || "").toLowerCase();
    if (!text || lower.includes("performing security verification") || lower.includes("cloudflare")) return true;
    if (selector !== "main" && selector !== "body") return false;
    return !(/\bExample\s*1\b/i.test(text) || /\bConstraints\b/i.test(text) || /\bInput\b/i.test(text));
  }

  function trimBeforeEditor(text) {
    const markers = [
      "\nAccepted",
      "\nSubmissions",
      "\nEditorial",
      "\nSolutions",
      "\nSolution",
      "\nCode",
      "\nTestcase",
      "\nResult",
      "\nsolution.",
      "\n실행 결과",
      "\n제출 후 채점하기",
      "\n1\n#include",
      "\n1\ndef ",
      "\n1\nclass ",
      "\n1\nfunction ",
      "\n1\nimport "
    ];
    const positions = markers
      .map((marker) => text.indexOf(marker))
      .filter((index) => index > 0);
    const end = positions.length ? Math.min(...positions) : text.length;
    return text.slice(0, end).trim();
  }

  function evaluatePage(rawUrl, signals) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return blocked("The active page URL is not valid.");
    }

    if (url.hostname === "leetcode.com" || url.hostname === "www.leetcode.com") {
      return evaluateLeetCodePage(url, signals);
    }

    if (PROGRAMMERS_HOSTS.has(url.hostname)) {
      return evaluateProgrammersPage(url, signals);
    }

    return blocked("This is not a supported coding-practice platform.");
  }

  function evaluateLeetCodePage(url, signals) {
    const pathname = normalizePath(url.pathname);
    const lowerPath = pathname.toLowerCase();

    if (LEETCODE_BLOCKED_PREFIXES.some((prefix) => lowerPath === prefix || lowerPath.startsWith(`${prefix}/`))) {
      return blocked("This page is a contest, assessment, interview, explore, or discuss route.");
    }

    if (!lowerPath.startsWith("/problems/")) {
      return blocked("This is not a normal LeetCode practice problem route.");
    }

    const parts = lowerPath.split("/").filter(Boolean);
    const slug = parts[1];
    const section = parts[2] || "";

    if (!slug) {
      return blocked("No problem slug was detected.");
    }

    if (LEETCODE_BLOCKED_PROBLEM_SECTIONS.has(section)) {
      return blocked("AI hints are disabled on editorials and official solution pages.");
    }

    if (section && !["description", "submissions", "submissions-detail"].includes(section)) {
      return blocked("This LeetCode problem subpage is not recognized as a normal practice page.");
    }

    if (signals.officialContentVisible) {
      return blocked("Official solution or editorial content appears to be visible.");
    }

    return {
      allowed: true,
      status: "allowed",
      platform: "leetcode",
      platformName: "LeetCode",
      reason: "LeetCode practice page detected.",
      problemSlug: slug,
      problemId: slug,
      problemUrl: `https://${url.hostname}/problems/${slug}`
    };
  }

  function evaluateProgrammersPage(url, signals) {
    const pathname = normalizePath(url.pathname);
    const lowerPath = pathname.toLowerCase();

    if (PROGRAMMERS_BLOCKED_PREFIXES.some((prefix) => lowerPath === prefix || lowerPath.startsWith(`${prefix}/`))) {
      return blocked("This Programmers page is not a normal practice lesson route.");
    }

    const lessonMatch = pathname.match(/^\/learn\/courses\/(\d+)\/lessons\/(\d+)(?:\/)?$/);
    if (!lessonMatch) {
      return blocked("This is not a recognized Programmers practice lesson page.");
    }

    if (signals.premiumLocked || signals.paidLocked) {
      return blocked("This appears to be locked paid or premium content.");
    }

    if (signals.privateAssessment) {
      return blocked("This appears to be a private test, skill check, certification, or assessment page.");
    }

    const [, courseId, lessonId] = lessonMatch;

    return {
      allowed: true,
      status: "allowed",
      platform: "programmers",
      platformName: "Programmers",
      reason: "Programmers practice lesson detected.",
      problemSlug: `${courseId}-${lessonId}`,
      problemId: lessonId,
      courseId,
      lessonId,
      problemUrl: normalizeUrl(url.toString())
    };
  }

  function normalizeUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.hash = "";
      url.search = "";
      if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
        url.pathname = url.pathname.slice(0, -1);
      }
      return url.toString();
    } catch {
      return rawUrl || "";
    }
  }

  function normalizePath(pathname) {
    if (!pathname || pathname === "/") return "/";
    return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  }

  function blocked(reason) {
    return {
      allowed: false,
      status: "blocked",
      platform: "",
      platformName: "",
      reason,
      problemSlug: "",
      problemId: "",
      problemUrl: ""
    };
  }

  function detectSelectedLanguage() {
    const hostname = location.hostname;

    // Programmers: URL ?language= param is authoritative
    if (hostname.includes("programmers.co.kr")) {
      const urlLang = new URLSearchParams(location.search).get("language");
      if (urlLang) return normalizeLangText(urlLang);
      const btn = document.querySelector("button.dropdown-toggle");
      if (btn) return normalizeLangText(btn.textContent.trim());
    }

    // LeetCode: the language button text IS the language name (short, exact).
    // Scan all buttons with data-state (Radix UI) or aria-haspopup;
    // only accept text that is short (≤15 chars) to avoid false matches
    // from navigation/other buttons that may contain a language word.
    if (hostname === "leetcode.com" || hostname === "www.leetcode.com") {
      const candidates = document.querySelectorAll(
        "button[data-state], button[aria-haspopup='dialog'], button[aria-haspopup='listbox']"
      );
      for (const btn of candidates) {
        const text = btn.textContent.trim();
        if (text.length > 15) continue;
        const lang = normalizeLangText(text);
        if (lang) return lang;
      }
    }

    // Generic fallback
    const selected = [...document.querySelectorAll("select option:checked, [aria-selected='true']")]
      .map((n) => n.textContent || "")
      .join(" ");
    return normalizeLangText(selected);
  }

  function normalizeLangText(text) {
    const s = String(text || "").trim().toLowerCase().replace(/\s+/g, "");
    if (/python3/.test(s)) return "python3";
    if (/python|파이썬/.test(s)) return "python";
    if (/typescript|타입스크립트/.test(s)) return "typescript";
    if (/javascript|자바스크립트|node\.?js/.test(s)) return "javascript";
    if (/kotlin|코틀린/.test(s)) return "kotlin";
    if (/c\+\+|cpp/.test(s)) return "cpp";
    if (/c#|csharp/.test(s)) return "csharp";
    if (/java\b|자바/.test(s)) return "java";
    if (/swift/.test(s)) return "swift";
    if (/golang|go\b/.test(s)) return "go";
    if (/rust/.test(s)) return "rust";
    if (/ruby|루비/.test(s)) return "ruby";
    if (/scala/.test(s)) return "scala";
    if (/php/.test(s)) return "php";
    if (/dart/.test(s)) return "dart";
    if (/elixir/.test(s)) return "elixir";
    if (/erlang/.test(s)) return "erlang";
    if (/racket/.test(s)) return "racket";
    if (/mysql|sql/.test(s)) return "sql";
    if (/^c$|solution\.c\b|\bc언어\b/.test(s)) return "c";
    return "";
  }

  function detectLanguage(code) {
    if (!code) return "";
    // Highly distinctive patterns first
    if (/^<\?php|\$[a-zA-Z_]\w*\s*=/.test(code)) return "php";
    if (/#lang\s+racket|\(define\s/.test(code)) return "racket";
    if (/-module\s*\(|-export\s*\(\[/.test(code)) return "erlang";
    if (/\bdefmodule\s+\w+/.test(code)) return "elixir";
    if (/\bfn\s+\w+\s*\(.*\).*\{|\blet\s+mut\b|\bimpl\s+\w+/.test(code)) return "rust";
    if (/\bSELECT\b.*\bFROM\b|\bCREATE\s+TABLE\b/i.test(code)) return "sql";
    // C++ (before Java/C)
    if (/vector\s*<|#include\s*<(iostream|vector|algorithm|map|set|unordered)/.test(code)) return "cpp";
    if (/\bclass\s+Solution\b/.test(code) && /public:|vector<|auto\s/.test(code)) return "cpp";
    // C (before others that use #include)
    if (/#include\s*<(stdio|stdlib|string)\.h>|int\s+main\s*\(\s*(void\s*)?\)/.test(code)) return "c";
    // TypeScript (before JavaScript)
    if (/:\s*(string|number|boolean|void|any|never)\b|interface\s+\w+\s*\{|type\s+\w+\s*=/.test(code)) return "typescript";
    // Python/Python3
    if (/\bdef\s+\w+\s*\(|\bself\b/.test(code)) return "python3";
    // Kotlin (fun keyword, not func)
    if (/\bfun\s+\w+\s*\(/.test(code) && !/\bfunc\b/.test(code)) return "kotlin";
    // Go (package or := operator)
    if (/\bpackage\s+main\b|:=/.test(code)) return "go";
    // Swift (func keyword)
    if (/\bfunc\s+\w+\s*\(/.test(code)) return "swift";
    // Scala
    if (/\bobject\s+Solution\b|\bcase\s+class\b/.test(code)) return "scala";
    // Ruby (def + end, no self/import)
    if (/\bdef\s+\w+/.test(code) && /\bend\b/.test(code) && !/\bself\b|\bimport\b/.test(code)) return "ruby";
    // Java
    if (/\bpublic\s+class\b|\bList<|\bHashMap<|\bint\[\]/.test(code)) return "java";
    // JavaScript
    if (/\bfunction\s+\w+\s*\(|=>|const\s+|let\s+/.test(code)) return "javascript";
    // Dart
    if (/\bvoid\s+main\s*\(\s*\)|\bList<\w+>\s+\w+\s*=/.test(code)) return "dart";
    return "";
  }

  function debounce(callback, delay) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => callback(...args), delay);
    };
  }

  function sendRuntimeMessage(message) {
    try {
      chrome.runtime.sendMessage(message, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
  }
})();
