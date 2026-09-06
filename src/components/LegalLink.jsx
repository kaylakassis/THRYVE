// Link to /terms or /privacy. On the web it opens in a new tab so the
// user does not lose a half-filled sign-up form. Inside the native app
// there are no tabs: a _blank on the app's own scheme either dead-ends or
// hands Safari a capacitor:// URL it cannot open. So on native it is a
// plain in-app navigation, and LegalPage's own Back link returns them.
import React from 'react';
import { Link } from 'react-router-dom';
import { isNative } from '../lib/platform.js';

export default function LegalLink({ to, children, ...rest }) {
  const ext = isNative() ? {} : { target: '_blank', rel: 'noopener' };
  return <Link to={to} {...ext} {...rest}>{children}</Link>;
}
