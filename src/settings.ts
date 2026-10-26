import type { Difficulty, Mode } from "./game/config";
import type { Lang } from "./i18n";
import { platform } from "./platform";

export interface Settings {
  lang: Lang;
  mode: Mode;
  players: 1 | 2;
  /** боты в отряде и «все против всех» */
  bots: number;
  friendlyFire: boolean;
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
  const base: Settings = { lang: detectLang(), mode: "duel", players: 2, bots: 3, friendlyFire: false, difficulty: 1, map: 0, winScore: 3, muted: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Omit<Partial<Settings>, "mode"> & { mode?: string };
      // старые сохранения: режимы «pvp» и «bot» стали дуэлью на двоих и на одного
      if (s.mode === "pvp") Object.assign(s, { mode: "duel", players: 2 });
      else if (s.mode === "bot") Object.assign(s, { mode: "duel", players: 1 });
      const merged = { ...base, ...s } as Settings;
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
