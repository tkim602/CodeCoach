export const DEFAULT_TIMER_DURATION_MS = 30 * 60 * 1000;

export function backgroundTimerAlarmName(key) {
  return `timer:${key}`;
}

export function timerDurationMs(metadata = {}, fallbackDurationMs = DEFAULT_TIMER_DURATION_MS) {
  const value = Number(metadata.timerDurationMs);
  if (Number.isFinite(value) && value > 0) return value;
  return fallbackDurationMs;
}

export function timerRemainingMs(metadata = {}, fallbackDurationMs = DEFAULT_TIMER_DURATION_MS, now = Date.now()) {
  const duration = timerDurationMs(metadata, fallbackDurationMs);
  const storedRemaining = Number.isFinite(Number(metadata.timerRemainingMs))
    ? Math.max(0, Math.min(duration, Number(metadata.timerRemainingMs)))
    : duration;
  if (!metadata.timerRunningSince) return storedRemaining;
  const startedAt = Date.parse(metadata.timerRunningSince);
  if (!Number.isFinite(startedAt)) return storedRemaining;
  return Math.max(0, storedRemaining - (now - startedAt));
}

export function timerElapsedMs(metadata = {}, fallbackDurationMs = DEFAULT_TIMER_DURATION_MS, now = Date.now()) {
  const duration = timerDurationMs(metadata, fallbackDurationMs);
  return Math.max(0, duration - timerRemainingMs(metadata, fallbackDurationMs, now));
}
