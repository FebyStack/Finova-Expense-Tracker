<?php
// ============================================================
// upload.php — PHP File Upload Handler
// Upload file → Save locally → Write metadata to Firestore
// ============================================================

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// ── Configuration ─────────────────────────────────────────────
define('FIREBASE_PROJECT_ID', 'YOUR_PROJECT_ID');   // ← your Firebase project ID
define('UPLOAD_BASE_DIR',     __DIR__ . '/uploads/');
define('RECEIPTS_DIR',        __DIR__ . '/uploads/receipts/');
define('MAX_FILE_SIZE',       5 * 1024 * 1024);     // 5MB
define('ALLOWED_MIME_TYPES', [
    'image/jpeg'      => 'jpg',
    'image/png'       => 'png',
    'image/gif'       => 'gif',
    'image/webp'      => 'webp',
    'application/pdf' => 'pdf',
]);

// ── Auto-create upload directories ───────────────────────────
foreach ([UPLOAD_BASE_DIR, RECEIPTS_DIR] as $dir) {
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
}

// ── Only allow POST ───────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ── Validate required inputs ──────────────────────────────────
$userId   = isset($_POST['userId'])   ? trim($_POST['userId'])   : null;
$fileType = isset($_POST['fileType']) ? trim($_POST['fileType']) : 'upload';
$idToken  = isset($_POST['idToken'])  ? trim($_POST['idToken'])  : null;

if (!$userId) {
    http_response_code(400);
    echo json_encode(['error' => 'userId is required']);
    exit;
}

// Sanitize fileType — only allow known values
$fileType = in_array($fileType, ['receipt', 'upload', 'document']) ? $fileType : 'upload';

// ── Check file upload ─────────────────────────────────────────
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $uploadErrors = [
        UPLOAD_ERR_INI_SIZE   => 'File exceeds server upload limit',
        UPLOAD_ERR_FORM_SIZE  => 'File exceeds form size limit',
        UPLOAD_ERR_PARTIAL    => 'File was only partially uploaded',
        UPLOAD_ERR_NO_FILE    => 'No file was uploaded',
        UPLOAD_ERR_NO_TMP_DIR => 'Server temp directory missing',
        UPLOAD_ERR_CANT_WRITE => 'Server failed to write file',
        UPLOAD_ERR_EXTENSION  => 'Upload blocked by PHP extension',
    ];
    $code = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
    http_response_code(400);
    echo json_encode(['error' => $uploadErrors[$code] ?? 'Upload failed']);
    exit;
}

$file = $_FILES['file'];

// ── Security check 1: File size ───────────────────────────────
if ($file['size'] > MAX_FILE_SIZE) {
    http_response_code(400);
    echo json_encode(['error' => 'File exceeds 5MB maximum size']);
    exit;
}

// ── Security check 2: Real MIME type via finfo ────────────────
// Reads actual file bytes — cannot be spoofed by renaming
$finfo    = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($file['tmp_name']);

if (!array_key_exists($mimeType, ALLOWED_MIME_TYPES)) {
    http_response_code(400);
    echo json_encode([
        'error'    => 'Invalid file type. Allowed: JPG, PNG, GIF, WEBP, PDF',
        'detected' => $mimeType,
    ]);
    exit;
}

// ── Security check 3: Image integrity ────────────────────────
if (strpos($mimeType, 'image/') === 0 && !getimagesize($file['tmp_name'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Uploaded image appears to be corrupted']);
    exit;
}

// ── Generate unique filename ──────────────────────────────────
$extension = ALLOWED_MIME_TYPES[$mimeType];
$prefix    = $fileType === 'receipt' ? 'receipt' : 'file';
$fileName  = uniqid($prefix . '_', true) . '.' . $extension;

// ── Determine save location ───────────────────────────────────
$isReceipt    = $fileType === 'receipt';
$destPath     = ($isReceipt ? RECEIPTS_DIR : UPLOAD_BASE_DIR) . $fileName;
$publicPath   = '/uploads/' . ($isReceipt ? 'receipts/' : '') . $fileName;

// ── Move file to final destination ────────────────────────────
if (!move_uploaded_file($file['tmp_name'], $destPath)) {
    http_response_code(500);
    echo json_encode(['error' => 'Server failed to save the file']);
    exit;
}

chmod($destPath, 0644); // Safe read-only permissions

// ── Build metadata ────────────────────────────────────────────
$metadata = [
    'fileName'     => $fileName,
    'originalName' => basename($file['name']),
    'filePath'     => $publicPath,
    'uploadDate'   => date('Y-m-d'),
    'userId'       => $userId,
    'fileType'     => $fileType,
    'mimeType'     => $mimeType,
    'fileSize'     => $file['size'],
    'createdAt'    => date('c'),
];

// ── Write metadata to Firestore ───────────────────────────────
$result = saveToFirestore($userId, $metadata, $idToken);

if (!$result['success']) {
    error_log('[Finova] Firestore write failed: ' . $result['error']);
    http_response_code(207);
    echo json_encode([
        'success' => true,
        'warning' => 'File saved but metadata sync failed.',
        'fileName' => $fileName,
        'filePath' => $publicPath,
    ]);
    exit;
}

http_response_code(200);
echo json_encode([
    'success'    => true,
    'fileName'   => $fileName,
    'filePath'   => $publicPath,
    'documentId' => $result['documentId'],
    'metadata'   => $metadata,
]);


// ════════════════════════════════════════════════════════════
// saveToFirestore()
// Writes metadata to: users/{userId}/uploads/{autoId}
// Uses Firestore REST API with typed field values
// ════════════════════════════════════════════════════════════
function saveToFirestore(string $userId, array $metadata, ?string $idToken): array
{
    $url = sprintf(
        'https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents/users/%s/uploads',
        FIREBASE_PROJECT_ID,
        $userId
    );

    // Convert to Firestore typed values
    $fields = [];
    foreach ($metadata as $key => $value) {
        if (is_int($value))   $fields[$key] = ['integerValue' => (string) $value];
        elseif (is_float($value)) $fields[$key] = ['doubleValue'  => $value];
        elseif (is_bool($value))  $fields[$key] = ['booleanValue' => $value];
        else                      $fields[$key] = ['stringValue'  => (string) $value];
    }

    $headers = ['Content-Type: application/json'];
    if ($idToken) $headers[] = 'Authorization: Bearer ' . $idToken;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode(['fields' => $fields]),
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response  = curl_exec($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) return ['success' => false, 'error' => $curlError];
    if ($httpCode !== 200) return ['success' => false, 'error' => "HTTP {$httpCode}: {$response}"];

    $data = json_decode($response, true);
    return ['success' => true, 'documentId' => basename($data['name'] ?? 'unknown')];
}