import { useCallback, useEffect, useRef, useState } from "react";
import {
  Crosshair,
  HeartPulse,
  Home,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Snowflake,
  Swords,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  Zap,
} from "lucide-react";
import { Game, type UiState } from "./game/engine";
import { sound } from "./game/audio";
import { MAP_COUNT } from "./game/maps";
import type { Difficulty, GameConfig, Mode } from "./game/config";
import { Hud, teamColor, teamName } from "./components/Hud";
import type { RewardId } from "./game/arcade";
import { DICTS, type Dict, type Lang } from "./i18n";
import { loadSettings, saveSettings, type Settings } from "./settings";
import { platform } from "./platform";
import { TouchControls } from "./components/TouchControls";
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
  t,
  side,
  title,
  color,
  moveKeys,
  fireLabel,
}: {
  t: Dict;
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
            {side === "left" ? t.leftSide : t.rightSide}
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
          <p className="mt-2 text-center text-[10px] uppercase tracking-[0.22em] text-slate-500">{t.moveLbl}</p>
        </div>
        <div>
          <Keycap label={fireLabel} tone={color} wide />
          <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">{t.fireLbl}</p>
        </div>
      </div>
    </div>
  );
}

function PowerLegend({ t }: { t: Dict }) {
  const items = [
    { icon: HeartPulse, name: t.heal, desc: t.healD, color: "#4ade80", rare: false },
    { icon: Shield, name: t.shield, desc: t.shieldD, color: "#60a5fa", rare: false },
    { icon: Zap, name: t.rapid, desc: t.rapidD, color: "#fbbf24", rare: false },
    { icon: Wind, name: t.speed, desc: t.speedD, color: "#c084fc", rare: false },
    { icon: Crosshair, name: t.tripleName, desc: t.tripleD, color: "#fcd34d", rare: true },
    { icon: Snowflake, name: t.freezeName, desc: t.freezeD, color: "#7dd3fc", rare: true },
    { icon: Waves, name: t.shockName, desc: t.shockD, color: "#fda4af", rare: true },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {items.map(({ icon: Icon, name, desc, color, rare }) => (
        <div
          key={name}
          className={cn("glass flex items-center gap-2.5 rounded-full py-1.5 pl-2 pr-4", rare && "!border-yellow-300/50")}
        >
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

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { v: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={(e) => {
              onChange(o.v);
              e.currentTarget.blur();
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
              o.v === value
                ? "border-cyan-400/70 bg-cyan-400/15 text-cyan-200"
                : "border-slate-700 bg-slate-900/40 text-slate-400 hover:text-slate-200"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
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
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [muted, setMuted] = useState(settings.muted);
  const [touchMode, setTouchMode] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches
  );
  const t = DICTS[settings.lang];
  const modeNames: Record<Mode, string> = { duel: t.modeDuel, squad: t.modeSquad, ffa: t.modeFfa, arcade: t.modeArcade };
  const modeHints: Record<Mode, string> = { duel: t.hintDuel, squad: t.hintSquad, ffa: t.hintFfa, arcade: t.hintArcade };
  useEffect(() => {
    setSettings((s) => {
      if (s.muted === muted) return s;
      const n = { ...s, muted };
      saveSettings(n);
      return n;
    });
  }, [muted]);
  const mode = settings.mode;
  const arcadeMode = mode === "arcade";
  const hasBots = mode !== "duel" || settings.players === 1;
  const manyBots = mode === "squad" || mode === "ffa";
  const showFf = mode === "squad" || (arcadeMode && settings.players === 2);

  const patch = useCallback((p: Partial<Settings>) => {
    setSettings((s) => {
      const n = { ...s, ...p };
      saveSettings(n);
      return n;
    });
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const lastJson = useRef("");
  const uiRef = useRef<UiState | null>(null);
  uiRef.current = ui;

  const gameoverAt = useRef(0);
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
    sound.setMuted(muted);
    platform.gameplayStart();
    window.focus();
    setScreen("game");
    setGameKey((k) => k + 1);
  }, [muted]);

  const rematch = useCallback(() => {
    sound.init();
    setGameKey((k) => k + 1);
  }, []);

  const toMenu = useCallback(() => {
    platform.gameplayStop();
    setScreen("menu");
    setUi(null);
  }, []);

  /* ---- жизненный цикл игры ---- */
  useEffect(() => {
    if (screen !== "game" || !canvasRef.current) return;
    lastJson.current = "";
    const cfg: GameConfig = {
      mode: settings.mode,
      players: settings.players,
      bots: settings.bots,
      friendlyFire: showFf && settings.friendlyFire,
      difficulty: settings.difficulty,
      startWave: Number(new URLSearchParams(window.location.search).get("wave")) || 1,
      map: settings.map,
      winScore: settings.winScore,
      texts: {
        block: t.fxBlock,
        shield: t.fxShield,
        rapid: t.fxRapid,
        speed: t.fxSpeed,
        triple: t.fxTriple,
        freeze: t.fxFreeze,
        shock: t.fxShock,
        combo: t.fxCombo,
      },
    };
    const game = new Game(canvasRef.current, cfg, handleUi);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
    // настройки и язык берутся на момент старта матча
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, gameKey, handleUi]);

  /* ---- хоткеи уровня приложения ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen === "menu" && !e.repeat && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        start();
      }
      if (screen === "game") {
        if (e.code === "KeyR" && uiRef.current?.phase === "gameover") rematch();
        // после финала пробел или Enter ведут в меню (с задержкой, чтобы не ловить зажатую кнопку огня)
        if (
          (e.code === "Space" || e.code === "Enter") &&
          !e.repeat &&
          uiRef.current?.phase === "gameover" &&
          performance.now() - gameoverAt.current > 700
        ) {
          e.preventDefault();
          toMenu();
        }
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
  }, [screen, start, rematch, toMenu]);

  /* ---- автопауза при скрытии вкладки ---- */
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        gameRef.current?.setPaused(true);
        sound.suspend();
      } else {
        sound.init();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const onTouch = () => setTouchMode(true);
    window.addEventListener("touchstart", onTouch, { once: true, passive: true });
    return () => window.removeEventListener("touchstart", onTouch);
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.lang;
    document.title = t.title;
  }, [settings.lang, t.title]);

  // звук глушим и на паузе
  useEffect(() => {
    if (ui?.paused) sound.suspend();
    else if (screen === "game") sound.init();
  }, [ui?.paused, screen]);

  const toggleMute = () => {
    sound.init();
    setMuted((m) => {
      sound.setMuted(!m);
      return !m;
    });
  };

  const phase = ui?.phase;
  if (phase === "gameover" && gameoverAt.current === 0) gameoverAt.current = performance.now();
  if (phase !== "gameover") gameoverAt.current = 0;
  const showCountdown = phase === "countdown" && ui && ui.countdown > 0;
  const showGo = ui?.countdown === 0 && phase === "play";
  const showRoundOver = phase === "roundover" && ui;
  const showGameOver = phase === "gameover" && ui && !ui.arcade;
  const showPause = ui?.paused && phase !== "gameover";
  const winnerName = (team: number) => (ui ? teamName(ui, team, t) : "");
  const winnerStyle = (team: number) => {
    const c = ui ? teamColor(ui, team) : "#e2e8f0";
    return { color: c, textShadow: `0 0 28px ${c}, 0 0 70px ${c}88` };
  };
  const scoreLine = ui ? (ui.mode === "ffa" ? ui.scores.join(" · ") : `${ui.scores[0]} : ${ui.scores[1]}`) : "";
  const arc = ui?.arcade ?? null;
  const showReward = phase === "reward" && !!arc?.rewards;
  const showIntro = !!arc?.intro && phase === "countdown";
  const showArcadeOver = phase === "gameover" && !!arc;

  return (
    <div className="stage-bg relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden">
      <div className="stage-grid pointer-events-none absolute inset-0" />
      {/* парящие свечения */}
      <div className="pointer-events-none absolute -left-24 top-[-12%] h-[420px] w-[420px] rounded-full bg-cyan-500/12 blur-3xl float-slow" />
      <div className="pointer-events-none absolute -right-24 bottom-[-14%] h-[460px] w-[460px] rounded-full bg-pink-500/12 blur-3xl float-slow" style={{ animationDelay: "-3.4s" }} />

      {screen === "menu" && (
        <div className="absolute inset-0 z-10 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center px-6 py-6">
            {/* бейдж */}
            <div className="fade-up glass flex items-center gap-2 rounded-full px-4 py-1.5" style={{ animationDelay: "0.05s" }}>
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                {modeNames[mode]} · {settings.players === 1 ? t.players1 : t.players2}
                {!arcadeMode && ` · ${t.toWin.replace("{n}", String(settings.winScore))}`}
              </span>
            </div>

            {/* заголовок */}
            <h1 className="fade-up mt-4 text-center font-display leading-[0.95] tracking-tight" style={{ animationDelay: "0.15s" }}>
              <span className="neon-cyan title-flicker block text-[14vw] sm:text-[5.5rem] lg:text-[6.5rem]">NEON</span>
              <span className="neon-pink title-flicker block text-[14vw] sm:text-[5.5rem] lg:text-[6.5rem]" style={{ animationDelay: "0.4s" }}>
                DUEL
              </span>
            </h1>

            <p className="fade-up mt-4 max-w-xl text-center text-sm leading-relaxed text-slate-400" style={{ animationDelay: "0.25s" }}>
              {t.intro}
            </p>

            {/* настройки */}
            <div className="fade-up glass mt-5 grid w-full max-w-3xl gap-x-6 gap-y-3 rounded-2xl p-4 sm:grid-cols-2" style={{ animationDelay: "0.3s" }}>
              <Segmented
                label={t.modeLbl}
                value={mode}
                options={(["duel", "squad", "ffa", "arcade"] as Mode[]).map((m) => ({ v: m, label: modeNames[m] }))}
                onChange={(v) => patch({ mode: v as Mode })}
              />
              <Segmented
                label={t.playersLbl}
                value={String(settings.players)}
                options={[
                  { v: "1", label: t.players1 },
                  { v: "2", label: t.players2 },
                ]}
                onChange={(v) => patch({ players: Number(v) as 1 | 2 })}
              />
              {manyBots && (
                <Segmented
                  label={t.botsLbl}
                  value={String(settings.bots)}
                  options={[3, 5].map((n) => ({ v: String(n), label: String(n) }))}
                  onChange={(v) => patch({ bots: Number(v) })}
                />
              )}
              {showFf && (
                <Segmented
                  label={t.ffLbl}
                  value={settings.friendlyFire ? "1" : "0"}
                  options={[
                    { v: "0", label: t.ffOff },
                    { v: "1", label: t.ffOn },
                  ]}
                  onChange={(v) => patch({ friendlyFire: v === "1" })}
                />
              )}
              {hasBots && (
                <Segmented
                  label={t.diffLbl}
                  value={String(settings.difficulty)}
                  options={t.diff.map((d, i) => ({ v: String(i), label: d }))}
                  onChange={(v) => patch({ difficulty: Number(v) as Difficulty })}
                />
              )}
              {!arcadeMode && (
                <Segmented
                  label={t.mapLbl}
                  value={String(settings.map)}
                  options={[
                    ...t.maps.slice(0, MAP_COUNT).map((m, i) => ({ v: String(i), label: m })),
                    { v: "-1", label: t.mapRandom },
                  ]}
                  onChange={(v) => patch({ map: Number(v) })}
                />
              )}
              {!arcadeMode && (
                <Segmented
                  label={t.winLbl}
                  value={String(settings.winScore)}
                  options={[3, 5, 7].map((n) => ({ v: String(n), label: String(n) }))}
                  onChange={(v) => patch({ winScore: Number(v) })}
                />
              )}
              <Segmented
                label={t.langLbl}
                value={settings.lang}
                options={[
                  { v: "ru", label: "RU" },
                  { v: "en", label: "EN" },
                ]}
                onChange={(v) => patch({ lang: v as Lang })}
              />
            </div>

            <p className="fade-up mt-3 max-w-2xl text-center text-xs leading-relaxed text-slate-400" style={{ animationDelay: "0.32s" }}>
              {modeHints[mode]} {t.wallsHint}.
            </p>

            {/* карточки управления */}
            <div className={cn("fade-up mt-4 grid w-full gap-4", settings.players === 2 && "sm:grid-cols-2")} style={{ animationDelay: "0.35s" }}>
              <PlayerCard t={t} side="left" title={`${t.player} 1`} color="cyan" moveKeys={["W", "A", "S", "D"]} fireLabel="SPACE" />
              {settings.players === 2 && (
                <PlayerCard t={t} side="right" title={`${t.player} 2`} color="pink" moveKeys={["↑", "←", "↓", "→"]} fireLabel="ENTER" />
              )}
            </div>
            <p className="fade-up mt-3 text-center text-[11px] uppercase tracking-[0.2em] text-slate-600" style={{ animationDelay: "0.4s" }}>
              {t.padHint}
            </p>

            <div className="fade-up mt-5" style={{ animationDelay: "0.45s" }}>
              <button
                onClick={start}
                className="btn-battle mx-auto flex items-center gap-3 rounded-2xl px-12 py-4 text-lg text-white"
              >
                <Play className="h-6 w-6 fill-white" />
                {t.start}
              </button>
              <p className="mt-3 text-center text-[11px] uppercase tracking-[0.25em] text-slate-600">{t.orEnter}</p>
            </div>

            <div className="fade-up mt-5" style={{ animationDelay: "0.55s" }}>
              <PowerLegend t={t} />
            </div>
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
                {ui && <Hud ui={ui} t={t} />}

                {/* кнопки звука/паузы */}
                <div className="absolute bottom-4 right-5 flex gap-2">
                  <button
                    onClick={(e) => { toggleMute(); e.currentTarget.blur(); }}
                    className="glass flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 transition hover:text-white"
                    title={t.titleSound}
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={(e) => { gameRef.current?.togglePause(); e.currentTarget.blur(); }}
                    className="glass flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 transition hover:text-white"
                    title={t.titlePause}
                  >
                    {ui?.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </button>
                </div>

                {/* ---------------- отсчёт ---------------- */}
                {showCountdown && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[11px] uppercase tracking-[0.4em] text-slate-500">
                      {t.round} {ui.round}
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
                      {t.go}
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
                      {t.suddenDeathBanner}
                    </span>
                  </div>
                )}

                {/* ---------------- конец раунда ---------------- */}
                {showRoundOver && ui.winner < 0 && !ui.arcade && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40">
                    {ui.roundWinner >= 0 ? (
                      <>
                        <span
                          key={`${ui.round}-${ui.roundWinner}`}
                          className="announce-pop font-display text-4xl sm:text-5xl"
                          style={winnerStyle(ui.roundWinner)}
                        >
                          {winnerName(ui.roundWinner)}
                        </span>
                        <span className="fade-up mt-2 font-display text-lg tracking-[0.3em] text-slate-300">
                          {t.takesRound}
                        </span>
                      </>
                    ) : (
                      <span key={ui.round} className="announce-pop font-display text-4xl text-slate-200 sm:text-5xl">
                        {t.roundDraw}
                      </span>
                    )}
                    <span className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-500">
                      {t.scoreWord} {scoreLine}
                    </span>
                  </div>
                )}

                {/* ---------------- финал ---------------- */}
                {showGameOver && ui.winner >= 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-[2px]">
                    <span className="fade-up text-[11px] uppercase tracking-[0.45em] text-slate-400">
                      {t.matchWin}
                    </span>
                    <span className="announce-pop mt-3 font-display text-6xl sm:text-8xl" style={winnerStyle(ui.winner)}>
                      {winnerName(ui.winner)}
                    </span>
                    <span className="fade-up mt-3 font-display text-xl tracking-[0.35em] text-slate-300">
                      {scoreLine}
                    </span>
                    <div className="fade-up mt-10 flex gap-4" style={{ animationDelay: "0.35s" }}>
                      <button onClick={(e) => { rematch(); e.currentTarget.blur(); }} className="btn-battle flex items-center gap-2.5 rounded-2xl px-9 py-3.5 text-white">
                        <RotateCcw className="h-5 w-5" />
                        {t.rematch} <span className="opacity-60">[R]</span>
                      </button>
                      <button
                        onClick={(e) => { toMenu(); e.currentTarget.blur(); }}
                        className="btn-ghost flex items-center gap-2.5 rounded-2xl px-7 py-3.5 font-display tracking-[0.12em] text-slate-300"
                      >
                        <Home className="h-5 w-5" />
                        {t.menu}
                      </button>
                    </div>
                    <span className="fade-up mt-5 text-[11px] uppercase tracking-[0.25em] text-slate-500">{t.toMenuHint}</span>
                  </div>
                )}

                {/* ---------------- аркада: заставка волны ---------------- */}
                {showIntro && arc && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    {arc.boss && (
                      <span className="announce-pop mb-2 font-display text-2xl tracking-[0.4em] text-fuchsia-400" style={{ textShadow: "0 0 30px rgba(232,121,249,.9)" }}>
                        {t.bossWave}
                      </span>
                    )}
                    <span
                      key={arc.wave}
                      className="announce-pop font-display text-6xl tracking-[0.12em] text-slate-100 sm:text-7xl"
                      style={{ textShadow: "0 0 40px rgba(167,139,250,.8), 0 0 120px rgba(167,139,250,.5)" }}
                    >
                      {t.wave} {arc.wave}
                    </span>
                    {arc.special && (
                      <>
                        <span className="fade-up mt-3 font-display text-xl tracking-[0.25em] text-amber-300">
                          {t.specialName[arc.special]}
                        </span>
                        <span className="fade-up mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                          {t.specialDesc[arc.special]}
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* ---------------- аркада: выбор улучшения ---------------- */}
                {showReward && arc?.rewards && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/75 backdrop-blur-sm">
                    <span className="announce-pop font-display text-3xl tracking-[0.2em] text-emerald-300 sm:text-4xl" style={{ textShadow: "0 0 30px rgba(52,211,153,.7)" }}>
                      {t.rwTitle}
                    </span>
                    <span className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-400">{t.rwPick}</span>
                    <div className="mt-6 flex flex-wrap justify-center gap-4 px-4">
                      {arc.rewards.map((id: RewardId, i: number) => (
                        <button
                          key={id}
                          onClick={(e) => { gameRef.current?.pickReward(i); e.currentTarget.blur(); }}
                          className="glass group w-44 rounded-2xl p-4 text-left transition hover:-translate-y-1 hover:border-cyan-400/70"
                        >
                          <span className="keycap mb-2 inline-flex">{i + 1}</span>
                          <p className="font-display text-base tracking-[0.1em] text-cyan-200">{t.rw[id].n}</p>
                          <p className="mt-1 text-xs leading-snug text-slate-400">{t.rw[id].d}</p>
                          {arc.upgrades[id] > 0 && (
                            <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">×{arc.upgrades[id]}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ---------------- аркада: конец игры ---------------- */}
                {showArcadeOver && arc && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-[2px]">
                    <span className="fade-up text-[11px] uppercase tracking-[0.45em] text-slate-400">{t.arcadeOver}</span>
                    <span className="announce-pop mt-3 font-display text-5xl text-slate-100 sm:text-7xl" style={{ textShadow: "0 0 40px rgba(167,139,250,.7)" }}>
                      {arc.score.toLocaleString()}
                    </span>
                    {arc.newBest && (
                      <span className="fade-up mt-2 font-display text-lg tracking-[0.3em] text-amber-300">{t.newRecord}</span>
                    )}
                    <span className="fade-up mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">
                      {t.reachedWave} {arc.wave} · {arc.kills} {t.killsWord} · {t.bestWord} {arc.best.score.toLocaleString()}
                    </span>
                    <div className="fade-up mt-8 flex gap-4" style={{ animationDelay: "0.35s" }}>
                      <button onClick={(e) => { rematch(); e.currentTarget.blur(); }} className="btn-battle flex items-center gap-2.5 rounded-2xl px-9 py-3.5 text-white">
                        <RotateCcw className="h-5 w-5" />
                        {t.rematch} <span className="opacity-60">[R]</span>
                      </button>
                      <button
                        onClick={(e) => { toMenu(); e.currentTarget.blur(); }}
                        className="btn-ghost flex items-center gap-2.5 rounded-2xl px-7 py-3.5 font-display tracking-[0.12em] text-slate-300"
                      >
                        <Home className="h-5 w-5" />
                        {t.menu}
                      </button>
                    </div>
                    <span className="fade-up mt-5 text-[11px] uppercase tracking-[0.25em] text-slate-500">{t.toMenuHint}</span>
                  </div>
                )}

                {/* ---------------- пауза ---------------- */}
                {showPause && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-sm">
                    <span className="font-display text-5xl tracking-[0.2em] text-slate-100" style={{ textShadow: "0 0 30px rgba(167,139,250,.6)" }}>
                      {t.pause}
                    </span>
                    <span className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-500">{t.escResume}</span>
                    <div className="mt-8 flex gap-4">
                      <button
                        onClick={(e) => { gameRef.current?.setPaused(false); e.currentTarget.blur(); }}
                        className="btn-battle flex items-center gap-2 rounded-2xl px-8 py-3 text-white"
                      >
                        <Play className="h-5 w-5" /> {t.resume}
                      </button>
                      <button
                        onClick={(e) => { toMenu(); e.currentTarget.blur(); }}
                        className="btn-ghost flex items-center gap-2 rounded-2xl px-6 py-3 font-display tracking-[0.12em] text-slate-300"
                      >
                        <Home className="h-5 w-5" /> {t.menu}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* подсказки под ареной */}
          <div className="flex items-center gap-6 text-[10px] uppercase tracking-[0.25em] text-slate-600">
            <span className="flex items-center gap-1.5"><span className="keycap !h-5 !min-w-0 px-1.5 text-[9px]">ESC</span> {t.hintPause}</span>
            <span className="flex items-center gap-1.5"><span className="keycap !h-5 !min-w-0 px-1.5 text-[9px]">M</span> {t.hintSound}</span>
            <span className="flex items-center gap-1.5"><span className="keycap !h-5 !min-w-0 px-1.5 text-[9px]">R</span> {t.hintRematch}</span>
          </div>
          {touchMode && (
            <TouchControls
              twoPlayers={settings.players === 2}
              fireLabel={t.fire}
              onInput={(p, x, y, f) => gameRef.current?.setTouch(p, x, y, f)}
            />
          )}
        </div>
      )}
    </div>
  );
}
