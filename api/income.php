<?php
require_once 'config.php';
require_once 'auth_middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int) $_GET['id'] : null;

try {
    $db = getDb();
    $userId = requireAuth($db);

    // GET
    if ($method === 'GET') {
        if ($id) {
            $stmt = $db->prepare("SELECT * FROM finova.income WHERE id = :id AND user_id = :userId");
            $stmt->execute([':id' => $id, ':userId' => $userId]);
            $row = $stmt->fetch();
            if (!$row) fail('Income not found', 404);
            ok($row);
        }

        $sql    = "SELECT * FROM finova.income WHERE user_id = :userId";
        $params = [':userId' => $userId];
        if (!empty($_GET['month'])) { $sql .= " AND month = :month"; $params[':month'] = $_GET['month']; }
        $sql .= " ORDER BY date DESC";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        ok(['income' => $stmt->fetchAll()]);
    }

    // POST
    if ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        if (empty($body['amount'])) fail('amount is required', 400);
        if (empty($body['source'])) fail('source is required', 400);
        if (empty($body['date']))   fail('date is required', 400);

        $amount   = (float) $body['amount'];
        $month    = substr($body['date'], 0, 7);
        $currency = $body['currency'] ?? 'PHP';
        $note     = $body['note']     ?? null;

        if ($amount <= 0) fail('Amount must be greater than zero', 400);

        $db->beginTransaction();
        $stmt = $db->prepare("
            INSERT INTO finova.income
                (user_id, amount, currency, source, date, month, note)
            VALUES
                (:userId,:amount,:currency,:source,:date,:month,:note)
            RETURNING *
        ");
        $stmt->execute([
            ':userId'  => $userId,
            ':amount'  => $amount,
            ':currency'=> $currency,
            ':source'  => $body['source'],
            ':date'    => $body['date'],
            ':month'   => $month,
            ':note'    => $note,
        ]);
        $income = $stmt->fetch();
        $db->commit();

        ok($income, 201);
    }

    // PUT
    if ($method === 'PUT') {
        if (!$id) fail('id is required', 400);
        $body = json_decode(file_get_contents('php://input'), true);

        $month  = isset($body['date']) ? substr($body['date'], 0, 7) : null;

        $db->beginTransaction();
        $stmt = $db->prepare("
            UPDATE finova.income SET
                amount     = COALESCE(:amount,   amount),
                currency   = COALESCE(:currency, currency),
                source     = COALESCE(:source,   source),
                date       = COALESCE(:date,     date),
                month      = COALESCE(:month,    month),
                note       = COALESCE(:note,     note),
                updated_at = NOW()
            WHERE id = :id AND user_id = :userId
            RETURNING *
        ");
        $stmt->execute([
            ':amount'  => isset($body['amount'])  ? (float)$body['amount'] : null,
            ':currency'=> $body['currency'] ?? null,
            ':source'  => $body['source']   ?? null,
            ':date'    => $body['date']     ?? null,
            ':month'   => $month,
            ':note'    => $body['note']     ?? null,
            ':id'      => $id,
            ':userId'  => $userId,
        ]);
        $income = $stmt->fetch();
        if (!$income) { $db->rollBack(); fail('Income not found', 404); }
        $db->commit();

        ok($income);
    }

    // DELETE
    if ($method === 'DELETE') {
        if (!$id) fail('id is required', 400);

        $stmt = $db->prepare("DELETE FROM finova.income WHERE id = :id AND user_id = :userId RETURNING id");
        $stmt->execute([':id' => $id, ':userId' => $userId]);
        if (!$stmt->fetch()) fail('Income not found', 404);

        ok(['deleted' => true, 'id' => $id]);
    }

    fail('Method not allowed', 405);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    if (!headers_sent()) fail('Server error: ' . $e->getMessage(), 500);
}