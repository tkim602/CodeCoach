import { REQUEST_KINDS } from "../shared/constants.js";
import { parseMarkedAiOutput, visiblePortionFromPartial } from "../shared/prompts.js";
import { normalizeTaxonomyMetadata } from "../shared/taxonomy/index.js";
import { comparableSnapshotPair } from "./sidepanel.history.js";
import { platformLabel } from "./sidepanel.utils.js";

export function createAiController({
  elements,
  getState,
  setState,
  sendMessage,
  syncActiveContext,
  buildCurrentContext,
  noteStatusForCurrentProblem,
  saveHintMetadata,
  saveLearningSignal = async () => {},
  saveCoachMessage = async () => {},
  refreshLearningDataOnly,
  openSettingsModal,
  openCodeDiffModal,
  updateCodeDiffReview,
  renderNotePreview,
  openNoteEditorPanel,
  promptSaveGeneratedNote = null,
  switchView,
  writeOutput,
  appendAssistantMetadata,
  setBusy,
  categoryLabel,
  taxonomyLabel = (_axis, category) => categoryLabel(category),
  getCategoriesForProblem,
  t,
  showToast = () => {},
  documentRef = document,
  confirmRef = globalThis.confirm?.bind(globalThis) || (() => true),
  randomUUID = () => crypto.randomUUID()
}) {
  async function startAiRequest(kind, userMessageText = "") {
    const state = getState();
    if (!state.settings?.hasApiKey) {
      writeOutput(t("apiMissingAction"));
      setActiveStreamState("");
      return;
    }

    await syncActiveContext({ preserveUserEditedCode: false });
    const nextState = getState();
    const context = buildCurrentContext();
    if (!context.allowed) {
      writeOutputForKind(kind, context.reason || t("needsPractice"));
      return;
    }
    if (!context.code.trim()) {
      writeOutputForKind(kind, t("noCode"));
      return;
    }
    if (kind === REQUEST_KINDS.explainLine && !context.selectedLine) {
      writeOutputForKind(kind, t("selectLine"));
      return;
    }
    if (nextState.settings.confirmBeforeAi && !confirmAiRequest(context)) {
      writeOutputForKind(kind, t("canceled"));
      return;
    }
    if (userMessageText) {
      await saveCoachMessage({
        role: "user",
        kind,
        text: userMessageText,
        context
      });
    }

    // Show one-time disclosure about OpenAI data transmission on first AI request
    if (!nextState.settings?.openaiDisclosureShown) {
      showToast(t("openaiDisclosureToast"), "info", documentRef);
      sendMessage({ type: "SAVE_SETTINGS", settings: { openaiDisclosureShown: true } }).catch(() => {});
      setState({ settings: { ...nextState.settings, openaiDisclosureShown: true } });
    }

    const requestId = randomUUID();
    const patch = { activeRequest: { requestId, kind, rawText: "", context } };
    if (kind === REQUEST_KINDS.note) patch.pendingNoteContext = null;
    setState(patch);
    clearOutputForKind(kind);
    elements.metadataTags.innerHTML = "";
    setActiveStreamState(t("starting"));
    setBusy(true);

    let response;
    try {
      response = await sendMessage({
        type: "STREAM_AI",
        requestId,
        kind,
        context,
        hintLevel: nextState.hintLevel,
        status: kind === REQUEST_KINDS.note ? noteStatusForCurrentProblem() : undefined,
        analysisText: nextState.lastAnalysis
      });
    } catch (error) {
      setState({ activeRequest: null });
      setBusy(false);
      setStreamStateForKind(kind, "");
      writeOutputForKind(kind, error.message || String(error));
      return;
    }

    if (!response.ok) {
      setState({ activeRequest: null });
      setBusy(false);
      setStreamStateForKind(kind, "");
      writeOutputForKind(kind, response.error);
    }
  }

  function handleRuntimeMessage(message) {
    const state = getState();
    if (!state.activeRequest || message.requestId !== state.activeRequest.requestId) return false;

    if (message.type === "AI_STREAM_START") {
      const kindKey = {
        hint: "hintStreaming",
        explainLine: "explainLineStreaming",
        analyze: "analyzeStreaming",
        chat_coach: "chatStreaming",
        note: "noteStreaming",
        debug_lab: "debugStreaming",
        next_code_hint: "nextCodeHintStreaming"
      }[state.activeRequest?.kind] || "streaming";
      setActiveStreamState(t(kindKey));
      return true;
    }
    if (message.type === "AI_STREAM_DELTA") {
      const rawText = message.rawText || `${state.activeRequest.rawText}${message.delta || ""}`;
      setState({ activeRequest: { ...state.activeRequest, rawText } });
      writeOutputForKind(state.activeRequest.kind, visiblePortionFromPartial(rawText));
      return true;
    }
    if (message.type === "AI_STREAM_DONE") {
      setState({ activeRequest: { ...state.activeRequest, rawText: message.rawText || state.activeRequest.rawText } });
      finishAiRequest();
      return true;
    }
    if (message.type === "AI_STREAM_ERROR") {
      const kind = state.activeRequest.kind;
      setState({ activeRequest: null });
      setBusy(false);
      setStreamStateForKind(kind, "");
      writeOutputForKind(kind, message.error || "AI request failed.");
      return true;
    }
    return false;
  }

  async function finishAiRequest() {
    const request = getState().activeRequest;
    const parsed = parseMarkedAiOutput(request.rawText);
    const visible = parsed.visible || visiblePortionFromPartial(request.rawText);
    const metadata = parsed.metadata || {};
    setState({ lastMetadata: metadata, activeRequest: null });
    setBusy(false);
    setStreamStateForKind(request.kind, t("done"));

    const strictNoCode = request.kind === REQUEST_KINDS.hint || request.kind === REQUEST_KINDS.explainLine;
    if (strictNoCode && (metadata.contains_solution_code || looksLikeFullCode(visible))) {
      writeOutputForKind(request.kind, t("blockedCode"));
      return;
    }
    if (request.kind === REQUEST_KINDS.chatCoach && metadata.contains_solution_code) {
      writeOutputForKind(request.kind, t("blockedCode"));
      return;
    }
    if (request.kind === REQUEST_KINDS.nextCodeHint && looksLikeTooMuchCodeSuggestion(visible)) {
      writeOutput(t("blockedSuggestion"));
      return;
    }
    if (!visible.trim()) {
      writeOutputForKind(request.kind, t("emptyAi"));
      return;
    }

    if (request.kind === REQUEST_KINDS.note) {
      setState({ pendingNoteContext: request.context });
      if (elements.noteOutput) elements.noteOutput.value = visible;
      renderNotePreview();
      writeOutput(visible);
      promptSaveGeneratedNote?.({ content: visible, context: request.context });
    } else if (request.kind === REQUEST_KINDS.codeDiff) {
      setState({ lastCodeDiffReview: visible });
      updateCodeDiffReview(visible);
    } else if (request.kind === REQUEST_KINDS.nextCodeHint) {
      const lastCodeSuggestion = visible.trim();
      setState({ lastCodeSuggestion });
      elements.codeSuggestion.textContent = lastCodeSuggestion;
      elements.codeSuggestionPanel.hidden = false;
      writeOutput(visible);
    } else if (request.kind === REQUEST_KINDS.debugLab) {
      writeOutput(visible, { kind: request.kind, debugAction: request.debugAction });
    } else {
      writeOutput(visible);
    }

    if (request.kind === REQUEST_KINDS.hint || request.kind === REQUEST_KINDS.nextCodeHint) {
      renderTags(metadata);
    }
    if (request.kind === REQUEST_KINDS.hint || request.kind === REQUEST_KINDS.nextCodeHint) {
      await saveHintMetadata(metadata, visible);
      await saveCoachMessage({
        role: "assistant",
        kind: request.kind,
        text: visible,
        metadata,
        context: request.context
      });
    } else if (request.kind === REQUEST_KINDS.chatCoach || request.kind === REQUEST_KINDS.debugLab) {
      await saveCoachMessage({
        role: "assistant",
        kind: request.kind === REQUEST_KINDS.debugLab ? "debug_lab" : "chat",
        text: visible,
        metadata,
        context: request.context
      });
      if (request.kind === REQUEST_KINDS.chatCoach && metadata.learning_signal) {
        await saveLearningSignal(metadata.learning_signal, request.userMessage);
      }
    } else if (request.kind === REQUEST_KINDS.analyze) {
      setState({ lastAnalysis: visible });
      await saveCoachMessage({
        role: "assistant",
        kind: request.kind,
        text: visible,
        metadata,
        context: request.context
      });
    } else if (request.kind === REQUEST_KINDS.note) {
      await saveCoachMessage({
        role: "assistant",
        kind: request.kind,
        text: visible,
        metadata,
        context: request.context
      });
    }
    await refreshLearningDataOnly();
  }

  async function startCodeDiffRequest(group) {
    const state = getState();
    if (!state.settings?.hasApiKey) {
      writeOutput(t("apiMissingAction"));
      return;
    }
    const pair = comparableSnapshotPair(group);
    if (!pair) return;
    const context = {
      ...(state.context || {}),
      allowed: true,
      platform: group.platform,
      platformName: platformLabel(group.platform),
      problemUrl: pair.passed.problemUrl || pair.failed.problemUrl,
      problemSlug: pair.passed.problemSlug || pair.failed.problemSlug,
      title: group.title,
      language: pair.passed.language || pair.failed.language || "",
      code: pair.passed.code || "",
      previousCategories: getCategoriesForProblem(group.key),
      failedSnapshot: pair.failed,
      passedSnapshot: pair.passed,
      responseLanguage: state.settings?.responseLanguage || "ko"
    };
    if (state.settings.confirmBeforeAi && !confirmAiRequest(context)) {
      elements.codeDiffState.textContent = t("canceled");
      return;
    }
    setState({ pendingDiffContext: context, lastCodeDiffReview: "" });
    openCodeDiffModal(group, pair);
    const requestId = randomUUID();
    setState({ activeRequest: { requestId, kind: REQUEST_KINDS.codeDiff, rawText: "", context } });
    updateCodeDiffReview("");
    setActiveStreamState(t("starting"));
    setBusy(true);
    let response;
    try {
      response = await sendMessage({
        type: "STREAM_AI",
        requestId,
        kind: REQUEST_KINDS.codeDiff,
        context
      });
    } catch (error) {
      setState({ activeRequest: null });
      setBusy(false);
      elements.codeDiffState.textContent = error.message || String(error);
      return;
    }
    if (!response.ok) {
      setState({ activeRequest: null });
      setBusy(false);
      elements.codeDiffState.textContent = response.error;
    }
  }

  function writeOutputForKind(kind, text) {
    if (kind === REQUEST_KINDS.note) {
      if (elements.noteOutput) elements.noteOutput.value = text || "";
      renderNotePreview();
      writeOutput(text, { kind });
      return;
    }
    if (kind === REQUEST_KINDS.codeDiff) {
      setState({ lastCodeDiffReview: text || "" });
      updateCodeDiffReview(text || "");
      return;
    }
    if (kind === REQUEST_KINDS.nextCodeHint) {
      elements.codeSuggestion.textContent = text || "";
      elements.codeSuggestionPanel.hidden = false;
      writeOutput(text, { kind });
      return;
    }
    writeOutput(text, { kind });
  }

  function clearOutputForKind(kind) {
    if (kind === REQUEST_KINDS.note) {
      if (elements.noteOutput) elements.noteOutput.value = "";
      renderNotePreview();
      if (elements.noteStreamState) elements.noteStreamState.textContent = "";
      return;
    }
    if (kind === REQUEST_KINDS.codeDiff) {
      setState({ lastCodeDiffReview: "" });
      updateCodeDiffReview("");
      elements.codeDiffState.textContent = "";
      return;
    }
    if (kind === REQUEST_KINDS.nextCodeHint) {
      setState({ lastCodeSuggestion: "" });
      elements.codeSuggestion.textContent = "";
      elements.codeSuggestionPanel.hidden = false;
    }
    writeOutput("");
    elements.streamState.textContent = "";
  }

  function setActiveStreamState(text) {
    const state = getState();
    if (!state.activeRequest) {
      elements.streamState.textContent = text || "";
      return;
    }
    setStreamStateForKind(state.activeRequest.kind, text);
  }

  function setStreamStateForKind(kind, text) {
    if (kind === REQUEST_KINDS.note) {
      elements.noteStreamState.textContent = text || "";
      return;
    }
    if (kind === REQUEST_KINDS.codeDiff) {
      elements.codeDiffState.textContent = text || "";
      return;
    }
    if (kind === REQUEST_KINDS.debugLab) {
      elements.debugLabState.textContent = text || "";
      return;
    }
    elements.streamState.textContent = text || "";
  }

  function renderTags(metadataOrCategories) {
    elements.metadataTags.innerHTML = "";
    // Tags are saved in metadata but not displayed in the chat UI
  }

  function tagsForDisplay(metadataOrCategories) {
    if (Array.isArray(metadataOrCategories)) {
      return metadataOrCategories.map((category) => ({
        prefix: t("taxonomyImplementationTag"),
        label: categoryLabel(category)
      }));
    }

    const metadata = metadataOrCategories || {};
    const normalized = normalizeTaxonomyMetadata(metadata);
    const problemTags = normalized.problemTypeTags.map((tag) => ({
      prefix: t("taxonomyProblemTag"),
      label: taxonomyLabel("problem", tag)
    }));
    const cautionTags = normalized.cautionPointTags.map((tag) => ({
      prefix: t("taxonomyCautionTag"),
      label: taxonomyLabel("caution", tag)
    }));
    const implementationTags = normalized.implementationHintTags.map((tag) => ({
      prefix: t("taxonomyImplementationTag"),
      label: taxonomyLabel("implementation", tag)
    }));
    return [...problemTags, ...cautionTags, ...implementationTags];
  }

  function confirmAiRequest(context) {
    const selected = context.selectedContext ? "selected visible context, " : "";
    const problemContext = context.problemContext ? "short visible problem context, " : "";
    return confirmRef(`This request may send your current code, ${selected}${problemContext}selected line, and note to OpenAI using your own API key. Continue?`);
  }

  return {
    clearOutputForKind,
    handleRuntimeMessage,
    renderTags,
    setActiveStreamState,
    setStreamStateForKind,
    startAiRequest,
    startCodeDiffRequest,
    writeOutputForKind
  };
}

export function looksLikeFullCode(text) {
  const trimmed = text.trim();
  if (/```/.test(trimmed)) return true;
  if (/\bclass\s+Solution\b/.test(trimmed)) return true;
  if (/^\s*(def|function|public|private|const|let|var)\s+/m.test(trimmed) && trimmed.split("\n").length > 6) return true;
  return false;
}

export function looksLikeTooMuchCodeSuggestion(text) {
  const trimmed = String(text || "").trim();
  const nonEmptyLines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
  if (nonEmptyLines.length > 3) return true;
  if (/```/.test(trimmed)) return true;
  if (/\bclass\s+Solution\b/.test(trimmed)) return true;
  if (/^\s*(def|function|public|private|class)\s+/m.test(trimmed)) return true;
  return false;
}
