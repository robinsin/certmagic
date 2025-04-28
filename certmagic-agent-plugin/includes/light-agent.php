php
<CODE_BLOCK>
<?php

// Configuration for log file and challenge directory
$logFile = dirname(__FILE__) . '/light-agent.log';
$challengeDir = dirname(__FILE__) . '/.well-known/acme-challenge/';

/**
 * logError - Logs an error message to the specified log file.
 *
 * @param string $message - The error message to log.
 */
function logError($message) {
    global $logFile;
    // Get the current timestamp for the log message
    $timestamp = date('Y-m-d H:i:s');
    // Log the error message with the timestamp to the log file
    error_log("[$timestamp] ERROR: $message\n", 3,  $logFile);
}

// Success handling function
function logSuccess($message) {
    global $logFile;
    $timestamp = date('Y-m-d H:i:s');
    error_log("[$timestamp] SUCCESS: $message\n", 3, $logFile);
}
/**
 * deleteChallengeFile - Deletes a challenge file if it exists.
 *
 * @param string $filename - The name of the file to delete.
 * @return bool - True if the file was deleted, false otherwise.
 */
function deleteChallengeFile($filename) {
    global $challengeDir;
    $filePath = $challengeDir . $filename;
    // Check if the file exists
    if (file_exists($filePath)) {
         // Attempt to delete the file
        if (unlink($filePath)) {
            logSuccess("File '$filename' deleted successfully.");
            return true;
        } else {
            // Log an error if the file could not be deleted
            logError("Failed to delete file '$filename'.");
            return false;
        }
    } else {
        // Log an error if the file does not exist
        logError("File '$filename' does not exist.");
        return false;
    }
}

/**
 * Get parameters from GET or POST request
 */
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $token = isset($_GET['token']) ? $_GET['token'] : null;
    $keyAuthorization = isset($_GET['keyAuthorization']) ? $_GET['keyAuthorization'] : null;
    $delete = isset($_GET['delete']) ? $_GET['delete'] : null;
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Get parameters from POST request
    $token = isset($_POST['token']) ? $_POST['token'] : null;
    $keyAuthorization = isset($_POST['keyAuthorization']) ? $_POST['keyAuthorization'] : null;
     $delete = isset($_POST['delete']) ? $_POST['delete'] : null;
} else {
    // Log an error for invalid request method
    logError('Invalid request method.');
    // Send a 405 Method Not Allowed response
    http_response_code(405);
    exit;
}
/**
 * Check if a file deletion has been requested.
 */
if($delete !== null && $delete ==="true"){
    // Check if the token is provided for deletion
    if ($token) {
        // Try to delete the file
        deleteChallengeFile($token);
    }else{
        // Log an error if the token is not provided for deletion
        logError('Token not provided for deletion.');
         http_response_code(400);
         exit;
    }
    // Send a 200 OK response
     http_response_code(200);
     exit;
}
/**
 * Validate if the parameters token and keyAuthorization were set.
 */
if (!$token || !$keyAuthorization) {
    // Log an error for missing parameters
    logError('Missing token or keyAuthorization.');
    // Send a 400 Bad Request response
    http_response_code(400);
    exit;
}

// Construct the challenge filename and content based on the provided parameters
$filename = $token;
$fileContent = $keyAuthorization;

/**
 * Create the challenge directory if it does not exist
 */
if (!is_dir($challengeDir)) {
    // Attempt to create the directory and set permissions
    if (!mkdir($challengeDir, 0755, true)) {
        // Log an error if the directory could not be created
        logError("Failed to create directory '$challengeDir'.");
        // Send a 500 Internal Server Error response
        http_response_code(500);
        exit;
    } else {
         // Log a success message if the directory was created
        logSuccess("Directory '$challengeDir' created.");
    }
}

// Define the full file path for the challenge file
$filePath = $challengeDir . $filename;
/**
 * Write the challenge file
 */
if (file_put_contents($filePath, $fileContent) !== false) {
     // Log a success message if the file was created successfully
    logSuccess("File '$filename' created successfully.");
    // Send a 200 OK response
    http_response_code(200);
} else {
    // Log an error if the file could not be written
    logError("Failed to write to file '$filename'.");
    // Send a 500 Internal Server Error response
    http_response_code(500);
}

?>
<CODE_BLOCK>