import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { usePhaseTwoEntry } from './phase2/entry';
import { PhaseTwoHost } from './phase2/PhaseTwoHost';
import { enterRecovery } from './recovery/state';
import './engineering';
import { DistrictHost } from './phase4';
import { PhaseFiveHost } from './phase5';
import { PhaseSixHost } from './phase6';

import { useSceneState } from './state/SceneStateManager';
import { Failure } from './ui/Failure';
import './ui/experience.css';
import './presentation/polish.css';
import './presentation/revisions.css';
import { transitionChapter } from './presentation/chapterTransition';
import { LoadingBaymax } from './presentation/LoadingBaymax';

const Experience = lazy(() =>
  import('./experience/ExperienceDirector').then((module) => ({
    default: module.ExperienceDirector,
  })),
);

// Resolve development entries before mounting the costly opening scene.
if (import.meta.env.DEV && new URLSearchParams(location.search).get('recovery'))
  enterRecovery();

/**
 * Check WebGL 2 support and release the temporary probe context.
 */
function supportsWebGL() {
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Render the existing failure screen when the application subtree throws.
 */
class AppBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <Failure
        message="The experience could not start."
        detail="Reload to try again. If the problem continues, try a recent browser with hardware acceleration enabled."
      />
    ) : (
      this.props.children
    );
  }
}

/**
 * Compose chapter hosts and coordinate the opening-to-recovery handoff.
 */
function ExperienceRoot() {
  const phase = useSceneState((state) => state.phase);
  const phaseTwoEntry = usePhaseTwoEntry();
  const preloaded = useRef(false);

  useEffect(() => {
    if (phase !== 'handoff') return;
    const timer = window.setTimeout(
      () => transitionChapter(enterRecovery, true),
      450,
    );
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Prepare the next world while the player is still in the current chapter.
  useEffect(() => {
    if (phase !== 'awakening' || preloaded.current) return;
    preloaded.current = true;
    const timer = window.setTimeout(() => {
      void import('./recovery/Recovery');
      void import('./recovery/HarbourWorld')
        .then((mesh) => mesh.preloadHarbour())
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const skipPhase = (event: KeyboardEvent) => {
      if (
        !event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.metaKey ||
        event.code !== 'KeyM'
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      )
        return;
      event.preventDefault();

      if (phaseTwoEntry.active) return;

      const current = useSceneState.getState();
      if (current.phase === 'loading') return;
      if (current.phase === 'handoff') {
        enterRecovery();
        return;
      }
      const redWakePhases = [
        'booting',
        'diagnostic',
        'corrupting',
        'threat',
        'ignition',
        'chase',
        'fracture',
        'pulled',
      ];
      if (redWakePhases.includes(current.phase)) {
        useSceneState.setState({
          chapter: 'THE_FRACTURE',
          phase: 'handoff',
          subtitle: '',
        });
        return;
      }
      useSceneState.setState({
        chapter: 'RED_WAKE',
        phase: 'booting',
        subtitle: '',
      });
    };
    window.addEventListener('keydown', skipPhase);
    return () => window.removeEventListener('keydown', skipPhase);
  }, [phaseTwoEntry.active]);

  return (
    <AppBoundary>
      <Suspense fallback={<LoadingBaymax overlay />}>
        <PhaseSixHost>
          <PhaseFiveHost>
            <DistrictHost>
              <PhaseTwoHost>
                <Experience />
              </PhaseTwoHost>
            </DistrictHost>
          </PhaseFiveHost>
        </PhaseSixHost>
      </Suspense>
    </AppBoundary>
  );
}

/**
 * Mount the supported browser experience or its existing compatibility fallback.
 */
function App() {
  if (!supportsWebGL()) {
    return (
      <Failure
        message="WebGL is unavailable or disabled."
        detail="This experience needs WebGL 2. Enable hardware acceleration or try a recent browser."
      />
    );
  }
  return <ExperienceRoot />;
}

createRoot(document.getElementById('root')!).render(<App />);
