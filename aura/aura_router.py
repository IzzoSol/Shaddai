"""
AURA Router — Token-saving decision engine.
Implements AINL primitive L (LOGIC): decides HOW to answer before spending tokens.

Decision order (fastest/cheapest first):
  1. FETCH   — exact cache hit → free, instant
  2. QUERY   — similar cached result → free, instant
  3. COMPUTE — deterministic local processing → free, instant
  4. LLM     — Ollama first (free), then paid providers

This file never makes LLM calls itself — it only decides WHICH method to use.
"""

import re
import time
from typing import Dict, Any, Tuple
import aura_cache as cache
from aura_config import AGENT_KEYWORDS


# ── C: COMPUTE patterns — tasks solvable without any AI ──────────────────────

_COMPUTE_PATTERNS = [
    (r'\b(\d[\d,.]*)\s*[\+\-\*\/]\s*(\d[\d,.]*)\b', 'math'),
    (r'\bwhat(?:\'s| is) \d+\s*[\+\-\*\/x]\s*\d+', 'math'),
    (r'\bconvert\s+\d+\s+\w+\s+to\s+\w+', 'conversion'),
    (r'\b(?:today|current date|what day|what time)', 'datetime'),
    (r'\bcount\s+(?:the\s+)?\w+\s+in\b', 'count'),
    (r'\b(?:upper|lowercase|capitalize)\s+\w+', 'text_transform'),
    (r'\b(?:format|pretty[\- ]?print)\s+(?:this\s+)?(?:json|xml|csv)', 'format'),
    (r'\bword count\b|\bcount words\b', 'count'),
    (r'\bpercentage\b|\bpercent\b.*\bof\b', 'math'),
    (r'\b(?:sort|order|rank)\s+(?:these|the)\s+\w+', 'sort'),
]

_MARKET_KEYWORDS = ['price', 'chart', 'sol', 'btc', 'eth', 'token', 'market cap',
                    'volume', 'dex', 'swap', 'liquidity', 'whale', 'trending coin']

_CREATIVE_KEYWORDS = ['write a', 'create a', 'generate', 'draft', 'compose',
                      'imagine', 'story', 'poem', 'song', 'design', 'make a']


def _is_compute(task: str) -> Tuple[bool, str]:
    """Return (True, reason) if the task can be solved locally without LLM."""
    t = task.lower()
    for pattern, label in _COMPUTE_PATTERNS:
        if re.search(pattern, t, re.IGNORECASE):
            return True, label
    return False, ''


def _classify_complexity(task: str) -> float:
    """
    Return a complexity score 0.0–1.0.
    Low = simple lookup/transform. High = creative/analytical reasoning.
    """
    t = task.lower()
    score = 0.5  # baseline

    # Signals of HIGH complexity (needs real LLM)
    if any(k in t for k in _CREATIVE_KEYWORDS):
        score += 0.25
    if len(task.split()) > 30:
        score += 0.15
    if '?' in task and len(task.split()) > 15:
        score += 0.10
    if any(w in t for w in ['analyze', 'explain', 'compare', 'why', 'how does', 'strategy']):
        score += 0.15

    # Signals of LOW complexity (simpler, cacheable)
    if any(k in t for k in _MARKET_KEYWORDS):
        score -= 0.15  # often just a data fetch
    if len(task.split()) < 8:
        score -= 0.20
    if task.endswith('?') and len(task.split()) < 6:
        score -= 0.20

    return max(0.0, min(1.0, score))


def best_agent(task: str) -> str:
    """Match task text to the best SHADDAI agent by keyword scoring."""
    t = task.lower()
    scores = {agent: 0 for agent in AGENT_KEYWORDS}
    for agent, keywords in AGENT_KEYWORDS.items():
        for kw in keywords:
            if kw in t:
                scores[agent] += 1
    best = max(scores, key=lambda a: scores[a])
    return best if scores[best] > 0 else 'shaddai'


# ── L: LOGIC — the main routing decision ────────────────────────────────────

def route(task: str, context: Dict = None) -> Dict[str, Any]:
    """
    L LOGIC — decide how to handle this task.

    Returns a routing decision dict:
    {
        method:          'cache' | 'similar' | 'compute' | 'llm_local' | 'llm_cloud',
        reason:          human-readable explanation,
        complexity:      0.0–1.0,
        best_agent:      which SHADDAI agent to use if routing to agent,
        cached_result:   the result if method is 'cache' or 'similar',
        compute_type:    what kind of local computation if method is 'compute',
        estimated_cost:  'free' | 'minimal' | 'standard',
    }
    """
    cache.record_request()

    decision = {
        'method':        'llm_cloud',
        'reason':        'No shortcut found, using LLM',
        'complexity':    _classify_complexity(task),
        'best_agent':    best_agent(task),
        'cached_result': None,
        'compute_type':  None,
        'estimated_cost': 'standard',
    }

    # ── Step 1: Exact cache hit ────────────────────────────────────────────
    cached = cache.find(task)
    if cached is not None:
        decision.update({
            'method':         'cache',
            'reason':         'Exact match found in cache — zero tokens spent',
            'cached_result':  cached,
            'estimated_cost': 'free',
        })
        return decision

    # ── Step 2: Similar result in memory ──────────────────────────────────
    similar = cache.search(task, top_k=1)
    if similar:
        best_match = similar[0]
        decision.update({
            'method':         'similar',
            'reason':         f'Similar task found in memory (score {best_match["score"]})',
            'cached_result':  best_match['response'],
            'estimated_cost': 'free',
        })
        return decision

    # ── Step 3: Deterministic compute ─────────────────────────────────────
    is_compute, compute_type = _is_compute(task)
    if is_compute:
        decision.update({
            'method':         'compute',
            'reason':         f'Local computation: {compute_type} — no LLM needed',
            'compute_type':   compute_type,
            'estimated_cost': 'free',
        })
        return decision

    # ── Step 4: LLM — prefer local (Ollama) over cloud ───────────────────
    if decision['complexity'] < 0.75:
        decision.update({
            'method':         'llm_local',
            'reason':         'Moderate complexity — try Ollama first (free)',
            'estimated_cost': 'free',
        })
    else:
        decision.update({
            'method':         'llm_cloud',
            'reason':         'High complexity — Ollama first, cloud fallback',
            'estimated_cost': 'minimal',
        })

    return decision
