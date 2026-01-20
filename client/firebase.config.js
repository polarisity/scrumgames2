// Firebase configuration for Scrum Poker
// These values should be replaced with your actual Firebase project credentials
// For production, these are injected via environment variables at build time

const firebaseConfig = {
  apiKey: "AIzaSyBjevd_u7G931fxip6Tun9jW91kMZ32JsM",
  authDomain: "scrumptious-73bc9.firebaseapp.com",
  projectId: "scrumptious-73bc9",
  storageBucket: "scrumptious-73bc9.appspot.com",
  messagingSenderId: "152966954104",
  appId: "1:152966954104:web:cd16569ed9d2c20910c18d"
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
