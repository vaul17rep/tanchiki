export type Mode = "pvp" | "bot";
export type Difficulty = 0 | 1 | 2;

export interface GameTexts {
  block: string;
  shield: string;
  rapid: string;
  speed: string;
}

export interface GameConfig {
  mode: Mode;
  difficulty: Difficulty;
  /** индекс карты, -1 = случайная */
  map: number;
  winScore: number;
  texts: GameTexts;
}
