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
 * Validates the current session or Authorization header.
 * If validation fails, it outputs a 401 Unauthorized JSON response and exits.
 * If it succeeds, it returns the PostgreSQL user ID.
 */
function requireAuth(PDO $db): int {
    $uid = null;

    // A) Check for an existing PHP session (created by api/auth.php login/signup)
    if (isset($_SESSION['user_id']) && isset($_SESSION['firebase_uid'])) {
        // Double-check the user actually still exists in DB
        $stmt = $db->prepare("SELECT id FROM finova.users WHERE id = :id AND firebase_uid = :uid");
        $stmt->execute([
            ':id' => $_SESSION['user_id'],
            ':uid' => $_SESSION['firebase_uid']
        ]);
        if ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            return (int)$row['id'];
        }
        // If not found in DB, destroy bad session
        session_unset();
        session_destroy();
    }

    // B) Fallback for the frontend (API) if it passed X-Firebase-UID or Authorization
    $headers = getallheaders();
    $firebaseUid = $headers['X-Firebase-UID'] 
        ?? (isset($_GET['uid']) ? $_GET['uid'] : null);
        
    // If it's a POST/PUT, the uid might be in the JSON payload!
    if (!$firebaseUid && in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'DELETE'])) {
        $raw = file_get_contents('php://input');
        if (!empty($raw)) {
            $parsed = json_decode($raw, true);
            if (isset($parsed['uid'])) {
                $firebaseUid = $parsed['uid'];
            }
        }
    }

    // Also check Bearer token if present
    if (!$firebaseUid && isset($headers['Authorization'])) {
        if (preg_match('/Bearer\s+(.*)$/i', $headers['Authorization'], $matches)) {
            $firebaseUid = $matches[1];
        }
    }

    if ($firebaseUid) {
        // Look up by firebase_uid
        $stmt = $db->prepare("SELECT id FROM finova.users WHERE firebase_uid = :uid");
        $stmt->execute([':uid' => $firebaseUid]);
        
        if ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            // Found them!
            return (int)$row['id'];
        } else {
            // Auto-create missing user records for legacy migrations!
            $stmt = $db->prepare("
                INSERT INTO finova.users (firebase_uid, email, display_name, base_currency, created_at) 
                VALUES (:uid, :email, :name, 'PHP', NOW())
                RETURNING id
            ");
            $placeholderEmail = $firebaseUid . '@migrated.com';
            $stmt->execute([':uid' => $firebaseUid, ':email' => $placeholderEmail, ':name' => 'Imported User']);
            return (int)$stmt->fetchColumn();
        }
    }

    // Fail auth
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}
