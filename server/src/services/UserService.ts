import { firebaseDb, firebaseAdmin } from './firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { remoteConfigService } from './RemoteConfigService';

export interface UserProfile {
    uid: string;
    email?: string;
    displayName: string;
    avatar: string;
    points: number;
    seasonPoints: number;
    currentSeason: string;
    isRegistered: boolean;
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
    lastActiveAt: FirebaseFirestore.Timestamp;
    archivedAt?: FirebaseFirestore.Timestamp;
}

export interface PointTransaction {
    points: number;
    timestamp: FirebaseFirestore.Timestamp;
    season: string;
    roomId: string;
}

export interface LeaderboardEntry {
    uid: string;
    displayName: string;
    avatar: string;
    points: number;
}

export interface SeasonWinner {
    rank: number;
    uid: string;
    displayName: string;
    avatar: string;
    points: number;
}

export interface Season {
    seasonId: string;
    year: number;
    seasonNumber: number;
    startDate: FirebaseFirestore.Timestamp;
    endDate: FirebaseFirestore.Timestamp;
    isActive: boolean;
    leaderboard: LeaderboardEntry[];
    winners: SeasonWinner[];
    updatedAt: FirebaseFirestore.Timestamp;
}

export interface SeasonInfo {
    year: number;
    seasonNumber: number;
    seasonId: string;
    startDate: Date;
    endDate: Date;
}

/**
 * Get ISO week number for a date
 * ISO 8601: Week 1 is the week containing the first Thursday of the year
 */
function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get ISO week year (can differ from calendar year at year boundaries)
 */
function getISOWeekYear(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    return d.getUTCFullYear();
}

/**
 * Get the number of ISO weeks in a year (52 or 53)
 */
function getISOWeeksInYear(year: number): number {
    const dec31 = new Date(Date.UTC(year, 11, 31));
    const week = getISOWeek(dec31);
    return week === 1 ? getISOWeek(new Date(Date.UTC(year, 11, 24))) : week;
}

/**
 * Get the Monday of a given ISO week
 */
function getStartOfISOWeek(year: number, week: number): Date {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
    return monday;
}

/**
 * Get current season information based on ISO week
 */
export function getCurrentSeason(): SeasonInfo {
    const now = new Date();
    const year = getISOWeekYear(now);
    const week = getISOWeek(now);
    const seasonNumber = Math.ceil(week / 2);
    const seasonId = `${year}-S${seasonNumber}`;

    const startWeek = (seasonNumber - 1) * 2 + 1;
    const weeksInYear = getISOWeeksInYear(year);
    const endWeek = Math.min(startWeek + 1, weeksInYear);

    const startDate = getStartOfISOWeek(year, startWeek);
    const endDate = getStartOfISOWeek(year, endWeek);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    endDate.setUTCHours(23, 59, 59, 999);

    return { year, seasonNumber, seasonId, startDate, endDate };
}

/**
 * Get season information for a specific season
 */
export function getSeasonInfo(year: number, seasonNumber: number): SeasonInfo {
    const seasonId = `${year}-S${seasonNumber}`;
    const startWeek = (seasonNumber - 1) * 2 + 1;
    const weeksInYear = getISOWeeksInYear(year);
    const endWeek = Math.min(startWeek + 1, weeksInYear);

    const startDate = getStartOfISOWeek(year, startWeek);
    const endDate = getStartOfISOWeek(year, endWeek);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    endDate.setUTCHours(23, 59, 59, 999);

    return { year, seasonNumber, seasonId, startDate, endDate };
}

export class UserService {
    private usersCollection = 'users';
    private displayNamesCollection = 'displayNames';
    private seasonsCollection = 'seasons';

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
                const userData = doc.data() as UserProfile;

                // Backfill lastActiveAt for existing users who don't have it
                if (!userData.lastActiveAt) {
                    const backfillTimestamp = userData.updatedAt || userData.createdAt;
                    await firebaseDb!.collection(this.usersCollection).doc(uid).update({
                        lastActiveAt: backfillTimestamp,
                    });
                    userData.lastActiveAt = backfillTimestamp;
                }

                return userData;
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
        const currentSeason = getCurrentSeason();
        const userProfile: UserProfile = {
            uid,
            displayName,
            avatar,
            points: 0,
            seasonPoints: 0,
            currentSeason: currentSeason.seasonId,
            isRegistered: false,
            createdAt: FieldValue.serverTimestamp() as any,
            updatedAt: FieldValue.serverTimestamp() as any,
            lastActiveAt: FieldValue.serverTimestamp() as any,
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
        // Check if feature is enabled via Remote Config
        const checkEnabled = await remoteConfigService.isDisplayNameCheckEnabled();
        if (!checkEnabled) {
            return true; // Skip conflict check when disabled
        }

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
     * Update user's avatar (available to all users)
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

            await firebaseDb!.collection(this.usersCollection).doc(uid).update({
                avatar,
                updatedAt: FieldValue.serverTimestamp(),
                lastActiveAt: FieldValue.serverTimestamp(),
            });

            console.log(`Updated avatar for ${uid}: ${avatar}`);
            return true;
        } catch (error) {
            console.error('Failed to update avatar:', error);
            throw error;
        }
    }

    /**
     * Update user's last active timestamp
     */
    async updateLastActive(uid: string): Promise<void> {
        if (!this.isFirebaseInitialized()) return;
        try {
            await firebaseDb!.collection(this.usersCollection).doc(uid).update({
                lastActiveAt: FieldValue.serverTimestamp(),
            });
        } catch (error) {
            console.error('Failed to update lastActiveAt:', error);
        }
    }

    /**
     * Archive a user - removes their display name reservation but keeps user data
     */
    async archiveUser(uid: string): Promise<boolean> {
        if (!this.isFirebaseInitialized()) return false;

        try {
            const user = await this.getUser(uid);
            if (!user || user.archivedAt) {
                return false; // Already archived or doesn't exist
            }

            await firebaseDb!.runTransaction(async (transaction) => {
                const userRef = firebaseDb!.collection(this.usersCollection).doc(uid);

                // Mark user as archived
                transaction.update(userRef, {
                    archivedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });

                // Free up their display name
                if (user.displayName) {
                    const nameRef = firebaseDb!.collection(this.displayNamesCollection)
                        .doc(user.displayName.toLowerCase());
                    transaction.delete(nameRef);
                }
            });

            console.log(`Archived user ${uid} (${user.displayName}), freed display name`);
            return true;
        } catch (error) {
            console.error('Failed to archive user:', error);
            return false;
        }
    }

    /**
     * Restore an archived user - requires them to pick a new name if taken
     */
    async restoreArchivedUser(uid: string): Promise<{ restored: boolean; needsNewName: boolean }> {
        if (!this.isFirebaseInitialized()) {
            return { restored: false, needsNewName: false };
        }

        try {
            const user = await this.getUser(uid);
            if (!user || !user.archivedAt) {
                return { restored: false, needsNewName: false };
            }

            // Check if their old display name is still available
            const nameAvailable = await this.isDisplayNameAvailable(user.displayName);

            await firebaseDb!.runTransaction(async (transaction) => {
                const userRef = firebaseDb!.collection(this.usersCollection).doc(uid);

                if (nameAvailable) {
                    // Reclaim the name
                    const nameRef = firebaseDb!.collection(this.displayNamesCollection)
                        .doc(user.displayName.toLowerCase());
                    transaction.set(nameRef, {
                        uid,
                        displayName: user.displayName,
                    });

                    // Restore user
                    transaction.update(userRef, {
                        archivedAt: FieldValue.delete(),
                        lastActiveAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                } else {
                    // Name taken - clear their name and restore
                    transaction.update(userRef, {
                        archivedAt: FieldValue.delete(),
                        displayName: '', // Force new name selection
                        lastActiveAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                }
            });

            console.log(`Restored archived user ${uid}, needsNewName: ${!nameAvailable}`);
            return { restored: true, needsNewName: !nameAvailable };
        } catch (error) {
            console.error('Failed to restore archived user:', error);
            return { restored: false, needsNewName: false };
        }
    }

    private INACTIVITY_THRESHOLD_DAYS = 30;

    /**
     * Find and archive inactive anonymous users
     */
    async archiveInactiveUsers(): Promise<number> {
        if (!this.isFirebaseInitialized()) return 0;

        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.INACTIVITY_THRESHOLD_DAYS);
            const cutoffTimestamp = firebaseAdmin!.firestore.Timestamp.fromDate(cutoffDate);

            // Query users who are:
            // 1. Not registered (only archive anonymous users)
            // 2. lastActiveAt is older than cutoff
            const inactiveUsersQuery = await firebaseDb!
                .collection(this.usersCollection)
                .where('isRegistered', '==', false)
                .where('lastActiveAt', '<', cutoffTimestamp)
                .limit(100) // Process in batches
                .get();

            let archivedCount = 0;
            for (const doc of inactiveUsersQuery.docs) {
                const userData = doc.data();
                // Double-check not already archived
                if (!userData.archivedAt) {
                    const success = await this.archiveUser(doc.id);
                    if (success) archivedCount++;
                }
            }

            if (archivedCount > 0) {
                console.log(`Archived ${archivedCount} inactive users`);
            }
            return archivedCount;
        } catch (error) {
            console.error('Failed to archive inactive users:', error);
            return 0;
        }
    }

    /**
     * Add points to a user's account with season tracking
     */
    async addPoints(uid: string, pointsToAdd: number, roomId: string): Promise<number> {
        if (!this.isFirebaseInitialized()) {
            throw new Error('Firebase not initialized');
        }
        try {
            const userRef = firebaseDb!.collection(this.usersCollection).doc(uid);
            const currentSeason = getCurrentSeason();

            // Get current user data to check if season changed
            const userDoc = await userRef.get();
            const userData = userDoc.data();
            const userCurrentSeason = userData?.currentSeason;

            // If user's season is different, reset their season points
            const needsSeasonReset = userCurrentSeason && userCurrentSeason !== currentSeason.seasonId;

            // Create point transaction record
            await userRef.collection('pointTransactions').add({
                points: pointsToAdd,
                timestamp: FieldValue.serverTimestamp(),
                season: currentSeason.seasonId,
                roomId: roomId,
            });

            // Update user points
            if (needsSeasonReset) {
                // Reset season points and set new season
                await userRef.update({
                    points: FieldValue.increment(pointsToAdd),
                    seasonPoints: pointsToAdd,
                    currentSeason: currentSeason.seasonId,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            } else {
                // Just increment both
                await userRef.update({
                    points: FieldValue.increment(pointsToAdd),
                    seasonPoints: FieldValue.increment(pointsToAdd),
                    currentSeason: currentSeason.seasonId,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }

            // Get updated points
            const doc = await userRef.get();
            const newPoints = doc.data()?.points || 0;

            console.log(`Added ${pointsToAdd} points to ${uid} for season ${currentSeason.seasonId}. New total: ${newPoints}`);
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

    /**
     * Get or create a season document
     */
    async ensureSeasonExists(seasonInfo?: SeasonInfo): Promise<Season | null> {
        if (!this.isFirebaseInitialized()) {
            return null;
        }
        try {
            const season = seasonInfo || getCurrentSeason();
            const seasonRef = firebaseDb!.collection(this.seasonsCollection).doc(season.seasonId);
            const doc = await seasonRef.get();

            if (doc.exists) {
                return doc.data() as Season;
            }

            // Create new season document
            const newSeason: Omit<Season, 'startDate' | 'endDate' | 'updatedAt'> & { startDate: any; endDate: any; updatedAt: any } = {
                seasonId: season.seasonId,
                year: season.year,
                seasonNumber: season.seasonNumber,
                startDate: firebaseAdmin!.firestore.Timestamp.fromDate(season.startDate),
                endDate: firebaseAdmin!.firestore.Timestamp.fromDate(season.endDate),
                isActive: true,
                leaderboard: [],
                winners: [],
                updatedAt: FieldValue.serverTimestamp() as any,
            };

            await seasonRef.set(newSeason);
            console.log(`Created new season: ${season.seasonId}`);
            return newSeason as Season;
        } catch (error) {
            console.error('Failed to ensure season exists:', error);
            return null;
        }
    }

    /**
     * Get leaderboard data for a season (defaults to current season)
     */
    async getSeasonLeaderboard(seasonId?: string): Promise<{ season: SeasonInfo; leaderboard: LeaderboardEntry[] } | null> {
        if (!this.isFirebaseInitialized()) {
            return null;
        }
        try {
            const currentSeason = getCurrentSeason();
            const targetSeasonId = seasonId || currentSeason.seasonId;

            // Get or create season document
            const seasonDoc = await firebaseDb!.collection(this.seasonsCollection).doc(targetSeasonId).get();

            if (seasonDoc.exists) {
                const seasonData = seasonDoc.data() as Season;
                return {
                    season: {
                        year: seasonData.year,
                        seasonNumber: seasonData.seasonNumber,
                        seasonId: seasonData.seasonId,
                        startDate: seasonData.startDate.toDate(),
                        endDate: seasonData.endDate.toDate(),
                    },
                    leaderboard: seasonData.leaderboard || [],
                };
            }

            // Season doesn't exist yet, return current season info with empty leaderboard
            return {
                season: currentSeason,
                leaderboard: [],
            };
        } catch (error) {
            console.error('Failed to get season leaderboard:', error);
            return null;
        }
    }

    /**
     * Refresh the leaderboard for the current season by querying top 10 users
     */
    async refreshSeasonLeaderboard(): Promise<LeaderboardEntry[]> {
        if (!this.isFirebaseInitialized()) {
            return [];
        }
        try {
            const currentSeason = getCurrentSeason();

            // Ensure season document exists
            await this.ensureSeasonExists(currentSeason);

            // Query top 10 users for current season
            const usersSnapshot = await firebaseDb!
                .collection(this.usersCollection)
                .where('currentSeason', '==', currentSeason.seasonId)
                .orderBy('seasonPoints', 'desc')
                .limit(10)
                .get();

            const leaderboard: LeaderboardEntry[] = usersSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    uid: doc.id,
                    displayName: data.displayName,
                    avatar: data.avatar,
                    points: data.seasonPoints || 0,
                };
            });

            // Update season document with new leaderboard
            await firebaseDb!.collection(this.seasonsCollection).doc(currentSeason.seasonId).update({
                leaderboard,
                updatedAt: FieldValue.serverTimestamp(),
            });

            console.log(`Refreshed leaderboard for ${currentSeason.seasonId} with ${leaderboard.length} entries`);
            return leaderboard;
        } catch (error) {
            console.error('Failed to refresh season leaderboard:', error);
            return [];
        }
    }

    /**
     * Finalize a season by recording winners and marking it inactive
     */
    async finalizeSeasonAndRecordWinners(seasonId: string): Promise<boolean> {
        if (!this.isFirebaseInitialized()) {
            return false;
        }
        try {
            const seasonRef = firebaseDb!.collection(this.seasonsCollection).doc(seasonId);
            const seasonDoc = await seasonRef.get();

            if (!seasonDoc.exists) {
                console.log(`Season ${seasonId} not found`);
                return false;
            }

            const seasonData = seasonDoc.data() as Season;

            // Don't finalize if already finalized
            if (!seasonData.isActive) {
                console.log(`Season ${seasonId} already finalized`);
                return false;
            }

            // Get top 3 as winners
            const winners: SeasonWinner[] = seasonData.leaderboard.slice(0, 3).map((entry, index) => ({
                rank: index + 1,
                uid: entry.uid,
                displayName: entry.displayName,
                avatar: entry.avatar,
                points: entry.points,
            }));

            await seasonRef.update({
                isActive: false,
                winners,
                updatedAt: FieldValue.serverTimestamp(),
            });

            console.log(`Finalized season ${seasonId} with winners:`, winners.map(w => w.displayName));
            return true;
        } catch (error) {
            console.error('Failed to finalize season:', error);
            return false;
        }
    }

    /**
     * Check if we need to transition to a new season and handle it
     */
    async checkAndHandleSeasonTransition(): Promise<void> {
        if (!this.isFirebaseInitialized()) {
            return;
        }
        try {
            const currentSeason = getCurrentSeason();

            // Find any active seasons that are not the current one
            const activeSeasonsSnapshot = await firebaseDb!
                .collection(this.seasonsCollection)
                .where('isActive', '==', true)
                .get();

            for (const doc of activeSeasonsSnapshot.docs) {
                if (doc.id !== currentSeason.seasonId) {
                    // This is an old active season, finalize it
                    await this.finalizeSeasonAndRecordWinners(doc.id);
                }
            }

            // Ensure current season exists
            await this.ensureSeasonExists(currentSeason);
        } catch (error) {
            console.error('Failed to check season transition:', error);
        }
    }
}

export const userService = new UserService();
