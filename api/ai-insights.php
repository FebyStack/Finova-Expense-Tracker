<?php
// api/ai-insights.php
// Advanced AI Spending Insights Endpoint (Gemini API)

require_once 'config.php';
require_once 'auth_middleware.php';
require_once __DIR__ . '/../services/aiService.php';




// ── MAIN LOGIC ─────────────────────────────
try {
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method !== 'GET' && $method !== 'POST') fail('Method not allowed', 405);

    // Default to current month if not provided
    $month = $_GET['month'] ?? $_POST['month'] ?? date('Y-m');
    $force = isset($_GET['force']) && $_GET['force'] === 'true';

    $db = getDb();
    $userId = requireAuth($db);

    // 1. Check Cache first with a "Staleness" check
    if (!$force) {
        $stmt = $db->prepare("SELECT insights_json, updated_at, data_snapshot FROM finova.ai_insights WHERE user_id = :userId AND month = :month");
        $stmt->execute([':userId' => $userId, ':month' => $month]);
        $row = $stmt->fetch();

        // Generate a more robust "Data Snapshot" as a proxy for changes
        $stmtSnap = $db->prepare("
            SELECT (COUNT(*) || '-' || COALESCE(MAX(id), 0) || '-' || COALESCE(SUM(amount), 0)) as snapshot 
            FROM finova.expenses 
            WHERE user_id = :u AND month = :m
        ");
        $stmtSnap->execute([':u' => $userId, ':m' => $month]);
        $currentSnapshot = $stmtSnap->fetchColumn();

        if ($row) {
            $updated = strtotime($row['updated_at']);
            $cachedSnapshot = $row['data_snapshot'] ?? '';

            // If snapshot matches AND cache is less than 24 hours old, return it
            if ($cachedSnapshot === $currentSnapshot && (time() - $updated < 86400)) {
                $decoded = json_decode($row['insights_json'], true);
                $decoded['_cached'] = true;
                ok($decoded);
            }
        }
    } else {
        // Just for consistency in the logic below
        $stmtSnap = $db->prepare("
            SELECT (COUNT(*) || '-' || COALESCE(MAX(id), 0) || '-' || COALESCE(SUM(amount), 0)) as snapshot 
            FROM finova.expenses 
            WHERE user_id = :u AND month = :m
        ");
        $stmtSnap->execute([':u' => $userId, ':m' => $month]);
        $currentSnapshot = $stmtSnap->fetchColumn();
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
    try {
        $stmt = $db->prepare("
            INSERT INTO finova.ai_insights (user_id, month, insights_json, updated_at, data_snapshot) 
            VALUES (:userId, :month, :json, NOW(), :snap)
            ON CONFLICT (user_id, month) 
            DO UPDATE SET insights_json = EXCLUDED.insights_json, updated_at = NOW(), data_snapshot = EXCLUDED.data_snapshot
        ");
        $stmt->execute([
            ':userId' => $userId,
            ':month' => $month,
            ':json' => $jsonStore,
            ':snap' => $currentSnapshot
        ]);
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'data_snapshot') !== false) {
             $db->exec("ALTER TABLE finova.ai_insights ADD COLUMN IF NOT EXISTS data_snapshot VARCHAR(255)");
             // Retry
             $stmt = $db->prepare("
                INSERT INTO finova.ai_insights (user_id, month, insights_json, updated_at, data_snapshot) 
                VALUES (:userId, :month, :json, NOW(), :snap)
                ON CONFLICT (user_id, month) 
                DO UPDATE SET insights_json = EXCLUDED.insights_json, updated_at = NOW(), data_snapshot = EXCLUDED.data_snapshot
            ");
            $stmt->execute([':userId' => $userId, ':month' => $month, ':json' => $jsonStore, ':snap' => $currentSnapshot]);
        } else throw $e;
    }


    $parsed['_cached'] = false;
    ok($parsed);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    fail('Server error: ' . $e->getMessage(), 500);
}
