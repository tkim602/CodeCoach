export function formatOpenAiHttpError(status, bodyText = "", action = "OpenAI request") {
  const detail = extractOpenAiError(bodyText);
  const guidance = guidanceForStatus(status);
  return redactSensitiveText(`${action} failed (${status}). ${guidance}${detail ? ` ${detail}` : ""}`.trim());
}

export function formatOpenAiNetworkError(error, action = "OpenAI request") {
  if (error?.name === "AbortError") {
    return `${action} timed out after 30 seconds. Check your connection and try again.`;
  }
  const detail = error?.message ? ` ${error.message}` : "";
  return redactSensitiveText(`Network error while contacting OpenAI. Check your internet connection and try again.${detail}`);
}

export function redactSensitiveText(value = "") {
  return String(value)
    .replace(/Bearer\s+sk-[A-Za-z0-9_-]+/g, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]");
}

function guidanceForStatus(status) {
  if (status === 401) return "API key is invalid. Re-enter your OpenAI API key.";
  if (status === 403) return "This API key or account cannot access the selected model. Choose another model or check account access.";
  if (status === 429) return "OpenAI rate limit or quota was reached. Try again later or check billing.";
  if ([500, 502, 503, 504].includes(status)) return "OpenAI is temporarily unavailable. Try again later.";
  return "OpenAI returned an error.";
}

function extractOpenAiError(text) {
  if (!text) return "";
  try {
    const payload = JSON.parse(text);
    return payload.error?.message || "";
  } catch {
    return String(text).slice(0, 500);
  }
}
