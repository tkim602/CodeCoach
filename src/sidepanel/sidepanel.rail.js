export function createRailController({
  elements,
  switchView,
  openApiKeyModal,
  openOptionsPage,
  openAccountModal,
  refreshAll,
  t = (k) => k,
  documentRef = document
}) {
  const moreButton = elements.railMore;
  const popover = elements.railMorePopover;
  const toggleButton = elements.railToggle;
  const collapseButton = elements.railCollapse;
  const timerButton = elements.timerTab;
  const timerPopup = elements.timerPopup;

  function init() {
    toggleButton?.addEventListener("click", toggleRail);
    collapseButton?.addEventListener("click", () => setRailOpen(false));
    elements.railAccount?.addEventListener("click", () => {
      if (documentRef.body.dataset.railOpen !== "true") setRailOpen(true);
      openAccountModal?.();
    });
    if (moreButton && popover) {
      moreButton.addEventListener("click", toggleMore);
      popover.addEventListener("click", handlePopoverClick);
    }
    if (timerButton && timerPopup) {
      timerButton.addEventListener("click", toggleTimerPopup);
    }
    documentRef.addEventListener("click", closeFromOutside);
    documentRef.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { closeMore(); closeTimerPopup(); }
    });
    setRailOpen(documentRef.body.dataset.railOpen === "true");
  }

  function activate(view) {
    const normalized = view === "code" || view === "history" ? view : view || "coach";
    elements.tabButtons.forEach((button) => {
      if (!button.dataset.view) return;
      const buttonView = button.dataset.view;
      const isActive = buttonView === normalized
        || (normalized === "history" && button.id === "history-tab")
        || (normalized === "review" && button.id === "review-tab");
      button.classList.toggle("active", isActive);
    });
    documentRef.body.dataset.railView = normalized;
    const reviewTitle = documentRef.querySelector("#review-tool-title");
    const reviewSubtitle = documentRef.querySelector("#review-tool-subtitle");
    if (reviewTitle && reviewSubtitle) {
      if (normalized === "history") {
        reviewTitle.textContent = t("historyTitle");
        reviewSubtitle.textContent = t("historySubtitle");
      } else {
        reviewTitle.textContent = t("reviewPlannerTitle");
        reviewSubtitle.textContent = t("reviewPlannerSubtitle");
      }
    }
  }

  function toggleMore(event) {
    event.stopPropagation();
    if (documentRef.body.dataset.railOpen !== "true") setRailOpen(true);
    if (popover.hidden) openMore();
    else closeMore();
  }

  function toggleRail() {
    setRailOpen(documentRef.body.dataset.railOpen !== "true");
  }

  function setRailOpen(open) {
    documentRef.body.dataset.railOpen = open ? "true" : "false";
    toggleButton?.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) closeMore();
  }

  function openMore() {
    popover.hidden = false;
    moreButton?.setAttribute("aria-expanded", "true");
  }

  function closeMore() {
    if (!popover) return;
    popover.hidden = true;
    moreButton?.setAttribute("aria-expanded", "false");
  }

  function toggleTimerPopup(event) {
    event.stopPropagation();
    if (timerPopup.hidden) openTimerPopup();
    else closeTimerPopup();
  }

  function openTimerPopup() {
    if (!timerPopup) return;
    const rect = timerButton.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    timerPopup.style.top = `${midY}px`;
    timerPopup.style.transform = "translateY(-50%)";
    timerPopup.hidden = false;
    timerButton?.setAttribute("aria-expanded", "true");
    closeMore();
  }

  function closeTimerPopup() {
    if (!timerPopup) return;
    timerPopup.hidden = true;
    timerButton?.setAttribute("aria-expanded", "false");
  }

  function handlePopoverClick(event) {
    const action = event.target.closest("[data-rail-action]")?.dataset.railAction;
    if (!action) return;
    closeMore();
    if (action === "api-key") openApiKeyModal?.();
    if (action === "settings") openOptionsPage?.();
    if (action === "account") openAccountModal?.();
    if (action === "refresh") refreshAll?.();
    if (action === "note") switchView?.("note");
    if (action === "review") switchView?.("review");
  }

  function closeFromOutside(event) {
    if (!popover.hidden) {
      if (!popover.contains(event.target) && !moreButton.contains(event.target)) closeMore();
    }
    if (timerPopup && !timerPopup.hidden) {
      if (!timerPopup.contains(event.target) && !timerButton.contains(event.target)) closeTimerPopup();
    }
  }

  return { init, activate, openMore, closeMore, setRailOpen, openTimerPopup, closeTimerPopup };
}
