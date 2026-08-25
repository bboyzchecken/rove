'use client';

import { useEffect } from 'react';

/**
 * Registers the offline shell (W10.6).
 *
 * Production only. In development the worker would serve a stale bundle back
 * to whoever is editing it, which is a whole afternoon nobody gets back.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // After load: registering during hydration competes with the page for the
    // same connection on exactly the networks this is meant to help.
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // No offline mode is a worse app, not a broken one.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
