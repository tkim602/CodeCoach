import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";

const source = readFileSync(`${process.cwd()}/src/content/inline-nudge.js`, "utf8");
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

async function boot(uiLanguage = "en") {
  vi.useFakeTimers();
  let onWindowMessage;
  let onRuntimeMessage;
  const context = { allowed: true, problemUrl: "https://leetcode.com/problems/two-sum/", code: "    return answer" };
  const window = { addEventListener: (_type, fn) => { onWindowMessage = fn; }, postMessage: vi.fn() };
  const sendMessage = vi.fn((message, callback) => callback(message.type === "GET_SETTINGS"
    ? { ok: true, settings: { uiLanguage } }
    : message.type === "GET_ACTIVE_CONTEXT" ? { ok: true, context } : { ok: true }));
  runInNewContext(source, {
    window, document: { visibilityState: "visible" }, Date, setTimeout, setInterval, crypto,
    chrome: { runtime: { sendMessage, onMessage: { addListener: (fn) => { onRuntimeMessage = fn; } } } }
  });
  const post = (data) => onWindowMessage({ source: window, data });
  post({ source: "CODING_HINT_COACH_EDITOR_ACTIVITY", editorType: "monaco" });
  await vi.advanceTimersByTimeAsync(1600);
  const latest = () => window.postMessage.mock.calls.map(([data]) => data).filter(data => data.source === "CODING_HINT_COACH_INLINE_RENDER").at(-1);
  const action = (action, value = "") => post({ source: "CODING_HINT_COACH_INLINE_ACTION", token: latest().token, action, value });
  return { latest, action, context, sendMessage, runtime: (data) => onRuntimeMessage(data) };
}

it.each([["en", "Show coach"], ["ko", "코치 다시 보기"]])("can repeatedly hide and reopen without an AI request (%s)", async (language, label) => {
  const h = await boot(language);
  const initial = h.latest().view;
  for (let i = 0; i < 4; i++) {
    h.action("dismiss");
    expect(h.latest().view).toMatchObject({ collapsed: true, primaryAction: "reopen", primaryLabel: label });
    await vi.advanceTimersByTimeAsync(130000);
    expect(h.latest().view.collapsed).toBe(true);
    h.action("reopen");
    expect(h.latest().view).toEqual(initial);
  }
  expect(h.sendMessage.mock.calls.some(([m]) => m.type === "STREAM_INLINE_AI")).toBe(false);
});

it("restores a completed hint without spending quota and resets on another problem", async () => {
  const h = await boot();
  h.action("hint");
  await vi.advanceTimersByTimeAsync(0);
  const request = h.sendMessage.mock.calls.find(([m]) => m.type === "STREAM_INLINE_AI")[0];
  h.runtime({ type: "INLINE_AI_DONE", requestId: request.requestId, rawText: "Consider what you need to remember.", trial: { remaining: 9 } });
  const answer = h.latest().view;
  h.action("dismiss");
  h.action("reopen");
  expect(h.latest().view).toEqual(answer);
  expect(h.sendMessage.mock.calls.filter(([m]) => m.type === "STREAM_INLINE_AI")).toHaveLength(1);
  h.action("dismiss");
  h.context.problemUrl = "https://school.programmers.co.kr/learn/courses/30/lessons/42626";
  await vi.advanceTimersByTimeAsync(3100);
  expect(h.latest().view.collapsed).not.toBe(true);
  expect(h.latest().view.title).toBe("How do you want to start?");
});

it("does not restore Thinking or let late responses reopen a hidden coach", async () => {
  const h = await boot();
  h.action("hint");
  await vi.advanceTimersByTimeAsync(0);
  const request = h.sendMessage.mock.calls.find(([m]) => m.type === "STREAM_INLINE_AI")[0];
  h.runtime({ type: "INLINE_AI_START", requestId: request.requestId });
  h.action("dismiss");
  h.runtime({ type: "INLINE_AI_DONE", requestId: request.requestId, rawText: "Late answer" });
  expect(h.latest().view.collapsed).toBe(true);
  h.action("reopen");
  expect(h.latest().view.title).toBe("How do you want to start?");
});

it("preserves an approach draft when collapsed", async () => {
  const h = await boot();
  h.action("expand_plan");
  h.action("dismiss", "Use a heap");
  h.action("reopen");
  expect(h.latest().view.inputValue).toBe("Use a heap");
});

it("ignores a stale request acknowledgement after hide and reopen", async () => {
  const h = await boot();
  const original = h.sendMessage.getMockImplementation();
  let acknowledge;
  h.sendMessage.mockImplementation((message, callback) => {
    if (message.type === "STREAM_INLINE_AI") acknowledge = callback;
    else original(message, callback);
  });
  h.action("hint");
  await vi.advanceTimersByTimeAsync(0);
  h.action("dismiss");
  h.action("reopen");
  acknowledge({ ok: false, error: "Stale failure" });
  await vi.advanceTimersByTimeAsync(0);
  expect(h.latest().view.title).toBe("How do you want to start?");
});
