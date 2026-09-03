import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

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

  it("localizes guest onboarding user-facing strings", () => {
    const onboarding = read("src/sidepanel/guest-onboarding.js");
    expect(onboarding).toContain("const STRINGS =");
    expect(onboarding).toContain("게스트로 계속하기");
    expect(onboarding).toContain("Continue as guest");
  });

  it("keeps proactive inline coaching quiet and progressive", () => {
    const proactive = read("src/content/proactive-coach.js");
    expect(proactive).toContain("const PLANNING_DELAY_MS = 35000");
    expect(proactive).toContain("ACTIVE_EDIT_SUPPRESS_MS");
    expect(proactive).toContain('result.status === "passed" && result.kind === "run"');
    expect(proactive).toContain('result.status === "passed" && result.kind === "submit"');
    expect(proactive).toContain('activeReason === "close"');
    expect(proactive).toContain("isUsableCursor");
    expect(proactive).toContain("Open coach");
    expect(proactive).toContain('data-action="open"');
    expect(proactive).toContain("renderGuestStart");
    expect(proactive).toContain("Try free · 10 questions");
    expect(proactive).toContain("contains_solution_code");
    expect(proactive).toContain("looksLikeFullCode");
  });
});
