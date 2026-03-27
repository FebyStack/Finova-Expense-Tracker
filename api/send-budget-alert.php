<?php
// api/send-budget-alert.php
ini_set('display_errors', 1); error_reporting(E_ALL);

// Load Composer for WebPush
require_once __DIR__ . '/../vendor/autoload.php';

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=UTF-8');

$uid = $_GET['uid'] ?? null;
if (!$uid) {
    http_response_code(400);
    echo json_encode(['error' => 'Firebase UID required']);
    exit;
}

try {
    // Connect to DB to get VAPID keys from .env
    $envPath = __DIR__ . '/../.env';
    $pub = null; $priv = null;
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), 'VAPID_PUBLIC_KEY=') === 0) $pub = trim(explode('=', $line, 2)[1]);
        if (strpos(trim($line), 'VAPID_PRIVATE_KEY=') === 0) $priv = trim(explode('=', $line, 2)[1]);
    }
    if (!$pub || !$priv) throw new Exception("VAPID Keys missing in .env");

    $pdo = new PDO('pgsql:host=localhost;port=5432;dbname=finova_db', 'postgres', 'bingbong321', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    // Lookup Postgres user mapping
    $stmt = $pdo->prepare("SELECT id FROM finova.users WHERE firebase_uid = :uid");
    $stmt->execute([':uid' => $uid]);
    $userId = $stmt->fetchColumn();

    // Get Subscription Endpoint
    $stmt = $pdo->prepare("SELECT endpoint, keys_p256dh, keys_auth FROM finova.push_subscriptions WHERE user_id = :u ORDER BY created_at DESC LIMIT 1");
    $stmt->execute([':u' => $userId]);
    $subData = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$subData) {
        echo json_encode(['success' => false, 'error' => 'No push subscription found for this user']);
        exit;
    }

    $auth = [
        'VAPID' => [
            'subject' => 'mailto:admin@finova.com', // Typically your email
            'publicKey' => $pub,
            'privateKey' => $priv,
        ],
    ];

    $webPush = new WebPush($auth);

    $subscription = Subscription::create([
        'endpoint' => $subData['endpoint'],
        'keys' => [
            'p256dh' => $subData['keys_p256dh'],
            'auth' => $subData['keys_auth']
        ],
    ]);

    $payload = json_encode([
        'title' => '⚠️ Budget Alert!',
        'body' => 'You just hit 80% of your Food and Dining budget for this month. Be careful!',
        'url' => '/Expense_Tracker/dashboard.html'
    ]);

    $res = $webPush->sendOneNotification($subscription, $payload);
    
    if ($res->isSuccess()) {
        echo json_encode(['success' => true, 'message' => 'Test Notification Pushed!']);
    } else {
        echo json_encode(['success' => false, 'error' => $res->getReason()]);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
