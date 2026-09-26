/**
 * The screen: three.js, the pointer, and the juice.
 *
 * Loaded by the arena island only once it is in a browser, so neither the server nor the first
 * paint carries three.js. From then on it runs the frame: it turns the pointer into "this spot of
 * that enemy", hands shots at it to the rules in `game.ts`, and draws whatever the rules say
 * happened.
 *
 * The view is from above and behind the turret, looking out over the field, so every enemy is seen
 * from roughly the side that faces the turret — the side its `e` face belongs on. The pointer
 * works on the solid itself: a ray from the camera finds the face under it, and the face snaps it
 * to the nearest spot a round can land on (its middle, a corner, an edge's middle). With a mouse
 * that is hover and click — left for 左回し, right for 右回し, Space for the e砲. On a touch screen a
 * tap picks the spot and the buttons fire at it.
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

import { EnemyView, faceColors, spotAt } from "./enemy-view.ts";
import { Fx } from "./fx.ts";
import {
  type Aim,
  type Enemy,
  game,
  type GameEvent,
  type Orb,
  TURRET,
} from "./game.ts";
import { reachable, type Spin } from "./groups.ts";
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
   * Backs the camera off until the whole field fits: the far edge where enemies come in, and the
   * turret at the bottom. A portrait screen also narrows the field itself, so the enemies are not
   * specks.
   */
  const fit = (w: number, h: number) => {
    const portrait = w < h;
    game.fieldScale = portrait ? 0.55 : 1;
    camera.aspect = w / h;
    camera.fov = portrait ? 52 : 42;
    camera.updateProjectionMatrix();
    const half = 18 * game.fieldScale + 3;
    const must = [
      new THREE.Vector3(-half, 0, -44),
      new THREE.Vector3(half, 0, -44),
      new THREE.Vector3(0, 6, -46),
      new THREE.Vector3(0, 0, 2.5),
    ];
    const e = portrait ? ELEVATION.portrait : ELEVATION.landscape;
    const dir = new THREE.Vector3(0, Math.sin(e), Math.cos(e));
    const p = new THREE.Vector3();
    for (let d = 12; d < 260; d += 0.5) {
      camera.position.copy(LOOK_AT).addScaledVector(dir, d);
      camera.lookAt(LOOK_AT);
      camera.updateMatrixWorld(true);
      const ok = must.every((v) => {
        p.copy(v).project(camera);
        return Math.abs(p.x) < 0.96 && p.y < 0.9 && p.y > -0.92;
      });
      if (ok) break;
    }
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

  // --- picking -----------------------------------------------------------------------------------

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /** What is under a point on the screen: an orb, or a spot of an enemy. */
  const pickAt = (
    clientX: number,
    clientY: number,
  ): { orb: Orb } | { aim: Aim } | null => {
    const rect = host.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // An orb is small and quick, so it gets a generous circle on the screen.
    let orb: Orb | null = null;
    let orbD = coarse ? 40 : 28;
    for (const o of game.orbs) {
      tmp.set(...o.pos).project(camera);
      const d = Math.hypot(
        (tmp.x * 0.5 + 0.5) * rect.width - x,
        (-tmp.y * 0.5 + 0.5) * rect.height - y,
      );
      if (d < orbD) {
        orbD = d;
        orb = o;
      }
    }
    if (orb !== null) return { orb };

    ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const meshes = [...views.values()].flatMap((v) => v.pickables);
    for (const hit of raycaster.intersectObjects(meshes, false)) {
      const view = hit.object.parent?.parent?.userData.view as
        | EnemyView
        | undefined;
      if (!view || !view.enemy.alive) continue;
      const local = view.body.worldToLocal(hit.point.clone());
      const spot = spotAt(view.enemy, local);
      const e = view.enemy;
      return {
        aim: {
          enemy: e,
          spot,
          reachable: reachable(e.species, e.state, spot),
        },
      };
    }
    return null;
  };

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

  const shoot = (spin: Spin, aim: Aim | null) => {
    if (!game.fire(spin, aim)) return;
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

  const shootOrb = (orb: Orb) => {
    if (!game.shootOrb(orb)) return;
    turret.muzzle.getWorldPosition(muzzle);
    fx.beam(muzzle, tmp.set(...orb.pos), 0xffffff, 0.06, 0.14, 1);
    turret.kick(0.3);
    sound.shot("cw");
  };

  /**
   * The e砲, at what the aim is on — or, with nothing aimed at, at the nearest enemy that is
   * home — straight through everything in line behind it.
   */
  const cannon = () => {
    const aimed = game.aim?.enemy ??
      game.enemies
        .filter((e) => e.state === 0)
        .sort((a, b) => dist2(a.pos) - dist2(b.pos))[0] ??
      null;
    turret.muzzle.getWorldPosition(muzzle);
    const dir = aimed !== null
      ? tmp2.set(...aimed.pos).sub(muzzle).normalize()
      : turret.forward(tmp2);
    const along = (p: readonly number[]) => {
      const v = tmp.set(p[0], p[1], p[2]).sub(muzzle);
      const t = v.dot(dir);
      return { t, off: v.addScaledVector(dir, -t).length() };
    };
    const hits = game.enemies
      .map((e) => ({ e, ...along(e.pos) }))
      .filter(({ e, t, off }) => t > 0 && off < e.radius * 0.95)
      .sort((a, b) => a.t - b.t)
      .map(({ e }) => e);
    const orbs = game.orbs.filter((o) => {
      const { t, off } = along(o.pos);
      return t > 0 && off < 1.2;
    });
    if (!game.cannon(hits, orbs)) return;
    const reach = hits.length > 0
      ? Math.sqrt(dist2(hits[hits.length - 1].pos)) + 12
      : 70;
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

  /** A pointer on the field. With a mouse the spot under it is always the aim. */
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || game.phase !== "playing") return;
    const pick = pickAt(e.clientX, e.clientY);
    host.style.cursor = pick === null
      ? "default"
      : "aim" in pick && !pick.aim.reachable
      ? "not-allowed"
      : "pointer";
    if (pick !== null && "aim" in pick) game.setAim(pick.aim);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (game.phase !== "playing") return;
    const pick = pickAt(e.clientX, e.clientY);
    if (e.pointerType === "mouse") {
      e.preventDefault();
      if (e.button !== 0 && e.button !== 2) return;
      if (pick !== null && "orb" in pick) {
        shootOrb(pick.orb);
        return;
      }
      const aim = pick !== null && "aim" in pick ? pick.aim : null;
      if (aim !== null) game.setAim(aim);
      shoot(e.button === 0 ? "ccw" : "cw", aim);
      return;
    }
    // A finger picks; the buttons fire. An orb, though, is popped on the spot.
    if (pick !== null && "orb" in pick) shootOrb(pick.orb);
    else if (pick !== null) game.setAim(pick.aim);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
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
    if (k === " ") {
      e.preventDefault();
      game.command("cannon");
    } else if (k === "q" || k === "a") {
      game.command("ccw");
    } else if (k === "e" || k === "d") {
      game.command("cw");
    }
  };
  const onContext = (e: Event) => e.preventDefault();
  const onVisibility = () => {
    if (document.hidden) game.pause();
  };

  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("contextmenu", onContext);
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);

  // --- the orbs ----------------------------------------------------------------------------------

  const orbViews = new Map<number, THREE.Group>();
  const orbCore = new THREE.SphereGeometry(0.4, 16, 10);
  const orbCage = new THREE.IcosahedronGeometry(0.75, 0);
  const orbCoreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(DANGER).multiplyScalar(1.6),
    toneMapped: false,
  });
  const orbCageMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xff9a3d),
    wireframe: true,
  });
  const removeOrb = (id: number) => {
    const view = orbViews.get(id);
    if (!view) return;
    scene.remove(view);
    orbViews.delete(id);
  };

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
          ev.enemy.radius * 2.5,
          0.5,
        );
        if (ev.enemy.boss) addTrauma(0.4);
        break;
      }
      case "turn": {
        const view = views.get(ev.enemy.id);
        const color = SHOT_COLORS[ev.spin];
        const at = spotWorld(
          { enemy: ev.enemy, spot: ev.spot, reachable: true },
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
        if (ev.what === "far") {
          const aim = game.aim;
          if (aim !== null) {
            fx.popup(above(aim.enemy), "裏側には届かない", DANGER, "sm");
          }
        }
        if (ev.what === "cannon" || ev.what === "far") sound.miss();
        break;
      case "orb": {
        const view = new THREE.Group();
        view.add(
          new THREE.Mesh(orbCore, orbCoreMat),
          new THREE.Mesh(orbCage, orbCageMat),
        );
        view.position.set(...ev.orb.pos);
        orbViews.set(ev.orb.id, view);
        scene.add(view);
        fx.burst(tmp.set(...ev.orb.pos), 0xff9a3d, 10, {
          speed: 4,
          size: 0.16,
          life: 0.35,
        });
        sound.enemyShot();
        break;
      }
      case "pop": {
        tmp.set(...ev.orb.pos);
        fx.burst(tmp, 0xff9a3d, 30, { speed: 9, size: 0.2, life: 0.45 });
        fx.ring(tmp, DANGER, 0.3, 2.4, 0.3);
        fx.popup(tmp.clone(), `+${ev.points}`, "#ffb36b", "sm");
        addTrauma(0.06);
        sound.pop();
        removeOrb(ev.orb.id);
        break;
      }
      case "struck": {
        removeOrb(ev.orb.id);
        damage = 0.8;
        addTrauma(0.6);
        sound.breach();
        break;
      }
      case "cannon": {
        let big = false;
        ev.kills.forEach((kill, i) => {
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
          }, 60 + i * 90);
          if (!kill.broken) {
            fx.ring(tmp, GOLD, scale, scale * 3, 0.5);
            fx.burst(tmp, GOLD, 60, { speed: 10, size: 0.22, life: 0.6 });
            return;
          }
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
        });
        if (ev.kills.length > 0) {
          hitStop = big ? 0.1 : 0.06;
          slowmo = ev.kills.length > 1 || big ? 0.35 : 0.65;
          addTrauma(big ? 0.55 : 0.3);
          flash = reduced ? 0.04 : big ? 0.12 : 0.06;
          (grade.uniforms.uFlashColor.value as THREE.Color).set(0xfff1c0);
          pulse = 0;
          sound.explode(big);
          if (ev.kills.length > 1) {
            fx.popup(
              above(ev.kills[0].enemy, 2.4),
              `${ev.kills.length}連 e砲!!`,
              "#ff8af1",
              "xl",
            );
          }
        }
        for (const e of ev.bounced) {
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

    // The aim follows the enemy's state: a spot that was on the near side may not be after a turn.
    const aim = game.aim;
    if (aim !== null) {
      if (!aim.enemy.alive) game.setAim(null);
      else {
        const r = reachable(aim.enemy.species, aim.enemy.state, aim.spot);
        if (r !== aim.reachable) game.setAim({ ...aim, reachable: r });
      }
    }

    for (const cmd of game.takeCommands()) {
      if (cmd === "cannon") cannon();
      else shoot(cmd, game.aim);
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
      for (const id of [...views.keys()]) if (!live.has(id)) removeView(id);
    }

    const current = game.aim;
    for (const view of views.values()) {
      const e = view.enemy;
      view.setAim(
        current !== null && current.enemy === e
          ? { spot: current.spot, reachable: current.reachable }
          : null,
      );
      const key = `${game.hintLevel}:${e.state}`;
      if (hinted.get(e.id) !== key) {
        hinted.set(e.id, key);
        view.setHint(game.hintFor(e), game.axisFor(e));
      }
      view.update(dt, turretAt, clock);
    }

    // The turret turns to what it would hit.
    if (current !== null) turret.face(spotWorld(current, tmp));
    else if (game.enemies.length > 0) {
      const near = [...game.enemies].sort((a, b) =>
        dist2(a.pos) - dist2(b.pos)
      )[0];
      turret.face(tmp.set(...near.pos));
    }
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
  `;
  document.head.append(style);
}
