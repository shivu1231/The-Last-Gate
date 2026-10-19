import { lazy, Suspense, useEffect } from 'react';
import '../ui/production.css';

// Production behaviour that belongs to no single chapter:
//  - cursor hides during free look when the hand is still
//  - F toggles fullscreen (denied permission is ignored, never blocks the experience)
//  - presentation recovery + dev diagnostics, compiled in ONLY for dev builds or
//    builds made with VITE_PRESENTATION=1. A normal production build contains none of it.

const RECOVERY_ENABLED = import.meta.env.DEV;
const DevTools = RECOVERY_ENABLED ? lazy(() => import('../debug/DevTools')) : null;

const CURSOR_IDLE_MS = 2200;

export function ProductionLayer() {
  useEffect(() => {
    const root = document.documentElement;
    let idle = 0;
    const wake = () => {
      root.classList.remove('cursor-idle');
      clearTimeout(idle);
      idle = window.setTimeout(() => {
        // Don't hide the cursor while it's resting on an interactive control.
        if (!document.querySelector('button:hover, a:hover')) root.classList.add('cursor-idle');
      }, CURSOR_IDLE_MS);
    };
    const key = (event: KeyboardEvent) => {
      if (event.code !== 'KeyF' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return;
      if ((event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')) return;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined);
    };
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', key);
    wake();
    return () => {
      clearTimeout(idle); root.classList.remove('cursor-idle');
      window.removeEventListener('pointermove', wake); window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', key);
    };
  }, []);

  return DevTools ? <Suspense fallback={null}><DevTools/></Suspense> : null;
}
