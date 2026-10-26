/* Синтезированный звук на WebAudio — без внешних файлов */

interface ToneOpts {
  f: number;
  t: number;
  type?: OscillatorType;
  v?: number;
  slide?: number;
  delay?: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.45, this.ctx.currentTime, 0.02);
    }
  }

  isMuted() {
    return this.muted;
  }

  private tone({ f, t, type = "square", v = 0.18, slide = 0, delay = 0 }: ToneOpts) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + t);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + t + 0.05);
  }

  private noise(t = 0.3, v = 0.3, from = 2400, to = 200, delay = 0) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * t));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + t);
    const g = c.createGain();
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  shoot() {
    this.tone({ f: 640, slide: 150, t: 0.11, type: "square", v: 0.13 });
  }

  bounce() {
    this.tone({ f: 980, t: 0.04, type: "sine", v: 0.06 });
  }

  hit() {
    this.noise(0.28, 0.4, 3200, 240);
    this.tone({ f: 150, slide: 45, t: 0.25, type: "sine", v: 0.34 });
  }

  block() {
    this.tone({ f: 320, t: 0.1, type: "sawtooth", v: 0.14 });
    this.noise(0.09, 0.12, 4000, 1200);
  }

  explosion() {
    this.noise(0.65, 0.5, 2600, 90);
    this.tone({ f: 100, slide: 28, t: 0.5, type: "sine", v: 0.42 });
  }

  pickup() {
    this.tone({ f: 660, t: 0.07, type: "triangle", v: 0.2 });
    this.tone({ f: 990, t: 0.1, type: "triangle", v: 0.2, delay: 0.07 });
  }

  beep(final: boolean) {
    if (final) {
      this.tone({ f: 880, t: 0.28, type: "square", v: 0.22 });
      this.tone({ f: 1320, t: 0.3, type: "sine", v: 0.14, delay: 0.02 });
    } else {
      this.tone({ f: 440, t: 0.12, type: "square", v: 0.16 });
    }
  }

  win() {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      this.tone({ f, t: 0.22, type: "triangle", v: 0.22, delay: i * 0.13 })
    );
  }
}

export const sound = new SoundEngine();
