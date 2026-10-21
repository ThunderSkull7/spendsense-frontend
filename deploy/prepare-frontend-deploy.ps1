<#
.SYNOPSIS
    Produces a deployable copy of the SpendSense static frontend with the
    API base URL rewritten for the target environment.

.DESCRIPTION
    Copies the frontend source tree into -Destination, then rewrites the
    <meta name="api-base-url"> value in the COPY only.
    The source frontend directory is never written to (asserted after the run).

    The -Destination folder is what gets published (e.g. uploaded to
    Cloudflare Pages). Never publish the source frontend folder directly.

.PARAMETER ApiBaseUrl
    Origin of the deployed API, e.g. https://api.example.com
    HTTPS only, host only: no path, no port, no trailing slash.

.PARAMETER Destination
    Directory to create with the deployable copy.
    Must not overlap the source tree.

.PARAMETER Source
    Frontend source directory. Defaults to ..\frontend relative to this script.

.PARAMETER ReplaceThis
    Value to replace. Defaults to the local dev API base http://127.0.0.1:8002

.PARAMETER Force
    Allow replacing an existing destination directory (it is deleted first).

.EXAMPLE
    .\deploy\prepare-frontend-deploy.ps1 `
        -ApiBaseUrl https://api.example.com `
        -Destination C:\build\spendsense-frontend
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ApiBaseUrl,
    [Parameter(Mandatory = $true)][string]$Destination,
    [string]$Source,
    [string]$ReplaceThis = 'http://127.0.0.1:8002',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
    throw "prepare-frontend-deploy: $Message"
}

# --- resolve paths --------------------------------------------------------------
if (-not $Source) { $Source = Join-Path $PSScriptRoot '..\frontend' }
if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    Fail "source directory not found: $Source"
}
$sourceFull = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')

if ([System.IO.Path]::IsPathRooted($Destination)) {
    $destFull = [System.IO.Path]::GetFullPath($Destination)
} else {
    $destFull = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Destination))
}
$destFull = $destFull.TrimEnd('\')

# --- validate the API base URL --------------------------------------------------
$api = $ApiBaseUrl.Trim().TrimEnd('/')
if ($api -notmatch '^https://[A-Za-z0-9][A-Za-z0-9.-]*$') {
    Fail "ApiBaseUrl must be an HTTPS origin, host only (example: https://api.example.com). Got: '$ApiBaseUrl'"
}
if ($api -match '(?i)localhost|127\.|\.local$') {
    Fail "ApiBaseUrl must not point at a local address: '$api'"
}

# --- safety guards ---------------------------------------------------------------
if ($destFull -match '^[A-Za-z]:$') { Fail 'destination must not be a drive root.' }
if ($destFull -eq (Get-Location).Path.TrimEnd('\')) { Fail 'destination must not be the current directory.' }
foreach ($protected in @($env:SystemRoot, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if ($protected -and (
        $destFull -eq $protected -or
        $destFull.StartsWith($protected + '\', [System.StringComparison]::OrdinalIgnoreCase))) {
        Fail "destination is inside a protected system directory: $protected"
    }
}
if ($destFull -eq $sourceFull) { Fail 'destination must differ from the source.' }
if ($destFull.StartsWith($sourceFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail 'destination must not be inside the source tree.'
}
if ($sourceFull.StartsWith($destFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail 'source must not be inside the destination directory.'
}
if (-not (Test-Path -LiteralPath (Join-Path $sourceFull 'index.html'))) {
    Fail "source does not look like the SpendSense frontend (missing index.html): $sourceFull"
}

# --- create a clean destination ---------------------------------------------------
if (Test-Path -LiteralPath $destFull) {
    if (-not $Force) {
        Fail "destination already exists: $destFull (re-run with -Force to replace it)"
    }
    Remove-Item -LiteralPath $destFull -Recurse -Force
}
New-Item -ItemType Directory -Path $destFull -Force | Out-Null

Write-Host "Source      : $sourceFull"
Write-Host "Destination : $destFull"
Write-Host "API base    : $api"

# --- copy (including hidden files) ------------------------------------------------
Get-ChildItem -LiteralPath $sourceFull -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $destFull -Recurse -Force
}

# --- rewrite the COPY only --------------------------------------------------------
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$htmlFiles = @(Get-ChildItem -LiteralPath $destFull -Recurse -File -Filter '*.html')
$replaced = 0
$skipped = @()

foreach ($file in $htmlFiles) {
    $text = [System.IO.File]::ReadAllText($file.FullName)
    if ($text.Contains($ReplaceThis)) {
        $updated = $text.Replace($ReplaceThis, $api)
        [System.IO.File]::WriteAllText($file.FullName, $updated, $utf8NoBom)
        $replaced++
    }
    elseif ($text.Contains('name="api-base-url"')) {
        $relative = $file.FullName.Substring($destFull.Length).TrimStart('\')
        Fail "page already points somewhere other than $ReplaceThis : $relative"
    }
    else {
        $skipped += $file.FullName.Substring($destFull.Length).TrimStart('\')
    }
}

if ($replaced -eq 0) {
    Fail "no occurrences of '$ReplaceThis' found in the copy - check -Source and -ReplaceThis."
}

# --- verify the copy ----------------------------------------------------------------
$leftover = @(Get-ChildItem -LiteralPath $destFull -Recurse -File | Select-String -SimpleMatch $ReplaceThis)
if ($leftover.Count -gt 0) {
    $leftover | ForEach-Object { Write-Host ("LEFTOVER " + $_.Path + ":" + $_.LineNumber) }
    Fail 'the local API base URL is still present in the destination copy.'
}

# --- verify the source was NOT touched ----------------------------------------------
$sourceMatchesAfter = @(Get-ChildItem -LiteralPath $sourceFull -Recurse -File -Filter '*.html' |
    Where-Object { [System.IO.File]::ReadAllText($_.FullName).Contains($ReplaceThis) }).Count
if ($sourceMatchesAfter -ne $replaced) {
    Fail ("source frontend changed during the run (expected {0} source pages still containing the dev URL, found {1})." -f $replaced, $sourceMatchesAfter)
}

# --- report --------------------------------------------------------------------------
Write-Host ''
Write-Host ("HTML pages in copy  : {0}" -f $htmlFiles.Count)
Write-Host ("API URL rewritten   : {0}" -f $replaced)
Write-Host ("Pages without meta  : {0}" -f $skipped.Count)
foreach ($s in $skipped) { Write-Host ("  - " + $s) }
if ($replaced -ne 14) {
    Write-Warning ("expected 14 SpendSense pages to carry the API meta tag, rewrote {0} - verify the page set before deploying." -f $replaced)
}
Write-Host ("Source untouched    : {0} source pages still contain {1}" -f $sourceMatchesAfter, $ReplaceThis)
Write-Host 'OK - deployable copy ready.'
exit 0
