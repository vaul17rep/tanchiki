import { useRef, useState } from "react";
import { cn } from "../utils/cn";

const R = 52; // радиус хода стика, px

function Joystick({ color, onChange }: { color: "cyan" | "pink"; onChange: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (e: React.PointerEvent) => {
    const rect = base.current!.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob({ x: dx, y: dy });
    onChange(dx / R, dy / R);
  };
  const end = () => {
    pid.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  const tone = color === "cyan" ? "border-cyan-400/60 bg-cyan-400/10" : "border-pink-400/60 bg-pink-400/10";
  const knobTone = color === "cyan" ? "bg-cyan-300/70" : "bg-pink-300/70";
  return (
    <div
      ref={base}
      className={cn("pointer-events-auto relative h-36 w-36 touch-none select-none rounded-full border-2", tone)}
      onPointerDown={(e) => {
        if (pid.current !== null) return;
        pid.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (pid.current === e.pointerId) update(e);
      }}
      onPointerUp={(e) => {
        if (pid.current === e.pointerId) end();
      }}
      onPointerCancel={(e) => {
        if (pid.current === e.pointerId) end();
      }}
    >
      <div
        className={cn("absolute left-1/2 top-1/2 h-14 w-14 rounded-full", knobTone)}
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

function FireButton({ color, label, onChange }: { color: "cyan" | "pink"; label: string; onChange: (down: boolean) => void }) {
  const [down, setDown] = useState(false);
  const set = (v: boolean) => {
    setDown(v);
    onChange(v);
  };
  const tone = color === "cyan" ? "border-cyan-400/70 text-cyan-200" : "border-pink-400/70 text-pink-200";
  const fill = color === "cyan" ? "bg-cyan-400/35" : "bg-pink-400/35";
  return (
    <button
      type="button"
      className={cn(
        "pointer-events-auto h-24 w-24 touch-none select-none rounded-full border-2 font-display text-sm tracking-widest",
        tone,
        down ? fill : "bg-slate-900/50"
      )}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export function TouchControls({
  twoPlayers,
  fireLabel,
  onInput,
}: {
  twoPlayers: boolean;
  fireLabel: string;
  onInput: (player: 0 | 1, x: number, y: number, fire: boolean) => void;
}) {
  // состояние храним в ref, чтобы стик и кнопка одного игрока не затирали друг друга
  const st = useRef([
    { x: 0, y: 0, fire: false },
    { x: 0, y: 0, fire: false },
  ]);
  const push = (p: 0 | 1) => onInput(p, st.current[p].x, st.current[p].y, st.current[p].fire);
  const stick = (p: 0 | 1) => (x: number, y: number) => {
    st.current[p].x = x;
    st.current[p].y = y;
    push(p);
  };
  const fire = (p: 0 | 1) => (d: boolean) => {
    st.current[p].fire = d;
    push(p);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-end justify-between px-4 pb-4">
      <div className="flex items-end gap-3">
        <Joystick color="cyan" onChange={stick(0)} />
        {twoPlayers && <FireButton color="cyan" label={fireLabel} onChange={fire(0)} />}
      </div>
      <div className="flex items-end gap-3">
        {twoPlayers ? (
          <>
            <FireButton color="pink" label={fireLabel} onChange={fire(1)} />
            <Joystick color="pink" onChange={stick(1)} />
          </>
        ) : (
          <FireButton color="cyan" label={fireLabel} onChange={fire(0)} />
        )}
      </div>
    </div>
  );
}
