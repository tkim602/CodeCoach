"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GUEST_MAX_REQUESTS,
  GUEST_MAX_SPEND_MICRO_USD,
  GUEST_MAX_INPUT_BYTES,
  calculateCostMicroUsd,
  maximumRequestCostMicroUsd,
  validateGuestRequest,
  canReserveGuestRequest
} = require("./guest-policy");

test("guest trial allows at most ten requests", () => {
  assert.equal(canReserveGuestRequest({ usedRequests: GUEST_MAX_REQUESTS - 1 }).ok, true);
  assert.deepEqual(canReserveGuestRequest({ usedRequests: GUEST_MAX_REQUESTS }), {
    ok: false,
    reason: "questions_exhausted"
  });
});

test("guest trial reserves below the fifty-cent lifetime ceiling", () => {
  const reservation = maximumRequestCostMicroUsd();
  assert.ok(reservation > 0);
  assert.ok(reservation * GUEST_MAX_REQUESTS <= GUEST_MAX_SPEND_MICRO_USD);
});

test("concurrent reservations cannot exceed the cost ceiling", () => {
  const reservation = maximumRequestCostMicroUsd();
  const trial = {
    usedRequests: 9,
    spentMicroUsd: GUEST_MAX_SPEND_MICRO_USD - reservation,
    reservedMicroUsd: reservation
  };
  assert.deepEqual(canReserveGuestRequest(trial), {
    ok: false,
    reason: "cost_cap_reached"
  });
});

test("actual token cost uses current gpt-5.4-mini rates", () => {
  assert.equal(calculateCostMicroUsd({ inputTokens: 1_000_000, outputTokens: 0 }), 750_000);
  assert.equal(calculateCostMicroUsd({ inputTokens: 0, outputTokens: 1_000_000 }), 4_500_000);
});

test("guest request rejects oversized payloads", () => {
  const result = validateGuestRequest({
    kind: "hint",
    instructions: "a".repeat(GUEST_MAX_INPUT_BYTES + 1),
    inputText: ""
  });
  assert.equal(result.ok, false);
});

test("guest request accepts supported coaching kinds", () => {
  const result = validateGuestRequest({
    kind: "chat_coach",
    instructions: "coach",
    inputText: "help me reason about this"
  });
  assert.equal(result.ok, true);
});
