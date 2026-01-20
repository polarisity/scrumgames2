import { Socket } from 'socket.io';
import { firebaseAuth } from '../services/firebaseAdmin';
import { userService, UserProfile } from '../services/UserService';

export interface AuthenticatedSocket extends Socket {
    firebaseUid?: string;
    userProfile?: UserProfile | null;
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
            console.log('User profile loaded:', socket.userProfile.displayName);
        } else {
            console.log('No user profile found for:', decodedToken.uid);
        }

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
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
