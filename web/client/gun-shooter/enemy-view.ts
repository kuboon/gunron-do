/**
 * An enemy as it is drawn: its solid, turned to whatever element it is in, and facing the player.
 *
 * Two transforms, one inside the other, and the split is the game's whole geometry. The outer one
 * — the frame — stands where the enemy is and looks at the player, so its `+Z` is the axis a twist
 * turns about and its `+Y` is "up" as the player sees it. The inner one — the body — is the
 * element: the rotation from the home pose, exactly the quaternion the rules hold. So the `e` face
 * is at the front and upright precisely when the body's rotation is the identity, which is the
 * picture the player is learning to read.
 *
 * A turn is drawn by sliding the body from one element to the next along the shortest way round,
 * which for these rotations is the turn itself — about the shot's axis, by the shot's angle — with
 * a little overshoot so it lands with a thump.
 */

import * as THREE from "three";

import type { Enemy } from "./game.ts";
import type { Species, SpeciesId } from "./groups.ts";
import { FACE_COLORS, GOLD, SPECIES_COLORS } from "./palette.ts";
import type { Quat } from "./quat.ts";
import { faceCentre, faceNormal } from "./solids.ts";

/** The parts of a species' mesh that every enemy of that kind shares. */
interface Kit {
  faces: THREE.BufferGeometry;
  eFace: THREE.BufferGeometry;
  edges: THREE.BufferGeometry;
  colors: string[];
}

const kits = new Map<SpeciesId, Kit>();
let eTexture: THREE.Texture | null = null;

/** The colours of a species' faces, the `e` face first — for the shards when it breaks. */
export function faceColors(species: Species): string[] {
  return kit(species).colors;
}

export class EnemyView {
  readonly enemy: Enemy;
  readonly frame = new THREE.Group();
  readonly body = new THREE.Group();
  readonly #faceMat: THREE.MeshStandardMaterial;
  readonly #eMat: THREE.MeshBasicMaterial;
  readonly #edgeMat: THREE.LineBasicMaterial;
  readonly #shellMat: THREE.MeshBasicMaterial;
  readonly #halo: THREE.Sprite;
  readonly #lock: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly #axis: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;

  #from = new THREE.Quaternion();
  #to = new THREE.Quaternion();
  #spin = 1;
  #spinAxis = new THREE.Vector3();
  #pop = 0;
  #born = 0;
  #home = 0;
  #hit = 0;

  constructor(enemy: Enemy, glow: THREE.Texture) {
    this.enemy = enemy;
    const k = kit(enemy.species);
    const color = SPECIES_COLORS[enemy.species.id];

    this.#faceMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.15,
      flatShading: true,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.08,
    });
    this.#eMat = new THREE.MeshBasicMaterial({
      map: eGlyph(),
      transparent: true,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.#edgeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.5),
      toneMapped: false,
    });
    this.#shellMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(0.9),
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    const faces = new THREE.Mesh(k.faces, this.#faceMat);
    const eFace = new THREE.Mesh(k.eFace, this.#eMat);
    const edges = new THREE.LineSegments(k.edges, this.#edgeMat);
    const shell = new THREE.Mesh(k.faces, this.#shellMat);
    shell.scale.setScalar(1.09);
    this.body.add(faces, eFace, edges, shell);

    // The halo and the lock ring belong to the frame, not the body: they face the player whatever
    // the solid is doing.
    this.#halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        color: new THREE.Color(GOLD),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.#halo.scale.setScalar(3.4);
    this.#lock = new THREE.Mesh(
      new THREE.RingGeometry(1.42, 1.5, 48, 1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(GOLD).multiplyScalar(1.4),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const axisGeo = new THREE.CylinderGeometry(0.035, 0.035, 3.4, 8, 1, true);
    this.#axis = new THREE.Mesh(
      axisGeo,
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.frame.add(this.#halo, this.body, this.#lock, this.#axis);
    this.frame.scale.setScalar(enemy.radius);

    const q = enemy.species.elements[enemy.state];
    this.body.quaternion.set(q[0], q[1], q[2], q[3]);
    this.#to.copy(this.body.quaternion);
    this.#home = enemy.state === 0 ? 1 : 0;
    this.#born = 0;
  }

  /**
   * Starts a turn from one element to the next.
   *
   * @param from The element it was in
   * @param to The element it is in now
   * @param color The round's colour, lit along the axis while it turns
   */
  turn(from: Quat, to: Quat, color: string): void {
    this.#from.set(from[0], from[1], from[2], from[3]);
    this.#to.set(to[0], to[1], to[2], to[3]);
    // The same rotation, the short way round: `to · from⁻¹` is the shot, and its axis is lit.
    const rel = this.#to.clone().multiply(this.#from.clone().invert());
    if (rel.w < 0) rel.set(-rel.x, -rel.y, -rel.z, -rel.w);
    const s = Math.sqrt(Math.max(0, 1 - rel.w * rel.w));
    this.#spinAxis.set(rel.x, rel.y, rel.z).divideScalar(s || 1);
    this.#axis.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      this.#spinAxis,
    );
    this.#axis.material.color.set(color).multiplyScalar(3);
    this.#spin = 0;
    this.#pop = 1;
    this.#hit = 1;
  }

  /**
   * Moves the drawing on a frame.
   *
   * @param dt Seconds of game time
   * @param eye Where the player is looking from — the frame turns to face it
   * @param time The clock, for the idle wobble
   */
  update(dt: number, eye: THREE.Vector3, time: number): void {
    const [x, y, z] = this.enemy.pos;
    this.frame.position.set(x, y, z);
    this.frame.lookAt(eye);

    this.#born = Math.min(1, this.#born + dt * 1.6);
    const grow = easeOutBack(this.#born);

    if (this.#spin < 1) {
      this.#spin = Math.min(1, this.#spin + dt / 0.26);
      this.body.quaternion.slerpQuaternions(
        this.#from,
        this.#to,
        easeOutBack(this.#spin, 1.3),
      );
    } else {
      this.body.quaternion.copy(this.#to);
    }

    const athome = this.enemy.state === 0 && this.#spin >= 1;
    this.#home += ((athome ? 1 : 0) - this.#home) * Math.min(1, dt * 8);
    this.#pop = Math.max(0, this.#pop - dt * 5);
    this.#hit = Math.max(0, this.#hit - dt * 3.2);

    // Squash on impact, a slow breathing otherwise, and a heartbeat when it is at `e`.
    const beat = athome ? Math.pow(0.5 + 0.5 * Math.sin(time * 9), 4) : 0;
    const breathe = 1 + Math.sin(time * 2 + this.enemy.id) * 0.025;
    const pop = 1 + this.#pop * 0.22;
    this.body.scale.setScalar(grow * breathe * pop * (1 + beat * 0.05));

    this.#faceMat.emissiveIntensity = 0.08 + this.#hit * 0.9;
    this.#eMat.color.setScalar(0.85 + this.#home * (0.35 + beat * 0.35));
    this.#shellMat.opacity = 0.3 + this.#hit * 0.5;
    this.#halo.material.opacity = this.#home * (0.25 + beat * 0.25);
    this.#lock.material.opacity = this.#home * 0.7;
    this.#lock.rotation.z = time * 2.4;
    this.#lock.scale.setScalar(1 + (1 - this.#home) * 0.8);
    this.#axis.material.opacity = this.#spin < 1 ? (1 - this.#spin) * 1.2 : 0;
  }

  dispose(): void {
    this.#faceMat.dispose();
    this.#eMat.dispose();
    this.#edgeMat.dispose();
    this.#shellMat.dispose();
    this.#halo.material.dispose();
    this.#lock.geometry.dispose();
    this.#lock.material.dispose();
    this.#axis.geometry.dispose();
    this.#axis.material.dispose();
  }
}

/** Past 1 and back: the settle of something that landed hard. */
function easeOutBack(t: number, s = 1.70158): number {
  const u = t - 1;
  return 1 + u * u * ((s + 1) * u + s);
}

/**
 * The shared geometry of one species, built on first use.
 *
 * The faces are one mesh with a colour per face; the `e` face is drawn again on top with the
 * glyph, its texture coordinates laid flat across it in the home pose so the `e` reads upright
 * exactly when the enemy is at `e`.
 */
function kit(species: Species): Kit {
  const cached = kits.get(species.id);
  if (cached) return cached;

  const { vertices, faces, kind } = species.solid;
  const colors = faces.map((_, i) =>
    i === 0
      ? GOLD
      : kind === "plate" && i === 1
      ? "#5b1030"
      : FACE_COLORS[(i - 1 + species.order) % FACE_COLORS.length]
  );

  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  faces.forEach((face, fi) => {
    c.set(colors[fi]);
    // The `e` face underneath its glyph is dark, so the gold glyph is what glows.
    if (fi === 0) c.set("#1a0f00");
    for (let k = 1; k < face.length - 1; k++) {
      for (const vi of [face[0], face[k], face[k + 1]]) {
        pos.push(...vertices[vi]);
        col.push(c.r, c.g, c.b);
      }
    }
  });
  const faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  faceGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  faceGeo.computeVertexNormals();

  // The `e` face again, a hair proud of the solid, textured.
  const front = faces[0];
  const n = faceNormal(vertices, front);
  const centre = faceCentre(vertices, front);
  // Scaled to the face's inscribed circle, so the glyph fits a triangle as well as a pentagon.
  const r = Math.min(
    ...front.map((i, k) => {
      const [a, b] = [vertices[i], vertices[front[(k + 1) % front.length]]];
      return Math.hypot(
        (a[0] + b[0]) / 2 - centre[0],
        (a[1] + b[1]) / 2 - centre[1],
      );
    }),
  ) * 1.15;
  const ePos: number[] = [];
  const eUv: number[] = [];
  const push = (v: readonly number[]) => {
    ePos.push(v[0] + n[0] * 0.004, v[1] + n[1] * 0.004, v[2] + n[2] * 0.004);
    eUv.push(
      (v[0] - centre[0]) / (2 * r) + 0.5,
      (v[1] - centre[1]) / (2 * r) + 0.5,
    );
  };
  for (let k = 1; k < front.length - 1; k++) {
    push(vertices[front[0]]);
    push(vertices[front[k]]);
    push(vertices[front[k + 1]]);
  }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute("position", new THREE.Float32BufferAttribute(ePos, 3));
  eGeo.setAttribute("uv", new THREE.Float32BufferAttribute(eUv, 2));

  // Every edge once.
  const seen = new Set<string>();
  const lines: number[] = [];
  for (const face of faces) {
    for (let k = 0; k < face.length; k++) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(...vertices[a], ...vertices[b]);
    }
  }
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));

  const made = { faces: faceGeo, eFace: eGeo, edges: edgeGeo, colors };
  kits.set(species.id, made);
  return made;
}

/** The glyph on the `e` face: a gold `e` inside a gold border, on nothing. */
function eGlyph(): THREE.Texture {
  if (eTexture) return eTexture;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    10,
    size / 2,
    size / 2,
    size * 0.6,
  );
  g.addColorStop(0, "#fff1a8");
  g.addColorStop(0.55, "#ffd23f");
  g.addColorStop(1, "#ff9d1c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Dark on gold rather than light on dark: under the bloom a bright letter melts into its own
  // glow, while a dark one on a glowing face stays sharp at any distance.
  ctx.fillStyle = "#2a0d00";
  ctx.font = `900 ${size * 0.62}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("e", size / 2, size * 0.47);
  // A bar under the glyph, so which way is up is never in doubt.
  ctx.fillRect(size * 0.3, size * 0.8, size * 0.4, size * 0.05);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  eTexture = texture;
  return texture;
}
