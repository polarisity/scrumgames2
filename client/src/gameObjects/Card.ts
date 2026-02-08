import Phaser from 'phaser';

export class Card extends Phaser.GameObjects.Container {
  private cardBackground: Phaser.GameObjects.Rectangle;
  private cardBorder: Phaser.GameObjects.Rectangle;
  private cardText: Phaser.GameObjects.Text;

  private cardValue: string = '';
  private isRevealed: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    // Card dimensions
    const cardWidth = 30;
    const cardHeight = 40;

    // Create card background (yellow)
    this.cardBackground = scene.add.rectangle(0, 0, cardWidth, cardHeight, 0xfffa65);
    this.add(this.cardBackground);

    // Create card border
    this.cardBorder = scene.add.rectangle(0, 0, cardWidth, cardHeight);
    this.cardBorder.setStrokeStyle(2, 0x000000);
    this.cardBorder.setFillStyle();
    this.add(this.cardBorder);

    // Create card text
    this.cardText = scene.add.text(0, 0, '?', {
      font: "bold 16px 'Inter', 'Segoe UI', system-ui, sans-serif",
      color: '#000000',
    });
    this.cardText.setOrigin(0.5, 0.5);
    this.add(this.cardText);

    // Initially hidden
    this.setVisible(false);
  }

  public show(value: string): void {
    this.cardValue = value;
    this.setVisible(true);
    // Show '?' when not revealed
    this.cardText.setText(this.isRevealed ? this.cardValue : '?');
  }

  public hide(): void {
    this.setVisible(false);
    this.cardValue = '';
  }

  public reveal(): void {
    this.isRevealed = true;
    if (this.cardValue) {
      this.cardText.setText(this.cardValue);
    }
  }

  public hideValue(): void {
    this.isRevealed = false;
    this.cardText.setText('?');
  }

  public getValue(): string {
    return this.cardValue;
  }

  public getIsRevealed(): boolean {
    return this.isRevealed;
  }
}
