<?php
require_once 'config.php';

$status = [
    'db' => false, 
    'firebase_config' => file_exists(__DIR__ . '/../serviceAccountKey.json'), 
    'timestamp' => date('c')
];

// Check PostgreSQL using the centralized getDb()
try {
    $db = getDb();
    $db->query('SELECT 1');
    $status['db'] = true;
} catch (Throwable $e) {
    $status['db_error'] = $e->getMessage();
}

$allOk = $status['db']; // firebase config is optional/deprecated
ok(['health' => $allOk, 'status' => $status]);

