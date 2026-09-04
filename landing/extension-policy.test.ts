import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveAiAccessMode } from "../src/sidepanel/aiAccessMode.js";

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("extension AI access and privacy policy", () => {
  it("uses supported low reasoning for GPT-5 inline and BYOK requests", () => {
    expect(read("src/background/service-worker.js")).toContain('return { effort: "low" };');
    expect(read("src/background/coach-router.js")).toContain('return { effort: "low" };');
    expect(read("src/background/service-worker.js")).not.toContain('effort: "minimal"');
    expect(read("src/background/coach-router.js")).not.toContain('effort: "minimal"');
  });

  it("does not send client-built instructions to the guest backend", () => {
    const router = read("src/background/coach-router.js");
    const guestBody = router.slice(router.indexOf("body: JSON.stringify({"), router.indexOf("const payload = await response.json"));
    expect(guestBody).toContain("context");
    expect(guestBody).toContain("userMessage");
    expect(guestBody).not.toContain("instructions");
    expect(guestBody).not.toContain("inputText");
  });

  it("clears local guest session state without claiming to reset server quota", () => {
    const serviceWorker = read("src/background/service-worker.js");
    expect(serviceWorker).toContain("import { clearGuestSession }");
    expect(serviceWorker).toContain("await clearGuestSession();");
    expect(serviceWorker).not.toContain("RESET_GUEST_QUOTA");
  });

  it("discloses BYOK and guest AI request paths", () => {
    const policy = read("assets/privacy-policy.html");
    expect(policy).toContain("BYOK request path");
    expect(policy).toContain("CodeCoach extension → CodeCoach Firebase backend → OpenAI");
    expect(policy).toContain("Guest AI requests are sent through the CodeCoach Firebase backend");
  });

  it("uses a quiet localized guest onboarding action", () => {
    const onboarding = read("src/sidepanel/guest-onboarding.js");
    expect(onboarding).toContain("const STRINGS =");
    expect(onboarding).toContain("먼저 무료로 사용하기 · 10회");
    expect(onboarding).toContain("Try free first · 10 questions");
    expect(onboarding).toContain("chrome.storage?.onChanged?.addListener");
    expect(onboarding).not.toContain("codecoach-guest-divider");
    expect(onboarding).not.toContain("guestCtaSub");
  });

  it("keeps proactive inline coaching quiet and progressive", () => {
    const proactive = read("src/content/proactive-coach.js");
    expect(proactive).toContain("const STRINGS =");
    expect(proactive).toContain("접근 방법이 어떻게 되나요?");
    expect(proactive).toContain("What's your approach?");
    expect(proactive).toContain("const PLANNING_DELAY_MS = 35000");
    expect(proactive).toContain("ACTIVE_EDIT_SUPPRESS_MS");
    expect(proactive).toContain('result.status === "passed" && result.kind === "run"');
    expect(proactive).toContain('result.status === "passed" && result.kind === "submit"');
    expect(proactive).toContain("isPassivePromptReason");
    expect(proactive).toContain("isUsableCursor");
    expect(proactive).toContain("Open coach");
    expect(proactive).toContain("코치 열기");
    expect(proactive).toContain('data-action="open"');
    expect(proactive).toContain("renderGuestStart");
    expect(proactive).toContain("Try free · 10 questions");
    expect(proactive).toContain("무료로 시작 · 10회");
    expect(proactive).toContain("contains_solution_code");
    expect(proactive).toContain("looksLikeFullCode");
  });

  it("resolves AI access mode consistently", () => {
    expect(resolveAiAccessMode({ hasApiKey: true }, { remaining: 8 })).toBe("byok");
    expect(resolveAiAccessMode({ hasApiKey: false }, { remaining: 8 })).toBe("guest");
    expect(resolveAiAccessMode({ hasApiKey: false }, { remaining: 0 })).toBe("none");
    expect(resolveAiAccessMode({ hasApiKey: false }, null)).toBe("none");
  });

  it("routes composer chat through the shared AI controller so @code gating applies", () => {
    const composer = read("src/sidepanel/sidepanel.composer.js");
    expect(composer).toContain("startAiRequest?.(REQUEST_KINDS.chatCoach, text)");
    expect(composer).not.toContain("dispatchFreeChat");
    expect(composer).not.toContain("GET_GUEST_STATUS");
  });
});
