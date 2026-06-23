const MODE_BY_LANGUAGE = [
  { pattern: /python/i, mode: "python" },
  { pattern: /typescript|ts\b/i, mode: "javascript" },
  { pattern: /javascript|node\.js|js\b/i, mode: "javascript" },
  { pattern: /sql|mysql|postgres/i, mode: "text/x-sql" },
  { pattern: /\bjava\b/i, mode: "text/x-java" },
  { pattern: /kotlin/i, mode: "text/x-kotlin" },
  { pattern: /scala/i, mode: "text/x-scala" },
  { pattern: /c\+\+|cpp/i, mode: "text/x-c++src" },
  { pattern: /c#|csharp/i, mode: "text/x-csharp" },
  { pattern: /\bc\b/i, mode: "text/x-csrc" },
  { pattern: /\bgo\b|golang/i, mode: "go" },
  { pattern: /ruby|rb\b/i, mode: "ruby" },
  { pattern: /rust|rs\b/i, mode: "rust" },
  { pattern: /bash|shell|sh\b/i, mode: "shell" },
  { pattern: /erlang/i, mode: "erlang" }
];

export function createCodeEditorController({
  elements,
  documentRef = document,
  windowRef = globalThis,
  onInput = () => {},
  onSelectionChange = () => {}
}) {
  let editor = null;
  let syncing = false;

  function init() {
    if (!elements.code || !windowRef.CodeMirror) return null;
    editor = windowRef.CodeMirror.fromTextArea(elements.code, {
      mode: modeForLanguage(elements.language?.value || ""),
      lineNumbers: true,
      lineWrapping: false,
      styleActiveLine: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      indentUnit: 4,
      tabSize: 4,
      viewportMargin: 80,
      placeholder: elements.code.getAttribute("placeholder") || ""
    });
    editor.setSize("100%", "100%");
    editor.on("change", () => {
      if (syncing) return;
      editor.save();
      elements.code.dispatchEvent(new Event("input", { bubbles: true }));
      onInput(editor.getValue());
    });
    editor.on("cursorActivity", () => {
      syncTextareaSelection();
      onSelectionChange();
    });
    documentRef.body.dataset.codeEditor = "codemirror";
    windowRef.__codeMirrorReady = true;
    refresh();
    return editor;
  }

  function isActive() {
    return Boolean(editor);
  }

  function getValue() {
    return editor ? editor.getValue() : elements.code?.value || "";
  }

  function setValue(value) {
    if (!editor) {
      if (elements.code) elements.code.value = value || "";
      return;
    }
    const next = value || "";
    if (editor.getValue() === next) return;
    syncing = true;
    editor.setValue(next);
    editor.save();
    syncing = false;
  }

  function refresh() {
    if (!editor) return;
    editor.setOption("mode", modeForLanguage(elements.language?.value || ""));
    editor.refresh();
  }

  function focus() {
    editor?.focus();
  }

  function syncTextareaSelection() {
    if (!editor || !elements.code) return;
    const selected = editor.getSelection();
    if (!selected) return;
    const from = editor.indexFromPos(editor.getCursor("from"));
    const to = editor.indexFromPos(editor.getCursor("to"));
    elements.code.selectionStart = from;
    elements.code.selectionEnd = to;
  }

  function setPlaceholder(text) {
    if (editor) editor.setOption("placeholder", text || "");
    if (elements.code) elements.code.placeholder = text || "";
  }

  return {
    init,
    isActive,
    getValue,
    setValue,
    refresh,
    focus,
    setPlaceholder
  };
}

function modeForLanguage(language) {
  const match = MODE_BY_LANGUAGE.find((item) => item.pattern.test(language || ""));
  return match?.mode || "text/plain";
}
