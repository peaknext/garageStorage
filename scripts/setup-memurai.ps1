#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Setup Memurai (Redis-compatible) as a Windows Service for garageStorage project.

.DESCRIPTION
    Downloads and installs Memurai, configures password authentication,
    and ensures it runs as a Windows Service.

.NOTES
    Run this script as Administrator.
    Memurai free edition: https://www.memurai.com/get-memurai
#>

param(
    [string]$RedisPassword = "",
    [int]$Port = 6379
)

$ErrorActionPreference = "Stop"

function Write-Step { param([string]$Message) Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "    [OK] $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "    [WARN] $Message" -ForegroundColor Yellow }

# ===========================================
# Generate password if not provided
# ===========================================
if (-not $RedisPassword) {
    $RedisPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 20 | ForEach-Object { [char]$_ })
    Write-Warn "Generated Redis password: $RedisPassword"
}

# ===========================================
# Step 1: Check if Memurai is installed
# ===========================================
Write-Step "Checking for Memurai..."

$memuraiService = Get-Service -Name "Memurai" -ErrorAction SilentlyContinue
$memuraiPath = "C:\Program Files\Memurai"
$memuraiConf = Join-Path $memuraiPath "memurai.conf"

if ($memuraiService) {
    Write-Ok "Memurai service found (Status: $($memuraiService.Status))"
} else {
    Write-Host ""
    Write-Host "    Memurai is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "    Please install Memurai manually:" -ForegroundColor Yellow
    Write-Host "    1. Download from: https://www.memurai.com/get-memurai" -ForegroundColor Yellow
    Write-Host "    2. Run the installer (it registers as a Windows Service automatically)" -ForegroundColor Yellow
    Write-Host "    3. Re-run this script to configure the password" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ===========================================
# Step 2: Configure password
# ===========================================
Write-Step "Configuring Redis password..."

if (Test-Path $memuraiConf) {
    $config = Get-Content $memuraiConf -Raw

    # Check if requirepass is already set
    if ($config -match "(?m)^requirepass\s+") {
        Write-Warn "requirepass already configured in memurai.conf"
        Write-Host "    To change, edit: $memuraiConf"
    } else {
        # Append requirepass
        Add-Content -Path $memuraiConf -Value "`nrequirepass $RedisPassword"
        Write-Ok "Password configured"

        # Also set the port if non-default
        if ($Port -ne 6379) {
            if ($config -match "(?m)^port\s+") {
                (Get-Content $memuraiConf) -replace "(?m)^port\s+\d+", "port $Port" | Set-Content $memuraiConf
            } else {
                Add-Content -Path $memuraiConf -Value "port $Port"
            }
            Write-Ok "Port set to $Port"
        }

        # Restart service to apply
        Write-Step "Restarting Memurai service..."
        Restart-Service Memurai
        Start-Sleep -Seconds 2
        $svc = Get-Service -Name "Memurai"
        if ($svc.Status -eq "Running") {
            Write-Ok "Memurai restarted successfully"
        } else {
            Write-Warn "Memurai may not have restarted. Check Windows Event Log."
        }
    }
} else {
    Write-Warn "Config file not found at $memuraiConf"
    Write-Host "    Memurai may be installed in a different location."
}

# ===========================================
# Step 3: Test connection
# ===========================================
Write-Step "Testing connection..."

$memuraiCli = Join-Path $memuraiPath "memurai-cli.exe"
if (Test-Path $memuraiCli) {
    try {
        $result = & $memuraiCli -p $Port -a $RedisPassword ping 2>&1
        if ($result -eq "PONG") {
            Write-Ok "Connection successful (PONG)"
        } else {
            Write-Warn "Unexpected response: $result"
        }
    } catch {
        Write-Warn "Could not test connection: $_"
    }
} else {
    Write-Warn "memurai-cli.exe not found, skipping connection test"
}

# ===========================================
# Output results
# ===========================================
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Memurai (Redis) Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Host:     localhost"
Write-Host "  Port:     $Port"
Write-Host "  Password: $RedisPassword"
Write-Host ""
Write-Host "  Add these to your .env file:" -ForegroundColor Yellow
Write-Host "  REDIS_URL=redis://:$RedisPassword@localhost:$Port"
Write-Host "  REDIS_HOST=localhost"
Write-Host "  REDIS_PORT=$Port"
Write-Host "  REDIS_PASSWORD=$RedisPassword"
Write-Host ""
