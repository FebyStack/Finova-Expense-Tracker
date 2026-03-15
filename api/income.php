<?php
// api/income.php — standalone + Firestore mirror

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
        $uid  = $body['uid'] ?? null;
        if (!$uid)                  fail('uid is required', 400);
        if (empty($body['amount'])) fail('amount is required', 400);
        if (empty($body['source'])) fail('source is required', 400);
        if (empty($body['date']))   fail('date is required', 400);

        $userId   = getUserId($db, $uid);
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

        // Mirror to Firestore (non-blocking)
        try {
            firestore_upsert($uid, 'income', (string)$income['id'], [
                'pgId'     => (int)   $income['id'],
                'amount'   => (float) $income['amount'],
                'currency' => $income['currency'],
                'source'   => $income['source'],
                'date'     => $income['date'],
                'month'    => $income['month'],
                'note'     => $income['note'],
            ]);
        } catch (Throwable $e) {
            // Firestore sync failure must never block PostgreSQL response
        }

        ok($income, 201);
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

        // Mirror to Firestore (non-blocking)
        try {
            firestore_upsert($uid, 'income', (string)$id, [
                'pgId'     => (int)   $income['id'],
                'amount'   => (float) $income['amount'],
                'currency' => $income['currency'],
                'source'   => $income['source'],
                'date'     => $income['date'],
                'month'    => $income['month'],
                'note'     => $income['note'],
            ]);
        } catch (Throwable $e) {
            // Firestore sync failure must never block PostgreSQL response
        }

        ok($income);
    }

    // DELETE
    if ($method === 'DELETE') {
        if (!$id) fail('id is required', 400);
        $uid = $_GET['uid'] ?? null;
        if (!$uid) fail('uid is required', 400);

        $userId = getUserId($db, $uid);
        $stmt = $db->prepare("DELETE FROM finova.income WHERE id = :id AND user_id = :userId RETURNING id");
        $stmt->execute([':id' => $id, ':userId' => $userId]);
        if (!$stmt->fetch()) fail('Income not found', 404);

        // Mirror delete to Firestore (non-blocking)
        try {
            firestore_delete($uid, 'income', (string)$id);
        } catch (Throwable $e) {
            // Firestore sync failure must never block PostgreSQL response
        }

        ok(['deleted' => true, 'id' => $id]);
    }

    fail('Method not allowed', 405);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    if (!headers_sent()) fail('Server error: ' . $e->getMessage(), 500);
}