/**
 * The fireworks: everything that flies, flashes and fades and then is gone.
 *
 * Sparks, shards of a broken solid, shockwave rings, tracer lines, the e砲's beam, and the words
 * that pop up where something happened. None of it touches the rules; the engine calls in here
 * with a place and a colour when an event lands, and everything here is pooled — built once and
 * reused — so a chain of explosions allocates nothing mid-fight.
 *
 * Every effect lives for a fixed time and eases out, so the screen always settles back to calm
 * between the big moments. That is what keeps the big moments big.
 */

import * as THREE from "three";

const MAX_SPARKS = 4000;
const MAX_SHARDS = 700;

interface Timed {
  life: number;
  age: number;
}

interface Ring extends Timed {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  from: number;
  to: number;
}

interface Beam extends Timed {
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  width: number;
  opacity: number;
}

interface Flash extends Timed {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  size: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

export class Fx {
  #scene: THREE.Scene;
  #camera: THREE.Camera;
  #overlay: HTMLElement;

  // Sparks: one Points, CPU-simulated.
  #sparkGeo = new THREE.BufferGeometry();
  #sparkPos = new Float32Array(MAX_SPARKS * 3);
  #sparkCol = new Float32Array(MAX_SPARKS * 3);
  #sparkSize = new Float32Array(MAX_SPARKS);
  #sparkAlpha = new Float32Array(MAX_SPARKS);
  #sparkVel = new Float32Array(MAX_SPARKS * 3);
  #sparkLife = new Float32Array(MAX_SPARKS);
  #sparkAge = new Float32Array(MAX_SPARKS);
  #sparkBase = new Float32Array(MAX_SPARKS);
  #sparkDrag = new Float32Array(MAX_SPARKS);
  #sparkGrav = new Float32Array(MAX_SPARKS);
  #sparkNext = 0;
  #sparkMaterial: THREE.ShaderMaterial;

  // Shards: one InstancedMesh.
  #shards: THREE.InstancedMesh;
  #shardPos = new Float32Array(MAX_SHARDS * 3);
  #shardVel = new Float32Array(MAX_SHARDS * 3);
  #shardAxis = new Float32Array(MAX_SHARDS * 3);
  #shardSpin = new Float32Array(MAX_SHARDS);
  #shardAngle = new Float32Array(MAX_SHARDS);
  #shardSize = new Float32Array(MAX_SHARDS);
  #shardLife = new Float32Array(MAX_SHARDS);
  #shardAge = new Float32Array(MAX_SHARDS);
  #shardNext = 0;

  #rings: Ring[] = [];
  #beams: Beam[] = [];
  #flashes: Flash[] = [];

  constructor(scene: THREE.Scene, camera: THREE.Camera, overlay: HTMLElement) {
    this.#scene = scene;
    this.#camera = camera;
    this.#overlay = overlay;

    const g = this.#sparkGeo;
    g.setAttribute("position", new THREE.BufferAttribute(this.#sparkPos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.#sparkCol, 3));
    g.setAttribute("size", new THREE.BufferAttribute(this.#sparkSize, 1));
    g.setAttribute("alpha", new THREE.BufferAttribute(this.#sparkAlpha, 1));
    this.#sparkMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */ `
          attribute float size;
          attribute float alpha;
          attribute vec3 color;
          varying vec3 vColor;
          varying float vAlpha;
          uniform float uScale;
          void main() {
            vColor = color;
            vAlpha = alpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * uScale / max(0.1, -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
      fragmentShader: /* glsl */ `
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vColor * (a * a * 2.5), a * vAlpha);
          }`,
    });
    const sparks = new THREE.Points(g, this.#sparkMaterial);
    sparks.frustumCulled = false;
    scene.add(sparks);

    const shardGeo = new THREE.TetrahedronGeometry(1, 0);
    shardGeo.scale(1, 0.35, 0.6);
    this.#shards = new THREE.InstancedMesh(
      shardGeo,
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      MAX_SHARDS,
    );
    this.#shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#shards.frustumCulled = false;
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.#shards.setMatrixAt(i, tmpM.makeScale(0, 0, 0));
      this.#shards.setColorAt(i, tmpC.set(0xffffff));
    }
    scene.add(this.#shards);
  }

  /** Tells the sparks how many pixels a unit is, so they are the same size on every screen. */
  resize(height: number, fov: number): void {
    this.#sparkMaterial.uniforms.uScale.value = height /
      (2 * Math.tan((fov * Math.PI) / 360));
  }

  /**
   * A spray of sparks.
   *
   * @param at Where from
   * @param color What colour
   * @param count How many
   * @param o Speed, size, life, and an optional direction to spray along
   */
  burst(
    at: THREE.Vector3,
    color: THREE.ColorRepresentation,
    count: number,
    o: {
      speed?: number;
      size?: number;
      life?: number;
      dir?: THREE.Vector3;
      spread?: number;
      gravity?: number;
      drag?: number;
    } = {},
  ): void {
    const c = tmpC.set(color);
    const speed = o.speed ?? 8;
    for (let n = 0; n < count; n++) {
      const i = this.#sparkNext;
      this.#sparkNext = (i + 1) % MAX_SPARKS;
      let vx: number, vy: number, vz: number;
      // A random direction, bent towards `dir` when there is one.
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      vx = Math.cos(a) * s;
      vy = u;
      vz = Math.sin(a) * s;
      if (o.dir) {
        const k = o.spread ?? 0.35;
        vx = o.dir.x + vx * k;
        vy = o.dir.y + vy * k;
        vz = o.dir.z + vz * k;
        const l = Math.hypot(vx, vy, vz) || 1;
        vx /= l;
        vy /= l;
        vz /= l;
      }
      const v = speed * (0.35 + Math.random() * 0.65);
      this.#sparkPos.set([at.x, at.y, at.z], i * 3);
      this.#sparkVel.set([vx * v, vy * v, vz * v], i * 3);
      const tint = 0.75 + Math.random() * 0.5;
      this.#sparkCol.set([c.r * tint, c.g * tint, c.b * tint], i * 3);
      this.#sparkBase[i] = (o.size ?? 0.18) * (0.5 + Math.random());
      this.#sparkLife[i] = (o.life ?? 0.7) * (0.6 + Math.random() * 0.6);
      this.#sparkAge[i] = 0;
      this.#sparkDrag[i] = o.drag ?? 2.2;
      this.#sparkGrav[i] = o.gravity ?? 4;
    }
  }

  /**
   * A solid breaking: its pieces fly off spinning, in its own colours.
   *
   * @param at The centre
   * @param colors The colours of its faces
   * @param count How many pieces
   * @param size How big each is
   * @param speed How fast they go
   */
  shatter(
    at: THREE.Vector3,
    colors: readonly string[],
    count: number,
    size: number,
    speed: number,
  ): void {
    for (let n = 0; n < count; n++) {
      const i = this.#shardNext;
      this.#shardNext = (i + 1) % MAX_SHARDS;
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.4 + Math.random() * 0.8);
      this.#shardPos.set(
        [
          at.x + Math.cos(a) * s * size,
          at.y + u * size,
          at.z + Math.sin(a) * s * size,
        ],
        i * 3,
      );
      this.#shardVel.set([
        Math.cos(a) * s * v,
        u * v + speed * 0.3,
        Math.sin(a) * s * v,
      ], i * 3);
      tmpV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize();
      this.#shardAxis.set([tmpV.x, tmpV.y, tmpV.z], i * 3);
      this.#shardSpin[i] = (Math.random() - 0.5) * 22;
      this.#shardAngle[i] = Math.random() * 6;
      this.#shardSize[i] = size * (0.12 + Math.random() * 0.22);
      this.#shardLife[i] = 1.1 + Math.random() * 0.9;
      this.#shardAge[i] = 0;
      this.#shards.setColorAt(
        i,
        tmpC.set(colors[n % colors.length]).multiplyScalar(1.6),
      );
    }
    if (this.#shards.instanceColor) {
      this.#shards.instanceColor.needsUpdate = true;
    }
  }

  /**
   * A ring of light that grows and fades, facing the player.
   *
   * @param at Where
   * @param color Colour
   * @param from Starting radius
   * @param to Final radius
   * @param life Seconds
   */
  ring(
    at: THREE.Vector3,
    color: THREE.ColorRepresentation,
    from: number,
    to: number,
    life = 0.5,
  ): void {
    let ring = this.#rings.find((r) => r.age >= r.life);
    if (!ring) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.86, 1, 64),
        new THREE.MeshBasicMaterial({
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      this.#scene.add(mesh);
      ring = { mesh, from, to, life, age: 0 };
      this.#rings.push(ring);
    }
    ring.mesh.visible = true;
    ring.mesh.position.copy(at);
    ring.mesh.material.color.set(color).multiplyScalar(2);
    Object.assign(ring, { from, to, life, age: 0 });
  }

  /**
   * A straight line of light between two points — a tracer, or the e砲.
   *
   * @param from Start
   * @param to End
   * @param color Colour
   * @param width Radius
   * @param life Seconds
   */
  beam(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color: THREE.ColorRepresentation,
    width: number,
    life: number,
    opacity = 1,
  ): void {
    let beam = this.#beams.find((b) => b.age >= b.life);
    if (!beam) {
      // Thin where it leaves the gun and full width at the far end, so a beam fired from the
      // corner of the screen reads as going away rather than filling the view.
      const geo = new THREE.CylinderGeometry(1, 0.08, 1, 12, 1, true);
      geo.translate(0, 0.5, 0);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      mesh.frustumCulled = false;
      this.#scene.add(mesh);
      beam = { mesh, width, life, age: 0, opacity };
      this.#beams.push(beam);
    }
    const dir = tmpV.subVectors(to, from);
    const len = dir.length();
    beam.mesh.visible = true;
    beam.mesh.position.copy(from);
    beam.mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    beam.mesh.scale.set(width, len, width);
    beam.mesh.material.color.set(color).multiplyScalar(2.2);
    Object.assign(beam, { width, life, age: 0, opacity });
  }

  /**
   * A ball of light that swells and fades.
   *
   * @param at Where
   * @param color Colour
   * @param size Final radius
   * @param life Seconds
   */
  flash(
    at: THREE.Vector3,
    color: THREE.ColorRepresentation,
    size: number,
    life = 0.3,
  ): void {
    let flash = this.#flashes.find((f) => f.age >= f.life);
    if (!flash) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 12),
        new THREE.MeshBasicMaterial({
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      this.#scene.add(mesh);
      flash = { mesh, size, life, age: 0 };
      this.#flashes.push(flash);
    }
    flash.mesh.visible = true;
    flash.mesh.position.copy(at);
    flash.mesh.material.color.set(color).multiplyScalar(3);
    Object.assign(flash, { size, life, age: 0 });
  }

  /**
   * Words that pop up where something happened, then float away.
   *
   * @param at Where in the world
   * @param text What to say
   * @param color Colour
   * @param size `sm`, `md`, `lg` or `xl`
   */
  popup(
    at: THREE.Vector3,
    text: string,
    color: string,
    size: "sm" | "md" | "lg" | "xl" = "md",
  ): void {
    const p = tmpV.copy(at).project(this.#camera);
    if (p.z > 1) return;
    const el = document.createElement("div");
    el.className = `gs-pop gs-pop-${size}`;
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
    el.style.setProperty("--tilt", `${(Math.random() - 0.5) * 14}deg`);
    this.#overlay.append(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }

  /**
   * Moves everything on.
   *
   * @param dt Seconds, in game time — a hit-stop freezes the fireworks with everything else
   */
  update(dt: number): void {
    // Sparks.
    for (let i = 0; i < MAX_SPARKS; i++) {
      const life = this.#sparkLife[i];
      if (life <= 0) continue;
      const age = (this.#sparkAge[i] += dt);
      if (age >= life) {
        this.#sparkLife[i] = 0;
        this.#sparkAlpha[i] = 0;
        this.#sparkSize[i] = 0;
        continue;
      }
      const j = i * 3;
      const drag = Math.exp(-this.#sparkDrag[i] * dt);
      this.#sparkVel[j] *= drag;
      this.#sparkVel[j + 1] = this.#sparkVel[j + 1] * drag -
        this.#sparkGrav[i] * dt;
      this.#sparkVel[j + 2] *= drag;
      this.#sparkPos[j] += this.#sparkVel[j] * dt;
      this.#sparkPos[j + 1] += this.#sparkVel[j + 1] * dt;
      this.#sparkPos[j + 2] += this.#sparkVel[j + 2] * dt;
      const t = age / life;
      this.#sparkAlpha[i] = 1 - t * t;
      this.#sparkSize[i] = this.#sparkBase[i] * (1 - t * 0.6);
    }
    const g = this.#sparkGeo;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;

    // Shards.
    for (let i = 0; i < MAX_SHARDS; i++) {
      const life = this.#shardLife[i];
      if (life <= 0) continue;
      const age = (this.#shardAge[i] += dt);
      if (age >= life) {
        this.#shardLife[i] = 0;
        this.#shards.setMatrixAt(i, tmpM.makeScale(0, 0, 0));
        continue;
      }
      const j = i * 3;
      const drag = Math.exp(-1.2 * dt);
      this.#shardVel[j] *= drag;
      this.#shardVel[j + 1] = this.#shardVel[j + 1] * drag - 9 * dt;
      this.#shardVel[j + 2] *= drag;
      this.#shardPos[j] += this.#shardVel[j] * dt;
      this.#shardPos[j + 1] += this.#shardVel[j + 1] * dt;
      this.#shardPos[j + 2] += this.#shardVel[j + 2] * dt;
      this.#shardAngle[i] += this.#shardSpin[i] * dt;
      const t = age / life;
      const k = this.#shardSize[i] * (1 - t * t);
      tmpQ.setFromAxisAngle(
        tmpV.set(
          this.#shardAxis[j],
          this.#shardAxis[j + 1],
          this.#shardAxis[j + 2],
        ),
        this.#shardAngle[i],
      );
      tmpM.compose(
        tmpV.set(
          this.#shardPos[j],
          this.#shardPos[j + 1],
          this.#shardPos[j + 2],
        ),
        tmpQ,
        tmpS.set(k, k, k),
      );
      this.#shards.setMatrixAt(i, tmpM);
    }
    this.#shards.instanceMatrix.needsUpdate = true;

    for (const ring of this.#rings) {
      if (ring.age >= ring.life) continue;
      ring.age += dt;
      const t = Math.min(1, ring.age / ring.life);
      const e = 1 - Math.pow(1 - t, 3);
      const r = ring.from + (ring.to - ring.from) * e;
      ring.mesh.scale.setScalar(r);
      ring.mesh.quaternion.copy(this.#camera.quaternion);
      ring.mesh.material.opacity = 1 - t;
      if (t >= 1) ring.mesh.visible = false;
    }
    for (const beam of this.#beams) {
      if (beam.age >= beam.life) continue;
      beam.age += dt;
      const t = Math.min(1, beam.age / beam.life);
      beam.mesh.material.opacity = beam.opacity * (1 - t) * (1 - t);
      const w = beam.width * (1 + t * 0.6);
      beam.mesh.scale.x = w;
      beam.mesh.scale.z = w;
      if (t >= 1) beam.mesh.visible = false;
    }
    for (const flash of this.#flashes) {
      if (flash.age >= flash.life) continue;
      flash.age += dt;
      const t = Math.min(1, flash.age / flash.life);
      flash.mesh.scale.setScalar(
        flash.size * (0.3 + 0.7 * (1 - Math.pow(1 - t, 3))),
      );
      flash.mesh.material.opacity = (1 - t) * (1 - t);
      if (t >= 1) flash.mesh.visible = false;
    }
  }

  /** The popups' stylesheet, added once. */
  static styles(): void {
    if (document.getElementById("gs-fx-style")) return;
    const style = document.createElement("style");
    style.id = "gs-fx-style";
    style.textContent = `
      .gs-pop {
        position: absolute; pointer-events: none; white-space: nowrap;
        font-weight: 900; letter-spacing: 0.04em;
        text-shadow: 0 0 8px currentColor, 0 0 22px currentColor, 0 2px 0 #000;
        transform: translate(-50%, -50%);
        animation: gs-pop 1.1s cubic-bezier(.2,1.6,.4,1) forwards;
        font-family: "Hiragino Maru Gothic ProN", "BIZ UDPGothic", system-ui, sans-serif;
      }
      .gs-pop-sm { font-size: 14px; }
      .gs-pop-md { font-size: 22px; }
      .gs-pop-lg { font-size: 38px; }
      .gs-pop-xl { font-size: 64px; animation-duration: 1.5s; }
      @keyframes gs-pop {
        0%   { opacity: 0; transform: translate(-50%, -50%) scale(.2) rotate(var(--tilt)); }
        18%  { opacity: 1; transform: translate(-50%, -70%) scale(1.25) rotate(var(--tilt)); }
        35%  { transform: translate(-50%, -80%) scale(1) rotate(var(--tilt)); }
        100% { opacity: 0; transform: translate(-50%, -190%) scale(.9) rotate(var(--tilt)); }
      }
      @media (prefers-reduced-motion: reduce) {
        .gs-pop { animation-duration: .8s; }
      }
    `;
    document.head.append(style);
  }
}
