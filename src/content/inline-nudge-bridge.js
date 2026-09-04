// Page-world bridge for editor-native CodeCoach nudges.
// Reads public editor APIs and never changes the user's code model.
(function () {
  if (window.__codeCoachInlineNudgeBridge) return;
  window.__codeCoachInlineNudgeBridge = true;

  const SOURCE_STATE = "CODING_HINT_COACH_EDITOR_ACTIVITY";
  const SOURCE_RENDER = "CODING_HINT_COACH_INLINE_RENDER";
  const SOURCE_HIDE = "CODING_HINT_COACH_INLINE_HIDE";
  const SOURCE_ACTION = "CODING_HINT_COACH_INLINE_ACTION";
  const STYLE_ID = "codecoach-inline-ghost-style";
  const ACCENT = "#6128ff";

  let editorRef = null;
  let editorType = "";
  let subscriptions = [];
  let lastChangeAt = 0;
  let focused = false;
  let cursorLine = 1;
  let currentToken = "";
  let activeLine = 1;
  let presentation = null;
  let controlsHost = null;
  let resizeObserver = null;
  let syncFrame = 0;

  installStyles();

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .monaco-editor .codecoach-inline-ghost,
      .CodeMirror .codecoach-inline-ghost,
      .ace_editor .codecoach-inline-ghost,
      .codecoach-inline-ghost-overlay {
        color: var(--vscode-editorGhostText-foreground, rgba(143, 148, 160, .88));
        font-style: italic;
        opacity: .92;
        white-space: pre-wrap;
      }
      .codecoach-inline-ghost-overlay {
        position: absolute;
        z-index: 7;
        max-width: calc(100% - 24px);
        pointer-events: none;
        font: italic 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .codecoach-inline-controls {
        position: absolute;
        z-index: 8;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        max-width: calc(100% - 24px);
        padding: 3px 5px;
        border-radius: 5px;
        background: rgba(24, 25, 29, .94);
        color: rgba(238, 239, 243, .92);
        font: 11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: auto;
      }
      .codecoach-inline-controls button {
        appearance: none;
        border: 0;
        padding: 2px 1px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
      }
      .codecoach-inline-controls button:first-of-type { color: #c8baff; }
      .codecoach-inline-controls button:hover { text-decoration: underline; text-underline-offset: 2px; }
      .codecoach-inline-controls button:focus-visible,
      .codecoach-inline-controls input:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
      .codecoach-inline-controls input {
        width: min(300px, calc(100% - 90px));
        min-width: 150px;
        border: 1px solid rgba(224, 226, 234, .34);
        border-radius: 4px;
        padding: 4px 6px;
        background: rgba(255, 255, 255, .08);
        color: inherit;
        font: inherit;
      }
      .codecoach-inline-trial { opacity: .62; font-size: 10px; }
      .monaco-editor.vs .codecoach-inline-controls,
      .monaco-editor.hc-light .codecoach-inline-controls,
      .CodeMirror.CodeMirror-light .codecoach-inline-controls {
        background: rgba(250, 250, 252, .96);
        color: #34363d;
        border: 1px solid rgba(36, 38, 45, .14);
      }
    `;
    document.head.appendChild(style);
  }

  function disposeSubscriptions() {
    subscriptions.forEach((dispose) => {
      try {
        if (typeof dispose === "function") dispose();
        else dispose?.dispose?.();
      } catch {}
    });
    subscriptions = [];
    resizeObserver?.disconnect?.();
    resizeObserver = null;
  }

  function registerEditor(nextEditor, type) {
    if (!nextEditor || (editorRef === nextEditor && editorType === type)) return;
    hideInline();
    disposeSubscriptions();
    editorRef = nextEditor;
    editorType = type;
    lastChangeAt = Date.now();
    focused = editorHasFocus();
    cursorLine = readCursorLine();

    if (type === "monaco") {
      subscriptions.push(nextEditor.onDidChangeModelContent?.(() => markChanged()));
      subscriptions.push(nextEditor.onDidChangeCursorPosition?.((event) => {
        cursorLine = Math.max(1, Number(event?.position?.lineNumber) || 1);
        postActivity();
      }));
      subscriptions.push(nextEditor.onDidFocusEditorText?.(() => { focused = true; postActivity(); }));
      subscriptions.push(nextEditor.onDidBlurEditorText?.(() => { focused = false; postActivity(); }));
      subscriptions.push(nextEditor.onDidScrollChange?.(scheduleSync));
      subscriptions.push(nextEditor.onDidLayoutChange?.(scheduleSync));
    } else if (type === "codemirror") {
      subscribeEvent(nextEditor, "change", markChanged);
      subscribeEvent(nextEditor, "cursorActivity", () => { cursorLine = readCursorLine(); postActivity(); });
      subscribeEvent(nextEditor, "focus", () => { focused = true; postActivity(); });
      subscribeEvent(nextEditor, "blur", () => { focused = false; postActivity(); });
      subscribeEvent(nextEditor, "scroll", scheduleSync);
      subscribeEvent(nextEditor, "refresh", scheduleSync);
    } else if (type === "ace") {
      subscribeEvent(nextEditor.session, "change", markChanged);
      subscribeEvent(nextEditor.selection, "changeCursor", () => { cursorLine = readCursorLine(); postActivity(); });
      subscribeEvent(nextEditor, "focus", () => { focused = true; postActivity(); });
      subscribeEvent(nextEditor, "blur", () => { focused = false; postActivity(); });
      subscribeEvent(nextEditor.renderer, "afterRender", scheduleSync);
      subscribeEvent(nextEditor.renderer, "scroll", scheduleSync);
    }

    const container = editorContainer();
    if (container && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(scheduleSync);
      resizeObserver.observe(container);
    }
    postActivity();
  }

  function subscribeEvent(target, eventName, handler) {
    target?.on?.(eventName, handler);
    subscriptions.push(() => target?.off?.(eventName, handler));
  }

  function markChanged() {
    lastChangeAt = Date.now();
    cursorLine = readCursorLine();
    focused = editorHasFocus();
    postActivity();
    scheduleSync();
  }

  function discoverEditor() {
    try {
      const editors = window.monaco?.editor?.getEditors?.() || [];
      const usable = editors.find((editor) => editor?.hasTextFocus?.()) || editors.find((editor) => editor?.getModel?.());
      if (usable) return registerEditor(usable, "monaco");
    } catch {}

    try {
      const cmNode = document.querySelector(".CodeMirror");
      const cm = cmNode?.CodeMirror;
      if (cm?.getValue) return registerEditor(cm, "codemirror");
    } catch {}

    try {
      const aceNode = document.querySelector(".ace_editor");
      if (aceNode && window.ace?.edit) {
        const ace = window.ace.edit(aceNode);
        if (ace) return registerEditor(ace, "ace");
      }
    } catch {}
  }

  function editorHasFocus() {
    try {
      if (editorType === "monaco") return Boolean(editorRef?.hasTextFocus?.());
      if (editorType === "codemirror") return Boolean(editorRef?.hasFocus?.());
      if (editorType === "ace") return Boolean(editorRef?.isFocused?.());
    } catch {}
    return false;
  }

  function readCursorLine() {
    try {
      if (editorType === "monaco") return Math.max(1, Number(editorRef?.getPosition?.()?.lineNumber) || 1);
      if (editorType === "codemirror") return Math.max(1, Number(editorRef?.getCursor?.()?.line) + 1 || 1);
      if (editorType === "ace") return Math.max(1, Number(editorRef?.getCursorPosition?.()?.row) + 1 || 1);
    } catch {}
    return 1;
  }

  function readLineCount() {
    try {
      if (editorType === "monaco") return Number(editorRef?.getModel?.()?.getLineCount?.()) || 1;
      if (editorType === "codemirror") return Number(editorRef?.lineCount?.()) || 1;
      if (editorType === "ace") return Number(editorRef?.session?.getLength?.()) || 1;
    } catch {}
    return 1;
  }

  function lineEndColumn(line) {
    try {
      if (editorType === "monaco") return Number(editorRef?.getModel?.()?.getLineMaxColumn?.(line)) || 1;
      if (editorType === "codemirror") return String(editorRef?.getLine?.(line - 1) || "").length;
      if (editorType === "ace") return String(editorRef?.session?.getLine?.(line - 1) || "").length;
    } catch {}
    return 1;
  }

  function postActivity() {
    if (!editorRef) return;
    focused = editorHasFocus();
    cursorLine = readCursorLine();
    window.postMessage({
      source: SOURCE_STATE,
      editorType,
      focused,
      cursorLine,
      lineCount: readLineCount(),
      lastChangeAt
    }, "*");
  }

  function isolateInteractiveEvents(root) {
    const stop = (event) => event.stopPropagation();
    ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "keydown", "keyup", "keypress", "input", "change", "paste", "compositionstart", "compositionupdate", "compositionend"].forEach((type) => {
      root.addEventListener(type, stop);
    });
  }

  function ghostText(view) {
    return [view?.tone === "success" ? "OK" : "CodeCoach", view?.title, view?.body]
      .filter(Boolean)
      .join(": ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function createGhostNode(view, overlay = false) {
    const ghost = document.createElement("span");
    ghost.className = overlay ? "codecoach-inline-ghost-overlay" : "codecoach-inline-ghost";
    ghost.textContent = `  ${ghostText(view)}`;
    ghost.dataset.codecoachInlineUi = "1";
    return ghost;
  }

  function createControls(view) {
    const actions = [
      [view?.primaryAction, view?.primaryLabel],
      [view?.secondaryAction, view?.secondaryLabel],
      [view?.tertiaryAction, view?.tertiaryLabel]
    ].filter(([action, label]) => action && label);
    if (!actions.length && !view?.showInput && !view?.trialText) return null;

    const root = document.createElement("div");
    root.className = "codecoach-inline-controls";
    root.dataset.codecoachInlineUi = "1";
    isolateInteractiveEvents(root);

    let input = null;
    if (view?.showInput) {
      input = document.createElement("input");
      input.type = "text";
      input.placeholder = view.inputPlaceholder || "";
      input.dataset.inlineInput = "1";
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && view?.primaryAction) {
          event.preventDefault();
          emitAction(view.primaryAction, input.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          emitAction(view?.secondaryAction || "dismiss", "");
        }
      });
      root.appendChild(input);
    }

    actions.forEach(([action, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.action = action;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        emitAction(action, input?.value || "");
      });
      root.appendChild(button);
    });

    if (view?.trialText) {
      const trial = document.createElement("span");
      trial.className = "codecoach-inline-trial";
      trial.textContent = view.trialText;
      root.appendChild(trial);
    }

    if (input) setTimeout(() => input.focus({ preventScroll: true }), 0);
    return root;
  }

  function emitAction(action, value) {
    window.postMessage({
      source: SOURCE_ACTION,
      token: currentToken,
      action,
      value: String(value || "").trim()
    }, "*");
  }

  function showInline(payload) {
    discoverEditor();
    if (!editorRef) return;

    clearPresentation();
    currentToken = payload?.token || "";
    const view = payload?.view || {};
    activeLine = Math.min(readLineCount(), Math.max(1, Number(payload?.lineNumber) || readCursorLine()));

    if (editorType === "monaco" && showMonaco(view, activeLine)) return;
    if (editorType === "codemirror" && showCodeMirror(view, activeLine)) return;
    showCoordinateOverlay(view, activeLine);
  }

  function showMonaco(view, line) {
    try {
      const model = editorRef.getModel?.();
      const Range = window.monaco?.Range;
      if (!model?.deltaDecorations || !Range) return false;
      const column = lineEndColumn(line);
      const decoration = {
        range: new Range(line, column, line, column),
        options: {
          after: {
            content: `  ${ghostText(view)}`,
            inlineClassName: "codecoach-inline-ghost"
          },
          showIfCollapsed: true
        }
      };
      const decorationIds = model.deltaDecorations([], [decoration]) || [];
      presentation = { type: "monaco", model, decorationIds };
      mountControls(view);
      scheduleSync();
      return true;
    } catch {
      return false;
    }
  }

  function showCodeMirror(view, line) {
    if (!editorRef?.setBookmark) return false;
    try {
      const ghost = createGhostNode(view);
      const marker = editorRef.setBookmark(
        { line: line - 1, ch: lineEndColumn(line) },
        { widget: ghost, insertLeft: false, handleMouseEvents: false }
      );
      presentation = { type: "codemirror", marker, ghost };
      mountControls(view);
      scheduleSync();
      return true;
    } catch {
      return false;
    }
  }

  function showCoordinateOverlay(view, line) {
    const container = editorContainer();
    if (!container) return;
    const ghost = createGhostNode(view, true);
    container.appendChild(ghost);
    presentation = { type: "overlay", ghost };
    mountControls(view);
    positionInline();
  }

  function mountControls(view) {
    const container = editorContainer();
    if (!container) return;
    controlsHost = createControls(view);
    if (!controlsHost) return;
    container.appendChild(controlsHost);
    scheduleSync();
  }

  function scheduleSync() {
    if (!presentation || syncFrame) return;
    const run = () => {
      syncFrame = 0;
      positionInline();
    };
    syncFrame = window.requestAnimationFrame?.(run) || window.setTimeout(run, 0);
  }

  function positionInline() {
    const container = editorContainer();
    if (!container || !presentation) return;
    const containerRect = container.getBoundingClientRect();
    let left = 12;
    let top = 24;

    const ghostRect = presentation.ghost?.isConnected ? presentation.ghost.getBoundingClientRect() : null;
    if (ghostRect && (ghostRect.width || ghostRect.height)) {
      left = ghostRect.left - containerRect.left;
      top = ghostRect.bottom - containerRect.top + 3;
    } else {
      const coordinates = editorCoordinates(activeLine);
      if (coordinates) {
        left = coordinates.left;
        top = coordinates.top + coordinates.height + 3;
      }
    }

    left = Math.max(8, Math.min(left, Math.max(8, containerRect.width - 160)));
    top = Math.max(4, Math.min(top, Math.max(4, containerRect.height - 34)));

    if (presentation.type === "overlay" && presentation.ghost) {
      presentation.ghost.style.left = `${left}px`;
      presentation.ghost.style.top = `${Math.max(2, top - 21)}px`;
    }
    if (controlsHost) {
      controlsHost.style.left = `${left}px`;
      controlsHost.style.top = `${top}px`;
    }
  }

  function editorCoordinates(line) {
    try {
      if (editorType === "monaco") {
        const position = editorRef.getScrolledVisiblePosition?.({ lineNumber: line, column: lineEndColumn(line) });
        if (position) return { left: position.left, top: position.top, height: position.height || 18 };
      }
      if (editorType === "codemirror") {
        const position = editorRef.cursorCoords?.({ line: line - 1, ch: lineEndColumn(line) }, "local");
        if (position) return { left: position.left, top: position.top, height: Math.max(16, position.bottom - position.top) };
      }
      if (editorType === "ace") {
        const screen = editorRef.renderer?.textToScreenCoordinates?.(line - 1, lineEndColumn(line));
        const rect = editorContainer()?.getBoundingClientRect?.();
        if (screen && rect) {
          return {
            left: screen.pageX - window.scrollX - rect.left,
            top: screen.pageY - window.scrollY - rect.top,
            height: Number(editorRef.renderer?.lineHeight) || 18
          };
        }
      }
    } catch {}
    return null;
  }

  function editorContainer() {
    try {
      if (editorType === "monaco") return editorRef?.getContainerDomNode?.();
      if (editorType === "codemirror") return editorRef?.getWrapperElement?.();
      if (editorType === "ace") return editorRef?.container;
    } catch {}
    return document.querySelector(".monaco-editor,.CodeMirror,.ace_editor");
  }

  function clearPresentation() {
    if (syncFrame) {
      window.cancelAnimationFrame?.(syncFrame);
      window.clearTimeout(syncFrame);
      syncFrame = 0;
    }
    try {
      if (presentation?.type === "monaco") presentation.model.deltaDecorations?.(presentation.decorationIds || [], []);
      if (presentation?.type === "codemirror") presentation.marker?.clear?.();
    } catch {}
    presentation?.ghost?.remove?.();
    controlsHost?.remove?.();
    presentation = null;
    controlsHost = null;
  }

  function hideInline() {
    clearPresentation();
    currentToken = "";
  }

  window.addEventListener("resize", scheduleSync);
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source === SOURCE_RENDER) showInline(event.data);
    if (event.data?.source === SOURCE_HIDE) hideInline();
    if (event.data?.source === "CODING_HINT_COACH_REQUEST_EDITOR_ACTIVITY") {
      discoverEditor();
      postActivity();
    }
  });

  const observer = new MutationObserver(discoverEditor);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  [150, 500, 1200, 2500, 5000].forEach((delay) => setTimeout(discoverEditor, delay));
  setInterval(() => {
    discoverEditor();
    postActivity();
  }, 1200);
})();
