import { useSyncExternalStore } from 'react';
import { sfx } from './sfx';

/**
 * The SOUND pill for chapters after the opening: mutes every sfx sound and remembers the choice.
 * Fixed to the bottom-right corner unless a chapter passes its own position.
 */
export function SoundToggle({ style }: { style?: React.CSSProperties }) {
  const muted = useSyncExternalStore(sfx.subscribe, sfx.getMuted);
  return <button type="button" data-sfx="ui.toggle" className="lg-sound" onClick={() => sfx.toggleMute()} aria-pressed={!muted}
    aria-label={muted ? 'Unmute sound' : 'Mute sound'}
    style={{
      position: 'fixed', right: 22, bottom: 20, zIndex: 60, display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 12px', border: '1px solid rgba(190,220,232,.22)', borderRadius: 999, background: 'rgba(6,14,20,.55)',
      color: muted ? 'rgba(190,210,220,.55)' : '#cfe7ef', font: '500 10px/1 "IBM Plex Mono", ui-monospace, monospace', letterSpacing: '.18em',
      cursor: 'pointer', backdropFilter: 'blur(6px)', ...style,
    }}>
    <span aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 10 }}>
      {[5, 9, 6, 8].map((h, i) => <i key={i} style={{ width: 2, height: muted ? 2 : h, background: 'currentColor', transition: 'height .25s' }} />)}
    </span>
    {muted ? 'SOUND OFF' : 'SOUND ON'}
  </button>;
}
