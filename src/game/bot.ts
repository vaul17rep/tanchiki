import type { Difficulty } from "./config";
import type { Rect } from "./maps";

/* ИИ соперника. Танк поворачивается в сторону движения, поэтому бот
   «целится» поворотом корпуса и стреляет, когда направление совпало. */

export interface BotTank {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  hp: number;
  alive: boolean;
}

export interface BotBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: number;
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
}

interface Env {
  W: number;
  H: number;
  wall: number;
  tankR: number;
  bulletSpeed: number;
  maxHp: number;
}

const CELL = 20;
const TAU = Math.PI * 2;

const PARAMS = [
  // лёгкий
  { think: 0.32, tol: 0.34, react: 0.45, err: 0.3, dodge: 0, power: 0, speed: 0.6, range: 560, lead: false },
  // обычный
  { think: 0.16, tol: 0.17, react: 0.2, err: 0.12, dodge: 0.55, power: 1, speed: 0.85, range: 850, lead: false },
  // сложный
  { think: 0.07, tol: 0.08, react: 0.06, err: 0.03, dodge: 1, power: 1, speed: 1, range: 1300, lead: true },
];

function angDiff(a: number, b: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Пересекает ли отрезок прямоугольник (с запасом pad). Liang–Barsky. */
function segHitsRect(x0: number, y0: number, x1: number, y1: number, r: Rect, pad: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - (r.x - pad), r.x + r.w + pad - x0, y0 - (r.y - pad), r.y + r.h + pad - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

export class Bot {
  private cols: number;
  private rows: number;
  private blocked: Uint8Array;
  private p;
  private thinkIn = 0;
  private path: { x: number; y: number }[] = [];
  private repathIn = 0;
  private move = { x: 0, y: 0 };
  private fire = false;
  private alignedFor = 0;
  private aimErr = 0;
  private errIn = 0;
  private dodgeFor = 0;
  private dodgeDir = { x: 0, y: 0 };
  private stuckFor = 0;
  private jitterFor = 0;
  private jitterDir = { x: 1, y: 0 };

  constructor(
    private env: Env,
    private obstacles: Rect[],
    difficulty: Difficulty
  ) {
    this.p = PARAMS[difficulty];
    this.cols = Math.ceil(env.W / CELL);
    this.rows = Math.ceil(env.H / CELL);
    this.blocked = new Uint8Array(this.cols * this.rows);
    const pad = env.tankR + 3;
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const x = cx * CELL + CELL / 2;
        const y = cy * CELL + CELL / 2;
        let b = x < env.wall + env.tankR || x > env.W - env.wall - env.tankR || y < env.wall + env.tankR || y > env.H - env.wall - env.tankR;
        if (!b) {
          for (const o of obstacles) {
            if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) {
              b = true;
              break;
            }
          }
        }
        this.blocked[cy * this.cols + cx] = b ? 1 : 0;
      }
    }
  }

  private cellOf(x: number, y: number) {
    return {
      cx: Math.max(0, Math.min(this.cols - 1, Math.floor(x / CELL))),
      cy: Math.max(0, Math.min(this.rows - 1, Math.floor(y / CELL))),
    };
  }

  private los(x0: number, y0: number, x1: number, y1: number, pad = 7) {
    for (const o of this.obstacles) if (segHitsRect(x0, y0, x1, y1, o, pad)) return false;
    return true;
  }

  /** BFS по сетке в 8 направлениях. */
  private findPath(sx: number, sy: number, gx: number, gy: number) {
    const { cols, rows, blocked } = this;
    const s = this.cellOf(sx, sy);
    const g = this.cellOf(gx, gy);
    const start = s.cy * cols + s.cx;
    const goal = g.cy * cols + g.cx;
    const prev = new Int32Array(cols * rows).fill(-2);
    const q: number[] = [start];
    prev[start] = -1;
    let found = start === goal;
    for (let qi = 0; qi < q.length && !found; qi++) {
      const cur = q[qi];
      const cx = cur % cols;
      const cy = (cur / cols) | 0;
      for (let dy = -1; dy <= 1 && !found; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const ni = ny * cols + nx;
          if (prev[ni] !== -2) continue;
          // цель всегда достижима, даже если стоит рядом с препятствием
          if (blocked[ni] && ni !== goal) continue;
          if (dx && dy && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
          prev[ni] = cur;
          if (ni === goal) {
            found = true;
            break;
          }
          q.push(ni);
        }
      }
    }
    const out: { x: number; y: number }[] = [];
    if (!found) return out;
    for (let c = goal; c !== start && c >= 0; c = prev[c]) {
      out.push({ x: (c % cols) * CELL + CELL / 2, y: ((c / cols) | 0) * CELL + CELL / 2 });
    }
    return out.reverse();
  }

  update(dt: number, me: BotTank, enemy: BotTank, bullets: BotBullet[], powers: BotPower[], myIndex: number): BotInput {
    const p = this.p;
    this.errIn -= dt;
    if (this.errIn <= 0) {
      this.errIn = 0.6;
      this.aimErr = (Math.random() * 2 - 1) * p.err;
    }
    this.dodgeFor = Math.max(0, this.dodgeFor - dt);
    this.jitterFor = Math.max(0, this.jitterFor - dt);

    const dx = enemy.x - me.x;
    const dy = enemy.y - me.y;
    const dist = Math.hypot(dx, dy);
    const seen = enemy.alive && this.los(me.x, me.y, enemy.x, enemy.y);

    // прицел с упреждением на сложном уровне
    let ax = enemy.x;
    let ay = enemy.y;
    if (p.lead) {
      const tt = dist / this.env.bulletSpeed;
      ax += enemy.vx * tt * 0.8;
      ay += enemy.vy * tt * 0.8;
    }
    const aimAng = Math.atan2(ay - me.y, ax - me.x) + this.aimErr;
    const diff = Math.abs(angDiff(me.angle, aimAng));
    const aligned = seen && diff < p.tol && dist < p.range;
    this.alignedFor = aligned ? this.alignedFor + dt : 0;

    // уклонение от летящих пуль
    if (this.dodgeFor <= 0 && p.dodge > 0) {
      for (const b of bullets) {
        if (!b.alive || b.owner === myIndex) continue;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const rx = me.x - b.x;
        const ry = me.y - b.y;
        const along = (rx * b.vx + ry * b.vy) / sp;
        if (along < 0 || along > sp * 0.55) continue;
        const cross = (rx * b.vy - ry * b.vx) / sp;
        if (Math.abs(cross) < this.env.tankR + 22 && Math.random() < p.dodge) {
          const nx = -b.vy / sp;
          const ny = b.vx / sp;
          const side = Math.sign(cross) || 1;
          let sx = nx * -side;
          let sy = ny * -side;
          // выбираем сторону, где больше места
          const px = me.x + sx * 90;
          const py = me.y + sy * 90;
          if (px < this.env.wall + 30 || px > this.env.W - this.env.wall - 30 || py < this.env.wall + 30 || py > this.env.H - this.env.wall - 30) {
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
    if (this.thinkIn <= 0) {
      this.thinkIn = p.think;
      let gx = enemy.x;
      let gy = enemy.y;
      let goingToPower = false;
      if (p.power && powers.length) {
        let best = -1;
        let bd = 340;
        powers.forEach((pw, i) => {
          if (pw.type === "heal" && me.hp >= this.env.maxHp) return;
          const d = Math.hypot(pw.x - me.x, pw.y - me.y);
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
        if (best >= 0 && (!seen || dist > 300)) {
          gx = powers[best].x;
          gy = powers[best].y;
          goingToPower = true;
        }
      }
      const direct = (seen && !goingToPower) || this.los(me.x, me.y, gx, gy, this.env.tankR + 4);
      if (direct) {
        this.move = { x: gx - me.x, y: gy - me.y };
        this.path = [];
      } else {
        if (this.repathIn <= 0 || this.path.length === 0) {
          this.path = this.findPath(me.x, me.y, gx, gy);
          this.repathIn = 0.3;
        }
        const wp = this.path[Math.min(2, this.path.length - 1)];
        this.move = wp ? { x: wp.x - me.x, y: wp.y - me.y } : { x: gx - me.x, y: gy - me.y };
      }
      // слишком близко, а выстрела нет: отступаем боком
      if (seen && dist < 130 && !aligned) {
        this.move = { x: -(enemy.y - me.y), y: enemy.x - me.x };
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
    if (this.dodgeFor > 0) {
      mx = this.dodgeDir.x;
      my = this.dodgeDir.y;
    } else if (this.jitterFor > 0) {
      mx = this.jitterDir.x;
      my = this.jitterDir.y;
    } else if (seen && dist < 520) {
      // в зоне видимости доворачиваем корпус на цель
      mx = Math.cos(aimAng);
      my = Math.sin(aimAng);
    }
    const len = Math.hypot(mx, my) || 1;
    mx = (mx / len) * p.speed;
    my = (my / len) * p.speed;

    this.fire = aligned && this.alignedFor >= p.react;
    return { ix: mx, iy: my, fire: this.fire };
  }
}
