import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-functions.js";

// Firebase Configuration
// NOTE: We use "aimadre" as the project ID to perfectly match your active Firebase CLI project.
const firebaseConfig = {
  apiKey: "AIzaSyFakeKey_ForLiveDemoEventOnly",
  authDomain: "aimadre.firebaseapp.com",
  projectId: "aimadre",
  storageBucket: "aimadre.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

// Automatically connect to the local Cloud Functions emulator if running locally
if (
  window.location.hostname === "localhost" || 
  window.location.hostname === "127.0.0.1" || 
  window.location.hostname.startsWith("192.168.")
) {
  console.log("🛠️ Local environment detected. Connecting to Firebase Functions Emulator (port 5001)...");
  connectFunctionsEmulator(functions, window.location.hostname, 5001);
}

export { app, functions, httpsCallable };
