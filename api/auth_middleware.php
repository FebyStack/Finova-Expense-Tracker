<?php
// api/auth_middleware.php

// 1. Ensure a session is started
if (session_status() === PHP_SESSION_NONE) {
    // Only set cookie params if we're starting fresh
    session_set_cookie_params([
        'lifetime' => 86400 * 30, // 30 days
        'path' => '/',
        'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on',
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_start();
}

/**
 * Validates the current session and returns the PostgreSQL user ID.
 * If validation fails, it outputs a 401 Unauthorized JSON response and exits.
 */
function requireAuth(PDO $db) {
    // A) Check for an existing PHP session
    if (isset($_SESSION['user_id'])) {
        // We could double check if user exists in DB, but generally matching session is enough
        // unless you want to be extra secure
        return (int)$_SESSION['user_id'];
    }

    // Fail auth
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}
