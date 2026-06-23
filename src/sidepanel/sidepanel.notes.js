import { escapeHtml } from "./sidepanel.utils.js";
import { formatMarkdown, formatNoteBody } from "./sidepanel.render.js";
import { sanitizeHtml } from "./sanitize.js";

export function createNotesController({
  elements,
  getState,
  sendMessage,
  syncActiveContext,
  buildCurrentContext,
  getPreviousCategories,
  noteStatusForCurrentProblem,
  refreshLearningDataOnly,
  switchView,
  t,
  showToast = null,
  confirmAction = defaultConfirmAction,
  documentRef = document,
  navigatorRef = navigator,
  urlRef = URL,
  clipboardItemRef = globalThis.ClipboardItem,
  blobRef = Blob,
  blockEditor = null
}) {
  const toast = (message, type = "success") => showToast?.(message, type);

  function openEditor({ title = "", content = "", context = null, noteId = "", reviewed = false } = {}) {
    const state = getState();
    state.editingNoteId = noteId || "";
    state.editingNoteReviewed = Boolean(reviewed);
    if (elements.noteEditorPanel) elements.noteEditorPanel.hidden = false;
    if (elements.noteEditorTitle) elements.noteEditorTitle.value = title;
    if (blockEditor) {
      blockEditor.setHTML(content || "");
    } else if (elements.noteEditorContent) {
      elements.noteEditorContent.innerHTML = sanitizeHtml(content);
    }
    if (elements.noteEditorStatusChip) {
      elements.noteEditorStatusChip.textContent = state.editingNoteReviewed ? t("reviewDone") : t("reviewNotDone");
      elements.noteEditorStatusChip.dataset.reviewed = String(state.editingNoteReviewed);
    }
    if (elements.noteStreamState) elements.noteStreamState.textContent = "";
    if (documentRef.body?.dataset) documentRef.body.dataset.noteEditorOpen = "true";
    if (blockEditor) {
      blockEditor.focus();
    } else {
      elements.noteEditorContent?.focus();
    }
  }

  function closeEditor() {
    const state = getState();
    state.editingNoteId = "";
    state.editingNoteReviewed = false;
    if (elements.noteEditorPanel) elements.noteEditorPanel.hidden = true;
    if (documentRef.body?.dataset) documentRef.body.dataset.noteEditorOpen = "false";
  }

  function openNoteModal(group) {
    const latest = group.items?.[0] || group.notes?.[0] || {};
    elements.noteModalTitle.textContent = t("savedNotesInProblem");
    elements.noteModalSubtitle.textContent = group.title || latest.problemSlug || "Practice problem";
    elements.noteModalBody.innerHTML = group.notes?.length
      ? group.notes.map((note) => renderNoteBody(note)).join("")
      : `<div class="empty">${escapeHtml(t("noNotesForProblem"))}</div>`;
    elements.noteModal.hidden = false;
    elements.closeNoteModal?.focus();
  }

  function renderNoteBody(note) {
    const body = formatNoteBody(note);
    const savedCode = note.userCode
      ? `<details class="saved-code-block"><summary>${escapeHtml(t("savedCodeLabel"))}</summary><pre>${escapeHtml(note.userCode.slice(0, 1600))}</pre></details>`
      : "";
    return `<div class="history-entry"><span>${new Date(note.createdAt).toLocaleString()}</span><div class="markdown-body">${body}</div>${savedCode}</div>`;
  }

  function closeNoteModal() {
    elements.noteModal.hidden = true;
  }

  async function saveNote() {
    await syncActiveContext({ preserveUserEditedCode: false });
    const state = getState();
    const context = state.pendingNoteContext || buildCurrentContext();
    const isManual = Boolean(context.isManual);
    if (!isManual && !context.problemUrl) {
      if (elements.noteStreamState) elements.noteStreamState.textContent = t("needsPractice");
      return;
    }
    const personalSummary = (blockEditor ? blockEditor.getHTML() : (elements.noteEditorContent?.innerHTML || "")).trim()
      || (elements.noteOutput?.value || "").trim()
      || elements.userNote?.value?.trim() || "";
    if (!personalSummary) {
      if (elements.noteStreamState) elements.noteStreamState.textContent = t("needsNote");
      return;
    }

    let replace = false;
    if (!isManual) {
      const existingNote = (state.learningData?.savedNotes || [])
        .find((n) => n.problemUrl === context.problemUrl);
      if (existingNote && !state.editingNoteId) {
        const confirmed = await confirmAction({
          title: t("noteReplaceTitle"),
          message: t("replaceNoteConfirm"),
          confirmLabel: t("replaceLabel"),
          cancelLabel: t("cancel"),
          danger: false
        });
        if (!confirmed) return;
        replace = true;
      }
    }

    const categories = context.previousCategories || getPreviousCategories();
    const metadata = state.lastMetadata || {};
    const codeToSave = isManual ? "" : (context.code || state.context?.code || elements.code?.value || "");
    const notePayload = {
      problemUrl: isManual ? "" : context.problemUrl,
      platform: isManual ? "manual" : context.platform,
      problemSlug: isManual ? "" : context.problemSlug,
      problemId: isManual ? "" : context.problemId,
      title: elements.noteEditorTitle?.value?.trim() || (isManual ? "" : context.title),
      status: isManual ? "manual" : (context.passedSnapshot ? "solved" : noteStatusForCurrentProblem()),
      noteType: isManual ? "manual" : (metadata.note_type || "wrong_answer_review"),
      noteFormat: "html",
      userCode: codeToSave,
      personalSummary,
      improvementPoints: isManual ? [] : (metadata.improvement_points || []),
      learnedPatterns: isManual ? [] : (metadata.learned_patterns || []),
      hintCategoriesUsed: isManual ? [] : (metadata.hint_categories_used || categories),
      reviewPriority: isManual ? "medium" : (metadata.review_priority || "medium")
    };
    if (state.editingNoteId) {
      notePayload.reviewedAt = state.editingNoteReviewed ? new Date().toISOString() : "";
      notePayload.status = state.editingNoteReviewed ? "solved" : "in_progress";
    }
    const editingExistingNote = Boolean(state.editingNoteId);
    const response = editingExistingNote
      ? await sendMessage({
        type: "UPDATE_LEARNING_NOTE",
        noteId: state.editingNoteId,
        patch: notePayload
      })
      : await sendMessage({
        type: "SAVE_LEARNING_NOTE",
        replace,
        note: notePayload
      });
    if (!response.ok) {
      if (elements.noteStreamState) elements.noteStreamState.textContent = response.error;
      return;
    }
    if (elements.noteStreamState) elements.noteStreamState.textContent = "";
    toast(t("noteSaved"));
    await refreshLearningDataOnly();
    if (editingExistingNote) {
      if (elements.noteStreamState) elements.noteStreamState.textContent = t("noteSaved");
      return;
    }
    closeEditor();
    switchView("note");
  }

  async function copyCurrentNote() {
    const rawHtml = (blockEditor ? blockEditor.getHTML() : elements.noteEditorContent?.innerHTML) || elements.notePreview?.innerHTML || "";
    const html = sanitizeHtml(rawHtml, documentRef);
    const plainText = (blockEditor ? blockEditor.getHTML().replace(/<[^>]+>/g, " ").trim() : elements.noteEditorContent?.innerText) || elements.notePreview?.innerText || "";
    if (!html && !plainText) {
      if (elements.noteStreamState) elements.noteStreamState.textContent = t("needsNote");
      return;
    }
    try {
      if (navigatorRef.clipboard?.write && clipboardItemRef) {
        await navigatorRef.clipboard.write([
          new clipboardItemRef({
            "text/html": new blobRef([html], { type: "text/html" }),
            "text/plain": new blobRef([plainText], { type: "text/plain" })
          })
        ]);
      } else {
        await navigatorRef.clipboard.writeText(plainText);
      }
      toast(t("copiedNote"));
    } catch {
      try {
        await navigatorRef.clipboard.writeText(plainText);
        toast(t("copiedNote"));
      } catch {
        toast(t("copyFailed"), "error");
      }
    }
  }

  async function exportMarkdown() {
    const markdown = elements.noteEditorContent?.innerText || elements.noteOutput?.value || "";
    if (!markdown.trim()) {
      if (elements.noteStreamState) elements.noteStreamState.textContent = t("needsNote");
      return;
    }
    const state = getState();
    const blob = new blobRef([markdown], { type: "text/markdown" });
    const url = urlRef.createObjectURL(blob);
    const link = documentRef.createElement("a");
    link.href = url;
    link.download = `${(state.context?.title || "coding-note").replace(/[^a-zA-Z0-9가-힣_-]/g, "_")}-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    urlRef.revokeObjectURL(url);
  }

  function renderNotePreview() {
    if (!elements.notePreview || !elements.noteOutput) return;
    const text = (elements.noteOutput?.value || "").trim();
    elements.notePreview.innerHTML = text
      ? formatMarkdown(text)
      : `<div class="empty-note">${escapeHtml(t("noteEmptyPreview"))}</div>`;
  }

  return {
    closeEditor,
    closeNoteModal,
    copyCurrentNote,
    exportMarkdown,
    openEditor,
    openNoteModal,
    renderNotePreview,
    renderNoteBody,
    saveNote
  };
}

function defaultConfirmAction(options = {}) {
  const message = typeof options === "string" ? options : options.message || options.title || "";
  if (typeof globalThis.confirm !== "function") return Promise.resolve(false);
  return Promise.resolve(globalThis.confirm(message));
}
