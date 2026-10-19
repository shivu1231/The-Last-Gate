import { MathUtils, type Line, type Material, type Mesh, type Object3D, PerspectiveCamera, type Points, Scene, type ShaderMaterial, type Sprite, Vector2, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { reducedMotion } from '../config/experience';
import { cinematicSignals } from './CinematicSignals';
import { useQuality, type QualityPreset } from '../performance/Quality';

export class CinematicPost {
  readonly composer:EffectComposer;
  private bokeh:BokehPass;
  private grade:ShaderPass;
  private bloom:UnrealBloomPass;
  private ao:GTAOPass;
  private width=1920;private height=1080;
  private preset:QualityPreset=useQuality.getState().preset;
  private unsubscribe:()=>void;
  private dpr=0;
  constructor(private gl:WebGLRenderer,scene:Scene,camera:PerspectiveCamera){
    this.composer=new EffectComposer(gl);
    this.composer.renderTarget1.stencilBuffer=true;this.composer.renderTarget2.stencilBuffer=true;
    this.composer.addPass(new RenderPass(scene,camera));
    this.ao=new GTAOPass(scene,camera,960,540);this.ao.blendIntensity=.38;
    this.ao.updateGtaoMaterial({radius:.38,thickness:.12,distanceExponent:1.5,samples:12});
    this.ao.updatePdMaterial({radius:5,samples:8});this.composer.addPass(this.ao);
    this.bokeh=new BokehPass(scene,camera,{focus:3,aperture:.0012,maxblur:.018});this.composer.addPass(this.bokeh);
    // AO normals and DOF depth come only from opaque surfaces. Sprites, glows, tears and other
    // transparent layers would otherwise stamp flat squares into both buffers.
    const cache:Object3D[]=[];
    const hide=()=>{scene.traverse(o=>{const m=(o as Mesh).material as Material|undefined;
      if(o.visible&&((o as Sprite).isSprite||(o as Points).isPoints||(o as Line).isLine||(m&&!Array.isArray(m)&&m.transparent))){o.visible=false;cache.push(o);}});};
    const restore=()=>{cache.forEach(o=>{o.visible=true;});cache.length=0;};
    const ao=this.ao as unknown as {_overrideVisibility:()=>void;_restoreVisibility:()=>void};ao._overrideVisibility=hide;ao._restoreVisibility=restore;
    const bokehRender=this.bokeh.render.bind(this.bokeh);
    this.bokeh.render=(...args:Parameters<BokehPass['render']>)=>{hide();bokehRender(...args);restore();};
    this.bloom=new UnrealBloomPass(new Vector2(1920,1080),.18,.55,1.65);this.composer.addPass(this.bloom);
    // Tracker T-01: one NaN or Inf pixel in the scene (a glow shader on a rare exact pixel) is
    // blurred by bloom across the whole frame, and the grade clamps it to black: a one-frame black
    // flash. Bloom reads the frame only through this high-pass, so clean its input there.
    const highPass=(this.bloom as unknown as {materialHighPassFilter:ShaderMaterial}).materialHighPassFilter;
    highPass.fragmentShader=highPass.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );','vec4 texel = texture2D( tDiffuse, vUv );texel = ( any( isnan( texel ) ) || any( isinf( texel ) ) ) ? vec4( 0. ) : min( texel, vec4( 64. ) );');highPass.needsUpdate=true;
    this.grade=new ShaderPass({uniforms:{tDiffuse:{value:null},instability:{value:0},uWarp:{value:0},uCenter:{value:new Vector2(.5,.5)},uTime:{value:0},uFlash:{value:0},uWhite:{value:0},uRed:{value:0},uCyan:{value:0},uChroma:{value:0},uAspect:{value:16/9},uSoftFocus:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`uniform sampler2D tDiffuse;uniform float instability;uniform float uWarp;uniform vec2 uCenter;uniform float uTime;uniform float uFlash;uniform float uWhite;uniform float uRed;uniform float uCyan;uniform float uChroma;uniform float uAspect;uniform float uSoftFocus;varying vec2 vUv;
      void main(){
        vec2 uv=vUv;
        // Shockwave lens: a single expanding ring of refraction around the impact, used only on hits.
        vec2 q=(uv-uCenter)*vec2(uAspect,1.);float r=length(q);float front=(1.-uWarp)*1.25;
        float ring=exp(-pow((r-front)*9.,2.))*uWarp;uv-=normalize(q+1e-4)/vec2(uAspect,1.)*ring*.035;
        vec2 d=uv-.5;float ca=instability+uChroma*.012+ring*.02;vec2 offset=d*dot(d,d)*ca*4.;
        vec3 c=texture2D(tDiffuse,uv).rgb;c.r=texture2D(tDiffuse,uv+offset).r;c.b=texture2D(tDiffuse,uv-offset).b;
        if(uSoftFocus>0.){vec2 b=vec2(uSoftFocus/uAspect,uSoftFocus);c*=.2;c+=(texture2D(tDiffuse,uv+vec2(b.x,0.)).rgb+texture2D(tDiffuse,uv-vec2(b.x,0.)).rgb+texture2D(tDiffuse,uv+vec2(0.,b.y)).rgb+texture2D(tDiffuse,uv-vec2(0.,b.y)).rgb)*.12;c+=(texture2D(tDiffuse,uv+b).rgb+texture2D(tDiffuse,uv-b).rgb+texture2D(tDiffuse,uv+vec2(b.x,-b.y)).rgb+texture2D(tDiffuse,uv+vec2(-b.x,b.y)).rgb)*.08;}
        float lum=dot(c,vec3(.299,.587,.114));
        // Red intrudes from the edges inward; cyan floods from the fracture.
        float edge=smoothstep(.25,.85,length(d*vec2(1.2,1.)));
        c=mix(c,c*vec3(1.18,.84,.82)+vec3(.035,0.,0.)*lum,uRed*(.35+edge*.65));
        c=mix(c,c*vec3(.86,1.04,1.16)+vec3(0.,.02,.04),uCyan);
        c+=vec3(1.,.93,.88)*uFlash*.55;
        c=mix(c,vec3(.93,.98,1.),uWhite);
        gl_FragColor=vec4(max(c,0.),1.);}`});this.composer.addPass(this.grade);this.composer.addPass(new SMAAPass());this.composer.addPass(new OutputPass());
    // Quality presets (performance/Quality) own resolution-dependent cost; FrameGovernor switches them.
    this.unsubscribe=useQuality.subscribe(s=>this.applyQuality(s.preset));this.applyQuality(this.preset);
  }
  applyQuality(preset:QualityPreset){
    this.preset=preset;
    // AO re-renders the whole scene for normals; LOW turns it off rather than thinning it.
    this.ao.enabled=preset.aoSamples>0;if(this.ao.enabled)this.ao.updateGtaoMaterial({samples:preset.aoSamples});this.bloom.strength=.18*preset.bloom;
    this.resize(this.width,this.height);
  }
  resize(width:number,height:number){this.width=width;this.height=height;this.grade.uniforms.uAspect.value=width/Math.max(1,height);this.composer.setSize(width,height);const scale=this.preset.aoScale;this.ao.setSize(Math.ceil(width*scale),Math.ceil(height*scale));}
  /** Sequence grade, written each frame by the scene. */
  fx={warp:0,center:new Vector2(.5,.5),flash:0,white:0,red:0,cyan:0,chroma:0,aperture:-1,time:0,action:false,opening:true};
  render(dt:number,wake:number,progress:number,focus:number){
    const dpr=this.gl.getPixelRatio();if(dpr!==this.dpr){this.dpr=dpr;this.composer.setPixelRatio(dpr);this.resize(this.width,this.height);}
    const recovering=!this.fx.opening&&!this.fx.action&&!reducedMotion&&wake<1;
    // Fast action hides AO; below HIGH it is skipped there so the chase keeps its frame rate.
    this.ao.enabled=!this.fx.opening&&!recovering&&this.preset.aoSamples>0&&!(this.fx.action&&this.preset.dprCap<1.5);
    const signal=cinematicSignals;
    this.bokeh.enabled=this.preset.dof&&!recovering&&(progress>.48||signal.blur>.01);
    const uniforms=this.bokeh.uniforms as Record<string,{value:number}>;
    uniforms.focus.value=recovering?MathUtils.lerp(2.8,focus,MathUtils.smoothstep(wake,.55,1)):focus;
    uniforms.aperture.value=recovering?MathUtils.lerp(.0013,.000045,wake):MathUtils.lerp(.000025,.00013,MathUtils.smoothstep(progress,.48,1));
    uniforms.maxblur.value=(recovering?.018:.006)+signal.blur*.012;uniforms.aperture.value+=signal.blur*.0006;
    this.grade.uniforms.instability.value=(recovering?(1-wake)*.003:0)+signal.instability;
    const g=this.grade.uniforms,fx=this.fx;
    g.uWarp.value=fx.warp;g.uCenter.value.copy(fx.center);g.uFlash.value=fx.flash;g.uWhite.value=fx.white;g.uRed.value=fx.red;g.uCyan.value=fx.cyan;g.uChroma.value=fx.chroma;g.uTime.value=fx.time;g.uSoftFocus.value=recovering?.006*(1-wake):0;
    // Shell beats isolate the subject with a shallower field; the chase opens it back up.
    if(fx.aperture>=0&&!recovering){this.bokeh.enabled=this.preset.dof&&fx.aperture>0;uniforms.aperture.value=fx.aperture;uniforms.maxblur.value=.009;}
    if(fx.opening)this.bokeh.enabled=false;
    this.gl.toneMappingExposure=(recovering?MathUtils.lerp(.74,1.08,wake):1.08)+signal.exposure;
    this.gl.domElement.dataset.quality=useQuality.getState().name;
    this.composer.render(dt);
  }
  dispose(){this.unsubscribe();for(const pass of this.composer.passes)pass.dispose?.();this.composer.dispose();}
}
