const admin = require("firebase-admin");

// Configurar conexión al emulador de Firestore
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";

admin.initializeApp({
  projectId: "aimadre"
});

const db = admin.firestore();

async function seed() {
  console.log("🌱 Sembrando emulador de Firestore con datos de prueba...");

  const prompts = [
    {
      id: "prompt1",
      comment: "Una imagen que capta la esencia del trabajo duro y la diversión corporativa. Seguro que los modelos de IA se sentirán muy identificados.",
      createdAt: admin.firestore.Timestamp.now(),
      imageUrl: "https://images.unsplash.com/photo-1511180598565-be2213d10459?q=80&w=800",
      processedAt: admin.firestore.Timestamp.now(),
      promptText: "Un equipo de preventas bebiendo cerveza en Madrid",
      status: "completed",
      userCode: "AILIVE-WO4N",
      userId: "user_pepe",
      username: "Pepe Luis",
      votes: 1
    },
    {
      id: "prompt2",
      comment: "Una hermosa pintura de estilo impresionista de la Gran Vía con luces de colores al atardecer.",
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 60000)), // Hace 1 min
      imageUrl: "https://images.unsplash.com/photo-1543731068-7e0f5beff43a?q=80&w=800",
      processedAt: admin.firestore.Timestamp.now(),
      promptText: "La Gran Vía de Madrid estilo impresionista",
      status: "completed",
      userCode: "AILIVE-MARG",
      userId: "user_maria",
      username: "Maria Garcia",
      votes: 3
    },
    {
      id: "prompt3",
      comment: "Una astronauta tocando flamenco en una guitarra española flotando en medio del espacio exterior.",
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 120000)), // Hace 2 min
      imageUrl: "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?q=80&w=800",
      processedAt: admin.firestore.Timestamp.now(),
      promptText: "Astronauta tocando flamenco con guitarra en el espacio",
      status: "completed",
      userCode: "AILIVE-FLAM",
      userId: "user_paco",
      username: "Paco Sanz",
      votes: 2
    },
    {
      id: "prompt4",
      comment: "Un gato robot de color violeta comiendo churros con chocolate caliente en una cafetería futurista.",
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 180000)), // Hace 3 min
      imageUrl: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=800",
      processedAt: admin.firestore.Timestamp.now(),
      promptText: "Gato robot cyberpunk comiendo churros en Madrid",
      status: "completed",
      userCode: "AILIVE-GATO",
      userId: "user_luna",
      username: "Luna Gata",
      votes: 0
    }
  ];

  const users = [
    {
      id: "user_pepe",
      username: "Pepe Luis",
      userCode: "AILIVE-WO4N",
      votedPromptIds: ["prompt2"]
    },
    {
      id: "user_maria",
      username: "Maria Garcia",
      userCode: "AILIVE-MARG",
      votedPromptIds: ["prompt1", "prompt2", "prompt3"]
    },
    {
      id: "user_paco",
      username: "Paco Sanz",
      userCode: "AILIVE-FLAM",
      votedPromptIds: ["prompt3"]
    },
    {
      id: "user_luna",
      username: "Luna Gata",
      userCode: "AILIVE-GATO",
      votedPromptIds: []
    }
  ];

  // Insertar usuarios
  for (const user of users) {
    const { id, ...data } = user;
    await db.collection("users").doc(id).set(data);
    console.log(`👤 Usuario insertado: ${id}`);
  }

  // Insertar prompts
  for (const prompt of prompts) {
    const { id, ...data } = prompt;
    await db.collection("prompts").doc(id).set(data);
    console.log(`🎨 Prompt insertado: ${id}`);
  }

  console.log("🏁 Siembra completada con éxito!");
}

seed().catch(console.error);
