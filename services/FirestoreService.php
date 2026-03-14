<?php
// services/FirestoreService.php
// Mirrors PostgreSQL writes to Firestore via REST API.
// Uses OAuth2 service account JWT — no PHP SDK required.
// Fire-and-forget: failures are logged but never block the main response.

class FirestoreService {

    private string  $projectId;
    private string  $serviceAccountPath;
    private ?string $accessToken  = null;
    private int     $tokenExpiry  = 0;

    public function __construct() {
        $cfg = require __DIR__ . '/../config/firebase.php';
        $this->projectId          = $cfg['project_id'];
        $this->serviceAccountPath = $cfg['service_account_path'];
    }

    // ── Public API ────────────────────────────────────────

    /** Create or overwrite a Firestore document */
    public function upsert(string $uid, string $collection, string $docId, array $data): void {
        $path = "users/{$uid}/{$collection}/{$docId}";
        $this->request('PATCH', $path, $this->toFields($data));
    }

    /** Delete a Firestore document */
    public function delete(string $uid, string $collection, string $docId): void {
        $path = "users/{$uid}/{$collection}/{$docId}";
        $this->request('DELETE', $path);
    }

    // ── Firestore REST ────────────────────────────────────

    private function request(string $method, string $docPath, ?array $fields = null): void {
        try {
            $token = $this->getAccessToken();
            $url   = "https://firestore.googleapis.com/v1/projects/{$this->projectId}"
                   . "/databases/(default)/documents/{$docPath}";

            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST  => $method,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 5,
                CURLOPT_HTTPHEADER     => [
                    'Authorization: Bearer ' . $token,
                    'Content-Type: application/json',
                ],
            ]);

            if ($fields !== null && $method !== 'DELETE') {
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['fields' => $fields]));
            }

            $response = curl_exec($ch);
            $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr  = curl_error($ch);
            curl_close($ch);

            $this->log($method, $docPath, $httpCode, $curlErr ?: $response);

        } catch (Throwable $e) {
            $this->log('ERROR', $docPath, 0, $e->getMessage());
        }
    }

    // ── Value conversion ──────────────────────────────────

    private function toFields(array $data): array {
        $fields = [];
        foreach ($data as $k => $v) {
            $fields[$k] = $this->toValue($v);
        }
        // Track when it was last synced
        $fields['_syncedAt'] = ['integerValue' => (string) time()];
        return $fields;
    }

    private function toValue(mixed $v): array {
        if (is_null($v))   return ['nullValue'    => null];
        if (is_bool($v))   return ['booleanValue' => $v];
        if (is_int($v))    return ['integerValue'  => (string) $v];
        if (is_float($v))  return ['doubleValue'   => $v];
        if (is_string($v)) return ['stringValue'   => $v];
        if (is_array($v)) {
            // Associative → mapValue, indexed → arrayValue
            if (array_keys($v) !== range(0, count($v) - 1)) {
                return ['mapValue' => ['fields' => $this->toFields($v)]];
            }
            return ['arrayValue' => ['values' => array_map([$this, 'toValue'], $v)]];
        }
        return ['stringValue' => (string) $v];
    }

    // ── Service account JWT → OAuth2 token ───────────────

    private function getAccessToken(): string {
        if ($this->accessToken && time() < $this->tokenExpiry) {
            return $this->accessToken;
        }

        if (!file_exists($this->serviceAccountPath)) {
            throw new RuntimeException('serviceAccountKey.json not found at ' . $this->serviceAccountPath);
        }

        $sa = json_decode(file_get_contents($this->serviceAccountPath), true);

        $now    = time();
        $header = $this->b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $claim  = $this->b64url(json_encode([
            'iss'   => $sa['client_email'],
            'scope' => 'https://www.googleapis.com/auth/datastore',
            'aud'   => 'https://oauth2.googleapis.com/token',
            'iat'   => $now,
            'exp'   => $now + 3600,
        ]));

        $toSign = "{$header}.{$claim}";
        openssl_sign($toSign, $sig, $sa['private_key'], 'SHA256');
        $jwt = "{$toSign}." . $this->b64url($sig);

        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_POSTFIELDS     => http_build_query([
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'  => $jwt,
            ]),
        ]);
        $res = json_decode(curl_exec($ch), true);
        curl_close($ch);

        if (empty($res['access_token'])) {
            throw new RuntimeException('Firebase token exchange failed: ' . json_encode($res));
        }

        $this->accessToken = $res['access_token'];
        $this->tokenExpiry = $now + ($res['expires_in'] ?? 3600) - 60;

        return $this->accessToken;
    }

    private function b64url(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    // ── Logging ───────────────────────────────────────────

    private function log(string $method, string $path, int $code, ?string $detail): void {
        $dir  = __DIR__ . '/../logs';
        if (!is_dir($dir)) mkdir($dir, 0755, true);

        $line = sprintf(
            "[%s] %s %-6s → HTTP %d | %s\n",
            date('Y-m-d H:i:s'),
            $method,
            '',
            $code,
            substr($detail ?? '', 0, 200)
        );
        file_put_contents($dir . '/firestore.log', $line, FILE_APPEND | LOCK_EX);
    }
}
