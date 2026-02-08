import Phaser from 'phaser';
import { PlayerData, AVATAR_CONFIG, AvatarType, ActionType } from '../types/game.types';
import { Card } from './Card';

export class Player extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private nameLabel: Phaser.GameObjects.Text;
  private crownEmoji: Phaser.GameObjects.Text;
  private actionEmoji: Phaser.GameObjects.Text;
  private card: Card;

  // Player data
  public playerId: string;
  public playerName: string;
  public avatar: AvatarType;
  public isGameMaster: boolean;
  public selectedCard?: string;
  public color: string;
  public points: number;
  public isRegistered: boolean;

  // Movement state
  public isMoving: boolean = false;
  private lastMoveTime: number = 0;
  private bouncePhase: number = 0;

  // Animation state
  private currentAction: ActionType | null = null;
  private actionStartTime: number = 0;
  private actionDuration: number = 0;

  constructor(scene: Phaser.Scene, playerData: PlayerData) {
    super(scene, playerData.x, playerData.y);

    // Store player data
    this.playerId = playerData.id;
    this.playerName = playerData.name;
    this.avatar = (playerData.avatar as AvatarType) || 'cat';
    this.isGameMaster = playerData.isGameMaster;
    this.selectedCard = playerData.card;
    this.color = playerData.color;
    this.points = playerData.points;
    this.isRegistered = playerData.isRegistered;

    // Create shadow (ellipse at feet)
    this.shadow = scene.add.ellipse(0, 5, 30, 12, 0x000000, 0.3);
    this.add(this.shadow);

    // Create sprite
    const frameIndex = this.getAvatarFrameIndex();
    this.sprite = scene.add.sprite(0, -30, 'avatars', frameIndex);
    this.add(this.sprite);

    // Create name label
    this.nameLabel = scene.add.text(0, -70, this.playerName, {
      font: "bold 14px 'Inter', 'Segoe UI', system-ui, sans-serif",
      color: '#000000',
      stroke: '#ffffff',
      strokeThickness: 3,
    });
    this.nameLabel.setOrigin(0.5, 0.5);
    this.add(this.nameLabel);

    // Create crown emoji for game master
    this.crownEmoji = scene.add.text(0, -90, '👑', {
      font: '16px Arial',
    });
    this.crownEmoji.setOrigin(0.5, 0.5);
    this.crownEmoji.setVisible(this.isGameMaster);
    this.add(this.crownEmoji);

    // Create action emoji (initially hidden)
    this.actionEmoji = scene.add.text(35, -20, '', {
      font: '24px Arial',
    });
    this.actionEmoji.setOrigin(0.5, 0.5);
    this.actionEmoji.setVisible(false);
    this.add(this.actionEmoji);

    // Create card display
    this.card = new Card(scene, 0, -110);
    this.add(this.card);
    this.updateCardDisplay();

    // Add to scene
    scene.add.existing(this);

    // Set depth for Y-sorting
    this.setDepth(this.y);
  }

  private getAvatarFrameIndex(): number {
    const config = AVATAR_CONFIG[this.avatar];
    if (!config) return 0;
    return config.row * 4 + config.col; // 4 columns per row
  }

  public update(time: number, delta: number): void {
    // Update bounce animation
    if (this.isMoving || (time - this.lastMoveTime < 200)) {
      this.bouncePhase += delta * 0.015; // ~400ms cycle
      const bounceY = Math.abs(Math.sin(this.bouncePhase)) * 10;
      this.sprite.setY(-30 - bounceY);
    } else {
      this.sprite.setY(-30);
      this.bouncePhase = 0;
    }

    // Update action animations
    if (this.currentAction) {
      const elapsed = time - this.actionStartTime;
      const progress = elapsed / this.actionDuration;

      if (progress >= 1) {
        // Animation complete
        this.currentAction = null;
        this.actionEmoji.setVisible(false);
        this.sprite.setX(0);
      } else {
        switch (this.currentAction) {
          case 'jump':
            this.sprite.setY(-30 - Math.sin(progress * Math.PI) * 20);
            break;
          case 'dance':
            this.sprite.setX(Math.sin(progress * Math.PI * 4) * 5);
            break;
        }
      }
    }

    // Update depth for Y-sorting
    this.setDepth(this.y);
  }

  public updateFromData(playerData: PlayerData): void {
    // Check if position changed (for movement detection)
    const moved = playerData.x !== this.x || playerData.y !== this.y;
    if (moved) {
      this.isMoving = true;
      this.lastMoveTime = Date.now();
    }

    // Update position
    this.setPosition(playerData.x, playerData.y);

    // Update other data
    this.playerName = playerData.name;
    this.nameLabel.setText(playerData.name);
    this.isGameMaster = playerData.isGameMaster;
    this.crownEmoji.setVisible(this.isGameMaster);
    this.selectedCard = playerData.card;
    this.points = playerData.points;

    // Update avatar if changed
    if (playerData.avatar !== this.avatar) {
      this.avatar = playerData.avatar as AvatarType;
      this.sprite.setFrame(this.getAvatarFrameIndex());
    }

    // Update card display
    this.updateCardDisplay();
  }

  private updateCardDisplay(): void {
    if (this.selectedCard !== undefined) {
      this.card.show(this.selectedCard);
    } else {
      this.card.hide();
    }
  }

  public revealCard(): void {
    this.card.reveal();
  }

  public hideCard(): void {
    this.card.hideValue();
  }

  public playAction(action: ActionType): void {
    this.currentAction = action;
    this.actionStartTime = Date.now();

    switch (action) {
      case 'jump':
        this.actionDuration = 500;
        break;
      case 'dance':
        this.actionDuration = 1000;
        break;
      case 'wave':
        this.actionDuration = 2000;
        this.actionEmoji.setText('👋');
        this.actionEmoji.setVisible(true);
        break;
      case 'laugh':
        this.actionDuration = 2000;
        this.actionEmoji.setText('😂');
        this.actionEmoji.setVisible(true);
        break;
      case 'think':
        this.actionDuration = 2000;
        this.actionEmoji.setText('🤔');
        this.actionEmoji.setVisible(true);
        break;
    }
  }

  public setMoving(moving: boolean): void {
    this.isMoving = moving;
    if (moving) {
      this.lastMoveTime = Date.now();
    }
  }

  public destroy(): void {
    super.destroy();
  }
}
