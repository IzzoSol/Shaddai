"""
AURA — Agent Unified Routing Architecture
SHADDAI Orchestration Layer — Configuration

All settings, ports, and API keys sourced from environment variables.
Never hardcode keys in this file.
"""

import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# ── Server ────────────────────────────────────────────────────────────────────
AURA_PORT = int(os.environ.get('AURA_PORT', 8010))
AURA_HOST = '0.0.0.0'
DEBUG = os.environ.get('DEBUG', 'false').lower() == 'true'

# ── Local Free Providers ──────────────────────────────────────────────────────
OLLAMA_URL     = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
OLLAMA_MODEL   = os.environ.get('OLLAMA_MODEL', 'llama3.2:1b')
OLLAMA_TIMEOUT = 15

LMSTUDIO_URL   = os.environ.get('LMSTUDIO_URL', 'http://localhost:1234')
LMSTUDIO_MODEL = os.environ.get('LMSTUDIO_MODEL', 'local-model')

JANAI_URL      = os.environ.get('JANAI_URL', 'http://localhost:1337')
JANAI_MODEL    = os.environ.get('JANAI_MODEL', 'mistral-7b-instruct')

# ── SHADDAI Existing Infrastructure ──────────────────────────────────────────
SHADDAI_BACKEND = os.environ.get('SHADDAI_BACKEND', 'http://localhost:3000')
AGENT_PORTS = {
    'shaddai': 8000,
    'zerox':   8001,
    'oracle':  8002,
    'nexus':   8003,
    'turtle':  8004,
    'quill':   8005,
    'pikadon': 8008,
}
AGENT_TIMEOUT = int(os.environ.get('AGENT_TIMEOUT', 30))

# ── LLM Provider Fallback Chain (priority order: free first) ──────────────────
# FREE tier: ollama → lmstudio → janai → shaddai_agent → openrouter_free
# PAID tier: acedatacloud → groq → gemini → openai → anthropic → deepseek → xai
LLM_PROVIDERS = [
    # ── LOCAL FREE (no internet required) ────────────────────────────────────
    {
        'name':    'ollama',
        'url':     OLLAMA_URL,
        'cost':    'FREE',
        'key':     None,
        'model':   OLLAMA_MODEL,
        'enabled': True,
    },
    {
        'name':    'lmstudio',
        'url':     LMSTUDIO_URL + '/v1',
        'cost':    'FREE',
        'key':     'lm-studio',  # LM Studio accepts any non-empty string
        'model':   LMSTUDIO_MODEL,
        'enabled': os.environ.get('LMSTUDIO_ENABLED', 'false').lower() == 'true',
    },
    {
        'name':    'janai',
        'url':     JANAI_URL + '/v1',
        'cost':    'FREE',
        'key':     'jan-ai',
        'model':   JANAI_MODEL,
        'enabled': os.environ.get('JANAI_ENABLED', 'false').lower() == 'true',
    },
    # ── SHADDAI LOCAL AGENT (your own AI — free, always available) ───────────
    {
        'name':    'shaddai_agent',
        'url':     'http://localhost:8000',
        'cost':    'FREE',
        'key':     None,
        'model':   'shaddai:local',
        'enabled': True,
        'timeout': 20,
    },
    # ── OPENROUTER FREE TIER (cloud, many free models) ────────────────────────
    {
        'name':    'openrouter',
        'url':     'https://openrouter.ai/api/v1',
        'cost':    'FREE',
        'key':     os.environ.get('OPENROUTER_KEY'),
        'model':   os.environ.get('OPENROUTER_MODEL', 'mistralai/mistral-7b-instruct:free'),
        'enabled': bool(os.environ.get('OPENROUTER_KEY')),
    },
    # ── PAID CLOUD PROVIDERS ─────────────────────────────────────────────────
    {
        'name':    'acedatacloud',
        'url':     'https://api.acedata.cloud/v1',
        'cost':    'PAID',
        'key':     os.environ.get('ACEDATACLOUD_KEY'),
        'model':   'gpt-4o',
        'enabled': bool(os.environ.get('ACEDATACLOUD_KEY')),
    },
    {
        'name':    'groq',
        'url':     'https://api.groq.com/openai/v1',
        'cost':    'PAID',
        'key':     os.environ.get('GROQ_KEY'),
        'model':   'llama3-70b-8192',
        'enabled': bool(os.environ.get('GROQ_KEY')),
    },
    {
        'name':    'gemini',
        'url':     'https://generativelanguage.googleapis.com/v1beta',
        'cost':    'PAID',
        'key':     os.environ.get('GEMINI_KEY'),
        'model':   'gemini-1.5-flash',
        'enabled': bool(os.environ.get('GEMINI_KEY')),
    },
    {
        'name':    'openai',
        'url':     'https://api.openai.com/v1',
        'cost':    'PAID',
        'key':     os.environ.get('OPENAI_KEY'),
        'model':   'gpt-4o-mini',
        'enabled': bool(os.environ.get('OPENAI_KEY')),
    },
    {
        'name':    'anthropic',
        'url':     'https://api.anthropic.com/v1',
        'cost':    'PAID',
        'key':     os.environ.get('ANTHROPIC_KEY'),
        'model':   'claude-haiku-4-5-20251001',
        'enabled': bool(os.environ.get('ANTHROPIC_KEY')),
    },
    {
        'name':    'deepseek',
        'url':     'https://api.deepseek.com/v1',
        'cost':    'PAID',
        'key':     os.environ.get('DEEPSEEK_KEY'),
        'model':   'deepseek-chat',
        'enabled': bool(os.environ.get('DEEPSEEK_KEY')),
    },
    {
        'name':    'xai',
        'url':     'https://api.x.ai/v1',
        'cost':    'PAID',
        'key':     os.environ.get('XAI_KEY'),
        'model':   'grok-beta',
        'enabled': bool(os.environ.get('XAI_KEY')),
    },
]

# ── Cache Settings ────────────────────────────────────────────────────────────
CACHE_DB_PATH = os.environ.get(
    'CACHE_DB_PATH',
    os.path.join(os.path.dirname(__file__), 'aura_cache.db')
)
CACHE_TTL_DEFAULT  = 86400 * 7    # 7 days for stable facts
CACHE_TTL_MARKET   = int(os.environ.get('CACHE_TTL_MARKET', 3600 * 6))  # 6 hours
CACHE_TTL_SEARCH   = int(os.environ.get('CACHE_TTL_SEARCH', 3600))       # 1 hour
CACHE_TTL_AGENT    = int(os.environ.get('CACHE_TTL_AGENT', 86400 * 7))   # 7 days
CACHE_SIMILARITY_THRESHOLD = 0.65  # Lowered for more fuzzy hits

# ── Agent Routing Keywords ────────────────────────────────────────────────────
AGENT_KEYWORDS = {
    'zerox':   ['trade', 'trading', 'price', 'sol', 'token', 'wallet', 'crypto',
                'market', 'buy', 'sell', 'dex', 'chart', 'pnl', 'profit', 'portfolio'],
    'oracle':  ['research', 'esoteric', 'astrology', 'chakra', 'numerology',
                'sacred', 'spiritual', 'wisdom', 'knowledge', 'natal', 'tarot'],
    'nexus':   ['code', 'backend', 'api', 'build', 'server', 'database', 'route',
                'function', 'debug', 'python', 'javascript', 'typescript', 'fix'],
    'turtle':  ['design', 'image', 'art', 'pixel', 'sprite', 'ui', 'ux', 'visual',
                'color', 'canvas', 'music', 'creative', 'logo', 'brand'],
    'quill':   ['write', 'copy', 'docs', 'blog', 'post', 'content', 'email',
                'caption', 'tweet', 'script', 'story', 'description', 'text'],
    'pikadon': ['security', 'audit', 'protect', 'encrypt', 'scan', 'vulnerability',
                'compliance', 'risk', 'threat', 'safe', 'secure', 'firewall'],
}

# ── AceDataCloud ──────────────────────────────────────────────────────────────
ACEDATACLOUD_BASE    = 'https://api.acedata.cloud'
ACEDATACLOUD_API_KEY = os.environ.get('ACEDATACLOUD_KEY', '')
ACEDATACLOUD_TOOLS = {
    'suno_music':     '/suno/audios',
    'midjourney':     '/midjourney/imagine',
    'flux_image':     '/flux/images',
    'kling_video':    '/kling/videos',
    'luma_video':     '/luma/videos',
    'veo_video':      '/veo/videos',
    'wan_video':      '/wan/videos',
    'hailuo_video':   '/hailuo/videos',
    'seedance':       '/seedance/videos',
    'fish_audio':     '/fish-speech/audios',
    'producer_music': '/producer/tracks',
    'face_transform': '/face/transform',
    'seedream_image': '/seedream/images',
    'google_search':  '/google/search',
    'short_url':      '/tools/shorten',
}

# ── Solana Pay ────────────────────────────────────────────────────────────────
SOLANA_MERCHANT_WALLET = os.environ.get('SHADDAI_MERCHANT_WALLET', '')
SOLANA_RPC = os.environ.get('SOLANA_RPC', 'https://api.mainnet-beta.solana.com')
