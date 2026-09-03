#!/usr/bin/env python3
"""
AURA Cache Pre-warmer
Populates cache with common queries at startup for instant responses.
Run manually or add to startup script.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import aura_cache as cache
from aura_config import CACHE_TTL_AGENT

# Common queries that users frequently ask
COMMON_QUERIES = [
    # General SHADDAI info
    ("What is SHADDAI?", "SHADDAI is a sovereign AI agent empire with 7 specialized agents (SHADDAI, ZEROX, ORACLE, NEXUS, TURTLE, QUILL, PIKADON) and 200+ real tools. Each agent has skills, a wallet, and MCP integration."),
    ("Who are the 7 agents?", "The 7 SHADDAI agents: SHADDAI (orchestrator), ZEROX (markets/pricing), ORACLE (research), NEXUS (backend/APIs), TURTLE (design/creative), QUILL (writing/docs), PIKADON (security/audits)."),
    ("How do I use SHADDAI?", "Access via the dashboard at localhost:3000 or through the AURA API on port 8010. Use /aura/task endpoint with {task, agent, prefer_free}."),
    
    # ZEROX - Markets/Trading
    ("What's the price of SOL?", "SOL price data comes from Jupiter Price API. Check /pro-signals.html for live ZEROX calls with scored, timestamped signals."),
    ("How do I trade on SHADDAI?", "Use ZEROX agent for market signals. Connect your wallet via the Connect page. Sparks = $1 fixed for agent payments."),
    
    # NEXUS - Backend/Code
    ("How do I build an API?", "NEXUS handles backend APIs. Use /agent-forge.html to create custom agents. The tool registry at /tools manages 200+ integrations."),
    ("What's the tech stack?", "SHADDAI uses Node.js/Express backend, vanilla JS frontend (single HTML), SQLite for cache, Flask for AURA, Docker for clipper."),
    
    # ORACLE - Research
    ("How does the RAG brain work?", "The RAG brain at /brain.html cites every answer to exact source passages. 7 KB mastery folders in backend/knowledge/mastery/{AGENT}/ with [Source n] citations."),
    
    # TURTLE - Design
    ("How do I generate images?", "Use TURTLE agent or Media Studio (🎛️) with Flux, Midjourney, Leonardo, or Pollinations (free)."),
    
    # QUILL - Writing
    ("Help me write documentation", "QUILL agent handles all writing: docs, blogs, emails, captions, scripts. Access via /agents.html#quill or Media Studio."),
    
    # PIKADON - Security
    ("How do I audit my code?", "PIKADON agent does security audits, vulnerability scans, compliance checks. Route tasks with security keywords to PIKADON."),
    
    # AURA System
    ("What is AURA?", "AURA (Agent Unified Routing Architecture) on port 8010 intelligently routes tasks to the best agent, uses cache-first strategy, and tracks token savings."),
    ("How does caching work?", "AURA uses SQLite cache with 3 primitives: STORE (save), FETCH (find), QUERY (semantic search). Cache hits save ~150 tokens each."),
]

# Agent-specific common queries
AGENT_QUERIES = {
    'zerox': [
        ("SOL price prediction", "ZEROX analyzes SOL via Jupiter API + DexScreener. Signals scored by hit rate, not vibes."),
        ("Best meme coins to buy", "ZEROX tracks 10 Solana memecoins via DexScreener. Check /pro-signals.html for ranked signals."),
    ],
    'oracle': [
        ("Numerology reading", "ORACLE provides numerology, astrology, tarot, chakra analysis. Sacred wisdom agent."),
    ],
    'nexus': [
        ("Debug Python error", "NEXUS handles backend debugging, API design, database schema, server architecture."),
    ],
    'turtle': [
        ("Design a logo", "TURTLE creates logos, UI/UX, game assets, music, video. Use Flux/Midjourney via Media Studio."),
    ],
    'quill': [
        ("Write a blog post", "QUILL writes blogs, docs, emails, scripts, captions. Every word a person reads."),
    ],
    'pikadon': [
        ("Security audit my contract", "PIKADON audits smart contracts, scans vulnerabilities, checks compliance."),
    ],
}

def prewarm():
    print("[AURA Prewarm] Starting cache population...")
    count = 0
    
    # General queries
    for task, response in COMMON_QUERIES:
        cache_value = {
            'response': response,
            'tokens_used': len(response) // 4,  # rough estimate
            'cost_usd': 0.0,
            'provider': 'prewarm',
            'agent': 'shaddai',
        }
        cache.save(task, cache_value, ttl=CACHE_TTL_AGENT, source='prewarm')
        cache.save_to_memory(task, response, agent='shaddai', task_type='general')
        count += 1
    
    # Agent-specific queries
    for agent, queries in AGENT_QUERIES.items():
        for task, response in queries:
            cache_value = {
                'response': response,
                'tokens_used': len(response) // 4,
                'cost_usd': 0.0,
                'provider': 'prewarm',
                'agent': agent,
            }
            cache.save(task, cache_value, ttl=CACHE_TTL_AGENT, source='prewarm')
            cache.save_to_memory(task, response, agent=agent, task_type=agent)
            count += 1
    
    print(f"[AURA Prewarm] Completed: {count} entries cached")
    
    # Show stats
    stats = cache.stats()
    print(f"[AURA Prewarm] Cache stats: {stats}")

if __name__ == '__main__':
    prewarm()