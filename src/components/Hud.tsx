import { Shield, Snowflake, Wind, Zap, Crosshair } from "lucide-react";
import type { TankUi, UiState } from "../game/engine";
import type { Dict } from "../i18n";
import { cn } from "../utils/cn";

/* ---------- имена и цвета ---------- */

export function tankName(ui: UiState, tk: TankUi, t: Dict) {
  if (tk.kind === "human") return ui.humans === 1 ? t.player : `${t.player} ${tk.n}`;
  const bots = ui.tanks.filter((x) => x.kind === "bot").length;
  return bots === 1 ? t.bot : `${t.bot} ${tk.n}`;
}

/** Название победившей команды: в отряде команды целиком, иначе имя танка. */
export function teamName(ui: UiState, team: number, t: Dict) {
  if (ui.mode === "squad") return team === 0 ? t.teamHumans : t.teamBots;
  const tk = ui.tanks.find((x) => x.team === team);
  return tk ? tankName(ui, tk, t) : "";
}

export function teamColor(ui: UiState, team: number) {
  if (ui.mode === "squad") return team === 0 ? "#22d3ee" : "#f87171";
  return ui.tanks.find((x) => x.team === team)?.color ?? "#e2e8f0";
}

/* ---------- мелкие части ---------- */

function HpBar({ hp, max, color, mirrored, small }: { hp: number; max: number; color: string; mirrored?: boolean; small?: boolean }) {
  return (
    <div className={cn("flex", small ? "gap-0.5" : "gap-1", mirrored && "flex-row-reverse")}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className="hp-slot"
          style={{
            ...(small ? { width: "0.7rem", height: "0.38rem" } : {}),
            ...(i < hp ? { background: color, boxShadow: `0 0 8px ${color}cc`, borderColor: "transparent" } : {}),
            ...(mirrored ? { transform: "skewX(16deg)" } : {}),
          }}
        />
      ))}
    </div>
  );
}

function ScorePips({ score, total, label, color, mirrored }: { score: number; total: number; label: string; color: string; mirrored?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1.5", mirrored && "flex-row-reverse")}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="score-pip"
          style={i < score ? { backgroundColor: color, borderColor: "transparent", boxShadow: `0 0 10px ${color}` } : undefined}
        />
      ))}
      <span className="ml-1 text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
    </div>
  );
}

function FxChips({ fx, t }: { fx: TankUi["fx"]; t: Dict }) {
  return (
    <div className="flex h-6 flex-wrap items-center gap-1.5">
      {fx.shield && (
        <span className="fx-chip border-blue-400/50 bg-blue-400/10 text-blue-300">
          <Shield className="h-3 w-3" /> {t.fxShield} {fx.shieldLeft}
        </span>
      )}
      {fx.rapidLeft > 0 && (
        <span className="fx-chip border-amber-400/50 bg-amber-400/10 text-amber-300">
          <Zap className="h-3 w-3" /> {t.fxRapid} {fx.rapidLeft}
        </span>
      )}
      {fx.speedLeft > 0 && (
        <span className="fx-chip border-purple-400/50 bg-purple-400/10 text-purple-300">
          <Wind className="h-3 w-3" /> {fx.speedLeft}
        </span>
      )}
      {fx.tripleLeft > 0 && (
        <span className="fx-chip border-yellow-300/60 bg-yellow-300/10 text-yellow-200">
          <Crosshair className="h-3 w-3" /> {t.fxTriple} {fx.tripleLeft}
        </span>
      )}
      {fx.frozenLeft > 0 && (
        <span className="fx-chip border-sky-300/60 bg-sky-300/10 text-sky-200">
          <Snowflake className="h-3 w-3" /> {t.fxFreeze} {fx.frozenLeft}
        </span>
      )}
    </div>
  );
}

function TankHud({
  ui, t, tk, mirrored, showScore, compact,
}: {
  ui: UiState; t: Dict; tk: TankUi; mirrored?: boolean; showScore: boolean; compact?: boolean;
}) {
  return (
    <div className={cn("pointer-events-none flex flex-col", compact ? "gap-0.5" : "gap-1.5", mirrored && "items-end", !tk.alive && "opacity-40")}>
      <div className={cn("flex items-center gap-3", mirrored && "flex-row-reverse")}>
        <span
          className="whitespace-nowrap font-display text-sm tracking-[0.2em]"
          style={{ color: tk.color, textShadow: `0 0 14px ${tk.color}88` }}
        >
          {tankName(ui, tk, t)}
        </span>
        <HpBar hp={tk.hp} max={tk.maxHp} color={tk.color} mirrored={mirrored} small={compact} />
      </div>
      {showScore && <ScorePips score={ui.scores[tk.team] ?? 0} total={ui.winScore} label={t.rounds} color={tk.color} mirrored={mirrored} />}
      {!compact && <FxChips fx={tk.fx} t={t} />}
    </div>
  );
}

/** Строка бота в боях с толпой: компактная. */
function BotRow({ ui, t, tk, showStars }: { ui: UiState; t: Dict; tk: TankUi; showStars: boolean }) {
  return (
    <div className={cn("flex items-center justify-end gap-2", !tk.alive && "opacity-35")}>
      {showStars && (ui.scores[tk.team] ?? 0) > 0 && (
        <span className="text-[10px] tabular-nums text-slate-400">★{ui.scores[tk.team]}</span>
      )}
      <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: tk.color }}>
        {tankName(ui, tk, t)}
      </span>
      <HpBar hp={tk.hp} max={tk.maxHp} color={tk.color} mirrored small />
    </div>
  );
}

/* ---------- верхняя панель ---------- */

export function Hud({ ui, t }: { ui: UiState; t: Dict }) {
  const humans = ui.tanks.filter((x) => x.kind === "human");
  const bots = ui.tanks.filter((x) => x.kind === "bot");
  const a = ui.arcade;
  const duel = ui.mode === "duel";
  const ffa = ui.mode === "ffa";

  // слева люди; в дуэли справа второй танк
  const left = duel ? [ui.tanks[0]] : humans;
  const right = duel ? [ui.tanks[1]] : [];

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-5 pt-4 sm:px-7">
      <div className="flex w-[32%] flex-col gap-2">
        {left.map((tk, i) => (
          <TankHud key={i} ui={ui} t={t} tk={tk} showScore={duel || ffa} compact={!duel && humans.length > 1} />
        ))}
        {ui.mode === "squad" && (
          <ScorePips score={ui.scores[0] ?? 0} total={ui.winScore} label={t.teamHumans} color="#22d3ee" />
        )}
      </div>

      <div className="flex flex-col items-center">
        {a ? (
          <>
            <span className="font-display text-2xl tabular-nums text-slate-100" style={{ textShadow: "0 0 18px rgba(148,163,184,.4)" }}>
              {a.score.toLocaleString()}
            </span>
            <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
              {t.wave} {a.wave} · {a.left} {t.enemiesLeft}
            </span>
            {a.combo >= 2 && (
              <span className="mt-1 flex flex-col items-center">
                <span className="font-display text-sm tracking-[0.2em] text-amber-300">x{a.combo} {t.comboWord}</span>
                <span className="mt-0.5 h-1 w-20 overflow-hidden rounded bg-slate-800">
                  <span className="block h-full bg-amber-300" style={{ width: `${a.comboPct * 100}%` }} />
                </span>
              </span>
            )}
            {a.boss && a.bossMax > 0 && (
              <span className="mt-2 h-2 w-48 overflow-hidden rounded border border-fuchsia-400/50 bg-slate-900/70">
                <span className="block h-full bg-fuchsia-400" style={{ width: `${(a.bossHp / a.bossMax) * 100}%` }} />
              </span>
            )}
          </>
        ) : (
          <>
            <span
              className={cn(
                "font-display text-3xl tabular-nums text-slate-100",
                ui.timeSec <= 10 && !ui.suddenDeath && "timer-low"
              )}
              style={{ textShadow: "0 0 18px rgba(148,163,184,.4)" }}
            >
              {ui.suddenDeath ? "— : —" : `${Math.floor(ui.timeSec / 60)}:${String(ui.timeSec % 60).padStart(2, "0")}`}
            </span>
            {ui.suddenDeath ? (
              <span className="sudden-blink font-display text-[13px] tracking-[0.22em] text-red-400" style={{ textShadow: "0 0 16px rgba(248,113,113,.7)" }}>
                {t.suddenDeath}
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                {t.round} {ui.round}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex w-[32%] flex-col items-end gap-1.5">
        {right.map((tk, i) => (
          <TankHud key={i} ui={ui} t={t} tk={tk} mirrored showScore />
        ))}
        {!duel && !a && (
          <>
            {ui.mode === "squad" && (
              <ScorePips score={ui.scores[1] ?? 0} total={ui.winScore} label={t.teamBots} color="#f87171" mirrored />
            )}
            <div className="flex flex-col gap-1">
              {bots.map((tk, i) => (
                <BotRow key={i} ui={ui} t={t} tk={tk} showStars={ffa} />
              ))}
            </div>
          </>
        )}
        {a && (
          <span className="text-right text-[10px] uppercase tracking-[0.2em] text-slate-500">
            {t.bestWord}: {a.best.score.toLocaleString()} · {t.wave} {a.best.wave}
          </span>
        )}
      </div>
    </div>
  );
}
