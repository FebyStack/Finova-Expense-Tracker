<?php
// api/expenses.php
// GET    /api/expenses.php?uid=xxx[&month=2026-03][&category=Food]
// GET    /api/expenses.php?id=5&uid=xxx
// POST   /api/expenses.php
// PUT    /api/expenses.php?id=5
// DELETE /api/expenses.php?id=5&uid=xxx

require_once __DIR__ . '/../services/BaseApi.php';

class ExpensesApi extends BaseApi {

    protected function index(): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $sql    = 'SELECT * FROM finova.expenses WHERE user_id = $1';
        $params = [$userId];

        if (!empty($_GET['month'])) {
            $params[] = $_GET['month'];
            $sql     .= ' AND month = $' . count($params);
        }
        if (!empty($_GET['category'])) {
            $params[] = $_GET['category'];
            $sql     .= ' AND category = $' . count($params);
        }

        $sql .= ' ORDER BY date DESC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        jsonSuccess(['expenses' => $stmt->fetchAll()]);
    }

    protected function show(int $id): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'SELECT * FROM finova.expenses WHERE id = $1 AND user_id = $2'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        if (!$row) jsonError('Expense not found', 404);
        jsonSuccess($row);
    }

    protected function store(): void {
        $body = getRequestBody();
        $uid  = $body['uid'] ?? requireUID();
        $this->requireFields($body, ['amount', 'category', 'date']);

        $userId   = $this->getUserId($uid);
        $amount   = $this->safeFloat($body['amount']);
        $month    = substr($body['date'], 0, 7);
        $currency = $body['currency']  ?? 'PHP';
        $note     = $body['note']      ?? null;
        $recurring= !empty($body['recurring']);
        $frequency= $recurring ? ($body['frequency'] ?? null) : null;
        $receipt  = $body['receiptPath'] ?? null;

        if ($amount <= 0) jsonError('Amount must be greater than zero', 400);

        $this->db->beginTransaction();
        $stmt = $this->db->prepare('
            INSERT INTO finova.expenses
                (user_id, amount, currency, category, date, month,
                 note, recurring, frequency, receipt_path)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING *
        ');
        $stmt->execute([
            $userId, $amount, $currency,
            $body['category'], $body['date'], $month,
            $note, $recurring ? 'true' : 'false',
            $frequency, $receipt,
        ]);
        $expense = $stmt->fetch();
        $this->db->commit();

        $this->firestore->upsert($uid, 'expenses', (string) $expense['id'], [
            'pgId'        => (int)   $expense['id'],
            'amount'      => (float) $expense['amount'],
            'currency'    => $expense['currency'],
            'category'    => $expense['category'],
            'date'        => $expense['date'],
            'month'       => $expense['month'],
            'note'        => $expense['note'],
            'recurring'   => (bool)  $expense['recurring'],
            'frequency'   => $expense['frequency'],
            'receiptPath' => $expense['receipt_path'],
        ]);

        jsonSuccess($expense, 201);
    }

    protected function update(int $id): void {
        $body   = getRequestBody();
        $uid    = $body['uid'] ?? requireUID();
        $userId = $this->getUserId($uid);
        $month  = isset($body['date']) ? substr($body['date'], 0, 7) : null;

        $this->db->beginTransaction();
        $stmt = $this->db->prepare('
            UPDATE finova.expenses SET
                amount      = COALESCE($1,  amount),
                currency    = COALESCE($2,  currency),
                category    = COALESCE($3,  category),
                date        = COALESCE($4,  date),
                month       = COALESCE($5,  month),
                note        = COALESCE($6,  note),
                recurring   = COALESCE($7,  recurring),
                frequency   = COALESCE($8,  frequency),
                updated_at  = NOW()
            WHERE id = $9 AND user_id = $10
            RETURNING *
        ');
        $stmt->execute([
            isset($body['amount'])    ? $this->safeFloat($body['amount']) : null,
            $body['currency']         ?? null,
            $body['category']         ?? null,
            $body['date']             ?? null,
            $month,
            $body['note']             ?? null,
            isset($body['recurring']) ? ($body['recurring'] ? 'true' : 'false') : null,
            $body['frequency']        ?? null,
            $id, $userId,
        ]);
        $expense = $stmt->fetch();
        if (!$expense) { $this->db->rollBack(); jsonError('Expense not found', 404); }
        $this->db->commit();

        $this->firestore->upsert($uid, 'expenses', (string) $id, [
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

        jsonSuccess($expense);
    }

    protected function destroy(int $id): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'DELETE FROM finova.expenses WHERE id = $1 AND user_id = $2 RETURNING id'
        );
        $stmt->execute([$id, $userId]);
        if (!$stmt->fetch()) jsonError('Expense not found', 404);

        $this->firestore->delete($uid, 'expenses', (string) $id);
        jsonSuccess(['deleted' => true, 'id' => $id]);
    }
}

(new ExpensesApi())->dispatch();
