import { DEFAULT_MODEL_CHOICES } from "../shared/constants.js";

const elements = {
  optionsBrand: document.querySelector("#options-brand"),
  apiKey: document.querySelector("#api-key"),
  apiKeyToggle: document.querySelector("#api-key-toggle"),
  apiNoKeyRow: document.querySelector("#api-no-key-row"),
  apiHasKeyRow: document.querySelector("#api-has-key-row"),
  apiKeyMasked: document.querySelector("#api-key-masked"),
  apiKeyCopy: document.querySelector("#api-key-copy"),
  apiKeyReplace: document.querySelector("#api-key-replace"),
  hintModel: document.querySelector("#hint-model"),
  analyzeModel: document.querySelector("#analyze-model"),
  noteModel: document.querySelector("#note-model"),
  uiLanguage: document.querySelector("#ui-language"),
  confirmBeforeAi: document.querySelector("#confirm-before-ai"),
  includeProblemContext: document.querySelector("#include-problem-context"),
  includeSelection: document.querySelector("#include-selection"),
  storeHintText: document.querySelector("#store-hint-text"),
  save: document.querySelector("#save"),
  saveFeedback: document.querySelector("#save-feedback"),
  testKey: document.querySelector("#test-key"),
  deleteKey: document.querySelector("#delete-key"),
  clearLearning: document.querySelector("#clear-learning"),
  clearAll: document.querySelector("#clear-all"),
  modelOptions: document.querySelector("#model-options"),
  modelTestResult: document.querySelector("#model-test-result"),
  accountStatusState: document.querySelector("#account-status-state"),
  accountStatusDetail: document.querySelector("#account-status-detail"),
  apiStatusState: document.querySelector("#api-status-state"),
  apiStatusPreview: document.querySelector("#api-status-preview"),
  apiStatusStorage: document.querySelector("#api-status-storage"),
  confirmModal: document.querySelector("#options-confirm-modal"),
  confirmTitle: document.querySelector("#options-confirm-title"),
  confirmMessage: document.querySelector("#options-confirm-message"),
  confirmCancel: document.querySelector("#options-confirm-cancel"),
  confirmOk: document.querySelector("#options-confirm-ok"),
  confirmBackdrop: document.querySelector(".options-confirm-backdrop"),
  navItems: [...document.querySelectorAll(".options-nav-item")]
};

let currentSettings = null;
let pendingConfirm = null;
let confirmTrigger = null;
let saveFeedbackTimer = null;

const formControls = [
  elements.apiKey,
  elements.hintModel,
  elements.analyzeModel,
  elements.noteModel,
  elements.uiLanguage,
  elements.confirmBeforeAi,
  elements.includeProblemContext,
  elements.includeSelection,
  elements.storeHintText
];

const EYE_SVG = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
const EYE_OFF_SVG = `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;

function buildMaskedDisplay(preview) {
  if (!preview || preview === "saved") return "sk-••••••••••••••••";
  const match = preview.match(/^(.+?)\.\.\.(.+)$/);
  if (match) return `${match[1]}${"•".repeat(16)}${match[2]}`;
  return preview;
}

const OPTIONS_TEXT = {
  ko: {
    title: "코딩코치",
    navLabels: ["계정", "API 연결", "모델", "화면 설정", "저장 옵션", "사용 제한", "데이터 관리"],
    headings: ["계정", "API 연결", "모델", "화면 설정", "저장 옵션", "사용 제한", "데이터 관리"],
    statusCardLabels: ["계정", "API 연결"],
    fields: ["API key", "힌트 모델", "분석 모델", "오답노트 모델", "언어"],
    checks: ["AI 요청 전 확인", "문제 내용 기본 포함", "선택 영역 기본 포함", "힌트 전문 로컬 저장"],
    accountHelp: "코딩코치의 로컬 확장 프로그램 프로필을 관리합니다.",
    apiHelp: "API key는 확장 프로그램 저장소에 보관되고, 확장 프로그램 서비스 워커에서 직접 사용됩니다.",
    modelHelp: "API key에서 사용 가능한 OpenAI 모델명을 직접 입력할 수 있습니다. 아래 값은 추천 목록입니다.",
    appearanceHelp: "AI 힌트, 분석, 오답노트의 언어를 선택합니다.",
    storageHelp: "AI 요청에 포함할 정보, 로컬 저장 데이터, 선택적 동기화 범위를 선택합니다.",
    guardrailsHelp: "확장 프로그램은 연습 페이지에만 동작하고 보호된 문제 콘텐츠 저장을 피합니다.",
    dataHelp: "저장된 학습 데이터를 삭제하거나 모든 확장 프로그램 데이터를 초기화합니다.",
    guardrail1: "이 확장 프로그램은 일반 LeetCode 및 Programmers 연습 문제에서 동작합니다. 콘테스트, 평가, 스킬체크, 인증, 모의면접, 채용 테스트, 에디토리얼, 공식 솔루션 페이지에서는 비활성화됩니다.",
    guardrail2: "문제 전문, 예시, 제약조건, 스크린샷, OCR 텍스트, 페이지 HTML, 공식 해설, 콘테스트/평가 콘텐츠는 저장하지 않습니다.",
    accountStatus: "로컬 프로필",
    accountDetail: "설정은 이 브라우저의 확장 프로그램 저장소에 보관됩니다.",
    notSignedIn: "로그인 안 됨",
    signInFromPanel: "패널에서 로그인하세요.",
    connected: "연결됨",
    notConnected: "연결 안 됨",
    noKey: "저장된 키 없음",
    noStorage: "저장 안 됨",
    localStorageLabel: "로컬 저장소",
    profile: "프로필",
    localProfile: "로컬 브라우저 프로필",
    extensionProfile: "Chrome 확장 프로그램",
    connection: "API 연결",
    connectionHelp: "저장된 OpenAI API key를 테스트하거나 삭제합니다.",
    learningData: "학습 데이터",
    learningDataHelp: "로컬 및 동기화된 세션, 힌트 기록, 저장된 노트를 삭제합니다. 설정과 API key는 유지됩니다.",
    apiKeyData: "API key",
    apiKeyDataHelp: "저장된 OpenAI API key를 로컬 저장소에서 삭제합니다.",
    allData: "전체 데이터",
    allDataHelp: "설정과 API key를 포함한 모든 확장 프로그램 데이터를 삭제합니다. 이 작업은 되돌릴 수 없습니다.",
    save: "저장",
    testKey: "키 테스트",
    replaceKey: "교체",
    deleteKey: "키 삭제",
    clearLearning: "학습 데이터 삭제",
    clearAll: "전체 데이터 삭제",
    cancel: "Cancel",
    confirm: "Confirm",
    saving: "저장 중…",
    unsaved: "저장되지 않음",
    saved: "저장됨",
    needsKey: "API key 필요",
    testingKey: "키 테스트 중…",
    keyWorksPrefix: "키 사용 가능. 모델",
    keyWorksModels: "개 반환됨.\n\n사용 가능한 모델:\n",
    learningCleared: "학습 데이터가 삭제됐습니다.",
    deleteKeyTitle: "API key 삭제",
    deleteKeyMessage: "로컬에 저장된 OpenAI API key를 삭제할까요? 새 키를 저장하기 전까지 AI를 사용할 수 없습니다.",
    deleteKeyOk: "삭제",
    clearLearningTitle: "학습 데이터 삭제",
    clearLearningMessage: "로컬 및 동기화된 세션, 힌트 기록, 저장된 노트를 삭제할까요? 설정과 API key 상태는 유지됩니다.",
    clearLearningOk: "삭제",
    clearAllTitle: "전체 데이터 삭제",
    clearAllMessage: "설정과 API key를 포함한 모든 확장 프로그램 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다.",
    clearAllOk: "전체 삭제",
    storedKeyPreview: "저장된 key",
    showKey: "API key 표시",
    hideKey: "API key 숨기기"
  },
  en: {
    title: "CodeCoach",
    navLabels: ["Account", "API Access", "Models", "Appearance", "Storage", "Guardrails", "Data"],
    headings: ["Account", "API Access", "Models", "Appearance", "Storage", "Guardrails", "Data management"],
    statusCardLabels: ["Account", "API Access"],
    fields: ["API key", "Hint model", "Analysis model", "Note model", "Language"],
    checks: ["Confirm before AI requests", "Include problem context by default", "Include selection by default", "Store full hint text locally"],
    accountHelp: "Manage the local extension profile used by CodeCoach.",
    apiHelp: "Your key is stored in extension storage and is used directly from the extension service worker.",
    modelHelp: "Use any OpenAI model available to your API key. The suggestions are editable.",
    appearanceHelp: "Choose the language for the panel and all AI responses.",
    storageHelp: "Choose what the extension includes in requests, keeps locally, and optionally syncs.",
    guardrailsHelp: "The extension stays scoped to practice pages and avoids storing protected problem content.",
    dataHelp: "Delete stored learning data or reset all extension data.",
    guardrail1: "This extension supports normal LeetCode and Programmers practice pages. It is disabled on contests, assessments, skill checks, certifications, mock interviews, hiring tests, editorials, and official solution pages.",
    guardrail2: "It does not store full problem statements, examples, constraints, screenshots, OCR text, page HTML, official solutions, editorials, contest content, or assessment content.",
    accountStatus: "Local profile",
    accountDetail: "Extension settings are stored in this browser.",
    notSignedIn: "Not signed in",
    signInFromPanel: "Sign in from the extension panel.",
    connected: "Connected",
    notConnected: "Not connected",
    noKey: "No key saved",
    noStorage: "not saved",
    localStorageLabel: "Local storage",
    profile: "Profile",
    localProfile: "Local browser profile",
    extensionProfile: "Chrome extension",
    connection: "Connection",
    connectionHelp: "Test or remove the saved OpenAI API key.",
    learningData: "Learning data",
    learningDataHelp: "Delete local and synced sessions, hint history, and saved notes. Settings and API key are kept.",
    apiKeyData: "API key",
    apiKeyDataHelp: "Remove the saved OpenAI API key from local storage.",
    allData: "All local data",
    allDataHelp: "Delete all extension data including settings and API key. This cannot be undone.",
    save: "Save",
    testKey: "Test key",
    replaceKey: "Replace",
    deleteKey: "Remove key",
    clearLearning: "Delete learning data",
    clearAll: "Delete all local data",
    cancel: "Cancel",
    confirm: "Confirm",
    saving: "Saving…",
    unsaved: "Unsaved",
    saved: "Saved",
    needsKey: "Needs API key",
    testingKey: "Testing key…",
    keyWorksPrefix: "Key works.",
    keyWorksModels: " model(s) returned.\n\nFirst models:\n",
    learningCleared: "Learning data cleared.",
    deleteKeyTitle: "Delete API key",
    deleteKeyMessage: "Delete the locally stored OpenAI API key? AI requests will be unavailable until a new key is saved.",
    deleteKeyOk: "Delete",
    clearLearningTitle: "Delete learning data",
    clearLearningMessage: "Delete local and synced sessions, hint events, and saved notes? Settings and API key status will stay unchanged.",
    clearLearningOk: "Delete",
    clearAllTitle: "Delete all local data",
    clearAllMessage: "Delete all extension local data, including settings and API key? This cannot be undone.",
    clearAllOk: "Delete all",
    storedKeyPreview: "Stored key",
    showKey: "Show API key",
    hideKey: "Hide API key"
  }
};

init();

async function init() {
  DEFAULT_MODEL_CHOICES.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    elements.modelOptions.append(option);
  });

  const response = await sendMessage({ type: "GET_SETTINGS" });
  if (!response.ok) throw new Error(response.error);
  currentSettings = response.settings;
  renderSettings(currentSettings);
  await renderAccountStatus();

  elements.save.addEventListener("click", save);
  elements.testKey.addEventListener("click", testKey);
  elements.deleteKey.addEventListener("click", deleteKey);
  elements.clearLearning.addEventListener("click", clearLearningData);
  elements.clearAll.addEventListener("click", clearAllLocalData);
  elements.apiKeyToggle?.addEventListener("click", toggleApiKeyVisibility);
  elements.apiKeyCopy?.addEventListener("click", copyApiKeyMasked);
  elements.apiKeyReplace?.addEventListener("click", replaceApiKey);

  formControls.forEach((control) => {
    control.addEventListener(control.type === "checkbox" || control.tagName === "SELECT" ? "change" : "input", markDirty);
  });
  elements.uiLanguage.addEventListener("change", () => {
    localizeOptions(elements.uiLanguage.value);
    renderAccountStatus();
    markDirty();
  });
  elements.confirmCancel.addEventListener("click", () => resolveConfirm(false));
  elements.confirmBackdrop.addEventListener("click", () => resolveConfirm(false));
  elements.confirmOk.addEventListener("click", () => resolveConfirm(true));
  document.addEventListener("keydown", (event) => {
    if (elements.confirmModal.hidden) return;
    if (event.key === "Escape") {
      resolveConfirm(false);
      return;
    }
    if (event.key === "Tab") trapConfirmFocus(event);
  });
  elements.navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      setActiveNav(item.getAttribute("href"));
    });
  });
  setActiveNav(window.location.hash || "#account");

  chrome.storage.local.onChanged.addListener((changes) => {
    if ("auth_state" in changes) renderAccountStatus();
  });
}

function renderSettings(settings) {
  localizeOptions(settings.uiLanguage || "ko");
  elements.apiKey.value = "";
  elements.apiKey.placeholder = "sk-...";
  if (settings.hasApiKey) {
    elements.apiNoKeyRow.hidden = true;
    elements.apiHasKeyRow.hidden = false;
    elements.apiKeyMasked.textContent = buildMaskedDisplay(settings.apiKeyPreview);
  } else {
    elements.apiNoKeyRow.hidden = false;
    elements.apiHasKeyRow.hidden = true;
  }
  elements.hintModel.value = settings.hintModel;
  elements.analyzeModel.value = settings.analyzeModel;
  elements.noteModel.value = settings.noteModel;
  elements.uiLanguage.value = settings.uiLanguage || "ko";
  elements.confirmBeforeAi.checked = Boolean(settings.confirmBeforeAi);
  elements.includeProblemContext.checked = settings.includeProblemContextByDefault !== false;
  elements.includeSelection.checked = Boolean(settings.includeSelectionByDefault);
  elements.storeHintText.checked = Boolean(settings.allowHintTextStorage);
  renderApiStatus(settings);
}

function getLang() {
  return (elements.uiLanguage?.value === "en") ? "en" : "ko";
}

function t(key) {
  return OPTIONS_TEXT[getLang()]?.[key] ?? OPTIONS_TEXT.en[key] ?? key;
}

function localizeOptions(language) {
  const lang = language === "en" ? "en" : "ko";
  const copy = OPTIONS_TEXT[lang];
  document.documentElement.lang = lang;
  if (elements.optionsBrand) elements.optionsBrand.textContent = copy.title;
  [...document.querySelectorAll(".settings-card-title")].forEach((heading, index) => {
    if (copy.headings[index]) heading.textContent = copy.headings[index];
  });
  [...document.querySelectorAll(".status-card-label")].forEach((label, index) => {
    if (copy.statusCardLabels?.[index]) label.textContent = copy.statusCardLabels[index];
  });
  [...document.querySelectorAll(".field > span")].forEach((label, index) => {
    if (copy.fields[index]) label.textContent = copy.fields[index];
  });
  [...document.querySelectorAll(".checks label")].forEach((label, index) => {
    if (!copy.checks[index]) return;
    const text = label.querySelector("span:first-child");
    if (text) text.textContent = copy.checks[index];
  });
  const muted = [...document.querySelectorAll(".settings-card-header .muted")];
  if (muted[0]) muted[0].textContent = copy.accountHelp;
  if (muted[1]) muted[1].textContent = copy.apiHelp;
  if (muted[2]) muted[2].textContent = copy.modelHelp;
  if (muted[3]) muted[3].textContent = copy.appearanceHelp;
  if (muted[4]) muted[4].textContent = copy.storageHelp;
  if (muted[5]) muted[5].textContent = copy.guardrailsHelp;
  if (muted[6]) muted[6].textContent = copy.dataHelp;
  const notices = [...document.querySelectorAll(".notice p")];
  if (notices[1]) notices[1].textContent = copy.guardrail1;
  if (notices[2]) notices[2].textContent = copy.guardrail2;
  const accountRow = document.querySelector("#account .settings-row");
  if (accountRow) {
    const strong = accountRow.querySelector("strong");
    const detail = accountRow.querySelector("p");
    const value = accountRow.querySelector(".row-value");
    if (strong) strong.textContent = copy.profile;
    if (detail) detail.textContent = copy.localProfile;
    if (value) value.textContent = copy.extensionProfile;
  }
  const dataRows = [...document.querySelectorAll("#data-management .action-row")];
  if (dataRows[0]) {
    const strong = dataRows[0].querySelector("strong");
    const p = dataRows[0].querySelector("p");
    if (strong) strong.textContent = copy.learningData;
    if (p) p.textContent = copy.learningDataHelp;
  }
  if (dataRows[1]) {
    const strong = dataRows[1].querySelector("strong");
    const p = dataRows[1].querySelector("p");
    if (strong) strong.textContent = copy.apiKeyData;
    if (p) p.textContent = copy.apiKeyDataHelp;
  }
  if (dataRows[2]) {
    const strong = dataRows[2].querySelector("strong");
    const p = dataRows[2].querySelector("p");
    if (strong) strong.textContent = copy.allData;
    if (p) p.textContent = copy.allDataHelp;
  }
  elements.save.textContent = copy.save;
  elements.testKey.textContent = copy.testKey;
  if (elements.apiKeyReplace) elements.apiKeyReplace.textContent = copy.replaceKey;
  elements.deleteKey.textContent = copy.deleteKey;
  elements.clearLearning.textContent = copy.clearLearning;
  elements.clearAll.textContent = copy.clearAll;
  elements.confirmCancel.textContent = copy.cancel;
  elements.navItems.forEach((item, i) => {
    if (copy.navLabels[i]) item.textContent = copy.navLabels[i];
  });
  if (elements.apiKeyToggle) {
    const isPassword = elements.apiKey.type === "password";
    elements.apiKeyToggle.setAttribute("aria-label", isPassword ? copy.showKey : copy.hideKey);
  }
}

async function renderAccountStatus() {
  const lang = getLang();
  const copy = OPTIONS_TEXT[lang];
  const result = await chrome.storage.local.get("auth_state");
  const authState = result.auth_state || null;

  const avatarImg = document.getElementById("account-status-avatar");
  const letterEl = document.getElementById("account-status-letter");

  const isSignedIn = Boolean(authState?.uid && authState.uid !== "anonymous");
  const hasPhoto = isSignedIn && Boolean(authState.photoURL);

  if (hasPhoto) {
    avatarImg.src = authState.photoURL;
    avatarImg.hidden = false;
    if (letterEl) letterEl.hidden = true;
  } else {
    if (avatarImg) avatarImg.hidden = true;
    if (letterEl) {
      letterEl.hidden = false;
      if (isSignedIn) {
        const label = authState.email || authState.displayName || "";
        letterEl.textContent = label.charAt(0).toUpperCase() || "?";
      } else {
        letterEl.textContent = "A";
      }
    }
  }

  if (isSignedIn) {
    elements.accountStatusState.textContent = authState.email || authState.displayName || copy.accountStatus;
    elements.accountStatusDetail.textContent = copy.accountDetail;
  } else {
    elements.accountStatusState.textContent = copy.notSignedIn;
    elements.accountStatusDetail.textContent = copy.signInFromPanel;
  }
}

function toggleApiKeyVisibility() {
  const isPassword = elements.apiKey.type === "password";
  elements.apiKey.type = isPassword ? "text" : "password";
  const svg = elements.apiKeyToggle.querySelector("svg");
  if (svg) svg.innerHTML = isPassword ? EYE_OFF_SVG : EYE_SVG;
  elements.apiKeyToggle.setAttribute("aria-label", isPassword ? t("hideKey") : t("showKey"));
}

async function copyApiKeyMasked() {
  const text = elements.apiKeyMasked?.textContent || "";
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard unavailable
  }
}

function replaceApiKey() {
  elements.apiHasKeyRow.hidden = true;
  elements.apiNoKeyRow.hidden = false;
  elements.apiKey.value = "";
  elements.apiKey.type = "password";
  const svg = elements.apiKeyToggle?.querySelector("svg");
  if (svg) svg.innerHTML = EYE_SVG;
  elements.apiKeyToggle?.setAttribute("aria-label", t("showKey"));
  elements.apiKey.focus();
}

async function save() {
  const originalText = elements.save.textContent;
  elements.save.textContent = t("saving");
  elements.save.disabled = true;
  clearSaveFeedback();

  const patch = {
    hintModel: elements.hintModel.value.trim(),
    analyzeModel: elements.analyzeModel.value.trim(),
    noteModel: elements.noteModel.value.trim(),
    responseLanguage: elements.uiLanguage.value,
    uiLanguage: elements.uiLanguage.value,
    confirmBeforeAi: elements.confirmBeforeAi.checked,
    confirmBeforeAiExplicit: true,
    includeProblemContextByDefault: elements.includeProblemContext.checked,
    includeSelectionByDefault: elements.includeSelection.checked,
    allowHintTextStorage: elements.storeHintText.checked
  };

  const newKey = elements.apiKey.value.trim();
  if (newKey) {
    patch.apiKey = newKey;
  }

  const response = await sendMessage({ type: "SAVE_SETTINGS", settings: patch });
  elements.save.disabled = false;
  if (!response.ok) {
    elements.save.textContent = originalText;
    showSaveFeedback(response.error, "error");
    return;
  }

  currentSettings = response.settings;
  renderSettings(currentSettings);
  showSaveFeedback(t("saved"), "ok");
}

async function testKey() {
  const apiKey = elements.apiKey.value.trim();
  elements.modelTestResult.hidden = false;
  elements.modelTestResult.textContent = t("testingKey");

  const response = await sendMessage(apiKey ? { type: "TEST_OPENAI_KEY", apiKey } : { type: "TEST_OPENAI_KEY" });
  if (!response.ok) {
    elements.modelTestResult.textContent = response.error;
    return;
  }

  elements.modelTestResult.textContent = `${t("keyWorksPrefix")} ${response.result.modelCount}${t("keyWorksModels")}${response.result.models.join("\n")}`;
  addModelOptions(response.result.models || []);
}

async function deleteKey(event) {
  const confirmed = await confirmAction({
    title: t("deleteKeyTitle"),
    message: t("deleteKeyMessage"),
    okText: t("deleteKeyOk")
  }, event?.currentTarget);
  if (!confirmed) return;
  const response = await sendMessage({ type: "DELETE_API_KEY" });
  if (!response.ok) {
    showSaveFeedback(response.error, "error");
    return;
  }
  currentSettings = response.settings;
  renderSettings(currentSettings);
}

async function clearLearningData(event) {
  const confirmed = await confirmAction({
    title: t("clearLearningTitle"),
    message: t("clearLearningMessage"),
    okText: t("clearLearningOk")
  }, event?.currentTarget);
  if (!confirmed) return;
  const response = await sendMessage({ type: "CLEAR_LEARNING_DATA" });
  if (response.ok) {
    showSaveFeedback(t("learningCleared"), "ok");
  } else {
    showSaveFeedback(response.error, "error");
  }
}

async function clearAllLocalData(event) {
  const confirmed = await confirmAction({
    title: t("clearAllTitle"),
    message: t("clearAllMessage"),
    okText: t("clearAllOk")
  }, event?.currentTarget);
  if (!confirmed) return;
  const response = await sendMessage({ type: "CLEAR_ALL_LOCAL_DATA" });
  if (!response.ok) {
    showSaveFeedback(response.error, "error");
    return;
  }
  currentSettings = (await sendMessage({ type: "GET_SETTINGS" })).settings;
  renderSettings(currentSettings);
}

function addModelOptions(models) {
  const existing = new Set([...elements.modelOptions.options].map((option) => option.value));
  models.forEach((model) => {
    if (existing.has(model)) return;
    const option = document.createElement("option");
    option.value = model;
    elements.modelOptions.append(option);
  });
}

function showSaveFeedback(text, className = "") {
  if (!elements.saveFeedback) return;
  if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
  elements.saveFeedback.textContent = text;
  elements.saveFeedback.className = `save-feedback ${className}`.trim();
  if (className === "ok") {
    saveFeedbackTimer = setTimeout(() => clearSaveFeedback(), 2500);
  }
}

function clearSaveFeedback() {
  if (!elements.saveFeedback) return;
  if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
  elements.saveFeedback.textContent = "";
  elements.saveFeedback.className = "save-feedback";
}

function markDirty() {
  if (!elements.saveFeedback) return;
  if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
  elements.saveFeedback.textContent = t("unsaved");
  elements.saveFeedback.className = "save-feedback dirty";
}

function renderApiStatus(settings) {
  const lang = settings.uiLanguage === "en" ? "en" : "ko";
  const copy = OPTIONS_TEXT[lang];
  elements.apiStatusState.textContent = settings.hasApiKey ? copy.connected : copy.notConnected;
  if (elements.apiStatusPreview) {
    elements.apiStatusPreview.textContent = settings.hasApiKey ? buildMaskedDisplay(settings.apiKeyPreview) : copy.noKey;
  }
  if (elements.apiStatusStorage) {
    elements.apiStatusStorage.textContent = settings.hasApiKey
      ? (settings.apiKeyStorageMode === "local" ? copy.localStorageLabel : settings.apiKeyStorageMode || copy.noStorage)
      : copy.noStorage;
  }
}

function confirmAction({ title, message, okText }, trigger = null) {
  if (pendingConfirm) resolveConfirm(false);
  confirmTrigger = trigger instanceof HTMLElement
    ? trigger
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.confirmOk.textContent = okText;
  elements.confirmModal.hidden = false;
  elements.confirmCancel.focus();

  return new Promise((resolve) => {
    pendingConfirm = resolve;
  });
}

function resolveConfirm(confirmed) {
  if (!pendingConfirm) return;
  const resolve = pendingConfirm;
  const trigger = confirmTrigger;
  pendingConfirm = null;
  confirmTrigger = null;
  elements.confirmModal.hidden = true;
  if (trigger && document.contains(trigger)) {
    const parentSection = trigger.closest(".section[id]");
    if (parentSection?.id && parentSection.hidden) {
      setActiveNav(`#${parentSection.id}`);
    }
    trigger.focus();
  }
  resolve(confirmed);
}

function trapConfirmFocus(event) {
  const focusable = getConfirmFocusableElements();
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!elements.confirmModal.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function getConfirmFocusableElements() {
  return [...elements.confirmModal.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
    .filter((element) => !element.disabled && !element.hidden && element.offsetParent !== null);
}

const SECTION_IDS = ["account", "api", "models", "appearance", "storage", "guardrails", "data-management"];

function setActiveNav(hash) {
  const id = hash ? hash.replace(/^#/, "") : SECTION_IDS[0];
  elements.navItems.forEach((item) => {
    item.classList.toggle("active", item.getAttribute("href") === `#${id}`);
  });
  SECTION_IDS.forEach((sectionId) => {
    const el = document.getElementById(sectionId);
    if (el) el.hidden = sectionId !== id;
  });
}

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}
