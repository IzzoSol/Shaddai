/* ══════════════════════════════════════════════════════════════════════
     SHADDAI — CLIPPER BACKEND
     FFmpeg + Whisper API for video processing
     Endpoints: /health, /upload, /generate, /extract-frames, /extract-speaker,
                /subtitles, /split-shorts, /download/:clipId
═══════════════════════════════════════════════════════════════════════ */
'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const { spawn, execFile } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8787;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Storage ─────────────────────────────────────────────────────────────────
const uploadDir = '/app/uploads';
const outputDir = '/app/output';
const tempDir = '/app/temp';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video/audio files allowed'));
    }
  }
});

// ─── State (in-memory for simplicity; use Redis/DB for production) ───────────
const jobs = new Map();
const videos = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────
function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'pipe' });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `Exit ${code}`)));
  });
}

async function runFFmpeg(input, args, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions(args)
      .on('end', () => resolve(output))
      .on('error', reject)
      .save(output);
  });
}

async function runWhisper(audioPath, language = 'en') {
  const whisperPath = '/opt/venv/bin/whisper';
  const outputDir = path.dirname(audioPath);
  const baseName = path.basename(audioPath, path.extname(audioPath));
  
  await runCommand(whisperPath, [
    audioPath,
    '--language', language,
    '--model', 'base',
    '--output_format', 'srt',
    '--output_dir', outputDir
  ]);

  const srtPath = path.join(outputDir, `${baseName}.srt`);
  const srt = await fs.readFile(srtPath, 'utf8');
  return srt;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check
app.get('/clipper/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'shaddai-clipper',
    version: '1.0.0',
    ffmpeg: true,
    whisper: true
  });
});

// Upload video
app.post('/clipper/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const videoId = uuidv4();
    const videoInfo = {
      id: videoId,
      originalName: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: new Date().toISOString()
    };

    videos.set(videoId, videoInfo);
    
    res.json({ 
      success: true, 
      videoId, 
      message: 'Video uploaded successfully',
      video: videoInfo
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Generate clips
app.post('/clipper/generate', async (req, res) => {
  try {
    const { videoId, startTime = 0, duration = 60, resolution = '1080p', autoHighlights = true } = req.body;
    
    const video = videos.get(videoId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const jobId = uuidv4();
    const clipId = uuidv4();
    const outputPath = path.join(outputDir, `${clipId}.mp4`);
    
    const height = resolution.replace('p', '');
    const width = Math.round(height * 16 / 9);
    
    const job = {
      id: jobId,
      type: 'generate',
      videoId,
      status: 'processing',
      progress: 0,
      params: { startTime, duration, resolution, autoHighlights },
      createdAt: new Date().toISOString()
    };
    jobs.set(jobId, job);

    // Process async
    processGenerateClip(jobId, video.path, outputPath, startTime, duration, width, height, autoHighlights)
      .then(result => {
        job.status = 'completed';
        job.progress = 100;
        job.result = result;
      })
      .catch(err => {
        job.status = 'failed';
        job.error = err.message;
      });

    res.json({ 
      success: true, 
      jobId,
      clipId,
      message: 'Clip generation started'
    });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Generation failed' });
  }
});

async function processGenerateClip(jobId, inputPath, outputPath, startTime, duration, width, height, autoHighlights) {
  const args = [
    '-ss', startTime.toString(),
    '-t', duration.toString(),
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart'
  ];

  await runFFmpeg(inputPath, args, outputPath);
  
  const job = jobs.get(jobId);
  if (job) {
    job.clips = [{ id: path.basename(outputPath, '.mp4'), path: outputPath, duration }];
  }
}

// Extract frames
app.post('/clipper/extract-frames', async (req, res) => {
  try {
    const { videoId, count = 10 } = req.body;
    const video = videos.get(videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const jobId = uuidv4();
    const framesDir = path.join(outputDir, `frames-${jobId}`);
    await fs.mkdir(framesDir, { recursive: true });

    const outputPattern = path.join(framesDir, 'frame-%04d.jpg');
    await runFFmpeg(video.path, ['-vf', `fps=1/${Math.ceil(30/count)}`, '-vframes', count.toString()], outputPattern);

    const files = await fs.readdir(framesDir);
    const frames = files.map(f => `/clipper/download-frame/${jobId}/${f}`);

    res.json({ success: true, jobId, frames, count: frames.length });
  } catch (err) {
    console.error('Extract frames error:', err);
    res.status(500).json({ error: 'Frame extraction failed' });
  }
});

// Extract speaker (placeholder - requires speaker diarization model)
app.post('/clipper/extract-speaker', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file' });
    
    res.json({ 
      success: true, 
      message: 'Speaker extraction not fully implemented - requires pyannote.audio',
      audioPath: req.file.path
    });
  } catch (err) {
    res.status(500).json({ error: 'Speaker extraction failed' });
  }
});

// Generate subtitles with Whisper
app.post('/clipper/subtitles', async (req, res) => {
  try {
    const { videoId, language = 'en' } = req.body;
    const video = videos.get(videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const jobId = uuidv4();
    const audioPath = path.join(tempDir, `${jobId}.wav`);
    
    // Extract audio
    await runFFmpeg(video.path, ['-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1'], audioPath);
    
    // Run Whisper
    const srt = await runWhisper(audioPath, language);
    
    // Clean up
    await fs.unlink(audioPath).catch(() => {});
    
    res.json({ success: true, jobId, subtitles: srt, language });
  } catch (err) {
    console.error('Subtitles error:', err);
    res.status(500).json({ error: 'Subtitle generation failed' });
  }
});

// Split to vertical shorts (9:16)
app.post('/clipper/split-shorts', async (req, res) => {
  try {
    const { videoId } = req.body;
    const video = videos.get(videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const jobId = uuidv4();
    const shortsDir = path.join(outputDir, `shorts-${jobId}`);
    await fs.mkdir(shortsDir, { recursive: true });

    // Get video duration
    const duration = await getVideoDuration(video.path);
    const clipDuration = 60; // 60 seconds per short
    const numClips = Math.ceil(duration / clipDuration);

    const clips = [];
    for (let i = 0; i < numClips; i++) {
      const clipId = uuidv4();
      const startTime = i * clipDuration;
      const outputPath = path.join(shortsDir, `${clipId}.mp4`);
      
      // 9:16 aspect ratio (1080x1920)
      await runFFmpeg(video.path, [
        '-ss', startTime.toString(),
        '-t', clipDuration.toString(),
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'
      ], outputPath);

      clips.push({ id: clipId, path: outputPath, startTime, duration: clipDuration });
    }

    res.json({ success: true, jobId, clips, count: clips.length });
  } catch (err) {
    console.error('Split shorts error:', err);
    res.status(500).json({ error: 'Short splitting failed' });
  }
});

// Download clip
app.get('/clipper/download/:clipId', async (req, res) => {
  try {
    const { clipId } = req.params;
    // Search in outputDir and subdirs
    const files = await findFile(outputDir, clipId);
    if (!files) return res.status(404).json({ error: 'Clip not found' });

    res.download(files, `SHADDAI-clip-${clipId}.mp4`);
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

// Job status
app.get('/clipper/job/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// Helper: get video duration
function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration || 0);
    });
  });
}

// Helper: find file recursively
async function findFile(dir, name) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFile(fullPath, name);
      if (found) return found;
    } else if (entry.name.includes(name)) {
      return fullPath;
    }
  }
  return null;
}

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SHADDAI Clipper Backend running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/clipper/health`);
});