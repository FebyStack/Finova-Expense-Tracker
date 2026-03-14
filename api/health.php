<?php
// api/health.php
// GET /api/health.php — verify DB + Firestore config are reachable

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/cors.php';

setCorsHeaders();

$status = ['db' => false, 'firebase_config' => false, 'timestamp' => date('c')];

// Check PostgreSQL
try {
    $db = Database::connect();
    $db->query('SELECT 1');
    $status['db'] = true;
} catch (Throwable $e) {
    $status['db_error'] = $e->getMessage();
}

// Check serviceAccountKey.json exists
$keyPath = __DIR__ . '/../serviceAccountKey.json';
$status['firebase_config'] = file_exists($keyPath);

$allOk = $status['db'] && $status['firebase_config'];
http_response_code($allOk ? 200 : 503);
echo json_encode(['success' => $allOk, 'status' => $status]);
