
import { initializeApp }       from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth }             from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore }        from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";      
import { getAnalytics }        from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";


// For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyBQkpPsb9dycwrKnx8WXuPsBRKKVgPvAWU",
    authDomain: "finova-8594c.firebaseapp.com",
    projectId: "finova-8594c",
    storageBucket: "finova-8594c.firebasestorage.app",
    messagingSenderId: "174173677504",
    appId: "1:174173677504:web:43d39cf325c55283f18a25",
    measurementId: "G-GBCYRZ7ZJK"
  };


// ── Initialize Firebase ────────────────────────
const app = initializeApp(firebaseConfig);


// ── Export services for use in other files ─────
export const auth      = getAuth(app);
export const db        = getFirestore(app);
export const analytics = getAnalytics(app);

// ── Temporary connection test — remove after Day 2 ──
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

try {
  const docRef = await addDoc(collection(db, "_connection_test"), {
    message: "Firebase connected!",
    timestamp: new Date().toISOString()
  });
  console.log("✅ Firestore connected! Doc ID:", docRef.id);
} catch (error) {
  console.error("❌ Firestore error:", error);
}