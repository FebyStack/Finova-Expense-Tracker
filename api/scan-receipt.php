<?php
require_once 'config.php';
require_once 'auth_middleware.php';
require_once __DIR__ . '/../services/aiService.php';

try {
    // 1. Auth check
    $pdo = getDb();
    requireAuth($pdo);

    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body || empty($body['image_base64']) || empty($body['mime_type'])) {
        fail('Missing image_base64 or mime_type', 400);
    }

    // Grab API Keys using AIService utility
    $anthropicKey = AIService::getEnvVar('ANTHROPIC_API_KEY');
    $geminiKey = AIService::getEnvVar('GEMINI_API_KEY');


    $prompt = "Analyze this receipt image and extract the following information. Respond ONLY with a valid JSON object, no markdown, no explanation.\n\n" .
              "{\n" .
              "  \"merchant\": \"store or restaurant name\",\n" .
              "  \"date\": \"YYYY-MM-DD format, or null if not found\",\n" .
              "  \"total\": number (the final total amount paid, as a number only),\n" .
              "  \"currency\": \"PHP, USD, EUR, etc — detect from symbols like ₱ = PHP, $ = USD\",\n" .
              "  \"items\": [\"list\", \"of\", \"items\", \"purchased\"],\n" .
              "  \"tax\": number or null,\n" .
              "  \"confidence\": \"high, medium, or low\"\n" .
              "}\n\n" .
              "Rules:\n" .
              "- total must be the FINAL amount paid (after tax, after discounts)\n" .
              "- If you see ₱ symbol, currency is PHP\n" .
              "- date must be YYYY-MM-DD format\n" .
              "- If any field cannot be determined, use null\n" .
              "- items should be actual product names, max 5 items";

    $text = '';

    if ($anthropicKey) {
        // Use Anthropic
        $url = 'https://api.anthropic.com/v1/messages';
        $payload = [
            'model' => 'claude-3-haiku-20240307',
            'max_tokens' => 1000,
            'messages' => [
                [
                    'role' => 'user',
                    'content' => [
                        [
                            'type' => 'image',
                            'source' => [
                                'type' => 'base64',
                                'media_type' => $body['mime_type'],
                                'data' => $body['image_base64']
                            ]
                        ],
                        [
                            'type' => 'text',
                            'text' => $prompt
                        ]
                    ]
                ]
            ]
        ];
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'x-api-key: ' . $anthropicKey,
            'anthropic-version: 2023-06-01'
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !$response) {
            $err = json_decode($response, true);
            fail("Anthropic API error: " . ($err['error']['message'] ?? 'Unknown error'), 500);
        }

        $resData = json_decode($response, true);
        $text = $resData['content'][0]['text'] ?? '';

    } else if ($geminiKey) {
        // Fallback to Gemini 
        $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" . $geminiKey;
        
        $payload = [
            "contents" => [
                [
                    "parts" => [
                        [
                            "inlineData" => [
                                "mimeType" => $body['mime_type'],
                                "data" => $body['image_base64']
                            ]
                        ],
                        [
                            "text" => $prompt
                        ]
                    ]
                ]
            ],
            "generationConfig" => [
                "temperature" => 0.1,
                "responseMimeType" => "application/json"
            ]
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !$response) {
            $err = json_decode($response, true);
            fail("Gemini API error: " . ($err['error']['message'] ?? 'Unknown error'), 500);
        }

        $resData = json_decode($response, true);
        $text = $resData['candidates'][0]['content']['parts'][0]['text'] ?? '';

    } else {
        fail('No AI keys configured. Please add GEMINI_API_KEY or ANTHROPIC_API_KEY to your .env file.', 500);
    }

    ok(['text' => $text]);

} catch (PDOException $e) {
    fail('Database error', 500);
} catch (Throwable $e) {
    fail('Server Error: ' . $e->getMessage(), 500);
}
