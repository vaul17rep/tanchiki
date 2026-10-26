import type { Bounds, Rect } from "./maps";
import type { Walls } from "./walls";

/* Общая для всех ботов навигация: сетка проходимости, видимость, поиск пути.
   Пересобирается, когда ломается стена или меняется размер поля. */

const CELL = 20;
const COLS = Math.ceil(1280 / CELL);
const ROWS = Math.ceil(720 / CELL);

/** Пересекает ли отрезок прямоугольник (с запасом pad). Liang–Barsky. */
export function segHitsRect(x0: number, y0: number, x1: number, y1: number, r: Rect, pad: number) {
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

export class Nav {
  bounds: Bounds;
  private blocked = new Uint8Array(COLS * ROWS);
  private rects: Rect[] = [];
  private ver = -1;
  private boundsStamp = 0;
  private builtStamp = -1;

  constructor(private walls: Walls, bounds: Bounds, private tankR: number) {
    this.bounds = bounds;
  }

  setBounds(b: Bounds) {
    this.bounds = b;
    this.boundsStamp++;
  }

  /** Вызывать раз в кадр: дёшево, если ничего не менялось. */
  sync() {
    if (this.ver === this.walls.version && this.builtStamp === this.boundsStamp) return;
    this.ver = this.walls.version;
    this.builtStamp = this.boundsStamp;
    this.rects = this.walls.alive();
    const pad = this.tankR + 3;
    const bd = this.bounds;
    const r = this.tankR;
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const x = cx * CELL + CELL / 2;
        const y = cy * CELL + CELL / 2;
        let b = x < bd.l + r || x > bd.r - r || y < bd.t + r || y > bd.b - r;
        if (!b) {
          for (const o of this.rects) {
            if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) {
              b = true;
              break;
            }
          }
        }
        this.blocked[cy * COLS + cx] = b ? 1 : 0;
      }
    }
  }

  los(x0: number, y0: number, x1: number, y1: number, pad = 7) {
    for (const o of this.rects) if (segHitsRect(x0, y0, x1, y1, o, pad)) return false;
    return true;
  }

  private cellOf(x: number, y: number) {
    return {
      cx: Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL))),
      cy: Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL))),
    };
  }

  /** BFS по сетке в 8 направлениях. */
  findPath(sx: number, sy: number, gx: number, gy: number) {
    const blocked = this.blocked;
    const s = this.cellOf(sx, sy);
    const g = this.cellOf(gx, gy);
    const start = s.cy * COLS + s.cx;
    const goal = g.cy * COLS + g.cx;
    const prev = new Int32Array(COLS * ROWS).fill(-2);
    const q: number[] = [start];
    prev[start] = -1;
    let found = start === goal;
    for (let qi = 0; qi < q.length && !found; qi++) {
      const cur = q[qi];
      const cx = cur % COLS;
      const cy = (cur / COLS) | 0;
      for (let dy = -1; dy <= 1 && !found; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const ni = ny * COLS + nx;
          if (prev[ni] !== -2) continue;
          // цель всегда достижима, даже если стоит рядом с препятствием
          if (blocked[ni] && ni !== goal) continue;
          if (dx && dy && (blocked[cy * COLS + nx] || blocked[ny * COLS + cx])) continue;
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
      out.push({ x: (c % COLS) * CELL + CELL / 2, y: ((c / COLS) | 0) * CELL + CELL / 2 });
    }
    return out.reverse();
  }
}
