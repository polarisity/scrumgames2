export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  avatar: string;
  card?: string;
  isGameMaster: boolean;
  emoji?: string;
  color: string;
}

export interface Room {
  id: string;
  players: Map<string, Player>;
  cardsRevealed: boolean;
  currentStory?: string;
  throwables: Throwable[];
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export interface Throwable {
  id: string;
  type: 'tomato' | 'confetti' | 'ball' | 'paper';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  throwerId: string;
  timestamp: number;
}

export interface GameAction {
  type: 'wave' | 'dance' | 'jump' | 'laugh' | 'think';
  playerId: string;
  timestamp: number;
}
