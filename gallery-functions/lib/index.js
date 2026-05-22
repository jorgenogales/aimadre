"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PBgenerateImageTrigger = exports.PBvotePrompt = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const storage_1 = require("firebase-admin/storage");
const genai_1 = require("@google/genai");
admin.initializeApp();
const db = admin.firestore();
/**
 * Instancia el cliente de Google Gen AI para Vertex AI.
 */
function getGenAIClient() {
    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
    console.log(`🚀 Inicializando GoogleGenAI (Vertex AI) usando credenciales del entorno en el proyecto: ${projectId}.`);
    return new genai_1.GoogleGenAI({
        vertexai: true,
        project: projectId,
        location: "global"
    });
}
/**
 * Helper para ejecutar tareas asíncronas con límite de concurrencia.
 */
async function runWithConcurrencyLimit(tasks, limit) {
    const results = new Array(tasks.length);
    let index = 0;
    async function worker() {
        while (index < tasks.length) {
            const currentIndex = index++;
            try {
                results[currentIndex] = await tasks[currentIndex]();
            }
            catch (error) {
                console.error(`Error in task at index ${currentIndex}:`, error);
                throw error;
            }
        }
    }
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
    await Promise.all(workers);
    return results;
}
// Imágenes mockeadas de alta calidad para pruebas en el emulador offline
const MOCK_IMAGES = [
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800",
    "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=800",
    "https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?q=80&w=800",
    "https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=800",
    "https://images.unsplash.com/photo-1536924940846-227afb31e2a5?q=80&w=800",
    "https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=800"
];
/**
 * Cloud Function para votar por una imagen de la galería.
 * Incrementa/decrementa el contador de votos transaccionalmente y limita los votos a un máximo de 3 por usuario.
 */
exports.PBvotePrompt = (0, https_1.onCall)(async (request) => {
    const { promptId, userId, action } = request.data || {};
    if (!promptId || typeof promptId !== "string" || promptId.trim().length === 0) {
        throw new https_1.HttpsError("invalid-argument", "El promptId es requerido y debe ser una cadena de texto válida.");
    }
    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
        throw new https_1.HttpsError("invalid-argument", "El userId es requerido y debe ser una cadena de texto válida.");
    }
    if (action !== "upvote" && action !== "downvote") {
        throw new https_1.HttpsError("invalid-argument", "El campo action es obligatorio y debe ser 'upvote' o 'downvote'.");
    }
    const userRef = db.collection("users").doc(userId);
    const promptRef = db.collection("prompts").doc(promptId);
    try {
        console.log(`🗳️ Procesando voto transaccional para userId: ${userId}, promptId: ${promptId}, action: ${action}`);
        await db.runTransaction(async (transaction) => {
            // 1. Obtener y validar el documento del usuario
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new https_1.HttpsError("not-found", `No se encontró ningún participante registrado con el ID: ${userId}`);
            }
            // 2. Obtener y validar el documento del prompt (la imagen)
            const promptDoc = await transaction.get(promptRef);
            if (!promptDoc.exists) {
                throw new https_1.HttpsError("not-found", `No se encontró ninguna imagen en la galería con el ID: ${promptId}`);
            }
            const promptData = promptDoc.data();
            if (promptData?.status !== "completed") {
                throw new https_1.HttpsError("failed-precondition", "Solo se puede votar por imágenes cuyo estado de procesamiento sea 'completed'.");
            }
            // Obtener el array de prompts votados por el usuario
            const userData = userDoc.data();
            let votedPromptIds = userData?.votedPromptIds || [];
            if (action === "upvote") {
                // Verificar duplicados de voto
                if (votedPromptIds.includes(promptId)) {
                    throw new https_1.HttpsError("already-exists", "Ya has votado por esta imagen.");
                }
                // Validar límite máximo de 3 votos
                if (votedPromptIds.length >= 3) {
                    throw new https_1.HttpsError("resource-exhausted", "Límite de votos alcanzado. No puedes votar por más de 3 imágenes.");
                }
                // Añadir promptId al array de votos del participante
                votedPromptIds.push(promptId);
                const currentVotes = promptData?.votes || 0;
                // Registrar los cambios de manera atómica
                transaction.update(userRef, { votedPromptIds });
                transaction.update(promptRef, { votes: currentVotes + 1 });
                console.log(`✅ Upvote realizado con éxito para promptId: ${promptId}. Votos totales del prompt: ${currentVotes + 1}`);
            }
            else {
                // downvote (retirar voto)
                if (!votedPromptIds.includes(promptId)) {
                    throw new https_1.HttpsError("failed-precondition", "No tienes registrado un voto activo para esta imagen, por lo que no lo puedes retirar.");
                }
                // Eliminar el promptId de los votos del participante
                votedPromptIds = votedPromptIds.filter((id) => id !== promptId);
                const currentVotes = promptData?.votes || 0;
                const newVotes = Math.max(0, currentVotes - 1);
                // Registrar los cambios de manera atómica
                transaction.update(userRef, { votedPromptIds });
                transaction.update(promptRef, { votes: newVotes });
                console.log(`✅ Voto retirado con éxito (downvote) para promptId: ${promptId}. Votos totales del prompt: ${newVotes}`);
            }
        });
        return { success: true };
    }
    catch (error) {
        console.error("🔴 Error al ejecutar la transacción de votación:", error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", `Fallo interno al procesar el voto: ${error?.message || error}`);
    }
});
/**
 * Cloud Function Trigger que se activa cuando se crea un nuevo documento en la colección 'prompts'.
 * Bloquea el documento origen y cualquier otro pendiente transaccionalmente,
 * genera imágenes usando Gemini 3.1 Flash (Nano Banana 2) y las almacena en Cloud Storage.
 */
exports.PBgenerateImageTrigger = (0, firestore_1.onDocumentCreated)("prompts/{promptId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        console.warn("⚠️ No snapshot associated with the event.");
        return;
    }
    const promptId = event.params.promptId;
    const triggerRef = snapshot.ref;
    const triggerData = snapshot.data();
    console.log(`\n🔔 Trigger de imagen disparado para promptId: ${promptId}`);
    // Solo procesar si el estado es 'approved'
    if (triggerData?.status !== "approved") {
        console.log(`ℹ️ El documento ${promptId} tiene estado '${triggerData?.status || "sin estado"}'. No se requiere procesar.`);
        return;
    }
    // 1. Transacción para marcar como 'in-progress' y recolectar otros pendientes
    const docsToProcess = [];
    try {
        await db.runTransaction(async (transaction) => {
            // Evitar duplicados si la transacción se reintenta
            docsToProcess.length = 0;
            // 1. Realizar todas las lecturas primero
            // Obtener el documento origen para asegurar lectura consistente en la transacción
            const triggerDoc = await transaction.get(triggerRef);
            // Buscar otros documentos con estado 'approved'
            const pendingQuery = db.collection("prompts").where("status", "==", "approved");
            const pendingSnapshot = await transaction.get(pendingQuery);
            // 2. Realizar todas las escrituras después
            if (triggerDoc.exists && triggerDoc.data()?.status === "approved") {
                const data = triggerDoc.data();
                docsToProcess.push({
                    id: triggerDoc.id,
                    ref: triggerRef,
                    promptText: data.promptText || "",
                });
                transaction.update(triggerRef, {
                    status: "in-progress",
                    processedAt: admin.firestore.Timestamp.now(),
                });
            }
            pendingSnapshot.forEach((doc) => {
                if (doc.id !== promptId) {
                    const data = doc.data();
                    docsToProcess.push({
                        id: doc.id,
                        ref: doc.ref,
                        promptText: data.promptText || "",
                    });
                    transaction.update(doc.ref, {
                        status: "in-progress",
                        processedAt: admin.firestore.Timestamp.now(),
                    });
                }
            });
        });
        console.log(`📝 Transacción completada. Documentos a procesar en esta ejecución: ${docsToProcess.map((d) => d.id).join(", ")}`);
    }
    catch (error) {
        console.error("🔴 Error al ejecutar la transacción de inicio:", error);
        return;
    }
    if (docsToProcess.length === 0) {
        console.log("ℹ️ No hay documentos pendientes para procesar.");
        return;
    }
    // 2. Inicializar cliente de GoogleGenAI
    let ai = null;
    try {
        ai = getGenAIClient();
    }
    catch (err) {
        console.error("🔴 Error inicializando GoogleGenAI:", err);
    }
    // 3. Procesar las peticiones en paralelo (con límite de concurrencia configurable)
    const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS || "5", 10);
    const tasks = docsToProcess.map((doc) => async () => {
        console.log(`🎨 Iniciando procesamiento para el documento: ${doc.id} | Prompt: "${doc.promptText}"`);
        try {
            let imageBuffer = null;
            let mimeType = "image/png";
            const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
            if (ai) {
                try {
                    console.log(`🤖 Llamando a Gemini 3.1 Flash (Nano Banana 2) para el documento: ${doc.id}`);
                    const response = await ai.models.generateContent({
                        model: "gemini-3.1-flash-image-preview",
                        contents: doc.promptText,
                        config: {
                            responseModalities: ["IMAGE"],
                        },
                    });
                    const parts = response.candidates?.[0]?.content?.parts;
                    if (parts) {
                        for (const part of parts) {
                            if (part.inlineData && part.inlineData.data) {
                                imageBuffer = Buffer.from(part.inlineData.data, "base64");
                                if (part.inlineData.mimeType) {
                                    mimeType = part.inlineData.mimeType;
                                }
                                break;
                            }
                        }
                    }
                    if (!imageBuffer) {
                        throw new Error("No se pudo extraer el buffer de imagen de la respuesta de Gemini.");
                    }
                }
                catch (apiError) {
                    console.error(`🔴 Fallo en la llamada a Gemini para el documento ${doc.id}:`, apiError);
                    // Fallback en emulador para pruebas offline sin credenciales reales
                    const isCredsError = apiError?.message?.includes("Default Credentials") ||
                        apiError?.message?.includes("API key") ||
                        apiError?.message?.includes("credentials") ||
                        apiError?.status === 403 ||
                        apiError?.status === 401;
                    if (isEmulator && isCredsError) {
                        const mockUrl = MOCK_IMAGES[Math.floor(Math.random() * MOCK_IMAGES.length)];
                        console.warn(`⚠️ ADVERTENCIA: Falló con error de credenciales en Emulador. Usando URL mock de Unsplash: ${mockUrl}`);
                        await doc.ref.update({
                            status: "completed",
                            imageUrl: mockUrl,
                            votes: 0,
                        });
                        return;
                    }
                    else {
                        throw apiError;
                    }
                }
            }
            else {
                if (isEmulator) {
                    const mockUrl = MOCK_IMAGES[Math.floor(Math.random() * MOCK_IMAGES.length)];
                    console.warn(`⚠️ ADVERTENCIA: Cliente de IA no disponible en Emulador. Usando URL mock de Unsplash: ${mockUrl}`);
                    await doc.ref.update({
                        status: "completed",
                        imageUrl: mockUrl,
                        votes: 0,
                    });
                    return;
                }
                else {
                    throw new Error("Cliente de GoogleGenAI no inicializado.");
                }
            }
            // Guardar en Storage si logramos generar la imagen real
            console.log(`📦 Guardando imagen real en Storage para el documento: ${doc.id}`);
            const bucketName = process.env.STORAGE_BUCKET || "aiquebonito";
            const bucket = (0, storage_1.getStorage)().bucket(bucketName);
            const filename = `${doc.id}.png`;
            const fileRef = bucket.file(filename);
            await fileRef.save(imageBuffer, {
                metadata: {
                    contentType: mimeType,
                },
            });
            // Asegurar que el archivo sea público
            try {
                await fileRef.makePublic();
            }
            catch (permissionError) {
                console.warn(`⚠️ No se pudo marcar el archivo como público en Storage:`, permissionError);
            }
            const imageUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;
            // Actualizar en Firestore como completado con la URL real
            console.log(`✅ Completado con éxito para el documento: ${doc.id}. URL de imagen real: ${imageUrl}`);
            await doc.ref.update({
                status: "completed",
                imageUrl,
                votes: 0,
            });
        }
        catch (taskError) {
            console.error(`🔴 Falló el procesamiento del documento ${doc.id}:`, taskError);
            await doc.ref.update({
                status: "failed",
                error: taskError?.message || String(taskError),
            }).catch((updateErr) => {
                console.error(`🔴 Falló al actualizar estado de error para el documento ${doc.id}:`, updateErr);
            });
        }
    });
    // Ejecutar con límite de concurrencia
    await runWithConcurrencyLimit(tasks, MAX_CONCURRENT_REQUESTS);
    console.log(`🏁 Procesamiento de triggers completado para promptId: ${promptId}.\n`);
});
//# sourceMappingURL=index.js.map