# SHADDAI — Video Clipper

Local video processing tool that converts long videos into vertical shorts for social platforms.

## 🎯 Purpose

Turn long-form video content into engaging vertical shorts for TikTok, Reels, YouTube Shorts, and others.

## 🛠️ Features

- **FFmpeg Integration**: Extract clips, generate subtitles, transcode at different resolutions.
- **Whisper AI**: Automated speech-to-text for multi-language subtitles.
- **Auto Highlights**: AI picks the best moments based on motion and activity.
- **Vertical Shorts**: Automatically split long videos into 9:16 format.
- **Batch Processing**: Generate multiple shorts from one source video.

## 🗃️ Backend Architecture

```
localhost:8787/clipper/
├── /health              # Health check endpoint
├── /upload              # Upload video to process
├── /generate            # Generate clips from uploaded
├── /extract-frames      # Extract frame sequences
├── /extract-speaker     # Identify speaker/audio
├── /subtitles           # Generate Whisper subtitles
├── /split-shorts        # Split to vertical 9:16 format
└── /download/:clipId    # Download generated clip
```

## 📂 Files

```
public/
├── clipper/
│   └── clipper.html           # Main UI (long → vertical shorts)
├── js/
│   └── clipper.js             # JavaScript engine wrapper
└── media-studio.js            # Multi-tool suite entry point
```

## 🚀 Usage

### From Media Studio
1. Open SHADDAI
2. Click "Media Studio" button (🎛️)
3. Select "Video Clipper" (✂️)
4. Upload video, adjust settings, click "Generate Clips"

### Frontend Integration
```javascript
// Check connection
const connected = await SHADDAI_CLIPPER.checkConnection();

// Upload video
const result = await SHADDAI_CLIPPER.uploadVideo(videoFile);

// Generate clips
const clips = await SHADDAI_CLIPPER.generateClips({
    startTime: 0,
    duration: 60,
    resolution: '1080p',
    autoHighlights: true
});

// Download clip
await SHADDAI_CLIPPER.downloadClip(clips[0].id);
```

## 🔧 Requirements

- **Backend**: FFmpeg + Whisper running on `localhost:8787`
- **FFmpeg**: Installed and accessible from command line
- **Whisper**: OpenAI Whisper model (via HF hub or local)
- **Node.js**: Backend should expect POST requests from this frontend

## 🌐 Local Mode

This clipper runs LOCALLY ONLY. Videos are processed on your machine via the local backend at `localhost:8787`. No video data is sent to external servers.

## 🎨 UI Features

- Drag & drop upload zone
- Adjustable clip duration and start time
- Resolution selection (1080p | 720p | 480p | 360p)
- Aspect ratio selector (16:9 | 9:16 | 1:1)
- Real-time progress tracking
- Auto highlihgts, subtitles, and vertical mode toggles

## 🔒 Security

- All processing happens locally via `localhost:8787`
- No public CORS proxy needed
- No API keys required (uses local FFmpeg/Whisper)

## 📊 Performance

- Process: Fast local processing via FFmpeg
- Size: Clips processed in-memory, full video stored locally
- Quality: Support up to 1080p, preserves original codec

## 🐛 Known Limitations

- Requires local backend running on port 8787
- FFmpeg must be installed and in PATH
- Whisper model may take time to load initially
- Browser memory limits when processing very large files

## 📝 Future Improvements

- [ ] Cloud processing mode (when backend is deployed)
- [ ] Real-time preview before generation
- [ ] Batch processing of multiple files
- [ ] Export progress bar with ETA
- [ ] Audio optimization (background music overlay)
- [ ] Branding watermark support

## 🤝 Contributing

- Local backend contributed by backend team
- Frontend implementation by frontend team
- Integration by UI/UX team

## 📄 License

Part of SHADDAI Empire. All rights reserved.