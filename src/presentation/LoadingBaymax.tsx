import './loading-baymax.css';

export const BAYMAX_ASCII = [
  '       .------.       ',
  '      /  o--o  \\      ',
  '      \\________/      ',
  "    .'          '.    ",
  '   /     ( )      \\   ',
  '  /                \\  ',
  '  \\                /  ',
  '   \\____      ____/   ',
  '        |____|        ',
].join('\n');

/** The same quiet first paint before React chunks, models and shaders are ready. */
export function LoadingBaymax({
  overlay = false,
  ready = false,
}: {
  overlay?: boolean;
  ready?: boolean;
}) {
  return (
    <div
      className={`baymax-loading${overlay ? ' baymax-loading-overlay' : ''}${ready ? ' is-ready' : ''}`}
      role={ready ? undefined : 'status'}
      aria-hidden={ready}
      aria-label="Loading The Last Gate"
    >
      <pre aria-hidden="true">{BAYMAX_ASCII}</pre>
      <span aria-hidden="true">LOADING THE LAST GATE</span>
    </div>
  );
}

/** For the chapter cover, which deliberately lives outside the React scene tree. */
export function createBaymaxLoadingElement() {
  const root = document.createElement('div');
  root.className = 'baymax-loading';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', 'Loading The Last Gate');
  const portrait = document.createElement('pre');
  portrait.textContent = BAYMAX_ASCII;
  portrait.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = 'LOADING THE LAST GATE';
  root.append(portrait, label);
  return root;
}
