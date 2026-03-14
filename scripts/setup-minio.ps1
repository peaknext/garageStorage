#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Setup MinIO as a Windows Service for garageStorage project.

.DESCRIPTION
    Downloads MinIO server and client (mc), creates data directory,
    registers MinIO as a Windows Service via NSSM, and creates
    application access keys.

.NOTES
    Run this script as Administrator.
    Requires NSSM (https://nssm.cc) to be installed and in PATH.
#>

param(
    [string]$InstallDir = "C:\MinIO",
    [string]$DataDir = "C:\MinIO\data",
    [int]$S3Port = 9000,
    [int]$ConsolePort = 9001,
    [string]$RootUser = "minioadmin",
    [string]$RootPassword = ""
)

$ErrorActionPreference = "Stop"

# ===========================================
# Helper Functions
# ===========================================
function Write-Step { param([string]$Message) Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "    [OK] $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "    [WARN] $Message" -ForegroundColor Yellow }

# ===========================================
# Generate password if not provided
# ===========================================
if (-not $RootPassword) {
    $RootPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    Write-Warn "Generated root password: $RootPassword"
}

# ===========================================
# Step 1: Create directories
# ===========================================
Write-Step "Creating directories..."

if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
Write-Ok "Directories created: $InstallDir, $DataDir"

# ===========================================
# Step 2: Download MinIO server
# ===========================================
Write-Step "Downloading MinIO server..."

$minioExe = Join-Path $InstallDir "minio.exe"
if (-not (Test-Path $minioExe)) {
    $url = "https://dl.min.io/server/minio/release/windows-amd64/minio.exe"
    Write-Host "    Downloading from $url ..."
    Invoke-WebRequest -Uri $url -OutFile $minioExe -UseBasicParsing
    Write-Ok "Downloaded minio.exe"
} else {
    Write-Ok "minio.exe already exists"
}

# ===========================================
# Step 3: Download MinIO Client (mc)
# ===========================================
Write-Step "Downloading MinIO Client (mc)..."

$mcExe = Join-Path $InstallDir "mc.exe"
if (-not (Test-Path $mcExe)) {
    $url = "https://dl.min.io/client/mc/release/windows-amd64/mc.exe"
    Write-Host "    Downloading from $url ..."
    Invoke-WebRequest -Uri $url -OutFile $mcExe -UseBasicParsing
    Write-Ok "Downloaded mc.exe"
} else {
    Write-Ok "mc.exe already exists"
}

# ===========================================
# Step 4: Check for NSSM
# ===========================================
Write-Step "Checking for NSSM..."

$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if (-not $nssm) {
    Write-Host ""
    Write-Host "    NSSM is required but not found in PATH." -ForegroundColor Red
    Write-Host "    Download from: https://nssm.cc/download" -ForegroundColor Red
    Write-Host "    Extract and add to PATH, then re-run this script." -ForegroundColor Red
    exit 1
}
Write-Ok "NSSM found at $($nssm.Source)"

# ===========================================
# Step 5: Register MinIO as Windows Service
# ===========================================
Write-Step "Registering MinIO as Windows Service..."

$serviceName = "MinIO"
$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if ($existingService) {
    Write-Warn "Service '$serviceName' already exists (Status: $($existingService.Status))"
    Write-Host "    To reinstall: nssm remove MinIO confirm" -ForegroundColor Yellow
} else {
    nssm install $serviceName $minioExe "server" $DataDir "--console-address" ":$ConsolePort" "--address" ":$S3Port"
    nssm set $serviceName AppEnvironmentExtra "MINIO_ROOT_USER=$RootUser" "MINIO_ROOT_PASSWORD=$RootPassword"
    nssm set $serviceName Start SERVICE_AUTO_START
    nssm set $serviceName AppStdout (Join-Path $InstallDir "minio-stdout.log")
    nssm set $serviceName AppStderr (Join-Path $InstallDir "minio-stderr.log")
    nssm set $serviceName AppRotateFiles 1
    nssm set $serviceName AppRotateBytes 10485760
    Write-Ok "Service registered: $serviceName"

    # Start the service
    Write-Step "Starting MinIO service..."
    nssm start $serviceName
    Start-Sleep -Seconds 3

    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Running") {
        Write-Ok "MinIO is running"
    } else {
        Write-Warn "MinIO may not have started. Check logs at $InstallDir\minio-stderr.log"
    }
}

# ===========================================
# Step 6: Create application access key
# ===========================================
Write-Step "Creating application access key..."

Start-Sleep -Seconds 2

# Set alias for mc
& $mcExe alias set local "http://127.0.0.1:$S3Port" $RootUser $RootPassword --api S3v4 2>$null

# Create a service account
Write-Host "    Creating service account for storage-api..."
$svcAcctOutput = & $mcExe admin user svcacct add local $RootUser --name "storage-api-key" 2>&1

$accessKey = ""
$secretKey = ""

foreach ($line in $svcAcctOutput) {
    if ($line -match "Access Key:\s+(.+)") { $accessKey = $Matches[1].Trim() }
    if ($line -match "Secret Key:\s+(.+)") { $secretKey = $Matches[1].Trim() }
}

# ===========================================
# Output results
# ===========================================
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  MinIO Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  S3 API:      http://127.0.0.1:$S3Port"
Write-Host "  Console UI:  http://127.0.0.1:$ConsolePort"
Write-Host "  Root User:   $RootUser"
Write-Host "  Root Pass:   $RootPassword"
Write-Host ""

if ($accessKey) {
    Write-Host "  Application Access Key:" -ForegroundColor Cyan
    Write-Host "  S3_ACCESS_KEY=$accessKey"
    Write-Host "  S3_SECRET_KEY=$secretKey"
} else {
    Write-Warn "Could not auto-create access key."
    Write-Host "  Create manually via MinIO Console: http://127.0.0.1:$ConsolePort"
    Write-Host "  Or run: $mcExe admin user svcacct add local $RootUser"
}

Write-Host ""
Write-Host "  Add these to your .env file:" -ForegroundColor Yellow
Write-Host "  S3_ENDPOINT=http://localhost:$S3Port"
Write-Host "  S3_PUBLIC_ENDPOINT=http://YOUR_SERVER_IP:$S3Port"
Write-Host "  S3_REGION=us-east-1"
if ($accessKey) {
    Write-Host "  S3_ACCESS_KEY=$accessKey"
    Write-Host "  S3_SECRET_KEY=$secretKey"
}
Write-Host ""
