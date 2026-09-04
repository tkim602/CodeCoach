import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/content/inline-nudge.js"), "utf8");

describe("inline coach localization", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("keeps concise English and Korean copy for planning and guest entry", () => {
    expect(source).toContain('writeApproach: "Write approach"');
    expect(source).toContain('writeApproach: "접근 적기"');
    expect(source).toContain('tryFreeTitle: "Start without an API key"');
    expect(source).toContain('tryFreeTitle: "API key 없이 시작"');
    expect(source).toContain('tryFreeCta: "Start free"');
    expect(source).toContain('tryFreeCta: "무료로 시작"');
  });

  it("opens with a prompt choice and follows up sooner", () => {
    expect(source).toContain("const OPENING_PROMPT_DELAY_MS = 1_500;");
    expect(source).toContain("const STUCK_DELAY_MS = 45_000;");
    expect(source).toContain("const NUDGE_COOLDOWN_MS = 2 * 60_000;");
    expect(source).toContain('secondaryAction: "hint"');
    expect(source).toContain('secondaryLabel: t("needHint")');
    expect(source).toContain('tertiaryAction: "dismiss"');
    expect(source).toContain('planningTitle: "How do you want to start?"');
    expect(source).toContain('planningTitle: "어떻게 시작할까요?"');
    expect(source).toContain('if (activeReason === "planning") return Number.MAX_SAFE_INTEGER;');
    expect(source).not.toContain("isStubLikeCode");
  });

  it("refreshes settings through the extension-level storage change event", async () => {
    vi.useFakeTimers();
    const storageListener = vi.fn();
    const sendMessage = vi.fn((message, callback) => {
      if (message.type === "GET_SETTINGS") {
        callback({ ok: true, settings: { proactiveCoachEnabled: true, uiLanguage: "ko" } });
        return;
      }
      callback({ ok: false });
    });

    globalThis.chrome = {
      runtime: {
        lastError: null,
        onMessage: { addListener: vi.fn() },
        sendMessage
      },
      storage: { onChanged: { addListener: storageListener } }
    };

    Function(source)();
    await Promise.resolve();

    expect(storageListener).toHaveBeenCalledOnce();
    const settingsRequestsBeforeChange = sendMessage.mock.calls.filter(([message]) => message.type === "GET_SETTINGS").length;

    storageListener.mock.calls[0][0]({ uiLanguage: { oldValue: "en", newValue: "ko" } }, "local");
    await Promise.resolve();

    const settingsRequestsAfterChange = sendMessage.mock.calls.filter(([message]) => message.type === "GET_SETTINGS").length;
    expect(settingsRequestsAfterChange).toBe(settingsRequestsBeforeChange + 1);
  });
});
