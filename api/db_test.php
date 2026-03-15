<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);
header('Content-Type: text/plain');

echo "Database Connection Diagnostic\n";
echo "=============================\n";

if (!extension_loaded('pdo_pgsql')) {
    echo "ERROR: pdo_pgsql extension is NOT loaded in PHP!\n";
    
    echo "Loaded extensions:\n";
    print_r(get_loaded_extensions());
    exit;
} else {
    echo "SUCCESS: pdo_pgsql extension is loaded.\n";
}

try {
    $dsn = 'pgsql:host=localhost;port=5432;dbname=finova_db';
    $user = 'postgres';
    $pass = 'bingbong321';
    
    echo "Attempting to connect to: $dsn\n";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 3 // Don't hang forever
    ]);
    
    echo "SUCCESS: Connected to PostgreSQL server!\n";
    
    // Test schema
    $stmt = $pdo->query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'finova'");
    if ($stmt->fetch()) {
        echo "SUCCESS: 'finova' schema exists.\n";
    } else {
        echo "ERROR: 'finova' schema does NOT exist!\n";
    }
    
    // Test table
    $stmt = $pdo->query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'finova' AND table_name = 'users'");
    if ($stmt->fetch()) {
        echo "SUCCESS: 'finova.users' table exists.\n";
        
        $stmt = $pdo->query("SELECT COUNT(*) FROM finova.users");
        $count = $stmt->fetchColumn();
        echo "Users count: $count\n";
    } else {
        echo "ERROR: 'finova.users' table does NOT exist!\n";
    }
    
} catch (PDOException $e) {
    echo "FATAL PDO ERROR:\n";
    echo $e->getMessage() . "\n";
}
