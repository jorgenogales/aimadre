import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { generateImageAndUpload } from "./vertex.js";

// Initialize Firebase Admin SDK
const app = initializeApp();
const db = getFirestore(app);

/**
 * Trigger: Firestore onDocumentCreated on "prompts/{promptId}"
 * 
 * When a new prompt is inserted, it runs a transaction to pick up all approved prompts,
 * marks them as "processing" to avoid race conditions, and then processes them
 * by generating the image and uploading to public Cloud Storage.
 */
export const onPromptCreated = onDocumentCreated("prompts/{promptId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    console.log("No snapshot data found.");
    return;
  }

  const triggerPromptId = event.params.promptId;
  console.log(`Trigger fired for prompt ID: ${triggerPromptId}`);

  let promptsToProcess = [];

  try {
    // Step 1: Execute transaction to retrieve and reserve approved prompts
    await db.runTransaction(async (transaction) => {
      const promptsRef = db.collection("prompts");
      const approvedQuery = promptsRef.where("status", "==", "approved");
      const approvedSnapshot = await transaction.get(approvedQuery);

      approvedSnapshot.forEach((doc) => {
        promptsToProcess.push({ id: doc.id, ...doc.data() });
        // Update status immediately to 'processing' inside the transaction to lock them
        transaction.update(doc.ref, { status: "processing" });
      });
    });

    console.log(`Successfully reserved ${promptsToProcess.length} approved prompt(s) for processing.`);
  } catch (error) {
    console.error("Transaction to reserve prompts failed:", error);
    return;
  }

  // Step 2: Process reserved prompts (outside the transaction to allow async HTTP Vertex AI calls)
  for (const prompt of promptsToProcess) {
    try {
      console.log(`Generating image for prompt [${prompt.id}]: "${prompt.promptText}"`);
      
      const imageUrl = await generateImageAndUpload(prompt.promptText, prompt.id);
      
      console.log(`Successfully generated and uploaded image. GCS URL: ${imageUrl}`);

      // Update Firestore document with the image URL, status completed, and initial vote count if missing
      await db.collection("prompts").doc(prompt.id).update({
        imageUrl: imageUrl,
        status: "completed",
        votes: prompt.votes || 0, // Ensure a default vote count of 0
        processedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error(`Failed to process prompt [${prompt.id}]:`, err);
      
      // Update Firestore document status to failed
      await db.collection("prompts").doc(prompt.id).update({
        status: "failed",
        error: err.message || "Unknown error during image generation/upload",
        failedAt: FieldValue.serverTimestamp(),
      });
    }
  }
});

/**
 * HTTPS Callable: getProcessedPrompts
 * 
 * Retrieves all prompts that have been completed, sorted in memory by:
 * 1. Votes (descending)
 * 2. CreatedAt (descending)
 * 
 * Doing the sort in-memory avoids needing to build complex Firestore composite indexes
 * during a live demo event, guaranteeing 100% reliability.
 */
export const getProcessedPrompts = onCall({ cors: true }, async (request) => {
  try {
    const snapshot = await db.collection("prompts")
      .where("status", "==", "completed")
      .get();

    const prompts = [];
    snapshot.forEach((doc) => {
      prompts.push({ id: doc.id, ...doc.data() });
    });

    // In-memory sort: primary order by votes (desc), secondary by createdAt (desc)
    prompts.sort((a, b) => {
      const votesA = a.votes || 0;
      const votesB = b.votes || 0;
      if (votesB !== votesA) {
        return votesB - votesA;
      }

      // Convert Firestore Timestamp or raw date to Date objects for comparison
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      // Older prompt (entered earlier) first when votes are equal
      return dateA - dateB;
    });

    return { success: true, prompts };
  } catch (error) {
    console.error("Error in getProcessedPrompts:", error);
    throw new HttpsError("internal", error.message || "Internal server error");
  }
});

/**
 * HTTPS Callable: upvotePrompt
 * 
 * Upvotes a prompt. Enforces a strict limit of 3 votes per userId (UUID)
 * using a secure Firestore transaction.
 */
export const upvotePrompt = onCall({ cors: true }, async (request) => {
  const { promptId, userId } = request.data || {};

  if (!promptId || !userId) {
    throw new HttpsError("invalid-argument", "Missing required parameters: promptId and userId.");
  }

  try {
    await db.runTransaction(async (transaction) => {
      const userRef = db.collection("users").doc(userId);
      const userVoteRef = db.collection("votes").doc(userId);
      const promptRef = db.collection("prompts").doc(promptId);

      // Read user's registration, existing votes & target prompt
      const userDoc = await transaction.get(userRef);
      const userVoteDoc = await transaction.get(userVoteRef);
      const promptDoc = await transaction.get(promptRef);

      if (!userDoc.exists) {
        throw new HttpsError("permission-denied", "UnregisteredUser: Este ID de usuario no está registrado en el Prompter. Regístrate antes de votar.");
      }

      if (!promptDoc.exists) {
        throw new HttpsError("not-found", `Prompt with ID ${promptId} does not exist.`);
      }

      const promptData = promptDoc.data();
      if (promptData.status !== "completed") {
        throw new HttpsError("failed-precondition", "Cannot vote on an incomplete prompt.");
      }

      let votedPromptIds = [];
      if (userVoteDoc.exists) {
        votedPromptIds = userVoteDoc.data().votedPromptIds || [];
      }

      // 1. Enforce strict max limit of 3 votes
      if (votedPromptIds.length >= 3) {
        throw new HttpsError("failed-precondition", "LimitReached: You have already used all of your 3 votes.");
      }

      // 2. Prevent voting multiple times for the exact same prompt
      if (votedPromptIds.includes(promptId)) {
        throw new HttpsError("already-exists", "AlreadyVoted: You have already voted for this prompt.");
      }

      // Update calculations
      votedPromptIds.push(promptId);
      const newPromptVotes = (promptData.votes || 0) + 1;

      // Commit changes inside transaction
      transaction.set(userVoteRef, { 
        votedPromptIds, 
        updatedAt: FieldValue.serverTimestamp() 
      }, { merge: true });

      transaction.update(promptRef, { 
        votes: newPromptVotes 
      });
    });

    return { success: true, message: "Vote registered successfully." };
  } catch (error) {
    console.error(`Error in upvotePrompt for user ${userId} on prompt ${promptId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", error.message || "Failed to register vote.");
  }
});

/**
 * HTTPS Callable: downvotePrompt
 * 
 * Removes a previously cast vote by a user for a prompt.
 */
export const downvotePrompt = onCall({ cors: true }, async (request) => {
  const { promptId, userId } = request.data || {};

  if (!promptId || !userId) {
    throw new HttpsError("invalid-argument", "Missing required parameters: promptId and userId.");
  }

  try {
    await db.runTransaction(async (transaction) => {
      const userRef = db.collection("users").doc(userId);
      const userVoteRef = db.collection("votes").doc(userId);
      const promptRef = db.collection("prompts").doc(promptId);

      // Read user's registration, existing votes & target prompt
      const userDoc = await transaction.get(userRef);
      const userVoteDoc = await transaction.get(userVoteRef);
      const promptDoc = await transaction.get(promptRef);

      if (!userDoc.exists) {
        throw new HttpsError("permission-denied", "UnregisteredUser: Este ID de usuario no está registrado en el Prompter. Regístrate antes de votar.");
      }

      if (!promptDoc.exists) {
        throw new HttpsError("not-found", `Prompt with ID ${promptId} does not exist.`);
      }

      const promptData = promptDoc.data();

      let votedPromptIds = [];
      if (userVoteDoc.exists) {
        votedPromptIds = userVoteDoc.data().votedPromptIds || [];
      }

      // Check if user has actually voted for this prompt
      if (!votedPromptIds.includes(promptId)) {
        throw new HttpsError("failed-precondition", "NotVoted: You have not voted for this prompt yet.");
      }

      // Update calculations
      votedPromptIds = votedPromptIds.filter(id => id !== promptId);
      const newPromptVotes = Math.max(0, (promptData.votes || 0) - 1);

      // Commit changes inside transaction
      transaction.set(userVoteRef, { 
        votedPromptIds, 
        updatedAt: FieldValue.serverTimestamp() 
      }, { merge: true });

      transaction.update(promptRef, { 
        votes: newPromptVotes 
      });
    });

    return { success: true, message: "Vote removed successfully." };
  } catch (error) {
    console.error(`Error in downvotePrompt for user ${userId} on prompt ${promptId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", error.message || "Failed to remove vote.");
  }
});
