import { analyzeCodeQuickly } from "../shared/quickAnalyzer.js";
import { escapeHtml } from "./sidepanel.utils.js";

export function createLearningStatsController({
  elements,
  t,
  uiLang,
  categoryLabel,
  taxonomyLabelForLanguage
}) {
  function formatTimeAgo(isoString) {
    const d = new Date(isoString || Date.now());
    const diff = Math.max(0, isNaN(d) ? 0 : Date.now() - d.getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return t("timeMinutesAgo").replace("{n}", String(mins));
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t("timeHoursAgo").replace("{n}", String(hours));
    const days = Math.floor(hours / 24);
    if (days < 30) return t("timeDaysAgo").replace("{n}", String(days));
    const months = Math.floor(days / 30);
    return t("timeMonthsAgo").replace("{n}", String(months));
  }

  function localDateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function addDays(dateString, days) {
    const date = new Date(dateString + "T00:00:00");
    date.setDate(date.getDate() + days);
    return localDateString(date);
  }

  function completionRate(entries) {
    if (!entries.length) return 0;
    return Math.round((entries.filter((e) => Boolean(e.completedAt)).length / entries.length) * 100);
  }

  function computePlannerCompletion(groups) {
    const entries = (groups || []).flatMap((group) => {
      const schedule = group.metadata?.reviewSchedule;
      return Array.isArray(schedule) ? schedule : [];
    }).filter((e) => e?.date);
    const today = localDateString(new Date());
    const weekStart = addDays(today, -6);
    const monthStart = addDays(today, -29);
    return {
      overall: completionRate(entries),
      week: completionRate(entries.filter((e) => e.date >= weekStart && e.date <= today)),
      month: completionRate(entries.filter((e) => e.date >= monthStart && e.date <= today))
    };
  }

  function setSummaryTooltip(element, text) {
    if (!element) return;
    if (text) {
      element.dataset.tooltip = text;
      element.tabIndex = 0;
    } else {
      delete element.dataset.tooltip;
      element.removeAttribute("tabindex");
    }
  }

  function formatHintUsageTooltip({ hinted, attempted, avg }) {
    return t("hintRatioTooltip")
      .replace("{hinted}", String(hinted))
      .replace("{attempted}", String(attempted))
      .replace("{avg}", avg.toFixed(1));
  }

  function formatReviewRateTooltip({ reviewed, notes, plannerCompletion }) {
    return t("reviewRateTooltip")
      .replace("{reviewed}", String(reviewed))
      .replace("{notes}", String(notes))
      .replace("{plannerOverall}", `${plannerCompletion.overall}%`)
      .replace("{planner7}", `${plannerCompletion.week}%`)
      .replace("{planner30}", `${plannerCompletion.month}%`);
  }

  function renderQuickChecks() {
    const checks = analyzeCodeQuickly({
      code: elements.code.value,
      language: elements.language.value
    });
    elements.quickChecks.innerHTML = "";
    checks.forEach((check) => {
      const item = document.createElement("div");
      item.className = "quick-check";
      item.textContent = `${categoryLabel(check.type)}: ${check.message}`;
      elements.quickChecks.append(item);
    });
  }

  function renderRecentActivityFeed(data) {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const savedNotes = (data && data.savedNotes) || [];
    const hintEvents = (data && data.hintEvents) || [];
    const codeSnapshots = (data && data.codeSnapshots) || [];
    const problemMetadata = (data && data.problemMetadata) || {};

    const notesCount = savedNotes.filter((n) => new Date(n.createdAt).getTime() >= sevenDaysAgo).length;
    const hintsCount = hintEvents.filter((e) => new Date(e.createdAt).getTime() >= sevenDaysAgo).length;
    const problemsCount = codeSnapshots.filter((s) => new Date(s.createdAt).getTime() >= sevenDaysAgo).length;
    const reviewsCount = Object.values(problemMetadata).reduce((sum, meta) => {
      const schedule = (meta && meta.reviewSchedule) || [];
      return sum + schedule.filter((r) => r.completedAt && new Date(r.completedAt).getTime() >= sevenDaysAgo).length;
    }, 0);

    const iconNote = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="2" y="1" width="10" height="12" rx="1" stroke="currentColor" stroke-width="1.2"/><line x1="4" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="1.2"/><line x1="4" y1="8" x2="8" y2="8" stroke="currentColor" stroke-width="1.2"/></svg>`;
    const iconCheck = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 7l2 2 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const iconBulb = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 2a3.5 3.5 0 0 1 2 6.3V10H5V8.3A3.5 3.5 0 0 1 7 2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><line x1="5" y1="11.5" x2="9" y2="11.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    const iconCode = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M4.5 4.5L2 7l2.5 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 4.5L12 7l-2.5 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const rows = [
      { icon: iconNote, label: t("activityNoteLabel"), count: notesCount, unit: t("activityUnit") },
      { icon: iconCheck, label: t("activityReviewLabel"), count: reviewsCount, unit: t("activityUnit") },
      { icon: iconBulb, label: t("activityHintLabel"), count: hintsCount, unit: t("activityUnitTimes") },
      { icon: iconCode, label: t("activityProblemLabel"), count: problemsCount, unit: t("activityUnitTimes") }
    ];

    elements.recentSessions.innerHTML = `<div class="activity-feed">${rows.map((row) => `
      <div class="activity-feed-item">
        <span class="activity-feed-icon" aria-hidden="true">${row.icon}</span>
        <span class="activity-feed-label">${escapeHtml(row.label)} <strong>${row.count}${escapeHtml(row.unit)}</strong></span>
        <span class="activity-feed-period">${escapeHtml(t("activityPeriod"))}</span>
      </div>`).join("")}</div>`;
  }

  function renderHistoryStats({ attempted, solved, notes, accuracy, hintRatio, reviewRate, hintTooltip = "", reviewTooltip = "" }) {
    if (elements.hsAttempts) elements.hsAttempts.textContent = String(attempted);
    if (elements.hsSolved) elements.hsSolved.textContent = String(solved);
    if (elements.hsNotes) elements.hsNotes.textContent = String(notes);
    if (elements.hsAccuracy) elements.hsAccuracy.textContent = `${accuracy}%`;
    if (elements.hsHintRatio) elements.hsHintRatio.textContent = `${hintRatio}%`;
    if (elements.hsReviewRate) elements.hsReviewRate.textContent = `${reviewRate}%`;
    setSummaryTooltip(elements.hsHintRatio?.closest(".history-summary-item"), hintTooltip);
    setSummaryTooltip(elements.hsReviewRate?.closest(".history-summary-item"), reviewTooltip);
  }

  function renderHistoryTrendChart(groups) {
    const container = elements.historyTrendChart;
    if (!container) return;
    const now = Date.now();
    const WEEK = 7 * 24 * 3600 * 1000;
    const buckets = Array.from({ length: 6 }, (_, i) => ({ week: i, count: 0 }));
    for (const group of groups) {
      const ts = new Date(group.lastActivityAt || "").getTime();
      if (!ts || isNaN(ts)) continue;
      const weeksAgo = Math.floor((now - ts) / WEEK);
      if (weeksAgo >= 0 && weeksAgo < 6) buckets[5 - weeksAgo].count += 1;
    }
    const max = Math.max(...buckets.map((b) => b.count), 1);
    const W = 240, H = 80, PAD = 8;
    const xStep = (W - PAD * 2) / 5;
    const points = buckets.map((b, i) => {
      const x = PAD + i * xStep;
      const y = PAD + ((max - b.count) / max) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    container.innerHTML = `
      <svg class="history-trend-svg" viewBox="0 0 ${W} ${H}" aria-label="학습 추이 차트">
        <polyline class="history-trend-line" points="${points}" fill="none"/>
        ${buckets.map((b, i) => {
          const x = PAD + i * xStep;
          const y = PAD + ((max - b.count) / max) * (H - PAD * 2);
          return `<circle class="history-trend-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`;
        }).join("")}
      </svg>
      <div class="history-trend-labels">
        ${buckets.map((_, i) => `<span>${i === 5 ? t("trendThisWeek") : t("trendWeeksAgo").replace("{n}", 5 - i)}</span>`).join("")}
      </div>
    `;
  }

  function renderWeaknessTop5(items) {
    const tbody = elements.weaknessTop5Body;
    if (!tbody) return;
    const top5 = items.slice(0, 5);
    if (!top5.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">${escapeHtml(t("empty"))}</td></tr>`;
      return;
    }
    tbody.innerHTML = top5.map((item, i) => `
      <tr>
        <td class="wt-rank">${i + 1}</td>
        <td class="wt-label">${escapeHtml(taxonomyLabelForLanguage("problem", item.tag))}</td>
        <td class="wt-num">${item.hintCount}</td>
        <td class="wt-num">${item.wrongCount}</td>
        <td class="wt-bar"><div class="wt-bar-fill" style="width:${Math.round((item.pressure / (items[0]?.pressure || 1)) * 100)}%"></div></td>
      </tr>
    `).join("");
  }

  function renderHistoryBarChart(items) {
    const container = elements.historyBarChart;
    if (!container) return;
    const top = items.slice(0, 5);
    if (!top.length) {
      container.innerHTML = `<div class="empty">${escapeHtml(t("empty"))}</div>`;
      return;
    }
    const maxP = top[0]?.pressure || 1;
    container.innerHTML = top.map((item) => `
      <div class="hbc-row">
        <span class="hbc-label">${escapeHtml(taxonomyLabelForLanguage("problem", item.tag))}</span>
        <div class="hbc-bar-wrap">
          <div class="hbc-bar-fill" style="width:${Math.round((item.pressure / maxP) * 100)}%"></div>
        </div>
        <span class="hbc-count">${item.pressure}</span>
      </div>
    `).join("");
  }

  return {
    formatTimeAgo,
    localDateString,
    addDays,
    completionRate,
    computePlannerCompletion,
    setSummaryTooltip,
    formatHintUsageTooltip,
    formatReviewRateTooltip,
    renderQuickChecks,
    renderRecentActivityFeed,
    renderHistoryStats,
    renderHistoryTrendChart,
    renderWeaknessTop5,
    renderHistoryBarChart
  };
}
