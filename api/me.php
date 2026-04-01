<?php
require_once 'config.php';
require_once 'auth_middleware.php';

try {
    $db = getDb();
    
    $stmt = $db->prepare("SELECT * FROM finova.users WHERE id = :id");
    $stmt->execute([':id' => $_SESSION['user_id']]);
    $user = $stmt->fetch();

    if (!$user) {
        session_destroy();
        fail('User not found', 401);
    }

    unset($user['password_hash']);
    
    http_response_code(200);
    echo json_encode(['success' => true, 'data' => $user]);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
}
