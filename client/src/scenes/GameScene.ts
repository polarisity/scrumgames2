import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';
import { Player } from '../gameObjects/Player';
import { Throwable } from '../gameObjects/Throwable';
import { PlayerData, ThrowableData, ActionType } from '../types/game.types';
import { InputManager } from '../managers/InputManager';

export class GameScene extends Phaser.Scene {
  private _background!: Phaser.GameObjects.TileSprite;
  private players: Map<string, Player> = new Map();
  private throwables: Throwable[] = [];
  private _cardsRevealed: boolean = false;

  // Local player reference
  private myPlayerId: string | null = null;

  // Input manager for keyboard controls
  private inputManager!: InputManager;

  // Flag for development mode (test players)
  private isDevMode: boolean = false;

  constructor() {
    super({ key: 'GameScene' });

    // Check for dev mode from registry (set by PhaserBridge)
    // This will be set before the scene starts
  }

  init(data: { devMode?: boolean }): void {
    // Accept dev mode flag from scene start data
    if (data && data.devMode !== undefined) {
      this.isDevMode = data.devMode;
    }
  }

  create(): void {
    // Create tiled grass background
    this._background = this.add.tileSprite(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      'grass'
    );

    // Initialize input manager
    this.inputManager = new InputManager(this);

    // Add development info text
    if (this.isDevMode) {
      const text = this.add.text(GAME_WIDTH / 2, 30, 'Phaser 4 GameScene - Development Mode', {
        font: '18px Arial',
        color: '#333333',
        backgroundColor: '#ffffff80',
        padding: { x: 10, y: 5 },
      });
      text.setOrigin(0.5, 0.5);

      // Create test players in dev mode
      this.createTestPlayers();
    }

    console.log('GameScene created successfully');
  }

  private createTestPlayers(): void {
    // Create test players for development verification
    const testPlayers: PlayerData[] = [
      {
        id: 'test-1',
        name: 'Alice',
        x: 300,
        y: 300,
        avatar: 'cat',
        isGameMaster: true,
        card: '5',
        color: '#6c5ce7',
        points: 100,
        isRegistered: true,
      },
      {
        id: 'test-2',
        name: 'Bob',
        x: 500,
        y: 350,
        avatar: 'dog',
        isGameMaster: false,
        card: '8',
        color: '#00cec9',
        points: 50,
        isRegistered: false,
      },
      {
        id: 'test-3',
        name: 'Charlie',
        x: 700,
        y: 280,
        avatar: 'fox',
        isGameMaster: false,
        card: undefined,
        color: '#fd79a8',
        points: 75,
        isRegistered: true,
      },
    ];

    testPlayers.forEach((data) => {
      const player = new Player(this, data);
      this.players.set(data.id, player);
    });

    // Set first player as "my player" for testing keyboard controls
    this.myPlayerId = 'test-1';

    // Reveal cards for testing
    this.time.delayedCall(2000, () => {
      this.setCardsRevealed(true);
    });

    // Test actions
    this.time.delayedCall(3000, () => {
      const alice = this.players.get('test-1');
      alice?.playAction('dance');
    });

    this.time.delayedCall(4000, () => {
      const bob = this.players.get('test-2');
      bob?.playAction('laugh');
    });

    // Test throwable
    this.time.delayedCall(5000, () => {
      this.spawnThrowable({
        id: 'throw-1',
        type: 'tomato',
        x: 300,
        y: 300,
        targetX: 700,
        targetY: 280,
        throwerId: 'test-1',
        timestamp: Date.now(),
      });
    });
  }

  update(time: number, delta: number): void {
    // Handle local player input
    const myPlayer = this.getMyPlayer();
    if (myPlayer && this.inputManager) {
      const { x, y, isMoving } = this.inputManager.update(myPlayer.x, myPlayer.y);
      if (isMoving) {
        myPlayer.setPosition(x, y);
        myPlayer.setMoving(true);
      } else {
        myPlayer.setMoving(false);
      }
    }

    // Update all players
    this.players.forEach((player) => {
      player.update(time, delta);
    });
  }

  // Public methods for external control (SocketManager will call these)

  public addPlayer(playerData: PlayerData): Player {
    // Remove existing player if any
    if (this.players.has(playerData.id)) {
      this.removePlayer(playerData.id);
    }

    const player = new Player(this, playerData);
    this.players.set(playerData.id, player);
    return player;
  }

  public removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      player.destroy();
      this.players.delete(playerId);
    }
  }

  public updatePlayer(playerData: PlayerData): void {
    const player = this.players.get(playerData.id);
    if (player) {
      player.updateFromData(playerData);
    } else {
      // Player doesn't exist, create them
      this.addPlayer(playerData);
    }
  }

  public updateAllPlayers(playersData: PlayerData[]): void {
    // Track which players are in the new state
    const newPlayerIds = new Set(playersData.map((p) => p.id));

    // Remove players that are no longer in the state
    this.players.forEach((_, id) => {
      if (!newPlayerIds.has(id)) {
        this.removePlayer(id);
      }
    });

    // Update or add players
    playersData.forEach((data) => {
      this.updatePlayer(data);
    });
  }

  public setCardsRevealed(revealed: boolean): void {
    this._cardsRevealed = revealed;
    this.players.forEach((player) => {
      if (revealed) {
        player.revealCard();
      } else {
        player.hideCard();
      }
    });
  }

  public triggerPlayerAction(playerId: string, action: ActionType): void {
    const player = this.players.get(playerId);
    if (player) {
      player.playAction(action);
    }
  }

  public spawnThrowable(data: ThrowableData): void {
    const throwable = new Throwable(this, data);
    this.throwables.push(throwable);

    // Remove from array when destroyed
    throwable.once('destroy', () => {
      const index = this.throwables.indexOf(throwable);
      if (index > -1) {
        this.throwables.splice(index, 1);
      }
    });
  }

  public setMyPlayerId(playerId: string): void {
    this.myPlayerId = playerId;
  }

  public getMyPlayer(): Player | undefined {
    if (!this.myPlayerId) return undefined;
    return this.players.get(this.myPlayerId);
  }

  public getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  public getAllPlayers(): Map<string, Player> {
    return this.players;
  }
}
