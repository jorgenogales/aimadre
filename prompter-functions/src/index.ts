import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";
import * as crypto from "crypto";

admin.initializeApp();
const db = admin.firestore();

const SYSTEM_INSTRUCTIONS = `
Eres "El rey del sarcasmo de la IA", una inteligencia artificial extremadamente ingeniosa, irónica, astuta y un poco burlona que evalúa los prompts de desarrolladores en un importante evento técnico en vivo de Google Cloud.

Tu misión es dual:
1. Validar el prompt recibido. Para ser aprobado (approved: true), debe cumplir estrictamente las siguientes reglas:
   - Debe ser creativo y tener un sentido básico para la generación de imágenes.
   - Cumplir estrictamente con las normas de seguridad (sin insultos, odio, violencia, contenido ofensivo, inadecuado, acoso o explícito).
   - Evitar elementos problemáticos para modelos de generación de imágenes (como Gemini/Imagen). DEBES RECHAZAR (approved: false) los prompts que contengan o hagan referencia a:
     - Personas reales famosas, celebridades, políticos, figuras públicas o deportistas conocidos (ej. Lionel Messi, Taylor Swift, Elon Musk, etc.).
     - Marcas registradas, logotipos o nombres comerciales de empresas y productos (ej. Coca-Cola, Apple, Nike, McDonald's, etc.).
     - Personajes de ficción con derechos de autor fuertes, franquicias de entretenimiento o superhéroes comerciales conocidos (ej. Mickey Mouse, Spider-Man, Pikachu, Darth Vader, etc.).
     - Nombres de armas reales, violencia física explícita, drogas, sustancias ilegales o actos delictivos.
     - Elementos extremadamente abstractos, incoherentes o sin sentido visual claro que harían que la generación de la imagen falle o sea incomprensible.
2. Generar un comentario sarcástico, corto (máximo 2 líneas) y sumamente divertido sobre el prompt o la capacidad intelectual del usuario que lo ideó. Utiliza español neutro con un tono audaz, mordaz pero amigable e idóneo para un evento tecnológico. No utilices modismos españoles locales (como 'tío', 'mola', 'chaval', 'curro'), usa términos de español neutro comprensibles para cualquier desarrollador de habla hispana en Latinoamérica.

Debes responder ÚNICAMENTE con un objeto JSON válido con la siguiente estructura:
{
  "approved": boolean,
  "sarcasm": "Tu comentario sarcástico aquí.",
  "reason": "La justificación sarcástica o técnica de por qué el prompt fue rechazado (vacío si es aprobado). Debe ser redactada de manera divertida e irónica, señalando qué regla infringió (ej. mencionar marcas registradas, personas famosas, o falta de sentido visual) pero siempre manteniendo el tono sarcástico."
}
`;

/**
 * Instancia el cliente de Google Gen AI.
 * Utiliza Vertex AI, la cual se autentica automáticamente mediante:
 * - En GCP: La cuenta de servicio por defecto de la Cloud Function.
 * - En Local/Emulador: Las credenciales por defecto locales (ADC) de la máquina del desarrollador.
 */
function getGenAIClient(): GoogleGenAI {
  const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
  console.log(`🚀 Inicializando GoogleGenAI (Vertex AI) usando credenciales del entorno en el proyecto: ${projectId}.`);
  return new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: "global"
  });
}

export const PBsubmitPrompt = onCall(async (request) => {
  const { promptText, userId, username, userCode } = request.data || {};

  if (!promptText || typeof promptText !== "string" || promptText.trim().length === 0) {
    throw new HttpsError("invalid-argument", "El promptText es requerido y debe ser una cadena válida.");
  }
  if (!userId || !username || !userCode) {
    throw new HttpsError("invalid-argument", "Los campos userId, username y userCode son obligatorios.");
  }

  // 1. Validar la existencia del usuario en la colección /users usando su userCode
  const usersRef = db.collection("users");
  const userSnapshot = await usersRef.where("uniqueCode", "==", userCode).get();

  if (userSnapshot.empty) {
    throw new HttpsError("not-found", `No se encontró ningún participante registrado con el código: ${userCode}`);
  }

  try {
    const ai = getGenAIClient();

    // 2. Invocar la llamada a Gemini 2.5 Flash mediante Vertex AI / Gen AI API
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: promptText,
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            approved: { type: "BOOLEAN" },
            sarcasm: { type: "STRING" },
            reason: { type: "STRING" },
          },
          required: ["approved", "sarcasm", "reason"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("La respuesta recibida de la IA está vacía.");
    }

    console.log("Respuesta de Gemini recibida con éxito:", resultText);
    const parsedResponse = JSON.parse(resultText);

    // 3. Procesar según veredicto de la IA
    if (parsedResponse.approved) {
      // Escribir en la colección /prompts
      await db.collection("prompts").add({
        promptText,
        userId,
        username,
        userCode,
        status: "approved",
        comment: parsedResponse.sarcasm,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        comment: parsedResponse.sarcasm,
      };
    } else {
      // Rechazado: devolvemos success: false con la justificación sarcástica (reason)
      return {
        success: false,
        comment: parsedResponse.reason || parsedResponse.sarcasm || "Tu prompt fue denegado por falta de creatividad.",
      };
    }
  } catch (error: any) {
    console.error("🔴 Error al llamar a Gemini:", error);

    // Manejo de Fallback para pruebas locales en el Emulador:
    // Si la llamada falla por problemas de credenciales de Google (ej. falta de ADC localmente o clave API inválida),
    // devolvemos un mock sarcástico para permitir seguir probando la interfaz de forma interactiva y offline.
    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
    const isCredsError =
      error?.message?.includes("Default Credentials") ||
      error?.message?.includes("API key") ||
      error?.message?.includes("credentials") ||
      error?.status === 403 ||
      error?.status === 401;

    if (isEmulator && isCredsError) {
      console.warn(`⚠️ ADVERTENCIA DE PRUEBA: Falló la inicialización o llamada de IA. Error: ${error?.message || error}. Corriendo en modo simulado para depuración offline.`);

      const isMockApproved = promptText.toLowerCase().indexOf("error") === -1 && promptText.toLowerCase().indexOf("broma") === -1;
      const mockResponse = {
        approved: isMockApproved,
        sarcasm: isMockApproved
          ? "[Modo Demo] Qué prompt tan ingenioso... Seguro que tardaste horas pensándolo. Te lo apruebo solo para ver qué pasa."
          : "[Modo Demo] Tu prompt parece escrito por un bot de spam de los 90. Rechazado.",
        reason: isMockApproved ? "" : "[Modo Demo] Rechazado por contenido calificado como spam."
      };

      if (mockResponse.approved) {
        await db.collection("prompts").add({
          promptText,
          userId,
          username,
          userCode,
          status: "approved",
          comment: mockResponse.sarcasm,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      return {
        success: mockResponse.approved,
        comment: mockResponse.approved ? mockResponse.sarcasm : mockResponse.reason,
      };
    }

    // Si es un error de otra naturaleza o estamos en producción en GCP, lo propagamos formalmente
    console.error("Fallo definitivo al procesar con Gemini / Vertex AI:", error);
    throw new HttpsError("internal", `Error procesando la solicitud con IA: ${error?.message || error}`);
  }
});

/**
 * Cloud Function para verificar el código de acceso (Passcode) del evento.
 * Implementa rate-limiting por IP para mitigar ataques de fuerza bruta.
 */
export const PBverifyPasscode = onCall(async (request) => {
  const { passcode } = request.data || {};

  if (!passcode || typeof passcode !== "string") {
    throw new HttpsError("invalid-argument", "El código de acceso es obligatorio.");
  }

  // 1. Obtener la IP del cliente de manera robusta y calcular su Hash SHA-256 (por privacidad/GDPR)
  const rawIp = request.rawRequest?.ip || request.rawRequest?.headers["x-forwarded-for"] || "127.0.0.1";
  const ip = Array.isArray(rawIp) ? rawIp[0] : rawIp;
  const ipHash = crypto.createHash("sha256").update(ip).digest("hex");

  const now = Timestamp.now();
  const attemptsRef = db.collection("login_attempts").doc(ipHash);
  const attemptDoc = await attemptsRef.get();

  // 2. Verificar si la IP está bloqueada por demasiados intentos fallidos
  if (attemptDoc.exists) {
    const data = attemptDoc.data();
    if (data && data.blockedUntil) {
      const blockedUntil = data.blockedUntil;
      if (blockedUntil.toMillis() > now.toMillis()) {
        const remainingSec = Math.ceil((blockedUntil.toMillis() - now.toMillis()) / 1000);
        throw new HttpsError(
          "resource-exhausted",
          `Demasiados intentos fallidos. Acceso bloqueado temporalmente por IP. Inténtalo de nuevo en ${remainingSec} segundos.`
        );
      }
    }
  }

  // 3. Obtener el Passcode configurado (secreto en el servidor)
  const CONFIG_PASSCODE = process.env.APP_PASSCODE;

  if (passcode.trim() === CONFIG_PASSCODE) {
    // Éxito: Limpiar los intentos previos para esta IP
    if (attemptDoc.exists) {
      await attemptsRef.delete();
    }
    return { success: true };
  } else {
    // Fallo: Incrementar contador de intentos y bloquear si es necesario
    let attempts = 1;
    let blockedUntil = null;

    if (attemptDoc.exists) {
      const data = attemptDoc.data();
      attempts = (data?.attempts || 0) + 1;
    }

    if (attempts >= 5) {
      // Bloquear la IP por 5 minutos (300,000 ms)
      const blockDurationMs = 5 * 60 * 1000;
      blockedUntil = Timestamp.fromMillis(now.toMillis() + blockDurationMs);
    }

    await attemptsRef.set({
      attempts,
      lastAttemptAt: now,
      blockedUntil
    }, { merge: true });

    const remainingAttempts = Math.max(0, 5 - attempts);
    const errorMsg = remainingAttempts > 0
      ? `Código de acceso incorrecto. Te quedan ${remainingAttempts} intentos.`
      : "Código de acceso incorrecto. Has superado el límite de intentos. Tu IP ha sido bloqueada por 5 minutos.";

    throw new HttpsError("permission-denied", errorMsg);
  }
});
