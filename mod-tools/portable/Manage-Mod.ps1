[CmdletBinding()]
param(
    [ValidateSet('Install', 'Uninstall')][string]$Mode = 'Install',
    [string]$GameDirectory,
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'
$stagePath = $null
$reader = $null
$sourceStream = $null
$outputStream = $null

function Get-HashHex([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
}

function Test-GameDirectory([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    return (Test-Path -LiteralPath (Join-Path $Path 'resources\vegas\vegas.pack') -PathType Leaf)
}

function Find-GameDirectory {
    $candidates = @($PSScriptRoot, (Split-Path $PSScriptRoot -Parent), (Get-Location).Path)
    $localGames = @($candidates | Where-Object { Test-GameDirectory $_ } | ForEach-Object {
        [IO.Path]::GetFullPath($_).TrimEnd('\')
    } | Select-Object -Unique)
    # A package placed in/under the game directory explicitly selects that copy.
    if ($localGames.Count -eq 1) { return $localGames[0] }
    $found = @($candidates | Where-Object { Test-GameDirectory $_ } | ForEach-Object {
        [IO.Path]::GetFullPath($_).TrimEnd('\')
    } | Select-Object -Unique)
    if ($found.Count -eq 1) { return $found[0] }
    if ($NonInteractive) { throw ('Could not select a unique game installation (matches: ' + $found.Count + '). Use -GameDirectory. Candidates: ' + ($found -join '; ')) }
    Add-Type -AssemblyName System.Windows.Forms
    $picker = New-Object System.Windows.Forms.FolderBrowserDialog
    $picker.Description = 'Select the folder containing resources\vegas\vegas.pack'
    $picker.ShowNewFolderButton = $false
    try {
        if ($picker.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { throw 'Cancelled. No game files were changed.' }
        return $picker.SelectedPath
    } finally { $picker.Dispose() }
}

function Copy-Bytes($InputStream, $OutputStream, [long]$Count, [byte[]]$Buffer) {
    if ($Count -lt 0) { throw 'Invalid delta length.' }
    while ($Count -gt 0) {
        $take = [int][Math]::Min($Count, $Buffer.Length)
        $read = $InputStream.Read($Buffer, 0, $take)
        if ($read -le 0) { throw 'The delta or source file ended unexpectedly.' }
        $OutputStream.Write($Buffer, 0, $read)
        $Count -= $read
    }
}

try {
    $manifest = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'manifest.json')) | ConvertFrom-Json
    if ($manifest.format -ne 'goldminer-vegas-delta-v1') { throw 'Unsupported patch format.' }
    if (!$GameDirectory) { $GameDirectory = Find-GameDirectory }
    $GameDirectory = [IO.Path]::GetFullPath($GameDirectory.Trim('"'))
    if (!(Test-GameDirectory $GameDirectory)) { throw 'Select a folder containing resources\vegas\vegas.pack.' }
    $archivePath = Join-Path $GameDirectory 'resources\vegas\vegas.pack'
    $backupPath = Join-Path $GameDirectory 'resources\vegas\vegas.pack.goldminer-vegas-coop-original'
    $currentHash = Get-HashHex $archivePath
    Write-Host ('Game folder: ' + $GameDirectory)

    if ($Mode -eq 'Install' -and $currentHash -eq $manifest.target.sha256) {
        Write-Host 'This co-op mod version is already installed.' -ForegroundColor Green
        exit 0
    }
    if ($Mode -eq 'Uninstall' -and $currentHash -eq $manifest.source.sha256) {
        Write-Host 'The original game is already restored.' -ForegroundColor Green
        exit 0
    }
    if (Get-Process -Name 'Gold Miner Party Rush' -ErrorAction SilentlyContinue) {
        throw 'Close Gold Miner before installing or uninstalling the mod.'
    }

    if ($Mode -eq 'Uninstall') {
        if ($currentHash -ne $manifest.target.sha256) {
            throw 'The current Vegas pack is not the installed target content. Refusing to restore an unrelated full backup.'
        }
        if (!(Test-Path -LiteralPath $backupPath)) {
            # Recognize the original backup made by the development install.
            $legacyBackup = Join-Path $GameDirectory 'resources\vegas\vegas.pack.pre-campaign-coop'
            if (Test-Path -LiteralPath $legacyBackup) { $backupPath = $legacyBackup }
        }
        if (!(Test-Path -LiteralPath $backupPath) -or (Get-HashHex $backupPath) -ne $manifest.source.sha256) {
            throw 'A matching original backup was not found. Nothing was changed. Steam Verify integrity can restore the original game.'
        }
        $stagePath = Join-Path $GameDirectory ('resources\vegas\vegas.pack.coop-' + [Guid]::NewGuid().ToString('N') + '.tmp')
        [IO.File]::Copy($backupPath, $stagePath)
        if ((Get-HashHex $stagePath) -ne $manifest.source.sha256) { throw 'Restore file verification failed.' }
        [IO.File]::Replace($stagePath, $archivePath, [System.Management.Automation.Language.NullString]::Value, $true)
        $stagePath = $null
        Write-Host 'Original game restored. The original backup is retained in resources.' -ForegroundColor Green
        exit 0
    }

    if ($currentHash -ne $manifest.source.sha256) {
        throw 'Vegas pack content does not match the source fingerprint required by this fixed-offset delta. No Steam app/build is checked. No game files were changed.'
    }
    if ((Get-Item -LiteralPath $archivePath).Length -ne [long]$manifest.source.size) { throw 'Source resource-pack size mismatch.' }
    if ((Test-Path -LiteralPath $backupPath) -and (Get-HashHex $backupPath) -ne $manifest.source.sha256) {
        throw 'The existing backup does not match the required source content. Installation stopped to preserve it.'
    }
    $payloadPath = Join-Path $PSScriptRoot 'payload.gz'
    if ((Get-HashHex $payloadPath) -ne $manifest.payload.sha256) { throw 'Patch data is damaged. Download and extract the complete release again.' }
    $stagePath = Join-Path $GameDirectory ('resources\vegas\vegas.pack.coop-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    Write-Host 'Building and verifying the modded archive. Please wait...'
    $sourceStream = [IO.File]::OpenRead($archivePath)
    $payloadStream = [IO.File]::OpenRead($payloadPath)
    $reader = New-Object IO.Compression.GZipStream($payloadStream, [IO.Compression.CompressionMode]::Decompress)
    $outputStream = [IO.File]::Create($stagePath)
    $buffer = New-Object byte[] (1024 * 1024)
    [long]$total = 0
    [long]$literalBytes = 0
    foreach ($operation in $manifest.operations) {
        [long]$count = $operation.length
        if ($count -lt 0 -or $total + $count -gt [long]$manifest.target.size) { throw 'Invalid delta data length.' }
        if ($operation.kind -eq 'copy') {
            [long]$offset = $operation.offset
            if ($offset -lt 0 -or $offset + $count -gt $sourceStream.Length) { throw 'Invalid source range.' }
            [void]$sourceStream.Seek($offset, [IO.SeekOrigin]::Begin)
            Copy-Bytes $sourceStream $outputStream $count $buffer
        } elseif ($operation.kind -eq 'data') {
            Copy-Bytes $reader $outputStream $count $buffer
            $literalBytes += $count
        } else { throw 'Unknown delta operation.' }
        $total += $count
    }
    if ($total -ne [long]$manifest.target.size -or $literalBytes -ne [long]$manifest.payload.uncompressedSize -or $reader.ReadByte() -ne -1) {
        throw 'Delta length verification failed.'
    }
    $outputStream.Dispose(); $outputStream = $null
    $reader.Dispose(); $reader = $null
    $payloadStream.Dispose()
    $sourceStream.Dispose(); $sourceStream = $null
    if ((Get-HashHex $stagePath) -ne $manifest.target.sha256) { throw 'Generated archive verification failed. The original game was not changed.' }
    if (!(Test-Path -LiteralPath $backupPath)) { [IO.File]::Copy($archivePath, $backupPath) }
    if ((Get-HashHex $backupPath) -ne $manifest.source.sha256) { throw 'Original backup verification failed. Installation stopped.' }
    # Both files are in resources on the same volume; replacement is atomic.
    [IO.File]::Replace($stagePath, $archivePath, [System.Management.Automation.Language.NullString]::Value, $true)
    $stagePath = $null
    Write-Host 'Installed! Start the game normally and select Arcade > Campaign or Campaign Endless for local co-op.' -ForegroundColor Green
    Write-Host 'Left player: WASD + left mouse. Right player: arrows + right mouse. To restore the original, run Uninstall.cmd.'
    exit 0
} catch {
    Write-Host ('Operation failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($outputStream) { $outputStream.Dispose() }
    if ($sourceStream) { $sourceStream.Dispose() }
    if ($reader) { $reader.Dispose() }
    if ($payloadStream) { $payloadStream.Dispose() }
    if ($stagePath -and (Test-Path -LiteralPath $stagePath)) { [IO.File]::Delete($stagePath) }
}
