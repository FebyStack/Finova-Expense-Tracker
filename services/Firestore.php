<?php
// services/firestore.php
// Lightweight Firestore mirror via REST API + service account JWT
// Include this file in any standalone PHP endpoint that needs mirroring
// Usage: firestore_upsert($uid, 'expenses', '123', ['amount'=>100, ...]);
//        firestore_delete($uid, 'expenses', '123');

function _firestore_get_token(): string {
    static $token   = null;
    static $expiry  = 0;

    if ($token && time() < $expiry) return $token;

    $keyPath = __DIR__ . '/../serviceAccountKey.json';
    if (!file_exists($keyPath)) {
        _firestore_log('ERROR', 'token', 0, 'serviceAccountKey.json not found');
        return '';
    }

    $sa  = json_decode(file_get_contents($keyPath), true);
    $now = time();

    // Build JWT
    $header  = _b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $payload = _b64url(json_encode([
        'iss'   => $sa['client_email'],
        'scope' => 'https://www.googleapis.com/auth/datastore',
        'aud'   => 'https://oauth2.googleapis.com/token',
        'iat'   => $now,
        'exp'   => $now + 3600,
    ]));

    $toSign = "{$header}.{$payload}";
    openssl_sign($toSign, $sig, $sa['private_key'], 'SHA256');
    $jwt = "{$toSign}." . _b64url($sig);

    // Exchange JWT for access token
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
        _firestore_log('ERROR', 'token', 0, 'Token exchange failed: ' . json_encode($res));
        return '';
    }

    $token  = $res['access_token'];
    $expiry = $now + ($res['expires_in'] ?? 3600) - 60;
    return $token;
}

function _b64url(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function _firestore_project_id(): string {
    static $id = null;
    if ($id === null) {
        $keyPath = __DIR__ . '/../serviceAccountKey.json';
        if (file_exists($keyPath)) {
            $sa = json_decode(file_get_contents($keyPath), true);
            $id = $sa['project_id'] ?? '';
        } else {
            $id = '';
        }
    }
    return $id;
}

function _to_firestore_fields(array $data): array {
    $fields = [];
    foreach ($data as $k => $v) {
        $fields[$k] = _to_firestore_value($v);
    }
    $fields['_syncedAt'] = ['integerValue' => (string) time()];
    return $fields;
}

function _to_firestore_value(mixed $v): array {
    if (is_null($v))   return ['nullValue'    => null];
    if (is_bool($v))   return ['booleanValue' => $v];
    if (is_int($v))    return ['integerValue'  => (string) $v];
    if (is_float($v))  return ['doubleValue'   => $v];
    if (is_string($v)) return ['stringValue'   => $v];
    if (is_array($v)) {
        if (array_keys($v) !== range(0, count($v) - 1)) {
            return ['mapValue' => ['fields' => _to_firestore_fields($v)]];
        }
        return ['arrayValue' => ['values' => array_map('_to_firestore_value', $v)]];
    }
    return ['stringValue' => (string) $v];
}

function _firestore_request(string $method, string $docPath, ?array $fields = null): void {
    $token     = _firestore_get_token();
    if (!$token) return; // silently skip if no token

    $projectId = _firestore_project_id();
    $url       = "https://firestore.googleapis.com/v1/projects/{$projectId}"
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
    $code     = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err      = curl_error($ch);
    curl_close($ch);

    _firestore_log($method, $docPath, $code, $err ?: substr($response, 0, 150));
}

// ── Public functions ──────────────────────────────────────

/**
 * Create or overwrite a Firestore document.
 * Path: users/{uid}/{collection}/{docId}
 */
function firestore_upsert(string $uid, string $collection, string $docId, array $data): void {
    try {
        $path   = "users/{$uid}/{$collection}/{$docId}";
        $fields = _to_firestore_fields($data);
        _firestore_request('PATCH', $path, $fields);
    } catch (Throwable $e) {
        _firestore_log('ERROR', "{$uid}/{$collection}/{$docId}", 0, $e->getMessage());
    }
}

/**
 * Delete a Firestore document.
 */
function firestore_delete(string $uid, string $collection, string $docId): void {
    try {
        $path = "users/{$uid}/{$collection}/{$docId}";
        _firestore_request('DELETE', $path);
    } catch (Throwable $e) {
        _firestore_log('ERROR', "{$uid}/{$collection}/{$docId}", 0, $e->getMessage());
    }
}

// ── Logging ───────────────────────────────────────────────
function _firestore_log(string $method, string $path, int $code, string $detail): void {
    $dir = __DIR__ . '/../logs';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $line = sprintf("[%s] %-6s %s → %d | %s\n",
        date('Y-m-d H:i:s'), $method, $path, $code, $detail);
    @file_put_contents($dir . '/firestore.log', $line, FILE_APPEND | LOCK_EX);
}