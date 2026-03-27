<?php
require_once __DIR__ . '/vendor/autoload.php';
use Minishlink\WebPush\VAPID;

try {
    $keys = VAPID::createVapidKeys();
    $envPath = __DIR__ . '/.env';
    
    // Read existing
    $content = file_exists($envPath) ? file_get_contents($envPath) : '';
    
    // Only append if it doesn't exist
    if (strpos($content, 'VAPID_PUBLIC_KEY') === false) {
        $append = "\n# Web Push VAPID Keys\nVAPID_PUBLIC_KEY=" . $keys['publicKey'] . "\nVAPID_PRIVATE_KEY=" . $keys['privateKey'] . "\n";
        file_put_contents($envPath, $append, FILE_APPEND);
        echo "Successfully injected VAPID keys into .env";
    } else {
        echo "Keys already exist.";
    }
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage();
}
