import {
  clip,
  escapeHtml,
  formatDuration,
  formatLanguageName,
  formatSnapshotTime,
  platformLabel
} from "./sidepanel.utils.js";
import { sanitizeHtml } from "./sanitize.js";

export function formatReadableOutput(text) {
  const cleaned = String(text || "").replace(/\s*—\s*/g, " - ");
  return formatMarkdown(cleaned);
}

export function formatNoteBody(note) {
  const raw = String(note?.personalSummary || "").trim();
  if (!raw) return "";
  if (note?.noteFormat === "html") return normalizeSavedHtml(raw);
  return formatMarkdown(raw);
}

export function noteTextContent(note) {
  const html = formatNoteBody(note);
  if (!html) return "";
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

export function formatMarkdown(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const lines = raw.split("\n");
  const blocks = [];
  let listItems = [];
  let listType = null; // "ul" or "ol"
  let codeLines = [];
  let codeLang = "";
  let inCodeBlock = false;

  const flushList = () => {
    if (!listItems.length) return;
    const tag = listType || "ul";
    blocks.push(`<${tag}>${listItems.map((item) => `<li>${formatInline(item)}</li>`).join("")}</${tag}>`);
    listItems = [];
    listType = null;
  };
  const flushCode = () => {
    if (!codeLines.length) return;
    const langAttr = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : "";
    blocks.push(`<pre><code${langAttr}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
    codeLang = "";
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^(```|''')/.test(trimmed)) {
      if (inCodeBlock) {
        inCodeBlock = false;
        flushCode();
      } else {
        flushList();
        inCodeBlock = true;
        const langMatch = trimmed.match(/^(?:```|''')(\w+)?/);
        codeLang = (langMatch?.[1] || "").toLowerCase();
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }
    if (!trimmed) {
      flushList();
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      if (listType === "ol") flushList();
      listType = "ul";
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
      continue;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      if (listType === "ul") flushList();
      listType = "ol";
      listItems.push(trimmed.replace(/^\d+[.)]\s+/, ""));
      continue;
    }
    flushList();
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = Math.min(3, heading[1].length + 1);
      blocks.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
    } else if (trimmed.endsWith(":") && trimmed.length <= 50 && !/\s{2,}/.test(trimmed)) {
      // Short label ending with ":" (e.g. "접근 요약:", "Strengths:") → bold section header
      blocks.push(`<p class="section-label">${formatInline(trimmed)}</p>`);
    } else {
      blocks.push(`<p>${formatInline(trimmed)}</p>`);
    }
  }
  flushList();
  if (inCodeBlock) flushCode();
  return sanitizeHtml(blocks.join(""));
}

function normalizeSavedHtml(html) {
  let normalized = String(html || "");
  for (let i = 0; i < 2 && looksLikeEncodedHtml(normalized); i += 1) {
    normalized = decodeHtmlEntities(normalized);
  }
  return sanitizeHtml(normalized);
}

function looksLikeEncodedHtml(value) {
  return /&(?:amp;)?lt;\/?(?:h[1-4]|p|ul|ol|li|strong|em|b|i|blockquote|pre|code|br|div|span)\b/i.test(value)
    || /&(?:amp;)?lt;br\s*\/?&(?:amp;)?gt;/i.test(value);
}

function decodeHtmlEntities(value) {
  if (typeof document === "undefined") return value;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

export function renderList(container, items, renderer, { emptyText, documentRef = document } = {}) {
  container.innerHTML = "";
  if (!items.length) {
    const empty = documentRef.createElement("div");
    empty.className = "empty";
    empty.textContent = emptyText || "";
    container.append(empty);
    return;
  }

  items.forEach((item) => {
    const node = documentRef.createElement("div");
    node.className = "list-item";
    node.innerHTML = renderer(item);
    container.append(node);
  });
}

export function renderSnapshotEntry(snapshot, { index = 0, t, snapshotStatusLabel }) {
  const language = formatLanguageName(snapshot.language || "unknown");
  const languageLabel = t("languageUsed").replace("{language}", language);
  const elapsed = Number(snapshot.elapsedMs) > 0
    ? `<span class="snapshot-elapsed">${escapeHtml(t("elapsedLabel").replace("{time}", formatDuration(snapshot.elapsedMs)))}</span>`
    : "";
  return `
    <details class="history-entry snapshot-compact" ${index === 0 ? "open" : ""}>
      <summary>
        <span class="snapshot-result status-${escapeHtml(snapshot.status || "")}">${escapeHtml(snapshotStatusLabel(snapshot.status))}</span>
        <time>${escapeHtml(formatSnapshotTime(snapshot.createdAt))}</time>
        ${elapsed}
        <span class="snapshot-language">${escapeHtml(languageLabel)}</span>
      </summary>
      <pre>${escapeHtml(clip(snapshot.code || "", 900))}</pre>
    </details>
  `;
}

export function renderNoteEntry(note, { t }) {
  const body = formatNoteBody(note);
  const savedCode = note.userCode
    ? `<details class="saved-code-block"><summary>${escapeHtml(t("savedCodeLabel"))}</summary><pre>${escapeHtml(clip(note.userCode, 1600))}</pre></details>`
    : "";
  return `
    <div class="history-entry">
      <span>${new Date(note.createdAt).toLocaleString()}</span>
      <div class="markdown-body">${body}</div>
      ${savedCode}
    </div>
  `;
}

export function renderTaxonomyChips({
  container,
  categories,
  showAll,
  t,
  categoryLabel,
  onToggle,
  documentRef = document
}) {
  container.innerHTML = "";
  if (!categories.length) {
    const empty = documentRef.createElement("div");
    empty.className = "empty";
    empty.textContent = t("empty");
    container.append(empty);
    return;
  }

  const VISIBLE_LIMIT = 6;
  const visible = showAll ? categories : categories.slice(0, VISIBLE_LIMIT);
  const chips = documentRef.createElement("div");
  chips.className = "taxonomy-chips";
  chips.innerHTML = visible.map((item) => {
    const label = escapeHtml(categoryLabel(item.category));
    const count = item.count || 0;
    return `<span class="taxonomy-chip">${label}<span class="taxonomy-chip-badge">${count}</span></span>`;
  }).join("");
  container.append(chips);

  if (categories.length > VISIBLE_LIMIT) {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = "secondary-row-button";
    button.textContent = showAll ? t("showLess") : t("showMore");
    button.addEventListener("click", onToggle);
    container.append(button);
  }
}

export function renderSnapshotGroup(group, { snapshotStatusLabel }) {
  const latest = group.items[0] || {};
  const attempts = group.items
    .map((snapshot) => `
      <div class="snapshot-entry">
        <span class="status-${escapeHtml(snapshot.status || "")}">${escapeHtml(snapshotStatusLabel(snapshot.status))}</span>
        <span> - ${new Date(snapshot.createdAt).toLocaleString()} - ${escapeHtml(snapshot.language || "unknown")}</span>
        <pre>${escapeHtml(clip(snapshot.code || "", 900))}</pre>
      </div>
    `)
    .join("");
  return `
    <strong>${escapeHtml(group.title || latest.problemSlug || "Practice problem")}</strong>
    <span>${escapeHtml(platformLabel(latest.platform))} - ${group.items.length} snapshot(s)</span>
    ${attempts}
  `;
}

const WEEK_DAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WEEK_DAYS_EN = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS_KO = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sundayFirstDayOffset(year, month) {
  return new Date(year, month, 1).getDay();
}

export function renderReviewPlanner({
  container,
  dateMap,
  year,
  month,
  selectedDate,
  expandedDates,
  visibleLimit = 3,
  lang = "ko",
  t,
  onPrevMonth,
  onNextMonth,
  onDayClick,
  onCheck,
  onUncheck,
  onSnooze,
  onDelete,
  onCardClick,
  onExpand,
  onCollapse,
  onAllDone,
  documentRef = document
}) {
  const today = toLocalDateStr(new Date());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = sundayFirstDayOffset(year, month);
  const weekDays = lang === "ko" ? WEEK_DAYS_KO : WEEK_DAYS_EN;
  const monthsArr = lang === "ko" ? MONTHS_KO : MONTHS_EN;
  const monthLabel = lang === "ko"
    ? `${year}년 ${monthsArr[month]}`
    : `${monthsArr[month]} ${year}`;

  // card
  const card = documentRef.createElement("div");
  card.className = "rp-card";

  // nav bar
  const nav = documentRef.createElement("div");
  nav.className = "rp-nav";
  const prevBtn = documentRef.createElement("button");
  prevBtn.type = "button"; prevBtn.className = "rp-nav-btn"; prevBtn.textContent = "‹";
  prevBtn.addEventListener("click", onPrevMonth);
  const nextBtn = documentRef.createElement("button");
  nextBtn.type = "button"; nextBtn.className = "rp-nav-btn"; nextBtn.textContent = "›";
  nextBtn.addEventListener("click", onNextMonth);
  const heading = documentRef.createElement("span");
  heading.className = "rp-nav-month"; heading.textContent = monthLabel;
  const navRight = documentRef.createElement("div");
  navRight.className = "rp-nav-arrows";
  navRight.append(prevBtn, nextBtn);
  nav.append(heading, navRight);
  card.append(nav);

  // body
  const body = documentRef.createElement("div");
  body.className = "rp-body";

  // --- LEFT PANEL ---
  const left = documentRef.createElement("div");
  left.className = "rp-left";

  const selItems = dateMap.get(selectedDate) || [];
  const pending = selItems.filter((r) => !r.entry.completedAt);
  const doneCount = selItems.filter((r) => r.entry.completedAt).length;
  const total = selItems.length;

  const isToday = selectedDate === today;
  const isOverdue = selectedDate < today && !isToday;
  const selDate = new Date(selectedDate + "T00:00:00");
  const weekdayIdx = selDate.getDay();
  const weekdayLabel = weekDays[weekdayIdx];

  // date header
  const dateRow = documentRef.createElement("div");
  dateRow.className = "rp-date-row";
  const dateMain = documentRef.createElement("div");
  const wdEl = documentRef.createElement("div");
  wdEl.className = "rp-weekday";
  wdEl.textContent = isToday ? (lang === "ko" ? `오늘  ${weekdayLabel}요일` : `Today  ${weekdayLabel}`) : (lang === "ko" ? `${weekdayLabel}요일` : weekdayLabel);
  const numEl = documentRef.createElement("div");
  numEl.className = "rp-date-num" + (isToday ? " rp-today-num" : "");
  numEl.textContent = selDate.getDate();
  dateMain.append(wdEl, numEl);

  const remEl = documentRef.createElement("div");
  remEl.className = "rp-remaining";
  if (total === 0) remEl.textContent = "";
  else if (pending.length === 0) { const s = documentRef.createElement("strong"); s.textContent = t("reviewAllDoneLabel"); remEl.append(s); }
  else { const s = documentRef.createElement("strong"); s.textContent = pending.length; remEl.append(s, documentRef.createTextNode(lang === "ko" ? "개 남음" : " left")); }

  dateRow.append(dateMain, remEl);
  left.append(dateRow);

  // progress bar
  const prog = documentRef.createElement("div");
  prog.className = "rp-progress";
  const fill = documentRef.createElement("div");
  fill.className = "rp-progress-fill";
  fill.style.width = total > 0 ? `${Math.round((doneCount / total) * 100)}%` : "0%";
  prog.append(fill);
  left.append(prog);

  // item list + in-list toast wrapper
  const listWrap = documentRef.createElement("div");
  listWrap.className = "rp-list-wrap";

  const toastEl = documentRef.createElement("div");
  toastEl.className = "rp-list-toast";
  const toastBubble = documentRef.createElement("div");
  toastBubble.className = "rp-list-toast-bubble";
  toastEl.append(toastBubble);
  listWrap.append(toastEl);

  const itemList = documentRef.createElement("div");
  itemList.className = "rp-item-list";

  if (total === 0) {
    const empty = documentRef.createElement("div");
    empty.className = "rp-empty";
    empty.textContent = t("empty");
    itemList.append(empty);
  } else {
    const isExpanded = expandedDates.has(selectedDate);
    const visible = isExpanded ? selItems : selItems.slice(0, visibleLimit);
    const hiddenCount = selItems.length - visibleLimit;

    visible.forEach((r) => {
      const isDone = Boolean(r.entry.completedAt);
      const itemEl = documentRef.createElement("div");
      itemEl.className = ["rp-item", isOverdue && !isDone ? "rp-overdue" : "", isDone ? "rp-done" : ""].filter(Boolean).join(" ");

      // check col
      const checkCol = documentRef.createElement("div");
      checkCol.className = "rp-check-col";
      const checkEl = documentRef.createElement("div");
      checkEl.className = isDone ? "rp-check rp-check--done" : "rp-check";
      checkEl.title = isDone ? (lang === "ko" ? "완료 취소" : "Undo") : "";
      if (isDone) checkEl.textContent = "✓";
      checkCol.append(checkEl);

      if (!isDone) {
        checkCol.addEventListener("click", (e) => {
          e.stopPropagation();
          onCheck(r.group, r.entry.date).then(() => {
            const nowPending = (dateMap.get(selectedDate) || []).filter((x) => !x.entry.completedAt && x.entry.date !== r.entry.date);
            if (nowPending.length === 0) _showListToast(toastBubble, t("reviewAllDone"));
          });
        });
      } else if (onUncheck) {
        checkCol.style.cursor = "pointer";
        checkCol.addEventListener("click", (e) => {
          e.stopPropagation();
          onUncheck(r.group, r.entry.date);
        });
      }

      // body
      const bodyEl = documentRef.createElement("div");
      bodyEl.className = "rp-item-body";
      const titleEl = documentRef.createElement("div");
      titleEl.className = "rp-item-title";
      titleEl.textContent = r.group.title || r.group.key || "";
      const metaEl = documentRef.createElement("div");
      metaEl.className = "rp-item-meta";
      const platformEl = documentRef.createElement("span");
      platformEl.textContent = r.group.platform === "programmers"
        ? "Programmers"
        : r.group.platform === "leetcode"
          ? "LeetCode"
          : t("reviewAddSourceDirect");
      const roundEl = documentRef.createElement("span");
      roundEl.className = "rp-round";
      roundEl.textContent = (lang === "ko" ? `${r.round}회차` : `#${r.round}`);
      metaEl.append(platformEl, roundEl);
      bodyEl.append(titleEl, metaEl);

      // actions (hover)
      const actionsEl = documentRef.createElement("div");
      actionsEl.className = "rp-actions";
      if (!isDone) {
        const snoozeBtn = documentRef.createElement("button");
        snoozeBtn.type = "button"; snoozeBtn.className = "rp-btn";
        snoozeBtn.textContent = t("reviewSnooze");
        snoozeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const item = snoozeBtn.closest(".rp-item");
          const minDate = new Date();
          minDate.setDate(minDate.getDate() + 1);
          const minStr = minDate.toLocaleDateString("sv");
          const picker = documentRef.createElement("input");
          picker.type = "date";
          picker.className = "rp-snooze-date";
          picker.min = minStr;
          picker.value = minStr;
          picker.addEventListener("change", (ev) => {
            ev.stopPropagation();
            if (item) item.classList.remove("rp-snoozepick");
            if (picker.value) onSnooze(r.group, r.entry.date, picker.value);
          });
          picker.addEventListener("blur", () => {
            setTimeout(() => {
              if (documentRef.body && documentRef.body.contains(picker)) {
                if (item) item.classList.remove("rp-snoozepick");
                picker.replaceWith(snoozeBtn);
              }
            }, 200);
          });
          snoozeBtn.replaceWith(picker);
          if (item) item.classList.add("rp-snoozepick");
          picker.focus();
          try { picker.showPicker?.(); } catch (_) {}
        });
        const deleteBtn = documentRef.createElement("button");
        deleteBtn.type = "button"; deleteBtn.className = "rp-btn rp-btn-del";
        deleteBtn.textContent = "✕";
        deleteBtn.addEventListener("click", (e) => { e.stopPropagation(); onDelete(r.group, r.entry.date); });
        actionsEl.append(snoozeBtn, deleteBtn);
      }

      itemEl.append(checkCol, bodyEl, actionsEl);

      if (!isDone) {
        itemEl.addEventListener("click", (e) => {
          if (e.target.closest(".rp-check-col") || e.target.closest(".rp-actions")) return;
          onCardClick(r.group);
        });
        itemEl.style.cursor = "pointer";
      }

      itemList.append(itemEl);
    });

    if (!isExpanded && hiddenCount > 0) {
      const expandBtn = documentRef.createElement("button");
      expandBtn.type = "button"; expandBtn.className = "rp-expand-btn";
      expandBtn.textContent = lang === "ko" ? `더보기 ${hiddenCount}개 ∨` : `Show ${hiddenCount} more ∨`;
      expandBtn.addEventListener("click", () => onExpand(selectedDate));
      itemList.append(expandBtn);
    } else if (isExpanded) {
      const collapseBtn = documentRef.createElement("button");
      collapseBtn.type = "button"; collapseBtn.className = "rp-expand-btn";
      collapseBtn.textContent = lang === "ko" ? "접기 ∧" : "Show less ∧";
      collapseBtn.addEventListener("click", () => onCollapse(selectedDate));
      itemList.append(collapseBtn);
    }
  }

  listWrap.append(itemList);
  left.append(listWrap);
  body.append(left);

  // --- RIGHT PANEL: mini calendar ---
  const right = documentRef.createElement("div");
  right.className = "rp-right";

  const dowRow = documentRef.createElement("div");
  dowRow.className = "rp-dow-row";
  weekDays.forEach((wd) => {
    const el = documentRef.createElement("div");
    el.className = "rp-dow"; el.textContent = wd;
    dowRow.append(el);
  });
  right.append(dowRow);

  const grid = documentRef.createElement("div");
  grid.className = "rp-grid";

  for (let i = 0; i < offset; i++) grid.appendChild(documentRef.createElement("div"));

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayItems = dateMap.get(dateStr) || [];
    const hasPending = dayItems.some((r) => !r.entry.completedAt);
    const allDone = dayItems.length > 0 && !hasPending;
    const isPast = dateStr < today;
    const isDayToday = dateStr === today;
    const isDaySel = dateStr === selectedDate;

    const cell = documentRef.createElement("button");
    cell.type = "button";
    cell.className = [
      "rp-cal-day",
      isDayToday ? "rp-cal-today" : "",
      isDaySel && !isDayToday ? "rp-cal-sel" : "",
      isPast && !isDayToday ? "rp-cal-past" : ""
    ].filter(Boolean).join(" ");
    cell.textContent = day;

    if (dayItems.length > 0) {
      const dot = documentRef.createElement("span");
      dot.className = "rp-cal-dot " + (allDone ? "rp-dot-done" : isPast && !isDayToday ? "rp-dot-overdue" : "rp-dot-has");
      cell.append(dot);
    }

    cell.addEventListener("click", () => onDayClick(dateStr));
    grid.append(cell);
  }

  right.append(grid);
  body.append(right);
  card.append(body);

  container.innerHTML = "";
  container.append(card);
}

function _showListToast(bubbleEl, msg) {
  bubbleEl.textContent = msg;
  bubbleEl.classList.add("rp-toast-show");
  setTimeout(() => bubbleEl.classList.remove("rp-toast-show"), 2400);
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
