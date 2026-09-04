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

  it("uses Monaco injected text without adding a view zone", () => {
    const container = document.createElement("div");
    container.className = "monaco-editor";
    document.body.appendChild(container);
    const model = {
      getLineCount: () => 8,
      getLineMaxColumn: () => 22,
      deltaDecorations: vi.fn(() => ["decoration-1"])
    };
    const editor = createMonacoEditor(container, model);
    window.monaco = {
      Range: class Range { constructor(...values) { this.values = values; } },
      editor: { getEditors: () => [editor] }
    };
    const postMessage = vi.spyOn(window, "postMessage");

    runBridge();
    dispatchWindowMessage(renderMessage);

    expect(model.deltaDecorations).toHaveBeenCalledWith([], [expect.objectContaining({
      options: expect.objectContaining({
        after: expect.objectContaining({
          content: expect.stringContaining("dp[i - coin]"),
          inlineClassName: "codecoach-inline-ghost"
        })
      })
    })]);
    expect(editor.changeViewZones).not.toHaveBeenCalled();
    const controls = container.querySelector(".codecoach-inline-controls");
    expect(controls).not.toBeNull();

    controls.querySelector("button").click();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      source: "CODING_HINT_COACH_INLINE_ACTION",
      token: "render-token",
      action: "hint"
    }), "*");
  });

  it("uses a CodeMirror bookmark and clears it when hidden", () => {
    const wrapper = document.createElement("div");
    wrapper.className = "CodeMirror";
    document.body.appendChild(wrapper);
    const marker = { clear: vi.fn() };
    const cm = {
      getValue: () => "code",
      getCursor: () => ({ line: 2, ch: 4 }),
      getLine: () => "return value",
      lineCount: () => 6,
      hasFocus: () => true,
      getWrapperElement: () => wrapper,
      setBookmark: vi.fn(() => marker),
      on: vi.fn(),
      off: vi.fn()
    };
    wrapper.CodeMirror = cm;

    runBridge();
    dispatchWindowMessage(renderMessage);

    expect(cm.setBookmark).toHaveBeenCalledWith({ line: 2, ch: 12 }, expect.objectContaining({
      widget: expect.any(HTMLElement),
      insertLeft: false
    }));
    expect(wrapper.querySelector(".codecoach-inline-controls")).not.toBeNull();

    const clearsBeforeHide = marker.clear.mock.calls.length;
    dispatchWindowMessage({ source: "CODING_HINT_COACH_INLINE_HIDE" });
    expect(marker.clear.mock.calls.length).toBeGreaterThan(clearsBeforeHide);
    expect(wrapper.querySelector(".codecoach-inline-controls")).toBeNull();
  });

  it("falls back to a coordinate overlay when CodeMirror has no bookmark API", () => {
    const wrapper = document.createElement("div");
    wrapper.className = "CodeMirror";
    wrapper.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 300, width: 500, height: 300 });
    document.body.appendChild(wrapper);
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

    expect(wrapper.querySelector(".codecoach-inline-ghost-overlay")).not.toBeNull();
  });

  it("anchors an Ace overlay inside the editor and removes it when hidden", () => {
    const container = document.createElement("div");
    container.className = "ace_editor";
    container.getBoundingClientRect = () => ({ left: 40, top: 60, right: 640, bottom: 460, width: 600, height: 400 });
    document.body.appendChild(container);
    const ace = {
      container,
      getCursorPosition: () => ({ row: 2, column: 4 }),
      isFocused: () => true,
      renderer: {
        textToScreenCoordinates: () => ({ pageX: 160, pageY: 210 }),
        on: vi.fn(),
        off: vi.fn()
      },
      session: { getLength: () => 8, on: vi.fn(), off: vi.fn() },
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
    const container = document.createElement("div");
    container.className = "monaco-editor";
    document.body.appendChild(container);
    const editorKeydown = vi.fn();
    container.addEventListener("keydown", editorKeydown);
    const model = {
      getLineCount: () => 8,
      getLineMaxColumn: () => 22,
      deltaDecorations: vi.fn(() => ["decoration-1"])
    };
    window.monaco = {
      Range: class Range { constructor(...values) { this.values = values; } },
      editor: { getEditors: () => [createMonacoEditor(container, model)] }
    };
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

function createMonacoEditor(container, model) {
  return {
    getModel: () => model,
    getPosition: () => ({ lineNumber: 3, column: 5 }),
    getContainerDomNode: () => container,
    getScrolledVisiblePosition: () => ({ left: 120, top: 42, height: 18 }),
    hasTextFocus: () => true,
    changeViewZones: vi.fn(),
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
