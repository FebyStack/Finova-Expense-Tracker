<?php
// api/expenses.php — standalone + Firestore mirror

ini_set('display_errors', 0);
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Firebase-UID');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../services/firestore.php';

function ok(mixed $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data]);
    exit;
}
function fail(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}
function getDb(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO('pgsql:host=localhost;port=5432;dbname=finova_db', 'postgres', 'bingbong321', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec("SET search_path TO finova, public");
    }
    return $pdo;
}
function getUserId(PDO $db, string $uid): int {
    $stmt = $db->prepare("SELECT id FROM finova.users WHERE firebase_uid = :uid");
    $stmt->execute([':uid' => $uid]);
    $row = $stmt->fetch();
    if (!$row) fail('User not found', 404);
    return (int) $row['id'];
}

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int) $_GET['id'] : null;

try {
    $db = getDb();

    // GET
    if ($method === 'GET') {
        $uid = $_GET['uid'] ?? null;
        if (!$uid) fail('uid is required', 400);
        $userId = getUserId($db, $uid);

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
        $sql .= " ORDER BY date DESC";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        ok(['expenses' => $stmt->fetchAll()]);
    }

    // POST
    if ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        $uid  = $body['uid'] ?? null;
        if (!$uid)                    fail('uid is required', 400);
        if (empty($body['amount']))   fail('amount is required', 400);
        if (empty($body['category'])) fail('category is required', 400);
        if (empty($body['date']))     fail('date is required', 400);

        $userId    = getUserId($db, $uid);
        $amount    = (float) $body['amount'];
        $month     = substr($body['date'], 0, 7);
        $currency  = $body['currency']  ?? 'PHP';
        $note      = $body['note']      ?? null;
        $recurring = !empty($body['recurring']) ? 'true' : 'false';
        $frequency = !empty($body['recurring']) ? ($body['frequency'] ?? null) : null;
        $receipt   = $body['receiptPath'] ?? null;

        if ($amount <= 0) fail('Amount must be greater than zero', 400);

        $db->beginTransaction();
        $stmt = $db->prepare("
            INSERT INTO finova.expenses
                (user_id, amount, currency, category, date, month, note, recurring, frequency, receipt_path)
            VALUES
                (:userId,:amount,:currency,:category,:date,:month,:note,:recurring,:frequency,:receipt)
            RETURNING *
        ");
        $stmt->execute([
            ':userId'=>$userId,':amount'=>$amount,':currency'=>$currency,
            ':category'=>$body['category'],':date'=>$body['date'],':month'=>$month,
            ':note'=>$note,':recurring'=>$recurring,':frequency'=>$frequency,':receipt'=>$receipt,
        ]);
        $expense = $stmt->fetch();
        $db->commit();

        // Mirror to Firestore
        try {
            firestore_upsert($uid, 'expenses', (string)$expense['id'], [
                'pgId'      => (int)   $expense['id'],
                'amount'    => (float) $expense['amount'],
                'currency'  => $expense['currency'],
                'category'  => $expense['category'],
                'date'      => $expense['date'],
                'month'     => $expense['month'],
                'note'      => $expense['note'],
                'recurring' => (bool)  $expense['recurring'],
                'frequency' => $expense['frequency'],
            ]);
        } catch (Throwable $e) {}

        ok($expense, 201);
    }

    // PUT
    if ($method === 'PUT') {
        if (!$id) fail('id is required', 400);
        $body = json_decode(file_get_contents('php://input'), true);
        $uid  = $body['uid'] ?? null;
        if (!$uid) fail('uid is required', 400);

        $userId = getUserId($db, $uid);
        $month  = isset($body['date']) ? substr($body['date'], 0, 7) : null;

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
                updated_at = NOW()
            WHERE id = :id AND user_id = :userId
            RETURNING *
        ");
        $stmt->execute([
            ':amount'   => isset($body['amount'])    ? (float)$body['amount'] : null,
            ':currency' => $body['currency']         ?? null,
            ':category' => $body['category']         ?? null,
            ':date'     => $body['date']             ?? null,
            ':month'    => $month,
            ':note'     => $body['note']             ?? null,
            ':recurring'=> isset($body['recurring']) ? ($body['recurring'] ? 'true' : 'false') : null,
            ':frequency'=> $body['frequency']        ?? null,
            ':id'       => $id,
            ':userId'   => $userId,
        ]);
        $expense = $stmt->fetch();
        if (!$expense) { $db->rollBack(); fail('Expense not found', 404); }
        $db->commit();

        // Mirror to Firestore
        try {
            firestore_upsert($uid, 'expenses', (string)$id, [
                'pgId'      => (int)   $expense['id'],
                'amount'    => (float) $expense['amount'],
                'currency'  => $expense['currency'],
                'category'  => $expense['category'],
                'date'      => $expense['date'],
                'month'     => $expense['month'],
                'note'      => $expense['note'],
                'recurring' => (bool)  $expense['recurring'],
                'frequency' => $expense['frequency'],
            ]);
        } catch (Throwable $e) {}

        ok($expense);
    }

    // DELETE
    if ($method === 'DELETE') {
        if (!$id) fail('id is required', 400);
        $uid = $_GET['uid'] ?? null;
        if (!$uid) fail('uid is required', 400);

        $userId = getUserId($db, $uid);
        $stmt = $db->prepare("DELETE FROM finova.expenses WHERE id = :id AND user_id = :userId RETURNING id");
        $stmt->execute([':id' => $id, ':userId' => $userId]);
        if (!$stmt->fetch()) fail('Expense not found', 404);

        // Mirror delete to Firestore
        try { firestore_delete($uid, 'expenses', (string)$id); } catch (Throwable $e) {}

        ok(['deleted' => true, 'id' => $id]);
    }

    fail('Method not allowed', 405);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    if (!headers_sent()) fail('Server error: ' . $e->getMessage(), 500);
}