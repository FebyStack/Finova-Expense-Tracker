<?php
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);

if (empty($body['email']) || empty($body['password'])) {
    fail('Email and password are required');
}

$email = trim(strtolower($body['email']));
$password = $body['password'];
$displayName = isset($body['displayName']) ? trim($body['displayName']) : 'User';

if (strlen($password) < 6) fail('Password must be at least 6 characters');

try {
    $db = getDb();
    
    // Hash the password securely
    $hash = password_hash($password, PASSWORD_DEFAULT);


    // Upsert so if they migrate back from Firebase with the same email, they take over their account
    $stmt = $db->prepare("
        INSERT INTO finova.users (email, password_hash, display_name, base_currency, theme)
        VALUES (:email, :hash, :name, 'PHP', 'light')
        ON CONFLICT (email) DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            display_name = COALESCE(finova.users.display_name, EXCLUDED.display_name)
        RETURNING *
    ");
    $stmt->execute([
        ':email' => $email,
        ':hash' => $hash,
        ':name' => $displayName
    ]);
    
    $user = $stmt->fetch();

    if (!$user) fail('Failed to create account', 500);

    // Auto-login after successful signup
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];

    unset($user['password_hash']);
    
    http_response_code(201);
    echo json_encode(['success' => true, 'data' => $user]);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
}
