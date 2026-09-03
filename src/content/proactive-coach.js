(function () {
  const POLL_MS = 2000;
  const PLANNING_DELAY_MS = 35000;
  const ACTIVE_EDIT_SUPPRESS_MS = 8000;
  const STUCK_DELAY_MS = 90000;
  const NUDGE_COOLDOWN_MS = 4 * 60 * 1000;
  const MAX_INTERVENTIONS_PER_PROBLEM = 3;
  const ACCENT = "#6128ff";
  const ACCENT_HOVER = "#6a3fff";

  let currentProblem = "";
  let problemOpenedAt = Date.now();
  let lastCodeSignature = "";
  let lastProgressAt = Date.now();
  let lastNudgeAt = 0;
  let interventions = 0;
  let activeReason = "";
  let activeReasonKey = "";
  let activeRequestId = "";
  let activeContext = null;
  let lastFailedEventId = "";
  let lastCloseEventId = "";
  let dismissedReasons = new Set();
  let shownReasons = new Set();
  let host = null;
  let shadow = null;
  let bubble = null;
  let uiLanguage = "en";

  chrome.runtime.onMessage.addListener((message) => {
    if (!activeRequestId || message?.requestId !== activeRequestId) return false;
    if (message.type === "INLINE_AI_START") {
      setBubbleBusy(true, t("thinking"));
      return false;
    }
    if (message.type === "INLINE_AI_DELTA") {
      renderAnswer(visibleAiText(message.rawText || message.delta || ""), false);
      return false;
    }
    if (message.type === "INLINE_AI_DONE") {
      const rawText = message.rawText || "";
      const visible = visibleAiText(rawText);
      const metadata = parseMetadata(rawText);
      if (metadata?.contains_solution_code || looksLikeFullCode(visible)) {
        renderAnswer(t("fullSolutionBlocked"), true, message.trial || null);
        activeRequestId = "";
        return false;
      }
      renderAnswer(visible, true, message.trial || null);
      saveInlineHint(rawText, visible).catch(() => {});
      activeRequestId = "";
      return false;
    }
    if (message.type === "INLINE_AI_ERROR") {
      renderError(message.error || t("hintError"));
      activeRequestId = "";
      return false;
    }
    return false;
  });

  loadUiLanguage().catch(() => {});
  setTimeout(checkCoachState, 2500);
  setInterval(checkCoachState, POLL_MS);
  window.addEventListener("scroll", positionBubble, true);
  window.addEventListener("resize", positionBubble);

  async function checkCoachState() {
    if (document.visibilityState !== "visible" || activeRequestId) return;
    const response = await sendMessage({ type: "GET_ACTIVE_CONTEXT" }).catch(() => null);
    const context = response?.context;
    if (!response?.ok || !context) return;
    activeContext = context;

    const problemKey = context.problemUrl || context.url || "";
    if (problemKey && problemKey !== currentProblem) resetProblem(problemKey);

    const editor = findEditor();
    if (!context.allowed || !editor) {
      removeBubble();
      return;
    }

    const result = context.testResults || {};
    const signature = quickSignature(context.code || "");
    if (result.status === "passed" && result.kind === "submit") {
      removeBubble();
      shownReasons.add("solved");
      return;
    }
    if (signature && signature !== lastCodeSignature) {
      if (lastCodeSignature) {
        lastProgressAt = Date.now();
        if (isPassivePromptReason(activeReason)) removeBubble();
      }
      lastCodeSignature = signature;
    }

    if (result.status === "passed" && result.kind === "run") {
      const closeEventId = result.eventId || `${signature}:${result.summary || "passed-run"}`;
      if (closeEventId && closeEventId !== lastCloseEventId) {
        lastCloseEventId = closeEventId;
        maybeShow("close", context, closeEventId);
      }
      return;
    }

    const failedEventId = result.status === "failed"
      ? result.eventId || `${signature}:${result.summary || "failed"}`
      : "";
    if (failedEventId && failedEventId !== lastFailedEventId) {
      lastFailedEventId = failedEventId;
      maybeShow("failed", context, failedEventId);
      return;
    }

    const code = String(context.code || "").trim();
    const idleFor = Date.now() - lastProgressAt;
    if (isStubLikeCode(code) && Date.now() - problemOpenedAt >= PLANNING_DELAY_MS && idleFor >= ACTIVE_EDIT_SUPPRESS_MS) {
      maybeShow("planning", context);
      return;
    }

    if (!isStubLikeCode(code) && idleFor >= STUCK_DELAY_MS) {
      maybeShow("stuck", context);
    }
  }

  function maybeShow(reason, context, eventId = "") {
    const reasonKey = eventId ? `${reason}:${eventId}` : reason;
    if (bubble || dismissedReasons.has(reasonKey) || shownReasons.has(reasonKey)) return;
    if (interventions >= MAX_INTERVENTIONS_PER_PROBLEM) return;
    if (Date.now() - lastNudgeAt < NUDGE_COOLDOWN_MS && reason !== "failed") return;
    activeReason = reason;
    activeReasonKey = reasonKey;
    activeContext = context;
    interventions += 1;
    lastNudgeAt = Date.now();
    shownReasons.add(reasonKey);
    renderPrompt(reason);
  }

  function renderPrompt(reason) {
    ensureBubble();
    if (!bubble) return;
    bubble.dataset.phase = "prompt";
    const body = bubble.querySelector(".cc-body");
    if (reason === "planning") {
      body.innerHTML = `
        <div class="cc-kicker">CODECOACH · PLAN</div>
        <div class="cc-title">${escapeHtml(t("planningTitle"))}</div>
        <div class="cc-copy">${escapeHtml(t("planningCopy"))}</div>
        <textarea class="cc-plan-input" rows="2" placeholder="${escapeHtml(t("planningPlaceholder"))}"></textarea>
        <div class="cc-actions"><button class="cc-primary" data-action="approach">${escapeHtml(t("checkApproach"))}</button><button class="cc-ghost" data-action="dismiss">${escapeHtml(t("notNow"))}</button></div>`;
    } else if (reason === "failed") {
      body.innerHTML = `
        <div class="cc-kicker">CODECOACH · DEBUG</div>
        <div class="cc-title">${escapeHtml(t("failedTitle"))}</div>
        <div class="cc-copy">${escapeHtml(t("failedCopy"))}</div>
        <div class="cc-actions"><button class="cc-primary" data-action="nudge">${escapeHtml(t("debugThis"))}</button><button class="cc-ghost" data-action="dismiss">${escapeHtml(t("dismiss"))}</button></div>`;
    } else if (reason === "close") {
      body.innerHTML = `
        <div class="cc-kicker">CODECOACH · EDGE CASE</div>
        <div class="cc-title">${escapeHtml(t("closeTitle"))}</div>
        <div class="cc-copy">${escapeHtml(t("closeCopy"))}</div>
        <div class="cc-actions"><button class="cc-primary" data-action="nudge">${escapeHtml(t("checkEdges"))}</button><button class="cc-ghost" data-action="dismiss">${escapeHtml(t("dismiss"))}</button></div>`;
    } else {
      body.innerHTML = `
        <div class="cc-kicker">CODECOACH · STUCK?</div>
        <div class="cc-title">${escapeHtml(t("stuckTitle"))}</div>
        <div class="cc-copy">${escapeHtml(t("stuckCopy"))}</div>
        <div class="cc-actions"><button class="cc-primary" data-action="nudge">${escapeHtml(t("nudgeMe"))}</button><button class="cc-ghost" data-action="dismiss">${escapeHtml(t("dismiss"))}</button></div>`;
    }
    wireActions();
    positionBubble();
  }

  function wireActions() {
    bubble.querySelector("[data-action='dismiss']")?.addEventListener("click", () => {
      dismissedReasons.add(activeReasonKey || activeReason);
      removeBubble();
    });
    bubble.querySelector("[data-action='nudge']")?.addEventListener("click", () => requestHint(1));
    bubble.querySelector("[data-action='approach']")?.addEventListener("click", () => {
      const text = bubble.querySelector(".cc-plan-input")?.value.trim() || "";
      if (!text) {
        bubble.querySelector(".cc-plan-input")?.focus();
        return;
      }
      requestApproachFeedback(text);
    });
  }

  async function requestHint(level) {
    const context = await freshContext();
    if (!context) return;
    activeRequestId = crypto.randomUUID();
    const response = await sendMessage({
      type: "STREAM_INLINE_AI",
      requestId: activeRequestId,
      kind: "hint",
      hintLevel: Math.min(3, Math.max(1, level)),
      context: {
        ...context,
        selectedLine: currentCursorLine(context) || context.selectedLine || "",
        userNote: activeReason === "failed"
          ? "The learner just received a failed submission. Give one Socratic debugging question."
          : activeReason === "close"
            ? "Sample tests passed in a run. Give one Level-1 hidden/edge-case check before final submission."
            : context.userNote || ""
      }
    }).catch((error) => ({ ok: false, error: error.message }));
    if (!response?.ok) {
      activeRequestId = "";
      if (response?.code === "GUEST_NOT_STARTED") {
        renderGuestStart(() => requestHint(level));
        return;
      }
      renderError(response?.error || t("connectAccess"));
    }
  }

  async function requestApproachFeedback(userMessage) {
    const context = await freshContext();
    if (!context) return;
    activeRequestId = crypto.randomUUID();
    const response = await sendMessage({
      type: "STREAM_INLINE_AI",
      requestId: activeRequestId,
      kind: "chat_coach",
      userMessage,
      chatHistory: [],
      context: {
        ...context,
        code: String(context.code || "").trim().length > 80 ? context.code : ""
      }
    }).catch((error) => ({ ok: false, error: error.message }));
    if (!response?.ok) {
      activeRequestId = "";
      if (response?.code === "GUEST_NOT_STARTED") {
        renderGuestStart(() => requestApproachFeedback(userMessage));
        return;
      }
      renderError(response?.error || t("connectAccess"));
    }
  }

  function renderGuestStart(afterStart) {
    ensureBubble();
    bubble.dataset.phase = "guest";
    bubble.querySelector(".cc-body").innerHTML = `
      <div class="cc-kicker">CODECOACH · GUEST</div>
      <div class="cc-title">${escapeHtml(t("tryFreeTitle"))}</div>
      <div class="cc-copy">${escapeHtml(t("tryFreeCopy"))}</div>
      <div class="cc-actions"><button class="cc-primary" data-action="guest">${escapeHtml(t("tryFreeCta"))}</button><button class="cc-ghost" data-action="close">${escapeHtml(t("done"))}</button></div>`;
    bubble.querySelector("[data-action='guest']")?.addEventListener("click", async () => {
      setBubbleBusy(true, t("starting"));
      const response = await sendMessage({ type: "START_GUEST_TRIAL" }).catch((error) => ({ ok: false, error: error.message }));
      if (!response?.ok) {
        renderError(response?.error || t("guestUnavailable"));
        return;
      }
      await afterStart();
    });
    bubble.querySelector("[data-action='close']")?.addEventListener("click", removeBubble);
    positionBubble();
  }

  function renderAnswer(text, done, trial = null) {
    ensureBubble();
    bubble.dataset.phase = done ? "answer" : "loading";
    const remaining = trial && Number.isFinite(Number(trial.remaining)) ? `<span class="cc-trial">${escapeHtml(t("guestLeft", { remaining: trial.remaining }))}</span>` : "";
    const currentLevel = Number(bubble.dataset.level || 1);
    const primaryAction = currentLevel >= 3
      ? `<button class="cc-primary" data-action="open">${escapeHtml(t("openCoach"))}</button>`
      : `<button class="cc-primary" data-action="more">${escapeHtml(t("moreSpecific"))}</button>`;
    bubble.querySelector(".cc-body").innerHTML = `
      <div class="cc-kicker">CODECOACH</div>
      <div class="cc-answer">${escapeHtml(text || t("thinking"))}</div>
      ${done ? `<div class="cc-actions">${primaryAction}<button class="cc-ghost" data-action="close">${escapeHtml(t("done"))}</button></div>${remaining}` : ""}`;
    if (done) {
      bubble.querySelector("[data-action='more']")?.addEventListener("click", () => {
        const currentLevel = Number(bubble.dataset.level || 1);
        const next = Math.min(3, currentLevel + 1);
        bubble.dataset.level = String(next);
        requestHint(next);
      });
      bubble.querySelector("[data-action='open']")?.addEventListener("click", () => {
        sendMessage({ type: "OPEN_SIDE_PANEL" }).catch(() => {});
        removeBubble();
      });
      bubble.querySelector("[data-action='close']")?.addEventListener("click", removeBubble);
    }
    positionBubble();
  }

  function renderError(text) {
    ensureBubble();
    bubble.dataset.phase = "error";
    bubble.querySelector(".cc-body").innerHTML = `
      <div class="cc-kicker">CODECOACH</div>
      <div class="cc-answer">${escapeHtml(text)}</div>
      <div class="cc-actions"><button class="cc-ghost" data-action="close">${escapeHtml(t("close"))}</button></div>`;
    bubble.querySelector("[data-action='close']")?.addEventListener("click", removeBubble);
  }

  function setBubbleBusy(busy, label) {
    if (!bubble || !busy) return;
    const primary = bubble.querySelector(".cc-primary");
    if (primary) {
      primary.disabled = true;
      primary.textContent = label || t("thinking");
    }
  }

  async function freshContext() {
    const response = await sendMessage({ type: "GET_ACTIVE_CONTEXT" }).catch(() => null);
    return response?.ok ? response.context : activeContext;
  }

  async function saveInlineHint(rawText, visible) {
    if (!activeContext || !visible) return;
    const metadata = parseMetadata(rawText);
    if (!metadata) return;
    await sendMessage({
      type: "SAVE_HINT_EVENT",
      payload: {
        context: { ...activeContext, hintLevel: Number(metadata.hint_level || 1) },
        metadata,
        code: activeContext.code || "",
        selectedLine: activeContext.selectedLine || "",
        storeHintText: false,
        visibleHint: ""
      }
    });
  }

  function ensureBubble() {
    if (bubble?.isConnected) return;
    host = document.createElement("div");
    host.id = "codecoach-inline-root";
    host.style.position = "fixed";
    host.style.zIndex = "2147483646";
    host.style.pointerEvents = "none";
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host{all:initial}*{box-sizing:border-box}.cc-bubble{width:300px;background:#fff;border:1px solid rgba(114,118,139,.18);border-radius:14px;box-shadow:0 18px 48px rgba(24,20,48,.18);color:#111114;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:auto;overflow:hidden}.cc-body{padding:14px}.cc-kicker{color:${ACCENT};font-size:10px;font-weight:750;letter-spacing:.09em;margin-bottom:6px}.cc-title{font-size:14px;font-weight:700;margin-bottom:4px}.cc-copy{color:#5c6075;margin-bottom:11px}.cc-answer{white-space:pre-wrap;color:#252630;margin-bottom:10px}.cc-actions{display:flex;gap:7px;margin-top:10px}.cc-primary,.cc-ghost{border:0;border-radius:9px;padding:7px 10px;font:600 12px/1.2 inherit;cursor:pointer}.cc-primary{background:${ACCENT};color:#fff}.cc-primary:hover{background:${ACCENT_HOVER}}.cc-primary:disabled{opacity:.55;cursor:default}.cc-ghost{background:rgba(97,40,255,.08);color:${ACCENT}}.cc-plan-input{width:100%;resize:none;border:1px solid rgba(114,118,139,.22);border-radius:9px;padding:8px 9px;outline:none;color:#111114;background:#fff;font:12px/1.4 inherit}.cc-plan-input:focus{border-color:${ACCENT};box-shadow:0 0 0 3px rgba(97,40,255,.10)}.cc-trial{display:block;color:#73758a;font-size:10px;margin-top:8px}
    </style><div class="cc-bubble"><div class="cc-body"></div></div>`;
    bubble = shadow.querySelector(".cc-bubble");
    bubble.dataset.level = "1";
    document.documentElement.appendChild(host);
  }

  function positionBubble() {
    if (!host?.isConnected) return;
    const editor = findEditor();
    if (!editor) return removeBubble();
    const anchor = findCursor() || editor;
    const rect = anchor.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const width = 300;
    const estimatedHeight = Math.max(120, bubble?.getBoundingClientRect().height || 150);
    let left = rect.right + 12;
    let top = rect.top - 12;
    if (left + width > window.innerWidth - 12) left = Math.max(12, editorRect.right - width - 12);
    if (top + estimatedHeight > window.innerHeight - 12) top = Math.max(12, window.innerHeight - estimatedHeight - 12);
    if (top < 12) top = Math.max(12, editorRect.top + 12);
    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(top)}px`;
  }

  function findEditor() {
    return document.querySelector(".monaco-editor, .CodeMirror, .ace_editor, textarea");
  }

  function findCursor() {
    const selectors = [".monaco-editor .cursor:not([style*='display: none'])", ".CodeMirror-cursor", ".ace_cursor"];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (isUsableCursor(node)) return node;
    }
    return null;
  }

  function isUsableCursor(node) {
    if (!node || !(node instanceof Element)) return false;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return false;
    const editor = findEditor();
    if (!editor) return false;
    const editorRect = editor.getBoundingClientRect();
    const margin = 24;
    return rect.right >= editorRect.left - margin
      && rect.left <= editorRect.right + margin
      && rect.bottom >= editorRect.top - margin
      && rect.top <= editorRect.bottom + margin;
  }

  function currentCursorLine(context) {
    const selected = String(context?.selectedLine || "").trim();
    if (selected) return selected.slice(0, 500);
    return "";
  }

  function resetProblem(problemKey) {
    currentProblem = problemKey;
    problemOpenedAt = Date.now();
    lastProgressAt = Date.now();
    lastCodeSignature = "";
    lastFailedEventId = "";
    lastCloseEventId = "";
    lastNudgeAt = 0;
    interventions = 0;
    dismissedReasons = new Set();
    shownReasons = new Set();
    removeBubble();
  }

  function removeBubble() {
    host?.remove();
    host = null;
    shadow = null;
    bubble = null;
    activeReason = "";
    activeReasonKey = "";
  }

  function quickSignature(text) {
    const value = String(text || "");
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += Math.max(1, Math.floor(value.length / 5000))) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${value.length}:${hash >>> 0}`;
  }

  function isStubLikeCode(code) {
    const trimmed = String(code || "").trim();
    if (!trimmed) return true;
    const meaningfulLines = trimmed.split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^\/\/|^#/.test(line));
    if (trimmed.length <= 80 && meaningfulLines.length <= 4) return true;
    return /pass\s*$|return\s*\[\]\s*$|return\s+0\s*$|return\s+None\s*$/m.test(trimmed) && trimmed.length <= 180;
  }

  function visibleAiText(raw) {
    return String(raw || "").split("---metadata---")[0].replace(/^(HINT:|COACH:)\s*/i, "").trim();
  }

  function looksLikeFullCode(text) {
    const trimmed = String(text || "").trim();
    if (/```/.test(trimmed)) return true;
    if (/\bclass\s+Solution\b/.test(trimmed)) return true;
    if (/^\s*(def|function|public|private|const|let|var)\s+/m.test(trimmed) && trimmed.split("\n").length > 6) return true;
    return false;
  }

  function parseMetadata(raw) {
    const parts = String(raw || "").split("---metadata---");
    if (parts.length < 2) return null;
    try {
      return JSON.parse(parts.slice(1).join("---metadata---").trim());
    } catch {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  async function loadUiLanguage() {
    const response = await sendMessage({ type: "GET_SETTINGS" }).catch(() => null);
    uiLanguage = response?.settings?.uiLanguage === "ko" ? "ko" : "en";
  }

  function isPassivePromptReason(reason) {
    return bubble?.dataset.phase === "prompt" && ["planning", "stuck", "failed", "close"].includes(reason);
  }

  function t(key, vars = {}) {
    const value = STRINGS[uiLanguage]?.[key] || STRINGS.en[key] || key;
    return value.replace(/\{(\w+)\}/g, (_match, name) => String(vars[name] ?? ""));
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response || { ok: false, error: "No response." });
      });
    });
  }

  const STRINGS = {
    en: {
      planningTitle: "What's your approach?",
      planningCopy: "Explain it in one or two sentences before you code.",
      planningPlaceholder: "I'll start by...",
      checkApproach: "Check my approach",
      notNow: "Not now",
      failedTitle: "Submission failed.",
      failedCopy: "Want one small debugging question, not the answer?",
      debugThis: "Debug this",
      dismiss: "Dismiss",
      closeTitle: "Sample tests pass.",
      closeCopy: "Want one edge-case check before submitting?",
      checkEdges: "Check edge cases",
      stuckTitle: "Need a small nudge?",
      stuckCopy: "I'll point at one next thought and keep the solution hidden.",
      nudgeMe: "Nudge me",
      tryFreeTitle: "Try free coaching.",
      tryFreeCopy: "Start a private guest session and use one of 10 free AI questions.",
      tryFreeCta: "Try free · 10 questions",
      thinking: "Thinking...",
      starting: "Starting...",
      moreSpecific: "More specific",
      openCoach: "Open coach",
      done: "Done",
      close: "Close",
      guestLeft: "Guest · {remaining} left",
      connectAccess: "Start guest mode or connect your OpenAI API key.",
      guestUnavailable: "Guest mode is temporarily unavailable.",
      hintError: "CodeCoach could not generate a hint.",
      fullSolutionBlocked: "I can't show a full solution here. Try one smaller hint from the coach instead."
    },
    ko: {
      planningTitle: "접근 방법이 어떻게 되나요?",
      planningCopy: "코드를 더 작성하기 전에 한두 문장으로 설명해 보세요.",
      planningPlaceholder: "먼저 이렇게 생각해볼게요...",
      checkApproach: "접근 확인",
      notNow: "나중에",
      failedTitle: "제출이 실패했습니다.",
      failedCopy: "정답 말고 작은 디버깅 질문 하나 받아볼까요?",
      debugThis: "디버깅 힌트",
      dismiss: "닫기",
      closeTitle: "샘플 테스트는 통과했습니다.",
      closeCopy: "제출 전에 엣지 케이스 하나 확인할까요?",
      checkEdges: "엣지 케이스 확인",
      stuckTitle: "작은 힌트가 필요하신가요?",
      stuckCopy: "정답은 숨기고 다음 생각 하나만 짚어드릴게요.",
      nudgeMe: "힌트 받기",
      tryFreeTitle: "무료 코칭을 시작해보세요.",
      tryFreeCopy: "비공개 게스트 세션으로 무료 AI 질문 10회를 사용할 수 있습니다.",
      tryFreeCta: "무료로 시작 · 10회",
      thinking: "생각 중...",
      starting: "시작 중...",
      moreSpecific: "더 구체적으로",
      openCoach: "코치 열기",
      done: "완료",
      close: "닫기",
      guestLeft: "게스트 · {remaining}회 남음",
      connectAccess: "게스트 모드를 시작하거나 OpenAI API key를 연결하세요.",
      guestUnavailable: "게스트 모드를 잠시 사용할 수 없습니다.",
      hintError: "CodeCoach가 힌트를 만들지 못했습니다.",
      fullSolutionBlocked: "여기서는 전체 정답 코드를 보여줄 수 없습니다. 코치에서 더 작은 힌트를 요청해 주세요."
    }
  };
})();
