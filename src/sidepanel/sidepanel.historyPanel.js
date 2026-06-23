import { escapeHtml, platformLabel, formatLanguageName } from "./sidepanel.utils.js";
import { groupStatus, hasComparableSnapshots, applyHistoryFilters as applyHistoryFiltersToGroups } from "./sidepanel.history.js";
import { renderSnapshotEntry as renderSnapshotEntryView, renderTaxonomyChips as renderTaxonomyChipsView, renderList as renderListView } from "./sidepanel.render.js";

const ICON_PATHS = {
  bookmark: '<path d="M6 4.75A2.75 2.75 0 0 1 8.75 2h6.5A2.75 2.75 0 0 1 18 4.75v16l-6-3.25L6 20.75v-16Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  edit: '<path d="m4 16.5-.75 4.25L7.5 20 18.75 8.75a2.12 2.12 0 0 0-3-3L4.5 17Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m14.5 7 2.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  trash: '<path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" fill="currentColor"/><path d="M7 9h10l-.7 11H7.7L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" fill="currentColor"/>'
};

function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
}

export function createHistoryPanelController({
  state,
  elements,
  t,
  sendMessage,
  refreshLearningDataOnly,
  renderReview,
  confirmAction,
  startCodeDiffRequest,
  formatTimeAgo,
  snapshotStatusLabel,
  taxonomyLabelForLanguage,
  showToast,
  uiLang
}) {
  function renderSnapshotEntry(snapshot, index = 0) {
    return renderSnapshotEntryView(snapshot, { index, t, snapshotStatusLabel });
  }

  function renderTaxonomySummary(axis, categories, container) {
    const axisKey = axis === "problem" ? "problemTypes" : axis === "caution" ? "cautionPoints" : "implementationHints";
    renderTaxonomyChipsView({
      container,
      categories,
      showAll: state.showAllTaxonomy[axisKey],
      t,
      categoryLabel: (category) => taxonomyLabelForLanguage(axis, category),
      onToggle: () => {
        state.showAllTaxonomy[axisKey] = !state.showAllTaxonomy[axisKey];
        renderTaxonomySummary(axis, categories, container);
      },
      documentRef: document
    });
  }

  function renderList(container, items, renderer) {
    renderListView(container, items, renderer, { emptyText: t("empty"), documentRef: document });
  }

  function applyHistoryFilters(groups) {
    return applyHistoryFiltersToGroups(groups, {
      query: state.historySearch,
      platform: state.historyPlatform,
      status: state.historyStatus,
      sort: state.historySort
    });
  }

  function updateHistoryControls() {
    state.historySearch = elements.historySearch.value.trim();
    state.historyPlatform = elements.historyPlatformFilter.value || "all";
    state.historyStatus = elements.historyStatusFilter.value || "all";
    state.historySort = elements.historySort.value || "recent";
    renderReview();
  }

  function toggleHistorySelection(key) {
    if (state.selectedHistoryKeys.has(key)) state.selectedHistoryKeys.delete(key);
    else state.selectedHistoryKeys.add(key);
    renderHistoryBulkActions();
  }

  function renderHistoryBulkActions() {
    const visibleKeys = state.renderedHistoryKeys || [];
    const visibleSelected = visibleKeys.filter((key) => state.selectedHistoryKeys.has(key));
    elements.historySelectAll.checked = Boolean(visibleKeys.length && visibleSelected.length === visibleKeys.length);
    elements.historySelectAll.indeterminate = Boolean(visibleSelected.length && visibleSelected.length < visibleKeys.length);
    elements.historySelectAll.disabled = !visibleKeys.length;
    elements.deleteSelectedHistory.disabled = state.selectedHistoryKeys.size === 0;
    elements.historySelectionCount.textContent = state.selectedHistoryKeys.size
      ? t("selectedCount").replace("{count}", String(state.selectedHistoryKeys.size))
      : "";
  }

  function toggleVisibleHistorySelection() {
    const checked = elements.historySelectAll.checked;
    for (const key of state.renderedHistoryKeys || []) {
      if (checked) state.selectedHistoryKeys.add(key);
      else state.selectedHistoryKeys.delete(key);
    }
    renderReview();
  }

  function renderHistoryGroupNode(group) {
    const latest = group.items[0] || group.notes[0] || {};
    const node = document.createElement("details");
    node.className = "history-group";
    if (state.selectedHistoryKeys.has(group.key)) node.classList.add("is-selected");
    node.dataset.problemKey = group.key;
    const diffButton = hasComparableSnapshots(group)
      ? `<button class="secondary-history-button" type="button" data-history-action="code-diff">${escapeHtml(t("analyzeChanges"))}</button>`
      : "";
    const bookmarkLabel = group.bookmarked ? t("unbookmarkProblem") : t("bookmarkProblem");
    const status = group.status || groupStatus(group);
    const statusChip = status
      ? `<span class="history-meta-chip is-status-${escapeHtml(status)}">${escapeHtml(snapshotStatusLabel(status))}</span>`
      : "";
    const attemptsChip = group.items.length
      ? `<span class="history-meta-chip"><span class="chip-label">${escapeHtml(t("attemptsShort"))}</span><span class="chip-value">${group.items.length}</span></span>`
      : "";
    const notesChip = group.notes.length
      ? `<span class="history-meta-chip"><span class="chip-label">${escapeHtml(t("notesShort"))}</span><span class="chip-value">${group.notes.length}</span></span>`
      : "";
    const latestTime = latest.createdAt ? formatTimeAgo(latest.createdAt) : "";
    const latestLanguage = latest.language ? formatLanguageName(latest.language) : "";
    const sublineParts = [platformLabel(group.platform || latest.platform), latestLanguage, latestTime].filter(Boolean);
    node.innerHTML = `
      <summary>
        <div class="history-summary-main">
          <strong>${escapeHtml(group.title || latest.problemSlug || "Practice problem")}</strong>
          <span class="history-summary-subline">${escapeHtml(sublineParts.join(" · "))}</span>
          <div class="history-meta">${statusChip}${attemptsChip}${notesChip}</div>
        </div>
        <div class="history-row-actions">
          <button class="icon-button small-icon ${group.bookmarked ? "is-bookmarked" : ""}" type="button" data-history-action="bookmark" title="${escapeHtml(bookmarkLabel)}" aria-label="${escapeHtml(bookmarkLabel)}" aria-pressed="${group.bookmarked ? "true" : "false"}">${iconSvg("bookmark")}</button>
          <button class="icon-button small-icon" type="button" data-history-action="edit" title="${escapeHtml(t("editTitle"))}" aria-label="${escapeHtml(t("editTitle"))}">${iconSvg("edit")}</button>
          <button class="icon-button small-icon danger-text" type="button" data-history-action="delete" title="${escapeHtml(t("deleteProblem"))}" aria-label="${escapeHtml(t("deleteProblem"))}">${iconSvg("trash")}</button>
          ${diffButton}
        </div>
      </summary>
      <div class="history-detail">
        <h3>${escapeHtml(t("codeSnapshotsInProblem"))}</h3>
        ${group.items.length ? group.items.map((snapshot, index) => renderSnapshotEntry(snapshot, index)).join("") : `<div class="empty">${escapeHtml(t("empty"))}</div>`}
      </div>
    `;
    const summary = node.querySelector("summary");
    summary.addEventListener("click", (event) => {
      if (event.target.closest("button, a")) return;
      toggleHistorySelection(group.key);
      node.classList.toggle("is-selected", state.selectedHistoryKeys.has(group.key));
    });
    node.querySelectorAll("[data-history-action]").forEach((actionButton) => {
      actionButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = actionButton.dataset.historyAction;
        if (action === "bookmark") await toggleProblemBookmark(group);
        if (action === "edit") await renameHistoryGroup(group);
        if (action === "delete") await deleteHistoryGroups([group.key], t("deleteProblemConfirm"));
        if (action === "code-diff") await startCodeDiffRequest(group);
      });
    });
    return node;
  }

  function renderHistoryGroups(groups) {
    elements.codeHistory.innerHTML = "";
    elements.historySearch.value = state.historySearch || "";
    elements.historyPlatformFilter.value = state.historyPlatform;
    elements.historyStatusFilter.value = state.historyStatus;
    elements.historySort.value = state.historySort;
    state.renderedHistoryKeys = [];
    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = t("empty");
      elements.codeHistory.append(empty);
      renderHistoryBulkActions();
      return;
    }

    const MAX_INITIAL = 3;
    const showAll = state.historyShowAll || Boolean(state.historySearch);

    const byPlatform = new Map();
    for (const group of groups) {
      const platform = group.platform || "practice";
      if (!byPlatform.has(platform)) byPlatform.set(platform, []);
      byPlatform.get(platform).push(group);
    }

    for (const [platform, platformGroups] of byPlatform.entries()) {
      const section = document.createElement("section");
      section.className = "platform-history-section";
      section.innerHTML = `<h3>${escapeHtml(platformLabel(platform))}</h3>`;
      const visibleGroups = showAll ? platformGroups : platformGroups.slice(0, MAX_INITIAL);
      state.renderedHistoryKeys.push(...visibleGroups.map((group) => group.key));
      visibleGroups.forEach((group) => section.append(renderHistoryGroupNode(group)));
      if (!state.historySearch && platformGroups.length > MAX_INITIAL) {
        const remaining = platformGroups.length - MAX_INITIAL;
        const button = document.createElement("button");
        button.className = "history-more-button";
        button.type = "button";
        button.textContent = showAll
          ? t("showLessProblems")
          : `${t("showMoreProblems")} (${remaining})`;
        button.addEventListener("click", () => {
          state.historyShowAll = !showAll;
          renderHistoryGroups(groups);
        });
        section.append(button);
      }
      elements.codeHistory.append(section);
    }

    renderHistoryBulkActions();
  }

  async function toggleProblemBookmark(group) {
    const response = await sendMessage({
      type: "UPDATE_PROBLEM_METADATA",
      problemKey: group.key,
      patch: { bookmarked: !group.bookmarked }
    });
    if (!response.ok) { showToast(response.error, "error"); return; }
    showToast(t("bookmarkUpdated"));
    await refreshLearningDataOnly();
  }

  async function renameHistoryGroup(group) {
    const currentTitle = group.title || "Practice problem";
    const nextTitle = prompt(t("renamePrompt"), currentTitle);
    if (nextTitle === null) return;
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === currentTitle) return;
    const response = await sendMessage({
      type: "UPDATE_PROBLEM_METADATA",
      problemKey: group.key,
      patch: { titleOverride: trimmed }
    });
    if (!response.ok) { showToast(response.error, "error"); return; }
    showToast(t("titleUpdated"));
    await refreshLearningDataOnly();
  }

  async function deleteSelectedHistoryGroups() {
    const keys = [...state.selectedHistoryKeys];
    if (!keys.length) return;
    await deleteHistoryGroups(keys, t("deleteSelectedConfirm"));
  }

  async function deleteAllHistoryGroups() {
    const confirmed = await confirmAction({
      title: t("deleteAllTitle"),
      message: t("deleteAllConfirm"),
      confirmLabel: t("deleteLabel"),
      cancelLabel: t("cancel"),
      danger: true
    });
    if (!confirmed) return;
    const response = await sendMessage({ type: "CLEAR_LEARNING_DATA" });
    if (!response.ok) { showToast(response.error, "error"); return; }
    state.selectedHistoryKeys.clear();
    showToast(t("problemsDeleted"));
    await refreshLearningDataOnly();
  }

  async function deleteHistoryGroups(keys, confirmationMessage) {
    const uniqueKeys = [...new Set(keys)].filter(Boolean);
    if (!uniqueKeys.length) return;
    const confirmed = await confirmAction({
      title: uniqueKeys.length === 1 ? t("deleteProblem") : t("deleteSelected"),
      message: confirmationMessage,
      confirmLabel: t("deleteLabel"),
      cancelLabel: t("cancel"),
      danger: true
    });
    if (!confirmed) return;
    const response = await sendMessage({ type: "DELETE_LEARNING_PROBLEMS", problemKeys: uniqueKeys });
    if (!response.ok) { showToast(response.error, "error"); return; }
    uniqueKeys.forEach((key) => state.selectedHistoryKeys.delete(key));
    showToast(uniqueKeys.length === 1 ? t("problemDeleted") : t("problemsDeleted"));
    await refreshLearningDataOnly();
  }

  return {
    updateHistoryControls,
    renderHistoryGroups,
    toggleHistorySelection,
    renderHistoryBulkActions,
    toggleVisibleHistorySelection,
    deleteSelectedHistoryGroups,
    deleteAllHistoryGroups,
    deleteHistoryGroups,
    renderSnapshotEntry,
    renderTaxonomySummary,
    renderList,
    applyHistoryFilters
  };
}
