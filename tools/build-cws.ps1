$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version

if ($version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Invalid extension version in manifest.json: $version"
}

$distRoot = Join-Path $projectRoot "dist"
$packageName = "lax-prompt-lens-v$version-cws"
$stagingRoot = Join-Path $distRoot $packageName
$zipPath = Join-Path $distRoot "$packageName.zip"

$projectRootResolved = [System.IO.Path]::GetFullPath($projectRoot)
$distRootResolved = [System.IO.Path]::GetFullPath($distRoot)
$stagingRootResolved = [System.IO.Path]::GetFullPath($stagingRoot)
$zipPathResolved = [System.IO.Path]::GetFullPath($zipPath)

if (-not $distRootResolved.StartsWith($projectRootResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write outside the project: $distRootResolved"
}
if (-not $stagingRootResolved.StartsWith($distRootResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace a staging directory outside dist: $stagingRootResolved"
}
if (-not $zipPathResolved.StartsWith($distRootResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace an archive outside dist: $zipPathResolved"
}

$files = @(
    "api-client.js",
    "compact.css",
    "compact.html",
    "compact.js",
    "core.js",
    "image-utils.js",
    "manifest.json",
    "panel.css",
    "panel.html",
    "panel.js",
    "post-source.js",
    "reference-picker.js",
    "service-worker.js",
    "settings.js"
)

$directories = @(
    "_locales",
    "icons"
)

foreach ($relativePath in $files + $directories) {
    $sourcePath = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Required package input is missing: $relativePath"
    }
}

New-Item -ItemType Directory -Path $distRoot -Force | Out-Null

if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Path $stagingRoot | Out-Null

foreach ($relativePath in $files) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $relativePath) -Destination (Join-Path $stagingRoot $relativePath)
}
foreach ($relativePath in $directories) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $relativePath) -Destination (Join-Path $stagingRoot $relativePath) -Recurse
}

Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Output "Built unpacked extension: $stagingRoot"
Write-Output "Built Chrome Web Store ZIP: $zipPath"
