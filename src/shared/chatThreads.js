const MAX_MESSAGES_PER_THREAD = 80;

export function normalizeCoachThreads(value) {
  return Array.isArray(value) ? value.map(normalizeThread).filter(Boolean) : [];
}

export function findThreadForContext(threads, context) {
  const normalized = normalizeCoachThreads(threads);
  const problemUrl = context?.problemUrl || context?.url || "unknown";
  return normalized.find((thread) => thread.problemUrl === problemUrl) || null;
}

export function chatHistoryForContext(threads, context, { limit = 12, excludeKinds = [] } = {}) {
  const thread = findThreadForContext(threads, context);
  if (!thread) return [];
  const excludeSet = new Set(excludeKinds);
  return thread.messages
    .filter((message) => !excludeSet.has(message.kind))
    .slice(-limit)
    .map((message) => ({
      role: message.role,
      text: message.text,
      kind: message.kind,
      createdAt: message.createdAt
    }));
}

export function upsertThreadMessage(threads, context, message, { maxMessages = MAX_MESSAGES_PER_THREAD } = {}) {
  const normalized = normalizeCoachThreads(threads);
  const problemUrl = context?.problemUrl || context?.url || "unknown";
  const index = normalized.findIndex((thread) => thread.problemUrl === problemUrl);
  const now = new Date().toISOString();
  const previous = index >= 0 ? normalized[index] : {
    id: crypto.randomUUID(),
    problemUrl,
    platform: context?.platform || "",
    problemSlug: context?.problemSlug || "",
    title: context?.title || "",
    createdAt: now,
    messages: []
  };
  const next = {
    ...previous,
    platform: context?.platform || previous.platform,
    problemSlug: context?.problemSlug || previous.problemSlug,
    title: context?.title || previous.title,
    updatedAt: now,
    messages: [...previous.messages, normalizeMessage(message)].slice(-maxMessages)
  };
  if (index >= 0) normalized[index] = next;
  else normalized.push(next);
  return normalized;
}

export function sanitizeThreadForExport(thread) {
  const normalized = normalizeThread(thread);
  if (!normalized) return null;
  return {
    ...normalized,
    messages: normalized.messages.map(({ metadata, ...message }) => ({
      ...message,
      metadata: metadata || {}
    }))
  };
}

function normalizeThread(thread) {
  if (!thread || typeof thread !== "object") return null;
  return {
    id: String(thread.id || crypto.randomUUID()),
    problemUrl: String(thread.problemUrl || ""),
    platform: String(thread.platform || ""),
    problemSlug: String(thread.problemSlug || ""),
    title: String(thread.title || ""),
    createdAt: String(thread.createdAt || new Date().toISOString()),
    updatedAt: String(thread.updatedAt || thread.createdAt || new Date().toISOString()),
    messages: Array.isArray(thread.messages) ? thread.messages.map(normalizeMessage).filter(Boolean) : []
  };
}

function normalizeMessage(message) {
  if (!message || typeof message !== "object") return null;
  return {
    id: String(message.id || crypto.randomUUID()),
    role: message.role === "assistant" ? "assistant" : "user",
    kind: String(message.kind || "chat"),
    text: String(message.text || ""),
    metadata: message.metadata && typeof message.metadata === "object" ? message.metadata : {},
    createdAt: String(message.createdAt || new Date().toISOString()),
    contextSnapshot: message.contextSnapshot && typeof message.contextSnapshot === "object"
      ? message.contextSnapshot
      : {}
  };
}
