// ── Firebase Configuration ──
// Replace these values with your Firebase project config
// from Firebase Console → Project Settings → Your apps → Web app
const firebaseConfig = {
  apiKey: "AIzaSyCggZOHt-QRsL-tLX_IndM4ya0DkjgO2Vg",
  authDomain: "concert-tracker-5b233.firebaseapp.com",
  projectId: "concert-tracker-5b233",
  storageBucket: "concert-tracker-5b233.firebasestorage.app",
  messagingSenderId: "282503974472",
  appId: "1:282503974472:web:451c0fe3036b8382a7527d",
  measurementId: "G-WYDVQSZYV8",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();
