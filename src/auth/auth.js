import { signUpWithEmail, sendPasswordReset } from "../shared/auth.js";
import { formatFirebaseAuthError } from "../shared/firebase.js";

const params = new URLSearchParams(location.search);
const mode = params.get("mode") === "reset" ? "reset" : "signup";

const views = {
  signup: document.getElementById("view-signup"),
  reset: document.getElementById("view-reset"),
  success: document.getElementById("view-success")
};

function showView(name) {
  Object.values(views).forEach((v) => { if (v) v.hidden = true; });
  if (views[name]) views[name].hidden = false;
}

function showSuccess(title, message) {
  const titleEl = document.getElementById("success-title");
  const msgEl = document.getElementById("success-message");
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  showView("success");
  setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 4000);
}

function showError(errorEl, message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError(errorEl) {
  if (!errorEl) return;
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function formatError(message) {
  return formatFirebaseAuthError(message);
}

document.getElementById("success-close")?.addEventListener("click", () => window.close());

if (mode === "reset") {
  showView("reset");

  const form = document.getElementById("reset-form");
  const emailInput = document.getElementById("reset-email");
  const submitBtn = document.getElementById("reset-submit");
  const errorEl = document.getElementById("reset-error");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError(errorEl);
    const email = emailInput?.value.trim();
    if (!email) {
      showError(errorEl, "이메일 주소를 입력하세요.");
      emailInput?.focus();
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "전송 중...";
    try {
      await sendPasswordReset(email);
      showSuccess(
        "이메일을 확인하세요",
        `${email}으로 비밀번호 재설정 링크를 보냈습니다. 받은 편지함을 확인하세요. (4초 후 자동으로 닫힙니다)`
      );
    } catch (err) {
      showError(errorEl, formatError(err.message));
      submitBtn.disabled = false;
      submitBtn.textContent = "재설정 링크 보내기";
    }
  });

} else {
  showView("signup");

  const form = document.getElementById("signup-form");
  const nameInput = document.getElementById("signup-name");
  const emailInput = document.getElementById("signup-email");
  const passwordInput = document.getElementById("signup-password");
  const confirmInput = document.getElementById("signup-confirm");
  const submitBtn = document.getElementById("signup-submit");
  const errorEl = document.getElementById("signup-error");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError(errorEl);

    const email = emailInput?.value.trim();
    const password = passwordInput?.value || "";
    const confirm = confirmInput?.value || "";
    const name = nameInput?.value.trim() || "";

    if (!email) {
      showError(errorEl, "이메일 주소를 입력하세요.");
      emailInput?.focus();
      return;
    }
    if (!password) {
      showError(errorEl, "비밀번호를 입력하세요.");
      passwordInput?.focus();
      return;
    }
    if (password.length < 6) {
      showError(errorEl, "비밀번호는 6자 이상이어야 합니다.");
      passwordInput?.focus();
      return;
    }
    if (!/[A-Z]/.test(password)) {
      showError(errorEl, "비밀번호에는 영어 대문자 1개 이상이 필요합니다.");
      passwordInput?.focus();
      return;
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      showError(errorEl, "비밀번호에는 특수문자 1개 이상이 필요합니다.");
      passwordInput?.focus();
      return;
    }
    if (password !== confirm) {
      showError(errorEl, "비밀번호가 일치하지 않습니다. 다시 확인해 주세요.");
      confirmInput?.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "처리 중...";
    try {
      await signUpWithEmail(email, password, name);
      showSuccess(
        "이메일 인증을 확인하세요",
        `${email}으로 인증 메일을 보냈습니다. 인증을 완료한 뒤 사이드 패널에서 로그인하세요. (4초 후 자동으로 닫힙니다)`
      );
    } catch (err) {
      showError(errorEl, formatError(err.message));
      submitBtn.disabled = false;
      submitBtn.textContent = "가입하기";
    }
  });
}
