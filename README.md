# 🎯 Scrum Poker Party

A real-time, gamified Scrum Poker estimation tool. Move your avatar in a 2D world, interact with teammates, and estimate stories in a fun, interactive environment.

## ✨ Features
- **🎮 Interactive 2D World**: Move your avatar with WASD/Arrow keys on a dynamic grass field.
- **🃏 Real-time Estimation**: Point stories using quick-select cards or number keys.
- **👑 Host Controls**: Manage room state, reveal votes, and set active stories.
- **💬 Social Interaction**: Built-in chat, animations (dance, wave), and throwable items (tomatoes, confetti).
- **📊 Auto-Summaries**: Instant calculation of average scores and team agreement.

## 🏗 Architecture
- **Frontend**: Vanilla JS, HTML5 Canvas API, Socket.io. No heavy frameworks.
- **Backend**: Node.js, TypeScript, Express, Socket.io.
- **Infrastructure**: Containerized with Docker, Nginx reverse proxy.

## 🛠 Getting Started

### Local Development
1. `cd server && npm install`
2. `npm run dev`
3. Open `http://localhost:3000`

### Docker
```bash
docker-compose up -d
```

For production deployment details, see [deployment-guide.md](deployment-guide.md).

## 🎮 Controls
- **WASD / Arrows**: Move Avatar
- **1-8 / Click**: Select Estimation Card
- **Chat/Buttons**: Communicate & Express
- **👑 Reveal/Reset**: Host-only actions to manage the round
