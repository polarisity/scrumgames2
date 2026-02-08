import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';
import { socketManager } from './SocketManager';

// Movement boundaries (matches original game.js)
const BOUNDS = {
  minX: 50,
  maxX: GAME_WIDTH - 50,
  minY: 100,
  maxY: GAME_HEIGHT - 50,
};

const MOVE_SPEED = 8;
const MOVE_EMIT_INTERVAL = 50; // Throttle position updates to 50ms

export class InputManager {
  private scene: Phaser.Scene;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private numberKeys: Phaser.Input.Keyboard.Key[] = [];

  // State
  private lastMoveEmitTime: number = 0;
  private isEnabled: boolean = true;

  // Callbacks
  private onCardSelectCallback: ((card: string) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.setupKeyboardControls();
  }

  private setupKeyboardControls(): void {
    if (!this.scene.input.keyboard) {
      console.error('Keyboard input not available');
      return;
    }

    // Arrow keys
    this.cursors = this.scene.input.keyboard.createCursorKeys();

    // WASD keys
    this.wasdKeys = {
      W: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Number keys 1-8 for card selection
    const cardValues = ['1', '2', '3', '5', '8', '13', '21', '?'];
    for (let i = 1; i <= 8; i++) {
      const key = this.scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes[`ONE` as keyof typeof Phaser.Input.Keyboard.KeyCodes] + (i - 1)
      );
      const cardValue = cardValues[i - 1];
      key.on('down', () => {
        if (this.isEnabled && !this.isInputFieldFocused()) {
          this.selectCard(cardValue);
        }
      });
      this.numberKeys.push(key);
    }

    // Prevent keyboard input when typing in HTML input fields
    this.scene.input.keyboard.on('keydown', this.handleGlobalKeyDown.bind(this));
  }

  private handleGlobalKeyDown(event: KeyboardEvent): void {
    // Don't process game input if focused on an input element
    if (this.isInputFieldFocused()) {
      return;
    }
  }

  private isInputFieldFocused(): boolean {
    const activeElement = document.activeElement;
    if (!activeElement) return false;

    const tagName = activeElement.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || activeElement.hasAttribute('contenteditable');
  }

  public update(playerX: number, playerY: number): { x: number; y: number; isMoving: boolean } {
    if (!this.isEnabled || this.isInputFieldFocused()) {
      return { x: playerX, y: playerY, isMoving: false };
    }

    let newX = playerX;
    let newY = playerY;
    let isMoving = false;

    // Check movement keys
    const up = this.cursors.up?.isDown || this.wasdKeys.W.isDown;
    const down = this.cursors.down?.isDown || this.wasdKeys.S.isDown;
    const left = this.cursors.left?.isDown || this.wasdKeys.A.isDown;
    const right = this.cursors.right?.isDown || this.wasdKeys.D.isDown;

    if (up) {
      newY -= MOVE_SPEED;
      isMoving = true;
    }
    if (down) {
      newY += MOVE_SPEED;
      isMoving = true;
    }
    if (left) {
      newX -= MOVE_SPEED;
      isMoving = true;
    }
    if (right) {
      newX += MOVE_SPEED;
      isMoving = true;
    }

    // Apply boundaries
    newX = Phaser.Math.Clamp(newX, BOUNDS.minX, BOUNDS.maxX);
    newY = Phaser.Math.Clamp(newY, BOUNDS.minY, BOUNDS.maxY);

    // Emit position update if moving and throttle time has passed
    if (isMoving) {
      const now = Date.now();
      if (now - this.lastMoveEmitTime >= MOVE_EMIT_INTERVAL) {
        socketManager.sendMove(newX, newY);
        this.lastMoveEmitTime = now;
      }
    }

    return { x: newX, y: newY, isMoving };
  }

  private selectCard(cardValue: string): void {
    if (this.onCardSelectCallback) {
      this.onCardSelectCallback(cardValue);
    }
    socketManager.selectCard(cardValue);
  }

  public setCardSelectCallback(callback: (card: string) => void): void {
    this.onCardSelectCallback = callback;
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  public isMovingNow(): boolean {
    if (!this.isEnabled || this.isInputFieldFocused()) {
      return false;
    }

    return (
      this.cursors.up?.isDown ||
      this.cursors.down?.isDown ||
      this.cursors.left?.isDown ||
      this.cursors.right?.isDown ||
      this.wasdKeys.W.isDown ||
      this.wasdKeys.A.isDown ||
      this.wasdKeys.S.isDown ||
      this.wasdKeys.D.isDown
    );
  }

  public destroy(): void {
    // Clean up keyboard listeners
    this.numberKeys.forEach((key) => key.removeAllListeners());
  }
}
