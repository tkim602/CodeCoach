const GUEST_STATUS_ID = "codecoach-guest-status";
let guestTrial = null;
let uiLanguage = "en";
let suppressAutomaticModalOnce = false;

bootGuestOnboarding().catch(() => {});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "AI_STREAM_DONE" && message.trial) {
    guestTrial = message.trial;
    renderGuestStatus();
  }
  return false;
});

async function bootGuestOnboarding() {
  await domReady();
  const settingsResponse = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" }).catch(() => null);
  uiLanguage = settingsResponse?.settings?.uiLanguage === "ko" ? "ko" : "en";
  installGuestChoice();
  const response = await chrome.runtime.sendMessage({ type: "GET_GUEST_STATUS" }).catch(() => null);
  if (response?.enabled) {
    guestTrial = response.trial || null;
    suppressAutomaticModalOnce = true;
    renderGuestStatus();
    const modal = document.getElementById("apikey-modal");
    if (modal && !modal.hidden) {
      modal.hidden = true;
      suppressAutomaticModalOnce = false;
    } else {
      observeFirstRunModal();
    }
  }
}

function installGuestChoice() {
  const saveView = document.getElementById("apikey-view-save");
  if (!saveView || document.getElementById("apikey-guest-continue")) return;

  const divider = document.createElement("div");
  divider.className = "codecoach-guest-divider";
  divider.innerHTML = `<span>${text("or")}</span>`;

  const button = document.createElement("button");
  button.id = "apikey-guest-continue";
  button.type = "button";
  button.className = "codecoach-guest-button";
  button.innerHTML = `<strong>${text("continueGuest")}</strong><span>${text("guestCtaSub")}</span>`;

  const note = document.createElement("p");
  note.id = "apikey-guest-note";
  note.className = "codecoach-guest-note";

  const style = document.createElement("style");
  style.textContent = `
    .codecoach-guest-divider{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px;margin:2px 0}.codecoach-guest-divider::before,.codecoach-guest-divider::after{content:"";height:1px;background:var(--border);flex:1}.codecoach-guest-button{width:100%;border:1px solid rgba(97,40,255,.22);border-radius:12px;padding:11px 13px;background:var(--accent-soft);color:var(--accent-text);cursor:pointer;text-align:left;display:flex;flex-direction:column;gap:2px}.codecoach-guest-button:hover{border-color:rgba(97,40,255,.42);background:rgba(97,40,255,.14)}.codecoach-guest-button strong{font-size:13px}.codecoach-guest-button span{font-size:11px;color:var(--muted-strong)}.codecoach-guest-button:disabled{opacity:.55;cursor:default}.codecoach-guest-note{margin:0;text-align:center;color:var(--muted);font-size:11px}.codecoach-guest-status{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(97,40,255,.18);background:var(--accent-soft);color:var(--accent-text);border-radius:999px;padding:4px 8px;font-size:11px;font-weight:650;margin-left:auto;white-space:nowrap}.codecoach-guest-status.is-empty{color:var(--warn);background:var(--warn-bg);border-color:var(--warn-border)}
  `;
  document.head.appendChild(style);
  saveView.append(divider, button, note);

  button.addEventListener("click", async () => {
    button.disabled = true;
    const original = button.innerHTML;
    button.innerHTML = `<strong>${text("startingGuest")}</strong><span>${text("creatingGuest")}</span>`;
    const response = await chrome.runtime.sendMessage({ type: "START_GUEST_TRIAL" }).catch((error) => ({ ok: false, error: error.message }));
    if (!response?.ok) {
      button.disabled = false;
      button.innerHTML = original;
      note.textContent = response?.error || text("guestUnavailable");
      return;
    }
    guestTrial = response.trial || { remaining: 10, limit: 10, used: 0 };
    note.textContent = text("guestReady");
    renderGuestStatus();
    const modal = document.getElementById("apikey-modal");
    if (modal) modal.hidden = true;
  });
}

function renderGuestStatus() {
  const row = document.getElementById("composer-model-row") || document.querySelector(".coach-composer .panel-heading");
  if (!row) return;
  let badge = document.getElementById(GUEST_STATUS_ID);
  if (!badge) {
    badge = document.createElement("span");
    badge.id = GUEST_STATUS_ID;
    badge.className = "codecoach-guest-status";
    row.appendChild(badge);
  }
  const remaining = Number.isFinite(Number(guestTrial?.remaining)) ? Number(guestTrial.remaining) : 10;
  badge.textContent = remaining > 0 ? text("guestLeft", { remaining }) : text("guestUsedBadge");
  badge.classList.toggle("is-empty", remaining <= 0);

  const button = document.getElementById("apikey-guest-continue");
  if (button) {
    button.disabled = remaining <= 0;
    button.innerHTML = remaining > 0
      ? `<strong>${text("guestActive")}</strong><span>${text("guestCount", { remaining })}</span>`
      : `<strong>${text("guestUsed")}</strong><span>${text("connectKey")}</span>`;
  }

  const note = document.getElementById("apikey-guest-note");
  if (note) note.textContent = remaining > 0 ? text("guestActiveNote", { remaining }) : text("guestUsedNote");
}

function observeFirstRunModal() {
  const modal = document.getElementById("apikey-modal");
  if (!modal) return;
  const observer = new MutationObserver(() => {
    if (!suppressAutomaticModalOnce || modal.hidden) return;
    suppressAutomaticModalOnce = false;
    modal.hidden = true;
    observer.disconnect();
  });
  observer.observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  setTimeout(() => {
    suppressAutomaticModalOnce = false;
    observer.disconnect();
  }, 1800);
}

function domReady() {
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

function text(key, vars = {}) {
  const value = STRINGS[uiLanguage]?.[key] || STRINGS.en[key] || key;
  return value.replace(/\{(\w+)\}/g, (_match, name) => String(vars[name] ?? ""));
}

const STRINGS = {
  en: {
    or: "or",
    continueGuest: "Continue as guest",
    guestCtaSub: "10 free AI questions · no API key required",
    startingGuest: "Starting guest trial...",
    creatingGuest: "Creating a private guest session",
    guestUnavailable: "Guest mode is temporarily unavailable.",
    guestReady: "Guest mode is ready.",
    guestLeft: "Guest · {remaining} left",
    guestUsedBadge: "Guest trial used · add API key",
    guestActive: "Guest mode active",
    guestCount: "{remaining} of 10 AI questions left",
    guestUsed: "Guest trial used",
    connectKey: "Connect your OpenAI API key to continue",
    guestActiveNote: "Guest trial active · {remaining} questions left",
    guestUsedNote: "Guest trial used. Connect your OpenAI API key to continue."
  },
  ko: {
    or: "또는",
    continueGuest: "게스트로 계속하기",
    guestCtaSub: "무료 AI 질문 10회 · API key 불필요",
    startingGuest: "게스트 체험을 시작하는 중...",
    creatingGuest: "비공개 게스트 세션을 만드는 중",
    guestUnavailable: "게스트 모드를 잠시 사용할 수 없습니다.",
    guestReady: "게스트 모드가 준비되었습니다.",
    guestLeft: "게스트 · {remaining}회 남음",
    guestUsedBadge: "게스트 체험 종료 · API key 연결",
    guestActive: "게스트 모드 사용 중",
    guestCount: "무료 AI 질문 {remaining}/10회 남음",
    guestUsed: "게스트 체험 종료",
    connectKey: "계속하려면 OpenAI API key를 연결하세요",
    guestActiveNote: "게스트 체험 사용 중 · {remaining}회 남음",
    guestUsedNote: "게스트 체험을 모두 사용했습니다. 계속하려면 OpenAI API key를 연결하세요."
  }
};
