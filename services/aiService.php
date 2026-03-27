<?php
// services/aiService.php

class AIService {
    private PDO $db;
    private int $userId;

    public function __construct(PDO $db, int $userId) {
        $this->db = $db;
        $this->userId = $userId;
    }

    public static function getEnvVar(string $key): ?string {
        $path = __DIR__ . '/../.env';
        if (!file_exists($path)) return null;
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) continue;
            [$k, $v] = explode('=', $line, 2) + [NULL, NULL];
            if (trim($k) === $key) return trim($v, " \t\n\r\0\x0B\"'");
        }
        return null;
    }

    public function getUserFinancialSummary(string $month): array {
        $stmt = $this->db->prepare("SELECT amount, category, date, note FROM finova.expenses WHERE user_id = :userId AND month = :month AND amount > 0");
        $stmt->execute([':userId' => $this->userId, ':month' => $month]);
        $expenses = $stmt->fetchAll();

        if (count($expenses) === 0) {
            return [
                'hasData' => false,
                'total' => 0,
                'transactions' => 0,
                'categories' => [],
                'topCategoryName' => 'None',
                'topCategoryAmt' => 0,
                'categoryString' => "No expenses recorded this month."
            ];
        }

        $total = 0;
        $categories = [];
        foreach ($expenses as $exp) {
            $amt = (float) $exp['amount'];
            $cat = $exp['category'] ?: 'Other';
            $total += $amt;
            if (!isset($categories[$cat])) $categories[$cat] = 0;
            $categories[$cat] += $amt;
        }

        arsort($categories);
        $topCategoryName = key($categories);
        $topCategoryAmt = current($categories);

        $catString = "";
        foreach ($categories as $c => $a) {
            $catString .= "- $c: $a\n";
        }

        // Fetch Income for the month
        $stmtInc = $this->db->prepare("SELECT SUM(amount) as total_income FROM finova.income WHERE user_id = :u AND month = :m");
        $stmtInc->execute([':u' => $this->userId, ':m' => $month]);
        $totalIncome = (float)($stmtInc->fetchColumn() ?: 0);

        // Fetch Total Savings (Fault-tolerant)
        $totalSavings = 0;
        try {
            // Attempt to sum current_amount or saved_amount from savings_goals
            $stmtSav = $this->db->prepare("SELECT SUM(current_amount) FROM finova.savings_goals WHERE user_id = :u");
            $stmtSav->execute([':u' => $this->userId]);
            $totalSavings = (float)($stmtSav->fetchColumn() ?: 0);
            
            if ($totalSavings == 0) { // Fallback to saved_amount if current_amount was 0 or incorrect
                $stmtSav2 = $this->db->prepare("SELECT SUM(saved_amount) FROM finova.savings_goals WHERE user_id = :u");
                $stmtSav2->execute([':u' => $this->userId]);
                $totalSavings = (float)($stmtSav2->fetchColumn() ?: 0);
            }
        } catch (Exception $e) { /* Ignore if column/table missing */ }

        // Fetch Budgets (Fault-tolerant)
        $totalBudget = 0;
        $budgetString = "";
        try {
            $stmtBud = $this->db->prepare("SELECT category, amount FROM finova.budgets WHERE user_id = :u AND month = :m");
            $stmtBud->execute([':u' => $this->userId, ':m' => $month]);
            $budgets = $stmtBud->fetchAll();
            
            foreach ($budgets as $b) {
                $totalBudget += (float)$b['amount'];
                $spent = $categories[$b['category']] ?? 0;
                $rem = (float)$b['amount'] - $spent;
                $budgetString .= "- {$b['category']}: Budget ₱{$b['amount']}, Remaining: ₱{$rem}\n";
            }
        } catch (Exception $e) { /* Ignore */ }
        
        $budgetRemaining = $totalBudget - $total;
        if (empty($budgetString)) $budgetString = "No budgets set.";

        // Fetch Subscriptions (Fault-tolerant)
        $subString = "";
        try {
            $stmtRec = $this->db->prepare("SELECT name, amount, frequency FROM finova.recurring_expenses WHERE user_id = :u AND status = 'active'");
            $stmtRec->execute([':u' => $this->userId]);
            $subs = $stmtRec->fetchAll();
            foreach ($subs as $s) {
                $subString .= "- {$s['name']}: ₱{$s['amount']} ({$s['frequency']})\n";
            }
        } catch (Exception $e) { /* Ignore */ }
        if (empty($subString)) $subString = "No active subscriptions.";

        // Previous Month Comparison
        $prevMonth = date('Y-m', strtotime($month . "-01 -1 month"));
        $stmtPrev = $this->db->prepare("SELECT SUM(amount) FROM finova.expenses WHERE user_id = :u AND month = :m AND amount > 0");
        $stmtPrev->execute([':u' => $this->userId, ':m' => $prevMonth]);
        $prevTotal = (float)($stmtPrev->fetchColumn() ?: 0);
        
        $compString = "Last month ($prevMonth): ₱{$prevTotal}. This month ($month): ₱{$total}.";

        // Provide recent transactions (last 10)
        $msgTrans = "";
        $txCount = 0;
        foreach ($expenses as $exp) {
            if ($txCount++ >= 10) break;
            $msgTrans .= "- {$exp['date']}: {$exp['category']} ₱{$exp['amount']} ({$exp['note']})\n";
        }

        return [
            'hasData' => count($expenses) > 0 || $totalIncome > 0,
            'total' => $total,
            'totalIncome' => $totalIncome,
            'netBalance' => $totalIncome - $total,
            'savings' => $totalSavings,
            'budgetRemaining' => $budgetRemaining,
            'categoryBudgets' => $budgetString,
            'transactionsList' => $msgTrans ?: "No recent transactions.",
            'subscriptions' => $subString,
            'monthlyComparison' => $compString,
            'transactions' => count($expenses),
            'categories' => $categories,
            'topCategoryName' => $topCategoryName,
            'topCategoryAmt' => $topCategoryAmt,
            'categoryString' => $catString
        ];
    }

    public function buildInsightsPrompt(string $month, array $summary): string {
        return <<<EOT
You are a financial assistant AI.
Analyze the user's monthly spending data below and provide insights.

DATA:
- Month: {$month}
- Total Spending: {$summary['total']}
- Number of Transactions: {$summary['transactions']}
- Category Breakdown:
{$summary['categoryString']}

Your response MUST be a VALID JSON OBJECT with NO markdown formatting, NO backticks, and NO extra text.
Follow EXACTLY this structure:
{
  "summary": "A short 1-2 sentence overview of spending behavior",
  "insights": [
    "Bullet point explaining pattern 1",
    "Bullet point explaining pattern 2"
  ],
  "topCategory": {
    "name": "{$summary['topCategoryName']}",
    "reason": "Explain why this category is high based on typical financial behavior"
  },
  "recommendations": [
    "Practical saving tip 1",
    "Practical saving tip 2",
    "Practical saving tip 3"
  ],
  "warning": "Mention risky patterns like overspending or imbalance, or null if everything is great"
}
EOT;
    }

    public function buildChatPrompt(string $message, array $history, array $summary): string {
        $historyText = "";
        foreach ($history as $msg) {
            $historyText .= "User: {$msg['message']}\nAI: {$msg['response']}\n\n";
        }
        if (empty($historyText)) $historyText = "No previous conversation.";

        return <<<EOT
You are a smart personal finance assistant with access to the user's financial data in this system. Answer any question the user has about their finances using the data provided to you.

═══════════════════════════════════
YOU CANNOT ANSWER THE FOLLOWING:
═══════════════════════════════════
❌ Stock market tips or investment advice
❌ Tax filing, legal, or accounting advice
❌ Cryptocurrency trading or speculation
❌ Advice about other people's finances
❌ Loan applications or credit score manipulation
❌ Insurance policy recommendations
❌ Business financial planning outside personal use
❌ Predicting future income with no data basis
❌ Anything unrelated to personal finance entirely (e.g., coding, cooking, travel, general knowledge questions)

═══════════════════════════════════
ERROR HANDLING
═══════════════════════════════════
If the user asks something outside the restricted scope above OR the data needed is not available in the system, respond EXACTLY in this format:

---
⚠️ I'm not able to help with that.

[Pick the correct reason]:
- That falls outside what I'm designed to assist with.
- I don't have enough data in your account to answer that yet.

💡 But here are some things I can help you with right now:
1. "What is my net income this month?"
2. "How much have I spent on [category]?"
3. "Am I within my monthly budget?"
4. "What category am I overspending on?"
5. "How much have I saved this month?"
6. "Show me my top expenses this month"
7. "Compare my spending from last month"
8. "How much is left in my [category] budget?"
9. "What are my recurring subscriptions?"
10. "Give me a summary of my finances this month"
---

═══════════════════════════════════
BEHAVIOR RULES
═══════════════════════════════════
- Always answer freely if the question is about the user's own financial data
- Never be vague. If you can answer it, answer it directly
- If data is missing, tell the user specifically what data is missing and suggest they log it in the app
- Never repeat the same refusal message twice in a row — vary your wording while keeping the format
- Always be conversational, helpful, and encouraging. Use simple vocabulary.

═══════════════════════════════════
USER DATA CONTEXT
═══════════════════════════════════
Net Income this month: {$summary['netBalance']}
Total Expenses: {$summary['total']}
Savings: {$summary['savings']}
Budget Remaining: {$summary['budgetRemaining']}
Budget per Category: 
{$summary['categoryBudgets']}

Top Expense Category: {$summary['topCategoryName']} (₱{$summary['topCategoryAmt']})

Transaction History (Recent): 
{$summary['transactionsList']}

Recurring Subscriptions: 
{$summary['subscriptions']}

Monthly Comparison Data: {$summary['monthlyComparison']}

CONVERSATION HISTORY:
{$historyText}

USER MESSAGE:
{$message}
EOT;
    }

    public function callGeminiApi(string $prompt, bool $jsonMode = false): string {
        $apiKey = self::getEnvVar('GEMINI_API_KEY');
        if (!$apiKey) {
            throw new Exception("AI Services are not configured (API key missing).");
        }

        $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" . $apiKey;

        $payload = [
            "contents" => [
                [
                    "parts" => [
                        ["text" => $prompt]
                    ]
                ]
            ],
            "generationConfig" => [
                "temperature" => 0.7
            ]
        ];

        if ($jsonMode) {
            $payload["generationConfig"]["responseMimeType"] = "application/json";
        }

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !$response) {
            $err = $response ? json_decode($response, true)['error']['message'] ?? '' : 'Network error';
            throw new Exception("Gemini API error: $err");
        }

        $data = json_decode($response, true);
        $text = $data['candidates'][0]['content']['parts'][0]['text'] ?? null;
        
        if (!$text) {
            throw new Exception("Invalid response from Gemini");
        }

        return $text;
    }
}
