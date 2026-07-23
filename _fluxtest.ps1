$ErrorActionPreference = 'Stop'
$token = (Get-Content "C:\Users\Brittany\Desktop\SHADDAI MASTER FINAL BUILD\ai.key" -Raw).Trim()
$headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }

$prompt = "A clean reference sheet of six full-body isometric video game characters standing in a row, chunky stylized voxel art style, bright saturated colors, crisp cel shading, single soft upper-left light source, diverse citizens: a business person in a suit, a casual person in a hoodie, an athlete holding a ball, a woman in a dress, a hooded traveler, a worker in overalls. Plain flat light grey studio background, evenly spaced, consistent scale, game asset, no text, no labels, no watermark, high detail."

$body = @{
  prompt       = $prompt
  action       = "generate"
  model        = "flux-pro-1.1"
  size         = "1344x768"
  count        = 1
  callback_url = "https://api.acedata.cloud/health"
} | ConvertTo-Json

Write-Host "== submitting =="
try {
  $res = Invoke-RestMethod -Uri "https://api.acedata.cloud/flux/images" -Method POST -Headers $headers -Body $body -TimeoutSec 60
} catch {
  Write-Host ("SUBMIT FAILED :: " + $_.Exception.Message)
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { Write-Host ("BODY :: " + $_.ErrorDetails.Message) }
  if ($_.Exception.Response) {
    try { $sc = $_.Exception.Response.StatusCode.value__; Write-Host "HTTP $sc" } catch {}
  }
  exit 1
}
Write-Host ("submit response: " + ($res | ConvertTo-Json -Depth 8 -Compress))

# Try to find an immediate image url, else a task id to poll
function Find-ImageUrl($obj) {
  $j = $obj | ConvertTo-Json -Depth 12
  $m = [regex]::Match($j, 'https?://[^"]+\.(png|jpg|jpeg|webp)')
  if ($m.Success) { return $m.Value }
  return $null
}

$url = Find-ImageUrl $res
$taskId = $res.task_id
if (-not $taskId -and $res.data) { $taskId = $res.data.task_id }

if (-not $url -and $taskId) {
  Write-Host "== polling task $taskId =="
  for ($i=0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 4
    try {
      $poll = Invoke-RestMethod -Uri "https://api.acedata.cloud/flux/tasks" -Method POST -Headers $headers -Body (@{task_id=$taskId}|ConvertTo-Json) -TimeoutSec 60
    } catch { Write-Host "poll err $($_.Exception.Message)"; continue }
    $url = Find-ImageUrl $poll
    $status = $poll.data.status; if (-not $status) { $status = $poll.status }
    Write-Host ("poll #$i status=$status url=" + ($url -ne $null))
    if ($url) { break }
    if ($status -eq 'failed' -or $status -eq 'error') { Write-Host ($poll|ConvertTo-Json -Depth 8 -Compress); break }
  }
}

if ($url) {
  Write-Host "IMAGE URL: $url"
  $out = "C:\Users\Brittany\Desktop\SHADDAI MASTER FINAL BUILD\_fluxtest.png"
  Invoke-WebRequest -Uri $url -OutFile $out -TimeoutSec 120
  Write-Host "SAVED -> $out ($((Get-Item $out).Length) bytes)"
} else {
  Write-Host "NO IMAGE URL obtained."
}
