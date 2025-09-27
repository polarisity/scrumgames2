import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { RoomService } from '../services/RoomService';
import { Player, Throwable } from '../types/game.types';

export class SocketHandler {
  private roomService: RoomService;
  private playerRoomMap: Map<string, string> = new Map();

  constructor(private io: Server) {
    this.roomService = new RoomService();
  }

  handleConnection(socket: Socket): void {
    console.log(`Player connected: ${socket.id}`);

    socket.on('createRoom', (playerName: string) => {
      const roomId = this.roomService.createRoom();
      this.handleJoinRoom(socket, roomId, playerName);
    });

    socket.on('joinRoom', ({ roomId, playerName }: { roomId: string; playerName: string }) => {
      this.handleJoinRoom(socket, roomId, playerName);
    });

    socket.on('move', ({ x, y }: { x: number; y: number }) => {
      const roomId = this.playerRoomMap.get(socket.id);
      if (roomId) {
        this.roomService.updatePlayerPosition(roomId, socket.id, x, y);
        this.broadcastRoomState(roomId);
      }
    });

    socket.on('selectCard', (card: string) => {
      const roomId = this.playerRoomMap.get(socket.id);
      if (roomId) {
        this.roomService.selectCard(roomId, socket.id, card);
        this.broadcastRoomState(roomId);
      }
    });

    socket.on('revealCards', () => {
      const roomId = this.playerRoomMap.get(socket.id);
      if (roomId) {
        const room = this.roomService.getRoom(roomId);
        const player = room?.players.get(socket.id);
        if (player?.isGameMaster) {
          this.roomService.revealCards(roomId);
          this.broadcastRoomState(roomId);
        }
      }
    });

    socket.on('resetRound', () => {
      const roomId = this.playerRoomMap.get(socket.id);
      if (roomId) {
        const room = this.roomService.getRoom(roomId);
        const player = room?.players.get(socket.id);
        if (player?.isGameMaster) {
          this.roomService.resetCards(roomId);
          this.broadcastRoomState(roomId);
        }
      }
    });

    socket.on('throwItem', ({ type, targetX, targetY }: { type: string; targetX: number; targetY: number }) => {
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
    });

    socket.on('performAction', (action: string) => {
      const roomId = this.playerRoomMap.get(socket.id);
      if (roomId) {
        this.io.to(roomId).emit('playerAction', {
          playerId: socket.id,
          action,
          timestamp: Date.now()
        });
      }
    });

    socket.on('disconnect', () => {
      const roomId = this.playerRoomMap.get(socket.id);
      if (roomId) {
        this.roomService.removePlayer(roomId, socket.id);
        this.playerRoomMap.delete(socket.id);
        this.broadcastRoomState(roomId);
      }
      console.log(`Player disconnected: ${socket.id}`);
    });
  }

  private handleJoinRoom(socket: Socket, roomId: string, playerName: string): void {
    const room = this.roomService.getRoom(roomId);
    if (!room && roomId !== this.roomService.createRoom()) {
      socket.emit('error', 'Room not found');
      return;
    }

    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FD79A8'];
    const avatars = ['🦊', '🐸', '🦁', '🐨', '🐵', '🦝', '🐻', '🐯'];
    
    const player: Player = {
      id: socket.id,
      name: playerName,
      x: Math.random() * 600 + 100,
      y: Math.random() * 400 + 100,
      avatar: avatars[Math.floor(Math.random() * avatars.length)],
      isGameMaster: false,
      color: colors[Math.floor(Math.random() * colors.length)]
    };

    this.roomService.addPlayer(roomId, player);
    this.playerRoomMap.set(socket.id, roomId);
    
    socket.join(roomId);
    socket.emit('roomJoined', { roomId, playerId: socket.id });
    this.broadcastRoomState(roomId);
  }

  private broadcastRoomState(roomId: string): void {
    const room = this.roomService.getRoom(roomId);
    if (room) {
      const state = {
        players: Array.from(room.players.values()),
        cardsRevealed: room.cardsRevealed,
        currentStory: room.currentStory,
        throwables: room.throwables
      };
      this.io.to(roomId).emit('roomState', state);
    }
  }
}
