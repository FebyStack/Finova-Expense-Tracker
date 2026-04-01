<?php
// config/firebase.php
// Firebase project settings

return [
    // ← Your Firebase project ID
    'project_id'           => getenv('FIREBASE_PROJECT_ID') ?: 'finova-8594c',

    // ← Path to your service account JSON key
    'service_account_path' => __DIR__ . '/../' . (getenv('FIREBASE_SERVICE_ACCOUNT_PATH') ?: 'serviceAccountKey.json'),
];
