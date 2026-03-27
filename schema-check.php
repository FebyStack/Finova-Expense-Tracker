<?php
ini_set('display_errors', 1); error_reporting(E_ALL);
try {
    $pdo = new PDO('pgsql:host=localhost;port=5432;dbname=finova_db', 'postgres', 'bingbong321');
    $stmt = $pdo->query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'finova'");
    $tables = $stmt->fetchAll(PDO::FETCH_ASSOC);
    file_put_contents(__DIR__ . '/schema-dump.txt', print_r($tables, true));
    echo "Done! Dumped " . count($tables) . " tables.";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
