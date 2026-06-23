import {
  signInWithGoogleToken,
  refreshFirebaseSession,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  sendPasswordReset as firebaseSendPasswordReset,
  sendEmailVerification,
  updateFirebaseProfile
} from "./firebase.js";

const AUTH_KEY = "auth_state";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export async function getAuthState() {
  const result = await chrome.storage.local.get(AUTH_KEY);
  return result[AUTH_KEY] || null;
}

export async function getActiveUid() {
  const state = await getAuthState();
  return state?.uid || "anonymous";
}

export function getStorageKey(baseKey, uid) {
  return uid === "anonymous" ? baseKey : `uid_${uid}_${baseKey}`;
}

export async function getValidIdToken() {
  const state = await getAuthState();
  if (!state?.idToken) return null;
  if (Date.now() < state.expiresAt - TOKEN_REFRESH_BUFFER_MS) return state.idToken;

  try {
    const refreshed = await refreshFirebaseSession(state.refreshToken);
    const next = { ...state, ...refreshed };
    await chrome.storage.local.set({ [AUTH_KEY]: next });
    return next.idToken;
  } catch {
    return null;
  }
}

export async function signInWithEmail(email, password) {
  const authData = await signInWithEmailPassword(email, password);
  if (!authData.emailVerified) {
    await sendEmailVerification(authData.idToken).catch(() => {});
    throw new Error("EMAIL_NOT_VERIFIED");
  }
  await chrome.storage.local.set({ [AUTH_KEY]: authData });
  return authData;
}

export async function signUpWithEmail(email, password, displayName = "") {
  const authData = await signUpWithEmailPassword(email, password);
  if (displayName) {
    try {
      await updateFirebaseProfile(displayName, authData.idToken);
      authData.displayName = displayName;
    } catch { /* profile update is best-effort */ }
  }
  await sendEmailVerification(authData.idToken);
  return authData;
}

export async function sendPasswordReset(email) {
  await firebaseSendPasswordReset(email);
}

// Only call from sidepanel or extension pages — requires interactive UI.
// Pass forceNewAccount=true to clear cached tokens and prompt account selection.
export async function signInWithGoogle({ forceNewAccount = false } = {}) {
  if (forceNewAccount) {
    await clearAllGoogleTokens();
  }
  const accessToken = await getGoogleAuthToken({ interactive: true });
  const authData = await signInWithGoogleToken(accessToken);
  await chrome.storage.local.set({ [AUTH_KEY]: { ...authData, _googleAccessToken: accessToken } });
  return authData;
}

export async function signOut() {
  const state = await getAuthState();

  // Remove individually cached token first
  if (state?._googleAccessToken) {
    await new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token: state._googleAccessToken }, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    });
  }

  // Clear ALL cached Chrome identity tokens so the next Google sign-in shows account picker
  await clearAllGoogleTokens();

  await chrome.storage.local.remove(AUTH_KEY);
}

async function clearAllGoogleTokens() {
  await new Promise((resolve) => {
    if (!chrome.identity?.clearAllCachedAuthTokens) {
      resolve();
      return;
    }
    chrome.identity.clearAllCachedAuthTokens(() => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function getGoogleAuthToken(options) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(options, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}
