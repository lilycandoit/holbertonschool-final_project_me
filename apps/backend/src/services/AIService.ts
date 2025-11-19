import { GoogleGenerativeAI } from "@google/generative-ai";

interface GenerateMessageRequest {
  to?: string;
  from?: string;
  occasion?: string;
  keywords?: string;
  tone?: string;
  userPrompt?: string;
}

export class AIService {
  private genAI: GoogleGenerativeAI;
  private cache: Map<string, { message: string; timestamp: number }>;
  private CACHE_TTL = 3600000; // 1 hour cache
  private readonly primaryModelName = "gemini-2.5-flash";
  private readonly MAX_GENERATION_DURATION = 13500; // leave buffer under 15s frontend timeout
  private readonly fallbackModelNames = [
    // Only include models confirmed available for this API key (see /api/ai/models)
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite-001",
  ];
  private readonly REQUEST_OPTIONS = { apiVersion: "v1" as const };

  /**
   * List available models for the configured API key (diagnostics)
   */
  async listAvailableModels(): Promise<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const apiVersion = "v1";
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to list models: ${resp.status} ${resp.statusText} - ${text}`);
    }
    const data = await resp.json() as { models?: any[] };
    return (data.models || []).map((m) => ({
      name: m.name,
      displayName: m.displayName,
      supportedGenerationMethods: m.supportedGenerationMethods,
    }));
  }

  // Tone mapping - defined once as class property
  private readonly TONE_MAPPING: Record<string, string> = {
    'warm': 'warm and affectionate',
    'warmer': 'deeply warm and loving',
    'heartfelt': 'sincere and heartfelt',
    'romantic': 'romantic and passionate',
    'happy': 'cheerful and uplifting',
    'joyful': 'joyful and celebratory',
    'funny': 'lighthearted and humorous',
    'playful': 'playful and fun',
    'professional': 'professional and elegant',
    'formal': 'formal and respectful',
    'casual': 'casual and friendly',
    'grateful': 'thankful and appreciative',
    'supportive': 'supportive and encouraging',
    'sympathetic': 'compassionate and comforting',
    'congratulatory': 'congratulatory and proud'
  };

  private getModel(modelName: string) {
    // Force v1 API for all model calls to avoid v1beta 404s on supported models
    return this.genAI.getGenerativeModel({ model: modelName }, this.REQUEST_OPTIONS);
  }

  private isTransientAIError(error: any): boolean {
    const msg = String(error?.message || "").toLowerCase();
    return (
      msg.includes("overloaded") ||
      msg.includes("unavailable") ||
      msg.includes("503") ||
      msg.includes("429") ||
      msg.includes("quota")
    );
  }

  private isModelUnsupportedError(error: any): boolean {
    const status = error?.status;
    const msg = String(error?.message || "").toLowerCase();
    return status === 404 || msg.includes("not found") || msg.includes("unsupported");
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    if (timeoutMs <= 0) {
      throw new Error(timeoutMessage);
    }

    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      });
      const result = await Promise.race([promise, timeoutPromise]);
      return result as T;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private getRemainingTime(startTime: number): number {
    return this.MAX_GENERATION_DURATION - (Date.now() - startTime);
  }

  private async generateTextWithFallback(
    prompt: string,
    generationConfig?: {
      temperature?: number;
      maxOutputTokens?: number;
      topP?: number;
      topK?: number;
    }
  ): Promise<string> {
    const modelsToTry = [this.primaryModelName, ...this.fallbackModelNames];
    const options = generationConfig ? { generationConfig } : undefined;
    const startTime = Date.now();

    for (let m = 0; m < modelsToTry.length; m++) {
      const modelName = modelsToTry[m];
      const model = this.getModel(modelName);

      // Allow at most one retry per model to keep total time low
      const maxRetries = 1;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const remaining = this.getRemainingTime(startTime);
        if (remaining <= 0) {
          throw new Error("AI generation timed out before completion");
        }

        try {
          if (m > 0 && attempt === 0) {
            console.warn(`⚠️  Falling back to model: ${modelName}`);
          } else if (attempt > 0) {
            console.warn(`⚠️  Retrying model ${modelName} (attempt ${attempt + 1})`);
          }
          const generationPromise = model.generateContent(prompt, options as any);
          const result = await this.withTimeout(
            generationPromise,
            remaining,
            "AI generation exceeded time limit"
          );
          const response = result.response;
          return response.text();
        } catch (err: any) {
          const isTransient = this.isTransientAIError(err);
          const isUnsupported = this.isModelUnsupportedError(err);

          // Retry if transient and retries available
          if (isTransient && attempt < maxRetries) {
            const backoff = attempt === 0 ? 150 : 300;
            console.warn(`⚠️  Transient AI error on ${modelName}, retrying in ${backoff}ms...`);

            if (this.getRemainingTime(startTime) <= backoff) {
              console.warn("⚠️  Skipping retry due to overall timeout constraint");
              break;
            }
            await this.sleep(backoff);
            continue;
          }

          // If transient (but retries exhausted) or unsupported, move to next model
          if (isTransient || isUnsupported) {
            if (isUnsupported) {
              console.warn(`⚠️  Model ${modelName} not available (${err?.status || err?.code || 'unknown'}: ${err?.message || 'no message'}), trying next fallback...`);
            }
            break;
          }

          // Non-transient errors: try next model instead of failing immediately
          console.warn(`⚠️  Non-transient error on ${modelName}, trying next fallback...`);
          break;
        }
      }
    }

    throw new Error("All AI models failed due to transient errors");
  }

  /**
   * Remove accidental greetings and sign-offs from generated text
   */
  private cleanupGeneratedText(text: string): string {
    return text
      .replace(/^(Dear|My dear|Hi|Hello|Hey)[,\s]+/gi, '')
      .replace(/[,\s]+(Love|Sincerely|Warmly|Best|Yours)[,\s]*$/gi, '');
  }

  /**
   * Clean old cache entries to prevent memory bloat
   */
  private cleanupCache(): void {
    const MAX_CACHE_SIZE = 100;
    if (this.cache.size > MAX_CACHE_SIZE) {
      // Remove oldest 20% of entries when limit is exceeded
      const entriesToRemove = Math.ceil(this.cache.size * 0.2);
      const keys = Array.from(this.cache.keys());
      for (let i = 0; i < entriesToRemove; i++) {
        this.cache.delete(keys[i]);
      }
    }
  }

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn("⚠️  GEMINI_API_KEY not found in environment variables. AI features will not work.");
    }

    this.genAI = new GoogleGenerativeAI(apiKey || "");
    this.cache = new Map();
  }

  /**
   * Generate a personalized gift message using Gemini AI
   */
  async generateGiftMessage(request: GenerateMessageRequest): Promise<string> {
    try {
      const { to, from, occasion, keywords, tone, userPrompt } = request;
      const sanitizedUserPrompt = userPrompt?.trim();
      const lengthSpec = '2-3 sentences';
      const maxTokens = 60; // Lower token limit = faster generation

      // Create cache key
      const cacheKey = JSON.stringify({
        to,
        from,
        occasion,
        keywords,
        tone,
        userPrompt: sanitizedUserPrompt,
      });

      // Check cache
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log('✅ Using cached AI message');
        return cached.message;
      }

      // Map tone to specific styles using class property
      const mappedTone = tone ? (this.TONE_MAPPING[tone.toLowerCase()] || tone) : 'warm and heartfelt';

      const contextParts: string[] = [];
      if (from || to) {
        contextParts.push(`Gift from ${from || 'sender'} to ${to || 'recipient'}.`);
      }
      if (occasion) {
        contextParts.push(`Occasion: ${occasion}.`);
      }
      if (keywords) {
        contextParts.push(`Theme: ${keywords}.`);
      }
      const context = contextParts.join(' ');

      const userPromptLine = sanitizedUserPrompt ? `User request: "${sanitizedUserPrompt}".\n` : '';

      const prompt = `Write a ${mappedTone} gift card message for flowers.
${context}${context ? '\n' : ''}${userPromptLine}Rules: ${lengthSpec} only, no names/greetings/signoffs, gift card style. Respond in a warm, natural tone that feels personal from the sender to the recipient.
Message:`;

      // Use optimized generation config for speed and quality
      let text = (await this.generateTextWithFallback(prompt, {
        temperature: 0.7, // Lower temperature = faster sampling
        maxOutputTokens: maxTokens,
        topP: 0.9, // Reduced for faster token selection
        topK: 30, // Lower = faster selection
      })).trim();

      // Post-process to remove any accidental names or greetings
      text = this.cleanupGeneratedText(text);

      // Store in cache
      this.cache.set(cacheKey, { message: text, timestamp: Date.now() });

      // Clean old cache entries (keep max 100 entries)
      this.cleanupCache();

      return text;
    } catch (error: any) {
      console.error("❌ Error generating AI message:", error);
      throw new Error("Failed to generate AI message. Please try again.");
    }
  }

  /**
   * Generate message suggestions based on product type
   */
  async generateMessageSuggestions(productName?: string, productDescription?: string): Promise<string[]> {
    try {
      let prompt = "Generate 3 short, sweet gift message suggestions for a flower delivery. ";

      if (productName) {
        prompt += `The flowers are: ${productName}. `;
      }

      if (productDescription) {
        prompt += `Product description: ${productDescription}. `;
      }

      prompt += "Each message should be 1-2 sentences, warm and genuine. Return only the messages, numbered 1-3.";

      const text = await this.generateTextWithFallback(prompt);

      // Split by numbers and clean up
      const suggestions = text
        .split(/\d+\.\s/)
        .filter((msg: string) => msg.trim().length > 0)
        .map((msg: string) => msg.trim())
        .slice(0, 3);

      return suggestions;
    } catch (error: any) {
      console.error("❌ Error generating message suggestions:", error);
      return [
        "Thinking of you and sending beautiful blooms your way!",
        "Hope these flowers brighten your day as much as you brighten mine.",
        "Wishing you joy and beauty, just like these flowers."
      ];
    }
  }

  /**
   * Check if AI service is properly configured
   */
  isConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  /**
   * Pre-warm cache with common message combinations for faster demo/production use
   */
  async prewarmCache(): Promise<void> {
    if (!this.isConfigured()) return;

    console.log('🔥 Pre-warming AI message cache...');

    const commonRequests = [
      { tone: 'warm', keywords: 'flowers, love', from: 'sender', to: 'recipient' },
      { tone: 'romantic', keywords: 'roses, love', from: 'sender', to: 'recipient' },
      { tone: 'happy', keywords: 'flowers, birthday', from: 'sender', to: 'recipient' },
      { tone: 'grateful', keywords: 'flowers, thanks', from: 'sender', to: 'recipient' },
      { tone: 'congratulatory', keywords: 'flowers, celebration', from: 'sender', to: 'recipient' },
    ];

    try {
      await Promise.all(
        commonRequests.map(req => this.generateGiftMessage(req).catch(() => {
          console.log(`⚠️  Failed to prewarm: ${req.tone}`);
        }))
      );
      console.log('✅ AI cache pre-warmed successfully!');
    } catch (error) {
      console.log('⚠️  Cache pre-warming had some issues, but continuing...');
    }
  }
}

// Export a singleton instance
export const aiService = new AIService();
