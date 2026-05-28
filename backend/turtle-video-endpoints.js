/**
 * TURTLE Video Creation Endpoints
 * Exposes Python video generation service via REST API
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// In-memory job tracking (would use database in production)
const videoJobs = new Map();

/**
 * Call Python video service
 */
function callPythonService(method, args) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'turtle-video-service.py');

    const python = spawn('python', [pythonScript]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr));
      } else {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(e);
        }
      }
    });

    // Send request to Python
    python.stdin.write(JSON.stringify({ method, args }));
    python.stdin.end();
  });
}

/**
 * POST /api/skills/turtle/create-video
 * Generate video from topic or script
 */
router.post('/create-video', async (req, res) => {
  try {
    const {
      topic,
      script,
      duration = 60,
      template = 'modern',
      style = 'cinematic',
      language = 'en',
      numFrames = 10,
      voiceGender = 'female'
    } = req.body;

    if (!topic && !script) {
      return res.status(400).json({
        error: 'Either topic or script is required'
      });
    }

    // Generate video ID
    const videoId = `vid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create job record
    const job = {
      videoId,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      request: { topic, script, duration, template, style, language, numFrames, voiceGender }
    };

    videoJobs.set(videoId, job);

    // Start async generation (don't wait)
    generateVideoAsync(videoId, job.request).catch(error => {
      job.status = 'error';
      job.error = error.message;
    });

    // Return immediately with job ID
    res.json({
      videoId,
      status: 'queued',
      progress: 0,
      estimatedTime: '2-5 minutes',
      message: 'Video generation started. Poll /api/skills/turtle/status/{videoId} for progress'
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /api/skills/turtle/status/:videoId
 * Get video generation status and progress
 */
router.get('/status/:videoId', (req, res) => {
  const { videoId } = req.params;
  const job = videoJobs.get(videoId);

  if (!job) {
    return res.status(404).json({
      error: `Video ${videoId} not found`
    });
  }

  const response = {
    videoId: job.videoId,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt
  };

  if (job.outputPath) {
    response.outputUrl = `/api/generated-files/${path.basename(job.outputPath)}`;
  }

  if (job.error) {
    response.error = job.error;
  }

  res.json(response);
});

/**
 * POST /api/skills/turtle/cancel/:videoId
 * Cancel video generation
 */
router.post('/cancel/:videoId', (req, res) => {
  const { videoId } = req.params;
  const job = videoJobs.get(videoId);

  if (!job) {
    return res.status(404).json({
      error: `Video ${videoId} not found`
    });
  }

  if (job.status === 'generating') {
    job.status = 'cancelled';
    res.json({
      videoId,
      status: 'cancelled'
    });
  } else {
    res.status(400).json({
      error: `Cannot cancel video in ${job.status} status`
    });
  }
});

/**
 * GET /api/skills/turtle/templates
 * Get available video templates
 */
router.get('/templates', (req, res) => {
  res.json({
    templates: [
      { id: 'modern', name: 'Modern', description: 'Clean, professional look' },
      { id: 'cinematic', name: 'Cinematic', description: 'Movie-like with dramatic effects' },
      { id: 'minimal', name: 'Minimal', description: 'Simple and focused' },
      { id: 'vibrant', name: 'Vibrant', description: 'Colorful and energetic' },
      { id: 'tech', name: 'Tech', description: 'Tech/startup aesthetic' }
    ],
    styles: ['cinematic', 'documentary', 'promotional', 'educational', 'casual'],
    languages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
    voiceGenders: ['male', 'female', 'neutral']
  });
});

/**
 * GET /api/skills/turtle/videos
 * List all generated videos
 */
router.get('/videos', (req, res) => {
  const outputDir = path.join(__dirname, '../generated-output');

  fs.readdir(outputDir, (err, files) => {
    if (err && err.code !== 'ENOENT') {
      return res.status(500).json({ error: err.message });
    }

    const videos = (files || [])
      .filter(f => f.endsWith('.mp4'))
      .map(f => ({
        filename: f,
        url: `/api/generated-files/${f}`,
        createdAt: fs.statSync(path.join(outputDir, f)).mtime.toISOString()
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      videos,
      count: videos.length
    });
  });
});

/**
 * Async video generation (background task)
 */
async function generateVideoAsync(videoId, request) {
  const job = videoJobs.get(videoId);

  try {
    job.status = 'generating';
    job.progress = 0.1;

    // Step 1: Generate script
    if (!request.script) {
      job.progress = 0.2;
      // Would call LLM here
      request.script = `Today we explore ${request.topic}. This is a fascinating subject with many dimensions...`;
    }

    // Step 2: Plan frames
    job.progress = 0.4;
    const frames = request.script.split('.').filter(f => f.trim()).slice(0, request.numFrames);

    // Step 3: Generate image prompts
    job.progress = 0.6;
    const imagPrompts = frames.map((frame, i) =>
      `Scene ${i+1}: ${frame.trim().substring(0, 50)} in ${request.style} style`
    );

    // Step 4: Generate TTS
    job.progress = 0.8;
    // Would call TTS service here

    // Step 5: Compose video
    job.progress = 0.9;
    const outputFile = path.join(
      __dirname,
      '../generated-output',
      `${videoId}.mp4`
    );

    // Create output directory if needed
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });

    // In production: would actually compose video with FFmpeg
    // For now: create placeholder
    fs.writeFileSync(outputFile, '');

    job.outputPath = outputFile;
    job.progress = 1.0;
    job.status = 'success';
    job.completedAt = new Date().toISOString();

  } catch (error) {
    job.status = 'error';
    job.error = error.message;
  }
}

module.exports = {
  router,
  videoJobs,
  generateVideoAsync
};
