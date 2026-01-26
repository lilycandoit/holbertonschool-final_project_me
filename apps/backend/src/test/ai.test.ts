import { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

// Mock Google GenAI SDK BEFORE importing AIService
jest.mock('@google/genai');
const mockGoogleGenAI = GoogleGenAI as jest.MockedClass<typeof GoogleGenAI>;

// Set API key before importing service (to avoid singleton warning)
process.env.GEMINI_API_KEY = 'test-api-key-12345';

// Suppress console.warn before imports (to avoid singleton warning during module load)
const originalWarn = console.warn;
console.warn = jest.fn();

// Import after mocks and console suppression are set
import { AIController } from '../controllers/AIController';
import { AIService } from '../services/AIService';

// Restore console.warn after tests
afterAll(() => {
  console.warn = originalWarn;
});

describe('AI Service and Controller Tests', () => {
  let mockGenerateContent: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGenerateContent = jest.fn();

    // New SDK structure: ai.models.generateContent({ model, contents, config })
    // Response is an object with a .text property (not a method)
    mockGoogleGenAI.mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    } as any));

    process.env.GEMINI_API_KEY = 'test-api-key-12345';
  });

  describe('AIService - Configuration', () => {
    test('should be configured with API key', () => {
      const service = new (AIService as any)();
      expect(service.isConfigured()).toBe(true);
    });

    test('should handle missing API key', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      delete process.env.GEMINI_API_KEY;

      const service = new (AIService as any)();
      expect(service.isConfigured()).toBe(false);

      consoleSpy.mockRestore();
      process.env.GEMINI_API_KEY = 'test-api-key-12345';
    });
  });

  describe('AIService - Caching', () => {
    let service: any;

    beforeEach(() => {
      service = new (AIService as any)();
      // New SDK: response.text is a property, not a method
      mockGenerateContent.mockResolvedValue({ text: 'Test message' });
    });

    test('should cache generated messages', async () => {
      const params = { to: 'Alice', from: 'Bob', tone: 'warm' };

      await service.generateGiftMessage(params);
      expect(service['cache'].size).toBe(1);
    });

    test('should return cached result for same params', async () => {
      const params = { to: 'Alice', from: 'Bob', tone: 'warm' };

      await service.generateGiftMessage(params);
      await service.generateGiftMessage(params);

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    test('should generate new message for different params', async () => {
      await service.generateGiftMessage({ to: 'Alice' });
      await service.generateGiftMessage({ to: 'Bob' });

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
  });

  describe('AIService - Message Generation', () => {
    let service: any;

    beforeEach(() => {
      service = new (AIService as any)();
      // New SDK: response.text is a property, not a method
      mockGenerateContent.mockResolvedValue({ text: '  Beautiful flowers for you!  ' });
    });

    test('should generate message and trim whitespace', async () => {
      const result = await service.generateGiftMessage({
        to: 'Alice',
        from: 'Bob',
        tone: 'romantic',
      });

      expect(result).toBe('Beautiful flowers for you!');
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    test('should include all parameters in prompt', async () => {
      await service.generateGiftMessage({
        to: 'Alice',
        from: 'Bob',
        occasion: 'birthday',
        keywords: 'roses',
        tone: 'warm',
      });

      // New SDK: generateContent takes { model, contents, config }
      const callArg = mockGenerateContent.mock.calls[0][0];
      const prompt = callArg.contents;
      expect(prompt).toContain('Alice');
      expect(prompt).toContain('Bob');
      expect(prompt).toContain('birthday');
      expect(prompt).toContain('roses');
    });

    test('should handle AI errors', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API error'));

      await expect(service.generateGiftMessage({})).rejects.toThrow(
        'Failed to generate AI message'
      );
    });
  });

  describe('AIService - Message Suggestions', () => {
    let service: any;

    beforeEach(() => {
      service = new (AIService as any)();
    });

    test('should generate 3 suggestions', async () => {
      // New SDK: response.text is a property, not a method
      mockGenerateContent.mockResolvedValue({ text: '1. First\n2. Second\n3. Third' });

      const suggestions = await service.generateMessageSuggestions('Roses');
      expect(suggestions).toHaveLength(3);
    });

    test('should return fallback suggestions on error', async () => {
      mockGenerateContent.mockRejectedValue(new Error('AI failed'));

      const suggestions = await service.generateMessageSuggestions();
      expect(suggestions).toHaveLength(3);
      expect(suggestions[0]).toContain('Thinking of you');
    });
  });

  describe('AIService - Text Cleanup', () => {
    let service: any;

    beforeEach(() => {
      service = new (AIService as any)();
    });

    test('should remove greetings and signoffs', () => {
      const cleaned = service['cleanupGeneratedText']('Dear John, Message here. Love,');
      expect(cleaned).not.toContain('Dear');
      expect(cleaned).toContain('Message here');
    });
  });

  describe('AIController - generateMessage', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let aiServiceSpy: jest.SpyInstance;

    beforeEach(() => {
      mockReq = {
        body: { to: 'Alice', from: 'Bob', tone: 'warm' },
      };

      mockRes = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      const { aiService } = require('../services/AIService');
      aiServiceSpy = jest.spyOn(aiService, 'generateGiftMessage')
        .mockResolvedValue('Generated message');
    });

    afterEach(() => {
      aiServiceSpy?.mockRestore();
    });

    test('should return success response', async () => {
      await AIController.generateMessage(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Generated message' },
        message: 'Message generated successfully',
      });
    });

    test('should handle errors', async () => {
      aiServiceSpy.mockRejectedValue(new Error('Service error'));

      await AIController.generateMessage(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Service error',
      });
    });
  });

  describe('AIController - getMessageSuggestions', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let aiServiceSpy: jest.SpyInstance;

    beforeEach(() => {
      mockReq = {
        body: { productName: 'Roses' },
      };

      mockRes = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };

      const { aiService } = require('../services/AIService');
      aiServiceSpy = jest.spyOn(aiService, 'generateMessageSuggestions')
        .mockResolvedValue(['Suggestion 1', 'Suggestion 2', 'Suggestion 3']);
    });

    afterEach(() => {
      aiServiceSpy?.mockRestore();
    });

    test('should return suggestions', async () => {
      await AIController.getMessageSuggestions(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { suggestions: ['Suggestion 1', 'Suggestion 2', 'Suggestion 3'] },
        message: 'Suggestions generated successfully',
      });
    });
  });

  describe('AIController - checkHealth', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;

    beforeEach(() => {
      mockReq = {};
      mockRes = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };
    });

    test('should return available when configured', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      await AIController.checkHealth(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            available: true,
          }),
        })
      );
    });
  });

  describe('Integration - Full Flow', () => {
    let service: any;

    beforeEach(() => {
      service = new (AIService as any)();
      // New SDK: response.text is a property, not a method
      mockGenerateContent.mockResolvedValue({ text: 'Dear Alice, Lovely flowers! Love, Bob' });
    });

    test('should handle concurrent requests with caching', async () => {
      const params1 = { to: 'Alice', from: 'Bob' };
      const params2 = { to: 'Charlie', from: 'Diana' };

      await service.generateGiftMessage(params1);
      await service.generateGiftMessage(params2);
      await service.generateGiftMessage(params1); // Should use cache

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
  });
});
