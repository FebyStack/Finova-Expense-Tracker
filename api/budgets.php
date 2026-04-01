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
        if (empty($body['category']))    fail('category is required', 400);
        if (empty($body['limitAmount'])) fail('limitAmount is required', 400);
        if (empty($body['month']))       fail('month is required', 400);
        if (empty($body['year']))        fail('year is required', 400);

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

        ok($budget, 201);
    }

    // PUT
    if ($method === 'PUT') {
        if (!$id) fail('id is required', 400);
        $body = json_decode(file_get_contents('php://input'), true);

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

        ok($budget);
    }

    // DELETE
    if ($method === 'DELETE') {
        if (!$id) fail('id is required', 400);

        $stmt = $db->prepare("DELETE FROM finova.budgets WHERE id = :id AND user_id = :userId RETURNING id");
        $stmt->execute([':id' => $id, ':userId' => $userId]);
        if (!$stmt->fetch()) fail('Budget not found', 404);

        ok(['deleted' => true, 'id' => $id]);
    }

    fail('Method not allowed', 405);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    if (!headers_sent()) fail('Server error: ' . $e->getMessage(), 500);
}