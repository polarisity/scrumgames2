import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { SocketHandler } from './handlers/SocketHandler';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../client')));

const socketHandler = new SocketHandler(io);

io.on('connection', (socket) => {
  socketHandler.handleConnection(socket);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Scrum Poker server running on port ${PORT}`);
});
