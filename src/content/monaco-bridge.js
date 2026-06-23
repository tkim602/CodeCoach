// Reads the current editor code from the page using each editor's public API
// (Monaco / Ace / CodeMirror) and posts it to the isolated content script.
// No network interception, no cookies, no auth headers.

(function () {
  if (window.__codingHintCoachEditorBridge) return;
  window.__codingHintCoachEditorBridge = true;

  function readEditorState() {
    try {
      var models = (window.monaco && window.monaco.editor && window.monaco.editor.getModels) ? window.monaco.editor.getModels() : [];
      var model = models && models.length ? (models.find(function (m) { return m && m.getValue && m.getValue().trim(); }) || models[0]) : null;
      if (model && typeof model.getValue === "function") {
        return {
          code: model.getValue() || "",
          language: typeof model.getLanguageId === "function" ? model.getLanguageId() : ""
        };
      }
    } catch (e) {}

    try {
      var aceNode = document.querySelector(".ace_editor");
      if (aceNode && window.ace && window.ace.edit) {
        var editor = window.ace.edit(aceNode);
        return {
          code: (editor && editor.getSession && editor.getSession().getValue()) || (editor && editor.getValue && editor.getValue()) || "",
          language: (editor && editor.getSession && editor.getSession().getMode && String(editor.getSession().getMode().$id || "").split("/").pop()) || ""
        };
      }
    } catch (e) {}

    try {
      var cmNode = document.querySelector(".CodeMirror");
      var cm = cmNode && cmNode.CodeMirror;
      if (cm && cm.getValue) {
        return {
          code: cm.getValue() || "",
          language: cm.getOption ? (cm.getOption("mode") || "") : ""
        };
      }
    } catch (e) {}

    return null;
  }

  function postState() {
    var data = readEditorState();
    if (!data || !data.code) return;
    try {
      window.postMessage({
        source: "CODING_HINT_COACH_EDITOR_STATE",
        code: data.code,
        language: data.language || ""
      }, "*");
    } catch (e) {}
  }

  // Initial reads — editors may load lazily after page load.
  setTimeout(postState, 300);
  setTimeout(postState, 1000);
  setTimeout(postState, 2500);
  setTimeout(postState, 5000);

  // Periodic refresh so the isolated content script always has the latest code.
  setInterval(postState, 1500);

  // On-demand request from the isolated content script.
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (event.data && event.data.source === "CODING_HINT_COACH_REQUEST_EDITOR_STATE") {
      postState();
    }
  });
})();
