export function addModelOptions(elements, models, documentRef = document) {
  [elements.settingsHintModel, elements.settingsAnalyzeModel, elements.settingsNoteModel, elements.composerModelSelect].forEach((select) => {
    if (!select) return;
    const current = select.value;
    const existing = new Set([...select.options].map((option) => option.value));
    models.forEach((model) => {
      if (!model || existing.has(model)) return;
      const option = documentRef.createElement("option");
      option.value = model;
      option.textContent = model;
      select.append(option);
      existing.add(model);
    });
    if (current) select.value = current;
  });
}

export function hydrateSettingsForm({ elements, settings = {}, t, documentRef = document }) {
  elements.uiLanguage.value = settings.uiLanguage || "ko";
  elements.settingsUiLanguage.value = settings.uiLanguage || "ko";
  elements.settingsResponseLanguage.value = settings.responseLanguage || "ko";
  if (elements.settingsChatFontSize) elements.settingsChatFontSize.value = String(settings.chatFontSize || 14);
  addModelOptions(elements, [settings.hintModel, settings.analyzeModel, settings.noteModel].filter(Boolean), documentRef);
  elements.settingsHintModel.value = settings.hintModel || "";
  elements.settingsAnalyzeModel.value = settings.analyzeModel || "";
  elements.settingsNoteModel.value = settings.noteModel || "";
  if (elements.composerModelSelect) elements.composerModelSelect.value = settings.hintModel || "";
  elements.settingsConfirmBeforeAi.checked = Boolean(settings.confirmBeforeAi);
  elements.settingsIncludeProblemContext.checked = settings.includeProblemContextByDefault !== false;
  if (elements.settingsSaveCode) elements.settingsSaveCode.checked = true;
  elements.settingsStoreHintText.checked = Boolean(settings.allowHintTextStorage);
  elements.settingsAllowUnsolvedAnswer.checked = Boolean(settings.allowAnswerInUnsolvedNotes);
  elements.settingsAutoSaveSubmissions.checked = settings.autoSaveSubmissionSnapshots !== false;
  if (elements.settingsCloudSync) elements.settingsCloudSync.checked = Boolean(settings.cloudSync);
}

export function hydrateContextPreferenceControls(elements, settings = {}, context = {}) {
  elements.language.value = context.language || "";
  elements.includeProblemContext.checked = settings.includeProblemContextByDefault !== false;
  if (elements.saveCode) elements.saveCode.checked = true;
}

export function settingsPatchFromForm(elements) {
  return {
    hintModel: elements.settingsHintModel.value.trim(),
    analyzeModel: elements.settingsAnalyzeModel.value.trim(),
    noteModel: elements.settingsNoteModel.value.trim(),
    responseLanguage: elements.settingsResponseLanguage.value,
    uiLanguage: elements.settingsUiLanguage.value,
    uiLanguageExplicit: true,
    chatFontSize: Number(elements.settingsChatFontSize?.value) || 14,
    confirmBeforeAi: elements.settingsConfirmBeforeAi.checked,
    confirmBeforeAiExplicit: true,
    includeProblemContextByDefault: elements.settingsIncludeProblemContext.checked,
    allowHintTextStorage: elements.settingsStoreHintText.checked,
    allowAnswerInUnsolvedNotes: elements.settingsAllowUnsolvedAnswer.checked,
    autoSaveSubmissionSnapshots: elements.settingsAutoSaveSubmissions.checked,
    cloudSync: Boolean(elements.settingsCloudSync?.checked)
  };
}
