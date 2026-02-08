/**
 * PhaserBridge connects the Phaser game engine to the existing HTML UI.
 *
 * This module acts as the integration layer between:
 * - The Phaser GameScene (rendering, animations)
 * - The SocketManager (real-time communication)
 * - The HTML UI (sidebars, modals, forms)
 *
 * It exposes methods that the HTML code (game.js or future TypeScript) can call
 * to interact with the Phaser game.
 */

import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { GameScene } from './scenes/GameScene';
import { socketManager } from './managers/SocketManager';
import { playerManager } from './managers/PlayerManager';
import { PlayerData, ActionType, ThrowableType, AvatarType } from './types/game.types';

class PhaserBridge {
  private game: Phaser.Game | null = null;
  private gameScene: GameScene | null = null;
  private isInitialized: boolean = false;

  // Callbacks for HTML UI updates
  private onRoomJoinedCallback: ((data: { roomId: string; playerId: string }) => void) | null = null;
  private onRoomStateCallback: ((state: unknown) => void) | null = null;
  private onPointsAwardedCallback: ((data: { playerId: string; points: number }[]) => void) | null = null;
  private onErrorCallback: ((message: string) => void) | null = null;
  private onDisconnectCallback: ((reason: string) => void) | null = null;

  constructor() {}

  /**
   * Initialize the Phaser game engine
   * @param containerId - The HTML element ID where Phaser will render
   * @param devMode - If true, creates test players for development
   */
  public init(containerId: string = 'phaser-container', devMode: boolean = false): void {
    if (this.isInitialized) {
      console.warn('PhaserBridge already initialized');
      return;
    }

    // Store dev mode for scene initialization
    const sceneData = { devMode };

    // Update config with container ID and scene data
    const config: Phaser.Types.Core.GameConfig = {
      ...gameConfig,
      parent: containerId,
      callbacks: {
        preBoot: (game: Phaser.Game) => {
          // Store data in game registry for scenes to access
          game.registry.set('devMode', devMode);
        },
      },
    };

    // Create the Phaser game
    this.game = new Phaser.Game(config);

    // Wait for the game to be ready, then start scene with data
    this.game.events.once('ready', () => {
      // Stop and restart the GameScene with dev mode data
      const bootScene = this.game!.scene.getScene('BootScene');
      if (bootScene) {
        // Override the scene transition to pass dev mode
        bootScene.events.once('shutdown', () => {
          this.game!.scene.start('GameScene', sceneData);
        });
      }

      // Wait for GameScene to actually start
      this.game!.events.on('step', () => {
        if (!this.gameScene) {
          const scene = this.game!.scene.getScene('GameScene') as GameScene;
          if (scene && scene.scene.isActive()) {
            this.gameScene = scene;
            // Connect managers to the scene
            socketManager.setGameScene(this.gameScene);
            playerManager.setGameScene(this.gameScene);

            this.setupSocketCallbacks();
            this.isInitialized = true;
            console.log('PhaserBridge initialized successfully');
          }
        }
      });
    });
  }

  private setupSocketCallbacks(): void {
    // Forward socket events to HTML callbacks
    socketManager.on('roomJoined', (data: { roomId: string; playerId: string }) => {
      playerManager.setMyPlayerId(data.playerId);
      if (this.onRoomJoinedCallback) {
        this.onRoomJoinedCallback(data);
      }
    });

    socketManager.on('roomState', (state: { players: PlayerData[]; cardsRevealed: boolean }) => {
      playerManager.updatePlayers(state.players);
      if (this.onRoomStateCallback) {
        this.onRoomStateCallback(state);
      }
    });

    socketManager.on('pointsAwarded', (data: { playerId: string; points: number }[]) => {
      if (this.onPointsAwardedCallback) {
        this.onPointsAwardedCallback(data);
      }
    });

    socketManager.on('error', (message: string) => {
      if (this.onErrorCallback) {
        this.onErrorCallback(message);
      }
    });

    socketManager.on('disconnected', (reason: string) => {
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback(reason);
      }
    });
  }

  // ============ Connection Methods ============

  /**
   * Connect to the server with authentication
   */
  public async connect(authToken: string): Promise<void> {
    return socketManager.connect(authToken);
  }

  /**
   * Create a new room
   */
  public createRoom(playerName: string, avatar: AvatarType): void {
    socketManager.createRoom(playerName, avatar);
  }

  /**
   * Join an existing room
   */
  public joinRoom(roomId: string, playerName: string, avatar: AvatarType): void {
    socketManager.joinRoom(roomId, playerName, avatar);
  }

  /**
   * Disconnect from the server
   */
  public disconnect(): void {
    socketManager.disconnect();
    playerManager.clear();
  }

  // ============ Game Actions ============

  /**
   * Select a card value
   */
  public selectCard(card: string): void {
    socketManager.selectCard(card);
  }

  /**
   * Reveal all cards (game master only)
   */
  public revealCards(): void {
    socketManager.revealCards();
  }

  /**
   * Reset all cards (game master only)
   */
  public resetCards(): void {
    socketManager.resetCards();
  }

  /**
   * Perform an action (wave, dance, jump, laugh, think)
   */
  public performAction(action: ActionType): void {
    socketManager.performAction(action);
  }

  /**
   * Throw an item at a position
   */
  public throwItem(itemType: ThrowableType, targetX: number, targetY: number): void {
    socketManager.throwItem(itemType, targetX, targetY);
  }

  /**
   * Send a chat message
   */
  public sendChatMessage(text: string): void {
    socketManager.sendChatMessage(text);
  }

  /**
   * Set the current story (game master only)
   */
  public setStory(story: string): void {
    socketManager.setStory(story);
  }

  // ============ Profile Updates ============

  /**
   * Update display name
   */
  public async updateDisplayName(newName: string): Promise<void> {
    return socketManager.updateDisplayName(newName);
  }

  /**
   * Update avatar
   */
  public async updateAvatar(newAvatar: AvatarType): Promise<void> {
    return socketManager.updateAvatar(newAvatar);
  }

  // ============ State Getters ============

  public getRoomId(): string | null {
    return socketManager.getRoomId();
  }

  public getMyPlayerId(): string | null {
    return socketManager.getMyPlayerId();
  }

  public isConnected(): boolean {
    return socketManager.getIsConnected();
  }

  public getPlayerCount(): number {
    return playerManager.getPlayerCount();
  }

  public getAllPlayers(): PlayerData[] {
    return playerManager.getAllPlayers();
  }

  public getMyPlayer(): PlayerData | undefined {
    return playerManager.getMyPlayer();
  }

  public isMyPlayerGameMaster(): boolean {
    return playerManager.isMyPlayerGameMaster();
  }

  public calculateVoteStats() {
    return playerManager.calculateVoteStats();
  }

  // ============ Event Callbacks (for HTML UI) ============

  public onRoomJoined(callback: (data: { roomId: string; playerId: string }) => void): void {
    this.onRoomJoinedCallback = callback;
  }

  public onRoomState(callback: (state: unknown) => void): void {
    this.onRoomStateCallback = callback;
  }

  public onPointsAwarded(callback: (data: { playerId: string; points: number }[]) => void): void {
    this.onPointsAwardedCallback = callback;
  }

  public onError(callback: (message: string) => void): void {
    this.onErrorCallback = callback;
  }

  public onDisconnect(callback: (reason: string) => void): void {
    this.onDisconnectCallback = callback;
  }

  // ============ Utility ============

  public destroy(): void {
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
    }
    this.gameScene = null;
    this.isInitialized = false;
    socketManager.disconnect();
    playerManager.clear();
  }

  public getGame(): Phaser.Game | null {
    return this.game;
  }

  public getGameScene(): GameScene | null {
    return this.gameScene;
  }
}

// Export singleton instance
export const phaserBridge = new PhaserBridge();

// Also expose on window for legacy HTML access
declare global {
  interface Window {
    phaserBridge: PhaserBridge;
  }
}

if (typeof window !== 'undefined') {
  window.phaserBridge = phaserBridge;
}
