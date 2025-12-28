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
        this.backgroundPattern = null;

        // Keyboard movement state
        this.keys = {
            up: false,
            down: false,
            left: false,
            right: false
        };
        this.moveSpeed = 8;
        this.lastMoveTime = 0;
        this.moveInterval = 50; // milliseconds between movement updates

        // Asset management
        this.assets = {
            spritesheet: new Image()
        };
        // Sprite configuration for 4x2 grid
        this.spriteConfig = {
            cat: { col: 0, row: 0, emoji: '🐱' },
            dog: { col: 1, row: 0, emoji: '🐶' },
            rabbit: { col: 2, row: 0, emoji: '🐰' },
            panda: { col: 3, row: 0, emoji: '🐼' },
            fox: { col: 0, row: 1, emoji: '🦊' },
            bear: { col: 1, row: 1, emoji: '🐻' },
            koala: { col: 2, row: 1, emoji: '🐨' },
            lion: { col: 3, row: 1, emoji: '🦁' }
        };

        this.init();
    }

    async generateEmojiSpritesheet() {
        const spriteSize = 64;
        const cols = 4;
        const rows = 2;
        const canvas = document.createElement('canvas');
        canvas.width = spriteSize * cols;
        canvas.height = spriteSize * rows;
        const ctx = canvas.getContext('2d');

        // Style the emojis for a consistent look
        ctx.font = `${spriteSize * 0.8}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        Object.entries(this.spriteConfig).forEach(([name, config]) => {
            const x = config.col * spriteSize + spriteSize / 2;
            const y = config.row * spriteSize + spriteSize / 2;
            ctx.fillText(config.emoji, x, y);
        });

        // Optional: Apply a simple pixelation or filtering effect here if desired
        // For now, we use the raw emojis as a clean basis

        this.assets.spritesheet = new Image();
        this.assets.spritesheet.onload = () => {
            this.updateAvatarSelectionUI();
        };
        this.assets.spritesheet.src = canvas.toDataURL();
    }

    processSpritesheet() {
        // Obsolete with dynamic generation, but keeping structure for compatibility
        this.generateEmojiSpritesheet();
    }

    updateAvatarSelectionUI() {
        const options = document.querySelectorAll('.avatar-option');
        options.forEach(option => {
            const avatarName = option.dataset.avatar;
            const containerId = `avatar-choice-${avatarName}`;
            option.id = containerId;
            option.innerHTML = ''; // Clear the emoji
            this.drawAvatarIcon(avatarName, containerId);
        });
    }

    init() {
        this.generateEmojiSpritesheet();
        this.generateGrassTile();
        this.setupEventListeners();
        this.setupCanvasEvents();
        this.setupKeyboardControls();
        this.checkURLParameters();
        this.startGameLoop();
    }

    generateGrassTile() {
        const tileSize = 64;
        const canvas = document.createElement('canvas');
        canvas.width = tileSize;
        canvas.height = tileSize;
        const ctx = canvas.getContext('2d');

        // Base grass color
        ctx.fillStyle = '#27ae60';
        ctx.fillRect(0, 0, tileSize, tileSize);

        // Add some "blades" and texture
        ctx.fillStyle = '#2ecc71'; // Lighter green
        for (let i = 0; i < 40; i++) {
            const x = Math.random() * tileSize;
            const y = Math.random() * tileSize;
            ctx.fillRect(x, y, 2, 4);
        }

        ctx.fillStyle = '#1e8449'; // Darker green
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * tileSize;
            const y = Math.random() * tileSize;
            ctx.fillRect(x, y, 2, 2);
        }

        this.backgroundPattern = this.ctx.createPattern(canvas, 'repeat');
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

        // Copy link button
        document.getElementById('copyLinkBtn').addEventListener('click', () => {
            this.copyRoomLink();
        });

        // Story management
        document.getElementById('setStoryBtn').addEventListener('click', () => {
            const story = document.getElementById('storyInput').value.trim();
            if (story) {
                this.socket.emit('updateStory', story);
                document.getElementById('storyInput').value = '';
            }
        });

        document.getElementById('storyInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('setStoryBtn').click();
            }
        });

        // Chat
        document.getElementById('sendChatBtn').addEventListener('click', () => {
            this.sendChatMessage();
        });

        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
    }

    setupKeyboardControls() {
        // Keyboard down events
        document.addEventListener('keydown', (e) => {
            // Prevent keyboard controls when typing in input fields
            if (e.target.tagName === 'INPUT') return;

            let changed = false;

            switch (e.key.toLowerCase()) {
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

            switch (e.key.toLowerCase()) {
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
        newX = Math.max(20, Math.min(this.canvas.width - 20, newX));
        newY = Math.max(20, Math.min(this.canvas.height - 20, newY));

        // Collision detection with other players
        let collision = false;
        this.players.forEach((player, id) => {
            if (id !== this.myId) {
                const dist = Math.hypot(newX - player.x, newY - player.y);
                if (dist < 40) { // Solid radius
                    collision = true;
                }
            }
        });

        if (!collision && moved && (newX !== myPlayer.x || newY !== myPlayer.y)) {
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

            // Mouse click movement removed per user request
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

            // Initial check for game master status (though usually handled by roomState)
            const myPlayer = this.players.get(this.myId);
            this.updateHostControls(myPlayer?.isGameMaster);
        });

        this.socket.on('roomState', (state) => {
            // Track movement status for animation
            state.players.forEach(player => {
                const existing = this.players.get(player.id);
                if (existing) {
                    player.isMoving = (player.x !== existing.x || player.y !== existing.y);
                    player.lastMoveDetected = player.isMoving ? Date.now() : existing.lastMoveDetected;
                } else {
                    player.isMoving = false;
                    player.lastMoveDetected = 0;
                }
            });

            this.players.clear();
            state.players.forEach(player => {
                this.players.set(player.id, player);
            });

            this.cardsRevealed = state.cardsRevealed;
            this.throwables = state.throwables || [];

            // Update UI
            const playerCount = state.players.length;
            // document.getElementById('playerCount').textContent = `Players: ${playerCount}`;
            document.getElementById('playerListTitle').textContent = `Players (${playerCount})`;
            this.updatePlayerList();

            // Update story
            if (state.currentStory) {
                document.getElementById('storyDisplayName').textContent = state.currentStory;
            } else {
                document.getElementById('storyDisplayName').textContent = 'Not set';
            }

            // Update chat
            if (state.messages) {
                this.updateChatMessages(state.messages);
            }

            // Update summary
            if (this.cardsRevealed) {
                this.updateSummary(state.players);
            } else {
                document.getElementById('summarySection').classList.add('hidden');
            }

            // Show/hide game master controls
            const myPlayer = this.players.get(this.myId);
            this.updateHostControls(myPlayer?.isGameMaster);
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
        this.updatePlayerList();
    }

    updateHostControls(isGameMaster) {
        const gmControls = document.getElementById('gameMasterControls');
        const storyControls = document.getElementById('gmStoryControls');

        if (isGameMaster) {
            gmControls.classList.remove('hidden');
            storyControls.classList.remove('hidden');
        } else {
            gmControls.classList.add('hidden');
            storyControls.classList.add('hidden');
        }
    }

    drawAvatarIcon(avatarName, containerId) {
        const container = document.getElementById(containerId);
        if (!container || !this.assets.spritesheet.complete) return;

        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        const config = this.spriteConfig[avatarName] || this.spriteConfig.cat;
        const cols = 4;
        const rows = 2;
        const frameWidth = this.assets.spritesheet.width / cols;
        const frameHeight = this.assets.spritesheet.height / rows;

        const sourceX = config.col * frameWidth;
        const sourceY = config.row * frameHeight;

        ctx.drawImage(
            this.assets.spritesheet,
            sourceX, sourceY, frameWidth, frameHeight,
            0, 0, 32, 32
        );

        container.appendChild(canvas);
    }

    updatePlayerList() {
        const playerListElement = document.getElementById('playerList');
        if (!playerListElement) return;

        playerListElement.innerHTML = '';

        // Sort players: me first, then by name
        const sortedPlayers = Array.from(this.players.values()).sort((a, b) => {
            if (a.id === this.myId) return -1;
            if (b.id === this.myId) return 1;
            return a.name.localeCompare(b.name);
        });

        sortedPlayers.forEach(player => {
            const playerItem = document.createElement('div');
            playerItem.className = `player-list-item${player.id === this.myId ? ' is-me' : ''}`;

            let cardStatus = '';
            if (player.card !== undefined) {
                if (this.cardsRevealed) {
                    cardStatus = `<div class="player-card-value">${player.card}</div>`;
                } else {
                    cardStatus = `<div class="player-card-hidden">?</div>`;
                }
            } else {
                cardStatus = `<div class="player-card-empty"></div>`;
            }

            const avatarId = `avatar-list-${player.id}`;
            playerItem.innerHTML = `
                <div class="player-avatar" id="${avatarId}"></div>
                <div class="player-details">
                    <div class="player-name">
                        ${player.name}
                        ${player.isGameMaster ? '<span class="gm-badge" title="Game Master">👑</span>' : ''}
                    </div>
                    <div class="player-status">
                        ${player.card !== undefined ? 'Selected' : 'Choosing...'}
                    </div>
                </div>
                <div class="player-card-container">
                    ${cardStatus}
                </div>
            `;

            playerListElement.appendChild(playerItem);
            this.drawAvatarIcon(player.avatar, avatarId);
        });
    }

    checkURLParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');
        if (roomCode) {
            const roomInput = document.getElementById('roomCode');
            if (roomInput) {
                roomInput.value = roomCode.toUpperCase();
            }
        }
    }

    async copyRoomLink() {
        if (!this.roomId) return;

        const url = new URL(window.location.href);
        url.searchParams.set('room', this.roomId);
        const shareUrl = url.toString();

        try {
            await navigator.clipboard.writeText(shareUrl);
            const btn = document.getElementById('copyLinkBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Copied!';
            btn.classList.add('success');

            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.classList.remove('success');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy link to clipboard');
        }
    }

    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (text && this.socket) {
            this.socket.emit('sendMessage', text);
            input.value = '';
        }
    }

    updateChatMessages(messages) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        // Only update if number of messages changed
        if (container.children.length === messages.length) return;

        container.innerHTML = '';
        messages.forEach(msg => {
            const msgEl = document.createElement('div');
            msgEl.className = `chat-message${msg.playerId === this.myId ? ' is-me' : ''}`;
            msgEl.innerHTML = `
                <div class="msg-author">${msg.playerName}</div>
                <div class="msg-text">${this.escapeHtml(msg.text)}</div>
            `;
            container.appendChild(msgEl);
        });

        container.scrollTop = container.scrollHeight;
    }

    updateSummary(players) {
        const votes = players
            .filter(p => p.card !== undefined && p.card !== '?' && p.card !== '☕')
            .map(p => {
                const val = parseFloat(p.card);
                return isNaN(val) ? null : val;
            })
            .filter(v => v !== null);

        if (votes.length > 0) {
            const sum = votes.reduce((a, b) => a + b, 0);
            const avg = (sum / votes.length).toFixed(1);
            document.getElementById('avgScore').textContent = avg;

            // Simple agreement check: are all votes the same?
            const allSame = votes.every(v => v === votes[0]);
            document.getElementById('agreementLevel').textContent = allSame ? 'High (Unanimous)' : 'Mixed';

            document.getElementById('summarySection').classList.remove('hidden');
        } else {
            document.getElementById('summarySection').classList.add('hidden');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

        // Draw lush grass background
        this.drawBackground();

        // Draw players
        // Sort players by Y coordinate for proper depth rendering
        const sortedPlayers = Array.from(this.players.values()).sort((a, b) => a.y - b.y);
        sortedPlayers.forEach(player => {
            this.drawPlayer(player);
        });

        // Draw throwables
        this.throwables.forEach(throwable => {
            this.drawThrowable(throwable);
        });

        // Draw hover effects
        this.drawHoverEffects();

        // Draw controls hint
        // this.drawControlsHint();
    }

    drawBackground() {
        if (this.backgroundPattern) {
            this.ctx.fillStyle = this.backgroundPattern;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            // Fallback base color
            this.ctx.fillStyle = '#27ae60';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Optional: Very subtle grid for placement reference
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        for (let x = 0; x < this.canvas.width; x += 100) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += 100) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawPlayer(player) {
        let x = player.x;
        let y = player.y;

        // Apply movement animation (walking / bouncing)
        const animationProgress = (Date.now() % 400) / 400; // 400ms cycle
        let bounceY = 0;

        // Determine if player is moving
        let moving = false;
        if (player.id === this.myId) {
            moving = (this.keys.up || this.keys.down || this.keys.left || this.keys.right);
        } else {
            // If movement was detected in the last 200ms, keep animating
            moving = player.isMoving || (Date.now() - (player.lastMoveDetected || 0) < 200);
        }

        if (moving) {
            bounceY = Math.abs(Math.sin(animationProgress * Math.PI * 2)) * 10;
        }

        // Apply animation effects (actions like jump/dance)
        const animation = this.animations.get(player.id);
        if (animation) {
            const progress = (Date.now() - animation.startTime) / animation.duration;
            switch (animation.type) {
                case 'jump':
                    y -= Math.sin(progress * Math.PI) * 20;
                    break;
                case 'dance':
                    x += Math.sin(progress * Math.PI * 4) * 5;
                    break;
            }
        }

        y -= bounceY;

        // Draw shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(x, player.y + 5, 15, 6, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw Sprite
        if (this.assets.spritesheet.complete) {
            const config = this.spriteConfig[player.avatar] || this.spriteConfig.cat;

            // The spritesheet is a 4x2 grid
            const cols = 4;
            const rows = 2;
            const frameWidth = this.assets.spritesheet.width / cols;
            const frameHeight = this.assets.spritesheet.height / rows;

            const sourceX = config.col * frameWidth;
            const sourceY = config.row * frameHeight;

            this.ctx.drawImage(
                this.assets.spritesheet,
                sourceX, sourceY, frameWidth, frameHeight, // Source
                x - 32, y - 60, 64, 64 // Destination (centered and scaled)
            );
        } else {
            // Fallback to circle if assets not loaded
            this.ctx.fillStyle = player.color || '#6c5ce7';
            this.ctx.beginPath();
            this.ctx.arc(x, y, 20, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Draw name label above head
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 3;
        this.ctx.font = 'bold 14px Inter';
        this.ctx.textAlign = 'center';

        const labelY = y - 70;
        this.ctx.strokeText(player.name, x, labelY);
        this.ctx.fillText(player.name, x, labelY);

        if (player.isGameMaster) {
            this.ctx.fillText('👑', x, labelY - 20);
        }

        // Draw selection card
        if (player.card !== undefined) {
            const cardY = labelY - 40;
            this.ctx.fillStyle = '#fffa65';
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 2;
            this.ctx.fillRect(x - 15, cardY - 20, 30, 40);
            this.ctx.strokeRect(x - 15, cardY - 20, 30, 40);

            if (this.cardsRevealed) {
                this.ctx.fillStyle = '#000';
                this.ctx.font = 'bold 16px Inter';
                this.ctx.fillText(player.card, x, cardY + 5);
            } else {
                this.ctx.fillStyle = '#000';
                this.ctx.font = 'bold 16px Inter';
                this.ctx.fillText('?', x, cardY + 5);
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
        // Dotted line removed per user request
    }

    // drawControlsHint() {
    //     this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    //     this.ctx.font = '12px Arial';
    //     this.ctx.textAlign = 'left';
    //     this.ctx.fillText('Move: WASD/Arrow Keys or Click', 10, 20);
    //     this.ctx.fillText('Quick Select: Number Keys 1-8', 10, 35);
    // }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    new ScrumPokerGame();
});