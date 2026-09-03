const TOGGLE_ID = "inline-proactive-coach";

boot().catch(() => {});

async function boot() {
  await domReady();
  const appearance = document.querySelector("#appearance");
  if (!appearance || document.getElementById(TOGGLE_ID)) return;

  const response = await sendMessage({ type: "GET_SETTINGS" }).catch(() => null);
  const settings = response?.settings || {};
  const isKo = settings.uiLanguage === "ko";

  const row = document.createElement("label");
  row.className = "settings-row check-row";
  row.innerHTML = `
    <div>
      <strong>${isKo ? "인라인 코칭" : "Inline proactive coach"}</strong>
      <p>${isKo ? "코딩 중 막히거나 실행 결과가 바뀌었을 때 에디터 안에 작은 힌트를 표시합니다." : "Show small editor-local nudges when you get stuck or when run results change."}</p>
    </div>
    <span class="toggle-switch">
      <input id="${TOGGLE_ID}" type="checkbox" ${settings.proactiveCoachEnabled === false ? "" : "checked"}>
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
    </span>
  `;

  appearance.appendChild(row);
  const toggle = row.querySelector(`#${TOGGLE_ID}`);
  toggle.addEventListener("change", async () => {
    toggle.disabled = true;
    try {
      await sendMessage({
        type: "SAVE_SETTINGS",
        settings: { proactiveCoachEnabled: toggle.checked }
      });
    } finally {
      toggle.disabled = false;
    }
  });
}

function domReady() {
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response || { ok: false });
    });
  });
}
