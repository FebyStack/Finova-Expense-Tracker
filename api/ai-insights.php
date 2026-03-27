<?php
// api/ai-insights.php
// Advanced AI Spending Insights Endpoint (Gemini API)

ini_set('display_errors', 0);
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
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
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method !== 'GET' && $method !== 'POST') fail('Method not allowed', 405);

    $uid = $_GET['uid'] ?? $_POST['uid'] ?? null;
    if (!$uid) fail('uid is required', 400);

    // Default to current month if not provided
    $month = $_GET['month'] ?? $_POST['month'] ?? date('Y-m');
    $force = isset($_GET['force']) && $_GET['force'] === 'true';

    $db = getDb();
    $userId = getUserId($db, $uid);

    // 1. Check Cache first
    if (!$force) {
        $stmt = $db->prepare("SELECT insights_json, updated_at FROM finova.ai_insights WHERE user_id = :userId AND month = :month");
        $stmt->execute([':userId' => $userId, ':month' => $month]);
        $row = $stmt->fetch();
        if ($row) {
            $updated = strtotime($row['updated_at']);
            // If cache is less than 24 hours old, return it
            if (time() - $updated < 86400) {
                $decoded = json_decode($row['insights_json'], true);
                $decoded['_cached'] = true;
                ok($decoded);
            }
        }
    }

    // 2. Init AI Service
    $aiService = new AIService($db, $userId);
    $summary = $aiService->getUserFinancialSummary($month);

    if (!$summary['hasData']) {
        fail('Not enough data to generate insights yet.', 200);
    }

    // 3. Construct Prompt
    $prompt = $aiService->buildInsightsPrompt($month, $summary);

    // 4. Call Gemini API
    $text = $aiService->callGeminiApi($prompt, true); // true = force JSON mode

    // 5. Validate Output
    $parsed = json_decode($text, true);
    if (!$parsed || !isset($parsed['summary'])) {
        fail('Could not parse AI insights: ' . $text, 500);
    }

    // 6. Store Cache
    $jsonStore = json_encode($parsed);
    $stmt = $db->prepare("
        INSERT INTO finova.ai_insights (user_id, month, insights_json, updated_at) 
        VALUES (:userId, :month, :json, NOW())
        ON CONFLICT (user_id, month) 
        DO UPDATE SET insights_json = EXCLUDED.insights_json, updated_at = NOW()
    ");
    $stmt->execute([
        ':userId' => $userId,
        ':month' => $month,
        ':json' => $jsonStore
    ]);

    $parsed['_cached'] = false;
    ok($parsed);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    fail('Server error: ' . $e->getMessage(), 500);
}
