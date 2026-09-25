/**
 * 群シューター's rules, and the one game every island and the renderer share.
 *
 * Everything that decides anything is here, on plain numbers: where the enemies are, which element
 * each one is in, what a shot does, when a wave ends, the score. The renderer never decides — it
 * reads this, draws it, and turns the player's aim into "this shot at that enemy". The HUD island
 * never decides either; it reads this and shows it.
 *
 * The player stands at the origin and does not move. Enemies come in from a ring around them,
 * each in a random element of its group, and drift closer. Each element round turns the enemy it
 * hits by one generator; once an enemy is at `e` — its `e` face upright and facing you — the
 * e砲 destroys it. The e砲 at anything else bounces off and knocks the enemy one more turn away.
 * An enemy that reaches you costs a life.
 *
 * What the renderer needs to animate comes out as events, drained once a frame: a shot landing is
 * one rotation from one element to another, and the renderer spins the mesh between the two. The
 * state has already moved on by then, so a player firing fast is never waiting for an animation.
 */

import {
  atDepth,
  type Guide,
  guide,
  type Shot,
  SHOTS,
  SPECIES,
  type Species,
  type SpeciesId,
  wayHome,
} from "./groups.ts";
import type { Quat, Vec3 } from "./quat.ts";

/** Where the player's eye is. */
export const EYE: Vec3 = [0, 1.6, 0];

/** How close an enemy may come before it hits the player. */
export const BREACH_RADIUS = 2.4;

/** How many hits the player can take. */
export const MAX_LIFE = 5;

/** Seconds between element rounds. */
export const SHOT_COOLDOWN = 0.12;

/** Seconds the e砲 needs to recharge. */
export const CANNON_COOLDOWN = 0.85;

/** How far away enemies appear. */
const SPAWN_DISTANCE = 34;

/** An enemy on the field. */
export interface Enemy {
  id: number;
  species: Species;
  /** Its element, as an index into `species.elements`. 0 is `e`. */
  state: number;
  /** How far from `e` it started, in shots — a kill in exactly that many is perfect. */
  start: number;
  /** Shots it has taken. */
  taken: number;
  /** Where it is. */
  pos: Vec3;
  /** How big it is drawn, and how big a target it is. */
  radius: number;
  /** Units per second towards the player. */
  speed: number;
  /** The phase of its sideways drift. */
  sway: number;
  boss: boolean;
  alive: boolean;
  /** Seconds until it next fires an orb, or `Infinity` in a wave where nobody does. */
  fireIn: number;
}

/** An energy orb an enemy fired at the player. Any round pops it. */
export interface Orb {
  id: number;
  pos: Vec3;
  /** Units per second. */
  vel: Vec3;
  alive: boolean;
}

/** What the HUD says about the enemy under the crosshair. */
export interface Guidance {
  /** Fewest shots home. */
  left: number;
  /** What to do, and where the green frame is. */
  guide: Guide;
  /** The exact next shot — only on the first waves, while the player is learning to read. */
  next: Shot | null;
}

/** How close an orb gets before it hits. */
const ORB_HIT_RADIUS = 1.4;

/** How fast an orb flies. */
const ORB_SPEED = 7;

/** What popping one is worth. */
const ORB_POINTS = 25;

/** What the renderer is told happened. */
export type GameEvent =
  | { type: "spawn"; enemy: Enemy }
  | {
    type: "turn";
    enemy: Enemy;
    shot: Shot;
    from: Quat;
    to: Quat;
    home: boolean;
    /** Shots home, after this one. */
    left: number;
    /** How many closer this shot brought it: 1, or -1 for a step the wrong way. */
    gain: number;
  }
  | { type: "orb"; orb: Orb; from: Enemy }
  | { type: "pop"; orb: Orb; points: number }
  | { type: "struck"; orb: Orb }
  | { type: "miss"; shot: Shot | "cannon" }
  | { type: "cannon"; kills: Kill[]; bounced: Enemy[] }
  | { type: "breach"; enemy: Enemy }
  | { type: "wave"; wave: number; title: string; boss: boolean }
  | { type: "clear"; wave: number }
  | { type: "over" };

/** One enemy the e砲 took down, and what it was worth. */
export interface Kill {
  enemy: Enemy;
  points: number;
  perfect: boolean;
}

/** What the player asked for, before anyone knows what it hits. */
export type Command = Shot | "cannon";

export type Phase = "title" | "playing" | "paused" | "over";

/** One wave: who comes, how far from home, how fast, and from where. */
interface Wave {
  title: string;
  /** Kinds and counts, spawned in this order. */
  spawns: readonly (readonly [SpeciesId, number])[];
  /** How many shots from `e` each enemy starts: at least, at most. */
  depth: readonly [number, number];
  speed: number;
  /** Half the angle, in radians, of the arc in front of the player they come from. */
  arc: number;
  /** Seconds between arrivals. */
  gap: number;
  boss?: boolean;
  /** Seconds between each enemy's orbs, or nothing for a wave where they hold fire. */
  orbs?: number;
}

const WAVES: readonly Wave[] = [
  {
    title: "D₃ 正三角形",
    spawns: [["D3", 3]],
    depth: [1, 2],
    speed: 0.9,
    arc: 0.45,
    gap: 2.4,
  },
  {
    title: "D₄ 正方形",
    spawns: [["D4", 4]],
    depth: [1, 3],
    speed: 1.0,
    arc: 0.7,
    gap: 2.2,
  },
  {
    title: "A₄ 正四面体",
    spawns: [["A4", 4]],
    depth: [2, 3],
    speed: 1.0,
    arc: 0.9,
    gap: 2.4,
    orbs: 7,
  },
  {
    title: "混成部隊",
    spawns: [["D3", 2], ["A4", 2], ["D4", 2]],
    depth: [2, 3],
    speed: 1.15,
    arc: 1.6,
    gap: 1.8,
    orbs: 6,
  },
  {
    title: "S₄ 立方体",
    spawns: [["S4", 4]],
    depth: [2, 4],
    speed: 1.0,
    arc: 1.2,
    gap: 2.6,
    orbs: 6.5,
  },
  {
    title: "総力戦",
    spawns: [["D4", 2], ["S4", 2], ["A4", 2], ["D3", 2]],
    depth: [2, 4],
    speed: 1.25,
    arc: Math.PI,
    gap: 1.5,
    orbs: 5,
  },
  {
    title: "A₅ 正十二面体",
    spawns: [["A5", 1], ["D4", 2], ["A4", 2]],
    depth: [4, 6],
    speed: 0.7,
    arc: 0.8,
    gap: 3,
    orbs: 3.5,
    boss: true,
  },
];

type Listener = () => void;

class Game {
  phase: Phase = "title";
  enemies: Enemy[] = [];
  orbs: Orb[] = [];
  life = MAX_LIFE;
  score = 0;
  best = 0;
  combo = 0;
  maxCombo = 0;
  kills = 0;
  perfects = 0;
  /** Waves cleared, counting from 0, across laps. */
  wave = 0;
  /** How many times round the list of waves. */
  lap = 0;
  /** The enemy the aim is on, as the renderer last said. */
  target: Enemy | null = null;
  /** Seconds until the gun and the e砲 are ready. */
  shotCooldown = 0;
  cannonCooldown = 0;
  /** The round the mouse button fires. */
  selected: Shot = "ccw";
  /** Seconds played. */
  time = 0;
  /** Between the last enemy of a wave and the first of the next. */
  clearing = false;

  #events: GameEvent[] = [];
  #commands: Command[] = [];
  #listeners = new Set<Listener>();
  #nextId = 1;
  #queue: SpeciesId[] = [];
  #spawnIn = 0;
  #breather = 0;
  #current: Wave = WAVES[0];

  constructor() {
    try {
      this.best =
        Number(globalThis.localStorage?.getItem("gun-shooter:best") ?? 0) || 0;
    } catch { /* storage may be unavailable */ }
  }

  /** Starts from wave one. */
  start(): void {
    this.phase = "playing";
    this.enemies = [];
    this.orbs = [];
    this.life = MAX_LIFE;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.kills = 0;
    this.perfects = 0;
    this.wave = 0;
    this.lap = 0;
    this.time = 0;
    this.target = null;
    this.shotCooldown = 0;
    this.cannonCooldown = 0;
    this.#events = [];
    this.#commands = [];
    this.#beginWave();
    this.#emit();
  }

  pause(): void {
    if (this.phase !== "playing") return;
    this.phase = "paused";
    this.#emit();
  }

  resume(): void {
    if (this.phase !== "paused") return;
    this.phase = "playing";
    this.#emit();
  }

  /** Picks the round the mouse button fires. */
  select(shot: Shot): void {
    if (this.selected === shot) return;
    this.selected = shot;
    this.#emit();
  }

  /** Cycles the selected round, for a mouse wheel. */
  cycle(step: 1 | -1): void {
    const i = SHOTS.indexOf(this.selected);
    this.select(SHOTS[(i + step + SHOTS.length) % SHOTS.length]);
  }

  /**
   * Asks to fire. The renderer resolves what it hits, because only the renderer knows where the
   * player is looking.
   */
  command(command: Command): void {
    if (this.phase === "playing") this.#commands.push(command);
  }

  /** The commands waiting since the last frame. */
  takeCommands(): Command[] {
    const out = this.#commands;
    this.#commands = [];
    return out;
  }

  /** The events since the last frame. */
  drain(): GameEvent[] {
    const out = this.#events;
    this.#events = [];
    return out;
  }

  /** The renderer saying what the aim is on. */
  aim(enemy: Enemy | null): void {
    if (this.target === enemy) return;
    this.target = enemy;
    this.#emit();
  }

  /**
   * One element round.
   *
   * @param shot Which round
   * @param enemy What it hit, or `null` for a miss
   * @returns Whether the gun was ready
   */
  fire(shot: Shot, enemy: Enemy | null): boolean {
    if (this.phase !== "playing" || this.shotCooldown > 0) return false;
    this.shotCooldown = SHOT_COOLDOWN;
    if (enemy === null || !enemy.alive) {
      this.#events.push({ type: "miss", shot });
      this.#emit();
      return true;
    }
    this.#turn(enemy, shot);
    this.#emit();
    return true;
  }

  /**
   * An element round at an orb: any round pops it.
   *
   * @param orb What the aim is on
   * @returns Whether the gun was ready
   */
  shootOrb(orb: Orb): boolean {
    if (this.phase !== "playing" || this.shotCooldown > 0) return false;
    this.shotCooldown = SHOT_COOLDOWN;
    this.#pop(orb);
    this.#emit();
    return true;
  }

  /**
   * The e砲: every enemy in the beam, at once.
   *
   * It goes through everything it hits. The ones at `e` are destroyed, and each after the first
   * doubles what the shot is worth; the ones that are not bounce it, and are knocked one turn
   * further round for it.
   *
   * @param hit The enemies in the beam, nearest first
   * @param orbs The orbs in it, which it pops on the way through
   * @returns Whether it was ready
   */
  cannon(hit: readonly Enemy[], orbs: readonly Orb[] = []): boolean {
    if (this.phase !== "playing" || this.cannonCooldown > 0) return false;
    this.cannonCooldown = CANNON_COOLDOWN;
    for (const orb of orbs) this.#pop(orb);

    const live = hit.filter((e) => e.alive);
    if (live.length === 0) {
      this.#events.push({ type: "miss", shot: "cannon" });
      this.#emit();
      return true;
    }

    const kills: Kill[] = [];
    const bounced: Enemy[] = [];
    for (const enemy of live) {
      if (enemy.state === 0) {
        this.combo += 1;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        const perfect = enemy.taken === enemy.start;
        const multi = 2 ** kills.length;
        const points = enemy.species.order * 10 * Math.min(this.combo, 10) *
          multi *
          (perfect ? 2 : 1);
        this.score += points;
        this.kills += 1;
        if (perfect) this.perfects += 1;
        enemy.alive = false;
        kills.push({ enemy, points, perfect });
      } else {
        bounced.push(enemy);
      }
    }
    if (bounced.length > 0) this.combo = 0;
    this.enemies = this.enemies.filter((e) => e.alive);
    this.#events.push({ type: "cannon", kills, bounced });
    // A bounce knocks the enemy on, as a turn of its own — after the beam, so the renderer draws
    // the ricochet and then the spin.
    for (const enemy of bounced) {
      const shot = SHOTS[Math.floor(Math.random() * SHOTS.length)];
      this.#turn(enemy, shot);
    }
    if (this.target !== null && !this.target.alive) this.target = null;
    this.#emit();
    return true;
  }

  /**
   * Moves time on.
   *
   * @param dt Seconds, already scaled by whatever slow motion the renderer is in
   */
  update(dt: number): void {
    if (this.phase !== "playing") return;
    this.time += dt;
    const wasReady = this.cannonCooldown <= 0;
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.cannonCooldown = Math.max(0, this.cannonCooldown - dt);
    let changed = !wasReady && this.cannonCooldown <= 0;

    // Arrivals.
    if (this.#queue.length > 0) {
      this.#spawnIn -= dt;
      if (this.#spawnIn <= 0) {
        this.#spawn(this.#queue.shift()!);
        this.#spawnIn = this.#current.gap;
      }
    }

    // Everyone closes in. One at `e` is stunned by it — a quarter of the speed — which is the
    // window the e砲 is for.
    for (const enemy of this.enemies) {
      const [x, y, z] = enemy.pos;
      const r = Math.hypot(x, z);
      const step = enemy.speed * dt * (enemy.state === 0 ? 0.25 : 1);
      const k = Math.max(0, r - step) / r;
      enemy.sway += dt;
      // A slow orbit on top of the approach, so the field is never a row of targets on rails.
      const orbit = Math.sin(enemy.sway * 0.7) * 0.12 * dt;
      const c = Math.cos(orbit);
      const s = Math.sin(orbit);
      const nx = x * k;
      const nz = z * k;
      enemy.pos = [
        nx * c - nz * s,
        y + Math.sin(enemy.sway * 1.3) * 0.25 * dt,
        nx * s + nz * c,
      ];
      if (
        Math.hypot(enemy.pos[0], enemy.pos[2]) <
          BREACH_RADIUS + enemy.radius * 0.5
      ) {
        enemy.alive = false;
        this.life -= enemy.boss ? 3 : 1;
        this.combo = 0;
        this.#events.push({ type: "breach", enemy });
        changed = true;
      }
    }
    if (this.enemies.some((e) => !e.alive)) {
      this.enemies = this.enemies.filter((e) => e.alive);
      if (this.target !== null && !this.target.alive) this.target = null;
    }

    // Orbs: fired on each enemy's own clock, flown straight, popped by any round.
    for (const enemy of this.enemies) {
      enemy.fireIn -= dt;
      if (enemy.fireIn <= 0) {
        this.#fireOrb(enemy);
        enemy.fireIn = (this.#current.orbs ?? Infinity) *
          (0.8 + Math.random() * 0.4);
      }
    }
    for (const orb of this.orbs) {
      orb.pos = [
        orb.pos[0] + orb.vel[0] * dt,
        orb.pos[1] + orb.vel[1] * dt,
        orb.pos[2] + orb.vel[2] * dt,
      ];
      const d = Math.hypot(
        orb.pos[0] - EYE[0],
        orb.pos[1] - EYE[1],
        orb.pos[2] - EYE[2],
      );
      if (d < ORB_HIT_RADIUS) {
        orb.alive = false;
        this.life -= 1;
        this.combo = 0;
        this.#events.push({ type: "struck", orb });
        changed = true;
      }
    }
    if (this.orbs.some((o) => !o.alive)) {
      this.orbs = this.orbs.filter((o) => o.alive);
    }

    if (this.life <= 0) {
      this.life = 0;
      this.phase = "over";
      if (this.score > this.best) {
        this.best = this.score;
        try {
          globalThis.localStorage?.setItem(
            "gun-shooter:best",
            String(this.best),
          );
        } catch { /* storage may be unavailable */ }
      }
      this.#events.push({ type: "over" });
      this.#emit();
      return;
    }

    // The wave is over once everyone has come and gone; a breath, then the next.
    if (
      this.#queue.length === 0 && this.enemies.length === 0 &&
      this.orbs.length === 0
    ) {
      if (this.#breather === 0) {
        this.#events.push({ type: "clear", wave: this.wave });
        this.clearing = true;
        this.#breather = 2.6;
        changed = true;
      } else {
        this.#breather -= dt;
        if (this.#breather <= 0) {
          this.#breather = 0;
          this.wave += 1;
          if (this.wave % WAVES.length === 0) this.lap += 1;
          this.#beginWave();
          changed = true;
        }
      }
    }

    if (changed) this.#emit();
  }

  /**
   * What the HUD says about the enemy under the crosshair: how far it is from home, what to do
   * next and where the green frame is — and, on the first two waves only, the exact next shot.
   */
  get guidance(): Guidance | null {
    const t = this.target;
    if (t === null) return null;
    const learning = this.wave < 2 && this.lap === 0;
    return {
      left: t.species.depth[t.state],
      guide: guide(t.species, t.state),
      next: learning ? (wayHome(t.species, t.state)[0] ?? null) : null,
    };
  }

  /** The wave's name, for the HUD. */
  get waveTitle(): string {
    return this.#current.title;
  }

  /** Tells the HUD to redraw for something that is not the game's — the mute switch. */
  notify(): void {
    this.#emit();
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #turn(enemy: Enemy, shot: Shot): void {
    const s = enemy.species;
    const from = s.elements[enemy.state];
    const before = s.depth[enemy.state];
    enemy.state = s.next[shot][enemy.state];
    enemy.taken += 1;
    this.#events.push({
      type: "turn",
      enemy,
      shot,
      from,
      to: s.elements[enemy.state],
      home: enemy.state === 0,
      left: s.depth[enemy.state],
      gain: before - s.depth[enemy.state],
    });
  }

  #beginWave(): void {
    this.clearing = false;
    this.#current = WAVES[this.wave % WAVES.length];
    this.#queue = this.#current.spawns.flatMap(([id, n]) =>
      Array<SpeciesId>(n).fill(id)
    );
    this.#spawnIn = 1.2;
    this.#breather = 0;
    this.#events.push({
      type: "wave",
      wave: this.wave,
      title: this.#current.title,
      boss: this.#current.boss === true,
    });
  }

  #spawn(id: SpeciesId): void {
    const w = this.#current;
    const species = SPECIES[id];
    const boss = id === "A5";
    // Each lap round the waves starts everyone a turn further from home, and a little faster.
    const lo = w.depth[0] + this.lap;
    const hi = w.depth[1] + this.lap;
    const d = lo + Math.floor(Math.random() * (hi - lo + 1));
    const choices = atDepth(species, d);
    const state = choices[Math.floor(Math.random() * choices.length)];

    // Straight ahead is -Z; the arc is either side of it.
    const yaw = (Math.random() * 2 - 1) * w.arc;
    const dist = SPAWN_DISTANCE + Math.random() * 6;
    const height = boss ? 7 : 1.8 + Math.random() * 4.5;
    const enemy: Enemy = {
      id: this.#nextId++,
      species,
      state,
      start: species.depth[state],
      taken: 0,
      pos: [-Math.sin(yaw) * dist, height, -Math.cos(yaw) * dist],
      radius: boss ? 4.6 : id === "S4" ? 2.1 : 2.3,
      speed: w.speed * (1 + 0.12 * this.lap) * (0.85 + Math.random() * 0.3),
      sway: Math.random() * 10,
      boss,
      alive: true,
      // The first shot comes a little after arriving, so an enemy is seen before it shoots.
      fireIn: w.orbs === undefined
        ? Infinity
        : w.orbs * (0.6 + Math.random() * 0.6),
    };
    this.enemies.push(enemy);
    this.#events.push({ type: "spawn", enemy });
  }

  #pop(orb: Orb): void {
    if (!orb.alive) return;
    orb.alive = false;
    this.score += ORB_POINTS;
    this.orbs = this.orbs.filter((o) => o.alive);
    this.#events.push({ type: "pop", orb, points: ORB_POINTS });
  }

  /** An enemy firing: an orb, straight at the player's eye. */
  #fireOrb(enemy: Enemy): void {
    const [x, y, z] = enemy.pos;
    const dx = EYE[0] - x;
    const dy = EYE[1] - y;
    const dz = EYE[2] - z;
    const l = Math.hypot(dx, dy, dz) || 1;
    const k = ORB_SPEED * (1 + 0.1 * this.lap) / l;
    const orb: Orb = {
      id: this.#nextId++,
      pos: [
        x + dx / l * enemy.radius,
        y + dy / l * enemy.radius,
        z + dz / l * enemy.radius,
      ],
      vel: [dx * k, dy * k, dz * k],
      alive: true,
    };
    this.orbs.push(orb);
    this.#events.push({ type: "orb", orb, from: enemy });
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

/** The one game. */
export const game = new Game();
