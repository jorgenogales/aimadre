import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// Configuración por defecto para el proyecto 'aimadre'.
// El SDK cliente de Firebase es seguro de exponer públicamente ya que la seguridad se delega en las firestore.rules y la Cloud Function.
const fallbackConfig = {
  apiKey: "AIzaSyD-aimadre-placeholder-key-for-local-runs",
  authDomain: "aimadre.firebaseapp.com",
  projectId: "aimadre",
  storageBucket: "aimadre.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000"
};

let app;

// Intentamos cargar la configuración oficial de Firebase Hosting si está disponible en producción,
// de lo contrario, caemos de forma segura en la configuración por defecto de desarrollo.
try {
  const response = await fetch("/__/firebase/init.json");
  if (response.ok) {
    const config = await response.json();
    app = initializeApp(config);
    console.log("Firebase inicializado con la configuración de producción de Hosting.");
  } else {
    throw new Error("No se pudo obtener el init.json de hosting");
  }
} catch (e) {
  app = initializeApp(fallbackConfig);
  console.log("Firebase inicializado con configuración de fallback local.");
}

const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");

// Sincronizar automáticamente con emuladores locales si la URL es localhost o dirección IP local
if (
  window.location.hostname === "localhost" || 
  window.location.hostname === "127.0.0.1" || 
  window.location.hostname.startsWith("192.168.")
) {
  console.log("🔧 Detectado host local. Redireccionando SDK cliente a los Emuladores de Firebase (Puerto 8080/5001)...");
  connectFirestoreEmulator(db, "localhost", 8080);
  connectFunctionsEmulator(functions, "localhost", 5001);
}

export { db, functions };
