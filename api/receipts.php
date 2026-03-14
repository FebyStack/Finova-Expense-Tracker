<?php
// api/receipts.php
// GET    /api/receipts.php?uid=xxx
// GET    /api/receipts.php?id=1&uid=xxx
// POST   /api/receipts.php
// PUT    /api/receipts.php?id=1
// DELETE /api/receipts.php?id=1&uid=xxx

require_once __DIR__ . '/../services/BaseApi.php';

class ReceiptsApi extends BaseApi {

    protected function index(): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $sql    = 'SELECT * FROM finova.receipts WHERE user_id = $1';
        $params = [$userId];

        if (!empty($_GET['expense_id'])) {
            $params[] = (int) $_GET['expense_id'];
            $sql     .= ' AND expense_id = $' . count($params);
        }

        $sql .= ' ORDER BY created_at DESC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        jsonSuccess(['receipts' => $stmt->fetchAll()]);
    }

    protected function show(int $id): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'SELECT * FROM finova.receipts WHERE id = $1 AND user_id = $2'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        if (!$row) jsonError('Receipt not found', 404);
        jsonSuccess($row);
    }

    protected function store(): void {
        $body = getRequestBody();
        $uid  = $body['uid'] ?? requireUID();
        $this->requireFields($body, ['fileName', 'filePath']);

        $userId = $this->getUserId($uid);

        $this->db->beginTransaction();
        $stmt = $this->db->prepare('
            INSERT INTO finova.receipts (user_id, expense_id, file_name, file_path, note, upload_date)
            VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)
            RETURNING *
        ');
        $stmt->execute([
            $userId,
            !empty($body['expenseId']) ? (int) $body['expenseId'] : null,
            $body['fileName'],
            $body['filePath'],
            $body['note'] ?? null,
        ]);
        $receipt = $stmt->fetch();
        $this->db->commit();

        $this->firestore->upsert($uid, 'receipts', (string) $receipt['id'], [
            'pgId'       => (int) $receipt['id'],
            'fileName'   => $receipt['file_name'],
            'filePath'   => $receipt['file_path'],
            'expenseId'  => $receipt['expense_id'],
            'note'       => $receipt['note'],
            'uploadDate' => $receipt['upload_date'],
        ]);

        jsonSuccess($receipt, 201);
    }

    protected function update(int $id): void {
        $body   = getRequestBody();
        $uid    = $body['uid'] ?? requireUID();
        $userId = $this->getUserId($uid);

        $this->db->beginTransaction();
        $stmt = $this->db->prepare('
            UPDATE finova.receipts SET
                expense_id = COALESCE($1, expense_id),
                note       = COALESCE($2, note)
            WHERE id = $3 AND user_id = $4
            RETURNING *
        ');
        $stmt->execute([
            !empty($body['expenseId']) ? (int) $body['expenseId'] : null,
            $body['note'] ?? null,
            $id, $userId,
        ]);
        $receipt = $stmt->fetch();
        if (!$receipt) { $this->db->rollBack(); jsonError('Receipt not found', 404); }
        $this->db->commit();

        $this->firestore->upsert($uid, 'receipts', (string) $id, [
            'pgId'      => (int) $receipt['id'],
            'fileName'  => $receipt['file_name'],
            'filePath'  => $receipt['file_path'],
            'expenseId' => $receipt['expense_id'],
            'note'      => $receipt['note'],
        ]);

        jsonSuccess($receipt);
    }

    protected function destroy(int $id): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'DELETE FROM finova.receipts WHERE id = $1 AND user_id = $2 RETURNING id, file_path'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        if (!$row) jsonError('Receipt not found', 404);

        // Optionally clean up the physical file
        if (!empty($row['file_path'])) {
            $full = __DIR__ . '/../' . $row['file_path'];
            if (file_exists($full)) unlink($full);
        }

        $this->firestore->delete($uid, 'receipts', (string) $id);
        jsonSuccess(['deleted' => true, 'id' => $id]);
    }
}

(new ReceiptsApi())->dispatch();
