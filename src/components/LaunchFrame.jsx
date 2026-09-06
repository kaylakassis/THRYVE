// The frame the native app shows while it is still deciding what to render
// (session check, role check). Same deep green and mark as the iOS launch
// storyboard and the welcome screen, so the splash appears to simply
// continue instead of cutting to a white page that says "Loading…".
import React from 'react';

export default function LaunchFrame() {
  return (
    <div role="status" aria-label="Loading" style={{
      position: 'fixed', inset: 0, zIndex: 1, background: '#042b25',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 132, height: 132, borderRadius: 30, overflow: 'hidden', background: '#042b25',
        boxShadow: '0 24px 60px -20px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.08)',
      }}>
        <img src="/icon-512.png" alt="" draggable="false" style={{ width: '100%', height: '100%', display: 'block' }}/>
      </div>
    </div>
  );
}
