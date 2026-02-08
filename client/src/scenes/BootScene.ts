import Phaser from 'phaser';
import { AVATAR_CONFIG, SPRITE_SIZE, SPRITE_COLS, SPRITE_ROWS } from '../types/game.types';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Display loading progress
    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(440, 270, 320, 50);

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const loadingText = this.make.text({
      x: width / 2,
      y: height / 2 - 50,
      text: 'Loading...',
      style: {
        font: '20px Arial',
        color: '#ffffff',
      },
    });
    loadingText.setOrigin(0.5, 0.5);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x4ade80, 1);
      progressBar.fillRect(450, 280, 300 * value, 30);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
    });

    // Generate textures as data URLs and load them
    const avatarDataUrl = this.generateEmojiSpritesheetDataUrl();
    const grassDataUrl = this.generateGrassTileDataUrl();

    // Load the generated textures
    this.load.spritesheet('avatars', avatarDataUrl, {
      frameWidth: SPRITE_SIZE,
      frameHeight: SPRITE_SIZE,
    });
    this.load.image('grass', grassDataUrl);
  }

  create(): void {
    // Transition to the main game scene
    this.scene.start('GameScene');
  }

  private generateEmojiSpritesheetDataUrl(): string {
    const canvas = document.createElement('canvas');
    canvas.width = SPRITE_SIZE * SPRITE_COLS;
    canvas.height = SPRITE_SIZE * SPRITE_ROWS;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('Failed to get canvas context for spritesheet');
      return '';
    }

    // Style the emojis for a consistent look
    ctx.font = `${SPRITE_SIZE * 0.8}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    Object.entries(AVATAR_CONFIG).forEach(([, config]) => {
      const x = config.col * SPRITE_SIZE + SPRITE_SIZE / 2;
      const y = config.row * SPRITE_SIZE + SPRITE_SIZE / 2;
      ctx.fillText(config.emoji, x, y);
    });

    return canvas.toDataURL('image/png');
  }

  private generateGrassTileDataUrl(): string {
    const tileSize = 64;
    const canvas = document.createElement('canvas');
    canvas.width = tileSize;
    canvas.height = tileSize;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('Failed to get canvas context for grass tile');
      return '';
    }

    // Base grass color
    ctx.fillStyle = '#90EE90';
    ctx.fillRect(0, 0, tileSize, tileSize);

    // Add some texture variation
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * tileSize;
      const y = Math.random() * tileSize;
      const shade = Math.random() > 0.5 ? '#7CCD7C' : '#98FB98';
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, 2, 2);
    }

    // Add subtle grid lines
    ctx.strokeStyle = 'rgba(0, 100, 0, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tileSize, 0);
    ctx.lineTo(tileSize, tileSize);
    ctx.stroke();

    return canvas.toDataURL('image/png');
  }
}
