<?php
require_once 'config.php';
require_once 'auth_middleware.php';
require_once __DIR__ . '/../services/aiService.php';



// ── MAIN LOGIC ─────────────────────────────
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);

    // Read raw JSON body
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);

    $message = $payload['message'] ?? null;
    if (!$message) fail('message is required', 400);

    $month = date('Y-m'); // Default chat context to current month

    $db = getDb();
    $userId = requireAuth($db);
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
