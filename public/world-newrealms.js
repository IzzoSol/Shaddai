/* SHADDAI · world-newrealms.js — ocean + volcano building blocks ported from world3d.html for the SHADDAI-WORLD-3D host.
   Usage (ES module inside the host's <script type="module">):
     import { makeRealmKit } from '/world-newrealms.js';
     const kit = makeRealmKit(THREE);           // { oceanMat, lavaMat, waveH(x,z,t), WAVES }
     // ocean: mesh = new THREE.Mesh(new THREE.PlaneGeometry(1700,1700,220,220).rotateX(-Math.PI/2), kit.oceanMat); each frame: kit.oceanMat.uniforms.t.value = time
     // boats: y = kit.waveH(x,z,t); the ocean starts at world z=895 (edit smooth() bounds to move it)
     // lava: mesh = new THREE.Mesh(new THREE.PlaneGeometry(w,len), kit.lavaMat); each frame: kit.lavaMat.uniforms.t.value = time
     // models live in /assets/newworld/models/*.glb (meshopt-compressed: needs MeshoptDecoder), terrain in /assets/newworld/terrain/*.webp */
export function makeRealmKit(THREE) {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const WAVES = [[1, 0.2, 0.55, 38, 1.0], [0.4, 1, 0.35, 23, 1.3], [-0.6, 0.8, 0.2, 13, 1.7], [0.9, -0.5, 0.12, 7, 2.1]];   // dx,dz,amp,length,speed
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function waveH(x, z, t) { let h = 0; for (const [dx, dz, A, L, sp] of WAVES) { const l = Math.hypot(dx, dz); h += A * Math.sin(((dx * x + dz * z) / l) * (6.28318 / L) + t * sp); } return h * smooth(895, 960, z); }
  const F = (x) => Number(x).toFixed(5);
  const WH_GLSL = 'float wh(vec2 p,float t,out vec2 g){float h=0.;g=vec2(0.);' + WAVES.map(([dx, dz, A, L, sp]) => { const l = Math.hypot(dx, dz), k = 6.28318 / L; return `{float ph=dot(p,vec2(${F(dx / l)},${F(dz / l)}))*${F(k)}+t*${F(sp)};h+=${F(A)}*sin(ph);g+=${F(A * k)}*cos(ph)*vec2(${F(dx / l)},${F(dz / l)});}`; }).join('') + 'float c=smoothstep(895.,960.,p.y);g*=c;return h*c;}';
  const oceanMat = new THREE.ShaderMaterial({
    fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { t: { value: 0 }, skyTop: { value: new THREE.Color() }, skyBot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3) }, sunCol: { value: new THREE.Color(1, 0.95, 0.85) } }]),
    vertexShader: [
      'uniform float t; varying vec3 vW; varying vec3 vN; varying float vH;',
      WH_GLSL,
      '#include <fog_pars_vertex>',
      'void main(){ vec4 w=modelMatrix*vec4(position,1.); vec2 g; float h=wh(w.xz,t,g); w.y+=h; vW=w.xyz; vH=h; vN=normalize(vec3(-g.x,1.,-g.y));',
      ' vec4 mvPosition=viewMatrix*w; gl_Position=projectionMatrix*mvPosition;',
      '#include <fog_vertex>',
      '}'].join('\n'),
    fragmentShader: [
      'uniform float t; uniform vec3 skyTop; uniform vec3 skyBot; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vW; varying vec3 vN; varying float vH;',
      '#include <fog_pars_fragment>',
      'void main(){',
      ' vec3 N=normalize(vN); N.xz+=0.06*vec2(sin(vW.x*1.7+t*1.3+sin(vW.z*.9)),cos(vW.z*1.9+t*1.1)); N=normalize(N);',
      ' vec3 V=normalize(cameraPosition-vW); float fr=pow(1.-max(dot(N,V),0.),4.);',
      ' float deep=smoothstep(900.,1040.,vW.z); vec3 body=mix(vec3(.10,.74,.70),vec3(.015,.10,.30),deep);',
      ' vec3 R=reflect(-V,N); vec3 refl=mix(skyBot,skyTop,clamp(R.y*1.6,0.,1.));',
      ' vec3 col=mix(body,refl,clamp(fr*.85+.1,0.,1.));',
      ' float sp=pow(max(dot(reflect(-sunDir,N),V),0.),110.); col+=sunCol*sp*1.6;',
      ' float foam=smoothstep(.5,.95,vH/.9)*.55+(1.-smoothstep(900.,914.,vW.z))*.7*(.5+.5*sin(vW.x*.5+t*2.));',
      ' col=mix(col,vec3(1.),clamp(foam,0.,1.)*.75); gl_FragColor=vec4(col,1.);',
      '#include <fog_fragment>',
      '}'].join('\n'),
  });
  const lavaMat = new THREE.ShaderMaterial({
    fog: true, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { t: { value: 0 } }]),
    vertexShader: ['varying vec2 vUv;', '#include <fog_pars_vertex>', 'void main(){ vUv=uv; vec4 mvPosition=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mvPosition;', '#include <fog_vertex>', '}'].join('\n'),
    fragmentShader: [
      'varying vec2 vUv; uniform float t;',
      '#include <fog_pars_fragment>',
      'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
      'float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}',
      'void main(){ vec2 p=vUv*vec2(4.,22.); p.y-=t*.35; float f=fbm(p+fbm(p*1.7+t*.12)*1.4); float crust=smoothstep(.44,.64,f);',
      ' vec3 lava=mix(vec3(1.,.22,.02),vec3(1.,.82,.22),smoothstep(.2,.5,1.-f)); vec3 col=mix(lava*2.3,vec3(.06,.02,.02),crust); gl_FragColor=vec4(col,1.);',
      '#include <fog_fragment>',
      '}'].join('\n'),
  });
  return { oceanMat, lavaMat, waveH, WAVES };
}
