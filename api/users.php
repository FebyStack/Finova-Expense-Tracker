<?php
// api/users.php — standalone + Firestore mirror

ini_set('display_errors', 0);
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Firebase-UID');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../services/firestore.php';

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

$method   = $_SERVER['REQUEST_METHOD'];
$id       = $_GET['id'] ?? null;
$RAW_BODY = file_get_contents('php://input');

// Support _method override (for hosts that block PUT/DELETE)
if ($method === 'POST') {
    $peek = json_decode($RAW_BODY, true);
    if (!empty($peek['_method'])) {
        $method = strtoupper($peek['_method']);
    }
}

try {

    // POST — create or upsert user on login
    if ($method === 'POST') {
        $body = json_decode($RAW_BODY, true);
        if (empty($body['uid'])) fail('Missing uid. Raw: ' . $RAW_BODY, 400);

        $uid      = trim($body['uid']);
        $email    = strtolower(trim($body['email']    ?? ''));
        $name     = $body['displayName']  ?? null;
        $currency = $body['baseCurrency'] ?? 'PHP';
        $theme    = $body['theme']        ?? 'light';

        $db = getDb();
        $db->beginTransaction();
        $stmt = $db->prepare("
            INSERT INTO finova.users (firebase_uid, email, display_name, base_currency, theme)
            VALUES (:uid, :email, :name, :currency, :theme)
            ON CONFLICT (firebase_uid) DO UPDATE SET
                email        = EXCLUDED.email,
                display_name = EXCLUDED.display_name,
                updated_at   = NOW()
            RETURNING *
        ");
        $stmt->execute([':uid'=>$uid,':email'=>$email,':name'=>$name,':currency'=>$currency,':theme'=>$theme]);
        $user = $stmt->fetch();
        $db->commit();

        // Mirror to Firestore
        firestore_upsert($uid, 'profile', 'data', [
            'email'        => $user['email'],
            'displayName'  => $user['display_name'],
            'baseCurrency' => $user['base_currency'],
            'theme'        => $user['theme'],
        ]);

        ok($user, 201);
    }

    // GET — fetch user
    if ($method === 'GET') {
        $db  = getDb();
        $uid = $_GET['uid'] ?? null;
        if ($uid) {
            $stmt = $db->prepare("SELECT * FROM finova.users WHERE firebase_uid = :uid");
            $stmt->execute([':uid' => $uid]);
        } elseif ($id) {
            $stmt = $db->prepare("SELECT * FROM finova.users WHERE id = :id");
            $stmt->execute([':id' => (int)$id]);
        } else {
            fail('uid or id required', 400);
        }
        $row = $stmt->fetch();
        if (!$row) fail('User not found', 404);
        ok($row);
    }

    // PUT — update profile
    if ($method === 'PUT') {
        $body = json_decode($RAW_BODY, true);
        $uid  = $body['uid'] ?? $_GET['uid'] ?? null;
        if (!$uid) fail('uid required', 400);

        $db   = getDb();
        $stmt = $db->prepare("
            UPDATE finova.users SET
                display_name  = COALESCE(:name,     display_name),
                base_currency = COALESCE(:currency, base_currency),
                theme         = COALESCE(:theme,    theme),
                updated_at    = NOW()
            WHERE firebase_uid = :uid
            RETURNING *
        ");
        $stmt->execute([
            ':name'     => $body['displayName']  ?? null,
            ':currency' => $body['baseCurrency'] ?? null,
            ':theme'    => $body['theme']        ?? null,
            ':uid'      => $uid,
        ]);
        $user = $stmt->fetch();
        if (!$user) fail('User not found', 404);

        // Mirror to Firestore
        firestore_upsert($uid, 'profile', 'data', [
            'displayName'  => $user['display_name'],
            'baseCurrency' => $user['base_currency'],
            'theme'        => $user['theme'],
        ]);

        ok($user);
    }

    fail('Method not allowed', 405);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    fail('Server error: ' . $e->getMessage(), 500);
}