import { formatMarkdown } from "./sidepanel.render.js";
import { escapeHtml } from "./sidepanel.utils.js";

export function createCodeDiffController({
  state,
  elements,
  t,
  sendMessage,
  refreshLearningDataOnly,
  showToast
}) {
  function openCodeDiffModal(group, pair) {
    elements.codeDiffSubtitle.textContent = group.title || pair.passed?.problemSlug || pair.failed?.problemSlug || "Practice problem";
    elements.diffFailedCode.textContent = pair.failed?.code || "";
    elements.diffPassedCode.textContent = pair.passed?.code || "";
    elements.codeDiffState.textContent = "";
    updateCodeDiffReview("");
    elements.codeDiffModal.hidden = false;
    elements.closeCodeDiffModal.focus();
  }

  function closeCodeDiffModal() {
    elements.codeDiffModal.hidden = true;
  }

  function updateCodeDiffReview(text) {
    elements.codeDiffReview.innerHTML = text
      ? formatMarkdown(text)
      : `<div class="empty-note">${escapeHtml(t("waiting"))}</div>`;
  }

  async function saveCodeDiffReview() {
    const context = state.pendingDiffContext;
    const personalSummary = state.lastCodeDiffReview.trim();
    if (!context?.problemUrl) {
      elements.codeDiffState.textContent = t("needsPractice");
      return;
    }
    if (!personalSummary) {
      elements.codeDiffState.textContent = t("needsNote");
      return;
    }
    const metadata = state.lastMetadata || {};
    const response = await sendMessage({
      type: "SAVE_LEARNING_NOTE",
      note: {
        problemUrl: context.problemUrl,
        platform: context.platform,
        problemSlug: context.problemSlug,
        problemId: context.problemId,
        title: context.title,
        status: "solved",
        noteType: metadata.note_type || "code_diff_review",
        userCode: context.code || context.passedSnapshot?.code || "",
        personalSummary,
        improvementPoints: metadata.improvement_points || [],
        learnedPatterns: metadata.learned_patterns || [],
        hintCategoriesUsed: metadata.hint_categories_used || context.previousCategories || [],
        reviewPriority: metadata.review_priority || "medium"
      }
    });
    if (!response.ok) {
      elements.codeDiffState.textContent = response.error;
      return;
    }
    elements.codeDiffState.textContent = t("codeDiffSaved");
    await refreshLearningDataOnly();
  }

  async function copyCodeSuggestion() {
    const text = elements.codeSuggestion.textContent.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      elements.streamState.textContent = t("codeSuggestionCopied");
    } catch {
      elements.streamState.textContent = t("copyFailed");
    }
  }

  return {
    openCodeDiffModal,
    closeCodeDiffModal,
    updateCodeDiffReview,
    saveCodeDiffReview,
    copyCodeSuggestion
  };
}
