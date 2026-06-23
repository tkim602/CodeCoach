import { getValidIdToken, getActiveUid, getStorageKey } from "./auth.js";
import { firestoreGet, firestoreSet, firestoreDelete, firestoreList, firestoreListDocumentPaths } from "./firebase.js";
import { STORAGE_KEYS } from "./constants.js";

const PROJECT_ID = "ai-hint-coach";

function userPath(uid, collection, docId) {
  return docId
    ? `users/${uid}/${collection}/${encodeDocId(docId)}`
    : `users/${uid}/${collection}`;
}

function encodeDocId(id) {
  // Firestore doc IDs cannot contain '/'
  return String(id).replace(/\//g, "_2F_");
}

async function getTokenAndUid() {
  const uid = await getActiveUid();
  if (uid === "anonymous") return { uid, idToken: null };
  const idToken = await getValidIdToken();
  return { uid, idToken };
}

export async function syncDocToFirestore(collection, docId, data) {
  const { uid, idToken } = await getTokenAndUid();
  if (!idToken) return;
  try {
    await firestoreSet(userPath(uid, collection, docId), data, idToken);
  } catch (err) {
    console.warn(`[sync] ${collection}:`, err.message);
  }
}

export async function deleteDocFromFirestore(collection, docId) {
  const { uid, idToken } = await getTokenAndUid();
  if (!idToken) return;
  try {
    await firestoreDelete(userPath(uid, collection, docId), idToken);
  } catch (err) {
    console.warn(`[sync] delete ${collection}/${docId}:`, err.message);
  }
}

export async function deleteCollectionFromFirestore(collection) {
  const { uid, idToken } = await getTokenAndUid();
  if (!idToken) return;
  try {
    const paths = await firestoreListDocumentPaths(userPath(uid, collection), idToken);
    await Promise.all(paths.map((path) => firestoreDelete(path, idToken)));
  } catch (err) {
    console.warn(`[sync] delete collection ${collection}:`, err.message);
  }
}

export async function pullAllFromFirestore() {
  const { uid, idToken } = await getTokenAndUid();
  if (!idToken) throw new Error("로그인이 필요합니다.");

  const [sessions, hintEvents, learningEvents, metaDocs, settingsDoc] = await Promise.all([
    firestoreList(userPath(uid, "sessions"), idToken),
    firestoreList(userPath(uid, "hintEvents"), idToken),
    firestoreList(userPath(uid, "learningEvents"), idToken),
    firestoreList(userPath(uid, "problemMetadata"), idToken),
    firestoreGet(userPath(uid, "settings"), idToken)
  ]);

  const sessionsByUrl = {};
  for (const s of sessions) {
    if (s.problemUrl) sessionsByUrl[s.problemUrl] = s;
  }

  const problemMetadata = {};
  for (const m of metaDocs) {
    if (m._key) problemMetadata[m._key] = m;
  }

  const patch = {
    [getStorageKey(STORAGE_KEYS.sessionsByUrl, uid)]: sessionsByUrl,
    [getStorageKey(STORAGE_KEYS.hintEvents, uid)]: hintEvents,
    [getStorageKey(STORAGE_KEYS.learningEvents, uid)]: learningEvents,
    [getStorageKey(STORAGE_KEYS.problemMetadata, uid)]: problemMetadata
  };
  if (settingsDoc) patch[getStorageKey(STORAGE_KEYS.settings, uid)] = settingsDoc;

  await chrome.storage.local.set(patch);
}

export async function pushSettingsToFirestore(uid, idToken, settings) {
  await firestoreSet(userPath(uid, "settings"), settings, idToken);
}
