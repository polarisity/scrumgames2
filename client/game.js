class ScrumPokerGame {
    constructor() {
        this.socket = null;
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.players = new Map();
        this.throwables = [];
        this.myId = null;
        this.roomId = null;
        this.selectedCard = null;
        this.cardsRevealed = false;
        this.animations = new Map();
        this.mousePos = { x: 0, y: 0 };
        this.selectedAvatar = null;
        
        // Keyboard movement state
        this.keys = {
            up: false,
            down: false,
            left: false,
            right: false
        };
        this.moveSpeed = 5;
        this.lastMoveTime = 0;
        this.moveInterval = 50; // milliseconds between movement updates
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupCanvasEvents();
        this.setupKeyboardControls();
        this.startGameLoop();
    }

    setupEventListeners() {
        // Avatar selection
        document.querySelectorAll('.avatar-option').forEach(avatar => {
            avatar.addEventListener('click', () => {
                document.querySelectorAll('.avatar-option').forEach(a => a.classList.remove('selected'));
                avatar.classList.add('selected');
                this.selectedAvatar = avatar.dataset.avatar;
            });
        });

        // Login screen
        document.getElementById('createRoomBtn').addEventListener('click', () => {
            const name = document.getElementById('playerName').value.trim();
            if (!name) {
                alert('Please enter your name');
                return;
            }
            if (!this.selectedAvatar) {
                alert('Please select an avatar');
                return;
            }
            this.connectAndCreateRoom(name);
        });

        document.getElementById('joinRoomBtn').addEventListener('click', () => {
            const name = document.getElementById('playerName').value.trim();
            const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
            if (!name) {
                alert('Please enter your name');
                return;
            }
            if (!this.selectedAvatar) {
                alert('Please select an avatar');
                return;
            }
            if (!roomCode) {
                alert('Please enter a room code');
                return;
            }
            this.connectAndJoinRoom(name, roomCode);
        });

        // Allow Enter key to submit
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const roomCode = document.getElementById('roomCode').value.trim();
                if (roomCode) {
                    document.getElementById('joinRoomBtn').click();
                } else {
                    document.getElementById('createRoomBtn').click();
                }
            }
        });

        document.getElementById('roomCode').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('joinRoomBtn').click();
            }
        });

        // Card selection
        document.querySelectorAll('.card').forEach(card => {
            card.addEventListener('click', () => {
                if (!this.cardsRevealed) {
                    document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    this.selectedCard = card.dataset.value;
                    this.socket.emit('selectCard', this.selectedCard);
                }
            });
        });

        // Actions
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.socket.emit('performAction', action);
                this.animatePlayer(this.myId, action);
            });
        });

        // Throwing items
        document.querySelectorAll('.throw-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = btn.dataset.item;
                this.throwItem(item);
            });
        });

        // Game master controls
        document.getElementById('revealBtn').addEventListener('click', () => {
            this.socket.emit('revealCards');
        });

        document.getElementById('resetBtn').addEventListener('click', () => {
            this.socket.emit('resetRound');
            document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
            this.selectedCard = null;
        });
    }

    setupKeyboardControls() {
        // Keyboard down events
        document.addEventListener('keydown', (e) => {
            // Prevent keyboard controls when typing in input fields
            if (e.target.tagName === 'INPUT') return;
            
            let changed = false;
            
            switch(e.key.toLowerCase()) {
                case 'arrowup':
                case 'w':
                    if (!this.keys.up) {
                        this.keys.up = true;
                        changed = true;
                    }
                    e.preventDefault();
                    break;
                case 'arrowdown':
                case 's':
                    if (!this.keys.down) {
                        this.keys.down = true;
                        changed = true;
                    }
                    e.preventDefault();
                    break;
                case 'arrowleft':
                case 'a':
                    if (!this.keys.left) {
                        this.keys.left = true;
                        changed = true;
                    }
                    e.preventDefault();
                    break;
                case 'arrowright':
                case 'd':
                    if (!this.keys.right) {
                        this.keys.right = true;
                        changed = true;
                    }
                    e.preventDefault();
                    break;
                // Number keys for quick card selection
                case '1':
                case '2':
                case '3':
                case '5':
                case '8':
                    if (e.target.tagName !== 'INPUT') {
                        this.selectCardByValue(e.key);
                    }
                    break;
            }
            
            if (changed) {
                this.updatePlayerMovement();
            }
        });

        // Keyboard up events
        document.addEventListener('keyup', (e) => {
            if (e.target.tagName === 'INPUT') return;
            
            switch(e.key.toLowerCase()) {
                case 'arrowup':
                case 'w':
                    this.keys.up = false;
                    break;
                case 'arrowdown':
                case 's':
                    this.keys.down = false;
                    break;
                case 'arrowleft':
                case 'a':
                    this.keys.left = false;
                    break;
                case 'arrowright':
                case 'd':
                    this.keys.right = false;
                    break;
            }
        });
    }

    updatePlayerMovement() {
        if (!this.socket || !this.myId) return;
        
        const now = Date.now();
        if (now - this.lastMoveTime < this.moveInterval) return;
        
        const myPlayer = this.players.get(this.myId);
        if (!myPlayer) return;
        
        let newX = myPlayer.x;
        let newY = myPlayer.y;
        let moved = false;
        
        if (this.keys.up && !this.keys.down) {
            newY -= this.moveSpeed;
            moved = true;
        }
        if (this.keys.down && !this.keys.up) {
            newY += this.moveSpeed;
            moved = true;
        }
        if (this.keys.left && !this.keys.right) {
            newX -= this.moveSpeed;
            moved = true;
        }
        if (this.keys.right && !this.keys.left) {
            newX += this.moveSpeed;
            moved = true;
        }
        
        // Keep player within canvas bounds
        newX = Math.max(30, Math.min(this.canvas.width - 30, newX));
        newY = Math.max(30, Math.min(this.canvas.height - 30, newY));
        
        if (moved && (newX !== myPlayer.x || newY !== myPlayer.y)) {
            this.socket.emit('move', { x: newX, y: newY });
            this.lastMoveTime = now;
        }
    }

    selectCardByValue(value) {
        if (!this.cardsRevealed) {
            const card = document.querySelector(`.card[data-value="${value}"]`);
            if (card) {
                document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.selectedCard = value;
                if (this.socket) {
                    this.socket.emit('selectCard', this.selectedCard);
                }
            }
        }
    }

    setupCanvasEvents() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mousePos = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        });

        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Move player to clicked position
            if (this.socket) {
                this.socket.emit('move', { x, y });
            }
        });
    }

    connectAndCreateRoom(playerName) {
        console.log('Creating room for player:', playerName, 'with avatar:', this.selectedAvatar);
        this.socket = io();
        this.setupSocketListeners();
        
        this.socket.on('connect', () => {
            console.log('Connected, creating room...');
            this.socket.emit('createRoom', { playerName, avatar: this.selectedAvatar });
        });
    }

    connectAndJoinRoom(playerName, roomCode) {
        console.log('Joining room:', roomCode, 'for player:', playerName, 'with avatar:', this.selectedAvatar);
        this.socket = io();
        this.setupSocketListeners();
        
        this.socket.on('connect', () => {
            console.log('Connected, joining room...');
            this.socket.emit('joinRoom', { roomId: roomCode, playerName, avatar: this.selectedAvatar });
        });
    }

    setupSocketListeners() {
        this.socket.on('roomJoined', ({ roomId, playerId }) => {
            console.log('Successfully joined room:', roomId);
            this.roomId = roomId;
            this.myId = playerId;
            document.getElementById('roomId').textContent = roomId;
            this.showGameScreen();
        });

        this.socket.on('roomState', (state) => {
            this.players.clear();
            state.players.forEach(player => {
                this.players.set(player.id, player);
            });
            
            this.cardsRevealed = state.cardsRevealed;
            this.throwables = state.throwables || [];
            
            // Update UI
            document.getElementById('playerCount').textContent = `Players: ${state.players.length}`;
            
            // Show/hide game master controls
            const myPlayer = this.players.get(this.myId);
            if (myPlayer?.isGameMaster) {
                document.getElementById('gameMasterControls').classList.remove('hidden');
            } else {
                document.getElementById('gameMasterControls').classList.add('hidden');
            }
        });

        this.socket.on('itemThrown', (throwable) => {
            this.throwables.push(throwable);
            this.animateThrowable(throwable);
        });

        this.socket.on('playerAction', ({ playerId, action }) => {
            this.animatePlayer(playerId, action);
        });

        this.socket.on('error', (message) => {
            console.error('Socket error:', message);
            alert(`Error: ${message}`);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            alert('Failed to connect to server. Please check your connection and try again.');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected:', reason);
            if (reason === 'io server disconnect') {
                alert('You were disconnected from the server.');
                location.reload();
            }
        });
    }

    showGameScreen() {
        document.getElementById('loginScreen').classList.remove('active');
        document.getElementById('gameScreen').classList.add('active');
    }

    throwItem(itemType) {
        // Find nearest player to throw at
        const myPlayer = this.players.get(this.myId);
        if (!myPlayer) return;

        let nearestPlayer = null;
        let minDistance = Infinity;

        this.players.forEach((player, id) => {
            if (id !== this.myId) {
                const distance = Math.hypot(
                    player.x - myPlayer.x,
                    player.y - myPlayer.y
                );
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestPlayer = player;
                }
            }
        });

        if (nearestPlayer) {
            this.socket.emit('throwItem', {
                type: itemType,
                targetX: nearestPlayer.x,
                targetY: nearestPlayer.y
            });
        }
    }

    animatePlayer(playerId, action) {
        const animation = {
            type: action,
            startTime: Date.now(),
            duration: 1000
        };
        this.animations.set(playerId, animation);
    }

    animateThrowable(throwable) {
        // Throwable animation is handled in the draw loop
        setTimeout(() => {
            const index = this.throwables.findIndex(t => t.id === throwable.id);
            if (index > -1) {
                this.throwables.splice(index, 1);
            }
        }, 3000);
    }

    startGameLoop() {
        const loop = () => {
            this.update();
            this.draw();
            requestAnimationFrame(loop);
        };
        loop();
    }

    update() {
        // Continuous keyboard movement
        if (this.keys.up || this.keys.down || this.keys.left || this.keys.right) {
            this.updatePlayerMovement();
        }
        
        // Update throwable positions
        this.throwables.forEach(throwable => {
            const progress = (Date.now() - throwable.timestamp) / 1000; // seconds
            if (progress < 1) {
                const t = progress;
                throwable.currentX = throwable.x + (throwable.targetX - throwable.x) * t;
                throwable.currentY = throwable.y + (throwable.targetY - throwable.y) * t - 
                                    Math.sin(t * Math.PI) * 100; // Arc trajectory
            } else {
                throwable.currentX = throwable.targetX;
                throwable.currentY = throwable.targetY;
            }
        });

        // Clean up old animations
        this.animations.forEach((animation, playerId) => {
            if (Date.now() - animation.startTime > animation.duration) {
                this.animations.delete(playerId);
            }
        });
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid background
        this.drawGrid();

        // Draw players
        this.players.forEach(player => {
            this.drawPlayer(player);
        });

        // Draw throwables
        this.throwables.forEach(throwable => {
            this.drawThrowable(throwable);
        });

        // Draw hover effects
        this.drawHoverEffects();
        
        // Draw controls hint
        this.drawControlsHint();
    }

    drawGrid() {
        this.ctx.strokeStyle = '#f0f0f0';
        this.ctx.lineWidth = 1;
        
        for (let x = 0; x < this.canvas.width; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < this.canvas.height; y += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawPlayer(player) {
        let x = player.x;
        let y = player.y;

        // Apply animation effects
        const animation = this.animations.get(player.id);
        if (animation) {
            const progress = (Date.now() - animation.startTime) / animation.duration;
            
            switch (animation.type) {
                case 'jump':
                    y -= Math.sin(progress * Math.PI) * 30;
                    break;
                case 'dance':
                    x += Math.sin(progress * Math.PI * 4) * 10;
                    break;
                case 'wave':
                    // Handled in avatar drawing
                    break;
            }
        }

        // Draw shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.beginPath();
        this.ctx.ellipse(x, player.y + 40, 25, 10, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw player circle
        this.ctx.fillStyle = player.color;
        this.ctx.strokeStyle = player.id === this.myId ? '#333' : '#666';
        this.ctx.lineWidth = player.id === this.myId ? 4 : 2;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 30, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

        // Draw avatar
        this.ctx.font = '30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(player.avatar, x, y);

        // Draw name
        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText(player.name, x, y + 50);

        // Draw game master crown
        if (player.isGameMaster) {
            this.ctx.fillText('👑', x, y - 45);
        }

        // Draw card
        if (player.card !== undefined) {
            const cardY = y - 70;
            
            if (this.cardsRevealed) {
                // Show card value
                this.ctx.fillStyle = 'white';
                this.ctx.fillRect(x - 20, cardY - 15, 40, 30);
                this.ctx.strokeStyle = '#667eea';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(x - 20, cardY - 15, 40, 30);
                
                this.ctx.fillStyle = '#667eea';
                this.ctx.font = 'bold 18px Arial';
                this.ctx.fillText(player.card, x, cardY);
            } else {
                // Show card back
                this.ctx.fillStyle = '#667eea';
                this.ctx.fillRect(x - 20, cardY - 15, 40, 30);
                this.ctx.fillStyle = 'white';
                this.ctx.font = '16px Arial';
                this.ctx.fillText('?', x, cardY);
            }
        }

        // Draw action emoji
        if (animation) {
            let emoji = '';
            switch (animation.type) {
                case 'laugh': emoji = '😂'; break;
                case 'think': emoji = '🤔'; break;
                case 'wave': emoji = '👋'; break;
            }
            if (emoji) {
                this.ctx.font = '24px Arial';
                this.ctx.fillText(emoji, x + 35, y - 20);
            }
        }
    }

    drawThrowable(throwable) {
        if (!throwable.currentX || !throwable.currentY) return;

        const itemEmojis = {
            'tomato': '🍅',
            'confetti': '🎉',
            'ball': '⚽',
            'paper': '📄'
        };

        const emoji = itemEmojis[throwable.type] || '❓';
        
        this.ctx.save();
        
        // Add rotation for fun
        const rotation = (Date.now() - throwable.timestamp) / 100;
        this.ctx.translate(throwable.currentX, throwable.currentY);
        this.ctx.rotate(rotation);
        
        this.ctx.font = '30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(emoji, 0, 0);
        
        this.ctx.restore();
    }

    drawHoverEffects() {
        // Draw line from player to mouse position when moving
        const myPlayer = this.players.get(this.myId);
        if (myPlayer && this.mousePos.x && this.mousePos.y) {
            this.ctx.strokeStyle = 'rgba(102, 126, 234, 0.3)';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(myPlayer.x, myPlayer.y);
            this.ctx.lineTo(this.mousePos.x, this.mousePos.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
    }

    drawControlsHint() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('Move: WASD/Arrow Keys or Click', 10, 20);
        this.ctx.fillText('Quick Select: Number Keys 1-8', 10, 35);
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    new ScrumPokerGame();
});