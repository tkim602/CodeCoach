// Page-world bridge for editor-local CodeCoach nudges.
// Uses visible DOM overlays anchored to editor coordinates and never mutates source code.
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
  let resizeObserver = null;
  let currentToken = "";
  let activeLine = 1;
  let ghostHost = null;
  let controlsHost = null;
  let syncFrame = 0;
  let lastChangeAt = 0;
  let focused = false;
  let cursorLine = 1;

  installStyles();

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .codecoach-inline-ghost-overlay {
        position: absolute;
        z-index: 2147483000;
        max-width: calc(100% - 24px);
        color: var(--vscode-editorGhostText-foreground, rgba(143, 148, 160, .92));
        font: italic 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        white-space: pre-wrap;
        pointer-events: none;
        user-select: none;
      }
      .codecoach-inline-controls {
        position: absolute;
        z-index: 2147483001;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        max-width: calc(100% - 24px);
        padding: 0;
        background: transparent;
        color: var(--vscode-editorGhostText-foreground, rgba(188, 191, 201, .92));
        font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
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
        color: #34363d;
      }
      .monaco-editor.vs .codecoach-inline-controls button:first-of-type,
      .monaco-editor.hc-light .codecoach-inline-controls button:first-of-type,
      .CodeMirror.CodeMirror-light .codecoach-inline-controls button:first-of-type { color: ${ACCENT}; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function disposeSubscriptions() {
    for (const dispose of subscriptions) {
      try {
        if (typeof dispose === "function") dispose();
        else dispose?.dispose?.();
      } catch {}
    }
    subscriptions = [];
    resizeObserver?.disconnect?.();
    resizeObserver = null;
  }

  function subscribeEvent(target, eventName, handler) {
    target?.on?.(eventName, handler);
    subscriptions.push(() => target?.off?.(eventName, handler));
  }

  function registerEditor(nextEditor, type) {
    if (!nextEditor || (editorRef === nextEditor && editorType === type)) return;
    clearPresentation();
    disposeSubscriptions();
    editorRef = nextEditor;
    editorType = type;
    lastChangeAt = Date.now();
    focused = editorHasFocus();
    cursorLine = readCursorLine();

    if (type === "monaco") {
      subscriptions.push(nextEditor.onDidChangeModelContent?.(markChanged));
      subscriptions.push(nextEditor.onDidChangeCursorPosition?.((event) => {
        cursorLine = Math.max(1, Number(event?.position?.lineNumber) || 1);
        postActivity();
        scheduleSync();
      }));
      subscriptions.push(nextEditor.onDidFocusEditorText?.(() => { focused = true; postActivity(); }));
      subscriptions.push(nextEditor.onDidBlurEditorText?.(() => { focused = false; postActivity(); }));
      subscriptions.push(nextEditor.onDidScrollChange?.(scheduleSync));
      subscriptions.push(nextEditor.onDidLayoutChange?.(scheduleSync));
    } else if (type === "codemirror") {
      subscribeEvent(nextEditor, "change", markChanged);
      subscribeEvent(nextEditor, "cursorActivity", () => { cursorLine = readCursorLine(); postActivity(); scheduleSync(); });
      subscribeEvent(nextEditor, "focus", () => { focused = true; postActivity(); });
      subscribeEvent(nextEditor, "blur", () => { focused = false; postActivity(); });
      subscribeEvent(nextEditor, "scroll", scheduleSync);
      subscribeEvent(nextEditor, "refresh", scheduleSync);
    } else if (type === "ace") {
      subscribeEvent(nextEditor.session, "change", markChanged);
      subscribeEvent(nextEditor.selection, "changeCursor", () => { cursorLine = readCursorLine(); postActivity(); scheduleSync(); });
      subscribeEvent(nextEditor, "focus", () => { focused = true; postActivity(); });
      subscribeEvent(nextEditor, "blur", () => { focused = false; postActivity(); });
      subscribeEvent(nextEditor.renderer, "afterRender", scheduleSync);
      subscribeEvent(nextEditor.renderer, "scroll", scheduleSync);
    } else if (type === "monaco-dom" || type === "codemirror-dom") {
      const onActivity = () => {
        cursorLine = readCursorLine();
        focused = editorHasFocus();
        postActivity();
        scheduleSync();
      };
      for (const eventName of ["input", "keyup", "click", "focusin", "focusout", "scroll"]) {
        nextEditor.addEventListener(eventName, onActivity);
        subscriptions.push(() => nextEditor.removeEventListener(eventName, onActivity));
      }
    }

    const container = editorContainer();
    if (container && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(scheduleSync);
      resizeObserver.observe(container);
    }
    postActivity();
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

    const monacoNode = visibleEditorNode(".monaco-editor");
    if (monacoNode) return registerEditor(monacoNode, "monaco-dom");

    try {
      const cmNode = visibleEditorNode(".CodeMirror");
      const cm = cmNode?.CodeMirror;
      if (cm?.getValue) return registerEditor(cm, "codemirror");
      if (cmNode) return registerEditor(cmNode, "codemirror-dom");
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
      if (editorType === "monaco-dom" || editorType === "codemirror-dom") return editorRef?.contains?.(document.activeElement) || false;
    } catch {}
    return false;
  }

  function readCursorLine() {
    try {
      if (editorType === "monaco") return Math.max(1, Number(editorRef?.getPosition?.()?.lineNumber) || 1);
      if (editorType === "codemirror") return Math.max(1, (Number(editorRef?.getCursor?.()?.line) || 0) + 1);
      if (editorType === "ace") return Math.max(1, (Number(editorRef?.getCursorPosition?.()?.row) || 0) + 1);
      if (editorType === "monaco-dom" || editorType === "codemirror-dom") return domCursorLine();
    } catch {}
    return 1;
  }

  function readLineCount() {
    try {
      if (editorType === "monaco") return Number(editorRef?.getModel?.()?.getLineCount?.()) || 1;
      if (editorType === "codemirror") return Number(editorRef?.lineCount?.()) || 1;
      if (editorType === "ace") return Number(editorRef?.session?.getLength?.()) || 1;
      if (editorType === "monaco-dom") {
        const value = editorRef?.querySelector?.("textarea")?.value;
        if (value) return String(value).split("\n").length;
      }
      if (editorType === "monaco-dom" || editorType === "codemirror-dom") return domLineElements().length || 1;
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
    if (view?.collapsed) return "";
    return [view?.tone === "success" ? "OK" : "CodeCoach", view?.title, view?.body]
      .filter(Boolean)
      .join(": ")
      .replace(/[ \t]+/g, " ")
      .trim();
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
      input.value = view.inputValue || "";
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

    for (const [action, label] of actions) {
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
    }

    if (view?.trialText) {
      const trial = document.createElement("span");
      trial.className = "codecoach-inline-trial";
      trial.textContent = view.trialText;
      root.appendChild(trial);
    }

    if (input) setTimeout(() => {
      try { input.focus({ preventScroll: true }); } catch { input.focus(); }
    }, 0);
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
    activeLine = Math.max(1, Number(payload?.lineNumber) || readCursorLine());
    mountVisiblePresentation(payload?.view || {});
  }

  function mountVisiblePresentation(view) {
    const container = editorContainer();
    if (!container) return;

    // Keep the nudge as a real DOM node. Monaco injected-text decorations can report
    // success while remaining invisible in host wrappers, which caused live LeetCode
    // nudges to disappear after PR #7.
    ghostHost = document.createElement("span");
    ghostHost.className = "codecoach-inline-ghost-overlay";
    ghostHost.dataset.codecoachInlineUi = "1";
    ghostHost.textContent = ghostText(view);
    ghostHost.hidden = Boolean(view.collapsed);
    container.appendChild(ghostHost);

    controlsHost = createControls(view);
    if (controlsHost) container.appendChild(controlsHost);
    positionInline();
    scheduleSync();
  }

  function scheduleSync() {
    if (!ghostHost || syncFrame) return;
    const run = () => {
      syncFrame = 0;
      positionInline();
    };
    syncFrame = window.requestAnimationFrame?.(run) || window.setTimeout(run, 0);
  }

  function positionInline() {
    const container = editorContainer();
    if (!container || !ghostHost) return;
    const rect = container.getBoundingClientRect();
    const afterLastLine = activeLine === Number.MAX_SAFE_INTEGER;
    const coordinates = editorCoordinates(Math.min(readLineCount(), activeLine), afterLastLine);
    if (!coordinates) return;

    const left = Math.max(8, Math.min(coordinates.left, Math.max(8, rect.width - 180)));
    const lineTop = Math.max(2, Math.min(coordinates.top + (afterLastLine ? coordinates.height : 0), Math.max(2, rect.height - 24)));
    ghostHost.style.left = `${left}px`;
    ghostHost.style.top = `${lineTop}px`;
    ghostHost.style.maxWidth = `${Math.max(1, rect.width - left - 12)}px`;

    if (controlsHost) {
      controlsHost.style.left = `${left}px`;
      controlsHost.style.maxWidth = ghostHost.style.maxWidth;
      const controlsHeight = controlsHost.getBoundingClientRect().height;
      ghostHost.style.maxHeight = `${Math.max(18, rect.height - lineTop - controlsHeight - 12)}px`;
      ghostHost.style.overflowY = "auto";
      ghostHost.style.pointerEvents = "auto";
      const answerHeight = ghostHost.hidden ? 0 : ghostHost.getBoundingClientRect().height || coordinates.height;
      controlsHost.style.top = `${lineTop + answerHeight + (ghostHost.hidden ? 0 : 6)}px`;
    }
  }

  function editorCoordinates(line, atIndent = false) {
    try {
      if (editorType === "monaco") {
        const column = atIndent ? leadingIndent(editorRef.getModel?.()?.getLineContent?.(line)) + 1 : lineEndColumn(line);
        const position = editorRef.getScrolledVisiblePosition?.({ lineNumber: line, column });
        if (position) return { left: position.left, top: position.top, height: position.height || 18 };
      }
      if (editorType === "codemirror") {
        const ch = atIndent ? leadingIndent(editorRef.getLine?.(line - 1)) : lineEndColumn(line);
        const position = editorRef.cursorCoords?.({ line: line - 1, ch }, "page");
        const rect = editorContainer()?.getBoundingClientRect?.();
        if (position && rect) return {
          left: position.left - window.scrollX - rect.left,
          top: position.top - window.scrollY - rect.top,
          height: Math.max(16, position.bottom - position.top)
        };
      }
      if (editorType === "ace") {
        const column = atIndent ? leadingIndent(editorRef.session?.getLine?.(line - 1)) : lineEndColumn(line);
        const screen = editorRef.renderer?.textToScreenCoordinates?.(line - 1, column);
        const rect = editorContainer()?.getBoundingClientRect?.();
        if (screen && rect) {
          return {
            left: screen.pageX - window.scrollX - rect.left,
            top: screen.pageY - window.scrollY - rect.top,
            height: Number(editorRef.renderer?.lineHeight) || 18
          };
        }
      }
      if (editorType === "monaco-dom" || editorType === "codemirror-dom") return domLineCoordinates(line, atIndent);
    } catch {}
    return { left: 12, top: 24, height: 18 };
  }

  function editorContainer() {
    try {
      if (editorType === "monaco") return editorRef?.getContainerDomNode?.();
      if (editorType === "codemirror") return editorRef?.getWrapperElement?.();
      if (editorType === "ace") return editorRef?.container;
      if (editorType === "monaco-dom" || editorType === "codemirror-dom") return editorRef;
    } catch {}
    return document.querySelector(".monaco-editor,.CodeMirror,.ace_editor");
  }

  function visibleEditorNode(selector) {
    if (typeof document === "undefined") return null;
    const nodes = Array.from(document.querySelectorAll(selector));
    return nodes.find((node) => {
      const rect = node.getBoundingClientRect?.();
      return rect && rect.width > 0 && rect.height > 0;
    }) || null;
  }

  function domLineElements() {
    if (!editorRef?.querySelectorAll) return [];
    const selector = editorType === "monaco-dom"
      ? ".view-lines .view-line"
      : ".CodeMirror-code .CodeMirror-line, .CodeMirror-code pre";
    return Array.from(editorRef.querySelectorAll(selector));
  }

  function domCursorLine() {
    const lines = domLineElements();
    const cursorSelector = editorType === "monaco-dom" ? ".cursor" : ".CodeMirror-cursor";
    const cursor = editorRef?.querySelector?.(cursorSelector);
    const cursorRect = cursor?.getBoundingClientRect?.();
    if (!lines.length || !cursorRect) return 1;
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    lines.forEach((line, index) => {
      const rect = line.getBoundingClientRect();
      const distance = Math.abs(rect.top - cursorRect.top);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    return nearestIndex + 1;
  }

  function domLineCoordinates(lineNumber, atIndent = false) {
    const containerRect = editorRef?.getBoundingClientRect?.();
    const lines = domLineElements();
    const line = lines[Math.max(0, Math.min(lines.length - 1, lineNumber - 1))];
    if (!containerRect || !line) return null;
    const lineRect = line.getBoundingClientRect();
    let textRight = atIndent ? lineRect.left : lineRect.right;
    try {
      const range = document.createRange();
      range.selectNodeContents(line);
      if (atIndent) setRangeEnd(range, line, leadingIndent(line.textContent));
      const textRect = range.getBoundingClientRect();
      if (textRect.width > 0) textRight = textRect.right;
    } catch {}
    return {
      left: Math.max(0, textRight - containerRect.left),
      top: Math.max(0, lineRect.top - containerRect.top),
      height: lineRect.height || 18
    };
  }

  function leadingIndent(text) {
    return String(text || "").match(/^\s*/)?.[0].length || 0;
  }

  function setRangeEnd(range, root, offset) {
    const walker = document.createTreeWalker(root, 4);
    let remaining = offset;
    let node = walker.nextNode();
    while (node) {
      if (remaining <= node.textContent.length) {
        range.setEnd(node, remaining);
        return;
      }
      remaining -= node.textContent.length;
      node = walker.nextNode();
    }
  }

  function clearPresentation() {
    if (syncFrame) {
      window.cancelAnimationFrame?.(syncFrame);
      window.clearTimeout(syncFrame);
      syncFrame = 0;
    }
    ghostHost?.remove?.();
    controlsHost?.remove?.();
    ghostHost = null;
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

  const observer = new MutationObserver(() => {
    discoverEditor();
    scheduleSync();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  [150, 500, 1200, 2500, 5000].forEach((delay) => setTimeout(discoverEditor, delay));
  setInterval(() => {
    discoverEditor();
    postActivity();
  }, 1200);
})();
