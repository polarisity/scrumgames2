import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK using environment variables
// More robust private key handling to support different formats
let privateKey = process.env.FIREBASE_PRIVATE_KEY;
if (privateKey) {
    // Remove surrounding quotes if present (some platforms add them)
    privateKey = privateKey.trim().replace(/^["']|["']$/g, '');
    // Replace escaped newlines with actual newlines
    // This handles both \n and \\n formats
    privateKey = privateKey.replace(/\\n/g, '\n');
}

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
        console.error('Private key format issue - ensure FIREBASE_PRIVATE_KEY is properly formatted');
        console.error('Private key should start with "-----BEGIN PRIVATE KEY-----" and end with "-----END PRIVATE KEY-----"');
    }
} else {
    isInitialized = true;
}

export const firebaseAdmin = admin;
export const firebaseAuth = isInitialized ? admin.auth() : null;
export const firebaseDb = isInitialized ? admin.firestore() : null;
