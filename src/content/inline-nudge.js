(function () {
  const POLL_MS = 1500;
  const OPENING_PROMPT_DELAY_MS = 1_500;
  const ACTIVE_EDIT_SUPPRESS_MS = 10_000;
  const STUCK_DELAY_MS = 45_000;
  const NUDGE_COOLDOWN_MS = 2 * 60_000;
  const MAX_INTERVENTIONS_PER_PROBLEM = 3;
  const SOURCE_RENDER = "CODING_HINT_COACH_INLINE_RENDER";
  const SOURCE_HIDE = "CODING_HINT_COACH_INLINE_HIDE";

  let enabled = true;
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
  let currentLevel = 1;
  let lastFailedEventId = "";
  let lastCloseEventId = "";
  let dismissedReasons = new Set();
  let shownReasons = new Set();
  let uiLanguage = "en";
  let editorActivity = { editorType: "", focused: false, cursorLine: 1, lineCount: 1, lastChangeAt: 0 };
  let inlineToken = "";
  let lastSettingsRefreshAt = 0;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source === "CODING_HINT_COACH_EDITOR_ACTIVITY") {
      editorActivity = {
        editorType: event.data.editorType || "",
        focused: Boolean(event.data.focused),
        cursorLine: Math.max(1, Number(event.data.cursorLine) || 1),
        lineCount: Math.max(1, Number(event.data.lineCount) || 1),
        lastChangeAt: Math.max(0, Number(event.data.lastChangeAt) || 0)
      };
      if (editorActivity.lastChangeAt > lastProgressAt) lastProgressAt = editorActivity.lastChangeAt;
      return;
    }
    if (event.data?.source === "CODING_HINT_COACH_INLINE_ACTION" && event.data.token === inlineToken) {
      handleInlineAction(event.data.action, event.data.value || "");
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!activeRequestId || message?.requestId !== activeRequestId) return false;
    if (message.type === "INLINE_AI_START") {
      renderState({ title: t("thinking"), tone: "neutral" });
      return false;
    }
    if (message.type === "INLINE_AI_DELTA") return false;
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

  chrome.storage?.onChanged?.addListener((_changes, areaName) => {
    if (areaName !== "local") return;
    lastSettingsRefreshAt = 0;
    refreshSettings().catch(() => {});
  });

  refreshSettings().catch(() => {});
  requestEditorActivity();
  setTimeout(checkCoachState, 0);
  setInterval(checkCoachState, POLL_MS);

  async function checkCoachState() {
    if (document.visibilityState !== "visible" || activeRequestId) return;
    if (Date.now() - lastSettingsRefreshAt > 10_000) await refreshSettings().catch(() => {});
    if (!enabled) {
      hideInline();
      return;
    }

    requestEditorActivity();
    const response = await sendMessage({ type: "GET_ACTIVE_CONTEXT" }).catch(() => null);
    const context = response?.context;
    if (!response?.ok || !context) return;
    activeContext = context;

    const problemKey = context.problemUrl || context.url || "";
    if (problemKey && problemKey !== currentProblem) resetProblem(problemKey);
    if (!context.allowed || !editorActivity.editorType) {
      hideInline();
      return;
    }

    const result = context.testResults || {};
    const signature = quickSignature(context.code || "");
    if (result.status === "passed" && result.kind === "submit") {
      hideInline();
      shownReasons.add("solved");
      return;
    }

    if (signature && signature !== lastCodeSignature) {
      if (lastCodeSignature) {
        lastProgressAt = Math.max(Date.now(), editorActivity.lastChangeAt || 0);
        if (isPassiveReason(activeReason)) hideInline();
      }
      lastCodeSignature = signature;
    }

    const idleSince = Math.max(lastProgressAt, editorActivity.lastChangeAt || 0, problemOpenedAt);
    const idleFor = Date.now() - idleSince;

    if (result.status === "passed" && result.kind === "run") {
      const closeEventId = result.eventId || `${signature}:${result.summary || "passed-run"}`;
      if (closeEventId && closeEventId !== lastCloseEventId && idleFor >= 1200) {
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

    if (!shownReasons.has("planning") && Date.now() - problemOpenedAt >= OPENING_PROMPT_DELAY_MS) {
      maybeShow("planning", context);
      return;
    }

    const activelyEditing = editorActivity.focused && idleFor < ACTIVE_EDIT_SUPPRESS_MS;
    if (activelyEditing) return;

    if (idleFor >= STUCK_DELAY_MS) maybeShow("stuck", context);
  }

  function maybeShow(reason, context, eventId = "") {
    const reasonKey = eventId ? `${reason}:${eventId}` : reason;
    if (activeReason || dismissedReasons.has(reasonKey) || shownReasons.has(reasonKey)) return;
    if (interventions >= MAX_INTERVENTIONS_PER_PROBLEM) return;
    if (Date.now() - lastNudgeAt < NUDGE_COOLDOWN_MS && reason !== "failed") return;
    activeReason = reason;
    activeReasonKey = reasonKey;
    activeContext = context;
    currentLevel = 1;
    interventions += 1;
    if (reason !== "planning") lastNudgeAt = Date.now();
    shownReasons.add(reasonKey);
    renderPrompt(reason);
  }

  function renderPrompt(reason) {
    if (reason === "planning") {
      renderState({
        title: t("planningTitle"),
        primaryAction: "expand_plan",
        primaryLabel: t("writeApproach"),
        secondaryAction: "hint",
        secondaryLabel: t("needHint"),
        tertiaryAction: "dismiss",
        tertiaryLabel: t("notNow")
      });
      return;
    }
    if (reason === "failed") {
      renderState({ title: t("failedTitle"), body: t("failedCopy"), primaryAction: "hint", primaryLabel: t("debugThis"), secondaryAction: "dismiss", secondaryLabel: t("dismiss") });
      return;
    }
    if (reason === "close") {
      renderState({ title: t("closeTitle"), body: t("closeCopy"), tone: "success", primaryAction: "hint", primaryLabel: t("checkEdges"), secondaryAction: "dismiss", secondaryLabel: t("dismiss") });
      return;
    }
    renderState({ title: t("stuckTitle"), body: t("stuckCopy"), primaryAction: "hint", primaryLabel: t("showHint"), secondaryAction: "dismiss", secondaryLabel: t("dismiss") });
  }

  function handleInlineAction(action, value) {
    if (action === "dismiss" || action === "done") {
      if (action === "dismiss") dismissedReasons.add(activeReasonKey || activeReason);
      hideInline();
      return;
    }
    if (action === "expand_plan") {
      renderState({
        title: t("planningTitle"),
        body: t("planningCopy"),
        showInput: true,
        inputPlaceholder: t("planningPlaceholder"),
        primaryAction: "check_approach",
        primaryLabel: t("checkApproach"),
        secondaryAction: "dismiss",
        secondaryLabel: t("notNow")
      });
      return;
    }
    if (action === "check_approach") {
      if (!String(value || "").trim()) return;
      requestApproachFeedback(String(value).trim());
      return;
    }
    if (action === "hint") {
      requestHint(currentLevel);
      return;
    }
    if (action === "more") {
      currentLevel = Math.min(3, currentLevel + 1);
      requestHint(currentLevel);
      return;
    }
    if (action === "open") {
      sendMessage({ type: "OPEN_SIDE_PANEL" }).catch(() => {});
      hideInline();
      return;
    }
    if (action === "start_guest") {
      startGuestThenHint();
      return;
    }
    if (action === "settings") {
      chrome.runtime.openOptionsPage?.();
    }
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
        selectedLine: context.selectedLine || "",
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
        renderGuestStart();
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
      context: { ...context, code: String(context.code || "").trim().length > 80 ? context.code : "" }
    }).catch((error) => ({ ok: false, error: error.message }));
    if (!response?.ok) {
      activeRequestId = "";
      if (response?.code === "GUEST_NOT_STARTED") {
        renderGuestStart();
        return;
      }
      renderError(response?.error || t("connectAccess"));
    }
  }

  function renderGuestStart() {
    renderState({
      title: t("tryFreeTitle"),
      body: t("tryFreeCopy"),
      primaryAction: "start_guest",
      primaryLabel: t("tryFreeCta"),
      secondaryAction: "settings",
      secondaryLabel: t("settings")
    });
  }

  async function startGuestThenHint() {
    renderState({ title: t("starting") });
    const response = await sendMessage({ type: "START_GUEST_TRIAL" }).catch((error) => ({ ok: false, error: error.message }));
    if (!response?.ok) {
      renderError(response?.error || t("guestUnavailable"));
      return;
    }
    requestHint(currentLevel);
  }

  function renderAnswer(text, done, trial = null) {
    const primaryAction = currentLevel >= 3 ? "open" : "more";
    const primaryLabel = currentLevel >= 3 ? t("openCoach") : t("moreSpecific");
    renderState({
      title: text || t("thinking"),
      primaryAction: done ? primaryAction : "",
      primaryLabel: done ? primaryLabel : "",
      secondaryAction: done ? "done" : "",
      secondaryLabel: done ? t("done") : "",
      trialText: trial && Number.isFinite(Number(trial.remaining)) ? t("guestLeft", { remaining: trial.remaining }) : ""
    });
  }

  function renderError(text) {
    renderState({ title: text, secondaryAction: "done", secondaryLabel: t("close") });
  }

  function renderState(view) {
    inlineToken ||= crypto.randomUUID();
    window.postMessage({
      source: SOURCE_RENDER,
      token: inlineToken,
      lineNumber: Number.MAX_SAFE_INTEGER,
      view
    }, "*");
  }

  function hideInline() {
    window.postMessage({ source: SOURCE_HIDE }, "*");
    inlineToken = "";
    activeReason = "";
    activeReasonKey = "";
  }

  async function refreshSettings() {
    const response = await sendMessage({ type: "GET_SETTINGS" }).catch(() => null);
    if (!response?.ok) return;
    enabled = response.settings?.proactiveCoachEnabled !== false;
    uiLanguage = response.settings?.uiLanguage === "ko" ? "ko" : "en";
    lastSettingsRefreshAt = Date.now();
    if (!enabled) hideInline();
  }

  function requestEditorActivity() {
    try { window.postMessage({ source: "CODING_HINT_COACH_REQUEST_EDITOR_ACTIVITY" }, "*"); } catch {}
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

  function resetProblem(problemKey) {
    currentProblem = problemKey;
    problemOpenedAt = Date.now();
    lastProgressAt = Math.max(Date.now(), editorActivity.lastChangeAt || 0);
    lastCodeSignature = "";
    lastFailedEventId = "";
    lastCloseEventId = "";
    lastNudgeAt = 0;
    interventions = 0;
    dismissedReasons = new Set();
    shownReasons = new Set();
    hideInline();
  }

  function isPassiveReason(reason) {
    return ["planning", "stuck", "failed", "close"].includes(reason);
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

  function visibleAiText(raw) {
    return String(raw || "").split("---metadata---")[0].replace(/^(HINT:|COACH:)\s*/i, "").trim();
  }

  function looksLikeFullCode(text) {
    const trimmed = String(text || "").trim();
    if (/```/.test(trimmed)) return true;
    if (/\bclass\s+Solution\b/.test(trimmed)) return true;
    return /^\s*(def|function|public|private|const|let|var)\s+/m.test(trimmed) && trimmed.split("\n").length > 6;
  }

  function parseMetadata(raw) {
    const parts = String(raw || "").split("---metadata---");
    if (parts.length < 2) return null;
    try { return JSON.parse(parts.slice(1).join("---metadata---").trim()); }
    catch { return null; }
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
      planningTitle: "How do you want to start?", planningCopy: "Explain it in one or two sentences before you code.", planningPlaceholder: "I'll start by...", writeApproach: "Write approach", needHint: "Need a hint", checkApproach: "Check approach", notNow: "Not now",
      failedTitle: "That run failed.", failedCopy: "Want one debugging question, not the answer?", debugThis: "Debug", dismiss: "Dismiss",
      closeTitle: "Samples pass.", closeCopy: "Check one edge case before submitting?", checkEdges: "Check edge case",
      stuckTitle: "Need a nudge?", stuckCopy: "One next thought, without the solution.", showHint: "Show",
      tryFreeTitle: "Start without an API key", tryFreeCopy: "10 free questions are available.", tryFreeCta: "Start free", settings: "Settings",
      thinking: "Thinking…", starting: "Starting…", moreSpecific: "More specific", openCoach: "Open coach", done: "Done", close: "Close",
      guestLeft: "Guest · {remaining} left", connectAccess: "Start guest mode or connect your OpenAI API key.", guestUnavailable: "Guest mode is temporarily unavailable.", hintError: "CodeCoach could not generate a hint.", fullSolutionBlocked: "Full solution hidden. Ask for a smaller hint instead."
    },
    ko: {
      planningTitle: "어떻게 시작할까요?", planningCopy: "코드를 더 작성하기 전에 한두 문장으로 적어보세요.", planningPlaceholder: "먼저 이렇게 생각해볼게요...", writeApproach: "접근 적기", needHint: "힌트 필요", checkApproach: "접근 확인", notNow: "나중에",
      failedTitle: "방금 실행이 실패했습니다.", failedCopy: "정답 말고 디버깅 질문 하나만 볼까요?", debugThis: "디버그", dismiss: "닫기",
      closeTitle: "샘플 테스트는 통과했습니다.", closeCopy: "제출 전에 엣지 케이스 하나 확인할까요?", checkEdges: "엣지 케이스 확인",
      stuckTitle: "작은 힌트가 필요하신가요?", stuckCopy: "정답 없이 다음 생각 하나만 짚어드릴게요.", showHint: "보기",
      tryFreeTitle: "API key 없이 시작", tryFreeCopy: "무료 질문 10회를 사용할 수 있습니다.", tryFreeCta: "무료로 시작", settings: "설정",
      thinking: "생각 중…", starting: "시작 중…", moreSpecific: "더 구체적으로", openCoach: "코치 열기", done: "완료", close: "닫기",
      guestLeft: "게스트 · {remaining}회 남음", connectAccess: "게스트 모드를 시작하거나 OpenAI API key를 연결하세요.", guestUnavailable: "게스트 모드를 잠시 사용할 수 없습니다.", hintError: "CodeCoach가 힌트를 만들지 못했습니다.", fullSolutionBlocked: "전체 정답 코드는 숨겼습니다. 더 작은 힌트를 요청해 주세요."
    }
  };
})();
