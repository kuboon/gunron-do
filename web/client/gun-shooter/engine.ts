/**
 * The screen: three.js, the joystick, and the juice.
 *
 * Loaded by the arena island only once it is in a browser, so neither the server nor the first
 * paint carries three.js. From then on it runs the frame: it passes the joystick and the buttons on
 * to the rules in `game.ts`, and draws whatever the rules say happened.
 *
 * The view is from above and behind the turret, looking down the lane the enemies come along, so
 * the one at the front is seen from roughly the side that faces the turret — the side its `e` face
 * belongs on. Only that one can be shot, and nothing is aimed by pointing: a joystick picks a spot
 * on it (the middle of a face, a corner, the middle of an edge) and the buttons fire at that spot.
 * On a phone the joystick is under the left thumb and the buttons under the right; at a keyboard it
 * is W A S D (or the mouse, as a stick centred on the enemy), and J K L fire.
 *
 * The juice is scaled to how much an event matters and kept off the enemies themselves: a round
 * landing is a tracer, a few sparks and a thump; the `e` face coming home is a chime and a gold
 * ring on the floor; an e砲 kill is a hit-stop, shards, a shockwave and a short slow motion. The
 * enemies are never bloomed, so the `e` on one is always legible.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import { EnemyView, faceColors } from "./enemy-view.ts";
import { Fx } from "./fx.ts";
import {
  type Aim,
  type Enemy,
  game,
  type GameEvent,
  LANE_HALF,
  LANE_START,
  TURRET,
} from "./game.ts";
import type { Spin } from "./groups.ts";
import { DANGER, GOLD, NIGHT, SHOT_COLORS, SPECIES_COLORS } from "./palette.ts";
import { sound } from "./sound.ts";
import { buildStage } from "./stage.ts";

/** Where the camera looks: a little beyond the middle of the field. */
const LOOK_AT = new THREE.Vector3(0, 0, -17);

/**
 * How steeply the camera looks down, in radians. A portrait screen looks down more steeply, so the
 * field's depth fills its height instead of its bottom half being empty floor.
 */
const ELEVATION = { landscape: 0.46, portrait: 0.8 } as const;

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
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = "gs-canvas";
  host.append(renderer.domElement);

  const overlay = document.createElement("div");
  overlay.className = "gs-overlay";
  host.append(overlay);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.Fog(NIGHT, 80, 170);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);
  scene.add(camera);

  // Plain, even light from the turret's side, so every face an enemy turns towards the player is
  // lit and the colours stay what they are.
  scene.add(new THREE.HemisphereLight(0xe4ddff, 0x241638, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-7, 16, 12);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.6);
  fill.position.set(9, 6, 8);
  scene.add(fill);

  const stage = buildStage(scene);
  const fx = new Fx(scene, camera, overlay);
  const turret = buildTurret(scene);
  const turretAt = new THREE.Vector3(...TURRET);

  // --- post ------------------------------------------------------------------------------------

  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: coarse ? 2 : 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // Only what is brighter than white blooms: the tracers, sparks and blasts. The enemies and the
  // floor are lit normally and never get there.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(256, 256),
    0.55,
    0.3,
    0.92,
  );
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
      uDamage: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uFlash;
      uniform vec3 uFlashColor;
      uniform float uDamage;
      varying vec2 vUv;
      void main() {
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        float r = length(vUv - 0.5);
        col *= 1.0 - smoothstep(0.5, 0.95, r) * 0.45;
        col = mix(col, vec3(1.0, 0.05, 0.1), uDamage * smoothstep(0.3, 0.85, r));
        col += uFlashColor * uFlash;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // --- state ------------------------------------------------------------------------------------

  const views = new Map<number, EnemyView>();
  /** The state each view last had its hints worked out for. */
  const hinted = new Map<number, string>();
  let trauma = 0;
  let flash = 0;
  let damage = 0;
  let pulse = 1;
  let hitStop = 0;
  let slowmo = 1;
  let clock = 0;
  let shakeT = 0;
  let running = true;
  let last = performance.now();
  const basePos = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  const addTrauma = (t: number) => {
    trauma = Math.min(1, trauma + t * (reduced ? 0.3 : 1));
  };

  // --- sizing -----------------------------------------------------------------------------------

  /**
   * Backs the camera off until the lane fits: its far end, where enemies join it, and the turret at
   * the bottom. Enemies come in from the sides, from off the screen if it is narrow. A portrait
   * screen keeps the far end below the top, where the HUD says what the front enemy is, and the
   * turret above the bottom, where the thumbs are.
   */
  const fit = (w: number, h: number) => {
    const portrait = w < h;
    camera.aspect = w / h;
    camera.fov = portrait ? 52 : 42;
    camera.updateProjectionMatrix();
    const must = [
      new THREE.Vector3(-LANE_HALF, 0, LANE_START),
      new THREE.Vector3(LANE_HALF, 0, LANE_START),
      new THREE.Vector3(0, 20, LANE_START),
      // The front enemy's top as it reaches the turret: it is closest, and tallest on the screen.
      new THREE.Vector3(0, 19, -10),
      new THREE.Vector3(0, 0, 2.5),
    ];
    const e = portrait ? ELEVATION.portrait : ELEVATION.landscape;
    const top = portrait ? 0.5 : 0.9;
    const bottom = portrait ? -0.62 : -0.92;
    camera.clearViewOffset();
    const dir = new THREE.Vector3(0, Math.sin(e), Math.cos(e));
    const p = new THREE.Vector3();
    let high = 0;
    for (let d = 12; d < 260; d += 0.5) {
      camera.position.copy(LOOK_AT).addScaledVector(dir, d);
      camera.lookAt(LOOK_AT);
      camera.updateMatrixWorld(true);
      let lo = Infinity;
      let hi = -Infinity;
      let wide = 0;
      for (const v of must) {
        p.copy(v).project(camera);
        lo = Math.min(lo, p.y);
        hi = Math.max(hi, p.y);
        wide = Math.max(wide, Math.abs(p.x));
      }
      high = hi;
      if (wide < 0.96 && hi - lo <= top - bottom) break;
    }
    // Then slide the picture down until the far end sits at the top limit: a window onto the view
    // that starts above it, so nothing moves in the world and the perspective stays the same.
    const shift = high - top;
    if (shift > 0) camera.setViewOffset(w, h, 0, -shift * h / 2, w, h);
    basePos.copy(camera.position);
  };

  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    fit(w, h);
    fx.resize(h * renderer.getPixelRatio(), camera.fov);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // --- aiming ------------------------------------------------------------------------------------

  /** Where a spot of an enemy is in the world right now. */
  const spotWorld = (aim: Aim, out: THREE.Vector3): THREE.Vector3 => {
    const view = views.get(aim.enemy.id);
    if (!view) return out.set(...aim.enemy.pos);
    return view.body.localToWorld(
      out.set(...aim.enemy.species.spots[aim.spot].point),
    );
  };

  // --- firing ------------------------------------------------------------------------------------

  const muzzle = new THREE.Vector3();

  const shoot = (spin: Spin) => {
    const aim = game.aim;
    if (!game.fire(spin)) return;
    turret.muzzle.getWorldPosition(muzzle);
    const end = aim !== null
      ? spotWorld(aim, tmp)
      : tmp.copy(muzzle).add(turret.forward(tmp2).multiplyScalar(60));
    const color = SHOT_COLORS[spin];
    fx.beam(muzzle, end, color, 0.07, 0.16, 1);
    fx.burst(muzzle, color, 5, { speed: 3, size: 0.12, life: 0.2 });
    turret.kick(0.35);
    sound.shot(spin);
  };

  /** The e砲, straight at the front of the lane. */
  const cannon = () => {
    const front = game.front;
    turret.muzzle.getWorldPosition(muzzle);
    const dir = front !== null
      ? tmp2.set(...front.pos).sub(muzzle).normalize()
      : turret.forward(tmp2);
    if (!game.cannon()) return;
    const reach = front !== null ? Math.sqrt(dist2(front.pos)) + 10 : 70;
    const end = muzzle.clone().addScaledVector(dir, reach);
    fx.beam(muzzle, end, GOLD, 0.45, 0.4, 0.9);
    fx.beam(muzzle, end, 0xffffff, 0.14, 0.26, 1);
    fx.ring(muzzle.clone().addScaledVector(dir, 1.5), GOLD, 0.3, 2.4, 0.3);
    turret.kick(1);
    turret.face(end);
    addTrauma(0.25);
    sound.cannon();
  };

  // --- input -------------------------------------------------------------------------------------

  // The joystick a thumb drags: it appears where the thumb lands, on the left of the screen.
  const stick = document.createElement("div");
  stick.className = "gs-stick";
  const knob = document.createElement("div");
  knob.className = "gs-stick-knob";
  stick.append(knob);
  overlay.append(stick);
  /** How far the knob goes, in pixels, at a full push. */
  const STICK_REACH = 52;
  let thumb: { id: number; x: number; y: number; moved: boolean } | null = null;

  const restStick = () => {
    stick.classList.remove("gs-stick-live");
    stick.style.left = "";
    stick.style.top = "";
    knob.style.transform = "";
  };

  /** The mouse as a stick: its offset from the front enemy, over the enemy's size on the screen. */
  const mouseStick = (clientX: number, clientY: number) => {
    const front = game.front;
    const view = front !== null ? views.get(front.id) : undefined;
    if (!view || front === null) return;
    const rect = host.getBoundingClientRect();
    view.frame.getWorldPosition(tmp);
    tmp2.copy(tmp).project(camera);
    const cx = (tmp2.x * 0.5 + 0.5) * rect.width;
    const cy = (-tmp2.y * 0.5 + 0.5) * rect.height;
    tmp.addScaledVector(
      tmp2.setFromMatrixColumn(camera.matrixWorld, 0),
      front.radius,
    ).project(camera);
    const r = Math.max(
      8,
      Math.abs((tmp.x * 0.5 + 0.5) * rect.width - cx),
    );
    game.steer(
      (clientX - rect.left - cx) / r,
      -(clientY - rect.top - cy) / r,
    );
  };

  const onPointerMove = (e: PointerEvent) => {
    if (game.phase !== "playing") return;
    if (e.pointerType === "mouse") {
      mouseStick(e.clientX, e.clientY);
      return;
    }
    if (thumb === null || e.pointerId !== thumb.id) return;
    let dx = e.clientX - thumb.x;
    let dy = e.clientY - thumb.y;
    const m = Math.hypot(dx, dy);
    if (m > 8) thumb.moved = true;
    if (m > STICK_REACH) {
      dx *= STICK_REACH / m;
      dy *= STICK_REACH / m;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (thumb.moved) game.steer(dx / STICK_REACH, -dy / STICK_REACH);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (game.phase !== "playing") return;
    if (e.pointerType === "mouse") {
      e.preventDefault();
      if (e.button === 0) shoot("ccw");
      else if (e.button === 2) shoot("cw");
      return;
    }
    // A thumb on the left half is the joystick, wherever it lands.
    const rect = host.getBoundingClientRect();
    if (thumb !== null || e.clientX - rect.left > rect.width * 0.55) return;
    thumb = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    host.setPointerCapture(e.pointerId);
    stick.classList.add("gs-stick-live");
    stick.style.left = `${e.clientX - rect.left}px`;
    stick.style.top = `${e.clientY - rect.top}px`;
    knob.style.transform = "";
  };

  const onPointerUp = (e: PointerEvent) => {
    if (thumb === null || e.pointerId !== thumb.id) return;
    // Let go, the aim stays where the stick left it; a tap without a drag puts it back in the
    // middle.
    if (!thumb.moved) game.steer(0, 0);
    thumb = null;
    restStick();
  };

  /** The keyboard's stick: a step at a time. */
  const STEPS: Record<string, readonly [number, number]> = {
    w: [0, 1],
    arrowup: [0, 1],
    s: [0, -1],
    arrowdown: [0, -1],
    a: [-1, 0],
    arrowleft: [-1, 0],
    d: [1, 0],
    arrowright: [1, 0],
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const step = STEPS[k];
    if (step !== undefined) {
      if (game.phase === "playing") {
        e.preventDefault();
        game.nudge(step[0], step[1]);
      }
      return;
    }
    if (e.repeat) return;
    if (k === "m") {
      sound.toggle();
      game.notify();
      return;
    }
    if (k === "escape" || k === "p") {
      if (game.phase === "playing") game.pause();
      else if (game.phase === "paused") game.resume();
      return;
    }
    if (game.phase !== "playing") return;
    if (k === " " || k === "l") {
      e.preventDefault();
      game.command("cannon");
    } else if (k === "j") {
      game.command("ccw");
    } else if (k === "k") {
      game.command("cw");
    }
  };
  const onContext = (e: Event) => e.preventDefault();
  const onVisibility = () => {
    if (document.hidden) game.pause();
  };

  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointercancel", onPointerUp);
  host.addEventListener("contextmenu", onContext);
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);

  // --- events ------------------------------------------------------------------------------------

  const removeView = (id: number) => {
    const view = views.get(id);
    if (!view) return;
    scene.remove(view.frame, ...view.floor);
    view.dispose();
    views.delete(id);
    hinted.delete(id);
  };

  const above = (enemy: Enemy, k = 1.3) =>
    tmp2.set(...enemy.pos).add(tmp.set(0, enemy.radius * k, 0)).clone();

  const handle = (ev: GameEvent) => {
    switch (ev.type) {
      case "spawn": {
        const view = new EnemyView(ev.enemy);
        view.frame.userData.view = view;
        views.set(ev.enemy.id, view);
        scene.add(view.frame, ...view.floor);
        tmp.set(...ev.enemy.pos);
        fx.ring(
          tmp,
          SPECIES_COLORS[ev.enemy.species.id],
          0.5,
          ev.enemy.radius * 1.2,
          0.5,
        );
        if (ev.enemy.boss) addTrauma(0.4);
        break;
      }
      case "land": {
        tmp.set(ev.enemy.pos[0], 0.1, ev.enemy.pos[2]);
        fx.ring(
          tmp,
          SPECIES_COLORS[ev.enemy.species.id],
          ev.enemy.radius * 0.5,
          ev.enemy.radius * 1.8,
          0.4,
        );
        addTrauma(ev.enemy.boss ? 0.35 : 0.08);
        sound.hit();
        break;
      }
      case "turn": {
        const view = views.get(ev.enemy.id);
        const color = SHOT_COLORS[ev.spin];
        const at = spotWorld(
          { enemy: ev.enemy, spot: ev.spot },
          new THREE.Vector3(),
        );
        view?.turn(ev.from, ev.to, color);
        fx.burst(at, color, 16, { speed: 6, size: 0.16, life: 0.35 });
        fx.ring(at, color, 0.2, 1.4, 0.25);
        addTrauma(0.05);
        sound.hit();
        if (!ev.home) {
          fx.popup(
            above(ev.enemy),
            `あと ${ev.left} ${ev.gain > 0 ? "▼" : "▲"}`,
            ev.gain > 0 ? "#9dffb0" : DANGER,
            "md",
          );
          break;
        }
        // Home. In the fewest shots there are, that was the inverse: say so.
        const inverse = ev.enemy.taken === ev.enemy.start;
        setTimeout(() => {
          if (!ev.enemy.alive || ev.enemy.state !== 0) return;
          sound.home();
          fx.popup(above(ev.enemy, 1.5), inverse ? "逆元!" : "e!", GOLD, "lg");
          tmp.set(ev.enemy.pos[0], 0.1, ev.enemy.pos[2]);
          fx.ring(
            tmp,
            GOLD,
            ev.enemy.radius * 0.6,
            ev.enemy.radius * 1.6,
            0.45,
          );
        }, 260);
        break;
      }
      case "scramble": {
        views.get(ev.enemy.id)?.turn(ev.from, ev.to, "#ffffff");
        fx.popup(
          above(ev.enemy, 1.6),
          `あと ${ev.enemy.lives} 回!`,
          DANGER,
          "lg",
        );
        break;
      }
      case "miss":
        if (ev.what === "cannon") sound.miss();
        break;
      case "cannon": {
        let big = false;
        const kill = ev.kill;
        if (kill !== null) {
          const e = kill.enemy;
          big ||= (e.boss && kill.broken) || e.species.order >= 24;
          tmp.set(...e.pos);
          const scale = e.radius;
          const lift = above(e);
          setTimeout(() => {
            fx.popup(
              lift,
              `+${kill.points.toLocaleString()}`,
              GOLD,
              e.boss && kill.broken ? "xl" : "lg",
            );
            if (kill.perfect) {
              fx.popup(
                lift.clone().add(tmp2.set(0, -scale * 1.1, 0)),
                "PERFECT",
                "#7dffea",
                "md",
              );
            }
          }, 60);
          if (!kill.broken) {
            fx.ring(tmp, GOLD, scale, scale * 3, 0.5);
            fx.burst(tmp, GOLD, 60, { speed: 10, size: 0.22, life: 0.6 });
          } else {
            fx.flash(tmp, GOLD, scale * 1.4, 0.3);
            fx.ring(
              tmp.clone().setY(0.2),
              GOLD,
              scale,
              scale * (e.boss ? 9 : 4.5),
              0.6,
            );
            fx.shatter(
              tmp,
              faceColors(e.species),
              e.boss ? 120 : 30 + e.species.order,
              scale,
              e.boss ? 14 : 10,
            );
            fx.burst(tmp, GOLD, e.boss ? 240 : 70, {
              speed: e.boss ? 22 : 13,
              size: 0.24,
              life: 0.9,
            });
            removeView(e.id);
          }
        }
        if (kill !== null) {
          hitStop = big ? 0.1 : 0.06;
          slowmo = big ? 0.35 : 0.65;
          addTrauma(big ? 0.55 : 0.3);
          flash = reduced ? 0.04 : big ? 0.12 : 0.06;
          (grade.uniforms.uFlashColor.value as THREE.Color).set(0xfff1c0);
          pulse = 0;
          sound.explode(big);
        }
        if (ev.bounced !== null) {
          const e = ev.bounced;
          tmp.set(...e.pos);
          fx.burst(tmp, DANGER, 36, { speed: 10, size: 0.2, life: 0.5 });
          fx.ring(tmp, DANGER, e.radius, e.radius * 2.4, 0.35);
          fx.popup(above(e), "反発!  e じゃない", DANGER, "md");
          sound.bounce();
          addTrauma(0.15);
        }
        break;
      }
      case "breach": {
        tmp.set(...ev.enemy.pos);
        fx.flash(tmp, DANGER, ev.enemy.radius * 2, 0.35);
        fx.burst(tmp, DANGER, 90, { speed: 12, size: 0.24, life: 0.7 });
        fx.shatter(tmp, faceColors(ev.enemy.species), 24, ev.enemy.radius, 8);
        removeView(ev.enemy.id);
        damage = 1;
        addTrauma(0.8);
        sound.breach();
        break;
      }
      case "wave":
        sound.wave(ev.boss);
        pulse = 0;
        if (ev.boss) addTrauma(0.3);
        break;
      case "clear":
        sound.clear();
        pulse = 0;
        break;
      case "over":
        sound.over();
        addTrauma(0.6);
        damage = 1;
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
      dt = real * 0.03;
    } else {
      dt = real * slowmo;
      slowmo += (1 - slowmo) * Math.min(1, real * 2.5);
    }
    if (game.phase !== "playing") dt = game.phase === "paused" ? 0 : real;
    clock += dt;

    for (const cmd of game.takeCommands()) {
      if (cmd === "cannon") cannon();
      else shoot(cmd);
    }

    game.update(dt);
    for (const ev of game.drain()) handle(ev);

    // A view whose enemy the rules no longer have — a new run started over the old one — goes
    // quietly. Kills and breaches take theirs out above, with their fireworks.
    if (views.size !== game.enemies.length) {
      const live = new Set(game.enemies.map((e) => e.id));
      for (const id of [...views.keys()]) if (!live.has(id)) removeView(id);
    }

    // Only the front of the lane shows the aim and the hints: nobody behind it can be shot yet.
    const current = game.aim;
    const front = game.front;
    for (const view of views.values()) {
      const e = view.enemy;
      const isFront = e === front;
      view.setAim(
        current !== null && current.enemy === e ? current.spot : null,
      );
      const key = `${game.hintLevel}:${e.state}:${isFront}`;
      if (hinted.get(e.id) !== key) {
        hinted.set(e.id, key);
        view.setHint(
          isFront ? game.hintFor(e) : null,
          isFront ? game.axisFor(e) : null,
        );
      }
      view.update(dt, turretAt, clock);
    }

    // The turret turns to what it would hit.
    if (current !== null) turret.face(spotWorld(current, tmp));
    else if (front !== null) turret.face(tmp.set(...front.pos));
    else turret.face(tmp.set(0, TURRET[1], LANE_START));
    turret.update(real, game.cannonCooldown <= 0, clock);

    fx.update(dt);
    stage.update(clock, pulse);
    pulse = Math.min(1, pulse + real * 0.9);

    // Shake: trauma squared, driven by smooth waves rather than noise, decaying on its own.
    trauma = Math.max(0, trauma - real * 1.8);
    shakeT += real * 26;
    const shake = trauma * trauma;
    camera.position.set(
      basePos.x + shake * 0.5 * Math.sin(shakeT * 1.7),
      basePos.y + shake * 0.4 * Math.sin(shakeT * 2.3 + 1),
      basePos.z,
    );

    flash *= Math.exp(-real * 8);
    damage *= Math.exp(-real * 2.5);
    grade.uniforms.uFlash.value = flash;
    grade.uniforms.uDamage.value = damage;

    composer.render();
  };

  requestAnimationFrame(frame);

  return () => {
    running = false;
    observer.disconnect();
    host.removeEventListener("pointermove", onPointerMove);
    host.removeEventListener("pointerdown", onPointerDown);
    host.removeEventListener("pointerup", onPointerUp);
    host.removeEventListener("pointercancel", onPointerUp);
    host.removeEventListener("contextmenu", onContext);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onVisibility);
    for (const view of views.values()) view.dispose();
    composer.dispose();
    target.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    overlay.remove();
  };
}

function dist2(p: readonly number[]): number {
  return (p[0] - TURRET[0]) ** 2 + (p[1] - TURRET[1]) ** 2 +
    (p[2] - TURRET[2]) ** 2;
}

/**
 * The turret: a squat base on the floor, a head that turns to whatever the aim is on, and a
 * barrel with the e砲's charge glowing at its tip.
 */
function buildTurret(scene: THREE.Scene) {
  const root = new THREE.Group();
  root.scale.setScalar(0.75);
  scene.add(root);

  const metal = new THREE.MeshStandardMaterial({
    color: 0x3a3150,
    metalness: 0.6,
    roughness: 0.4,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0xd8d2f0,
    metalness: 0.2,
    roughness: 0.5,
  });

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 2.2, 0.7, 24),
    metal,
  );
  base.position.y = 0.35;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(1.85, 1.85, 0.12, 24),
    trim,
  );
  band.position.y = 0.72;
  root.add(base, band);

  const head = new THREE.Group();
  head.position.y = TURRET[1] / 0.75;
  root.add(head);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 14), metal);
  dome.scale.y = 0.75;
  head.add(dome);

  const pitch = new THREE.Group();
  head.add(pitch);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.26, 2.4, 14),
    metal,
  );
  barrel.rotation.x = -Math.PI / 2;
  barrel.position.z = -1.4;
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.25, 14),
    trim,
  );
  collar.rotation.x = -Math.PI / 2;
  collar.position.z = -2.5;
  pitch.add(barrel, collar);

  const muzzle = new THREE.Object3D();
  muzzle.position.z = -2.7;
  pitch.add(muzzle);

  const chargeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(GOLD).multiplyScalar(1.6),
    toneMapped: false,
    transparent: true,
  });
  const charge = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 8),
    chargeMat,
  );
  charge.position.z = -2.75;
  pitch.add(charge);

  let yaw = 0;
  let tilt = 0;
  let wantYaw = 0;
  let wantTilt = 0;
  let recoil = 0;
  const at = new THREE.Vector3();

  return {
    muzzle,
    /** Where the barrel points, as a unit vector. */
    forward(out: THREE.Vector3): THREE.Vector3 {
      return out.set(0, 0, -1).applyQuaternion(
        pitch.getWorldQuaternion(new THREE.Quaternion()),
      );
    },
    /** Turns towards a point in the world. */
    face(point: THREE.Vector3) {
      head.getWorldPosition(at);
      const dx = point.x - at.x;
      const dy = point.y - at.y;
      const dz = point.z - at.z;
      wantYaw = Math.atan2(-dx, -dz);
      wantTilt = Math.atan2(dy, Math.hypot(dx, dz));
    },
    kick(amount: number) {
      recoil = Math.min(1.2, recoil + amount);
    },
    update(dt: number, ready: boolean, time: number) {
      yaw += Math.atan2(Math.sin(wantYaw - yaw), Math.cos(wantYaw - yaw)) *
        Math.min(1, dt * 14);
      tilt += (wantTilt - tilt) * Math.min(1, dt * 14);
      head.rotation.y = yaw;
      pitch.rotation.x = tilt;
      recoil *= Math.exp(-dt * 12);
      pitch.position.z = recoil * 0.35;
      charge.scale.setScalar(ready ? 1 + Math.sin(time * 8) * 0.12 : 0.35);
      chargeMat.opacity = ready ? 1 : 0.4;
    },
  };
}

/** The overlay's own styles. */
function engineStyles(): void {
  if (document.getElementById("gs-engine-style")) return;
  const style = document.createElement("style");
  style.id = "gs-engine-style";
  style.textContent = `
    .gs-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .gs-overlay { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .gs-stick {
      position: absolute; left: max(3.8rem, 15%); top: calc(100% - 5.4rem);
      width: 6rem; height: 6rem; margin: -3rem 0 0 -3rem; border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.18); background: rgba(10,4,24,0.35);
      display: grid; place-items: center; opacity: 0.55; transition: opacity .15s;
    }
    .gs-stick-live { opacity: 1; transition: none; }
    .gs-stick-knob {
      width: 3rem; height: 3rem; border-radius: 50%;
      background: rgba(255,255,255,0.28); border: 2px solid rgba(255,255,255,0.6);
      box-shadow: 0 0 12px rgba(255,255,255,0.3);
    }
    @media (pointer: fine) { .gs-stick { display: none; } }
  `;
  document.head.append(style);
}
