import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK using environment variables
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

let isInitialized = false;

if (!process.env.FIREBASE_PROJECT_ID || !privateKey || !process.env.FIREBASE_CLIENT_EMAIL) {
    console.warn('Firebase Admin SDK credentials not fully configured. Some features may not work.');
} else if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: privateKey,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            }),
        });
        isInitialized = true;
        console.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Firebase Admin SDK:', error);
    }
} else {
    isInitialized = true;
}

export const firebaseAdmin = admin;
export const firebaseAuth = isInitialized ? admin.auth() : null;
export const firebaseDb = isInitialized ? admin.firestore() : null;
