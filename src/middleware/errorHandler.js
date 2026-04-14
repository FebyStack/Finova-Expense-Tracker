// src/middleware/errorHandler.js
// Global Express error handler — replaces PHP try/catch + fail() pattern

/**
 * Catches any unhandled errors and returns a standardized JSON response.
 * Matches PHP response format: { success: false, error: "..." }
 */
function errorHandler(err, req, res, _next) {
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);

  // PostgreSQL-specific errors
  if (err.code && err.code.startsWith('08')) {
    // Connection errors (SQLSTATE 08xxx)
    return res.status(500).json({
      success: false,
      error: 'Database connection failed: ' + err.message,
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
  });
}

module.exports = { errorHandler };
