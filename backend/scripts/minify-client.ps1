# Minifies the hand-written client JavaScript into public/dist/.
#
# WHAT THIS IS AND IS NOT.
#   Client code is delivered to a browser. Anyone can read what their browser
#   downloads, so client code CANNOT be protected from reverse engineering.
#   Minifying raises the cost of reading and shrinks the payload - it stops
#   nobody. The only real fix is to not put the value in the client: move it
#   into backend/ (tracker SEC-2). This script is the cheap half of that.
#
# USAGE
#   powershell -File backend/scripts/minify-client.ps1          # report only
#   powershell -File backend/scripts/minify-client.ps1 -Write   # write public/dist
#   powershell -File backend/scripts/minify-client.ps1 -Min 20000 # only files over 20KB
#
# It never edits a source file. It reads public/ and writes public/dist/.
param([switch]$Write, [int]$Min = 10240)

$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$pub = Join-Path $root 'public'
$out = Join-Path $pub 'dist'
$skip = 'vendor|node_modules|\.min\.js$|realms\\assets|mirofish\\assets'

# Find terser once. npx caches it; calling the cached binary directly avoids
# ~1.5s of npx overhead per file, which is the difference between 4 minutes
# and 30 seconds.
function Find-Terser {
  $c = Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx" -Recurse -Filter 'terser.cmd' -Depth 5 -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.FullName }
  & npx --yes terser --version 2>$null | Out-Null
  return (Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx" -Recurse -Filter 'terser.cmd' -Depth 5 -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
}
$terser = Find-Terser
if (-not $terser) { Write-Output 'terser not available - run: npm i -D terser'; exit 2 }
Write-Output "terser: $terser"

$files = Get-ChildItem $pub -Recurse -File -Include *.js |
  Where-Object { $_.FullName -notmatch $skip -and $_.FullName -notlike "$out*" -and $_.Length -ge $Min }

Write-Output "minify-client: $($files.Count) files over $Min bytes"
$before = 0; $after = 0; $done = 0; $failed = 0
foreach ($f in $files) {
  $rel = $f.FullName.Substring($pub.Length + 1)
  $dest = Join-Path $out $rel
  $tmp = Join-Path $env:TEMP ("min_" + [guid]::NewGuid().ToString('N') + '.js')
  & $terser $f.FullName -c -m --toplevel 2>$null | Out-File -FilePath $tmp -Encoding utf8
  if ((Test-Path $tmp) -and (Get-Item $tmp).Length -gt 0) {
    $b = $f.Length; $a = (Get-Item $tmp).Length
    $before += $b; $after += $a; $done++
    if ($Write) {
      New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
      Move-Item $tmp $dest -Force
    } else { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
  } else {
    $failed++; Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}
if ($before -gt 0) {
  Write-Output ""
  Write-Output ("TOTAL {0} files: {1:N0} -> {2:N0} bytes  ({3}%)  skipped {4}" -f $done, $before, $after, [math]::Round((1 - $after / $before) * 100, 1), $failed)
  if ($Write) { Write-Output "written to public/dist" } else { Write-Output '(report only - pass -Write to emit public/dist)' }
}
