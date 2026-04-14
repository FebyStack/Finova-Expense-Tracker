// src/helpers/response.js
// Standardized response helpers — replaces PHP ok() and fail() functions

/**
 * Send a success response.
 * Matches PHP: json_encode(['success' => true, 'data' => $data])
 */
function ok(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data: data,
  });
}

/**
 * Send an error response.
 * Matches PHP: json_encode(['success' => false, 'error' => $msg])
 */
function fail(res, message, statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    error: message,
  });
}

module.exports = { ok, fail };
