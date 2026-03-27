<?php
try {
    $pdo = new PDO('pgsql:host=localhost;port=5432;dbname=finova_db', 'postgres', 'bingbong321');
    $stmt = $pdo->query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('finova', 'public')");
    $tables = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($tables as $t) {
        echo $t['table_schema'] . "." . $t['table_name'] . "\n";
    }
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage();
}
