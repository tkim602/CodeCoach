// Page-world bridge for editor-native CodeCoach nudges.
// Reads only public editor APIs. It never changes the user's code model.
(function () {
  if (window.__codeCoachInlineNudgeBridge) return;
  window.__codeCoachInlineNudgeBridge = true;

  const SOURCE_STATE = "CODING_HINT_COACH_EDITOR_ACTIVITY";
  const SOURCE_RENDER = "CODING_HINT_COACH_INLINE_RENDER";
  const SOURCE_HIDE = "CODING_HINT_COACH_INLINE_HIDE";
  const SOURCE_ACTION = "CODING_HINT_COACH_INLINE_ACTION";
  const ACCENT = "#6128ff";

  let editorRef = null;
  let editorType = "";
  let subscriptions = [];
  let lastChangeAt = 0;
  let focused = false;
  let cursorLine = 1;
  let nativeHandle = null;
  let currentToken = "";
  let fallbackHost = null;

  function disposeSubscriptions() {
    subscriptions.forEach((dispose) => {
      try {
        if (typeof dispose === "function") dispose();
        else dispose?.dispose?.();
      } catch {}
    });
    subscriptions = [];
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
    } else if (type === "codemirror") {
      const onChange = () => markChanged();
      const onCursor = () => { cursorLine = readCursorLine(); postActivity(); };
      const onFocus = () => { focused = true; postActivity(); };
      const onBlur = () => { focused = false; postActivity(); };
      nextEditor.on?.("change", onChange);
      nextEditor.on?.("cursorActivity", onCursor);
      nextEditor.on?.("focus", onFocus);
      nextEditor.on?.("blur", onBlur);
      subscriptions.push(() => nextEditor.off?.("change", onChange));
      subscriptions.push(() => nextEditor.off?.("cursorActivity", onCursor));
      subscriptions.push(() => nextEditor.off?.("focus", onFocus));
      subscriptions.push(() => nextEditor.off?.("blur", onBlur));
    } else if (type === "ace") {
      const onChange = () => markChanged();
      const onCursor = () => { cursorLine = readCursorLine(); postActivity(); };
      const onFocus = () => { focused = true; postActivity(); };
      const onBlur = () => { focused = false; postActivity(); };
      nextEditor.session?.on?.("change", onChange);
      nextEditor.selection?.on?.("changeCursor", onCursor);
      nextEditor.on?.("focus", onFocus);
      nextEditor.on?.("blur", onBlur);
      subscriptions.push(() => nextEditor.session?.off?.("change", onChange));
      subscriptions.push(() => nextEditor.selection?.off?.("changeCursor", onCursor));
      subscriptions.push(() => nextEditor.off?.("focus", onFocus));
      subscriptions.push(() => nextEditor.off?.("blur", onBlur));
    }
    postActivity();
  }

  function markChanged() {
    lastChangeAt = Date.now();
    cursorLine = readCursorLine();
    focused = editorHasFocus();
    postActivity();
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

  function createNode(view) {
    const root = document.createElement("div");
    root.className = "codecoach-inline-native";
    root.style.cssText = [
      "box-sizing:border-box",
      "width:min(620px,calc(100% - 24px))",
      "margin:4px 12px 5px 8px",
      "font:12px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "color:inherit"
    ].join(";");

    const shell = document.createElement("div");
    shell.style.cssText = [
      "display:flex",
      "align-items:flex-start",
      "gap:8px",
      "min-height:28px",
      "padding:5px 8px",
      "border-left:2px solid " + ACCENT,
      "background:color-mix(in srgb," + ACCENT + " 7%,transparent)",
      "border-radius:0 7px 7px 0"
    ].join(";");

    const mark = document.createElement("span");
    mark.textContent = view?.tone === "success" ? "✓" : "✦";
    mark.style.cssText = `color:${ACCENT};font-weight:800;line-height:20px;flex:0 0 auto`;

    const content = document.createElement("div");
    content.style.cssText = "min-width:0;flex:1";
    const title = document.createElement("div");
    title.textContent = view?.title || "CodeCoach";
    title.style.cssText = "font-weight:650;line-height:20px;white-space:pre-wrap";
    content.appendChild(title);

    if (view?.body) {
      const body = document.createElement("div");
      body.textContent = view.body;
      body.style.cssText = "opacity:.78;margin-top:1px;white-space:pre-wrap;max-width:560px";
      content.appendChild(body);
    }

    if (view?.showInput) {
      const input = document.createElement("textarea");
      input.rows = 2;
      input.placeholder = view.inputPlaceholder || "";
      input.dataset.inlineInput = "1";
      input.style.cssText = `display:block;width:min(520px,100%);margin-top:6px;resize:none;border:1px solid color-mix(in srgb,${ACCENT} 28%,#888);border-radius:6px;padding:5px 7px;background:transparent;color:inherit;font:inherit;outline:none`;
      content.appendChild(input);
    }

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px";
    [
      [view?.primaryAction, view?.primaryLabel, true],
      [view?.secondaryAction, view?.secondaryLabel, false],
      [view?.tertiaryAction, view?.tertiaryLabel, false]
    ].forEach(([action, label, primary]) => {
      if (!action || !label) return;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText = primary
        ? `border:0;background:transparent;color:${ACCENT};padding:1px 0;font:600 12px/1.4 inherit;cursor:pointer`
        : "border:0;background:transparent;color:inherit;opacity:.62;padding:1px 0;font:500 12px/1.4 inherit;cursor:pointer";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const input = root.querySelector("[data-inline-input='1']");
        window.postMessage({ source: SOURCE_ACTION, token: currentToken, action, value: input?.value?.trim?.() || "" }, "*");
      });
      actions.appendChild(button);
    });
    if (actions.childElementCount) content.appendChild(actions);

    if (view?.trialText) {
      const trial = document.createElement("span");
      trial.textContent = view.trialText;
      trial.style.cssText = "display:block;opacity:.55;font-size:10px;margin-top:3px";
      content.appendChild(trial);
    }

    shell.append(mark, content);
    root.appendChild(shell);
    return root;
  }

  function heightForView(view) {
    if (view?.showInput) return 92;
    if (view?.body && String(view.body).length > 180) return 78;
    if (view?.body) return 62;
    return 38;
  }

  function showInline(payload) {
    discoverEditor();
    if (!editorRef) return;
    hideInline();
    currentToken = payload?.token || "";
    const view = payload?.view || {};
    const line = Math.min(readLineCount(), Math.max(1, Number(payload?.lineNumber) || readCursorLine()));
    const node = createNode(view);

    if (editorType === "monaco") {
      try {
        let zoneId = null;
        editorRef.changeViewZones((accessor) => {
          zoneId = accessor.addZone({ afterLineNumber: line, heightInPx: heightForView(view), domNode: node, suppressMouseDown: false });
        });
        nativeHandle = { type: "monaco", editor: editorRef, zoneId };
        return;
      } catch {}
    }

    if (editorType === "codemirror") {
      try {
        const widget = editorRef.addLineWidget(line - 1, node, { noHScroll: true, handleMouseEvents: true });
        nativeHandle = { type: "codemirror", widget };
        return;
      } catch {}
    }

    if (editorType === "ace") {
      try {
        const LineWidgets = window.ace?.require?.("ace/line_widgets")?.LineWidgets;
        if (LineWidgets) {
          if (!editorRef.session.widgetManager) {
            editorRef.session.widgetManager = new LineWidgets(editorRef.session);
            editorRef.session.widgetManager.attach(editorRef);
          }
          const widget = { row: line - 1, fixedWidth: true, coverGutter: false, el: node, pixelHeight: heightForView(view) };
          editorRef.session.widgetManager.addLineWidget(widget);
          nativeHandle = { type: "ace", editor: editorRef, widget };
          return;
        }
      } catch {}
    }

    showAnchoredFallback(node, line);
  }

  function showAnchoredFallback(node, line) {
    const editorNode = editorContainer();
    if (!editorNode) return;
    fallbackHost = node;
    node.style.position = "fixed";
    node.style.zIndex = "2147483646";
    node.style.width = "min(560px,calc(100vw - 32px))";
    const rect = editorNode.getBoundingClientRect();
    let top = rect.top + 32;
    try {
      if (editorType === "monaco") top = rect.top + (editorRef.getTopForLineNumber(line, true) - editorRef.getScrollTop()) + 22;
      if (editorType === "codemirror") top = editorRef.charCoords({ line: line - 1, ch: 0 }, "window").bottom + 3;
    } catch {}
    node.style.left = `${Math.max(12, Math.min(window.innerWidth - 580, rect.left + 42))}px`;
    node.style.top = `${Math.max(12, Math.min(window.innerHeight - 110, top))}px`;
    document.documentElement.appendChild(node);
    nativeHandle = { type: "fallback" };
  }

  function editorContainer() {
    try {
      if (editorType === "monaco") return editorRef?.getContainerDomNode?.();
      if (editorType === "codemirror") return editorRef?.getWrapperElement?.();
      if (editorType === "ace") return editorRef?.container;
    } catch {}
    return document.querySelector(".monaco-editor,.CodeMirror,.ace_editor,textarea");
  }

  function hideInline() {
    try {
      if (nativeHandle?.type === "monaco" && nativeHandle.zoneId) {
        nativeHandle.editor.changeViewZones((accessor) => accessor.removeZone(nativeHandle.zoneId));
      } else if (nativeHandle?.type === "codemirror") {
        nativeHandle.widget?.clear?.();
      } else if (nativeHandle?.type === "ace") {
        nativeHandle.editor?.session?.widgetManager?.removeLineWidget?.(nativeHandle.widget);
      }
    } catch {}
    try { fallbackHost?.remove?.(); } catch {}
    fallbackHost = null;
    nativeHandle = null;
    currentToken = "";
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source === SOURCE_RENDER) showInline(event.data);
    if (event.data?.source === SOURCE_HIDE) hideInline();
    if (event.data?.source === "CODING_HINT_COACH_REQUEST_EDITOR_ACTIVITY") {
      discoverEditor();
      postActivity();
    }
  });

  const observer = new MutationObserver(() => discoverEditor());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  [150, 500, 1200, 2500, 5000].forEach((delay) => setTimeout(discoverEditor, delay));
  setInterval(() => {
    discoverEditor();
    postActivity();
  }, 1200);
})();