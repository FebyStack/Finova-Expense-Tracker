<?php
require_once 'config.php';
require_once 'auth_middleware.php';


$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int) $_GET['id'] : null;
$RAW_BODY = file_get_contents('php://input');

try {
    $db = getDb();
    $userId = requireAuth($db);

    // GET
    if ($method === 'GET') {
        if ($id) {
            $stmt = $db->prepare("SELECT * FROM finova.expenses WHERE id = :id AND user_id = :userId");
            $stmt->execute([':id' => $id, ':userId' => $userId]);
            $row = $stmt->fetch();
            if (!$row) fail('Expense not found', 404);
            ok($row);
        }

        $sql    = "SELECT * FROM finova.expenses WHERE user_id = :userId";
        $params = [':userId' => $userId];
        if (!empty($_GET['month']))    { $sql .= " AND month = :month";       $params[':month']    = $_GET['month']; }
        if (!empty($_GET['category'])) { $sql .= " AND category = :category"; $params[':category'] = $_GET['category']; }
        if (!empty($_GET['recurring']) && $_GET['recurring'] === 'true') {
            $sql .= " AND recurring = true";
        }
        $sql .= " ORDER BY date DESC";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        ok(['expenses' => $stmt->fetchAll()]);
    }

    // POST
    if ($method === 'POST') {
        $body = json_decode($RAW_BODY, true);
        
        // --- START DEBUG LOGGING ---
        $logDir = __DIR__ . '/logs';
        if (!is_dir($logDir)) mkdir($logDir, 0777, true);
        $logMsg = date('[Y-m-d H:i:s] ') . "POST /expenses.php | User: $userId | Payload: " . $RAW_BODY . "\n";
        file_put_contents($logDir . '/api_debug.log', $logMsg, FILE_APPEND);
        // --- END DEBUG LOGGING ---

        if (empty($body['amount']))   fail('amount is required', 400);
        if (empty($body['category'])) fail('category is required', 400);
        if (empty($body['date']))     fail('date is required', 400);

        $amount    = (float) $body['amount'];
        $dateRaw   = $body['date'];
        $month     = date_create($dateRaw)->format('Y-m'); // Standardized YYYY-MM
        $currency  = $body['currency']  ?? 'PHP';
        $note      = $body['note']      ?? null;
        $recurring = !empty($body['recurring']) ? 'true' : 'false';
        $frequency = !empty($body['recurring']) ? ($body['frequency'] ?? null) : null;
        $receiptData = isset($body['receiptData']) ? json_encode($body['receiptData']) : null;

        if ($amount <= 0) fail('Amount must be greater than zero', 400);

        $db->beginTransaction();
        try {
            $stmt = $db->prepare("
                INSERT INTO finova.expenses
                    (user_id, amount, currency, category, date, month, note, recurring, frequency, receipt_data)
                VALUES
                    (:userId,:amount,:currency,:category,:date,:month,:note,:recurring,:frequency,:receiptData)
                RETURNING *
            ");
            $stmt->execute([
                ':userId'=>$userId,':amount'=>$amount,':currency'=>$currency,
                ':category'=>$body['category'],':date'=>$body['date'],':month'=>$month,
                ':note'=>$note,':recurring'=>$recurring,':frequency'=>$frequency,':receiptData'=>$receiptData,
            ]);
            $expense = $stmt->fetch();
            $db->commit();
            ok($expense, 201);
        } catch (PDOException $e) {
            $db->rollBack();
            if (strpos($e->getMessage(), 'receipt_data') !== false) {
                // Column missing! Add it dynamically
                $db->exec("ALTER TABLE finova.expenses ADD COLUMN IF NOT EXISTS receipt_data JSONB");
                // Retry insertion
                $db->beginTransaction();
                $stmt = $db->prepare("
                    INSERT INTO finova.expenses
                        (user_id, amount, currency, category, date, month, note, recurring, frequency, receipt_data)
                    VALUES
                        (:userId,:amount,:currency,:category,:date,:month,:note,:recurring,:frequency,:receiptData)
                    RETURNING *
                ");
                $stmt->execute([
                    ':userId'=>$userId,':amount'=>$amount,':currency'=>$currency,
                    ':category'=>$body['category'],':date'=>$body['date'],':month'=>$month,
                    ':note'=>$note,':recurring'=>$recurring,':frequency'=>$frequency,':receiptData'=>$receiptData,
                ]);
                $expense = $stmt->fetch();
                $db->commit();
                ok($expense, 201);
            } else {
                fail('Database error: ' . $e->getMessage(), 500);
            }
        }
    }

    // PUT
    if ($method === 'PUT') {
        if (!$id) fail('Missing expense id', 400);
        $body = json_decode($RAW_BODY, true);

        $month  = isset($body['date']) ? date_create($body['date'])->format('Y-m') : null;
        $receiptData = isset($body['receiptData']) ? json_encode($body['receiptData']) : null;

        $db->beginTransaction();
        try {
            $stmt = $db->prepare("
                UPDATE finova.expenses SET
                    amount    = COALESCE(:amount,    amount),
                    currency  = COALESCE(:currency,  currency),
                    category  = COALESCE(:category,  category),
                    date      = COALESCE(:date,      date),
                    month     = COALESCE(:month,     month),
                    note      = COALESCE(:note,      note),
                    recurring = COALESCE(:recurring, recurring),
                    frequency = COALESCE(:frequency, frequency),
                    receipt_data = COALESCE(:receiptData, receipt_data),
                    updated_at = NOW()
                WHERE id = :id AND user_id = :userId
                RETURNING *
            ");
            $stmt->execute([
                ':amount'      => isset($body['amount'])    ? (float)$body['amount'] : null,
                ':currency'    => $body['currency']         ?? null,
                ':category'    => $body['category']         ?? null,
                ':date'        => $body['date']             ?? null,
                ':month'       => $month,
                ':note'        => $body['note']             ?? null,
                ':recurring'   => isset($body['recurring']) ? ($body['recurring'] ? 'true' : 'false') : null,
                ':frequency'   => $body['frequency']        ?? null,
                ':receiptData' => $receiptData,
                ':id'          => $id,
                ':userId'      => $userId,
            ]);
            $expense = $stmt->fetch();
            if (!$expense) { $db->rollBack(); fail('Expense not found', 404); }
            $db->commit();
            ok($expense);
        } catch (PDOException $e) {
            $db->rollBack();
            if (strpos($e->getMessage(), 'receipt_data') !== false) {
                // Column missing! Add it dynamically
                $db->exec("ALTER TABLE finova.expenses ADD COLUMN IF NOT EXISTS receipt_data JSONB");
                // Retry
                $db->beginTransaction();
                $stmt = $db->prepare("
                    UPDATE finova.expenses SET
                        amount    = COALESCE(:amount,    amount),
                        currency  = COALESCE(:currency,  currency),
                        category  = COALESCE(:category,  category),
                        date      = COALESCE(:date,      date),
                        month     = COALESCE(:month,     month),
                        note      = COALESCE(:note,      note),
                        recurring = COALESCE(:recurring, recurring),
                        frequency = COALESCE(:frequency, frequency),
                        receipt_data = COALESCE(:receiptData, receipt_data),
                        updated_at = NOW()
                    WHERE id = :id AND user_id = :userId
                    RETURNING *
                ");
                $stmt->execute([
                    ':amount'      => isset($body['amount'])    ? (float)$body['amount'] : null,
                    ':currency'    => $body['currency']         ?? null,
                    ':category'    => $body['category']         ?? null,
                    ':date'        => $body['date']             ?? null,
                    ':month'       => $month,
                    ':note'        => $body['note']             ?? null,
                    ':recurring'   => isset($body['recurring']) ? ($body['recurring'] ? 'true' : 'false') : null,
                    ':frequency'   => $body['frequency']        ?? null,
                    ':receiptData' => $receiptData,
                    ':id'          => $id,
                    ':userId'      => $userId,
                ]);
                $expense = $stmt->fetch();
                if (!$expense) { $db->rollBack(); fail('Expense not found', 404); }
                $db->commit();
                ok($expense);
            } else {
                fail('Database error: ' . $e->getMessage(), 500);
            }
        }
    }

    // DELETE
    if ($method === 'DELETE') {
        if (!$id) fail('id is required', 400);

        $stmt = $db->prepare("DELETE FROM finova.expenses WHERE id = :id AND user_id = :userId RETURNING id");
        $stmt->execute([':id' => $id, ':userId' => $userId]);
        if (!$stmt->fetch()) fail('Expense not found', 404);

        ok(['deleted' => true, 'id' => $id]);
    }

    fail('Method not allowed', 405);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    if (!headers_sent()) fail('Server error: ' . $e->getMessage(), 500);
}