import { createBaymaxLoadingElement } from './LoadingBaymax';
let transitioning = false;

/** A quiet covered cut. The next renderer reveals itself only after its shaders are ready. */
export function transitionChapter(go: () => void, waitUntilReady = true) {
  if (transitioning) return;
  transitioning = true;
  const cover = document.createElement('div');
  cover.className = `chapter-cover${waitUntilReady ? ' later-cover' : ''}`;
  cover.setAttribute('aria-hidden', 'true');
  // Paint feedback before mounting the next renderer: synchronous geometry work can delay timers.
  if (waitUntilReady) {
    const note = document.createElement('div');
    note.className = 'later-cover-note';
    note.append(createBaymaxLoadingElement());
    cover.append(note);
  }
  document.body.append(cover);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => cover.classList.add('covered')),
  );
  let released = false,
    fallback = 0;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(fallback);
    window.removeEventListener('lastgate:scene-ready', release);
    window.setTimeout(() => {
      cover.style.transition = matchMedia('(prefers-reduced-motion: reduce)')
        .matches
        ? 'none'
        : 'opacity .55s ease';
      cover.classList.remove('covered');
      window.setTimeout(() => {
        cover.remove();
        transitioning = false;
      }, 750);
    }, 120);
  };
  window.setTimeout(
    () => {
      window.addEventListener('lastgate:scene-ready', release, { once: true });
      if (!waitUntilReady) fallback = window.setTimeout(release, 6500);
      go();
    },
    matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : 300,
  );
}
