import { DEFAULT_SETTINGS, HINT_CATEGORIES, STORAGE_KEYS } from "./constants.js";
import { normalizeTaxonomyMetadata } from "./taxonomy/index.js";
import { getActiveUid, getStorageKey } from "./auth.js";
import { syncDocToFirestore, deleteDocFromFirestore, deleteCollectionFromFirestore } from "./firestore-sync.js";
import { normalizeCoachThreads, upsertThreadMessage } from "./chatThreads.js";

const MAX_HINT_EVENTS_PER_PROBLEM = 12;
const MAX_CODE_SNAPSHOTS_PER_PROBLEM = 30;
const MAX_LEARNING_EVENTS_PER_PROBLEM = 50;
const LEARNING_EVENT_DEDUP_MS = 60 * 60 * 1000; // 1 hour
const API_KEY_STORAGE_MODE = "local";
const STORAGE_QUOTA_WARN_BYTES = 8 * 1024 * 1024; // warn at 8 MB of 10 MB limit

export async function getStorageUsage() {
  if (!chrome.storage?.local?.getBytesInUse) return { bytes: 0, nearLimit: false };
  const bytes = await chrome.storage.local.getBytesInUse(null);
  return { bytes, nearLimit: bytes >= STORAGE_QUOTA_WARN_BYTES };
}

async function isCloudSyncEnabled() {
  const settings = await getPublicSettings();
  return settings.cloudSync !== false;
}

// Resolve the prefixed chrome.storage.local key for the active user
async function k(baseKey) {
  const uid = await getActiveUid();
  return getStorageKey(baseKey, uid);
}

export async function getSettings() {
  const key = await k(STORAGE_KEYS.settings);
  const result = await chrome.storage.local.get(key);
  const storedSettings = await migrateSettings(result[key] || {});
  const credential = await getApiCredential();
  return {
    ...storedSettings,
    apiKey: credential.apiKey || "",
    apiKeyStorageMode: API_KEY_STORAGE_MODE,
    confirmBeforeAi: storedSettings.confirmBeforeAiExplicit ? Boolean(storedSettings.confirmBeforeAi) : DEFAULT_SETTINGS.confirmBeforeAi,
    killSwitch: {
      ...DEFAULT_SETTINGS.killSwitch,
      ...(storedSettings.killSwitch || {})
    }
  };
}

export async function getPublicSettings() {
  return sanitizeSettings(await getSettings());
}

export async function saveSettings(nextSettings) {
  const uid = await getActiveUid();
  const key = getStorageKey(STORAGE_KEYS.settings, uid);
  const current = await getSettings();
  const patch = { ...nextSettings };
  const nextApiKey = Object.prototype.hasOwnProperty.call(patch, "apiKey")
    ? String(patch.apiKey || "").trim()
    : "";
  delete patch.apiKey;
  if (
    Object.prototype.hasOwnProperty.call(patch, "uiLanguage")
    && !Object.prototype.hasOwnProperty.call(patch, "uiLanguageExplicit")
  ) {
    patch.uiLanguageExplicit = true;
  }

  const settings = {
    ...normalizeSettings(current),
    ...patch,
    schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    killSwitch: {
      ...current.killSwitch,
      ...(patch.killSwitch || {})
    }
  };
  await chrome.storage.local.set({ [key]: settings });
  if (nextApiKey) await saveApiCredential(nextApiKey);

  // Firestore write-through (fire and forget, exclude apiKey)
  isCloudSyncEnabled().then((enabled) => {
    if (enabled) syncDocToFirestore("settings", "settings", settings).catch(() => {});
  });

  return getSettings();
}

export async function deleteApiKey() {
  const uid = await getActiveUid();
  const key = getStorageKey(STORAGE_KEYS.settings, uid);
  await deleteApiCredential();
  const result = await chrome.storage.local.get(key);
  await chrome.storage.local.set({
    [key]: normalizeSettings(result[key] || {})
  });
  return getSettings();
}

export async function getAllLearningData() {
  const uid = await getActiveUid();
  const keys = [
    getStorageKey(STORAGE_KEYS.sessionsByUrl, uid),
    getStorageKey(STORAGE_KEYS.hintEvents, uid),
    getStorageKey(STORAGE_KEYS.savedNotes, uid),
    getStorageKey(STORAGE_KEYS.codeSnapshots, uid),
    getStorageKey(STORAGE_KEYS.problemMetadata, uid),
    getStorageKey(STORAGE_KEYS.coachThreads, uid),
    getStorageKey(STORAGE_KEYS.learningEvents, uid)
  ];
  const result = await chrome.storage.local.get(keys);
  return {
    sessionsByUrl: result[keys[0]] || {},
    hintEvents: result[keys[1]] || [],
    savedNotes: result[keys[2]] || [],
    codeSnapshots: result[keys[3]] || [],
    problemMetadata: result[keys[4]] || {},
    coachThreads: normalizeCoachThreads(result[keys[5]] || []),
    learningEvents: result[keys[6]] || []
  };
}

export async function clearLearningData() {
  const uid = await getActiveUid();
  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.sessionsByUrl, uid)]: {},
    [getStorageKey(STORAGE_KEYS.hintEvents, uid)]: [],
    [getStorageKey(STORAGE_KEYS.savedNotes, uid)]: [],
    [getStorageKey(STORAGE_KEYS.codeSnapshots, uid)]: [],
    [getStorageKey(STORAGE_KEYS.problemMetadata, uid)]: {},
    [getStorageKey(STORAGE_KEYS.coachThreads, uid)]: [],
    [getStorageKey(STORAGE_KEYS.learningEvents, uid)]: []
  });
  if (await isCloudSyncEnabled()) {
    await Promise.all([
      deleteCollectionFromFirestore("sessions"),
      deleteCollectionFromFirestore("hintEvents"),
      deleteCollectionFromFirestore("savedNotes"),
      deleteCollectionFromFirestore("codeSnapshots"),
      deleteCollectionFromFirestore("problemMetadata"),
      deleteCollectionFromFirestore("learningEvents")
    ]);
  }
}

export async function clearAllLocalData() {
  const uid = await getActiveUid();
  const shouldClearCloudLearning = await isCloudSyncEnabled();
  const keysToRemove = [
    getStorageKey(STORAGE_KEYS.settings, uid),
    getStorageKey(STORAGE_KEYS.apiCredential, uid),
    getStorageKey(STORAGE_KEYS.sessionsByUrl, uid),
    getStorageKey(STORAGE_KEYS.hintEvents, uid),
    getStorageKey(STORAGE_KEYS.savedNotes, uid),
    getStorageKey(STORAGE_KEYS.codeSnapshots, uid),
    getStorageKey(STORAGE_KEYS.problemMetadata, uid),
    getStorageKey(STORAGE_KEYS.coachThreads, uid),
    getStorageKey(STORAGE_KEYS.learningEvents, uid)
  ];
  if (shouldClearCloudLearning) {
    await Promise.all([
      deleteCollectionFromFirestore("sessions"),
      deleteCollectionFromFirestore("hintEvents"),
      deleteCollectionFromFirestore("savedNotes"),
      deleteCollectionFromFirestore("codeSnapshots"),
      deleteCollectionFromFirestore("problemMetadata"),
      deleteCollectionFromFirestore("learningEvents")
    ]);
  }
  await chrome.storage.local.remove(keysToRemove);
  chrome.storage.session?.remove(STORAGE_KEYS.apiCredential).catch(() => {});
}

export function sanitizeSettings(settings) {
  const apiKey = settings?.apiKey || "";
  const publicSettings = normalizeSettings(settings);
  return {
    ...publicSettings,
    hasApiKey: Boolean(apiKey),
    apiKeyPreview: maskKey(apiKey),
    apiKeyStorageMode: API_KEY_STORAGE_MODE
  };
}

export function normalizeSettings(settings = {}) {
  const { apiKey, hasApiKey, apiKeyPreview, apiKeyStorageMode, ...storedSettings } = settings || {};
  const responseLanguage = storedSettings.responseLanguage || DEFAULT_SETTINGS.responseLanguage;
  const uiLanguageExplicit = Boolean(storedSettings.uiLanguageExplicit);
  const uiLanguage = !uiLanguageExplicit && (responseLanguage === "ko" || responseLanguage === "en")
    ? responseLanguage
    : storedSettings.uiLanguage || DEFAULT_SETTINGS.uiLanguage;
  return {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
    responseLanguage,
    uiLanguage,
    uiLanguageExplicit,
    schemaVersion: DEFAULT_SETTINGS.schemaVersion,
    confirmBeforeAi: storedSettings.confirmBeforeAiExplicit ? Boolean(storedSettings.confirmBeforeAi) : DEFAULT_SETTINGS.confirmBeforeAi,
    killSwitch: {
      ...DEFAULT_SETTINGS.killSwitch,
      ...(storedSettings.killSwitch || {})
    }
  };
}

async function migrateSettings(storedSettings = {}) {
  const uid = await getActiveUid();
  const key = getStorageKey(STORAGE_KEYS.settings, uid);
  const legacyApiKey = String(storedSettings.apiKey || "").trim();
  const settings = normalizeSettings(storedSettings);
  const needsWrite = legacyApiKey
    || storedSettings.schemaVersion !== DEFAULT_SETTINGS.schemaVersion
    || Object.prototype.hasOwnProperty.call(storedSettings, "apiKey");

  if (legacyApiKey) await saveApiCredential(legacyApiKey);
  if (needsWrite) {
    await chrome.storage.local.set({ [key]: settings });
  }
  return settings;
}

async function getApiCredential() {
  const uid = await getActiveUid();
  const localKey = getStorageKey(STORAGE_KEYS.apiCredential, uid);

  // Try local storage (current location, per-account)
  const localResult = await chrome.storage.local.get(localKey);
  if (localResult[localKey]) return localResult[localKey];

  // Migrate from legacy session storage if present
  if (chrome.storage.session) {
    const sessionResult = await chrome.storage.session.get(STORAGE_KEYS.apiCredential).catch(() => ({}));
    const cred = sessionResult[STORAGE_KEYS.apiCredential];
    if (cred?.apiKey) {
      await chrome.storage.local.set({ [localKey]: cred });
      chrome.storage.session.remove(STORAGE_KEYS.apiCredential).catch(() => {});
      return cred;
    }
  }

  return { apiKey: "" };
}

async function saveApiCredential(apiKey) {
  const uid = await getActiveUid();
  const key = getStorageKey(STORAGE_KEYS.apiCredential, uid);
  await chrome.storage.local.set({
    [key]: {
      apiKey,
      storageMode: API_KEY_STORAGE_MODE,
      savedAt: new Date().toISOString()
    }
  });
}

async function deleteApiCredential() {
  const uid = await getActiveUid();
  await chrome.storage.local.remove(getStorageKey(STORAGE_KEYS.apiCredential, uid));
  chrome.storage.session?.remove(STORAGE_KEYS.apiCredential).catch(() => {});
}

function maskKey(key) {
  if (!key) return "";
  if (key.length <= 10) return "saved";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export async function upsertSession(sessionPatch) {
  const { sessionsByUrl } = await getAllLearningData();
  const uid = await getActiveUid();
  const now = new Date().toISOString();
  const url = sessionPatch.problemUrl;
  const previous = sessionsByUrl[url] || {
    id: crypto.randomUUID(),
    platform: sessionPatch.platform || "leetcode",
    problemUrl: url,
    problemSlug: sessionPatch.problemSlug || "",
    title: sessionPatch.title || "",
    status: "in_progress",
    startedAt: now,
    hintCount: 0,
    mainWeaknessTags: [],
    mainProblemTypeTags: [],
    mainCautionPointTags: [],
    mainImplementationHintTags: [],
    reviewPriority: "low"
  };

  const next = {
    ...previous,
    ...sessionPatch,
    platform: sessionPatch.platform || previous.platform || "leetcode",
    lastActivityAt: now
  };

  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.sessionsByUrl, uid)]: {
      ...sessionsByUrl,
      [url]: next
    }
  });

  isCloudSyncEnabled().then((enabled) => {
    if (enabled) syncDocToFirestore("sessions", problemKeyForItem(next), next).catch(() => {});
  });

  return next;
}

export async function addHintEvent({ context, metadata, code = "", selectedLine = "", storeHintText = false, visibleHint = "" }) {
  const rawMetadata = metadata || {};
  const { hintEvents, sessionsByUrl } = await getAllLearningData();
  const uid = await getActiveUid();
  const taxonomy = normalizeTaxonomyMetadata(rawMetadata);
  const categories = cleanCategories(taxonomy.legacyCategories.length ? taxonomy.legacyCategories : taxonomy.implementationHintTags);
  const weaknessTags = cleanArray(rawMetadata.weakness_tags || rawMetadata.weaknessTags);
  const previousSession = sessionsByUrl[context.problemUrl] || {};
  const taxonomyWeaknessTags = mergeTags(taxonomy.cautionPointTags, taxonomy.implementationHintTags);
  const session = await upsertSession({
    problemUrl: context.problemUrl,
    problemSlug: context.problemSlug,
    platform: context.platform || "leetcode",
    title: context.title || "",
    hintCount: (await getSessionHintCount(context.problemUrl)) + 1,
    mainWeaknessTags: mergeTags(await getSessionTags(context.problemUrl), weaknessTags.length ? weaknessTags : taxonomyWeaknessTags),
    mainProblemTypeTags: mergeTags(previousSession.mainProblemTypeTags, taxonomy.problemTypeTags),
    mainCautionPointTags: mergeTags(previousSession.mainCautionPointTags, taxonomy.cautionPointTags),
    mainImplementationHintTags: mergeTags(previousSession.mainImplementationHintTags, taxonomy.implementationHintTags),
    reviewPriority: taxonomy.cautionPointTags.length + taxonomy.implementationHintTags.length >= 3 ? "medium" : "low"
  });

  const event = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    problemUrl: context.problemUrl,
    platform: context.platform || "leetcode",
    createdAt: new Date().toISOString(),
    hintLevel: Number(rawMetadata.hint_level || rawMetadata.hintLevel || context.hintLevel || 1),
    hintStage: rawMetadata.hint_stage || rawMetadata.hintStage || inferHintStage(code),
    problemTypeTags: taxonomy.problemTypeTags,
    cautionPointTags: taxonomy.cautionPointTags,
    implementationHintTags: taxonomy.implementationHintTags,
    categories,
    weaknessTags,
    codeSnapshotHash: code ? await sha256(code) : "",
    selectedLineHash: selectedLine ? await sha256(selectedLine) : "",
    storedHintText: Boolean(storeHintText),
    visibleHint: storeHintText ? visibleHint : ""
  };

  const nextEvents = capProblemItems([...hintEvents, event], context.problemUrl, MAX_HINT_EVENTS_PER_PROBLEM);
  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.hintEvents, uid)]: nextEvents
  });

  isCloudSyncEnabled().then((enabled) => {
    if (enabled) syncDocToFirestore("hintEvents", event.id, event).catch(() => {});
  });

  return { session, event };
}

export async function addLearningEvent(event) {
  if (!event || typeof event !== "object") return null;
  if (Number(event.confidence || 0) < 0.55) return null;

  const uid = await getActiveUid();
  const key = getStorageKey(STORAGE_KEYS.learningEvents, uid);
  const result = await chrome.storage.local.get(key);
  const existing = result[key] || [];

  // Dedup: skip if same problemSlug + topic + signal_type within 1h
  const isDupe = existing.some(
    (e) =>
      e.problemSlug === event.problemSlug &&
      e.topic === event.topic &&
      e.signal_type === event.signal_type &&
      Date.now() - new Date(e.timestamp || e.createdAt || 0).getTime() < LEARNING_EVENT_DEDUP_MS
  );
  if (isDupe) return null;

  const stored = {
    id: crypto.randomUUID(),
    topic: String(event.topic || "unknown"),
    signal_type: event.signal_type || "unclear",
    confidence: Number(event.confidence || 0),
    raw_question: String(event.raw_question || "").slice(0, 120),
    problemSlug: event.problemSlug || "",
    problemUrl: event.problemUrl || "",
    platform: event.platform || "unknown",
    createdAt: new Date().toISOString()
  };

  const nextEvents = capProblemItems([...existing, stored], stored.problemUrl, MAX_LEARNING_EVENTS_PER_PROBLEM);
  await chrome.storage.local.set({ [key]: nextEvents });

  isCloudSyncEnabled().then((enabled) => {
    if (enabled) syncDocToFirestore("learningEvents", stored.id, stored).catch(() => {});
  });

  return stored;
}

export async function addCoachThreadMessage({ context, message }) {
  const { coachThreads } = await getAllLearningData();
  const uid = await getActiveUid();
  const nextThreads = upsertThreadMessage(coachThreads, context, message);
  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.coachThreads, uid)]: nextThreads
  });
  return nextThreads.find((thread) => thread.problemUrl === (context.problemUrl || context.url || "unknown")) || null;
}

export async function addCodeSnapshot({ context, status = "", code = "", language = "", note = "" }) {
  const { codeSnapshots, problemMetadata } = await getAllLearningData();
  const uid = await getActiveUid();
  const now = new Date().toISOString();
  const normalizedStatus = ["failed", "passed"].includes(status) ? status : "";
  if (!normalizedStatus) {
    throw new Error("Code snapshots require a passed or failed status.");
  }
  const problemKey = problemKeyForItem(context);
  const metadata = problemMetadata[problemKey] || {};
  const elapsedMs = Number.isFinite(context.elapsedMs)
    ? Math.max(0, Math.round(context.elapsedMs))
    : currentTimerElapsedMs(metadata);
  const snapshotLanguage = language || context.language || "";
  const sessionStatus = normalizedStatus === "passed" ? "solved" : "unsolved";
  const hintCount = await getSessionHintCount(context.problemUrl);
  const nextReviewAt = nextReviewDateForSnapshot(normalizedStatus, hintCount);
  const reviewSchedule = buildReviewSchedule(normalizedStatus, metadata.reviewSchedule);
  const session = await upsertSession({
    problemUrl: context.problemUrl,
    problemSlug: context.problemSlug || "",
    platform: context.platform || "leetcode",
    title: context.title || "",
    status: sessionStatus,
    reviewPriority: normalizedStatus === "failed" ? "high" : "medium",
    solvedAt: normalizedStatus === "passed" ? now : undefined,
    nextReviewAt
  });

  const codeSnapshotHash = code ? await sha256(code) : "";
  // Storage-level dedup: skip if an identical result was saved within the last 60s.
  // Guards against service-worker restarts resetting in-memory dedup state.
  const SNAP_DEDUP_MS = 60_000;
  const recentDupe = codeSnapshots.some(
    (s) =>
      s.problemUrl === context.problemUrl &&
      s.status === normalizedStatus &&
      s.codeSnapshotHash === codeSnapshotHash &&
      Date.now() - new Date(s.createdAt).getTime() < SNAP_DEDUP_MS
  );
  if (recentDupe) return { session, snapshot: null };

  const snapshot = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    problemUrl: context.problemUrl,
    platform: context.platform || "leetcode",
    problemSlug: context.problemSlug || "",
    title: context.title || "",
    status: normalizedStatus,
    language: snapshotLanguage,
    code,
    codeSnapshotHash,
    note,
    testResults: context.testResults || null,
    elapsedMs,
    createdAt: now
  };

  const nextMeta = {
    ...metadata,
    nextReviewAt,
    reviewSchedule,
    updatedAt: now
  };

  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.codeSnapshots, uid)]: capProblemItems([...codeSnapshots, snapshot], context.problemUrl, MAX_CODE_SNAPSHOTS_PER_PROBLEM),
    [getStorageKey(STORAGE_KEYS.problemMetadata, uid)]: {
      ...problemMetadata,
      [problemKey]: nextMeta
    }
  });

  isCloudSyncEnabled().then((enabled) => {
    if (enabled) syncDocToFirestore("problemMetadata", problemKey, { ...nextMeta, _key: problemKey }).catch(() => {});
  });

  return { session, snapshot };
}

export async function updateReviewScheduleEntry(problemKey, date, action, targetDate = null) {
  if (!problemKey || !date) throw new Error("Problem key and date are required.");
  const { problemMetadata } = await getAllLearningData();
  const uid = await getActiveUid();
  const metadata = problemMetadata[problemKey] || {};
  const schedule = Array.isArray(metadata.reviewSchedule) ? [...metadata.reviewSchedule] : [];
  const now = new Date().toISOString();

  let updatedSchedule;
  if (action === "complete") {
    updatedSchedule = schedule.map((entry) =>
      entry.date === date ? { ...entry, completedAt: now } : entry
    );
  } else if (action === "snooze") {
    let newDate;
    if (targetDate) {
      newDate = targetDate;
    } else {
      const tomorrow = new Date(date + "T00:00:00");
      tomorrow.setDate(tomorrow.getDate() + 1);
      newDate = toLocalDateStr(tomorrow);
    }
    updatedSchedule = schedule.map((entry) =>
      entry.date === date ? { ...entry, date: newDate } : entry
    );
  } else if (action === "uncomplete") {
    updatedSchedule = schedule.map((entry) =>
      entry.date === date ? { ...entry, completedAt: null } : entry
    );
  } else if (action === "delete") {
    updatedSchedule = schedule.filter((entry) => entry.date !== date);
  } else {
    throw new Error(`Unknown review schedule action: ${action}`);
  }

  const earliestPending = updatedSchedule
    .filter((e) => !e.completedAt)
    .map((e) => e.date)
    .sort()[0];

  const nextMeta = {
    ...metadata,
    reviewSchedule: updatedSchedule,
    nextReviewAt: earliestPending ? new Date(earliestPending + "T00:00:00").toISOString() : "",
    updatedAt: now
  };

  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.problemMetadata, uid)]: {
      ...problemMetadata,
      [problemKey]: nextMeta
    }
  });

  isCloudSyncEnabled().then((enabled) => {
    if (enabled) syncDocToFirestore("problemMetadata", problemKey, { ...nextMeta, _key: problemKey }).catch(() => {});
  });
}

export async function saveLearningNote(note, { replace = false } = {}) {
  const { savedNotes } = await getAllLearningData();
  const uid = await getActiveUid();
  const baseNotes = replace
    ? savedNotes.filter((n) => n.problemUrl !== note.problemUrl)
    : savedNotes;
  const now = new Date().toISOString();
  const session = await upsertSession({
    problemUrl: note.problemUrl,
    platform: note.platform || "leetcode",
    problemSlug: note.problemSlug || "",
    title: note.title || "",
    status: note.status || "in_progress",
    reviewPriority: note.reviewPriority || "medium",
    solvedAt: note.status === "solved" ? now : undefined
  });

  const savedNote = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    noteType: note.noteType || "solved_review",
    noteFormat: note.noteFormat || "text",
    problemUrl: note.problemUrl,
    platform: note.platform || "leetcode",
    problemSlug: note.problemSlug || "",
    title: note.title || "",
    status: note.status || "in_progress",
    reviewedAt: note.reviewedAt || "",
    userCode: note.userCode || "",
    personalSummary: note.personalSummary || "",
    improvementPoints: cleanArray(note.improvementPoints),
    learnedPatterns: cleanArray(note.learnedPatterns),
    hintCategoriesUsed: cleanArray(note.hintCategoriesUsed),
    reviewPriority: note.reviewPriority || "medium",
    nextReviewAt: note.nextReviewAt || suggestNextReview(note.reviewPriority || "medium"),
    createdAt: now,
    updatedAt: now
  };

  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.savedNotes, uid)]: [...baseNotes, savedNote]
  });

  return savedNote;
}

export async function updateLearningNote(noteId, patch = {}) {
  const { savedNotes } = await getAllLearningData();
  const uid = await getActiveUid();
  const now = new Date().toISOString();
  let updatedNote = null;
  const targetId = String(noteId || patch.id || "");
  const targetProblemUrl = String(patch.problemUrl || "");

  const normalizedPatch = {
    ...patch,
    updatedAt: now
  };
  delete normalizedPatch.id;

  if (Object.prototype.hasOwnProperty.call(normalizedPatch, "improvementPoints")) {
    normalizedPatch.improvementPoints = cleanArray(normalizedPatch.improvementPoints);
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPatch, "learnedPatterns")) {
    normalizedPatch.learnedPatterns = cleanArray(normalizedPatch.learnedPatterns);
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPatch, "hintCategoriesUsed")) {
    normalizedPatch.hintCategoriesUsed = cleanArray(normalizedPatch.hintCategoriesUsed);
  }

  const nextNotes = savedNotes.map((note) => {
    const matchesId = targetId && note.id === targetId;
    const matchesProblem = !targetId && targetProblemUrl && note.problemUrl === targetProblemUrl;
    if (!matchesId && !matchesProblem) return note;
    updatedNote = {
      ...note,
      ...normalizedPatch,
      id: note.id,
      createdAt: note.createdAt || now
    };
    return updatedNote;
  });

  if (!updatedNote) {
    return null;
  }

  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.savedNotes, uid)]: nextNotes
  });

  return updatedNote;
}

export async function deleteSavedNotesByIds(noteIds = []) {
  if (!noteIds.length) return;
  const { savedNotes } = await getAllLearningData();
  const uid = await getActiveUid();
  const idSet = new Set(noteIds);
  const remaining = savedNotes.filter((n) => !idSet.has(n.id));
  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.savedNotes, uid)]: remaining
  });
  if (await isCloudSyncEnabled()) {
    await Promise.all([...idSet].map((id) => deleteDocFromFirestore("savedNotes", id)));
  }
}

export async function markSessionUnsolved(context, details = {}) {
  const data = await getAllLearningData();
  const relatedEvents = data.hintEvents.filter((event) => event.problemUrl === context.problemUrl);
  const categories = [...new Set(relatedEvents.flatMap((event) => event.implementationHintTags || event.categories || []))];
  const session = await upsertSession({
    problemUrl: context.problemUrl,
    platform: context.platform || "leetcode",
    problemSlug: context.problemSlug || "",
    title: context.title || "",
    status: "unsolved",
    reviewPriority: "high",
    mainWeaknessTags: mergeTags(await getSessionTags(context.problemUrl), categories)
  });

  const note = await saveLearningNote({
    problemUrl: context.problemUrl,
    platform: context.platform || "leetcode",
    problemSlug: context.problemSlug || "",
    title: context.title || "",
    status: "unsolved",
    noteType: "unsolved_review",
    personalSummary: details.personalSummary || `Marked unsolved after ${relatedEvents.length} hint request(s).`,
    improvementPoints: details.improvementPoints || ["Retry after reviewing the repeated hint categories."],
    learnedPatterns: details.learnedPatterns || categories,
    hintCategoriesUsed: categories,
    reviewPriority: "high"
  });

  return { session, note };
}

export async function updateProblemMetadata(problemKey, patch = {}) {
  if (!problemKey) throw new Error("Problem key is required.");
  const { problemMetadata } = await getAllLearningData();
  const uid = await getActiveUid();
  const previous = problemMetadata[problemKey] || {};
  const next = {
    ...previous,
    updatedAt: new Date().toISOString()
  };

  if (Object.prototype.hasOwnProperty.call(patch, "titleOverride")) {
    next.titleOverride = String(patch.titleOverride || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "bookmarked")) {
    next.bookmarked = Boolean(patch.bookmarked);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "nextReviewAt")) {
    next.nextReviewAt = patch.nextReviewAt || "";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "lastReviewedAt")) {
    next.lastReviewedAt = patch.lastReviewedAt || "";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "reviewCount")) {
    next.reviewCount = Math.max(0, Number(patch.reviewCount) || 0);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "timerElapsedMs")) {
    next.timerElapsedMs = Math.max(0, Number(patch.timerElapsedMs) || 0);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "timerDurationMs")) {
    next.timerDurationMs = Math.max(0, Number(patch.timerDurationMs) || 0);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "timerRemainingMs")) {
    next.timerRemainingMs = Math.max(0, Number(patch.timerRemainingMs) || 0);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "timerRunningSince")) {
    next.timerRunningSince = patch.timerRunningSince || "";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "timerFinishedAt")) {
    next.timerFinishedAt = patch.timerFinishedAt || "";
  }

  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.problemMetadata, uid)]: {
      ...problemMetadata,
      [problemKey]: next
    }
  });

  isCloudSyncEnabled().then((enabled) => {
    if (enabled) syncDocToFirestore("problemMetadata", problemKey, { ...next, _key: problemKey }).catch(() => {});
  });

  return next;
}

export async function deleteLearningProblems(problemKeys = []) {
  const keys = new Set((problemKeys || []).map((key) => String(key || "").trim()).filter(Boolean));
  if (!keys.size) return { deletedProblems: 0 };

  const uid = await getActiveUid();
  const data = await getAllLearningData();
  const sessions = Object.values(data.sessionsByUrl || {});
  const nextSessionsByUrl = {};
  for (const session of sessions) {
    if (!keys.has(problemKeyForItem(session))) {
      nextSessionsByUrl[session.problemUrl] = session;
    }
  }

  const nextMetadata = { ...(data.problemMetadata || {}) };
  for (const key of keys) delete nextMetadata[key];

  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.sessionsByUrl, uid)]: nextSessionsByUrl,
    [getStorageKey(STORAGE_KEYS.hintEvents, uid)]: (data.hintEvents || []).filter((item) => !keys.has(problemKeyForItem(item))),
    [getStorageKey(STORAGE_KEYS.savedNotes, uid)]: (data.savedNotes || []).filter((item) => !keys.has(problemKeyForItem(item))),
    [getStorageKey(STORAGE_KEYS.codeSnapshots, uid)]: (data.codeSnapshots || []).filter((item) => !keys.has(problemKeyForItem(item))),
    [getStorageKey(STORAGE_KEYS.learningEvents, uid)]: (data.learningEvents || []).filter((item) => !keys.has(problemKeyForItem(item))),
    [getStorageKey(STORAGE_KEYS.problemMetadata, uid)]: nextMetadata
  });

  for (const key of keys) {
    deleteDocFromFirestore("sessions", key).catch(() => {});
    deleteDocFromFirestore("problemMetadata", key).catch(() => {});
  }
  for (const item of data.hintEvents || []) {
    if (keys.has(problemKeyForItem(item)) && item.id) deleteDocFromFirestore("hintEvents", item.id).catch(() => {});
  }
  for (const item of data.savedNotes || []) {
    if (keys.has(problemKeyForItem(item)) && item.id) deleteDocFromFirestore("savedNotes", item.id).catch(() => {});
  }
  for (const item of data.codeSnapshots || []) {
    if (keys.has(problemKeyForItem(item)) && item.id) deleteDocFromFirestore("codeSnapshots", item.id).catch(() => {});
  }
  for (const item of data.learningEvents || []) {
    if (keys.has(problemKeyForItem(item)) && item.id) deleteDocFromFirestore("learningEvents", item.id).catch(() => {});
  }

  return { deletedProblems: keys.size };
}

async function getSessionHintCount(problemUrl) {
  const { sessionsByUrl } = await getAllLearningData();
  return sessionsByUrl[problemUrl]?.hintCount || 0;
}

async function getSessionTags(problemUrl) {
  const { sessionsByUrl } = await getAllLearningData();
  return sessionsByUrl[problemUrl]?.mainWeaknessTags || [];
}

function mergeTags(previous, next) {
  return [...new Set([...(previous || []), ...(next || [])])].slice(0, 12);
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function cleanCategories(value) {
  const valid = new Set(HINT_CATEGORIES);
  return cleanArray(value).filter((item) => valid.has(item));
}

function capProblemItems(items, problemUrl, maxPerProblem) {
  if (!problemUrl) return items;
  const sameProblem = items
    .filter((item) => item.problemUrl === problemUrl)
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
    .slice(-maxPerProblem);
  const sameIds = new Set(sameProblem.map((item) => item.id));
  return items.filter((item) => item.problemUrl !== problemUrl || sameIds.has(item.id));
}

function currentTimerElapsedMs(metadata = {}) {
  const duration = Math.max(0, Number(metadata.timerDurationMs) || 0);
  if (duration > 0) {
    const storedRemaining = Object.prototype.hasOwnProperty.call(metadata, "timerRemainingMs")
      ? Math.max(0, Math.min(duration, Number(metadata.timerRemainingMs) || 0))
      : duration;
    if (!metadata.timerRunningSince) {
      return Math.max(0, duration - storedRemaining);
    }
    const started = Date.parse(metadata.timerRunningSince);
    if (!Number.isFinite(started)) return Math.max(0, duration - storedRemaining);
    return Math.max(0, Math.min(duration, duration - Math.max(0, storedRemaining - (Date.now() - started))));
  }
  const base = Math.max(0, Number(metadata.timerElapsedMs) || 0);
  if (!metadata.timerRunningSince) return base;
  const started = Date.parse(metadata.timerRunningSince);
  if (!Number.isFinite(started)) return base;
  return Math.max(0, base + Date.now() - started);
}

function nextReviewDateForSnapshot(status, hintCount) {
  const date = new Date();
  if (status === "failed") date.setDate(date.getDate() + 1);
  else if (Number(hintCount) >= 2) date.setDate(date.getDate() + 3);
  else date.setDate(date.getDate() + 7);
  return date.toISOString();
}

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildReviewSchedule(status, existingSchedule, startDate = null) {
  const base = startDate ? new Date(startDate + "T00:00:00") : new Date();
  const offsets = status === "failed" ? [1, 7, 14] : [1, 7];
  const newDates = offsets.map((n) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return toLocalDateStr(d);
  });

  // Preserve completedAt for dates that were already completed in the old schedule
  const prevCompleted = new Map(
    (Array.isArray(existingSchedule) ? existingSchedule : [])
      .filter((e) => e.completedAt)
      .map((e) => [e.date, e.completedAt])
  );

  return newDates.map((date) => ({
    date,
    completedAt: prevCompleted.get(date) || null
  }));
}

function problemKeyForNote(note) {
  const platform = note.platform || "";
  const problemUrl = note.problemUrl || "";
  if (platform === "leetcode") {
    const slug = note.problemSlug || leetcodeSlugFromUrl(problemUrl);
    if (slug) return `leetcode:${slug}`;
  }
  if (platform === "programmers") {
    const lesson = programmersLessonFromUrl(problemUrl) || note.problemSlug;
    if (lesson) return `programmers:${lesson}`;
  }
  return problemUrl || "";
}

export async function scheduleNoteReview(note) {
  const problemKey = problemKeyForNote(note);
  if (!problemKey) return;

  const { problemMetadata } = await getAllLearningData();
  const uid = await getActiveUid();
  const metadata = problemMetadata[problemKey] || {};

  const reviewSchedule = buildReviewSchedule("failed", metadata.reviewSchedule);

  const earliestPending = reviewSchedule
    .filter((e) => !e.completedAt)
    .map((e) => e.date)
    .sort()[0];

  const now = new Date().toISOString();
  const nextMeta = {
    ...metadata,
    reviewSchedule,
    nextReviewAt: earliestPending ? new Date(earliestPending + "T00:00:00").toISOString() : "",
    updatedAt: now
  };

  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.problemMetadata, uid)]: {
      ...problemMetadata,
      [problemKey]: nextMeta
    }
  });

  isCloudSyncEnabled().then((enabled) => {
    if (enabled) syncDocToFirestore("problemMetadata", problemKey, { ...nextMeta, _key: problemKey }).catch(() => {});
  });
}

export async function addManualReviewSchedule(problemKey, titleOverride = "", startDate = null, source = "") {
  if (!problemKey) return;
  const { problemMetadata } = await getAllLearningData();
  const uid = await getActiveUid();
  const metadata = problemMetadata[problemKey] || {};
  const reviewSchedule = buildReviewSchedule("failed", metadata.reviewSchedule, startDate);
  const earliest = reviewSchedule.filter((e) => !e.completedAt).map((e) => e.date).sort()[0];
  const now = new Date().toISOString();
  const next = {
    ...metadata,
    reviewSchedule,
    nextReviewAt: earliest ? new Date(earliest + "T00:00:00").toISOString() : "",
    updatedAt: now
  };
  if (titleOverride) next.titleOverride = String(titleOverride).trim();
  const normalizedSource = ["leetcode", "programmers", "direct"].includes(source) ? source : "";
  if (normalizedSource) next.source = normalizedSource;
  await chrome.storage.local.set({
    [getStorageKey(STORAGE_KEYS.problemMetadata, uid)]: { ...problemMetadata, [problemKey]: next }
  });
  isCloudSyncEnabled().then((enabled) => {
    if (enabled) syncDocToFirestore("problemMetadata", problemKey, { ...next, _key: problemKey }).catch(() => {});
  });
}

function problemKeyForItem(item) {
  const platform = item.platform || "";
  const problemUrl = item.problemUrl || "";
  if (platform === "leetcode") {
    const slug = item.problemSlug || leetcodeSlugFromUrl(problemUrl);
    if (slug) return `leetcode:${slug}`;
  }
  if (platform === "programmers") {
    const lesson = programmersLessonFromUrl(problemUrl) || item.problemSlug;
    if (lesson) return `programmers:${lesson}`;
  }
  return problemUrl || item.sessionId || item.id || "";
}

function leetcodeSlugFromUrl(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.toLowerCase().split("/").filter(Boolean);
    return parts[0] === "problems" ? parts[1] || "" : "";
  } catch {
    const match = String(value || "").match(/\/problems\/([^/]+)/i);
    return match?.[1]?.toLowerCase() || "";
  }
}

function programmersLessonFromUrl(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/learn\/courses\/(\d+)\/lessons\/(\d+)/);
    return match ? `${match[1]}-${match[2]}` : "";
  } catch {
    const match = String(value || "").match(/\/learn\/courses\/(\d+)\/lessons\/(\d+)/);
    return match ? `${match[1]}-${match[2]}` : "";
  }
}

function inferHintStage(code) {
  const length = code.trim().length;
  if (length < 40) return "initial_approach";
  if (length < 500) return "partial_code";
  return "debugging";
}

function suggestNextReview(priority) {
  const date = new Date();
  const days = priority === "high" ? 1 : priority === "medium" ? 3 : 7;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
