<?php
require_once 'config.php';


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
            INSERT INTO finova.users (email, display_name, base_currency, theme)
            VALUES (:email, :name, :currency, :theme)
            ON CONFLICT (email) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                updated_at   = NOW()
            RETURNING *
        ");
        $stmt->execute([':email'=>$email,':name'=>$name,':currency'=>$currency,':theme'=>$theme]);
        $user = $stmt->fetch();
        $db->commit();

        ok($user, 201);
    }

    // GET — fetch user
    if ($method === 'GET') {
        $db  = getDb();
        $uid = $_GET['uid'] ?? null;
        if ($uid) {
            $stmt = $db->prepare("SELECT * FROM finova.users WHERE id = :uid");
            $stmt->execute([':uid' => (int)$uid]);
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
            WHERE id = :uid
            RETURNING *
        ");
        $stmt->execute([
            ':name'     => $body['displayName']  ?? null,
            ':currency' => $body['baseCurrency'] ?? null,
            ':theme'    => $body['theme']        ?? null,
            ':uid'      => (int)$uid,
        ]);
        $user = $stmt->fetch();
        if (!$user) fail('User not found', 404);

        ok($user);
    }

    fail('Method not allowed', 405);

} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
} catch (Throwable $e) {
    fail('Server error: ' . $e->getMessage(), 500);
}