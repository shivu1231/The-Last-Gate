import { lazy, Suspense, useEffect } from 'react';
import '../ui/production.css';

// Production behaviour that belongs to no single chapter:
//  - cursor hides during free look when the hand is still
//  - F toggles fullscreen (denied permission is ignored, never blocks the experience)
//  - recovery diagnostics are loaded only in development builds.

const DEVELOPMENT_TOOLS_ENABLED = import.meta.env.DEV;
const DevTools = DEVELOPMENT_TOOLS_ENABLED
  ? lazy(() => import('../debug/DevTools'))
  : null;

const CURSOR_IDLE_MS = 2200;

/**
 * Mount shared cursor and fullscreen behavior plus development-only diagnostics.
 * Fullscreen failures are ignored so denied browser permission does not interrupt the story.
 */
export function ProductionLayer() {
  useEffect(() => {
    const documentRoot = document.documentElement;
    let cursorIdleTimerId = 0;
    const showCursorAndScheduleHide = () => {
      documentRoot.classList.remove('cursor-idle');
      clearTimeout(cursorIdleTimerId);
      cursorIdleTimerId = window.setTimeout(() => {
        // Don't hide the cursor while it's resting on an interactive control.
        if (!document.querySelector('button:hover, a:hover'))
          documentRoot.classList.add('cursor-idle');
      }, CURSOR_IDLE_MS);
    };
    // Keep the fullscreen shortcut out of editable fields and modified key chords.
    const handleFullscreenShortcut = (event: KeyboardEvent) => {
      if (
        event.code !== 'KeyF' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.repeat
      )
        return;
      if (
        (event.target as HTMLElement | null)?.closest(
          'input, textarea, [contenteditable]',
        )
      )
        return;
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => undefined);
      else
        void document.documentElement
          .requestFullscreen?.({ navigationUI: 'hide' })
          .catch(() => undefined);
    };

    window.addEventListener('pointermove', showCursorAndScheduleHide, {
      passive: true,
    });
    window.addEventListener('pointerdown', showCursorAndScheduleHide, {
      passive: true,
    });
    window.addEventListener('keydown', handleFullscreenShortcut);
    showCursorAndScheduleHide();

    return () => {
      clearTimeout(cursorIdleTimerId);
      documentRoot.classList.remove('cursor-idle');
      window.removeEventListener('pointermove', showCursorAndScheduleHide);
      window.removeEventListener('pointerdown', showCursorAndScheduleHide);
      window.removeEventListener('keydown', handleFullscreenShortcut);
    };
  }, []);

  return DevTools ? (
    <Suspense fallback={null}>
      <DevTools />
    </Suspense>
  ) : null;
}
