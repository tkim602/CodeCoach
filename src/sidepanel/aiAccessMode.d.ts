export type AiAccessMode = "byok" | "guest" | "none";

export function resolveAiAccessMode(
  settings?: { hasApiKey?: boolean },
  guestTrial?: { remaining?: number | string | null } | null
): AiAccessMode;

export function resolveAiMode(
  settings: { hasApiKey?: boolean } | null | undefined,
  sendMessage: (message: { type: string }) => Promise<{ enabled?: boolean; trial?: { remaining?: number | string | null } | null } | null | undefined>
): Promise<AiAccessMode>;
