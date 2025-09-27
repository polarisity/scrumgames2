import { v4 as uuidv4 } from 'uuid';
import { Room, Player, Throwable } from '../types/game.types';

export class RoomService {
  private rooms: Map<string, Room> = new Map();

  createRoom(): string {
    const roomId = uuidv4().substring(0, 6).toUpperCase();
    this.rooms.set(roomId, {
      id: roomId,
      players: new Map(),
      cardsRevealed: false,
      throwables: []
    });
    return roomId;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  addPlayer(roomId: string, player: Player): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    
    // First player becomes game master
    if (room.players.size === 0) {
      player.isGameMaster = true;
    }
    
    room.players.set(player.id, player);
    return true;
  }

  removePlayer(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    const wasGameMaster = room.players.get(playerId)?.isGameMaster;
    room.players.delete(playerId);
    
    // Assign new game master if needed
    if (wasGameMaster && room.players.size > 0) {
      const newMaster = room.players.values().next().value;
      if (newMaster) newMaster.isGameMaster = true;
    }
    
    // Delete empty rooms
    if (room.players.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  updatePlayerPosition(roomId: string, playerId: string, x: number, y: number): void {
    const room = this.rooms.get(roomId);
    const player = room?.players.get(playerId);
    if (player) {
      player.x = x;
      player.y = y;
    }
  }

  selectCard(roomId: string, playerId: string, card: string): void {
    const room = this.rooms.get(roomId);
    const player = room?.players.get(playerId);
    if (player && !room?.cardsRevealed) {
      player.card = card;
    }
  }

  revealCards(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (room) {
      room.cardsRevealed = true;
      return true;
    }
    return false;
  }

  resetCards(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.cardsRevealed = false;
      room.players.forEach(player => {
        player.card = undefined;
      });
      room.throwables = [];
    }
  }

  addThrowable(roomId: string, throwable: Throwable): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.throwables.push(throwable);
      // Clean up old throwables after 3 seconds
      setTimeout(() => {
        const index = room.throwables.findIndex(t => t.id === throwable.id);
        if (index > -1) {
          room.throwables.splice(index, 1);
        }
      }, 3000);
    }
  }
}
