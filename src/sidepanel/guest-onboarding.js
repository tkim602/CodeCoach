const GUEST_STATUS_ID = "codecoach-guest-status";
let guestTrial = null;
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
  installGuestChoice();
  const response = await chrome.runtime.sendMessage({ type: "GET_GUEST_STATUS" }).catch(() => null);
  if (response?.enabled) {
    guestTrial = response.trial || null;
    suppressAutomaticModalOnce = true;
    renderGuestStatus();
    observeFirstRunModal();
  }
}

function installGuestChoice() {
  const saveView = document.getElementById("apikey-view-save");
  if (!saveView || document.getElementById("apikey-guest-continue")) return;

  const divider = document.createElement("div");
  divider.className = "codecoach-guest-divider";
  divider.innerHTML = "<span>or</span>";

  const button = document.createElement("button");
  button.id = "apikey-guest-continue";
  button.type = "button";
  button.className = "codecoach-guest-button";
  button.innerHTML = `<strong>Continue as guest</strong><span>10 free AI questions · no API key required</span>`;

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
    button.innerHTML = "<strong>Starting guest trial...</strong><span>Creating a private guest session</span>";
    const response = await chrome.runtime.sendMessage({ type: "START_GUEST_TRIAL" }).catch((error) => ({ ok: false, error: error.message }));
    if (!response?.ok) {
      button.disabled = false;
      button.innerHTML = original;
      note.textContent = response?.error || "Guest mode is temporarily unavailable.";
      return;
    }
    guestTrial = response.trial || { remaining: 10, limit: 10, used: 0 };
    note.textContent = "Guest mode is ready.";
    renderGuestStatus();
    document.getElementById("apikey-modal")?.setAttribute("hidden", "");
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
  badge.textContent = remaining > 0 ? `Guest · ${remaining} left` : "Guest trial used · add API key";
  badge.classList.toggle("is-empty", remaining <= 0);

  const note = document.getElementById("apikey-guest-note");
  if (note) note.textContent = remaining > 0 ? `Guest trial active · ${remaining} questions left` : "Guest trial used. Connect your OpenAI API key to continue.";
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
