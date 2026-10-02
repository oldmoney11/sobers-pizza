$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
$failures = [System.Collections.Generic.List[string]]::new()
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check([string]$Name, [bool]$Passed, [string]$Detail) {
  $checks.Add([pscustomobject]@{ check = $Name; passed = $Passed; detail = $Detail })
  if (-not $Passed) { $failures.Add("${Name}: ${Detail}") }
}

$node = 'C:\Users\Dell\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$jsFiles = @(
  'JS/sobers-pizza.js', 'JS/sobers-platform-orders.js', 'JS/sobers-customer.js',
  'JS/sobers-auth.js', 'JS/sobers-notices.js', 'JS/sobers-extras.js',
  'kiosk/kiosk.js', 'admin/business-admin.js', 'admin-preview/business-admin.js',
  'track/track.js', 'track/track-live.js'
)
$syntaxErrors = @()
foreach ($relative in $jsFiles) {
  $path = Join-Path $root $relative
  & $node --check $path 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { $syntaxErrors += $relative }
}
Add-Check 'JavaScript syntax' ($syntaxErrors.Count -eq 0) ($(if ($syntaxErrors) { $syntaxErrors -join ', ' } else { "$($jsFiles.Count) application scripts passed" }))

$manifestFiles = @('manifest.json','admin/manifest.json','kiosk/main-branch/manifest.json')
$manifestFailures = @()
foreach ($relative in $manifestFiles) {
  try {
    $manifest = Get-Content (Join-Path $root $relative) -Raw | ConvertFrom-Json
    $manifestDirectory = Split-Path -Parent (Join-Path $root $relative)
    foreach ($icon in $manifest.icons) {
      if (-not (Test-Path (Join-Path $manifestDirectory $icon.src))) { $manifestFailures += "$relative -> $($icon.src)" }
    }
  } catch { $manifestFailures += "$relative does not parse" }
}
Add-Check 'PWA manifests and icons' ($manifestFailures.Count -eq 0) ($(if ($manifestFailures) { $manifestFailures -join ', ' } else { 'customer, admin and kiosk manifests parse and every icon exists' }))

$sourceScripts = @('JS/sobers-pizza.js','kiosk/kiosk.js','admin/business-admin.js','admin-preview/business-admin.js')
$assetRefs = [System.Collections.Generic.HashSet[string]]::new()
foreach ($relative in $sourceScripts) {
  $content = Get-Content (Join-Path $root $relative) -Raw
  foreach ($match in [regex]::Matches($content, 'assets/sobers-pizza/official-products/[^''"\s]+')) {
    [void]$assetRefs.Add(($match.Value -replace '^\.\./\.\./',''))
  }
}
$missingAssets = @($assetRefs | Where-Object { -not (Test-Path (Join-Path $dist $_)) })
Add-Check 'Official product assets' ($missingAssets.Count -eq 0) ($(if ($missingAssets) { $missingAssets -join ', ' } else { "$($assetRefs.Count) mapped assets exist in deployment output" }))

$oldPngRefs = rg -n 'official-products/.*\.png' (Join-Path $root 'JS') (Join-Path $root 'kiosk') (Join-Path $root 'admin') (Join-Path $root 'admin-preview') 2>$null
Add-Check 'Optimized image references' (-not $oldPngRefs) 'official product mappings use WebP rather than PNG'

$webpFiles = Get-ChildItem (Join-Path $dist 'assets/sobers-pizza/official-products') -Filter '*.webp' -File
$largest = $webpFiles | Sort-Object Length -Descending | Select-Object -First 1
$totalBytes = ($webpFiles | Measure-Object Length -Sum).Sum
Add-Check 'Image payload' ($largest.Length -lt 500KB) ("{0} WebP files, {1:N1} MB total, largest {2:N0} KB" -f $webpFiles.Count, ($totalBytes / 1MB), ($largest.Length / 1KB))

$customerJs = Get-Content (Join-Path $root 'JS/sobers-pizza.js') -Raw
$juiceSlugs = @('summer-wave','pine-paradise','citrus-blaze','orchard-fresh','fruit-fiesta','sobers-sunset','pizza-cooler-cocktail','smile-spritz','banana-power','mango-magic','mixed-berry','strawberry-bliss','sobers-special-smoothie','vanilla-dream','chocolate-bliss','strawberry-shake','sobers-triple-treat')
$juicePaths = foreach ($slug in $juiceSlugs) {
  $match = [regex]::Match($customerJs, '"' + [regex]::Escape($slug) + '"\s*:\s*"([^"]+)"')
  if ($match.Success) { $match.Groups[1].Value }
}
Add-Check 'Juice Bar uniqueness' (($juicePaths | Select-Object -Unique).Count -eq $juiceSlugs.Count) "17 Juice Bar products have 17 distinct image mappings"

$requiredRoutes = @('index.html','kiosk/main-branch/index.html','admin/index.html','admin-preview/index.html','track/index.html','legal/terms.html','legal/privacy.html')
$missingRoutes = @($requiredRoutes | Where-Object { -not (Test-Path (Join-Path $dist $_)) })
Add-Check 'Deployment routes' ($missingRoutes.Count -eq 0) ($(if ($missingRoutes) { $missingRoutes -join ', ' } else { "$($requiredRoutes.Count) primary routes present" }))

$htmlFiles = Get-ChildItem $root -Recurse -Filter '*.html' -File | Where-Object { $_.FullName -notmatch '\\dist\\' }
$missingLocalReferences = @()
foreach ($htmlFile in $htmlFiles) {
  $html = Get-Content $htmlFile.FullName -Raw
  $html = [regex]::Replace($html, '<!--[\s\S]*?-->', '')
  foreach ($match in [regex]::Matches($html, '(?:src|href)=["'']([^"'']+)["'']')) {
    $reference = $match.Groups[1].Value
    if ($reference -match '^(https?:|data:|mailto:|tel:|#|javascript:|//)' -or -not $reference) { continue }
    $cleanReference = ($reference -split '[?#]')[0]
    if (-not $cleanReference) { continue }
    $target = if ($cleanReference.StartsWith('/')) { Join-Path $root $cleanReference.TrimStart('/') } else { Join-Path $htmlFile.DirectoryName $cleanReference }
    if (-not (Test-Path $target)) { $missingLocalReferences += "$($htmlFile.FullName.Substring($root.Length + 1)) -> $reference" }
  }
}
Add-Check 'Local page references' ($missingLocalReferences.Count -eq 0) ($(if ($missingLocalReferences) { $missingLocalReferences -join ', ' } else { "$($htmlFiles.Count) HTML pages contain no broken local links or assets" }))

$securityPages = @('index.html','admin/index.html','kiosk/main-branch/index.html','track/index.html','legal/terms.html','legal/privacy.html')
$securityFailures = @()
foreach ($relative in $securityPages) {
  $html = Get-Content (Join-Path $root $relative) -Raw
  if ($html -notmatch 'Content-Security-Policy') { $securityFailures += "$relative missing CSP" }
  if ($html -notmatch 'name=["'']referrer["'']') { $securityFailures += "$relative missing referrer policy" }
}
Add-Check 'Browser security policy' ($securityFailures.Count -eq 0) ($(if ($securityFailures) { $securityFailures -join ', ' } else { 'all public and operational routes include CSP and referrer protection' }))

$parityFiles = @('index.html','manifest.json','sw.js','JS/sobers-pizza.js','JS/sobers-platform-orders.js','JS/sobers-customer.js','JS/sobers-auth.js','JS/sobers-notices.js','admin/index.html','admin/business-admin.js','admin/admin-pwa.js','admin/sw.js','kiosk/kiosk.js','kiosk/main-branch/index.html','kiosk/main-branch/manifest.json','kiosk/main-branch/sw.js','track/index.html','track/track.js','track/track-live.js')
$parityFailures = @()
foreach ($relative in $parityFiles) {
  $sourcePath = Join-Path $root $relative
  $distPath = Join-Path $dist $relative
  if (-not (Test-Path $sourcePath) -or -not (Test-Path $distPath) -or (Get-FileHash $sourcePath).Hash -ne (Get-FileHash $distPath).Hash) { $parityFailures += $relative }
}
Add-Check 'Deployment parity' ($parityFailures.Count -eq 0) ($(if ($parityFailures) { $parityFailures -join ', ' } else { "$($parityFiles.Count) critical source files match deployment output" }))

$lazyCustomer = $customerJs -match 'loading="\$\{imagePriority < 4 \? "eager" : "lazy"\}"'
$lazyKiosk = (Get-Content (Join-Path $root 'kiosk/kiosk.js') -Raw) -match 'loading="lazy"'
$lazyAdmin = (Get-Content (Join-Path $root 'admin/business-admin.js') -Raw) -match 'loading="lazy"'
Add-Check 'Deferred image loading' ($lazyCustomer -and $lazyKiosk -and $lazyAdmin) 'customer, kiosk and admin defer off-screen product images'

$result = [pscustomobject]@{
  passed = ($failures.Count -eq 0)
  checks = $checks
  failures = $failures
}
$result | ConvertTo-Json -Depth 5
if ($failures.Count -gt 0) { exit 1 }
