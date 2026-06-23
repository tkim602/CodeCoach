export function renderContextCards({ elements, context = {}, settings = {}, t = (k) => k }) {
  const title = context.title || context.problemSlug || "Practice problem";
  const platform = context.platformName || context.platform || "unknown";
  const language = context.language || "language unknown";
  const result = context.testResults?.status
    ? `최근 결과: ${context.testResults.status}`
    : "최근 결과 없음";
  const codeLines = context.code ? `${context.code.split("\n").length} lines` : "코드 없음";

  // Update new active problem panel elements
  if (elements.activeProblemTitle) elements.activeProblemTitle.textContent = title;
  if (elements.activeProblemLink) {
    if (context.problemUrl) {
      elements.activeProblemLink.href = context.problemUrl;
      elements.activeProblemLink.hidden = false;
    } else {
      elements.activeProblemLink.hidden = true;
    }
  }
  if (elements.activeProblemPlatform) {
    elements.activeProblemPlatform.textContent = platform;
    elements.activeProblemPlatform.dataset.platform = context.platform || "";
  }
  if (elements.activeProblemLanguage) {
    if (context.language) {
      elements.activeProblemLanguage.textContent = language;
      elements.activeProblemLanguage.hidden = false;
    } else {
      elements.activeProblemLanguage.hidden = true;
    }
  }
  if (elements.activeProblemDifficulty) {
    if (context.difficulty) {
      elements.activeProblemDifficulty.textContent = context.difficulty;
      elements.activeProblemDifficulty.hidden = false;
    } else {
      elements.activeProblemDifficulty.hidden = true;
    }
  }
  if (elements.activeProblemStats) {
    const attempts = context.testResults?.attemptCount;
    const acceptance = context.testResults?.acceptanceRate;
    if (attempts !== undefined || acceptance !== undefined) {
      if (elements.activeProblemAttempts) elements.activeProblemAttempts.textContent = attempts !== undefined ? t("contextRecentAttempts").replace("{n}", attempts) : "—";
      if (elements.activeProblemAcceptance) elements.activeProblemAcceptance.textContent = acceptance !== undefined ? t("contextAcceptanceRate").replace("{n}", acceptance) : "—";
      elements.activeProblemStats.hidden = false;
    } else {
      elements.activeProblemStats.hidden = true;
    }
  }

  if (elements.problemMeta) {
    elements.problemMeta.innerHTML = `
      <div class="context-card-line"><strong>${escapeHtml(title)}</strong></div>
      <div class="context-card-line">${escapeHtml(platform)} · ${escapeHtml(language)}</div>
    `;
  }
  if (elements.coachContextStatus) {
    elements.coachContextStatus.textContent = `${platform} · ${language}`;
  }
  if (elements.composerProblemTitle) {
    elements.composerProblemTitle.textContent = title;
    elements.composerProblemTitle.title = `${title} · ${platform}`;
  }
  if (elements.composerPlatformFavicon) {
    const faviconUrl = context.favIconUrl || "";
    if (faviconUrl) {
      elements.composerPlatformFavicon.src = faviconUrl;
      elements.composerPlatformFavicon.hidden = false;
    } else {
      elements.composerPlatformFavicon.hidden = true;
    }
  }
  if (elements.coachProblemSummary) {
    const problemText = context.problemContext
      ? clip(context.problemContext.replace(/\s+/g, " "), 180)
      : context.allowed
        ? t("contextProblemSummaryAllowed")
        : t("contextProblemSummaryNotAllowed");
    elements.coachProblemSummary.innerHTML = `<span>${escapeHtml(problemText)}</span>`;
  }
}

function clip(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
