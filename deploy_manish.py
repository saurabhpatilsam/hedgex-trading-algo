import paramiko
import time
import sys
import uuid

ip = "20.26.232.160"
user = "stagnator"
pw = "St@gnator2695"

script_content = r"""
$ErrorActionPreference = "SilentlyContinue"
Write-Output "Starting HedgeX Windows Proxy Setup..."

# 1. Install Python if not present
if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
    Write-Output "Python not found. Downloading Python 3.11.8..."
    $installerPath = "$env:TEMP\python-installer.exe"
    Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.11.8/python-3.11.8-amd64.exe" -OutFile $installerPath
    
    Write-Output "Installing Python (this will take a minute)..."
    Start-Process -FilePath $installerPath -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1" -Wait
    
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}
Write-Output "Python is installed."

# 2. Create Directory and Download Service Script
$installDir = "C:\HedgeX_Proxy"
if (-not (Test-Path $installDir)) { New-Item -ItemType Directory -Path $installDir | Out-Null }
Set-Location $installDir

Write-Output "Downloading proxy service script..."
$scriptUrl = "https://raw.githubusercontent.com/saurabhpatilsam/hedgex-trading-algo/main/backend/services/ip_proxy_service.py"
Invoke-WebRequest -Uri $scriptUrl -OutFile "C:\HedgeX_Proxy\ip_proxy_service.py"

# 3. Install Requirements
Write-Output "Installing Python requirements..."
python -m pip install --upgrade pip
python -m pip install fastapi uvicorn requests

# 4. Open Port 9000 in Windows Firewall
Write-Output "Configuring Windows Firewall..."
if (-not (Get-NetFirewallRule -DisplayName "HedgeX Proxy Port 9000" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "HedgeX Proxy Port 9000" -Direction Inbound -LocalPort 9000 -Protocol TCP -Action Allow | Out-Null
}

# 5. Create Startup Script and run it in background
Write-Output "Creating startup script..."
$startupScript = "C:\HedgeX_Proxy\start_proxy.bat"
Set-Content -Path $startupScript -Value "@echo off`ncd C:\HedgeX_Proxy`npython -m uvicorn ip_proxy_service:app --host 0.0.0.0 --port 9000"

Write-Output "Killing existing Python processes to avoid port conflicts..."
Stop-Process -Name python -Force -ErrorAction SilentlyContinue

Write-Output "Starting proxy service in background..."
Start-Process -FilePath "C:\HedgeX_Proxy\start_proxy.bat" -WindowStyle Hidden

Write-Output "Setup complete."
"""

try:
    print(f"Connecting to {ip}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(ip, port=22, username=user, password=pw, timeout=10)
    
    # Save script to a temporary file on the remote machine
    script_file = f"deploy_{uuid.uuid4().hex[:8]}.ps1"
    print(f"Uploading script as {script_file}...")
    
    sftp = ssh.open_sftp()
    with sftp.file(script_file, 'w') as f:
        f.write(script_content)
    sftp.close()
    
    print("Executing deployment script (this will take 1-3 minutes if Python needs to be installed)...")
    # Execute the powershell script
    stdin, stdout, stderr = ssh.exec_command(f'powershell.exe -ExecutionPolicy Bypass -File .\\{script_file}')
    
    # Wait for the command to finish and print output
    exit_status = stdout.channel.recv_exit_status()
    print("STDOUT:")
    print(stdout.read().decode())
    print("STDERR:")
    print(stderr.read().decode())
    
    # Check if proxy is running
    time.sleep(5)
    print("Checking if Port 9000 is listening...")
    stdin, stdout, stderr = ssh.exec_command('netstat -an | findstr "9000"')
    out = stdout.read().decode()
    if "LISTENING" in out:
        print("Success! Port 9000 is currently listening on the remote VM.")
    else:
        print("Warning: Port 9000 is NOT listening yet.")
        print(out)
        
    # Clean up
    ssh.exec_command(f'del "{script_file}"')
    
    ssh.close()
except Exception as e:
    print(f"Deployment failed: {e}")
    sys.exit(1)
