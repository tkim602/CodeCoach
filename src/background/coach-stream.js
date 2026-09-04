export function createSseTextParser() {
  let buffer = "";

  return {
    push(chunk) {
      buffer += String(chunk || "");
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";
      return events.map(parseEvent).join("");
    },
    finish() {
      const finalEvent = buffer;
      buffer = "";
      return parseEvent(finalEvent);
    }
  };
}

export function progressiveTextParts(text) {
  return String(text || "").match(/\S+\s*|\s+/g) || [];
}

function parseEvent(eventBlock) {
  let delta = "";
  const dataLines = String(eventBlock || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  for (const data of dataLines) {
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data);
      if (event.type === "response.output_text.delta") delta += event.delta || "";
    } catch {}
  }
  return delta;
}
