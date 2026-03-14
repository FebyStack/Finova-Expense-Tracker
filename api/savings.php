<?php
// api/savings.php
// GET    /api/savings.php?uid=xxx
// GET    /api/savings.php?id=1&uid=xxx
// POST   /api/savings.php
// PUT    /api/savings.php?id=1
// DELETE /api/savings.php?id=1&uid=xxx

require_once __DIR__ . '/../services/BaseApi.php';

class SavingsApi extends BaseApi {

    protected function index(): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'SELECT * FROM finova.savings_goals WHERE user_id = $1 ORDER BY created_at DESC'
        );
        $stmt->execute([$userId]);
        jsonSuccess(['savings' => $stmt->fetchAll()]);
    }

    protected function show(int $id): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'SELECT * FROM finova.savings_goals WHERE id = $1 AND user_id = $2'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        if (!$row) jsonError('Savings goal not found', 404);
        jsonSuccess($row);
    }

    protected function store(): void {
        $body = getRequestBody();
        $uid  = $body['uid'] ?? requireUID();
        $this->requireFields($body, ['name', 'targetAmount']);

        $userId = $this->getUserId($uid);
        $target = $this->safeFloat($body['targetAmount']);

        if ($target <= 0) jsonError('Target amount must be greater than zero', 400);

        $this->db->beginTransaction();
        $stmt = $this->db->prepare('
            INSERT INTO finova.savings_goals (user_id, name, target_amount, current_amount, deadline)
            VALUES ($1,$2,$3,$4,$5)
            RETURNING *
        ');
        $stmt->execute([
            $userId,
            trim($body['name']),
            $target,
            $this->safeFloat($body['currentAmount'] ?? 0),
            $body['deadline'] ?? null,
        ]);
        $goal = $stmt->fetch();
        $this->db->commit();

        $this->firestore->upsert($uid, 'savings', (string) $goal['id'], [
            'pgId'          => (int)   $goal['id'],
            'name'          => $goal['name'],
            'targetAmount'  => (float) $goal['target_amount'],
            'currentAmount' => (float) $goal['current_amount'],
            'deadline'      => $goal['deadline'],
        ]);

        jsonSuccess($goal, 201);
    }

    protected function update(int $id): void {
        $body   = getRequestBody();
        $uid    = $body['uid'] ?? requireUID();
        $userId = $this->getUserId($uid);

        $this->db->beginTransaction();
        $stmt = $this->db->prepare('
            UPDATE finova.savings_goals SET
                name           = COALESCE($1, name),
                target_amount  = COALESCE($2, target_amount),
                current_amount = COALESCE($3, current_amount),
                deadline       = COALESCE($4, deadline),
                updated_at     = NOW()
            WHERE id = $5 AND user_id = $6
            RETURNING *
        ');
        $stmt->execute([
            $body['name']                  ?? null,
            isset($body['targetAmount'])   ? $this->safeFloat($body['targetAmount'])  : null,
            isset($body['currentAmount'])  ? $this->safeFloat($body['currentAmount']) : null,
            $body['deadline']              ?? null,
            $id, $userId,
        ]);
        $goal = $stmt->fetch();
        if (!$goal) { $this->db->rollBack(); jsonError('Savings goal not found', 404); }
        $this->db->commit();

        $this->firestore->upsert($uid, 'savings', (string) $id, [
            'pgId'          => (int)   $goal['id'],
            'name'          => $goal['name'],
            'targetAmount'  => (float) $goal['target_amount'],
            'currentAmount' => (float) $goal['current_amount'],
            'deadline'      => $goal['deadline'],
        ]);

        jsonSuccess($goal);
    }

    protected function destroy(int $id): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'DELETE FROM finova.savings_goals WHERE id = $1 AND user_id = $2 RETURNING id'
        );
        $stmt->execute([$id, $userId]);
        if (!$stmt->fetch()) jsonError('Savings goal not found', 404);

        $this->firestore->delete($uid, 'savings', (string) $id);
        jsonSuccess(['deleted' => true, 'id' => $id]);
    }
}

(new SavingsApi())->dispatch();
