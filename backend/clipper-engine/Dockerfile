# Clipper Backend — FFmpeg + Whisper API
# Deployed to Render as a Docker service
FROM node:20-slim

# Install FFmpeg and dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install Whisper
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir openai-whisper torch torchaudio --index-url https://download.pytorch.org/whl/cpu

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy server code
COPY server.js ./

# Create uploads directory
RUN mkdir -p /app/uploads /app/output /app/temp

EXPOSE 8787

CMD ["node", "server.js"]