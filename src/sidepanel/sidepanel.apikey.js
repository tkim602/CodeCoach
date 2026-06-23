export function createApiKeyController({
  elements,
  onSave,
  onTestSuccess,
  showToast,
  t,
  sendMessage,
  confirmAction = defaultConfirmAction,
  getSettings = () => null
}) {
  const modal = document.getElementById("apikey-modal");
  const closeBtn = document.getElementById("close-apikey");
  const backBtn = document.getElementById("apikey-back-btn");
  const modalSubtitle = document.getElementById("apikey-modal-subtitle");

  // State 1: save view
  const viewSave = document.getElementById("apikey-view-save");
  const saveInput = document.getElementById("apikey-input");
  const saveToggleVis = document.getElementById("apikey-toggle-vis");
  const saveBtn = document.getElementById("apikey-save");
  const saveError = document.getElementById("apikey-save-error");

  // State 2: saved view
  const viewSaved = document.getElementById("apikey-view-saved");
  const maskedValue = document.getElementById("apikey-masked-value");
  const copyBtn = document.getElementById("apikey-copy-btn");
  const testBtn = document.getElementById("apikey-test");
  const replaceBtn = document.getElementById("apikey-replace");
  const deleteBtn = document.getElementById("apikey-delete");

  // State 3: replace view
  const viewReplace = document.getElementById("apikey-view-replace");
  const replaceInput = document.getElementById("apikey-replace-input");
  const replaceToggleVis = document.getElementById("apikey-replace-toggle-vis");
  const saveNewBtn = document.getElementById("apikey-save-new");
  const replaceCancelBtn = document.getElementById("apikey-replace-cancel");
  const replaceError = document.getElementById("apikey-replace-error");

  // State 4: testing view
  const viewTesting = document.getElementById("apikey-view-testing");

  let previousFocus = null;

  function init() {
    closeBtn?.addEventListener("click", closeApiKeyModal);
    modal?.addEventListener("click", (e) => { if (e.target === modal) closeApiKeyModal(); });
    backBtn?.addEventListener("click", () => showSavedView(null));

    saveBtn?.addEventListener("click", handleSave);
    saveInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleSave(); });
    saveInput?.addEventListener("input", () => { if (saveError) saveError.hidden = true; });
    saveToggleVis?.addEventListener("click", () => toggleVis(saveInput));

    testBtn?.addEventListener("click", handleTest);
    replaceBtn?.addEventListener("click", showReplaceView);
    deleteBtn?.addEventListener("click", handleDelete);
    copyBtn?.addEventListener("click", handleCopy);

    saveNewBtn?.addEventListener("click", handleSaveNew);
    replaceCancelBtn?.addEventListener("click", () => showSavedView(null));
    replaceInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleSaveNew(); });
    replaceInput?.addEventListener("input", () => { if (replaceError) replaceError.hidden = true; });
    replaceToggleVis?.addEventListener("click", () => toggleVis(replaceInput));
  }

  function openApiKeyModal() {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modal) modal.hidden = false;
    const settings = getSettings?.();
    renderView(settings);
  }

  function closeApiKeyModal() {
    if (modal) modal.hidden = true;
    clearErrors();
    const preferredFocus = visibleFocusable(previousFocus) ? previousFocus : null;
    setTimeout(() => {
      const focusTarget = preferredFocus
        || document.getElementById("rail-more")
        || document.getElementById("rail-account")
        || document.querySelector("[data-rail-action='api-key']");
      focusTarget?.focus?.();
    }, 0);
    previousFocus = null;
  }

  function renderView(settings) {
    if (settings?.hasApiKey) {
      showSavedView(settings);
    } else {
      showSaveView();
    }
  }

  function showSaveView() {
    setAllHidden();
    if (viewSave) viewSave.hidden = false;
    if (backBtn) backBtn.hidden = true;
    setSubtitle(t("apikeyModalSubtitle"));
    clearErrors();
    if (saveInput) { saveInput.value = ""; saveInput.type = "password"; }
    saveInput?.focus();
  }

  function showSavedView(settings) {
    setAllHidden();
    if (viewSaved) viewSaved.hidden = false;
    if (backBtn) backBtn.hidden = true;
    setSubtitle(t("apikeyConnectedSubtitle"));
    if (settings && maskedValue) {
      maskedValue.textContent = buildMaskedDisplay(settings.apiKeyPreview);
    }
    clearErrors();
  }

  function showReplaceView() {
    setAllHidden();
    if (viewReplace) viewReplace.hidden = false;
    if (backBtn) backBtn.hidden = false;
    setSubtitle(t("apikeyReplaceSubtitle"));
    clearErrors();
    if (replaceInput) { replaceInput.value = ""; replaceInput.type = "password"; }
    replaceInput?.focus();
  }

  function showTestingView() {
    setAllHidden();
    if (viewTesting) viewTesting.hidden = false;
    if (backBtn) backBtn.hidden = true;
    setSubtitle(t("apikeyTestingSubtitle"));
  }

  function setAllHidden() {
    [viewSave, viewSaved, viewReplace, viewTesting].forEach((v) => { if (v) v.hidden = true; });
  }

  function setSubtitle(text) {
    if (modalSubtitle) modalSubtitle.textContent = text;
  }

  function buildMaskedDisplay(preview) {
    if (!preview || preview === "saved") return "sk-••••••••••••••••";
    // preview format from storage.js: "sk-...a7B2" — show as "sk-••••••••••••••••a7B2"
    const match = preview.match(/^(.+?)\.\.\.(.+)$/);
    if (match) return `${match[1]}${"•".repeat(16)}${match[2]}`;
    return preview;
  }

  async function handleSave() {
    const newKey = saveInput?.value.trim();
    if (!newKey) {
      showFieldError(saveError, t("apikeyEmptyError"));
      saveInput?.focus();
      return;
    }
    if (saveBtn) saveBtn.disabled = true;
    try {
      const response = await sendMessage({ type: "SAVE_SETTINGS", settings: { apiKey: newKey } });
      if (!response.ok) {
        showFieldError(saveError, response.error || t("apikeyEmptyError"));
        return;
      }
      onSave?.(response.settings);
      showToast?.(t("settingsSaved"));
      closeApiKeyModal();
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function handleSaveNew() {
    const newKey = replaceInput?.value.trim();
    if (!newKey) {
      showFieldError(replaceError, t("apikeyEmptyError"));
      replaceInput?.focus();
      return;
    }
    if (saveNewBtn) saveNewBtn.disabled = true;
    try {
      const response = await sendMessage({ type: "SAVE_SETTINGS", settings: { apiKey: newKey } });
      if (!response.ok) {
        showFieldError(replaceError, response.error || t("apikeyEmptyError"));
        return;
      }
      onSave?.(response.settings);
      showToast?.(t("settingsSaved"));
      closeApiKeyModal();
    } finally {
      if (saveNewBtn) saveNewBtn.disabled = false;
    }
  }

  async function handleTest() {
    showTestingView();
    const response = await sendMessage({ type: "TEST_OPENAI_KEY" });
    const settingsResponse = await sendMessage({ type: "GET_SETTINGS" }).catch(() => null);
    const currentSettings = settingsResponse?.settings || getSettings?.();
    if (!response.ok) {
      showToast?.(response.error, "error");
      showSavedView(currentSettings);
      return;
    }
    onTestSuccess?.(response.result?.models || []);
    showToast?.(t("keyWorks"));
    showSavedView(currentSettings);
  }

  async function handleDelete() {
    const confirmed = await confirmAction({
      title: t("apikeyDeleteTitle"),
      message: t("deleteKeyConfirm"),
      confirmLabel: t("deleteLabel"),
      cancelLabel: t("cancel"),
      danger: true
    });
    if (!confirmed) return;
    const response = await sendMessage({ type: "DELETE_API_KEY" });
    if (!response.ok) {
      showToast?.(response.error, "error");
      return;
    }
    onSave?.(response.settings);
    showToast?.(t("keyDeleted"));
    closeApiKeyModal();
  }

  function handleCopy() {
    const text = maskedValue?.textContent || "";
    navigator.clipboard?.writeText(text).then(() => {
      showToast?.(t("copiedNote") || "Copied");
    }).catch(() => {});
  }

  function toggleVis(input) {
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
  }

  function showFieldError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }

  function clearErrors() {
    [saveError, replaceError].forEach((el) => {
      if (el) { el.hidden = true; el.textContent = ""; }
    });
  }

  return { init, openApiKeyModal, closeApiKeyModal };
}

function visibleFocusable(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element === document.body) return false;
  const style = globalThis.getComputedStyle?.(element);
  return !element.hidden && !element.closest("[hidden]") && style?.display !== "none" && style?.visibility !== "hidden";
}

function defaultConfirmAction(options = {}) {
  const message = typeof options === "string" ? options : options.message || options.title || "";
  if (typeof globalThis.confirm !== "function") return Promise.resolve(false);
  return Promise.resolve(globalThis.confirm(message));
}
