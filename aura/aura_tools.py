"""
AURA Tools — External API calls with automatic caching.
AceDataCloud media generation + crypto data + file system tools.
All calls check cache first. Results are saved for reuse.
"""

import requests
import json
import time
from typing import Dict, Any, Optional
import aura_cache as cache
from aura_config import (ACEDATACLOUD_BASE, ACEDATACLOUD_TOOLS, ACEDATACLOUD_API_KEY,
                          CACHE_TTL_MARKET, CACHE_TTL_SEARCH, SHADDAI_BACKEND)
from aura_config import LLM_PROVIDERS


def _ace_key() -> Optional[str]:
    if ACEDATACLOUD_API_KEY:
        return ACEDATACLOUD_API_KEY
    for p in LLM_PROVIDERS:
        if p['name'] == 'acedatacloud':
            return p.get('key')
    return None


def _ace_headers() -> Dict:
    return {
        'Authorization': f'Bearer {_ace_key()}',
        'Content-Type':  'application/json',
    }


def _call_with_cache(cache_key: str, fn, ttl: int) -> Dict:
    """Check cache → call function → save result → return."""
    cached = cache.find(cache_key)
    if cached is not None:
        cached['_cached'] = True
        return cached
    result = fn()
    result['_cached'] = False
    cache.save(cache_key, result, ttl=ttl, source='tool')
    return result


# ── AceDataCloud Media Tools ──────────────────────────────────────────────────

def generate_music(prompt: str, style: str = '', duration: int = 30) -> Dict:
    key = f'suno_music:{prompt}:{style}:{duration}'
    def _call():
        resp = requests.post(
            ACEDATACLOUD_BASE + ACEDATACLOUD_TOOLS['suno_music'],
            headers=_ace_headers(),
            json={'prompt': prompt, 'style': style, 'duration': duration},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()
    return _call_with_cache(key, _call, ttl=86400)


def generate_image(prompt: str, style: str = 'flux', width: int = 1024, height: int = 1024) -> Dict:
    tool = 'flux_image' if style == 'flux' else 'midjourney'
    key = f'{tool}:{prompt}:{width}x{height}'
    def _call():
        resp = requests.post(
            ACEDATACLOUD_BASE + ACEDATACLOUD_TOOLS[tool],
            headers=_ace_headers(),
            json={'prompt': prompt, 'width': width, 'height': height},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()
    return _call_with_cache(key, _call, ttl=86400)


def generate_video(prompt: str, provider: str = 'kling', duration: int = 5) -> Dict:
    tool_map = {
        'kling': 'kling_video', 'luma': 'luma_video', 'veo': 'veo_video',
        'wan': 'wan_video', 'hailuo': 'hailuo_video', 'sora': 'seedance',
    }
    tool = tool_map.get(provider, 'kling_video')
    key = f'{tool}:{prompt}:{duration}'
    def _call():
        resp = requests.post(
            ACEDATACLOUD_BASE + ACEDATACLOUD_TOOLS[tool],
            headers=_ace_headers(),
            json={'prompt': prompt, 'duration': duration},
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json()
    return _call_with_cache(key, _call, ttl=86400)


def generate_audio(text: str, voice: str = 'default') -> Dict:
    key = f'fish_audio:{text[:80]}:{voice}'
    def _call():
        resp = requests.post(
            ACEDATACLOUD_BASE + ACEDATACLOUD_TOOLS['fish_audio'],
            headers=_ace_headers(),
            json={'text': text, 'voice': voice},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()
    return _call_with_cache(key, _call, ttl=86400)


def web_search(query: str) -> Dict:
    key = f'google_search:{query}'
    def _call():
        resp = requests.post(
            ACEDATACLOUD_BASE + ACEDATACLOUD_TOOLS['google_search'],
            headers=_ace_headers(),
            json={'query': query, 'num': 10},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    return _call_with_cache(key, _call, ttl=CACHE_TTL_SEARCH)


def shorten_url(url: str) -> Dict:
    key = f'short_url:{url}'
    def _call():
        resp = requests.post(
            ACEDATACLOUD_BASE + ACEDATACLOUD_TOOLS['short_url'],
            headers=_ace_headers(),
            json={'url': url},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    return _call_with_cache(key, _call, ttl=86400 * 30)


# ── Crypto / Market Tools (routed through SHADDAI backend) ───────────────────

def get_token_price(symbol: str) -> Dict:
    key = f'token_price:{symbol.upper()}'
    def _call():
        resp = requests.get(
            f'{SHADDAI_BACKEND}/api/market/price',
            params={'symbol': symbol},
            timeout=8,
        )
        resp.raise_for_status()
        return resp.json()
    return _call_with_cache(key, _call, ttl=CACHE_TTL_MARKET)


def get_wallet_balance(address: str) -> Dict:
    key = f'wallet_balance:{address}'
    def _call():
        resp = requests.get(
            f'{SHADDAI_BACKEND}/api/solana/balance',
            params={'address': address},
            timeout=8,
        )
        resp.raise_for_status()
        return resp.json()
    return _call_with_cache(key, _call, ttl=120)  # 2min — wallet balances change fast


def get_market_sentiment() -> Dict:
    key = 'market_sentiment:fear_greed'
    def _call():
        resp = requests.get(
            f'{SHADDAI_BACKEND}/api/market/sentiment',
            timeout=8,
        )
        resp.raise_for_status()
        return resp.json()
    return _call_with_cache(key, _call, ttl=CACHE_TTL_MARKET)


# ── Local File Tools ──────────────────────────────────────────────────────────

def search_skills(query: str) -> Dict:
    """Search the Obsidian skills vault via SHADDAI backend."""
    key = f'skills_search:{query}'
    def _call():
        resp = requests.get(
            f'{SHADDAI_BACKEND}/api/shaddai/skills',
            params={'search': query},
            timeout=15,
        )
        resp.raise_for_status()
        d = resp.json()
        skills = d.get('skills', [])
        return {
            'skills': skills[:20],
            'total':  len(skills),
            'query':  query,
        }
    return _call_with_cache(key, _call, ttl=3600)


# ── Unified tool dispatcher ───────────────────────────────────────────────────

TOOL_MAP = {
    'generate_music':   generate_music,
    'generate_image':   generate_image,
    'generate_video':   generate_video,
    'generate_audio':   generate_audio,
    'web_search':       web_search,
    'shorten_url':      shorten_url,
    'get_token_price':  get_token_price,
    'get_wallet_balance': get_wallet_balance,
    'get_market_sentiment': get_market_sentiment,
    'search_skills':    search_skills,
}


def call_tool(tool_name: str, params: Dict) -> Dict:
    """Dispatch to the correct tool function."""
    fn = TOOL_MAP.get(tool_name)
    if not fn:
        return {'error': f'Unknown tool: {tool_name}', 'available': list(TOOL_MAP.keys())}
    try:
        return fn(**params)
    except requests.exceptions.RequestException as e:
        return {'error': f'Network error: {str(e)}', 'tool': tool_name}
    except Exception as e:
        return {'error': str(e), 'tool': tool_name}


def list_tools() -> Dict:
    return {
        'tools': list(TOOL_MAP.keys()),
        'ace_tools': list(ACEDATACLOUD_TOOLS.keys()),
        'categories': {
            'media':   ['generate_music', 'generate_image', 'generate_video', 'generate_audio'],
            'search':  ['web_search', 'shorten_url'],
            'crypto':  ['get_token_price', 'get_wallet_balance', 'get_market_sentiment'],
            'skills':  ['search_skills'],
        }
    }
