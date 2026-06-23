import { renderReviewPlanner as renderReviewPlannerView } from "./sidepanel.render.js";
import { normalizeUiLanguage } from "./sidepanel.i18n.js";

const VISIBLE_LIMIT = 3;

export function createReviewController({
  elements,
  getState,
  sendMessage,
  refreshLearningDataOnly,
  t,
  showToast,
  documentRef = document
}) {
  let year = new Date().getFullYear();
  let month = new Date().getMonth();
  let selectedDate = _localDateStr(new Date());
  // tracks which dates have been expanded past the 3-item limit
  const expandedDates = new Set();
  let _lastGroups = [];

  function render(groups) {
    _lastGroups = groups;
    const lang = normalizeUiLanguage(getState().settings?.uiLanguage || "ko");
    const dateMap = _buildDateMap(groups);

    renderReviewPlannerView({
      container: elements.reviewPlanner,
      dateMap,
      year,
      month,
      selectedDate,
      expandedDates,
      visibleLimit: VISIBLE_LIMIT,
      lang,
      t,
      onPrevMonth() {
        const d = new Date(year, month - 1, 1);
        year = d.getFullYear();
        month = d.getMonth();
        render(_lastGroups);
      },
      onNextMonth() {
        const d = new Date(year, month + 1, 1);
        year = d.getFullYear();
        month = d.getMonth();
        render(_lastGroups);
      },
      onDayClick(dateStr) {
        selectedDate = dateStr;
        render(_lastGroups);
      },
      async onCheck(group, date) {
        const res = await sendMessage({ type: "MARK_REVIEW_COMPLETE", problemKey: group.key, date });
        if (!res.ok) { showToast(res.error, "error"); return; }
        await refreshLearningDataOnly();
      },
      async onUncheck(group, date) {
        const res = await sendMessage({ type: "UNMARK_REVIEW_COMPLETE", problemKey: group.key, date });
        if (!res.ok) { showToast(res.error, "error"); return; }
        await refreshLearningDataOnly();
      },
      async onSnooze(group, date, targetDate) {
        const res = await sendMessage({ type: "SNOOZE_REVIEW", problemKey: group.key, date, targetDate });
        if (!res.ok) { showToast(res.error, "error"); return; }
        showToast(t("reviewSnoozed"));
        await refreshLearningDataOnly();
      },
      async onDelete(group, date) {
        const res = await sendMessage({ type: "DELETE_REVIEW_ENTRY", problemKey: group.key, date });
        if (!res.ok) { showToast(res.error, "error"); return; }
        await refreshLearningDataOnly();
      },
      onCardClick(group) {
        const url = _urlForGroup(group);
        if (url) chrome.tabs.create({ url });
      },
      onExpand(date) {
        expandedDates.add(date);
        render(_lastGroups);
      },
      onCollapse(date) {
        expandedDates.delete(date);
        render(_lastGroups);
      },
      onAllDone() {
        showToast(t("reviewAllDone"));
      },
      documentRef
    });
  }

  return { render };
}

function _buildDateMap(groups) {
  const map = new Map();
  for (const group of groups) {
    const schedule = group.metadata?.reviewSchedule;
    if (!Array.isArray(schedule)) continue;
    schedule.forEach((entry, index) => {
      if (!entry.date) return;
      if (!map.has(entry.date)) map.set(entry.date, []);
      map.get(entry.date).push({ group, entry, round: index + 1 });
    });
  }
  return map;
}

function _urlForGroup(group) {
  const item = (group.items || [])[0] || (group.notes || [])[0];
  return item?.problemUrl || "";
}

function _localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
