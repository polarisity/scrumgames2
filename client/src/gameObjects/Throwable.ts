import Phaser from 'phaser';
import { ThrowableData, ThrowableType } from '../types/game.types';

const THROWABLE_EMOJIS: Record<ThrowableType, string> = {
  tomato: '🍅',
  confetti: '🎉',
  ball: '⚽',
  paper: '📄',
};

export class Throwable extends Phaser.GameObjects.Container {
  private emoji: Phaser.GameObjects.Text;
  private throwableData: ThrowableData;
  private startY: number;
  private arcHeight: number = 100;
  private duration: number = 1000; // 1 second flight time
  private startTime: number;

  constructor(scene: Phaser.Scene, data: ThrowableData) {
    super(scene, data.x, data.y);

    this.throwableData = data;
    this.startY = data.y;
    this.startTime = Date.now();

    // Create emoji text
    const emojiChar = THROWABLE_EMOJIS[data.type] || '❓';
    this.emoji = scene.add.text(0, 0, emojiChar, {
      font: '30px Arial',
    });
    this.emoji.setOrigin(0.5, 0.5);
    this.add(this.emoji);

    // Add to scene
    scene.add.existing(this);

    // Set high depth so it appears above players
    this.setDepth(10000);

    // Start the flight animation using tweens
    this.startFlightAnimation();
  }

  private startFlightAnimation(): void {
    const scene = this.scene;
    const targetX = this.throwableData.targetX;
    const targetY = this.throwableData.targetY;

    // Create the tween for horizontal movement
    scene.tweens.add({
      targets: this,
      x: targetX,
      duration: this.duration,
      ease: 'Linear',
    });

    // Create custom update for arc trajectory and rotation
    const updateHandler = () => {
      const elapsed = Date.now() - this.startTime;
      const progress = Math.min(elapsed / this.duration, 1);

      // Arc trajectory (parabola)
      const baseY = this.startY + (targetY - this.startY) * progress;
      const arcOffset = Math.sin(progress * Math.PI) * this.arcHeight;
      this.y = baseY - arcOffset;

      // Rotation
      this.emoji.setAngle((elapsed / 100) * 57.3); // Convert to degrees

      // Check if animation is complete
      if (progress >= 1) {
        scene.events.off('update', updateHandler);
        this.onFlightComplete();
      }
    };

    scene.events.on('update', updateHandler);

    // Clean up listener when this object is destroyed
    this.once('destroy', () => {
      scene.events.off('update', updateHandler);
    });
  }

  private onFlightComplete(): void {
    // Optional: Add impact effect here (particles, etc.)

    // Destroy after a short delay
    this.scene.time.delayedCall(100, () => {
      this.destroy();
    });
  }

  public getData(): ThrowableData {
    return this.throwableData;
  }
}
