<?php
require_once 'config.php';
require_once __DIR__ . '/../services/firestore.php';


try {
    $db = getDb();

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