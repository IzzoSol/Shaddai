# TURTLE Video API - Test Guide

## Quick Start

### 1. Start the SHADDAI Server
```powershell
cd C:\Users\Brittany\SHADDAI-FINAL-BUILD
npm start
```

Server starts on `http://localhost:3000`

### 2. Test TURTLE API Endpoints

#### A) Get Available Templates
```bash
curl http://localhost:3000/api/skills/turtle/templates
```

**Expected Response:**
```json
{
  "templates": [
    {"id": "modern", "name": "Modern", "description": "Clean, professional look"},
    {"id": "cinematic", "name": "Cinematic", "description": "Movie-like with dramatic effects"},
    ...
  ],
  "styles": ["cinematic", "documentary", "promotional", "educational", "casual"],
  "languages": ["en", "es", "fr", "de", "zh", "ja"],
  "voiceGenders": ["male", "female", "neutral"]
}
```

#### B) Create Video from Topic
```bash
curl -X POST http://localhost:3000/api/skills/turtle/create-video \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "The Future of AI in 2026",
    "duration": 60,
    "template": "modern",
    "style": "cinematic",
    "language": "en",
    "voiceGender": "female",
    "numFrames": 10
  }'
```

**Expected Response:**
```json
{
  "videoId": "vid-1715596800000-a1b2c3d4",
  "status": "queued",
  "progress": 0,
  "estimatedTime": "2-5 minutes",
  "message": "Video generation started. Poll /api/skills/turtle/status/{videoId} for progress"
}
```

**Save the videoId for the next step!**

#### C) Check Video Generation Progress
```bash
# Replace vid-xxx with your videoId from step B
curl http://localhost:3000/api/skills/turtle/status/vid-1715596800000-a1b2c3d4
```

**Response while generating:**
```json
{
  "videoId": "vid-1715596800000-a1b2c3d4",
  "status": "generating",
  "progress": 0.45,
  "createdAt": "2026-05-13T20:30:00Z"
}
```

**Response when complete:**
```json
{
  "videoId": "vid-1715596800000-a1b2c3d4",
  "status": "success",
  "progress": 1.0,
  "outputUrl": "/api/generated-files/vid-1715596800000-a1b2c3d4.mp4",
  "createdAt": "2026-05-13T20:30:00Z"
}
```

#### D) Download or Stream Generated Video
```bash
# Download the video
curl -O http://localhost:3000/api/generated-files/vid-1715596800000-a1b2c3d4.mp4

# Or open in browser
http://localhost:3000/api/generated-files/vid-1715596800000-a1b2c3d4.mp4
```

#### E) Create Video from Fixed Script
```bash
curl -X POST http://localhost:3000/api/skills/turtle/create-video \
  -H "Content-Type: application/json" \
  -d '{
    "script": "Welcome to our channel. Today we discuss the latest trends in artificial intelligence. AI is transforming industries at an unprecedented rate.",
    "duration": 45,
    "template": "tech",
    "style": "promotional"
  }'
```

#### F) List All Generated Videos
```bash
curl http://localhost:3000/api/skills/turtle/videos
```

**Response:**
```json
{
  "videos": [
    {
      "filename": "vid-1715596800000-a1b2c3d4.mp4",
      "url": "/api/generated-files/vid-1715596800000-a1b2c3d4.mp4",
      "createdAt": "2026-05-13T20:35:00Z"
    },
    {
      "filename": "vid-1715596801000-b2c3d4e5.mp4",
      "url": "/api/generated-files/vid-1715596801000-b2c3d4e5.mp4",
      "createdAt": "2026-05-13T20:40:00Z"
    }
  ],
  "count": 2
}
```

#### G) Cancel Video Generation
```bash
curl -X POST http://localhost:3000/api/skills/turtle/cancel/vid-1715596800000-a1b2c3d4
```

**Response:**
```json
{
  "videoId": "vid-1715596800000-a1b2c3d4",
  "status": "cancelled"
}
```

## Automated Test Script

Create a file `test-turtle.sh`:

```bash
#!/bin/bash

# Test TURTLE API endpoints

API="http://localhost:3000"

echo "🎬 Testing TURTLE Video API"
echo ""

# 1. Get templates
echo "1️⃣  Getting available templates..."
curl -s $API/api/skills/turtle/templates | jq '.templates | length'
echo ""

# 2. Create video
echo "2️⃣  Creating video from topic..."
VIDEO_RESPONSE=$(curl -s -X POST $API/api/skills/turtle/create-video \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "The Future of AI in 2026",
    "duration": 60,
    "template": "modern"
  }')

VIDEO_ID=$(echo $VIDEO_RESPONSE | jq -r '.videoId')
echo "Video ID: $VIDEO_ID"
echo ""

# 3. Poll status
echo "3️⃣  Polling video generation status..."
for i in {1..30}; do
  STATUS=$(curl -s $API/api/skills/turtle/status/$VIDEO_ID)
  PROGRESS=$(echo $STATUS | jq -r '.progress')
  STATE=$(echo $STATUS | jq -r '.status')
  
  echo "[$i/30] Status: $STATE | Progress: $(echo "$PROGRESS * 100" | bc)%"
  
  if [ "$STATE" = "success" ]; then
    echo "✓ Video generation complete!"
    OUTPUT_URL=$(echo $STATUS | jq -r '.outputUrl')
    echo "Output: $API$OUTPUT_URL"
    break
  fi
  
  sleep 2
done
echo ""

# 4. List videos
echo "4️⃣  Listing all generated videos..."
curl -s $API/api/skills/turtle/videos | jq '.videos | length'
echo ""

echo "✓ TURTLE API tests complete!"
```

Run the test:
```bash
bash test-turtle.sh
```

## PowerShell Test Script

Create a file `test-turtle.ps1`:

```powershell
# Test TURTLE API endpoints

$api = "http://localhost:3000"

Write-Host "🎬 Testing TURTLE Video API" -ForegroundColor Cyan
Write-Host ""

# 1. Get templates
Write-Host "1️⃣  Getting available templates..." -ForegroundColor Yellow
$templates = Invoke-RestMethod -Uri "$api/api/skills/turtle/templates"
Write-Host "Templates available: $($templates.templates.Count)" -ForegroundColor Green
Write-Host ""

# 2. Create video
Write-Host "2️⃣  Creating video from topic..." -ForegroundColor Yellow
$createResponse = Invoke-RestMethod -Uri "$api/api/skills/turtle/create-video" `
  -Method Post `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body (@{
    topic = "The Future of AI in 2026"
    duration = 60
    template = "modern"
  } | ConvertTo-Json)

$videoId = $createResponse.videoId
Write-Host "Video ID: $videoId" -ForegroundColor Green
Write-Host ""

# 3. Poll status
Write-Host "3️⃣  Polling video generation status..." -ForegroundColor Yellow
for ($i = 1; $i -le 30; $i++) {
  $statusResponse = Invoke-RestMethod -Uri "$api/api/skills/turtle/status/$videoId"
  $progress = [math]::Round($statusResponse.progress * 100)
  $state = $statusResponse.status
  
  Write-Host "[$i/30] Status: $state | Progress: $progress%" -ForegroundColor Cyan
  
  if ($state -eq "success") {
    Write-Host "✓ Video generation complete!" -ForegroundColor Green
    $outputUrl = $statusResponse.outputUrl
    Write-Host "Output: $api$outputUrl" -ForegroundColor Green
    break
  }
  
  Start-Sleep -Seconds 2
}
Write-Host ""

# 4. List videos
Write-Host "4️⃣  Listing all generated videos..." -ForegroundColor Yellow
$videos = Invoke-RestMethod -Uri "$api/api/skills/turtle/videos"
Write-Host "Videos generated: $($videos.videos.Count)" -ForegroundColor Green
Write-Host ""

Write-Host "✓ TURTLE API tests complete!" -ForegroundColor Green
```

Run the test:
```powershell
.\test-turtle.ps1
```

## Integration with SHADDAI Dashboard

To add TURTLE video creation to the dashboard:

1. Open `public/index.html`
2. Find the skills/features section
3. Add a new tab for "Create Video"
4. Include the HTML from `TURTLE_VIDEO_SKILL_UI.html`
5. The JavaScript handles all API communication

## Troubleshooting

### Video Generation Stuck at 0%
- Check if Python is installed: `python --version`
- Check server logs for errors
- Ensure `/generated-output/` directory exists

### "Cannot find module" errors
- Run `npm install` to ensure all dependencies are installed
- Check `package.json` versions match installed packages

### FFmpeg errors (if you have FFmpeg installed)
- Verify FFmpeg is in PATH: `ffmpeg -version`
- On Windows: `choco install ffmpeg`
- On macOS: `brew install ffmpeg`
- On Linux: `sudo apt-get install ffmpeg`

### Python service not responding
- Ensure `turtle-video-service.py` exists in `/backend/`
- Check if Python environment has required packages

## Performance Notes

- **First request:** ~2-5 minutes (generating from scratch)
- **Subsequent requests:** Similar time (each is independent)
- **Concurrent requests:** Handled sequentially in queue
- **Server resources:** Minimal while queued, higher during composition

## Next Steps

✅ Routes mounted in server  
✅ API endpoints ready  
✅ Test script provided  
→ Mount routes: Done (line 24 of server-production.js)  
→ Install FFmpeg: Optional (for final composition)  
→ Add to dashboard UI: See TURTLE_VIDEO_SKILL_UI.html  
→ Deploy to production  

---

**Status:** TURTLE Video Service is ready for testing!
