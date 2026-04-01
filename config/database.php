<?php
// config/database.php
// PostgreSQL connection via PDO — singleton pattern

class Database {
    private static ?PDO $instance = null;

    public static function connect(): PDO {
        if (self::$instance === null) {
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

            $dsn = sprintf(
                'pgsql:host=%s;port=%s;dbname=%s',
                $host,
                $port,
                $db
            );

            self::$instance = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);

            // Always scope queries to finova schema
            self::$instance->exec("SET search_path TO finova, public");
        }

        return self::$instance;
    }
}
