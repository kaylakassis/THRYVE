// Native-side auth token storage.
//
// On the web the session lives in an HttpOnly cookie (set by /api/auth/login
// etc.) and the browser sends it automatically. On native (Capacitor),
// the WebView origin is `https://localhost` while the API lives at our
// production domain - cross-origin XHR drops the SameSite=Lax cookie,
// so we instead store the raw JWT in iOS Keychain via @capacitor/preferences
// and attach it as `Authorization: Bearer <token>` on every request.
//
// The token is returned by login/signup endpoints when the X-Client-Platform
// header is set (so web responses keep the cookie-only shape).
//
// All exports are async because @capacitor/preferences is dynamically
// imported - keeps the web bundle from pulling the Capacitor SDK.
import { isNative } from './platform.js';

const KEY = 'ivy_session_token';

let memoryToken = null;
let primed = false;
let primePromise = null;

// Returns the MODULE, not the Preferences proxy. Returning the proxy from
// an async function makes the promise machinery look for `.then` on it,
// and Capacitor's proxy turns that lookup into a plugin call that never
// resolves - so `await prefs()` would hang forever and the first API
// request (which waits on primeNativeAuth) would never be sent.
async function prefs() {
  if (!isNative()) return null;
  return import('@capacitor/preferences');
}

// Load the token once on app boot so subsequent reads are sync from
// memory. Safe to call repeatedly - returns the same in-flight promise.
export function primeNativeAuth() {
  if (primed) return Promise.resolve(memoryToken);
  if (primePromise) return primePromise;
  primePromise = (async () => {
    try {
      const m = await prefs();
      if (!m) { primed = true; return null; }
      const { value } = await m.Preferences.get({ key: KEY });
      memoryToken = value || null;
    } catch {
      memoryToken = null;
    } finally {
      primed = true;
    }
    return memoryToken;
  })();
  return primePromise;
}

export function getNativeAuthToken() {
  return memoryToken;
}

export async function setNativeAuthToken(token) {
  memoryToken = token || null;
  const m = await prefs();
  if (!m) return;
  if (token) await m.Preferences.set({ key: KEY, value: token });
  else      await m.Preferences.remove({ key: KEY });
}

export async function clearNativeAuthToken() {
  return setNativeAuthToken(null);
}
