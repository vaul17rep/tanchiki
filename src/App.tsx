import { useCallback, useEffect, useRef, useState } from "react";
import {
  HeartPulse,
  Home,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Swords,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from "lucide-react";
import { Game, type UiState } from "./game/engine";
import { sound } from "./game/audio";
import { cn } from "./utils/cn";

/* ================================================================ */
/*  Мелкие компоненты                                                */
/* ================================================================ */

function Keycap({ label, tone, wide }: { label: string; tone?: "cyan" | "pink"; wide?: boolean }) {
  return (
    <span
      className={cn(
        "keycap",
        tone === "cyan" && "keycap-cyan",
        tone === "pink" && "keycap-pink",
        wide && "px-4"
      )}
    >
      {label}
    </span>
  );
}

function PlayerCard({
  side,
  title,
  color,
  moveKeys,
  fireLabel,
}: {
  side: "left" | "right";
  title: string;
  color: "cyan" | "pink";
  moveKeys: [string, string, string, string];
  fireLabel: string;
}) {
  const isCyan = color === "cyan";
  return (
    <div
      className={cn(
        "glass relative overflow-hidden rounded-2xl p-5 sm:p-6",
        "transition-transform duration-300 hover:-translate-y-1"
      )}
      style={{
        boxShadow: isCyan
          ? "0 0 60px -18px rgba(34,211,238,0.4), inset 0 0 40px -26px rgba(34,211,238,0.5)"
          : "0 0 60px -18px rgba(244,114,182,0.4), inset 0 0 40px -26px rgba(244,114,182,0.5)",
      }}
    >
      <div
        className={cn(
          "absolute -top-10 h-28 w-28 rounded-full blur-3xl",
          isCyan ? "-left-10 bg-cyan-400/25" : "-right-10 bg-pink-400/25"
        )}
      />
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl border",
            isCyan
              ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300"
              : "border-pink-400/50 bg-pink-400/10 text-pink-300"
          )}
        >
          <Swords className="h-5 w-5" />
        </div>
        <div>
          <p className={cn("font-display text-lg tracking-[0.14em]", isCyan ? "text-cyan-300" : "text-pink-300")}>
            {title}
          </p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            {side === "left" ? "левая сторона клавиатуры" : "правая сторона клавиатуры"}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-end gap-6">
        <div className="inline-block">
          <div className="flex justify-center">
            <Keycap label={moveKeys[0]} tone={color} />
          </div>
          <div className="mt-1 flex gap-1">
            <Keycap label={moveKeys[1]} tone={color} />
            <Keycap label={moveKeys[2]} tone={color} />
            <Keycap label={moveKeys[3]} tone={color} />
          </div>
          <p className="mt-2 text-center text-[10px] uppercase tracking-[0.22em] text-slate-500">движение</p>
        </div>
        <div>
          <Keycap label={fireLabel} tone={color} wide />
          <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">выстрел</p>
        </div>
      </div>
    </div>
  );
}

function PowerLegend() {
  const items = [
    { icon: HeartPulse, name: "Ремкомплект", desc: "+1 жизнь", color: "#4ade80" },
    { icon: Shield, name: "Щит", desc: "1 блок, 7 сек", color: "#60a5fa" },
    { icon: Zap, name: "Темп", desc: "x3 скорострельность", color: "#fbbf24" },
    { icon: Wind, name: "Форсаж", desc: "+50% скорости", color: "#c084fc" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {items.map(({ icon: Icon, name, desc, color }) => (
        <div key={name} className="glass flex items-center gap-2.5 rounded-full py-1.5 pl-2 pr-4">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: `${color}22`, color, boxShadow: `0 0 14px ${color}55` }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold text-slate-200">{name}</span>
          <span className="text-[10px] text-slate-500">{desc}</span>
        </div>
      ))}
    </div>
  );
}

/* ================================================================ */
/*  HUD                                                              */
/* ================================================================ */

function HpBar({ hp, color, mirrored }: { hp: number; color: "cyan" | "pink"; mirrored?: boolean }) {
  return (
    <div className={cn("flex gap-1", mirrored && "flex-row-reverse")}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "hp-slot",
            i < hp && (color === "cyan" ? "hp-on-cyan" : "hp-on-pink"),
            mirrored && "scale-x-[-1]"
          )}
        />
      ))}
    </div>
  );
}

function ScorePips({ score, color, mirrored }: { score: number; color: "cyan" | "pink"; mirrored?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1.5", mirrored && "flex-row-reverse")}>
      {Array.from({ length: 3 }).map((_, i) => (
        <span
          key={i}
          className="score-pip"
          style={
            i < score
              ? {
                  backgroundColor: color === "cyan" ? "#22d3ee" : "#f472b6",
                  borderColor: "transparent",
                  boxShadow: `0 0 10px ${color === "cyan" ? "#22d3ee" : "#f472b6"}`,
                }
              : undefined
          }
        />
      ))}
      <span className="ml-1 text-[9px] uppercase tracking-[0.18em] text-slate-500">раунды</span>
    </div>
  );
}

function FxChips({ fx }: { fx: UiState["fx"][number] }) {
  return (
    <div className="flex h-6 items-center gap-1.5">
      {fx.shield && (
        <span className="fx-chip border-blue-400/50 bg-blue-400/10 text-blue-300">
          <Shield className="h-3 w-3" /> ЩИТ {fx.shieldLeft}
        </span>
      )}
      {fx.rapidLeft > 0 && (
        <span className="fx-chip border-amber-400/50 bg-amber-400/10 text-amber-300">
          <Zap className="h-3 w-3" /> ТЕМП {fx.rapidLeft}
        </span>
      )}
      {fx.speedLeft > 0 && (
        <span className="fx-chip border-purple-400/50 bg-purple-400/10 text-purple-300">
          <Wind className="h-3 w-3" /> {fx.speedLeft}
        </span>
      )}
    </div>
  );
}

function PlayerHud({
  ui,
  idx,
  mirrored,
}: {
  ui: UiState;
  idx: 0 | 1;
  mirrored?: boolean;
}) {
  const color = idx === 0 ? "cyan" : "pink";
  return (
    <div className={cn("pointer-events-none flex w-[32%] flex-col gap-1.5", mirrored && "items-end")}>
      <div className={cn("flex items-center gap-3", mirrored && "flex-row-reverse")}>
        <span
          className={cn(
            "font-display text-sm tracking-[0.2em]",
            color === "cyan" ? "text-cyan-300" : "text-pink-300"
          )}
          style={{ textShadow: `0 0 14px ${color === "cyan" ? "#22d3ee88" : "#f472b688"}` }}
        >
          ИГРОК {idx + 1}
        </span>
        <HpBar hp={ui.hp[idx]} color={color} mirrored={mirrored} />
      </div>
      <ScorePips score={ui.scores[idx]} color={color} mirrored={mirrored} />
      <FxChips fx={ui.fx[idx]} />
    </div>
  );
}

/* ================================================================ */
/*  Приложение                                                       */
/* ================================================================ */

export default function App() {
  const [screen, setScreen] = useState<"menu" | "game">("menu");
  const [gameKey, setGameKey] = useState(0);
  const [ui, setUi] = useState<UiState | null>(null);
  const [muted, setMuted] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const lastJson = useRef("");
  const uiRef = useRef<UiState | null>(null);
  uiRef.current = ui;

  const handleUi = useCallback((u: UiState) => {
    const j = JSON.stringify(u);
    if (j !== lastJson.current) {
      lastJson.current = j;
      setUi(u);
    }
  }, []);

  /* ---- запуск / реванш ---- */
  const start = useCallback(() => {
    sound.init();
    setScreen("game");
    setGameKey((k) => k + 1);
  }, []);

  const rematch = useCallback(() => {
    sound.init();
    setGameKey((k) => k + 1);
  }, []);

  const toMenu = useCallback(() => {
    setScreen("menu");
    setUi(null);
  }, []);

  /* ---- жизненный цикл игры ---- */
  useEffect(() => {
    if (screen !== "game" || !canvasRef.current) return;
    lastJson.current = "";
    const game = new Game(canvasRef.current, handleUi);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [screen, gameKey, handleUi]);

  /* ---- хоткеи уровня приложения ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen === "menu" && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        start();
      }
      if (screen === "game") {
        if (e.code === "KeyR" && uiRef.current?.phase === "gameover") rematch();
        if (e.code === "KeyM") {
          sound.init();
          setMuted((m) => {
            sound.setMuted(!m);
            return !m;
          });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, start, rematch]);

  /* ---- автопауза при скрытии вкладки ---- */
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) gameRef.current?.setPaused(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const toggleMute = () => {
    sound.init();
    setMuted((m) => {
      sound.setMuted(!m);
      return !m;
    });
  };

  const phase = ui?.phase;
  const showCountdown = phase === "countdown" && ui && ui.countdown > 0;
  const showGo = ui?.countdown === 0 && phase === "play";
  const showRoundOver = phase === "roundover" && ui;
  const showGameOver = phase === "gameover" && ui;
  const showPause = ui?.paused && phase !== "gameover";
  const winnerColor = (idx: number) => (idx === 0 ? "text-cyan-300 neon-cyan" : "text-pink-300 neon-pink");

  return (
    <div className="stage-bg relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden">
      <div className="stage-grid pointer-events-none absolute inset-0" />
      {/* парящие свечения */}
      <div className="pointer-events-none absolute -left-24 top-[-12%] h-[420px] w-[420px] rounded-full bg-cyan-500/12 blur-3xl float-slow" />
      <div className="pointer-events-none absolute -right-24 bottom-[-14%] h-[460px] w-[460px] rounded-full bg-pink-500/12 blur-3xl float-slow" style={{ animationDelay: "-3.4s" }} />

      {screen === "menu" && (
        <div className="relative z-10 flex w-full max-w-5xl flex-col items-center px-6">
          {/* бейдж */}
          <div className="fade-up glass flex items-center gap-2 rounded-full px-4 py-1.5" style={{ animationDelay: "0.05s" }}>
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
              2 игрока · 1 клавиатура · до 3 побед
            </span>
          </div>

          {/* заголовок */}
          <h1 className="fade-up mt-6 text-center font-display leading-[0.95] tracking-tight" style={{ animationDelay: "0.15s" }}>
            <span className="neon-cyan title-flicker block text-[17vw] sm:text-[6.5rem] lg:text-[7.5rem]">NEON</span>
            <span className="neon-pink title-flicker block text-[17vw] sm:text-[6.5rem] lg:text-[7.5rem]" style={{ animationDelay: "0.4s" }}>
              DUEL
            </span>
          </h1>

          <p className="fade-up mt-5 max-w-xl text-center text-sm leading-relaxed text-slate-400 sm:text-base" style={{ animationDelay: "0.25s" }}>
            Арена-дуэль на тактике рикошета: снаряды отлетают от стен, бонусы решают исход,
            а в внезапной смерти один удар — последний.
          </p>

          {/* карточки управления */}
          <div className="fade-up mt-8 grid w-full gap-4 sm:grid-cols-2" style={{ animationDelay: "0.35s" }}>
            <PlayerCard side="left" title="ИГРОК 1" color="cyan" moveKeys={["W", "A", "S", "D"]} fireLabel="F" />
            <PlayerCard side="right" title="ИГРОК 2" color="pink" moveKeys={["↑", "←", "↓", "→"]} fireLabel="ENTER" />
          </div>

          <div className="fade-up mt-7" style={{ animationDelay: "0.45s" }}>
            <button
              onClick={start}
              className="btn-battle flex items-center gap-3 rounded-2xl px-12 py-4 text-lg text-white"
            >
              <Play className="h-6 w-6 fill-white" />
              НАЧАТЬ БОЙ
            </button>
            <p className="mt-3 text-center text-[11px] uppercase tracking-[0.25em] text-slate-600">
              или нажми Enter
            </p>
          </div>

          <div className="fade-up mt-7" style={{ animationDelay: "0.55s" }}>
            <PowerLegend />
          </div>
        </div>
      )}

      {screen === "game" && (
        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-2 p-3">
          {/* рамка арены */}
          <div className="w-[min(97vw,calc(86vh*16/9))]">
            <div
              className="rounded-[22px] p-[2px]"
              style={{
                background: "linear-gradient(100deg, rgba(34,211,238,.8), rgba(124,58,237,.65) 50%, rgba(244,114,182,.8))",
                boxShadow: "0 0 90px -18px rgba(34,211,238,.35), 0 0 90px -22px rgba(244,114,182,.35)",
              }}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-[20px] bg-[#05060f]">
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

                {/* CRT-эффекты */}
                <div className="scanlines pointer-events-none absolute inset-0" />
                <div className="vignette pointer-events-none absolute inset-0" />

                {/* ---------------- HUD ---------------- */}
                {ui && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-5 pt-4 sm:px-7">
                    <PlayerHud ui={ui} idx={0} />
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "font-display text-3xl tabular-nums text-slate-100",
                          ui.timeSec <= 10 && !ui.suddenDeath && "timer-low"
                        )}
                        style={{ textShadow: "0 0 18px rgba(148,163,184,.4)" }}
                      >
                        {ui.suddenDeath
                          ? "— : —"
                          : `${Math.floor(ui.timeSec / 60)}:${String(ui.timeSec % 60).padStart(2, "0")}`}
                      </span>
                      {ui.suddenDeath ? (
                        <span className="sudden-blink font-display text-[13px] tracking-[0.22em] text-red-400" style={{ textShadow: "0 0 16px rgba(248,113,113,.7)" }}>
                          ВНЕЗАПНАЯ СМЕРТЬ
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                          раунд {ui.round}
                        </span>
                      )}
                    </div>
                    <PlayerHud ui={ui} idx={1} mirrored />
                  </div>
                )}

                {/* кнопки звука/паузы */}
                <div className="absolute bottom-4 right-5 flex gap-2">
                  <button
                    onClick={(e) => { toggleMute(); e.currentTarget.blur(); }}
                    className="glass flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 transition hover:text-white"
                    title="M — звук"
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={(e) => { gameRef.current?.togglePause(); e.currentTarget.blur(); }}
                    className="glass flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 transition hover:text-white"
                    title="Esc — пауза"
                  >
                    {ui?.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </button>
                </div>

                {/* ---------------- отсчёт ---------------- */}
                {showCountdown && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[11px] uppercase tracking-[0.4em] text-slate-500">
                      раунд {ui.round}
                    </span>
                    <span
                      key={ui.countdown}
                      className="announce-pop font-display text-[9rem] leading-none text-slate-100"
                      style={{ textShadow: "0 0 40px rgba(167,139,250,.8), 0 0 120px rgba(167,139,250,.5)" }}
                    >
                      {ui.countdown}
                    </span>
                  </div>
                )}

                {showGo && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span
                      className="go-flash font-display text-7xl tracking-[0.1em] text-emerald-300"
                      style={{ textShadow: "0 0 40px rgba(52,211,153,.9)" }}
                    >
                      БОЙ!
                    </span>
                  </div>
                )}

                {/* баннер внезапной смерти */}
                {ui?.sdBanner && phase === "play" && (
                  <div className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center">
                    <span
                      className="announce-pop font-display text-3xl tracking-[0.14em] text-red-400"
                      style={{ textShadow: "0 0 30px rgba(248,113,113,.9)" }}
                    >
                      ВНЕЗАПНАЯ СМЕРТЬ — ОДИН УДАР РЕШАЕТ ВСЁ
                    </span>
                  </div>
                )}

                {/* ---------------- конец раунда ---------------- */}
                {showRoundOver && ui.roundWinner >= 0 && ui.winner < 0 && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40">
                    <span
                      key={`${ui.round}-${ui.roundWinner}`}
                      className={cn("announce-pop font-display text-4xl sm:text-5xl", winnerColor(ui.roundWinner))}
                    >
                      ИГРОК {ui.roundWinner + 1}
                    </span>
                    <span className="fade-up mt-2 font-display text-lg tracking-[0.3em] text-slate-300">
                      ЗАБИРАЕТ РАУНД
                    </span>
                    <span className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-500">
                      счёт {ui.scores[0]} : {ui.scores[1]}
                    </span>
                  </div>
                )}

                {/* ---------------- финал ---------------- */}
                {showGameOver && ui.winner >= 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-[2px]">
                    <span className="fade-up text-[11px] uppercase tracking-[0.45em] text-slate-400">
                      победа в матче
                    </span>
                    <span
                      className={cn("announce-pop mt-3 font-display text-6xl sm:text-8xl", winnerColor(ui.winner))}
                    >
                      ИГРОК {ui.winner + 1}
                    </span>
                    <span className="fade-up mt-3 font-display text-xl tracking-[0.35em] text-slate-300">
                      {ui.scores[0]} : {ui.scores[1]}
                    </span>
                    <div className="fade-up mt-10 flex gap-4" style={{ animationDelay: "0.35s" }}>
                      <button onClick={(e) => { rematch(); e.currentTarget.blur(); }} className="btn-battle flex items-center gap-2.5 rounded-2xl px-9 py-3.5 text-white">
                        <RotateCcw className="h-5 w-5" />
                        РЕВАНШ <span className="opacity-60">[R]</span>
                      </button>
                      <button
                        onClick={(e) => { toMenu(); e.currentTarget.blur(); }}
                        className="btn-ghost flex items-center gap-2.5 rounded-2xl px-7 py-3.5 font-display tracking-[0.12em] text-slate-300"
                      >
                        <Home className="h-5 w-5" />
                        МЕНЮ
                      </button>
                    </div>
                  </div>
                )}

                {/* ---------------- пауза ---------------- */}
                {showPause && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-sm">
                    <span className="font-display text-5xl tracking-[0.2em] text-slate-100" style={{ textShadow: "0 0 30px rgba(167,139,250,.6)" }}>
                      ПАУЗА
                    </span>
                    <span className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-500">esc — продолжить</span>
                    <div className="mt-8 flex gap-4">
                      <button
                        onClick={(e) => { gameRef.current?.setPaused(false); e.currentTarget.blur(); }}
                        className="btn-battle flex items-center gap-2 rounded-2xl px-8 py-3 text-white"
                      >
                        <Play className="h-5 w-5" /> ПРОДОЛЖИТЬ
                      </button>
                      <button
                        onClick={(e) => { toMenu(); e.currentTarget.blur(); }}
                        className="btn-ghost flex items-center gap-2 rounded-2xl px-6 py-3 font-display tracking-[0.12em] text-slate-300"
                      >
                        <Home className="h-5 w-5" /> МЕНЮ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* подсказки под ареной */}
          <div className="flex items-center gap-6 text-[10px] uppercase tracking-[0.25em] text-slate-600">
            <span className="flex items-center gap-1.5"><span className="keycap !h-5 !min-w-0 px-1.5 text-[9px]">ESC</span> пауза</span>
            <span className="flex items-center gap-1.5"><span className="keycap !h-5 !min-w-0 px-1.5 text-[9px]">M</span> звук</span>
            <span className="flex items-center gap-1.5"><span className="keycap !h-5 !min-w-0 px-1.5 text-[9px]">R</span> реванш после финала</span>
          </div>
        </div>
      )}
    </div>
  );
}
