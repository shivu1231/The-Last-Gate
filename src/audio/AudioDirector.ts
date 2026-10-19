import type { Phase } from '../state/SceneStateManager';

type Layer={gain:GainNode;level:number};
const smooth=(t:number,a:number,b:number)=>{const x=Math.max(0,Math.min(1,(t-a)/(b-a)));return x*x*(3-2*x);};

/**
 * Original, synthesized sound only. Silence is used as deliberately as noise: continuous
 * layers are mixed per phase, one-shots are authored to the frame they belong to.
 */
import { audioEngine } from './AudioMix';

export class AudioDirector {
  private ctx:AudioContext|null=null;
  private master:GainNode|null=null;private bus:GainNode|null=null;private ears:BiquadFilterNode|null=null;
  private world:GainNode|null=null;private pressure:GainNode|null=null;private breath:GainNode|null=null;
  private layers:Record<'hum'|'red'|'thrust'|'corridor'|'align'|'ring',Layer>|null=null;
  private alignOsc:OscillatorNode|null=null;private redLfo:GainNode|null=null;private corridorOsc:OscillatorNode[]=[];
  private noise:AudioBuffer|null=null;
  private nextEvent=9;private enabled=false;private lastMix=0;private nextTick=0;
  async setEnabled(enabled:boolean){
    this.enabled=enabled;
    if(enabled&&!this.ctx)this.create();
    if(!this.ctx||!this.master)return;
    if(enabled)await this.ctx.resume();
    this.master.gain.setTargetAtTime(enabled?.34:0,this.ctx.currentTime,.25);
  }
  private create(){
    // Shared context + mix bus (AudioMix): narrative snapshots, silence beats and cleanup apply here too.
    const ctx=audioEngine.ensure();if(!ctx)throw new Error('Web Audio unavailable');this.ctx=ctx;
    this.master=ctx.createGain();this.master.gain.value=0;
    const comp=ctx.createDynamicsCompressor();comp.threshold.value=-16;comp.ratio.value=4;comp.attack.value=.004;comp.release.value=.25;
    this.ears=ctx.createBiquadFilter();this.ears.type='lowpass';this.ears.frequency.value=20000;
    this.bus=ctx.createGain();this.bus.connect(this.ears);this.ears.connect(comp);comp.connect(this.master);this.master.connect(audioEngine.bus('LEGACY')!);
    const buffer=ctx.createBuffer(1,ctx.sampleRate*6,ctx.sampleRate),data=buffer.getChannelData(0);let last=0;
    for(let i=0;i<data.length;i++){last=(last+.025*(Math.random()*2-1))/1.025;data[i]=last*3.5;}
    const white=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),w=white.getChannelData(0);for(let i=0;i<w.length;i++)w[i]=Math.random()*2-1;
    this.noise=white;
    const loop=(buf:AudioBuffer)=>{const s=ctx.createBufferSource();s.buffer=buf;s.loop=true;s.start();return s;};
    // Portal air.
    const wind=loop(buffer),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=430;
    this.world=ctx.createGain();this.world.gain.value=.19;wind.connect(filter);filter.connect(this.world);this.world.connect(this.bus);
    // Hiro's breathing: band-limited air, gently modulated.
    const breathSource=loop(buffer),breathFilter=ctx.createBiquadFilter();breathFilter.type='bandpass';breathFilter.frequency.value=560;breathFilter.Q.value=.6;
    this.breath=ctx.createGain();this.breath.gain.value=.055;breathSource.connect(breathFilter);breathFilter.connect(this.breath);this.breath.connect(this.bus);
    const breathLfo=ctx.createOscillator(),breathDepth=ctx.createGain();breathLfo.frequency.value=.18;breathDepth.gain.value=.045;breathLfo.connect(breathDepth);breathDepth.connect(this.breath.gain);breathLfo.start();
    this.pressure=ctx.createGain();this.pressure.gain.value=.012;this.pressure.connect(this.bus);
    for(const freq of [42,63.07,84.02]){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=freq;g.gain.value=.6;o.connect(g);g.connect(this.pressure);o.start();}
    const layer=():Layer=>{const g=ctx.createGain();g.gain.value=0;g.connect(this.bus!);return {gain:g,level:0};};
    const L={hum:layer(),red:layer(),thrust:layer(),corridor:layer(),align:layer(),ring:layer()};this.layers=L;
    // Baymax's internal life: two soft partials, the higher one barely there.
    for(const [f,g] of [[110,.6],[220.4,.18],[329.9,.05]] as const){const o=ctx.createOscillator(),v=ctx.createGain();o.frequency.value=f;v.gain.value=g;o.connect(v);v.connect(L.hum.gain);o.start();}
    // Corrupted system hum: detuned saws, low-passed, with a slow targeting tremolo.
    const redFilter=ctx.createBiquadFilter();redFilter.type='lowpass';redFilter.frequency.value=380;redFilter.Q.value=4;redFilter.connect(L.red.gain);
    this.redLfo=ctx.createGain();this.redLfo.gain.value=.5;
    for(const f of [55,55.6,82.5]){const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=f;const v=ctx.createGain();v.gain.value=.22;o.connect(v);v.connect(this.redLfo);o.start();}
    this.redLfo.connect(redFilter);
    const trem=ctx.createOscillator(),tremDepth=ctx.createGain();trem.frequency.value=3.2;tremDepth.gain.value=.25;trem.connect(tremDepth);tremDepth.connect(this.redLfo.gain);trem.start();
    // Thrusters: band noise for the jet, low noise for the body of it.
    const jet=loop(white),jetBand=ctx.createBiquadFilter();jetBand.type='bandpass';jetBand.frequency.value=1100;jetBand.Q.value=.7;jet.connect(jetBand);jetBand.connect(L.thrust.gain);
    const body=loop(buffer),bodyLow=ctx.createBiquadFilter();bodyLow.type='lowpass';bodyLow.frequency.value=160;const bodyGain=ctx.createGain();bodyGain.gain.value=3;body.connect(bodyLow);bodyLow.connect(bodyGain);bodyGain.connect(L.thrust.gain);
    // The corridor: partials that drift against each other, and a thin shimmer above.
    for(const [f,g] of [[36.7,.5],[55.1,.35],[73.6,.22],[146.9,.07]] as const){const o=ctx.createOscillator(),v=ctx.createGain();o.frequency.value=f;v.gain.value=g;o.connect(v);v.connect(L.corridor.gain);o.start();this.corridorOsc.push(o);}
    const shimmer=loop(white),hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=6500;const sg=ctx.createGain();sg.gain.value=.05;shimmer.connect(hp);hp.connect(sg);sg.connect(L.corridor.gain);
    // Alignment tone and post-blast tinnitus.
    this.alignOsc=ctx.createOscillator();this.alignOsc.frequency.value=440;this.alignOsc.connect(L.align.gain);this.alignOsc.start();
    const ring=ctx.createOscillator();ring.frequency.value=3720;ring.connect(L.ring.gain);ring.start();
  }
  private set(layer:Layer,level:number,time=.4){if(!this.ctx||Math.abs(layer.level-level)<.0004)return;layer.level=level;layer.gain.gain.setTargetAtTime(level,this.ctx.currentTime,time);}

  /** Called each frame; the mix only updates at ~15 Hz. */
  update(progress:number,phase:Phase,phaseTime:number,signals:{red:number;alignment:number;corridor:number;collapse:number;thrust:number}){
    if(!this.ctx||!this.world||!this.pressure||!this.enabled||!this.layers||!this.breath)return;
    const ctx=this.ctx,t=ctx.currentTime,L=this.layers;
    if(t-this.lastMix>.066){
      this.lastMix=t;
      const shell=['discovery','inspected','chip-focus','chip-reaching','chip-held','chest-focus','panel-opening','socket-ready','inserting'].includes(phase);
      const silent=phase==='silence';
      const violent=['ignition','chase','fracture','pulled'].includes(phase);
      // World air recedes as Hiro gets close; it returns, rawer, once the city starts breaking.
      const air=silent?.012:shell?.19*(1-progress*.88)*.7:violent?.16:phase==='handoff'?.02:.19*(1-progress*.88);
      this.world.gain.setTargetAtTime(air,t,silent?.15:.6);
      const press=silent?.004:phase==='threat'?.004:violent?.02:.011+progress*.011;
      this.pressure.gain.setTargetAtTime(press,t,.8);
      this.breath.gain.setTargetAtTime(silent?.12:phase==='threat'?.1:violent?.13:shell?.07:.055,t,.5);
      const hum=phase==='panel-opening'?smooth(phaseTime,1.4,3)*.01:['socket-ready','inserting'].includes(phase)?.012:phase==='silence'?.002:phase==='booting'?.004+smooth(phaseTime,1.2,3)*.016:phase==='diagnostic'?.014:phase==='corrupting'?.014*(1-signals.red):0;
      this.set(L.hum,hum,.5);
      this.set(L.red,phase==='corrupting'?signals.red*.05:phase==='threat'?.06:violent&&phase!=='pulled'?.035:0,phase==='threat'?.2:.8);
      this.set(L.thrust,signals.thrust*.08*(phase==='pulled'?.3:1),.15);
      this.set(L.corridor,phase==='fracture'?signals.corridor*.09:phase==='pulled'?.11:phase==='handoff'?.05:0,.6);
      this.set(L.align,phase==='socket-ready'?Math.pow(signals.alignment,1.5)*.012:0,.08);
      if(this.alignOsc)this.alignOsc.frequency.setTargetAtTime(440+signals.alignment*220,t,.06);
      if(this.redLfo)this.redLfo.gain.setTargetAtTime(.35+signals.red*.4,t,.4);
      // Tonal collapse: the corridor partials sag as Hiro is taken through.
      if(phase==='pulled')this.corridorOsc.forEach((o,i)=>o.detune.setTargetAtTime(-smooth(phaseTime,1,4.6)*(700+i*150),t,.3));
      else this.corridorOsc.forEach(o=>o.detune.setTargetAtTime(0,t,.5));
      this.set(L.ring,Math.max(0,L.ring.level*.94-.0002),.05);
    }
    // Targeting logic: ticks that accelerate as corruption takes hold.
    if(phase==='corrupting'&&signals.red>.25&&t>this.nextTick){this.nextTick=t+Math.max(.14,.9-signals.red*.8);this.tone('sine',2400,2300,.04,.004*signals.red);}
    if(!['silence','threat'].includes(phase)&&t>this.nextEvent){
      this.nextEvent=t+13.5;const tick=progress>.8;
      this.tone('triangle',tick?1300:83,tick?900:57,tick?.1:2.5,tick?.002:.005,tick?.005:.35);
    }
  }
  updateProgress(progress:number){this.update(progress,'approaching',0,{red:0,alignment:0,corridor:0,collapse:0,thrust:0});}

  // ------------------------------------------------------------------ primitives
  private out(pan=0){if(!this.ctx||!this.bus)return null;const p=this.ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));p.connect(this.bus);return p;}
  private tone(type:OscillatorType,f0:number,f1:number,dur:number,gain:number,attack=.01,delay=0,pan=0){
    if(!this.ctx||!this.enabled)return;const ctx=this.ctx,t=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain(),dest=this.out(pan);if(!dest)return;
    o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(gain,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g);g.connect(dest);o.start(t);o.stop(t+dur+.05);
  }
  private burst(kind:BiquadFilterType,f0:number,f1:number,dur:number,gain:number,{q=1,attack=.004,delay=0,pan=0}={}){
    if(!this.ctx||!this.enabled||!this.noise)return;const ctx=this.ctx,t=ctx.currentTime+delay,s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain(),dest=this.out(pan);if(!dest)return;
    s.buffer=this.noise;s.playbackRate.value=.8+Math.random()*.4;f.type=kind;f.Q.value=q;f.frequency.setValueAtTime(f0,t);f.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(gain,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    s.connect(f);f.connect(g);g.connect(dest);s.start(t,Math.random()*1.2);s.stop(t+dur+.05);
  }
  private click(delay=0,gain=.05,freq=3200,pan=0){this.burst('bandpass',freq,freq*.8,.018,gain,{q:3,attack:.001,delay,pan});}

  // ------------------------------------------------------------------ authored cues
  failedLink(){this.tone('sine',320,130,.5,.04,.01);}
  shellCue(kind:'grip'|'lift'|'inspect'|'latch'|'release'|'servo'|'present'|'magnet'|'lock'|'seal'|'boot'|'chime'|'line'|'fault'|'wrong'|'lock-on'){
    if(!this.ctx||!this.enabled)return;
    switch(kind){
      case 'grip':this.click(0,.03,2400);this.tone('sine',90,70,.25,.02);break;
      case 'lift':this.click(0,.04,4200);this.tone('triangle',170,260,.5,.012,.05);this.burst('bandpass',800,2600,.6,.012,{q:.8,attack:.15});break;
      case 'inspect':this.tone('sine',60,60,.6,.006,.08);this.tone('sine',1880,1820,.18,.003,.005,.3);break;
      case 'latch':this.click(0,.06,2600);this.click(.13,.05,2300);this.tone('sine',92,64,.28,.03,.004,.02);break;
      case 'release':this.burst('bandpass',4200,1400,.55,.022,{q:1.4,attack:.02});this.tone('sine',140,110,.2,.012);break;
      case 'servo':for(const [d,f] of [[0,150],[.35,175],[.7,165]] as const){this.tone('sawtooth',f,f*1.28,.5,.0035,.08,d);this.tone('sine',f*2,f*2.4,.45,.004,.06,d);}break;
      case 'present':this.tone('sine',220,330,.9,.008,.3);this.click(.88,.03,3400);break;
      case 'magnet':this.burst('lowpass',600,180,.5,.02,{q:.7,attack:.12});this.tone('sine',330,440,.35,.006,.1);break;
      case 'lock':this.click(0,.09,3000);this.click(.012,.05,5200);this.tone('sine',70,42,.35,.06,.003);this.tone('sine',1320,1320,.6,.007,.004,.04);break;
      case 'seal':this.tone('sawtooth',190,140,.9,.003,.08);this.burst('bandpass',1800,600,.5,.012,{q:1,attack:.05,delay:.9});this.tone('sine',95,70,.3,.02,.004,1.1);break;
      case 'boot':this.tone('sine',110,220,1.8,.016,.6);this.tone('sine',165,330,1.8,.008,.7,.1);break;
      // A soft, rising three-note wake: familiar warmth, never a quotation.
      case 'chime':[523.3,659.3,784].forEach((f,i)=>{this.tone('sine',f,f,1.4,.016,.03,i*.17);this.tone('sine',f*2,f*2,.7,.003,.02,i*.17);});break;
      case 'line':this.tone('sine',1250,1250,.07,.006,.004);break;
      case 'fault':this.tone('sine',330,311,.4,.012,.006);this.tone('sine',349,330,.4,.008,.006);break;
      // The wake chime bent out of tune: hope going wrong.
      case 'wrong':[784,740,698].forEach((f,i)=>this.tone('sine',f,f*.94,1.1,.012,.03,i*.22));break;
      case 'lock-on':this.tone('sine',46,34,2.6,.11,.01);this.tone('sawtooth',98,92,1.4,.01,.02);this.tone('sine',2300,2300,.09,.008,.003);this.tone('sine',2300,2300,.09,.008,.003,.11);break;
    }
  }
  /**
   * Tracker S-03: his systems coming up, as sound. A relay and a supply whine climbing at power-on,
   * then a flutter of self-test blips before the wake chime.
   */
  power(){
    if(!this.ctx||!this.enabled)return;
    this.click(0,.07,1800);this.tone('sine',52,38,.5,.04,.004);
    this.tone('triangle',90,1400,1.2,.005,.5,.05);this.tone('sine',4200,7600,1.3,.0016,.9,.05);
    this.burst('bandpass',300,3200,1,.008,{q:2,attack:.6});
    [1568,2093,1760,2349,1976,2637,2093].forEach((f,i)=>this.tone('square',f,f,.035,.0018,.002,1.15+i*.075+(i>3?.08:0),(i%2?.25:-.25)));
  }
  /**
   * Data chatter for as long as a diagnostic line resolves on screen, then its verdict: a bright
   * double blip for OK, a sour two-tone for a fault, and a hard alarm for the combat system.
   */
  dataLine(kind:'ok'|'fault'|'red',duration:number){
    if(!this.ctx||!this.enabled)return;
    let seed=Math.round(duration*997)+(kind==='red'?3:kind==='fault'?2:1);
    const rnd=()=>(seed=(seed*9301+49297)%233280)/233280;
    for(let d=0;d<duration;d+=.034+rnd()*.03){
      const f=kind==='red'?900+rnd()*900:1700+rnd()*1900;
      this.tone(kind==='red'?'square':'sine',f,f*.93,.022,kind==='red'?.0012:.0022,.002,d,(rnd()-.5)*.5);
    }
    const end=duration+.04;
    if(kind==='ok'){this.tone('sine',1320,1320,.08,.006,.004,end);this.tone('sine',1760,1760,.16,.006,.004,end+.09);}
    else if(kind==='fault'){this.click(end,.03,1200);this.tone('triangle',392,370,.4,.011,.006,end);this.tone('triangle',415,392,.4,.008,.006,end);}
    else{
      // COMBAT SYSTEM ACTIVE: a three-pulse two-tone alarm with a growl under it.
      for(let i=0;i<3;i++){this.tone('square',988,988,.1,.0042,.004,end+i*.18);this.tone('square',740,740,.1,.0038,.004,end+i*.18+.09);}
      this.tone('sawtooth',62,55,.9,.012,.02,end);this.burst('bandpass',1800,900,.45,.012,{q:3,attack:.01,delay:end});
    }
  }
  /** Tracker S-02: rubble from the crossing landing round Hiro, and chunks that whip past his head. */
  rubble(pan=0,near=.6){
    if(!this.ctx||!this.enabled)return;
    this.tone('sine',78,40,.3,.05*near,.004,0,pan*.5);this.burst('lowpass',1100,200,.4,.05*near,{attack:.003,pan});
    for(let i=0;i<4;i++)this.burst('bandpass',1400+Math.random()*2200,800,.05,.014*near,{q:4,delay:.05+Math.random()*.35,pan:pan+(Math.random()-.5)*.5});
  }
  whiz(pan=0){
    if(!this.ctx||!this.enabled)return;
    this.burst('bandpass',500,2600,.3,.035,{q:1.6,attack:.22,pan});this.burst('bandpass',2600,700,.25,.025,{q:1.6,attack:.01,delay:.3,pan:pan*1.4});
  }
  /** Spool and charge build; discharge cracks; impacts carry boom, debris and, if torn, the tear. */
  charge(pan=0){this.tone('sawtooth',180,1600,1.1,.008,.6,0,pan);this.tone('sine',360,2200,1.1,.006,.6,0,pan);}
  spool(){this.tone('sawtooth',55,220,1.4,.014,.9);this.burst('bandpass',300,1600,1.6,.03,{q:.6,attack:1.2});}
  discharge(pan=0){this.burst('highpass',2400,900,.18,.09,{attack:.002,pan});this.tone('square',880,90,.22,.02,.002,0,pan);}
  impact(power:number,tear:boolean,pan=0,near=1){
    if(!this.ctx||!this.enabled||!this.ears||!this.layers)return;
    const g=Math.min(1.4,power)*(.45+near*.55);
    this.tone('sine',62,26,1.8,.22*g,.004,0,pan*.5);this.burst('lowpass',900,90,1.6,.18*g,{q:.7,attack:.003,pan:pan*.6});
    this.burst('highpass',3000,1200,.12,.07*g,{attack:.001,pan});
    for(let i=0;i<7;i++)this.burst('bandpass',1800+Math.random()*2400,900,.06,.02*g,{q:4,delay:.25+Math.random()*1.2,pan:pan+(Math.random()-.5)*.6});
    this.burst('lowpass',400,120,2.6,.05*g,{attack:.3,delay:.2});
    if(tear){
      // Reality tearing: a rising band of noise that refuses to resolve, with a glassy ring.
      this.burst('bandpass',260,2900,1.5,.05*g,{q:6,attack:.5,pan});this.tone('sine',1975,1580,1.8,.008*g,.4,.1,pan);this.tone('sine',2093,1661,1.8,.006*g,.4,.12,-pan);
    }
    if(power*near>.7){
      // Ears: the world dulls and rings, then comes back.
      const t=this.ctx.currentTime;this.ears.frequency.cancelScheduledValues(t);this.ears.frequency.setValueAtTime(700,t+.02);this.ears.frequency.exponentialRampToValueAtTime(20000,t+2.4);
      this.layers.ring.level=.006*power;this.layers.ring.gain.gain.setTargetAtTime(this.layers.ring.level,t,.02);
    }
  }
  /** Doppler pass for the overhead swoop, panned across the head. */
  flyby(){
    if(!this.ctx||!this.enabled||!this.noise)return;const ctx=this.ctx,t=ctx.currentTime,s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain(),p=ctx.createStereoPanner();
    s.buffer=this.noise;s.loop=true;f.type='bandpass';f.Q.value=.9;f.frequency.setValueAtTime(1900,t);f.frequency.exponentialRampToValueAtTime(420,t+1.9);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.16,t+.75);g.gain.exponentialRampToValueAtTime(.0001,t+2.2);
    p.pan.setValueAtTime(.7,t);p.pan.linearRampToValueAtTime(-.7,t+1.6);s.connect(f);f.connect(g);g.connect(p);p.connect(this.bus!);s.start(t);s.stop(t+2.3);
    this.tone('sine',80,38,1.6,.08,.5);
  }
  rupture(){this.tone('sine',41,22,4.5,.16,.8);this.burst('bandpass',180,3800,4,.06,{q:2,attack:2.5});}
  whiteout(){this.tone('sine',220,880,1.6,.02,1.2);this.burst('highpass',1200,9000,1.8,.05,{attack:1.4});}
  arrival(){[293.7,440,587.3].forEach((f,i)=>this.tone('sine',f,f,5,.008,2,.4+i*.3));}
  dispose(){this.master?.disconnect();this.ctx=null;this.master=null;}
}
