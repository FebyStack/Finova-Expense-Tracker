<?php
/**
 * api/config.php
 * Centralized configuration for the Finova Expense Tracker API.
 * This is where you connect to Supabase or your local PostgreSQL.
 */

// 1. Session Initialization
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/**
 * Loads .env file into PHP environment.
 * Hand-rolled to avoid dependency on Composer.
 */
function loadEnv($path = null) {
    if (!$path) $path = __DIR__ . '/../.env';
    if (!file_exists($path)) return false;

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        $parts = explode('=', $line, 2);
        if (count($parts) === 2) {
            $key = trim($parts[0]);
            $val = trim($parts[1], " \t\n\r\0\x0B\"'");
            putenv("$key=$val");
            $_ENV[$key] = $val;
            $_SERVER[$key] = $val;
        }
    }
    return true;
}

loadEnv();

// 2. Database Connection (PDO)
function getDb()
{
    static $pdo = null;
    if ($pdo === null) {
        $env = getenv('DB_ENVIRONMENT') ?: 'local';

        if ($env === 'production') {
            $host = getenv('DB_PROD_HOST');
            $port = getenv('DB_PROD_PORT') ?: '5432';
            $db   = getenv('DB_PROD_NAME');
            $user = getenv('DB_PROD_USER');
            $pass = getenv('DB_PROD_PASS');
        } else {
            $host = getenv('DB_LOCAL_HOST') ?: 'localhost';
            $port = getenv('DB_LOCAL_PORT') ?: '5432';
            $db   = getenv('DB_LOCAL_NAME') ?: 'finova_db';
            $user = getenv('DB_LOCAL_USER') ?: 'postgres';
            $pass = getenv('DB_LOCAL_PASS') ?: '';
        }

        try {
            $dsn = "pgsql:host=$host;port=$port;dbname=$db";
            $pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);

            // Set the search path to your schema
            $pdo->exec("SET search_path TO finova, public");

        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Database connection failed: ' . $e->getMessage()]);
            exit;
        }
    }
    return $pdo;
}

// 3. JSON Response Helpers
function ok($data, $code = 200)
{
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=UTF-8');
    }
    echo json_encode(['success' => true, 'data' => $data]);
    exit;
}

function fail($msg, $code = 400)
{
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=UTF-8');
    }
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}


// 3. Global Headers
if (!headers_sent()) {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Credentials: true');
}

// Handle preflight OPTIONS requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
