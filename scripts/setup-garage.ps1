# SKH Storage Setup Script for Windows
# This script configures Garage S3-compatible storage after container startup

param(
    [string]$ContainerName = "garage-storage",
    [string]$BucketName = "storage-service",
    [string]$KeyName = "storage-api-key",
    [string]$Zone = "dc1",
    [string]$Capacity = "100G",
    [int]$MaxRetries = 30,
    [int]$RetryDelay = 2
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SKH Storage Setup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to execute garage command
function Invoke-GarageCommand {
    param([string]$Command)
    $result = docker exec $ContainerName /garage $Command 2>&1
    return $result
}

# Step 1: Wait for Garage to be healthy
Write-Host "[1/6] Waiting for Garage to be healthy..." -ForegroundColor Yellow
$retryCount = 0
$isHealthy = $false

while (-not $isHealthy -and $retryCount -lt $MaxRetries) {
    try {
        $health = docker exec $ContainerName curl -s http://localhost:3903/health 2>&1
        if ($health -match "OK" -or $LASTEXITCODE -eq 0) {
            $isHealthy = $true
            Write-Host "  Garage is healthy!" -ForegroundColor Green
        }
    } catch {
        # Continue retrying
    }

    if (-not $isHealthy) {
        $retryCount++
        Write-Host "  Waiting... ($retryCount/$MaxRetries)" -ForegroundColor Gray
        Start-Sleep -Seconds $RetryDelay
    }
}

if (-not $isHealthy) {
    Write-Host "  ERROR: Garage did not become healthy after $MaxRetries attempts" -ForegroundColor Red
    exit 1
}

# Step 2: Get Node ID
Write-Host ""
Write-Host "[2/6] Getting Garage node ID..." -ForegroundColor Yellow
$statusOutput = Invoke-GarageCommand "status"
Write-Host $statusOutput

# Extract node ID (first 16 characters of the node hash)
$nodeIdMatch = $statusOutput | Select-String -Pattern "([a-f0-9]{16})\s+\S+\s+NO ROLE"
if (-not $nodeIdMatch) {
    # Try matching already assigned node
    $nodeIdMatch = $statusOutput | Select-String -Pattern "([a-f0-9]{16})\s+"
}

if ($nodeIdMatch) {
    $nodeId = $nodeIdMatch.Matches[0].Groups[1].Value
    Write-Host "  Node ID: $nodeId" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Could not find node ID" -ForegroundColor Red
    exit 1
}

# Step 3: Check if layout already assigned
Write-Host ""
Write-Host "[3/6] Checking layout status..." -ForegroundColor Yellow
$layoutOutput = Invoke-GarageCommand "layout show"

if ($layoutOutput -match "NO ROLE") {
    Write-Host "  Assigning layout to node..." -ForegroundColor Yellow
    $assignResult = Invoke-GarageCommand "layout assign -z $Zone -c $Capacity $nodeId"
    Write-Host $assignResult

    # Apply layout
    Write-Host ""
    Write-Host "[4/6] Applying layout..." -ForegroundColor Yellow

    # Get next version
    $layoutShow = Invoke-GarageCommand "layout show"
    $versionMatch = $layoutShow | Select-String -Pattern "apply --version (\d+)"
    if ($versionMatch) {
        $version = $versionMatch.Matches[0].Groups[1].Value
        $applyResult = Invoke-GarageCommand "layout apply --version $version"
        Write-Host $applyResult
        Write-Host "  Layout applied successfully!" -ForegroundColor Green
    } else {
        Write-Host "  Layout already applied or no changes needed" -ForegroundColor Gray
    }
} else {
    Write-Host "  Layout already configured" -ForegroundColor Green
    Write-Host "[4/6] Skipping layout apply (already done)" -ForegroundColor Gray
}

# Step 5: Create bucket
Write-Host ""
Write-Host "[5/6] Creating bucket '$BucketName'..." -ForegroundColor Yellow
$bucketList = Invoke-GarageCommand "bucket list"

if ($bucketList -match $BucketName) {
    Write-Host "  Bucket '$BucketName' already exists" -ForegroundColor Green
} else {
    $createBucketResult = Invoke-GarageCommand "bucket create $BucketName"
    Write-Host $createBucketResult
    Write-Host "  Bucket created successfully!" -ForegroundColor Green
}

# Step 6: Create API key
Write-Host ""
Write-Host "[6/6] Creating API key '$KeyName'..." -ForegroundColor Yellow
$keyList = Invoke-GarageCommand "key list"

if ($keyList -match $KeyName) {
    Write-Host "  API key '$KeyName' already exists" -ForegroundColor Yellow
    Write-Host "  Retrieving existing key info..." -ForegroundColor Yellow
    $keyInfo = Invoke-GarageCommand "key info $KeyName"
} else {
    $keyInfo = Invoke-GarageCommand "key create $KeyName"
}

Write-Host $keyInfo

# Extract access key and secret key
$accessKeyMatch = $keyInfo | Select-String -Pattern "Key ID:\s*(GK[a-zA-Z0-9]+)"
$secretKeyMatch = $keyInfo | Select-String -Pattern "Secret key:\s*([a-zA-Z0-9+/=]+)"

if ($accessKeyMatch -and $secretKeyMatch) {
    $accessKey = $accessKeyMatch.Matches[0].Groups[1].Value
    $secretKey = $secretKeyMatch.Matches[0].Groups[1].Value

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  API Credentials (SAVE THESE!)" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Access Key: $accessKey" -ForegroundColor White
    Write-Host "  Secret Key: $secretKey" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor Cyan
}

# Assign bucket permissions
Write-Host ""
Write-Host "Assigning bucket permissions..." -ForegroundColor Yellow
$allowResult = Invoke-GarageCommand "bucket allow --read --write --owner $BucketName --key $KeyName"
Write-Host $allowResult
Write-Host "  Permissions assigned!" -ForegroundColor Green

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Update .env file with the API credentials above" -ForegroundColor White
Write-Host "2. Run: cd backend && npx prisma migrate dev" -ForegroundColor White
Write-Host "3. Run: docker compose up -d" -ForegroundColor White
Write-Host ""

# Optionally update .env file
$updateEnv = Read-Host "Do you want to automatically update backend/.env with these credentials? (y/n)"
if ($updateEnv -eq "y" -and $accessKey -and $secretKey) {
    $envPath = Join-Path $PSScriptRoot "..\backend\.env"
    if (Test-Path $envPath) {
        $envContent = Get-Content $envPath -Raw
        $envContent = $envContent -replace "GARAGE_ACCESS_KEY=.*", "GARAGE_ACCESS_KEY=$accessKey"
        $envContent = $envContent -replace "GARAGE_SECRET_KEY=.*", "GARAGE_SECRET_KEY=$secretKey"
        Set-Content -Path $envPath -Value $envContent
        Write-Host "  backend/.env updated!" -ForegroundColor Green
    } else {
        Write-Host "  backend/.env not found at $envPath" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
