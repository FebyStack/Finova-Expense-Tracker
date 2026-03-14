<?php
// api/uploads.php
// GET    /api/uploads.php?uid=xxx
// GET    /api/uploads.php?id=1&uid=xxx
// POST   /api/uploads.php  — multipart/form-data: file + uid [+ expenseId]
// DELETE /api/uploads.php?id=1&uid=xxx
// PUT    — not supported (uploads are immutable)

require_once __DIR__ . '/../services/BaseApi.php';

class UploadsApi extends BaseApi {

    private const MAX_SIZE    = 5 * 1024 * 1024; // 5 MB
    private const ALLOWED_MIME = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
    ];

    private string $uploadDir;
    private string $uploadUrl;

    public function __construct() {
        parent::__construct();
        $this->uploadDir = __DIR__ . '/../uploads/receipts/';
        $this->uploadUrl = 'uploads/receipts/';
    }

    protected function index(): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'SELECT * FROM finova.uploads WHERE user_id = $1 ORDER BY created_at DESC'
        );
        $stmt->execute([$userId]);
        jsonSuccess(['uploads' => $stmt->fetchAll()]);
    }

    protected function show(int $id): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'SELECT * FROM finova.uploads WHERE id = $1 AND user_id = $2'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        if (!$row) jsonError('Upload not found', 404);
        jsonSuccess($row);
    }

    protected function store(): void {
        // File uploads use multipart — read uid from $_POST
        $uid = $_POST['uid'] ?? null;
        if (empty($uid)) jsonError('uid is required', 400);

        if (empty($_FILES['file']) || $_FILES['file']['error'] === UPLOAD_ERR_NO_FILE) {
            jsonError('No file provided', 400);
        }

        $file = $_FILES['file'];

        // Validate upload errors
        if ($file['error'] !== UPLOAD_ERR_OK) {
            $errors = [
                UPLOAD_ERR_INI_SIZE   => 'File exceeds server upload limit',
                UPLOAD_ERR_FORM_SIZE  => 'File exceeds form size limit',
                UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded',
                UPLOAD_ERR_NO_TMP_DIR => 'No temp directory available',
                UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
            ];
            jsonError($errors[$file['error']] ?? 'Upload error: ' . $file['error'], 400);
        }

        // Size check
        if ($file['size'] > self::MAX_SIZE) {
            jsonError('File too large — maximum 5 MB allowed', 400);
        }

        // MIME type check (use finfo for real MIME, not spoofable $_FILES['type'])
        $finfo    = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);
        if (!in_array($mimeType, self::ALLOWED_MIME, true)) {
            jsonError('File type not allowed. Use JPG, PNG, GIF, WEBP, or PDF.', 400);
        }

        // Create upload dir if needed
        if (!is_dir($this->uploadDir)) {
            mkdir($this->uploadDir, 0755, true);
        }

        // Unique filename
        $ext      = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $safeName = uniqid($uid . '_', true) . '.' . $ext;
        $fullPath = $this->uploadDir . $safeName;
        $relPath  = $this->uploadUrl . $safeName;

        if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
            jsonError('Failed to save file to disk', 500);
        }

        $userId = $this->getUserId($uid);

        $this->db->beginTransaction();
        $stmt = $this->db->prepare('
            INSERT INTO finova.uploads (user_id, file_name, file_path, file_type, mime_type, file_size)
            VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING *
        ');
        $stmt->execute([
            $userId,
            $file['name'],
            $relPath,
            $ext,
            $mimeType,
            $file['size'],
        ]);
        $upload = $stmt->fetch();
        $this->db->commit();

        $this->firestore->upsert($uid, 'uploads', (string) $upload['id'], [
            'pgId'     => (int) $upload['id'],
            'fileName' => $upload['file_name'],
            'filePath' => $upload['file_path'],
            'fileType' => $upload['file_type'],
            'mimeType' => $upload['mime_type'],
            'fileSize' => (int) $upload['file_size'],
        ]);

        jsonSuccess($upload, 201);
    }

    protected function update(int $id): void {
        jsonError('Uploads are immutable — delete and re-upload to replace', 405);
    }

    protected function destroy(int $id): void {
        $uid    = requireUID();
        $userId = $this->getUserId($uid);

        $stmt = $this->db->prepare(
            'DELETE FROM finova.uploads WHERE id = $1 AND user_id = $2 RETURNING id, file_path'
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        if (!$row) jsonError('Upload not found', 404);

        // Remove physical file
        $fullPath = __DIR__ . '/../' . $row['file_path'];
        if (file_exists($fullPath)) unlink($fullPath);

        $this->firestore->delete($uid, 'uploads', (string) $id);
        jsonSuccess(['deleted' => true, 'id' => $id]);
    }
}

(new UploadsApi())->dispatch();
