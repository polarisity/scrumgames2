import { firebaseDb, firebaseAdmin } from './firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export interface UserProfile {
    uid: string;
    email?: string;
    displayName: string;
    avatar: string;
    points: number;
    isRegistered: boolean;
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
}

export class UserService {
    private usersCollection = 'users';
    private displayNamesCollection = 'displayNames';

    /**
     * Check if Firebase is initialized
     */
    private isFirebaseInitialized(): boolean {
        return firebaseDb !== null;
    }

    /**
     * Get a user by Firebase UID
     */
    async getUser(uid: string): Promise<UserProfile | null> {
        if (!this.isFirebaseInitialized()) {
            return null;
        }
        try {
            const doc = await firebaseDb!.collection(this.usersCollection).doc(uid).get();
            if (doc.exists) {
                return doc.data() as UserProfile;
            }
            return null;
        } catch (error) {
            console.error('Failed to get user:', error);
            return null;
        }
    }

    /**
     * Create a new user profile
     */
    async createUser(uid: string, displayName: string, avatar: string = 'cat'): Promise<UserProfile> {
        if (!this.isFirebaseInitialized()) {
            throw new Error('Firebase not initialized');
        }
        const userProfile: UserProfile = {
            uid,
            displayName,
            avatar,
            points: 0,
            isRegistered: false,
            createdAt: FieldValue.serverTimestamp() as any,
            updatedAt: FieldValue.serverTimestamp() as any,
        };

        await firebaseDb!.collection(this.usersCollection).doc(uid).set(userProfile);

        // Also add to displayNames collection for uniqueness checking
        await firebaseDb!.collection(this.displayNamesCollection).doc(displayName.toLowerCase()).set({
            uid,
            displayName,
        });

        console.log(`Created user profile for ${uid}: ${displayName}`);
        return userProfile;
    }

    /**
     * Check if a display name is available
     */
    async isDisplayNameAvailable(displayName: string, excludeUid?: string): Promise<boolean> {
        if (!this.isFirebaseInitialized()) {
            return true; // Allow any name when Firebase is not configured
        }
        try {
            const doc = await firebaseDb!.collection(this.displayNamesCollection).doc(displayName.toLowerCase()).get();
            if (!doc.exists) {
                return true;
            }
            // If excludeUid is provided (for updates), allow if it's the same user
            if (excludeUid && doc.data()?.uid === excludeUid) {
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to check display name availability:', error);
            return false;
        }
    }

    /**
     * Update user's display name with uniqueness check
     */
    async updateDisplayName(uid: string, newDisplayName: string): Promise<boolean> {
        if (!this.isFirebaseInitialized()) {
            throw new Error('Firebase not initialized');
        }
        try {
            const isAvailable = await this.isDisplayNameAvailable(newDisplayName, uid);
            if (!isAvailable) {
                throw new Error('Display name is already taken');
            }

            const user = await this.getUser(uid);
            if (!user) {
                throw new Error('User not found');
            }

            const oldDisplayName = user.displayName;

            // Update in transaction
            await firebaseDb!.runTransaction(async (transaction) => {
                // Update user profile
                const userRef = firebaseDb!.collection(this.usersCollection).doc(uid);
                transaction.update(userRef, {
                    displayName: newDisplayName,
                    updatedAt: FieldValue.serverTimestamp(),
                });

                // Remove old display name
                const oldNameRef = firebaseDb!.collection(this.displayNamesCollection).doc(oldDisplayName.toLowerCase());
                transaction.delete(oldNameRef);

                // Add new display name
                const newNameRef = firebaseDb!.collection(this.displayNamesCollection).doc(newDisplayName.toLowerCase());
                transaction.set(newNameRef, {
                    uid,
                    displayName: newDisplayName,
                });
            });

            console.log(`Updated display name for ${uid}: ${oldDisplayName} -> ${newDisplayName}`);
            return true;
        } catch (error) {
            console.error('Failed to update display name:', error);
            throw error;
        }
    }

    /**
     * Update user's avatar (only for registered users)
     */
    async updateAvatar(uid: string, avatar: string): Promise<boolean> {
        if (!this.isFirebaseInitialized()) {
            throw new Error('Firebase not initialized');
        }
        try {
            const user = await this.getUser(uid);
            if (!user) {
                throw new Error('User not found');
            }

            if (!user.isRegistered) {
                throw new Error('Avatar selection is only available for registered users');
            }

            await firebaseDb!.collection(this.usersCollection).doc(uid).update({
                avatar,
                updatedAt: FieldValue.serverTimestamp(),
            });

            console.log(`Updated avatar for ${uid}: ${avatar}`);
            return true;
        } catch (error) {
            console.error('Failed to update avatar:', error);
            throw error;
        }
    }

    /**
     * Add points to a user's account
     */
    async addPoints(uid: string, pointsToAdd: number): Promise<number> {
        if (!this.isFirebaseInitialized()) {
            throw new Error('Firebase not initialized');
        }
        try {
            const userRef = firebaseDb!.collection(this.usersCollection).doc(uid);

            await userRef.update({
                points: FieldValue.increment(pointsToAdd),
                updatedAt: FieldValue.serverTimestamp(),
            });

            // Get updated points
            const doc = await userRef.get();
            const newPoints = doc.data()?.points || 0;

            console.log(`Added ${pointsToAdd} points to ${uid}. New total: ${newPoints}`);
            return newPoints;
        } catch (error) {
            console.error('Failed to add points:', error);
            throw error;
        }
    }

    /**
     * Upgrade user to registered status
     */
    async upgradeToRegistered(uid: string, email: string): Promise<boolean> {
        if (!this.isFirebaseInitialized()) {
            throw new Error('Firebase not initialized');
        }
        try {
            await firebaseDb!.collection(this.usersCollection).doc(uid).update({
                isRegistered: true,
                email,
                updatedAt: FieldValue.serverTimestamp(),
            });

            console.log(`Upgraded user ${uid} to registered with email ${email}`);
            return true;
        } catch (error) {
            console.error('Failed to upgrade user to registered:', error);
            throw error;
        }
    }

    /**
     * Calculate points based on modal vote
     * Returns a map of playerId -> points earned
     * - Players who vote for the modal value get 3 points
     * - Players who vote for other numeric values get 1 point
     * - Players who vote for non-numeric values (?, ☕) get 0 points
     */
    calculatePoints(votes: Map<string, string>): Map<string, number> {
        const pointsMap = new Map<string, number>();

        // Get numeric votes only
        const numericVotes: { playerId: string; vote: number }[] = [];
        votes.forEach((vote, playerId) => {
            const numericValue = parseFloat(vote);
            if (!isNaN(numericValue)) {
                numericVotes.push({ playerId, vote: numericValue });
            } else {
                // Non-numeric votes (?, ☕) get 0 points
                pointsMap.set(playerId, 0);
            }
        });

        if (numericVotes.length === 0) {
            return pointsMap;
        }

        // Calculate modal vote (most common)
        const voteCounts = new Map<number, number>();
        numericVotes.forEach(({ vote }) => {
            voteCounts.set(vote, (voteCounts.get(vote) || 0) + 1);
        });

        let maxCount = 0;
        let modalVotes: number[] = [];
        voteCounts.forEach((count, vote) => {
            if (count > maxCount) {
                maxCount = count;
                modalVotes = [vote];
            } else if (count === maxCount) {
                modalVotes.push(vote);
            }
        });

        // Calculate points for each player
        // Modal vote = 3 points, other numeric votes = 1 point
        numericVotes.forEach(({ playerId, vote }) => {
            const isModalVote = modalVotes.includes(vote);
            const points = isModalVote ? 3 : 1;
            pointsMap.set(playerId, points);
        });

        return pointsMap;
    }
}

export const userService = new UserService();
