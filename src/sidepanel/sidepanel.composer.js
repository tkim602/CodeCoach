import { REQUEST_KINDS } from "../shared/constants.js";

const ACTION_TO_KIND = {
  hint: REQUEST_KINDS.hint,
  next_code_hint: REQUEST_KINDS.nextCodeHint,
  analyze: REQUEST_KINDS.analyze,
  explain_line: REQUEST_KINDS.explainLine,
  note: REQUEST_KINDS.note
};

const ACTION_I18N_KEYS = {
  hint: "hintUserMsg",
  next_code_hint: "nextCodeHintUserMsg",
  analyze: "analyzeUserMsg",
  explain_line: "explainLineUserMsg",
  note: "generateNoteUserMsg"
};

export function createComposerController({
  elements,
  startAiRequest,
  startChatRequest,
  appendUserMessage,
  startAssistantMessage,
  t = (key) => key,
  documentRef = document
}) {
  function init() {
    documentRef.querySelectorAll("[data-composer-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.composerAction;
        const kind = ACTION_TO_KIND[action];
        if (!kind) return;
        const i18nKey = ACTION_I18N_KEYS[action];
        const label = (i18nKey ? t(i18nKey) : null) || button.textContent || t("hintUserMsg");
        appendUserMessage?.(label);
        startAssistantMessage?.();
        startAiRequest(kind, label);
      });
    });
    elements.chatSend?.addEventListener("click", sendFreeChat);
    elements.chatInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendFreeChat();
      }
    });
  }

  function sendFreeChat() {
    const text = elements.chatInput?.value.trim() || "";
    if (!text) return;
    appendUserMessage?.(text);
    startAssistantMessage?.();
    elements.chatInput.value = "";
    dispatchFreeChat(text).catch(() => startChatRequest?.(text));
  }

  async function dispatchFreeChat(text) {
    const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" }).catch(() => null);
    if (settings?.settings?.hasApiKey) {
      startChatRequest?.(text);
      return;
    }
    const guest = await chrome.runtime.sendMessage({ type: "GET_GUEST_STATUS" }).catch(() => null);
    if (guest?.enabled && guest?.trial?.remaining !== 0) {
      startAiRequest?.(REQUEST_KINDS.chatCoach, text);
      return;
    }
    startChatRequest?.(text);
  }

  return { init };
}
