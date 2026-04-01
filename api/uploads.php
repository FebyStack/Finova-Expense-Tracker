<?php
require_once 'config.php';
require_once 'auth_middleware.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int) $_GET['id'] : null;

$uploadDir = __DIR__ . '/../uploads/receipts/';
$uploadUrl = 'uploads/receipts/';

$MAX_SIZE     = 5 * 1024 * 1024; // 5 MB
$ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

try {
    $db     = getDb();
    $userId = requireAuth($db);

    // GET
    if ($method === 'GET') {
        if ($id) {
            $stmt = $db->prepare("SELECT * FROM finova.uploads WHERE id = :id AND user_id = :userId");
            $stmt->execute([':id' => $id, ':userId' => $userId]);
            $row = $stmt->fetch();
            if (!$row) fail('Upload not found', 404);
            ok($row);
        }

        $stmt = $db->prepare("SELECT * FROM finova.uploads WHERE user_id = :userId ORDER BY created_at DESC");
        $stmt->execute([':userId' => $userId]);
        ok(['uploads' => $stmt->fetchAll()]);
    }

    // POST — file upload
    if ($method === 'POST') {
        if (empty($_FILES['file']) || $_FILES['file']['error'] === UPLOAD_ERR_NO_FILE) {
            fail('No file provided', 400);
        }

        $file = $_FILES['file'];

        if ($file['error'] !== UPLOAD_ERR_OK) {
            $errors = [
                UPLOAD_ERR_INI_SIZE   => 'File exceeds server upload limit',
                UPLOAD_ERR_FORM_SIZE  => 'File exceeds form size limit',
                UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded',
                UPLOAD_ERR_NO_TMP_DIR => 'No temp directory available',
                UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
            ];
            fail($errors[$file['error']] ?? 'Upload error: ' . $file['error'], 400);
        }

        if ($file['size'] > $MAX_SIZE) fail('File too large — maximum 5 MB allowed', 400);

        $finfo    = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);
        if (!in_array($mimeType, $ALLOWED_MIME, true)) {
            fail('File type not allowed. Use JPG, PNG, GIF, WEBP, or PDF.', 400);
        }

        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $ext      = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $safeName = uniqid($userId . '_', true) . '.' . $ext;
        $fullPath = $uploadDir . $safeName;
        $relPath  = $uploadUrl . $safeName;

        if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
            fail('Failed to save file to disk', 500);
        }

        $db->beginTransaction();
        $stmt = $db->prepare("
            INSERT INTO finova.uploads (user_id, file_name, file_path, file_type, mime_type, file_size)
            VALUES (:userId,:fileName,:filePath,:fileType,:mimeType,:fileSize)
            RETURNING *
        ");
        $stmt->execute([
            ':userId'   => $userId,
            ':fileName' => $file['name'],
            ':filePath' => $relPath,
            ':fileType' => $ext,
            ':mimeType' => $mimeType,
            ':fileSize' => $file['size'],
        ]);
        $upload = $stmt->fetch();
        $db->commit();

        ok($upload, 201);
    }

    // DELETE
    if ($method === 'DELETE') {
        if (!$id) fail('id is required', 400);

        $stmt = $db->prepare("DELETE FROM finova.uploads WHERE id = :id AND user_id = :userId RETURNING id, file_path");
        $stmt->execute([':id' => $id, ':userId' => $userId]);
        $row = $stmt->fetch();
        if (!$row) fail('Upload not found', 404);

        $fullPath = __DIR__ . '/../' . $row['file_path'];
        if (file_exists($fullPath)) unlink($fullPath);

        ok(['deleted' => true, 'id' => $id]);
    }

    fail('Method not allowed', 405);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    if (!headers_sent()) fail('Server error: ' . $e->getMessage(), 500);
}
