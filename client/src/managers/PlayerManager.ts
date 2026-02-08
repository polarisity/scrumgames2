import { PlayerData } from '../types/game.types';
import { Player } from '../gameObjects/Player';
import { GameScene } from '../scenes/GameScene';

/**
 * PlayerManager handles the business logic of player management
 * separate from the rendering concerns in GameScene.
 *
 * This allows the HTML UI to query player state without needing
 * direct access to the Phaser scene.
 */
export class PlayerManager {
  private playersData: Map<string, PlayerData> = new Map();
  private gameScene: GameScene | null = null;
  private myPlayerId: string | null = null;

  constructor() {}

  public setGameScene(scene: GameScene): void {
    this.gameScene = scene;
  }

  public setMyPlayerId(playerId: string): void {
    this.myPlayerId = playerId;
    if (this.gameScene) {
      this.gameScene.setMyPlayerId(playerId);
    }
  }

  public updatePlayers(players: PlayerData[]): void {
    // Store the data
    this.playersData.clear();
    players.forEach((player) => {
      this.playersData.set(player.id, player);
    });

    // Update the game scene if available
    if (this.gameScene) {
      this.gameScene.updateAllPlayers(players);
    }
  }

  public getPlayer(playerId: string): PlayerData | undefined {
    return this.playersData.get(playerId);
  }

  public getMyPlayer(): PlayerData | undefined {
    if (!this.myPlayerId) return undefined;
    return this.playersData.get(this.myPlayerId);
  }

  public getAllPlayers(): PlayerData[] {
    return Array.from(this.playersData.values());
  }

  public getPlayerCount(): number {
    return this.playersData.size;
  }

  public getPlayersWithCards(): PlayerData[] {
    return this.getAllPlayers().filter((p) => p.card !== undefined);
  }

  public getGameMaster(): PlayerData | undefined {
    return this.getAllPlayers().find((p) => p.isGameMaster);
  }

  public isMyPlayerGameMaster(): boolean {
    const myPlayer = this.getMyPlayer();
    return myPlayer?.isGameMaster ?? false;
  }

  /**
   * Calculate voting statistics when cards are revealed
   */
  public calculateVoteStats(): { average: number; agreement: string; votes: Record<string, number> } | null {
    const playersWithCards = this.getPlayersWithCards();

    if (playersWithCards.length === 0) {
      return null;
    }

    // Count votes
    const votes: Record<string, number> = {};
    let numericSum = 0;
    let numericCount = 0;

    playersWithCards.forEach((player) => {
      const card = player.card!;
      votes[card] = (votes[card] || 0) + 1;

      // Try to parse as number for average calculation
      const num = parseFloat(card);
      if (!isNaN(num)) {
        numericSum += num;
        numericCount++;
      }
    });

    // Calculate average (only for numeric cards)
    const average = numericCount > 0 ? numericSum / numericCount : 0;

    // Calculate agreement level
    const totalVoters = playersWithCards.length;
    const maxVotes = Math.max(...Object.values(votes));
    const agreementPercent = totalVoters > 0 ? (maxVotes / totalVoters) * 100 : 0;

    let agreement: string;
    if (agreementPercent === 100) {
      agreement = 'Perfect!';
    } else if (agreementPercent >= 75) {
      agreement = 'High';
    } else if (agreementPercent >= 50) {
      agreement = 'Medium';
    } else {
      agreement = 'Low';
    }

    return { average, agreement, votes };
  }

  /**
   * Get the Phaser Player object (for direct manipulation)
   */
  public getPhaserPlayer(playerId: string): Player | undefined {
    if (!this.gameScene) return undefined;
    return this.gameScene.getPlayer(playerId);
  }

  public getMyPhaserPlayer(): Player | undefined {
    if (!this.myPlayerId || !this.gameScene) return undefined;
    return this.gameScene.getPlayer(this.myPlayerId);
  }

  public clear(): void {
    this.playersData.clear();
    this.myPlayerId = null;
  }
}

// Singleton instance
export const playerManager = new PlayerManager();
