/**
 * Where the fight happens: a dark floor with a faint grid, seen from above and behind the turret,
 * and the line round the turret an enemy must not cross.
 *
 * All of it is scenery — nothing here is hit, aimed at or counted — so it is built once and only
 * ever animated. It stays dim on purpose: the enemies are what the eye has to read, and a floor
 * that glows competes with them.
 */

import * as THREE from "three";

import { BREACH_RADIUS } from "./game.ts";
import { DANGER } from "./palette.ts";

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
  const line = breachLine();
  scene.add(sky, grid.mesh, line);

  return {
    update(time, pulse) {
      grid.material.uniforms.uTime.value = time;
      grid.material.uniforms.uPulse.value = pulse;
      line.rotation.z = time * 0.1;
    },
  };
}

/** A dark violet sky, for the few screens tall enough to see the horizon. */
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
        vec3 col = mix(vec3(0.09, 0.03, 0.14), vec3(0.02, 0.01, 0.05), smoothstep(0.0, 0.5, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), material);
  mesh.renderOrder = -10;
  return mesh;
}

/** The floor: a dark plate with thin lines every few metres. */
function gridFloor() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPulse: { value: 1 } },
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
        float g = max(line(p.x, 1.0), line(p.y, 1.0));
        float r = length(vWorld.xz);
        float fade = exp(-r * 0.012);
        vec3 base = vec3(0.045, 0.03, 0.08);
        vec3 ink = vec3(0.16, 0.13, 0.3);
        // A ring of light that runs outwards from the turret when something big happens.
        float wave = exp(-pow((r - uPulse * 70.0) * 0.5, 2.0)) * (1.0 - uPulse);
        vec3 col = base + ink * g * (0.35 + 0.65 * fade) + vec3(0.18, 0.12, 0.04) * wave;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -5;
  return { mesh, material };
}

/** The dashed red circle round the turret: past it, an enemy costs a life. */
function breachLine(): THREE.Mesh {
  const pos: number[] = [];
  const n = 48;
  const inner = BREACH_RADIUS - 0.12;
  const outer = BREACH_RADIUS + 0.12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 0.55) / n) * Math.PI * 2;
    const p = [
      [Math.cos(a0) * inner, Math.sin(a0) * inner],
      [Math.cos(a0) * outer, Math.sin(a0) * outer],
      [Math.cos(a1) * outer, Math.sin(a1) * outer],
      [Math.cos(a1) * inner, Math.sin(a1) * inner],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) pos.push(p[k][0], p[k][1], 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(DANGER),
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  return mesh;
}
