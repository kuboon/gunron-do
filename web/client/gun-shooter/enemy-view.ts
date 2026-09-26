/**
 * An enemy as it is drawn: its solid, turned to whatever element it is in, facing the turret.
 *
 * Two transforms, one inside the other, and the split is the game's whole geometry. The outer one
 * — the frame — stands where the enemy is and looks at the turret across the floor, so its `+Z`
 * points at the turret and its `+Y` is up. The inner one — the body — is the element: the rotation
 * from the home pose, exactly the quaternion the rules hold. So the `e` face looks at the turret,
 * upright, precisely when the body's rotation is the identity.
 *
 * Everything the player reads is drawn plainly, lit like an object rather than glowing: faces in
 * muted colours with dark edges, the `e` face white with the letter in ink. On top of that, in the
 * frame (so it never moves with the body): a dashed outline where the `e` face belongs. And, when
 * asked for, the spot the pointer is on with the axis through it, the spot the hint says to hit, or
 * the axis the enemy is turned about.
 */

import * as THREE from "three";

import type { Enemy } from "./game.ts";
import { type Answer, type Species, type SpeciesId } from "./groups.ts";
import {
  DANGER,
  E_FACE,
  E_INK,
  FACE_COLORS,
  GOLD,
  SHOT_COLORS,
  SHOT_GLYPHS,
  SPECIES_COLORS,
} from "./palette.ts";
import type { Quat, Vec3 } from "./quat.ts";
import { faceCentre, faceNormal } from "./solids.ts";

/** The parts of a species' mesh that every enemy of that kind shares. */
interface Kit {
  faces: THREE.BufferGeometry;
  eFace: THREE.BufferGeometry;
  edges: THREE.BufferGeometry;
  /** Where the `e` face belongs: a dashed outline just outside it. */
  socket: THREE.BufferGeometry;
  colors: string[];
}

const kits = new Map<SpeciesId, Kit>();
let eTexture: THREE.Texture | null = null;
const labels = new Map<string, THREE.Texture>();

/** The colours of a species' faces, the `e` face first — for the shards when it breaks. */
export function faceColors(species: Species): string[] {
  return kit(species).colors;
}

/**
 * What a pointer on an enemy's surface is on: the spot a round would land at.
 *
 * The nearest spot to the point hit, with the small features given room: a corner, or an edge's
 * middle, would otherwise be a sliver no finger could hit. That is measured over every spot, not
 * only the ones on the face that was hit, so a point near the rim of a plate's face snaps to the
 * rim — a plate's rim is too thin to hit on purpose.
 *
 * @param enemy What was hit
 * @param local Where, in the body's own coordinates
 */
export function spotAt(enemy: Enemy, local: THREE.Vector3): number {
  const weight = { face: 1, edge: 0.7, vertex: 0.6 } as const;
  let best = 0;
  let bestD = Infinity;
  enemy.species.spots.forEach((spot, i) => {
    const [x, y, z] = spot.point;
    const d = Math.hypot(local.x - x, local.y - y, local.z - z) *
      weight[spot.kind];
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export class EnemyView {
  readonly enemy: Enemy;
  readonly frame = new THREE.Group();
  readonly body = new THREE.Group();
  /** The meshes a pointer can hit. */
  readonly pickables: THREE.Mesh[];
  readonly #faceMat: THREE.MeshStandardMaterial;
  readonly #eMat: THREE.MeshStandardMaterial;
  readonly #edgeMat: THREE.LineBasicMaterial;
  readonly #socketMat: THREE.MeshBasicMaterial;
  readonly #socket: THREE.Mesh;
  readonly #shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly #ground: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

  // The pointer's spot: a ring on it, and the axis through it.
  readonly #aimRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly #aimAxis: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  // The hint: a ring on the spot to hit, and a label saying which way.
  readonly #hintRing: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  >;
  readonly #hintLabel: THREE.Sprite;
  // The weaker hint: the axis the enemy is turned about.
  readonly #ownAxis: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  // The turn in progress: its axis, lit in the round's colour.
  readonly #turnAxis: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;

  #aim: { spot: number; reachable: boolean } | null = null;
  #hint: Answer | null = null;
  #hintKey = "";
  #axis: Vec3 | null = null;

  #from = new THREE.Quaternion();
  #to = new THREE.Quaternion();
  #spin = 1;
  #pop = 0;
  #born = 0;
  #home = 0;
  #hit = 0;

  constructor(enemy: Enemy) {
    this.enemy = enemy;
    const k = kit(enemy.species);
    const color = SPECIES_COLORS[enemy.species.id];

    this.#faceMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.05,
      flatShading: true,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0,
    });
    this.#eMat = new THREE.MeshStandardMaterial({
      map: eGlyph(),
      roughness: 0.55,
      metalness: 0,
      emissive: new THREE.Color(GOLD),
      emissiveIntensity: 0,
    });
    this.#edgeMat = new THREE.LineBasicMaterial({ color: 0x120c1c });

    const faces = new THREE.Mesh(k.faces, this.#faceMat);
    const eFace = new THREE.Mesh(k.eFace, this.#eMat);
    const edges = new THREE.LineSegments(k.edges, this.#edgeMat);
    this.body.add(faces, eFace, edges);
    this.pickables = [faces, eFace];

    this.#socketMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(GOLD),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.#socket = new THREE.Mesh(k.socket, this.#socketMat);

    const unlit = (c: THREE.ColorRepresentation, opacity = 0) =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(c),
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

    this.#aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.17, 32),
      unlit(0xffffff),
    );
    this.#aimRing.renderOrder = 20;
    this.#aimAxis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 3, 6, 1, true),
      unlit(0xffffff),
    );
    this.#aimAxis.renderOrder = 19;
    this.#hintRing = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.24, 32),
      unlit(0xffffff),
    );
    this.#hintRing.renderOrder = 18;
    this.#hintLabel = new THREE.Sprite(
      new THREE.SpriteMaterial({
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.#hintLabel.renderOrder = 21;
    this.#hintLabel.scale.setScalar(0.5);
    this.#ownAxis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 3.2, 6, 1, true),
      unlit(0xffffff),
    );
    this.#ownAxis.renderOrder = 17;
    this.#turnAxis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 3.4, 6, 1, true),
      unlit(0xffffff),
    );
    this.#turnAxis.renderOrder = 16;
    this.body.add(this.#aimRing, this.#aimAxis, this.#hintRing);
    this.frame.add(
      this.body,
      this.#socket,
      this.#ownAxis,
      this.#turnAxis,
      this.#hintLabel,
    );
    this.frame.scale.setScalar(enemy.radius);

    // On the floor: a soft shadow to say where it stands, and a ring that turns gold at `e`.
    this.#shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({
        map: shadowTexture(),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    this.#shadow.rotation.x = -Math.PI / 2;
    this.#ground = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 48),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    this.#ground.rotation.x = -Math.PI / 2;

    const q = enemy.species.elements[enemy.state];
    this.body.quaternion.set(q[0], q[1], q[2], q[3]);
    this.#to.copy(this.body.quaternion);
    this.#home = enemy.state === 0 ? 1 : 0;
  }

  /** The things that sit on the floor rather than in the frame. */
  get floor(): THREE.Object3D[] {
    return [this.#shadow, this.#ground];
  }

  /** Where the pointer is on this enemy, or `null` when it is elsewhere. */
  setAim(aim: { spot: number; reachable: boolean } | null): void {
    this.#aim = aim;
    if (aim === null) return;
    const spot = this.enemy.species.spots[aim.spot];
    const d = new THREE.Vector3(...spot.dir);
    const p = new THREE.Vector3(...spot.point);
    this.#aimRing.position.copy(p).addScaledVector(d, 0.03);
    this.#aimRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    this.#aimAxis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const c = aim.reachable ? 0xffffff : DANGER;
    this.#aimRing.material.color.set(c);
    this.#aimAxis.material.color.set(c);
  }

  /** What the hints show on this enemy: a shot to make, or the axis it is turned about. */
  setHint(hint: Answer | null, axis: Vec3 | null): void {
    this.#hint = hint;
    this.#axis = axis;
    if (hint !== null) {
      const spot = this.enemy.species.spots[hint.spot];
      const d = new THREE.Vector3(...spot.dir);
      const p = new THREE.Vector3(...spot.point);
      this.#hintRing.position.copy(p).addScaledVector(d, 0.02);
      this.#hintRing.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        d,
      );
      this.#hintRing.material.color.set(SHOT_COLORS[hint.spin]);
      // The label floats above the spot rather than on it, so it never covers the `e`. It lives
      // in the frame, placed for the pose the enemy has landed in: it only shows once settled.
      const q = this.enemy.species.elements[this.enemy.state];
      this.#hintLabel.position.copy(p).addScaledVector(d, 0.25)
        .applyQuaternion(new THREE.Quaternion(q[0], q[1], q[2], q[3]))
        .add(new THREE.Vector3(0, 0.55, 0));
      const key = `${hint.spin}${hint.times}`;
      if (key !== this.#hintKey) {
        this.#hintKey = key;
        this.#hintLabel.material.map = label(
          SHOT_GLYPHS[hint.spin] + (hint.times > 1 ? `×${hint.times}` : ""),
          SHOT_COLORS[hint.spin],
        );
        this.#hintLabel.material.needsUpdate = true;
        this.#hintLabel.scale.set(hint.times > 1 ? 0.78 : 0.5, 0.5, 1);
      }
    }
    if (axis !== null) {
      this.#ownAxis.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(...axis),
      );
    }
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
    // The turn, seen from outside: `to · from⁻¹`, and its axis is lit.
    const rel = this.#to.clone().multiply(this.#from.clone().invert());
    if (rel.w < 0) rel.set(-rel.x, -rel.y, -rel.z, -rel.w);
    const s = Math.sqrt(Math.max(0, 1 - rel.w * rel.w));
    const axis = new THREE.Vector3(rel.x, rel.y, rel.z).divideScalar(s || 1);
    this.#turnAxis.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      axis,
    );
    this.#turnAxis.material.color.set(color);
    this.#spin = 0;
    this.#pop = 1;
    this.#hit = 1;
  }

  /**
   * Moves the drawing on a frame.
   *
   * @param dt Seconds of game time
   * @param turret Where the turret is — the frame turns to face it across the floor
   * @param time The clock, for the pulses
   */
  update(dt: number, turret: THREE.Vector3, time: number): void {
    const [x, y, z] = this.enemy.pos;
    const r = this.enemy.radius;
    this.frame.position.set(x, y, z);
    this.frame.lookAt(turret.x, y, turret.z);
    this.#shadow.position.set(x, 0.02, z);
    this.#shadow.scale.setScalar(r * 1.1);
    this.#ground.position.set(x, 0.03, z);
    this.#ground.scale.setScalar(r * 1.05);

    this.#born = Math.min(1, this.#born + dt * 1.6);
    const grow = easeOutBack(this.#born);

    if (this.#spin < 1) {
      this.#spin = Math.min(1, this.#spin + dt / 0.3);
      this.body.quaternion.slerpQuaternions(
        this.#from,
        this.#to,
        easeOutBack(this.#spin, 1.2),
      );
    } else {
      this.body.quaternion.copy(this.#to);
    }
    const settled = this.#spin >= 1;

    const athome = this.enemy.state === 0 && settled;
    this.#home += ((athome ? 1 : 0) - this.#home) * Math.min(1, dt * 8);
    this.#pop = Math.max(0, this.#pop - dt * 5);
    this.#hit = Math.max(0, this.#hit - dt * 4);

    const beat = athome ? Math.pow(0.5 + 0.5 * Math.sin(time * 7), 3) : 0;
    const pop = 1 + this.#pop * 0.15;
    this.body.scale.setScalar(grow * pop);

    this.#faceMat.emissiveIntensity = this.#hit * 0.35;
    this.#eMat.emissiveIntensity = this.#home * (0.15 + beat * 0.2);
    this.#edgeMat.color.set(0x120c1c).lerp(new THREE.Color(GOLD), this.#home);
    this.#socketMat.opacity = 0.85 * (1 - this.#home);
    this.#ground.material.color.set(SPECIES_COLORS[this.enemy.species.id])
      .lerp(new THREE.Color(GOLD), this.#home);
    this.#ground.material.opacity = 0.35 + this.#home * (0.3 + beat * 0.3);

    // The turn's axis, fading as it lands.
    this.#turnAxis.material.opacity = settled ? 0 : (1 - this.#spin) * 0.9;

    // The pointer's spot and its axis. Hidden mid-turn: the spot is moving with the body.
    const aimOn = this.#aim !== null && settled ? 1 : 0;
    this.#aimRing.material.opacity = aimOn * 0.95;
    this.#aimAxis.material.opacity = aimOn * 0.55;
    const ringPulse = 1 + Math.sin(time * 10) * 0.12;
    this.#aimRing.scale.setScalar(ringPulse);

    const hintOn = this.#hint !== null && settled && !athome ? 1 : 0;
    this.#hintRing.material.opacity = hintOn *
      (0.65 + 0.35 * Math.sin(time * 6));
    this.#hintRing.scale.setScalar(1 + 0.25 * (0.5 + 0.5 * Math.sin(time * 6)));
    this.#hintLabel.material.opacity = hintOn;

    this.#ownAxis.material.opacity = this.#axis !== null && settled ? 0.7 : 0;
  }

  dispose(): void {
    this.#faceMat.dispose();
    this.#eMat.dispose();
    this.#edgeMat.dispose();
    this.#socketMat.dispose();
    for (
      const m of [
        this.#aimRing,
        this.#aimAxis,
        this.#hintRing,
        this.#ownAxis,
        this.#turnAxis,
      ]
    ) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.#hintLabel.material.dispose();
    this.#shadow.geometry.dispose();
    this.#shadow.material.dispose();
    this.#ground.geometry.dispose();
    this.#ground.material.dispose();
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
 * The faces are one mesh with a colour per face; the `e` face is its own mesh with the glyph, its
 * texture coordinates laid flat across it in the home pose so the `e` reads upright exactly when
 * the enemy is at `e`.
 */
function kit(species: Species): Kit {
  const cached = kits.get(species.id);
  if (cached) return cached;

  const { vertices, faces, kind } = species.solid;
  const colors = faces.map((_, i) =>
    i === 0
      ? E_FACE
      : kind === "plate" && i === 1
      ? "#3a2a4a"
      : FACE_COLORS[(i - 1 + species.order) % FACE_COLORS.length]
  );

  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  faces.forEach((face, fi) => {
    if (fi === 0) return;
    c.set(colors[fi]);
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

  // The `e` face, textured.
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
  ) * 1.25;
  const ePos: number[] = [];
  const eUv: number[] = [];
  const push = (v: readonly number[]) => {
    ePos.push(v[0], v[1], v[2]);
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
  eGeo.computeVertexNormals();

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

  // The socket: the `e` face's outline, a little larger and a little proud of it, dashed. Every
  // pose of the solid has a face in that plane, so nothing of the body ever pokes through it.
  const socket = dashedOutline(
    front.map((i) => {
      const v = vertices[i];
      return new THREE.Vector3(
        centre[0] + (v[0] - centre[0]) * 1.12,
        centre[1] + (v[1] - centre[1]) * 1.12,
        centre[2] + (v[2] - centre[2]) * 1.12,
      ).addScaledVector(new THREE.Vector3(...n), 0.04);
    }),
    new THREE.Vector3(...n),
    0.045,
  );

  const made: Kit = {
    faces: faceGeo,
    eFace: eGeo,
    edges: edgeGeo,
    socket,
    colors,
  };
  kits.set(species.id, made);
  return made;
}

/** A closed polygon drawn as flat dashes of a given width, lying in the plane with normal `n`. */
function dashedOutline(
  points: THREE.Vector3[],
  n: THREE.Vector3,
  width: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const dash = 0.13;
  const gap = 0.08;
  const quad = (a: THREE.Vector3, b: THREE.Vector3) => {
    const dir = b.clone().sub(a).normalize();
    const side = n.clone().cross(dir).multiplyScalar(width / 2);
    const p = [
      a.clone().sub(side),
      a.clone().add(side),
      b.clone().add(side),
      b.clone().sub(side),
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) pos.push(p[i].x, p[i].y, p[i].z);
  };
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const len = a.distanceTo(b);
    // Dashes centred on the edge, so every corner gets the same look.
    const count = Math.max(1, Math.round((len + gap) / (dash + gap)));
    const step = len / count;
    for (let k = 0; k < count; k++) {
      const t0 = (k * step + gap / 2) / len;
      const t1 = ((k + 1) * step - gap / 2) / len;
      quad(a.clone().lerp(b, t0), a.clone().lerp(b, t1));
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/** The `e` face's picture: an ink `e` on white, with a bar under it so which way is up is plain. */
function eGlyph(): THREE.Texture {
  if (eTexture) return eTexture;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = E_FACE;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = E_INK;
  ctx.font = `900 ${size * 0.66}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("e", size / 2, size * 0.45);
  ctx.fillRect(size * 0.28, size * 0.78, size * 0.44, size * 0.07);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  eTexture = texture;
  return texture;
}

/** A round badge with a glyph on it, for the hint. */
function label(text: string, color: string): THREE.Texture {
  const key = `${text}|${color}`;
  const cached = labels.get(key);
  if (cached) return cached;
  const h = 128;
  const w = text.length > 1 ? 200 : 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(10, 6, 20, 0.85)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, (h - 12) / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `900 ${h * 0.6}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h * 0.54);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  labels.set(key, texture);
  return texture;
}

let shadowTex: THREE.Texture | null = null;

/** A soft dark disc. */
function shadowTexture(): THREE.Texture {
  if (shadowTex) return shadowTex;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(0,0,0,0.9)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  shadowTex = new THREE.CanvasTexture(canvas);
  return shadowTex;
}
