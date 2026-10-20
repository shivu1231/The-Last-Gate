import gsap from 'gsap';
import { reducedMotion } from '../config/experience';
import { useSceneState } from '../state/SceneStateManager';

// An asymmetric aperture in one continuous mask, never sliding rectangular lids.
export class TransitionDirector {
  private timeline: gsap.core.Timeline | null = null;
  constructor() {
    gsap.ticker.lagSmoothing(0);
  }
  private draw(path: HTMLElement, open: number) {
    path.style.setProperty('--eye-open', open.toFixed(5));
  }
  awaken(path: HTMLElement) {
    this.timeline?.kill();
    const eye = { open: 0 };
    this.draw(path, 0);
    if (reducedMotion) {
      this.draw(path, 1);
      useSceneState.getState().finishAwakening();
      return;
    }
    const update = () => this.draw(path, eye.open);
    this.timeline = gsap
      .timeline()
      .to(
        eye,
        { open: 0.055, duration: 0.9, ease: 'power2.inOut', onUpdate: update },
        1,
      )
      .to(
        eye,
        { open: 0, duration: 0.35, ease: 'power2.in', onUpdate: update },
        2.05,
      )
      .to(
        eye,
        { open: 0.24, duration: 1.1, ease: 'power2.inOut', onUpdate: update },
        3,
      )
      .to(
        eye,
        { open: 0, duration: 0.42, ease: 'power1.in', onUpdate: update },
        4.45,
      )
      .to(
        eye,
        { open: 1, duration: 3.9, ease: 'power2.inOut', onUpdate: update },
        5.6,
      )
      .call(() => useSceneState.getState().say('Okay… I’m back in.'), [], 8.1)
      .call(() => useSceneState.getState().finishAwakening(), [], 10.7);
  }
  skip(path: HTMLElement) {
    this.timeline?.kill();
    this.draw(path, 1);
    useSceneState.getState().finishAwakening();
  }
  /** Hold the eyes fully open (no blink): used while the automatic escape cinematic plays. */
  open(path: HTMLElement) {
    this.timeline?.kill();
    this.draw(path, 1);
  }
  dispose() {
    this.timeline?.kill();
  }
}
