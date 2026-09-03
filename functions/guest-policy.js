"use strict";

const GUEST_MODEL = "gpt-5.4-mini";
const GUEST_MAX_REQUESTS = 10;
const GUEST_MAX_SPEND_MICRO_USD = 500_000;
const GUEST_MAX_INPUT_BYTES = 40_000;
const GUEST_MAX_OUTPUT_TOKENS = 900;
const GUEST_INPUT_OVERHEAD_TOKENS = 2_500;

// gpt-5.4-mini: $0.75 / 1M input tokens and $4.50 / 1M output tokens.
// In micro-USD, those rates are 0.75 and 4.5 per token respectively.
const INPUT_MICRO_USD_PER_TOKEN = 0.75;
const OUTPUT_MICRO_USD_PER_TOKEN = 4.5;

function utf8Bytes(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function requestInputBytes({ instructions = "", inputText = "" } = {}) {
  return utf8Bytes(instructions) + utf8Bytes(inputText);
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

function validateGuestRequest({ instructions = "", inputText = "", kind = "" } = {}) {
  const allowedKinds = new Set([
    "hint",
    "explainLine",
    "analyze",
    "chat_coach",
    "debug_lab",
    "note",
    "code_diff",
    "next_code_hint"
  ]);

  if (!allowedKinds.has(kind)) {
    return { ok: false, error: "Unsupported guest AI request." };
  }

  const bytes = requestInputBytes({ instructions, inputText });
  if (bytes <= 0) return { ok: false, error: "Guest AI request is empty." };
  if (bytes > GUEST_MAX_INPUT_BYTES) {
    return { ok: false, error: "Guest AI request is too large." };
  }

  return { ok: true, bytes };
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

module.exports = {
  GUEST_MODEL,
  GUEST_MAX_REQUESTS,
  GUEST_MAX_SPEND_MICRO_USD,
  GUEST_MAX_INPUT_BYTES,
  GUEST_MAX_OUTPUT_TOKENS,
  GUEST_INPUT_OVERHEAD_TOKENS,
  calculateCostMicroUsd,
  maximumRequestCostMicroUsd,
  requestInputBytes,
  validateGuestRequest,
  canReserveGuestRequest
};
