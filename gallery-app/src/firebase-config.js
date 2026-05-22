import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// Configuración oficial de producción para el proyecto 'aimadre'.
// El SDK cliente de Firebase es seguro de exponer públicamente.
const firebaseConfig = {
  apiKey: "AIzaSyC882K-m7aLzJTmnaahShZOs8JjyVetweM",
  authDomain: "aimadre.firebaseapp.com",
  projectId: "aimadre",
  storageBucket: "aimadre.appspot.com",
  messagingSenderId: "941955410256",
  appId: "1:941955410256:web:86e413008670df577edb7b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");

// Sincronizar automáticamente con emuladores locales si la URL es localhost o dirección IP local
if (
  window.location.hostname === "localhost" || 
  window.location.hostname === "127.0.0.1" || 
  window.location.hostname.startsWith("192.168.")
) {
  console.log("🔧 [Galería] Detectado host local. Redireccionando SDK cliente a los Emuladores de Firebase...");
  connectFirestoreEmulator(db, "localhost", 8080);
  connectFunctionsEmulator(functions, "localhost", 5001);
}

export { db, functions };
