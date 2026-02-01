import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { SocketHandler } from './handlers/SocketHandler';
import { authMiddleware, AuthenticatedSocket } from './middleware/authMiddleware';
import { userService } from './services/UserService';

const app = express();
const server = createServer(app);

// Configure CORS with allowed origins from environment variable
// In production, set ALLOWED_ORIGINS="https://yourdomain.com,https://www.yourdomain.com"
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../client')));

const socketHandler = new SocketHandler(io);

// Apply authentication middleware to all socket connections
io.use(authMiddleware);

io.on('connection', (socket) => {
  socketHandler.handleConnection(socket as AuthenticatedSocket);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Scrum Poker server running on port ${PORT}`);

  // Initialize season management after server starts
  initializeSeasonManagement();
});

/**
 * Initialize season management - ensure current season exists and set up periodic checks
 */
async function initializeSeasonManagement(): Promise<void> {
  try {
    // Check for season transitions and ensure current season exists
    await userService.checkAndHandleSeasonTransition();

    // Refresh the leaderboard on startup
    await userService.refreshSeasonLeaderboard();

    console.log('Season management initialized');

    // Set up hourly maintenance checks
    const ONE_HOUR = 60 * 60 * 1000;
    setInterval(async () => {
      try {
        await userService.checkAndHandleSeasonTransition();

        // Archive inactive anonymous users (30 days inactivity)
        await userService.archiveInactiveUsers();
      } catch (error) {
        console.error('Error in hourly maintenance:', error);
      }
    }, ONE_HOUR);
  } catch (error) {
    console.error('Failed to initialize season management:', error);
  }
}
