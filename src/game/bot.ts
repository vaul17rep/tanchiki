import type { Difficulty } from "./config";
import type { Nav } from "./nav";

/* ИИ ботов. Танк поворачивается в сторону движения, поэтому обычный бот
   «целится» поворотом корпуса и стреляет, когда направление совпало.
   Особые враги аркады (снайпер, рикошетчик) целятся независимо от движения. */

export type BotKind = "normal" | "scout" | "heavy" | "sniper" | "bouncer" | "kamikaze" | "boss";

export interface BotTank {
  id: number;
  team: number;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  r: number;
  human: boolean;
}

export interface BotBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: number;
  ownerId: number;
  alive: boolean;
}

export interface BotPower {
  x: number;
  y: number;
  type: string;
}

export interface BotInput {
  ix: number;
  iy: number;
  fire: boolean;
  /** куда повернуть корпус независимо от движения (снайпер, рикошетчик) */
  aim?: number;
  /** снайпер заряжает выстрел: движок рисует лазерный прицел */
  charging?: boolean;
}

const TAU = Math.PI * 2;

const PARAMS = [
  // лёгкий: медленный, косой, стреляет редко, не уворачивается
  { think: 0.5, tol: 0.5, react: 0.8, err: 0.5, dodge: 0, speed: 0.5, range: 450, gap: 1.3, powerR: 0.6 },
  // обычный
  { think: 0.3, tol: 0.26, react: 0.45, err: 0.22, dodge: 0.25, speed: 0.75, range: 700, gap: 0.8, powerR: 1 },
  // сложный
  { think: 0.14, tol: 0.14, react: 0.22, err: 0.1, dodge: 0.6, speed: 0.92, range: 1000, gap: 0.5, powerR: 1.2 },
];

function angDiff(a: number, b: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Насколько боту нужен бонус (0 = не нужен). */
function needOf(type: string, me: BotTank): number {
  switch (type) {
    case "heal":
      if (me.hp >= me.maxHp) return 0;
      return me.hp <= 1 ? 1 : me.hp <= me.maxHp / 2 ? 0.8 : 0.35;
    case "shield":
      return me.hp <= 2 ? 0.7 : 0.5;
    case "rapid":
      return 0.45;
    case "speed":
      return 0.3;
    case "triple":
      return 0.6;
    case "freeze":
      return 0.6;
    case "shock":
      return 0.55;
    default:
      return 0.3;
  }
}

export class Bot {
  private p;
  private thinkIn = 0;
  private path: { x: number; y: number }[] = [];
  private repathIn = 0;
  private move = { x: 0, y: 0 };
  private alignedFor = 0;
  private sinceShot = 9;
  private aimErr = 0;
  private errIn = 0;
  private dodgeFor = 0;
  private dodgeDir = { x: 0, y: 0 };
  private stuckFor = 0;
  private jitterFor = 0;
  private jitterDir = { x: 1, y: 0 };
  private targetId = -1;
  private retargetIn = 0;
  private chargeFor = 0;
  private ricAim: number | null = null;
  private ricIn = 0;
  private hold = 260;
  private strafe = 1;
  private strafeIn = 0;

  constructor(
    private nav: Nav,
    difficulty: Difficulty,
    private kind: BotKind = "normal",
    env: { crowd: boolean } = { crowd: false }
  ) {
    const base = PARAMS[difficulty];
    this.p = { ...base };
    if (env.crowd) {
      // в боях с толпой боты чуть медлительнее, иначе игроку слишком тяжело
      this.p.react *= 1.6;
      this.p.gap *= 2;
    }
    if (kind === "kamikaze") this.p.speed = 1;
    // у каждого бота своя излюбленная дистанция боя, чтобы толпа не липла к цели вплотную
    const [h0, h1] = kind === "scout" ? [120, 240] : kind === "heavy" ? [150, 280] : kind === "boss" ? [260, 400] : [190, 380];
    this.hold = h0 + Math.random() * (h1 - h0);
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    if (kind === "sniper") {
      this.p.range = 1200;
      this.p.tol = 0.08;
    }
  }

  private pickTarget(me: BotTank, tanks: BotTank[]): BotTank | null {
    let best: BotTank | null = null;
    let bestScore = Infinity;
    for (const t of tanks) {
      if (!t.alive || t.id === me.id || t.team === me.team) continue;
      if (this.kind === "kamikaze" && !t.human) continue;
      const d = Math.hypot(t.x - me.x, t.y - me.y);
      let s = d;
      if (this.nav.los(me.x, me.y, t.x, t.y, 7)) s -= 200;
      if (t.hp <= 1) s -= 60;
      if (t.id === this.targetId) s -= 90;
      if (s < bestScore) {
        bestScore = s;
        best = t;
      }
    }
    return best;
  }

  /** Выбор бонуса: бой в приоритете, берём то, что очень нужно или лежит по пути. */
  private choosePower(me: BotTank, target: BotTank, seen: boolean, dist: number, tanks: BotTank[], powers: BotPower[]) {
    if (this.kind === "kamikaze" || this.kind === "boss") return null;
    let best: BotPower | null = null;
    let bestVal = -Infinity;
    for (const pw of powers) {
      const need = needOf(pw.type, me);
      if (need <= 0) continue;
      const d = Math.hypot(pw.x - me.x, pw.y - me.y);
      if (d > 340 * this.p.powerR) continue;
      // гонку, которую уже проигрываем, не начинаем
      if (tanks.some((o) => o.alive && o.id !== me.id && Math.hypot(o.x - pw.x, o.y - pw.y) < d * 0.65)) continue;
      const engaged = seen && dist < 300;
      const detour = d + Math.hypot(pw.x - target.x, pw.y - target.y) - dist;
      const onWay = detour < 0.2 * dist + 30;
      let ok: boolean;
      if (engaged) ok = d < 70 || (need >= 0.9 && d < 140);
      else ok = need >= 0.9 || onWay || (!seen && need >= 0.4);
      if (!ok) continue;
      const val = need * 400 - d;
      if (val > bestVal) {
        bestVal = val;
        best = pw;
      }
    }
    return best;
  }

  /** Точка отражения от стены арены, чтобы достать цель за укрытием. */
  private ricochetAim(me: BotTank, t: BotTank): number | null {
    const bd = this.nav.bounds;
    const cands: { hx: number; hy: number; len: number }[] = [];
    const sides: [number, number, number][] = [
      // [нормаль-ось, значение стены, ...] закодировано ниже
      [0, bd.l, 0],
      [0, bd.r, 0],
      [1, bd.t, 0],
      [1, bd.b, 0],
    ];
    for (const [axis, w] of sides) {
      const mx = axis === 0 ? 2 * w - t.x : t.x;
      const my = axis === 1 ? 2 * w - t.y : t.y;
      const dx = mx - me.x;
      const dy = my - me.y;
      const k = axis === 0 ? (w - me.x) / dx : (w - me.y) / dy;
      if (!(k > 0 && k < 1)) continue;
      const hx = me.x + dx * k;
      const hy = me.y + dy * k;
      if (hx < bd.l || hx > bd.r || hy < bd.t || hy > bd.b) continue;
      // чуть отступаем от стены, чтобы отрезок не упирался в неё
      const ix = axis === 0 ? hx + (hx < (bd.l + bd.r) / 2 ? 4 : -4) : hx;
      const iy = axis === 1 ? hy + (hy < (bd.t + bd.b) / 2 ? 4 : -4) : hy;
      if (!this.nav.los(me.x, me.y, ix, iy, 6) || !this.nav.los(ix, iy, t.x, t.y, 6)) continue;
      cands.push({ hx, hy, len: Math.hypot(hx - me.x, hy - me.y) + Math.hypot(t.x - hx, t.y - hy) });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.len - b.len);
    return Math.atan2(cands[0].hy - me.y, cands[0].hx - me.x);
  }

  update(
    dt: number,
    me: BotTank,
    tanks: BotTank[],
    bullets: BotBullet[],
    powers: BotPower[],
    friendlyFire: boolean
  ): BotInput {
    const p = this.p;
    this.errIn -= dt;
    this.sinceShot += dt;
    this.retargetIn -= dt;
    if (this.errIn <= 0) {
      this.errIn = 0.6;
      this.aimErr = (Math.random() * 2 - 1) * p.err;
    }
    this.dodgeFor = Math.max(0, this.dodgeFor - dt);
    this.jitterFor = Math.max(0, this.jitterFor - dt);

    let enemy: BotTank | null = tanks.find((t) => t.id === this.targetId && t.alive) ?? null;
    if (!enemy || this.retargetIn <= 0) {
      this.retargetIn = 1.1;
      enemy = this.pickTarget(me, tanks);
    }
    if (!enemy) return { ix: 0, iy: 0, fire: false };
    this.targetId = enemy.id;

    const dx = enemy.x - me.x;
    const dy = enemy.y - me.y;
    const dist = Math.hypot(dx, dy);
    const seen = this.nav.los(me.x, me.y, enemy.x, enemy.y, 7);

    // рикошетчик: если цели не видно, ищем выстрел через отражение
    this.ricIn -= dt;
    if (this.kind === "bouncer") {
      if (seen) this.ricAim = null;
      else if (this.ricIn <= 0) {
        this.ricIn = 0.35;
        this.ricAim = this.ricochetAim(me, enemy);
      }
    }

    let aimAng = Math.atan2(dy, dx) + this.aimErr;
    let canShoot = seen;
    if (this.kind === "bouncer" && !seen && this.ricAim !== null) {
      aimAng = this.ricAim + this.aimErr * 0.4;
      canShoot = true;
    }
    const diff = Math.abs(angDiff(me.angle, aimAng));
    const aligned = canShoot && diff < p.tol && dist < p.range;
    this.alignedFor = aligned ? this.alignedFor + dt : 0;

    // уклонение от летящих пуль
    if (this.dodgeFor <= 0 && p.dodge > 0 && this.kind !== "kamikaze") {
      for (const b of bullets) {
        if (!b.alive || b.team === me.team) continue;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const rx = me.x - b.x;
        const ry = me.y - b.y;
        const along = (rx * b.vx + ry * b.vy) / sp;
        if (along < 0 || along > sp * 0.55) continue;
        const cross = (rx * b.vy - ry * b.vx) / sp;
        if (Math.abs(cross) < me.r + 22 && Math.random() < p.dodge) {
          const nx = -b.vy / sp;
          const ny = b.vx / sp;
          const side = Math.sign(cross) || 1;
          let sx = nx * -side;
          let sy = ny * -side;
          const px = me.x + sx * 90;
          const py = me.y + sy * 90;
          const bd = this.nav.bounds;
          if (px < bd.l + 30 || px > bd.r - 30 || py < bd.t + 30 || py > bd.b - 30) {
            sx = -sx;
            sy = -sy;
          }
          this.dodgeDir = { x: sx, y: sy };
          this.dodgeFor = 0.35;
          break;
        }
      }
    }

    // раз в think секунд пересматриваем цель движения
    this.thinkIn -= dt;
    this.repathIn -= dt;
    this.strafeIn -= dt;
    if (this.strafeIn <= 0) {
      this.strafeIn = 1.5 + Math.random() * 2;
      if (Math.random() < 0.6) this.strafe = -this.strafe;
    }
    if (this.thinkIn <= 0) {
      this.thinkIn = p.think;
      let gx = enemy.x;
      let gy = enemy.y;
      let goingToPower = false;
      const pw = this.choosePower(me, enemy, seen, dist, tanks, powers);
      if (pw) {
        gx = pw.x;
        gy = pw.y;
        goingToPower = true;
      }
      const direct = (seen && !goingToPower) || this.nav.los(me.x, me.y, gx, gy, me.r + 4);
      if (direct) {
        this.move = { x: gx - me.x, y: gy - me.y };
        this.path = [];
      } else {
        if (this.repathIn <= 0 || this.path.length === 0) {
          this.path = this.nav.findPath(me.x, me.y, gx, gy);
          this.repathIn = 0.3;
        }
        const wp = this.path[Math.min(2, this.path.length - 1)];
        this.move = wp ? { x: wp.x - me.x, y: wp.y - me.y } : { x: gx - me.x, y: gy - me.y };
      }
      // в зоне видимости держим свою дистанцию и ходим боком, а не лезем вплотную
      if (seen && !goingToPower && this.kind !== "kamikaze" && this.kind !== "sniper") {
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        const sx = -ny * this.strafe;
        const sy = nx * this.strafe;
        if (dist < this.hold * 0.75) this.move = { x: -nx * 0.8 + sx * 0.6, y: -ny * 0.8 + sy * 0.6 };
        else if (dist > this.hold * 1.15) this.move = { x: nx + sx * 0.3, y: ny + sy * 0.3 };
        else this.move = { x: sx, y: sy };
      }
      // снайпер держит дистанцию
      if (this.kind === "sniper" && seen && !goingToPower) {
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        if (dist < 380) this.move = { x: -nx + -ny * 0.5, y: -ny + nx * 0.5 };
        else if (dist > 560) this.move = { x: nx, y: ny };
        else this.move = { x: -ny * 0.6, y: nx * 0.6 };
      }
    }

    // застревание
    const spd = Math.hypot(me.vx, me.vy);
    this.stuckFor = spd < 25 ? this.stuckFor + dt : 0;
    if (this.stuckFor > 0.7) {
      this.stuckFor = 0;
      this.jitterFor = 0.45;
      const a = Math.random() * TAU;
      this.jitterDir = { x: Math.cos(a), y: Math.sin(a) };
    }

    let mx = this.move.x;
    let my = this.move.y;
    const independentAim = this.kind !== "kamikaze";
    if (this.dodgeFor > 0) {
      mx = this.dodgeDir.x;
      my = this.dodgeDir.y;
    } else if (this.jitterFor > 0) {
      mx = this.jitterDir.x;
      my = this.jitterDir.y;
    }
    let len = Math.hypot(mx, my) || 1;
    mx /= len;
    my /= len;
    // расталкиваемся с соседями, чтобы боты не кружили друг в друге
    for (const o of tanks) {
      if (this.kind === "kamikaze" || !o.alive || o.id === me.id) continue;
      const rx = me.x - o.x;
      const ry = me.y - o.y;
      const d = Math.hypot(rx, ry);
      const reach = me.r + o.r + 55;
      if (d > 0.01 && d < reach) {
        const k = (1 - d / reach) * 1.6;
        mx += (rx / d) * k;
        my += (ry / d) * k;
      }
    }
    len = Math.hypot(mx, my) || 1;
    mx = (mx / len) * p.speed;
    my = (my / len) * p.speed;

    // стрельба
    let fire = false;
    let charging = false;
    if (this.kind === "kamikaze") {
      return { ix: mx, iy: my, fire: false };
    }
    if (this.kind === "sniper") {
      if (aligned && this.dodgeFor <= 0) {
        if (this.chargeFor === 0) this.chargeFor = 0.0001;
        this.chargeFor += dt;
        charging = true;
        mx = 0;
        my = 0;
        if (this.chargeFor >= 0.6 && this.sinceShot >= p.gap) {
          fire = true;
          this.chargeFor = 0;
          charging = false;
        }
      } else {
        this.chargeFor = 0;
      }
    } else {
      fire = aligned && this.alignedFor >= p.react && this.sinceShot >= p.gap;
    }
    // при включённом огне по своим не стреляем, если на линии союзник
    if (fire && friendlyFire) {
      const cx = Math.cos(me.angle);
      const cy = Math.sin(me.angle);
      for (const o of tanks) {
        if (!o.alive || o.id === me.id || o.team !== me.team) continue;
        const rx = o.x - me.x;
        const ry = o.y - me.y;
        const along = rx * cx + ry * cy;
        if (along > 0 && Math.abs(rx * cy - ry * cx) < o.r + 8) {
          fire = false;
          break;
        }
      }
    }
    if (fire) this.sinceShot = 0;
    return { ix: mx, iy: my, fire, aim: independentAim && (seen || (this.kind === "bouncer" && this.ricAim !== null)) ? aimAng : undefined, charging };
  }
}
