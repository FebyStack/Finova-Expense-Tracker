<?php
// api/budgets.php — standalone + Firestore mirror

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
            $stmt = $db->prepare("SELECT * FROM finova.budgets WHERE id = :id AND user_id = :userId");
            $stmt->execute([':id' => $id, ':userId' => $userId]);
            $row = $stmt->fetch();
            if (!$row) fail('Budget not found', 404);
            ok($row);
        }

        $sql    = "SELECT * FROM finova.budgets WHERE user_id = :userId";
        $params = [':userId' => $userId];
        if (!empty($_GET['month'])) { $sql .= " AND month = :month"; $params[':month'] = (int)$_GET['month']; }
        if (!empty($_GET['year']))  { $sql .= " AND year = :year";   $params[':year']  = (int)$_GET['year']; }
        $sql .= " ORDER BY category ASC";
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        ok(['budgets' => $stmt->fetchAll()]);
    }

    // POST
    if ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        $uid  = $body['uid'] ?? null;
        if (!$uid)                      fail('uid is required', 400);
        if (empty($body['category']))    fail('category is required', 400);
        if (empty($body['limitAmount'])) fail('limitAmount is required', 400);
        if (empty($body['month']))       fail('month is required', 400);
        if (empty($body['year']))        fail('year is required', 400);

        $userId = getUserId($db, $uid);

        $db->beginTransaction();
        $stmt = $db->prepare("
            INSERT INTO finova.budgets (user_id, category, limit_amount, spent, month, year)
            VALUES (:userId,:category,:limit,:spent,:month,:year)
            ON CONFLICT (user_id, category, month, year) DO UPDATE SET
                limit_amount = EXCLUDED.limit_amount,
                updated_at   = NOW()
            RETURNING *
        ");
        $stmt->execute([
            ':userId'  => $userId,
            ':category'=> $body['category'],
            ':limit'   => (float)$body['limitAmount'],
            ':spent'   => (float)($body['spent'] ?? 0),
            ':month'   => (int)$body['month'],
            ':year'    => (int)$body['year'],
        ]);
        $budget = $stmt->fetch();
        $db->commit();

        firestore_upsert($uid, 'budgets', (string)$budget['id'], [
            'pgId'        => (int)   $budget['id'],
            'category'    => $budget['category'],
            'limitAmount' => (float) $budget['limit_amount'],
            'spent'       => (float) $budget['spent'],
            'month'       => (int)   $budget['month'],
            'year'        => (int)   $budget['year'],
        ]);

        ok($budget, 201);
    }

    // PUT
    if ($method === 'PUT') {
        if (!$id) fail('id is required', 400);
        $body = json_decode(file_get_contents('php://input'), true);
        $uid  = $body['uid'] ?? null;
        if (!$uid) fail('uid is required', 400);

        $userId = getUserId($db, $uid);

        $db->beginTransaction();
        $stmt = $db->prepare("
            UPDATE finova.budgets SET
                limit_amount = COALESCE(:limit, limit_amount),
                spent        = COALESCE(:spent, spent),
                updated_at   = NOW()
            WHERE id = :id AND user_id = :userId
            RETURNING *
        ");
        $stmt->execute([
            ':limit'  => isset($body['limitAmount']) ? (float)$body['limitAmount'] : null,
            ':spent'  => isset($body['spent'])       ? (float)$body['spent']       : null,
            ':id'     => $id,
            ':userId' => $userId,
        ]);
        $budget = $stmt->fetch();
        if (!$budget) { $db->rollBack(); fail('Budget not found', 404); }
        $db->commit();

        firestore_upsert($uid, 'budgets', (string)$id, [
            'pgId'        => (int)   $budget['id'],
            'category'    => $budget['category'],
            'limitAmount' => (float) $budget['limit_amount'],
            'spent'       => (float) $budget['spent'],
            'month'       => (int)   $budget['month'],
            'year'        => (int)   $budget['year'],
        ]);

        ok($budget);
    }

    // DELETE
    if ($method === 'DELETE') {
        if (!$id) fail('id is required', 400);
        $uid = $_GET['uid'] ?? null;
        if (!$uid) fail('uid is required', 400);

        $userId = getUserId($db, $uid);
        $stmt = $db->prepare("DELETE FROM finova.budgets WHERE id = :id AND user_id = :userId RETURNING id");
        $stmt->execute([':id' => $id, ':userId' => $userId]);
        if (!$stmt->fetch()) fail('Budget not found', 404);

        firestore_delete($uid, 'budgets', (string)$id);
        ok(['deleted' => true, 'id' => $id]);
    }

    fail('Method not allowed', 405);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    if (!headers_sent()) fail('Server error: ' . $e->getMessage(), 500);
}