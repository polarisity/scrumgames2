// Shared types between client and server
// Mirrors server/src/types/game.types.ts

export interface PlayerData {
  id: string;
  name: string;
  x: number;
  y: number;
  avatar: string;
  card?: string;
  isGameMaster: boolean;
  emoji?: string;
  color: string;
  firebaseUid?: string;
  points: number;
  isRegistered: boolean;
}

export interface RoomState {
  id: string;
  players: Record<string, PlayerData>;
  cardsRevealed: boolean;
  currentStory?: string;
  throwables: ThrowableData[];
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export interface ThrowableData {
  id: string;
  type: ThrowableType;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  throwerId: string;
  timestamp: number;
}

export type ThrowableType = 'tomato' | 'confetti' | 'ball' | 'paper';

export interface GameAction {
  type: ActionType;
  playerId: string;
  timestamp: number;
}

export type ActionType = 'wave' | 'dance' | 'jump' | 'laugh' | 'think';

export type AvatarType = 'cat' | 'dog' | 'rabbit' | 'panda' | 'fox' | 'bear' | 'koala' | 'lion';

export interface SpriteConfig {
  col: number;
  row: number;
  emoji: string;
}

export const AVATAR_CONFIG: Record<AvatarType, SpriteConfig> = {
  cat: { col: 0, row: 0, emoji: '🐱' },
  dog: { col: 1, row: 0, emoji: '🐶' },
  rabbit: { col: 2, row: 0, emoji: '🐰' },
  panda: { col: 3, row: 0, emoji: '🐼' },
  fox: { col: 0, row: 1, emoji: '🦊' },
  bear: { col: 1, row: 1, emoji: '🐻' },
  koala: { col: 2, row: 1, emoji: '🐨' },
  lion: { col: 3, row: 1, emoji: '🦁' },
};

export const SPRITE_SIZE = 64;
export const SPRITE_COLS = 4;
export const SPRITE_ROWS = 2;
