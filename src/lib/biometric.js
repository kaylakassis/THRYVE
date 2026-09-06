// Face ID / Touch ID for the native app. Thin wrapper over
// @aparajita/capacitor-biometric-auth so the rest of the app never
// imports the plugin directly (it is loaded lazily and only on native).
//
// Model: an APP LOCK, not a login method. The session token already
// persists on the device (src/lib/nativeAuth.js); when the lock is on we
// simply refuse to show the app until the OS confirms it is the owner.
// Nothing about credentials or the server changes.
import { isNative } from './platform.js';

export const LOCK_PREF = 'ivy_face_lock';

let mod = null;
async function load() {
  if (!mod) mod = await import('@aparajita/capacitor-biometric-auth');
  return mod;
}

// { available, label, reason } - label is what the OS calls it.
export async function biometryInfo() {
  if (!isNative()) return { available: false, label: 'Face ID', reason: 'web' };
  try {
    const { BiometricAuth, BiometryType } = await load();
    const r = await BiometricAuth.checkBiometry();
    const label = r.biometryType === BiometryType.faceId ? 'Face ID'
      : r.biometryType === BiometryType.touchId ? 'Touch ID'
      : 'biometrics';
    return { available: !!r.isAvailable, label, reason: r.reason || '' };
  } catch (e) {
    return { available: false, label: 'Face ID', reason: e?.message || 'unavailable' };
  }
}

// Resolves on success, throws on cancel/failure. Device passcode is
// allowed as the fallback (Apple's standard pattern) so a wet-fingers or
// mask moment never strands the owner outside their own business.
export async function biometricUnlock(reason = 'Unlock Ivy') {
  const { BiometricAuth } = await load();
  await BiometricAuth.authenticate({
    reason,
    allowDeviceCredential: true,
    iosFallbackTitle: 'Use passcode',
    cancelTitle: 'Cancel',
  });
  return true;
}

export function isLockEnabled() {
  try { return localStorage.getItem(LOCK_PREF) === '1'; } catch { return false; }
}
export function setLockEnabled(on) {
  try { on ? localStorage.setItem(LOCK_PREF, '1') : localStorage.removeItem(LOCK_PREF); } catch { /* private mode */ }
}
