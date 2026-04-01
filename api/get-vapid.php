<?php
require_once 'config.php';
require_once __DIR__ . '/../services/aiService.php';

$pubKey = AIService::getEnvVar('VAPID_PUBLIC_KEY');


if ($pubKey) {
    echo json_encode(['success' => true, 'publicKey' => $pubKey]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'VAPID key not configured']);
}
