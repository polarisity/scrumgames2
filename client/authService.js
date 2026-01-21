/**
 * Authentication Service for Scrum Poker
 * Handles Firebase Authentication including anonymous login, email OTP, and session management
 */
class AuthService {
    constructor() {
        this.currentUser = null;
        this.userProfile = null;
        this.authStateListeners = [];
        this.TOKEN_COOKIE_NAME = 'scrumpoker_token';
        this.isProcessingEmailLink = false;
        // Clear any stale token cookies immediately on construction
        this.clearTokenCookie();
        this.init();
    }

    async init() {
        // Listen for auth state changes
        auth.onAuthStateChanged(async (user) => {
            this.currentUser = user;
            if (user) {
                console.log('Auth state changed: User signed in', {
                    uid: user.uid,
                    email: user.email,
                    isAnonymous: user.isAnonymous
                });
                await this.saveTokenToCookie();
                await this.loadUserProfile();
            } else {
                console.log('Auth state changed: User signed out');
                this.userProfile = null;
                this.clearTokenCookie();
            }
            this.notifyListeners();
        });

        // Try to restore session from cookie
        await this.restoreSession();
    }

    /**
     * Register a listener for auth state changes
     */
    onAuthStateChange(callback) {
        this.authStateListeners.push(callback);
        // Immediately call with current state
        callback(this.currentUser, this.userProfile);
        return () => {
            this.authStateListeners = this.authStateListeners.filter(cb => cb !== callback);
        };
    }

    notifyListeners() {
        this.authStateListeners.forEach(callback => {
            callback(this.currentUser, this.userProfile);
        });
    }

    /**
     * Sign in anonymously - called on first visit
     */
    async signInAnonymously() {
        console.log('signInAnonymously called, current state:', {
            hasCurrentUser: !!this.currentUser,
            isProcessingEmailLink: this.isProcessingEmailLink
        });
        try {
            const result = await auth.signInAnonymously();
            console.log('Anonymous sign-in successful:', result.user.uid);
            return result.user;
        } catch (error) {
            console.error('Anonymous sign-in failed:', error);
            throw error;
        }
    }

    /**
     * Send OTP email for sign-up/sign-in
     */
    async sendOTPEmail(email) {
        const actionCodeSettings = {
            url: window.location.origin + '/signin-complete.html',
            handleCodeInApp: true,
        };

        try {
            await auth.sendSignInLinkToEmail(email, actionCodeSettings);
            // Save email locally for verification
            localStorage.setItem('emailForSignIn', email);
            console.log('OTP email sent to:', email);
            return true;
        } catch (error) {
            console.error('Failed to send OTP email:', error);

            // Provide helpful error message for unauthorized domain
            if (error.code === 'auth/unauthorized-continue-uri') {
                const domain = new URL(window.location.origin).hostname;
                const helpfulError = new Error(
                    `Domain not whitelisted: ${domain}\n\n` +
                    `To fix this:\n` +
                    `1. Go to Firebase Console: https://console.firebase.google.com/project/scrumptious-73bc9/authentication/settings\n` +
                    `2. Scroll to "Authorized domains"\n` +
                    `3. Click "Add domain"\n` +
                    `4. Add: ${domain}\n` +
                    `5. Try sending the email again`
                );
                helpfulError.code = error.code;
                throw helpfulError;
            }

            throw error;
        }
    }

    /**
     * Complete email sign-in with OTP link
     */
    async completeEmailSignIn(url = window.location.href) {
        console.log('completeEmailSignIn called, checking if URL is sign-in link...');
        if (!auth.isSignInWithEmailLink(url)) {
            console.log('URL is NOT a valid sign-in link');
            return null;
        }
        console.log('URL IS a valid sign-in link');

        let email = localStorage.getItem('emailForSignIn');
        console.log('Email from localStorage:', email);
        if (!email) {
            // Prompt user to enter email if not found
            email = window.prompt('Please provide your email for confirmation');
        }

        if (!email) {
            throw new Error('Email is required to complete sign-in');
        }

        console.log('Current user state before sign-in:', {
            hasCurrentUser: !!this.currentUser,
            isAnonymous: this.currentUser?.isAnonymous,
            uid: this.currentUser?.uid
        });

        try {
            // If user is anonymous, try to link the accounts
            if (this.currentUser && this.currentUser.isAnonymous) {
                console.log('Attempting to link anonymous account to email...');
                try {
                    const credential = firebase.auth.EmailAuthProvider.credentialWithLink(email, url);
                    const result = await this.currentUser.linkWithCredential(credential);
                    console.log('Anonymous account linked to email:', result.user.email, 'UID:', result.user.uid);
                    localStorage.removeItem('emailForSignIn');

                    // Update user profile to mark as registered
                    await this.updateUserRegistration(email);
                    return result.user;
                } catch (linkError) {
                    // If email is already in use, sign in directly instead of linking
                    // This happens when user signs in from a different browser/device
                    if (linkError.code === 'auth/email-already-in-use' ||
                        linkError.code === 'auth/credential-already-in-use') {
                        console.log('Email already linked to another account, signing in directly...');
                        const result = await auth.signInWithEmailLink(email, url);
                        console.log('Direct email sign-in successful:', result.user.email, 'UID:', result.user.uid);
                        localStorage.removeItem('emailForSignIn');
                        return result.user;
                    }
                    throw linkError;
                }
            } else {
                // Regular email sign-in (returning user or no anonymous session)
                console.log('Performing regular email sign-in (not linking)...');
                const result = await auth.signInWithEmailLink(email, url);
                console.log('Email sign-in successful:', result.user.email, 'UID:', result.user.uid);
                localStorage.removeItem('emailForSignIn');
                return result.user;
            }
        } catch (error) {
            console.error('Failed to complete email sign-in:', error);
            throw error;
        }
    }

    /**
     * Sign out the current user
     */
    async signOut() {
        try {
            await auth.signOut();
            this.clearTokenCookie();
            console.log('User signed out');
        } catch (error) {
            console.error('Sign out failed:', error);
            throw error;
        }
    }

    /**
     * Get the current Firebase ID token
     */
    async getIdToken(forceRefresh = false) {
        if (!this.currentUser) {
            return null;
        }
        try {
            return await this.currentUser.getIdToken(forceRefresh);
        } catch (error) {
            console.error('Failed to get ID token:', error);
            return null;
        }
    }

    /**
     * Save token to cookie for session persistence
     * Note: Firebase SDK handles session persistence via IndexedDB automatically.
     * This cookie is no longer used but kept for backwards compatibility cleanup.
     */
    async saveTokenToCookie() {
        // Intentionally not saving token to cookie anymore.
        // Firebase ID tokens expire after 1 hour and storing them in cookies
        // causes issues when the page reloads after the token has expired.
        // Firebase SDK handles session persistence automatically via IndexedDB.
        this.clearTokenCookie(); // Clean up any existing stale cookies
    }

    /**
     * Clear the token cookie
     */
    clearTokenCookie() {
        document.cookie = `${this.TOKEN_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    }

    /**
     * Restore session from cookie
     */
    async restoreSession() {
        // Firebase Auth automatically restores session from IndexedDB
        // This method is for additional custom restoration if needed
        const urlParams = new URLSearchParams(window.location.search);
        const hasEmailLoginParam = urlParams.get('emailLogin') === 'true';
        const isFirebaseEmailLink = auth.isSignInWithEmailLink(window.location.href);

        console.log('restoreSession check:', {
            hasEmailLoginParam,
            isFirebaseEmailLink,
            fullUrl: window.location.href
        });

        if (hasEmailLoginParam || isFirebaseEmailLink) {
            // Set flag to prevent anonymous sign-in during email link processing
            this.isProcessingEmailLink = true;
            console.log('Detected email login link, processing...');

            // Wait for initial auth state to be resolved so we can link if needed
            if (!this.currentUser) {
                console.log('Waiting for auth state to initialize before completing login...');
                await new Promise(resolve => {
                    const unsubscribe = auth.onAuthStateChanged((user) => {
                        console.log('Auth state initialized with user:', user?.uid, 'isAnonymous:', user?.isAnonymous);
                        unsubscribe();
                        resolve(user);
                    });
                });
            } else {
                console.log('Already have currentUser:', this.currentUser.uid, 'isAnonymous:', this.currentUser.isAnonymous);
            }

            try {
                const user = await this.completeEmailSignIn();
                // Clean up URL
                window.history.replaceState({}, document.title, window.location.pathname);

                // Explicitly reload profile and notify listeners since linking an anonymous
                // account doesn't always trigger onAuthStateChanged
                if (user) {
                    console.log('Email sign-in completed successfully, user:', user.uid);
                    // Force refresh the token to ensure it's valid for socket connections
                    await this.getIdToken(true);
                    await this.saveTokenToCookie();
                    await this.loadUserProfile();
                    console.log('Profile loaded after email sign-in:', this.userProfile);
                    this.notifyListeners();
                } else {
                    console.log('completeEmailSignIn returned null (URL was not a valid sign-in link)');
                }
            } catch (error) {
                console.error('Failed to complete email login:', error);
            } finally {
                this.isProcessingEmailLink = false;
            }
        }
    }

    /**
     * Load user profile from Firestore
     */
    async loadUserProfile() {
        if (!this.currentUser) {
            return null;
        }

        try {
            const doc = await db.collection('users').doc(this.currentUser.uid).get();
            if (doc.exists) {
                this.userProfile = doc.data();
                console.log('User profile loaded:', this.userProfile);
            } else {
                this.userProfile = null;
            }
            return this.userProfile;
        } catch (error) {
            console.error('Failed to load user profile:', error);
            return null;
        }
    }

    /**
     * Create a new user profile in Firestore
     */
    async createUserProfile(displayName) {
        if (!this.currentUser) {
            throw new Error('No user signed in');
        }

        // Check if display name is available
        const isAvailable = await this.isDisplayNameAvailable(displayName);
        if (!isAvailable) {
            throw new Error('Display name is already taken');
        }

        const defaultAvatars = ['cat', 'dog', 'rabbit', 'panda', 'fox', 'bear', 'koala', 'lion'];
        const defaultAvatar = defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)];

        const userProfile = {
            uid: this.currentUser.uid,
            displayName: displayName,
            avatar: defaultAvatar,
            points: 0,
            isRegistered: !this.currentUser.isAnonymous,
            email: this.currentUser.email || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        try {
            await db.collection('users').doc(this.currentUser.uid).set(userProfile);

            // Also add to displayNames collection for uniqueness checking
            await db.collection('displayNames').doc(displayName.toLowerCase()).set({
                uid: this.currentUser.uid,
                displayName: displayName,
            });

            this.userProfile = userProfile;
            console.log('User profile created:', userProfile);
            return userProfile;
        } catch (error) {
            console.error('Failed to create user profile:', error);
            throw error;
        }
    }

    /**
     * Check if a display name is available
     * @param {string} displayName - The display name to check
     * @param {string} [excludeUid] - Optional UID to exclude from the check (for updates)
     */
    async isDisplayNameAvailable(displayName, excludeUid = null) {
        try {
            const doc = await db.collection('displayNames').doc(displayName.toLowerCase()).get();
            console.log('Checking display name availability:', {
                displayName,
                excludeUid,
                docExists: doc.exists,
                docData: doc.exists ? doc.data() : null
            });
            if (!doc.exists) {
                return true;
            }
            // If excludeUid is provided and matches the owner, the name is available (it's their own name)
            if (excludeUid && doc.data().uid === excludeUid) {
                console.log('Name belongs to current user, allowing update');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to check display name availability:', error);
            return false;
        }
    }

    /**
     * Update user's display name
     */
    async updateDisplayName(newDisplayName) {
        if (!this.currentUser || !this.userProfile) {
            throw new Error('No user profile found');
        }

        // Check if new name is available (exclude current user's UID for updates)
        const isAvailable = await this.isDisplayNameAvailable(newDisplayName, this.currentUser.uid);
        if (!isAvailable) {
            throw new Error('Display name is already taken');
        }

        const oldDisplayName = this.userProfile.displayName;

        try {
            // Update user profile
            await db.collection('users').doc(this.currentUser.uid).update({
                displayName: newDisplayName,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            // Update displayNames collection
            await db.collection('displayNames').doc(oldDisplayName.toLowerCase()).delete();
            await db.collection('displayNames').doc(newDisplayName.toLowerCase()).set({
                uid: this.currentUser.uid,
                displayName: newDisplayName,
            });

            this.userProfile.displayName = newDisplayName;
            console.log('Display name updated:', newDisplayName);
            return true;
        } catch (error) {
            console.error('Failed to update display name:', error);
            throw error;
        }
    }

    /**
     * Update user's avatar (registered users only)
     */
    async updateAvatar(newAvatar) {
        if (!this.currentUser || !this.userProfile) {
            throw new Error('No user profile found');
        }

        if (!this.userProfile.isRegistered) {
            throw new Error('Avatar selection is only available for registered users');
        }

        try {
            await db.collection('users').doc(this.currentUser.uid).update({
                avatar: newAvatar,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            this.userProfile.avatar = newAvatar;
            console.log('Avatar updated:', newAvatar);
            return true;
        } catch (error) {
            console.error('Failed to update avatar:', error);
            throw error;
        }
    }

    /**
     * Update user to registered status after email verification
     */
    async updateUserRegistration(email) {
        if (!this.currentUser) {
            throw new Error('No user signed in');
        }

        try {
            // Check if user profile exists
            const doc = await db.collection('users').doc(this.currentUser.uid).get();

            if (doc.exists) {
                // Update existing profile
                await db.collection('users').doc(this.currentUser.uid).update({
                    isRegistered: true,
                    email: email,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });

                if (this.userProfile) {
                    this.userProfile.isRegistered = true;
                    this.userProfile.email = email;
                }
            }
            // If no profile exists, that's OK - the user will create one via the UI
            // The important thing is the Firebase Auth account is now linked to email

            console.log('User registration updated');
            return true;
        } catch (error) {
            console.error('Failed to update user registration:', error);
            throw error;
        }
    }

    /**
     * Get current user info for display
     */
    getUserInfo() {
        if (!this.currentUser) {
            return null;
        }

        return {
            uid: this.currentUser.uid,
            email: this.currentUser.email,
            isAnonymous: this.currentUser.isAnonymous,
            displayName: this.userProfile?.displayName || null,
            avatar: this.userProfile?.avatar || null,
            points: this.userProfile?.points || 0,
            isRegistered: this.userProfile?.isRegistered || false,
        };
    }

    /**
     * Check if user has a complete profile
     */
    hasProfile() {
        return this.userProfile && this.userProfile.displayName;
    }

    /**
     * Check if user is registered (not anonymous)
     */
    isRegistered() {
        return this.userProfile?.isRegistered || false;
    }
}

// Create singleton instance
const authService = new AuthService();
