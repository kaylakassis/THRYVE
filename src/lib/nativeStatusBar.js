// Keep the iOS status bar readable. The WebView draws under the status
// bar (ios.contentInset "never" + viewport-fit=cover), so iOS has to be
// told whether the pixels behind the clock are light or dark. Ivy has a
// light page (Calm) and a dark one (Bold, also what sign-in uses), and
// the two are set in different ways (body class in the app shells, a
// styled wrapper on the auth screens), so instead of trusting a class
// name we look at what is actually painted at the top of the viewport
// and measure its luminance.
//
// @capacitor/status-bar naming trips everyone up:
//   Style.Dark  = LIGHT text, for dark backgrounds
//   Style.Light = DARK text, for light backgrounds
//
// Web: no-op. The plugin is imported lazily so the web bundle never
// carries it; if the native pod is missing we log once and give up.
import { isNative } from './platform.js';

let plugin = null;
let lastDark = null;
let disabled = false; // first plugin failure switches the feature off for the session

async function load() {
  if (!plugin) plugin = await import('@capacitor/status-bar');
  return plugin;
}

// Luminance of the first opaque background behind the top-centre pixel.
function luminanceAtTop() {
  const x = Math.floor(window.innerWidth / 2);
  let el = document.elementFromPoint(x, 1) || document.body;
  while (el) {
    const bg = getComputedStyle(el).backgroundColor;
    const m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (m && (m[4] === undefined || parseFloat(m[4]) > 0.5)) {
      const [r, g, b] = [m[1], m[2], m[3]].map((v) => parseInt(v, 10) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    el = el.parentElement;
  }
  return 1; // nothing opaque found: assume the light page
}

async function sync() {
  if (disabled) return;
  const dark = luminanceAtTop() < 0.5;
  if (dark === lastDark) return;
  lastDark = dark;
  try {
    const { StatusBar, Style } = await load();
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch (e) {
    // Missing pod / unsupported host: log once and stop trying, rather than
    // re-attempting on every DOM change for the rest of the session.
    disabled = true;
    console.warn('[statusBar] disabled:', e?.message || e);
  }
}

export function initNativeStatusBar() {
  if (!isNative() || typeof document === 'undefined') return;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; sync(); });
  };
  // Route changes swap whole subtrees; theme changes flip a body class.
  // Both are cheap to observe because sync() is rAF-throttled and only
  // talks to the plugin when the answer actually changes.
  new MutationObserver(schedule).observe(document.documentElement, {
    attributes: true, attributeFilter: ['class', 'style'], childList: true, subtree: true,
  });
  window.addEventListener('resize', schedule);
  schedule();
}
