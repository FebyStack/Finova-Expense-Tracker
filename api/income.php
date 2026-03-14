<?php
// api/income.php
// GET    /api/income.php?uid=xxx[&month=2026-03]
// GET    /api/income.php?id=3&uid=xxx
// POST   /api/income.php
// PUT    /api/income.php?id=3
// DELETE /api/income.php?id=3&uid=xxx

require_once __DIR__ . '/../services/BaseApi.php';

class IncomeApi extends BaseApi {

    protected function index(): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $sql    = 'SELECT * FROM finova.income WHERE user_id = $1';
        $params = [$userId];

        if (!empty($_GET['month'])) {
            $params[] = $_GET['month'];
            $sql     .= ' AND month = $' . count($params);
        }

        $sql .= ' ORDER BY date DESC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        jsonSuccess(['income' => $stmt->fetchAll()]);
    }

    protected function show(int $id): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'SELECT * FROM finova.income WHERE id = $1 AND user_id = $2'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        if (!$row) jsonError('Income record not found', 404);
        jsonSuccess($row);
    }

    protected function store(): void {
        $body = getRequestBody();
        $uid  = $body['uid'] ?? requireUID();
        $this->requireFields($body, ['amount', 'source', 'date']);

        $userId   = $this->getUserId($uid);
        $amount   = $this->safeFloat($body['amount']);
        $month    = substr($body['date'], 0, 7);
        $currency = $body['currency'] ?? 'PHP';

        if ($amount <= 0) jsonError('Amount must be greater than zero', 400);

        $this->db->beginTransaction();
        $stmt = $this->db->prepare('
            INSERT INTO finova.income (user_id, amount, currency, source, date, month, note)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING *
        ');
        $stmt->execute([
            $userId, $amount, $currency,
            $body['source'], $body['date'], $month,
            $body['note'] ?? null,
        ]);
        $income = $stmt->fetch();
        $this->db->commit();

        $this->firestore->upsert($uid, 'income', (string) $income['id'], [
            'pgId'     => (int)   $income['id'],
            'amount'   => (float) $income['amount'],
            'currency' => $income['currency'],
            'source'   => $income['source'],
            'date'     => $income['date'],
            'month'    => $income['month'],
            'note'     => $income['note'],
        ]);

        jsonSuccess($income, 201);
    }

    protected function update(int $id): void {
        $body   = getRequestBody();
        $uid    = $body['uid'] ?? requireUID();
        $userId = $this->getUserId($uid);
        $month  = isset($body['date']) ? substr($body['date'], 0, 7) : null;

        $this->db->beginTransaction();
        $stmt = $this->db->prepare('
            UPDATE finova.income SET
                amount     = COALESCE($1, amount),
                currency   = COALESCE($2, currency),
                source     = COALESCE($3, source),
                date       = COALESCE($4, date),
                month      = COALESCE($5, month),
                note       = COALESCE($6, note),
                updated_at = NOW()
            WHERE id = $7 AND user_id = $8
            RETURNING *
        ');
        $stmt->execute([
            isset($body['amount']) ? $this->safeFloat($body['amount']) : null,
            $body['currency'] ?? null,
            $body['source']   ?? null,
            $body['date']     ?? null,
            $month,
            $body['note']     ?? null,
            $id, $userId,
        ]);
        $income = $stmt->fetch();
        if (!$income) { $this->db->rollBack(); jsonError('Income record not found', 404); }
        $this->db->commit();

        $this->firestore->upsert($uid, 'income', (string) $id, [
            'pgId'     => (int)   $income['id'],
            'amount'   => (float) $income['amount'],
            'currency' => $income['currency'],
            'source'   => $income['source'],
            'date'     => $income['date'],
            'month'    => $income['month'],
            'note'     => $income['note'],
        ]);

        jsonSuccess($income);
    }

    protected function destroy(int $id): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'DELETE FROM finova.income WHERE id = $1 AND user_id = $2 RETURNING id'
        );
        $stmt->execute([$id, $userId]);
        if (!$stmt->fetch()) jsonError('Income record not found', 404);

        $this->firestore->delete($uid, 'income', (string) $id);
        jsonSuccess(['deleted' => true, 'id' => $id]);
    }
}

(new IncomeApi())->dispatch();
