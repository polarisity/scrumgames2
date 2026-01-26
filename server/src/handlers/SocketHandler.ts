// /server/src/handlers/SocketHandler.ts
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { RoomService } from '../services/RoomService';
import { Player, Throwable } from '../types/game.types';
import { userService } from '../services/UserService';
import { AuthenticatedSocket } from '../middleware/authMiddleware';

export class SocketHandler {
  private roomService: RoomService;
  private playerRoomMap: Map<string, string> = new Map();

  constructor(private io: Server) {
    this.roomService = new RoomService();
  }

  handleConnection(socket: AuthenticatedSocket): void {
    console.log(`Player connected: ${socket.id}`, socket.firebaseUid ? `(Firebase UID: ${socket.firebaseUid})` : '(No Firebase auth)');

    // Display name validation event
    socket.on('checkDisplayName', async (displayName: string, callback: (result: { available: boolean }) => void) => {
      try {
        const available = await userService.isDisplayNameAvailable(displayName, socket.firebaseUid);
        callback({ available });
      } catch (error) {
        console.error('Error checking display name:', error);
        callback({ available: false });
      }
    });

    // Create user profile event (for first-time users)
    socket.on('createProfile', async (data: { displayName: string }, callback: (result: { success: boolean; error?: string }) => void) => {
      if (!socket.firebaseUid) {
        callback({ success: false, error: 'Not authenticated' });
        return;
      }

      try {
        const available = await userService.isDisplayNameAvailable(data.displayName, socket.firebaseUid);
        if (!available) {
          callback({ success: false, error: 'Display name is already taken' });
          return;
        }

        // Create user profile with default avatar (anonymous users get default)
        const defaultAvatars = ['cat', 'dog', 'rabbit', 'panda', 'fox', 'bear', 'koala', 'lion'];
        const defaultAvatar = defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)];

        await userService.createUser(socket.firebaseUid, data.displayName, defaultAvatar);
        socket.userProfile = await userService.getUser(socket.firebaseUid);

        callback({ success: true });
      } catch (error: any) {
        console.error('Error creating profile:', error);
        callback({ success: false, error: error.message || 'Failed to create profile' });
      }
    });

    // Update avatar event (registered users only)
    socket.on('updateAvatar', async (avatar: string, callback: (result: { success: boolean; error?: string }) => void) => {
      if (!socket.firebaseUid || !socket.userProfile) {
        callback({ success: false, error: 'Not authenticated' });
        return;
      }

      try {
        await userService.updateAvatar(socket.firebaseUid, avatar);
        socket.userProfile.avatar = avatar;
        callback({ success: true });
      } catch (error: any) {
        console.error('Error updating avatar:', error);
        callback({ success: false, error: error.message || 'Failed to update avatar' });
      }
    });

    // Update display name event
    socket.on('updateDisplayName', async (newDisplayName: string, callback: (result: { success: boolean; error?: string }) => void) => {
      if (!socket.firebaseUid || !socket.userProfile) {
        callback({ success: false, error: 'Not authenticated' });
        return;
      }

      try {
        await userService.updateDisplayName(socket.firebaseUid, newDisplayName);
        socket.userProfile.displayName = newDisplayName;
        callback({ success: true });
      } catch (error: any) {
        console.error('Error updating display name:', error);
        callback({ success: false, error: error.message || 'Failed to update display name' });
      }
    });

    // Get leaderboard event (public - no authentication required)
    socket.on('getLeaderboard', async (callback: (result: {
      season: { year: number; seasonNumber: number; seasonId: string; startDate: string; endDate: string } | null;
      leaderboard: Array<{ uid: string; displayName: string; avatar: string; points: number }>;
    }) => void) => {
      try {
        const data = await userService.getSeasonLeaderboard();
        if (data) {
          callback({
            season: {
              year: data.season.year,
              seasonNumber: data.season.seasonNumber,
              seasonId: data.season.seasonId,
              startDate: data.season.startDate.toISOString(),
              endDate: data.season.endDate.toISOString(),
            },
            leaderboard: data.leaderboard,
          });
        } else {
          callback({ season: null, leaderboard: [] });
        }
      } catch (error) {
        console.error('Error getting leaderboard:', error);
        callback({ season: null, leaderboard: [] });
      }
    });

    // Handle both old format (string) and new format (object with avatar)
    socket.on('createRoom', (data: string | { playerName: string; avatar?: string; token?: string }) => {
      let playerName: string;
      let avatar: string | null;

      // If user has a profile, use that
      if (socket.userProfile) {
        playerName = socket.userProfile.displayName;
        avatar = socket.userProfile.avatar;
      } else {
        playerName = typeof data === 'string' ? data : data.playerName;
        avatar = typeof data === 'string' ? null : (data.avatar || null);
      }

      const roomId = this.roomService.createRoom();
      console.log(`Room created: ${roomId}`);
      this.handleJoinRoom(socket, roomId, playerName, avatar);
    });

    socket.on('joinRoom', (data: { roomId: string; playerName: string; avatar?: string; token?: string }) => {
      let playerName: string;
      let avatar: string | null;

      // If user has a profile, use that
      if (socket.userProfile) {
        playerName = socket.userProfile.displayName;
        avatar = socket.userProfile.avatar;
      } else {
        playerName = data.playerName;
        avatar = data.avatar || null;
      }

      console.log(`Player ${playerName} attempting to join room: ${data.roomId}`);

      // Convert to uppercase to match what was created
      const upperRoomId = data.roomId.toUpperCase();

      // Check if room exists
      const room = this.roomService.getRoom(upperRoomId);
      if (!room) {
        console.log(`Room ${upperRoomId} not found`);
        socket.emit('error', 'Room not found. Please check the room code and try again.');
        return;
      }

      this.handleJoinRoom(socket, upperRoomId, playerName, avatar);
    });

    socket.on('move', ({ x, y }: { x: number; y: number }) => {
      try {
        const roomId = this.playerRoomMap.get(socket.id);
        if (roomId) {
          this.roomService.updatePlayerPosition(roomId, socket.id, x, y);
          this.broadcastRoomState(roomId);
        }
      } catch (error) {
        console.error('Error handling move event:', error);
      }
    });

    socket.on('selectCard', (card: string) => {
      try {
        const roomId = this.playerRoomMap.get(socket.id);
        if (roomId) {
          this.roomService.selectCard(roomId, socket.id, card);
          this.broadcastRoomState(roomId);
        }
      } catch (error) {
        console.error('Error handling selectCard event:', error);
      }
    });

    socket.on('revealCards', async () => {
      try {
        const roomId = this.playerRoomMap.get(socket.id);
        if (roomId) {
          const room = this.roomService.getRoom(roomId);
          const player = room?.players.get(socket.id);
          if (player?.isGameMaster) {
            this.roomService.revealCards(roomId);

            // Calculate and award points
            await this.awardPoints(roomId);

            this.broadcastRoomState(roomId);
          }
        }
      } catch (error) {
        console.error('Error handling revealCards event:', error);
      }
    });

    socket.on('resetRound', () => {
      try {
        const roomId = this.playerRoomMap.get(socket.id);
        if (roomId) {
          const room = this.roomService.getRoom(roomId);
          const player = room?.players.get(socket.id);
          if (player?.isGameMaster) {
            this.roomService.resetCards(roomId);
            this.broadcastRoomState(roomId);
          }
        }
      } catch (error) {
        console.error('Error handling resetRound event:', error);
      }
    });

    socket.on('throwItem', ({ type, targetX, targetY }: { type: string; targetX: number; targetY: number }) => {
      try {
        const roomId = this.playerRoomMap.get(socket.id);
        if (roomId) {
          const room = this.roomService.getRoom(roomId);
          const player = room?.players.get(socket.id);
          if (player) {
            const throwable: Throwable = {
              id: uuidv4(),
              type: type as any,
              x: player.x,
              y: player.y,
              targetX,
              targetY,
              throwerId: socket.id,
              timestamp: Date.now()
            };
            this.roomService.addThrowable(roomId, throwable);
            this.io.to(roomId).emit('itemThrown', throwable);
          }
        }
      } catch (error) {
        console.error('Error handling throwItem event:', error);
      }
    });

    socket.on('performAction', (action: string) => {
      try {
        const roomId = this.playerRoomMap.get(socket.id);
        if (roomId) {
          this.io.to(roomId).emit('playerAction', {
            playerId: socket.id,
            action,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error('Error handling performAction event:', error);
      }
    });

    socket.on('updateStory', (story: string) => {
      try {
        // Validate story length (max 10000 characters)
        if (typeof story !== 'string' || story.length > 10000) {
          console.warn('Invalid story length from socket:', socket.id);
          return;
        }

        const roomId = this.playerRoomMap.get(socket.id);
        if (roomId) {
          const room = this.roomService.getRoom(roomId);
          const player = room?.players.get(socket.id);
          if (player?.isGameMaster) {
            this.roomService.updateStory(roomId, story);
            this.broadcastRoomState(roomId);
          }
        }
      } catch (error) {
        console.error('Error handling updateStory event:', error);
      }
    });

    socket.on('transferHost', (newHostId: string) => {
      try {
        const roomId = this.playerRoomMap.get(socket.id);
        if (roomId) {
          const success = this.roomService.transferHost(roomId, socket.id, newHostId);
          if (success) {
            this.broadcastRoomState(roomId);
          }
        }
      } catch (error) {
        console.error('Error handling transferHost event:', error);
      }
    });

    socket.on('sendMessage', (text: string) => {
      try {
        // Validate message length (max 1000 characters)
        if (typeof text !== 'string' || text.trim().length === 0 || text.length > 1000) {
          console.warn('Invalid message length from socket:', socket.id);
          return;
        }

        const roomId = this.playerRoomMap.get(socket.id);
        if (roomId) {
          const room = this.roomService.getRoom(roomId);
          const player = room?.players.get(socket.id);
          if (player) {
            const message = {
              id: uuidv4(),
              playerId: socket.id,
              playerName: player.name,
              text: text.trim(),
              timestamp: Date.now()
            };
            this.roomService.addMessage(roomId, message);
            this.broadcastRoomState(roomId);
          }
        }
      } catch (error) {
        console.error('Error handling sendMessage event:', error);
      }
    });

    socket.on('disconnect', () => {
      const roomId = this.playerRoomMap.get(socket.id);
      if (roomId) {
        console.log(`Player ${socket.id} disconnected from room ${roomId}`);
        this.roomService.removePlayer(roomId, socket.id);
        this.playerRoomMap.delete(socket.id);
        this.broadcastRoomState(roomId);
      } else {
        console.log(`Player disconnected: ${socket.id}`);
      }
    });
  }

  private handleJoinRoom(socket: AuthenticatedSocket, roomId: string, playerName: string, selectedAvatar: string | null): void {
    // Make sure room exists
    let room = this.roomService.getRoom(roomId);

    if (!room) {
      console.log(`Room ${roomId} doesn't exist, cannot join`);
      socket.emit('error', 'Room not found');
      return;
    }

    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FD79A8'];
    const defaultAvatars = ['cat', 'dog', 'rabbit', 'panda', 'fox', 'bear', 'koala', 'lion'];

    // Use the selected avatar or pick a random one
    const avatar = selectedAvatar || defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)];

    // Find a safe spawn position that doesn't overlap with existing players
    const spawnPosition = this.roomService.findSafeSpawnPosition(roomId);

    const player: Player = {
      id: socket.id,
      name: playerName,
      x: spawnPosition.x,
      y: spawnPosition.y,
      avatar: avatar,
      isGameMaster: false,
      color: colors[Math.floor(Math.random() * colors.length)],
      firebaseUid: socket.firebaseUid,
      points: socket.userProfile?.points || 0,
      isRegistered: socket.userProfile?.isRegistered || false
    };

    const added = this.roomService.addPlayer(roomId, player);
    if (!added) {
      console.log(`Failed to add player to room ${roomId}`);
      socket.emit('error', 'Failed to join room');
      return;
    }

    this.playerRoomMap.set(socket.id, roomId);

    socket.join(roomId);
    socket.emit('roomJoined', {
      roomId,
      playerId: socket.id,
      userProfile: socket.userProfile || null
    });
    console.log(`Player ${playerName} (${socket.id}) with avatar ${avatar} successfully joined room ${roomId}`);

    this.broadcastRoomState(roomId);
  }

  /**
   * Award points to players after cards are revealed
   * Points are only awarded when there are at least 3 players in the room
   */
  private async awardPoints(roomId: string): Promise<void> {
    const room = this.roomService.getRoom(roomId);
    if (!room) return;

    // Only award points if there are at least 3 players in the room
    if (room.players.size < 3) {
      console.log(`Skipping points award for room ${roomId}: only ${room.players.size} players (minimum 3 required)`);
      return;
    }

    // Collect votes from players
    const votes = new Map<string, string>();
    room.players.forEach((player, playerId) => {
      if (player.card) {
        votes.set(playerId, player.card);
      }
    });

    // Calculate points
    const pointsMap = userService.calculatePoints(votes);

    // Award points to each player
    const pointsAwarded: { playerId: string; points: number }[] = [];

    for (const [playerId, points] of pointsMap) {
      const player = room.players.get(playerId);
      if (player && player.firebaseUid && points > 0) {
        try {
          const newTotal = await userService.addPoints(player.firebaseUid, points, roomId);
          player.points = newTotal;
          pointsAwarded.push({ playerId, points });
          console.log(`Awarded ${points} points to player ${player.name} (total: ${newTotal})`);
        } catch (error) {
          console.error(`Failed to award points to player ${player.name}:`, error);
        }
      }
    }

    // Broadcast points awarded event
    if (pointsAwarded.length > 0) {
      this.io.to(roomId).emit('pointsAwarded', pointsAwarded);
      // Refresh leaderboard in background (don't block)
      userService.refreshSeasonLeaderboard().catch(err => {
        console.error('Failed to refresh leaderboard after points award:', err);
      });
    }
  }

  private broadcastRoomState(roomId: string): void {
    const room = this.roomService.getRoom(roomId);
    if (room) {
      const state = {
        players: Array.from(room.players.values()),
        cardsRevealed: room.cardsRevealed,
        currentStory: room.currentStory,
        throwables: room.throwables,
        messages: room.messages
      };
      this.io.to(roomId).emit('roomState', state);
    }
  }
}