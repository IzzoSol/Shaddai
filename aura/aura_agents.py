"""
AURA Agent Bridge — Routes tasks to SHADDAI's 7 existing agents.
Adds a caching layer on top so repeated tasks never re-hit the agent.
"""

import requests
import time
from typing import Dict, Any, Optional, List
import aura_cache as cache
from aura_config import AGENT_PORTS, AGENT_TIMEOUT, CACHE_TTL_AGENT
from aura_router import best_agent


def call_agent(agent_name: str, task: str, context: str = '', timeout: int = None) -> Dict[str, Any]:
    """
    Send a task to a specific SHADDAI agent.
    Checks cache first — if the same task was answered in the last hour, returns cached.
    """
    agent_name = agent_name.lower()
    port = AGENT_PORTS.get(agent_name)
    if not port:
        return {'error': f'Unknown agent: {agent_name}', 'available': list(AGENT_PORTS.keys())}

    cache_key = f'agent:{agent_name}:{task}'
    cached = cache.find(cache_key)
    if cached:
        cached['_cached'] = True
        cached['_agent'] = agent_name
        return cached

    url = f'http://localhost:{port}/chat'
    start = time.time()
    try:
        resp = requests.post(
            url,
            json={'message': task, 'context': context},
            timeout=timeout or AGENT_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        result = {
            'response':   data.get('response') or data.get('message', {}).get('content', ''),
            'agent':      agent_name,
            'port':       port,
            'latency_ms': int((time.time() - start) * 1000),
            '_cached':    False,
        }
        # Save so next identical task is free
        cache.save(cache_key, result, ttl=CACHE_TTL_AGENT, source='agent')
        cache.save_to_memory(task, result['response'], ttl=CACHE_TTL_AGENT,
                             agent=agent_name, task_type='agent_response')
        return result

    except requests.exceptions.ConnectionError:
        return {'error': f'{agent_name.upper()} is offline (port {port})', 'agent': agent_name}
    except requests.exceptions.Timeout:
        return {'error': f'{agent_name.upper()} timed out after {AGENT_TIMEOUT}s', 'agent': agent_name}
    except Exception as e:
        return {'error': str(e), 'agent': agent_name}


def route_to_best(task: str) -> Dict[str, Any]:
    """
    Automatically pick the best agent for this task and call it.
    Falls back to SHADDAI if best agent is offline.
    """
    agent_name = best_agent(task)
    result = call_agent(agent_name, task)

    # If best agent is offline, fall back to SHADDAI
    if 'error' in result and 'offline' in result.get('error', ''):
        if agent_name != 'shaddai':
            result = call_agent('shaddai', task)

    return result


def broadcast(task: str) -> Dict[str, Any]:
    """Send the same task to all 7 agents and collect all responses."""
    results = {}
    for agent_name in AGENT_PORTS:
        results[agent_name] = call_agent(agent_name, task)
    return {
        'task':     task,
        'results':  results,
        'online':   [a for a, r in results.items() if 'error' not in r],
        'offline':  [a for a, r in results.items() if 'error' in r],
    }


def health() -> Dict[str, Any]:
    """Ping all 7 agents and return their online/offline status."""
    status = {}
    for agent_name, port in AGENT_PORTS.items():
        try:
            resp = requests.get(
                f'http://localhost:{port}/health',
                timeout=3,
            )
            status[agent_name] = {
                'online':  resp.ok,
                'port':    port,
                'latency': resp.elapsed.microseconds // 1000,
            }
        except Exception:
            status[agent_name] = {'online': False, 'port': port, 'latency': None}
    online_count = sum(1 for v in status.values() if v['online'])
    return {
        'agents':       status,
        'online_count': online_count,
        'total':        len(AGENT_PORTS),
        'all_online':   online_count == len(AGENT_PORTS),
    }
