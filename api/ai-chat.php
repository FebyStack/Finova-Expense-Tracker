<?php
// api/ai-chat.php
// Interactive AI Chat Assistant Endpoint (Gemini API)

ini_set('display_errors', 0);
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Firebase-UID');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../services/aiService.php';

function ok(mixed $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data]);
    exit;
}
function fail(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}

// ── Database ───────────────────────────────
function getDb(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO('pgsql:host=localhost;port=5432;dbname=finova_db', 'postgres', 'bingbong321', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec("SET search_path TO finova, public");
    }
    return $pdo;
}

function getUserId(PDO $db, string $uid): int {
    $stmt = $db->prepare("SELECT id FROM finova.users WHERE firebase_uid = :uid");
    $stmt->execute([':uid' => $uid]);
    $row = $stmt->fetch();
    if ($row) return (int) $row['id'];
    
    $stmt = $db->prepare("
        INSERT INTO finova.users (firebase_uid, email, display_name, base_currency, created_at) 
        VALUES (:uid, :email, :name, 'PHP', NOW())
        RETURNING id
    ");
    $stmt->execute([':uid' => $uid, ':email' => $uid . '@placeholder.com', ':name' => 'Imported User']);
    return (int) $stmt->fetchColumn();
}

// ── MAIN LOGIC ─────────────────────────────
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);

    // Read raw JSON body
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);

    $uid = $payload['uid'] ?? null;
    $message = $payload['message'] ?? null;
    if (!$uid || !$message) fail('uid and message are required', 400);

    $month = date('Y-m'); // Default chat context to current month

    $db = getDb();
    $userId = getUserId($db, $uid);
    $aiService = new AIService($db, $userId);

    // 1. Fetch Chat History (Last 5 messages)
    $stmt = $db->prepare("
        SELECT message, response 
        FROM finova.ai_chat_logs 
        WHERE user_id = :userId 
        ORDER BY created_at DESC 
        LIMIT 5
    ");
    $stmt->execute([':userId' => $userId]);
    $history = array_reverse($stmt->fetchAll()); // Order chronologically

    // 2. Fetch User Financial Summary
    $summary = $aiService->getUserFinancialSummary($month);

    // 3. Build Conversational Prompt
    $prompt = $aiService->buildChatPrompt($message, $history, $summary);

    // 4. Call Gemini
    $replyParams = $aiService->callGeminiApi($prompt, false); // false = text mode

    // 5. Save Interaction to Logs
    $stmt = $db->prepare("
        INSERT INTO finova.ai_chat_logs (user_id, message, response, created_at) 
        VALUES (:userId, :message, :response, NOW())
    ");
    $stmt->execute([
        ':userId' => $userId,
        ':message' => $message,
        ':response' => $replyParams
    ]);

    ok(['reply' => $replyParams]);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    fail('Server error: ' . $e->getMessage(), 500);
}
