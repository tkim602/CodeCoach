import {
  DEFAULT_TIMER_DURATION_MS,
  backgroundTimerAlarmName,
  timerDurationMs as _timerDurationMs,
  timerElapsedMs as _timerElapsedMs,
  timerRemainingMs as _timerRemainingMs
} from "./sidepanel.timer.js";
import { formatDuration } from "./sidepanel.utils.js";

const TIMER_ALARM_PATH = "assets/alarm-clock-digital-bell-rings-brukowskij-2-2-00-02.mp3";

export function createTimerController({
  state,
  elements,
  t,
  sendMessage,
  refreshLearningDataOnly,
  writeOutput,
  showToast,
  currentProblemKey,
  currentProblemMetadata
}) {
  function startTimerTicker() {
    if (state.timerTick) clearInterval(state.timerTick);
    state.timerTick = setInterval(renderTimer, 1000);
  }

  function hydrateTimerAlarm() {
    if (!elements.timerAlarm) return;
    const getUrl = globalThis.chrome?.runtime?.getURL;
    state.alarmUrl = typeof getUrl === "function" ? getUrl(TIMER_ALARM_PATH) : "";
    elements.timerAlarm.src = state.alarmUrl;
    elements.timerAlarm.load();
  }

  async function unlockTimerAlarm() {
    if (!state.alarmUrl) return false;
    try {
      const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!state.alarmAudioContext && AudioContextCtor) {
        state.alarmAudioContext = new AudioContextCtor();
      }
      if (state.alarmAudioContext?.state === "suspended") {
        await state.alarmAudioContext.resume();
      }
      if (state.alarmAudioContext && !state.alarmBuffer) {
        state.alarmLoadPromise ||= fetch(state.alarmUrl)
          .then((r) => { if (!r.ok) throw new Error(`Alarm audio load failed: ${r.status}`); return r.arrayBuffer(); })
          .then((buf) => state.alarmAudioContext.decodeAudioData(buf))
          .then((decoded) => { state.alarmBuffer = decoded; return decoded; })
          .catch(() => null);
        await state.alarmLoadPromise;
      }
      return Boolean(state.alarmAudioContext && state.alarmBuffer);
    } catch {
      return false;
    }
  }

  async function playTimerAlarm() {
    try {
      if (await unlockTimerAlarm()) {
        const source = state.alarmAudioContext.createBufferSource();
        source.buffer = state.alarmBuffer;
        source.connect(state.alarmAudioContext.destination);
        source.start(0);
        return;
      }
      if (elements.timerAlarm?.src) {
        elements.timerAlarm.currentTime = 0;
        await elements.timerAlarm.play();
      }
    } catch {
      elements.timerState.textContent = t("timerDone");
    }
  }

  function renderTimer() {
    const key = currentProblemKey();
    const metadata = key ? state.learningData?.problemMetadata?.[key] || {} : {};
    const duration = timerDurationMs(metadata);
    const remaining = timerRemainingMs(metadata);
    const running = Boolean(metadata.timerRunningSince);
    renderTimerDurationControl(duration);
    elements.timerTime.textContent = formatDuration(remaining);
    const warning = running && remaining > 0 && remaining <= 5 * 60 * 1000;
    elements.timerTime.classList.toggle("is-running", running && !warning);
    elements.timerTime.classList.toggle("is-warning", warning);
    elements.timerState.textContent = !key
      ? t("needsPractice")
      : running
        ? t("timerRunning")
        : remaining < duration
          ? t("timerPaused")
          : t("timerIdle");
    elements.timerStart.disabled = !key || running || remaining <= 0;
    elements.timerPause.disabled = !key || !running;
    elements.timerReset.disabled = !key || (remaining >= duration && !running);
    elements.timerFinish.disabled = !key || (!running && remaining >= duration);
    if (key && running && remaining <= 0) {
      handleTimerDone(key, metadata);
    }
  }

  async function updateTimerDuration() {
    const key = currentProblemKey();
    const customSelected = elements.timerDuration.value === "custom";
    if (customSelected && (elements.timerCustomMinutes.hidden || !customTimerMinutes())) {
      elements.timerCustomMinutes.hidden = false;
      elements.timerCustomMinutes.focus();
      return;
    }
    if (!key) return;
    const duration = selectedTimerDurationMs();
    state.timerAlarmedFor = "";
    await updateTimerMetadata({ timerDurationMs: duration, timerRemainingMs: duration, timerElapsedMs: 0, timerRunningSince: "" });
  }

  function updateCustomTimerPreview() {
    if (elements.timerDuration.value !== "custom") return;
    const minutes = customTimerMinutes();
    if (!minutes) return;
    const metadata = currentProblemMetadata();
    if (!metadata.timerRunningSince) {
      elements.timerTime.textContent = formatDuration(minutes * 60 * 1000);
    }
  }

  async function startProblemTimer() {
    const key = currentProblemKey();
    if (!key) return;
    void unlockTimerAlarm();
    const metadata = currentProblemMetadata();
    const duration = timerDurationMs(metadata);
    const remaining = timerRemainingMs(metadata);
    const effectiveRemaining = remaining > 0 ? remaining : duration;
    state.timerAlarmedFor = "";
    await updateTimerMetadata({
      timerDurationMs: duration,
      timerRemainingMs: effectiveRemaining,
      timerElapsedMs: Math.max(0, duration - effectiveRemaining),
      timerRunningSince: new Date().toISOString()
    });
    scheduleBackgroundTimerAlarm(key, effectiveRemaining);
  }

  async function pauseProblemTimer() {
    const key = currentProblemKey();
    if (!key) return;
    const metadata = currentProblemMetadata();
    const duration = timerDurationMs(metadata);
    const remaining = timerRemainingMs(metadata);
    await updateTimerMetadata({
      timerDurationMs: duration,
      timerRemainingMs: remaining,
      timerElapsedMs: Math.max(0, duration - remaining),
      timerRunningSince: ""
    });
    clearBackgroundTimerAlarm(key);
  }

  async function resetProblemTimer() {
    const key = currentProblemKey();
    if (!key) return;
    const duration = selectedTimerDurationMs();
    state.timerAlarmedFor = "";
    await updateTimerMetadata({ timerDurationMs: duration, timerRemainingMs: duration, timerElapsedMs: 0, timerRunningSince: "" });
    clearBackgroundTimerAlarm(key);
  }

  async function finishProblemTimer() {
    const key = currentProblemKey();
    if (!key) return;
    const metadata = currentProblemMetadata();
    const duration = timerDurationMs(metadata);
    const remaining = timerRemainingMs(metadata);
    await updateTimerMetadata({
      timerDurationMs: duration,
      timerRemainingMs: remaining,
      timerElapsedMs: Math.max(0, duration - remaining),
      timerRunningSince: ""
    });
    clearBackgroundTimerAlarm(key);
    showToast(t("timerSaved"));
  }

  async function handleTimerDone(key, metadata) {
    if (state.timerAlarmedFor === key) return;
    state.timerAlarmedFor = key;
    const duration = timerDurationMs(metadata);
    await updateTimerMetadata({
      timerDurationMs: duration,
      timerRemainingMs: 0,
      timerElapsedMs: duration,
      timerRunningSince: "",
      timerFinishedAt: new Date().toISOString()
    });
    clearBackgroundTimerAlarm(key);
    await playTimerAlarm();
    writeOutput(t("timerDone"));
  }

  async function handleBackgroundTimerDone(problemKey) {
    if (!problemKey) return;
    await refreshLearningDataOnly();
    renderTimer();
    if (currentProblemKey() === problemKey && state.timerAlarmedFor !== problemKey) {
      state.timerAlarmedFor = problemKey;
      try { await playTimerAlarm(); } catch { /* blocked until user interaction */ }
      writeOutput(t("timerDone"));
    }
  }

  function scheduleBackgroundTimerAlarm(key, remainingMs) {
    if (!chrome.alarms?.create || !key || !Number.isFinite(remainingMs) || remainingMs <= 0) return;
    try { chrome.alarms.create(backgroundTimerAlarmName(key), { when: Date.now() + remainingMs }); } catch { /* best-effort */ }
  }

  function clearBackgroundTimerAlarm(key) {
    if (!chrome.alarms?.clear || !key) return;
    try { chrome.alarms.clear(backgroundTimerAlarmName(key)); } catch { /* ignore */ }
  }

  async function updateTimerMetadata(patch) {
    const key = currentProblemKey();
    if (!key) return;
    const response = await sendMessage({ type: "UPDATE_TIMER_STATE", problemKey: key, patch });
    if (!response.ok) { showToast(response.error, "error"); return; }
    await refreshLearningDataOnly();
    renderTimer();
  }

  function renderTimerDurationControl(duration) {
    const keepCustomDraft = elements.timerDuration.value === "custom" && !customTimerMinutes() && !elements.timerCustomMinutes.hidden;
    if (keepCustomDraft) {
      elements.timerDuration.value = "custom";
      elements.timerCustomMinutes.hidden = false;
      return;
    }
    const presetValues = [...elements.timerDuration.options].map((o) => o.value).filter((v) => v !== "custom");
    const durationValue = String(duration);
    const isPreset = presetValues.includes(durationValue);
    elements.timerDuration.value = isPreset ? durationValue : "custom";
    elements.timerCustomMinutes.hidden = isPreset;
    if (!isPreset && document.activeElement !== elements.timerCustomMinutes) {
      elements.timerCustomMinutes.value = String(Math.max(1, Math.round(duration / 60000)));
    }
  }

  function customTimerMinutes() {
    const minutes = Number(elements.timerCustomMinutes.value);
    if (!Number.isFinite(minutes) || minutes <= 0) return 0;
    return Math.min(240, Math.max(1, Math.round(minutes)));
  }

  function selectedTimerDurationMs() {
    if (elements.timerDuration.value === "custom") {
      const minutes = customTimerMinutes();
      return minutes ? minutes * 60 * 1000 : DEFAULT_TIMER_DURATION_MS;
    }
    const value = Number(elements.timerDuration.value);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMER_DURATION_MS;
  }

  function timerDurationMs(metadata = {}) {
    return _timerDurationMs(metadata, selectedTimerDurationMs());
  }

  function timerRemainingMs(metadata = {}) {
    return _timerRemainingMs(metadata, selectedTimerDurationMs());
  }

  function timerElapsedMs(metadata = {}) {
    return _timerElapsedMs(metadata, selectedTimerDurationMs());
  }

  return {
    startTimerTicker,
    hydrateTimerAlarm,
    renderTimer,
    updateTimerDuration,
    updateCustomTimerPreview,
    startProblemTimer,
    pauseProblemTimer,
    resetProblemTimer,
    finishProblemTimer,
    handleTimerDone,
    handleBackgroundTimerDone,
    timerDurationMs,
    timerRemainingMs,
    timerElapsedMs
  };
}
