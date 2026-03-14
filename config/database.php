<?php
// config/database.php
// PostgreSQL connection via PDO — singleton pattern

class Database {
    private static ?PDO $instance = null;

    private static array $config = [
        'host'     => 'localhost',
        'port'     => '5432',
        'dbname'   => 'finova_db',
        'user'     => 'postgres',
        'password' => 'bingbong321',   // ← your PostgreSQL password
    ];

    public static function connect(): PDO {
        if (self::$instance === null) {
            $dsn = sprintf(
                'pgsql:host=%s;port=%s;dbname=%s',
                self::$config['host'],
                self::$config['port'],
                self::$config['dbname']
            );

            self::$instance = new PDO($dsn, self::$config['user'], self::$config['password'], [
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
