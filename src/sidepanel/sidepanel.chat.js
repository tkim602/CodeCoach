export function createChatController({ elements, documentRef = document, t = (key) => key }) {
  let activeAssistantMessage = elements.output || null;

  elements.coachChatTranscript?.addEventListener("click", handleAssistantActionClick);

  function writeAssistant(text, { streaming = false } = {}) {
    const target = ensureAssistantMessage();
    if (!target) return;
    target.classList.toggle("is-streaming", Boolean(streaming));
    target.innerHTML = text || "";
    if (!streaming && text && text.trim()) {
      attachAssistantActions(target);
    }
    if (elements.coachChatTranscript) {
      elements.coachChatTranscript.scrollTop = elements.coachChatTranscript.scrollHeight;
    }
  }

  function appendUserMessage(text) {
    if (!elements.coachChatTranscript || !text.trim()) return;
    removeEmptyState();
    activeAssistantMessage = null;
    const bubble = documentRef.createElement("div");
    bubble.className = "chat-message user-message";
    bubble.textContent = text.trim();
    elements.coachChatTranscript.appendChild(bubble);
    elements.coachChatTranscript.scrollTop = elements.coachChatTranscript.scrollHeight;
  }

  function startAssistantMessage({ skeleton = true } = {}) {
    removeEmptyState();
    activeAssistantMessage = createAssistantMessage();
    if (skeleton) {
      activeAssistantMessage.innerHTML = `
        <div class="message-skeleton" aria-label="응답 생성 중">
          <span class="message-skeleton-item"></span>
          <span class="message-skeleton-item message-skeleton-item--short"></span>
        </div>
      `;
      activeAssistantMessage.classList.add("is-streaming");
    }
    elements.coachChatTranscript?.appendChild(activeAssistantMessage);
    elements.coachChatTranscript.scrollTop = elements.coachChatTranscript.scrollHeight;
    return activeAssistantMessage;
  }

  function setEmptyState({ allowed = false } = {}) {
    if (!elements.coachChatTranscript || hasConversationContent()) return;
    const pageText = allowed ? t("pageAllowedText") : t("pageNotAllowedText");
    const existing = elements.coachChatTranscript.querySelector(".chat-empty-state");
    const emptyState = existing || documentRef.createElement("div");
    emptyState.className = "chat-empty-state";
    emptyState.innerHTML = `
      <span>${escapeHtml(pageText)}</span>
    `;
    if (!existing) elements.coachChatTranscript.appendChild(emptyState);
  }

  function appendAssistantMetadata(node) {
    if (!activeAssistantMessage || !node) return;
    activeAssistantMessage.appendChild(node);
    elements.coachChatTranscript.scrollTop = elements.coachChatTranscript.scrollHeight;
  }

  function resetTranscript({ keepWelcome = true } = {}) {
    if (!elements.coachChatTranscript) return;
    [...elements.coachChatTranscript.querySelectorAll(".chat-message, .chat-empty-state")].forEach((node) => {
      if (keepWelcome && node.classList.contains("coach-hero")) return;
      node.remove();
    });
    activeAssistantMessage = null;
    if (elements.output) {
      elements.output.innerHTML = "";
      elements.output.className = "output chat-message assistant-message markdown-body";
      elements.coachChatTranscript.appendChild(elements.output);
      activeAssistantMessage = elements.output;
    }
  }

  function ensureAssistantMessage() {
    removeEmptyState();
    if (activeAssistantMessage && activeAssistantMessage.isConnected) return activeAssistantMessage;
    if (elements.output && elements.output.isConnected && !elements.output.textContent.trim()) {
      activeAssistantMessage = elements.output;
      return activeAssistantMessage;
    }
    return startAssistantMessage({ skeleton: false });
  }

  function createAssistantMessage() {
    const bubble = documentRef.createElement("div");
    bubble.className = "chat-message assistant-message markdown-body";
    return bubble;
  }

  function hasConversationContent() {
    return Boolean(elements.coachChatTranscript.querySelector(".chat-message:not(:empty)"));
  }

  function removeEmptyState() {
    elements.coachChatTranscript?.querySelector(".chat-empty-state")?.remove();
  }

  function attachAssistantActions(messageEl) {
    if (!messageEl) return;
    messageEl.querySelector(".assistant-message-actions")?.remove();
    const actions = documentRef.createElement("div");
    actions.className = "assistant-message-actions";
    actions.innerHTML = `
      <button class="assistant-action-btn" data-msg-action="copy" type="button" aria-label="복사" title="복사">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
          <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="assistant-action-btn" data-msg-action="regenerate" type="button" aria-label="재생성" title="재생성">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
          <path d="M14 8a6 6 0 1 1-2-4.47" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M14 2v4h-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    `;
    messageEl.appendChild(actions);
  }

  function handleAssistantActionClick(event) {
    const btn = event.target.closest("[data-msg-action]");
    if (!btn) return;
    event.preventDefault();
    const action = btn.dataset.msgAction;
    const message = btn.closest(".assistant-message");
    if (!message) return;
    if (action === "copy") {
      const clone = message.cloneNode(true);
      clone.querySelector(".assistant-message-actions")?.remove();
      const text = (clone.innerText || clone.textContent || "").trim();
      if (!text) return;
      const onSuccess = () => {
        btn.classList.add("is-success");
        setTimeout(() => btn.classList.remove("is-success"), 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(() => {});
      } else {
        onSuccess();
      }
    } else if (action === "regenerate") {
      const userMessages = elements.coachChatTranscript?.querySelectorAll(".user-message");
      const lastUser = userMessages && userMessages.length
        ? userMessages[userMessages.length - 1]
        : null;
      const chatInput = documentRef.getElementById("chat-input");
      if (lastUser && chatInput) {
        chatInput.value = (lastUser.textContent || "").trim();
        chatInput.focus();
        try {
          chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
        } catch (_) {}
      }
    }
  }

  return {
    writeAssistant,
    appendUserMessage,
    startAssistantMessage,
    appendAssistantMetadata,
    resetTranscript,
    setEmptyState
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
