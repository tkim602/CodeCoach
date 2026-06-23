export function createConfirmController({ elements, documentRef = document } = {}) {
  const modal = elements?.confirmModal;
  const titleEl = elements?.confirmTitle;
  const messageEl = elements?.confirmMessage;
  const closeBtn = elements?.confirmClose;
  const cancelBtn = elements?.confirmCancel;
  const okBtn = elements?.confirmOk;
  let pendingResolve = null;
  let previousFocus = null;

  function init() {
    closeBtn?.addEventListener("click", () => resolveCurrent(false));
    cancelBtn?.addEventListener("click", () => resolveCurrent(false));
    okBtn?.addEventListener("click", () => resolveCurrent(true));
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) resolveCurrent(false);
    });
    documentRef.addEventListener("keydown", handleKeydown, true);
  }

  function confirmAction({
    title = "확인",
    message = "",
    confirmLabel = "확인",
    cancelLabel = "취소",
    danger = false
  } = {}) {
    if (!modal || !titleEl || !messageEl || !cancelBtn || !okBtn) {
      return Promise.resolve(fallbackConfirm(message || title));
    }
    if (pendingResolve) resolveCurrent(false, { restoreFocus: false });

    previousFocus = documentRef.activeElement instanceof HTMLElement ? documentRef.activeElement : null;
    titleEl.textContent = title;
    messageEl.textContent = message;
    cancelBtn.textContent = cancelLabel;
    okBtn.textContent = confirmLabel;
    okBtn.classList.toggle("confirm-ok--danger", Boolean(danger));
    modal.hidden = false;
    okBtn.focus();

    return new Promise((resolve) => {
      pendingResolve = resolve;
    });
  }

  function resolveCurrent(value, { restoreFocus = true } = {}) {
    if (!pendingResolve) {
      if (modal) modal.hidden = true;
      return;
    }
    const resolve = pendingResolve;
    pendingResolve = null;
    if (modal) modal.hidden = true;
    resolve(Boolean(value));
    if (restoreFocus && previousFocus && typeof previousFocus.focus === "function") {
      previousFocus.focus();
    }
    previousFocus = null;
  }

  function handleKeydown(event) {
    if (!modal || modal.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      resolveCurrent(false);
      return;
    }
    if (event.key === "Tab") {
      trapFocus(event);
    }
  }

  function trapFocus(event) {
    const focusable = focusableControls();
    if (!focusable.length) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const active = documentRef.activeElement;
    const currentIndex = focusable.indexOf(active);
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = event.shiftKey
      ? (startIndex - 1 + focusable.length) % focusable.length
      : (startIndex + 1) % focusable.length;
    focusable[nextIndex]?.focus();
  }

  function focusableControls() {
    if (!modal) return [];
    return [...modal.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")]
      .filter((element) => {
        const style = globalThis.getComputedStyle?.(element);
        return style?.display !== "none" && style?.visibility !== "hidden";
      });
  }

  function fallbackConfirm(message) {
    if (typeof globalThis.confirm !== "function") return false;
    return globalThis.confirm(message);
  }

  return { init, confirmAction };
}
