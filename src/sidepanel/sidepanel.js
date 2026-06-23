import { DEFAULT_MODEL_CHOICES, HINT_CATEGORY_LABELS, REQUEST_KINDS } from "../shared/constants.js";
import { analyzeCodeQuickly } from "../shared/quickAnalyzer.js";
import { taxonomyLabel } from "../shared/taxonomy/index.js";
import {
  DEFAULT_TIMER_DURATION_MS,
  backgroundTimerAlarmName,
  timerDurationMs as timerDurationMsForMetadata,
  timerElapsedMs as timerElapsedMsForMetadata,
  timerRemainingMs as timerRemainingMsForMetadata
} from "./sidepanel.timer.js";
import {
  applyHistoryFilters as applyHistoryFiltersToGroups,
  groupStatus,
  groupLearningDataByProblem,
  hasComparableSnapshots,
  historyGroupKey,
  nextReviewAtForGroup,
  sortByCreatedAt
} from "./sidepanel.history.js";
import {
  categoryLabel as categoryLabelForLanguage,
  escapeHtml,
  extensionForLanguage,
  formatDuration,
  formatLanguageName,
  humanizeCategory as humanizeCategoryForLanguage,
  platformLabel,
  snapshotStatusLabel as snapshotStatusLabelForLanguage,
  statusIcon as statusIconForLabels
} from "./sidepanel.utils.js";
import { applyStaticLocalization, createTranslator, resolveUiLanguage } from "./sidepanel.i18n.js";
import { assertRequiredElements, getSidepanelElements, showToast } from "./sidepanel.dom.js";
import {
  formatNoteBody,
  formatMarkdown,
  formatReadableOutput,
  noteTextContent,
  renderTaxonomyChips as renderTaxonomyChipsView,
  renderList as renderListView,
  renderNoteEntry as renderNoteEntryView,
  renderSnapshotEntry as renderSnapshotEntryView
} from "./sidepanel.render.js";
import {
  addModelOptions as addModelOptionsToForm,
  hydrateContextPreferenceControls,
  hydrateSettingsForm,
  settingsPatchFromForm
} from "./sidepanel.settings.js";
import { createNotesController } from "./sidepanel.notes.js";
import { createBlockEditor } from "./sidepanel.noteBlockEditor.js";
import { createAiController } from "./sidepanel.ai.js";
import { createReviewController } from "./sidepanel.review.js";
import { createAccountController } from "./sidepanel.account.js";
import { createApiKeyController } from "./sidepanel.apikey.js";
import { createRailController } from "./sidepanel.rail.js";
import { createChatController } from "./sidepanel.chat.js";
import { createComposerController } from "./sidepanel.composer.js";
import { renderContextCards } from "./sidepanel.contextCards.js";
import { mountSiderChatPanel } from "./sidepanel.shell.js";
import { chatHistoryForContext } from "../shared/chatThreads.js";
import { buildProblemTypeWeaknessItems, renderWeaknessRadar } from "./sidepanel.weakness.js";
import { createCodeEditorController } from "./sidepanel.codeEditor.js";
import { createDebugLabController } from "./sidepanel.debugLab.js";
import { createConfirmController } from "./sidepanel.confirm.js";

const TIMER_ALARM_PATH = "assets/alarm-clock-digital-bell-rings-brukowskij-2-2-00-02.mp3";

const elements = assertRequiredElements(getSidepanelElements());
mountSiderChatPanel({ elements, documentRef: document });
const confirmController = createConfirmController({ elements, documentRef: document });

const state = {
  settings: null,
  context: null,
  learningData: null,
  hintLevel: 1,
  activeRequest: null,
  lastAnalysis: "",
  lastMetadata: {},
  pendingNoteContext: null,
  pendingGeneratedNote: null,
  pendingDiffContext: null,
  lastCodeDiffReview: "",
  lastCodeSuggestion: "",
  lastContextUpdateAt: "",
  pollTimer: null,
  timerTick: null,
  lastContextSignature: "",
  lastPollAt: 0,
  burstPollUntil: 0,
  showAllTaxonomy: { problemTypes: false, cautionPoints: false, implementationHints: false },
  historyPlatform: "all",
  historyStatus: "all",
  historySort: "recent",
  historySearch: "",
  expandedHistoryPlatforms: {},
  historyShowAll: false,
  selectedHistoryKeys: new Set(),
  renderedHistoryKeys: [],
  timerAlarmedFor: "",
  alarmUrl: "",
  alarmAudioContext: null,
  alarmBuffer: null,
  alarmLoadPromise: null,
  notePlatform: "all",
  noteStatus: "all",
  noteSort: "recent",
  noteSearch: "",
  selectedNoteIds: new Set(),
  notePage: 1,
  editingNoteId: "",
  editingNoteReviewed: false,
  privacyNoticeShowing: false
};

let _codeSelText = "";
let _codeSelStartLine = -1;
let _codeSelEndLine = -1;

const t = createTranslator(uiLang);
let blockEditor = null;
if (elements.noteEditorContent) {
  blockEditor = createBlockEditor(elements.noteEditorContent);
}
const notesController = createNotesController({
  elements,
  getState: () => state,
  sendMessage,
  syncActiveContext,
  buildCurrentContext,
  getPreviousCategories,
  noteStatusForCurrentProblem,
  refreshLearningDataOnly,
  switchView,
  t,
  showToast,
  confirmAction: confirmController.confirmAction,
  documentRef: document,
  blockEditor
});
const {
  closeEditor: closeNoteEditor,
  closeNoteModal,
  copyCurrentNote,
  exportMarkdown,
  openEditor: openNoteEditorPanel,
  openNoteModal,
  renderNotePreview,
  saveNote
} = notesController;
const aiController = createAiController({
  elements,
  getState: () => state,
  setState: (patch) => Object.assign(state, patch),
  sendMessage,
  syncActiveContext,
  buildCurrentContext,
  noteStatusForCurrentProblem,
  saveHintMetadata,
  saveLearningSignal,
  saveCoachMessage,
  refreshLearningDataOnly,
  openSettingsModal,
  openCodeDiffModal,
  updateCodeDiffReview,
  renderNotePreview,
  openNoteEditorPanel,
  promptSaveGeneratedNote,
  switchView,
  writeOutput,
  appendAssistantMetadata: (node) => chatController?.appendAssistantMetadata(node),
  setBusy,
  categoryLabel,
  taxonomyLabel: taxonomyLabelForLanguage,
  getCategoriesForProblem,
  t,
  showToast,
  documentRef: document
});
const {
  handleRuntimeMessage: handleAiRuntimeMessage,
  startAiRequest,
  startCodeDiffRequest
} = aiController;

const reviewController = createReviewController({
  elements,
  getState: () => state,
  sendMessage,
  refreshLearningDataOnly,
  t,
  showToast,
  documentRef: document
});

let accountController = null;
let apiKeyController = null;
let railController = null;
let chatController = null;
let composerController = null;
let codeEditorController = null;
let debugLabController = null;

init();

function init() {
  confirmController.init();
  hydrateModelOptions();
  initAccountController();
  initApiKeyController();
  initShellControllers();
  bindEvents();
  hydrateTimerAlarm();
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  chrome.storage.local.onChanged.addListener((changes) => {
    if (Object.keys(changes).some(k => k === "settings" || k.endsWith("_settings"))) refreshAll();
  });
  refreshAll();
  startContextPolling();
  startTimerTicker();
}

function initAccountController() {
  accountController = createAccountController({
    elements,
    onAuthChange: refreshAll,
    openSettingsModal: openOptionsPage,
    openApiKeyModal: () => apiKeyController?.openApiKeyModal(),
    showToast,
    t,
    confirmAction: confirmController.confirmAction
  });
  accountController.init();
}

function initApiKeyController() {
  apiKeyController = createApiKeyController({
    elements,
    onSave: (settings) => {
      if (settings) {
        state.settings = settings;
        hydrateContextFields(state.context || {});
        renderAll();
      } else {
        refreshAll();
      }
    },
    onTestSuccess: (models) => addModelOptionsToForm(elements, models, document),
    showToast,
    t,
    sendMessage,
    confirmAction: confirmController.confirmAction,
    getSettings: () => state.settings
  });
  apiKeyController.init();
}

function initShellControllers() {
  chatController = createChatController({ elements, documentRef: document, t });
  codeEditorController = createCodeEditorController({
    elements,
    documentRef: document,
    onInput: () => {
      clearCodeSelection();
      renderQuickChecks();
    },
    onSelectionChange: updateCodeSelButton
  });
  codeEditorController.init();
  debugLabController = createDebugLabController({
    elements,
    getContext: buildCurrentContext,
    startDebugRequest: startDebugLabRequest,
    formatMarkdown,
    documentRef: document
  });
  railController = createRailController({
    elements,
    switchView,
    openApiKeyModal: () => apiKeyController?.openApiKeyModal(),
    openOptionsPage,
    openAccountModal: () => accountController?.openAccountModal(),
    refreshAll,
    t,
    documentRef: document
  });
  composerController = createComposerController({
    elements,
    startAiRequest,
    startChatRequest,
    appendUserMessage: (text) => chatController?.appendUserMessage(text),
    startAssistantMessage: () => chatController?.startAssistantMessage(),
    t,
    documentRef: document
  });
  railController.init();
  railController.activate("coach");
  composerController.init();
  debugLabController.init();
}

function bindEvents() {
  elements.refresh.addEventListener("click", refreshAll);
  elements.code.addEventListener("mouseup", updateCodeSelButton);
  elements.code.addEventListener("keyup", updateCodeSelButton);
  elements.code.addEventListener("input", clearCodeSelection);
  elements.code.addEventListener("blur", () => { if (!_codeSelText && elements.codeSelBtn) elements.codeSelBtn.hidden = true; });
  elements.codeSelBtn?.addEventListener("mousedown", (e) => e.preventDefault());
  elements.codeSelBtn?.addEventListener("click", handleCodeSelBtnClick);
  elements.coachOpenCodeView?.addEventListener("click", () => switchView("code"));
  elements.codeCopyBtn?.addEventListener("click", () => {
    const code = codeEditorController?.getValue() ?? elements.code.value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => showToast("코드가 복사됐습니다.", "success")).catch(() => showToast("복사 실패", "error"));
    }
  });
  elements.codeFormatBtn?.addEventListener("click", handleCodeRefreshClick);
  elements.closeSettings.addEventListener("click", closeSettingsModal);
  elements.closeNoteModal.addEventListener("click", closeNoteModal);
  elements.closeCodeDiffModal.addEventListener("click", closeCodeDiffModal);
  elements.settingsModal.addEventListener("click", (event) => {
    if (event.target === elements.settingsModal) closeSettingsModal();
  });
  elements.noteModal.addEventListener("click", (event) => {
    if (event.target === elements.noteModal) closeNoteModal();
  });
  elements.codeDiffModal.addEventListener("click", (event) => {
    if (event.target === elements.codeDiffModal) closeCodeDiffModal();
  });

  // --- Review add modal ---
  let _reviewAddSelected = null; // { problemKey, titleOverride, source }
  let _modalGroups = null;

  function openReviewAddModal() {
    _reviewAddSelected = null;
    _modalGroups = state.learningData
      ? groupLearningDataByProblem({
          snapshots: state.learningData.codeSnapshots || [],
          notes: state.learningData.savedNotes || [],
          problemMetadata: state.learningData.problemMetadata || {},
          hintEvents: state.learningData.hintEvents || []
        })
      : [];
    if (elements.reviewAddSource) elements.reviewAddSource.value = "direct";
    if (elements.reviewAddSearch) elements.reviewAddSearch.value = "";
    if (elements.reviewAddStartDate) elements.reviewAddStartDate.value = _localDateStr(new Date());
    renderReviewAddResults("");
    if (elements.reviewAddModal) elements.reviewAddModal.hidden = false;
    elements.reviewAddSearch?.focus();
  }

  function _localDateStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function closeReviewAddModal() {
    if (elements.reviewAddModal) elements.reviewAddModal.hidden = true;
    _reviewAddSelected = null;
  }

  function reviewAddSource() {
    const source = elements.reviewAddSource?.value || "direct";
    return ["leetcode", "programmers", "direct"].includes(source) ? source : "direct";
  }

  function reviewAddKeyForTitle(title, source = reviewAddSource()) {
    const slug = encodeURIComponent(String(title || "").trim().toLowerCase())
      .replace(/%20/g, "-")
      .replace(/(?:-|%20)+/g, "-");
    const normalizedSlug = slug || "item";
    if (source === "leetcode") return `leetcode:${normalizedSlug}`;
    if (source === "programmers") return `programmers:${normalizedSlug}`;
    return `manual:${normalizedSlug}`;
  }

  function renderReviewAddResults(query) {
    if (!elements.reviewAddResults) return;
    const norm = (query || "").trim();

    if (!norm) {
      elements.reviewAddResults.innerHTML = `<div class="review-add-empty">${escapeHtml(t("reviewAddSearchPlaceholder"))}</div>`;
      return;
    }

    const source = reviewAddSource();
    const customKey = reviewAddKeyForTitle(norm, source);
    const selected = _reviewAddSelected?.problemKey === customKey;
    const html = `<div class="review-add-result review-add-custom${selected ? " selected" : ""}" data-key="${escapeHtml(customKey)}" data-title="${escapeHtml(norm)}" data-source="${escapeHtml(source)}" data-custom="true">
      <span class="review-add-new-label">${escapeHtml(t("reviewAddNewLabel"))}</span>
      <span>${escapeHtml(norm)}</span>
    </div>`;
    elements.reviewAddResults.innerHTML = html;

    elements.reviewAddResults.querySelectorAll(".review-add-result").forEach((el) => {
      el.addEventListener("click", () => {
        _reviewAddSelected = { problemKey: el.dataset.key, titleOverride: el.dataset.title, source: el.dataset.source || reviewAddSource() };
        renderReviewAddResults(elements.reviewAddSearch?.value || "");
      });
    });
  }

  elements.reviewAddBtn?.addEventListener("click", openReviewAddModal);
  elements.reviewAddCancel?.addEventListener("click", closeReviewAddModal);
  elements.reviewAddModal?.addEventListener("click", (e) => {
    if (e.target === elements.reviewAddModal) closeReviewAddModal();
  });
  elements.reviewAddSearch?.addEventListener("input", (e) => {
    renderReviewAddResults(e.target.value);
  });
  elements.reviewAddSource?.addEventListener("change", () => {
    _reviewAddSelected = null;
    renderReviewAddResults(elements.reviewAddSearch?.value || "");
  });
  elements.reviewAddConfirm?.addEventListener("click", async () => {
    // Auto-select typed text as custom item if user never clicked a result
    if (!_reviewAddSelected?.problemKey) {
      const query = (elements.reviewAddSearch?.value || "").trim();
      if (!query) { showToast(t("reviewAddRequired"), "error"); return; }
      const source = reviewAddSource();
      const customKey = reviewAddKeyForTitle(query, source);
      _reviewAddSelected = { problemKey: customKey, titleOverride: query, source };
    }
    const startDate = elements.reviewAddStartDate?.value || _localDateStr(new Date());
    let res;
    try {
      res = await sendMessage({
        type: "ADD_MANUAL_REVIEW",
        problemKey: _reviewAddSelected.problemKey,
        titleOverride: _reviewAddSelected.titleOverride || "",
        source: _reviewAddSelected.source || reviewAddSource(),
        startDate
      });
    } catch (err) {
      showToast("오류: " + (err?.message || "알 수 없는 오류"), "error");
      return;
    }
    if (!res?.ok) { showToast(res?.error || "오류", "error"); return; }
    showToast("복습 일정이 추가되었습니다.");
    closeReviewAddModal();
    await refreshLearningDataOnly();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.accountModal.hidden) accountController.closeAccountModal();
    if (event.key === "Escape" && elements.apikeyModal && !elements.apikeyModal.hidden) apiKeyController.closeApiKeyModal();
    if (event.key === "Escape" && !elements.settingsModal.hidden) closeSettingsModal();
    if (event.key === "Escape" && !elements.noteModal.hidden) closeNoteModal();
    if (event.key === "Escape" && !elements.codeDiffModal.hidden) closeCodeDiffModal();
    if (event.key === "Escape" && elements.reviewAddModal && !elements.reviewAddModal.hidden) closeReviewAddModal();
  });
  elements.apiPill?.addEventListener("click", () => apiKeyController.openApiKeyModal());
  elements.uiLanguage.addEventListener("change", saveUiLanguage);
  elements.includeProblemContext.addEventListener("change", saveContextPreference);
  elements.hint.addEventListener("click", () => startAiRequestFromUi(REQUEST_KINDS.hint, t("hintUserMsg")));
  elements.hintLevel.addEventListener("change", () => setHintLevel(Number(elements.hintLevel.value || 1)));
  elements.composerModelSelect?.addEventListener("change", () => {
    const model = elements.composerModelSelect.value;
    if (!model) return;
    state.settings = { ...state.settings, hintModel: model };
    if (elements.settingsHintModel) elements.settingsHintModel.value = model;
    sendMessage({ type: "SAVE_SETTINGS", settings: { hintModel: model } }).catch(() => {});
  });
  elements.explainLine.addEventListener("click", () => startAiRequestFromUi(REQUEST_KINDS.explainLine, t("explainLineUserMsg")));
  elements.analyze.addEventListener("click", () => startAiRequestFromUi(REQUEST_KINDS.analyze, t("analyzeUserMsg")));
  elements.nextCodeHint.addEventListener("click", () => startAiRequestFromUi(REQUEST_KINDS.nextCodeHint, t("nextCodeHintUserMsg")));
  elements.copyCodeSuggestion.addEventListener("click", copyCodeSuggestion);
  elements.generateNote.addEventListener("click", () => startAiRequestFromUi(REQUEST_KINDS.note, t("generateNoteUserMsg")));
  elements.copyNote.addEventListener("click", copyCurrentNote);
  elements.saveNote.addEventListener("click", saveNote);
  elements.manualNoteCreate?.addEventListener("click", openManualNoteEditor);
  document.querySelector("#note-hero-manual-create")?.addEventListener("click", openManualNoteEditor);
  elements.noteEditorStatusChip?.addEventListener("click", (event) => {
    event.stopPropagation();
    openNoteStatusMenu(elements.noteEditorStatusChip, {
      reviewed: state.editingNoteReviewed,
      onSelect: (reviewed) => {
        state.editingNoteReviewed = reviewed;
        elements.noteEditorStatusChip.textContent = reviewed ? t("reviewDone") : t("reviewNotDone");
        elements.noteEditorStatusChip.dataset.reviewed = String(reviewed);
        const editingNote = (state.learningData?.savedNotes || []).find((note) => note.id === state.editingNoteId);
        if (editingNote) updateNoteReviewStatus(editingNote, reviewed);
      }
    });
  });
  elements.closeNoteEditor?.addEventListener("click", () => closeNoteEditor());
  elements.noteDetailBack?.addEventListener("click", closeNoteDetail);
  elements.exportMarkdown?.addEventListener("click", exportMarkdown);
  elements.saveCodeDiffReview.addEventListener("click", saveCodeDiffReview);

  // Toolbar removed — inline formatting via block editor slash menu
  elements.saveSettings.addEventListener("click", saveSettingsFromPanel);
  elements.settingsUiLanguage.addEventListener("change", () => {
    elements.uiLanguage.value = elements.settingsUiLanguage.value;
    saveUiLanguage();
  });
  elements.settingsChatFontSize.addEventListener("change", () => {
    applyChatFontSize(elements.settingsChatFontSize.value);
    sendMessage({ type: "SAVE_SETTINGS", settings: { chatFontSize: Number(elements.settingsChatFontSize.value) } }).catch(() => {});
  });
  elements.code.addEventListener("input", renderQuickChecks);
  elements.language.addEventListener("input", () => {
    renderCodeEditor();
    renderQuickChecks();
  });
  let _historySearchDebounce = null;
  elements.historySearch.addEventListener("input", () => {
    clearTimeout(_historySearchDebounce);
    _historySearchDebounce = setTimeout(updateHistoryControls, 150);
  });
  elements.historyPlatformFilter.addEventListener("change", updateHistoryControls);
  elements.historyStatusFilter.addEventListener("change", updateHistoryControls);
  elements.historySort.addEventListener("change", updateHistoryControls);
  elements.historySelectAll.addEventListener("change", toggleVisibleHistorySelection);
  elements.deleteSelectedHistory.addEventListener("click", deleteSelectedHistoryGroups);
  elements.deleteAllHistory.addEventListener("click", deleteAllHistoryGroups);
  elements.noteSearch?.addEventListener("input", () => { state.noteSearch = elements.noteSearch.value.trim(); state.notePage = 1; renderReview(); });
  elements.notePlatformFilter?.addEventListener("change", () => { state.notePlatform = elements.notePlatformFilter.value; state.notePage = 1; renderReview(); });
  elements.noteStatusFilter?.addEventListener("change", () => { state.noteStatus = elements.noteStatusFilter.value; state.notePage = 1; renderReview(); });
  elements.noteSort?.addEventListener("change", () => { state.noteSort = elements.noteSort.value; state.notePage = 1; renderReview(); });
  elements.noteSelectAll?.addEventListener("change", () => toggleAllNoteSelection());
  elements.deleteSelectedNotes?.addEventListener("click", () => deleteSelectedNotes());
  elements.timerDuration.addEventListener("change", updateTimerDuration);
  elements.timerCustomMinutes.addEventListener("change", updateTimerDuration);
  elements.timerCustomMinutes.addEventListener("input", updateCustomTimerPreview);
  elements.timerStart.addEventListener("click", startProblemTimer);
  elements.timerPause.addEventListener("click", pauseProblemTimer);
  elements.timerReset.addEventListener("click", resetProblemTimer);
  elements.timerFinish.addEventListener("click", finishProblemTimer);
  elements.code.addEventListener("scroll", () => { syncCodeEditorScroll(); updateCodeSelOverlay(); });
  ["keydown", "input", "paste"].forEach((eventName) => {
    elements.code.addEventListener(eventName, activateBurstPolling);
  });
  elements.code.addEventListener("input", renderCodeEditor);

  elements.tabButtons.forEach((button) => {
    if (!button.dataset.view) return;
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
}

function startAiRequestFromUi(kind, label) {
  chatController?.appendUserMessage(label);
  chatController?.startAssistantMessage();
  startAiRequest(kind, label);
}

function promptSaveGeneratedNote({ content = "" } = {}) {
  const transcript = elements.coachChatTranscript;
  const message = transcript?.querySelector(".assistant-message:last-of-type");
  if (!message || !content.trim()) return;
  const promptId = crypto.randomUUID();
  state.pendingGeneratedNote = { id: promptId, content };
  message.dataset.noteSavePromptId = promptId;
  renderGeneratedNoteSaveCard(message, state.pendingGeneratedNote);
}

function restoreGeneratedNoteSaveCard() {
  if (!state.pendingGeneratedNote || !elements.coachChatTranscript) return;
  const message = elements.coachChatTranscript.querySelector(`[data-note-save-prompt-id="${CSS.escape(state.pendingGeneratedNote.id)}"]`)
    || elements.coachChatTranscript.querySelector(".assistant-message:last-of-type");
  if (!message) return;
  message.dataset.noteSavePromptId = state.pendingGeneratedNote.id;
  renderGeneratedNoteSaveCard(message, state.pendingGeneratedNote);
}

function renderGeneratedNoteSaveCard(message, notePrompt) {
  if (!message || !notePrompt?.content?.trim()) return;
  message.querySelector(".assistant-note-save-card")?.remove();
  const isKo = uiLang() === "ko";
  const card = document.createElement("div");
  card.className = "assistant-note-save-card";
  card.innerHTML = `
    <div class="assistant-note-save-copy">
      <strong>${escapeHtml(isKo ? "이 오답노트를 저장할까요?" : "Save this note?")}</strong>
      <span>${escapeHtml(isKo ? "저장하면 편집 가능한 오답노트로 열립니다." : "Saving opens it as an editable note.")}</span>
    </div>
    <div class="assistant-note-save-actions">
      <button class="assistant-note-save-secondary" type="button" data-note-save-action="dismiss">${escapeHtml(isKo ? "나중에" : "Not now")}</button>
      <button class="assistant-note-save-primary" type="button" data-note-save-action="save">${escapeHtml(isKo ? "노트로 저장" : "Save note")}</button>
    </div>
  `;
  card.querySelector("[data-note-save-action='save']")?.addEventListener("click", () => {
    if (elements.noteOutput) elements.noteOutput.value = "";
    openNoteEditorPanel({ content: formatMarkdown(notePrompt.content), title: "", reviewed: false });
    state.pendingGeneratedNote = null;
    switchView("note");
    card.remove();
  });
  card.querySelector("[data-note-save-action='dismiss']")?.addEventListener("click", () => {
    state.pendingGeneratedNote = null;
    card.remove();
  });
  message.appendChild(card);
  if (elements.coachChatTranscript) elements.coachChatTranscript.scrollTop = elements.coachChatTranscript.scrollHeight;
}

function startContextPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    if (state.activeRequest) return;
    const now = Date.now();
    const pollInterval = now < state.burstPollUntil ? 300 : 5000;
    if (now - state.lastPollAt < pollInterval) return;
    state.lastPollAt = now;
    syncActiveContext({ preserveUserEditedCode: true });
  }, 150);
}

function startTimerTicker() {
  if (state.timerTick) clearInterval(state.timerTick);
  state.timerTick = setInterval(renderTimer, 1000);
}

function activateBurstPolling() {
  state.burstPollUntil = Date.now() + 2500;
}

function hydrateTimerAlarm() {
  if (!elements.timerAlarm) return;
  const getUrl = globalThis.chrome?.runtime?.getURL;
  state.alarmUrl = typeof getUrl === "function" ? getUrl(TIMER_ALARM_PATH) : "";
  elements.timerAlarm.src = state.alarmUrl;
  elements.timerAlarm.load();
}

async function unlockTimerAlarm() {
  if (!state.alarmUrl) return false;
  try {
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!state.alarmAudioContext && AudioContextCtor) {
      state.alarmAudioContext = new AudioContextCtor();
    }
    if (state.alarmAudioContext?.state === "suspended") {
      await state.alarmAudioContext.resume();
    }
    if (state.alarmAudioContext && !state.alarmBuffer) {
      state.alarmLoadPromise ||= fetch(state.alarmUrl)
        .then((response) => {
          if (!response.ok) throw new Error(`Alarm audio failed to load: ${response.status}`);
          return response.arrayBuffer();
        })
        .then((buffer) => state.alarmAudioContext.decodeAudioData(buffer))
        .then((decoded) => {
          state.alarmBuffer = decoded;
          return decoded;
        })
        .catch(() => null);
      await state.alarmLoadPromise;
    }
    return Boolean(state.alarmAudioContext && state.alarmBuffer);
  } catch {
    return false;
  }
}

async function playTimerAlarm() {
  try {
    if (await unlockTimerAlarm()) {
      const source = state.alarmAudioContext.createBufferSource();
      source.buffer = state.alarmBuffer;
      source.connect(state.alarmAudioContext.destination);
      source.start(0);
      return;
    }
    if (elements.timerAlarm?.src) {
      elements.timerAlarm.currentTime = 0;
      await elements.timerAlarm.play();
    }
  } catch {
    elements.timerState.textContent = t("timerDone");
  }
}

function renderCodeEditor() {
  const code = elements.code.value || "";
  const lineCount = Math.max(1, code.split("\n").length);
  elements.codeLineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join("\n");
  elements.codeEditorFilename.textContent = `solution.${extensionForLanguage(elements.language.value || state.context?.language || "")}`;
  codeEditorController?.refresh();
  syncCodeEditorScroll();
}

function syncCodeEditorScroll() {
  if (codeEditorController?.isActive()) return;
  elements.codeLineNumbers.scrollTop = elements.code.scrollTop;
}

async function refreshAll() {
  setBusy(true);
  try {
    const [settingsResponse, contextResponse, dataResponse] = await Promise.all([
      sendMessage({ type: "GET_SETTINGS" }),
      sendMessage({ type: "GET_ACTIVE_CONTEXT" }),
      sendMessage({ type: "GET_LEARNING_DATA" })
    ]);

    if (!settingsResponse.ok) throw new Error(settingsResponse.error);
    if (!contextResponse.ok) throw new Error(contextResponse.error);
    if (!dataResponse.ok) throw new Error(dataResponse.error);

    state.settings = settingsResponse.settings;
    state.context = contextResponse.context;
    state.learningData = dataResponse.data;
    state.lastContextSignature = contextSignature(state.context);
    state.lastContextUpdateAt = new Date().toISOString();
    hydrateContextFields(state.context);
    renderAll();
    await showFirstRunPrivacyNotice();
    if (!state.settings?.hasApiKey && !state._onboardShown) {
      state._onboardShown = true;
      setTimeout(() => apiKeyController?.openApiKeyModal(), 400);
    }
  } catch (error) {
    elements.pageStatus.textContent = error.message || String(error);
  } finally {
    setBusy(false);
  }
}

async function showFirstRunPrivacyNotice() {
  if (state.settings?.privacyNoticeShown || state.privacyNoticeShowing) return;
  state.privacyNoticeShowing = true;
  const viewSettings = await confirmController.confirmAction({
    title: t("privacyNoticeTitle"),
    message: t("privacyNoticeMessage"),
    confirmLabel: t("privacyNoticeOk"),
    cancelLabel: t("privacyNoticeSettings"),
    danger: false
  });
  state.settings = { ...(state.settings || {}), privacyNoticeShown: true };
  await sendMessage({ type: "SAVE_SETTINGS", settings: { privacyNoticeShown: true } }).catch(() => {});
  state.privacyNoticeShowing = false;
  if (!viewSettings) openSettingsModal();
}

function hydrateContextFields(context) {
  const settings = state.settings || {};
  hydrateSettingsForm({ elements, settings, t, documentRef: document });
  applyChatFontSize(settings.chatFontSize);
  hydrateContextPreferenceControls(elements, settings, context);

  if (context.code || !elements.code.value) {
    elements.code.value = context.code || "";
    codeEditorController?.setValue(elements.code.value);
  }
  if (context.problemContext || !elements.problemContext.value) {
    elements.problemContext.value = context.problemContext || "";
    if (elements.problemDescriptionDisplay) {
      const raw = elements.problemContext.value || "";
      elements.problemDescriptionDisplay.textContent = raw.length > 400
        ? raw.slice(0, 400) + "…"
        : raw;
    }
  }
  renderCodeEditor();
  debugLabController?.hydrateFromContext();
}

function renderAll() {
  renderLocalization();
  renderHintLevel();
  renderStatus();
  renderContextCards({ elements, context: state.context || {}, settings: state.settings || {}, t });
  chatController?.setEmptyState({
    apiConnected: Boolean(state.settings?.hasApiKey),
    allowed: Boolean(state.context?.allowed)
  });
  renderTimer();
  renderQuickChecks();
  renderReview();
  setActionAvailability();
}

function renderLocalization() {
  document.documentElement.lang = uiLang();
  applyStaticLocalization(document, uiLang());
  elements.problemContext.placeholder = t("problemPlaceholder");
  elements.code.placeholder = t("codePlaceholder");
  codeEditorController?.setPlaceholder(t("codePlaceholder"));
  elements.userNote.placeholder = t("notePlaceholder");
  if (elements.noteOutput) elements.noteOutput.placeholder = t("wrongNotePlaceholder");
  elements.historySearch.placeholder = t("historySearchPlaceholder");
  if (elements.noteSearch) elements.noteSearch.placeholder = t("noteSearchPlaceholder");
  elements.copyNote.title = t("copyNote");
  elements.copyNote.setAttribute("aria-label", t("copyNote"));
  elements.copyCodeSuggestion.title = t("copyNote");
  elements.copyCodeSuggestion.setAttribute("aria-label", t("copyNote"));
  renderNotePreview();
}

function setHintLevel(level) {
  state.hintLevel = Math.min(3, Math.max(1, Number(level) || 1));
  renderHintLevel();
}

function renderHintLevel() {
  elements.hintLevel.value = String(state.hintLevel);
}

function openSettingsModal() {
  openOptionsPage();
}

function closeSettingsModal() {
  elements.settingsModal.hidden = true;
  elements.railToggle.focus();
}

async function openOptionsPage() {
  try {
    if (chrome.runtime?.openOptionsPage) {
      await chrome.runtime.openOptionsPage();
      return;
    }
  } catch {
    // Fall through to tab/window fallback.
  }

  const url = chrome.runtime?.getURL?.("src/options/index.html") || "./../options/index.html";
  if (chrome.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function renderStatus() {
  const context = state.context || {};
  const settings = state.settings || {};
  const allowed = Boolean(context.allowed);
  const hasKey = Boolean(settings.hasApiKey);
  const platformName = context.platformName || platformLabel(context.platform);

  elements.pageStatus.textContent = allowed ? `${platformName} ${t("detected")}` : t("disabled");
  if (elements.eligibilityPill) setPill(elements.eligibilityPill, allowed ? platformName : t("blocked"), allowed ? "ok" : "danger");
  if (elements.apiPill) setPill(elements.apiPill, hasKey ? t("apiReady") : t("apiMissing"), hasKey ? "ok" : "warn");
  elements.problemMeta.textContent = context.title || context.problemUrl || context.url || t("noPractice");
  const testResultStatus = formatTestResultStatus(context.testResults);
  elements.syncState.textContent = !hasKey
    ? t("apiMissingAction")
    : testResultStatus ? `${t("latestTestResult")}: ${testResultStatus}` : "";

  elements.blockedReason.hidden = allowed;
  elements.blockedReason.textContent = allowed ? "" : context.reason || t("noPractice");

  if (!elements.problemContext.value.trim()) {
    elements.problemContext.placeholder = t("noProblemContext");
  }
}

function renderTimer() {
  const key = currentProblemKey();
  const metadata = key ? state.learningData?.problemMetadata?.[key] || {} : {};
  const duration = timerDurationMs(metadata);
  const remaining = timerRemainingMs(metadata);
  const running = Boolean(metadata.timerRunningSince);
  renderTimerDurationControl(duration);
  elements.timerTime.textContent = formatDuration(remaining);
  const warning = running && remaining > 0 && remaining <= 5 * 60 * 1000;
  elements.timerTime.classList.toggle("is-running", running && !warning);
  elements.timerTime.classList.toggle("is-warning", warning);
  elements.timerState.textContent = !key
    ? t("needsPractice")
    : running
      ? t("timerRunning")
      : remaining < duration
        ? t("timerPaused")
        : t("timerIdle");
  elements.timerStart.disabled = !key || running || remaining <= 0;
  elements.timerPause.disabled = !key || !running;
  elements.timerReset.disabled = !key || (remaining >= duration && !running);
  elements.timerFinish.disabled = !key || (!running && remaining >= duration);
  if (key && running && remaining <= 0) {
    handleTimerDone(key, metadata);
  }
}

async function updateTimerDuration() {
  const key = currentProblemKey();
  const customSelected = elements.timerDuration.value === "custom";
  if (customSelected && (elements.timerCustomMinutes.hidden || !customTimerMinutes())) {
    elements.timerCustomMinutes.hidden = false;
    elements.timerCustomMinutes.focus();
    return;
  }
  if (!key) return;
  const duration = selectedTimerDurationMs();
  state.timerAlarmedFor = "";
  await updateTimerMetadata({
    timerDurationMs: duration,
    timerRemainingMs: duration,
    timerElapsedMs: 0,
    timerRunningSince: ""
  });
}

function updateCustomTimerPreview() {
  if (elements.timerDuration.value !== "custom") return;
  const minutes = customTimerMinutes();
  if (!minutes) return;
  const metadata = currentProblemMetadata();
  if (!metadata.timerRunningSince) {
    elements.timerTime.textContent = formatDuration(minutes * 60 * 1000);
  }
}

async function startProblemTimer() {
  const key = currentProblemKey();
  if (!key) return;
  void unlockTimerAlarm();
  const metadata = currentProblemMetadata();
  const duration = timerDurationMs(metadata);
  const remaining = timerRemainingMs(metadata);
  const effectiveRemaining = remaining > 0 ? remaining : duration;
  state.timerAlarmedFor = "";
  await updateTimerMetadata({
    timerDurationMs: duration,
    timerRemainingMs: effectiveRemaining,
    timerElapsedMs: Math.max(0, duration - effectiveRemaining),
    timerRunningSince: new Date().toISOString()
  });
  scheduleBackgroundTimerAlarm(key, effectiveRemaining);
}

async function pauseProblemTimer() {
  const key = currentProblemKey();
  if (!key) return;
  const metadata = currentProblemMetadata();
  const duration = timerDurationMs(metadata);
  const remaining = timerRemainingMs(metadata);
  await updateTimerMetadata({
    timerDurationMs: duration,
    timerRemainingMs: remaining,
    timerElapsedMs: Math.max(0, duration - remaining),
    timerRunningSince: ""
  });
  clearBackgroundTimerAlarm(key);
}

async function resetProblemTimer() {
  const key = currentProblemKey();
  if (!key) return;
  const duration = selectedTimerDurationMs();
  state.timerAlarmedFor = "";
  await updateTimerMetadata({
    timerDurationMs: duration,
    timerRemainingMs: duration,
    timerElapsedMs: 0,
    timerRunningSince: ""
  });
  clearBackgroundTimerAlarm(key);
}

async function finishProblemTimer() {
  const key = currentProblemKey();
  if (!key) return;
  const metadata = currentProblemMetadata();
  const duration = timerDurationMs(metadata);
  const remaining = timerRemainingMs(metadata);
  await updateTimerMetadata({
    timerDurationMs: duration,
    timerRemainingMs: remaining,
    timerElapsedMs: Math.max(0, duration - remaining),
    timerRunningSince: ""
  });
  clearBackgroundTimerAlarm(key);
  showToast(t("timerSaved"));
}

async function handleTimerDone(key, metadata) {
  if (state.timerAlarmedFor === key) return;
  state.timerAlarmedFor = key;
  const duration = timerDurationMs(metadata);
  await updateTimerMetadata({
    timerDurationMs: duration,
    timerRemainingMs: 0,
    timerElapsedMs: duration,
    timerRunningSince: "",
    timerFinishedAt: new Date().toISOString()
  });
  clearBackgroundTimerAlarm(key);
  await playTimerAlarm();
  writeOutput(t("timerDone"));
}

async function handleBackgroundTimerDone(problemKey) {
  if (!problemKey) return;
  await refreshLearningDataOnly();
  renderTimer();
  // Only play the in-panel alarm + write to output when this is the visible problem.
  if (currentProblemKey() === problemKey && state.timerAlarmedFor !== problemKey) {
    state.timerAlarmedFor = problemKey;
    try {
      await playTimerAlarm();
    } catch (error) {
      // alarm sound playback may be blocked until user interaction
    }
    writeOutput(t("timerDone"));
  }
}

function scheduleBackgroundTimerAlarm(key, remainingMs) {
  if (!chrome.alarms?.create || !key || !Number.isFinite(remainingMs) || remainingMs <= 0) return;
  try {
    chrome.alarms.create(backgroundTimerAlarmName(key), { when: Date.now() + remainingMs });
  } catch (error) {
    // alarm scheduling is best-effort; the in-panel timer still works
  }
}

function clearBackgroundTimerAlarm(key) {
  if (!chrome.alarms?.clear || !key) return;
  try {
    chrome.alarms.clear(backgroundTimerAlarmName(key));
  } catch (error) {
    // ignore
  }
}

async function updateTimerMetadata(patch) {
  const key = currentProblemKey();
  if (!key) return;
  const response = await sendMessage({
    type: "UPDATE_TIMER_STATE",
    problemKey: key,
    patch
  });
  if (!response.ok) {
    showToast(response.error, "error");
    return;
  }
  await refreshLearningDataOnly();
  renderTimer();
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

  const iconNote = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="2" y="1" width="10" height="12" rx="1" stroke="currentColor" stroke-width="1.2"/><line x1="4" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="1.2"/><line x1="4" y1="8" x2="8" y2="8" stroke="currentColor" stroke-width="1.2"/></svg>`;
  const iconCheck = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 7l2 2 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const iconBulb = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M7 2a3.5 3.5 0 0 1 2 6.3V10H5V8.3A3.5 3.5 0 0 1 7 2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><line x1="5" y1="11.5" x2="9" y2="11.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;
  const iconCode = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4.5 4.5L2 7l2.5 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 4.5L12 7l-2.5 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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

function renderReview() {
  const data = state.learningData || emptyLearningData();
  const notes = [...(data.savedNotes || [])].sort(sortByCreatedAt);
  const snapshots = [...(data.codeSnapshots || [])]
    .filter((snapshot) => snapshot.status === "passed" || snapshot.status === "failed")
    .sort(sortByCreatedAt);
  const allGroups = groupLearningDataByProblem({
    snapshots,
    notes,
    problemMetadata: data.problemMetadata || {},
    hintEvents: data.hintEvents || []
  });
  const historyGroups = groupLearningDataByProblem({
    snapshots,
    notes,
    problemMetadata: data.problemMetadata || {},
    hintEvents: data.hintEvents || [],
    includeMetadataOnly: false
  });
  const activeKeys = new Set(historyGroups.map((group) => group.key));
  state.selectedHistoryKeys = new Set([...state.selectedHistoryKeys].filter((key) => activeKeys.has(key)));

  elements.sessionCount.textContent = String(historyGroups.length);
  elements.hintCount.textContent = String((data.hintEvents || []).length);
  elements.noteCount.textContent = String(notes.length);
  elements.snapshotCount.textContent = String(snapshots.length);

  const groups = applyHistoryFilters(historyGroups);
  reviewController.render(allGroups);
  renderNoteLibrary(notes);
  renderHistoryGroups(groups);
  renderWeaknessRadar({
    container: elements.historyWeaknessRadar,
    items: buildProblemTypeWeaknessItems({
      hintEvents: data.hintEvents || [],
      codeSnapshots: snapshots,
      learningEvents: data.learningEvents || []
    }),
    labelForTag: (tag) => taxonomyLabelForLanguage("problem", tag),
    lang: uiLang(),
    emptyText: t("empty"),
    documentRef: document
  });
  renderTaxonomySummary("problem", data.topProblemTypeTags || [], elements.topProblemTypes);
  renderTaxonomySummary("caution", data.topCautionPointTags || [], elements.topCautionPoints);
  renderTaxonomySummary("implementation", data.topImplementationHintTags || data.topCategories || [], elements.topImplementationHints);
  renderRecentActivityFeed(data);

  // History analytics use actual code-history groups only; review planner-only entries stay out.
  const attempted = historyGroups.length;
  const solved = historyGroups.filter((g) => g.status === "passed").length;
  const accuracySnapshots = historyGroups
    .flatMap((group) => group.items || [])
    .filter((snapshot) => snapshot.status === "passed" || snapshot.status === "failed");
  const passedSnapshots = accuracySnapshots.filter((snapshot) => snapshot.status === "passed").length;
  const hintEvents = data.hintEvents || [];
  const learningEvents = data.learningEvents || [];

  const accuracy = accuracySnapshots.length > 0 ? Math.round((passedSnapshots / accuracySnapshots.length) * 100) : 0;

  const historyKeySet = new Set(historyGroups.map((group) => group.key));
  const hintedEvents = [
    ...hintEvents,
    ...learningEvents.filter((event) => event.signal_type === "asked_hint" || event.signal_type === "struggled")
  ].filter((event) => historyKeySet.has(historyGroupKey(event)));
  const hintedKeys = new Set(hintedEvents.map((event) => historyGroupKey(event)).filter(Boolean));
  const hintRatio = attempted > 0 ? Math.round((hintedKeys.size / attempted) * 100) : 0;
  const avgHintsPerHintedProblem = hintedKeys.size > 0 ? hintedEvents.length / hintedKeys.size : 0;

  const reviewedNotes = notes.filter((note) =>
    note.status === "solved" || note.status === "passed" || Boolean(note.reviewedAt)
  ).length;
  const reviewRate = notes.length > 0 ? Math.round((reviewedNotes / notes.length) * 100) : 0;
  const plannerCompletion = computePlannerCompletion(allGroups);
  renderHistoryStats({
    attempted,
    solved,
    notes: notes.length,
    accuracy,
    hintRatio,
    reviewRate,
    hintTooltip: formatHintUsageTooltip({ hinted: hintedKeys.size, attempted, avg: avgHintsPerHintedProblem }),
    reviewTooltip: formatReviewRateTooltip({ reviewed: reviewedNotes, notes: notes.length, plannerCompletion })
  });
  renderHistoryTrendChart(allGroups);
  const weaknessItems = buildProblemTypeWeaknessItems({ hintEvents, codeSnapshots: snapshots, learningEvents: data.learningEvents || [] });
  renderWeaknessTop5(weaknessItems);
  renderHistoryBarChart(weaknessItems);
}

function renderNoteLibrary(notes) {
  if (!elements.noteLibrary) return;

  // Sync filter controls
  if (elements.noteSearch) elements.noteSearch.value = state.noteSearch || "";
  if (elements.notePlatformFilter) elements.notePlatformFilter.value = state.notePlatform;
  if (elements.noteStatusFilter) elements.noteStatusFilter.value = state.noteStatus;
  if (elements.noteSort) elements.noteSort.value = state.noteSort;

  // Filter notes
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

  // Sort
  if (state.noteSort === "title") {
    filtered = [...filtered].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  } else {
    filtered = [...filtered].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }

  // Pagination
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (state.notePage > totalPages) state.notePage = totalPages;
  const pageNotes = filtered.slice((state.notePage - 1) * PAGE_SIZE, state.notePage * PAGE_SIZE);

  // Update totals display
  if (elements.noteTotalCount) elements.noteTotalCount.textContent = t("noteTotalCount").replace("{n}", filtered.length);

  // Reset selection that no longer exists
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
    const tags = allTags
      .slice(0, 2)
      .map((c) => `<span class="note-type-tag">#${escapeHtml(categoryLabel(c))}</span>`)
      .join("");
    const moreTags = allTags.length > 2
      ? `<span class="note-type-tag is-muted">+${allTags.length - 2}</span>`
      : "";
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
      if (e.target.checked) {
        state.selectedNoteIds.add(noteId);
      } else {
        state.selectedNoteIds.delete(noteId);
      }
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

function notePlainTextExcerpt(note, limit = 140) {
  const text = noteTextContent(note);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

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
  return platformLabel(platform);
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
  requestAnimationFrame(() => {
    document.addEventListener("click", close, { once: true });
  });
}

async function updateNoteReviewStatus(note, reviewed) {
  const noteId = note?.id || "";
  if (!noteId) return;
  const patch = {
    reviewedAt: reviewed ? new Date().toISOString() : "",
    status: reviewed ? "solved" : "in_progress"
  };
  const response = await sendMessage({
    type: "UPDATE_LEARNING_NOTE",
    noteId,
    patch
  });
  if (!response.ok) {
    showToast(response.error || t("noteStatusError"), "error");
    return;
  }
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
  const confirmed = await confirmController.confirmAction({
    title: t("noteDeleteTitle"),
    message,
    confirmLabel: t("noteDeleteTitle"),
    cancelLabel: t("cancel"),
    danger: true
  });
  if (!confirmed) return;
  const response = await sendMessage({ type: "DELETE_SAVED_NOTES", noteIds: ids });
  if (!response.ok) {
    showToast(response.error || t("deleteFailed"), "error");
    return;
  }
  state.selectedNoteIds.clear();
  showToast(uiLang() === "ko" ? `${count}개의 노트가 삭제됐습니다.` : `${count} note${count === 1 ? "" : "s"} deleted.`);
  await refreshLearningDataOnly();
}

function renderNotePagination(total, currentPage, totalPages) {
  if (!elements.notePagination) return;
  if (totalPages <= 1) {
    elements.notePagination.hidden = true;
    return;
  }
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

  // Wire action buttons
  if (elements.noteDetailRetry) {
    const newBtn = elements.noteDetailRetry.cloneNode(true);
    elements.noteDetailRetry.replaceWith(newBtn);
    newBtn.addEventListener("click", () => {
      if (note.problemUrl) window.open(note.problemUrl, "_blank", "noopener");
    });
  }
  if (elements.noteDetailStudy) {
    const newBtn = elements.noteDetailStudy.cloneNode(true);
    elements.noteDetailStudy.replaceWith(newBtn);
    newBtn.addEventListener("click", () => {
      closeNoteDetail();
      openSavedNoteEditor(note);
    });
  }

  // Show detail panel, hide library panel
  if (elements.noteDetailPanel) elements.noteDetailPanel.hidden = false;
  document.querySelector(".note-library-panel")?.setAttribute("hidden", "");
  document.querySelector(".note-tool-hero")?.setAttribute("hidden", "");
}

function closeNoteDetail() {
  if (elements.noteDetailPanel) elements.noteDetailPanel.hidden = true;
  document.querySelector(".note-library-panel")?.removeAttribute("hidden");
  document.querySelector(".note-tool-hero")?.removeAttribute("hidden");
}

function updateHistoryControls() {
  state.historySearch = elements.historySearch.value.trim();
  state.historyPlatform = elements.historyPlatformFilter.value || "all";
  state.historyStatus = elements.historyStatusFilter.value || "all";
  state.historySort = elements.historySort.value || "recent";
  renderReview();
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
    const sublineParts = [
      platformLabel(group.platform || latest.platform),
      latestLanguage,
      latestTime
    ].filter(Boolean);
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

async function toggleProblemBookmark(group) {
  const response = await sendMessage({
    type: "UPDATE_PROBLEM_METADATA",
    problemKey: group.key,
    patch: { bookmarked: !group.bookmarked }
  });
  if (!response.ok) {
    showToast(response.error, "error");
    return;
  }
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
  if (!response.ok) {
    showToast(response.error, "error");
    return;
  }
  showToast(t("titleUpdated"));
  await refreshLearningDataOnly();
}

async function deleteSelectedHistoryGroups() {
  const keys = [...state.selectedHistoryKeys];
  if (!keys.length) return;
  await deleteHistoryGroups(keys, t("deleteSelectedConfirm"));
}

async function deleteAllHistoryGroups() {
  const confirmed = await confirmController.confirmAction({
    title: t("deleteAllTitle"),
    message: t("deleteAllConfirm"),
    confirmLabel: t("deleteLabel"),
    cancelLabel: t("cancel"),
    danger: true
  });
  if (!confirmed) return;
  const response = await sendMessage({ type: "CLEAR_LEARNING_DATA" });
  if (!response.ok) {
    showToast(response.error, "error");
    return;
  }
  state.selectedHistoryKeys.clear();
  showToast(t("problemsDeleted"));
  await refreshLearningDataOnly();
}

async function deleteHistoryGroups(keys, confirmationMessage) {
  const uniqueKeys = [...new Set(keys)].filter(Boolean);
  if (!uniqueKeys.length) return;
  const confirmed = await confirmController.confirmAction({
    title: uniqueKeys.length === 1 ? t("deleteProblem") : t("deleteSelected"),
    message: confirmationMessage,
    confirmLabel: t("deleteLabel"),
    cancelLabel: t("cancel"),
    danger: true
  });
  if (!confirmed) return;
  const response = await sendMessage({
    type: "DELETE_LEARNING_PROBLEMS",
    problemKeys: uniqueKeys
  });
  if (!response.ok) {
    showToast(response.error, "error");
    return;
  }
  uniqueKeys.forEach((key) => state.selectedHistoryKeys.delete(key));
  showToast(uniqueKeys.length === 1 ? t("problemDeleted") : t("problemsDeleted"));
  await refreshLearningDataOnly();
}

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

function handleRuntimeMessage(message) {
  if (message.type === "PAGE_CONTEXT_UPDATED") {
    applyContextUpdate(message.context, { preserveUserEditedCode: true });
    return;
  }
  if (message.type === "SUBMISSION_SNAPSHOT_SAVED") {
    if (message.context) applyContextUpdate(message.context, { preserveUserEditedCode: true });
    refreshLearningDataOnly();
    if (!state.activeRequest) {
      showToast(t("autoSnapshotSaved"));
    }
    return;
  }
  if (message.type === "TIMER_DONE_BG") {
    handleBackgroundTimerDone(message.problemKey || "");
    return;
  }
  handleAiRuntimeMessage(message);
}

async function saveHintMetadata(metadata, visibleHint) {
  const context = buildCurrentContext();
  const response = await sendMessage({
    type: "SAVE_HINT_EVENT",
    payload: {
      context: { ...context, hintLevel: state.hintLevel },
      metadata: { ...metadata, hint_level: metadata.hint_level || state.hintLevel },
      code: elements.code.value,
      selectedLine: context.selectedLine,
      storeHintText: Boolean(state.settings.allowHintTextStorage),
      visibleHint
    }
  });
  if (!response.ok) elements.streamState.textContent = response.error;
}

async function saveLearningSignal(learningSignal, userMessage) {
  if (!learningSignal || !learningSignal.topic) return;
  const context = buildCurrentContext();
  sendMessage({
    type: "SAVE_LEARNING_EVENT",
    event: {
      topic: learningSignal.topic,
      signal_type: learningSignal.signal_type || "unclear",
      confidence: Number(learningSignal.confidence || 0),
      raw_question: String(userMessage || learningSignal.raw_question || "").slice(0, 120),
      problemSlug: context.problemSlug || "",
      problemUrl: context.problemUrl || "",
      platform: context.platform || "unknown"
    }
  }).catch(() => {});
}

async function startChatRequest(userMessage) {
  if (!state.settings?.hasApiKey) {
    writeOutput(t("apiMissingAction"));
    return;
  }

  await syncActiveContext({ preserveUserEditedCode: false });
  const context = buildCurrentContext();
  if (!context.allowed) {
    writeOutput(context.reason || t("needsPractice"));
    return;
  }
  if (!context.code.trim()) {
    writeOutput(t("noCode"));
    return;
  }

  const requestId = crypto.randomUUID();
  await saveCoachMessage({
    role: "user",
    kind: "chat",
    text: userMessage,
    context
  });
  state.activeRequest = {
    requestId,
    kind: REQUEST_KINDS.chatCoach,
    rawText: "",
    context,
    userMessage
  };
  elements.metadataTags.innerHTML = "";
  elements.output.innerHTML = "";
  elements.output.classList.add("is-streaming");
  elements.streamState.textContent = t("starting");
  setBusy(true);

  let response;
  try {
    response = await sendMessage({
      type: "STREAM_AI",
      requestId,
      kind: REQUEST_KINDS.chatCoach,
      context,
      userMessage,
      chatHistory: chatHistoryForContext(state.learningData?.coachThreads || [], context, { excludeKinds: ["debug_lab"] })
    });
  } catch (error) {
    state.activeRequest = null;
    setBusy(false);
    elements.streamState.textContent = "";
    writeOutput(error.message || String(error));
    return;
  }

  if (!response.ok) {
    state.activeRequest = null;
    setBusy(false);
    elements.streamState.textContent = "";
    writeOutput(response.error);
  }
}

async function startDebugLabRequest({ action = "free_chat", userMessage = "", testCases = [] } = {}) {
  if (!state.settings?.hasApiKey) {
    debugLabController?.setOutput(t("apiMissingAction"));
    debugLabController?.setStateText("");
    return;
  }

  await syncActiveContext({ preserveUserEditedCode: false });
  const context = buildCurrentContext();
  if (!context.allowed) {
    debugLabController?.setOutput(context.reason || t("needsPractice"));
    return;
  }
  if (!context.code.trim()) {
    debugLabController?.setOutput(t("noCode"));
    return;
  }

  const requestId = crypto.randomUUID();
  await saveCoachMessage({
    role: "user",
    kind: "debug_lab",
    text: userMessage,
    context
  });
  state.activeRequest = {
    requestId,
    kind: REQUEST_KINDS.debugLab,
    debugAction: action,
    rawText: "",
    context
  };
  debugLabController?.setOutput("");
  debugLabController?.setStateText(t("starting"));
  setBusy(true);

  let response;
  try {
    response = await sendMessage({
      type: "STREAM_AI",
      requestId,
      kind: REQUEST_KINDS.debugLab,
      context,
      userMessage,
      debugAction: action,
      testCases
    });
  } catch (error) {
    state.activeRequest = null;
    setBusy(false);
    debugLabController?.setStateText("");
    debugLabController?.setOutput(error.message || String(error));
    return;
  }

  if (!response.ok) {
    state.activeRequest = null;
    setBusy(false);
    debugLabController?.setStateText("");
    debugLabController?.setOutput(response.error);
  }
}

async function saveCoachMessage({ role, kind, text, metadata = {}, context = buildCurrentContext() }) {
  if (!context.problemUrl && !context.url) return;
  const response = await sendMessage({
    type: "SAVE_COACH_THREAD_MESSAGE",
    payload: {
      context,
      message: {
        role,
        kind,
        text,
        metadata,
        contextSnapshot: {
          language: context.language || "",
          resultStatus: context.testResults?.status || "",
          selectedLineHash: context.selectedLine ? "selected" : ""
        }
      }
    }
  });
  if (!response.ok) elements.streamState.textContent = response.error;
}

async function saveCodeSnapshot(status) {
  if (status !== "passed" && status !== "failed") return;
  await syncActiveContext({ preserveUserEditedCode: false });
  const context = buildCurrentContext();
  if (!context.problemUrl) {
    writeOutput(t("needsPractice"));
    return;
  }
  if (!context.code.trim()) {
    writeOutput(t("noCode"));
    return;
  }
  const response = await sendMessage({
    type: "SAVE_CODE_SNAPSHOT",
    payload: {
      context,
      status,
      code: context.code,
      language: context.language,
      note: elements.userNote.value.trim()
    }
  });
  if (!response.ok) {
    showToast(response.error, "error");
    return;
  }
  showToast(t("snapshotSaved"));
  await refreshLearningDataOnly();
  switchView("review");
}

async function refreshLearningDataOnly() {
  const response = await sendMessage({ type: "GET_LEARNING_DATA" });
  if (response.ok) {
    state.learningData = response.data;
    renderReview();
    renderTimer();
  }
}

async function syncActiveContext({ preserveUserEditedCode = true } = {}) {
  const response = await sendMessage({ type: "GET_ACTIVE_CONTEXT" });
  if (!response.ok || !response.context) return;
  applyContextUpdate(response.context, { preserveUserEditedCode });
}

async function handleCodeRefreshClick() {
  if (!elements.codeFormatBtn) return;
  elements.codeFormatBtn.disabled = true;
  try {
    const response = await sendMessage({ type: "GET_ACTIVE_CONTEXT" });
    if (!response.ok || !response.context) throw new Error(response.error || t("codeRefreshFailed"));
    applyContextUpdate(response.context, { preserveUserEditedCode: false, force: true });
    showToast(response.context.code ? t("codeRefreshSuccess") : t("codeRefreshFailed"), response.context.code ? "success" : "error");
  } catch (error) {
    showToast(error?.message || t("codeRefreshFailed"), "error");
  } finally {
    elements.codeFormatBtn.disabled = false;
  }
}

function resetPerProblemUiState() {
  state.lastCodeSuggestion = "";
  state.lastAnalysis = "";
  state.lastMetadata = null;
  state.pendingNoteContext = null;
  state.pendingGeneratedNote = null;
  if (elements.codeSuggestion) elements.codeSuggestion.textContent = "";
  if (elements.codeSuggestionPanel) elements.codeSuggestionPanel.hidden = true;
  if (elements.metadataTags) elements.metadataTags.innerHTML = "";
  if (elements.output) elements.output.innerHTML = "";
  if (elements.streamState) elements.streamState.textContent = "";
  if (elements.userNote) elements.userNote.value = "";
  if (elements.noteOutput) elements.noteOutput.value = "";
  if (blockEditor) blockEditor.clear(); else if (elements.noteEditorContent) elements.noteEditorContent.innerHTML = "";
  if (elements.noteEditorTitle) elements.noteEditorTitle.value = "";
  if (elements.noteStreamState) elements.noteStreamState.textContent = "";
  debugLabController?.clearOutput();
  debugLabController?.setStateText("테스트케이스와 코드 기준으로 더 구체적으로 물어보세요.");
}

function applyContextUpdate(context, { preserveUserEditedCode = true, force = false } = {}) {
  if (!context?.url) return;
  const nextSignature = contextSignature(context);
  if (!force && nextSignature === state.lastContextSignature) return;
  const previousProblemUrl = state.context?.problemUrl || "";
  const nextProblemUrl = context.problemUrl || "";
  const problemChanged = previousProblemUrl && nextProblemUrl && previousProblemUrl !== nextProblemUrl;
  if (problemChanged) {
    resetPerProblemUiState();
  }
  state.lastContextSignature = nextSignature;
  state.context = { ...(state.context || {}), ...context };
  state.lastContextUpdateAt = context.capturedAt || new Date().toISOString();

  elements.language.value = context.language || elements.language.value || "";
  const userIsEditingPanelCode = document.activeElement === elements.code || Boolean(document.activeElement?.closest?.(".CodeMirror"));
  // When the problem itself changed, always pull in the new code — preserveUserEditedCode
  // only protects in-problem edits, not stale focus left on the panel editor from a prior problem.
  if (context.code && (problemChanged || !(preserveUserEditedCode && userIsEditingPanelCode))) {
    elements.code.value = context.code;
    codeEditorController?.setValue(context.code);
    clearCodeSelection();
  }
  if (context.problemContext && document.activeElement !== elements.problemContext) {
    elements.problemContext.value = context.problemContext;
    if (elements.problemDescriptionDisplay) {
      const raw = elements.problemContext.value || "";
      elements.problemDescriptionDisplay.textContent = raw.length > 400
        ? raw.slice(0, 400) + "…"
        : raw;
    }
  }


  renderStatus();
  renderContextCards({ elements, context: state.context || {}, settings: state.settings || {}, t });
  renderTimer();
  renderCodeEditor();
  debugLabController?.hydrateFromContext();
  renderQuickChecks();
  setActionAvailability();
}

function buildCurrentContext() {
  const base = state.context || {};
  const selectedContext = _codeSelText;
  const currentCode = codeEditorController?.getValue() ?? elements.code.value;
  const selectedLine = getSelectedTextFromTextarea(elements.code) || _codeSelText;
  return {
    ...base,
    language: elements.language.value.trim() || base.language || "",
    code: currentCode,
    problemContext: elements.includeProblemContext.checked ? elements.problemContext.value.trim() : "",
    selectedLine,
    selectedContext,
    userNote: elements.userNote.value.trim(),
    testResults: base.testResults || null,
    elapsedMs: timerElapsedMs(currentProblemMetadata()),
    previousCategories: getPreviousCategories(),
    codeHistory: getCurrentProblemSnapshots(),
    allowAnswerInUnsolvedNotes: Boolean(state.settings?.allowAnswerInUnsolvedNotes),
    responseLanguage: state.settings?.responseLanguage || "ko"
  };
}

function contextSignature(context) {
  return [
    context?.url || "",
    context?.allowed || false,
    context?.problemUrl || "",
    context?.language || "",
    context?.code || "",
    context?.problemContext || "",
    JSON.stringify(context?.testResults || {})
  ].join("\n---\n");
}

function getPreviousCategories() {
  const problemUrl = state.context?.problemUrl;
  if (!problemUrl || !state.learningData?.hintEvents) return [];
  return [
    ...new Set(
      state.learningData.hintEvents
        .filter((event) => event.problemUrl === problemUrl)
        .flatMap((event) => event.categories || [])
    )
  ];
}

function getCategoriesForProblem(problemKey) {
  if (!problemKey || !state.learningData?.hintEvents) return [];
  return [
    ...new Set(
      state.learningData.hintEvents
        .filter((event) => historyGroupKey(event) === problemKey)
        .flatMap((event) => event.categories || [])
    )
  ];
}

function getCurrentProblemSnapshots() {
  const problemUrl = state.context?.problemUrl;
  if (!problemUrl) return [];
  return [...(state.learningData?.codeSnapshots || [])]
    .filter((item) => item.problemUrl === problemUrl)
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

function currentProblemKey() {
  const context = state.context || {};
  if (!context.problemUrl) return "";
  return historyGroupKey(context);
}

function currentProblemMetadata() {
  const key = currentProblemKey();
  return key ? state.learningData?.problemMetadata?.[key] || {} : {};
}

function renderTimerDurationControl(duration) {
  const keepCustomDraft = elements.timerDuration.value === "custom" && !customTimerMinutes() && !elements.timerCustomMinutes.hidden;
  if (keepCustomDraft) {
    elements.timerDuration.value = "custom";
    elements.timerCustomMinutes.hidden = false;
    return;
  }
  const presetValues = [...elements.timerDuration.options]
    .map((option) => option.value)
    .filter((value) => value !== "custom");
  const durationValue = String(duration);
  const isPreset = presetValues.includes(durationValue);
  elements.timerDuration.value = isPreset ? durationValue : "custom";
  elements.timerCustomMinutes.hidden = isPreset;
  if (!isPreset && document.activeElement !== elements.timerCustomMinutes) {
    elements.timerCustomMinutes.value = String(Math.max(1, Math.round(duration / 60000)));
  }
}

function customTimerMinutes() {
  const minutes = Number(elements.timerCustomMinutes.value);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.min(240, Math.max(1, Math.round(minutes)));
}

function selectedTimerDurationMs() {
  if (elements.timerDuration.value === "custom") {
    const minutes = customTimerMinutes();
    return minutes ? minutes * 60 * 1000 : DEFAULT_TIMER_DURATION_MS;
  }
  const value = Number(elements.timerDuration.value);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMER_DURATION_MS;
}

function timerDurationMs(metadata = {}) {
  return timerDurationMsForMetadata(metadata, selectedTimerDurationMs());
}

function timerRemainingMs(metadata = {}) {
  return timerRemainingMsForMetadata(metadata, selectedTimerDurationMs());
}

function timerElapsedMs(metadata = {}) {
  return timerElapsedMsForMetadata(metadata, selectedTimerDurationMs());
}

function applyHistoryFilters(groups) {
  return applyHistoryFiltersToGroups(groups, {
    query: state.historySearch,
    platform: state.historyPlatform,
    status: state.historyStatus,
    sort: state.historySort
  });
}

function groupElapsedMs(group) {
  const snapshotElapsed = Math.max(0, ...(group.items || []).map((item) => Number(item.elapsedMs) || 0));
  const metadataElapsed = timerElapsedMs(group.metadata || {});
  return Math.max(snapshotElapsed, metadataElapsed);
}

function reviewLabelFor(value) {
  if (!value) return t("reviewDueToday");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t("reviewDueToday");
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date <= today) return t("reviewDueToday");
  return t("reviewFuture").replace("{date}", date.toLocaleDateString());
}

function noteStatusForCurrentProblem() {
  if (state.context?.testResults?.status === "passed" && state.context?.testResults?.kind !== "run") return "solved";
  if (state.context?.testResults?.status === "failed") return "unsolved";
  const snapshots = getCurrentProblemSnapshots();
  if (snapshots.some((item) => item.status === "passed")) return "solved";
  if (snapshots.some((item) => item.status === "failed")) return "unsolved";
  return "in_progress";
}

function hydrateModelOptions() {
  addModelOptionsToForm(elements, DEFAULT_MODEL_CHOICES, document);
}

async function saveSettingsFromPanel() {
  elements.settingsState.textContent = t("settingsSaving");
  const patch = settingsPatchFromForm(elements);

  const response = await sendMessage({ type: "SAVE_SETTINGS", settings: patch });
  if (!response.ok) {
    elements.settingsState.textContent = response.error;
    return;
  }
  state.settings = response.settings;
  hydrateContextFields(state.context || {});
  renderAll();
  elements.settingsState.textContent = "";
  closeSettingsModal();
  showToast(t("settingsSaved"));
}

async function saveUiLanguage() {
  state.settings = { ...(state.settings || {}), uiLanguage: elements.uiLanguage.value, uiLanguageExplicit: true };
  elements.settingsUiLanguage.value = elements.uiLanguage.value;
  renderAll();
  await sendMessage({ type: "SAVE_SETTINGS", settings: { uiLanguage: elements.uiLanguage.value, uiLanguageExplicit: true } });
}

async function saveContextPreference() {
  state.settings = { ...(state.settings || {}), includeProblemContextByDefault: elements.includeProblemContext.checked };
  await sendMessage({ type: "SAVE_SETTINGS", settings: { includeProblemContextByDefault: elements.includeProblemContext.checked } });
}

function switchView(view) {
  const normalized = view || "coach";
  const contentView = normalized === "code" ? "coach" : normalized === "history" ? "review" : normalized;
  if (contentView !== "note") {
    closeNoteEditor();
  }
  if (elements.reviewAddModal && !elements.reviewAddModal.hidden) {
    elements.reviewAddModal.hidden = true;
  }
  for (const [name, button] of Object.entries({ coach: elements.coachTab, note: elements.noteTab, review: elements.reviewTab })) {
    button.classList.toggle("active", name === contentView);
  }
  elements.coachView.classList.toggle("active", contentView === "coach");
  elements.noteView.classList.toggle("active", contentView === "note");
  elements.reviewView.classList.toggle("active", contentView === "review");
  railController?.activate(normalized);
  if (normalized === "coach") restoreGeneratedNoteSaveCard();
}

function setActionAvailability() {
  const disabled = !state.context?.allowed || Boolean(state.activeRequest);
  [elements.hint, elements.explainLine, elements.analyze, elements.nextCodeHint, elements.generateNote].forEach((button) => {
    button.disabled = disabled;
  });
  [
    elements.debugExplainLine,
    elements.debugEfficiency,
    elements.debugTestcaseExpChip,
    elements.debugTcAiSuggest,
    elements.debugTcAnalyze,
    elements.debugLabSend
  ].forEach((button) => {
    if (button) button.disabled = disabled;
  });
  [elements.saveNote].forEach((button) => {
    button.disabled = !state.context?.allowed || Boolean(state.activeRequest);
  });
  elements.saveCodeDiffReview.disabled = Boolean(state.activeRequest) || !state.pendingDiffContext;
}

function setBusy(isBusy) {
  [elements.refresh, elements.hint, elements.explainLine, elements.analyze, elements.nextCodeHint, elements.generateNote].forEach((button) => {
    button.disabled = isBusy;
  });
  [
    elements.debugExplainLine,
    elements.debugEfficiency,
    elements.debugTestcaseExpChip,
    elements.debugTcAiSuggest,
    elements.debugTcAnalyze,
    elements.debugLabSend
  ].forEach((button) => {
    if (button) button.disabled = isBusy;
  });
  elements.saveCodeDiffReview.disabled = isBusy || !state.pendingDiffContext;
  if (!isBusy) setActionAvailability();
}

function setPill(node, text, tone) {
  node.textContent = text;
  node.className = `pill ${tone}`;
}

function writeOutput(text, hint) {
  const kind = hint?.kind ?? state.activeRequest?.kind;
  const debugAction = hint?.debugAction ?? state.activeRequest?.debugAction;
  if (kind === REQUEST_KINDS.debugLab) {
    if (debugAction === "suggest_testcases") {
      debugLabController?.handleSuggestStream(text || "", { isFinal: Boolean(hint?.debugAction) });
      return;
    }
    debugLabController?.setOutput(text || "");
    return;
  }
  const formatted = formatReadableOutput(text || "");
  chatController?.writeAssistant(formatted);
}

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

function handleCodeSelBtnClick() {
  if (_codeSelText) {
    clearCodeSelection();
  } else {
    autoCaptureCodeSelection();
  }
}

function autoCaptureCodeSelection() {
  const selected = getSelectedTextFromTextarea(elements.code);
  if (!selected) return;
  const code = elements.code.value;
  _codeSelText = selected;
  _codeSelStartLine = code.substring(0, elements.code.selectionStart).split("\n").length - 1;
  _codeSelEndLine = code.substring(0, elements.code.selectionEnd).split("\n").length - 1;
  updateCodeSelOverlay();
  updateCodeSelButton();
}

function clearCodeSelection() {
  _codeSelText = "";
  _codeSelStartLine = -1;
  _codeSelEndLine = -1;
  updateCodeSelOverlay();
  updateCodeSelButton();
}

function updateCodeSelButton() {
  const btn = elements.codeSelBtn;
  if (!btn) return;
  if (_codeSelText) {
    btn.hidden = false;
    btn.classList.add("is-locked");
    btn.textContent = "× 선택 취소";
  } else if (getSelectedTextFromTextarea(elements.code)) {
    btn.hidden = false;
    btn.classList.remove("is-locked");
    btn.textContent = "선택";
  } else {
    btn.hidden = true;
    btn.classList.remove("is-locked");
  }
}

function updateCodeSelOverlay() {
  const overlay = elements.codeSelOverlay;
  if (!overlay) return;
  overlay.innerHTML = "";
  if (_codeSelStartLine < 0) return;
  const lineHeight = 12.5 * 1.65;
  const paddingTop = 12;
  const scrollTop = elements.code.scrollTop;
  for (let i = _codeSelStartLine; i <= _codeSelEndLine; i++) {
    const el = document.createElement("div");
    el.className = "code-sel-line";
    el.style.top = `${paddingTop + i * lineHeight - scrollTop}px`;
    overlay.appendChild(el);
  }
}

function getSelectedTextFromTextarea(textarea) {
  if (textarea.selectionStart === textarea.selectionEnd) return "";
  return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).trim();
}

function snapshotStatusLabel(status) {
  return snapshotStatusLabelForLanguage(status, uiLang());
}

function statusIcon(status) {
  return statusIconForLabels(status, { passed: t("solvedMark"), failed: t("failedMark") });
}

function sessionStatusIcon(status) {
  return statusIcon(sessionStatusToSnapshotStatus(status));
}

function sessionStatusToSnapshotStatus(status) {
  if (status === "solved") return "passed";
  if (status === "unsolved") return "failed";
  return "";
}

function iconSvg(name) {
  const paths = {
    bookmark: '<path d="M6 4.75A2.75 2.75 0 0 1 8.75 2h6.5A2.75 2.75 0 0 1 18 4.75v16l-6-3.25L6 20.75v-16Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    edit: '<path d="m4 16.5-.75 4.25L7.5 20 18.75 8.75a2.12 2.12 0 0 0-3-3L4.5 17Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m14.5 7 2.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    trash: '<path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" fill="currentColor"/><path d="M7 9h10l-.7 11H7.7L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" fill="currentColor"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ""}</svg>`;
}

function applyChatFontSize(value) {
  const size = [12, 13, 14, 15, 16].includes(Number(value)) ? Number(value) : 14;
  document.documentElement.style.setProperty("--chat-font-size", `${size}px`);
}

function formatTestResultStatus(testResults) {
  if (!testResults) return "";
  const statusLabels = {
    passed: t("testPassed"),
    failed: t("testFailed"),
    unknown: t("testUnknown")
  };
  const cases = Array.isArray(testResults.cases) ? testResults.cases : [];
  const passed = cases.filter((item) => item.status === "passed").length;
  const total = cases.length;
  const caseSummary = total ? ` (${passed}/${total})` : "";
  return `${statusLabels[testResults.status] || statusLabels.unknown}${caseSummary}`;
}

function uiLang() {
  return resolveUiLanguage({
    settingsLanguage: state.settings?.uiLanguage,
    selectedLanguage: elements.uiLanguage.value
  });
}

function emptyLearningData() {
  return {
    sessionsByUrl: {},
    hintEvents: [],
    savedNotes: [],
    codeSnapshots: [],
    problemMetadata: {},
    topCategories: [],
    topProblemTypeTags: [],
    topCautionPointTags: [],
    topImplementationHintTags: []
  };
}

function categoryLabel(category) {
  return categoryLabelForLanguage(category, HINT_CATEGORY_LABELS, uiLang());
}

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

function computePlannerCompletion(groups) {
  const entries = (groups || []).flatMap((group) => {
    const schedule = group.metadata?.reviewSchedule;
    return Array.isArray(schedule) ? schedule : [];
  }).filter((entry) => entry?.date);

  const today = localDateString(new Date());
  const weekStart = addDays(today, -6);
  const monthStart = addDays(today, -29);

  return {
    overall: completionRate(entries),
    week: completionRate(entries.filter((entry) => entry.date >= weekStart && entry.date <= today)),
    month: completionRate(entries.filter((entry) => entry.date >= monthStart && entry.date <= today))
  };
}

function completionRate(entries) {
  if (!entries.length) return 0;
  return Math.round((entries.filter((entry) => Boolean(entry.completedAt)).length / entries.length) * 100);
}

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(dateString, days) {
  const date = new Date(dateString + "T00:00:00");
  date.setDate(date.getDate() + days);
  return localDateString(date);
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

function taxonomyLabelForLanguage(axis, category) {
  return taxonomyLabel(axis, category, uiLang());
}

function humanizeCategory(category) {
  return humanizeCategoryForLanguage(category, uiLang());
}

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}
