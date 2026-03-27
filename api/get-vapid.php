<?php
// api/get-vapid.php
// Public endpoint to expose the VAPID_PUBLIC_KEY for browser registration
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=UTF-8');

$envPath = __DIR__ . '/../.env';
$pubKey = null;

if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), 'VAPID_PUBLIC_KEY=') === 0) {
            $pubKey = trim(explode('=', $line, 2)[1]);
            break;
        }
    }
}

if ($pubKey) {
    echo json_encode(['success' => true, 'publicKey' => $pubKey]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'VAPID key not configured']);
}
