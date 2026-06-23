export function motionEnabled(windowRef = window) {
  return !windowRef.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

export function pulseElement(element, className = "motion-pulse") {
  if (!element || !motionEnabled()) return;
  element.classList.remove(className);
  requestAnimationFrame(() => element.classList.add(className));
}
