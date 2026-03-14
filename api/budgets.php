<?php
// api/budgets.php
// GET    /api/budgets.php?uid=xxx[&month=3&year=2026]
// GET    /api/budgets.php?id=2&uid=xxx
// POST   /api/budgets.php
// PUT    /api/budgets.php?id=2
// DELETE /api/budgets.php?id=2&uid=xxx

require_once __DIR__ . '/../services/BaseApi.php';

class BudgetsApi extends BaseApi {

    protected function index(): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $sql    = 'SELECT * FROM budgets WHERE user_id = $1';
        $params = [$userId];

        if (!empty($_GET['month'])) {
            $params[] = (int) $_GET['month'];
            $sql     .= ' AND month = $' . count($params);
        }
        if (!empty($_GET['year'])) {
            $params[] = (int) $_GET['year'];
            $sql     .= ' AND year = $' . count($params);
        }

        $sql .= ' ORDER BY category ASC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        jsonSuccess(['budgets' => $stmt->fetchAll()]);
    }

    protected function show(int $id): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'SELECT * FROM finova.budgets WHERE id = $1 AND user_id = $2'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        if (!$row) jsonError('Budget not found', 404);
        jsonSuccess($row);
    }

    protected function store(): void {
        $body = getRequestBody();
        $uid  = $body['uid'] ?? requireUID();
        $this->requireFields($body, ['category', 'limitAmount', 'month', 'year']);

        $userId = $this->getUserId($uid);

        $this->db->beginTransaction();
        // ON CONFLICT respects UNIQUE(user_id, category, month, year) constraint
        $stmt = $this->db->prepare('
            INSERT INTO finova.budgets (user_id, category, limit_amount, spent, month, year)
            VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (user_id, category, month, year) DO UPDATE SET
                limit_amount = EXCLUDED.limit_amount,
                updated_at   = NOW()
            RETURNING *
        ');
        $stmt->execute([
            $userId,
            $body['category'],
            $this->safeFloat($body['limitAmount']),
            $this->safeFloat($body['spent'] ?? 0),
            $this->safeInt($body['month']),
            $this->safeInt($body['year']),
        ]);
        $budget = $stmt->fetch();
        $this->db->commit();

        $this->firestore->upsert($uid, 'budgets', (string) $budget['id'], [
            'pgId'        => (int)   $budget['id'],
            'category'    => $budget['category'],
            'limitAmount' => (float) $budget['limit_amount'],
            'spent'       => (float) $budget['spent'],
            'month'       => (int)   $budget['month'],
            'year'        => (int)   $budget['year'],
        ]);

        jsonSuccess($budget, 201);
    }

    protected function update(int $id): void {
        $body   = getRequestBody();
        $uid    = $body['uid'] ?? requireUID();
        $userId = $this->getUserId($uid);

        $this->db->beginTransaction();
        $stmt = $this->db->prepare('
            UPDATE finova.budgets SET
                limit_amount = COALESCE($1, limit_amount),
                spent        = COALESCE($2, spent),
                updated_at   = NOW()
            WHERE id = $3 AND user_id = $4
            RETURNING *
        ');
        $stmt->execute([
            isset($body['limitAmount']) ? $this->safeFloat($body['limitAmount']) : null,
            isset($body['spent'])       ? $this->safeFloat($body['spent'])       : null,
            $id, $userId,
        ]);
        $budget = $stmt->fetch();
        if (!$budget) { $this->db->rollBack(); jsonError('Budget not found', 404); }
        $this->db->commit();

        $this->firestore->upsert($uid, 'budgets', (string) $id, [
            'pgId'        => (int)   $budget['id'],
            'category'    => $budget['category'],
            'limitAmount' => (float) $budget['limit_amount'],
            'spent'       => (float) $budget['spent'],
            'month'       => (int)   $budget['month'],
            'year'        => (int)   $budget['year'],
        ]);

        jsonSuccess($budget);
    }

    protected function destroy(int $id): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'DELETE FROM finova.budgets WHERE id = $1 AND user_id = $2 RETURNING id'
        );
        $stmt->execute([$id, $userId]);
        if (!$stmt->fetch()) jsonError('Budget not found', 404);

        $this->firestore->delete($uid, 'budgets', (string) $id);
        jsonSuccess(['deleted' => true, 'id' => $id]);
    }
}

(new BudgetsApi())->dispatch();
