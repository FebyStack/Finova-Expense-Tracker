<?php
ini_set('display_errors', 1); error_reporting(E_ALL);

// 1. Install & Load Composer
if (!file_exists(__DIR__ . '/vendor/autoload.php')) {
    echo "Wait for composer to finish installing dependency.\n";
    exit;
}
require_once __DIR__ . '/vendor/autoload.php';

use Minishlink\WebPush\VAPID;

try {
    // 2. Database Schema
    $pdo = new PDO('pgsql:host=localhost;port=5432;dbname=finova_db', 'postgres', 'bingbong321');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $sql = "
    CREATE TABLE IF NOT EXISTS finova.push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES finova.users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        keys_p256dh VARCHAR(255) NOT NULL,
        keys_auth VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ";
    $pdo->exec($sql);
    echo "Table finova.push_subscriptions created successfully!\n";

    // 3. Generate VAPID keys if not existing in .env
    $envPath = __DIR__ . '/.env';
    $envContent = file_exists($envPath) ? file_get_contents($envPath) : '';
    
    if (strpos($envContent, 'VAPID_PUBLIC_KEY') === false) {
        $keys = VAPID::createVapidKeys();
        $append = "\n# Web Push VAPID Keys\nVAPID_PUBLIC_KEY=" . $keys['publicKey'] . "\nVAPID_PRIVATE_KEY=" . $keys['privateKey'] . "\n";
        file_put_contents($envPath, $append, FILE_APPEND);
        echo "VAPID keypair securely generated and saved to .env!\n";
    } else {
        echo "VAPID keys already exist in .env.\n";
    }

} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage();
}
