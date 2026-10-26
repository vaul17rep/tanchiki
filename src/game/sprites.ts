/* Заранее отрисованные спрайты: тени (shadowBlur) дорогие, поэтому танки, пули
   и бонусы рисуются один раз в маленький холст и дальше просто копируются. */

const TAU = Math.PI * 2;

export type PowerType = "heal" | "shield" | "rapid" | "speed" | "triple" | "freeze" | "shock";

export const POWER_COLORS: Record<PowerType, string> = {
  heal: "#4ade80",
  shield: "#60a5fa",
  rapid: "#fbbf24",
  speed: "#c084fc",
  triple: "#fcd34d",
  freeze: "#7dd3fc",
  shock: "#fda4af",
};

export const RARE_TYPES: PowerType[] = ["triple", "freeze", "shock"];

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface TankLook {
  base: string;
  glow: string;
  dark: string;
  r: number;
  rapid: boolean;
}

export class Sprites {
  private scale = 1;
  private cache = new Map<string, HTMLCanvasElement>();

  setScale(s: number) {
    if (Math.abs(s - this.scale) < 0.001) return;
    this.scale = s;
    this.cache.clear();
  }

  private make(key: string, size: number, draw: (ctx: CanvasRenderingContext2D) => void) {
    let c = this.cache.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = Math.max(2, Math.ceil(size * this.scale));
    const ctx = c.getContext("2d")!;
    ctx.scale(this.scale, this.scale);
    ctx.translate(size / 2, size / 2);
    draw(ctx);
    this.cache.set(key, c);
    return c;
  }

  /** Танк, повёрнутый вправо; центр спрайта = центр танка. Размер холста: 128 логических px. */
  tank(look: TankLook) {
    const key = `t|${look.base}|${look.glow}|${look.dark}|${look.r}|${look.rapid}`;
    return this.make(key, 128, (ctx) => {
      const k = look.r / 18;
      ctx.scale(k, k);
      // свечение под танком
      ctx.save();
      ctx.globalAlpha = 0.22;
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
      g.addColorStop(0, look.glow);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.shadowColor = look.glow;
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#0a0f1e";
      rr(ctx, -19, -17, 34, 8, 3); ctx.fill();
      rr(ctx, -19, 9, 34, 8, 3); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(148,163,184,0.35)";
      for (let x = -16; x <= 10; x += 6) {
        ctx.fillRect(x, -16, 3, 6);
        ctx.fillRect(x, 10, 3, 6);
      }
      ctx.shadowColor = look.glow;
      ctx.shadowBlur = 16;
      const bodyGrad = ctx.createLinearGradient(-20, 0, 16, 0);
      bodyGrad.addColorStop(0, look.dark);
      bodyGrad.addColorStop(1, look.base);
      ctx.fillStyle = bodyGrad;
      rr(ctx, -20, -13, 38, 26, 8);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = look.glow;
      rr(ctx, -20, -13, 38, 26, 8);
      ctx.stroke();
      ctx.fillStyle = look.base;
      ctx.beginPath();
      ctx.arc(0, 0, 10.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = look.glow;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = look.rapid ? "#fbbf24" : look.glow;
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
    });
  }

  bullet(color: string) {
    return this.make(`b|${color}`, 40, (ctx) => {
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 18);
      g.addColorStop(0, color);
      g.addColorStop(0.35, color);
      g.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, TAU);
      ctx.fill();
    });
  }

  power(type: PowerType, rare: boolean) {
    return this.make(`p|${type}|${rare}`, 72, (ctx) => {
      const col = POWER_COLORS[type];
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
      g.addColorStop(0, col);
      g.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowColor = rare ? "#fde047" : col;
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#0b1020";
      ctx.strokeStyle = rare ? "#fde047" : col;
      ctx.lineWidth = rare ? 3 : 2;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.fill();
      ctx.stroke();
      if (rare) {
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, 19, 0, TAU);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      switch (type) {
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
        case "triple":
          // веер из трёх линий
          for (const a of [-0.6, 0, 0.6]) {
            ctx.beginPath();
            ctx.moveTo(0, 7);
            ctx.lineTo(Math.sin(a) * 11, 7 - Math.cos(a) * 15);
            ctx.stroke();
          }
          break;
        case "freeze":
          // снежинка
          for (let i = 0; i < 3; i++) {
            const a = (i * Math.PI) / 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * -8.5, Math.sin(a) * -8.5);
            ctx.lineTo(Math.cos(a) * 8.5, Math.sin(a) * 8.5);
            ctx.stroke();
          }
          break;
        case "shock":
          // расходящиеся дуги
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, TAU);
          ctx.fill();
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(0, 0, 8.5, 0, TAU);
          ctx.stroke();
          break;
      }
    });
  }
}
