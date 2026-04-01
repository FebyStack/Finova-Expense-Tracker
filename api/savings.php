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
            $stmt = $db->prepare("SELECT * FROM finova.savings_goals WHERE id = :id AND user_id = :userId");
            $stmt->execute([':id' => $id, ':userId' => $userId]);
            $row = $stmt->fetch();
            if (!$row) fail('Savings goal not found', 404);
            ok($row);
        }

        $stmt = $db->prepare("SELECT * FROM finova.savings_goals WHERE user_id = :userId ORDER BY created_at DESC");
        $stmt->execute([':userId' => $userId]);
        ok(['savings' => $stmt->fetchAll()]);
    }

    // POST
    if ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        if (empty($body['name']))         fail('name is required', 400);
        if (empty($body['targetAmount'])) fail('targetAmount is required', 400);

        $target = (float)$body['targetAmount'];
        if ($target <= 0) fail('Target amount must be greater than zero', 400);

        $db->beginTransaction();
        $stmt = $db->prepare("
            INSERT INTO finova.savings_goals (user_id, name, target_amount, current_amount, deadline)
            VALUES (:userId,:name,:target,:current,:deadline)
            RETURNING *
        ");
        $stmt->execute([
            ':userId'  => $userId,
            ':name'    => trim($body['name']),
            ':target'  => $target,
            ':current' => (float)($body['currentAmount'] ?? 0),
            ':deadline'=> $body['deadline'] ?? null,
        ]);
        $goal = $stmt->fetch();
        $db->commit();

        ok($goal, 201);
    }

    // PUT
    if ($method === 'PUT') {
        if (!$id) fail('id is required', 400);
        $body = json_decode(file_get_contents('php://input'), true);

        $db->beginTransaction();
        $stmt = $db->prepare("
            UPDATE finova.savings_goals SET
                name           = COALESCE(:name,    name),
                target_amount  = COALESCE(:target,  target_amount),
                current_amount = COALESCE(:current, current_amount),
                deadline       = COALESCE(:deadline,deadline),
                updated_at     = NOW()
            WHERE id = :id AND user_id = :userId
            RETURNING *
        ");
        $stmt->execute([
            ':name'    => $body['name']                  ?? null,
            ':target'  => isset($body['targetAmount'])   ? (float)$body['targetAmount']  : null,
            ':current' => isset($body['currentAmount'])  ? (float)$body['currentAmount'] : null,
            ':deadline'=> $body['deadline']              ?? null,
            ':id'      => $id,
            ':userId'  => $userId,
        ]);
        $goal = $stmt->fetch();
        if (!$goal) { $db->rollBack(); fail('Savings goal not found', 404); }
        $db->commit();

        ok($goal);
    }

    // DELETE
    if ($method === 'DELETE') {
        if (!$id) fail('id is required', 400);

        $stmt = $db->prepare("DELETE FROM finova.savings_goals WHERE id = :id AND user_id = :userId RETURNING id");
        $stmt->execute([':id' => $id, ':userId' => $userId]);
        if (!$stmt->fetch()) fail('Savings goal not found', 404);

        ok(['deleted' => true, 'id' => $id]);
    }

    fail('Method not allowed', 405);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    if (!headers_sent()) fail('Server error: ' . $e->getMessage(), 500);
}