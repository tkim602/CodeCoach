export function resolveAiAccessMode(settings = {}, guestTrial = null) {
  if (settings?.hasApiKey) return "byok";
  const remaining = Number(guestTrial?.remaining);
  return Number.isFinite(remaining) && remaining > 0 ? "guest" : "none";
}

export async function resolveAiMode(settings, sendMessage) {
  if (settings?.hasApiKey) return "byok";
  const response = await sendMessage({ type: "GET_GUEST_STATUS" }).catch(() => null);
  return resolveAiAccessMode(settings, response?.enabled ? response.trial : null);
}
