<?php
// api/sync_status.php
// Returns pending sync queue count and online status
// GET /api/sync_status.php

ini_set('display_errors', 0);
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../services/firestore.php';

try {
    $db = _fs_db();

    // Count pending items
    $pending = (int) $db->query("
        SELECT COUNT(*) FROM finova.sync_queue
        WHERE synced_at IS NULL AND attempts < " . SYNC_MAX_ATTEMPTS
    )->fetchColumn();

    // Count abandoned (hit max attempts)
    $abandoned = (int) $db->query("
        SELECT COUNT(*) FROM finova.sync_queue
        WHERE synced_at IS NULL AND attempts >= " . SYNC_MAX_ATTEMPTS
    )->fetchColumn();

    // Count synced today
    $syncedToday = (int) $db->query("
        SELECT COUNT(*) FROM finova.sync_queue
        WHERE synced_at >= CURRENT_DATE
    ")->fetchColumn();

    // Check internet
    $online = is_online();

    http_response_code(200);
    echo json_encode([
        'success'     => true,
        'online'      => $online,
        'pending'     => $pending,
        'abandoned'   => $abandoned,
        'syncedToday' => $syncedToday,
    ]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}