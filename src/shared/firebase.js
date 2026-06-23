const FIREBASE_API_KEY = "AIzaSyAzm2E8uhRZSd3BKj3XIeMZFvPVHW8o3pQ";
const FIREBASE_AUTH_DOMAIN = "https://ai-hint-coach.firebaseapp.com";
const FIREBASE_PROJECT_ID = "ai-hint-coach";

const IDENTITY_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`;
const SIGNUP_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
const SIGNIN_EMAIL_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
const RESET_URL = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`;
const UPDATE_URL = `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`;
const TOKEN_REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const LOOKUP_URL = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;

export async function lookupFirebaseUser(idToken) {
  const response = await fetch(LOOKUP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Account lookup failed (${response.status})`);
  }

  const data = await response.json();
  const user = data.users?.[0];

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  return {
    uid: user.localId,
    email: user.email || "",
    displayName: user.displayName || user.email || "",
    photoURL: user.photoUrl || "",
    emailVerified: Boolean(user.emailVerified)
  };
}

export function formatFirebaseAuthError(message) {
  const known = {
    "EMAIL_EXISTS": "이미 사용 중인 이메일입니다.",
    "INVALID_EMAIL": "유효하지 않은 이메일 형식입니다.",
    "WEAK_PASSWORD": "비밀번호는 6자 이상이어야 합니다.",
    "EMAIL_NOT_FOUND": "등록되지 않은 이메일입니다.",
    "INVALID_PASSWORD": "비밀번호가 올바르지 않습니다.",
    "INVALID_LOGIN_CREDENTIALS": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "USER_DISABLED": "비활성화된 계정입니다.",
    "TOO_MANY_ATTEMPTS_TRY_LATER": "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
    "MISSING_EMAIL": "이메일 주소를 입력하세요.",
    "EMAIL_NOT_VERIFIED": "이메일 인증이 필요합니다. 받은 편지함의 인증 메일을 확인한 뒤 다시 로그인하세요.",
    "OPERATION_NOT_ALLOWED": "이메일/비밀번호 가입이 아직 활성화되지 않았습니다. Google로 계속하거나 Firebase Console에서 Email/Password provider를 활성화하세요."
  };
  for (const [key, label] of Object.entries(known)) {
    if (String(message || "").toUpperCase().includes(key)) return label;
  }
  if (String(message || "").includes("OAuth2 request failed")) {
    return "Google 로그인 창을 열 수 없습니다. Chrome 계정 상태를 확인한 뒤 다시 시도하세요.";
  }
  return message || "오류가 발생했습니다.";
}

export async function signInWithGoogleToken(accessToken) {
  const response = await fetch(IDENTITY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postBody: `access_token=${encodeURIComponent(accessToken)}&providerId=google.com`,
      requestUri: FIREBASE_AUTH_DOMAIN,
      returnIdpCredential: true,
      returnSecureToken: true
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Firebase sign-in failed (${response.status})`);
  }
  const data = await response.json();
  return {
    uid: data.localId,
    email: data.email || "",
    displayName: data.displayName || data.email || "",
    photoURL: data.photoUrl || "",
    emailVerified: Boolean(data.emailVerified),
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000
  };
}

export async function signUpWithEmailPassword(email, password) {
  const response = await fetch(SIGNUP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sign up failed (${response.status})`);
  }
  const data = await response.json();
  return {
    uid: data.localId,
    email: data.email || "",
    displayName: data.displayName || data.email || "",
    photoURL: "",
    emailVerified: Boolean(data.emailVerified),
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000
  };
}

export async function signInWithEmailPassword(email, password) {
  const response = await fetch(SIGNIN_EMAIL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sign in failed (${response.status})`);
  }

  const data = await response.json();

  // 핵심: 로그인 응답만 믿지 말고 Auth 서버에서 최신 계정 상태 조회
  const account = await lookupFirebaseUser(data.idToken);

  return {
    uid: account.uid || data.localId,
    email: account.email || data.email || "",
    displayName: account.displayName || data.displayName || data.email || "",
    photoURL: account.photoURL || data.photoUrl || "",
    emailVerified: Boolean(account.emailVerified),
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000
  };
}

export async function sendPasswordReset(email) {
  const response = await fetch(RESET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Password reset failed (${response.status})`);
  }
}

export async function sendEmailVerification(idToken) {
  const response = await fetch(RESET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Email verification failed (${response.status})`);
  }
}

export async function updateFirebaseProfile(displayName, idToken) {
  const response = await fetch(UPDATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, displayName, returnSecureToken: false })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Profile update failed (${response.status})`);
  }
}

async function refreshFirebaseToken(refreshToken) {
  const response = await fetch(TOKEN_REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Token refresh failed (${response.status})`);
  }
  const data = await response.json();
  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000
  };
}

export async function refreshFirebaseSession(refreshToken) {
  const tokenData = await refreshFirebaseToken(refreshToken);
  const account = await lookupFirebaseUser(tokenData.idToken);

  return {
    uid: account.uid,
    email: account.email,
    displayName: account.displayName,
    photoURL: account.photoURL,
    emailVerified: Boolean(account.emailVerified),
    idToken: tokenData.idToken,
    refreshToken: tokenData.refreshToken,
    expiresAt: tokenData.expiresAt
  };
}

export async function firestoreGet(path, idToken) {
  const response = await fetch(`${FIRESTORE_BASE}/${path}`, {
    headers: { "Authorization": `Bearer ${idToken}` }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore GET failed (${response.status}): ${path}`);
  return fromFirestoreDoc(await response.json());
}

export async function firestoreSet(path, data, idToken) {
  const response = await fetch(`${FIRESTORE_BASE}/${path}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) })
  });
  if (!response.ok) throw new Error(`Firestore SET failed (${response.status}): ${path}`);
}

export async function firestoreDelete(path, idToken) {
  const response = await fetch(`${FIRESTORE_BASE}/${path}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${idToken}` }
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Firestore DELETE failed (${response.status}): ${path}`);
  }
}

export async function firestoreList(collectionPath, idToken) {
  const results = [];
  let pageToken = "";
  do {
    const url = `${FIRESTORE_BASE}/${collectionPath}${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const response = await fetch(url, { headers: { "Authorization": `Bearer ${idToken}` } });
    if (response.status === 404) break;
    if (!response.ok) throw new Error(`Firestore LIST failed (${response.status}): ${collectionPath}`);
    const data = await response.json();
    for (const doc of (data.documents || [])) {
      const obj = fromFirestoreDoc(doc);
      if (obj) results.push(obj);
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return results;
}

export async function firestoreListDocumentPaths(collectionPath, idToken) {
  const results = [];
  let pageToken = "";
  do {
    const url = `${FIRESTORE_BASE}/${collectionPath}${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const response = await fetch(url, { headers: { "Authorization": `Bearer ${idToken}` } });
    if (response.status === 404) break;
    if (!response.ok) throw new Error(`Firestore LIST failed (${response.status}): ${collectionPath}`);
    const data = await response.json();
    for (const doc of (data.documents || [])) {
      if (!doc.name) continue;
      const marker = "/documents/";
      const index = doc.name.indexOf(marker);
      results.push(index >= 0 ? doc.name.slice(index + marker.length) : doc.name);
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return results;
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) fields[key] = toFirestoreValue(value);
  }
  return fields;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: toFirestoreFields(value) } };
  return { stringValue: String(value) };
}

function fromFirestoreDoc(doc) {
  if (!doc?.fields) return null;
  return fromFirestoreFields(doc.fields);
}

function fromFirestoreFields(fields = {}) {
  const obj = {};
  for (const [key, value] of Object.entries(fields)) {
    obj[key] = fromFirestoreValue(value);
  }
  return obj;
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in value) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
}
