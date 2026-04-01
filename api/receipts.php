<?php
require_once 'config.php';
require_once 'auth_middleware.php';


$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int) $_GET['id'] : null;

try {
    $db     = getDb();
    $userId = requireAuth($db);

    // GET
    if ($method === 'GET') {
        if ($id) {
            $stmt = $db->prepare("SELECT * FROM finova.receipts WHERE id = :id AND user_id = :userId");
            $stmt->execute([':id' => $id, ':userId' => $userId]);
            $row = $stmt->fetch();
            if (!$row) fail('Receipt not found', 404);
            ok($row);
        }

        $sql    = "SELECT * FROM finova.receipts WHERE user_id = :userId";
        $params = [':userId' => $userId];
        if (!empty($_GET['expense_id'])) {
            $sql .= " AND expense_id = :expenseId";
            $params[':expenseId'] = (int) $_GET['expense_id'];
        }
        $sql .= " ORDER BY created_at DESC";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        ok(['receipts' => $stmt->fetchAll()]);
    }

    // POST
    if ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        if (empty($body['fileName'])) fail('fileName is required', 400);
        if (empty($body['filePath'])) fail('filePath is required', 400);

        $db->beginTransaction();
        $stmt = $db->prepare("
            INSERT INTO finova.receipts (user_id, expense_id, file_name, file_path, note, upload_date)
            VALUES (:userId,:expenseId,:fileName,:filePath,:note,CURRENT_DATE)
            RETURNING *
        ");
        $stmt->execute([
            ':userId'    => $userId,
            ':expenseId' => !empty($body['expenseId']) ? (int) $body['expenseId'] : null,
            ':fileName'  => $body['fileName'],
            ':filePath'  => $body['filePath'],
            ':note'      => $body['note'] ?? null,
        ]);
        $receipt = $stmt->fetch();
        $db->commit();

        ok($receipt, 201);
    }

    // PUT
    if ($method === 'PUT') {
        if (!$id) fail('id is required', 400);
        $body = json_decode(file_get_contents('php://input'), true);

        $db->beginTransaction();
        $stmt = $db->prepare("
            UPDATE finova.receipts SET
                expense_id = COALESCE(:expenseId, expense_id),
                note       = COALESCE(:note, note)
            WHERE id = :id AND user_id = :userId
            RETURNING *
        ");
        $stmt->execute([
            ':expenseId' => !empty($body['expenseId']) ? (int)$body['expenseId'] : null,
            ':note'      => $body['note'] ?? null,
            ':id'        => $id,
            ':userId'    => $userId,
        ]);
        $receipt = $stmt->fetch();
        if (!$receipt) { $db->rollBack(); fail('Receipt not found', 404); }
        $db->commit();

        ok($receipt);
    }

    // DELETE
    if ($method === 'DELETE') {
        if (!$id) fail('id is required', 400);

        $stmt = $db->prepare("DELETE FROM finova.receipts WHERE id = :id AND user_id = :userId RETURNING id, file_path");
        $stmt->execute([':id' => $id, ':userId' => $userId]);
        $row = $stmt->fetch();
        if (!$row) fail('Receipt not found', 404);

        // Remove physical file
        if (!empty($row['file_path'])) {
            $full = __DIR__ . '/../' . $row['file_path'];
            if (file_exists($full)) unlink($full);
        }

        ok(['deleted' => true, 'id' => $id]);
    }

    fail('Method not allowed', 405);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    if (!headers_sent()) fail('Server error: ' . $e->getMessage(), 500);
}
