import * as THREE from 'three';
import { createFirstPersonHands } from './RegulatorController';

/**
 * The switch close-up: Hiro's own limiter controller in his hands, seen from his eyes. The left
 * hand lifts it into view, the thumb flips the red guard and works the toggle (see controller.ts).
 * Built at a fixed spot well below the ground of every set, with a soft-focus backdrop, so any set
 * can cut to it. The camera sits at Hiro's eye and looks down at the controller.
 *
 * (p6-scenes' first-person beats use createFirstPersonHands directly; this keeps the cut-away
 * version working for any shot that still wants it.)
 */
export const INSERT = new THREE.Vector3(0, -60, 0);
export const INSERT_CAMERA = {
  pos: new THREE.Vector3(0, 0, 0),
  look: new THREE.Vector3(-0.078, -0.11, -0.36),
};

/**
 * Named authored interaction presentation for the first-person insert.
 */
export type HandMode = 'on' | 'off' | 'onFast';

const BOKEH_FS = `varying vec2 vUv;uniform float uTime;
float disc(vec2 p,vec2 c,float r){return smoothstep(r,r*.55,length(p-c));}
void main(){vec2 p=vUv;vec3 col=mix(vec3(.025,.05,.075),vec3(.05,.1,.14),p.y);
col+=vec3(.18,.42,.55)*disc(p,vec2(.2,.72),.09)*.5+vec3(.95,.55,.22)*disc(p,vec2(.78,.8),.07)*.35;
col+=vec3(.25,.55,.7)*disc(p,vec2(.62,.58),.05)*.3+vec3(.7,.75,.8)*disc(p,vec2(.38,.9),.06)*.18;
col+=vec3(.9,.4,.2)*disc(p,vec2(.9,.35),.1)*.12;gl_FragColor=vec4(col,1.);}`;

/**
 * Build the close interaction presentation used when operating the regulator remote.
 */
export function createHandInsert() {
  const root = new THREE.Group();
  root.name = 'regulator-insert';
  root.position.copy(INSERT);
  const hands = createFirstPersonHands();
  root.add(hands.root);
  // Backdrop: the scene beyond, out of focus, behind the controller along the eye line.
  const geometry = new THREE.PlaneGeometry(2.4, 1.5);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: BOKEH_FS,
    depthWrite: false,
    fog: false,
  });
  const backdrop = new THREE.Mesh(geometry, material);
  backdrop.renderOrder = -1;
  backdrop.position.copy(INSERT_CAMERA.look).normalize().multiplyScalar(1.6);
  backdrop.lookAt(0, 0, 0);
  root.add(backdrop);
  root.traverse((sceneObject) => {
    sceneObject.frustumCulled = false;
  });

  let timeline: gsap.core.Timeline | null = null,
    last = -1;
  const idle = { walk: 0, gait: 0, raise: 1, reach: 0 };
  return {
    root,
    hands,
    controller: hands.controller,
    /** Instantly set the switch without the hand (entering a beat directly). */
    set(on: boolean) {
      timeline?.kill();
      timeline = null;
      hands.controller.setOn(on);
    },
    /** Lifts the controller and works the switch. onClick fires as the bat lands; onDone once settled. */
    play(
      mode: HandMode,
      onClick: () => void,
      onDone: () => void,
      rate = 1,
      seek?: number,
    ) {
      timeline?.kill();
      hands.controller.setOn(mode === 'off');
      timeline = hands.press(onClick, onDone, rate);
      timeline.delay(mode === 'onFast' ? 0.15 : 0.35);
      if (seek !== undefined) timeline.pause(seek);
    },
    update(timeSeconds: number) {
      const deltaSeconds =
        last < 0 ? 1 / 60 : Math.min(0.05, Math.max(0, timeSeconds - last));
      last = timeSeconds;
      hands.update(timeSeconds, deltaSeconds, idle);
      material.uniforms.uTime.value = timeSeconds;
    },
    stop() {
      timeline?.kill();
      timeline = null;
    },
    dispose() {
      timeline?.kill();
      hands.dispose();
      geometry.dispose();
      material.dispose();
      root.removeFromParent();
    },
  };
}
/**
 * Data contract used by character geometry and posing.
 */
export type HandInsert = ReturnType<typeof createHandInsert>;
