export type Mode = "duel" | "squad" | "ffa" | "arcade";
export type Difficulty = 0 | 1 | 2;

export interface GameTexts {
  block: string;
  shield: string;
  rapid: string;
  speed: string;
  triple: string;
  freeze: string;
  shock: string;
  combo: string;
}

export interface GameConfig {
  mode: Mode;
  /** сколько людей играет: 1 или 2 */
  players: 1 | 2;
  /** сколько ботов: в дуэли с одним игроком их 1, в отряде и «каждый за себя» 3 или 5 */
  bots: number;
  /** попадают ли пули по своим (отряд, аркада вдвоём) */
  friendlyFire: boolean;
  difficulty: Difficulty;
  /** индекс карты, -1 = случайная */
  map: number;
  winScore: number;
  texts: GameTexts;
  /** с какой волны начать аркаду (по умолчанию 1) */
  startWave?: number;
}
