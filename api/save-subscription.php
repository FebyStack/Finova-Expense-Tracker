<?php
// api/save-subscription.php
ini_set('display_errors', 0); error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['uid']) || !isset($payload['subscription'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid payload']);
    exit;
}

try {
    $pdo = new PDO('pgsql:host=localhost;port=5432;dbname=finova_db', 'postgres', 'bingbong321', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    // Get user id
    $stmt = $pdo->prepare("SELECT id FROM finova.users WHERE firebase_uid = :uid");
    $stmt->execute([':uid' => $payload['uid']]);
    $userId = $stmt->fetchColumn();
    if (!$userId) throw new Exception("User not found");

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
