import { REQUEST_KINDS } from "../shared/constants.js";
import { buildAnalyzeRequest, buildChatCoachRequest, buildCodeDiffRequest, buildDebugLabRequest, buildHintRequest, buildNextCodeHintRequest, buildNoteRequest } from "../shared/prompts.js";
import { getAllLearningData, getSettings } from "../shared/storage.js";
import { chatHistoryForContext } from "../shared/chatThreads.js";
import { ensureGuestSession, getGuestSession } from "../shared/guest-auth.js";
import { redactSensitiveText } from "../shared/openaiErrors.js";
import { createSseTextParser, progressiveTextParts } from "./coach-stream.js";

const GUEST_ENDPOINT = "https://us-central1-ai-hint-coach.cloudfunctions.net/guestCoach";
const COACH_MESSAGE_TYPES = new Set(["START_GUEST_TRIAL", "GET_GUEST_STATUS", "STREAM_GUEST_AI", "STREAM_INLINE_AI"]);

export function isCoachMessage(message) {
  return COACH_MESSAGE_TYPES.has(message?.type);
}

export async function handleCoachMessage(message, sender) {
  try {
    if (message.type === "START_GUEST_TRIAL") {
      await ensureGuestSession();
      return { ok: true, trial: await fetchGuestStatus() };
    }

    if (message.type === "GET_GUEST_STATUS") {
      const session = await getGuestSession();
      if (!session) return { ok: true, enabled: false, trial: null };
      try {
        return { ok: true, enabled: true, trial: await fetchGuestStatus() };
      } catch {
        return { ok: true, enabled: true, trial: null };
      }
    }

    const settings = await getSettings();
    const requestId = message.requestId || crypto.randomUUID();
    const kind = message.kind || REQUEST_KINDS.hint;
    const context = {
      ...(message.context || {}),
      responseLanguage: settings.responseLanguage || "auto"
    };
    ensureContextAllowed(settings, context);

    if (kind === REQUEST_KINDS.chatCoach && !Array.isArray(message.chatHistory)) {
      const learning = await getAllLearningData().catch(() => null);
      message = {
        ...message,
        chatHistory: chatHistoryForContext(learning?.coachThreads || [], context, { excludeKinds: ["debug_lab"] })
      };
    }

    if (message.type === "STREAM_INLINE_AI" && settings.apiKey) {
      streamInlineWithOwnKey({ message, sender, settings, requestId, kind, context }).catch((error) => {
        sendToOrigin(sender, {
          type: "INLINE_AI_ERROR",
          requestId,
          error: redactSensitiveText(error.message || String(error))
        });
      });
      return { ok: true, mode: "byok" };
    }

    const session = await getGuestSession();
    if (!session) return { ok: false, code: "GUEST_NOT_STARTED", error: "Start the guest trial or connect an OpenAI API key." };

    streamGuest({ message, sender, requestId, kind, context }).catch((error) => {
      const eventType = message.type === "STREAM_INLINE_AI" ? "INLINE_AI_ERROR" : "AI_STREAM_ERROR";
      sendToOrigin(sender, {
        type: eventType,
        requestId,
        error: redactSensitiveText(error.message || String(error))
      });
    });
    return { ok: true, mode: "guest" };
  } catch (error) {
    return { ok: false, error: redactSensitiveText(error.message || String(error)) };
  }
}

async function streamGuest({ message, sender, requestId, kind, context }) {
  const session = await ensureGuestSession();
  const inline = message.type === "STREAM_INLINE_AI";
  sendToOrigin(sender, {
    type: inline ? "INLINE_AI_START" : "AI_STREAM_START",
    requestId,
    kind,
    model: "gpt-5.4-mini"
  });

  const response = await fetch(GUEST_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requestId,
      kind,
      hintLevel: message.hintLevel,
      context,
      userMessage: message.userMessage || "",
      debugAction: message.debugAction || "",
      testCases: message.testCases || [],
      chatHistory: message.chatHistory || [],
      analysisText: message.analysisText || "",
      status: message.status || ""
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Guest coaching failed (${response.status})`);
    error.code = payload.code || "";
    throw error;
  }

  const eventType = inline ? "INLINE_AI_DELTA" : "AI_STREAM_DELTA";
  await emitProgressiveText(sender, {
    requestId,
    text: payload.text || "",
    eventType
  });

  if (inline) {
    sendToOrigin(sender, { type: "INLINE_AI_DONE", requestId, rawText: payload.text || "", kind, model: payload.model, trial: payload.trial });
  } else {
    sendToOrigin(sender, { type: "AI_STREAM_DONE", requestId, rawText: payload.text || "", kind, model: payload.model, trial: payload.trial });
  }
}

async function streamInlineWithOwnKey({ message, sender, settings, requestId, kind, context }) {
  const aiRequest = buildRequest(kind, message, context);
  const model = pickModel(kind, settings);
  sendToOrigin(sender, { type: "INLINE_AI_START", requestId, kind, model });

  const body = {
    model,
    instructions: aiRequest.instructions,
    input: [{ role: "user", content: [{ type: "input_text", text: aiRequest.inputText }] }],
    stream: true,
    store: false,
    max_output_tokens: maxOutputTokensFor(kind)
  };
  const reasoning = reasoningOptionsForModel(model);
  if (reasoning) body.reasoning = reasoning;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  if (!response.body) throw new Error("OpenAI response did not include a stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseTextParser();
  let rawText = "";

  const emitDelta = (delta) => {
    if (!delta) return;
    rawText += delta;
    sendToOrigin(sender, { type: "INLINE_AI_DELTA", requestId, delta, rawText });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    emitDelta(parser.push(decoder.decode(value, { stream: true })));
  }
  emitDelta(parser.push(decoder.decode()));
  emitDelta(parser.finish());

  if (!rawText.trim()) throw new Error("OpenAI returned an empty response.");
  sendToOrigin(sender, { type: "INLINE_AI_DONE", requestId, rawText, kind, model });
}

async function emitProgressiveText(sender, { requestId, text, eventType }) {
  const parts = progressiveTextParts(text);
  let rawText = "";
  for (let index = 0; index < parts.length; index += 1) {
    const delta = parts[index];
    rawText += delta;
    sendToOrigin(sender, { type: eventType, requestId, delta, rawText });
    if (index < parts.length - 1) await delay(progressiveDelay(delta));
  }
}

function progressiveDelay(delta) {
  const length = String(delta || "").trim().length;
  if (length <= 2) return 12;
  if (length <= 8) return 18;
  return 24;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGuestStatus() {
  const session = await ensureGuestSession();
  const response = await fetch(GUEST_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action: "status" })
  });
  if (!response.ok) throw new Error(`Guest status failed (${response.status}).`);
  const payload = await response.json();
  return payload.trial || null;
}

function ensureContextAllowed(settings, context) {
  if (context.platform === "leetcode" && !settings.killSwitch.leetcodeEnabled) throw new Error(settings.killSwitch.message || "LeetCode support is disabled.");
  if (context.platform === "programmers" && !settings.killSwitch.programmersEnabled) throw new Error(settings.killSwitch.message || "Programmers support is disabled.");
  if (!settings.killSwitch.aiHintingEnabled) throw new Error(settings.killSwitch.message || "AI hinting is disabled.");
  const status = context.pageStatus || context.status || "";
  if (context.allowed !== true || status === "blocked") throw new Error(context.reason || "AI hints are disabled on this page.");
}

function buildRequest(kind, message, context) {
  if (kind === REQUEST_KINDS.chatCoach) return buildChatCoachRequest({ context, userMessage: message.userMessage || "", chatHistory: message.chatHistory || [] });
  if (kind === REQUEST_KINDS.debugLab) return buildDebugLabRequest({ context, userMessage: message.userMessage || "", action: message.debugAction || "free_chat", testCases: message.testCases || [] });
  if (kind === REQUEST_KINDS.analyze) return buildAnalyzeRequest({ context });
  if (kind === REQUEST_KINDS.note) return buildNoteRequest({ context, analysisText: message.analysisText || "", status: message.status || "solved" });
  if (kind === REQUEST_KINDS.codeDiff) return buildCodeDiffRequest({ context });
  if (kind === REQUEST_KINDS.nextCodeHint) return buildNextCodeHintRequest({ context });
  return buildHintRequest({ context, hintLevel: message.hintLevel || 1, explainLine: kind === REQUEST_KINDS.explainLine });
}

function pickModel(kind, settings) {
  if ([REQUEST_KINDS.analyze, REQUEST_KINDS.debugLab].includes(kind)) return settings.analyzeModel;
  if (kind === REQUEST_KINDS.note) return settings.noteModel;
  return settings.hintModel;
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

function reasoningOptionsForModel(model) {
  const normalized = String(model || "").toLowerCase();
  if (normalized.startsWith("gpt-5")) return { effort: "low" };
  return null;
}

function sendToOrigin(sender, payload) {
  if (sender?.tab?.id) {
    chrome.tabs.sendMessage(sender.tab.id, payload).catch(() => {});
    return;
  }
  chrome.runtime.sendMessage(payload).catch(() => {});
}
