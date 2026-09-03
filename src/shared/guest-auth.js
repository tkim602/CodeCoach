const FIREBASE_API_KEY = "AIzaSyAzm2E8uhRZSd3BKj3XIeMZFvPVHW8o3pQ";
const GUEST_AUTH_KEY = "guest_auth_state";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const SIGNUP_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
const TOKEN_REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;

export async function getGuestSession() {
  const result = await chrome.storage.local.get(GUEST_AUTH_KEY);
  return result[GUEST_AUTH_KEY] || null;
}

export async function ensureGuestSession() {
  const current = await getGuestSession();
  if (current?.idToken && Date.now() < Number(current.expiresAt || 0) - TOKEN_REFRESH_BUFFER_MS) {
    return current;
  }

  if (current?.refreshToken) {
    try {
      const refreshed = await refreshGuestSession(current.refreshToken);
      await chrome.storage.local.set({ [GUEST_AUTH_KEY]: refreshed });
      return refreshed;
    } catch {
      // Fall through and create a fresh anonymous session.
    }
  }

  const created = await createGuestSession();
  await chrome.storage.local.set({ [GUEST_AUTH_KEY]: created });
  return created;
}

export async function clearGuestSession() {
  await chrome.storage.local.remove(GUEST_AUTH_KEY);
}

async function createGuestSession() {
  const response = await fetch(SIGNUP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body?.error?.message || `Guest sign-in failed (${response.status})`;
    if (/OPERATION_NOT_ALLOWED/i.test(message)) {
      throw new Error("Guest mode is not enabled on the CodeCoach backend yet.");
    }
    throw new Error(message);
  }
  return normalizeSession(await response.json());
}

async function refreshGuestSession(refreshToken) {
  const response = await fetch(TOKEN_REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });
  if (!response.ok) throw new Error(`Guest token refresh failed (${response.status})`);
  const data = await response.json();
  return {
    uid: data.user_id || "",
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000
  };
}

function normalizeSession(data) {
  return {
    uid: data.localId || "",
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000
  };
}
