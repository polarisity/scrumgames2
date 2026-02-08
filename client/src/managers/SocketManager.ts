import { io, Socket } from 'socket.io-client';
import Phaser from 'phaser';
import { PlayerData, RoomState, ThrowableData, ActionType, ChatMessage, AvatarType } from '../types/game.types';
import { GameScene } from '../scenes/GameScene';

// Event types for type-safe event emitter
interface SocketEvents {
  roomJoined: { roomId: string; playerId: string; userProfile?: UserProfile; needsNewDisplayName?: boolean };
  roomState: RoomState;
  itemThrown: ThrowableData;
  playerAction: { playerId: string; action: ActionType };
  pointsAwarded: { playerId: string; points: number }[];
  error: string;
  connected: void;
  disconnected: string;
}

interface UserProfile {
  displayName: string;
  avatar: string;
  points: number;
}

export class SocketManager extends Phaser.Events.EventEmitter {
  private socket: Socket | null = null;
  private gameScene: GameScene | null = null;

  // State
  private roomId: string | null = null;
  private myPlayerId: string | null = null;
  private isConnected: boolean = false;

  constructor() {
    super();
  }

  public setGameScene(scene: GameScene): void {
    this.gameScene = scene;
  }

  public async connect(authToken: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io({
        auth: { token: authToken },
      });

      this.socket.on('connect', () => {
        console.log('Socket connected');
        this.isConnected = true;
        this.emit('connected');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        this.isConnected = false;
        reject(error);
      });

      this.setupListeners();
    });
  }

  private setupListeners(): void {
    if (!this.socket) return;

    // Room joined
    this.socket.on('roomJoined', (data: SocketEvents['roomJoined']) => {
      console.log('Room joined:', data.roomId);
      this.roomId = data.roomId;
      this.myPlayerId = data.playerId;

      if (this.gameScene) {
        this.gameScene.setMyPlayerId(data.playerId);
      }

      this.emit('roomJoined', data);
    });

    // Room state updates
    this.socket.on('roomState', (state: { players: PlayerData[]; cardsRevealed: boolean; currentStory?: string; throwables?: ThrowableData[]; messages?: ChatMessage[] }) => {
      if (this.gameScene) {
        // Update players in the game scene
        this.gameScene.updateAllPlayers(state.players);

        // Update card reveal state
        this.gameScene.setCardsRevealed(state.cardsRevealed);
      }

      // Emit for HTML UI to handle (player list, chat, story, etc.)
      this.emit('roomState', state);
    });

    // Item thrown
    this.socket.on('itemThrown', (throwable: ThrowableData) => {
      if (this.gameScene) {
        this.gameScene.spawnThrowable(throwable);
      }
      this.emit('itemThrown', throwable);
    });

    // Player action (animation)
    this.socket.on('playerAction', (data: { playerId: string; action: ActionType }) => {
      if (this.gameScene) {
        this.gameScene.triggerPlayerAction(data.playerId, data.action);
      }
      this.emit('playerAction', data);
    });

    // Points awarded
    this.socket.on('pointsAwarded', (pointsData: SocketEvents['pointsAwarded']) => {
      this.emit('pointsAwarded', pointsData);
    });

    // Error handling
    this.socket.on('error', (message: string) => {
      console.error('Socket error:', message);
      this.emit('error', message);
    });

    // Disconnect
    this.socket.on('disconnect', (reason: string) => {
      console.log('Socket disconnected:', reason);
      this.isConnected = false;
      this.emit('disconnected', reason);
    });
  }

  // Room operations
  public createRoom(playerName: string, avatar: AvatarType): void {
    if (!this.socket) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit('createRoom', { playerName, avatar });
  }

  public joinRoom(roomId: string, playerName: string, avatar: AvatarType): void {
    if (!this.socket) {
      console.error('Socket not connected');
      return;
    }
    this.socket.emit('joinRoom', { roomId, playerName, avatar });
  }

  // Game actions
  public sendMove(x: number, y: number): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('move', { x, y });
  }

  public selectCard(card: string): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('selectCard', card);
  }

  public revealCards(): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('revealCards');
  }

  public resetCards(): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('resetCards');
  }

  public performAction(action: ActionType): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('performAction', action);
  }

  public throwItem(itemType: string, targetX: number, targetY: number): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('throwItem', { type: itemType, targetX, targetY });
  }

  public sendChatMessage(text: string): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('sendMessage', text);
  }

  public setStory(story: string): void {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('setStory', story);
  }

  // Profile updates
  public updateDisplayName(newName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }
      this.socket.emit('updateDisplayName', newName, (result: { success: boolean; error?: string }) => {
        if (result.success) {
          resolve();
        } else {
          reject(new Error(result.error || 'Failed to update display name'));
        }
      });
    });
  }

  public updateAvatar(newAvatar: AvatarType): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }
      this.socket.emit('updateAvatar', newAvatar, (result: { success: boolean; error?: string }) => {
        if (result.success) {
          resolve();
        } else {
          reject(new Error(result.error || 'Failed to update avatar'));
        }
      });
    });
  }

  // Getters
  public getRoomId(): string | null {
    return this.roomId;
  }

  public getMyPlayerId(): string | null {
    return this.myPlayerId;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  // Cleanup
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.roomId = null;
    this.myPlayerId = null;
  }
}

// Singleton instance
export const socketManager = new SocketManager();
