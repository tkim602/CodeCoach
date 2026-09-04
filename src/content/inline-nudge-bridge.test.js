import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridgeSource = readFileSync(join(process.cwd(), "src/content/inline-nudge-bridge.js"), "utf8");
const renderMessage = {
  source: "CODING_HINT_COACH_INLINE_RENDER",
  token: "render-token",
  lineNumber: 3,
  view: {
    title: "What does dp[i - coin] represent?",
    primaryAction: "hint",
    primaryLabel: "Hint",
    secondaryAction: "dismiss",
    secondaryLabel: "Dismiss"
  }
};

describe("inline nudge page bridge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    delete window.__codeCoachInlineNudgeBridge;
    delete window.monaco;
    delete window.ace;
    window.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("mounts a visible Monaco overlay and interactive controls", () => {
    const container = createContainer("monaco-editor");
    const model = { getLineCount: () => 8, getLineMaxColumn: () => 22 };
    const editor = createMonacoEditor(container, model);
    window.monaco = { editor: { getEditors: () => [editor] } };
    const postMessage = vi.spyOn(window, "postMessage");

    runBridge();
    dispatchWindowMessage(renderMessage);

    const ghost = container.querySelector(".codecoach-inline-ghost-overlay");
    const controls = container.querySelector(".codecoach-inline-controls");
    expect(ghost).not.toBeNull();
    expect(ghost.textContent).toContain("dp[i - coin]");
    expect(ghost.style.left).toBe("120px");
    expect(controls).not.toBeNull();

    controls.querySelector("button").click();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      source: "CODING_HINT_COACH_INLINE_ACTION",
      token: "render-token",
      action: "hint"
    }), "*");
  });

  it("mounts the same visible overlay for CodeMirror", () => {
    const wrapper = createContainer("CodeMirror");
    wrapper.CodeMirror = {
      getValue: () => "code",
      getCursor: () => ({ line: 2, ch: 4 }),
      getLine: () => "return value",
      lineCount: () => 6,
      hasFocus: () => true,
      getWrapperElement: () => wrapper,
      cursorCoords: () => ({ left: 90, top: 40, bottom: 58 }),
      on: vi.fn(),
      off: vi.fn()
    };

    runBridge();
    dispatchWindowMessage(renderMessage);

    const ghost = wrapper.querySelector(".codecoach-inline-ghost-overlay");
    expect(ghost).not.toBeNull();
    expect(ghost.style.left).toBe("90px");
    expect(wrapper.querySelector(".codecoach-inline-controls")).not.toBeNull();

    dispatchWindowMessage({ source: "CODING_HINT_COACH_INLINE_HIDE" });
    expect(wrapper.querySelector(".codecoach-inline-ghost-overlay")).toBeNull();
    expect(wrapper.querySelector(".codecoach-inline-controls")).toBeNull();
  });

  it("anchors an Ace overlay inside the editor and removes it when hidden", () => {
    const container = createContainer("ace_editor", { left: 40, top: 60, width: 600, height: 400 });
    const ace = {
      container,
      getCursorPosition: () => ({ row: 2, column: 4 }),
      isFocused: () => true,
      renderer: {
        textToScreenCoordinates: () => ({ pageX: 160, pageY: 210 }),
        lineHeight: 18,
        on: vi.fn(),
        off: vi.fn()
      },
      session: {
        getLength: () => 8,
        getLine: () => "return value",
        on: vi.fn(),
        off: vi.fn()
      },
      selection: { on: vi.fn(), off: vi.fn() },
      on: vi.fn(),
      off: vi.fn()
    };
    window.ace = { edit: () => ace };

    runBridge();
    dispatchWindowMessage(renderMessage);

    expect(container.querySelector(".codecoach-inline-ghost-overlay")).not.toBeNull();
    expect(container.querySelector(".codecoach-inline-controls")).not.toBeNull();

    dispatchWindowMessage({ source: "CODING_HINT_COACH_INLINE_HIDE" });
    expect(container.querySelector(".codecoach-inline-ghost-overlay")).toBeNull();
    expect(container.querySelector(".codecoach-inline-controls")).toBeNull();
  });

  it("keeps approach input keyboard events out of the host editor", () => {
    const container = createContainer("monaco-editor");
    const editorKeydown = vi.fn();
    container.addEventListener("keydown", editorKeydown);
    const model = { getLineCount: () => 8, getLineMaxColumn: () => 22 };
    window.monaco = { editor: { getEditors: () => [createMonacoEditor(container, model)] } };
    const postMessage = vi.spyOn(window, "postMessage");

    runBridge();
    dispatchWindowMessage({
      ...renderMessage,
      view: {
        title: "Share your approach",
        showInput: true,
        inputPlaceholder: "One sentence",
        primaryAction: "check_approach",
        primaryLabel: "Check"
      }
    });
    const input = container.querySelector("input");
    input.value = "  Use a heap  ";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(editorKeydown).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: "check_approach",
      value: "Use a heap"
    }), "*");
  });
});

function createContainer(className, rect = { left: 0, top: 0, width: 500, height: 300 }) {
  const container = document.createElement("div");
  container.className = className;
  container.getBoundingClientRect = () => ({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height
  });
  document.body.appendChild(container);
  return container;
}

function createMonacoEditor(container, model) {
  return {
    getModel: () => model,
    getPosition: () => ({ lineNumber: 3, column: 5 }),
    getContainerDomNode: () => container,
    getScrolledVisiblePosition: () => ({ left: 120, top: 42, height: 18 }),
    hasTextFocus: () => true,
    onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
    onDidFocusEditorText: vi.fn(() => ({ dispose: vi.fn() })),
    onDidBlurEditorText: vi.fn(() => ({ dispose: vi.fn() })),
    onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
    onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() }))
  };
}

function runBridge() {
  Function(bridgeSource)();
}

function dispatchWindowMessage(data) {
  window.dispatchEvent(new MessageEvent("message", { data, source: window }));
}
