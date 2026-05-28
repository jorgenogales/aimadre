import { initParticles } from "./particles.js";
import { db, functions } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// ============================================================================
// CONFIGURACIÓN DE MODO DEMO:
// Cambia a 'true' para desactivar por completo la pantalla de código de acceso.
// ============================================================================
const BYPASS_PASSCODE_DEMO = true;



// 2. Selectores de Elementos de la Interfaz (SPA)
const mainCard = document.getElementById("main-card");
const viewLogin = document.getElementById("view-login");
const viewOnboarding = document.getElementById("view-onboarding");
const viewPrompt = document.getElementById("view-prompt");
const viewResult = document.getElementById("view-result");

// Selectores para Login
const passcodeInput = document.getElementById("passcode-input");
const btnLogin = document.getElementById("btn-login");
const loginErrorMsg = document.getElementById("login-error-msg");

// Inputs y Formularios
const nicknameInput = document.getElementById("nickname-input");
const promptInput = document.getElementById("prompt-input");
// Botones y Spinners
const btnJoin = document.getElementById("btn-join");
const btnSubmitPrompt = document.getElementById("btn-submit-prompt");
const btnRetry = document.getElementById("btn-retry");

// Panel de Veredicto
const verdictStatus = document.getElementById("verdict-status");
const sarcasmContent = document.getElementById("sarcasm-content");

// 3. Función para Navegación entre Pantallas de la SPA
function switchView(targetView) {
  // Ocultar todas las vistas
  [viewLogin, viewOnboarding, viewPrompt, viewResult].forEach(v => {
    if (v) v.classList.remove("active");
  });

  // Limpiar estilos de resultado del contenedor principal
  mainCard.classList.remove("approved", "rejected");

  // Mostrar la vista objetivo con un ligero retraso para animar
  setTimeout(() => {
    if (targetView) targetView.classList.add("active");
  }, 50);
}

// 4. Utilidades: Generar Código de Usuario Unico (AILIVE-XXXX)
function generateUserCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `AILIVE-${code}`;
}

// 5. Utilidades: Animación de Máquina de Escribir Incremental (Typewriter)
function typeWriter(element, text, speed = 25) {
  element.innerHTML = "";
  let i = 0;

  // Insertar cursor parpadeante retro
  const cursor = document.createElement("span");
  cursor.className = "cursor-terminal";
  element.appendChild(cursor);

  return new Promise((resolve) => {
    function type() {
      if (i < text.length) {
        const char = document.createTextNode(text.charAt(i));
        element.insertBefore(char, cursor);
        i++;
        setTimeout(type, speed);
      } else {
        resolve();
      }
    }
    type();
  });
}

// 6. Utilidades: Animación Confetti Antigravedad (Sube verticalmente)
function launchAntiGravityConfetti() {
  const container = document.body;
  const colors = [
    "hsl(184, 100%, 50%)", // Cian neón
    "hsl(270, 100%, 60%)", // Morado neón
    "hsl(140, 100%, 48%)", // Verde neón
    "hsl(330, 100%, 55%)", // Magenta neón
    "linear-gradient(135deg, #00f2fe, #4facfe)"
  ];

  for (let i = 0; i < 40; i++) {
    const confettiPiece = document.createElement("div");
    confettiPiece.className = "confetti";

    // Distribución horizontal aleatoria
    confettiPiece.style.left = `${Math.random() * 100}vw`;
    confettiPiece.style.bottom = "-20px";

    // Seleccionar color o gradiente aleatorio
    const color = colors[Math.floor(Math.random() * colors.length)];
    if (color.startsWith("linear-gradient")) {
      confettiPiece.style.background = color;
    } else {
      confettiPiece.style.backgroundColor = color;
    }

    // Variación física de tamaño y animación
    const size = Math.random() * 8 + 4;
    confettiPiece.style.width = `${size}px`;
    confettiPiece.style.height = `${size}px`;
    confettiPiece.style.animationDelay = `${Math.random() * 0.4}s`;
    confettiPiece.style.animationDuration = `${Math.random() * 1.5 + 1.8}s`;

    container.appendChild(confettiPiece);

    // Limpieza automática del DOM
    setTimeout(() => {
      confettiPiece.remove();
    }, 3500);
  }
}

// 7. Lógica: Sincronización de Badges y Persistencia de Sesión (LocalStorage)
function updateUserBadges(username, code) {
  const nickPrompt = document.getElementById("player-nickname-prompt");
  const codePrompt = document.getElementById("player-code-prompt");
  const nickResult = document.getElementById("player-nickname-result");
  const codeResult = document.getElementById("player-code-result");

  if (nickPrompt) nickPrompt.textContent = username;
  if (codePrompt) codePrompt.textContent = code;
  if (nickResult) nickResult.textContent = username;
  if (codeResult) codeResult.textContent = code;
}

function checkLocalSession() {
  const isUnlocked = BYPASS_PASSCODE_DEMO || localStorage.getItem("amp_unlocked") === "true";

  if (!isUnlocked) {
    switchView(viewLogin);
    return;
  }

  const storedUser = localStorage.getItem("amp_username");
  const storedCode = localStorage.getItem("amp_usercode");
  const storedId = localStorage.getItem("amp_userid");

  if (storedUser && storedCode && storedId) {
    updateUserBadges(storedUser, storedCode);
    switchView(viewPrompt);
  } else {
    switchView(viewOnboarding);
  }
}

// 8. Evento: Registro / Alta (Onboarding)
async function handleOnboarding() {
  const nickname = nicknameInput.value.trim();
  if (nickname.length < 2) {
    alert("Por favor ingresa un apodo de al menos 2 caracteres.");
    return;
  }

  // Activar estado de carga del botón
  btnJoin.classList.add("loading");
  btnJoin.disabled = true;

  try {
    let generatedCode;
    let isUnique = false;
    let attempts = 0;

    // Generar y verificar código único en Firestore (máximo 5 intentos)
    while (!isUnique && attempts < 5) {
      generatedCode = generateUserCode();
      const q = query(collection(db, "users"), where("uniqueCode", "==", generatedCode));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        isUnique = true;
      } else {
        attempts++;
        console.warn(`Código duplicado detectado: ${generatedCode}. Intentando otro...`);
      }
    }

    if (!isUnique) {
      throw new Error("No se pudo generar un código de participante único. Inténtalo de nuevo.");
    }

    // Registrar el usuario en Cloud Firestore
    const userDocRef = await addDoc(collection(db, "users"), {
      username: nickname,
      uniqueCode: generatedCode,
      createdAt: serverTimestamp()
    });

    // Guardar sesión de forma local
    localStorage.setItem("amp_username", nickname);
    localStorage.setItem("amp_usercode", generatedCode);
    localStorage.setItem("amp_userid", userDocRef.id);

    // Sincronizar UI y transicionar
    updateUserBadges(nickname, generatedCode);
    nicknameInput.value = "";

    setTimeout(() => {
      btnJoin.classList.remove("loading");
      btnJoin.disabled = false;
      switchView(viewPrompt);
    }, 400);

  } catch (error) {
    console.error("Error en registro de onboarding:", error);
    alert("Fallo al registrar participante. Verifica la conexión a la base de datos.");
    btnJoin.classList.remove("loading");
    btnJoin.disabled = false;
  }
}

btnJoin.addEventListener("click", handleOnboarding);
nicknameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleOnboarding();
});

// 9. Evento: Envío de Prompt al Servidor para Evaluación por la IA
async function handleSubmitPrompt() {
  const text = promptInput.value.trim();
  if (text.length < 10) {
    alert("Vaya creatividad la tuya... Escribe un prompt de al menos 10 caracteres.");
    return;
  }

  // Obtener metadata del LocalStorage
  const username = localStorage.getItem("amp_username");
  const userCode = localStorage.getItem("amp_usercode");
  const userId = localStorage.getItem("amp_userid");

  if (!username || !userCode || !userId) {
    alert("La sesión expiró. Por favor vuelve a registrar tu apodo.");
    switchView(viewOnboarding);
    return;
  }

  // Configurar estado de carga en el botón
  btnSubmitPrompt.classList.add("loading");
  btnSubmitPrompt.disabled = true;

  try {
    // Instanciar la Cloud Function remota o local segura (submitPrompt)
    const submitPromptFn = httpsCallable(functions, "PBsubmitPrompt");

    const result = await submitPromptFn({
      promptText: text,
      userId,
      username,
      userCode
    });

    const { success, comment } = result.data;

    // Transicionar a la pantalla de resultados
    switchView(viewResult);

    if (success) {
      // Prompt aprobado por Gemini
      mainCard.classList.add("approved");
      verdictStatus.textContent = "Gemini Aprueba";

      // Lanzar confeti antigravedad
      launchAntiGravityConfetti();
    } else {
      // Prompt rechazado por la IA
      mainCard.classList.add("rejected");
      verdictStatus.textContent = "Rechazado sin Piedad";
    }

    // Ejecutar el efecto de máquina de escribir para el sarcasmo
    await typeWriter(sarcasmContent, comment, 20);

  } catch (error) {
    console.error("Error al procesar el prompt:", error);
    alert(`Error de procesamiento: ${error.message || "Fallo en la comunicación con la función de la IA."}`);
  } finally {
    btnSubmitPrompt.classList.remove("loading");
    btnSubmitPrompt.disabled = false;
  }
}

btnSubmitPrompt.addEventListener("click", handleSubmitPrompt);
promptInput.addEventListener("keydown", (e) => {
  // Permite enviar presionando Ctrl+Enter o Cmd+Enter
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    handleSubmitPrompt();
  }
});

// 10. Eventos de la Vista de Resultado
btnRetry.addEventListener("click", () => {
  promptInput.value = "";
  switchView(viewPrompt);
});

// 11. Eventos y Lógica de Login Seguro
async function handleLogin() {
  const passcode = passcodeInput.value.trim();
  if (passcode.length === 0) {
    showLoginError("Por favor, introduce el código de acceso.");
    triggerLoginShake();
    return;
  }

  // Limpiar errores e inputs
  loginErrorMsg.classList.remove("visible");
  passcodeInput.classList.remove("input-error");

  btnLogin.classList.add("loading");
  btnLogin.disabled = true;

  try {
    const verifyPasscodeFn = httpsCallable(functions, "PBverifyPasscode");
    const result = await verifyPasscodeFn({ passcode });

    if (result.data && result.data.success) {
      localStorage.setItem("amp_unlocked", "true");

      // Destello verde neón para indicar éxito interactivo
      mainCard.style.borderColor = "var(--neon-green)";
      mainCard.style.boxShadow = "0 0 30px var(--neon-green-glow)";

      setTimeout(() => {
        mainCard.style.borderColor = "";
        mainCard.style.boxShadow = "";

        // Comprobar si ya existe una sesión previa de participante
        const storedUser = localStorage.getItem("amp_username");
        const storedCode = localStorage.getItem("amp_usercode");
        const storedId = localStorage.getItem("amp_userid");

        if (storedUser && storedCode && storedId) {
          updateUserBadges(storedUser, storedCode);
          switchView(viewPrompt);
        } else {
          switchView(viewOnboarding);
        }
      }, 500);
    }
  } catch (error) {
    console.error("Error al validar passcode:", error);
    const errorMsg = error.message || "Código de acceso incorrecto. Inténtalo de nuevo.";
    showLoginError(errorMsg);
    triggerLoginShake();
  } finally {
    btnLogin.classList.remove("loading");
    btnLogin.disabled = false;
  }
}

function showLoginError(msg) {
  loginErrorMsg.textContent = msg;
  loginErrorMsg.classList.add("visible");
  passcodeInput.classList.add("input-error");
}

function triggerLoginShake() {
  viewLogin.classList.add("shake");
  setTimeout(() => {
    viewLogin.classList.remove("shake");
  }, 500);
}

btnLogin.addEventListener("click", handleLogin);
passcodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});

// 1. Inicializar el Fondo de Partículas Antigravedad
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

function initApp() {
  initParticles("particles-canvas");
  checkLocalSession();
}


