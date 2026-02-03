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

        // Auth state
        this.isAuthenticated = false;
        this.userProfile = null;
        this.isRegisteredUser = false;
        this.nameCheckTimeout = null;
        this.isNameAvailable = false;
        this.displayNameCheckEnabled = false; // Remote config flag

        // Leaderboard state
        this.leaderboardCache = null;
        this.leaderboardCacheTime = 0;
        this.LEADERBOARD_CACHE_TTL = 60000; // 1 minute cache

        // Timeout tracking for cleanup
        this.activeTimeouts = [];

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
        this.setupAuthEventListeners();
        this.setupCanvasEvents();
        this.setupKeyboardControls();
        this.checkURLParameters();
        this.startGameLoop();
        this.initializeAuth();
    }

    async initializeAuth() {
        // Listen for auth state changes
        authService.onAuthStateChange((user, profile) => {
            console.log('Game received auth state change:', {
                hasUser: !!user,
                uid: user?.uid,
                isAnonymous: user?.isAnonymous,
                email: user?.email,
                hasProfile: !!profile,
                profileName: profile?.displayName
            });
            this.isAuthenticated = !!user;
            this.userProfile = profile;
            // Use Auth state as source of truth
            this.isRegisteredUser = user && !user.isAnonymous;
            this.updateUIForAuthState();
        });

        // Wait a moment for Firebase to initialize
        this.setTrackedTimeout(async () => {
            // Wait for email link processing to complete if in progress
            while (authService.isProcessingEmailLink) {
                console.log('Waiting for email link processing to complete...');
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log('After email processing wait, state:', {
                hasCurrentUser: !!authService.currentUser,
                isProcessingEmailLink: authService.isProcessingEmailLink,
                uid: authService.currentUser?.uid,
                isAnonymous: authService.currentUser?.isAnonymous
            });

            // Only sign in anonymously if:
            // 1. No user is currently signed in
            // 2. We're not in the middle of processing an email sign-in link
            if (!authService.currentUser && !authService.isProcessingEmailLink) {
                console.log('No user found, signing in anonymously...');
                try {
                    await authService.signInAnonymously();
                } catch (error) {
                    console.error('Anonymous sign-in failed:', error);
                }
            } else {
                console.log('Skipping anonymous sign-in, user exists or email processing');
            }

            // Initialize socket for name checking (with fresh token)
            await this.initializeNameCheckSocket();
            this.hideLoadingScreen();

            // Auto-join room if URL has room param and user has a profile
            this.attemptAutoJoin();

        }, 1500);

        // Add window focus listener to sync auth state across tabs
        window.addEventListener('focus', async () => {
            if (authService.currentUser) {
                await authService.currentUser.reload();
                const token = await authService.getIdToken(true); // force refresh
                if (token) {
                    await authService.loadUserProfile();
                    this.userProfile = authService.userProfile;
                    // Update isRegisteredUser based on current auth user
                    this.isRegisteredUser = !authService.currentUser.isAnonymous;
                    this.updateUIForAuthState();
                }
            }
        });
    }

    attemptAutoJoin() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');

        // Only auto-join if:
        // 1. There's a room code in URL
        // 2. User has a profile with displayName
        if (roomCode && this.userProfile?.displayName) {
            console.log('Auto-joining room:', roomCode);
            this.connectAndJoinRoom(this.userProfile.displayName, roomCode.toUpperCase());
        }
    }

    async initializeNameCheckSocket() {
        // Create a temporary socket connection for name checking
        // Only try to get a token if user is authenticated
        let token = null;
        if (authService.currentUser) {
            try {
                token = await authService.getIdToken(true);
            } catch (error) {
                console.warn('Failed to get token for name check socket:', error);
            }
        }

        return new Promise((resolve) => {
            this.nameCheckSocket = io({
                auth: { token }
            });

            this.nameCheckSocket.on('connect', () => {
                console.log('Name check socket connected');
                // Fetch client config (including displayNameCheckEnabled flag)
                this.nameCheckSocket.emit('getClientConfig', (config) => {
                    this.displayNameCheckEnabled = config?.displayNameCheckEnabled ?? false;
                    console.log('Client config loaded, displayNameCheckEnabled:', this.displayNameCheckEnabled);
                    resolve();
                });
            });

            this.nameCheckSocket.on('connect_error', async (error) => {
                console.warn('Name check socket connection error:', error.message);
                // If connection failed due to auth, try reconnecting with fresh token
                if (authService.currentUser && error.message.includes('auth')) {
                    const freshToken = await authService.getIdToken(true);
                    this.nameCheckSocket.auth = { token: freshToken };
                    this.nameCheckSocket.connect();
                } else {
                    // Resolve anyway so we don't block forever
                    resolve();
                }
            });

            // Timeout fallback in case connection hangs
            setTimeout(() => resolve(), 5000);
        });
    }

    checkDisplayNameAvailability(displayName, callback) {
        if (!this.nameCheckSocket || !this.nameCheckSocket.connected) {
            console.error('Name check socket not connected');
            callback(false);
            return;
        }

        this.nameCheckSocket.emit('checkDisplayName', displayName, (result) => {
            callback(result.available);
        });
    }

    hideLoadingScreen() {
        document.getElementById('loadingScreen').classList.remove('active');
        document.getElementById('loginScreen').classList.add('active');

        // Load leaderboard on landing page
        this.loadLandingLeaderboard();
    }

    updateUIForAuthState() {
        // Ensure registration status is up to date from Auth source of truth
        if (authService.currentUser) {
            this.isRegisteredUser = !authService.currentUser.isAnonymous;
        }

        const welcomeSection = document.getElementById('welcomeBackSection');
        const nameInputSection = document.getElementById('nameInputSection');
        const signUpPrompt = document.getElementById('signUpPrompt');

        // userPointsDisplay removed
        const menuSignUpBtn = document.getElementById('menuSignUpBtn');

        const logoutBtn = document.getElementById('logoutBtn');
        const editAvatarSection = document.getElementById('editAvatarSection');
        const editAvatarLocked = document.getElementById('editAvatarLocked');

        if (this.userProfile && this.userProfile.displayName) {
            // User has a profile - show welcome back
            if (welcomeSection) welcomeSection.classList.remove('hidden');
            if (nameInputSection) nameInputSection.classList.add('hidden');

            const welcomeAvatar = document.getElementById('welcomeAvatar');
            const welcomeName = document.getElementById('welcomeName');
            const welcomePoints = document.getElementById('welcomePoints');
            if (welcomeAvatar) welcomeAvatar.textContent = this.getAvatarEmoji(this.userProfile.avatar);
            if (welcomeName) welcomeName.textContent = this.userProfile.displayName;
            if (welcomePoints) welcomePoints.textContent = this.userProfile.points || 0;

            // Update profile display
            this.updateProfileDisplay();

            // TEMPORARILY DISABLED: Email sign-in - hide all sign-up prompts
            if (signUpPrompt) signUpPrompt.classList.add('hidden');
            if (menuSignUpBtn) menuSignUpBtn.classList.add('hidden');

            // Show logout button for all users with a profile
            if (logoutBtn) logoutBtn.classList.remove('hidden');

            // Avatar selection enabled for all users
            if (editAvatarSection) editAvatarSection.classList.remove('hidden');
            if (editAvatarLocked) editAvatarLocked.classList.add('hidden');
            // Pre-select current avatar for edit profile modal
            this.selectedAvatar = this.userProfile.avatar;
            this.highlightSelectedAvatar();
        } else {
            // New user - show name input
            if (welcomeSection) welcomeSection.classList.add('hidden');
            if (nameInputSection) nameInputSection.classList.remove('hidden');

            const landingSignInBtn = document.getElementById('landingSignInBtn');
            const authStatusDiv = document.getElementById('authStatusMsg') || document.createElement('div');

            if (this.isRegisteredUser) {
                // Authenticated but no profile
                if (logoutBtn) logoutBtn.classList.remove('hidden');
                if (landingSignInBtn) landingSignInBtn.classList.add('hidden');
                if (signUpPrompt) signUpPrompt.classList.add('hidden');
                if (menuSignUpBtn) menuSignUpBtn.classList.add('hidden');

                // Show email
                authStatusDiv.id = 'authStatusMsg';
                authStatusDiv.className = 'auth-status-msg';
                authStatusDiv.style.marginBottom = '10px';
                authStatusDiv.style.color = '#2ecc71';
                authStatusDiv.textContent = `✓ Signed in as ${authService.currentUser.email}`;

                // Insert before name input if not already there
                if (!document.getElementById('authStatusMsg') && nameInputSection) {
                    nameInputSection.insertBefore(authStatusDiv, nameInputSection.firstChild);
                }
                authStatusDiv.classList.remove('hidden');

                // === AUTO CREATE PROFILE LOGIC ===
                // Avoid infinite loop if creation fails or takes time
                if (!this.isCreatingProfile) {
                    this.isCreatingProfile = true;
                    // Show a loading text or spinner in the auth status instead of just email
                    authStatusDiv.textContent = `Creating profile for ${authService.currentUser.email}...`;
                    this.autoCreateProfile();
                }

                if (editAvatarSection) editAvatarSection.classList.remove('hidden');
                if (editAvatarLocked) editAvatarLocked.classList.add('hidden');

            } else {
                // Anonymous - TEMPORARILY DISABLED: Email sign-in
                // Show logout button for anonymous users too (allows them to start fresh)
                if (logoutBtn) logoutBtn.classList.remove('hidden');
                // Hide sign-in buttons since email sign-in is temporarily disabled
                if (landingSignInBtn) landingSignInBtn.classList.add('hidden');
                if (signUpPrompt) signUpPrompt.classList.add('hidden');
                if (menuSignUpBtn) menuSignUpBtn.classList.add('hidden');

                if (document.getElementById('authStatusMsg')) {
                    document.getElementById('authStatusMsg').classList.add('hidden');
                }

                // Avatar selection enabled for all users
                if (editAvatarSection) editAvatarSection.classList.remove('hidden');
                if (editAvatarLocked) editAvatarLocked.classList.add('hidden');
            }
        }

        // Update profile display (handles points and guest state)
        this.updateProfileDisplay();
    }

    async autoCreateProfile() {
        if (!this.isRegisteredUser || !authService.currentUser.email) return;

        try {
            // Generate a default name from email
            const emailPart = authService.currentUser.email.split('@')[0];
            // Take up to 15 chars to be safe with limits
            let baseName = emailPart.substring(0, 15);
            // Capitalize first letter
            baseName = baseName.charAt(0).toUpperCase() + baseName.slice(1);

            // Try to create profile with this name
            // If it fails due to duplication, we might need a retry strategy
            // For now, let's try appending a random number if the first attempt fails

            try {
                await authService.createUserProfile(baseName);
            } catch (error) {
                console.log('Name taken, retrying with suffix...');
                const suffix = Math.floor(Math.random() * 1000);
                await authService.createUserProfile(`${baseName}${suffix}`);
            }

            // Reload user profile is handled by authService updates usually,
            // but let's force a reload to be sure
            await authService.loadUserProfile();
            this.userProfile = authService.userProfile;
            this.isCreatingProfile = false;
            this.updateUIForAuthState();

        } catch (error) {
            console.error('Auto-creation failed:', error);
            this.isCreatingProfile = false;
            document.getElementById('authStatusMsg').textContent = `✓ Signed in as ${authService.currentUser.email} (Profile creation failed)`;
        }
    }

    updateProfileDisplay() {
        const profileAvatar = document.getElementById('profileAvatar');
        const profileName = document.getElementById('profileName');
        const menuUserName = document.getElementById('menuUserName');
        const currentUserPoints = document.getElementById('currentUserPoints');

        if (this.userProfile) {
            profileAvatar.textContent = this.getAvatarEmoji(this.userProfile.avatar);
            profileName.textContent = this.userProfile.displayName || 'Guest';
            menuUserName.textContent = this.userProfile.displayName || 'Guest';
            if (currentUserPoints) currentUserPoints.textContent = `${this.userProfile.points || 0} pts`;
        } else {
            profileAvatar.textContent = '👤';
            profileName.textContent = 'Guest';
            menuUserName.textContent = 'Guest';
            if (currentUserPoints) currentUserPoints.textContent = '0 pts';
        }
    }

    getAvatarEmoji(avatarName) {
        const config = this.spriteConfig[avatarName];
        return config ? config.emoji : '👤';
    }

    highlightSelectedAvatar() {
        document.querySelectorAll('.avatar-option').forEach(a => a.classList.remove('selected'));
        if (this.selectedAvatar) {
            const selectedEl = document.querySelector(`.avatar-option[data-avatar="${this.selectedAvatar}"]`);
            if (selectedEl) selectedEl.classList.add('selected');
        }
    }

    setupAuthEventListeners() {
        // Name input validation (debounced) - using server-side check
        const nameInput = document.getElementById('playerName');
        const nameAvailability = document.getElementById('nameAvailability');

        nameInput.addEventListener('input', (e) => {
            const name = e.target.value.trim();
            clearTimeout(this.nameCheckTimeout);

            // If display name check is disabled, skip validation entirely
            if (!this.displayNameCheckEnabled) {
                nameAvailability.textContent = '';
                this.isNameAvailable = true;
                return;
            }

            if (name.length < 2) {
                nameAvailability.textContent = '';
                this.isNameAvailable = false;
                return;
            }

            nameAvailability.textContent = 'Checking...';
            nameAvailability.className = 'name-availability checking';

            this.nameCheckTimeout = setTimeout(async () => {
                // Use server-side check via socket for better security
                this.checkDisplayNameAvailability(name, (available) => {
                    this.isNameAvailable = available;
                    if (available) {
                        nameAvailability.textContent = '✓ Available';
                        nameAvailability.className = 'name-availability available';
                    } else {
                        nameAvailability.textContent = '✗ Name already taken';
                        nameAvailability.className = 'name-availability unavailable';
                    }
                });
            }, 500);
        });

        // Profile dropdown toggle
        document.getElementById('profileBtn').addEventListener('click', () => {
            document.getElementById('profileMenu').classList.toggle('hidden');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('userProfileDropdown');
            if (!dropdown.contains(e.target)) {
                document.getElementById('profileMenu').classList.add('hidden');
            }
        });

        // Sign up modal
        document.getElementById('showSignUpBtn')?.addEventListener('click', () => {
            document.getElementById('signUpModal').classList.remove('hidden');
        });

        document.getElementById('menuSignUpBtn')?.addEventListener('click', () => {
            document.getElementById('signUpModal').classList.remove('hidden');
            document.getElementById('profileMenu').classList.add('hidden');
        });

        document.getElementById('closeSignUpModal')?.addEventListener('click', () => {
            document.getElementById('signUpModal').classList.add('hidden');
        });

        // Landing Sign In Button
        document.getElementById('landingSignInBtn')?.addEventListener('click', () => {
            document.getElementById('signUpModal').classList.remove('hidden');
        });

        // Send OTP email
        document.getElementById('sendOTPBtn')?.addEventListener('click', async () => {
            const email = document.getElementById('signUpEmail').value.trim();
            if (!email || !email.includes('@')) {
                alert('Please enter a valid email address');
                return;
            }

            try {
                await authService.sendOTPEmail(email);
                document.getElementById('signUpStep1').classList.add('hidden');
                document.getElementById('signUpStep2').classList.remove('hidden');
                document.getElementById('sentEmailDisplay').textContent = email;
            } catch (error) {
                alert('Failed to send email: ' + error.message);
            }
        });

        // Edit profile modal
        document.getElementById('editProfileBtn')?.addEventListener('click', () => {
            document.getElementById('editProfileModal').classList.remove('hidden');
            document.getElementById('profileMenu').classList.add('hidden');
            if (this.userProfile) {
                document.getElementById('editDisplayName').value = this.userProfile.displayName || '';
            }
        });

        document.getElementById('closeEditProfileModal')?.addEventListener('click', () => {
            document.getElementById('editProfileModal').classList.add('hidden');
        });

        // Save profile changes
        document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
            const newName = document.getElementById('editDisplayName').value.trim();
            if (newName && newName !== this.userProfile?.displayName) {
                try {
                    await this.updateDisplayNameViaSocket(newName);
                    this.userProfile.displayName = newName;
                    this.updateUIForAuthState();
                } catch (error) {
                    alert('Failed to update name: ' + error.message);
                    return;
                }
            }

            // Update avatar (available to all users)
            if (this.selectedAvatar && this.selectedAvatar !== this.userProfile?.avatar) {
                try {
                    await this.updateAvatarViaSocket(this.selectedAvatar);
                    this.userProfile.avatar = this.selectedAvatar;
                    this.updateUIForAuthState();
                } catch (error) {
                    alert('Failed to update avatar: ' + error.message);
                }
            }

            document.getElementById('editProfileModal').classList.add('hidden');
        });

        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', async () => {
            try {
                await authService.signOut();
                location.reload();
            } catch (error) {
                console.error('Logout failed:', error);
            }
        });

        // Change name button (for returning users)
        document.getElementById('changeNameBtn')?.addEventListener('click', () => {
            document.getElementById('editProfileModal').classList.remove('hidden');
            if (this.userProfile) {
                document.getElementById('editDisplayName').value = this.userProfile.displayName || '';
            }
        });

        // Leaderboard modal
        document.getElementById('showLeaderboardBtn')?.addEventListener('click', () => {
            this.showLeaderboardModal();
        });

        document.getElementById('closeLeaderboardModal')?.addEventListener('click', () => {
            document.getElementById('leaderboardModal').classList.add('hidden');
        });
    }

    /**
     * Fetch leaderboard data from server via socket
     */
    async fetchLeaderboard(forceRefresh = false) {
        const now = Date.now();

        // Return cached data if fresh
        if (!forceRefresh && this.leaderboardCache &&
            (now - this.leaderboardCacheTime) < this.LEADERBOARD_CACHE_TTL) {
            return this.leaderboardCache;
        }

        return new Promise((resolve) => {
            const socketToUse = this.socket?.connected ? this.socket : this.nameCheckSocket;

            if (!socketToUse || !socketToUse.connected) {
                resolve(null);
                return;
            }

            socketToUse.emit('getLeaderboard', (result) => {
                if (result && result.season) {
                    this.leaderboardCache = result;
                    this.leaderboardCacheTime = Date.now();
                }
                resolve(result);
            });
        });
    }

    /**
     * Format date range for display
     */
    formatSeasonDates(startDateStr, endDateStr) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);

        const options = { month: 'short', day: 'numeric' };
        const startFormatted = start.toLocaleDateString('en-US', options);
        const endFormatted = end.toLocaleDateString('en-US', options);
        const year = end.getFullYear();

        return `${startFormatted} - ${endFormatted}, ${year}`;
    }

    /**
     * Render leaderboard entries to a container
     */
    renderLeaderboard(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!data || !data.leaderboard || data.leaderboard.length === 0) {
            container.innerHTML = '<div class="leaderboard-empty">No players yet. Be the first to earn points!</div>';
            return;
        }

        const currentUid = this.userProfile?.uid || authService?.currentUser?.uid;

        container.innerHTML = data.leaderboard.map((entry, index) => {
            const rank = index + 1;
            const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
            const isMe = entry.uid === currentUid;
            const avatarEmoji = this.getAvatarEmoji(entry.avatar);

            return `
                <div class="leaderboard-entry${isMe ? ' is-me' : ''}">
                    <span class="leaderboard-rank ${rankClass}">${rank}</span>
                    <span class="leaderboard-avatar">${avatarEmoji}</span>
                    <span class="leaderboard-name">${this.escapeHtml(entry.displayName)}</span>
                    <span class="leaderboard-points">${entry.points} pts</span>
                </div>
            `;
        }).join('');
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Load leaderboard on landing page
     */
    async loadLandingLeaderboard() {
        const data = await this.fetchLeaderboard();

        // Update season info
        if (data && data.season) {
            const seasonNumEl = document.getElementById('currentSeasonNum');
            const seasonDatesEl = document.getElementById('seasonDates');

            if (seasonNumEl) seasonNumEl.textContent = data.season.seasonNumber;
            if (seasonDatesEl) seasonDatesEl.textContent = this.formatSeasonDates(data.season.startDate, data.season.endDate);
        }

        this.renderLeaderboard('landingLeaderboard', data);
    }

    /**
     * Show leaderboard modal (from game page)
     */
    async showLeaderboardModal() {
        document.getElementById('leaderboardModal').classList.remove('hidden');
        document.getElementById('profileMenu').classList.add('hidden');

        // Show loading state
        document.getElementById('gameLeaderboard').innerHTML = '<div class="leaderboard-loading">Loading...</div>';

        const data = await this.fetchLeaderboard(true); // Force refresh

        // Update modal season info
        if (data && data.season) {
            const modalSeasonNumEl = document.getElementById('modalSeasonNum');
            const modalSeasonDatesEl = document.getElementById('modalSeasonDates');

            if (modalSeasonNumEl) modalSeasonNumEl.textContent = data.season.seasonNumber;
            if (modalSeasonDatesEl) modalSeasonDatesEl.textContent = this.formatSeasonDates(data.season.startDate, data.season.endDate);
        }

        this.renderLeaderboard('gameLeaderboard', data);
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
        document.getElementById('createRoomBtn').addEventListener('click', async () => {
            await this.handleCreateOrJoinRoom(false);
        });

        document.getElementById('joinRoomBtn').addEventListener('click', async () => {
            await this.handleCreateOrJoinRoom(true);
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

    async handleCreateOrJoinRoom(isJoining) {
        let name = this.userProfile?.displayName;
        const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();

        // If no profile, need to create one first
        if (!this.userProfile || !this.userProfile.displayName) {
            name = document.getElementById('playerName').value.trim();
            if (!name) {
                alert('Please enter your name');
                return;
            }
            // Only check name availability if the feature is enabled
            if (this.displayNameCheckEnabled && !this.isNameAvailable) {
                alert('Please choose an available display name');
                return;
            }

            // Create profile via server for security
            try {
                await this.createProfileViaSocket(name);
            } catch (error) {
                alert('Failed to create profile: ' + error.message);
                return;
            }
        }

        if (isJoining && !roomCode) {
            alert('Please enter a room code');
            return;
        }

        if (isJoining) {
            this.connectAndJoinRoom(name, roomCode);
        } else {
            this.connectAndCreateRoom(name);
        }
    }

    createProfileViaSocket(displayName) {
        return new Promise((resolve, reject) => {
            if (!this.nameCheckSocket || !this.nameCheckSocket.connected) {
                reject(new Error('Not connected to server'));
                return;
            }

            this.nameCheckSocket.emit('createProfile', { displayName }, (result) => {
                if (result.success) {
                    // Reload profile from authService
                    authService.loadUserProfile().then(() => {
                        this.userProfile = authService.userProfile;
                        resolve();
                    }).catch(reject);
                } else {
                    reject(new Error(result.error || 'Failed to create profile'));
                }
            });
        });
    }

    updateDisplayNameViaSocket(newDisplayName) {
        return new Promise((resolve, reject) => {
            // Use the game socket if connected, otherwise use nameCheckSocket
            const socketToUse = this.socket?.connected ? this.socket : this.nameCheckSocket;

            if (!socketToUse || !socketToUse.connected) {
                reject(new Error('Not connected to server'));
                return;
            }

            socketToUse.emit('updateDisplayName', newDisplayName, (result) => {
                if (result.success) {
                    // Update local profile
                    if (authService.userProfile) {
                        authService.userProfile.displayName = newDisplayName;
                    }
                    resolve();
                } else {
                    reject(new Error(result.error || 'Failed to update display name'));
                }
            });
        });
    }

    updateAvatarViaSocket(newAvatar) {
        return new Promise((resolve, reject) => {
            // Use the game socket if connected, otherwise use nameCheckSocket
            const socketToUse = this.socket?.connected ? this.socket : this.nameCheckSocket;

            if (!socketToUse || !socketToUse.connected) {
                reject(new Error('Not connected to server'));
                return;
            }

            socketToUse.emit('updateAvatar', newAvatar, (result) => {
                if (result.success) {
                    // Update local profile
                    if (authService.userProfile) {
                        authService.userProfile.avatar = newAvatar;
                    }
                    resolve();
                } else {
                    reject(new Error(result.error || 'Failed to update avatar'));
                }
            });
        });
    }

    async connectAndCreateRoom(playerName) {
        console.log('Creating room for player:', playerName, 'with avatar:', this.userProfile?.avatar || this.selectedAvatar);

        // Get auth token (force refresh to avoid expired token)
        const token = await authService.getIdToken(true);

        this.socket = io({
            auth: { token }
        });
        this.setupSocketListeners();

        this.socket.on('connect', () => {
            console.log('Connected, creating room...');
            this.socket.emit('createRoom', {
                playerName,
                avatar: this.userProfile?.avatar || this.selectedAvatar
            });
        });
    }

    async connectAndJoinRoom(playerName, roomCode) {
        console.log('Joining room:', roomCode, 'for player:', playerName, 'with avatar:', this.userProfile?.avatar || this.selectedAvatar);

        // Get auth token (force refresh to avoid expired token)
        const token = await authService.getIdToken(true);

        this.socket = io({
            auth: { token }
        });
        this.setupSocketListeners();

        this.socket.on('connect', () => {
            console.log('Connected, joining room...');
            this.socket.emit('joinRoom', {
                roomId: roomCode,
                playerName,
                avatar: this.userProfile?.avatar || this.selectedAvatar
            });
        });
    }

    setupSocketListeners() {
        this.socket.on('roomJoined', ({ roomId, playerId, userProfile, needsNewDisplayName }) => {
            console.log('Successfully joined room:', roomId);
            this.roomId = roomId;
            this.myId = playerId;
            if (userProfile) {
                this.userProfile = userProfile;
                this.updateUIForAuthState();
            }

            // Handle archived user that needs a new display name
            if (needsNewDisplayName) {
                console.log('User needs to choose a new display name (old name was taken)');
                alert('Welcome back! Your previous display name was taken while you were away. Please choose a new name.');
                document.getElementById('editProfileModal').classList.remove('hidden');
                document.getElementById('editDisplayName').value = '';
                document.getElementById('editDisplayName').placeholder = 'Choose a new display name';
            }

            document.getElementById('roomId').textContent = roomId;
            this.showGameScreen();

            // Initial check for game master status (though usually handled by roomState)
            const myPlayer = this.players.get(this.myId);
            this.updateHostControls(myPlayer?.isGameMaster);
        });

        // Points awarded event
        this.socket.on('pointsAwarded', (pointsData) => {
            const myPoints = pointsData.find(p => p.playerId === this.myId);
            if (myPoints && myPoints.points > 0) {
                this.showPointsNotification(myPoints.points);
                // Update local points
                if (this.userProfile) {
                    this.userProfile.points = (this.userProfile.points || 0) + myPoints.points;
                    this.updateProfileDisplay();
                    document.getElementById('currentUserPoints').textContent = this.userProfile.points;
                }
            }
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
            this.clearAllTimeouts(); // Clean up all active timeouts
            if (reason === 'io server disconnect') {
                alert('You were disconnected from the server.');
                location.reload();
            }
        });
    }

    showGameScreen() {
        document.getElementById('loadingScreen').classList.remove('active');
        document.getElementById('loginScreen').classList.remove('active');
        document.getElementById('gameScreen').classList.add('active');
        this.updatePlayerList();
        this.updateProfileDisplay();
    }

    showPointsNotification(points) {
        const notification = document.getElementById('pointsNotification');
        document.getElementById('pointsEarnedValue').textContent = points;
        notification.classList.remove('hidden');

        // Hide after 3 seconds
        this.setTrackedTimeout(() => {
            notification.classList.add('hidden');
        }, 3000);
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

        // Check if current user is the host
        const myPlayer = this.players.get(this.myId);
        const isHost = myPlayer?.isGameMaster;

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

            // Show "Make Host" button if I'm the host and this is not me
            let makeHostBtn = '';
            if (isHost && player.id !== this.myId) {
                makeHostBtn = `<button class="make-host-btn" data-player-id="${player.id}" title="Make ${player.name} the host">👑</button>`;
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
                <div class="player-actions">
                    ${makeHostBtn}
                </div>
                <div class="player-card-container">
                    ${cardStatus}
                </div>
            `;

            playerListElement.appendChild(playerItem);
            this.drawAvatarIcon(player.avatar, avatarId);
        });

        // Add click handlers for make host buttons
        playerListElement.querySelectorAll('.make-host-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playerId = btn.dataset.playerId;
                const player = this.players.get(playerId);
                if (player && confirm(`Make ${player.name} the host?`)) {
                    this.socket.emit('transferHost', playerId);
                }
            });
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
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '✅ Copied!';
                btn.classList.add('success');

                this.setTrackedTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('success');
                }, 2000);
            }
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
        this.setTrackedTimeout(() => {
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
        this.ctx.fillStyle = 'black';
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 3;
        this.ctx.font = "bold 14px 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
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
                this.ctx.font = "bold 16px 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
                this.ctx.fillText(player.card, x, cardY + 5);
            } else {
                this.ctx.fillStyle = '#000';
                this.ctx.font = "bold 16px 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
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

    // Helper method to track timeouts and prevent memory leaks
    setTrackedTimeout(callback, delay) {
        const timeoutId = setTimeout(() => {
            callback();
            // Remove from active timeouts after execution
            const index = this.activeTimeouts.indexOf(timeoutId);
            if (index > -1) {
                this.activeTimeouts.splice(index, 1);
            }
        }, delay);
        this.activeTimeouts.push(timeoutId);
        return timeoutId;
    }

    // Cleanup method to clear all active timeouts
    clearAllTimeouts() {
        this.activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.activeTimeouts = [];
        if (this.nameCheckTimeout) {
            clearTimeout(this.nameCheckTimeout);
            this.nameCheckTimeout = null;
        }
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