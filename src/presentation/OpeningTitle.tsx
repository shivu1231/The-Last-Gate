import { useEffect, useRef, useState } from 'react';
import type { Phase } from '../state/SceneStateManager';
import './opening-title.css';

/** Give the player a brief orientation beat after Hiro's eyes fully open. */
export function OpeningTitle({ phase }: { phase: Phase }) {
  const previousPhase = useRef<Phase>(phase);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const finishedAwakening = previousPhase.current === 'awakening' && phase === 'approaching';
    previousPhase.current = phase;
    if (!finishedAwakening) return;

    setVisible(true);
    // Capture input before the existing movement listeners so this remains a quiet opening pause while the controls are introduced.
    const pauseInput = (event: Event) => {
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
    };
    const events = ['wheel', 'keydown', 'pointerdown'] as const;
    events.forEach(name => window.addEventListener(name, pauseInput, { capture: true, passive: false }));
    const timer = window.setTimeout(() => {
      setVisible(false);
      events.forEach(name => window.removeEventListener(name, pauseInput, true));
    }, 6600);

    return () => {
      window.clearTimeout(timer);
      events.forEach(name => window.removeEventListener(name, pauseInput, true));
      setVisible(false);
    };
  }, [phase]);

  if (!visible) return null;
  return (
    <div className="opening-title" role="status" aria-live="polite">
      <div className="opening-title-content">
        <p className="opening-title-eyebrow">A CINEMATIC INTERACTIVE EXPERIENCE</p>
        <h1><span>THE LAST</span><strong>GATE</strong></h1>
        <div className="opening-title-controls">
          <p><kbd>Mouse</kbd><span>Look around</span></p>
          <p><kbd>Scroll</kbd><span>Move forward</span></p>
          <p><kbd>Hold click</kbd><span>Interact</span></p>
        </div>
      </div>
    </div>
  );
}
