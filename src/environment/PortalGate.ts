import * as THREE from 'three';

/**
 * The way home: a standing rift at the threshold between the dimension (−Z) and San Fransokyo (+Z).
 * Its centre is clear so each world shows through to the other; the rim burns with the dimension's
 * cyan/violet. `close` (0→1) irises the opening shut slowly, the pressure that drives the sequence.
 */
export function createPortalGate(zPosition = 24) {
  const group = new THREE.Group();
  group.name = 'PortalGate';
  group.position.set(0, 4.2, zPosition);
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(result: T) => {
    owned.push(result);
    return result;
  };

  // Energy membrane: additive, see-through at the centre, a shrinking clear eye as it closes.
  const membrane = own(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uClose: { value: 0 },
        uA: { value: new THREE.Color('#7fe0ff') },
        uB: { value: new THREE.Color('#9b78db') },
      },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv;uniform float uTime;uniform float uClose;uniform vec3 uA;uniform vec3 uB;
      float hash(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5);}
      void main(){vec2 p=(vUv-.5)*2.;float r=length(p);
        float open=mix(.78,.04,uClose);           // clear eye radius, shrinks as it closes
        if(r>1.0)discard;
        float eye=smoothstep(open-.06,open,r);      // 0 inside the clear eye, 1 in the energy
        float rim=smoothstep(1.0,0.82,r);           // bright at the outer edge
        float swirl=.5+.5*sin(atan(p.y,p.x)*6.+uTime*1.3-r*8.);
        float film=.10+.9*hash(floor(vUv*160.)+floor(uTime*8.));
        vec3 col=mix(uA,uB,swirl);
        float a=eye*(rim*.9+.25)*(.5+.5*swirl)*(.7+.3*film);
        gl_FragColor=vec4(col*(1.6+rim*1.4),a*(.85+uClose*.4));}`,
    }),
  );
  const disc = new THREE.Mesh(own(new THREE.CircleGeometry(5.4, 64)), membrane);
  group.add(disc);

  // A solid ring frame so the gate reads as a structure, catching a hard rim of light.
  const frameMat = own(
    new THREE.MeshStandardMaterial({
      color: '#223042',
      roughness: 0.5,
      metalness: 0.6,
      emissive: '#2f6f94',
      emissiveIntensity: 0.8,
    }),
  );
  const frame = new THREE.Mesh(
    own(new THREE.TorusGeometry(5.5, 0.22, 10, 64)),
    frameMat,
  );
  group.add(frame);
  const coreMat = own(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#bfeaff').multiplyScalar(1.8),
      toneMapped: false,
    }),
  );
  const core = new THREE.Mesh(
    own(new THREE.TorusGeometry(5.5, 0.05, 8, 64)),
    coreMat,
  );
  group.add(core);

  const light = new THREE.PointLight('#8fd8ff', 9, 40, 1.6);
  light.position.set(0, 0, 0.5);
  group.add(light);

  let close = 0;
  return {
    group,
    z: zPosition,
    get closeAmount() {
      return close;
    },
    setClose(sampleValue: number) {
      close = THREE.MathUtils.clamp(sampleValue, 0, 1);
    },
    update(timeSeconds: number, deltaSeconds: number, target?: number) {
      if (target !== undefined)
        close = THREE.MathUtils.damp(close, target, 1.2, deltaSeconds);
      membrane.uniforms.uTime.value = timeSeconds;
      membrane.uniforms.uClose.value = close;
      const pulse = 0.9 + 0.1 * Math.sin(timeSeconds * 0.8);
      light.intensity = (9 - close * 4) * pulse;
      core.scale.setScalar(1 - close * 0.06);
      frame.scale.setScalar(1 - close * 0.04);
    },
    dispose() {
      owned.forEach((options) => options.dispose());
      group.removeFromParent();
      group.clear();
    },
  };
}
/**
 * Data contract used by environment construction.
 */
export type PortalGate = ReturnType<typeof createPortalGate>;
