<?php
require_once 'config.php';
require_once 'auth_middleware.php';

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['subscription'])) {
    fail('Invalid payload', 400);
}

try {
    $pdo = getDb();


    // Get authenticated user ID
    $userId = requireAuth($pdo);

    $sub = $payload['subscription'];
    $endpoint = $sub['endpoint'];
    $p256dh = $sub['keys']['p256dh'];
    $auth = $sub['keys']['auth'];

    // Upsert the subscription
    $stmt = $pdo->prepare("
        INSERT INTO finova.push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth, created_at)
        VALUES (:u, :e, :p, :a, NOW())
        ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys_p256dh = EXCLUDED.keys_p256dh, keys_auth = EXCLUDED.keys_auth
    ");
    $stmt->execute([
        ':u' => $userId,
        ':e' => $endpoint,
        ':p' => $p256dh,
        ':a' => $auth
    ]);

    echo json_encode(['success' => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
