import { Socket } from 'socket.io';
import { firebaseAuth } from '../services/firebaseAdmin';
import { userService, UserProfile } from '../services/UserService';

export interface AuthenticatedSocket extends Socket {
    firebaseUid?: string;
    userProfile?: UserProfile | null;
    needsNewDisplayName?: boolean;
}

/**
 * Middleware to verify Firebase ID token on socket connection
 */
export async function authMiddleware(socket: AuthenticatedSocket, next: (err?: Error) => void): Promise<void> {
    try {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;

        if (!token) {
            console.log('No token provided, allowing anonymous connection');
            // Allow connection but mark as unauthenticated
            socket.firebaseUid = undefined;
            socket.userProfile = null;
            return next();
        }

        // If Firebase Auth is not initialized, allow anonymous connection
        if (!firebaseAuth) {
            console.log('Firebase Auth not initialized, allowing connection without verification');
            socket.firebaseUid = undefined;
            socket.userProfile = null;
            return next();
        }

        // Verify the token
        const decodedToken = await firebaseAuth.verifyIdToken(token as string);
        socket.firebaseUid = decodedToken.uid;

        console.log('Token verified for user:', decodedToken.uid);

        // Load user profile from database
        socket.userProfile = await userService.getUser(decodedToken.uid);

        if (socket.userProfile) {
            // Check if user was archived and needs restoration
            if (socket.userProfile.archivedAt) {
                console.log('Restoring archived user:', decodedToken.uid);
                const { restored, needsNewName } = await userService.restoreArchivedUser(decodedToken.uid);

                if (restored) {
                    // Reload the profile after restoration
                    socket.userProfile = await userService.getUser(decodedToken.uid);
                    socket.needsNewDisplayName = needsNewName;

                    if (needsNewName) {
                        console.log('Restored user needs new display name:', decodedToken.uid);
                    }
                }
            } else {
                // Regular active user - update activity timestamp (fire and forget)
                userService.updateLastActive(decodedToken.uid);
            }

            console.log('User profile loaded:', socket.userProfile?.displayName || '(needs new name)');
        } else {
            console.log('No user profile found for:', decodedToken.uid);
        }

        next();
    } catch (error: any) {
        // Handle common auth errors (expired/invalid tokens) gracefully without cluttering logs
        const errorCode = error.code || error.errorInfo?.code;

        if (typeof errorCode === 'string' && errorCode.startsWith('auth/')) {
            console.log(`Auth token invalid/expired (${errorCode}), proceeding as guest.`);
        } else {
            console.error('Auth middleware error:', error);
        }

        // Allow connection but mark as unauthenticated
        socket.firebaseUid = undefined;
        socket.userProfile = null;
        next();
    }
}

/**
 * Verify display name availability
 * This can be called as a socket event
 */
export async function verifyDisplayName(displayName: string, excludeUid?: string): Promise<boolean> {
    return await userService.isDisplayNameAvailable(displayName, excludeUid);
}
