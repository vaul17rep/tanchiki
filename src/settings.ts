import type { Difficulty, Mode } from "./game/config";
import type { Lang } from "./i18n";
import { platform } from "./platform";

export interface Settings {
  lang: Lang;
  mode: Mode;
  difficulty: Difficulty;
  map: number; // -1 = случайная
  winScore: number;
  muted: boolean;
}

const KEY = "neon-duel-settings-v1";

function detectLang(): Lang {
  const fromPlatform = platform.getLang();
  if (fromPlatform) return fromPlatform;
  try {
    return navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "en";
  } catch {
    return "en";
  }
}

export function loadSettings(): Settings {
  const base: Settings = { lang: detectLang(), mode: "pvp", difficulty: 1, map: 0, winScore: 3, muted: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      const merged = { ...base, ...s };
      // язык от площадки важнее сохранённого
      const pl = platform.getLang();
      if (pl) merged.lang = pl;
      return merged;
    }
  } catch {
    /* хранилище недоступно */
  }
  return base;
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно */
  }
}
