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
    return this.rooms.get(roomId);
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

  updatePlayerName(roomId: string, playerId: string, name: string): boolean {
    const room = this.rooms.get(roomId);
    const player = room?.players.get(playerId);
    if (player) {
      player.name = name;
      return true;
    }
    return false;
  }

  updatePlayerAvatar(roomId: string, playerId: string, avatar: string): boolean {
    const room = this.rooms.get(roomId);
    const player = room?.players.get(playerId);
    if (player) {
      player.avatar = avatar;
      return true;
    }
    return false;
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

  transferHost(roomId: string, currentHostId: string, newHostId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const currentHost = room.players.get(currentHostId);
    const newHost = room.players.get(newHostId);

    // Verify current host is actually the game master
    if (!currentHost?.isGameMaster) return false;
    // Verify new host exists
    if (!newHost) return false;

    // Transfer host role
    currentHost.isGameMaster = false;
    newHost.isGameMaster = true;
    console.log(`Host transferred from ${currentHost.name} to ${newHost.name} in room ${roomId}`);
    return true;
  }

  /**
   * Find a safe spawn position that doesn't overlap with existing players
   * @param roomId The room to check for existing players
   * @param minDistance Minimum distance from other players (default 80 to match client collision radius * 2)
   * @returns {x, y} coordinates for safe spawn position
   */
  findSafeSpawnPosition(roomId: string, minDistance: number = 80): { x: number; y: number } {
    const room = this.rooms.get(roomId);
    const existingPlayers = room ? Array.from(room.players.values()) : [];

    // Spawn area bounds (matching the original random ranges)
    const minX = 100;
    const maxX = 700;
    const minY = 100;
    const maxY = 500;

    // If no players, spawn in center
    if (existingPlayers.length === 0) {
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }

    // Try to find a position that's far enough from all existing players
    const maxAttempts = 50;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = Math.random() * (maxX - minX) + minX;
      const y = Math.random() * (maxY - minY) + minY;

      let isSafe = true;
      for (const player of existingPlayers) {
        const dist = Math.hypot(x - player.x, y - player.y);
        if (dist < minDistance) {
          isSafe = false;
          break;
        }
      }

      if (isSafe) {
        return { x, y };
      }
    }

    // If random attempts failed, use grid-based approach to find safe spot
    const gridStep = minDistance;
    let bestPosition = { x: minX, y: minY };
    let maxMinDistance = 0;

    for (let x = minX; x <= maxX; x += gridStep) {
      for (let y = minY; y <= maxY; y += gridStep) {
        let minDistToPlayer = Infinity;

        for (const player of existingPlayers) {
          const dist = Math.hypot(x - player.x, y - player.y);
          minDistToPlayer = Math.min(minDistToPlayer, dist);
        }

        if (minDistToPlayer > maxMinDistance) {
          maxMinDistance = minDistToPlayer;
          bestPosition = { x, y };
        }
      }
    }

    return bestPosition;
  }

  // Optional: Add this method for debugging
  getRoomList(): string[] {
    return Array.from(this.rooms.keys());
  }
}
