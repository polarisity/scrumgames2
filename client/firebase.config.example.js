# Firebase Client Configuration Example
# These values are safe to be in client - side code, but should be configured via environment variables

# IMPORTANT: Client - side Firebase credentials are public by design!
# Security is enforced through Firestore Security Rules, not by hiding these values.
# However, for better security practice, use environment variables in build process.

# For development, replace these with your Firebase project credentials
# For production builds, inject via environment variables:
# - VITE_FIREBASE_API_KEY
# - VITE_FIREBASE_AUTH_DOMAIN
# - etc.

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || "your-api-key-here",
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "your-project.firebaseapp.com",
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || "your-project-id",
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "your-project.appspot.com",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "your-sender-id",
    appId: process.env.VITE_FIREBASE_APP_ID || "your-app-id"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export Firebase services for use in other modules
const auth = firebase.auth();
const db = firebase.firestore();

// Enable persistence for offline support
db.enablePersistence().catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence not available in this browser');
    }
});

console.log('Firebase initialized');
