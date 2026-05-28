# TURTLE Video Creation Integration Guide

## Overview
TURTLE can now generate complete videos from topics using extracted Pixelle-Video modules.

**Features:**
- ✅ Automatic script generation from topics
- ✅ Frame planning and image prompting
- ✅ Multi-language TTS support
- ✅ Background music selection
- ✅ Final MP4 composition
- ✅ Progress tracking
- ✅ Job queuing and cancellation

## Files Created

### 1. `/backend/turtle-video-service.py`
**Purpose:** Core video generation logic (extracted from Pixelle-Video)

**Classes:**
- `ScriptGenerator` - Create scripts from topics
- `ImagePlanner` - Plan visuals for each frame
- `TTSGenerator` - Text-to-speech narration
- `VideoCompositor` - Final video composition
- `TURTLEVideoService` - Main orchestrator
- `VideoServiceAPI` - REST wrapper

**Size:** 400 lines

### 2. `/backend/turtle-video-endpoints.js`
**Purpose:** Express.js REST API endpoints

**Endpoints:**
```
POST   /api/skills/turtle/create-video      - Generate video
GET    /api/skills/turtle/status/:videoId   - Get progress
POST   /api/skills/turtle/cancel/:videoId   - Cancel job
GET    /api/skills/turtle/templates         - List templates
GET    /api/skills/turtle/videos            - List generated videos
```

**Size:** 250 lines

## Integration Steps

### Step 1: Mount Routes in server-production.js

Add this to your Express app setup (around line 40):

```javascript
// ... existing imports ...
const { router: turtleRouter } = require('./turtle-video-endpoints');

// ... existing middleware ...

// Mount TURTLE video routes
app.use('/api/skills/turtle', turtleRouter);

// ... rest of app ...
```

### Step 2: Install Python Dependencies

```bash
# From project root
pip install -r requirements-video.txt
```

Create `requirements-video.txt`:
```
edge-tts>=0.30.0
ffmpeg-python>=0.2.1
pydub>=0.25.1
```

### Step 3: Verify FFmpeg Installation

Video composition requires FFmpeg:

**Windows:**
```powershell
choco install ffmpeg
# OR download from https://ffmpeg.org/download.html
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt-get install ffmpeg
```

Verify: `ffmpeg -version`

## API Usage

### Generate Video from Topic

```bash
curl -X POST http://localhost:3000/api/skills/turtle/create-video \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "The Future of AI in 2026",
    "duration": 60,
    "template": "modern",
    "style": "cinematic",
    "language": "en",
    "numFrames": 10,
    "voiceGender": "female"
  }'
```

**Response:**
```json
{
  "videoId": "vid-1715596800000-a1b2c3d4",
  "status": "queued",
  "progress": 0,
  "estimatedTime": "2-5 minutes",
  "message": "Video generation started..."
}
```

### Check Video Progress

```bash
curl http://localhost:3000/api/skills/turtle/status/vid-1715596800000-a1b2c3d4
```

**Response:**
```json
{
  "videoId": "vid-1715596800000-a1b2c3d4",
  "status": "generating",
  "progress": 0.65,
  "createdAt": "2026-05-13T20:30:00Z"
}
```

When complete, response includes `outputUrl`:
```json
{
  "videoId": "vid-1715596800000-a1b2c3d4",
  "status": "success",
  "progress": 1.0,
  "outputUrl": "/api/generated-files/vid-1715596800000-a1b2c3d4.mp4",
  "createdAt": "2026-05-13T20:30:00Z"
}
```

### Generate from Fixed Script

```bash
curl -X POST http://localhost:3000/api/skills/turtle/create-video \
  -H "Content-Type: application/json" \
  -d '{
    "script": "Welcome to our channel. Today we discuss the latest AI trends.",
    "duration": 30,
    "template": "tech",
    "style": "promotional"
  }'
```

### List Available Templates

```bash
curl http://localhost:3000/api/skills/turtle/templates
```

**Response:**
```json
{
  "templates": [
    {
      "id": "modern",
      "name": "Modern",
      "description": "Clean, professional look"
    },
    {
      "id": "cinematic",
      "name": "Cinematic",
      "description": "Movie-like with dramatic effects"
    },
    ...
  ],
  "styles": ["cinematic", "documentary", "promotional", ...],
  "languages": ["en", "es", "fr", "de", "zh", "ja"],
  "voiceGenders": ["male", "female", "neutral"]
}
```

### List Generated Videos

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
    }
  ],
  "count": 1
}
```

## Workflow Integration

### In SHADDAI Dashboard

1. User clicks "Create Video" under TURTLE skills
2. Form pops up:
   - Topic input
   - Template selector
   - Style selector
   - Language selector
   - Duration slider
3. Submit → calls `/api/skills/turtle/create-video`
4. Get `videoId`
5. Poll `/api/skills/turtle/status/{videoId}` for progress
6. When complete, display video player with output

### In Job System

```javascript
// Create job for TURTLE video generation
const job = {
  id: "job-123",
  agentId: "TURTLE",
  skillId: "create-video",
  status: "executing",
  request: {
    topic: "AI Trends 2026",
    duration: 60,
    template: "modern"
  },
  videoId: "vid-...",  // From API response
  progress: 0,
  createdAt: new Date().toISOString()
};

// Poll status
setInterval(async () => {
  const status = await fetch(`/api/skills/turtle/status/${job.videoId}`).then(r => r.json());
  job.progress = status.progress;
  if (status.status === 'success') {
    job.outputUrl = status.outputUrl;
    job.status = 'completed';
  }
}, 2000);
```

## Configuration

### Environment Variables

Create `.env` in project root:

```env
# Video Generation
VIDEO_OUTPUT_DIR=./generated-output
VIDEO_MAX_DURATION=300
VIDEO_FFMPEG_PATH=/usr/bin/ffmpeg

# TTS
TTS_PROVIDER=edge-tts
TTS_LANG=en

# LLM for script generation
LLM_PROVIDER=openai
LLM_MODEL=gpt-4
OPENAI_API_KEY=sk-...
```

### Python Service Config

`turtle-video-service.py` reads from environment:

```python
service = TURTLEVideoService(
    llm_client=openai_client,
    output_dir=os.getenv('VIDEO_OUTPUT_DIR', './generated-output')
)
```

## Performance Considerations

### Video Generation Timeline
- Script generation: 5-10 seconds
- Image planning: 5 seconds
- TTS generation: 10-30 seconds
- Video composition: 30-60 seconds
- **Total: 2-5 minutes per video**

### Optimization Tips
1. **Parallel processing:** Generate TTS + fetch images simultaneously
2. **Caching:** Reuse common images/music
3. **Batch composition:** Compose multiple videos in queue
4. **CDN:** Serve generated videos from CDN for faster access

### Resource Requirements
- **CPU:** 2+ cores recommended
- **RAM:** 4GB+ (for video composition)
- **Disk:** 10GB+ for output videos
- **Network:** Internet for external APIs (image gen, TTS)

## Troubleshooting

### "ffmpeg not found"
```bash
# Install ffmpeg
# Windows: choco install ffmpeg
# macOS: brew install ffmpeg
# Linux: sudo apt-get install ffmpeg

# Verify installation
ffmpeg -version
```

### Video generation stuck at "generating"
```bash
# Check job status
curl http://localhost:3000/api/skills/turtle/status/vid-xxx

# Cancel if needed
curl -X POST http://localhost:3000/api/skills/turtle/cancel/vid-xxx

# Check server logs for errors
```

### Poor quality audio
- Increase TTS quality: `voice_quality: "high"` in request
- Use premium TTS provider (ElevenLabs instead of edge-tts)

### Poor quality images
- Use better image generation model (DALL-E 3 instead of DALL-E 2)
- Provide more detailed image prompts
- Use dedicated image gen API (Midjourney, Runway)

## Extending TURTLE

### Add Custom Template

```javascript
// In turtle-video-service.py
class TemplateManager:
    def get_template(self, name):
        templates = {
            'custom': {
                'transitions': 'fade',
                'aspectRatio': '9:16',
                'fontSize': 24,
                'colors': ['#FF6B6B', '#4ECDC4']
            }
        }
        return templates.get(name)
```

### Add Custom Image Generator

```javascript
// Implement in turtle-video-endpoints.js
async function generateImages(prompts, model = 'dall-e-3') {
    if (model === 'dall-e-3') {
        // Call OpenAI API
    } else if (model === 'midjourney') {
        // Call Midjourney API
    } else if (model === 'stable-diffusion') {
        // Call local/external SD API
    }
}
```

### Add Custom Music Selection

```javascript
// Add to VideoCompositor
async function selectMusic(genre, duration) {
    // Query music API (Epidemic Sound, YouTube Audio Library, etc.)
    // Return audio file path
}
```

## Testing

### Unit Test

```bash
# Test Python service directly
python backend/turtle-video-service.py
```

### Integration Test

```bash
# 1. Start server
npm start

# 2. Create video
curl -X POST http://localhost:3000/api/skills/turtle/create-video \
  -H "Content-Type: application/json" \
  -d '{"topic": "Test Video", "duration": 30}'

# 3. Check status repeatedly
for i in {1..30}; do
  curl http://localhost:3000/api/skills/turtle/status/vid-xxx
  sleep 5
done

# 4. Download video
curl -O http://localhost:3000/api/generated-files/vid-xxx.mp4
```

## Next Steps

1. ✅ Core Python service created
2. ✅ API endpoints created
3. → Mount routes in server-production.js
4. → Install dependencies (ffmpeg, Python packages)
5. → Test with sample requests
6. → Add to SHADDAI frontend skill selector
7. → Deploy to production

## Support

**Pixelle-Video Docs:** https://aidc-ai.github.io/Pixelle-Video/
**FFmpeg Docs:** https://ffmpeg.org/documentation.html

---

Created: 2026-05-13  
Integration Status: Ready for server mounting
