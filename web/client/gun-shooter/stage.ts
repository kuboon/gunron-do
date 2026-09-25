/**
 * Where the fight happens: a neon grid to the horizon, a striped sun sinking behind the enemies,
 * stars, and a few giant rings turning in the distance.
 *
 * All of it is scenery — nothing here is hit, aimed at or counted — so it is built once and only
 * ever animated: the grid runs towards the player, the sun breathes, the rings turn. The shaders
 * fade everything into the horizon themselves rather than leaning on the scene's fog, which stays
 * for the enemies.
 */

import * as THREE from "three";

/** The scenery, and what moves it. */
export interface Stage {
  update(time: number, pulse: number): void;
}

/**
 * Builds the scenery into a scene.
 *
 * @param scene Where to put it
 */
export function buildStage(scene: THREE.Scene): Stage {
  const sky = skyDome();
  const grid = gridFloor();
  const sun = sunDisc();
  const stars = starfield();
  const rings = haloRings();
  scene.add(sky, grid.mesh, sun.mesh, stars, ...rings);

  return {
    update(time, pulse) {
      grid.material.uniforms.uTime.value = time;
      grid.material.uniforms.uPulse.value = pulse;
      sun.material.uniforms.uTime.value = time;
      stars.rotation.y = time * 0.004;
      rings.forEach((ring, i) => {
        ring.rotation.z = time * (0.05 + i * 0.03) * (i % 2 ? -1 : 1);
        ring.rotation.x = Math.PI / 2 + Math.sin(time * 0.1 + i) * 0.15;
      });
    },
  };
}

/** A violet sky going to magenta at the horizon. */
function skyDome(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 top = vec3(0.012, 0.004, 0.035);
        vec3 mid = vec3(0.05, 0.01, 0.1);
        vec3 horizon = vec3(0.3, 0.03, 0.2);
        vec3 col = mix(mid, top, smoothstep(0.05, 0.6, h));
        col = mix(horizon, col, smoothstep(-0.02, 0.16, h));
        col = mix(col, vec3(0.01, 0.0, 0.02), smoothstep(0.0, -0.2, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), material);
  mesh.renderOrder = -10;
  return mesh;
}

/** The floor: glowing lines every few metres, running towards the player. */
function gridFloor() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uPulse;
      varying vec3 vWorld;
      float line(float x, float width) {
        float d = abs(fract(x - 0.5) - 0.5) / fwidth(x);
        return 1.0 - min(d / width, 1.0);
      }
      void main() {
        vec2 p = vWorld.xz / 4.0;
        p.y += uTime * 0.35;
        float g = max(line(p.x, 1.2), line(p.y, 1.2));
        float r = length(vWorld.xz);
        float fade = exp(-r * 0.022);
        vec3 cyan = vec3(0.1, 0.9, 1.0);
        vec3 pink = vec3(1.0, 0.2, 0.85);
        vec3 col = mix(pink, cyan, smoothstep(10.0, 120.0, r));
        // A ring of light that runs outwards when something big happens.
        float wave = exp(-pow((r - uPulse * 90.0) * 0.12, 2.0)) * (1.0 - uPulse);
        float glow = g * (0.15 + 0.85 * fade) + wave * 1.2;
        gl_FragColor = vec4(col * glow, clamp(glow, 0.0, 1.0) * fade);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -5;
  return { mesh, material };
}

/** The synthwave sun, sliced into bands, low behind where the enemies come from. */
function sunDisc() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c);
        float disc = smoothstep(0.5, 0.48, r);
        float y = vUv.y;
        vec3 col = mix(vec3(1.0, 0.1, 0.55), vec3(1.0, 0.85, 0.2), smoothstep(0.1, 0.9, y));
        // Bands that thicken towards the bottom and drift down.
        float band = step(0.5, fract((y + uTime * 0.02) * 14.0));
        float cut = mix(band, 1.0, smoothstep(0.35, 0.55, y));
        float halo = exp(-r * 9.0) * 0.25 * (1.0 - disc);
        float a = disc * cut;
        gl_FragColor = vec4(col * (a * 0.9 + halo), max(a, halo));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material);
  // Low, and off to one side of straight ahead, so the crosshair is never in its glare.
  mesh.position.set(-150, 18, -380);
  mesh.lookAt(0, 18, 0);
  mesh.renderOrder = -8;
  return { mesh, material };
}

/** Stars over the upper sky. */
function starfield(): THREE.Points {
  const n = 1800;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1;
    const y = Math.abs(u) * 0.9 + 0.05;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - y * y);
    positions.set(
      [Math.cos(a) * s * 380, y * 380, Math.sin(a) * s * 380],
      i * 3,
    );
    const warm = Math.random();
    colors.set([0.7 + warm * 0.3, 0.7 + (1 - warm) * 0.3, 1], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = -9;
  return points;
}

/** Three huge rings, far off, turning. */
function haloRings(): THREE.Mesh[] {
  const colors = [0xff3fd0, 0x2de2ff, 0xb58cff];
  return colors.map((color, i) => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(60 + i * 25, 0.35 + i * 0.1, 8, 160),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        fog: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const a = (i / colors.length) * Math.PI * 2 + 0.6;
    mesh.position.set(Math.sin(a) * 230, 40 + i * 18, -Math.cos(a) * 230);
    return mesh;
  });
}
