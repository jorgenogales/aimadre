import { db, functions } from "./firebase-config.js";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// ============================================================================
// VARIABLES DE ESTADO LOCAL
// ============================================================================
let completedPrompts = [];     // Listado total de prompts con status == 'completed'
let currentUserVotes = [];     // Array de promptIds votados por el usuario actual
let currentHeroId = null;      // ID de la obra actualmente destacada en el Hero
let heroTimer = null;          // Identificador del temporizador de 5 segundos
let isVotingInFlight = false;  // Evita colisiones de clicks múltiples durante llamadas RPC

const userId = localStorage.getItem("amp_userid");
const username = localStorage.getItem("amp_username");
const userCode = localStorage.getItem("amp_usercode");

// ============================================================================
// ELEMENTOS DEL DOM
// ============================================================================
const heroDisplay = document.getElementById("hero-display");
const heroBg = document.getElementById("hero-bg");
const heroTitle = document.getElementById("hero-title");
const heroPrompt = document.getElementById("hero-prompt");
const heroAuthor = document.getElementById("hero-author");
const heroTime = document.getElementById("hero-time");
const heroVotesCount = document.getElementById("hero-votes-count");
const heroVoteBtn = document.getElementById("hero-vote-btn");
const heroProgress = document.getElementById("hero-progress");

const galleryGrid = document.getElementById("gallery-grid");
const galleryCountBadge = document.getElementById("gallery-count-badge");

const sessionBadge = document.getElementById("session-badge");
const badgeUsername = document.getElementById("badge-username");
const badgeVotesLeft = document.getElementById("badge-votes-left");

const fullscreenOverlay = document.getElementById("fullscreen-overlay");
const fullscreenImg = document.getElementById("fullscreen-img");
const fullscreenPromptText = document.getElementById("fullscreen-prompt-text");
const fullscreenCommentText = document.getElementById("fullscreen-comment-text");
const fullscreenAuthorTag = document.getElementById("fullscreen-author-tag");
const fullscreenTimeTag = document.getElementById("fullscreen-time-tag");
const closeFullscreenBtn = document.getElementById("close-fullscreen-btn");

const loginModal = document.getElementById("login-modal");
const closeLoginModalBtn = document.getElementById("close-login-modal-btn");

// ============================================================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ============================================================================
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

function initApp() {
  initSession();
  initFirestoreListener();
  setupEventListeners();
}

// ============================================================================
// LÓGICA DE SESIÓN (REAL-TIME USER WATCHER)
// ============================================================================
function initSession() {
  if (userId && username && userCode) {
    // El usuario está registrado. Mostramos el badge y nos suscribimos a su documento
    sessionBadge.classList.remove("hidden");
    badgeUsername.textContent = username;

    onSnapshot(doc(db, "users", userId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        currentUserVotes = data.votedPromptIds || [];
        
        // Actualizar el número de votos disponibles en la barra superior
        const votesLeft = Math.max(0, 3 - currentUserVotes.length);
        badgeVotesLeft.textContent = `${votesLeft} VOTOS RESTANTES`;
        
        if (votesLeft === 0) {
          badgeVotesLeft.className = "bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded text-[10px] font-bold";
        } else {
          badgeVotesLeft.className = "bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold";
        }

        // Re-renderizar la galería para refrescar el estado activo de los botones de upvote
        renderGalleryGrid();
        updateHeroVoteButtonState();
      }
    });
  } else {
    // Modo Espectador (No registrado)
    sessionBadge.classList.add("hidden");
    renderGalleryGrid();
  }
}

// ============================================================================
// LÓGICA DE FIRESTORE (REAL-TIME GALLERY)
// ============================================================================
function initFirestoreListener() {
  const promptsRef = collection(db, "prompts");
  
  // Escuchamos en tiempo real cualquier cambio en la colección prompts
  onSnapshot(promptsRef, (querySnapshot) => {
    const list = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.status === "completed") {
        list.push({
          id: doc.id,
          ...data,
          // Fallback seguro si createdAt no se ha establecido aún en el servidor
          createdAt: data.createdAt ? data.createdAt.toMillis() : Date.now()
        });
      }
    });

    // Ordenamiento: 1. Votos descendente. 2. Fecha de creación ascendente (el primero que entra gana ante empates)
    list.sort((a, b) => {
      const voteDiff = (b.votes || 0) - (a.votes || 0);
      if (voteDiff !== 0) return voteDiff;
      return a.createdAt - b.createdAt;
    });

    completedPrompts = list;
    galleryCountBadge.textContent = `${completedPrompts.length} IMÁGENES`;

    // FLIP transition reordering & rendering
    animateAndRenderGallery();

    // Si no hay ningún hero seleccionado, o el hero activo ya no existe en la lista, elegimos uno
    if (completedPrompts.length > 0) {
      const stillExists = completedPrompts.some(p => p.id === currentHeroId);
      if (!currentHeroId || !stillExists) {
        cycleHeroFeaturedImage(true); // Elegir de forma inmediata
      } else {
        // Si ya existe, actualizamos solo sus datos dinámicos (como el número de votos)
        const currentHeroData = completedPrompts.find(p => p.id === currentHeroId);
        if (currentHeroData) {
          heroVotesCount.textContent = currentHeroData.votes || 0;
        }
      }
    } else {
      resetHeroPlaceholder();
    }
  });
}

// ============================================================================
// TRANSICIONES DE MOVIMIENTO PREMIUM (ALGORITMO FLIP)
// ============================================================================
function animateAndRenderGallery() {
  // 1. FIRST: Capturar las posiciones iniciales de los elementos en el DOM antes del cambio
  const initialPositions = {};
  const cards = galleryGrid.querySelectorAll(".cinematic-card");
  cards.forEach(card => {
    const id = card.dataset.id;
    if (id) {
      initialPositions[id] = card.getBoundingClientRect();
    }
  });

  // 2. RENDER: Construir e inyectar el nuevo DOM ordenado
  renderGalleryGrid();

  // 3. LAST & INVERT & PLAY: Animamos el deslizamiento
  requestAnimationFrame(() => {
    const newCards = galleryGrid.querySelectorAll(".cinematic-card");
    newCards.forEach(card => {
      const id = card.dataset.id;
      const initialPos = initialPositions[id];

      if (initialPos) {
        // Capturamos la posición final (Last)
        const finalPos = card.getBoundingClientRect();

        // Calculamos la inversión (Invert)
        const dx = initialPos.left - finalPos.left;
        const dy = initialPos.top - finalPos.top;

        if (dx !== 0 || dy !== 0) {
          // Desactivar transiciones e invertir instantáneamente
          card.style.transform = `translate(${dx}px, ${dy}px)`;
          card.style.transition = "none";

          // Play: Habilitar de nuevo la transición y animar de vuelta a 0,0
          requestAnimationFrame(() => {
            card.classList.add("flip-transitioning");
            card.style.transform = "translate(0, 0)";
          });
        }
      } else {
        // Es un elemento nuevo: Lo animamos con un sutil fundido de entrada (Fade In)
        card.style.opacity = "0";
        card.style.transform = "scale(0.95)";
        requestAnimationFrame(() => {
          card.classList.add("flip-transitioning");
          card.style.opacity = "1";
          card.style.transform = "scale(1)";
        });
      }
    });
  });
}

// ============================================================================
// RENDERIZADO DE TARJETAS EN EL GRID
// ============================================================================
function renderGalleryGrid() {
  // Guardamos una referencia para saber si inyectar la tarjeta de registro anónimo
  const showRegistrationCard = !userId;
  
  let htmlContent = "";

  // 1. Si no hay sesión, inyectamos la tarjeta de bienvenida destacada en la primera posición
  if (showRegistrationCard) {
    htmlContent += `
      <div class="notice-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between min-h-[220px] sm:min-h-0 sm:aspect-[16/9] border border-dashed border-primary/40 relative overflow-hidden group">
        <div class="absolute -top-10 -right-10 w-24 h-24 bg-primary/10 rounded-full blur-2xl"></div>
        <div>
          <span class="bg-primary/20 text-primary font-label-sm text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-3 sm:mb-4 inline-block">Mesa de Control</span>
          <h4 class="text-lg sm:text-xl font-bold text-white mb-1.5 sm:mb-2 leading-tight">¿Quieres votar tus imágenes favoritas?</h4>
          <p class="text-xs text-on-surface-variant leading-relaxed line-clamp-3 sm:line-clamp-4">
            Identifícate en la app prompter para participar. Los 3 votos que emitas decidirán al ganador del gran premio del prompt de hoy.
          </p>
        </div>
        <div class="flex items-center justify-between gap-4 border-t border-white/5 pt-3 sm:pt-4 mt-2">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-xl">qr_code_2</span>
            <span class="text-[10px] font-label-sm text-on-surface-variant">ESCANEAR / ENLAZAR</span>
          </div>
          <a class="bg-primary text-on-primary font-label-sm text-[11px] font-bold px-4 py-2 rounded-lg hover:brightness-110 active:scale-95 transition-all" href="/prompter/index.html">
            IDENTIFICARSE
          </a>
        </div>
      </div>
    `;
  }

  // 2. Inyectar las tarjetas de imágenes procesadas
  completedPrompts.forEach((prompt, index) => {
    const isVoted = currentUserVotes.includes(prompt.id);
    const voteBtnClass = isVoted ? "voted-active" : "";
    const voteIcon = isVoted ? "thumb_up" : "thumb_up"; // FILL 1 vs 0 manejado por clase
    const voteIconStyle = isVoted ? "font-variation-settings: 'FILL' 1;" : "font-variation-settings: 'FILL' 0;";

    // Formatear la fecha
    const dateObj = new Date(prompt.createdAt);
    const formattedTime = `${dateObj.getDate()} de ${dateObj.toLocaleString('es-ES', { month: 'short' })} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;

    htmlContent += `
      <div class="cinematic-card rounded-2xl border border-white/5 overflow-hidden group/card flex flex-col justify-end cursor-pointer" data-id="${prompt.id}" style="aspect-ratio: 16/9;" onclick="openFullscreen('${prompt.id}')">
        <!-- Background Image -->
        <div class="absolute inset-0 bg-cover bg-center card-img-zoom" style="background-image: url('${prompt.imageUrl}');"></div>
        <div class="absolute inset-0 glass-overlay opacity-85 group-hover/card:opacity-90 transition-opacity"></div>
        
        <!-- Metadata Overlay (Visible de forma permanente / Mejorado en hover) -->
        <div class="absolute inset-x-0 bottom-0 p-4 sm:p-5 flex justify-between items-end z-20">
          <div class="max-w-[70%] sm:max-w-[72%]">
            <span class="text-[11px] font-bold text-primary mb-1 block uppercase tracking-wider font-label-sm truncate">@${prompt.username}</span>
            <h4 class="text-sm sm:text-base font-bold text-white mb-0.5 line-clamp-1 group-hover/card:text-primary transition-colors">${prompt.promptText}</h4>
            <p class="text-[10px] text-on-surface-variant/70 italic line-clamp-1 mb-1 group-hover/card:line-clamp-none transition-all">"${prompt.comment || ''}"</p>
            <p class="text-[9px] text-on-surface-variant/40 font-label-sm uppercase tracking-tighter">${formattedTime}</p>
          </div>
          
          <!-- Upvote Action -->
          <div class="flex flex-col items-center gap-1 bg-black/30 p-1.5 sm:p-2 rounded-xl border border-white/5 backdrop-blur-sm min-w-[50px] sm:min-w-[56px]" onclick="event.stopPropagation()">
            <span class="text-xs font-bold text-white font-label-sm">${prompt.votes || 0}</span>
            <button class="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/5 border border-white/10 text-on-surface-variant flex items-center justify-center upvote-btn-glow ${voteBtnClass}" onclick="handleVoteClick('${prompt.id}')">
              <span class="material-symbols-outlined text-[14px] sm:text-[16px]" style="${voteIconStyle}">${voteIcon}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  // Si no hay obras y estamos logados, mostramos un placeholder amigable
  if (completedPrompts.length === 0 && userId) {
    htmlContent = `
      <div class="col-span-full py-20 text-center bg-surface-container-lowest/30 rounded-2xl border border-white/5 p-8 max-w-lg mx-auto">
        <span class="material-symbols-outlined text-primary text-5xl mb-4 animate-pulse">landscape_2</span>
        <h4 class="text-xl font-bold text-white mb-2">La galería está vacía</h4>
        <p class="text-sm text-on-surface-variant mb-6">Sé el primero en el evento en generar una increíble obra de arte con la IA.</p>
        <a class="bg-primary text-on-primary font-bold px-6 py-2.5 rounded-full text-xs" href="/prompter/index.html">
          CREAR UN PROMPT AHORA
        </a>
      </div>
    `;
  }

  galleryGrid.innerHTML = htmlContent;
}

// ============================================================================
// LÓGICA DE ROTACIÓN DE HERO IMAGEN (CARRUSEL INMERSIÓN 5s)
// ============================================================================
function cycleHeroFeaturedImage(immediate = false) {
  if (completedPrompts.length === 0) {
    resetHeroPlaceholder();
    return;
  }

  // Si hay imágenes, elegimos una aleatoria
  let candidate = null;
  if (completedPrompts.length === 1) {
    candidate = completedPrompts[0];
  } else {
    // Evitamos repetir la imagen actual si hay más opciones
    const otherPrompts = completedPrompts.filter(p => p.id !== currentHeroId);
    candidate = otherPrompts[Math.floor(Math.random() * otherPrompts.length)];
  }

  if (!candidate) return;

  const performUpdate = () => {
    currentHeroId = candidate.id;
    
    // Cambiar la imagen con transición de zoom ligera
    heroBg.style.transform = "scale(1.05)";
    heroBg.style.backgroundImage = `url('${candidate.imageUrl}')`;
    
    // Actualizar metadata
    heroTitle.textContent = candidate.promptText;
    heroPrompt.textContent = candidate.comment ? `"${candidate.comment}"` : "Procesado correctamente por Gemini.";
    heroAuthor.textContent = `Autor: @${candidate.username}`;
    
    // Formatear hora de creación
    const dateObj = new Date(candidate.createdAt);
    const formattedTime = `${dateObj.getDate()} de ${dateObj.toLocaleString('es-ES', { month: 'short' })} a las ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
    heroTime.textContent = `${candidate.userCode} • ${formattedTime}`;
    heroVotesCount.textContent = candidate.votes || 0;
    
    updateHeroVoteButtonState();

    // Zoom sutil continuo
    setTimeout(() => {
      heroBg.style.transform = "scale(1)";
    }, 50);

    // Reiniciar barra de progreso lineal (Inicia animación CSS de 5 segundos)
    resetProgressBarAnimation();
  };

  if (immediate) {
    performUpdate();
  } else {
    // Fundido out/in simulado aplicando una clase temporal de desvanecimiento
    heroDisplay.style.opacity = "0.8";
    setTimeout(() => {
      performUpdate();
      heroDisplay.style.opacity = "1";
    }, 300);
  }

  // Planificar la siguiente rotación para dentro de 5 segundos exactos
  if (heroTimer) clearTimeout(heroTimer);
  heroTimer = setTimeout(() => {
    cycleHeroFeaturedImage(false);
  }, 5000);
}

function updateHeroVoteButtonState() {
  if (!currentHeroId) return;
  const isVoted = currentUserVotes.includes(currentHeroId);
  if (isVoted) {
    heroVoteBtn.className = "w-12 h-12 rounded-full voted-active text-on-secondary flex items-center justify-center upvote-btn-glow";
  } else {
    heroVoteBtn.className = "w-12 h-12 rounded-full bg-primary/20 border border-primary/30 text-primary flex items-center justify-center upvote-btn-glow";
  }
}

function resetHeroPlaceholder() {
  currentHeroId = null;
  heroBg.style.backgroundImage = "none";
  heroTitle.textContent = "AI Live Madrid Gallery";
  heroPrompt.textContent = "Genera un prompt y observa cómo la IA procesa la imagen para verla en vivo aquí.";
  heroAuthor.textContent = "Curador: @gemini_live";
  heroTime.textContent = "AILIVE-PRESETS";
  heroVotesCount.textContent = "0";
  heroProgress.style.transition = "none";
  heroProgress.style.width = "0%";
  if (heroTimer) clearTimeout(heroTimer);
}

function resetProgressBarAnimation() {
  heroProgress.style.transition = "none";
  heroProgress.style.width = "0%";
  
  // Forzar reflow en el navegador para que detecte el cambio de transición
  void heroProgress.offsetWidth;
  
  // Aplicar ancho final con transición lineal exacta de 5000ms
  heroProgress.style.transition = "width 5000ms linear";
  heroProgress.style.width = "100%";
}

// ============================================================================
// CONTROLADOR TRANSACCIONAL DE VOTACIÓN (MÉTODO SEGURO)
// ============================================================================
window.handleVoteClick = async function(promptId) {
  if (isVotingInFlight) return; // Evita el spam de clicks rápidos

  // 1. Validar que el usuario esté identificado
  if (!userId) {
    openLoginModal();
    return;
  }

  const isVoted = currentUserVotes.includes(promptId);
  const action = isVoted ? "downvote" : "upvote";

  // 2. Si es upvote, comprobar que no haya alcanzado ya el límite de 3 votos
  if (action === "upvote" && currentUserVotes.length >= 3) {
    alert("¡Límite de votos alcanzado! Ya has emitido tus 3 votos permitidos. Puedes retirar un voto pulsando en una imagen ya votada para liberar saldo.");
    return;
  }

  // Activar flag de bloqueo y feedback háptico/visual (opacidad temporal)
  isVotingInFlight = true;
  document.body.style.cursor = "wait";

  try {
    const votePromptFn = httpsCallable(functions, "votePrompt");
    const response = await votePromptFn({
      promptId,
      userId,
      action
    });

    if (response.data && response.data.success) {
      console.log(`🗳️ Transacción de voto completada para promptId: ${promptId}, action: ${action}`);
    }
  } catch (error) {
    console.error("🔴 Fallo en la llamada a la Cloud Function de votos:", error);
    alert(error.message || "Fallo de conexión. No se pudo procesar tu voto.");
  } finally {
    isVotingInFlight = false;
    document.body.style.cursor = "default";
  }
};

// ============================================================================
// CONFIGURACIÓN DE EVENT LISTENERS (UI INTERACTIONS)
// ============================================================================
function setupEventListeners() {
  // Click en el upvote del Hero principal
  heroVoteBtn.addEventListener("click", () => {
    if (currentHeroId) {
      handleVoteClick(currentHeroId);
    }
  });

  // Modal Login / Registro
  closeLoginModalBtn.addEventListener("click", closeLoginModal);
  loginModal.addEventListener("click", (e) => {
    if (e.target === loginModal) closeLoginModal();
  });

  // Modal Fullscreen
  closeFullscreenBtn.addEventListener("click", closeFullscreen);
  fullscreenOverlay.addEventListener("click", (e) => {
    if (e.target === fullscreenOverlay) closeFullscreen();
  });

  // Soporte para cerrar modales con la tecla Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeFullscreen();
      closeLoginModal();
    }
  });
}

// ============================================================================
// FUNCIONES AUXILIARES DE UI (MODALES)
// ============================================================================
window.openFullscreen = function(promptId) {
  const prompt = completedPrompts.find(p => p.id === promptId);
  if (!prompt) return;

  fullscreenImg.src = prompt.imageUrl;
  fullscreenPromptText.textContent = `"${prompt.promptText}"`;
  fullscreenCommentText.textContent = prompt.comment ? `Gemini dice: ${prompt.comment}` : "";
  fullscreenAuthorTag.textContent = `@${prompt.username}`;
  fullscreenTimeTag.textContent = prompt.userCode || "AILIVE-PARTICIPANT";

  fullscreenOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden"; // Bloquea scroll de fondo
};

function closeFullscreen() {
  fullscreenOverlay.classList.add("hidden");
  document.body.style.overflow = "auto";
}

function openLoginModal() {
  loginModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeLoginModal() {
  loginModal.classList.add("hidden");
  document.body.style.overflow = "auto";
}
