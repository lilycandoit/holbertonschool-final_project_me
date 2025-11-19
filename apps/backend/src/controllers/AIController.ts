import { Request, Response } from "express";
import { aiService } from "../services/AIService";
import { ApiResponse } from "../types/api";

export class AIController {
  private static ensureConfigured(res: Response): boolean {
    if (!aiService.isConfigured()) {
      res.status(503).json({
        success: false,
        error: "AI service is not configured. Please contact support.",
      } as ApiResponse);
      return false;
    }
    return true;
  }

  private static handleError(res: Response, error: any, fallback: string, context: string): void {
    console.error(`Error in ${context}:`, error);
    res.status(500).json({
      success: false,
      error: error?.message || fallback,
    } as ApiResponse);
  }

  private static sendSuccess<T>(res: Response, data: T, message: string): void {
    res.json({
      success: true,
      data,
      message,
    } as ApiResponse<T>);
  }
  /**
   * POST /api/ai/generate-message
   * Generate a personalized gift message using AI
   */
  static async generateMessage(req: Request, res: Response): Promise<void> {
    try {
      if (!AIController.ensureConfigured(res)) {
        return;
      }

      const { to, from, occasion, keywords, tone, userPrompt } = req.body;

      // Generate the message
      const message = await aiService.generateGiftMessage({
        to,
        from,
        occasion,
        keywords,
        tone,
        userPrompt,
      });

      AIController.sendSuccess(res, { message }, "Message generated successfully");
    } catch (error: any) {
      AIController.handleError(res, error, "Failed to generate message", "generateMessage");
    }
  }

  /**
   * POST /api/ai/message-suggestions
   * Generate message suggestions based on product info
   */
  static async getMessageSuggestions(req: Request, res: Response): Promise<void> {
    try {
      if (!AIController.ensureConfigured(res)) {
        return;
      }

      const { productName, productDescription } = req.body;

      // Generate suggestions
      const suggestions = await aiService.generateMessageSuggestions(
        productName,
        productDescription
      );

      AIController.sendSuccess(res, { suggestions }, "Suggestions generated successfully");
    } catch (error: any) {
      AIController.handleError(res, error, "Failed to generate suggestions", "getMessageSuggestions");
    }
  }

  /**
   * GET /api/ai/health
   * Check if AI service is available
   */
  static async checkHealth(_req: Request, res: Response): Promise<void> {
    const isConfigured = aiService.isConfigured();

    AIController.sendSuccess(res, {
      available: isConfigured,
      message: isConfigured
        ? "AI service is available"
        : "AI service is not configured",
    }, "Health check completed");
  }

  /**
   * GET /api/ai/models
   * List available models for diagnostics
   */
  static async listModels(_req: Request, res: Response): Promise<void> {
    try {
      if (!AIController.ensureConfigured(res)) {
        return;
      }
      const models = await aiService.listAvailableModels();
      AIController.sendSuccess(res, { models }, "Model list fetched");
    } catch (error: any) {
      AIController.handleError(res, error, "Failed to fetch model list", "listModels");
    }
  }
}
