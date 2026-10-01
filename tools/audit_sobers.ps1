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

try { Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json | Out-Null; $manifestOk = $true } catch { $manifestOk = $false }
Add-Check 'PWA manifest' $manifestOk 'manifest.json parses successfully'

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
