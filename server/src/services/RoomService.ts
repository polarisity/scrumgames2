import { v4 as uuidv4 } from 'uuid';
import { Room, Player, Throwable } from '../types/game.types';

export class RoomService {
  private rooms: Map<string, Room> = new Map();

  createRoom(): string {
    const roomId = uuidv4().substring(0, 6).toUpperCase();
    const room: Room = {
      id: roomId,
      players: new Map(),
      cardsRevealed: false,
      throwables: [],
      messages: []
    };
    this.rooms.set(roomId, room);
    console.log(`Created room: ${roomId}, Total rooms: ${this.rooms.size}`);
    console.log('Available rooms:', Array.from(this.rooms.keys()));
    return roomId;
  }

  getRoom(roomId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    console.log(`Getting room ${roomId}: ${room ? 'found' : 'not found'}`);
    return room;
  }

  addPlayer(roomId: string, player: Player): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.log(`Cannot add player to room ${roomId}: room not found`);
      return false;
    }

    // First player becomes game master
    if (room.players.size === 0) {
      player.isGameMaster = true;
      console.log(`Player ${player.name} is now game master of room ${roomId}`);
    }

    room.players.set(player.id, player);
    console.log(`Added player ${player.name} to room ${roomId}. Room now has ${room.players.size} players`);
    return true;
  }

  removePlayer(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(playerId);
    const wasGameMaster = player?.isGameMaster;
    room.players.delete(playerId);

    console.log(`Removed player from room ${roomId}. Room now has ${room.players.size} players`);

    // Assign new game master if needed
    if (wasGameMaster && room.players.size > 0) {
      const newMaster = room.players.values().next().value;
      if (newMaster) {
        newMaster.isGameMaster = true;
        console.log(`New game master assigned in room ${roomId}`);
      }
    }

    // Delete empty rooms
    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      console.log(`Deleted empty room ${roomId}. Total rooms: ${this.rooms.size}`);
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
      console.log(`Player ${playerId} selected card ${card} in room ${roomId}`);
    }
  }

  revealCards(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (room) {
      room.cardsRevealed = true;
      console.log(`Cards revealed in room ${roomId}`);
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
      console.log(`Cards reset in room ${roomId}`);
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

  updateStory(roomId: string, story: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.currentStory = story;
      console.log(`Story updated to "${story}" in room ${roomId}`);
    }
  }

  addMessage(roomId: string, message: any): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.messages.push(message);
      // Keep only last 50 messages
      if (room.messages.length > 50) {
        room.messages.shift();
      }
    }
  }

  // Optional: Add this method for debugging
  getRoomList(): string[] {
    return Array.from(this.rooms.keys());
  }
}
