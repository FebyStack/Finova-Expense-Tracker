<?php
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json');

try {
    $db = Database::connect();
    
    $result = ['users' => [], 'expenses' => [], 'income' => []];
    
    // Get all users
    $stmt = $db->query("SELECT id, email FROM finova.users");
    $result['users'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get all expenses
    $stmt = $db->query("SELECT * FROM finova.expenses");
    $result['expenses'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get all income
    $stmt = $db->query("SELECT * FROM finova.income");
    $result['income'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode($result, JSON_PRETTY_PRINT);
} catch (Exception $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
