import { useEffect, useRef } from 'react';
import './later-refinement.css';
import { LoadingBaymax } from './LoadingBaymax';

/** An opaque first paint; only a fully initialized scene can reveal its Canvas. */
export function SceneCurtain({
  ready,
  error,
}: {
  ready: boolean;
  error?: string;
}) {
  const cover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ready && !error) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        window.dispatchEvent(new Event('lastgate:scene-ready'));
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [ready, error]);
  return (
    <div
      ref={cover}
      className={`later-scene-curtain ${ready ? 'is-ready' : ''}`}
      aria-hidden={ready}
      role={error ? 'alert' : 'status'}
    >
      {error ? (
        <div>
          <small>THE LAST GATE</small>
          <p>{error}</p>
          <button onClick={() => location.reload()}>Reload</button>
        </div>
      ) : (
        !ready && <LoadingBaymax />
      )}
    </div>
  );
}

export const LATER_LOADING = {
  position: 'fixed',
  inset: 0,
  background: '#000',
} as const;
