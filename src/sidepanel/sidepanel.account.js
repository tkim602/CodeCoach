import { signInWithGoogle, signInWithEmail, signOut, getAuthState, signUpWithEmail, sendPasswordReset } from "../shared/auth.js";
import { formatFirebaseAuthError } from "../shared/firebase.js";
import { pullAllFromFirestore } from "../shared/firestore-sync.js";

const AUTH_KEY = "auth_state";

export function createAccountController({
  elements,
  onAuthChange,
  openSettingsModal,
  openApiKeyModal,
  showToast,
  t = (key) => key,
  confirmAction = defaultConfirmAction
}) {
  const modal = document.getElementById("account-modal");
  const modalTitle = document.getElementById("account-modal-title");
  const closeBtn = document.getElementById("close-account");
  const anonView = document.getElementById("account-anon-view");
  const signupView = document.getElementById("account-signup-view");
  const userView = document.getElementById("account-user-view");
  const modalSubtitle = document.querySelector(".account-modal-subtitle");
  const emailInput = document.getElementById("account-email");
  const passwordInput = document.getElementById("account-password");
  const signInEmailBtn = document.getElementById("account-sign-in-email");
  const signUpLinkBtn = document.getElementById("account-sign-up-link");
  const signupNameInput = document.getElementById("account-signup-name");
  const signupEmailInput = document.getElementById("account-signup-email");
  const signupPasswordInput = document.getElementById("account-signup-password");
  const signupConfirmInput = document.getElementById("account-signup-confirm");
  const signupSubmitBtn = document.getElementById("account-sign-up-email");
  const loginLinkBtn = document.getElementById("account-login-link");
  const signInGoogleBtn = document.getElementById("account-sign-in-google");
  const resetPasswordBtn = document.getElementById("account-reset-password");
  const anonContinueBtn = document.getElementById("account-anon-continue");
  const resetView = document.getElementById("account-reset-view");
  const resetEmailInput = document.getElementById("account-reset-email");
  const resetSubmitBtn = document.getElementById("account-reset-submit");
  const resetBackBtn = document.getElementById("account-reset-back");
  const resetErrorEl = document.getElementById("account-reset-error");
  const resetSuccessEl = document.getElementById("account-reset-success");
  const userAvatar = document.getElementById("account-user-avatar");
  const userFallbackIcon = document.querySelector(".account-user-fallback-icon");
  const userNameEl = document.getElementById("account-user-name");
  const userEmailEl = document.getElementById("account-user-email");
  const signOutBtn = document.getElementById("account-sign-out");
  const changeAccountBtn = document.getElementById("account-change-account");
  const errorEl = document.getElementById("account-error");
  const signupErrorEl = document.getElementById("account-signup-error");
  const topbarAvatarImg = elements.accountAvatarImg;
  const topbarAccountIcon = document.getElementById("account-icon");
  const accountButton = elements.railAccount || elements.openAccount;

  async function init() {
    const state = await getAuthState();
    renderAuth(state);

    chrome.storage.local.onChanged.addListener((changes) => {
      if (AUTH_KEY in changes) {
        renderAuth(changes[AUTH_KEY].newValue || null);
        onAuthChange?.();
      }
    });

    closeBtn?.addEventListener("click", closeAccountModal);
    modal?.addEventListener("click", (e) => { if (e.target === modal) closeAccountModal(); });
    anonContinueBtn?.addEventListener("click", closeAccountModal);
    signInEmailBtn?.addEventListener("click", handleSignInEmail);
    signUpLinkBtn?.addEventListener("click", showSignupView);
    loginLinkBtn?.addEventListener("click", showLoginView);
    signupSubmitBtn?.addEventListener("click", handleSignUpEmail);
    signInGoogleBtn?.addEventListener("click", handleSignInGoogle);
    resetPasswordBtn?.addEventListener("click", showResetView);
    resetSubmitBtn?.addEventListener("click", handleResetPassword);
    resetBackBtn?.addEventListener("click", showLoginView);
    resetEmailInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleResetPassword(); });
    signOutBtn?.addEventListener("click", handleSignOut);
    changeAccountBtn?.addEventListener("click", handleChangeAccount);
    userAvatar?.addEventListener("error", handleModalAvatarError);
    topbarAvatarImg?.addEventListener("error", handleTopbarAvatarError);

    [emailInput, passwordInput].forEach((input) => {
      input?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleSignInEmail(); });
      input?.addEventListener("input", clearInlineError);
    });
    [signupNameInput, signupEmailInput, signupPasswordInput, signupConfirmInput].forEach((input) => {
      input?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleSignUpEmail(); });
      input?.addEventListener("input", clearInlineError);
    });
  }

  function renderAuth(authState) {
    const signedIn = Boolean(authState?.uid);

    if (anonView) anonView.hidden = signedIn;
    if (signupView) signupView.hidden = true;
    if (userView) userView.hidden = !signedIn;
    if (anonContinueBtn) anonContinueBtn.hidden = signedIn;
    if (modalTitle) modalTitle.textContent = signedIn ? t("accountModalTitleSignedIn") : t("accountModalTitleSignedOut");
    if (modalSubtitle) {
      modalSubtitle.textContent = signedIn
        ? t("accountModalSubtitleSignedIn")
        : t("accountModalSubtitleSignedOut");
    }
    if (signOutBtn) signOutBtn.textContent = t("accountSignOut");
    if (changeAccountBtn) changeAccountBtn.textContent = t("accountChangeAccount");

    if (signedIn) {
      const hasPhoto = Boolean(authState.photoURL);
      if (userAvatar) {
        if (hasPhoto) userAvatar.src = authState.photoURL;
        else userAvatar.removeAttribute("src");
        userAvatar.hidden = !hasPhoto;
      }
      if (userFallbackIcon) userFallbackIcon.hidden = hasPhoto;
      if (userNameEl) userNameEl.textContent = authState.displayName || "";
      if (userEmailEl) userEmailEl.textContent = authState.email || "";
      if (changeAccountBtn) changeAccountBtn.hidden = true;
    } else {
      if (userAvatar) {
        userAvatar.removeAttribute("src");
        userAvatar.hidden = true;
      }
      if (userFallbackIcon) userFallbackIcon.hidden = false;
    }

    if (topbarAvatarImg) {
      const hasPhoto = Boolean(authState?.photoURL);
      if (hasPhoto) topbarAvatarImg.src = authState.photoURL;
      else topbarAvatarImg.removeAttribute("src");
      topbarAvatarImg.hidden = !hasPhoto;
      accountButton?.classList.toggle("has-avatar", hasPhoto);
    }
    if (topbarAccountIcon) {
      topbarAccountIcon.hidden = Boolean(authState?.photoURL);
    }
    accountButton?.setAttribute(
      "aria-label",
      signedIn ? `${t("railAccountTitle")}: ${authState.email || authState.displayName || t("accountModalTitleSignedIn")}` : t("railAccountTitle")
    );
  }

  function openAccountModal() {
    if (modal) modal.hidden = false;
    const signedIn = !userView?.hidden;
    if (!signedIn) showLoginView();
    if (!anonView?.hidden) emailInput?.focus();
  }

  function closeAccountModal() {
    if (modal) modal.hidden = true;
    clearInlineError();
    accountButton?.focus();
  }

  function handleModalAvatarError() {
    if (userAvatar) {
      userAvatar.removeAttribute("src");
      userAvatar.hidden = true;
    }
    if (userFallbackIcon) userFallbackIcon.hidden = false;
  }

  function handleTopbarAvatarError() {
    if (topbarAvatarImg) {
      topbarAvatarImg.removeAttribute("src");
      topbarAvatarImg.hidden = true;
    }
    accountButton?.classList.remove("has-avatar");
    if (topbarAccountIcon) topbarAccountIcon.hidden = false;
  }

  function showLoginView() {
    if (anonView) anonView.hidden = false;
    if (signupView) signupView.hidden = true;
    if (resetView) resetView.hidden = true;
    if (userView) userView.hidden = true;
    if (anonContinueBtn) anonContinueBtn.hidden = false;
    if (modalTitle) modalTitle.textContent = t("accountModalTitleSignedOut");
    if (modalSubtitle) modalSubtitle.textContent = t("accountModalSubtitleSignedOut");
    clearInlineError();
    emailInput?.focus();
  }

  function showResetView() {
    if (anonView) anonView.hidden = true;
    if (signupView) signupView.hidden = true;
    if (resetView) resetView.hidden = false;
    if (userView) userView.hidden = true;
    if (anonContinueBtn) anonContinueBtn.hidden = true;
    if (modalTitle) modalTitle.textContent = t("accountResetTitle");
    if (modalSubtitle) modalSubtitle.textContent = t("accountResetSubtitle");
    if (resetErrorEl) { resetErrorEl.hidden = true; resetErrorEl.textContent = ""; }
    if (resetSuccessEl) { resetSuccessEl.hidden = true; resetSuccessEl.textContent = ""; }
    if (resetEmailInput) resetEmailInput.value = emailInput?.value.trim() || "";
    resetEmailInput?.focus();
  }

  function showSignupView() {
    if (anonView) anonView.hidden = true;
    if (signupView) signupView.hidden = false;
    if (resetView) resetView.hidden = true;
    if (userView) userView.hidden = true;
    if (anonContinueBtn) anonContinueBtn.hidden = false;
    if (modalTitle) modalTitle.textContent = t("accountModalTitleSignUp");
    if (modalSubtitle) modalSubtitle.textContent = t("accountModalSubtitleSignUp");
    clearInlineError();
    if (signupEmailInput) signupEmailInput.value = emailInput?.value.trim() || signupEmailInput.value;
    signupEmailInput?.focus();
  }

  function showInlineError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function showSignupError(message) {
    if (!signupErrorEl) return;
    signupErrorEl.textContent = message;
    signupErrorEl.hidden = false;
  }

  function clearInlineError() {
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
    if (signupErrorEl) {
      signupErrorEl.hidden = true;
      signupErrorEl.textContent = "";
    }
  }

  async function handleSignInEmail() {
    clearInlineError();
    const email = emailInput?.value.trim();
    const password = passwordInput?.value;
    if (!email) { showInlineError(t("accountEmailRequired")); emailInput?.focus(); return; }
    if (!password) { showInlineError(t("accountPasswordRequired")); passwordInput?.focus(); return; }
    setFormBusy(true);
    try {
      await signInWithEmail(email, password);
      await pullAllFromFirestore();
      closeAccountModal();
      showToast?.(t("accountSignInSuccess"));
    } catch (err) {
      showInlineError(formatAuthError(err.message));
    } finally {
      setFormBusy(false);
    }
  }

  async function handleSignUpEmail() {
    clearInlineError();
    const name = signupNameInput?.value.trim() || "";
    const email = signupEmailInput?.value.trim();
    const password = signupPasswordInput?.value || "";
    const confirm = signupConfirmInput?.value || "";
    if (!email) { showSignupError(t("accountEmailRequired")); signupEmailInput?.focus(); return; }
    if (!password) { showSignupError(t("accountPasswordRequired")); signupPasswordInput?.focus(); return; }
    const passwordError = validateSignupPassword(password);
    if (passwordError) { showSignupError(passwordError); signupPasswordInput?.focus(); return; }
    if (password !== confirm) { showSignupError(t("accountPasswordMismatch")); signupConfirmInput?.focus(); return; }
    setFormBusy(true);
    try {
      await signUpWithEmail(email, password, name);
      showToast?.(t("accountSignUpSuccess"));
      showLoginView();
      if (emailInput) emailInput.value = email;
      if (passwordInput) passwordInput.value = "";
    } catch (err) {
      showSignupError(formatAuthError(err.message));
    } finally {
      setFormBusy(false);
    }
  }

  async function handleResetPassword() {
    if (resetErrorEl) { resetErrorEl.hidden = true; resetErrorEl.textContent = ""; }
    if (resetSuccessEl) { resetSuccessEl.hidden = true; resetSuccessEl.textContent = ""; }
    const email = resetEmailInput?.value.trim();
    if (!email) {
      if (resetErrorEl) { resetErrorEl.textContent = t("accountResetEmailRequired"); resetErrorEl.hidden = false; }
      resetEmailInput?.focus();
      return;
    }
    if (resetSubmitBtn) resetSubmitBtn.disabled = true;
    try {
      await sendPasswordReset(email);
      if (resetSuccessEl) { resetSuccessEl.textContent = t("accountResetSuccess"); resetSuccessEl.hidden = false; }
      if (resetSubmitBtn) resetSubmitBtn.hidden = true;
    } catch (err) {
      if (resetErrorEl) { resetErrorEl.textContent = formatAuthError(err.message); resetErrorEl.hidden = false; }
    } finally {
      if (resetSubmitBtn) resetSubmitBtn.disabled = false;
    }
  }

  async function handleSignInGoogle() {
    clearInlineError();
    if (signInGoogleBtn) signInGoogleBtn.disabled = true;
    try {
      await signInWithGoogle({ forceNewAccount: false });
      await pullAllFromFirestore();
      closeAccountModal();
      showToast?.(t("accountGoogleSuccess"));
    } catch (err) {
      showInlineError(formatAuthError(err.message));
    } finally {
      if (signInGoogleBtn) signInGoogleBtn.disabled = false;
    }
  }

  async function handleChangeAccount() {
    if (changeAccountBtn) changeAccountBtn.disabled = true;
    const previous = await getAuthState();
    try {
      await signOut();
      renderAuth(null);
      const next = await signInWithGoogle({ forceNewAccount: true });
      await pullAllFromFirestore();
      closeAccountModal();
      if (previous?.uid && next?.uid && previous.uid === next.uid) {
        showToast?.(t("accountChangeSameAccount"));
      } else {
        showToast?.(t("accountChangeSuccess"));
      }
    } catch (err) {
      showInlineError(formatAuthError(err.message));
    } finally {
      if (changeAccountBtn) changeAccountBtn.disabled = false;
    }
  }

  async function handleSignOut() {
    const confirmed = await confirmAction({
      title: t("signOutTitle"),
      message: t("signOutMessage"),
      confirmLabel: t("signOutLabel"),
      cancelLabel: t("cancel"),
      danger: true
    });
    if (!confirmed) return;
    if (signOutBtn) signOutBtn.disabled = true;
    try {
      await signOut();
      renderAuth(null);
      onAuthChange?.();
      closeAccountModal();
      showToast?.(t("signOutSuccess"));
    } catch (err) {
      showToast?.(t("signOutError").replace("{msg}", err.message), "error");
    } finally {
      if (signOutBtn) signOutBtn.disabled = false;
    }
  }

  function setFormBusy(busy) {
    [signInEmailBtn, signInGoogleBtn, signupSubmitBtn].forEach((btn) => { if (btn) btn.disabled = busy; });
    if (emailInput) emailInput.disabled = busy;
    if (passwordInput) passwordInput.disabled = busy;
    if (signupNameInput) signupNameInput.disabled = busy;
    if (signupEmailInput) signupEmailInput.disabled = busy;
    if (signupPasswordInput) signupPasswordInput.disabled = busy;
    if (signupConfirmInput) signupConfirmInput.disabled = busy;
  }

  function formatAuthError(message) {
    return formatFirebaseAuthError(message);
  }

  function validateSignupPassword(password) {
    if (password.length < 6) return t("accountPasswordTooShort");
    if (!/[A-Z]/.test(password)) return t("accountPasswordNeedsUpper");
    if (!/[^A-Za-z0-9]/.test(password)) return t("accountPasswordNeedsSpecial");
    return "";
  }

  return { init, openAccountModal, closeAccountModal, renderAuth };
}

function defaultConfirmAction() {
  return Promise.resolve(false);
}
