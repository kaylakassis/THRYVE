// Preflight for the native iOS build.
//
// The iOS bundle is built on the MAC by `npm run build`, then copied into
// the .ipa by `npx cap sync ios`. That means the two VITE_* values below
// are baked in from the MAC's environment at that moment - Vercel's
// environment variables have nothing to do with it. Setting them only in
// Vercel produces a signed build whose failures only surface after a
// TestFlight round-trip, which is an expensive way to find out.
//
// The two values are NOT equally important, so they fail differently:
//
//   VITE_API_BASE_URL           FATAL. Without it every API call resolves
//                               to https://localhost/api/... and the app
//                               is completely non-functional. Nothing
//                               about the build is salvageable.
//
//   VITE_REVENUECAT_PUBLIC_KEY_IOS
//                               WARNS. The app works fine and is worth
//                               installing through TestFlight; only the
//                               paywall comes up with nothing to buy. That
//                               is a legitimate state while you are still
//                               setting RevenueCat up, but such a build
//                               must not be submitted for sale (App Store
//                               guideline 3.1.1).
//
// Escape hatch for the fatal one: IVY_SKIP_IOS_ENV_CHECK=1, for building
// a throwaway simulator bundle you have no intention of signing.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vite reads .env / .env.local itself, so we have to look in the same
// places to know what the build will actually see.
function fromEnvFiles(key) {
  for (const f of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/i); // keep raw rhs so a stray space is visible
      if (m && m[1] === key) {
        const raw = m[2];
        // A space after '=' is the classic .env typo. dotenv trims it, but
        // say so out loud - and refuse if the trimmed value is still bad.
        if (/^\s|\s$/.test(raw)) console.warn(`! ${key} has leading/trailing whitespace in ${f}; using the trimmed value.`);
        return raw.replace(/^["']|["']$/g, '').trim();
      }
    }
  }
  return '';
}

const read = (key) => (process.env[key] || fromEnvFiles(key) || '').trim();

const RED = '\x1b[31m';
const YEL = '\x1b[33m';
const OFF = '\x1b[0m';

// ── Fatal: the API base ────────────────────────────────────────────────
const base = read('VITE_API_BASE_URL');
let fatal = null;
if (!base) {
  fatal = 'VITE_API_BASE_URL is not set.\n'
    + '     Without it the app calls https://localhost/api/... and every\n'
    + '     request fails. The build would install and then do nothing.';
} else if (!/^https:\/\/[^/\s]+$/.test(base.replace(/\/+$/, ''))) {
  fatal = `VITE_API_BASE_URL is "${base}", which is not a bare https origin.\n`
    + '     Expected something like https://joinivy.ai (no path, no trailing slash).';
}

// A base URL that REDIRECTS is as broken as a missing one: the browser will
// not follow a redirect on a CORS preflight, so every request from the
// device fails with WebKit's "Load failed". This is exactly what an apex
// domain that forwards to www (or vice versa) does. Probe it when we are
// online; stay quiet when we are not.
if (!fatal && base) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(base.replace(/\/+$/, '') + '/api/auth/me', { method: 'OPTIONS', redirect: 'manual', signal: ctrl.signal,
      headers: { Origin: 'capacitor://localhost', 'Access-Control-Request-Method': 'GET' } });
    clearTimeout(t);
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location') || '';
      let canonical = '';
      try { canonical = new URL(loc).origin; } catch { /* leave blank */ }
      fatal = `VITE_API_BASE_URL (${base}) redirects (HTTP ${r.status}) to ${loc || 'another host'}.\n`
        + '     Browsers refuse redirects on CORS preflights, so the app would fail\n'
        + '     every request with "Load failed".'
        + (canonical ? `\n     Use the destination instead:  VITE_API_BASE_URL=${canonical}` : '');
    }
  } catch { /* offline or blocked: cannot probe, do not block the build */ }
}

if (fatal && process.env.IVY_SKIP_IOS_ENV_CHECK !== '1') {
  console.error(`\n${RED}✖ iOS build stopped${OFF}\n`);
  console.error('   • ' + fatal + '\n');
  console.error(
    '   Fix: open the .env file in this folder and set:\n\n'
    + '     VITE_API_BASE_URL=https://www.joinivy.ai\n\n'
    + '   This is a build-time value baked into the app. It is NOT read\n'
    + '   from Vercel, which only builds the website.\n',
  );
  process.exit(1);
}
if (fatal) {
  console.warn(`\n${YEL}! IVY_SKIP_IOS_ENV_CHECK is set and ${'VITE_API_BASE_URL'} is bad. This build cannot work. Do not ship it.${OFF}\n`);
}

// ── Non-fatal: the store key ───────────────────────────────────────────
if (!read('VITE_REVENUECAT_PUBLIC_KEY_IOS')) {
  console.warn(
    `\n${YEL}! Building WITHOUT a RevenueCat key.${OFF}\n\n`
    + '   VITE_REVENUECAT_PUBLIC_KEY_IOS is not set, so the subscription\n'
    + '   screen will load with nothing to purchase.\n\n'
    + '   This is fine for a build you install through TestFlight to try\n'
    + '   the app out. It CANNOT be submitted for review: Apple rejects a\n'
    + '   non-working paywall under guideline 3.1.1.\n\n'
    + '   When you are ready, put the key from RevenueCat (Project settings\n'
    + '   > API keys, the public one starting with appl_) into .env and\n'
    + '   run this again.\n',
  );
} else if (!fatal) {
  console.log(`✓ iOS build preflight passed (API base: ${base})`);
}
