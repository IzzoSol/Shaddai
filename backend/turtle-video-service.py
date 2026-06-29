"""
TURTLE Video Generation Service
Extracts core Pixelle-Video modules for SHADDAI integration
Provides Python API for creating videos from topics/scripts
"""

import json
import asyncio
from typing import Optional, Dict, List, Any
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import subprocess
import os

# Core Pixelle modules (extracted from Pixelle-Video)
class ScriptGenerator:
    """Generate video scripts from topics using LLM"""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    def generate_title(self, topic: str) -> str:
        """Generate catchy video title from topic"""
        if self.llm_client:
            prompt = f"Create a catchy 5-8 word video title about: {topic}"
            return self.llm_client.generate(prompt).strip()
        return f"Video: {topic}"

    def generate_narration(self, topic: str, duration: int = 60) -> str:
        """Generate video narration script from topic"""
        if self.llm_client:
            word_count = int(duration * 2.5)  # ~2.5 words per second
            prompt = f"""
Create a {word_count}-word video narration script about: {topic}

Requirements:
- Engaging and clear
- Suitable for short video format
- Include interesting facts or insights
- Keep sentences short and punchy
- Add natural pauses where music/visuals will play
"""
            return self.llm_client.generate(prompt).strip()

        # Fallback template
        return f"Today we explore {topic}. This fascinating subject has many dimensions. "

    def split_script(self, script: str, num_frames: int = 10) -> List[str]:
        """Split script into frames for image planning"""
        sentences = [s.strip() for s in script.split('.') if s.strip()]

        if len(sentences) <= num_frames:
            return sentences

        # Group sentences into frames
        frame_size = len(sentences) // num_frames
        frames = []
        for i in range(0, len(sentences), frame_size):
            frame = '. '.join(sentences[i:i+frame_size])
            if frame:
                frames.append(frame)

        return frames[:num_frames]


class ImagePlanner:
    """Plan images/visuals for each frame of the script"""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    def generate_prompts(self, frames: List[str], style: str = "cinematic") -> List[str]:
        """Generate image generation prompts for each frame"""
        prompts = []

        for frame in frames:
            if self.llm_client:
                prompt = f"""
Create an image generation prompt for this video narration:
"{frame}"

Requirements:
- Detailed visual description
- Include style: {style}
- 15-25 words max
- Suitable for DALL-E/Midjourney/Stable Diffusion
- Return ONLY the prompt, no explanation
"""
                img_prompt = self.llm_client.generate(prompt).strip()
            else:
                # Fallback: extract key words
                img_prompt = f"{frame[:30]}... in {style} style"

            prompts.append(img_prompt)

        return prompts


class TTSGenerator:
    """Text-to-speech narration generation"""

    def __init__(self, provider: str = "edge-tts"):
        self.provider = provider

    def generate_audio(self, text: str, lang: str = "en", voice: str = "female") -> str:
        """Generate TTS audio file"""
        # Placeholder - would call actual TTS service
        # For demo: just log the request
        output_path = f"temp_audio_{datetime.now().timestamp()}.mp3"

        if self.provider == "edge-tts":
            # Would call: edge-tts --text "{text}" --voice "en-US-AriaNeural" --write-media {output_path}
            pass

        return output_path


class VideoCompositor:
    """Compose final video from frames, audio, and music"""

    def create_video(self,
                    frames: List[str],  # File paths to images
                    narration: str,     # Audio file path
                    bgm: Optional[str] = None,
                    template: str = "modern",
                    resolution: str = "1280x720",
                    output_path: str = "output.mp4") -> str:
        """Compose video from components using FFmpeg"""

        # This would create FFmpeg filter_complex to:
        # 1. Time each image to narration length
        # 2. Add BGM at lower volume
        # 3. Apply template/transitions
        # 4. Output final MP4

        # Placeholder command
        # ffmpeg -f image2 -i frame_%d.png -i narration.mp3 -c:v libx264 output.mp4

        return output_path


@dataclass
class VideoGenerationRequest:
    """Video generation request"""
    topic: str
    script: Optional[str] = None
    duration: int = 60
    template: str = "modern"
    style: str = "cinematic"
    language: str = "en"
    num_frames: int = 10
    voice_gender: str = "female"


@dataclass
class VideoGenerationResult:
    """Result of video generation"""
    video_id: str
    status: str  # "generating", "success", "error"
    progress: float  # 0.0 to 1.0
    output_path: Optional[str] = None
    error: Optional[str] = None
    created_at: str = None

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now().isoformat()


class TURTLEVideoService:
    """Main video generation service for TURTLE"""

    def __init__(self, llm_client=None, output_dir: str = "./generated-output"):
        self.llm_client = llm_client
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.script_gen = ScriptGenerator(llm_client)
        self.image_planner = ImagePlanner(llm_client)
        self.tts_gen = TTSGenerator()
        self.compositor = VideoCompositor()

        # Track ongoing jobs
        self.jobs: Dict[str, VideoGenerationResult] = {}

    async def generate_video(self, request: VideoGenerationRequest) -> VideoGenerationResult:
        """Main entry point for video generation"""

        import uuid
        video_id = f"vid-{uuid.uuid4().hex[:8]}"
        result = VideoGenerationResult(
            video_id=video_id,
            status="generating",
            progress=0.0
        )
        self.jobs[video_id] = result

        try:
            # Phase 1: Script Generation (0-20%)
            if request.script:
                script = request.script
            else:
                script = self.script_gen.generate_narration(
                    request.topic,
                    request.duration
                )
            result.progress = 0.2

            # Phase 2: Frame Planning (20-40%)
            frames = self.script_gen.split_script(script, request.num_frames)
            result.progress = 0.4

            # Phase 3: Image Planning (40-60%)
            image_prompts = self.image_planner.generate_prompts(
                frames,
                style=request.style
            )
            result.progress = 0.6

            # Phase 4: TTS Generation (60-80%)
            narration_path = self.tts_gen.generate_audio(
                script,
                lang=request.language,
                voice=request.voice_gender
            )
            result.progress = 0.8

            # Phase 5: Video Composition (80-100%)
            output_file = self.output_dir / f"{video_id}.mp4"
            # In real implementation: fetch images, compose video
            # For now: create placeholder
            output_file.touch()

            result.output_path = str(output_file)
            result.status = "success"
            result.progress = 1.0

        except Exception as e:
            result.status = "error"
            result.error = str(e)

        return result

    def get_job_status(self, video_id: str) -> Optional[VideoGenerationResult]:
        """Get status of a video generation job"""
        return self.jobs.get(video_id)

    def cancel_job(self, video_id: str) -> bool:
        """Cancel a video generation job"""
        if video_id in self.jobs:
            self.jobs[video_id].status = "cancelled"
            return True
        return False


# HTTP API wrapper (for Node.js Express to call)
class VideoServiceAPI:
    """REST API wrapper around TURTLEVideoService"""

    def __init__(self, service: TURTLEVideoService):
        self.service = service

    def handle_generate_request(self, request_json: Dict[str, Any]) -> Dict[str, Any]:
        """Handle video generation request from Node.js API"""

        req = VideoGenerationRequest(
            topic=request_json.get("topic"),
            script=request_json.get("script"),
            duration=request_json.get("duration", 60),
            template=request_json.get("template", "modern"),
            style=request_json.get("style", "cinematic"),
            language=request_json.get("language", "en"),
            num_frames=request_json.get("numFrames", 10),
            voice_gender=request_json.get("voiceGender", "female")
        )

        # Run async in event loop
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(self.service.generate_video(req))
        finally:
            loop.close()

        return {
            "videoId": result.video_id,
            "status": result.status,
            "progress": result.progress,
            "outputPath": result.output_path,
            "error": result.error,
            "createdAt": result.created_at
        }

    def handle_status_request(self, video_id: str) -> Dict[str, Any]:
        """Get video generation status"""
        result = self.service.get_job_status(video_id)

        if not result:
            return {"error": f"Video {video_id} not found"}

        return {
            "videoId": result.video_id,
            "status": result.status,
            "progress": result.progress,
            "outputPath": result.output_path,
            "error": result.error
        }


# Standalone test
if __name__ == "__main__":
    import asyncio

    service = TURTLEVideoService()

    request = VideoGenerationRequest(
        topic="The Future of AI in 2026",
        duration=60,
        num_frames=10
    )

    result = asyncio.run(service.generate_video(request))
    print(json.dumps({
        "videoId": result.video_id,
        "status": result.status,
        "progress": result.progress,
        "outputPath": result.output_path
    }, indent=2))
