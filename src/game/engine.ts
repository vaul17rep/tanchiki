import { sound } from "./audio";
import { Bot, type BotInput, type BotKind } from "./bot";
import type { Difficulty, GameConfig } from "./config";
import { MAPS, MAP_COUNT, FULL, type Bounds, type Rect } from "./maps";
import { Nav } from "./nav";
import { Walls, type Brick } from "./walls";
import { POWER_COLORS, RARE_TYPES, Sprites, type PowerType } from "./sprites";
import {
  ENEMY,
  REWARD_IDS,
  bossHp,
  enemyHp,
  genObstacles,
  stageBounds,
  waveSpec,
  type RewardId,
  type Special,
  type WaveSpec,
} from "./arcade";

/* ================================================================== */
/*  NEON DUEL — движок арены                                          */
/* ================================================================== */

export const W = 1280;
export const H = 720;
const BULLET_SPEED = 480;
const TURN_RATE = 6.5;
const TANK_SPEED = 195;
const REWARD_MS = 8000;
const BULLET_R = 5;
const DUEL_TIME = 60;
const CROWD_TIME = 90;
const PLAYER_BULLETS = 5;
const BOT_BULLETS = 3;
const BEST_KEY = "neon-duel-arcade-best-v1";

interface PadInput {
  x: number;
  y: number;
  fire: boolean;
}

type Phase = "countdown" | "play" | "roundover" | "gameover" | "reward";

export interface FxState {
  shield: boolean;
  shieldLeft: number;
  rapidLeft: number;
  speedLeft: number;
  frozenLeft: number;
  tripleLeft: number;
}

export interface TankUi {
  kind: "human" | "bot";
  /** номер среди людей или среди ботов, с 1 */
  n: number;
  color: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  team: number;
  fx: FxState;
}

export interface ArcadeUi {
  wave: number;
  left: number;
  score: number;
  combo: number;
  comboPct: number;
  kills: number;
  best: { wave: number; score: number };
  newBest: boolean;
  special: Special | null;
  boss: boolean;
  bossHp: number;
  bossMax: number;
  rewards: RewardId[] | null;
  rewardPct: number;
  intro: boolean;
  upgrades: Record<RewardId, number>;
}

export interface UiState {
  phase: Phase;
  paused: boolean;
  countdown: number; // 3,2,1 / 0 = «БОЙ!» / -1 = ничего
  timeSec: number;
  suddenDeath: boolean;
  sdBanner: boolean;
  tanks: TankUi[];
  humans: number;
  mode: GameConfig["mode"];
  scores: number[];
  round: number;
  winner: number; // команда, -1 нет
  roundWinner: number; // -1 нет (ничья, если фаза roundover)
  winScore: number;
  arcade: ArcadeUi | null;
}

interface Tank {
  id: number;
  team: number;
  human: boolean;
  hidx: number;
  n: number;
  kind: BotKind;
  r: number;
  speedMul: number;
  fireMul: number;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  cap: number;
  alive: boolean;
  cooldown: number;
  recoil: number;
  shieldUntil: number;
  rapidUntil: number;
  speedUntil: number;
  frozenUntil: number;
  tripleLeft: number;
  live: number;
  base: string;
  glow: string;
  dark: string;
  bot: Bot | null;
  charging: boolean;
  aimAngle: number;
  dashUntil: number;
  nextFan: number;
  nextSummon: number;
  nextDash: number;
  bornAt: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: Tank;
  ownerId: number;
  team: number;
  born: number;
  bounces: number;
  maxBounces: number;
  trail: { x: number; y: number }[];
  alive: boolean;
  /** пока пуля не вышла из зоны своего танка, владелец неуязвим */
  safe: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
}

interface PowerUp {
  x: number;
  y: number;
  type: PowerType;
  rare: boolean;
  born: number;
  expire: number;
  life: number;
}

interface Mine {
  x: number;
  y: number;
  armAt: number;
}

interface Warn {
  x: number;
  y: number;
  kind: BotKind;
  at: number;
  mirror: boolean;
}

const OB_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#818cf8", "#22d3ee", "#f472b6", "#a78bfa", "#38bdf8", "#e879f9"];

const HUMAN_LOOK = [
  { base: "#0891b2", glow: "#22d3ee", dark: "#0c3644" },
  { base: "#be185d", glow: "#f472b6", dark: "#47122f" },
];
const BOT_LOOK = [
  { base: "#b91c1c", glow: "#f87171", dark: "#450a0a" },
  { base: "#b45309", glow: "#fbbf24", dark: "#451a03" },
  { base: "#15803d", glow: "#4ade80", dark: "#052e16" },
  { base: "#6d28d9", glow: "#a78bfa", dark: "#2e1065" },
  { base: "#c2410c", glow: "#fb923c", dark: "#431407" },
];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

function rotToward(cur: number, target: number, maxStep: number) {
  let d = (target - cur) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadBest(): { wave: number; score: number } {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw) {
      const b = JSON.parse(raw);
      if (typeof b.wave === "number" && typeof b.score === "number") return b;
    }
  } catch {
    /* хранилище недоступно */
  }
  return { wave: 0, score: 0 };
}

/* ================================================================== */

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private clock = 0; // мс активного времени (не течёт на паузе)
  private scale = 1;
  private ro: ResizeObserver | null = null;
  private onUi: (u: UiState) => void;

  private keys = new Set<string>();
  private destroyed = false;

  private cfg: GameConfig;
  private arcade: boolean;
  private crowd: boolean;
  private roundTime: number;
  private baseObstacles: Rect[] = [];
  private bounds: Bounds;
  private mapSpawns: { x: number; y: number }[];
  private walls: Walls;
  private nav: Nav;
  private nextId = 1;
  /** ввод с экрана (виртуальные стики) и с геймпадов, по игрокам */
  private touch: PadInput[] = [{ x: 0, y: 0, fire: false }, { x: 0, y: 0, fire: false }];
  private pads: PadInput[] = [{ x: 0, y: 0, fire: false }, { x: 0, y: 0, fire: false }];
  private padStartHeld = false;
  private padPick = [false, false, false];

  private phase: Phase = "countdown";
  private phaseEndsAt = 2400;
  private goUntil = 0;
  private paused = false;
  private round = 1;
  private nTeams = 2;
  private scores: number[] = [0, 0];
  private roundWinner = -1;
  private winner = -1;
  private playTime = 0;
  private suddenDeath = false;
  private sdBannerUntil = -1;

  private tanks: Tank[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private floats: FloatText[] = [];
  private powerups: PowerUp[] = [];
  private mines: Mine[] = [];
  private warns: Warn[] = [];
  private nextPowerAt = 6000;
  private rareThisRound = 0;

  private lastCount = -1;
  private timeScale = 1;
  private shake = 0;
  private dust: { x: number; y: number; s: number; o: number }[] = [];
  private lastCrumble = 0;

  /* --- аркада --- */
  private wave = 0;
  private spec: WaveSpec | null = null;
  private queue: BotKind[] = [];
  private sides: number[] = [];
  private nextSpawnAt = 0;
  private nextRainAt = 0;
  private waveIntro = false;
  private score = 0;
  private kills = 0;
  private combo = 0;
  private lastKillAt = -99999;
  private best = { wave: 0, score: 0 };
  private newBest = false;
  private overAt = -1;
  private rewardOptions: RewardId[] | null = null;
  private rewardUntil = 0;
  private up: Record<RewardId, number> = { hp: 0, speed: 0, reload: 0, bounce: 0, shield: 0, bspeed: 0 };

  /* --- отрисовка и качество --- */
  private sprites = new Sprites();
  private bgLayer: HTMLCanvasElement | null = null;
  private frameLayer: HTMLCanvasElement | null = null;
  private wallLayer: HTMLCanvasElement | null = null;
  private wallVer = -1;
  private darkLayer: HTMLCanvasElement | null = null;
  private dprCap = 1.5;
  private fxScale = 1;
  private maxParticles = 420;
  private perfAcc = 0;
  private perfN = 0;
  private warmup = 60;
  private lastEmit = 0;
  private lastSig = "";

  constructor(canvas: HTMLCanvasElement, cfg: GameConfig, onUi: (u: UiState) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.onUi = onUi;
    this.cfg = cfg;
    this.arcade = cfg.mode === "arcade";
    this.crowd = cfg.mode === "squad" || cfg.mode === "ffa";
    this.roundTime = this.crowd ? CROWD_TIME : DUEL_TIME;

    const mapIdx = cfg.map >= 0 && cfg.map < MAP_COUNT ? cfg.map : Math.floor(Math.random() * MAP_COUNT);
    const map = MAPS[mapIdx];
    this.mapSpawns = map.spawns;
    // в боях с толпой маленькие поля тесны: берём полное поле
    this.bounds = this.crowd || this.arcade ? FULL : map.bounds;
    this.baseObstacles = map.obstacles;
    this.walls = new Walls(this.arcade ? [] : this.baseObstacles);
    this.nav = new Nav(this.walls, this.bounds, 18);

    this.best = loadBest();
    const nB = this.botCount();
    this.nTeams = cfg.mode === "ffa" ? cfg.players + nB : 2;
    this.scores = new Array(this.nTeams).fill(0);

    if (this.arcade) {
      this.startWave(Math.max(1, Math.floor(cfg.startWave ?? 1)));
    } else {
      this.resetTanks();
      this.spawnStartPowerups();
    }

    for (let i = 0; i < 46; i++) {
      this.dust.push({ x: Math.random() * W, y: Math.random() * H, s: rand(0.5, 2.2), o: rand(0.02, 0.07) });
    }

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearKeys);
    document.addEventListener("visibilitychange", this.clearKeys);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();

    this.last = performance.now();
    const loop = (t: number) => {
      if (this.destroyed) return;
      const raw = t - this.last;
      const dtReal = Math.min(0.033, raw / 1000);
      this.last = t;
      this.monitor(raw);
      this.frame(dtReal);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearKeys);
    document.removeEventListener("visibilitychange", this.clearKeys);
    this.ro?.disconnect();
  }

  private botCount() {
    const c = this.cfg;
    if (c.mode === "duel") return c.players === 1 ? 1 : 0;
    if (c.mode === "arcade") return 0;
    return c.bots;
  }

  /** Слабый ноутбук: если кадры долго длиннее ~24 мс, снижаем разрешение и количество эффектов. */
  private monitor(rawMs: number) {
    if (this.paused || rawMs > 120) return;
    if (this.warmup > 0) {
      this.warmup--;
      return;
    }
    this.perfAcc += rawMs;
    this.perfN++;
    if (this.perfN < 90) return;
    const avg = this.perfAcc / this.perfN;
    this.perfAcc = 0;
    this.perfN = 0;
    if (avg < 24) return;
    if (this.dprCap > 1 && (window.devicePixelRatio || 1) > 1) {
      this.dprCap = 1;
      this.resize();
    } else if (this.fxScale > 0.5) {
      this.fxScale = 0.5;
      this.maxParticles = 180;
    }
  }

  /** Потеря фокуса: иначе отпущенная вне окна клавиша «залипает». */
  private clearKeys = () => {
    this.keys.clear();
  };

  /** Виртуальный стик и кнопка огня с сенсорного экрана. */
  setTouch(player: 0 | 1, x: number, y: number, fire: boolean) {
    const t = this.touch[player];
    t.x = x;
    t.y = y;
    t.fire = fire;
  }

  private pollGamepads() {
    const list = (navigator.getGamepads?.() ?? []).filter((g): g is Gamepad => !!g && g.connected);
    const slots = this.cfg.players;
    for (let i = 0; i < 2; i++) {
      const g = i < slots ? list[i] : undefined;
      const out = this.pads[i];
      if (!g) {
        out.x = 0;
        out.y = 0;
        out.fire = false;
        continue;
      }
      let x = g.axes[0] ?? 0;
      let y = g.axes[1] ?? 0;
      if (Math.hypot(x, y) < 0.25) {
        x = 0;
        y = 0;
      }
      const b = (n: number) => !!g.buttons[n]?.pressed;
      if (b(14)) x = -1;
      if (b(15)) x = 1;
      if (b(12)) y = -1;
      if (b(13)) y = 1;
      out.x = x;
      out.y = y;
      out.fire = b(0) || b(1) || b(2) || b(3) || b(5) || b(7);
    }
    // выбор награды кнопками геймпада: A, B, X
    if (this.rewardOptions) {
      for (let k = 0; k < 3; k++) {
        const down = list.some((g) => !!g.buttons[k]?.pressed);
        if (down && !this.padPick[k]) this.pickReward(k);
        this.padPick[k] = down;
      }
    } else {
      this.padPick = [true, true, true];
    }
    // Start на первом геймпаде = пауза
    const start = !!list[0]?.buttons[9]?.pressed;
    if (start && !this.padStartHeld && this.phase !== "gameover") this.togglePause();
    this.padStartHeld = start;
  }

  private readInput(i: number): { ix: number; iy: number; fire: boolean } {
    const k = i === 0
      ? { l: "KeyA", r: "KeyD", u: "KeyW", d: "KeyS", f: ["Space"] }
      : { l: "ArrowLeft", r: "ArrowRight", u: "ArrowUp", d: "ArrowDown", f: ["Enter"] };
    // с одним игроком обе раскладки управляют единственным танком
    const both = this.cfg.players === 1 && i === 0;
    const has = (a: string, b: string) => this.keys.has(a) || (!!both && this.keys.has(b));
    const kx = (has(k.l, "ArrowLeft") ? -1 : 0) + (has(k.r, "ArrowRight") ? 1 : 0);
    const ky = (has(k.u, "ArrowUp") ? -1 : 0) + (has(k.d, "ArrowDown") ? 1 : 0);
    const p = this.pads[i];
    const t = this.touch[i];
    let ix = clamp(kx + p.x + t.x, -1, 1);
    let iy = clamp(ky + p.y + t.y, -1, 1);
    if (Math.hypot(ix, iy) < 0.12) {
      ix = 0;
      iy = 0;
    }
    const keyFire = k.f.some((c) => this.keys.has(c)) || (!!both && this.keys.has("Enter"));
    return { ix, iy, fire: keyFire || p.fire || t.fire };
  }

  /* ------------------------- ввод ------------------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "KeyW", "KeyA", "KeyS", "KeyD", "KeyF"].includes(code)
    ) {
      e.preventDefault();
    }
    if (this.rewardOptions && !e.repeat) {
      const m = /^(?:Digit|Numpad)([1-3])$/.exec(code);
      if (m) {
        this.pickReward(Number(m[1]) - 1);
        return;
      }
    }
    if ((code === "Escape" || code === "KeyP") && this.phase !== "gameover") {
      this.togglePause();
      return;
    }
    this.keys.add(code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  togglePause() {
    if (this.phase === "gameover" || this.phase === "roundover") return;
    this.paused = !this.paused;
  }

  setPaused(v: boolean) {
    this.paused = v;
  }

  /* ------------------------- инициализация ------------------------- */

  private makeTank(o: {
    human: boolean;
    n: number;
    team: number;
    x: number;
    y: number;
    angle: number;
    hp: number;
    cap: number;
    kind?: BotKind;
    look: { base: string; glow: string; dark: string };
    r?: number;
    speedMul?: number;
    fireMul?: number;
  }): Tank {
    return {
      id: this.nextId++,
      team: o.team,
      human: o.human,
      hidx: o.human ? o.n - 1 : -1,
      n: o.n,
      kind: o.kind ?? "normal",
      r: o.r ?? 18,
      speedMul: o.speedMul ?? 1,
      fireMul: o.fireMul ?? 1,
      x: o.x,
      y: o.y,
      angle: o.angle,
      vx: 0,
      vy: 0,
      hp: o.hp,
      maxHp: o.cap,
      cap: o.cap,
      alive: true,
      cooldown: 0,
      recoil: 0,
      shieldUntil: 0,
      rapidUntil: 0,
      speedUntil: 0,
      frozenUntil: 0,
      tripleLeft: 0,
      live: 0,
      base: o.look.base,
      glow: o.look.glow,
      dark: o.look.dark,
      bot: null,
      charging: false,
      aimAngle: o.angle,
      dashUntil: 0,
      nextFan: 0,
      nextSummon: 0,
      nextDash: 0,
      bornAt: this.clock,
    };
  }

  private spread(n: number, cy: number, maxStep: number) {
    const step = Math.min(maxStep, (this.bounds.b - this.bounds.t - 120) / Math.max(1, n - 1));
    return Array.from({ length: n }, (_, i) => cy + (i - (n - 1) / 2) * step);
  }

  private spawnPositions(nH: number, nB: number): { x: number; y: number }[] {
    const mode = this.cfg.mode;
    const bd = this.bounds;
    const cx = (bd.l + bd.r) / 2;
    const cy = (bd.t + bd.b) / 2;
    if (mode === "duel") return [this.mapSpawns[0], this.mapSpawns[1]].slice(0, nH + nB);
    if (mode === "arcade") return Array.from({ length: nH }, (_, i) => ({ x: cx + (nH === 1 ? 0 : i === 0 ? -34 : 34), y: cy }));
    const out: { x: number; y: number }[] = [];
    if (mode === "squad") {
      this.spread(nH, cy, 120).forEach((y) => out.push({ x: this.mapSpawns[0].x, y }));
      this.spread(nB, cy, 110).forEach((y) => out.push({ x: this.mapSpawns[1].x, y }));
    } else {
      const total = nH + nB;
      const rx = (bd.r - bd.l) * 0.39;
      const ry = (bd.b - bd.t) * 0.36;
      for (let k = 0; k < total; k++) {
        const a = Math.PI + (k * TAU) / total;
        out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
      }
    }
    return out;
  }

  /** Ближайшая свободная точка вокруг (x, y): без кирпичей и на расстоянии от уже стоящих танков. */
  private findFree(x: number, y: number, r: number, taken: { x: number; y: number }[]) {
    const bd = this.bounds;
    for (let ring = 0; ring < 12; ring++) {
      const steps = ring === 0 ? 1 : ring * 8;
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * TAU;
        const px = clamp(x + Math.cos(a) * ring * 24, bd.l + r + 4, bd.r - r - 4);
        const py = clamp(y + Math.sin(a) * ring * 24, bd.t + r + 4, bd.b - r - 4);
        if (this.walls.blockedAt(px, py, r + 6)) continue;
        if (taken.some((t) => Math.hypot(t.x - px, t.y - py) < r * 2 + 8)) continue;
        return { x: px, y: py };
      }
    }
    return { x, y };
  }

  private buildRoster(): Tank[] {
    const cfg = this.cfg;
    const nH = cfg.players;
    const nB = this.botCount();
    const mode = cfg.mode;
    const big = this.crowd || this.arcade;
    const pos = this.spawnPositions(nH, nB);
    const bd = this.bounds;
    const cx = (bd.l + bd.r) / 2;
    const cy = (bd.t + bd.b) / 2;
    const list: Tank[] = [];
    const placed: { x: number; y: number }[] = [];
    const place = (i: number) => {
      const p = mode === "duel" ? pos[i] : this.findFree(pos[i].x, pos[i].y, 18, placed);
      placed.push(p);
      return p;
    };
    const faceCenter = (p: { x: number; y: number }, i: number) =>
      mode === "duel" ? (i === 0 ? 0 : Math.PI) : Math.atan2(cy - p.y, cx - p.x);

    for (let i = 0; i < nH; i++) {
      const p = place(i);
      list.push(
        this.makeTank({
          human: true,
          n: i + 1,
          team: mode === "duel" || mode === "ffa" ? i : 0,
          x: p.x,
          y: p.y,
          angle: faceCenter(p, i),
          hp: big ? 5 + (this.arcade ? this.up.hp : 0) : 3,
          cap: big ? 8 + (this.arcade ? this.up.hp : 0) : 5,
          look: HUMAN_LOOK[i],
        })
      );
    }
    for (let j = 0; j < nB; j++) {
      const i = nH + j;
      const p = place(i);
      const team = mode === "squad" ? 1 : mode === "duel" ? 1 : i;
      const look = mode === "squad" ? BOT_LOOK[0] : BOT_LOOK[j % BOT_LOOK.length];
      const t = this.makeTank({
        human: false,
        n: j + 1,
        team,
        x: p.x,
        y: p.y,
        angle: faceCenter(p, i),
        hp: this.crowd ? 2 : 3,
        cap: this.crowd ? 2 : 5,
        look: mode === "duel" ? HUMAN_LOOK[1] : look,
      });
      t.bot = new Bot(this.nav, cfg.difficulty, "normal", { crowd: this.crowd });
      list.push(t);
    }
    return list;
  }

  private resetTanks() {
    this.tanks = this.buildRoster();
  }

  private resetRound() {
    this.bullets = [];
    this.powerups = [];
    this.walls.reset(this.baseObstacles);
    this.playTime = 0;
    this.suddenDeath = false;
    this.sdBannerUntil = -1;
    this.nextPowerAt = this.clock + 5500;
    this.rareThisRound = 0;
    this.round += 1;
    this.resetTanks();
    this.spawnStartPowerups();
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.scale = this.canvas.width / W;
    this.sprites.setScale(this.scale);
    this.bgLayer = null;
    this.frameLayer = null;
    this.wallLayer = null;
    this.darkLayer = null;
    this.wallVer = -1;
  }

  /* ================================================================== */
  /*  ЦИКЛ                                                              */
  /* ================================================================== */

  private frame(dtReal: number) {
    this.pollGamepads();
    if (!this.paused) {
      // возврат slow-mo к норме
      this.timeScale += (1 - this.timeScale) * Math.min(1, dtReal * 3.2);
      const dt = dtReal * this.timeScale;
      this.clock += dt * 1000;
      this.update(dt);
    }
    this.shake = Math.max(0, this.shake - dtReal * 46);
    this.render();
    this.emitUi();
  }

  private update(dt: number) {
    const now = this.clock;

    // ---- фазы ----
    if (this.phase === "countdown") {
      if (!this.arcade) {
        const c = Math.max(1, Math.min(3, Math.ceil((this.phaseEndsAt - now) / 733)));
        if (c !== this.lastCount) {
          this.lastCount = c;
          sound.beep(false);
        }
      }
      if (now >= this.phaseEndsAt) {
        this.phase = "play";
        this.waveIntro = false;
        this.goUntil = now + 750;
        this.lastCount = -1;
        this.nextSpawnAt = now + 300;
        sound.beep(true);
      }
    } else if (this.phase === "roundover") {
      if (now >= this.phaseEndsAt) {
        if (this.winner >= 0) {
          this.phase = "gameover";
          sound.win();
          this.burstConfetti(this.winner);
        } else {
          this.resetRound();
          this.phase = "countdown";
          this.phaseEndsAt = now + 2200;
        }
      }
    }

    if (this.phase === "play") {
      this.nav.sync();
      if (this.arcade) {
        this.updateArcade(dt);
      } else {
        this.playTime += dt;
        const left = this.roundTime - this.playTime;
        if (left <= 0 && !this.suddenDeath) this.timeUp();
        // бонусы
        const cap = this.crowd ? 4 : 3;
        if (now >= this.nextPowerAt && this.powerups.length < cap) {
          this.spawnPowerup();
          this.nextPowerAt = now + rand(4200, 6500) * (this.crowd ? 0.8 : 1);
        }
      }
      this.updateTanks(dt);
      this.updateBullets(dt);
      this.updateMines();
      if (this.arcade) this.tanks = this.tanks.filter((t) => t.alive || t.human);
    }

    this.updateParticles(dt);
    this.floats = this.floats.filter((f) => now - f.born < 900);
    this.powerups = this.powerups.filter((p) => now < p.expire);
  }

  /* ------------------------- итоги раунда ------------------------- */

  private timeUp() {
    const hp = new Map<number, number>();
    for (const t of this.tanks) if (t.alive) hp.set(t.team, (hp.get(t.team) ?? 0) + t.hp);
    let top = -1;
    let topHp = -1;
    let tie = false;
    for (const [team, v] of hp) {
      if (v > topHp) {
        top = team;
        topHp = v;
        tie = false;
      } else if (v === topHp) tie = true;
    }
    if (!tie && top >= 0) {
      this.endRound(top);
    } else {
      this.suddenDeath = true;
      this.sdBannerUntil = this.clock + 2200;
      sound.beep(true);
    }
  }

  private checkRoundEnd() {
    if (this.arcade || this.phase !== "play") return;
    const teams = new Set<number>();
    for (const t of this.tanks) if (t.alive) teams.add(t.team);
    if (teams.size <= 1) this.endRound(teams.size === 1 ? [...teams][0] : -1);
  }

  private endRound(team: number) {
    if (this.phase !== "play") return;
    this.roundWinner = team;
    if (team >= 0) {
      this.scores[team] += 1;
      if (this.scores[team] >= this.cfg.winScore) this.winner = team;
    }
    this.phase = "roundover";
    this.phaseEndsAt = this.clock + 2300;
    this.timeScale = 0.25;
  }

  /* ------------------------- танки ------------------------- */

  private updateTanks(dt: number) {
    const now = this.clock;
    const tanks = this.tanks;
    for (const t of tanks) {
      if (!t.alive) continue;
      let inp: BotInput;
      if (t.human) {
        inp = this.readInput(t.hidx);
      } else if (t.bot) {
        inp = t.bot.update(dt, t, tanks, this.bullets, this.powerups, this.cfg.friendlyFire);
        if (t.kind === "boss") inp = this.bossAI(t, inp, now);
      } else {
        inp = { ix: 0, iy: 0, fire: false };
      }
      t.charging = !!inp.charging;
      if (inp.aim !== undefined) t.aimAngle = inp.aim;
      // только что появившийся враг ещё «просыпается»
      if (now - t.bornAt < 600) inp = { ix: 0, iy: 0, fire: false };

      let ix = inp.ix;
      let iy = inp.iy;
      const frozen = now < t.frozenUntil;
      const boost = now < t.speedUntil ? 1.49 : 1;
      let maxSpeed = TANK_SPEED * boost * t.speedMul * (frozen ? 0.5 : 1);
      if (t.human && this.arcade) maxSpeed *= 1 + this.up.speed * 0.1;
      const dashing = now < t.dashUntil;
      if (dashing) maxSpeed *= 2.6;
      const accel = 1300 * (dashing ? 2 : 1);

      if (ix !== 0 || iy !== 0) {
        const len = Math.hypot(ix, iy);
        if (len > 1) {
          ix /= len;
          iy /= len;
        }
        t.vx += ix * accel * dt;
        t.vy += iy * accel * dt;
        const sp = Math.hypot(t.vx, t.vy);
        const cap = maxSpeed * Math.max(0.5, Math.min(1, len));
        if (sp > cap) {
          t.vx = (t.vx / sp) * cap;
          t.vy = (t.vy / sp) * cap;
        }
        const face = inp.aim !== undefined ? inp.aim : Math.atan2(iy, ix);
        t.angle = rotToward(t.angle, face, TURN_RATE * dt);
        // выхлоп ускорения
        if (Math.random() < dt * 26 * this.fxScale) {
          const bx = t.x - Math.cos(t.angle) * (t.r + 4);
          const by = t.y - Math.sin(t.angle) * (t.r + 4);
          this.spark(
            bx, by,
            -Math.cos(t.angle) * rand(40, 90) + rand(-24, 24),
            -Math.sin(t.angle) * rand(40, 90) + rand(-24, 24),
            rand(0.25, 0.45), rand(1.4, 2.8), t.glow, 0.9
          );
        }
      } else {
        const k = Math.exp(-6.5 * dt);
        t.vx *= k;
        t.vy *= k;
        if (inp.aim !== undefined) t.angle = rotToward(t.angle, inp.aim, TURN_RATE * dt);
      }

      t.x += t.vx * dt;
      t.y += t.vy * dt;

      // стены арены
      const bd = this.bounds;
      t.x = clamp(t.x, bd.l + t.r, bd.r - t.r);
      t.y = clamp(t.y, bd.t + t.r, bd.b - t.r);

      // кирпичи
      for (let pass = 0; pass < 2; pass++) {
        for (const b of this.walls.near(t.x, t.y, t.r + 2)) this.pushCircleOut(t, t.r, b);
      }

      // танк-танк
      for (const other of tanks) {
        if (other === t || !other.alive) continue;
        const dx = t.x - other.x;
        const dy = t.y - other.y;
        const d = Math.hypot(dx, dy);
        const min = t.r + other.r;
        if (d > 0.001 && d < min) {
          const push = (min - d) / 2;
          t.x += (dx / d) * push;
          t.y += (dy / d) * push;
          other.x -= (dx / d) * push;
          other.y -= (dy / d) * push;
        }
      }

      // камикадзе взрывается при касании
      if (t.kind === "kamikaze" && now - t.bornAt > 600) {
        for (const o of tanks) {
          if (o.alive && o.team !== t.team && Math.hypot(o.x - t.x, o.y - t.y) < t.r + o.r + 6) {
            this.explode(t.x, t.y, 78, t.team, t);
            break;
          }
        }
        if (!t.alive) continue;
      }

      // стрельба
      t.cooldown -= dt * (frozen ? 0.5 : 1);
      t.recoil = Math.max(0, t.recoil - dt * 6);
      let cd = now < t.rapidUntil ? 0.16 : 0.42;
      if (!t.human) cd *= t.fireMul;
      else if (this.arcade) cd *= 1 - this.up.reload * 0.12;
      const limit = (t.human ? PLAYER_BULLETS : BOT_BULLETS) + (t.tripleLeft > 0 ? 4 : 0);
      if (inp.fire && t.cooldown <= 0 && t.live < limit && t.kind !== "kamikaze") {
        t.cooldown = cd;
        t.recoil = 1;
        this.fire(t);
      }

      // подбор бонусов
      for (const p of this.powerups) {
        if (now < p.expire && Math.hypot(t.x - p.x, t.y - p.y) < t.r + 14) {
          this.applyPower(t, p);
          p.expire = now; // убрать
        }
      }
    }
  }

  private fire(t: Tank, spread = 0, nSpeed = 1, silent = false) {
    const triple = t.tripleLeft > 0 && spread === 0 && t.human;
    if (triple) t.tripleLeft -= 1;
    const angles = triple ? [-0.24, 0, 0.24] : [spread];
    let sp = BULLET_SPEED * nSpeed;
    if (t.kind === "sniper") sp *= 1.45;
    if (!t.human && this.arcade) sp *= 0.9;
    if (t.human && this.arcade) sp *= 1 + this.up.bspeed * 0.15;
    for (const da of angles) {
      const a = t.angle + da;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      this.bullets.push({
        x: t.x + nx * (t.r + 13),
        y: t.y + ny * (t.r + 13),
        vx: nx * sp,
        vy: ny * sp,
        owner: t,
        ownerId: t.id,
        team: t.team,
        born: this.clock,
        bounces: 0,
        maxBounces: 2 + (t.human && this.arcade ? this.up.bounce : 0),
        trail: [],
        alive: true,
        safe: true,
      });
      t.live += 1;
    }
    if (!silent) sound.shoot();
    // вспышка выстрела
    const nx = Math.cos(t.angle);
    const ny = Math.sin(t.angle);
    for (let k = 0; k < 5; k++) {
      this.spark(
        t.x + nx * (t.r + 16), t.y + ny * (t.r + 16),
        nx * rand(120, 260) + rand(-60, 60), ny * rand(120, 260) + rand(-60, 60),
        rand(0.08, 0.18), rand(1.5, 3.4), t.glow, 0.86
      );
    }
  }

  private pushCircleOut(c: { x: number; y: number }, r: number, rect: Rect): boolean {
    const cx = clamp(c.x, rect.x, rect.x + rect.w);
    const cy = clamp(c.y, rect.y, rect.y + rect.h);
    const dx = c.x - cx;
    const dy = c.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > r * r) return false;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const pen = r - d;
      c.x += (dx / d) * pen;
      c.y += (dy / d) * pen;
    } else {
      const left = c.x - rect.x, right = rect.x + rect.w - c.x;
      const top = c.y - rect.y, bot = rect.y + rect.h - c.y;
      const m = Math.min(left, right, top, bot);
      if (m === left) c.x = rect.x - r;
      else if (m === right) c.x = rect.x + rect.w + r;
      else if (m === top) c.y = rect.y - r;
      else c.y = rect.y + rect.h + r;
    }
    return true;
  }

  /* ------------------------- пули ------------------------- */

  private updateBullets(dt: number) {
    const now = this.clock;
    const bd = this.bounds;
    for (const t of this.tanks) t.live = 0;

    for (const b of this.bullets) {
      if (!b.alive) continue;
      const stepLen = Math.hypot(b.vx, b.vy) * dt;
      const steps = Math.max(1, Math.ceil(stepLen / 10));
      const sdt = dt / steps;
      for (let s = 0; s < steps && b.alive; s++) {
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
        this.stepBullet(b, bd, now);
      }
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 7) b.trail.shift();
      if (now - b.born > 7000) b.alive = false;
      if (b.alive) b.owner.live += 1;
    }

    this.bullets = this.bullets.filter((b) => b.alive);
  }

  private stepBullet(b: Bullet, bd: Bounds, now: number) {
    let bounced = false;
    if (b.x < bd.l + BULLET_R) { b.x = bd.l + BULLET_R; b.vx = Math.abs(b.vx); bounced = true; }
    else if (b.x > bd.r - BULLET_R) { b.x = bd.r - BULLET_R; b.vx = -Math.abs(b.vx); bounced = true; }
    if (b.y < bd.t + BULLET_R) { b.y = bd.t + BULLET_R; b.vy = Math.abs(b.vy); bounced = true; }
    else if (b.y > bd.b - BULLET_R) { b.y = bd.b - BULLET_R; b.vy = -Math.abs(b.vy); bounced = true; }

    // кирпичи: любое попадание разрушает кирпич, пуля гаснет
    for (const o of this.walls.near(b.x, b.y, BULLET_R + 2)) {
      const cx = clamp(b.x, o.x, o.x + o.w);
      const cy = clamp(b.y, o.y, o.y + o.h);
      const dx = b.x - cx;
      const dy = b.y - cy;
      if (dx * dx + dy * dy < BULLET_R * BULLET_R || (b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h)) {
        this.breakBrick(o);
        b.alive = false;
        return;
      }
    }

    if (bounced) {
      b.bounces += 1;
      sound.bounce();
      for (let k = 0; k < 4; k++) {
        this.spark(b.x, b.y, rand(-140, 140), rand(-140, 140), rand(0.15, 0.3), rand(1, 2.4), "#e2e8f0", 0.9);
      }
      if (b.bounces > b.maxBounces) {
        b.alive = false;
        return;
      }
    }

    // попадания
    for (const t of this.tanks) {
      if (!t.alive) continue;
      const isOwner = t === b.owner;
      // пуля своей команды проходит насквозь, если огонь по своим выключен
      if (!isOwner && t.team === b.team && !this.cfg.friendlyFire) continue;
      const d = Math.hypot(t.x - b.x, t.y - b.y);
      // своя пуля опасна для владельца, только отлетев от него (стрельба в упор в стену не бьёт по себе)
      if (isOwner && b.safe) {
        if (d > t.r + BULLET_R + 4) b.safe = false;
        else continue;
      }
      if (d < t.r + BULLET_R) {
        b.alive = false;
        this.hitTank(t, b.owner, b.bounces > 0);
        return;
      }
    }
    void now;
  }

  private breakBrick(b: Brick) {
    if (!b.alive) return;
    this.walls.destroy(b);
    const col = OB_COLORS[b.src % OB_COLORS.length];
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    for (let k = 0; k < Math.ceil(5 * this.fxScale); k++) {
      this.spark(cx + rand(-b.w / 2, b.w / 2), cy + rand(-b.h / 2, b.h / 2), rand(-170, 170), rand(-170, 170), rand(0.3, 0.6), rand(1.5, 3.2), col, 0.9);
    }
    if (this.clock - this.lastCrumble > 70) {
      this.lastCrumble = this.clock;
      sound.crumble();
    }
  }

  private hitTank(t: Tank, attacker: Tank | null, ricochet: boolean) {
    // раунд уже решён в этом кадре (одновременное попадание): второй удар не считается
    if (this.phase !== "play") return;
    const now = this.clock;
    if (now < t.shieldUntil) {
      t.shieldUntil = 0;
      this.addFloat(t.x, t.y - t.r - 8, this.cfg.texts.block, "#93c5fd");
      sound.block();
      this.shake = Math.max(this.shake, 6);
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * TAU;
        this.spark(
          t.x + Math.cos(a) * (t.r + 8), t.y + Math.sin(a) * (t.r + 8),
          Math.cos(a) * rand(60, 160), Math.sin(a) * rand(60, 160),
          rand(0.3, 0.5), rand(1.6, 3), "#60a5fa", 0.88
        );
      }
      return;
    }

    if (this.suddenDeath) t.hp = 0;
    else t.hp -= 1;
    this.shake = Math.max(this.shake, t.human ? 13 : 7);
    sound.hit();
    this.addFloat(t.x, t.y - t.r - 8, "-1", "#f87171");
    this.burst(t.x, t.y, t.glow, 22, 60, 300);
    if (t.hp <= 0) this.killTank(t, attacker, ricochet);
  }

  private killTank(t: Tank, killer: Tank | null, ricochet: boolean) {
    t.alive = false;
    t.hp = 0;
    this.shake = Math.max(this.shake, t.human || t.kind === "boss" ? 24 : 12);
    sound.explosion();
    this.burst(t.x, t.y, t.glow, 40, 60, 380);
    this.burst(t.x, t.y, "#ffffff", 16, 100, 420);
    this.ring(t.x, t.y, t.glow);
    if (this.arcade) {
      this.arcadeKill(t, killer, ricochet);
    } else {
      this.checkRoundEnd();
    }
  }

  /** Взрыв: ломает кирпичи, бьёт всех танков в радиусе, кроме команды взорвавшегося (team = -1: бьёт всех). */
  private explode(x: number, y: number, radius: number, team: number, source: Tank | null) {
    sound.explosion();
    this.shake = Math.max(this.shake, 16);
    this.burst(x, y, "#fb923c", 34, 80, 360);
    this.burst(x, y, "#ffffff", 10, 100, 300);
    this.ring(x, y, "#fb923c");
    for (const b of this.walls.near(x, y, radius)) {
      const cx = clamp(x, b.x, b.x + b.w);
      const cy = clamp(y, b.y, b.y + b.h);
      if (Math.hypot(cx - x, cy - y) < radius * 0.75) this.breakBrick(b);
    }
    if (source && source.alive) {
      source.alive = false;
      source.hp = 0;
    }
    for (const t of this.tanks) {
      if (!t.alive || t === source) continue;
      if (team >= 0 && t.team === team) continue;
      if (Math.hypot(t.x - x, t.y - y) < radius + t.r * 0.5) this.hitTank(t, null, false);
    }
  }

  /* ------------------------- бонусы ------------------------- */

  private freePoint(minTank: number, minPow: number, pad = 34) {
    const bd = this.bounds;
    for (let tries = 0; tries < 90; tries++) {
      const relax = tries > 60 ? 0.5 : tries > 30 ? 0.75 : 1;
      const x = rand(bd.l + 70, bd.r - 70);
      const y = rand(bd.t + 50, bd.b - 50);
      if (this.walls.blockedAt(x, y, pad)) continue;
      if (this.tanks.some((t) => t.alive && Math.hypot(t.x - x, t.y - y) < minTank * relax)) continue;
      if (this.powerups.some((p) => Math.hypot(p.x - x, p.y - y) < minPow)) continue;
      return { x, y };
    }
    return null;
  }

  private rollType(allowRare: boolean): { type: PowerType; rare: boolean } {
    const hurt = this.tanks.some((t) => t.alive && t.human && t.hp < t.cap);
    if (allowRare && this.rareThisRound < 1 && Math.random() < 0.1) {
      this.rareThisRound++;
      return { type: RARE_TYPES[Math.floor(Math.random() * RARE_TYPES.length)], rare: true };
    }
    const types: PowerType[] = this.suddenDeath
      ? ["shield", "rapid", "speed"]
      : hurt
        ? ["heal", "shield", "shield", "rapid", "rapid", "speed", "heal"]
        : ["shield", "rapid", "speed"];
    return { type: types[Math.floor(Math.random() * types.length)], rare: false };
  }

  private spawnStartPowerups() {
    const n = this.crowd || Math.random() < 0.5 ? 3 : 2;
    for (let i = 0; i < n; i++) this.spawnPowerup(this.crowd ? 130 : 240, 22000, false);
  }

  private spawnPowerup(minTank = 150, life = 9500, allowRare = true) {
    const pt = this.freePoint(minTank, 90);
    if (!pt) return;
    const { type, rare } = this.rollType(allowRare);
    this.powerups.push({ x: pt.x, y: pt.y, type, rare, born: this.clock, expire: this.clock + life, life });
  }

  private applyPower(t: Tank, p: PowerUp) {
    const now = this.clock;
    const tx = this.cfg.texts;
    sound.pickup();
    this.ring(p.x, p.y, POWER_COLORS[p.type]);
    const fy = t.y - t.r - 8;
    switch (p.type) {
      case "heal":
        t.hp = Math.min(t.cap, t.hp + 1);
        this.addFloat(t.x, fy, "+1", "#4ade80");
        break;
      case "shield":
        t.shieldUntil = now + 7000;
        this.addFloat(t.x, fy, tx.shield, "#93c5fd");
        break;
      case "rapid":
        t.rapidUntil = now + 6000;
        this.addFloat(t.x, fy, tx.rapid, "#fde68a");
        break;
      case "speed":
        t.speedUntil = now + 6000;
        this.addFloat(t.x, fy, tx.speed, "#d8b4fe");
        break;
      case "triple":
        t.tripleLeft = 8;
        this.addFloat(t.x, fy, tx.triple, "#fcd34d");
        break;
      case "freeze": {
        sound.freeze();
        this.addFloat(t.x, fy, tx.freeze, "#7dd3fc");
        for (const o of this.tanks) {
          if (o.alive && o.team !== t.team) {
            o.frozenUntil = now + 4000;
            this.burst(o.x, o.y, "#7dd3fc", 10, 40, 160);
          }
        }
        break;
      }
      case "shock": {
        sound.shock();
        this.addFloat(t.x, fy, tx.shock, "#fda4af");
        this.shockwave(t);
        break;
      }
    }
  }

  private shockwave(t: Tank) {
    const R = 230;
    this.shake = Math.max(this.shake, 14);
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * TAU;
      this.spark(t.x + Math.cos(a) * 12, t.y + Math.sin(a) * 12, Math.cos(a) * 420, Math.sin(a) * 420, 0.5, 3, "#fda4af", 0.9);
    }
    for (const b of this.bullets) {
      if (b.alive && Math.hypot(b.x - t.x, b.y - t.y) < R) {
        b.alive = false;
        this.burst(b.x, b.y, "#fda4af", 4, 40, 160);
      }
    }
    for (const o of this.tanks) {
      if (!o.alive || o === t) continue;
      const d = Math.hypot(o.x - t.x, o.y - t.y);
      if (d < R && o.team !== t.team) {
        const k = (1 - d / R) * 900 + 300;
        o.vx += ((o.x - t.x) / (d || 1)) * k;
        o.vy += ((o.y - t.y) / (d || 1)) * k;
      }
    }
    for (const b of this.walls.near(t.x, t.y, 150)) {
      const cx = clamp(t.x, b.x, b.x + b.w);
      const cy = clamp(t.y, b.y, b.y + b.h);
      if (Math.hypot(cx - t.x, cy - t.y) < 130) this.breakBrick(b);
    }
  }

  /* ------------------------- мины ------------------------- */

  private updateMines() {
    if (!this.mines.length) return;
    const now = this.clock;
    for (const m of this.mines) {
      if (now < m.armAt) continue;
      for (const t of this.tanks) {
        if (t.alive && Math.hypot(t.x - m.x, t.y - m.y) < t.r + 12) {
          m.armAt = Infinity;
          this.explode(m.x, m.y, 62, -1, null);
          break;
        }
      }
    }
    this.mines = this.mines.filter((m) => m.armAt !== Infinity);
  }

  /* ================================================================== */
  /*  АРКАДА                                                            */
  /* ================================================================== */

  private startWave(n: number) {
    const now = this.clock;
    const spec = waveSpec(n);
    this.wave = n;
    this.spec = spec;
    this.queue = [...spec.queue];
    this.bullets = [];
    this.powerups = [];
    this.mines = [];
    this.warns = [];
    this.rareThisRound = 0;

    this.bounds = stageBounds(spec.stage);
    this.nav.setBounds(this.bounds);
    this.baseObstacles = genObstacles(this.bounds, spec.stage);
    this.walls.reset(this.baseObstacles);

    // игроки: живые сохраняют состояние, павшие возвращаются с 2 HP
    const old = this.tanks.filter((t) => t.human);
    const fresh = this.buildRoster();
    if (old.length) {
      fresh.forEach((f, i) => {
        const o = old[i];
        if (!o) return;
        f.hp = o.alive ? Math.min(o.cap, o.hp) : Math.min(o.cap, 2);
        f.cap = o.cap;
        f.maxHp = f.cap;
        f.rapidUntil = 0;
        f.tripleLeft = o.alive ? o.tripleLeft : 0;
      });
    }
    this.tanks = fresh;
    if (spec.boss) for (const t of this.tanks) if (t.human) t.hp = t.cap;
    if (this.up.shield) for (const t of this.tanks) t.shieldUntil = now + 6000 + 2500;

    // стороны, с которых выходят враги
    const all = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    this.sides = all.slice(0, spec.sides);

    if (spec.special === "mines") {
      for (let i = 0; i < 7; i++) {
        const pt = this.freePoint(170, 60, 30);
        if (pt) this.mines.push({ x: pt.x, y: pt.y, armAt: now + 1500 });
      }
    }
    this.nextRainAt = now + 3500;
    this.spawnPowerup(160, 20000, false);

    this.phase = "countdown";
    this.waveIntro = true;
    this.phaseEndsAt = now + 2600;
    this.nextSpawnAt = 0;
    if (spec.boss) sound.boss();
    else sound.warn();
    this.bgLayer = null;
    this.frameLayer = null;
    this.wallVer = -1;
  }

  private edgePoint(side: number) {
    const bd = this.bounds;
    const m = 38;
    switch (side) {
      case 0: return { x: rand(bd.l + 90, bd.r - 90), y: bd.t + m };
      case 1: return { x: bd.r - m, y: rand(bd.t + 70, bd.b - 70) };
      case 2: return { x: rand(bd.l + 90, bd.r - 90), y: bd.b - m };
      default: return { x: bd.l + m, y: rand(bd.t + 70, bd.b - 70) };
    }
  }

  private updateArcade(dt: number) {
    const now = this.clock;
    const spec = this.spec!;
    void dt;

    if (now - this.lastKillAt > 3000) this.combo = 0;

    // между волнами игра не стоит: выбор улучшения идёт поверх, по таймеру берётся случайное
    if (this.rewardOptions) {
      if (now >= this.rewardUntil) this.pickReward(Math.floor(Math.random() * this.rewardOptions.length));
      return;
    }

    // предупреждения превращаются во врагов
    for (const w of this.warns) {
      if (now >= w.at) {
        this.spawnEnemy(w.kind, w.x, w.y, w.mirror);
        w.at = Infinity;
      }
    }
    this.warns = this.warns.filter((w) => w.at !== Infinity);

    // новые враги выходят с краёв пачками
    const enemies = this.tanks.filter((t) => t.alive && !t.human).length;
    const onField = enemies + this.warns.length;
    if (this.queue.length && onField < spec.maxField && now >= this.nextSpawnAt) {
      const room = spec.maxField - onField;
      const batch = Math.min(room, this.queue.length, spec.special === "avalanche" ? 3 : 1 + (Math.random() < 0.4 ? 1 : 0));
      for (let i = 0; i < batch; i++) {
        const kind = this.queue.shift()!;
        const side = this.sides[Math.floor(Math.random() * this.sides.length)];
        const p = this.edgePoint(side);
        const pt = this.findFree(p.x, p.y, 20, this.tanks);
        this.warns.push({ x: pt.x, y: pt.y, kind, at: now + 1500, mirror: spec.special === "mirror" });
        sound.warn();
      }
      this.nextSpawnAt = now + (spec.special === "avalanche" ? 900 : rand(1400, 2400));
    }

    // дождь из бонусов
    if (spec.special === "rain" && now >= this.nextRainAt) {
      this.nextRainAt = now + 1900;
      if (this.powerups.length < 6) this.spawnPowerup(60, 12000, false);
    }

    // волна пройдена
    if (!this.queue.length && !this.warns.length && !enemies) this.waveCleared();

    // все игроки погибли
    if (this.overAt < 0 && !this.tanks.some((t) => t.human && t.alive)) {
      this.overAt = now + 1600;
    }
    if (this.overAt >= 0 && now >= this.overAt) this.arcadeOver();
  }

  private spawnEnemy(kind: BotKind, x: number, y: number, mirror: boolean) {
    const st = ENEMY[kind];
    const spec = this.spec!;
    const hp = mirror ? 3 + Math.floor(spec.n / 4) : kind === "boss" ? bossHp(spec.n) : enemyHp(kind, spec.n);
    const look = mirror
      ? { base: "#64748b", glow: "#e2e8f0", dark: "#1e293b" }
      : { base: st.color, glow: st.color, dark: st.dark };
    if (!mirror && kind !== "boss") look.base = st.color + "cc";
    const t = this.makeTank({
      human: false,
      n: 0,
      team: 1,
      x,
      y,
      angle: Math.atan2(360 - y, 640 - x),
      hp,
      cap: hp,
      kind,
      look,
      r: st.r,
      speedMul: mirror ? 1.05 : st.speedMul,
      fireMul: mirror ? 0.8 : st.fireMul,
    });
    const tier = Math.min(2, (mirror ? 2 : this.cfg.difficulty) + spec.tierBonus) as Difficulty;
    t.bot = new Bot(this.nav, tier, mirror ? "normal" : kind, { crowd: true });
    if (kind === "boss") {
      t.nextFan = this.clock + 2500;
      t.nextSummon = this.clock + 8000;
      t.nextDash = this.clock + 7000;
    }
    this.tanks.push(t);
    this.ring(x, y, look.glow);
    this.burst(x, y, look.glow, 16, 40, 200);
    if (kind === "boss") this.addFloat(x, y - 40, "BOSS", "#e879f9");
  }

  /** Фазы босса: веер пуль, призыв разведчиков, рывок. */
  private bossAI(t: Tank, inp: BotInput, now: number): BotInput {
    const frac = t.hp / t.maxHp;
    const target = this.tanks
      .filter((o) => o.alive && o.human)
      .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
    if (target && now >= t.nextFan && now - t.bornAt > 800) {
      t.nextFan = now + (frac < 0.66 ? 3600 : 4600);
      const base = Math.atan2(target.y - t.y, target.x - t.x);
      const n = frac < 0.66 ? 7 : 5;
      const keep = t.angle;
      for (let i = 0; i < n; i++) {
        t.angle = base + (i - (n - 1) / 2) * 0.3;
        this.fire(t, 0, 0.7, i > 0);
      }
      t.angle = keep;
    }
    if (frac < 0.66 && now >= t.nextSummon) {
      t.nextSummon = now + 9000;
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU);
        const pt = this.findFree(t.x + Math.cos(a) * 70, t.y + Math.sin(a) * 70, 16, this.tanks);
        this.spawnEnemy("scout", pt.x, pt.y, false);
      }
    }
    if (frac < 0.33 && target && now >= t.nextDash) {
      t.nextDash = now + 6000;
      t.dashUntil = now + 800;
      this.addFloat(t.x, t.y - 44, "!", "#f87171");
    }
    if (now < t.dashUntil && target) {
      const a = Math.atan2(target.y - t.y, target.x - t.x);
      return { ...inp, ix: Math.cos(a), iy: Math.sin(a) };
    }
    return inp;
  }

  private arcadeKill(t: Tank, killer: Tank | null, ricochet: boolean) {
    const now = this.clock;
    if (t.human) return;
    // очки получает тот, кто убил игрок
    if (killer && killer.human) {
      this.kills += 1;
      this.combo = now - this.lastKillAt < 3000 ? this.combo + 1 : 1;
      this.lastKillAt = now;
      const mult = Math.min(4, 1 + (this.combo - 1) * 0.25) * (ricochet ? 1.5 : 1);
      const pts = Math.round((ENEMY[t.kind].score * mult) / 10) * 10;
      this.score += pts;
      this.addFloat(t.x, t.y - 28, `+${pts}`, ricochet ? "#fde68a" : "#e2e8f0");
      if (this.combo >= 2) this.addFloat(t.x, t.y - 50, `x${this.combo} ${this.cfg.texts.combo}`, "#fbbf24");
    }
    // дроп
    const drop = t.kind === "boss" ? 1 : 0.2;
    if (Math.random() < drop) {
      const { type, rare } = this.rollType(true);
      this.powerups.push({ x: t.x, y: t.y, type, rare, born: now, expire: now + 9000, life: 9000 });
    }
    if (t.kind === "boss") {
      this.timeScale = 0.3;
      // осколки босса: все слабые враги рядом погибают
      for (const o of this.tanks) {
        if (o.alive && !o.human && o !== t && o.kind === "scout") {
          o.alive = false;
          this.burst(o.x, o.y, o.glow, 14, 60, 260);
        }
      }
    }
  }

  private waveCleared() {
    const now = this.clock;
    this.score += 200 * this.wave;
    for (const t of this.tanks) {
      if (t.human && t.alive) {
        t.hp = Math.min(t.cap, t.hp + 2);
        this.addFloat(t.x, t.y - 28, "+2", "#4ade80");
      }
    }
    this.bullets = [];
    this.mines = [];
    this.rewardUntil = now + REWARD_MS;
    const pool = [...REWARD_IDS].sort(() => Math.random() - 0.5);
    this.rewardOptions = pool.slice(0, 3);
    sound.win();
  }

  /** Игрок выбрал улучшение (клавиши 1–3, клик, кнопки геймпада). */
  pickReward(i: number) {
    if (!this.rewardOptions) return;
    const id = this.rewardOptions[i];
    if (!id) return;
    this.up[id] += 1;
    if (id === "hp") {
      for (const t of this.tanks) {
        if (!t.human) continue;
        t.cap = Math.min(12, t.cap + 1);
        t.maxHp = t.cap;
        t.hp = Math.min(t.cap, t.hp + 2);
      }
    }
    this.rewardOptions = null;
    sound.pickup();
    this.startWave(this.wave + 1);
  }

  private arcadeOver() {
    if (this.phase === "gameover") return;
    this.phase = "gameover";
    this.newBest = this.score > this.best.score;
    if (this.newBest) {
      this.best = { wave: this.wave, score: this.score };
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(this.best));
      } catch {
        /* хранилище недоступно */
      }
    }
    this.winner = -1;
  }

  /* ------------------------- частицы ------------------------- */

  private spark(x: number, y: number, vx: number, vy: number, maxLife: number, size: number, color: string, drag: number) {
    if (this.particles.length >= this.maxParticles) return;
    this.particles.push({ x, y, vx, vy, life: 0, maxLife, size, color, drag });
  }

  private burst(x: number, y: number, color: string, n: number, minSp: number, maxSp: number) {
    const cnt = Math.ceil(n * this.fxScale);
    for (let k = 0; k < cnt; k++) {
      const a = Math.random() * TAU;
      const sp = rand(minSp, maxSp);
      this.spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.35, 0.8), rand(1.5, 4), color, 0.9);
    }
  }

  private ring(x: number, y: number, color: string) {
    const n = Math.ceil(22 * this.fxScale);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      this.spark(x + Math.cos(a) * 6, y + Math.sin(a) * 6, Math.cos(a) * 210, Math.sin(a) * 210, 0.45, 2.4, color, 0.84);
    }
  }

  private burstConfetti(winnerTeam: number) {
    const tank = this.tanks.find((t) => t.team === winnerTeam);
    const col = tank ? tank.glow : "#22d3ee";
    const n = Math.ceil(130 * this.fxScale);
    for (let i = 0; i < n; i++) {
      this.spark(
        Math.random() * W, -20 - Math.random() * 160, rand(-40, 40), rand(90, 260),
        rand(1.6, 2.8), rand(2, 4.6),
        Math.random() < 0.5 ? col : ["#a78bfa", "#fbbf24", "#4ade80"][Math.floor(Math.random() * 3)],
        0.995
      );
    }
  }

  private updateParticles(dt: number) {
    const ps = this.particles;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k;
      p.vy *= k;
      p.vy += 40 * dt;
      ps[w++] = p;
    }
    ps.length = w;
  }

  private addFloat(x: number, y: number, text: string, color: string) {
    this.floats.push({ x, y, text, color, born: this.clock });
  }

  /* ================================================================== */
  /*  РЕНДЕР                                                            */
  /* ================================================================== */

  private layer() {
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext("2d")!;
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    return { c, g };
  }

  /** Статичный фон: градиент и сетка поля. */
  private buildBg() {
    const { c, g } = this.layer();
    const bg = g.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 780);
    bg.addColorStop(0, "#0a1024");
    bg.addColorStop(1, "#05060f");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(103, 232, 249, 0.05)";
    g.lineWidth = 1;
    g.beginPath();
    const gb = this.bounds;
    for (let x = gb.l; x <= gb.r; x += 40) { g.moveTo(x, gb.t); g.lineTo(x, gb.b); }
    for (let y = gb.t; y <= gb.b; y += 40) { g.moveTo(gb.l, y); g.lineTo(gb.r, y); }
    g.stroke();
    this.bgLayer = c;
  }

  /** Статичная рамка арены и затемнение за пределами поля (малые карты). */
  private buildFrame() {
    const { c, g } = this.layer();
    const wb = this.bounds;
    g.fillStyle = "#05060f";
    g.beginPath();
    g.rect(0, 0, W, H);
    g.rect(wb.l - 6, wb.t - 6, wb.r - wb.l + 12, wb.b - wb.t + 12);
    g.fill("evenodd");
    const wallGrad = g.createLinearGradient(0, 0, W, 0);
    wallGrad.addColorStop(0, "#22d3ee");
    wallGrad.addColorStop(0.5, "#7c3aed");
    wallGrad.addColorStop(1, "#f472b6");
    g.strokeStyle = wallGrad;
    g.lineWidth = 2.5;
    g.shadowColor = "#7c3aed";
    g.shadowBlur = 16;
    rr(g, wb.l - 6, wb.t - 6, wb.r - wb.l + 12, wb.b - wb.t + 12, 16);
    g.stroke();
    g.shadowBlur = 0;
    g.globalAlpha = 0.25;
    g.lineWidth = 1;
    rr(g, wb.l - 12, wb.t - 12, wb.r - wb.l + 24, wb.b - wb.t + 24, 20);
    g.stroke();
    this.frameLayer = c;
  }

  /** Слой кирпичей: перерисовывается только когда что-то сломано. */
  private buildWalls() {
    const { c, g } = this.layer();
    for (const b of this.walls.bricks) {
      if (!b.alive) continue;
      const col = OB_COLORS[b.src % OB_COLORS.length];
      g.globalAlpha = 0.07;
      g.fillStyle = col;
      rr(g, b.x - 4, b.y - 4, b.w + 8, b.h + 8, 8);
      g.fill();
      g.globalAlpha = 0.92;
      g.fillStyle = "rgba(10, 16, 36, 1)";
      rr(g, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 5);
      g.fill();
      g.globalAlpha = 0.85;
      g.strokeStyle = col;
      g.lineWidth = 1.6;
      g.stroke();
      g.globalAlpha = 0.16;
      g.fillStyle = col;
      rr(g, b.x + 3, b.y + 3, b.w - 6, b.h - 6, 3);
      g.fill();
    }
    this.wallLayer = c;
    this.wallVer = this.walls.version;
  }

  private render() {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (!this.bgLayer) this.buildBg();
    if (!this.frameLayer) this.buildFrame();
    if (!this.wallLayer || this.wallVer !== this.walls.version) this.buildWalls();

    ctx.drawImage(this.bgLayer!, 0, 0, W, H);

    // пыль
    ctx.fillStyle = "#94a3b8";
    for (const d of this.dust) {
      d.y -= 0.06 * this.timeScale;
      if (d.y < -4) { d.y = H + 4; d.x = Math.random() * W; }
      ctx.globalAlpha = d.o;
      ctx.fillRect(d.x, d.y, d.s, d.s);
    }
    ctx.globalAlpha = 1;

    // тряска камеры
    ctx.save();
    if (this.shake > 0.2) {
      ctx.translate(rand(-this.shake, this.shake) * 0.5, rand(-this.shake, this.shake) * 0.5);
    }

    ctx.drawImage(this.wallLayer!, 0, 0, W, H);

    for (const m of this.mines) this.drawMine(m);
    for (const p of this.powerups) this.drawPower(p);
    for (const w of this.warns) this.drawWarn(w);

    const dark = this.spec?.special === "dark" && this.arcade;
    if (!dark) this.drawBullets();

    for (const t of this.tanks) this.drawTank(t);

    // частицы
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const pr = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, pr);
      ctx.fillStyle = p.color;
      const s = p.size * (0.5 + pr * 0.7) * 2;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();

    if (dark) {
      this.drawDarkness();
      this.drawBullets();
    }

    // лазерный прицел снайпера
    for (const t of this.tanks) if (t.alive && t.charging) this.drawLaser(t);

    // всплывающий текст
    ctx.save();
    ctx.font = "700 20px 'Russo One', sans-serif";
    ctx.textAlign = "center";
    for (const f of this.floats) {
      const age = (this.clock - f.born) / 900;
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = "rgba(5,6,15,0.7)";
      ctx.fillText(f.text, f.x + 1.5, f.y - age * 34 + 1.5);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - age * 34);
    }
    ctx.restore();

    ctx.restore(); // конец тряски

    ctx.drawImage(this.frameLayer!, 0, 0, W, H);
  }

  private drawBullets() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const b of this.bullets) {
      const col = b.owner.glow;
      const tr = b.trail;
      // шлейф: три отрезка вместо десяти
      if (tr.length > 2) {
        ctx.strokeStyle = col;
        const seg = Math.floor(tr.length / 3);
        for (let k = 0; k < 3; k++) {
          const i0 = k * seg;
          const i1 = k === 2 ? tr.length - 1 : (k + 1) * seg;
          ctx.globalAlpha = 0.18 + k * 0.16;
          ctx.lineWidth = 2 + k * 1.6;
          ctx.beginPath();
          ctx.moveTo(tr[i0].x, tr[i0].y);
          ctx.lineTo(tr[i1].x, tr[i1].y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(this.sprites.bullet(col), b.x - 20, b.y - 20, 40, 40);
    }
    ctx.restore();
  }

  private drawTank(t: Tank) {
    const ctx = this.ctx;
    if (!t.alive) return;
    const bob = Math.sin(this.clock / 300 + t.id * 2) * 1.2;
    const now = this.clock;
    const rapidOn = now < t.rapidUntil;
    const spawnT = clamp((now - t.bornAt) / 500, 0, 1);

    ctx.save();
    ctx.translate(t.x, t.y + bob);
    ctx.rotate(t.angle);
    ctx.translate(-t.recoil * 4, 0);
    if (spawnT < 1) ctx.globalAlpha = 0.25 + spawnT * 0.75;
    const sp = this.sprites.tank({ base: t.base, glow: t.glow, dark: t.dark, r: t.r, rapid: rapidOn });
    ctx.drawImage(sp, -64, -64, 128, 128);
    ctx.restore();

    // щит
    if (now < t.shieldUntil) {
      const pulse = 1 + Math.sin(now / 130) * 0.05;
      const rad = (t.r + 11) * pulse;
      ctx.save();
      ctx.strokeStyle = "#60a5fa";
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(t.x, t.y + bob, rad, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = "#60a5fa";
      ctx.fill();
      ctx.restore();
    }
    // ускорение
    if (now < t.speedUntil) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(now / 90) * 0.2;
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y + bob, t.r + 5, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    // заморозка
    if (now < t.frozenUntil) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#bae6fd";
      ctx.strokeStyle = "#7dd3fc";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y + bob, t.r + 6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.restore();
    }
    // тройной залп
    if (t.tripleLeft > 0) {
      ctx.save();
      ctx.fillStyle = "#fcd34d";
      ctx.globalAlpha = 0.9;
      for (let i = 0; i < t.tripleLeft; i++) ctx.fillRect(t.x - t.tripleLeft * 2.5 + i * 5, t.y + t.r + 8, 3, 3);
      ctx.restore();
    }

    // подпись игрока или полоска HP врага
    ctx.save();
    if (t.human) {
      ctx.font = "700 13px 'Russo One', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = t.glow;
      ctx.globalAlpha = 0.95;
      ctx.fillText(t.hidx === 0 ? "P1" : "P2", t.x, t.y - t.r - 12 + bob);
    } else if (t.maxHp > 1 && (this.arcade || this.crowd)) {
      const w = Math.min(46, 10 + t.maxHp * 7);
      const x0 = t.x - w / 2;
      const y0 = t.y - t.r - 12 + bob;
      ctx.fillStyle = "rgba(15,23,42,0.85)";
      ctx.fillRect(x0 - 1, y0 - 1, w + 2, 6);
      ctx.fillStyle = t.glow;
      ctx.fillRect(x0, y0, (w * t.hp) / t.maxHp, 4);
    }
    ctx.restore();
  }

  private drawPower(p: PowerUp) {
    const ctx = this.ctx;
    const remain = (p.expire - this.clock) / p.life;
    const blink = remain < 0.25 ? (Math.floor(this.clock / 120) % 2 === 0 ? 0.25 : 0.8) : 0.95;
    const pulse = 1 + Math.sin(this.clock / 220 + p.x) * 0.12;
    const spin = p.rare ? 1 + Math.sin(this.clock / 150) * 0.06 : 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pulse * spin, pulse * spin);
    ctx.globalAlpha = blink;
    ctx.drawImage(this.sprites.power(p.type, p.rare), -36, -36, 72, 72);
    ctx.restore();
  }

  private drawMine(m: Mine) {
    const ctx = this.ctx;
    const armed = this.clock >= m.armAt;
    const on = armed && Math.floor(this.clock / 250) % 2 === 0;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.fillStyle = "#0b1020";
    ctx.strokeStyle = armed ? "#f87171" : "#64748b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = on ? "#fecaca" : "#7f1d1d";
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Стрелка и кольцо в точке, где скоро появится враг. */
  private drawWarn(w: Warn) {
    const ctx = this.ctx;
    const k = clamp(1 - (w.at - this.clock) / 1500, 0, 1);
    const col = w.mirror ? "#e2e8f0" : ENEMY[w.kind].color;
    const ang = Math.atan2(360 - w.y, 640 - w.x);
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(this.clock / 110));
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 30 - k * 14, 0, TAU);
    ctx.stroke();
    ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(8, -11);
    ctx.lineTo(8, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawLaser(t: Tank) {
    const ctx = this.ctx;
    const nx = Math.cos(t.angle);
    const ny = Math.sin(t.angle);
    let d = t.r + 10;
    const bd = this.bounds;
    for (; d < 1400; d += 12) {
      const x = t.x + nx * d;
      const y = t.y + ny * d;
      if (x < bd.l || x > bd.r || y < bd.t || y > bd.b) break;
      if (this.walls.blockedAt(x, y, 4)) break;
    }
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(this.clock / 60));
    ctx.strokeStyle = "#f87171";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(t.x + nx * (t.r + 8), t.y + ny * (t.r + 8));
    ctx.lineTo(t.x + nx * d, t.y + ny * d);
    ctx.stroke();
    ctx.restore();
  }

  /** «Тёмная арена»: видно только вокруг игроков. */
  private drawDarkness() {
    if (!this.darkLayer) {
      const c = document.createElement("canvas");
      c.width = this.canvas.width;
      c.height = this.canvas.height;
      this.darkLayer = c;
    }
    const c = this.darkLayer;
    const g = c.getContext("2d")!;
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(2,3,10,0.94)";
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "destination-out";
    for (const t of this.tanks) {
      if (!t.human || !t.alive) continue;
      const rg = g.createRadialGradient(t.x, t.y, 30, t.x, t.y, 230);
      rg.addColorStop(0, "rgba(0,0,0,1)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg;
      g.beginPath();
      g.arc(t.x, t.y, 230, 0, TAU);
      g.fill();
    }
    this.ctx.drawImage(c, 0, 0, W, H);
  }

  /* ================================================================== */
  /*  UI-снимок                                                          */
  /* ================================================================== */

  private emitUi() {
    const now = this.clock;
    const arcade = this.arcade;
    const countdown =
      arcade ? -1
      : this.phase === "countdown" ? Math.max(1, Math.min(3, Math.ceil((this.phaseEndsAt - now) / 733)))
      : now < this.goUntil ? 0
      : -1;
    const sdBanner = now < this.sdBannerUntil;
    const timeSec = Math.max(0, Math.ceil(this.roundTime - this.playTime));
    const sig = `${this.phase}|${this.paused}|${countdown}|${this.round}|${sdBanner}|${this.winner}|${this.roundWinner}|${this.suddenDeath}|${this.wave}|${this.rewardOptions?.join() ?? ""}|${this.waveIntro}|${timeSec}`;
    const real = performance.now();
    if (sig === this.lastSig && real - this.lastEmit < 110) return;
    this.lastSig = sig;
    this.lastEmit = real;

    const fxOf = (t: Tank): FxState => ({
      shield: now < t.shieldUntil,
      shieldLeft: Math.max(0, Math.ceil((t.shieldUntil - now) / 1000)),
      rapidLeft: Math.max(0, Math.ceil((t.rapidUntil - now) / 1000)),
      speedLeft: Math.max(0, Math.ceil((t.speedUntil - now) / 1000)),
      frozenLeft: Math.max(0, Math.ceil((t.frozenUntil - now) / 1000)),
      tripleLeft: t.tripleLeft,
    });

    // в аркаде показываем только игроков: врагов слишком много и они приходят и уходят
    const shown = arcade ? this.tanks.filter((t) => t.human) : this.tanks;
    const tanks: TankUi[] = shown.map((t) => ({
      kind: t.human ? "human" : "bot",
      n: t.n,
      color: t.glow,
      hp: t.hp,
      maxHp: t.cap,
      alive: t.alive,
      team: t.team,
      fx: fxOf(t),
    }));

    let arcadeUi: ArcadeUi | null = null;
    if (arcade) {
      const boss = this.tanks.find((t) => t.alive && t.kind === "boss");
      const enemiesLeft = this.tanks.filter((t) => t.alive && !t.human).length + this.warns.length + this.queue.length;
      arcadeUi = {
        wave: this.wave,
        left: enemiesLeft,
        score: this.score,
        combo: this.combo,
        comboPct: this.combo > 0 ? clamp(1 - (now - this.lastKillAt) / 3000, 0, 1) : 0,
        kills: this.kills,
        best: this.best,
        newBest: this.newBest,
        special: this.spec?.special ?? null,
        boss: !!this.spec?.boss,
        bossHp: boss ? boss.hp : 0,
        bossMax: boss ? boss.maxHp : 0,
        rewards: this.rewardOptions,
        rewardPct: this.rewardOptions ? clamp((this.rewardUntil - now) / REWARD_MS, 0, 1) : 0,
        intro: this.waveIntro,
        upgrades: { ...this.up },
      };
    }

    this.onUi({
      phase: this.phase,
      paused: this.paused,
      countdown,
      timeSec,
      suddenDeath: this.suddenDeath,
      sdBanner,
      tanks,
      humans: this.cfg.players,
      mode: this.cfg.mode,
      scores: [...this.scores],
      round: this.round,
      winner: this.winner,
      roundWinner: this.roundWinner,
      winScore: this.cfg.winScore,
      arcade: arcadeUi,
    });
  }
}
