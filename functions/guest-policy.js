"use strict";

const crypto = require("node:crypto");

const GUEST_MODEL = "gpt-5.4-mini";
const GUEST_MAX_REQUESTS = 10;
const GUEST_MAX_SPEND_MICRO_USD = 500_000;
const GUEST_MAX_INPUT_BYTES = 40_000;
const GUEST_MAX_OUTPUT_TOKENS = 900;
const GUEST_INPUT_OVERHEAD_TOKENS = 2_500;
const GUEST_IP_DAILY_MAX_REQUESTS = 120;
const GUEST_DAILY_BUDGET_MICRO_USD = 5_000_000;

const ALLOWED_GUEST_KINDS = new Set([
  "hint",
  "explainLine",
  "analyze",
  "chat_coach",
  "debug_lab",
  "note",
  "code_diff",
  "next_code_hint"
]);

const ALLOWED_DEBUG_ACTIONS = new Set([
  "free_chat",
  "testcase_analysis",
  "why_wrong",
  "runtime_error",
  "complexity"
]);

// gpt-5.4-mini: $0.75 / 1M input tokens and $4.50 / 1M output tokens.
// In micro-USD, those rates are 0.75 and 4.5 per token respectively.
const INPUT_MICRO_USD_PER_TOKEN = 0.75;
const OUTPUT_MICRO_USD_PER_TOKEN = 4.5;

function utf8Bytes(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function requestInputBytes({ instructions = "", inputText = "", context = null } = {}) {
  return utf8Bytes(instructions) + utf8Bytes(inputText) + (context ? utf8Bytes(JSON.stringify(context)) : 0);
}

function calculateCostMicroUsd({ inputTokens = 0, outputTokens = 0 } = {}) {
  const input = Math.max(0, Number(inputTokens) || 0);
  const output = Math.max(0, Number(outputTokens) || 0);
  return Math.ceil((input * INPUT_MICRO_USD_PER_TOKEN) + (output * OUTPUT_MICRO_USD_PER_TOKEN));
}

function maximumRequestCostMicroUsd() {
  // UTF-8 bytes are a conservative upper bound for user-supplied text tokens.
  // Add a fixed envelope allowance for model/API framing, then keep substantial
  // headroom below the $0.50 lifetime ceiling even if all ten requests are maxed.
  return calculateCostMicroUsd({
    inputTokens: GUEST_MAX_INPUT_BYTES + GUEST_INPUT_OVERHEAD_TOKENS,
    outputTokens: GUEST_MAX_OUTPUT_TOKENS
  });
}

function validateGuestRequest(payload = {}) {
  if (utf8Bytes(JSON.stringify(payload || {})) > GUEST_MAX_INPUT_BYTES) {
    return { ok: false, error: "Guest AI request is too large." };
  }
  const request = normalizeGuestAiRequest(payload);
  if (!ALLOWED_GUEST_KINDS.has(request.kind)) {
    return { ok: false, error: "Unsupported guest AI request." };
  }
  if (!request.requestId) return { ok: false, error: "Missing request id." };
  if (request.context.allowed !== true || request.context.pageStatus === "blocked") {
    return { ok: false, error: "AI hints are disabled on this page." };
  }
  if (!["leetcode", "programmers"].includes(request.context.platform)) {
    return { ok: false, error: "Unsupported coding-practice page." };
  }

  const prompt = buildGuestPrompt(request);
  const bytes = requestInputBytes(prompt);
  if (bytes <= 0) return { ok: false, error: "Guest AI request is empty." };
  if (bytes > GUEST_MAX_INPUT_BYTES) {
    return { ok: false, error: "Guest AI request is too large." };
  }

  return { ok: true, bytes, request, prompt };
}

function canReserveGuestRequest(trial = {}) {
  const usedRequests = Math.max(0, Number(trial.usedRequests) || 0);
  const spentMicroUsd = Math.max(0, Number(trial.spentMicroUsd) || 0);
  const reservedMicroUsd = Math.max(0, Number(trial.reservedMicroUsd) || 0);
  const reservation = maximumRequestCostMicroUsd();

  if (usedRequests >= GUEST_MAX_REQUESTS) {
    return { ok: false, reason: "questions_exhausted" };
  }
  if (spentMicroUsd + reservedMicroUsd + reservation > GUEST_MAX_SPEND_MICRO_USD) {
    return { ok: false, reason: "cost_cap_reached" };
  }
  return { ok: true, reservation };
}

function canReserveIpWindow(ipWindow = {}) {
  const requests = Math.max(0, Number(ipWindow.requests) || 0);
  if (requests >= GUEST_IP_DAILY_MAX_REQUESTS) {
    return { ok: false, reason: "ip_limit_reached" };
  }
  return { ok: true };
}

function canReserveGlobalBudget(budget = {}) {
  const reservedMicroUsd = Math.max(0, Number(budget.reservedMicroUsd) || 0);
  const spentMicroUsd = Math.max(0, Number(budget.spentMicroUsd) || 0);
  const reservation = maximumRequestCostMicroUsd();
  if (spentMicroUsd + reservedMicroUsd + reservation > GUEST_DAILY_BUDGET_MICRO_USD) {
    return { ok: false, reason: "global_budget_reached" };
  }
  return { ok: true, reservation };
}

function hashIp(value, salt = "") {
  const ip = String(value || "").trim();
  if (!ip) return "";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 48);
}

function dailyKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function reasoningOptionsForGuestModel(model = GUEST_MODEL) {
  if (String(model || "").toLowerCase() === "gpt-5.4-mini") return { effort: "low" };
  if (String(model || "").toLowerCase().startsWith("gpt-5")) return { effort: "low" };
  return null;
}

function openAiRequestBodyForGuest(prompt, safetyIdentifier = "") {
  const body = {
    model: GUEST_MODEL,
    instructions: prompt.instructions,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt.inputText }] }],
    reasoning: reasoningOptionsForGuestModel(GUEST_MODEL),
    stream: false,
    store: false,
    max_output_tokens: GUEST_MAX_OUTPUT_TOKENS
  };
  if (safetyIdentifier) body.safety_identifier = safetyIdentifier;
  return body;
}

function normalizeGuestAiRequest(payload = {}) {
  const kind = stringLimit(payload.kind, 40);
  const context = sanitizeContext(payload.context || {});
  return {
    requestId: stringLimit(payload.requestId, 120),
    kind,
    hintLevel: clampInteger(payload.hintLevel, 1, 3, 1),
    userMessage: stringLimit(payload.userMessage, 2_000),
    debugAction: ALLOWED_DEBUG_ACTIONS.has(payload.debugAction) ? payload.debugAction : "free_chat",
    testCases: arrayOfStrings(payload.testCases, 6, 1_200),
    chatHistory: sanitizeChatHistory(payload.chatHistory),
    analysisText: stringLimit(payload.analysisText, 5_000),
    status: ["solved", "unsolved"].includes(payload.status) ? payload.status : "solved",
    context
  };
}

function sanitizeContext(context = {}) {
  const pageStatus = stringLimit(context.pageStatus || context.status || "allowed", 80);
  return {
    allowed: context.allowed === true,
    pageStatus,
    platform: ["leetcode", "programmers"].includes(context.platform) ? context.platform : "",
    platformName: stringLimit(context.platformName, 80),
    problemUrl: allowedUrl(context.problemUrl || context.url),
    problemSlug: stringLimit(context.problemSlug, 180),
    title: stringLimit(context.title, 220),
    language: stringLimit(context.language, 80),
    responseLanguage: ["ko", "en", "auto"].includes(context.responseLanguage) ? context.responseLanguage : "auto",
    code: stringLimit(context.code, 16_000),
    selectedLine: stringLimit(context.selectedLine, 1_000),
    selectedContext: stringLimit(context.selectedContext, 2_000),
    problemContext: stringLimit(context.problemContext, 6_000),
    userNote: stringLimit(context.userNote, 1_000),
    testResults: sanitizeTestResults(context.testResults),
    failedSnapshot: sanitizeSnapshot(context.failedSnapshot),
    passedSnapshot: sanitizeSnapshot(context.passedSnapshot),
    codeHistory: Array.isArray(context.codeHistory) ? context.codeHistory.slice(0, 6).map(sanitizeSnapshot) : []
  };
}

function buildGuestPrompt(request) {
  const label = {
    hint: "progressive hint",
    explainLine: "selected-line explanation",
    analyze: "code analysis",
    chat_coach: "chat coaching",
    debug_lab: "debug lab",
    note: "wrong-answer note",
    code_diff: "code-diff review",
    next_code_hint: "next-code hint"
  }[request.kind] || "coaching";
  const instructions = [
    "You are CodeCoach, a coding-practice coach for LeetCode and Programmers.",
    "Only answer questions about the current coding problem, the user's current code, debugging, hints, or review notes.",
    "Refuse unrelated requests briefly.",
    "Do not reveal complete accepted solution code for unsolved problems.",
    "Keep the response concise, Socratic, and in the requested response language.",
    "End with ---metadata--- followed by JSON containing contains_solution_code and quality_checks."
  ].join("\n");

  const c = request.context;
  const lines = [
    `Request kind: ${label}`,
    `Hint level: ${request.hintLevel}`,
    `Response language: ${c.responseLanguage}`,
    `Platform: ${c.platform}`,
    `Problem: ${c.title || c.problemSlug}`,
    `Language: ${c.language}`,
    `Page status: ${c.pageStatus}`,
    `User message: ${request.userMessage}`,
    `Debug action: ${request.debugAction}`,
    `Note status: ${request.status}`,
    `Visible problem context:\n${c.problemContext}`,
    `Selected context:\n${c.selectedContext || c.selectedLine}`,
    `Current code:\n${c.code}`,
    `Run/test result:\n${formatTestResults(c.testResults)}`,
    `Test cases:\n${request.testCases.join("\n\n")}`,
    `Recent same-problem chat:\n${formatChatHistory(request.chatHistory)}`,
    `Saved same-problem code attempts:\n${formatSnapshots(c.codeHistory)}`,
    `Failed snapshot:\n${formatSnapshot(c.failedSnapshot)}`,
    `Passed snapshot:\n${formatSnapshot(c.passedSnapshot)}`,
    kindSpecificRules(request)
  ];
  return { instructions, inputText: lines.join("\n\n") };
}

function kindSpecificRules(request) {
  if (request.kind === "next_code_hint") {
    return "For next-code hint, suggest exactly one next edit/check. Do not provide a full function or final solution.";
  }
  if (request.kind === "hint" || request.kind === "explainLine") {
    return `For level ${request.hintLevel}, be progressive: level 1 is conceptual, level 2 points to the relevant code area, level 3 may name a concrete API or edge case but still avoids full solution code.`;
  }
  if (request.kind === "debug_lab") {
    return "For debugging, ask one targeted diagnostic question or point to one suspicious behavior in the user's code.";
  }
  if (request.kind === "note") {
    return "For notes, explain the mistake, the reasoning shift, and what to review next. Use saved attempts when available.";
  }
  if (request.kind === "code_diff") {
    return "Compare only the failed and passed user-written snapshots. Do not introduce a separate full solution.";
  }
  return "Stay grounded in the provided current problem and code.";
}

function sanitizeTestResults(value = {}) {
  if (!value || typeof value !== "object") return null;
  return {
    status: ["passed", "failed", "unknown"].includes(value.status) ? value.status : stringLimit(value.status, 40),
    kind: ["run", "submit", "unknown"].includes(value.kind) ? value.kind : stringLimit(value.kind, 40),
    summary: stringLimit(value.summary, 1_500),
    eventId: stringLimit(value.eventId, 160)
  };
}

function sanitizeSnapshot(value = {}) {
  if (!value || typeof value !== "object") return null;
  return {
    status: ["passed", "failed", "unknown"].includes(value.status) ? value.status : stringLimit(value.status, 40),
    language: stringLimit(value.language, 80),
    note: stringLimit(value.note, 500),
    code: stringLimit(value.code, 8_000),
    createdAt: stringLimit(value.createdAt, 80)
  };
}

function sanitizeChatHistory(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(-6).map((item) => ({
    role: item?.role === "assistant" ? "assistant" : "user",
    text: stringLimit(item?.text, 1_000)
  })).filter((item) => item.text);
}

function allowedUrl(value) {
  const raw = stringLimit(value, 1_000);
  try {
    const url = new URL(raw);
    if (url.hostname === "leetcode.com" || url.hostname === "www.leetcode.com") return url.href;
    if (url.hostname === "school.programmers.co.kr" || url.hostname === "programmers.co.kr" || url.hostname === "www.programmers.co.kr") return url.href;
  } catch {}
  return "";
}

function arrayOfStrings(items, maxItems, maxLength) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, maxItems).map((item) => stringLimit(item, maxLength)).filter(Boolean);
}

function stringLimit(value, max) {
  return String(value || "").slice(0, max);
}

function clampInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function formatTestResults(value) {
  if (!value) return "";
  return [value.status, value.kind, value.summary].filter(Boolean).join(" · ");
}

function formatChatHistory(items) {
  return (items || []).map((item) => `${item.role}: ${item.text}`).join("\n");
}

function formatSnapshots(items) {
  return (items || []).filter(Boolean).map(formatSnapshot).join("\n\n");
}

function formatSnapshot(item) {
  if (!item) return "";
  return [`Status: ${item.status}`, `Language: ${item.language}`, `Note: ${item.note}`, `Code:\n${item.code}`].join("\n");
}

module.exports = {
  GUEST_MODEL,
  GUEST_MAX_REQUESTS,
  GUEST_MAX_SPEND_MICRO_USD,
  GUEST_MAX_INPUT_BYTES,
  GUEST_MAX_OUTPUT_TOKENS,
  GUEST_INPUT_OVERHEAD_TOKENS,
  GUEST_IP_DAILY_MAX_REQUESTS,
  GUEST_DAILY_BUDGET_MICRO_USD,
  calculateCostMicroUsd,
  maximumRequestCostMicroUsd,
  requestInputBytes,
  validateGuestRequest,
  canReserveGuestRequest,
  canReserveIpWindow,
  canReserveGlobalBudget,
  hashIp,
  dailyKey,
  reasoningOptionsForGuestModel,
  openAiRequestBodyForGuest,
  normalizeGuestAiRequest,
  buildGuestPrompt
};
