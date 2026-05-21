import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';

const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'aiquebonito';
const location = 'global';

// Initialize Google Gen AI with Vertex AI mode and Storage
const ai = new GoogleGenAI({
  vertexai: true,
  project: projectId,
  location: location,
});
const storage = new Storage({ projectId });

/**
 * Generates an image using Gemini 3.1 Flash (Nanobanana 2) on Vertex AI and uploads it to a public GCS bucket.
 * 
 * @param {string} promptText - The prompt text provided by the user.
 * @param {string} promptId - The unique ID of the Firestore prompt document.
 * @returns {Promise<string>} The public GCS URL of the generated image.
 */
export async function generateImageAndUpload(promptText, promptId) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [
        {
          role: 'user',
          parts: [{ text: `Generate a high-quality visual image matching this description: ${promptText}` }]
        }
      ],
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    const candidate = response.candidates?.[0];
    const part = candidate?.content?.parts?.find(
      (p) => p.inlineData && p.inlineData.mimeType.startsWith('image/')
    );

    if (!part) {
      throw new Error('No image part found in the Gemini 3.1 Flash response. The model may have returned text instead of image data.');
    }

    const base64Data = part.inlineData.data;
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${promptId}.png`;

    const bucketName = 'aiquebonito';
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    // Save buffer to GCS (public access is inherited via the bucket's Uniform Bucket-Level Access policy)
    await file.save(buffer, {
      metadata: {
        contentType: 'image/png',
      },
    });

    // Return the public URL
    return `https://storage.googleapis.com/${bucketName}/${fileName}`;
  } catch (error) {
    console.error('Error in generateImageAndUpload:', error);
    throw error;
  }
}
