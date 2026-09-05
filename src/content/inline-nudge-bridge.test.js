import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridgeSource = readFileSync(join(process.cwd(), "src/content/inline-nudge-bridge.js"), "utf8");
const renderMessage = {
  source: "CODING_HINT_COACH_INLINE_RENDER",
  token: "render-token",
  lineNumber: Number.MAX_SAFE_INTEGER,
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
    const model = { getLineCount: () => 3, getLineMaxColumn: () => 22, getLineContent: () => "    return answer" };
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
    expect(ghost.style.top).toBe("60px");
    expect(editor.getScrolledVisiblePosition).toHaveBeenCalledWith({ lineNumber: 3, column: 5 });
    expect(controls).not.toBeNull();

    controls.querySelector("button").click();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      source: "CODING_HINT_COACH_INLINE_ACTION",
      token: "render-token",
      action: "hint"
    }), "*");
  });

  it("mounts on live-style Monaco DOM when the Monaco global is private", () => {
    const container = createContainer("monaco-editor");
    const textarea = document.createElement("textarea");
    textarea.value = "line one\nline two\nline three\nline four";
    container.append(textarea, createRenderedLines("view-lines", "view-line", 4));

    runBridge();
    dispatchWindowMessage(renderMessage);

    const ghost = container.querySelector(".codecoach-inline-ghost-overlay");
    expect(ghost).not.toBeNull();
    expect(ghost.textContent).toContain("dp[i - coin]");
    expect(ghost.style.top).toBe("80px");
  });

  it.each(["monaco-editor", "CodeMirror"])("keeps the reopen control at the code indentation in %s", (className) => {
    const container = createContainer(className);
    if (className === "monaco-editor") {
      window.monaco = { editor: { getEditors: () => [createMonacoEditor(container, {
        getLineCount: () => 3, getLineContent: () => "    return answer"
      })] } };
    } else {
      container.CodeMirror = {
        getValue: () => "    return answer", getCursor: () => ({ line: 2, ch: 4 }),
        getLine: () => "    return answer", lineCount: () => 3,
        getWrapperElement: () => container, cursorCoords: () => ({ left: 120, top: 42, bottom: 60 }),
        on: vi.fn(), off: vi.fn()
      };
    }
    const postMessage = vi.spyOn(window, "postMessage");
    runBridge();
    dispatchWindowMessage({ ...renderMessage, view: { collapsed: true, primaryAction: "reopen", primaryLabel: "Show coach" } });
    const ghost = container.querySelector(".codecoach-inline-ghost-overlay");
    const controls = container.querySelector(".codecoach-inline-controls");
    expect(ghost.hidden).toBe(true);
    expect(ghost.textContent).toBe("");
    expect(controls.style.left).toBe("120px");
    expect(controls.style.top).toBe("60px");
    controls.querySelector("button").click();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ action: "reopen", token: "render-token" }), "*");
  });

  it("mounts the same visible overlay for CodeMirror", () => {
    const wrapper = createContainer("CodeMirror", { left: 40, top: 60, width: 500, height: 300 });
    wrapper.CodeMirror = {
      getValue: () => "code",
      getCursor: () => ({ line: 2, ch: 4 }),
      getLine: () => "    return value",
      lineCount: () => 3,
      hasFocus: () => true,
      getWrapperElement: () => wrapper,
      cursorCoords: vi.fn(() => ({ left: 130, top: 100, bottom: 118 })),
      on: vi.fn(),
      off: vi.fn()
    };

    runBridge();
    dispatchWindowMessage(renderMessage);

    const ghost = wrapper.querySelector(".codecoach-inline-ghost-overlay");
    expect(ghost).not.toBeNull();
    expect(ghost.style.left).toBe("90px");
    expect(ghost.style.top).toBe("58px");
    expect(wrapper.CodeMirror.cursorCoords).toHaveBeenCalledWith({ line: 2, ch: 4 }, "page");
    const controls = wrapper.querySelector(".codecoach-inline-controls");
    expect(controls).not.toBeNull();
    expect(getComputedStyle(controls).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(controls).padding).toBe("0px");

    dispatchWindowMessage({ source: "CODING_HINT_COACH_INLINE_HIDE" });
    expect(wrapper.querySelector(".codecoach-inline-ghost-overlay")).toBeNull();
    expect(wrapper.querySelector(".codecoach-inline-controls")).toBeNull();
  });

  it("mounts on live-style CodeMirror DOM when its instance is private", () => {
    const wrapper = createContainer("CodeMirror");
    wrapper.append(createRenderedLines("CodeMirror-code", "CodeMirror-line", 4));

    runBridge();
    dispatchWindowMessage(renderMessage);

    const ghost = wrapper.querySelector(".codecoach-inline-ghost-overlay");
    expect(ghost).not.toBeNull();
    expect(ghost.style.top).toBe("80px");
    expect(wrapper.querySelector(".codecoach-inline-controls")).not.toBeNull();
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

  it("places actions below a wrapped answer and recomputes on resize", () => {
    const container = createContainer("monaco-editor");
    window.monaco = { editor: { getEditors: () => [createMonacoEditor(container, {
      getLineCount: () => 3, getLineContent: () => "    return answer"
    })] } };
    runBridge();
    dispatchWindowMessage(renderMessage);
    const ghost = container.querySelector(".codecoach-inline-ghost-overlay");
    const controls = container.querySelector(".codecoach-inline-controls");
    ghost.getBoundingClientRect = () => ({ height: 96 });
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(20);
    expect(parseFloat(controls.style.top)).toBe(parseFloat(ghost.style.top) + 102);
    expect(ghost.style.maxWidth).toBe("368px");
    ghost.getBoundingClientRect = () => ({ height: 144 });
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(20);
    expect(parseFloat(controls.style.top)).toBe(parseFloat(ghost.style.top) + 150);
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
    getScrolledVisiblePosition: vi.fn(() => ({ left: 120, top: 42, height: 18 })),
    hasTextFocus: () => true,
    onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
    onDidFocusEditorText: vi.fn(() => ({ dispose: vi.fn() })),
    onDidBlurEditorText: vi.fn(() => ({ dispose: vi.fn() })),
    onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
    onDidLayoutChange: vi.fn(() => ({ dispose: vi.fn() }))
  };
}

function createRenderedLines(wrapperClass, lineClass, count) {
  const wrapper = document.createElement("div");
  wrapper.className = wrapperClass;
  for (let index = 0; index < count; index += 1) {
    const line = document.createElement("div");
    line.className = lineClass;
    line.textContent = `line ${index + 1}`;
    line.getBoundingClientRect = () => ({
      left: 50,
      top: index * 20,
      width: 120,
      height: 20,
      right: 170,
      bottom: (index + 1) * 20
    });
    wrapper.appendChild(line);
  }
  return wrapper;
}

function runBridge() {
  Function(bridgeSource)();
}

function dispatchWindowMessage(data) {
  window.dispatchEvent(new MessageEvent("message", { data, source: window }));
}
