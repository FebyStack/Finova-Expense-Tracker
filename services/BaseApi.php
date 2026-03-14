<?php
// services/BaseApi.php
// Abstract base class — handles routing, DB, Firestore, and validation

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/FirestoreService.php';

abstract class BaseApi {

    protected PDO             $db;
    protected FirestoreService $firestore;

    public function __construct() {
        setCorsHeaders();
        $this->db        = Database::connect();
        $this->firestore = new FirestoreService();
    }

    // ── Route dispatcher ──────────────────────────────────

    public function dispatch(): void {
        $method = $_SERVER['REQUEST_METHOD'];
        $id     = isset($_GET['id']) ? (int) $_GET['id'] : null;

        try {
            match (true) {
                $method === 'GET'    && $id === null => $this->index(),
                $method === 'GET'    && $id !== null => $this->show($id),
                $method === 'POST'                   => $this->store(),
                $method === 'PUT'    && $id !== null => $this->update($id),
                $method === 'DELETE' && $id !== null => $this->destroy($id),
                default => jsonError('Method not allowed', 405),
            };
        } catch (PDOException $e) {
            jsonError('Database error: ' . $e->getMessage(), 500);
        } catch (Throwable $e) {
            jsonError('Server error: ' . $e->getMessage(), 500);
        }
    }

    // ── Helpers ───────────────────────────────────────────

    /** Resolve PostgreSQL user id from Firebase UID */
    protected function getUserId(string $firebaseUid): int {
        $stmt = $this->db->prepare(
            'SELECT id FROM finova.users WHERE firebase_uid = $1'
        );
        $stmt->execute([$firebaseUid]);
        $row = $stmt->fetch();
        if (!$row) jsonError('User not found', 404);
        return (int) $row['id'];
    }

    /** Abort with 400 if any field is missing or empty */
    protected function requireFields(array $data, array $fields): void {
        foreach ($fields as $f) {
            if (!isset($data[$f]) || $data[$f] === '') {
                jsonError("Field '{$f}' is required", 400);
            }
        }
    }

    protected function safeFloat(mixed $v, float $d = 0.0): float {
        return is_numeric($v) ? (float) $v : $d;
    }

    protected function safeInt(mixed $v, int $d = 0): int {
        return is_numeric($v) ? (int) $v : $d;
    }

    // ── Abstract CRUD ─────────────────────────────────────

    abstract protected function index(): void;
    abstract protected function show(int $id): void;
    abstract protected function store(): void;
    abstract protected function update(int $id): void;
    abstract protected function destroy(int $id): void;
}
