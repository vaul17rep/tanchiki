import type { Rect } from "./maps";

/* Разрушаемые стены. Каждое препятствие карты режется на кирпичи (~28 px),
   кирпич ломается от одного попадания. Для быстрых запросов кирпичи лежат
   в равномерной сетке. */

export interface Brick extends Rect {
  alive: boolean;
  /** индекс исходного препятствия (цвет) */
  src: number;
}

const BRICK = 28;
const CELL = 40;
const COLS = Math.ceil(1280 / CELL);
const ROWS = Math.ceil(720 / CELL);

export class Walls {
  bricks: Brick[] = [];
  /** растёт при каждом разрушении: по нему кэш отрисовки и сетка поиска пути понимают, что пора обновиться */
  version = 0;
  private grid: Brick[][] = [];
  private stamp = 0;
  private seen = new Map<Brick, number>();
  private scratch: Brick[] = [];

  constructor(obstacles: Rect[] = []) {
    this.reset(obstacles);
  }

  reset(obstacles: Rect[]) {
    this.bricks = [];
    this.grid = Array.from({ length: COLS * ROWS }, () => []);
    obstacles.forEach((o, src) => {
      const nx = Math.max(1, Math.round(o.w / BRICK));
      const ny = Math.max(1, Math.round(o.h / BRICK));
      const bw = o.w / nx;
      const bh = o.h / ny;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const b: Brick = { x: o.x + i * bw, y: o.y + j * bh, w: bw, h: bh, alive: true, src };
          this.bricks.push(b);
          const c0 = Math.max(0, Math.floor(b.x / CELL));
          const c1 = Math.min(COLS - 1, Math.floor((b.x + b.w) / CELL));
          const r0 = Math.max(0, Math.floor(b.y / CELL));
          const r1 = Math.min(ROWS - 1, Math.floor((b.y + b.h) / CELL));
          for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) this.grid[cy * COLS + cx].push(b);
        }
      }
    });
    this.version++;
  }

  destroy(b: Brick) {
    if (!b.alive) return;
    b.alive = false;
    this.version++;
  }

  /** Живые кирпичи, которые могут пересекать круг (x, y, r). Массив общий, не хранить. */
  near(x: number, y: number, r: number): Brick[] {
    const out = this.scratch;
    out.length = 0;
    this.stamp++;
    const c0 = Math.max(0, Math.floor((x - r) / CELL));
    const c1 = Math.min(COLS - 1, Math.floor((x + r) / CELL));
    const r0 = Math.max(0, Math.floor((y - r) / CELL));
    const r1 = Math.min(ROWS - 1, Math.floor((y + r) / CELL));
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        for (const b of this.grid[cy * COLS + cx]) {
          if (!b.alive || this.seen.get(b) === this.stamp) continue;
          this.seen.set(b, this.stamp);
          out.push(b);
        }
      }
    }
    return out;
  }

  /** Есть ли живой кирпич в прямоугольнике x±pad (для свободного места под бонус). */
  blockedAt(x: number, y: number, pad: number): boolean {
    for (const b of this.near(x, y, pad + 30)) {
      if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
    }
    return false;
  }

  alive(): Brick[] {
    return this.bricks.filter((b) => b.alive);
  }
}
