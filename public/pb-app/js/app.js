import { functions, httpsCallable } from "./firebase-config.js";

// State Management
let state = {
  userId: "",
  votedPromptIds: [],
  prompts: [],
  activeCarouselIndex: 0,
  isGalleryMode: false,
  carouselTimer: null,
  carouselProgressInterval: null,
  carouselProgress: 0,
  refreshInterval: null
};

// Elements
const el = {
  body: document.body,
  votesRemaining: document.getElementById("votes-remaining"),
  loadingScreen: document.getElementById("loading-screen"),
  galleryView: document.getElementById("gallery-view"),
  votingView: document.getElementById("voting-view"),
  promptsGrid: document.getElementById("prompts-grid"),
  noPromptsState: document.getElementById("no-prompts-state"),
  carouselContainer: document.getElementById("carousel-container"),
  carouselTimerBar: document.getElementById("carousel-timer-bar"),
  toast: document.getElementById("toast")
};

// Consts
const CAROUSEL_ROTATION_MS = 5000;
const VOTE_LIMIT = 3;

/**
 * Initializes the Client Application
 */
async function init() {
  console.log("🚀 Initializing AI Qué Bonito! Client...");
  
  // 1. Resolve or generate anonymous User ID
  resolveUserId();

  // 2. Determine View Mode based on query parameter (?mode=gallery)
  const urlParams = new URLSearchParams(window.location.search);
  state.isGalleryMode = urlParams.get("mode") === "gallery";

  // Apply body classes and activate respective sections
  if (state.isGalleryMode) {
    el.body.classList.add("mode-gallery");
    el.galleryView.classList.add("active");
    el.votingView.classList.remove("active");
  } else {
    el.body.classList.remove("mode-gallery");
    el.votingView.classList.add("active");
    el.galleryView.classList.remove("active");
    renderVotingIntro();
  }

  // 3. Initial load of prompts
  await loadPrompts();

  // Hide loading spinner
  el.loadingScreen.classList.remove("active");
  el.body.classList.remove("loading");

  // 4. Start view-specific intervals
  if (state.isGalleryMode) {
    startGalleryCarousel();
    // Refresh database contents every 5 seconds to keep carousel updated with new images
    state.refreshInterval = setInterval(loadPrompts, 5000);
  } else {
    // In voting mode, refresh images list every 5 seconds to fetch newly approved prompts
    state.refreshInterval = setInterval(loadPrompts, 5000);
  }

  // 5. Fullscreen modal and image click handlers
  if (state.isGalleryMode) {
    el.carouselContainer.addEventListener("click", (e) => {
      const imgArea = e.target.closest(".wide-image-area");
      if (imgArea) {
        const img = imgArea.querySelector(".wide-image");
        if (img) {
          openFullscreenModal(img.src, state.prompts[state.activeCarouselIndex]);
        }
      }
    });
  } else {
    el.promptsGrid.addEventListener("click", (e) => {
      const imgWrapper = e.target.closest(".card-image-wrapper");
      if (imgWrapper) {
        const card = imgWrapper.closest(".prompt-card");
        if (card) {
          const promptId = card.getAttribute("data-id");
          const prompt = state.prompts.find(p => p.id === promptId);
          const img = imgWrapper.querySelector(".card-image");
          if (prompt && img) {
            openFullscreenModal(img.src, prompt);
          }
        }
      }
    });
  }

  const modal = document.getElementById("fullscreen-modal");
  const modalClose = document.getElementById("modal-close");
  if (modalClose) {
    modalClose.addEventListener("click", closeFullscreenModal);
  }
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeFullscreenModal();
      }
    });
  }
}

/**
 * Resolves or generates a unique user ID and syncs voted IDs with localStorage
 */
function resolveUserId() {
  // Check for the Prompter user ID in the shared localStorage
  let uId = localStorage.getItem("amp_userid");
  state.userId = uId;

  // Load votes registered on this device
  if (state.userId) {
    const cachedVotes = localStorage.getItem(`ai_qb_votes_${state.userId}`);
    state.votedPromptIds = cachedVotes ? JSON.parse(cachedVotes) : [];
  } else {
    state.votedPromptIds = [];
  }
  updateVoteCounter();
}

/**
 * Generates a pseudo-UUID v4
 */
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Calls the getProcessedPrompts Cloud Function to load completed prompts
 */
async function loadPrompts() {
  try {
    const getProcessedPromptsFn = httpsCallable(functions, "getProcessedPrompts");
    const response = await getProcessedPromptsFn();

    if (response?.data?.success && response.data.prompts) {
      state.prompts = response.data.prompts;
      console.log(`Successfully fetched ${state.prompts.length} processed prompts from database.`);
      
      if (state.isGalleryMode) {
        // Safe check for carousel index out of bounds after database refresh
        if (state.activeCarouselIndex >= state.prompts.length) {
          state.activeCarouselIndex = 0;
        }
      } else {
        renderVotingGrid();
      }
    } else {
      console.warn("getProcessedPrompts returned unsuccessful response:", response);
    }
  } catch (error) {
    console.error("Error loading prompts from Cloud Function:", error);
    showToast("Error al conectar con el servidor. Reintentando...", "error");
  }
}

/* -------------------------------------------------------------
 * VOTING VIEW LOGIC (Mobile & Interactions)
 * ------------------------------------------------------------- */

/**
 * Renders the prompts grid for attendees to view and upvote
 */
function renderVotingGrid() {
  if (state.prompts.length === 0) {
    el.promptsGrid.innerHTML = "";
    el.noPromptsState.classList.add("active");
    return;
  }

  el.noPromptsState.classList.remove("active");
  const hasReachedLimit = state.votedPromptIds.length >= VOTE_LIMIT;
  const isRegistered = !!state.userId;

  const html = state.prompts.map((prompt) => {
    const isVoted = state.votedPromptIds.includes(prompt.id);
    const btnDisabled = (!isVoted && (hasReachedLimit || !isRegistered)) ? "disabled" : "";
    const btnClass = isVoted ? "voted" : "";
    const heartIcon = isVoted ? "favorite" : "favorite"; // filled handled by CSS font-variation-settings

    return `
      <article class="prompt-card" data-id="${prompt.id}">
        <div class="card-image-wrapper">
          <img src="${prompt.imageUrl}" alt="${prompt.promptText}" class="card-image" loading="lazy">
        </div>
        <div class="card-details">
          <p class="card-prompt-text" title="${prompt.promptText}">"${prompt.promptText}"</p>
          <div class="card-footer">
            <div class="card-author">
              <span class="author-name">${prompt.username || "Anónimo"}</span>
              <span class="author-code">${prompt.userCode || "AILIVE"} • ${formatTime(prompt.createdAt)}</span>
            </div>
            <button class="upvote-btn ${btnClass}" ${btnDisabled} data-action="vote" data-prompt-id="${prompt.id}">
              <span class="material-symbols-rounded">${heartIcon}</span>
              <span class="vote-count">${prompt.votes || 0}</span>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  el.promptsGrid.innerHTML = html;

  // Attach event listeners to all newly rendered vote buttons
  const buttons = el.promptsGrid.querySelectorAll(".upvote-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", handleVoteClick);
  });
}

/**
 * Handles tapping/clicking on a vote button
 */
async function handleVoteClick(e) {
  const btn = e.currentTarget;
  const promptId = btn.getAttribute("data-prompt-id");
  
  if (!promptId) return;

  if (!state.userId) {
    showToast("Debes registrarte en el Prompter para poder votar.", "error");
    return;
  }

  const isVoted = btn.classList.contains("voted");

  if (isVoted) {
    // -------------------------------------------------------------
    // REMOVE VOTE (Downvote / Cancel Vote)
    // -------------------------------------------------------------
    
    // 1. Optimistic Update in UI
    btn.disabled = true;
    const voteCountEl = btn.querySelector(".vote-count");
    const currentVotes = parseInt(voteCountEl.textContent, 10) || 0;
    
    btn.classList.remove("voted");
    voteCountEl.textContent = Math.max(0, currentVotes - 1);

    // Remove from active voted state
    state.votedPromptIds = state.votedPromptIds.filter(id => id !== promptId);
    updateVoteCounter();

    try {
      console.log(`Emitting downvote for prompt: ${promptId} from user ${state.userId}`);
      const downvotePromptFn = httpsCallable(functions, "downvotePrompt");
      const response = await downvotePromptFn({ promptId, userId: state.userId });

      if (response?.data?.success) {
        // 2. Confirmed: save changes permanently in localStorage
        localStorage.setItem(`ai_qb_votes_${state.userId}`, JSON.stringify(state.votedPromptIds));
        showToast("Voto retirado con éxito. 🗳️", "success");
        
        // Reload immediately to sync any server changes
        await loadPrompts();
      } else {
        throw new Error(response?.data?.message || "Servidor rechazó la cancelación del voto.");
      }
    } catch (error) {
      console.error("Downvote failed:", error);
      
      // 3. Rollback Optimistic Update
      if (!state.votedPromptIds.includes(promptId)) {
        state.votedPromptIds.push(promptId);
      }
      updateVoteCounter();
      
      btn.classList.add("voted");
      voteCountEl.textContent = currentVotes;
      btn.disabled = false;

      if (error.message && error.message.includes("UnregisteredUser")) {
        showToast("Tu usuario no está registrado. Regístrate en el Prompter primero.", "error");
      } else {
        showToast("No se pudo retirar tu voto. Inténtalo de nuevo.", "error");
      }
    }

  } else {
    // -------------------------------------------------------------
    // ADD VOTE (Upvote)
    // -------------------------------------------------------------
    
    // Prevent adding more votes if limit is reached
    if (state.votedPromptIds.length >= VOTE_LIMIT) {
      showToast("Ya has alcanzado tu límite de 3 votos.", "error");
      return;
    }

    // 1. Optimistic Update in UI
    btn.disabled = true;
    const voteCountEl = btn.querySelector(".vote-count");
    const currentVotes = parseInt(voteCountEl.textContent, 10) || 0;
    
    btn.classList.add("voted");
    voteCountEl.textContent = currentVotes + 1;

    // Temporarily insert into state
    state.votedPromptIds.push(promptId);
    updateVoteCounter();

    try {
      console.log(`Emitting upvote for prompt: ${promptId} from user ${state.userId}`);
      const upvotePromptFn = httpsCallable(functions, "upvotePrompt");
      const response = await upvotePromptFn({ promptId, userId: state.userId });

      if (response?.data?.success) {
        // 2. Confirmed: save changes permanently in localStorage
        localStorage.setItem(`ai_qb_votes_${state.userId}`, JSON.stringify(state.votedPromptIds));
        showToast("¡Voto registrado con éxito! 💖", "success");
        
        // Reload immediately to sync any server changes
        await loadPrompts();
      } else {
        throw new Error(response?.data?.message || "Servidor rechazó el voto.");
      }
    } catch (error) {
      console.error("Upvote failed:", error);
      
      // 3. Rollback Optimistic Update
      state.votedPromptIds = state.votedPromptIds.filter(id => id !== promptId);
      updateVoteCounter();
      
      btn.classList.remove("voted");
      voteCountEl.textContent = currentVotes;
      btn.disabled = false;

      // Check specific limits from backend error
      if (error.message && error.message.includes("LimitReached")) {
        showToast("Ya has alcanzado tu límite de 3 votos.", "error");
      } else if (error.message && error.message.includes("AlreadyVoted")) {
        showToast("Ya has votado por esta obra.", "error");
      } else if (error.message && error.message.includes("UnregisteredUser")) {
        showToast("Tu usuario no está registrado. Regístrate en el Prompter primero.", "error");
      } else {
        showToast("No se pudo registrar tu voto. Inténtalo de nuevo.", "error");
      }
    }
  }
}

/**
 * Updates the vote counter UI elements
 */
function updateVoteCounter() {
  if (!state.userId) {
    el.votesRemaining.textContent = "0 / 3";
    return;
  }
  const votesUsed = state.votedPromptIds.length;
  const votesLeft = Math.max(0, VOTE_LIMIT - votesUsed);
  el.votesRemaining.textContent = `${votesLeft} / ${VOTE_LIMIT}`;
}

/**
 * Renders the dynamic voting intro banner based on registration status
 */
function renderVotingIntro() {
  const introEl = document.querySelector(".voting-intro");
  if (!introEl) return;

  if (state.userId) {
    introEl.innerHTML = `
      <h2>Vota tus favoritas 💖</h2>
      <p>Selecciona las 3 imágenes creadas por la audiencia que más te gusten. El prompt más votado ganará un premio especial.</p>
    `;
    introEl.className = "voting-intro";
  } else {
    introEl.innerHTML = `
      <h2>Vota tus favoritas 💖</h2>
      <div class="registration-warning-card">
        <span class="material-symbols-rounded warning-icon">lock</span>
        <div class="warning-text">
          <h3>Votación restringida</h3>
          <p>Para poder votar, debes registrarte creando al menos una imagen en el prompter del evento.</p>
        </div>
        <a href="https://aimadre.web.app/prompter/index.html" class="warning-cta-btn">
          <span class="material-symbols-rounded">brush</span>
          Crear Imagen
        </a>
      </div>
    `;
    introEl.className = "voting-intro registration-locked";
  }
}

/* -------------------------------------------------------------
 * GALLERY VIEW LOGIC (Widescreen 16:9 Carousel)
 * ------------------------------------------------------------- */

/**
 * Starts the widescreen gallery carousel rotation and timer bar
 */
function startGalleryCarousel() {
  if (state.carouselTimer) clearInterval(state.carouselTimer);
  if (state.carouselProgressInterval) clearInterval(state.carouselProgressInterval);

  renderCarouselCard();

  // Progress Bar update interval (updates every 50ms)
  const stepMs = 50;
  const totalSteps = CAROUSEL_ROTATION_MS / stepMs;
  let currentStep = 0;

  state.carouselProgressInterval = setInterval(() => {
    currentStep++;
    state.carouselProgress = (currentStep / totalSteps) * 100;
    el.carouselTimerBar.style.width = `${state.carouselProgress}%`;

    if (currentStep >= totalSteps) {
      currentStep = 0;
      rotateCarousel();
    }
  }, stepMs);
}

/**
 * Rotates to the next image in the database
 */
function rotateCarousel() {
  if (state.prompts.length === 0) return;

  state.activeCarouselIndex = (state.activeCarouselIndex + 1) % state.prompts.length;
  renderCarouselCard();
}

/**
 * Renders the active card inside the widescreen gallery container
 */
function renderCarouselCard() {
  if (state.prompts.length === 0) {
    el.carouselContainer.innerHTML = `
      <div class="no-prompts-state active">
        <span class="material-symbols-rounded icon-sparkle">auto_awesome</span>
        <h3>Esperando imágenes...</h3>
        <p>Los prompts de la audiencia se mostrarán aquí en tiempo real en cuanto Gemini 3.5 Flash los procese.</p>
      </div>
    `;
    return;
  }

  const prompt = state.prompts[state.activeCarouselIndex];
  const initialLetter = (prompt.username || "A").charAt(0).toUpperCase();

  el.carouselContainer.innerHTML = `
    <article class="widescreen-card">
      <!-- Left side: image display -->
      <div class="wide-image-area">
        <img src="${prompt.imageUrl}" alt="${prompt.promptText}" class="wide-image">
      </div>
      
      <!-- Right side: card details (no overlapping!) -->
      <div class="wide-details-area">
        <div class="wide-author-tag">
          <div class="wide-avatar">${initialLetter}</div>
          <div class="wide-author-info">
            <span class="wide-username">${prompt.username || "Anónimo"}</span>
            <span class="wide-usercode">${prompt.userCode || "AILIVE"} • Entrada: ${formatTime(prompt.createdAt)}</span>
          </div>
        </div>
        
        <div class="wide-prompt-section">
          <span class="material-symbols-rounded wide-prompt-quote-icon">format_quote</span>
          <p class="wide-prompt-text">"${prompt.promptText}"</p>
        </div>
        
        <div class="wide-stats-row">
          <div class="wide-vote-glowing-counter">
            <span class="material-symbols-rounded">favorite</span>
            <span class="vote-number">${prompt.votes || 0}</span>
            <span class="vote-label">votos</span>
          </div>
        </div>
      </div>
    </article>
  `;
}

/* -------------------------------------------------------------
 * UTILITY FUNCTIONS
 * ------------------------------------------------------------- */

/**
 * Shows a beautiful flying toast message
 */
function showToast(message, type = "info") {
  el.toast.textContent = message;
  el.toast.className = "toast show";
  
  if (type === "success") el.toast.classList.add("success");
  if (type === "error") el.toast.classList.add("error");

  setTimeout(() => {
    el.toast.classList.remove("show");
  }, 3500);
}

/**
 * Formats a Firestore timestamp or ISO date string into HH:MM:SS format
 */
function formatTime(createdAt) {
  if (!createdAt) return "";
  let date;
  if (createdAt._seconds) {
    date = new Date(createdAt._seconds * 1000);
  } else if (createdAt.seconds) {
    date = new Date(createdAt.seconds * 1000);
  } else {
    date = new Date(createdAt);
  }
  
  if (isNaN(date.getTime())) return "";
  
  const hrs = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  const secs = String(date.getSeconds()).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

/**
 * Opens the fullscreen image modal and pauses carousel
 */
function openFullscreenModal(imgSrc, prompt) {
  const modal = document.getElementById("fullscreen-modal");
  const modalImg = document.getElementById("modal-image");
  const modalCaption = document.getElementById("modal-caption");
  
  if (!modal || !modalImg || !modalCaption) return;
  
  modalImg.src = imgSrc;
  modalCaption.innerHTML = `
    <h3>"${prompt.promptText}"</h3>
    <p>Por <strong>${prompt.username || "Anónimo"}</strong> (${prompt.userCode || "AILIVE"}) • ${prompt.votes || 0} votos • Entrada: ${formatTime(prompt.createdAt)}</p>
  `;
  
  modal.classList.add("active");
  
  // Pause progress updates
  if (state.carouselProgressInterval) {
    clearInterval(state.carouselProgressInterval);
  }
}

/**
 * Closes the fullscreen image modal and resumes carousel
 */
function closeFullscreenModal() {
  const modal = document.getElementById("fullscreen-modal");
  if (!modal) return;
  
  modal.classList.remove("active");
  
  // Resume carousel
  if (state.isGalleryMode) {
    startGalleryCarousel();
  }
}

// Start app on DOM Loaded
document.addEventListener("DOMContentLoaded", init);
