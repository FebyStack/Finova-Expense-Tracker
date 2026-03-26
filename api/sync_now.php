<?php
// api/sync_now.php
// Manually triggers Firestore sync for all pending queue items
// POST /api/sync_now.php
// Ignores the 12h gap — forces retry of everything pending right now

ini_set('display_errors', 0);
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../services/firestore.php';

try {
    // Check internet first
    if (!is_online()) {
        http_response_code(503);
        echo json_encode([
            'success' => false,
            'error'   => 'No internet connection. Items remain queued.',
            'online'  => false,
        ]);
        exit;
    }

    $db = _fs_db();

    // Fetch ALL pending items — ignore the 12h gap for manual sync
    $stmt = $db->prepare("
        SELECT * FROM finova.sync_queue
        WHERE synced_at IS NULL
          AND attempts < :max
        ORDER BY created_at ASC
        LIMIT 100
    ");
    $stmt->execute([':max' => SYNC_MAX_ATTEMPTS]);
    $items = $stmt->fetchAll();

    $total    = count($items);
    $synced   = 0;
    $failed   = 0;
    $results  = [];

    foreach ($items as $item) {
        $docPath = "users/{$item['uid']}/{$item['collection']}/{$item['doc_id']}";
        $success = false;

        try {
            if ($item['operation'] === 'upsert') {
                $payload = json_decode($item['payload'], true);
                if (!$payload) {
                    _mark_failed((int)$item['id'], 'Empty payload');
                    $results[] = ['id' => $item['id'], 'status' => 'skipped', 'reason' => 'empty payload'];
                    $failed++;
                    continue;
                }
                $success = _firestore_request('PATCH', $docPath, _to_firestore_fields($payload));

            } elseif ($item['operation'] === 'delete') {
                $success = _firestore_request('DELETE', $docPath);
                if (!$success) $success = true; // 404 = already gone
            }

            if ($success) {
                _mark_synced((int)$item['id']);
                $results[] = [
                    'id'         => $item['id'],
                    'status'     => 'synced',
                    'collection' => $item['collection'],
                    'doc_id'     => $item['doc_id'],
                    'operation'  => $item['operation'],
                    'attempts'   => (int)$item['attempts'] + 1,
                ];
                $synced++;
            } else {
                _mark_failed((int)$item['id'], 'Firestore returned error on manual sync');
                $results[] = [
                    'id'     => $item['id'],
                    'status' => 'failed',
                    'collection' => $item['collection'],
                    'doc_id' => $item['doc_id'],
                ];
                $failed++;
            }

        } catch (Throwable $e) {
            _mark_failed((int)$item['id'], $e->getMessage());
            $results[] = ['id' => $item['id'], 'status' => 'error', 'reason' => $e->getMessage()];
            $failed++;
        }
    }

    // Count remaining after this sync
    $remaining = (int) $db->query("
        SELECT COUNT(*) FROM finova.sync_queue
        WHERE synced_at IS NULL AND attempts < " . SYNC_MAX_ATTEMPTS
    )->fetchColumn();

    _fs_log('MANUAL_SYNC', 'queue', 200,
        "Manual sync: {$synced} synced, {$failed} failed out of {$total} total");

    http_response_code(200);
    echo json_encode([
        'success'   => true,
        'total'     => $total,
        'synced'    => $synced,
        'failed'    => $failed,
        'remaining' => $remaining,
        'results'   => $results,
    ]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}