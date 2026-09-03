import { REQUEST_KINDS } from "../shared/constants.js";
import { formatOpenAiHttpError, formatOpenAiNetworkError, redactSensitiveText } from "../shared/openaiErrors.js";
import { buildAnalyzeRequest, buildChatCoachRequest, buildCodeDiffRequest, buildDebugLabRequest, buildHintRequest, buildNextCodeHintRequest, buildNoteRequest } from "../shared/prompts.js";
import { evaluateCodingPracticePage } from "../shared/pageRules.js";
import { buildMarkdownExport } from "../shared/markdown.js";
import { aggregateTaxonomyEvents } from "../shared/taxonomy/index.js";
import { isCoachMessage, handleCoachMessage } from "./coach-router.js";
import {
  addCodeSnapshot,
  addCoachThreadMessage,
  addHintEvent,
  addLearningEvent,
  clearAllLocalData,
  clearLearningData,
  deleteLearningProblems,
  deleteApiKey,
  addManualReviewSchedule,
  deleteSavedNotesByIds,
  getAllLearningData,
  getPublicSettings,
  getSettings,
  markSessionUnsolved,
  saveLearningNote,
  saveSettings,
  scheduleNoteReview,
  updateLearningNote,
  updateProblemMetadata,
  updateReviewScheduleEntry
} from "../shared/storage.js";

const AUTO_SAVE_DEDUPE_MS = 4000;
const autoSavedResultSignatures = new Map();
const savedResultEventIds = new Map();

const TIMER_ALARM_PREFIX = "timer:";
const TIMER_NOTIFICATION_PREFIX = "timer-done:";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => { });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => { });
  }
});

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm?.name?.startsWith(TIMER_ALARM_PREFIX)) return;
    const problemKey = alarm.name.slice(TIMER_ALARM_PREFIX.length);
    handleTimerAlarmFired(problemKey).catch(() => { });
  });
}

if (chrome.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (!notificationId?.startsWith(TIMER_NOTIFICATION_PREFIX)) return;
    chrome.notifications.clear(notificationId).catch(() => { });
  });
}

async function handleTimerAlarmFired(problemKey) {
  if (!problemKey) return;
  try {
    const { problemMetadata } = await getAllLearningData();
    const existing = problemMetadata?.[problemKey] || {};
    const duration = Number(existing.timerDurationMs) || 0;
    await updateProblemMetadata(problemKey, {
      timerDurationMs: duration,
      timerRemainingMs: 0,
      timerElapsedMs: duration,
      timerRunningSince: "",
      timerFinishedAt: new Date().toISOString()
    });
  } catch (error) {
    // metadata write failure should not block the user-facing notification
  }
  sendRuntimeMessage({ type: "TIMER_DONE_BG", problemKey });
  notifyTimerDone(problemKey);
}

function notifyTimerDone(problemKey) {
  if (!chrome.notifications?.create) return;
  const notificationId = `${TIMER_NOTIFICATION_PREFIX}${problemKey}:${Date.now()}`;
  const options = {
    type: "basic",
    iconUrl: chrome.runtime.getURL("assets/icon128.png"),
    title: "CodeCoach",
    message: "타이머가 종료되었습니다. 풀이 결과를 정리해 보세요.",
    priority: 2
  };
  // Some builds reject when iconUrl points at a missing file; retry without it.
  chrome.notifications.create(notificationId, options, () => {
    if (chrome.runtime.lastError) {
      const { iconUrl, ...fallback } = options;
      chrome.notifications.create(notificationId, fallback, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: redactSensitiveText(error.message || String(error)) }));
  return true;
});

async function handleMessage(message, sender) {
  if (isCoachMessage(message)) return handleCoachMessage(message, sender);

  switch (message?.type) {
    case "GET_SETTINGS":
      return { ok: true, settings: await getPublicSettings() };
    case "SAVE_SETTINGS":
      await saveSettings(message.settings || {});
      return { ok: true, settings: await getPublicSettings() };
    case "DELETE_API_KEY":
      await deleteApiKey();
      return { ok: true, settings: await getPublicSettings() };
    case "CLEAR_LEARNING_DATA":
      await clearLearningData();
      return { ok: true };
    case "CLEAR_ALL_LOCAL_DATA":
      await clearAllLocalData();
      return { ok: true };
    case "GET_ACTIVE_CONTEXT":
      return { ok: true, context: await getActiveContext() };
    case "PAGE_CONTEXT_UPDATED":
      sendRuntimeMessage({ type: "PAGE_CONTEXT_UPDATED", context: message.context || {} });
      maybeSaveContextResultSnapshot(message.context || {}).catch(() => { });
      return { ok: true };
    case "SUBMISSION_RESULT_DETECTED":
      return { ok: true, result: await saveDetectedSubmissionSnapshot(message) };
    case "STREAM_AI":
      streamAi(message).catch((error) => {
        sendRuntimeMessage({
          type: "AI_STREAM_ERROR",
          requestId: message.requestId,
          error: redactSensitiveText(error.message || String(error))
        });
      });
      return { ok: true };
    case "SAVE_HINT_EVENT":
      return {
        ok: true,
        result: await addHintEvent(message.payload || {})
      };
    case "SAVE_LEARNING_EVENT":
      return {
        ok: true,
        result: await addLearningEvent(message.event || {})
      };
    case "SAVE_COACH_THREAD_MESSAGE":
      return {
        ok: true,
        thread: await addCoachThreadMessage(message.payload || {})
      };
    case "SAVE_CODE_SNAPSHOT":
      return {
        ok: true,
        result: await addCodeSnapshot(message.payload || {})
      };
    case "UPDATE_PROBLEM_METADATA":
      return {
        ok: true,
        metadata: await updateProblemMetadata(message.problemKey, message.patch || {})
      };
    case "UPDATE_REVIEW_STATE":
      return {
        ok: true,
        metadata: await updateProblemMetadata(message.problemKey, reviewPatch(message.action, message.currentMetadata || {}))
      };
    case "MARK_REVIEW_COMPLETE":
      await updateReviewScheduleEntry(message.problemKey, message.date, "complete");
      return { ok: true };
    case "UNMARK_REVIEW_COMPLETE":
      await updateReviewScheduleEntry(message.problemKey, message.date, "uncomplete");
      return { ok: true };
    case "SNOOZE_REVIEW":
      await updateReviewScheduleEntry(message.problemKey, message.date, "snooze", message.targetDate || null);
      return { ok: true };
    case "DELETE_REVIEW_ENTRY":
      await updateReviewScheduleEntry(message.problemKey, message.date, "delete");
      return { ok: true };
    case "ADD_MANUAL_REVIEW": {
      await addManualReviewSchedule(message.problemKey, message.titleOverride || "", message.startDate || null, message.source || "");
      return { ok: true };
    }
    case "UPDATE_TIMER_STATE":
      return {
        ok: true,
        metadata: await updateProblemMetadata(message.problemKey, message.patch || {})
      };
    case "DELETE_LEARNING_PROBLEMS":
      return {
        ok: true,
        result: await deleteLearningProblems(message.problemKeys || [])
      };
    case "SAVE_LEARNING_NOTE": {
      const savedNote = await saveLearningNote(message.note || {}, { replace: Boolean(message.replace) });
      scheduleNoteReview(savedNote).catch((err) => console.error("[scheduleNoteReview]", err));
      return { ok: true, note: savedNote };
    }
    case "UPDATE_LEARNING_NOTE":
      return {
        ok: true,
        note: await updateLearningNote(message.noteId, message.patch || {})
      };
    case "DELETE_SAVED_NOTES":
      return {
        ok: true,
        result: await deleteSavedNotesByIds(message.noteIds || [])
      };
    case "MARK_UNSOLVED":
      return {
        ok: true,
        result: await markSessionUnsolved(message.context || {}, message.details || {})
      };
    case "GET_LEARNING_DATA":
      return { ok: true, data: await getDashboardData() };
    case "GET_MARKDOWN_EXPORT":
      return { ok: true, markdown: buildMarkdownExport(await getAllLearningData()) };
    case "TEST_OPENAI_KEY":
      return { ok: true, result: await testOpenAiKey(message.apiKey) };
    case "GET_MAIN_WORLD_EDITOR_STATE": {
      const tabId = sender?.tab?.id;
      if (!tabId) return { ok: false, error: "No tab ID." };
      try {
        const state = await getEditorFromMainWorld(tabId);
        return { ok: true, state };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    }
    default:
      return { ok: false, error: "Unknown message type." };
  }
}

async function getActiveContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return fallbackContext("", "No active tab detected.");
  }

  const tabFavIconUrl = tab.favIconUrl || "";

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_CONTEXT" });
    if (response?.ok && response.context) {
      const ctx = await enrichContextWithMainWorldEditor(tab.id, response.context);
      if (tabFavIconUrl) ctx.favIconUrl = tabFavIconUrl;
      return ctx;
    }
  } catch {
    // The content script may not be present on blocked or unsupported pages.
  }

  const eligibility = evaluateCodingPracticePage(tab.url || "");
  const context = {
    ...fallbackContext(tab.url || "", eligibility.reason),
    ...eligibility,
    pageStatus: eligibility.status || eligibility.pageStatus || "blocked",
    title: tab.title || "",
    favIconUrl: tabFavIconUrl
  };

  return await enrichContextWithPageDom(tab.id, context);
}

async function saveDetectedSubmissionSnapshot(message) {
  const eventId = getResultEventId(message);
  if (eventId && wasResultEventSaved(eventId)) {
    return { skipped: true, reason: "Duplicate result event." };
  }
  if (eventId) markResultEventSaved(eventId);

  const settings = await getSettings();
  if (settings.autoSaveSubmissionSnapshots === false) {
    return { skipped: true, reason: "Auto-save disabled." };
  }

  const context = message.context || {};
  const status = ["passed", "failed"].includes(message.status) ? message.status : "";
  const trimmedCode = context.code?.trim() || "";
  if (!status || !context.allowed || !context.problemUrl || trimmedCode.length < 10) {
    return { skipped: true, reason: "No valid submission snapshot." };
  }

  const result = await addCodeSnapshot({
    context,
    status,
    code: context.code,
    language: context.language,
    note: formatDetectedResultNote(message)
  });
  if (result.snapshot) {
    sendRuntimeMessage({
      type: "SUBMISSION_SNAPSHOT_SAVED",
      status,
      context,
      snapshot: result.snapshot
    });
  }
  return result;
}

async function maybeSaveContextResultSnapshot(context) {
  const testResults = context?.testResults;
  if (!testResults || !context?.allowed || !context?.problemUrl || !context?.code?.trim()) return;

  const status = snapshotStatusFromTestResults(testResults);
  if (!status) return;

  const signature = [
    testResults.eventId || "",
    context.problemUrl,
    status,
    await hashText(context.code),
    testResults.kind || "",
    testResults.status || "",
    testResults.summary || "",
    testResults.resultText || ""
  ].join("\n");
  const now = Date.now();
  if (now - (autoSavedResultSignatures.get(signature) || 0) < AUTO_SAVE_DEDUPE_MS) return;
  autoSavedResultSignatures.set(signature, now);
  for (const [key, savedAt] of autoSavedResultSignatures.entries()) {
    if (now - savedAt > 60000 || autoSavedResultSignatures.size > 80) {
      autoSavedResultSignatures.delete(key);
    }
  }

  await saveDetectedSubmissionSnapshot({
    context,
    status,
    resultText: testResults.resultText || testResults.summary || "",
    testResults
  });
}

function getResultEventId(message) {
  return message.resultEventId || message.testResults?.eventId || message.context?.testResults?.eventId || "";
}

function wasResultEventSaved(eventId) {
  return Boolean(eventId && savedResultEventIds.has(eventId));
}

function markResultEventSaved(eventId) {
  const now = Date.now();
  savedResultEventIds.set(eventId, now);
  for (const [key, savedAt] of savedResultEventIds.entries()) {
    if (now - savedAt > 10 * 60 * 1000 || savedResultEventIds.size > 200) {
      savedResultEventIds.delete(key);
    }
  }
}

function snapshotStatusFromTestResults(testResults) {
  const status = String(testResults.status || "").toLowerCase();
  const text = `${testResults.summary || ""}\n${testResults.resultText || ""}`.toLowerCase();

  if (status === "failed" || /wrong answer|runtime error|compile error|time limit|memory limit|틀렸습니다/.test(text)) return "failed";
  if (status === "passed" || /\baccepted\b|정답입니다/.test(text)) {
    return "passed";
  }
  return "";
}

function formatDetectedResultNote(message) {
  const testResults = message.testResults || message.context?.testResults || null;
  if (!testResults) return message.resultText || "Detected from platform submission result.";
  const cases = Array.isArray(testResults.cases) && testResults.cases.length
    ? `\nCases:\n${testResults.cases.slice(0, 12).map((item) => `- ${item.id || "?"}: ${item.status}`).join("\n")}`
    : "";
  const metrics = testResults.metrics && Object.keys(testResults.metrics).length
    ? `\nMetrics:\n${Object.entries(testResults.metrics).map(([key, value]) => `- ${key}: ${value}`).join("\n")}`
    : "";
  return [
    testResults.summary || `Detected status: ${message.status || testResults.status || "unknown"}`,
    message.resultText || testResults.resultText || "",
    cases,
    metrics
  ].filter(Boolean).join("\n\n").slice(0, 2200);
}

async function enrichContextWithMainWorldEditor(tabId, context) {
  if (!context?.allowed || context.code) return context;

  try {
    const editor = await getEditorFromMainWorld(tabId);
    if (!editor.code) return await enrichContextWithPageDom(tabId, context);
    return {
      ...context,
      title: context.title || editor.title || "",
      code: editor.code,
      selectedContext: context.selectedContext || editor.selectedContext || "",
      selectedLine: context.selectedLine || editor.selectedLine || "",
      language: context.language || editor.language || ""
    };
  } catch {
    return await enrichContextWithPageDom(tabId, context);
  }
}

async function enrichContextWithPageDom(tabId, context) {
  if (!context?.allowed || context.code) return context;

  try {
    const snapshot = await getEditorFromPageDom(tabId);
    if (!snapshot.code && !snapshot.problemContext) return context;
    return {
      ...context,
      title: context.title || snapshot.title || "",
      code: context.code || snapshot.code || "",
      problemContext: context.problemContext || snapshot.problemContext || "",
      selectedContext: context.selectedContext || snapshot.selectedContext || "",
      selectedLine: context.selectedLine || snapshot.selectedLine || "",
      language: context.language || snapshot.language || ""
    };
  } catch {
    return context;
  }
}

async function getEditorFromMainWorld(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      let result = { code: "", language: "" };
      try {
        const models = window.monaco?.editor?.getModels?.() || [];
        const model = models.find((item) => item?.getValue?.().trim()) || models[0];
        if (model) {
          result = {
            code: model.getValue?.() || "",
            language: model.getLanguageId?.() || ""
          };
        }
      } catch { }

      if (!result.code) {
        try {
          const aceNode = document.querySelector(".ace_editor");
          if (aceNode && window.ace?.edit) {
            const editor = window.ace.edit(aceNode);
            result = {
              code: editor?.getSession?.().getValue?.() || editor?.getValue?.() || "",
              language: editor?.getSession?.().getMode?.()?.$id?.split("/").pop?.() || ""
            };
          }
        } catch { }
      }

      if (!result.code) {
        try {
          const cmNode = document.querySelector(".CodeMirror");
          const cm = cmNode?.CodeMirror;
          if (cm?.getValue) {
            result = {
              code: cm.getValue() || "",
              language: cm.getOption?.("mode") || ""
            };
          }
        } catch { }
      }

      return result;
    }
  });

  return result?.result || { code: "", language: "" };
}

async function getEditorFromPageDom(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectEditorSnapshotFromDom
  });

  return result?.result || { code: "", language: "", title: "", selectedContext: "", selectedLine: "", problemContext: "" };
}

function collectEditorSnapshotFromDom() {
  const getText = (node) => (node?.innerText || node?.textContent || "").replace(/\u00a0/g, " ");

  const title = document.title
    .replace(/\s+-\s+LeetCode\s*$/i, "")
    .replace(/\s*\|\s*프로그래머스 스쿨\s*$/i, "")
    .replace(/\s*\|\s*프로그래머스\s*$/i, "")
    .replace(/\s*-\s*프로그래머스\s*$/i, "")
    .trim();

  const visibleCode = getVisibleEditorCode();
  const textareaCode = getBestTextareaCode();
  const code = visibleCode || textareaCode;
  const selectedContext = getSelectedText();

  return {
    title: title.slice(0, 160),
    code,
    problemContext: getProblemContext(),
    language: detectSelectedLanguage() || detectLanguage(code),
    selectedContext,
    selectedLine: selectedContext && selectedContext.length < 500 ? selectedContext : ""
  };

  function getBestTextareaCode() {
    const preferred = document.querySelector("textarea#code, textarea[name='code']");
    const preferredValue = preferred?.value || preferred?.textContent || "";
    if (preferredValue.trim() && scoreCodeLikeText(preferredValue) > 0) {
      return preferredValue.trim();
    }

    const candidates = [...document.querySelectorAll("textarea")]
      .map((node) => ({
        value: node.value || node.textContent || "",
        score: scoreCodeLikeText(node.value || node.textContent || "")
      }))
      .filter((item) => item.value.trim().length > 20 && item.score > 0)
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.value.trim() || "";
  }

  function getVisibleEditorCode() {
    const selectors = [
      ".monaco-editor .view-lines .view-line",
      ".ace_editor .ace_line",
      ".CodeMirror-code pre",
      ".CodeMirror-line"
    ];

    for (const selector of selectors) {
      const lines = [...document.querySelectorAll(selector)]
        .map(getText)
        .map((line) => line.replace(/\u200b/g, ""))
        .filter((line, index, all) => line.trim() || index < all.length - 1);
      const candidate = lines.join("\n").trim();
      if (candidate && scoreCodeLikeText(candidate) > 0) return candidate;
    }

    return "";
  }

  function getProblemContext() {
    const host = location.hostname;
    const selectors = host === "leetcode.com" || host === "www.leetcode.com"
      ? [
        '[data-track-load="description_content"]',
        '[data-cy="question-content"]',
        'div[class*="question-content"]',
        'div[class*="description"]',
        "main",
        "body"
      ]
      : ["school.programmers.co.kr", "programmers.co.kr", "www.programmers.co.kr"].includes(host)
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
      if ((host === "leetcode.com" || host === "www.leetcode.com") && shouldSkipLeetCodeContext(selector, text)) continue;
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

  function getSelectedText() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return "";
    return selection.toString().trim().slice(0, 3000);
  }

  function scoreCodeLikeText(text) {
    let score = 0;
    if (/[{}()[\];]/.test(text)) score += 1;
    if (/\b(def|class|function|return|public|private|const|let|var|import|from|include|solution|answer)\b/.test(text)) score += 2;
    if (text.includes("\n")) score += 1;
    if (/solution|answer|code/i.test(text)) score += 1;
    return score;
  }

  function detectSelectedLanguage() {
    const selected = [...document.querySelectorAll("select option:checked, [aria-selected='true'], .selected, .active")]
      .map((node) => node.textContent || "")
      .join(" ")
      .toLowerCase();

    if (/python|파이썬/.test(selected)) return "python";
    if (/javascript|자바스크립트|node/.test(selected)) return "javascript";
    if (/java\b|자바/.test(selected)) return "java";
    if (/c\+\+|cpp/.test(selected)) return "cpp";
    if (/solution\.c\b|\bc언어\b|\bc language\b|\bc\s*$/.test(selected)) return "c";
    if (/c#|csharp/.test(selected)) return "csharp";
    if (/mysql|sql/.test(selected)) return "sql";
    if (/kotlin|코틀린/.test(selected)) return "kotlin";
    if (/swift/.test(selected)) return "swift";
    if (/go\b|golang/.test(selected)) return "go";
    return "";
  }

  function detectLanguage(text) {
    if (!text) return "";
    if (/\bdef\s+\w+\(|\bself\b|:\s*(\n|$)/.test(text)) return "python";
    if (/\bclass\s+Solution\b/.test(text) && /public:|vector<|int\s+\w+\(/.test(text)) return "cpp";
    if (/\bfunction\s+\w+\(|=>|const\s+|let\s+/.test(text)) return "javascript";
    if (/\bpublic\s+class\b|\bList<|\bHashMap<|\bint\[\]/.test(text)) return "java";
    if (/#include\s*<|int\s+main\s*\(|int\s+solution\s*\(/.test(text)) return "c";
    if (/\bSELECT\b|\bFROM\b|\bWHERE\b/i.test(text)) return "sql";
    return "";
  }
}

function fallbackContext(url, reason) {
  return {
    allowed: false,
    pageStatus: "blocked",
    reason,
    url,
    problemUrl: "",
    problemSlug: "",
    title: "",
    language: "",
    code: "",
    selectedLine: "",
    selectedContext: "",
    testResults: null
  };
}

async function streamAi(message) {
  const settings = await getSettings();
  const kind = message.kind || REQUEST_KINDS.hint;
  const requestId = message.requestId || crypto.randomUUID();
  const context = {
    ...(message.context || {}),
    responseLanguage: settings.responseLanguage || "auto"
  };

  ensureAiAllowed(settings, context);

  const model = pickModel(kind, settings);
  const aiRequest = buildRequest(kind, message, context);

  sendRuntimeMessage({
    type: "AI_STREAM_START",
    requestId,
    model,
    kind
  });

  const rawText = await streamOpenAi({
    apiKey: settings.apiKey,
    model,
    instructions: aiRequest.instructions,
    inputText: aiRequest.inputText,
    maxOutputTokens: maxOutputTokensFor(kind),
    requestId
  });

  sendRuntimeMessage({
    type: "AI_STREAM_DONE",
    requestId,
    rawText,
    kind,
    model
  });
}

function ensureAiAllowed(settings, context) {
  if (!settings.apiKey) {
    throw new Error("Add your OpenAI API key in the extension options page first.");
  }

  if (context.platform === "leetcode" && !settings.killSwitch.leetcodeEnabled) {
    throw new Error(settings.killSwitch.message || "LeetCode support is disabled.");
  }

  if (context.platform === "programmers" && !settings.killSwitch.programmersEnabled) {
    throw new Error(settings.killSwitch.message || "Programmers support is disabled.");
  }

  if (!settings.killSwitch.aiHintingEnabled) {
    throw new Error(settings.killSwitch.message || "AI hinting is disabled.");
  }

  const pageStatus = context.pageStatus || context.status || "";
  if (context.allowed !== true || pageStatus === "blocked") {
    throw new Error(context.reason || "AI hints are disabled on this page.");
  }
}

function pickModel(kind, settings) {
  if (kind === REQUEST_KINDS.analyze) return settings.analyzeModel;
  if (kind === REQUEST_KINDS.debugLab) return settings.analyzeModel;
  if (kind === REQUEST_KINDS.note) return settings.noteModel;
  return settings.hintModel;
}

function buildRequest(kind, message, context) {
  if (kind === REQUEST_KINDS.chatCoach) {
    return buildChatCoachRequest({
      context,
      userMessage: message.userMessage || "",
      chatHistory: message.chatHistory || []
    });
  }

  if (kind === REQUEST_KINDS.debugLab) {
    return buildDebugLabRequest({
      context,
      userMessage: message.userMessage || "",
      action: message.debugAction || "free_chat",
      testCases: message.testCases || []
    });
  }

  if (kind === REQUEST_KINDS.analyze) {
    return buildAnalyzeRequest({ context });
  }

  if (kind === REQUEST_KINDS.note) {
    return buildNoteRequest({
      context,
      analysisText: message.analysisText || "",
      status: message.status || "solved"
    });
  }

  if (kind === REQUEST_KINDS.codeDiff) {
    return buildCodeDiffRequest({ context });
  }

  if (kind === REQUEST_KINDS.nextCodeHint) {
    return buildNextCodeHintRequest({ context });
  }

  return buildHintRequest({
    context,
    hintLevel: message.hintLevel || 1,
    explainLine: kind === REQUEST_KINDS.explainLine
  });
}

function maxOutputTokensFor(kind) {
  if (kind === REQUEST_KINDS.nextCodeHint) return 350;
  if (kind === REQUEST_KINDS.chatCoach) return 900;
  if (kind === REQUEST_KINDS.debugLab) return 1300;
  if (kind === REQUEST_KINDS.codeDiff) return 1200;
  if (kind === REQUEST_KINDS.analyze) return 1100;
  if (kind === REQUEST_KINDS.note) return 1400;
  return 900;
}

function reviewPatch(action, currentMetadata = {}) {
  const now = new Date();
  const patch = {
    lastReviewedAt: now.toISOString(),
    reviewCount: Math.max(0, Number(currentMetadata.reviewCount) || 0)
  };
  if (action === "done") {
    patch.reviewCount += 1;
    patch.nextReviewAt = "";
  } else if (action === "tomorrow") {
    now.setDate(now.getDate() + 1);
    patch.nextReviewAt = now.toISOString();
  } else if (action === "week") {
    now.setDate(now.getDate() + 7);
    patch.nextReviewAt = now.toISOString();
  }
  return patch;
}

async function streamOpenAi({ apiKey, model, instructions, inputText, maxOutputTokens, requestId }) {
  const requestBody = {
    model,
    instructions,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: inputText
          }
        ]
      }
    ],
    stream: true,
    store: false,
    max_output_tokens: maxOutputTokens
  };
  const reasoning = reasoningOptionsForModel(model);
  if (reasoning) requestBody.reasoning = reasoning;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (error) {
    throw new Error(formatOpenAiNetworkError(error, "OpenAI request"));
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(formatOpenAiHttpError(response.status, text, "OpenAI request"));
  }

  if (!response.body) {
    throw new Error("OpenAI response did not include a stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawText = "";
  let finalText = "";
  let terminalError = "";
  let refusalText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const parsed = parseSseChunk(chunk);
      if (parsed.error) terminalError = parsed.error;
      if (parsed.finalText) finalText = parsed.finalText;
      if (parsed.refusal) refusalText += parsed.refusal;

      const delta = parsed.delta;
      if (!delta) continue;

      rawText += delta;
      sendRuntimeMessage({
        type: "AI_STREAM_DELTA",
        requestId,
        delta,
        rawText
      });
    }
  }

  if (refusalText) {
    throw new Error("AI declined to respond to this request.");
  }
  if (finalText && (!rawText || finalText.length > rawText.length)) return finalText;
  if (!rawText && terminalError) throw new Error(terminalError);
  return rawText;
}

function reasoningOptionsForModel(model) {
  const normalized = String(model || "").toLowerCase();
  if (normalized.startsWith("gpt-5")) {
    return { effort: "minimal" };
  }
  return null;
}

function parseSseChunk(chunk) {
  const dataLines = chunk
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  const result = {
    delta: "",
    finalText: "",
    error: "",
    refusal: ""
  };

  for (const line of dataLines) {
    if (!line || line === "[DONE]") continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "response.output_text.delta") {
        result.delta += event.delta || "";
      } else if (event.type === "response.refusal.delta") {
        result.refusal = (result.refusal || "") + (event.delta || "");
      } else if (event.type === "response.output_text.done") {
        result.finalText = event.text || result.finalText;
      } else if (event.type === "response.content_part.done") {
        result.finalText = extractTextFromResponseEvent(event.part) || result.finalText;
      } else if (event.type === "response.output_item.done") {
        result.finalText = extractTextFromResponseEvent(event.item) || result.finalText;
      } else if (event.type === "response.completed") {
        result.finalText = extractTextFromResponseEvent(event.response) || result.finalText;
      } else if (event.type === "response.failed" || event.type === "response.incomplete") {
        result.error = extractResponseEventError(event);
      }
    } catch {
      // Ignore non-JSON stream control lines.
    }
  }

  return result;
}

function extractTextFromResponseEvent(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.text === "string") return value.text;
  if (typeof value.output_text === "string") return value.output_text;
  if (Array.isArray(value.output)) return value.output.map(extractTextFromResponseEvent).filter(Boolean).join("");
  if (Array.isArray(value.content)) return value.content.map(extractTextFromResponseEvent).filter(Boolean).join("");
  if (Array.isArray(value.parts)) return value.parts.map(extractTextFromResponseEvent).filter(Boolean).join("");
  return "";
}

function extractResponseEventError(event) {
  const error = event.error || event.response?.error || event.response?.incomplete_details || {};
  if (typeof error === "string") return error;
  return error.message || error.reason || "OpenAI response did not complete.";
}

async function testOpenAiKey(apiKey) {
  const key = String(apiKey || "").trim() || (await getSettings()).apiKey;
  if (!key) {
    throw new Error("Enter an API key first.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        "Authorization": `Bearer ${key}`
      },
      signal: controller.signal
    });
  } catch (error) {
    throw new Error(formatOpenAiNetworkError(error, "OpenAI key test"));
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(formatOpenAiHttpError(response.status, text, "OpenAI key test"));
  }

  const payload = await response.json();
  const models = Array.isArray(payload.data) ? payload.data.map((model) => model.id).sort() : [];
  return {
    modelCount: models.length,
    models: models.slice(0, 80)
  };
}

async function getDashboardData() {
  const data = await getAllLearningData();
  const taxonomySummary = aggregateTaxonomyEvents(data.hintEvents || []);
  const categoryCounts = {};
  const categoryProblemSets = {};
  for (const event of data.hintEvents) {
    for (const category of event.categories || []) {
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      if (!categoryProblemSets[category]) categoryProblemSets[category] = new Set();
      categoryProblemSets[category].add(event.problemUrl || event.sessionId || event.id);
    }
  }

  return {
    ...data,
    ...taxonomySummary,
    categoryCounts,
    topCategories: Object.entries(categoryProblemSets)
      .map(([category, problemSet]) => ({
        category,
        count: problemSet.size,
        eventCount: categoryCounts[category] || 0
      }))
      .sort((a, b) => b.count - a.count || b.eventCount - a.eventCount)
  };
}

function sendRuntimeMessage(payload) {
  chrome.runtime.sendMessage(payload).catch(() => { });
}

async function hashText(text) {
  const data = new TextEncoder().encode(String(text || ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
