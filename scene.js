import * as THREE from './vendor/three.module.min.js';

/* ---------------- helpers ---------------- */
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function canvasTex(draw, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function stoneTexture(base, seed, blocks = true) {
  return canvasTex((g, S) => {
    const r = rng(seed);
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, S, S);
    if (blocks) {
      for (let y = 0; y < S; y += 32) {
        let x = -r() * 60;
        while (x < S) {
          const w = 46 + r() * 74, v = (r() - .5) * 38;
          g.fillStyle = `rgb(${base.map(c => Math.max(0, Math.min(255, c + v)))})`;
          g.fillRect(x + 1.6, y + 1.6, w - 3.2, 28.8); x += w;
        }
      }
    }
    for (let i = 0; i < 12000; i++) { const v = (r() - .5) * 60; g.fillStyle = `rgba(${base.map(c => c + v)},.32)`; g.fillRect(r() * S, r() * S, 1 + r() * 2.5, 1 + r() * 2.5); }
  });
}
function tileTexture() {
  return canvasTex((g, S) => {
    const r = rng(5); g.fillStyle = '#7d4a33'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 22) for (let x = (y / 22) % 2 ? -14 : 0; x < S; x += 28) {
      const v = (r() - .5) * 30; g.fillStyle = `rgb(${130 + v},${78 + v * .7},${54 + v * .5})`;
      g.beginPath(); g.ellipse(x + 14, y + 12, 13, 11, 0, 0, Math.PI); g.fill();
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y + 20, 28, 2);
    }
  });
}
function mat(tex, rx = 1, ry = 1, color = 0xffffff, rough = .92) {
  const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
  return new THREE.MeshStandardMaterial({ map: t, color, roughness: rough, metalness: 0 });
}
function gable(w, h, len, material) {
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(0, h); sh.lineTo(w / 2, 0); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }); geo.translate(0, 0, -len / 2); geo.rotateY(Math.PI / 2);
  return new THREE.Mesh(geo, material);
}
const shadows = (o) => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

/* ---------------- world layout ---------------- */
const SITES = {
  church: { x: 0, z: 0, h: 12, r: 26 },
  tower: { x: 95, z: -85, h: 16, r: 34 },
  cave: { x: -105, z: -55, h: 4, r: 30 },
  modern: { x: 70, z: 70, h: 3, r: 30 },
};
function heightAt(x, z) {
  let y = Math.sin(x * .02) * 3 + Math.cos(z * .025) * 3 + Math.sin((x + z) * .06) * .9 + Math.sin(x * .11) * Math.sin(z * .09) * 1.3;
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  y += smooth(150, 270, r) * (55 + 30 * Math.sin(a * 5 + 1) + 18 * Math.sin(a * 13) + 8 * Math.sin(x * .05) * Math.cos(z * .04));
  y += 11 * Math.exp(-((r / 34) ** 2)); // church hill
  y += 14 * Math.exp(-(((x - 95) ** 2 + (z + 85) ** 2) / 1800)); // village shoulder
  for (const s of Object.values(SITES)) { const d = Math.hypot(x - s.x, z - s.z); const w = 1 - smooth(s.r * .55, s.r, d); y = y * (1 - w) + s.h * w; }
  return y;
}

/* ---------------- builders ---------------- */
function buildChurch(M) {
  const g = new THREE.Group(), W = 7, L = 15, H = 7;
  const nave = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), mat(M.stone, 3, 1.6)); nave.position.y = H / 2; g.add(nave);
  const tr = new THREE.Mesh(new THREE.BoxGeometry(W, H, L - 2), mat(M.stone, 1.6, 3)); tr.position.y = H / 2; g.add(tr);
  const r1 = gable(W + .7, 2.6, L + .5, M.roof); r1.position.y = H; g.add(r1);
  const r2 = gable(W + .7, 2.6, L - 1.5, M.roof); r2.rotation.y = Math.PI / 2; r2.position.y = H; g.add(r2);
  const apse = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, H - 1, 24, 1, false, 0, Math.PI), mat(M.stone, 2, 1.4));
  apse.rotation.y = Math.PI / 2; apse.position.set(L / 2, (H - 1) / 2, 0); g.add(apse);
  const ar = new THREE.Mesh(new THREE.SphereGeometry(2.75, 24, 8, 0, Math.PI, 0, Math.PI / 2), M.roof); ar.rotation.y = Math.PI / 2; ar.scale.y = .45; ar.position.set(L / 2, H - 1, 0); g.add(ar);
  const drumBase = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.4, 6.2), mat(M.stone, 1.2, .3)); drumBase.position.y = H + 2.1; g.add(drumBase);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.9, 5, 12), mat(M.stone, 2.5, 1.2)); drum.position.y = H + 5.2; g.add(drum);
  const cornice = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.0, .35, 12), mat(M.stone, 2, .2, 0xf0e2c8)); cornice.position.y = H + 7.8; g.add(cornice);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3.25, 3.6, 12), M.roof); cone.position.y = H + 9.8; g.add(cone);
  const gold = new THREE.MeshStandardMaterial({ color: 0xe0b866, metalness: .85, roughness: .28 });
  const cv = new THREE.Mesh(new THREE.BoxGeometry(.16, 1.6, .16), gold), ch = new THREE.Mesh(new THREE.BoxGeometry(.9, .16, .16), gold);
  ch.position.y = .3; const cross = new THREE.Group(); cross.add(cv, ch); cross.position.y = H + 12.4; g.add(cross);
  for (let i = 0; i < 12; i += 2) { const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const w = new THREE.Mesh(new THREE.BoxGeometry(.38, 1.7, .25), M.dark); w.position.set(Math.cos(a) * 2.8, H + 5.4, Math.sin(a) * 2.8); w.lookAt(0, H + 5.4, 0); g.add(w); }
  const wins = [[-L / 2 - .02, 0, 'x'], [L / 2 + 2.6, 0, 'x'], [0, W / 2 + .02, 'z'], [0, -W / 2 - .02, 'z'], [3.5, W / 2 + .02, 'z'], [-3.5, W / 2 + .02, 'z'], [3.5, -W / 2 - .02, 'z'], [-3.5, -W / 2 - .02, 'z']];
  wins.forEach(([x, z, ax]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(ax === 'x' ? .1 : .45, 1.8, ax === 'x' ? .45 : .1), M.dark); m.position.set(x, 4.4, z); g.add(m); });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.7, .12), M.dark); door.position.set(0, 1.35, (L - 2) / 2 + .03); g.add(door);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(.95, .18, 6, 16, Math.PI), mat(M.stone, .3, .3, 0xf3e6cc)); arch.position.set(0, 2.7, (L - 2) / 2 + .08); g.add(arch);
  // monastery wall
  const wallM = mat(M.stone, 6, .6, 0xe0d2b6);
  const R = 17, seg = 28;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    if (Math.abs(a0 - Math.PI / 2) < .18) continue; // gate gap (south)
    const x0 = Math.cos(a0) * R, z0 = Math.sin(a0) * R, x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R;
    const len = Math.hypot(x1 - x0, z1 - z0) + .2;
    const w = new THREE.Mesh(new THREE.BoxGeometry(len, 2.6, .9), wallM); w.position.set((x0 + x1) / 2, 1.3, (z0 + z1) / 2); w.rotation.y = -Math.atan2(z1 - z0, x1 - x0); g.add(w);
    if (i % 2 === 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(.7, .6, 1), wallM); m.position.set(x0, 2.9, z0); g.add(m); }
  }
  const bell = new THREE.Group();
  const bb = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 3), mat(M.stone, .8, 1.4)); bb.position.y = 3; bell.add(bb);
  const bt = new THREE.Mesh(new THREE.ConeGeometry(2.3, 2.4, 4), M.roof); bt.rotation.y = Math.PI / 4; bt.position.y = 7.2; bell.add(bt);
  const bo = new THREE.Mesh(new THREE.BoxGeometry(3.05, 1.4, 1.2), M.dark); bo.position.y = 5; bell.add(bo);
  bell.position.set(0, 0, R); g.add(bell);
  return shadows(g);
}

function buildTower(M, h) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.75, h, 4, 1), mat(M.stone, 1.2, h / 5, 0xece0c8)); body.rotation.y = Math.PI / 4; body.position.y = h / 2; g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.3, 3.8), mat(M.stone, 1, .3, 0xece0c8)); top.position.y = h + .65; g.add(top);
  for (let i = 0; i < 4; i++) for (let j = -1; j <= 1; j += 2) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.7, 1, .7), mat(M.stone, .3, .3, 0xece0c8));
    const a = i * Math.PI / 2; m.position.set(Math.cos(a) * 1.55 + Math.sin(a) * j * 1.1, h + 1.8, Math.sin(a) * 1.55 - Math.cos(a) * j * 1.1); g.add(m);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.95, 2.8, 4), M.wood); roof.rotation.y = Math.PI / 4; roof.position.y = h + 2.9; g.add(roof);
  for (let k = 0; k < 3; k++) { const w = new THREE.Mesh(new THREE.BoxGeometry(.4, .85, .2), M.dark); const y = h - 2.5 - k * 4.2; w.position.set(0, y, 2.1 + (h - y) / h * .6 - .3); g.add(w); }
  return shadows(g);
}
function buildHouse(M) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(7, 4.2, 5.2), mat(M.stone, 1.6, 1, 0xd8ccb4)); b.position.y = 2.1; g.add(b);
  const r = gable(5.8, 1.9, 7.6, M.wood); r.position.y = 4.2; g.add(r);
  const d = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, .1), M.dark); d.position.set(1.5, 1, 2.65); g.add(d);
  return shadows(g);
}
function buildCliff(M) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(80, 52, 18, 100, 70, 4), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z > 8.9) p.setZ(i, z + Math.sin(x * .19) * 1.3 + Math.sin(y * .31 + x * .07) * 1.1 + Math.sin(x * .9 + y * .7) * .25);
    if (y > 25.9) p.setY(i, y + Math.sin(x * .12) * 3 + Math.sin(x * .41) * 1.2);
  }
  geo.computeVertexNormals();
  const strata = canvasTex((c, S) => { const r = rng(3); for (let y = 0; y < S; y += 4) { const v = 150 + Math.sin(y * .07) * 22 + (r() - .5) * 18; c.fillStyle = `rgb(${v + 30},${v + 4},${v - 30})`; c.fillRect(0, y, S, 4); }
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(60,40,25,${r() * .25})`; c.fillRect(r() * S, r() * S, 2, 1 + r() * 3); } });
  const m = new THREE.Mesh(geo, mat(strata, 4, 2.8)); m.position.y = 10; g.add(m);
  const r = rng(9);
  for (let row = 0; row < 6; row++) for (let i = 0; i < 15; i++) {
    if (r() < .3) continue;
    const w = 1.2 + r() * 1.6, h = 1.5 + r() * 1.2;
    const cave = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.4), M.dark); cave.position.set(-33 + i * 4.6 + r() * 1.5, 5 + row * 4.6, 9.4); g.add(cave);
    if (r() < .35) { const ledge = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, .25, 1.4), M.wood); ledge.position.set(cave.position.x, cave.position.y - h / 2 - .1, 10.3); g.add(ledge); }
  }
  return shadows(g);
}
function buildModern(M) {
  const g = new THREE.Group();
  const conc = mat(M.concrete, 2, 2, 0xffffff, .95), glass = new THREE.MeshStandardMaterial({ color: 0x2b3642, roughness: .12, metalness: .7 });
  [[-6, 0], [6, 0], [0, -7]].forEach(([x, z]) => { const c = new THREE.Mesh(new THREE.BoxGeometry(3.2, 28, 3.2), conc); c.position.set(x, 14, z); g.add(c); });
  [[0, 9, 0, 22, 0], [0, 15, -3.5, 7, 1], [-4, 21, -1, 16, 0], [3, 27, -3.5, 8, 1]].forEach(([x, y, z, len, rot]) => {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(new THREE.BoxGeometry(len, 4, 6.4), conc));
    const w = new THREE.Mesh(new THREE.BoxGeometry(len + .06, 1.7, 6.46), glass); b.add(w);
    for (let k = -len / 2 + 1.5; k < len / 2; k += 3) { const f = new THREE.Mesh(new THREE.BoxGeometry(.25, 1.7, 6.5), conc); f.position.x = k; b.add(f); }
    b.position.set(x, y, z); if (rot) b.rotation.y = Math.PI / 2; g.add(b);
  });
  return shadows(g);
}
function buildCypress(M) {
  const g = new THREE.Group();
  const f = new THREE.Mesh(new THREE.ConeGeometry(.9, 7, 8), M.leaf); f.scale.set(1, 1, 1); f.position.y = 4.6; g.add(f);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(.15, .2, 1.4, 5), M.wood); t.position.y = .7; g.add(t);
  return shadows(g);
}

/* ---------------- main ---------------- */
export function createScene(canvas) {
  const mobile = matchMedia('(max-width: 760px)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let pr = Math.min(devicePixelRatio, mobile ? 1.25 : 1.35); renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08; renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xe0ad80, .0042);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x26304a) }, mid: { value: new THREE.Color(0xd8875a) }, bot: { value: new THREE.Color(0xf3cf9f) }, sunDir: { value: new THREE.Vector3(-.75, .18, -.63).normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 top,mid,bot,sunDir; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.06? mix(mid,top,smoothstep(0.06,0.55,h)) : mix(bot,mid,smoothstep(-0.12,0.06,h)); float s=max(dot(vP,sunDir),0.0); c+=vec3(1.0,0.78,0.5)*pow(s,40.0)*0.9+vec3(1.0,0.6,0.35)*pow(s,6.0)*0.25; gl_FragColor=vec4(c,1.0);}'
  }));
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(40, 1, .5, 2000);
  scene.add(new THREE.HemisphereLight(0xffe4c4, 0x403628, .85));
  const sun = new THREE.DirectionalLight(0xffc28a, 2.7);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 300 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .03;
  scene.add(sun, sun.target);

  const M = {
    stone: stoneTexture([204, 182, 144], 7), concrete: stoneTexture([186, 182, 174], 9, false),
    roof: new THREE.MeshStandardMaterial({ map: (() => { const t = tileTexture(); t.repeat.set(2.5, 2); return t; })(), roughness: .8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a4130, roughness: .9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a130e, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x2f3a22, roughness: 1 }),
  };

  // terrain with vertex colors
  const size = 820, segs = mobile ? 110 : 150;
  const tg = new THREE.PlaneGeometry(size, size, segs, segs); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, heightAt(tp.getX(i), tp.getZ(i)));
  tg.computeVertexNormals();
  const cols = new Float32Array(tp.count * 3), nrm = tg.attributes.normal;
  const cGrass = new THREE.Color(0x6f6b3c), cDry = new THREE.Color(0x9b8556), cRock = new THREE.Color(0x7b6a58), cSnow = new THREE.Color(0xf2efe9), tmp = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i), slope = 1 - nrm.getY(i), x = tp.getX(i), z = tp.getZ(i);
    tmp.copy(cGrass).lerp(cDry, .5 + .5 * Math.sin(x * .03 + z * .02));
    tmp.lerp(cRock, smooth(.18, .45, slope));
    tmp.lerp(cSnow, smooth(44, 62, y + Math.sin(x * .1) * 5) * (1 - smooth(.5, .8, slope) * .6));
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const grain = canvasTex((g, S) => { const r = rng(4); g.fillStyle = '#bbb'; g.fillRect(0, 0, S, S); for (let i = 0; i < 20000; i++) { const v = 150 + r() * 90; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * S, r() * S, 2, 2); } });
  grain.repeat.set(90, 90);
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 1 })); terrain.receiveShadow = true; scene.add(terrain);

  const place = (o, s, dx = 0, dz = 0) => { o.position.set(s.x + dx, heightAt(s.x + dx, s.z + dz), s.z + dz); scene.add(o); return o; };
  const church = buildChurch(M); church.rotation.y = -.45; place(church, SITES.church);
  const village = new THREE.Group();
  [[0, 0, 24], [8, -6, 19], [-9, -4, 27], [15, 5, 17], [-4, 9, 21], [-16, 6, 18]].forEach(([x, z, h], i) => { const t = buildTower(M, h); t.position.set(x, 0, z); t.rotation.y = i * .45; village.add(t); });
  [[5, 7], [-8, 13], [12, -13], [-15, -4], [19, -3]].forEach(([x, z], i) => { const hs = buildHouse(M); hs.position.set(x, 0, z); hs.rotation.y = i * .9; village.add(hs); });
  place(village, SITES.tower);
  const cliff = buildCliff(M); cliff.rotation.y = .5; place(cliff, SITES.cave); cliff.position.y -= 1;
  const modern = buildModern(M); modern.rotation.y = -.7; place(modern, SITES.modern);

  // cypress trees (instanced: 2 draw calls)
  const r = rng(21), spots = [];
  for (let i = 0; i < (mobile ? 70 : 150); i++) {
    const a = r() * Math.PI * 2, d = 20 + r() * 130, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Object.values(SITES).some(s => Math.hypot(x - s.x, z - s.z) < s.r * .62) || heightAt(x, z) > 40) continue;
    spots.push([x, z, .7 + r() * .7]);
  }
  [[-8, 22], [8, 22], [-20, 6], [21, -8], [-14, -20]].forEach(([x, z]) => spots.push([x, z, 1]));
  const leafGeo = new THREE.ConeGeometry(.9, 7, 7); leafGeo.translate(0, 4.6, 0);
  const trunkGeo = new THREE.CylinderGeometry(.15, .2, 1.4, 5); trunkGeo.translate(0, .7, 0);
  const leaves = new THREE.InstancedMesh(leafGeo, M.leaf, spots.length), trunks = new THREE.InstancedMesh(trunkGeo, M.wood, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  spots.forEach(([x, z, k], i) => { ps.set(x, heightAt(x, z) - .2, z); sc.setScalar(k); m4.compose(ps, q, sc); leaves.setMatrixAt(i, m4); trunks.setMatrixAt(i, m4); });
  leaves.castShadow = true; leaves.receiveShadow = true; scene.add(leaves, trunks);

  // dust
  const N = mobile ? 400 : 1100, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (r() - .5) * 260; pos[i * 3 + 1] = r() * 70; pos[i * 3 + 2] = (r() - .5) * 260; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = canvasTex((g, S) => { const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,240,215,1)'); gr.addColorStop(1, 'rgba(255,240,215,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }, 64);
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: dot, size: .55, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // camera shots: site, offset, look height, screen shift (+ = model to the right)
  const S = SITES, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const shotDefs = {
    hero:   { at: V(0, S.church.h + 5, 0), off: V(-66, 30, 82), shift: 34 },
    church: { at: V(0, S.church.h + 7, 0), off: V(-33, 9, 33), shift: 11 },
    tower:  { at: V(S.tower.x, S.tower.h + 13, S.tower.z), off: V(-30, 6, 52), shift: -13 },
    cave:   { at: V(S.cave.x + 6, S.cave.h + 16, S.cave.z + 8), off: V(46, 4, 78), shift: 14 },
    modern: { at: V(S.modern.x, S.modern.h + 15, S.modern.z), off: V(-50, 6, 58), shift: -15 },
  };
  shotDefs.house = shotDefs.tower;
  const shot = (name) => {
    const d = shotDefs[name] || shotDefs.hero;
    const pos = d.at.clone().add(d.off), tgt = d.at.clone();
    const shift = mobile ? 0 : d.shift;
    const dir = tgt.clone().sub(pos).normalize(), right = dir.clone().cross(V(0, 1, 0)).normalize();
    tgt.addScaledVector(right, -shift); pos.addScaledVector(right, -shift);
    if (mobile) { pos.addScaledVector(dir, -d.off.length() * .35); pos.y += 6; tgt.y -= 4; }
    return { pos, tgt, at: d.at };
  };
  const first = shot('hero');
  const cur = { pos: first.pos.clone(), tgt: first.tgt.clone() }, goal = { pos: first.pos.clone(), tgt: first.tgt.clone(), at: first.at.clone() };
  const placeSun = (at) => { sun.position.copy(at).add(V(-70, 55, -55)); sun.target.position.copy(at); };
  placeSun(first.at);
  function goTo(name, instant) { const s = shot(name); goal.pos.copy(s.pos); goal.tgt.copy(s.tgt); goal.at.copy(s.at); placeSun(s.at); if (instant) { cur.pos.copy(s.pos); cur.tgt.copy(s.tgt); } }

  const mouse = { x: 0, y: 0 }, drag = { on: false, x: 0, y: 0, ax: 0, ay: 0 }, user = { x: 0, y: 0 };
  canvas.addEventListener('pointerdown', e => { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.ax = user.x; drag.ay = user.y; });
  addEventListener('pointerup', () => { drag.on = false; });
  addEventListener('pointermove', e => {
    if (drag.on) { user.x = drag.ax + (e.clientX - drag.x) * .006; user.y = Math.max(-.3, Math.min(.6, drag.ay + (e.clientY - drag.y) * .003)); }
    mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5;
  });

  function resize() { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 58 : 40; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  const clock = new THREE.Clock(); let running = true, last = performance.now();
  const up = V(0, 1, 0);
  let visible = true, fpsN = 0, fpsT = performance.now(), downgraded = false;
  function frame(now) {
    if (!running) return;
    if (!visible) { requestAnimationFrame(frame); last = now; return; }
    fpsN++;
    if (!downgraded && now - fpsT > 2500) {
      const fps = fpsN * 1000 / (now - fpsT); fpsN = 0; fpsT = now;
      if (fps < 40) { pr = Math.max(.75, pr * .75); renderer.setPixelRatio(pr); resize(); if (fps < 25) { renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); } if (pr <= .76 || fps >= 25) downgraded = true; }
      else downgraded = true;
    }
    const dt = Math.min((now - last) / 1000, .1); last = now; const t = clock.getElapsedTime();
    const k = 1 - Math.pow(.025, dt); // frame-rate independent easing (~1.1s)
    cur.pos.lerp(goal.pos, k); cur.tgt.lerp(goal.tgt, k);
    const off = cur.pos.clone().sub(cur.tgt);
    off.applyAxisAngle(up, Math.sin(t * .12) * .07 + user.x + mouse.x * .05);
    camera.position.copy(cur.tgt).add(off); camera.position.y += user.y * 30 - mouse.y * 2;
    camera.lookAt(cur.tgt);
    dust.rotation.y = t * .01; dust.position.y = Math.sin(t * .3) * .8;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { last = performance.now(); requestAnimationFrame(frame); } });

  const qs = new URLSearchParams(location.search).get('shot'); if (qs) goTo(qs, true);
  return { goTo, setVisible(v) { visible = v; }, resetView() { user.x = 0; user.y = 0; } };
}
