(function () {
  const POLL_MS = 2000;
  const PLANNING_DELAY_MS = 15000;
  const STUCK_DELAY_MS = 90000;
  const NUDGE_COOLDOWN_MS = 5 * 60 * 1000;
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
  let activeRequestId = "";
  let activeContext = null;
  let lastFailedEventId = "";
  let dismissedReasons = new Set();
  let host = null;
  let shadow = null;
  let bubble = null;

  chrome.runtime.onMessage.addListener((message) => {
    if (!activeRequestId || message?.requestId !== activeRequestId) return false;
    if (message.type === "INLINE_AI_START") {
      setBubbleBusy(true, "Thinking...");
      return false;
    }
    if (message.type === "INLINE_AI_DELTA") {
      renderAnswer(visibleAiText(message.rawText || message.delta || ""), false);
      return false;
    }
    if (message.type === "INLINE_AI_DONE") {
      const rawText = message.rawText || "";
      const visible = visibleAiText(rawText);
      renderAnswer(visible, true, message.trial || null);
      saveInlineHint(rawText, visible).catch(() => {});
      activeRequestId = "";
      return false;
    }
    if (message.type === "INLINE_AI_ERROR") {
      renderError(message.error || "CodeCoach could not generate a hint.");
      activeRequestId = "";
      return false;
    }
    return false;
  });

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

    if (!context.allowed || !findEditor()) {
      removeBubble();
      return;
    }

    if (context.testResults?.status === "passed") {
      removeBubble();
      return;
    }

    const signature = quickSignature(context.code || "");
    if (signature && signature !== lastCodeSignature) {
      if (lastCodeSignature) {
        lastProgressAt = Date.now();
        if (activeReason === "stuck") removeBubble();
      }
      lastCodeSignature = signature;
    }

    const failedEventId = context.testResults?.status === "failed"
      ? context.testResults?.eventId || `${signature}:${context.testResults?.summary || "failed"}`
      : "";
    if (failedEventId && failedEventId !== lastFailedEventId) {
      lastFailedEventId = failedEventId;
      maybeShow("failed", context);
      return;
    }

    const code = String(context.code || "").trim();
    if (code.length <= 80 && Date.now() - problemOpenedAt >= PLANNING_DELAY_MS) {
      maybeShow("planning", context);
      return;
    }

    if (code.length > 80 && Date.now() - lastProgressAt >= STUCK_DELAY_MS) {
      maybeShow("stuck", context);
    }
  }

  function maybeShow(reason, context) {
    if (bubble || dismissedReasons.has(reason)) return;
    if (interventions >= MAX_INTERVENTIONS_PER_PROBLEM) return;
    if (Date.now() - lastNudgeAt < NUDGE_COOLDOWN_MS && reason !== "failed") return;
    activeReason = reason;
    activeContext = context;
    interventions += 1;
    lastNudgeAt = Date.now();
    renderPrompt(reason);
  }

  function renderPrompt(reason) {
    ensureBubble();
    if (!bubble) return;
    const body = bubble.querySelector(".cc-body");
    if (reason === "planning") {
      body.innerHTML = `
        <div class="cc-kicker">CODECOACH · PLAN</div>
        <div class="cc-title">What’s your approach?</div>
        <div class="cc-copy">Explain it in one or two sentences before you code.</div>
        <textarea class="cc-plan-input" rows="2" placeholder="I’ll start by..."></textarea>
        <div class="cc-actions"><button class="cc-primary" data-action="approach">Check my approach</button><button class="cc-ghost" data-action="dismiss">Not now</button></div>`;
    } else if (reason === "failed") {
      body.innerHTML = `
        <div class="cc-kicker">CODECOACH · DEBUG</div>
        <div class="cc-title">Submission failed.</div>
        <div class="cc-copy">Want one small debugging question, not the answer?</div>
        <div class="cc-actions"><button class="cc-primary" data-action="nudge">Debug this</button><button class="cc-ghost" data-action="dismiss">Dismiss</button></div>`;
    } else {
      body.innerHTML = `
        <div class="cc-kicker">CODECOACH · STUCK?</div>
        <div class="cc-title">Need a small nudge?</div>
        <div class="cc-copy">I’ll point at one next thought and keep the solution hidden.</div>
        <div class="cc-actions"><button class="cc-primary" data-action="nudge">Nudge me</button><button class="cc-ghost" data-action="dismiss">Dismiss</button></div>`;
    }
    wireActions();
    positionBubble();
  }

  function wireActions() {
    bubble.querySelector("[data-action='dismiss']")?.addEventListener("click", () => {
      dismissedReasons.add(activeReason);
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
        userNote: activeReason === "failed" ? "The learner just received a failed submission. Give one Socratic debugging question." : context.userNote || ""
      }
    }).catch((error) => ({ ok: false, error: error.message }));
    if (!response?.ok) {
      activeRequestId = "";
      renderError(response?.error || "Start the guest trial or connect your OpenAI API key.");
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
      renderError(response?.error || "Start the guest trial or connect your OpenAI API key.");
    }
  }

  function renderAnswer(text, done, trial = null) {
    ensureBubble();
    const remaining = trial && Number.isFinite(Number(trial.remaining)) ? `<span class="cc-trial">Guest · ${trial.remaining} left</span>` : "";
    bubble.querySelector(".cc-body").innerHTML = `
      <div class="cc-kicker">CODECOACH</div>
      <div class="cc-answer">${escapeHtml(text || "Thinking...")}</div>
      ${done ? `<div class="cc-actions"><button class="cc-primary" data-action="more">More specific</button><button class="cc-ghost" data-action="close">Done</button></div>${remaining}` : ""}`;
    if (done) {
      bubble.querySelector("[data-action='more']")?.addEventListener("click", () => {
        const currentLevel = Number(bubble.dataset.level || 1);
        const next = Math.min(3, currentLevel + 1);
        bubble.dataset.level = String(next);
        requestHint(next);
      });
      bubble.querySelector("[data-action='close']")?.addEventListener("click", removeBubble);
    }
    positionBubble();
  }

  function renderError(text) {
    ensureBubble();
    bubble.querySelector(".cc-body").innerHTML = `
      <div class="cc-kicker">CODECOACH</div>
      <div class="cc-answer">${escapeHtml(text)}</div>
      <div class="cc-actions"><button class="cc-ghost" data-action="close">Close</button></div>`;
    bubble.querySelector("[data-action='close']")?.addEventListener("click", removeBubble);
  }

  function setBubbleBusy(busy, label) {
    if (!bubble || !busy) return;
    const primary = bubble.querySelector(".cc-primary");
    if (primary) {
      primary.disabled = true;
      primary.textContent = label || "Thinking...";
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
      if (node && node.getBoundingClientRect().width >= 0) return node;
    }
    return null;
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
    lastNudgeAt = 0;
    interventions = 0;
    dismissedReasons = new Set();
    removeBubble();
  }

  function removeBubble() {
    host?.remove();
    host = null;
    shadow = null;
    bubble = null;
    activeReason = "";
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

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response || { ok: false, error: "No response." });
      });
    });
  }
})();
