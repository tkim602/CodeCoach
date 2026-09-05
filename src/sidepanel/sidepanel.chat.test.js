import { afterEach, expect, it, vi } from "vitest";
import { createChatController } from "./sidepanel.chat.js";

afterEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((style) => style.remove());
  vi.unstubAllGlobals();
});

it("shows only the page guidance, regardless of API access, until chatting starts", () => {
  const transcript = document.createElement("div");
  const chat = createChatController({
    elements: { coachChatTranscript: transcript },
    t: (key) => key === "pageAllowedText" ? "Ask for a hint based on this problem." : key
  });
  for (const aiAccessMode of ["none", "guest", "byok"]) {
    chat.setEmptyState({ allowed: true, aiAccessMode });
    expect(transcript.textContent.trim()).toBe("Ask for a hint based on this problem.");
    expect(transcript.querySelector("strong")).toBeNull();
    expect(transcript.querySelectorAll(".chat-empty-state")).toHaveLength(1);
  }
  chat.setEmptyState({ allowed: false });
  expect(transcript.textContent.trim()).toBe("pageNotAllowedText");
  chat.appendUserMessage("Help me");
  chat.setEmptyState({ allowed: true });
  expect(transcript.querySelector(".chat-empty-state")).toBeNull();
});

it.each([["en", "10 left"], ["ko", "10회 남음"]])("renders plain remaining-count text in %s", async (uiLanguage, expected) => {
  vi.resetModules();
  document.body.innerHTML = '<div id="apikey-view-save"></div><div id="composer-model-row"></div><div id="apikey-modal"></div>';
  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn(async ({ type }) => type === "GET_SETTINGS"
        ? { settings: { uiLanguage, hasApiKey: false } }
        : { enabled: true, trial: { remaining: 10 } })
    },
    storage: { onChanged: { addListener: vi.fn() } }
  });
  await import("./guest-onboarding.js");
  await vi.waitFor(() => {
    const status = document.getElementById("codecoach-guest-status");
    expect(status?.textContent).toBe(expected);
    expect(getComputedStyle(status).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(status).borderRadius).toBe("0px");
  });
});
