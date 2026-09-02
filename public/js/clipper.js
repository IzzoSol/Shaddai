/* ══════════════════════════════════════════════════════════════════════
     SHADDAI — VIDEO CLIPPER ENGINE
     Local clipper backend wrapper
═══════════════════════════════════════════════════════════════════════ */

const SHADDAI_CLIPPER = {
    version: '1.0',
    backendUrl: 'http://localhost:8787',

    // Check if clipper backend is available
    async checkConnection() {
        try {
            const response = await fetch(`${this.backendUrl}/clipper/health`, {
                method: 'GET'
            });

            return response.ok;
        } catch (e) {
            console.error('Clipper backend not available:', e);
            return false;
        }
    },

    // Upload video to clipper backend
    async uploadVideo(file) {
        try {
            const formData = new FormData();
            formData.append('video', file);

            const response = await fetch(`${this.backendUrl}/clipper/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const data = await response.json();
            return data;
        } catch (e) {
            throw new Error('Upload failed — ensure backend is running on localhost:8787');
        }
    },

    // Generate clips from uploaded video
    async generateClips(params) {
        try {
            const response = await fetch(`${this.backendUrl}/clipper/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(params)
            });

            if (!response.ok) {
                throw new Error('Generation failed');
            }

            const data = await response.json();
            return data;
        } catch (e) {
            throw new Error('Generation failed — backend not available');
        }
    },

    // Extract frames from video
    async extractFrames(videoId, count) {
        try {
            const response = await fetch(`${this.backendUrl}/clipper/extract-frames`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ videoId, count })
            });

            if (!response.ok) {
                throw new Error('Frame extraction failed');
            }

            const data = await response.json();
            return data;
        } catch (e) {
            throw new Error('Frame extraction failed');
        }
    },

    // Extract speaker from video using Whisper
    async extractSpeaker(audioFile, language = 'en') {
        try {
            const formData = new FormData();
            formData.append('audio', audioFile);
            formData.append('language', language);

            const response = await fetch(`${this.backendUrl}/clipper/extract-speaker`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Speaker extraction failed');
            }

            const data = await response.json();
            return data;
        } catch (e) {
            throw new Error('Speaker extraction failed');
        }
    },

    // Generate subtitles from video audio
    async generateSubtitles(videoId, language = 'en') {
        try {
            const response = await fetch(`${this.backendUrl}/clipper/subtitles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ videoId, language })
            });

            if (!response.ok) {
                throw new Error('Subtitle generation failed');
            }

            const data = await response.json();
            return data;
        } catch (e) {
            throw new Error('Subtitle generation failed');
        }
    },

    // Split long video into vertical shorts (9:16)
    async splitToShorts(videoId) {
        try {
            const response = await fetch(`${this.backendUrl}/clipper/split-shorts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ videoId })
            });

            if (!response.ok) {
                throw new Error('Short splitting failed');
            }

            const data = await response.json();
            return data;
        } catch (e) {
            throw new Error('Short splitting failed');
        }
    },

    // Download generated clip
    async downloadClip(clipId) {
        try {
            const response = await fetch(`${this.backendUrl}/clipper/download/${clipId}`);
            if (!response.ok) {
                throw new Error('Download failed');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `SHADDAI-clip-${clipId}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            throw new Error('Download failed');
        }
    },

    // Batch process video clips
    async batchProcess(clipperParams) {
        const clips = [];
        const totalJobs = clipperParams.clips?.length || 1;

        for (let i = 0; i < totalJobs; i++) {
            const clipParams = {
                ...clipperParams,
                index: i,
                total: totalJobs
            };

            try {
                const result = await this.generateClips(clipParams);
                clips.push(result);

                // Progress callback
                if (clipperParams.onProgress) {
                    clipperParams.onProgress((i + 1) / totalJobs * 100, `Processing clip ${i + 1}/${totalJobs}`);
                }
            } catch (e) {
                console.error(`Clip ${i} failed:`, e);
            }
        }

        return clips;
    }
};

// Export for use in global scope
if (typeof window !== 'undefined') {
    window.SHD_CLIPPER = SHADDAI_CLIPPER;
}

// ══════════════════════════════════════════════════════════════════════
// USAGE EXAMPLE
// ══════════════════════════════════════════════════════════════════════
/*
// Check connection
if (await SHADDAI_CLIPPER.checkConnection()) {
    console.log('Clipper backend is available');

    // Upload video
    const uploaded = await SHADDAI_CLIPPER.uploadVideo(videoFile);

    // Generate clips
    const clips = await SHADDAI_CLIPPER.generateClips({
        startTime: 0,
        duration: 60,
        resolution: '1080p',
        autoHighlights: true
    });

    // Download clip
    await SHADDAI_CLIPPER.downloadClip(clips[0].id);
}

// Generate subtitles
const subtitles = await SHADDAI_CLIPPER.generateSubtitles(videoId, 'en');

// Split video to-vertical shorts
const shorts = await SHADDAI_CLIPPER.splitToShorts(videoId);
*/