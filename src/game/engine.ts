import { sound } from "./audio";
import { Bot } from "./bot";
import type { GameConfig } from "./config";
import { MAPS, MAP_COUNT, type Rect } from "./maps";

/* ================================================================== */
/*  NEON DUEL — движок арены                                          */
/* ================================================================== */

export const W = 1280;
export const H = 720;
const WALL = 40;
const TANK_R = 18;
const MAX_HP = 3;
const CAP_HP = 5;
const BULLET_SPEED = 580;
const BULLET_R = 5;
const ROUND_TIME = 60;
const MAX_BULLETS = 5;

interface PadInput {
  x: number;
  y: number;
  fire: boolean;
}

type Phase = "countdown" | "play" | "roundover" | "gameover";

export interface FxState {
  shield: boolean;
  shieldLeft: number;
  rapidLeft: number;
  speedLeft: number;
}

export interface UiState {
  phase: Phase;
  paused: boolean;
  countdown: number; // 3,2,1 / 0 = «БОЙ!» / -1 = ничего
  timeSec: number;
  suddenDeath: boolean;
  sdBanner: boolean;
  hp: [number, number];
  scores: [number, number];
  round: number;
  winner: number; // -1 нет
  roundWinner: number;
  fx: [FxState, FxState];
  winScore: number;
  maxHp: number;
}

interface Tank {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  hp: number;
  alive: boolean;
  cooldown: number;
  recoil: number;
  shieldUntil: number;
  rapidUntil: number;
  speedUntil: number;
  spawnX: number;
  spawnY: number;
  baseColor: string;
  glow: string;
  dark: string;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: number;
  born: number;
  bounces: number;
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

type PowerType = "heal" | "shield" | "rapid" | "speed";

interface PowerUp {
  x: number;
  y: number;
  type: PowerType;
  born: number;
  expire: number;
}

const OB_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#818cf8", "#22d3ee", "#f472b6", "#a78bfa", "#38bdf8", "#e879f9"];

const POWER_COLORS: Record<PowerType, string> = {
  heal: "#4ade80",
  shield: "#60a5fa",
  rapid: "#fbbf24",
  speed: "#c084fc",
};

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
  private obstacles: Rect[];
  private bot: Bot | null = null;
  /** ввод с экрана (виртуальные стики) и с геймпадов, по игрокам */
  private touch: PadInput[] = [{ x: 0, y: 0, fire: false }, { x: 0, y: 0, fire: false }];
  private pads: PadInput[] = [{ x: 0, y: 0, fire: false }, { x: 0, y: 0, fire: false }];
  private padStartHeld = false;

  private phase: Phase = "countdown";
  private phaseEndsAt = 2200;
  private goUntil = 0;
  private paused = false;
  private round = 1;
  private scores: [number, number] = [0, 0];
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
  private nextPowerAt = 6000;

  private lastCount = -1;
  private timeScale = 1;
  private shake = 0;
  private dust: { x: number; y: number; s: number; o: number }[] = [];

  constructor(canvas: HTMLCanvasElement, cfg: GameConfig, onUi: (u: UiState) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.onUi = onUi;
    this.cfg = cfg;

    const mapIdx = cfg.map >= 0 && cfg.map < MAP_COUNT ? cfg.map : Math.floor(Math.random() * MAP_COUNT);
    this.obstacles = MAPS[mapIdx];
    if (cfg.mode === "bot") {
      this.bot = new Bot(
        { W, H, wall: WALL, tankR: TANK_R, bulletSpeed: BULLET_SPEED, maxHp: CAP_HP },
        this.obstacles,
        cfg.difficulty
      );
    }

    this.resetTanks();
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
      const dtReal = Math.min(0.033, (t - this.last) / 1000);
      this.last = t;
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
    const slots = this.cfg.mode === "bot" ? 1 : 2;
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
    // Start на первом геймпаде = пауза
    const start = !!list[0]?.buttons[9]?.pressed;
    if (start && !this.padStartHeld && this.phase !== "gameover") this.togglePause();
    this.padStartHeld = start;
  }

  private readInput(i: number): { ix: number; iy: number; fire: boolean } {
    const k = i === 0
      ? { l: "KeyA", r: "KeyD", u: "KeyW", d: "KeyS", f: ["KeyF", "Space"] }
      : { l: "ArrowLeft", r: "ArrowRight", u: "ArrowUp", d: "ArrowDown", f: ["Enter"] };
    // против бота обе раскладки управляют единственным игроком
    const both = this.bot && i === 0;
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

  private makeTank(i: number): Tank {
    const p1 = i === 0;
    return {
      x: p1 ? 118 : W - 118,
      y: H / 2,
      spawnX: p1 ? 118 : W - 118,
      spawnY: H / 2,
      angle: p1 ? 0 : Math.PI,
      vx: 0,
      vy: 0,
      hp: MAX_HP,
      alive: true,
      cooldown: 0,
      recoil: 0,
      shieldUntil: 0,
      rapidUntil: 0,
      speedUntil: 0,
      baseColor: p1 ? "#0891b2" : "#be185d",
      glow: p1 ? "#22d3ee" : "#f472b6",
      dark: p1 ? "#0c3644" : "#47122f",
    };
  }

  private resetTanks() {
    this.tanks = [this.makeTank(0), this.makeTank(1)];
  }

  private resetRound() {
    this.bullets = [];
    this.powerups = [];
    this.playTime = 0;
    this.suddenDeath = false;
    this.sdBannerUntil = -1;
    this.nextPowerAt = this.clock + 5500;
    this.round += 1;
    this.resetTanks();
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.scale = this.canvas.width / W;
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
      const c = Math.max(1, Math.min(3, Math.ceil((this.phaseEndsAt - now) / 733)));
      if (c !== this.lastCount) {
        this.lastCount = c;
        sound.beep(false);
      }
      if (now >= this.phaseEndsAt) {
        this.phase = "play";
        this.goUntil = now + 750;
        this.lastCount = -1;
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

    // ---- отсчёт в play ----
    if (this.phase === "play") {
      this.playTime += dt;
      const left = ROUND_TIME - this.playTime;
      if (left <= 0 && !this.suddenDeath) {
        const [a, b] = this.tanks;
        if (a.hp !== b.hp) {
          this.winRound(a.hp > b.hp ? 0 : 1, false);
        } else {
          this.suddenDeath = true;
          this.sdBannerUntil = now + 2200;
          sound.beep(true);
        }
      }
      // бонусы
      if (now >= this.nextPowerAt && this.powerups.length < 3) {
        this.spawnPowerup();
        this.nextPowerAt = now + rand(4200, 6500);
      }
      this.updateTanks(dt);
      this.updateBullets(dt);
    }

    this.updateParticles(dt);
    this.floats = this.floats.filter((f) => now - f.born < 900);
    this.powerups = this.powerups.filter((p) => now < p.expire);
  }

  /* ------------------------- танки ------------------------- */

  private updateTanks(dt: number) {
    const now = this.clock;
    this.tanks.forEach((t, i) => {
      if (!t.alive) return;
      const inp =
        i === 1 && this.bot
          ? this.bot.update(dt, t, this.tanks[0], this.bullets, this.powerups, 1)
          : this.readInput(i);
      let ix = inp.ix;
      let iy = inp.iy;
      const speedBoost = now < t.speedUntil;
      const maxSpeed = speedBoost ? 350 : 235;
      const accel = 1550;

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
        t.angle = rotToward(t.angle, Math.atan2(iy, ix), 11 * dt);
        // выхлоп ускорения
        if (Math.random() < dt * 26) {
          const bx = t.x - Math.cos(t.angle) * (TANK_R + 4);
          const by = t.y - Math.sin(t.angle) * (TANK_R + 4);
          this.particles.push({
            x: bx, y: by,
            vx: -Math.cos(t.angle) * rand(40, 90) + rand(-24, 24),
            vy: -Math.sin(t.angle) * rand(40, 90) + rand(-24, 24),
            life: 0, maxLife: rand(0.25, 0.45), size: rand(1.4, 2.8),
            color: t.glow, drag: 0.9,
          });
        }
      } else {
        const k = Math.exp(-6.5 * dt);
        t.vx *= k;
        t.vy *= k;
      }

      t.x += t.vx * dt;
      t.y += t.vy * dt;

      // стены
      t.x = clamp(t.x, WALL + TANK_R, W - WALL - TANK_R);
      t.y = clamp(t.y, WALL + TANK_R, H - WALL - TANK_R);

      // препятствия
      for (const o of this.obstacles) this.pushCircleOut(t, TANK_R, o);

      // танк-танк
      const other = this.tanks[1 - i];
      if (other.alive) {
        const dx = t.x - other.x;
        const dy = t.y - other.y;
        const d = Math.hypot(dx, dy);
        const min = TANK_R * 2;
        if (d > 0.001 && d < min) {
          const push = (min - d) / 2;
          t.x += (dx / d) * push;
          t.y += (dy / d) * push;
          other.x -= (dx / d) * push;
          other.y -= (dy / d) * push;
        }
      }

      // стрельба
      t.cooldown -= dt;
      t.recoil = Math.max(0, t.recoil - dt * 6);
      const wantFire = inp.fire;
      const cd = now < t.rapidUntil ? 0.16 : 0.42;
      const myBullets = this.bullets.filter((b) => b.owner === i && b.alive).length;
      if (wantFire && t.cooldown <= 0 && myBullets < MAX_BULLETS) {
        t.cooldown = cd;
        t.recoil = 1;
        this.fire(t, i);
      }

      // подбор бонусов
      for (const p of this.powerups) {
        if (Math.hypot(t.x - p.x, t.y - p.y) < TANK_R + 14) {
          this.applyPower(t, i, p);
          p.expire = now; // убрать
        }
      }
    });
  }

  private fire(t: Tank, owner: number) {
    const nx = Math.cos(t.angle);
    const ny = Math.sin(t.angle);
    this.bullets.push({
      x: t.x + nx * (TANK_R + 13),
      y: t.y + ny * (TANK_R + 13),
      vx: nx * BULLET_SPEED,
      vy: ny * BULLET_SPEED,
      owner,
      born: this.clock,
      bounces: 0,
      trail: [],
      alive: true,
      safe: true,
    });
    sound.shoot();
    // вспышка выстрела
    for (let k = 0; k < 6; k++) {
      this.particles.push({
        x: t.x + nx * (TANK_R + 16), y: t.y + ny * (TANK_R + 16),
        vx: nx * rand(120, 260) + rand(-60, 60), vy: ny * rand(120, 260) + rand(-60, 60),
        life: 0, maxLife: rand(0.08, 0.18), size: rand(1.5, 3.4),
        color: t.glow, drag: 0.86,
      });
    }
  }

  private pushCircleOut(c: { x: number; y: number }, r: number, rect: Rect): boolean {
    const cx = clamp(c.x, rect.x, rect.x + rect.w);
    const cy = clamp(c.y, rect.y, rect.y + rect.h);
    let dx = c.x - cx;
    let dy = c.y - cy;
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

    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 11) b.trail.shift();

      let bounced = false;

      // стены
      if (b.x < WALL + BULLET_R) { b.x = WALL + BULLET_R; b.vx = Math.abs(b.vx); bounced = true; }
      else if (b.x > W - WALL - BULLET_R) { b.x = W - WALL - BULLET_R; b.vx = -Math.abs(b.vx); bounced = true; }
      if (b.y < WALL + BULLET_R) { b.y = WALL + BULLET_R; b.vy = Math.abs(b.vy); bounced = true; }
      else if (b.y > H - WALL - BULLET_R) { b.y = H - WALL - BULLET_R; b.vy = -Math.abs(b.vy); bounced = true; }

      // препятствия
      for (const o of this.obstacles) {
        const cx = clamp(b.x, o.x, o.x + o.w);
        const cy = clamp(b.y, o.y, o.y + o.h);
        const dx = b.x - cx;
        const dy = b.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < BULLET_R * BULLET_R) {
          let nx0 = 0, ny0 = 0;
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            nx0 = dx / d; ny0 = dy / d;
          } else {
            const left = b.x - o.x, right = o.x + o.w - b.x;
            const top = b.y - o.y, bot = o.y + o.h - b.y;
            const m = Math.min(left, right, top, bot);
            if (m === left) nx0 = -1; else if (m === right) nx0 = 1;
            else if (m === top) ny0 = -1; else ny0 = 1;
          }
          const dot = b.vx * nx0 + b.vy * ny0;
          b.vx -= 2 * dot * nx0;
          b.vy -= 2 * dot * ny0;
          b.x += nx0 * (BULLET_R - Math.sqrt(Math.max(d2, 0.01)) + 1);
          b.y += ny0 * (BULLET_R - Math.sqrt(Math.max(d2, 0.01)) + 1);
          bounced = true;
          break;
        }
      }

      if (bounced) {
        b.bounces += 1;
        sound.bounce();
        for (let k = 0; k < 5; k++) {
          this.particles.push({
            x: b.x, y: b.y,
            vx: rand(-140, 140), vy: rand(-140, 140),
            life: 0, maxLife: rand(0.15, 0.3), size: rand(1, 2.4),
            color: "#e2e8f0", drag: 0.9,
          });
        }
        if (b.bounces > 2) {
          b.alive = false;
          continue;
        }
      }

      // попадания
      this.tanks.forEach((t, ti) => {
        if (!b.alive || !t.alive) return;
        const isOwner = ti === b.owner;
        const d = Math.hypot(t.x - b.x, t.y - b.y);
        // своя пуля опасна для владельца, только отлетев от него (стрельба в упор в стену не бьёт по себе)
        if (isOwner && b.safe) {
          if (d > TANK_R + BULLET_R + 4) b.safe = false;
          else return;
        }
        if (d < TANK_R + BULLET_R) {
          b.alive = false;
          this.hitTank(t, ti);
        }
      });

      // время жизни
      if (now - b.born > 7000) b.alive = false;
    }

    this.bullets = this.bullets.filter((b) => b.alive);
  }

  private hitTank(t: Tank, idx: number) {
    // раунд уже решён в этом кадре (одновременное попадание): второй удар не считается
    if (this.phase !== "play") return;
    const now = this.clock;
    if (now < t.shieldUntil) {
      t.shieldUntil = 0;
      this.addFloat(t.x, t.y - 26, this.cfg.texts.block, "#93c5fd");
      sound.block();
      this.shake = Math.max(this.shake, 6);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU;
        this.particles.push({
          x: t.x + Math.cos(a) * (TANK_R + 8), y: t.y + Math.sin(a) * (TANK_R + 8),
          vx: Math.cos(a) * rand(60, 160), vy: Math.sin(a) * rand(60, 160),
          life: 0, maxLife: rand(0.3, 0.5), size: rand(1.6, 3),
          color: "#60a5fa", drag: 0.88,
        });
      }
      return;
    }

    t.hp -= 1;
    this.shake = Math.max(this.shake, 13);
    sound.hit();
    this.addFloat(t.x, t.y - 26, "-1", "#f87171");
    this.burst(t.x, t.y, t.glow, 26, 60, 300);

    if (t.hp <= 0) {
      t.alive = false;
      this.timeScale = 0.22;
      this.shake = 24;
      sound.explosion();
      this.burst(t.x, t.y, t.glow, 46, 60, 380);
      this.burst(t.x, t.y, "#ffffff", 20, 100, 420);
      this.ring(t.x, t.y, t.glow);
      this.winRound(1 - idx, true);
    } else if (this.suddenDeath) {
      this.winRound(1 - idx, true);
    }
  }

  private winRound(idx: number, _byKill: boolean) {
    if (this.phase !== "play") return;
    this.scores[idx] += 1;
    this.roundWinner = idx;
    if (this.scores[idx] >= this.cfg.winScore) this.winner = idx;
    this.phase = "roundover";
    this.phaseEndsAt = this.clock + 2300;
  }

  /* ------------------------- бонусы ------------------------- */

  private spawnPowerup() {
    const types: PowerType[] = this.suddenDeath
      ? ["shield", "rapid", "speed"]
      : this.tanks.some((t) => t.hp < CAP_HP)
        ? ["heal", "shield", "shield", "rapid", "rapid", "speed", "heal"]
        : ["shield", "rapid", "speed"];
    const type = types[Math.floor(Math.random() * types.length)];

    for (let tries = 0; tries < 60; tries++) {
      const x = rand(WALL + 70, W - WALL - 70);
      const y = rand(WALL + 60, H - WALL - 60);
      let ok = true;
      for (const o of this.obstacles) {
        if (x > o.x - 34 && x < o.x + o.w + 34 && y > o.y - 34 && y < o.y + o.h + 34) { ok = false; break; }
      }
      if (ok) for (const t of this.tanks) {
        if (Math.hypot(t.x - x, t.y - y) < 150) { ok = false; break; }
      }
      if (ok) for (const p of this.powerups) {
        if (Math.hypot(p.x - x, p.y - y) < 90) { ok = false; break; }
      }
      if (ok) {
        this.powerups.push({ x, y, type, born: this.clock, expire: this.clock + 9500 });
        return;
      }
    }
  }

  private applyPower(t: Tank, idx: number, p: PowerUp) {
    const now = this.clock;
    sound.pickup();
    this.ring(p.x, p.y, POWER_COLORS[p.type]);
    switch (p.type) {
      case "heal":
        t.hp = Math.min(CAP_HP, t.hp + 1);
        this.addFloat(t.x, t.y - 26, "+1", "#4ade80");
        break;
      case "shield":
        t.shieldUntil = now + 7000;
        this.addFloat(t.x, t.y - 26, this.cfg.texts.shield, "#93c5fd");
        break;
      case "rapid":
        t.rapidUntil = now + 6000;
        this.addFloat(t.x, t.y - 26, this.cfg.texts.rapid, "#fde68a");
        break;
      case "speed":
        t.speedUntil = now + 6000;
        this.addFloat(t.x, t.y - 26, this.cfg.texts.speed, "#d8b4fe");
        break;
    }
    void idx;
  }

  /* ------------------------- частицы ------------------------- */

  private burst(x: number, y: number, color: string, n: number, minSp: number, maxSp: number) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      const sp = rand(minSp, maxSp);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, maxLife: rand(0.35, 0.8), size: rand(1.5, 4),
        color, drag: 0.9,
      });
    }
  }

  private ring(x: number, y: number, color: string) {
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * TAU;
      this.particles.push({
        x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6,
        vx: Math.cos(a) * 210, vy: Math.sin(a) * 210,
        life: 0, maxLife: 0.45, size: 2.4,
        color, drag: 0.84,
      });
    }
  }

  private burstConfetti(winnerIdx: number) {
    const col = winnerIdx === 0 ? "#22d3ee" : "#f472b6";
    for (let i = 0; i < 130; i++) {
      this.particles.push({
        x: Math.random() * W, y: -20 - Math.random() * 160,
        vx: rand(-40, 40), vy: rand(90, 260),
        life: 0, maxLife: rand(1.6, 2.8), size: rand(2, 4.6),
        color: Math.random() < 0.5 ? col : ["#a78bfa", "#fbbf24", "#4ade80"][Math.floor(Math.random() * 3)],
        drag: 0.995,
      });
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k;
      p.vy *= k;
      p.vy += 40 * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
  }

  private addFloat(x: number, y: number, text: string, color: string) {
    this.floats.push({ x, y, text, color, born: this.clock });
  }

  /* ================================================================== */
  /*  РЕНДЕР                                                            */
  /* ================================================================== */

  private render() {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // фон
    const bg = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 780);
    bg.addColorStop(0, "#0a1024");
    bg.addColorStop(1, "#05060f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // пыль
    ctx.save();
    for (const d of this.dust) {
      d.y -= 0.06 * this.timeScale;
      if (d.y < -4) { d.y = H + 4; d.x = Math.random() * W; }
      ctx.globalAlpha = d.o;
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(d.x, d.y, d.s, d.s);
    }
    ctx.restore();

    // сетка
    ctx.save();
    ctx.strokeStyle = "rgba(103, 232, 249, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = WALL; x <= W - WALL; x += 40) { ctx.moveTo(x, WALL); ctx.lineTo(x, H - WALL); }
    for (let y = WALL; y <= H - WALL; y += 40) { ctx.moveTo(WALL, y); ctx.lineTo(W - WALL, y); }
    ctx.stroke();
    ctx.restore();

    // тряска камеры
    ctx.save();
    if (this.shake > 0.2) {
      ctx.translate(rand(-this.shake, this.shake) * 0.5, rand(-this.shake, this.shake) * 0.5);
    }

    // препятствия
    this.obstacles.forEach((o, i) => {
      const col = OB_COLORS[i % OB_COLORS.length];
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.fillStyle = "rgba(10, 16, 36, 0.92)";
      rr(ctx, o.x, o.y, o.w, o.h, 10);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2;
      rr(ctx, o.x, o.y, o.w, o.h, 10);
      ctx.stroke();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = col;
      rr(ctx, o.x + 3, o.y + 3, o.w - 6, o.h - 6, 8);
      ctx.fill();
      ctx.restore();
    });

    // бонусы
    for (const p of this.powerups) this.drawPower(p);

    // пули
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.bullets) this.drawBullet(b);
    ctx.restore();

    // танки
    this.tanks.forEach((t, i) => this.drawTank(t, i));

    // частицы
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const pr = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, pr);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + pr * 0.7), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // всплывающий текст
    for (const f of this.floats) {
      const age = (this.clock - f.born) / 900;
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.font = "700 21px 'Russo One', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12;
      ctx.fillText(f.text, f.x, f.y - age * 34);
      ctx.restore();
    }

    ctx.restore(); // конец тряски

    // стены арены (поверх всего)
    const wallGrad = ctx.createLinearGradient(0, 0, W, 0);
    wallGrad.addColorStop(0, "#22d3ee");
    wallGrad.addColorStop(0.5, "#7c3aed");
    wallGrad.addColorStop(1, "#f472b6");
    ctx.save();
    ctx.strokeStyle = wallGrad;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#7c3aed";
    ctx.shadowBlur = 16;
    rr(ctx, WALL - 6, WALL - 6, W - (WALL - 6) * 2, H - (WALL - 6) * 2, 16);
    ctx.stroke();
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1;
    rr(ctx, WALL - 12, WALL - 12, W - (WALL - 12) * 2, H - (WALL - 12) * 2, 20);
    ctx.stroke();
    ctx.restore();
  }

  private drawTank(t: Tank, idx: number) {
    const ctx = this.ctx;
    if (!t.alive) return;
    const bob = Math.sin(this.clock / 300 + idx * 2) * 1.2;
    const speedGlow = this.clock < t.speedUntil;
    const rapidOn = this.clock < t.rapidUntil;

    ctx.save();
    ctx.translate(t.x, t.y + bob);
    ctx.rotate(t.angle);
    ctx.translate(-t.recoil * 4, 0);

    // свечение под танком
    ctx.save();
    ctx.globalAlpha = 0.22;
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
    g.addColorStop(0, t.glow);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.shadowColor = t.glow;
    ctx.shadowBlur = 18;

    // гусеницы
    ctx.fillStyle = "#0a0f1e";
    rr(ctx, -19, -17, 34, 8, 3); ctx.fill();
    rr(ctx, -19, 9, 34, 8, 3); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(148,163,184,0.35)";
    for (let k = -16; k <= 10; k += 6) {
      ctx.fillRect(k, -16, 3, 6);
      ctx.fillRect(k, 10, 3, 6);
    }

    // корпус
    ctx.shadowColor = t.glow;
    ctx.shadowBlur = 16;
    const bodyGrad = ctx.createLinearGradient(-20, 0, 16, 0);
    bodyGrad.addColorStop(0, t.dark);
    bodyGrad.addColorStop(1, t.baseColor);
    ctx.fillStyle = bodyGrad;
    rr(ctx, -20, -13, 38, 26, 8);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = t.glow;
    rr(ctx, -20, -13, 38, 26, 8);
    ctx.stroke();

    // башня
    ctx.fillStyle = t.baseColor;
    ctx.beginPath();
    ctx.arc(0, 0, 10.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = t.glow;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // ствол
    ctx.fillStyle = rapidOn ? "#fbbf24" : t.glow;
    rr(ctx, 7, -3.4, 19, 6.8, 3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0b1020";
    ctx.beginPath();
    ctx.arc(0, 0, 4.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(0, 0, 2.1, 0, TAU);
    ctx.fill();

    ctx.restore();

    // щит
    if (this.clock < t.shieldUntil) {
      ctx.save();
      const pulse = 1 + Math.sin(this.clock / 130) * 0.05;
      ctx.strokeStyle = "#60a5fa";
      ctx.shadowColor = "#60a5fa";
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2.4;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(t.x, t.y + bob, (TANK_R + 11) * pulse, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#60a5fa";
      ctx.beginPath();
      ctx.arc(t.x, t.y + bob, (TANK_R + 11) * pulse, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // ускорение — хвостовые всполохи
    if (speedGlow) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(this.clock / 90) * 0.2;
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#c084fc";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(t.x, t.y + bob, TANK_R + 5, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // маркер игрока
    ctx.save();
    ctx.font = "700 13px 'Russo One', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = t.glow;
    ctx.shadowColor = t.glow;
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.95;
    ctx.fillText(idx === 0 ? "P1" : "P2", t.x, t.y - TANK_R - 12 + bob);
    ctx.restore();
  }

  private drawBullet(b: Bullet) {
    const ctx = this.ctx;
    const col = b.owner === 0 ? "#67e8f9" : "#f9a8d4";

    // шлейф
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 1; i < b.trail.length; i++) {
      const a = i / b.trail.length;
      ctx.strokeStyle = col;
      ctx.globalAlpha = a * 0.5;
      ctx.lineWidth = 1 + a * 4;
      ctx.beginPath();
      ctx.moveTo(b.trail[i - 1].x, b.trail[i - 1].y);
      ctx.lineTo(b.trail[i].x, b.trail[i].y);
      ctx.stroke();
    }
    ctx.restore();

    // ядро
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 16;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET_R + 1.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawPower(p: PowerUp) {
    const ctx = this.ctx;
    const col = POWER_COLORS[p.type];
    const remain = (p.expire - this.clock) / 9500;
    const blink = remain < 0.25 ? (Math.floor(this.clock / 120) % 2 === 0 ? 0.25 : 0.8) : 0.9;
    const pulse = 1 + Math.sin(this.clock / 220 + p.x) * 0.12;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = blink;
    ctx.shadowColor = col;
    ctx.shadowBlur = 18;

    // ореол
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
    g.addColorStop(0, col);
    g.addColorStop(1, "transparent");
    ctx.globalAlpha = blink * 0.3;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = blink;

    ctx.fillStyle = "#0b1020";
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (p.type) {
      case "heal":
        ctx.fillRect(-2.4, -8, 4.8, 16);
        ctx.fillRect(-8, -2.4, 16, 4.8);
        break;
      case "shield":
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(7, -4.6);
        ctx.lineTo(7, 2.4);
        ctx.quadraticCurveTo(7, 7, 0, 9.4);
        ctx.quadraticCurveTo(-7, 7, -7, 2.4);
        ctx.lineTo(-7, -4.6);
        ctx.closePath();
        ctx.stroke();
        break;
      case "rapid":
        ctx.beginPath();
        ctx.moveTo(2.4, -9);
        ctx.lineTo(-4.6, 1.6);
        ctx.lineTo(-0.6, 1.6);
        ctx.lineTo(-2.4, 9);
        ctx.lineTo(4.6, -1.6);
        ctx.lineTo(0.6, -1.6);
        ctx.closePath();
        ctx.fill();
        break;
      case "speed":
        ctx.beginPath();
        ctx.moveTo(-7.5, -6);
        ctx.lineTo(-1.5, 0);
        ctx.lineTo(-7.5, 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(1, -6);
        ctx.lineTo(7, 0);
        ctx.lineTo(1, 6);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  /* ================================================================== */
  /*  UI-снимок                                                          */
  /* ================================================================== */

  private emitUi() {
    const now = this.clock;
    const countdown =
      this.phase === "countdown" ? Math.max(1, Math.min(3, Math.ceil((this.phaseEndsAt - now) / 733)))
      : now < this.goUntil ? 0
      : -1;

    const fxOf = (t: Tank): FxState => ({
      shield: now < t.shieldUntil,
      shieldLeft: Math.max(0, Math.ceil((t.shieldUntil - now) / 1000)),
      rapidLeft: Math.max(0, Math.ceil((t.rapidUntil - now) / 1000)),
      speedLeft: Math.max(0, Math.ceil((t.speedUntil - now) / 1000)),
    });

    this.onUi({
      phase: this.phase,
      paused: this.paused,
      countdown,
      timeSec: Math.max(0, Math.ceil(ROUND_TIME - this.playTime)),
      suddenDeath: this.suddenDeath,
      sdBanner: now < this.sdBannerUntil,
      hp: [this.tanks[0].hp, this.tanks[1].hp],
      scores: [this.scores[0], this.scores[1]],
      round: this.round,
      winner: this.winner,
      roundWinner: this.roundWinner,
      fx: [fxOf(this.tanks[0]), fxOf(this.tanks[1])],
      winScore: this.cfg.winScore,
      maxHp: CAP_HP,
    });
  }
}
