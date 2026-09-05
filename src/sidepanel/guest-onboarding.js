const GUEST_STATUS_ID = "codecoach-guest-status";
let guestTrial = null;
let uiLanguage = "en";
let hasApiKey = false;
let suppressAutomaticModalOnce = false;

bootGuestOnboarding().catch(() => {});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "AI_STREAM_DONE" && message.trial) {
    guestTrial = message.trial;
    renderGuestStatus();
  }
  return false;
});

chrome.storage?.onChanged?.addListener((_changes, areaName) => {
  if (areaName !== "local") return;
  refreshSettings().then(() => {
    renderGuestStatus();
    updateGuestChoice();
  }).catch(() => {});
});

async function bootGuestOnboarding() {
  await domReady();
  await refreshSettings();
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

  const button = document.createElement("button");
  button.id = "apikey-guest-continue";
  button.type = "button";
  button.className = "codecoach-guest-button";
  button.textContent = text("continueGuest");

  const note = document.createElement("p");
  note.id = "apikey-guest-note";
  note.className = "codecoach-guest-note";
  note.hidden = true;

  const style = document.createElement("style");
  style.textContent = `
    .codecoach-guest-button{align-self:center;border:0;border-radius:4px;padding:7px 5px;background:transparent;color:var(--muted-strong);cursor:pointer;font:inherit;font-size:12px;text-decoration:underline;text-underline-offset:3px}.codecoach-guest-button:hover{color:var(--text)}.codecoach-guest-button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.codecoach-guest-button:disabled{opacity:.55;cursor:default}.codecoach-guest-note{margin:0;text-align:center;color:var(--muted);font-size:11px}.codecoach-guest-status{display:inline-block;border:0;background:transparent;color:var(--muted);border-radius:0;padding:4px 0;font-size:11px;font-weight:400;margin-left:auto;white-space:nowrap}.codecoach-guest-status.is-empty{color:var(--warn)}
  `;
  document.head.appendChild(style);
  saveView.append(button, note);

  button.addEventListener("click", async () => {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = text("startingGuest");
    const response = await chrome.runtime.sendMessage({ type: "START_GUEST_TRIAL" }).catch((error) => ({ ok: false, error: error.message }));
    if (!response?.ok) {
      button.disabled = false;
      button.textContent = original;
      note.textContent = response?.error || text("guestUnavailable");
      note.hidden = false;
      return;
    }
    guestTrial = response.trial || { remaining: 10, limit: 10, used: 0 };
    note.hidden = true;
    renderGuestStatus();
    const modal = document.getElementById("apikey-modal");
    if (modal) modal.hidden = true;
  });
}

function renderGuestStatus() {
  const row = document.getElementById("composer-model-row") || document.querySelector(".coach-composer .panel-heading");
  if (!row) return;
  let badge = document.getElementById(GUEST_STATUS_ID);
  if (hasApiKey) {
    badge?.remove();
    updateGuestChoice();
    return;
  }
  if (!guestTrial) return;
  if (!badge) {
    badge = document.createElement("span");
    badge.id = GUEST_STATUS_ID;
    badge.className = "codecoach-guest-status";
    row.appendChild(badge);
  }
  const remaining = Number.isFinite(Number(guestTrial?.remaining)) ? Number(guestTrial.remaining) : 10;
  badge.textContent = remaining > 0 ? text("guestLeft", { remaining }) : text("guestUsedBadge");
  badge.classList.toggle("is-empty", remaining <= 0);

  updateGuestChoice(remaining);
}

function updateGuestChoice(remaining = Number(guestTrial?.remaining)) {
  const button = document.getElementById("apikey-guest-continue");
  if (button) {
    button.hidden = hasApiKey;
    if (hasApiKey) {
      button.disabled = false;
    } else {
      remaining = Number.isFinite(Number(remaining)) ? Number(remaining) : 10;
      button.disabled = remaining <= 0;
      button.textContent = remaining > 0 ? text("continueGuest") : text("guestUsed");
    }
  }

  const note = document.getElementById("apikey-guest-note");
  if (note) {
    note.hidden = hasApiKey || remaining > 0;
    note.textContent = note.hidden ? "" : text("guestUsedNote");
  }
}

async function refreshSettings() {
  const settingsResponse = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" }).catch(() => null);
  uiLanguage = settingsResponse?.settings?.uiLanguage === "ko" ? "ko" : "en";
  hasApiKey = Boolean(settingsResponse?.settings?.hasApiKey);
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
    continueGuest: "Try free first · 10 questions",
    startingGuest: "Starting...",
    guestUnavailable: "Guest mode is temporarily unavailable.",
    guestLeft: "{remaining} left",
    guestUsedBadge: "Guest trial used · add API key",
    guestUsed: "Free questions used",
    guestUsedNote: "Guest trial used. Connect your OpenAI API key to continue."
  },
  ko: {
    continueGuest: "먼저 무료로 사용하기 · 10회",
    startingGuest: "시작 중...",
    guestUnavailable: "게스트 모드를 잠시 사용할 수 없습니다.",
    guestLeft: "{remaining}회 남음",
    guestUsedBadge: "게스트 체험 종료 · API key 연결",
    guestUsed: "무료 질문 사용 완료",
    guestUsedNote: "게스트 체험을 모두 사용했습니다. 계속하려면 OpenAI API key를 연결하세요."
  }
};
