import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Phase-owned version of the established ACES/bloom treatment, with a single lens pass. */
export class PhaseTwoPost {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private lens: ShaderPass;
  constructor(gl: T.WebGLRenderer, scene: T.Scene, camera: T.Camera) {
    this.composer = new EffectComposer(gl);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(960, 540), .32, .5, 1.05);
    this.composer.addPass(this.bloom);
    this.lens = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, time: { value: 0 }, arrival: { value: 0 }, impact: { value: 0 } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time,arrival,impact; varying vec2 vUv;
        float noise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
        void main(){
          vec2 p=vUv-.5; vec2 uv=vUv+p*dot(p,p)*(arrival*.035+impact*.008);
          vec3 c=texture2D(tDiffuse,uv).rgb;
          float aberration=arrival*.006+impact*.002;
          c.r=texture2D(tDiffuse,uv+p*aberration).r;
          c.b=texture2D(tDiffuse,uv-p*aberration).b;
          c*=1.-dot(p,p)*.48;
          c+=vec3((noise(gl_FragCoord.xy+floor(time*24.))-.5)*.0035);
          c=mix(c,vec3(3.5,3.9,4.1),arrival);
          gl_FragColor=vec4(max(c,0.),1.);
        }`,
    });
    this.composer.addPass(this.lens);
    this.composer.addPass(new OutputPass());
  }
  resize(width: number, height: number, ratio: number) {
    this.composer.setPixelRatio(ratio); this.composer.setSize(width, height);
  }
  setLow(low: boolean) { this.bloom.enabled = !low; }
  render(dt: number, time: number, arrival: number, impact: number) {
    this.lens.uniforms.time.value = time;
    this.lens.uniforms.arrival.value = arrival;
    this.lens.uniforms.impact.value = impact;
    this.composer.render(dt);
  }
  dispose() { for (const pass of this.composer.passes) pass.dispose?.(); this.composer.dispose(); }
}
