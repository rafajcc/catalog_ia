"""
Main entry point for the CatalogIA backend application.
"""

import app from './app';
import { AppError, ErrorHandler } from './utils/error-handler';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 3000;

const startServer = async (): Promise<void> => {
  try {
    app.listen(PORT, () => {
      logger.info(`Server started on port ${PORT}`, { port: PORT });
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

const gracefulShutdown = async (): Promise<void> => {
  logger.info('Received shutdown signal, shutting down gracefully');

  try {
    await new Promise<void>((resolve) => {
      app.close(() => {
        logger.info('Server closed');
        resolve();
      });
    });
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

ErrorHandler.setup(process.env.NODE_ENV === 'development');

startServer().catch((error: unknown) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});
