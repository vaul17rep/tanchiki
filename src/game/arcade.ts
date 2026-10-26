import type { BotKind } from "./bot";
import { FULL, type Bounds, type Rect } from "./maps";

/* Данные аркадного режима: типы врагов, состав волн, размеры поля, награды. */

export type Special = "rain" | "mines" | "avalanche" | "dark" | "mirror";
export type RewardId = "hp" | "speed" | "reload" | "bounce" | "shield" | "bspeed";

export const REWARD_IDS: RewardId[] = ["hp", "speed", "reload", "bounce", "shield", "bspeed"];

export interface EnemyStat {
  hp: number;
  r: number;
  speedMul: number;
  /** множитель задержки между выстрелами (больше = реже) */
  fireMul: number;
  color: string;
  dark: string;
  score: number;
}

export const ENEMY: Record<BotKind, EnemyStat> = {
  normal: { hp: 1, r: 18, speedMul: 0.85, fireMul: 1.3, color: "#f87171", dark: "#451a1a", score: 100 },
  scout: { hp: 1, r: 14, speedMul: 1.4, fireMul: 1.8, color: "#fbbf24", dark: "#4a3408", score: 120 },
  heavy: { hp: 2, r: 23, speedMul: 0.6, fireMul: 1.1, color: "#fb923c", dark: "#4a2308", score: 250 },
  sniper: { hp: 1, r: 17, speedMul: 0.75, fireMul: 2.2, color: "#a78bfa", dark: "#2a1f55", score: 220 },
  bouncer: { hp: 2, r: 18, speedMul: 0.85, fireMul: 1.5, color: "#4ade80", dark: "#0f3a22", score: 220 },
  kamikaze: { hp: 1, r: 16, speedMul: 1.45, fireMul: 1, color: "#f43f5e", dark: "#4c0f1c", score: 150 },
  boss: { hp: 12, r: 31, speedMul: 0.55, fireMul: 1, color: "#e879f9", dark: "#4a1456", score: 2000 },
};

export interface WaveSpec {
  n: number;
  boss: boolean;
  special: Special | null;
  queue: BotKind[];
  maxField: number;
  /** с скольких сторон выходят враги */
  sides: number;
  stage: 0 | 1 | 2;
  /** надбавка к уровню ботов с ростом волны */
  tierBonus: number;
}

const SPECIALS: Special[] = ["rain", "mines", "avalanche", "dark", "mirror"];

/** Особая волна: на 2-й и 4-й волне каждой пятёрки, по кругу. */
export function specialOf(n: number): Special | null {
  const m = n % 5;
  if (m !== 2 && m !== 4) return null;
  const k = Math.floor(n / 5) * 2 + (m === 4 ? 1 : 0);
  return SPECIALS[k % SPECIALS.length];
}

export function bossHp(n: number) {
  return 12 + 4 * (Math.floor(n / 5) - 1);
}

export function enemyHp(kind: BotKind, n: number) {
  if (kind === "heavy") return n >= 8 ? 3 : 2;
  if (kind === "bouncer") return n >= 12 ? 3 : 2;
  if (kind === "normal" && n >= 9) return 2;
  return ENEMY[kind].hp;
}

export function waveSpec(n: number): WaveSpec {
  const boss = n % 5 === 0;
  const special = boss ? null : specialOf(n);
  const base = n <= 6 ? n : 6 + Math.floor((n - 6) / 2);
  let queue: BotKind[] = [];
  if (boss) {
    queue = ["boss"];
  } else if (special === "avalanche") {
    const cnt = 9 + Math.floor(n / 5);
    for (let i = 0; i < cnt; i++) queue.push(Math.random() < 0.7 ? "normal" : "scout");
  } else if (special === "mirror") {
    queue = ["normal"];
  } else {
    const weights: [BotKind, number][] = [
      ["normal", 4],
      ["scout", n >= 2 ? 2 : 0],
      ["heavy", n >= 3 ? 1 + Math.floor(n / 4) : 0],
      ["sniper", n >= 4 ? 1 + Math.floor((n - 4) / 4) : 0],
      ["kamikaze", n >= 5 ? 1 + Math.floor((n - 5) / 5) : 0],
      ["bouncer", n >= 6 ? 1 + Math.floor((n - 6) / 5) : 0],
    ];
    const total = weights.reduce((a, [, w]) => a + w, 0);
    for (let i = 0; i < base; i++) {
      if (i === 0 && n < 3) {
        queue.push("normal");
        continue;
      }
      let r = Math.random() * total;
      let pick: BotKind = "normal";
      for (const [k, w] of weights) {
        r -= w;
        if (r <= 0) {
          pick = k;
          break;
        }
      }
      queue.push(pick);
    }
  }
  const maxField = boss ? 1 : special === "avalanche" ? 10 : Math.min(queue.length, n >= 10 ? 7 : 6);
  const sides = special === "avalanche" ? 4 : n < 3 ? 1 : n < 6 ? 2 : 3;
  const stage: 0 | 1 | 2 = boss || special === "avalanche" ? 2 : maxField <= 2 ? 0 : maxField <= 4 ? 1 : 2;
  return { n, boss, special, queue, maxField, sides, stage, tierBonus: Math.floor(n / 6) };
}

export function stageBounds(stage: 0 | 1 | 2): Bounds {
  if (stage === 0) return { l: 220, t: 120, r: 1060, b: 600 };
  if (stage === 1) return { l: 130, t: 80, r: 1150, b: 640 };
  return FULL;
}

const mirror = (r: Rect): Rect => ({ x: 1280 - r.x - r.w, y: r.y, w: r.w, h: r.h });

/** Случайная симметричная расстановка блоков; центр оставляем свободным для старта игроков. */
export function genObstacles(b: Bounds, stage: number): Rect[] {
  const out: Rect[] = [];
  const pairs = 2 + stage + (Math.random() < 0.5 ? 1 : 0);
  const sizes = [28, 56, 84, 112];
  const overlaps = (a: Rect, c: Rect, pad: number) =>
    a.x < c.x + c.w + pad && a.x + a.w + pad > c.x && a.y < c.y + c.h + pad && a.y + a.h + pad > c.y;
  const hub: Rect = { x: 520, y: 270, w: 240, h: 180 };
  for (let tries = 0; tries < 80 && out.length < pairs * 2; tries++) {
    let w = sizes[Math.floor(Math.random() * sizes.length)];
    let h = sizes[Math.floor(Math.random() * 2)];
    if (Math.random() < 0.5) [w, h] = [h, w];
    const x = b.l + 70 + Math.random() * (640 - w - 40 - (b.l + 70));
    const y = b.t + 50 + Math.random() * (b.b - b.t - 100 - h);
    const r: Rect = { x, y, w, h };
    const m = mirror(r);
    if (overlaps(r, hub, 20) || overlaps(m, hub, 20)) continue;
    if (out.some((o) => overlaps(r, o, 50) || overlaps(m, o, 50))) continue;
    out.push(r, m);
  }
  return out;
}
