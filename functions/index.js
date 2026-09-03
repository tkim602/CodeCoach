"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const {
  GUEST_MODEL,
  GUEST_MAX_REQUESTS,
  GUEST_MAX_SPEND_MICRO_USD,
  GUEST_MAX_OUTPUT_TOKENS,
  calculateCostMicroUsd,
  maximumRequestCostMicroUsd,
  validateGuestRequest,
  canReserveGuestRequest
} = require("./guest-policy");

initializeApp();
const db = getFirestore();
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

exports.guestCoach = onRequest({
  region: "us-central1",
  secrets: [OPENAI_API_KEY],
  timeoutSeconds: 45,
  memory: "256MiB",
  cors: true
}, async (req, res) => {
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const token = bearerToken(req.headers.authorization);
    if (!token) return res.status(401).json({ error: "Guest session required." });
    const decoded = await getAuth().verifyIdToken(token);
    if (!decoded.uid) return res.status(401).json({ error: "Invalid guest session." });

    const trialRef = db.collection("guestTrials").doc(decoded.uid);
    if (req.body?.action === "status") {
      const snapshot = await trialRef.get();
      return res.json({ trial: publicTrial(snapshot.data()) });
    }

    const kind = String(req.body?.kind || "");
    const instructions = String(req.body?.instructions || "");
    const inputText = String(req.body?.inputText || "");
    const requestId = String(req.body?.requestId || "").slice(0, 120);
    const validation = validateGuestRequest({ kind, instructions, inputText });
    if (!validation.ok) return res.status(400).json({ error: validation.error });
    if (!requestId) return res.status(400).json({ error: "Missing request id." });

    const reservation = maximumRequestCostMicroUsd();
    let reservedTrial;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(trialRef);
      const current = snapshot.data() || {};
      const eligibility = canReserveGuestRequest(current);
      if (!eligibility.ok) {
        const error = new Error(eligibility.reason);
        error.code = eligibility.reason;
        throw error;
      }

      const recentIds = Array.isArray(current.recentRequestIds) ? current.recentRequestIds : [];
      if (recentIds.includes(requestId)) {
        const error = new Error("duplicate_request");
        error.code = "duplicate_request";
        throw error;
      }

      reservedTrial = {
        usedRequests: (Number(current.usedRequests) || 0) + 1,
        spentMicroUsd: Number(current.spentMicroUsd) || 0,
        reservedMicroUsd: (Number(current.reservedMicroUsd) || 0) + reservation,
        recentRequestIds: [...recentIds.slice(-19), requestId],
        createdAt: current.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      transaction.set(trialRef, reservedTrial, { merge: true });
    });

    let openAiResponse;
    try {
      openAiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY.value()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: GUEST_MODEL,
          instructions,
          input: [{ role: "user", content: [{ type: "input_text", text: inputText }] }],
          reasoning: { effort: "minimal" },
          stream: false,
          store: false,
          max_output_tokens: GUEST_MAX_OUTPUT_TOKENS
        })
      });

      if (!openAiResponse.ok) {
        const detail = await openAiResponse.text().catch(() => "");
        throw new Error(`OpenAI request failed (${openAiResponse.status}) ${detail.slice(0, 180)}`);
      }

      const responseBody = await openAiResponse.json();
      const text = extractResponseText(responseBody);
      if (!text.trim()) throw new Error("OpenAI returned an empty response.");

      const usage = responseBody.usage || {};
      const actualCost = calculateCostMicroUsd({
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens
      });

      const finalTrial = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(trialRef);
        const current = snapshot.data() || {};
        const next = {
          spentMicroUsd: Math.min(
            GUEST_MAX_SPEND_MICRO_USD,
            (Number(current.spentMicroUsd) || 0) + actualCost
          ),
          reservedMicroUsd: Math.max(0, (Number(current.reservedMicroUsd) || 0) - reservation),
          inputTokens: (Number(current.inputTokens) || 0) + (Number(usage.input_tokens) || 0),
          outputTokens: (Number(current.outputTokens) || 0) + (Number(usage.output_tokens) || 0),
          updatedAt: FieldValue.serverTimestamp()
        };
        transaction.set(trialRef, next, { merge: true });
        return { ...current, ...next };
      });

      return res.json({
        text,
        model: GUEST_MODEL,
        usage: {
          inputTokens: Number(usage.input_tokens) || 0,
          outputTokens: Number(usage.output_tokens) || 0
        },
        trial: publicTrial(finalTrial)
      });
    } catch (error) {
      await rollbackReservation(trialRef, reservation, requestId).catch(() => {});
      throw error;
    }
  } catch (error) {
    if (error?.code === "questions_exhausted") {
      return res.status(429).json({ code: "GUEST_LIMIT_REACHED", error: "Your 10 guest questions are used." });
    }
    if (error?.code === "cost_cap_reached") {
      return res.status(429).json({ code: "GUEST_COST_LIMIT_REACHED", error: "Guest trial cost limit reached." });
    }
    if (error?.code === "duplicate_request") {
      return res.status(409).json({ code: "DUPLICATE_REQUEST", error: "This guest request was already submitted." });
    }
    console.error("guestCoach", error);
    return res.status(500).json({ error: "Guest coaching is temporarily unavailable." });
  }
});

async function rollbackReservation(trialRef, reservation, requestId) {
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(trialRef);
    const current = snapshot.data() || {};
    const ids = Array.isArray(current.recentRequestIds) ? current.recentRequestIds : [];
    transaction.set(trialRef, {
      usedRequests: Math.max(0, (Number(current.usedRequests) || 0) - 1),
      reservedMicroUsd: Math.max(0, (Number(current.reservedMicroUsd) || 0) - reservation),
      recentRequestIds: ids.filter((id) => id !== requestId),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

function bearerToken(header) {
  const match = String(header || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function publicTrial(value = {}) {
  const used = Math.min(GUEST_MAX_REQUESTS, Math.max(0, Number(value.usedRequests) || 0));
  return {
    used,
    remaining: Math.max(0, GUEST_MAX_REQUESTS - used),
    limit: GUEST_MAX_REQUESTS,
    spentMicroUsd: Math.max(0, Number(value.spentMicroUsd) || 0),
    spendLimitMicroUsd: GUEST_MAX_SPEND_MICRO_USD
  };
}

function extractResponseText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((part) => part?.text || part?.output_text || "")
    .filter(Boolean)
    .join("");
}
