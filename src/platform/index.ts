import type { Lang } from "../i18n";

/* Слой площадки. Сборка выбирается режимом Vite: `vite build --mode vkplay`.
   Сюда добавляются SDK площадок (init, реклама, сохранения), остальной код о них не знает. */

declare const __PLATFORM__: string;

export interface Platform {
  id: string;
  /** язык, который подсказывает площадка, или null */
  getLang(): Lang | null;
  /** вызывается, когда игра стала интерактивной / вышла в меню */
  gameplayStart(): void;
  gameplayStop(): void;
}

const web: Platform = {
  id: "web",
  getLang: () => null,
  gameplayStart() {},
  gameplayStop() {},
};

/** VK Play: браузерная игра открывается в iframe, язык приходит GET-параметром lang (ru_RU, en_US...). */
const vkplay: Platform = {
  id: "vkplay",
  getLang() {
    try {
      const l = new URLSearchParams(window.location.search).get("lang");
      if (!l) return null;
      return l.toLowerCase().startsWith("ru") ? "ru" : "en";
    } catch {
      return null;
    }
  },
  gameplayStart() {},
  gameplayStop() {},
};

export const platform: Platform = typeof __PLATFORM__ !== "undefined" && __PLATFORM__ === "vkplay" ? vkplay : web;
