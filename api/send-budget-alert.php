<?php
require_once 'config.php';
require_once 'auth_middleware.php';
require_once __DIR__ . '/../services/aiService.php';

try {
    // 1. Get VAPID keys from .env
    $pub  = AIService::getEnvVar('VAPID_PUBLIC_KEY');
    $priv = AIService::getEnvVar('VAPID_PRIVATE_KEY');

    if (!$pub || !$priv) throw new Exception("VAPID Keys missing in .env");

    $pdo = getDb();
    $userId = requireAuth($pdo);


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
