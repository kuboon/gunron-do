/**
 * The screen: three.js, the player's aim, and every bit of juice.
 *
 * Loaded by the arena island only once it is in a browser, so neither the server nor the first
 * paint carries three.js. From then on it runs the frame: it turns the pointer into an aim, the
 * aim into "this shot at that enemy", hands that to the rules in `game.ts`, and draws whatever the
 * rules say happened — as loudly as it can.
 *
 * The juice is layered per event and scaled to how much the event matters (see the `game-feel`
 * notes in the README): a round landing is a spark, a pop and a tick of shake; the `e` face coming
 * home is a chime and a halo; an e砲 kill is a hit-stop, a shockwave, a white flash, a shower of
 * shards, a punch of the field of view and a burst of chromatic aberration, all inside a tenth of
 * a second and all gone again within one. Shake moves the camera's drawing and never its aim.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import { EnemyView, faceColors } from "./enemy-view.ts";
import { Fx } from "./fx.ts";
import { type Enemy, EYE, game, type GameEvent, type Orb } from "./game.ts";
import type { Shot } from "./groups.ts";
import { DANGER, GOLD, NIGHT, SHOT_COLORS, SPECIES_COLORS } from "./palette.ts";
import { sound } from "./sound.ts";
import { buildStage } from "./stage.ts";

const BASE_FOV = 74;
const MOUSE_SENSITIVITY = 0.0022;
const TOUCH_SENSITIVITY = 0.0055;

/**
 * Starts the game screen in a box.
 *
 * @param host The box. The canvas and the overlay go in it; it should be positioned.
 * @returns A function that stops everything and takes it all out again
 */
export function start(host: HTMLElement): () => void {
  Fx.styles();
  engineStyles();
  const coarse = matchMedia("(pointer: coarse)").matches;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- renderer ---------------------------------------------------------------------------------

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.domElement.className = "gs-canvas";
  host.append(renderer.domElement);

  const overlay = document.createElement("div");
  overlay.className = "gs-overlay";
  host.append(overlay);
  const brackets = document.createElement("div");
  brackets.className = "gs-brackets";
  overlay.append(brackets);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.FogExp2(0x12052a, 0.011);

  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 1200);
  camera.position.set(...EYE);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0x9b8cff, 0x2a0830, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(0.3, 1, 0.6);
  camera.add(key);
  const rim = new THREE.DirectionalLight(0xff4fd8, 1.2);
  rim.position.set(-1, 0.4, -1);
  scene.add(rim);

  const stage = buildStage(scene);
  const fx = new Fx(scene, camera, overlay);
  const glow = glowTexture();
  const gun = buildGun(camera, glow);

  // --- post ------------------------------------------------------------------------------------

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(256, 256),
    0.85,
    0.5,
    0.6,
  );
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uAberration: { value: 0 },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
      uDamage: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uAberration;
      uniform float uFlash;
      uniform vec3 uFlashColor;
      uniform float uDamage;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 d = vUv - 0.5;
        float r = length(d);
        vec2 off = d * (0.004 + uAberration) * (0.4 + r);
        vec3 col;
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - off).b;
        col *= 1.0 - smoothstep(0.42, 0.95, r) * 0.6;
        col = mix(col, vec3(1.4, 0.02, 0.08), uDamage * smoothstep(0.2, 0.85, r));
        col += uFlashColor * uFlash;
        col *= 0.97 + 0.03 * sin(vUv.y * 1100.0 + uTime * 30.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // --- state ------------------------------------------------------------------------------------

  const views = new Map<number, EnemyView>();
  let yaw = 0;
  let pitch = 0.04;
  let trauma = 0;
  let fovKick = 0;
  let aberration = 0;
  let flash = 0;
  let damage = 0;
  let pulse = 1;
  let hitStop = 0;
  let slowmo = 1;
  let clock = 0;
  let shakeT = 0;
  let lookAt: { yaw: number; pitch: number } | null = null;
  let running = true;
  let last = performance.now();
  const eye = new THREE.Vector3(...EYE);
  const forward = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const baseQuat = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");

  const addTrauma = (t: number) => {
    trauma = Math.min(1, trauma + t * (reduced ? 0.35 : 1));
  };

  // --- sizing -----------------------------------------------------------------------------------

  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    // A tall phone gets a wider view, so the field is not a letterbox slot.
    camera.fov = BASE_FOV + (w < h ? 14 : 0);
    camera.updateProjectionMatrix();
    fx.resize(h * renderer.getPixelRatio(), camera.fov);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // --- input -------------------------------------------------------------------------------------

  const locked = () => document.pointerLockElement === host;

  const onMouseMove = (e: MouseEvent) => {
    if (!locked()) return;
    turnBy(e.movementX * MOUSE_SENSITIVITY, e.movementY * MOUSE_SENSITIVITY);
  };
  const turnBy = (dx: number, dy: number) => {
    yaw -= dx;
    pitch = THREE.MathUtils.clamp(pitch - dy, -0.9, 1.1);
    lookAt = null;
  };
  const onMouseDown = (e: MouseEvent) => {
    if (!locked()) return;
    e.preventDefault();
    if (e.button === 0) game.command(game.selected);
    else if (e.button === 2) game.command("cannon");
  };
  const onWheel = (e: WheelEvent) => {
    if (!locked()) return;
    e.preventDefault();
    game.cycle(e.deltaY > 0 ? 1 : -1);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "m") {
      sound.toggle();
      game.notify();
      return;
    }
    if (game.phase !== "playing") return;
    const map: Record<string, Shot | "cannon"> = {
      q: "ccw",
      e: "cw",
      f: "flip",
      r: "flip",
      " ": "cannon",
    };
    const pick: Record<string, Shot> = { "1": "ccw", "2": "cw", "3": "flip" };
    if (k in map) {
      e.preventDefault();
      game.command(map[k]);
    } else if (k in pick) {
      game.select(pick[k]);
    }
  };
  const onContext = (e: Event) => e.preventDefault();
  const onLockChange = () => {
    if (!locked() && game.phase === "playing" && !coarse) game.pause();
  };

  // Touch, and a mouse that has not been captured: drag to look, tap an enemy to swing to it.
  let drag:
    | { id: number; x: number; y: number; t: number; moved: number }
    | null = null;
  const onPointerDown = (e: PointerEvent) => {
    if (locked()) return;
    if (e.pointerType === "mouse" && game.phase === "playing" && !coarse) {
      lockPointer(host);
      return;
    }
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      moved: 0,
    };
    host.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (drag === null || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    const k = TOUCH_SENSITIVITY * (camera.fov / BASE_FOV);
    turnBy(dx * k, dy * k);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (drag === null || e.pointerId !== drag.id) return;
    const tap = drag.moved < 10 && performance.now() - drag.t < 300;
    drag = null;
    if (tap) swingTo(e.clientX, e.clientY);
  };

  /** A tap near an enemy turns the view onto it. */
  const swingTo = (cx: number, cy: number) => {
    const rect = host.getBoundingClientRect();
    let best: Enemy | null = null;
    let bestD = 70;
    for (const enemy of game.enemies) {
      tmp.set(...enemy.pos).project(camera);
      if (tmp.z > 1) continue;
      const sx = rect.left + (tmp.x * 0.5 + 0.5) * rect.width;
      const sy = rect.top + (-tmp.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - cx, sy - cy);
      if (d < bestD) {
        bestD = d;
        best = enemy;
      }
    }
    if (best === null) return;
    tmp.set(...best.pos).sub(eye).normalize();
    lookAt = { yaw: Math.atan2(-tmp.x, -tmp.z), pitch: Math.asin(tmp.y) };
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerlockchange", onLockChange);
  host.addEventListener("wheel", onWheel, { passive: false });
  host.addEventListener("contextmenu", onContext);
  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointercancel", onPointerUp);
  const onVisibility = () => {
    if (document.hidden) game.pause();
  };
  document.addEventListener("visibilitychange", onVisibility);

  // --- aiming -------------------------------------------------------------------------------------

  /** How far off the crosshair an enemy is, less how big it looks. Negative is dead on. */
  const offAim = (enemy: Enemy, assist: number): number => {
    tmp.set(...enemy.pos).sub(eye);
    const dist = tmp.length();
    const angle = forward.angleTo(tmp);
    const size = Math.atan2(enemy.radius * 0.95, dist);
    return angle - size - assist;
  };

  /** The enemy under the crosshair, or the nearest to it within a forgiving cone. */
  const pickTarget = (): Enemy | null => {
    const assist = coarse ? 0.1 : 0.045;
    let best: Enemy | null = null;
    let bestD = 0;
    for (const enemy of game.enemies) {
      const d = offAim(enemy, assist);
      if (d < 0 && (best === null || d < bestD)) {
        best = enemy;
        bestD = d;
      }
    }
    return best;
  };

  /** Everything the e砲's beam passes through, nearest first. */
  const beamHits = (): Enemy[] =>
    game.enemies
      .filter((e) => offAim(e, coarse ? 0.1 : 0.06) < 0)
      .sort((a, b) => dist2(a.pos) - dist2(b.pos));

  /** The orb nearest the crosshair, within a cone generous enough to snap-shoot one. */
  const pickOrb = (assist = coarse ? 0.12 : 0.07): Orb | null => {
    let best: Orb | null = null;
    let bestD = 0;
    for (const orb of game.orbs) {
      tmp.set(...orb.pos).sub(eye);
      const d = forward.angleTo(tmp) - Math.atan2(0.7, tmp.length()) - assist;
      if (d < 0 && (best === null || d < bestD)) {
        best = orb;
        bestD = d;
      }
    }
    return best;
  };

  // The orbs: a hot red core in a spinning cage, each its own little mesh.
  const orbViews = new Map<number, THREE.Group>();
  const orbCore = new THREE.SphereGeometry(0.32, 16, 10);
  const orbCage = new THREE.IcosahedronGeometry(0.62, 0);
  const orbCoreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(DANGER).multiplyScalar(2.2),
    toneMapped: false,
  });
  const orbCageMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xff9a3d).multiplyScalar(1.8),
    wireframe: true,
    toneMapped: false,
  });

  // --- events ------------------------------------------------------------------------------------

  const muzzle = new THREE.Vector3();
  const removeOrb = (id: number) => {
    const view = orbViews.get(id);
    if (!view) return;
    scene.remove(view);
    for (const child of view.children) {
      if (child instanceof THREE.Sprite) child.material.dispose();
    }
    orbViews.delete(id);
  };

  const handle = (ev: GameEvent) => {
    switch (ev.type) {
      case "spawn": {
        const view = new EnemyView(ev.enemy, glow);
        views.set(ev.enemy.id, view);
        scene.add(view.frame);
        tmp.set(...ev.enemy.pos);
        fx.flash(
          tmp,
          SPECIES_COLORS[ev.enemy.species.id],
          ev.enemy.radius * 3,
          0.5,
        );
        fx.ring(
          tmp,
          SPECIES_COLORS[ev.enemy.species.id],
          0.5,
          ev.enemy.radius * 4,
          0.7,
        );
        if (ev.enemy.boss) {
          addTrauma(0.6);
          fx.ring(tmp, DANGER, 1, 30, 1.4);
        }
        break;
      }
      case "turn": {
        const view = views.get(ev.enemy.id);
        const color = SHOT_COLORS[ev.shot];
        tmp.set(...ev.enemy.pos);
        view?.turn(ev.from, ev.to, color);
        fx.burst(tmp, color, 28, { speed: 9, size: 0.22, life: 0.5 });
        fx.ring(tmp, color, ev.enemy.radius * 0.8, ev.enemy.radius * 2.2, 0.35);
        addTrauma(0.08);
        sound.hit();
        // Warmer or colder: every shot says how far home it is now.
        if (!ev.home) {
          const lift = tmp2.set(...ev.enemy.pos).add(
            tmp.set(ev.enemy.radius * 1.1, ev.enemy.radius * 0.8, 0),
          );
          fx.popup(
            lift.clone(),
            `あと ${ev.left} ${ev.gain > 0 ? "▼" : "▲"}`,
            ev.gain > 0 ? "#7dff9a" : DANGER,
            "md",
          );
        }
        if (ev.home) {
          setTimeout(() => {
            if (!ev.enemy.alive || ev.enemy.state !== 0) return;
            sound.home();
            tmp2.set(...ev.enemy.pos);
            fx.popup(
              tmp2.clone().add(tmp.set(0, ev.enemy.radius * 1.3, 0)),
              "e!",
              GOLD,
              "lg",
            );
            fx.ring(
              tmp2,
              GOLD,
              ev.enemy.radius * 1.2,
              ev.enemy.radius * 3.5,
              0.6,
            );
            fx.burst(tmp2, GOLD, 40, {
              speed: 6,
              size: 0.25,
              life: 0.8,
              gravity: -1,
            });
          }, 230);
        }
        break;
      }
      case "miss":
        if (ev.shot === "cannon") sound.miss();
        break;
      case "orb": {
        const view = new THREE.Group();
        view.add(
          new THREE.Mesh(orbCore, orbCoreMat),
          new THREE.Mesh(orbCage, orbCageMat),
        );
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glow,
            color: new THREE.Color(DANGER),
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        halo.scale.setScalar(2.2);
        view.add(halo);
        view.position.set(...ev.orb.pos);
        orbViews.set(ev.orb.id, view);
        scene.add(view);
        tmp.set(...ev.orb.pos);
        fx.flash(tmp, DANGER, 1.2, 0.25);
        fx.burst(tmp, 0xff9a3d, 14, { speed: 5, size: 0.18, life: 0.4 });
        sound.enemyShot();
        break;
      }
      case "pop": {
        tmp.set(...ev.orb.pos);
        fx.burst(tmp, 0xff9a3d, 50, { speed: 12, size: 0.22, life: 0.5 });
        fx.burst(tmp, 0xffffff, 16, { speed: 6, size: 0.16, life: 0.3 });
        fx.ring(tmp, DANGER, 0.3, 2.6, 0.3);
        fx.popup(tmp.clone(), `+${ev.points}`, "#ffb36b", "sm");
        addTrauma(0.1);
        sound.pop();
        removeOrb(ev.orb.id);
        break;
      }
      case "struck": {
        removeOrb(ev.orb.id);
        damage = 0.9;
        addTrauma(0.75);
        aberration = 0.03;
        flash = reduced ? 0.1 : 0.3;
        (grade.uniforms.uFlashColor.value as THREE.Color).set(DANGER);
        sound.breach();
        break;
      }
      case "cannon": {
        let big = false;
        ev.kills.forEach((kill, i) => {
          const e = kill.enemy;
          big ||= e.boss || e.species.order >= 24;
          tmp.set(...e.pos);
          const colors = faceColors(e.species);
          const scale = e.radius;
          fx.flash(tmp, 0xffffff, scale * 1.6, 0.25);
          fx.flash(tmp, GOLD, scale * 2.6, 0.5);
          fx.ring(
            tmp,
            GOLD,
            scale,
            scale * (e.boss ? 16 : 7),
            e.boss ? 1.2 : 0.7,
          );
          fx.ring(
            tmp,
            SPECIES_COLORS[e.species.id],
            scale * 0.5,
            scale * (e.boss ? 10 : 4.5),
            0.9,
          );
          fx.shatter(
            tmp,
            colors,
            e.boss ? 160 : 40 + e.species.order,
            scale,
            e.boss ? 16 : 11,
          );
          fx.burst(tmp, GOLD, e.boss ? 400 : 120, {
            speed: e.boss ? 30 : 18,
            size: 0.3,
            life: 1.1,
          });
          fx.burst(tmp, SPECIES_COLORS[e.species.id], 80, {
            speed: 12,
            size: 0.35,
            life: 1.4,
            gravity: 2,
          });
          const lift = tmp.clone().add(tmp2.set(0, scale * 1.2, 0));
          setTimeout(() => {
            fx.popup(
              lift,
              `+${kill.points.toLocaleString()}`,
              GOLD,
              e.boss ? "xl" : "lg",
            );
            if (kill.perfect) {
              fx.popup(
                lift.clone().add(tmp2.set(0, -scale * 1.4, 0)),
                "PERFECT 最短!",
                "#7dffea",
                "md",
              );
            }
          }, 60 + i * 90);
          const view = views.get(e.id);
          if (view) {
            scene.remove(view.frame);
            view.dispose();
            views.delete(e.id);
          }
        });
        if (ev.kills.length > 0) {
          hitStop = ev.kills.some((k) => k.enemy.boss)
            ? 0.28
            : big
            ? 0.12
            : 0.075;
          slowmo = ev.kills.length > 1 || big ? 0.25 : 0.55;
          addTrauma(big ? 0.9 : 0.55);
          fovKick = big ? 12 : 7;
          aberration = big ? 0.03 : 0.018;
          flash = reduced ? 0.1 : big ? 0.45 : 0.22;
          (grade.uniforms.uFlashColor.value as THREE.Color).set(0xfff1c0);
          pulse = 0;
          sound.explode(big);
          if (ev.kills.length > 1) {
            fx.popup(
              eye.clone().add(forward.clone().multiplyScalar(8)).add(
                tmp.set(0, 1.5, 0),
              ),
              `${ev.kills.length}連 e砲!!`,
              "#ff8af1",
              "xl",
            );
          }
          if (game.combo >= 2) {
            fx.popup(
              eye.clone().add(forward.clone().multiplyScalar(8)).add(
                tmp.set(0, -1.2, 0),
              ),
              `${game.combo} COMBO`,
              "#7df9ff",
              "lg",
            );
          }
        }
        for (const e of ev.bounced) {
          tmp.set(...e.pos);
          fx.burst(tmp, DANGER, 60, { speed: 14, size: 0.25, life: 0.6 });
          fx.ring(tmp, DANGER, e.radius, e.radius * 3, 0.4);
          fx.popup(
            tmp.clone().add(tmp2.set(0, e.radius * 1.3, 0)),
            "反発!  e じゃない",
            DANGER,
            "md",
          );
          sound.bounce();
          addTrauma(0.25);
        }
        break;
      }
      case "breach": {
        const view = views.get(ev.enemy.id);
        tmp.set(...ev.enemy.pos);
        fx.flash(tmp, DANGER, ev.enemy.radius * 4, 0.4);
        fx.burst(tmp, DANGER, 160, { speed: 16, size: 0.3, life: 0.9 });
        fx.shatter(tmp, faceColors(ev.enemy.species), 30, ev.enemy.radius, 9);
        if (view) {
          scene.remove(view.frame);
          view.dispose();
          views.delete(ev.enemy.id);
        }
        damage = 1;
        addTrauma(1);
        aberration = 0.04;
        fovKick = -6;
        sound.breach();
        break;
      }
      case "wave":
        sound.wave(ev.boss);
        pulse = 0;
        if (ev.boss) {
          addTrauma(0.5);
          flash = 0.3;
          (grade.uniforms.uFlashColor.value as THREE.Color).set(DANGER);
        }
        break;
      case "clear":
        sound.clear();
        pulse = 0;
        break;
      case "over":
        sound.over();
        addTrauma(0.8);
        damage = 1;
        if (locked()) document.exitPointerLock();
        break;
    }
  };

  // --- the frame -------------------------------------------------------------------------------------

  const frame = (now: number) => {
    if (!running) return;
    requestAnimationFrame(frame);
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;

    // A hit-stop freezes the world; the slow motion after a big kill eases back to full speed.
    let dt = real;
    if (hitStop > 0) {
      hitStop -= real;
      dt = real * 0.02;
    } else {
      dt = real * slowmo;
      slowmo += (1 - slowmo) * Math.min(1, real * 2.2);
    }
    if (game.phase !== "playing") dt = game.phase === "paused" ? 0 : real;
    clock += dt;

    // Aim first, so a shot fired this frame goes where the player sees the crosshair.
    if (lookAt !== null) {
      const dy = wrapAngle(lookAt.yaw - yaw);
      yaw += dy * Math.min(1, real * 12);
      pitch += (lookAt.pitch - pitch) * Math.min(1, real * 12);
      if (Math.abs(dy) < 0.002 && Math.abs(lookAt.pitch - pitch) < 0.002) {
        lookAt = null;
      }
    }
    euler.set(pitch, yaw, 0);
    baseQuat.setFromEuler(euler);
    forward.set(0, 0, -1).applyQuaternion(baseQuat);

    const target = game.phase === "playing" ? pickTarget() : null;
    // On a phone the aim leans gently onto whatever it is nearly on.
    if (coarse && target !== null && drag === null && lookAt === null) {
      tmp.set(...target.pos).sub(eye).normalize();
      const ty = Math.atan2(-tmp.x, -tmp.z);
      const tp = Math.asin(tmp.y);
      yaw += wrapAngle(ty - yaw) * Math.min(1, real * 3);
      pitch += (tp - pitch) * Math.min(1, real * 3);
    }
    game.aim(target);

    for (const cmd of game.takeCommands()) {
      gun.muzzle.getWorldPosition(muzzle);
      if (cmd === "cannon") {
        const hits = beamHits();
        const orbs = game.orbs.filter((o) => {
          tmp.set(...o.pos).sub(eye);
          return forward.angleTo(tmp) < Math.atan2(0.8, tmp.length()) + 0.06;
        });
        if (!game.cannon(hits, orbs)) continue;
        const end = hits.length > 0
          ? tmp.set(...hits[hits.length - 1].pos).add(
            forward.clone().multiplyScalar(40),
          )
          : tmp.copy(eye).add(forward.clone().multiplyScalar(120));
        fx.beam(muzzle, end, GOLD, 0.7, 0.45, 0.85);
        fx.beam(muzzle, end, 0xffffff, 0.22, 0.3, 1);
        fx.flash(muzzle, GOLD, 0.12, 0.2);
        fx.ring(
          muzzle.clone().add(forward.clone().multiplyScalar(1.5)),
          GOLD,
          0.2,
          2.2,
          0.35,
        );
        for (let i = 0; i < 12; i++) {
          fx.burst(tmp2.copy(muzzle).lerp(end, i / 12), GOLD, 8, {
            speed: 4,
            size: 0.2,
            life: 0.5,
            gravity: 0,
          });
        }
        gun.kick(GOLD, 1);
        addTrauma(0.35);
        fovKick = Math.max(fovKick, 5);
        aberration = Math.max(aberration, 0.012);
        sound.cannon();
      } else {
        // An orb in the sights takes the round: it is the thing about to hurt.
        const orb = pickOrb();
        const hit = orb === null ? pickTarget() : null;
        if (orb !== null ? !game.shootOrb(orb) : !game.fire(cmd, hit)) continue;
        const color = SHOT_COLORS[cmd];
        const end = orb !== null
          ? tmp.set(...orb.pos)
          : hit
          ? tmp.set(...hit.pos)
          : tmp.copy(eye).add(forward.clone().multiplyScalar(80));
        fx.beam(muzzle, end, color, 0.12, 0.14, 1);
        fx.flash(muzzle, color, 0.06, 0.1);
        fx.burst(muzzle, color, 6, {
          speed: 3,
          size: 0.06,
          life: 0.2,
          dir: forward,
          gravity: 0,
        });
        gun.kick(color, 0.35);
        addTrauma(0.04);
        sound.shot(cmd);
      }
    }

    game.update(dt);
    for (const ev of game.drain()) handle(ev);

    for (const orb of game.orbs) {
      const view = orbViews.get(orb.id);
      if (!view) continue;
      view.position.set(...orb.pos);
      view.rotation.set(clock * 3.1, clock * 4.3, 0);
    }
    if (orbViews.size !== game.orbs.length) {
      const live = new Set(game.orbs.map((o) => o.id));
      for (const id of [...orbViews.keys()]) if (!live.has(id)) removeOrb(id);
    }

    // A view whose enemy the rules no longer have — a new run started over the old one — goes
    // quietly. Kills and breaches take theirs out above, with their fireworks.
    if (views.size !== game.enemies.length) {
      const live = new Set(game.enemies.map((e) => e.id));
      for (const [id, view] of views) {
        if (live.has(id)) continue;
        scene.remove(view.frame);
        view.dispose();
        views.delete(id);
      }
    }
    for (const view of views.values()) view.update(dt, eye, clock);
    fx.update(dt);
    stage.update(clock, pulse);
    pulse = Math.min(1, pulse + real * 0.6);
    gun.update(real, game.selected, game.cannonCooldown <= 0, clock);

    // Shake: trauma squared, driven by smooth waves rather than noise, decaying on its own.
    trauma = Math.max(0, trauma - real * 1.5);
    shakeT += real * 28;
    const shake = trauma * trauma;
    euler.set(
      pitch + shake * 0.045 * Math.sin(shakeT * 1.3),
      yaw + shake * 0.055 * Math.sin(shakeT * 1.7 + 1),
      shake * 0.07 * Math.sin(shakeT * 0.9 + 2),
    );
    camera.quaternion.setFromEuler(euler);
    camera.position.set(
      EYE[0] + shake * 0.1 * Math.sin(shakeT * 2.1),
      EYE[1] + shake * 0.1 * Math.sin(shakeT * 2.7),
      EYE[2],
    );

    fovKick *= Math.exp(-real * 7);
    const fov = BASE_FOV + (camera.aspect < 1 ? 14 : 0) + fovKick;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    aberration *= Math.exp(-real * 5);
    flash *= Math.exp(-real * 7);
    damage *= Math.exp(-real * 2.2);
    grade.uniforms.uAberration.value = aberration;
    grade.uniforms.uFlash.value = flash;
    grade.uniforms.uDamage.value = damage;
    grade.uniforms.uTime.value = clock;

    drawOverlay(target);
    composer.render();
  };

  // The brackets round the target, and the arrows at the edges pointing at what is off screen.
  const arrows = new Map<number, HTMLElement>();
  const drawOverlay = (target: Enemy | null) => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (target !== null) {
      tmp.set(...target.pos).project(camera);
      const dist = tmp2.set(...target.pos).distanceTo(eye);
      const px =
        (target.radius / (dist * Math.tan((camera.fov * Math.PI) / 360))) *
        (h / 2) * 1.25;
      const size = Math.max(36, px * 2);
      brackets.style.display = "block";
      brackets.style.width = `${size}px`;
      brackets.style.height = `${size}px`;
      brackets.style.transform = `translate(${
        (tmp.x * 0.5 + 0.5) * w - size / 2
      }px, ${(-tmp.y * 0.5 + 0.5) * h - size / 2}px)`;
      brackets.style.color = target.state === 0
        ? GOLD
        : SPECIES_COLORS[target.species.id];
      brackets.classList.toggle("gs-home", target.state === 0);
    } else {
      brackets.style.display = "none";
    }

    const seen = new Set<number>();
    const marks = [
      ...game.enemies.map((enemy) => {
        const danger = 1 -
          Math.min(1, Math.hypot(enemy.pos[0], enemy.pos[2]) / 30);
        return {
          id: enemy.id,
          pos: enemy.pos,
          color: danger > 0.6 ? DANGER : SPECIES_COLORS[enemy.species.id],
          danger,
          blink: danger > 0.6,
        };
      }),
      // An orb from behind would be a hit the player never had a chance at, so every one gets
      // an arrow, red and blinking.
      ...game.orbs.map((orb) => ({
        id: orb.id,
        pos: orb.pos,
        color: DANGER,
        danger: 0.6,
        blink: true,
      })),
    ];
    for (const mark of marks) {
      tmp.set(...mark.pos).project(camera);
      const onScreen = tmp.z < 1 && Math.abs(tmp.x) < 0.95 &&
        Math.abs(tmp.y) < 0.92;
      if (onScreen) continue;
      seen.add(mark.id);
      let el = arrows.get(mark.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "gs-arrow";
        overlay.append(el);
        arrows.set(mark.id, el);
      }
      // Direction on screen: from the position in camera space.
      tmp2.set(...mark.pos).applyMatrix4(camera.matrixWorldInverse);
      const ang = Math.atan2(-tmp2.y, tmp2.x);
      const r = Math.min(w, h) * 0.42;
      const x = w / 2 +
        Math.cos(ang) * Math.min(r * (w / Math.min(w, h)), w / 2 - 28);
      const y = h / 2 +
        Math.sin(ang) * Math.min(r * (h / Math.min(w, h)), h / 2 - 28);
      el.style.transform = `translate(${x}px, ${y}px) rotate(${ang}rad) scale(${
        0.8 + mark.danger * 0.6
      })`;
      el.style.color = mark.color;
      el.classList.toggle("gs-danger", mark.blink);
    }
    for (const [id, el] of arrows) {
      if (!seen.has(id)) {
        el.remove();
        arrows.delete(id);
      }
    }
  };

  requestAnimationFrame(frame);

  return () => {
    running = false;
    observer.disconnect();
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("pointerlockchange", onLockChange);
    document.removeEventListener("visibilitychange", onVisibility);
    for (const view of views.values()) view.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    overlay.remove();
  };
}

/**
 * Asks for the mouse. A browser may say no — an iframe without the permission, a user who pressed
 * Escape a moment ago — and that is not an error, just a player who aims by dragging instead.
 *
 * @param el What to capture it for
 */
export function lockPointer(el: HTMLElement): void {
  try {
    const p = el.requestPointerLock?.() as Promise<void> | undefined;
    p?.catch?.(() => {});
  } catch { /* not supported */ }
}

function dist2(p: readonly number[]): number {
  return (p[0] - EYE[0]) ** 2 + (p[1] - EYE[1]) ** 2 + (p[2] - EYE[2]) ** 2;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** A soft round glow, for halos and the gun's charge. */
function glowTexture(): THREE.Texture {
  const size = 128;
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
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/**
 * The gun in the corner of the screen: three barrels, one per round, the selected one on top.
 *
 * It is scenery that answers back — it turns its barrels when the round changes, kicks when it
 * fires, glows in the colour of what it just fired, and the e砲's charge sits at its tip as a gold
 * light that goes out while the e砲 recharges.
 */
function buildGun(camera: THREE.Camera, glow: THREE.Texture) {
  const root = new THREE.Group();
  root.position.set(0.3, -0.26, -0.6);
  root.scale.setScalar(0.6);
  camera.add(root);

  const metal = new THREE.MeshStandardMaterial({
    color: 0x241a3d,
    metalness: 0.8,
    roughness: 0.35,
  });
  const trim = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.42), metal);
  body.position.set(0, 0, 0.05);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), metal);
  grip.position.set(0, -0.14, 0.18);
  grip.rotation.x = -0.35;
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.162, 0.012, 0.26),
    trim,
  );
  stripe.position.set(0, 0.03, 0.05);
  root.add(body, grip, stripe);

  const drum = new THREE.Group();
  drum.position.set(0, 0.01, -0.2);
  root.add(drum);
  const shots: Shot[] = ["ccw", "cw", "flip"];
  const barrels = shots.map((shot, i) => {
    const a = (i / 3) * Math.PI * 2;
    const barrel = new THREE.Group();
    barrel.position.set(Math.sin(a) * 0.045, Math.cos(a) * 0.045, 0);
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.026, 0.34, 10),
      metal,
    );
    tube.rotation.x = Math.PI / 2;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.03, 10),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(SHOT_COLORS[shot]).multiplyScalar(2),
        toneMapped: false,
      }),
    );
    band.rotation.x = Math.PI / 2;
    band.position.z = -0.12;
    barrel.add(tube, band);
    drum.add(barrel);
    return { shot, angle: a };
  });

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.05, -0.4);
  root.add(muzzle);

  const charge = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glow,
      color: new THREE.Color(GOLD).multiplyScalar(2),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  charge.position.set(0, 0.01, -0.42);
  root.add(charge);

  let recoil = 0;
  let spin = 0;
  let heat = 0;
  const heatColor = new THREE.Color();

  return {
    muzzle,
    kick(color: string, amount: number) {
      recoil = Math.min(1.4, recoil + amount);
      heat = 1;
      heatColor.set(color);
    },
    update(dt: number, selected: Shot, ready: boolean, time: number) {
      const want = -barrels.find((b) => b.shot === selected)!.angle;
      spin += wrapAngle(want - spin) * Math.min(1, dt * 14);
      drum.rotation.z = spin;
      recoil *= Math.exp(-dt * 14);
      heat *= Math.exp(-dt * 6);
      root.position.z = -0.6 + recoil * 0.06;
      root.rotation.x = recoil * 0.12;
      root.position.y = -0.26 + Math.sin(time * 1.6) * 0.006;
      trim.color.set(0x7a6aa8).lerp(heatColor, heat).multiplyScalar(
        1 + heat * 1.5,
      );
      const s = ready ? 0.16 + Math.sin(time * 8) * 0.02 : 0.04;
      charge.scale.setScalar(s);
      charge.material.opacity = ready ? 1 : 0.35;
    },
  };
}

/** The overlay's own styles: the target brackets and the edge arrows. */
function engineStyles(): void {
  if (document.getElementById("gs-engine-style")) return;
  const style = document.createElement("style");
  style.id = "gs-engine-style";
  style.textContent = `
    .gs-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .gs-overlay { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .gs-brackets {
      position: absolute; left: 0; top: 0; display: none;
      background:
        linear-gradient(currentColor, currentColor) top left / 14px 3px,
        linear-gradient(currentColor, currentColor) top left / 3px 14px,
        linear-gradient(currentColor, currentColor) top right / 14px 3px,
        linear-gradient(currentColor, currentColor) top right / 3px 14px,
        linear-gradient(currentColor, currentColor) bottom left / 14px 3px,
        linear-gradient(currentColor, currentColor) bottom left / 3px 14px,
        linear-gradient(currentColor, currentColor) bottom right / 14px 3px,
        linear-gradient(currentColor, currentColor) bottom right / 3px 14px;
      background-repeat: no-repeat;
      filter: drop-shadow(0 0 6px currentColor);
    }
    .gs-brackets.gs-home { animation: gs-lock .45s ease-in-out infinite alternate; }
    @keyframes gs-lock { to { filter: drop-shadow(0 0 14px currentColor) brightness(1.6); } }
    .gs-arrow {
      position: absolute; left: 0; top: 0; width: 0; height: 0; margin: -10px 0 0 -10px;
      border-top: 10px solid transparent; border-bottom: 10px solid transparent;
      border-left: 18px solid currentColor;
      filter: drop-shadow(0 0 6px currentColor);
    }
    .gs-arrow.gs-danger { animation: gs-blink .25s steps(2) infinite; }
    @keyframes gs-blink { 50% { opacity: .3; } }
  `;
  document.head.append(style);
}
