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

try {
    $db = getDb();

    
    $stmt = $db->prepare("SELECT * FROM finova.users WHERE email = :email");
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        fail('Incorrect email or password', 401);
    }

    // Login successful
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];

    // Don't send password hash to frontend
    unset($user['password_hash']);
    
    http_response_code(200);
    echo json_encode(['success' => true, 'data' => $user]);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
}
