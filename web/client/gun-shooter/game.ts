/**
 * 群シューター's rules, and the one game every island and the renderer share.
 *
 * Everything that decides anything is here, on plain numbers: where the enemies are, which element
 * each one is in, which spot of the front one the joystick is on, what a shot does, when a wave
 * ends, the score. The renderer never decides — it reads this, draws it, and passes the player's
 * stick and buttons on. The HUD island never decides either; it reads this and shows it.
 *
 * The turret stands at the origin and does not move. Enemies come down one lane towards it in single
 * file, each in a random element of its group, and only the one at the front can be shot. The
 * joystick picks a spot on it — the middle of a face, a corner, the middle of an edge — and a round
 * turns it one step about the axis through that spot (see `groups.ts`). Once it is at `e` — its `e`
 * face upright and facing the turret — the e砲 destroys it. The e砲 at anything else bounces off,
 * and the enemy turns slowly once round on the spot, back to where it was, while it keeps coming
 * and cannot be fired at. An enemy that reaches the turret costs a life.
 *
 * What the renderer needs to animate comes out as events, drained once a frame: a shot landing is
 * one rotation from one element to another, and the renderer spins the mesh between the two. The
 * state has already moved on by then, so a player firing fast is never waiting for an animation.
 */

import {
  type Answer,
  answer,
  atDepth,
  axisOf,
  reachable,
  SPECIES,
  type Species,
  type SpeciesId,
  type Spin,
  spotDir,
} from "./groups.ts";
import type { Quat, Vec3 } from "./quat.ts";

/** Where rounds leave the turret. */
export const TURRET: Vec3 = [0, 1.6, 0];

/** How close an enemy may come before it hits the turret. */
export const BREACH_RADIUS = 4;

/** Where the lane starts: enemies join it here, at the far end of the field. */
export const LANE_START = -44;

/** Half the lane's width: as wide as the biggest enemy on it, and a little more. */
export const LANE_HALF = 10;

/** How far to either side an enemy comes in from before it joins the lane. */
export const ENTRY_SIDE = 34;

/**
 * How big each kind of enemy is: its radius. Big, since the one at the front is what the player
 * reads and picks spots on; the lane has room for two or three of them at a time.
 */
const RADIUS: Readonly<Record<SpeciesId, number>> = {
  D3: 9,
  D4: 9,
  A4: 9,
  S4: 8.1,
  A5: 10.5,
};

/** Seconds from appearing at the side to settling on the lane. */
export const ENTRY_TIME = 2.6;

/** How many hits the turret can take. */
export const MAX_LIFE = 5;

/** Seconds between rounds. */
export const SHOT_COOLDOWN = 0.12;

/** Seconds the e砲 needs to recharge. */
export const CANNON_COOLDOWN = 0.7;

/** Seconds an enemy spends turning once round on the spot after an e砲 that missed. */
export const WHIRL_TIME = 2.4;

/** How many times the boss has to be brought home and shot before it breaks. */
const BOSS_LIVES = 3;

/** How far a stick has to be pushed before it leaves the middle. */
const DEAD_ZONE = 0.22;

/** An enemy on the field. */
export interface Enemy {
  id: number;
  species: Species;
  /** Its element, as an index into `species.elements`. 0 is `e`. */
  state: number;
  /** How far from `e` it started, in shots — a kill in exactly that many is perfect. */
  start: number;
  /** Shots it has taken since it last started. */
  taken: number;
  /** Where it is. */
  pos: Vec3;
  /** How big it is drawn. */
  radius: number;
  /** Units per second down the lane. */
  speed: number;
  /**
   * How far through coming in from the side it is, 0 to 1. Until it reaches 1 it is not on the
   * lane: it tumbles, it cannot be shot, and it holds up nobody.
   */
  entry: number;
  /** Which side it comes in from: -1 left, 1 right. */
  side: -1 | 1;
  /**
   * Seconds left of turning once round on the spot, after an e砲 that missed. It ends where it
   * began, and nothing can be fired at it until it has.
   */
  whirl: number;
  boss: boolean;
  /** How many more times it has to be finished. 1 for everything but the boss. */
  lives: number;
  alive: boolean;
}

/** What the stick is on: the enemy at the front of the lane, and a spot of it. */
export interface Aim {
  enemy: Enemy;
  /** An index into `enemy.species.spots`. Always one a round can reach. */
  spot: number;
}

/**
 * How much help the field gives, by wave.
 *
 * - `2`: the front enemy shows the spot to hit and which way.
 * - `1`: it shows the axis it is turned about; which end, and which way, is the player's.
 * - `0`: nothing but the enemy.
 */
export type HintLevel = 0 | 1 | 2;

/** What the renderer is told happened. */
export type GameEvent =
  | { type: "spawn"; enemy: Enemy }
  | { type: "land"; enemy: Enemy }
  | {
    type: "turn";
    enemy: Enemy;
    spin: Spin;
    spot: number;
    from: Quat;
    to: Quat;
    home: boolean;
    /** Shots home, after this one. */
    left: number;
    /** How many closer this shot brought it: 1, or -1 for a step the wrong way. */
    gain: number;
  }
  | { type: "scramble"; enemy: Enemy; from: Quat; to: Quat }
  | { type: "miss"; what: Spin | "cannon" }
  | { type: "cannon"; kill: Kill | null; bounced: Enemy | null }
  | { type: "breach"; enemy: Enemy }
  | { type: "wave"; wave: number; title: string; boss: boolean }
  | { type: "clear"; wave: number }
  | { type: "over" };

/** The enemy the e砲 finished, and what it was worth. */
export interface Kill {
  enemy: Enemy;
  points: number;
  perfect: boolean;
  /** Whether it broke. The boss only does on its last life; before that it scrambles again. */
  broken: boolean;
}

/** What a button or key asked for, done when the frame gets to it. */
export type Command = Spin | "cannon";

export type Phase = "title" | "playing" | "paused" | "over";

/** One wave: who comes, how far from home, how fast, and how often. */
interface Wave {
  title: string;
  /** Kinds and counts, spawned in this order. */
  spawns: readonly (readonly [SpeciesId, number])[];
  /** How many shots from `e` each enemy starts: at least, at most. */
  depth: readonly [number, number];
  speed: number;
  /** Seconds between arrivals. */
  gap: number;
  boss?: boolean;
}

const WAVES: readonly Wave[] = [
  {
    title: "D₄ 正方形",
    spawns: [["D4", 4]],
    depth: [1, 2],
    speed: 1.3,
    gap: 5,
  },
  {
    title: "D₃ 正三角形",
    spawns: [["D3", 5]],
    depth: [1, 1],
    speed: 1.35,
    gap: 4.6,
  },
  {
    title: "A₄ 正四面体",
    spawns: [["A4", 5]],
    depth: [1, 1],
    speed: 1.45,
    gap: 4.4,
  },
  {
    title: "混成部隊",
    spawns: [["D3", 2], ["A4", 3], ["D4", 3]],
    depth: [1, 2],
    speed: 1.55,
    gap: 3.8,
  },
  {
    title: "S₄ 立方体",
    spawns: [["S4", 5]],
    depth: [1, 2],
    speed: 1.4,
    gap: 4.6,
  },
  {
    title: "総力戦",
    spawns: [["D4", 2], ["S4", 3], ["A4", 3], ["D3", 2]],
    depth: [1, 2],
    speed: 1.6,
    gap: 3.4,
  },
  {
    title: "A₅ 正十二面体",
    spawns: [["S4", 2], ["A4", 2], ["A5", 1]],
    depth: [2, 2],
    speed: 0.9,
    gap: 4.4,
    boss: true,
  },
];

type Listener = () => void;

class Game {
  phase: Phase = "title";
  /** Everyone on the field, in the order they came: the lane's front first. */
  enemies: Enemy[] = [];
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
  /** What the stick is on. */
  aim: Aim | null = null;
  /**
   * Where the stick points, in the front enemy's frame: `+Z` at the turret, `+X` to the player's
   * right, `+Y` up. The aim is whichever reachable spot lies closest to it, so after a turn the
   * stick stays where it was and the aim moves to whatever spot is there now.
   */
  cursor: Vec3 = [0, 0, 1];
  /** Seconds until the gun and the e砲 are ready. */
  shotCooldown = 0;
  cannonCooldown = 0;
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
  #side: -1 | 1 = 1;

  constructor() {
    try {
      this.best =
        Number(globalThis.localStorage?.getItem("gun-shooter:best") ?? 0) || 0;
    } catch { /* storage may be unavailable */ }
  }

  /** The enemy at the front of the lane: the only one that can be shot. */
  get front(): Enemy | null {
    const e = this.enemies[0];
    return e !== undefined && e.entry >= 1 ? e : null;
  }

  /** Starts from wave one. */
  start(): void {
    this.phase = "playing";
    this.enemies = [];
    this.life = MAX_LIFE;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.kills = 0;
    this.perfects = 0;
    this.wave = 0;
    this.lap = 0;
    this.time = 0;
    this.aim = null;
    this.cursor = [0, 0, 1];
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

  /** A button or key: fire, once the frame gets to it. */
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

  /**
   * An analogue stick: a finger's joystick, or the mouse. `(0, 0)` is the middle of the front
   * enemy, as it faces the turret; a full push to the side is its rim.
   *
   * @param x Rightwards, -1 to 1
   * @param y Upwards, -1 to 1
   */
  steer(x: number, y: number): void {
    const m = Math.hypot(x, y);
    if (m < DEAD_ZONE) {
      this.cursor = [0, 0, 1];
    } else {
      const t = Math.min(1, (m - DEAD_ZONE) / (1 - DEAD_ZONE)) * Math.PI / 2;
      this.cursor = [
        Math.sin(t) * x / m,
        Math.sin(t) * y / m,
        Math.cos(t),
      ];
    }
    this.#retarget();
  }

  /**
   * A step of a digital stick: the keyboard. The aim moves to the nearest reachable spot that way,
   * as the front enemy looks from the turret.
   *
   * @param dx -1 left, 1 right
   * @param dy -1 down, 1 up
   */
  nudge(dx: number, dy: number): void {
    const f = this.front;
    if (f === null || this.aim === null) return;
    const s = f.species;
    const [px, py] = spotDir(s, f.state, this.aim.spot);
    let best = -1;
    let bestCost = Infinity;
    s.spots.forEach((_, i) => {
      if (i === this.aim!.spot || !reachable(s, f.state, i)) return;
      const [qx, qy] = spotDir(s, f.state, i);
      const vx = qx - px;
      const vy = qy - py;
      const along = vx * dx + vy * dy;
      const off = Math.abs(vx * dy - vy * dx);
      // Only spots that way, within a wide cone; the nearest, straighter first. On a hexagon of
      // spots — D₃ — the middle is exactly as near as the next corner round, so a tie goes
      // inwards: from any corner, some key leads straight back to the middle.
      if (along < 0.05 || off > along * 1.8) return;
      const cost = Math.hypot(vx, vy) + off * 0.5 + Math.hypot(qx, qy) * 0.01;
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    });
    if (best < 0) return;
    this.cursor = spotDir(s, f.state, best);
    this.#retarget();
  }

  /**
   * One round, at the spot the stick is on.
   *
   * @param spin Which way it turns what it hits
   * @returns Whether the gun was ready
   */
  fire(spin: Spin): boolean {
    if (this.phase !== "playing" || this.shotCooldown > 0) return false;
    this.shotCooldown = SHOT_COOLDOWN;
    const aim = this.aim;
    if (aim !== null && aim.enemy.whirl > 0) return false;
    if (aim === null || !aim.enemy.alive) {
      this.#events.push({ type: "miss", what: spin });
    } else {
      this.#turn(aim.enemy, aim.spot, spin);
      this.#retarget();
    }
    this.#emit();
    return true;
  }

  /**
   * The e砲, at the front of the lane. At `e` it finishes the enemy; at anything else it bounces
   * off, and the enemy turns once round on the spot for `WHIRL_TIME`, out of reach meanwhile.
   *
   * @returns Whether it was ready
   */
  cannon(): boolean {
    if (this.phase !== "playing" || this.cannonCooldown > 0) return false;
    const enemy = this.front;
    if (enemy !== null && enemy.whirl > 0) return false;
    this.cannonCooldown = CANNON_COOLDOWN;
    if (enemy === null) {
      this.#events.push({ type: "miss", what: "cannon" });
      this.#emit();
      return true;
    }

    if (enemy.state !== 0) {
      this.combo = 0;
      enemy.whirl = WHIRL_TIME;
      this.#events.push({ type: "cannon", kill: null, bounced: enemy });
      this.#emit();
      return true;
    }

    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const perfect = enemy.taken === enemy.start;
    enemy.lives -= 1;
    const broken = enemy.lives <= 0;
    const points = enemy.species.order * 10 * Math.min(this.combo, 10) *
      (perfect ? 2 : 1) * (enemy.boss && broken ? 5 : 1);
    this.score += points;
    if (perfect) this.perfects += 1;
    if (broken) {
      this.kills += 1;
      enemy.alive = false;
      this.enemies = this.enemies.filter((e) => e.alive);
    }
    this.#events.push({
      type: "cannon",
      kill: { enemy, points, perfect, broken },
      bounced: null,
    });
    // A boss that survives scrambles again, after the beam, so the renderer draws the hit and
    // then the spin.
    if (!broken) this.#scramble(enemy);
    this.#retarget();
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
    const frontBefore = this.front;

    // Arrivals, once the far end of the lane is clear enough to take one.
    if (this.#queue.length > 0) {
      this.#spawnIn -= dt;
      const last = this.enemies[this.enemies.length - 1];
      const room = last === undefined ||
        (last.entry >= 1 &&
          last.pos[2] >
            LANE_START + last.radius + RADIUS[this.#queue[0]] + 1.2);
      if (this.#spawnIn <= 0 && room) {
        this.#spawn(this.#queue.shift()!);
        this.#spawnIn = this.#current.gap;
      }
    }

    // Coming in from the side, then down the lane in file. Nobody passes the one in front, and
    // the front one, at `e`, is stunned by it — a quarter of the speed — which is the window the
    // e砲 is for.
    let ahead: Enemy | null = null;
    for (const enemy of this.enemies) {
      if (enemy.entry < 1) {
        enemy.entry = Math.min(1, enemy.entry + dt / ENTRY_TIME);
        const t = enemy.entry;
        const ease = 1 - (1 - t) ** 3;
        enemy.pos = [
          enemy.side * ENTRY_SIDE * (1 - ease),
          enemy.pos[1],
          LANE_START - 4 * (1 - ease),
        ];
        if (enemy.entry >= 1) {
          this.#events.push({ type: "land", enemy });
          changed = true;
        }
        ahead = enemy;
        continue;
      }
      if (enemy.whirl > 0) {
        enemy.whirl = Math.max(0, enemy.whirl - dt);
        if (enemy.whirl === 0) changed = true;
      }
      const stunned = ahead === null && enemy.state === 0;
      let z = enemy.pos[2] + enemy.speed * dt * (stunned ? 0.25 : 1);
      if (ahead !== null && ahead.entry >= 1) {
        z = Math.min(z, ahead.pos[2] - (ahead.radius + enemy.radius + 1.2));
      }
      enemy.pos = [0, enemy.pos[1], z];
      if (ahead === null && -z - enemy.radius * 0.6 < BREACH_RADIUS) {
        enemy.alive = false;
        this.life -= enemy.boss ? 3 : 1;
        this.combo = 0;
        this.#events.push({ type: "breach", enemy });
        changed = true;
      }
      ahead = enemy;
    }
    if (this.enemies.some((e) => !e.alive)) {
      this.enemies = this.enemies.filter((e) => e.alive);
    }

    // A new enemy at the front: the stick starts from its middle.
    const front = this.front;
    if (front !== frontBefore) {
      this.cursor = [0, 0, 1];
      changed = true;
    }
    if (this.#retarget(false)) changed = true;

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
    if (this.#queue.length === 0 && this.enemies.length === 0) {
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

  /** How much the field shows, this wave. */
  get hintLevel(): HintLevel {
    if (this.lap > 0) return 0;
    return this.wave < 2 ? 2 : this.wave < 4 ? 1 : 0;
  }

  /** The shot the hint shows for an enemy, when this wave shows one. */
  hintFor(enemy: Enemy): Answer | null {
    return this.hintLevel === 2 ? answer(enemy.species, enemy.state) : null;
  }

  /** The axis an enemy is turned about, in its own frame, when this wave shows it. */
  axisFor(enemy: Enemy): Vec3 | null {
    if (this.hintLevel !== 1 || enemy.state === 0) return null;
    return axisOf(enemy.species.elements[enemy.state]).axis;
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

  /**
   * Puts the aim on the reachable spot of the front enemy nearest the cursor.
   *
   * @param emit Whether to tell the HUD straight away
   * @returns Whether the aim changed
   */
  #retarget(emit = true): boolean {
    const f = this.front;
    let next: Aim | null = null;
    if (f !== null) {
      let best = -1;
      let bestDot = -Infinity;
      const [cx, cy, cz] = this.cursor;
      f.species.spots.forEach((_, i) => {
        if (!reachable(f.species, f.state, i)) return;
        const [x, y, z] = spotDir(f.species, f.state, i);
        const d = x * cx + y * cy + z * cz;
        if (d > bestDot + 1e-9) {
          bestDot = d;
          best = i;
        }
      });
      if (best >= 0) next = { enemy: f, spot: best };
    }
    const a = this.aim;
    const same = a === next ||
      (a !== null && next !== null && a.enemy === next.enemy &&
        a.spot === next.spot);
    if (same) return false;
    this.aim = next;
    if (emit) this.#emit();
    return true;
  }

  #turn(enemy: Enemy, spot: number, spin: Spin): void {
    const s = enemy.species;
    const from = s.elements[enemy.state];
    const before = s.depth[enemy.state];
    enemy.state = s.next[spin][spot][enemy.state];
    enemy.taken += 1;
    this.#events.push({
      type: "turn",
      enemy,
      spin,
      spot,
      from,
      to: s.elements[enemy.state],
      home: enemy.state === 0,
      left: s.depth[enemy.state],
      gain: before - s.depth[enemy.state],
    });
  }

  /** A surviving boss: a new element, as far from home as it started. */
  #scramble(enemy: Enemy): void {
    const s = enemy.species;
    const from = s.elements[enemy.state];
    const choices = atDepth(s, s.diameter);
    enemy.state = choices[Math.floor(Math.random() * choices.length)];
    enemy.start = s.depth[enemy.state];
    enemy.taken = 0;
    this.#events.push({
      type: "scramble",
      enemy,
      from,
      to: s.elements[enemy.state],
    });
  }

  #beginWave(): void {
    this.clearing = false;
    this.#current = WAVES[this.wave % WAVES.length];
    this.#queue = this.#current.spawns.flatMap(([id, n]) =>
      Array<SpeciesId>(n + this.lap).fill(id)
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
    // Each lap round the waves starts everyone further from home, and a little faster.
    const lo = Math.min(w.depth[0] + this.lap, species.diameter);
    const hi = Math.min(w.depth[1] + this.lap, species.diameter);
    const d = lo + Math.floor(Math.random() * (hi - lo + 1));
    const choices = atDepth(species, d);
    const state = choices[Math.floor(Math.random() * choices.length)];

    const radius = RADIUS[id];
    // They come in from alternate sides, so no two in a row cross the same way.
    this.#side = this.#side === 1 ? -1 : 1;
    const enemy: Enemy = {
      id: this.#nextId++,
      species,
      state,
      start: species.depth[state],
      taken: 0,
      pos: [
        this.#side * ENTRY_SIDE,
        radius + 0.9,
        LANE_START - 4,
      ],
      radius,
      speed: w.speed * (1 + 0.15 * this.lap),
      entry: 0,
      side: this.#side,
      whirl: 0,
      boss,
      lives: boss ? BOSS_LIVES : 1,
      alive: true,
    };
    this.enemies.push(enemy);
    this.#events.push({ type: "spawn", enemy });
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

/** The one game. */
export const game = new Game();
