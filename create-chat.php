<?php
// create-chat.php
ini_set('display_errors', 1);
error_reporting(E_ALL);

// Load database credentials from environment variables
$host = getenv('DB_HOST') ?: 'localhost';
$port = getenv('DB_PORT') ?: '5432';
$dbname = getenv('DB_NAME') ?: 'finova_db';
$user = getenv('DB_USER') ?: 'postgres';
$password = getenv('DB_PASSWORD');

if (!$password) {
    die("Error: DB_PASSWORD environment variable is not set. Please configure your .env file.\n");
}

try {
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname";
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    $sql = "
    CREATE TABLE IF NOT EXISTS finova.ai_chat_logs (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES finova.users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ";

    $pdo->exec($sql);
    echo "Table finova.ai_chat_logs created successfully!\n";

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}