import { escapeHtml, platformLabel as _platformLabel } from "./sidepanel.utils.js";
import { noteTextContent, formatNoteBody, renderNoteEntry as renderNoteEntryView } from "./sidepanel.render.js";

export function createNoteLibraryController({
  state,
  elements,
  t,
  sendMessage,
  refreshLearningDataOnly,
  renderReview,
  openNoteEditorPanel,
  confirmAction,
  formatTimeAgo,
  categoryLabel,
  showToast,
  uiLang
}) {
  function isNoteReviewed(note) {
    const value = String(note?.status || note?.noteType || "").toLowerCase();
    return Boolean(note?.reviewedAt)
      || value === "solved"
      || value === "passed"
      || value.includes("solved")
      || value.includes("reviewed");
  }

  function noteStatusLabel(note) {
    return isNoteReviewed(note) ? t("reviewDone") : t("reviewNotDone");
  }

  function notePlatformLabel(platform) {
    const value = String(platform || "").toLowerCase();
    if (value.includes("programmers")) return uiLang() === "ko" ? "프로그래머스" : "Programmers";
    if (value.includes("leetcode")) return "Leetcode";
    return _platformLabel(platform);
  }

  function openNoteStatusMenu(anchor, { reviewed = false, onSelect } = {}) {
    if (!anchor || !onSelect) return;
    document.querySelector(".note-status-menu")?.remove();
    const rect = anchor.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "note-status-menu";
    menu.setAttribute("role", "menu");
    menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 116)}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 190)}px`;
    menu.innerHTML = `
      <button class="note-status-option${reviewed ? "" : " is-active"}" type="button" role="menuitem" data-reviewed="false">
        <span class="note-status-dot"></span>
        ${escapeHtml(t("reviewNotDone"))}
      </button>
      <button class="note-status-option${reviewed ? " is-active" : ""}" type="button" role="menuitem" data-reviewed="true">
        <span class="note-status-dot"></span>
        ${escapeHtml(t("reviewDone"))}
      </button>
    `;
    const close = () => menu.remove();
    menu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-reviewed]");
      if (!option) return;
      onSelect(option.dataset.reviewed === "true");
      close();
    });
    document.body.append(menu);
    requestAnimationFrame(() => { document.addEventListener("click", close, { once: true }); });
  }

  async function updateNoteReviewStatus(note, reviewed) {
    const noteId = note?.id || "";
    if (!noteId) return;
    const patch = {
      reviewedAt: reviewed ? new Date().toISOString() : "",
      status: reviewed ? "solved" : "in_progress"
    };
    const response = await sendMessage({ type: "UPDATE_LEARNING_NOTE", noteId, patch });
    if (!response.ok) { showToast(response.error || t("noteStatusError"), "error"); return; }
    Object.assign(note, response.note || patch);
    showToast(reviewed ? t("noteStatusUpdateDone") : t("noteStatusUpdateNotDone"));
    await refreshLearningDataOnly();
  }

  function updateNoteSelectAll() {
    if (!elements.noteSelectAll) return;
    const checkboxes = document.querySelectorAll(".note-list-checkbox");
    const checkedCount = document.querySelectorAll(".note-list-checkbox:checked").length;
    elements.noteSelectAll.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
    elements.noteSelectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    if (elements.noteSelectedCount) elements.noteSelectedCount.textContent = String(state.selectedNoteIds.size);
    if (elements.deleteSelectedNotes) elements.deleteSelectedNotes.disabled = state.selectedNoteIds.size === 0;
  }

  function toggleAllNoteSelection() {
    const checkboxes = [...document.querySelectorAll(".note-list-checkbox")];
    const allChecked = checkboxes.every((cb) => cb.checked);
    checkboxes.forEach((cb) => {
      cb.checked = !allChecked;
      const noteId = cb.dataset.noteId;
      if (noteId) {
        if (!allChecked) state.selectedNoteIds.add(noteId);
        else state.selectedNoteIds.delete(noteId);
      }
    });
    document.querySelectorAll(".note-list-row").forEach((row) => {
      const noteId = row.dataset.noteId;
      if (noteId) row.classList.toggle("is-selected", !allChecked);
    });
    updateNoteSelectAll();
  }

  async function deleteSelectedNotes() {
    const ids = [...state.selectedNoteIds];
    if (!ids.length) return;
    const count = ids.length;
    const message = (uiLang() === "ko")
      ? `선택한 ${count}개의 노트를 삭제하시겠습니까?`
      : `Delete ${count} selected note${count === 1 ? "" : "s"}?`;
    const confirmed = await confirmAction({
      title: t("noteDeleteTitle"),
      message,
      confirmLabel: t("noteDeleteTitle"),
      cancelLabel: t("cancel"),
      danger: true
    });
    if (!confirmed) return;
    const response = await sendMessage({ type: "DELETE_SAVED_NOTES", noteIds: ids });
    if (!response.ok) { showToast(response.error || t("deleteFailed"), "error"); return; }
    state.selectedNoteIds.clear();
    showToast(uiLang() === "ko" ? `${count}개의 노트가 삭제됐습니다.` : `${count} note${count === 1 ? "" : "s"} deleted.`);
    await refreshLearningDataOnly();
  }

  function renderNotePagination(total, currentPage, totalPages) {
    if (!elements.notePagination) return;
    if (totalPages <= 1) { elements.notePagination.hidden = true; return; }
    elements.notePagination.hidden = false;
    const buttons = [];
    for (let p = 1; p <= totalPages; p++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "note-page-btn" + (p === currentPage ? " is-active" : "");
      btn.textContent = String(p);
      btn.addEventListener("click", () => { state.notePage = p; renderReview(); });
      buttons.push(btn);
    }
    elements.notePagination.innerHTML = "";
    elements.notePagination.append(...buttons);
  }

  function notePreviewText(note) {
    const text = noteTextContent(note);
    const normalized = text.replace(/\s+/g, " ").trim();
    return normalized ? normalized.slice(0, 150) : "내용이 비어 있는 노트입니다.";
  }

  function openManualNoteEditor() {
    state.pendingNoteContext = { isManual: true };
    openNoteEditorPanel({ title: "", content: "", reviewed: false });
  }

  function openSavedNoteEditor(note) {
    state.pendingNoteContext = {
      ...state.context,
      problemUrl: note.problemUrl,
      platform: note.platform,
      problemSlug: note.problemSlug,
      problemId: note.problemId,
      title: note.title,
      code: note.userCode || state.context?.code || ""
    };
    const content = formatNoteBody(note) || `<p>${escapeHtml(note.personalSummary || "").replace(/\n/g, "</p><p>")}</p>`;
    openNoteEditorPanel({
      title: note.title || "",
      content,
      noteId: note.id || "",
      reviewed: isNoteReviewed(note)
    });
  }

  function openSavedNotePreview(note) {
    elements.noteModalTitle.textContent = t("savedNotesTitle");
    elements.noteModalSubtitle.textContent = note.title || note.problemSlug || "Practice problem";
    elements.noteModalBody.innerHTML = renderNoteEntryView(note, { t });
    elements.noteModal.hidden = false;
    elements.closeNoteModal.focus();
  }

  function openNoteDetail(note) {
    const isReviewed = note.status === "solved" || note.status === "passed" || Boolean(note.reviewedAt);
    if (elements.noteDetailTitle) elements.noteDetailTitle.textContent = note.title || note.problemSlug || "Practice problem";
    if (elements.noteDetailProblemLink) {
      if (note.problemUrl) {
        elements.noteDetailProblemLink.href = note.problemUrl;
        elements.noteDetailProblemLink.hidden = false;
      } else {
        elements.noteDetailProblemLink.hidden = true;
      }
    }
    if (elements.noteDetailPlatform) elements.noteDetailPlatform.textContent = notePlatformLabel(note.platform);
    if (elements.noteDetailStatus) {
      elements.noteDetailStatus.textContent = noteStatusLabel(note);
      elements.noteDetailStatus.dataset.reviewed = String(isReviewed);
      elements.noteDetailStatus.onclick = (event) => {
        event.stopPropagation();
        openNoteStatusMenu(elements.noteDetailStatus, {
          reviewed: isNoteReviewed(note),
          onSelect: (reviewed) => updateNoteReviewStatus(note, reviewed)
        });
      };
    }
    if (elements.noteDetailTime) {
      const savedAt = note.createdAt ? new Date(note.createdAt).toLocaleString("ko-KR") : "";
      const timeAgo = formatTimeAgo(note.createdAt);
      elements.noteDetailTime.textContent = savedAt ? `최종 수정: ${savedAt} (${timeAgo})` : "";
    }
    if (elements.noteDetailTags) {
      const tags = (note.hintCategoriesUsed || [])
        .slice(0, 5)
        .map((c) => `<span class="note-type-tag">#${escapeHtml(categoryLabel(c))}</span>`)
        .join("");
      elements.noteDetailTags.innerHTML = tags;
    }
    if (elements.noteDetailBody) {
      const body = formatNoteBody(note);
      elements.noteDetailBody.innerHTML = body || `<p class="note-detail-empty">노트 내용이 없습니다.</p>`;
    }
    if (elements.noteDetailRetry) {
      const newBtn = elements.noteDetailRetry.cloneNode(true);
      elements.noteDetailRetry.replaceWith(newBtn);
      newBtn.addEventListener("click", () => { if (note.problemUrl) window.open(note.problemUrl, "_blank", "noopener"); });
    }
    if (elements.noteDetailStudy) {
      const newBtn = elements.noteDetailStudy.cloneNode(true);
      elements.noteDetailStudy.replaceWith(newBtn);
      newBtn.addEventListener("click", () => { closeNoteDetail(); openSavedNoteEditor(note); });
    }
    if (elements.noteDetailPanel) elements.noteDetailPanel.hidden = false;
    document.querySelector(".note-library-panel")?.setAttribute("hidden", "");
    document.querySelector(".note-tool-hero")?.setAttribute("hidden", "");
  }

  function closeNoteDetail() {
    if (elements.noteDetailPanel) elements.noteDetailPanel.hidden = true;
    document.querySelector(".note-library-panel")?.removeAttribute("hidden");
    document.querySelector(".note-tool-hero")?.removeAttribute("hidden");
  }

  function renderNoteLibrary(notes) {
    if (!elements.noteLibrary) return;
    if (elements.noteSearch) elements.noteSearch.value = state.noteSearch || "";
    if (elements.notePlatformFilter) elements.notePlatformFilter.value = state.notePlatform;
    if (elements.noteStatusFilter) elements.noteStatusFilter.value = state.noteStatus;
    if (elements.noteSort) elements.noteSort.value = state.noteSort;

    let filtered = notes.filter((note) => {
      if (state.notePlatform !== "all" && note.platform !== state.notePlatform) return false;
      const isReviewed = isNoteReviewed(note);
      if (state.noteStatus === "reviewed" && !isReviewed) return false;
      if (state.noteStatus === "unreviewed" && isReviewed) return false;
      if (state.noteSearch) {
        const q = state.noteSearch.toLowerCase();
        const title = (note.title || note.problemSlug || "").toLowerCase();
        const platform = notePlatformLabel(note.platform).toLowerCase();
        const status = noteStatusLabel(note).toLowerCase();
        const body = noteTextContent(note).toLowerCase();
        const tags = (note.hintCategoriesUsed || []).map((tag) => categoryLabel(tag)).join(" ").toLowerCase();
        if (!title.includes(q) && !platform.includes(q) && !status.includes(q) && !body.includes(q) && !tags.includes(q)) return false;
      }
      return true;
    });

    if (state.noteSort === "title") {
      filtered = [...filtered].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else {
      filtered = [...filtered].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    }

    const PAGE_SIZE = 10;
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (state.notePage > totalPages) state.notePage = totalPages;
    const pageNotes = filtered.slice((state.notePage - 1) * PAGE_SIZE, state.notePage * PAGE_SIZE);

    if (elements.noteTotalCount) elements.noteTotalCount.textContent = t("noteTotalCount").replace("{n}", filtered.length);

    const filteredIds = new Set(filtered.map((n) => n.id || n.problemUrl));
    state.selectedNoteIds = new Set([...state.selectedNoteIds].filter((id) => filteredIds.has(id)));
    updateNoteSelectAll();

    elements.noteLibrary.innerHTML = "";

    if (!filtered.length) {
      elements.noteLibrary.innerHTML = `
        <div class="note-library-empty">
          <strong>${escapeHtml(t("noteLibraryEmptyTitle"))}</strong>
          <span>${escapeHtml(t("noteLibraryEmptyDesc"))}</span>
        </div>
      `;
      renderNotePagination(0, 1, 1);
      return;
    }

    const list = document.createElement("div");
    list.className = "note-list";
    list.innerHTML = `
      <div class="note-list-header" role="row">
        <span class="note-col-select" aria-hidden="true"></span>
        <span class="note-col-index">#</span>
        <span class="note-col-problem">${escapeHtml(t("noteColProblem"))}</span>
        <span class="note-col-platform">${escapeHtml(t("noteColPlatform"))}</span>
        <span class="note-col-status">${escapeHtml(t("noteColStatus"))}</span>
        <span class="note-col-updated">${escapeHtml(t("noteColUpdated"))}</span>
      </div>
    `;

    pageNotes.forEach((note, pageIndex) => {
      const globalIndex = (state.notePage - 1) * PAGE_SIZE + pageIndex;
      const row = document.createElement("article");
      row.className = "note-list-row";

      const allTags = note.hintCategoriesUsed || [];
      const tags = allTags.slice(0, 2).map((c) => `<span class="note-type-tag">#${escapeHtml(categoryLabel(c))}</span>`).join("");
      const moreTags = allTags.length > 2 ? `<span class="note-type-tag is-muted">+${allTags.length - 2}</span>` : "";
      const timeAgo = formatTimeAgo(note.createdAt);
      const title = note.title || note.problemSlug || "Practice problem";
      const noteId = note.id || note.problemUrl || String(globalIndex);
      const isSelected = state.selectedNoteIds.has(noteId);
      const platform = notePlatformLabel(note.platform);
      const statusLabel = noteStatusLabel(note);
      const statusClass = isNoteReviewed(note) ? "note-status-reviewed" : "note-status-unreview";

      row.dataset.noteId = noteId;
      if (isSelected) row.classList.add("is-selected");

      row.innerHTML = `
        <label class="note-list-checkbox-label note-col-select" aria-label="선택">
          <input type="checkbox" class="note-list-checkbox" data-note-id="${escapeHtml(noteId)}" ${isSelected ? "checked" : ""}>
        </label>
        <span class="note-list-index note-col-index" aria-label="Note ${globalIndex + 1}">${String(globalIndex + 1).padStart(2, "0")}</span>
        <div class="note-list-main note-col-problem">
          <div class="note-list-heading">
            <strong class="note-list-title">${escapeHtml(title)}</strong>
          </div>
          <div class="note-list-tags">
            ${tags}${moreTags || ""}${tags || moreTags ? "" : '<span class="note-type-tag is-muted">#note</span>'}
          </div>
        </div>
        <span class="note-list-platform note-col-platform">${escapeHtml(platform)}</span>
        <button class="note-status-badge note-col-status ${statusClass}" type="button" data-note-action="status" data-reviewed="${String(isNoteReviewed(note))}">${escapeHtml(statusLabel)}</button>
        <div class="note-list-right note-col-updated">
          <span class="note-list-time">${escapeHtml(timeAgo)}</span>
        </div>
      `;

      row.querySelector(".note-list-checkbox")?.addEventListener("change", (e) => {
        if (e.target.checked) state.selectedNoteIds.add(noteId);
        else state.selectedNoteIds.delete(noteId);
        row.classList.toggle("is-selected", e.target.checked);
        updateNoteSelectAll();
      });
      row.querySelector("[data-note-action='status']")?.addEventListener("click", (event) => {
        event.stopPropagation();
        openNoteStatusMenu(event.currentTarget, {
          reviewed: isNoteReviewed(note),
          onSelect: (reviewed) => updateNoteReviewStatus(note, reviewed)
        });
      });
      row.addEventListener("click", (event) => {
        if (event.target.closest("button, input, label")) return;
        openSavedNoteEditor(note);
      });
      list.append(row);
    });

    elements.noteLibrary.append(list);
    renderNotePagination(filtered.length, state.notePage, totalPages);
  }

  return {
    renderNoteLibrary,
    isNoteReviewed,
    noteStatusLabel,
    notePlatformLabel,
    openNoteStatusMenu,
    updateNoteReviewStatus,
    updateNoteSelectAll,
    toggleAllNoteSelection,
    deleteSelectedNotes,
    renderNotePagination,
    notePreviewText,
    openManualNoteEditor,
    openSavedNoteEditor,
    openSavedNotePreview,
    openNoteDetail,
    closeNoteDetail
  };
}
