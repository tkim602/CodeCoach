import { historyGroupKey } from "./sidepanel.history.js";
import { escapeHtml } from "./sidepanel.utils.js";
import { normalizeTaxonomyTag } from "../shared/taxonomy/index.js";

const MAX_AXES = 6;

export function buildProblemTypeWeaknessItems({ hintEvents = [], codeSnapshots = [], learningEvents = [] } = {}) {
  const byProblem = new Map();
  const byTag = new Map();

  for (const event of hintEvents || []) {
    const key = historyGroupKey(event);
    const tags = cleanTags(event.problemTypeTags);
    if (key && tags.length) byProblem.set(key, mergeTags(byProblem.get(key), tags));
    for (const tag of tags) {
      const item = ensureTagItem(byTag, tag);
      item.hintCount += 1;
    }
  }

  for (const snapshot of codeSnapshots || []) {
    if (snapshot.status !== "failed") continue;
    const tags = byProblem.get(historyGroupKey(snapshot)) || [];
    for (const tag of tags) {
      const item = ensureTagItem(byTag, tag);
      item.wrongCount += 1;
    }
  }

  for (const event of learningEvents || []) {
    if (event.signal_type !== "struggled" && event.signal_type !== "asked_hint") continue;
    if (!event.topic) continue;
    const item = ensureTagItem(byTag, normalizeProblemTag(event.topic));
    item.chatScore += 0.6;
  }

  return [...byTag.values()]
    .map((item) => ({
      ...item,
      pressure: item.hintCount + item.wrongCount * 2 + (item.chatScore || 0)
    }))
    .sort((a, b) => b.pressure - a.pressure || b.wrongCount - a.wrongCount || b.hintCount - a.hintCount)
    .slice(0, MAX_AXES);
}

export function renderWeaknessRadar({
  container,
  items,
  labelForTag,
  lang = "ko",
  emptyText = "아직 분석할 기록이 없습니다.",
  documentRef = document
}) {
  if (!container) return;
  container.innerHTML = "";
  const normalized = Array.isArray(items) ? items.filter((item) => item.pressure > 0) : [];
  if (!normalized.length) {
    const empty = documentRef.createElement("div");
    empty.className = "empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  const hintLabel = lang === "en" ? "Hints" : "힌트";
  const wrongLabel = lang === "en" ? "Wrong" : "오답";
  const svgAriaLabel = lang === "en" ? "Weak spots radar chart" : "문제 유형별 약점 레이더";

  // Always show MAX_AXES axes so the chart draws a complete hexagon even with few data points.
  const displayItems = [...normalized];
  while (displayItems.length < MAX_AXES) {
    displayItems.push({ tag: null, hintCount: 0, wrongCount: 0, pressure: 0 });
  }

  const maxPressure = Math.max(...normalized.map((item) => item.pressure), 1);
  const points = displayItems.map((item, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / displayItems.length;
    const radius = item.pressure ? 34 + (item.pressure / maxPressure) * 56 : 34;
    return polarPoint(angle, radius);
  });
  const gridRadii = [34, 62, 90];
  const axes = displayItems.map((item, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / displayItems.length;
    const end = polarPoint(angle, 92);
    const label = polarPoint(angle, 110);
    const tagLabel = item.tag ? labelForTag(item.tag) : "";
    return `
      <line class="weakness-radar-axis" x1="120" y1="120" x2="${end.x}" y2="${end.y}"></line>
      ${tagLabel ? `<text x="${label.x}" y="${label.y}" text-anchor="middle">${escapeHtml(tagLabel)}</text>` : ""}
    `;
  }).join("");

  container.innerHTML = `
    <div class="weakness-radar-layout">
      <svg class="weakness-radar-svg" viewBox="0 0 240 240" role="img" aria-label="${escapeHtml(svgAriaLabel)}">
        ${gridRadii.map((radius) => polygon(displayItems.length, radius, "weakness-radar-grid")).join("")}
        ${axes}
        <polygon class="weakness-radar-shape" points="${points.map((point) => `${point.x},${point.y}`).join(" ")}"></polygon>
        ${points.filter((_, i) => displayItems[i].tag).map((point) => `<circle class="weakness-radar-dot" cx="${point.x}" cy="${point.y}" r="3.5"></circle>`).join("")}
      </svg>
      <div class="weakness-radar-list">
        ${normalized.map((item, index) => `
          <div class="weakness-radar-row">
            <span class="weakness-radar-rank">${index + 1}</span>
            <strong>${escapeHtml(labelForTag(item.tag))}</strong>
            <span>${hintLabel} ${item.hintCount}</span>
            <span>${wrongLabel} ${item.wrongCount}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function polygon(count, radius, className) {
  const points = Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    const point = polarPoint(angle, radius);
    return `${point.x},${point.y}`;
  });
  return `<polygon class="${className}" points="${points.join(" ")}"></polygon>`;
}

function polarPoint(angle, radius) {
  return {
    x: Number((120 + Math.cos(angle) * radius).toFixed(2)),
    y: Number((120 + Math.sin(angle) * radius).toFixed(2))
  };
}

function ensureTagItem(map, tag) {
  if (!map.has(tag)) map.set(tag, { tag, hintCount: 0, wrongCount: 0, chatScore: 0 });
  return map.get(tag);
}

function cleanTags(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalizeProblemTag).filter(Boolean))];
}

function normalizeProblemTag(value) {
  return normalizeTaxonomyTag("problem", value);
}

function mergeTags(previous = [], next = []) {
  return [...new Set([...previous, ...next])];
}
