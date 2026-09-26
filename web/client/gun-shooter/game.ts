/**
 * 群シューター's rules, and the one game every island and the renderer share.
 *
 * Everything that decides anything is here, on plain numbers: where the enemies are, which element
 * each one is in, what a shot does, when a wave ends, the score. The renderer never decides — it
 * reads this, draws it, and turns the player's pointer into "this round at that spot of that
 * enemy". The HUD island never decides either; it reads this and shows it.
 *
 * The turret stands at the origin and does not move. Enemies come across the field towards it,
 * each in a random element of its group. A round turns the enemy it hits one step about the axis
 * through the spot it hit (see `groups.ts`); once an enemy is at `e` — its `e` face upright and
 * facing the turret — the e砲 destroys it. The e砲 at anything else bounces off and knocks the
 * enemy one more step round. An enemy that reaches the turret costs a life.
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
  SPINS,
} from "./groups.ts";
import type { Quat, Vec3 } from "./quat.ts";

/** Where rounds leave the turret, and where enemy fire is aimed. */
export const TURRET: Vec3 = [0, 1.6, 0];

/** How close an enemy may come before it hits the turret. */
export const BREACH_RADIUS = 4;

/** How many hits the turret can take. */
export const MAX_LIFE = 5;

/** Seconds between rounds. */
export const SHOT_COOLDOWN = 0.12;

/** Seconds the e砲 needs to recharge. */
export const CANNON_COOLDOWN = 0.7;

/** How many times the boss has to be brought home and shot before it breaks. */
const BOSS_LIVES = 3;

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
  /** How big it is drawn, and how big a target it is. */
  radius: number;
  /** Units per second towards the turret. */
  speed: number;
  /** The phase of its sideways drift. */
  sway: number;
  boss: boolean;
  /** How many more times it has to be finished. 1 for everything but the boss. */
  lives: number;
  alive: boolean;
  /** Seconds until it next fires an orb, or `Infinity` in a wave where nobody does. */
  fireIn: number;
}

/** An energy orb an enemy fired at the turret. Any round pops it. */
export interface Orb {
  id: number;
  pos: Vec3;
  /** Units per second. */
  vel: Vec3;
  alive: boolean;
}

/** What the pointer is on: an enemy, and the spot of it a round would land on. */
export interface Aim {
  enemy: Enemy;
  /** An index into `enemy.species.spots`. */
  spot: number;
  /** Whether a round from the turret can get there. */
  reachable: boolean;
}

/**
 * How much help the field gives, by wave.
 *
 * - `2`: every enemy shows the spot to hit and which way.
 * - `1`: every enemy shows the axis it is turned about; which end, and which way, is the player's.
 * - `0`: nothing but the enemy.
 */
export type HintLevel = 0 | 1 | 2;

/** How close an orb gets before it hits. */
const ORB_HIT_RADIUS = 1.8;

/** How fast an orb flies. */
const ORB_SPEED = 8;

/** What popping one is worth. */
const ORB_POINTS = 25;

/** What the renderer is told happened. */
export type GameEvent =
  | { type: "spawn"; enemy: Enemy }
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
  | { type: "orb"; orb: Orb; from: Enemy }
  | { type: "pop"; orb: Orb; points: number }
  | { type: "struck"; orb: Orb }
  | { type: "miss"; what: Spin | "cannon" | "far" }
  | { type: "cannon"; kills: Kill[]; bounced: Enemy[] }
  | { type: "breach"; enemy: Enemy }
  | { type: "wave"; wave: number; title: string; boss: boolean }
  | { type: "clear"; wave: number }
  | { type: "over" };

/** One enemy the e砲 finished, and what it was worth. */
export interface Kill {
  enemy: Enemy;
  points: number;
  perfect: boolean;
  /** Whether it broke. The boss only does on its last life; before that it scrambles again. */
  broken: boolean;
}

/** What a HUD button asked for, resolved against the aim when the frame gets to it. */
export type Command = Spin | "cannon";

export type Phase = "title" | "playing" | "paused" | "over";

/** One wave: who comes, how far from home, how fast, and how spread out. */
interface Wave {
  title: string;
  /** Kinds and counts, spawned in this order. */
  spawns: readonly (readonly [SpeciesId, number])[];
  /** How many shots from `e` each enemy starts: at least, at most. */
  depth: readonly [number, number];
  speed: number;
  /** How far either side of the middle they come from. */
  spread: number;
  /** Seconds between arrivals. */
  gap: number;
  boss?: boolean;
  /** Seconds between each enemy's orbs, or nothing for a wave where they hold fire. */
  orbs?: number;
}

const WAVES: readonly Wave[] = [
  {
    title: "D₃ 正三角形",
    spawns: [["D3", 4]],
    depth: [1, 1],
    speed: 1.2,
    spread: 9,
    gap: 3,
  },
  {
    title: "D₄ 正方形",
    spawns: [["D4", 5]],
    depth: [1, 2],
    speed: 1.25,
    spread: 12,
    gap: 2.6,
  },
  {
    title: "A₄ 正四面体",
    spawns: [["A4", 5]],
    depth: [1, 1],
    speed: 1.3,
    spread: 14,
    gap: 2.6,
    orbs: 9,
  },
  {
    title: "混成部隊",
    spawns: [["D3", 2], ["A4", 3], ["D4", 3]],
    depth: [1, 2],
    speed: 1.4,
    spread: 16,
    gap: 2,
    orbs: 8,
  },
  {
    title: "S₄ 立方体",
    spawns: [["S4", 5]],
    depth: [1, 2],
    speed: 1.25,
    spread: 15,
    gap: 2.8,
    orbs: 8,
  },
  {
    title: "総力戦",
    spawns: [["D4", 2], ["S4", 3], ["A4", 3], ["D3", 2]],
    depth: [1, 2],
    speed: 1.45,
    spread: 18,
    gap: 1.7,
    orbs: 6.5,
  },
  {
    title: "A₅ 正十二面体",
    spawns: [["A5", 1], ["S4", 2], ["A4", 2]],
    depth: [2, 2],
    speed: 0.75,
    spread: 12,
    gap: 3.2,
    orbs: 5,
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
  /** What the pointer is on, as the renderer last said. */
  aim: Aim | null = null;
  /** Seconds until the gun and the e砲 are ready. */
  shotCooldown = 0;
  cannonCooldown = 0;
  /** Seconds played. */
  time = 0;
  /** Between the last enemy of a wave and the first of the next. */
  clearing = false;
  /**
   * How wide the field is, as a share of the full width: the renderer narrows it on a portrait
   * screen, so enemies come from where a tall phone can see them at a size it can read.
   */
  fieldScale = 1;

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
    this.aim = null;
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

  /** A HUD button: fire at whatever the aim is on, once the frame gets to it. */
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

  /** The renderer saying what the pointer is on. */
  setAim(aim: Aim | null): void {
    const a = this.aim;
    if (
      a === aim ||
      (a !== null && aim !== null && a.enemy === aim.enemy &&
        a.spot === aim.spot && a.reachable === aim.reachable)
    ) {
      return;
    }
    this.aim = aim;
    this.#emit();
  }

  /**
   * One round.
   *
   * @param spin Which way it turns what it hits
   * @param aim What it hits, or `null` for a miss
   * @returns Whether the gun was ready
   */
  fire(spin: Spin, aim: Aim | null): boolean {
    if (this.phase !== "playing" || this.shotCooldown > 0) return false;
    this.shotCooldown = SHOT_COOLDOWN;
    if (aim === null || !aim.enemy.alive) {
      this.#events.push({ type: "miss", what: spin });
    } else if (!reachable(aim.enemy.species, aim.enemy.state, aim.spot)) {
      // The far side: the round glances off, and says why.
      this.#events.push({ type: "miss", what: "far" });
    } else {
      this.#turn(aim.enemy, aim.spot, spin);
    }
    this.#emit();
    return true;
  }

  /**
   * A round at an orb: any round pops it.
   *
   * @param orb What the pointer is on
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
   * It goes through everything it hits. The ones at `e` are finished, and each after the first
   * doubles what the shot is worth; the ones that are not bounce it, and are knocked a step round
   * for it.
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
      this.#events.push({ type: "miss", what: "cannon" });
      this.#emit();
      return true;
    }

    const kills: Kill[] = [];
    const bounced: Enemy[] = [];
    for (const enemy of live) {
      if (enemy.state !== 0) {
        bounced.push(enemy);
        continue;
      }
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const perfect = enemy.taken === enemy.start;
      const multi = 2 ** kills.length;
      enemy.lives -= 1;
      const broken = enemy.lives <= 0;
      const points = enemy.species.order * 10 * Math.min(this.combo, 10) *
        multi * (perfect ? 2 : 1) * (enemy.boss && broken ? 5 : 1);
      this.score += points;
      if (perfect) this.perfects += 1;
      kills.push({ enemy, points, perfect, broken });
      if (broken) {
        this.kills += 1;
        enemy.alive = false;
      }
    }
    if (bounced.length > 0) this.combo = 0;
    this.enemies = this.enemies.filter((e) => e.alive);
    this.#events.push({ type: "cannon", kills, bounced });
    // A boss that survives scrambles again; a bounce knocks the enemy on — both after the beam,
    // so the renderer draws the hit and then the spin.
    for (const kill of kills) if (!kill.broken) this.#scramble(kill.enemy);
    for (const enemy of bounced) {
      const s = enemy.species;
      const spots = s.spots.flatMap((_, i) =>
        reachable(s, enemy.state, i) ? [i] : []
      );
      const spot = spots[Math.floor(Math.random() * spots.length)];
      this.#turn(enemy, spot, SPINS[Math.floor(Math.random() * 2)]);
    }
    if (this.aim !== null && !this.aim.enemy.alive) this.aim = null;
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
      const r = Math.hypot(x, z) || 1;
      const step = enemy.speed * dt * (enemy.state === 0 ? 0.25 : 1);
      enemy.sway += dt;
      // A slow weave across the approach, so the field is never a row of targets on rails.
      const across = Math.cos(enemy.sway * 0.6) * 0.8 * dt;
      enemy.pos = [
        x - (x / r) * step + (-z / r) * across,
        y,
        z - (z / r) * step + (x / r) * across,
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
      if (this.aim !== null && !this.aim.enemy.alive) this.aim = null;
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
        orb.pos[0] - TURRET[0],
        orb.pos[1] - TURRET[1],
        orb.pos[2] - TURRET[2],
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

    // Straight ahead is -Z; they come from a band across the far side of the field.
    const radius = boss ? 4.6 : id === "S4" ? 2.7 : 3;
    const enemy: Enemy = {
      id: this.#nextId++,
      species,
      state,
      start: species.depth[state],
      taken: 0,
      pos: [
        (Math.random() * 2 - 1) * w.spread * this.fieldScale,
        radius + (boss ? 1.5 : 0.8 + Math.random() * 1.2),
        -(boss ? 44 : 40 + Math.random() * 6),
      ],
      radius,
      speed: w.speed * (1 + 0.15 * this.lap) * (0.85 + Math.random() * 0.3),
      sway: Math.random() * 10,
      boss,
      lives: boss ? BOSS_LIVES : 1,
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

  /** An enemy firing: an orb, straight at the turret. */
  #fireOrb(enemy: Enemy): void {
    const [x, y, z] = enemy.pos;
    const dx = TURRET[0] - x;
    const dy = TURRET[1] - y;
    const dz = TURRET[2] - z;
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
