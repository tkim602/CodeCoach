const ACTION_LABELS = {
  explain_line: "선택한 줄 또는 현재 커서 줄이 무엇을 하는지, 왜 그렇게 작성됐는지, 어떤 엣지 케이스가 있는지 구체적으로 설명해줘.",
  efficiency: "현재 코드를 더 효율적으로 작성하려면 시간/공간 복잡도와 구현 관점에서 무엇을 바꾸면 좋을지 분석해줘.",
  suggest_testcases: "현재 문제에 맞는 새로운 테스트케이스를 5개 제안해줘. 기존에 보이는 예시 외에 엣지케이스, 경계값, 큰 입력, 예외 케이스를 포함해줘. 각 케이스는 'input: ... / expected: ...' 형식으로 간결하게 작성해줘.",
  testcase_analysis: "아래 테스트케이스에서 왜 실패할 수 있는지 입력, 예상값, 현재 코드 흐름 기준으로 설명해줘.",
  free_chat: ""
};

const ACTION_SHORT_LABELS = {
  explain_line: "선택 줄 설명",
  efficiency: "효율 개선",
  testcase_analysis: "케이스 분석"
};

export function createDebugLabController({
  elements,
  getContext,
  startDebugRequest,
  formatMarkdown,
  documentRef = document
}) {
  let userTestCases = [];
  let aiTestCases = [];
  let tcExpOpen = false;
  let _streamingMsg = null;
  let _pendingLabel = "";

  function init() {
    tcExpOpen = Boolean(elements.debugTestcaseExpPanel && !elements.debugTestcaseExpPanel.hidden);
    setTestcaseExpPanel(tcExpOpen);

    elements.debugExplainLine?.addEventListener("click", () => startAction("explain_line"));
    elements.debugEfficiency?.addEventListener("click", () => startAction("efficiency"));
    elements.debugTestcaseExpChip?.addEventListener("click", toggleTestcaseExpPanel);
    documentRef.querySelector("[data-debug-testcase-shortcut]")?.addEventListener("click", () => {
      setTestcaseExpPanel(true);
      elements.debugTestcaseExpPanel?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    });

    elements.debugTcAiSuggest?.addEventListener("click", requestAiTestcases);
    elements.debugTcAddCustom?.addEventListener("click", addUserTestcase);
    elements.debugTcCustomInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addUserTestcase();
      }
    });
    elements.debugTcCustomExpected?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addUserTestcase();
      }
    });
    elements.debugTcAnalyze?.addEventListener("click", analyzeWithSelectedCases);

    elements.debugLabSend?.addEventListener("click", sendFreeChat);
    elements.debugLabChatInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendFreeChat();
      }
    });

    elements.debugLabOutput?.addEventListener("click", handleDebugMessageAction);
  }

  function attachDebugMessageActions(messageEl) {
    if (!messageEl || messageEl.querySelector(".debug-message-actions")) return;
    const actions = documentRef.createElement("div");
    actions.className = "debug-message-actions";
    actions.innerHTML = `
      <button class="debug-action-btn" data-debug-msg-action="copy" type="button" aria-label="복사" title="복사">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
          <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="debug-action-btn" data-debug-msg-action="regenerate" type="button" aria-label="재생성" title="재생성">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
          <path d="M14 8a6 6 0 1 1-2-4.47" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M14 2v4h-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    `;
    messageEl.appendChild(actions);
  }

  function handleDebugMessageAction(event) {
    const btn = event.target.closest("[data-debug-msg-action]");
    if (!btn) return;
    event.preventDefault();
    const action = btn.dataset.debugMsgAction;
    const message = btn.closest(".debug-chat-message");
    if (!message || message.classList.contains("debug-user-message")) return;
    if (action === "copy") {
      const clone = message.cloneNode(true);
      clone.querySelector(".debug-message-actions")?.remove();
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
      const userMessages = elements.debugLabOutput?.querySelectorAll(".debug-user-message");
      const lastUser = userMessages && userMessages.length
        ? userMessages[userMessages.length - 1]
        : null;
      if (lastUser && elements.debugLabChatInput) {
        elements.debugLabChatInput.textContent = (lastUser.textContent || "").trim();
        elements.debugLabChatInput.focus();
        const range = documentRef.createRange();
        const sel = documentRef.defaultView?.getSelection?.();
        if (sel) {
          range.selectNodeContents(elements.debugLabChatInput);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  }

  function toggleTestcaseExpPanel() {
    setTestcaseExpPanel(!tcExpOpen);
  }

  function setTestcaseExpPanel(open) {
    tcExpOpen = Boolean(open);
    const chip = elements.debugTestcaseExpChip;
    const panel = elements.debugTestcaseExpPanel;
    if (!chip || !panel) return;
    chip.setAttribute("aria-expanded", String(tcExpOpen));
    chip.classList.toggle("active", tcExpOpen);
    panel.hidden = !tcExpOpen;
  }

  function requestAiTestcases() {
    _streamingMsg = null;
    const list = elements.debugTcSuggestedList;
    if (list) list.innerHTML = '<div class="debug-tc-empty">AI가 케이스를 생성 중입니다...</div>';
    startDebugRequest({
      action: "suggest_testcases",
      userMessage: ACTION_LABELS.suggest_testcases,
      testCases: []
    });
  }

  function parseSuggestedCases(text) {
    const blocks = String(text).split(/\n{2,}|\n(?=\d+[\.\)])/);
    const results = [];
    for (const block of blocks) {
      const lines = block.split('\n')
        .map((l) => {
          // Strip numbering, list markers, and bold/italic markdown
          let s = l.replace(/^\d+[\.\)]\s*/, '').trim();
          s = s.replace(/^[-*•]\s+/, '');
          s = s.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
          return s.trim();
        })
        .filter(Boolean);
      let input = '', expected = '', note = '';
      for (const line of lines) {
        const im = line.match(/^input[:\s]+(.+)/i);
        const em = line.match(/^expected[:\s]+(.+)/i);
        const nm = line.match(/^note[:\s]+(.+)/i) || line.match(/^[-–]\s*설명[:\s]+(.+)/i);
        if (im && !input) input = im[1].trim();
        else if (em && !expected) expected = em[1].trim();
        else if (nm && !note) note = nm[1].trim();
      }
      if (input && expected) results.push({ input, expected, note: note || undefined });
    }
    return results.slice(0, 8);
  }

  function addUserTestcase() {
    const inputEl = elements.debugTcCustomInput;
    const expectedEl = elements.debugTcCustomExpected;
    const inputText = (inputEl?.value || "").trim();
    const expectedText = (expectedEl?.value || "").trim();
    if (!inputText || !expectedText) return;
    userTestCases.push({ input: inputText, expected: expectedText });
    if (inputEl) inputEl.value = "";
    if (expectedEl) expectedEl.value = "";
    renderUserList();
  }

  function analyzeWithSelectedCases() {
    const cases = collectSelectedCases();
    if (!cases.length) return;
    _pendingLabel = ACTION_SHORT_LABELS.testcase_analysis;
    _streamingMsg = null;
    startDebugRequest({
      action: "testcase_analysis",
      userMessage: ACTION_LABELS.testcase_analysis,
      testCases: cases
    });
  }

  function tcToString(tc) {
    if (typeof tc === "object") return `input: ${tc.input} / expected: ${tc.expected}`;
    return tc;
  }

  function collectSelectedCases() {
    const checked = [...documentRef.querySelectorAll("[data-debug-tc-index]:checked")]
      .map((input) => {
        const src = input.dataset.debugTcSrc;
        const idx = Number(input.dataset.debugTcIndex);
        const tc = src === "ai" ? aiTestCases[idx] : userTestCases[idx];
        return tc ? tcToString(tc) : null;
      })
      .filter(Boolean);
    if (checked.length) return checked;
    return [...aiTestCases, ...userTestCases].map(tcToString).slice(0, 8);
  }

  function sendFreeChat() {
    const text = editableText(elements.debugLabChatInput);
    if (!text) return;
    clearEditable(elements.debugLabChatInput);
    appendUserMessage(text);
    _pendingLabel = "";
    startDebugRequest({
      action: "free_chat",
      userMessage: text,
      testCases: collectSelectedCases()
    });
  }

  function startAction(action) {
    const label = ACTION_LABELS[action] || "";
    _pendingLabel = ACTION_SHORT_LABELS[action] || "";
    finalizeStreaming();
    _streamingMsg = null;
    documentRef.querySelectorAll(".debug-chip").forEach((c) => c.classList.remove("active"));
    const chip = documentRef.querySelector(`[data-debug-action="${action}"]`);
    chip?.classList.add("active");
    startDebugRequest({ action, userMessage: label, testCases: [] });
  }

  function appendUserMessage(text) {
    const out = elements.debugLabOutput;
    if (!out) return;
    finalizeStreaming();
    out.querySelector(".debug-lab-empty")?.remove();
    const msg = documentRef.createElement("div");
    msg.className = "debug-chat-message debug-user-message";
    msg.textContent = text;
    out.append(msg);
    out.scrollTop = out.scrollHeight;
    _streamingMsg = null;
  }

  function renderSuggestedList() {
    const list = elements.debugTcSuggestedList;
    if (!list) return;
    list.innerHTML = "";
    if (!aiTestCases.length) {
      list.innerHTML = '<div class="debug-tc-empty">AI 추천 케이스가 없습니다. 다시 시도해보세요.</div>';
      return;
    }
    aiTestCases.forEach((tc, index) => {
      list.append(makeTcCard(tc, "ai", index));
    });
  }

  function renderUserList() {
    const list = elements.debugTcUserList;
    if (!list) return;
    list.innerHTML = "";
    if (!userTestCases.length) return;
    userTestCases.forEach((tc, index) => {
      list.append(makeTcCard(tc, "custom", index));
    });
  }

  function makeTcCard(tc, src, index) {
    const card = documentRef.createElement("div");

    if (src === "ai") {
      card.className = "debug-tc-card";

      // Top row: checkbox + index + badge + optional note button
      const row = documentRef.createElement("div");
      row.className = "debug-tc-card-row";

      const label = documentRef.createElement("label");
      label.className = "debug-tc-checkbox-label";

      const checkbox = documentRef.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.dataset.debugTcSrc = "ai";
      checkbox.dataset.debugTcIndex = String(index);

      const indexSpan = documentRef.createElement("span");
      indexSpan.className = "debug-tc-index";
      indexSpan.textContent = String(index + 1);

      label.append(checkbox, indexSpan);
      row.append(label);

      const badge = documentRef.createElement("span");
      badge.className = "debug-tc-badge ai";
      badge.textContent = "AI";
      row.append(badge);

      let noteDiv = null;
      if (tc.note) {
        const noteBtn = documentRef.createElement("button");
        noteBtn.className = "debug-tc-note-btn";
        noteBtn.type = "button";
        noteBtn.title = "설명";
        noteBtn.textContent = "?";

        noteDiv = documentRef.createElement("div");
        noteDiv.className = "debug-tc-note";
        noteDiv.hidden = true;
        noteDiv.textContent = tc.note;

        noteBtn.addEventListener("click", () => {
          noteDiv.hidden = !noteDiv.hidden;
        });

        row.append(noteBtn);
      }

      card.append(row);

      // Fields
      const fields = documentRef.createElement("div");
      fields.className = "debug-tc-fields";

      const makeField = (key, value) => {
        const field = documentRef.createElement("div");
        field.className = "debug-tc-field";

        const keySpan = documentRef.createElement("span");
        keySpan.className = "debug-tc-field-key";
        keySpan.textContent = key;

        const valCode = documentRef.createElement("code");
        valCode.className = "debug-tc-field-val";
        valCode.textContent = value;

        const copyBtn = documentRef.createElement("button");
        copyBtn.className = "debug-tc-copy-btn";
        copyBtn.type = "button";
        copyBtn.title = "복사";
        copyBtn.textContent = "⧉";
        copyBtn.addEventListener("click", () => {
          navigator.clipboard.writeText(value).catch(() => {});
        });

        field.append(keySpan, valCode, copyBtn);
        return field;
      };

      fields.append(makeField("input", tc.input));
      fields.append(makeField("expected", tc.expected));
      card.append(fields);

      if (noteDiv) {
        card.append(noteDiv);
      }

    } else {
      // src === "custom", tc is {input, expected}
      card.className = "debug-tc-card";

      const row = documentRef.createElement("div");
      row.className = "debug-tc-card-row";

      const label = documentRef.createElement("label");
      label.className = "debug-tc-checkbox-label";

      const checkbox = documentRef.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.dataset.debugTcSrc = "custom";
      checkbox.dataset.debugTcIndex = String(index);

      const indexSpan = documentRef.createElement("span");
      indexSpan.className = "debug-tc-index";
      indexSpan.textContent = String(index + 1);

      label.append(checkbox, indexSpan);
      row.append(label);

      const badge = documentRef.createElement("span");
      badge.className = "debug-tc-badge custom";
      badge.textContent = "직접";
      row.append(badge);

      const actions = documentRef.createElement("div");
      actions.className = "debug-tc-card-actions";

      const editBtn = documentRef.createElement("button");
      editBtn.className = "debug-tc-edit-btn";
      editBtn.type = "button";
      editBtn.title = "수정";
      editBtn.setAttribute("aria-label", "수정");
      editBtn.textContent = "✎";

      const deleteBtn = documentRef.createElement("button");
      deleteBtn.className = "debug-tc-delete-btn";
      deleteBtn.type = "button";
      deleteBtn.title = "삭제";
      deleteBtn.setAttribute("aria-label", "삭제");
      deleteBtn.textContent = "×";

      deleteBtn.addEventListener("click", () => {
        userTestCases.splice(index, 1);
        renderUserList();
      });

      editBtn.addEventListener("click", () => {
        const fieldsDiv = card.querySelector(".debug-tc-fields");
        if (!fieldsDiv) return;

        const inputValEl = fieldsDiv.querySelectorAll(".debug-tc-field-val")[0];
        const expectedValEl = fieldsDiv.querySelectorAll(".debug-tc-field-val")[1];
        if (!inputValEl || !expectedValEl) return;

        const editInputEl = documentRef.createElement("div");
        editInputEl.className = "debug-console-input debug-tc-edit-input";
        editInputEl.contentEditable = "true";
        editInputEl.textContent = tc.input;

        const editExpectedEl = documentRef.createElement("div");
        editExpectedEl.className = "debug-console-input debug-tc-edit-input";
        editExpectedEl.contentEditable = "true";
        editExpectedEl.textContent = tc.expected;

        inputValEl.replaceWith(editInputEl);
        expectedValEl.replaceWith(editExpectedEl);
        editInputEl.focus();

        editBtn.textContent = "저장";
        deleteBtn.textContent = "취소";

        const newEditBtn = editBtn.cloneNode(true);
        const newDeleteBtn = deleteBtn.cloneNode(true);
        editBtn.replaceWith(newEditBtn);
        deleteBtn.replaceWith(newDeleteBtn);

        newEditBtn.addEventListener("click", () => {
          const newInput = editableText(editInputEl);
          const newExpected = editableText(editExpectedEl);
          if (!newInput || !newExpected) { renderUserList(); return; }
          userTestCases[index] = { input: newInput, expected: newExpected };
          renderUserList();
        });

        newDeleteBtn.addEventListener("click", () => {
          renderUserList();
        });
      });

      actions.append(editBtn, deleteBtn);
      row.append(actions);
      card.append(row);

      // Fields (same structure as AI card)
      const fields = documentRef.createElement("div");
      fields.className = "debug-tc-fields";

      const makeField = (key, value) => {
        const field = documentRef.createElement("div");
        field.className = "debug-tc-field";

        const keySpan = documentRef.createElement("span");
        keySpan.className = "debug-tc-field-key";
        keySpan.textContent = key;

        const valCode = documentRef.createElement("code");
        valCode.className = "debug-tc-field-val";
        valCode.textContent = value;

        const copyBtn = documentRef.createElement("button");
        copyBtn.className = "debug-tc-copy-btn";
        copyBtn.type = "button";
        copyBtn.title = "복사";
        copyBtn.textContent = "⧉";
        copyBtn.addEventListener("click", () => {
          navigator.clipboard.writeText(value).catch(() => {});
        });

        field.append(keySpan, valCode, copyBtn);
        return field;
      };

      fields.append(makeField("input", tc.input));
      fields.append(makeField("expected", tc.expected));
      card.append(fields);
    }

    return card;
  }

  // Called by writeOutput during streaming and on completion when action === "suggest_testcases"
  function handleSuggestStream(text, { isFinal = false } = {}) {
    if (!text) return;
    const cases = parseSuggestedCases(text);
    if (cases.length) {
      aiTestCases = cases;
      renderSuggestedList();
    } else if (isFinal) {
      const list = elements.debugTcSuggestedList;
      if (list) list.innerHTML = '<div class="debug-tc-empty">케이스를 파싱하지 못했습니다. 다시 시도해보세요.</div>';
    }
  }

  // Called on each stream delta / final for non-suggest actions.
  // setOutput("") resets the streaming message reference without clearing chat history.
  // setOutput(text) updates the current streaming message or creates a new one.
  function setOutput(text, actionLabel = "") {
    const out = elements.debugLabOutput;
    if (!out) return;

    if (!text) return;

    out.querySelector(".debug-lab-empty")?.remove();

    if (_streamingMsg) {
      const body = _streamingMsg.querySelector(".debug-msg-body");
      if (body) body.innerHTML = formatMarkdown(text);
      attachDebugMessageActions(_streamingMsg);
      out.scrollTop = out.scrollHeight;
    } else {
      const label = actionLabel || _pendingLabel;
      _pendingLabel = "";

      const msg = documentRef.createElement("div");
      msg.className = "debug-chat-message";
      const body = documentRef.createElement("div");
      body.className = "debug-msg-body";
      body.innerHTML = formatMarkdown(text);
      msg.append(body);
      attachDebugMessageActions(msg);
      out.append(msg);
      out.scrollTop = out.scrollHeight;
      _streamingMsg = msg;
    }
  }

  function finalizeStreaming() {
    if (_streamingMsg) {
      attachDebugMessageActions(_streamingMsg);
    }
  }

  // Called when switching to a new problem — clears everything.
  function clearOutput() {
    _streamingMsg = null;
    _pendingLabel = "";
    aiTestCases = [];
    userTestCases = [];
    if (elements.debugLabOutput) {
      elements.debugLabOutput.innerHTML = '<div class="debug-lab-empty">액션 버튼을 누르거나 아래에서 자유롭게 질문하세요.</div>';
    }
    renderUserList();
  }

  function setStateText(text) {
    if (elements.debugLabState) elements.debugLabState.textContent = text || "";
  }

  function hydrateFromContext() {
    // test cases are generated on demand, not auto-extracted
  }

  return {
    init,
    hydrateFromContext,
    setOutput,
    clearOutput,
    setStateText,
    handleSuggestStream,
    finalizeStreaming,
    activeTestCases: () => [...aiTestCases, ...userTestCases].map(tcToString).slice(0, 8)
  };
}

function editableText(element) {
  return (element?.textContent || "").trim();
}

function clearEditable(element) {
  if (element) element.textContent = "";
}
