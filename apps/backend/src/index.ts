// Local development server entry point
import app from "./app";
import { prisma } from "./config/database";

const port = process.env.PORT || 3001;

// Start server (only for local development)
app.listen(port, async () => {
  console.log(`🚀 Flora API server running on http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/`);

  // Pre-warm AI cache for faster responses (optional)
  // Temporarily disabled to avoid quota issues
  // try {
  //   const { aiService } = await import('./services/AIService');
  //   await aiService.prewarmCache();
  // } catch (error) {
  //   console.log('⚠️  AI cache pre-warming skipped');
  // }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down Flora API server...");
  await prisma.$disconnect();
  process.exit(0);
});

// Export for use in tests
export { prisma } from "./config/database";
export default app;
