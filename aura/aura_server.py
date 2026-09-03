"""
AURA Server — Flask on port 8010.
The main entry point that wires together router, cache, LLM, tools, and agents.
"""

import math
import re
import time
import concurrent.futures
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

import aura_cache as cache
from aura_config import AURA_PORT, AURA_HOST, DEBUG, CACHE_TTL_MARKET, CACHE_TTL_AGENT
from aura_router import route, best_agent
from aura_llm import llm
from aura_tools import call_tool, list_tools
from aura_agents import call_agent, route_to_best, broadcast, health as agent_health

app = Flask(__name__)
CORS(app, origins=['http://localhost:3000', 'http://localhost:8010',
                   'http://127.0.0.1:3000', 'http://127.0.0.1:8010'])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ok(data: dict) -> tuple:
    return jsonify({'ok': True, **data}), 200


def _err(message: str, status: int = 400) -> tuple:
    return jsonify({'ok': False, 'error': message}), status


# ── C: COMPUTE — deterministic local processing ───────────────────────────────

def _local_compute(task: str, compute_type: str) -> str:
    """Handle simple tasks without touching any LLM."""
    t = task.strip()

    if compute_type == 'datetime':
        return f'Current date and time: {datetime.now().strftime("%A, %B %d %Y — %I:%M %p")}'

    if compute_type == 'math':
        # Extract and evaluate simple arithmetic safely
        expr = re.sub(r'[^0-9\+\-\*\/\.\(\)\s]', '', t)
        try:
            result = eval(expr, {'__builtins__': {}})  # no builtins = safe
            return f'Result: {result}'
        except Exception:
            return 'Could not parse arithmetic expression.'

    if compute_type == 'text_transform':
        if 'upper' in t.lower():
            words = re.findall(r'"([^"]+)"|\'([^\']+)\'|\b(\w+)\b', t)
            target = next((a or b or c for a, b, c in words if a or b or c), t)
            return target.upper()
        if 'lower' in t.lower():
            return t.lower()

    if compute_type == 'count':
        words = t.split()
        return f'Word count: {len(words)}'

    return ''


# ── Main Routes ───────────────────────────────────────────────────────────────

@app.route('/aura/task', methods=['POST'])
def handle_task():
    """
    Main AURA endpoint. Intelligently routes any task.
    Body: { task, agent='auto', prefer_free=true, context='' }
    """
    body = request.json or {}
    task = (body.get('task') or '').strip()
    if not task:
        return _err('task is required')

    prefer_free = body.get('prefer_free', True)
    context     = body.get('context', '')
    agent_hint  = body.get('agent', 'auto')

    decision = route(task)
    method   = decision['method']

    # ── Cache hit ─────────────────────────────────────────────────────────
    if method in ('cache', 'similar') and decision.get('cached_result'):
        result = decision['cached_result']
        response_text = result.get('response', str(result)) if isinstance(result, dict) else str(result)
        return _ok({
            'response':     response_text,
            'method':       method,
            'cached':       True,
            'agent':        decision['best_agent'],
            'tokens_saved': 150,
            'cost_usd':     0.0,
            'reason':       decision['reason'],
        })

    # ── Local compute ────────────────────────────────────────────────────
    if method == 'compute':
        computed = _local_compute(task, decision.get('compute_type', ''))
        if computed:
            cache.save(task, {'response': computed}, ttl=3600, source='compute')
            return _ok({
                'response':     computed,
                'method':       'compute',
                'cached':       False,
                'agent':        'local',
                'tokens_saved': 200,
                'cost_usd':     0.0,
                'reason':       decision['reason'],
            })

    # ── Route to agent or LLM ────────────────────────────────────────────
    agent_name = agent_hint if agent_hint != 'auto' else decision['best_agent']

    # ── Parallel local race: best agent + SHADDAI both get the task ───────
    # Whichever responds first (without error) wins. This makes local AI
    # feel instant — SHADDAI (port 8000) acts as a parallel Claude assistant.
    def _try_agent(name):
        return name, call_agent(name, task, context, timeout=5)

    local_agents = [agent_name]
    if agent_name != 'shaddai':
        local_agents.append('shaddai')

    winner_result = None
    winner_name   = agent_name
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)
    futures = {pool.submit(_try_agent, n): n for n in local_agents}
    try:
        for fut in concurrent.futures.as_completed(futures, timeout=6):
            try:
                name, res = fut.result()
                if 'error' not in res and not winner_result:
                    winner_result = res
                    winner_name   = name
                    break
            except Exception:
                pass
    except concurrent.futures.TimeoutError:
        pass
    finally:
        pool.shutdown(wait=False)  # don't block — let losing futures finish in background

    if winner_result:
        was_cached = winner_result.get('_cached', False)
        tokens_used = winner_result.get('tokens_used', 150)
        cost_usd = winner_result.get('cost_usd', 0.0)
        # Save under plain task key so cache.find(task) hits next time
        if not was_cached:
            cache.save(task, {
                'response':    winner_result['response'],
                'tokens_used': tokens_used,
                'cost_usd':    cost_usd,
                'agent':       winner_name,
            }, ttl=CACHE_TTL_AGENT, source=winner_name)
            cache.save_to_memory(task, winner_result['response'], agent=winner_name)
            cache.record_llm_response(tokens_used, cost_usd, winner_name)
        return _ok({
            'response':     winner_result['response'],
            'method':       f'agent:{winner_name}',
            'cached':       was_cached,
            'agent':        winner_name,
            'latency_ms':   winner_result.get('latency_ms', 0),
            'tokens_saved': tokens_used if was_cached else 0,
            'cost_usd':     cost_usd if was_cached else 0.0,
            'reason':       f'Routed to {winner_name.upper()} (parallel race winner)',
        })

    # All local agents offline — fall back to LLM chain
    try:
        system = (f'You are {agent_name.upper()}, part of the SHADDAI AI empire. '
                  f'Answer concisely and helpfully.')
        messages = [{'role': 'user', 'content': task}]
        result = llm.chat(messages, prefer_free=prefer_free, system=system)

        # Store with token/cost info for accurate savings tracking
        cache_value = {
            'response':    result.response,
            'tokens_used': result.tokens_used,
            'cost_usd':    result.cost_usd,
            'provider':    result.provider,
            'latency_ms':  result.latency_ms,
        }
        cache.save(task, cache_value, ttl=CACHE_TTL_AGENT, source=result.provider)
        cache.save_to_memory(task, result.response, agent=agent_name)
        cache.record_llm_response(result.tokens_used, result.cost_usd, result.provider)

        return _ok({
            'response':     result.response,
            'method':       f'llm:{result.provider}',
            'cached':       False,
            'agent':        agent_name,
            'provider':     result.provider,
            'tokens_used':  result.tokens_used,
            'cost_usd':     result.cost_usd,
            'latency_ms':   result.latency_ms,
            'tokens_saved': 0,
            'reason':       f'Agents offline, used {result.provider}',
        })
    except RuntimeError as e:
        return _err(f'All providers failed: {str(e)}', 503)


@app.route('/aura/chat', methods=['POST'])
def handle_chat():
    """
    Direct token-saving chat. Checks cache before hitting any LLM.
    Body: { messages: [{role, content}], prefer_free=true, system='' }
    """
    body     = request.json or {}
    messages = body.get('messages', [])
    if not messages:
        return _err('messages array is required')

    task = messages[-1].get('content', '') if messages else ''

    # Check cache on the last user message
    cached = cache.find(task)
    if cached:
        tokens_saved = cached.get('tokens_used', 150) if isinstance(cached, dict) else 150
        return _ok({
            'response': cached.get('response', str(cached)),
            'cached':   True,
            'provider': 'cache',
            'tokens_saved': tokens_saved,
        })

    try:
        result = llm.chat(
            messages,
            prefer_free=body.get('prefer_free', True),
            system=body.get('system', ''),
        )
        cache_value = {
            'response':    result.response,
            'tokens_used': result.tokens_used,
            'cost_usd':    result.cost_usd,
            'provider':    result.provider,
            'latency_ms':  result.latency_ms,
        }
        cache.save(task, cache_value, source=result.provider)
        cache.save_to_memory(task, result.response)
        cache.record_llm_response(result.tokens_used, result.cost_usd, result.provider)
        return _ok(result.to_dict())
    except RuntimeError as e:
        return _err(str(e), 503)


@app.route('/aura/tools/<tool_name>', methods=['POST'])
def handle_tool(tool_name: str):
    """Call a tool (media gen, search, crypto, etc.) with auto-caching."""
    params = request.json or {}
    result = call_tool(tool_name, params)
    if 'error' in result:
        return _err(result['error'])
    return _ok(result)


@app.route('/aura/tools', methods=['GET'])
def get_tools():
    return _ok(list_tools())


@app.route('/aura/agents/<agent_name>', methods=['POST'])
def handle_agent(agent_name: str):
    """Forward to a specific SHADDAI agent with caching."""
    body = request.json or {}
    task = (body.get('task') or body.get('message') or '').strip()
    if not task:
        return _err('task or message is required')
    result = call_agent(agent_name, task, body.get('context', ''))
    if 'error' in result:
        return _err(result['error'], 502)
    return _ok(result)


@app.route('/aura/agents/route', methods=['POST'])
def handle_agent_route():
    """Auto-select the best agent for the task."""
    body = request.json or {}
    task = (body.get('task') or '').strip()
    if not task:
        return _err('task is required')
    result = route_to_best(task)
    return (_err(result['error'], 502) if 'error' in result else _ok(result))


@app.route('/aura/agents/broadcast', methods=['POST'])
def handle_broadcast():
    """Ask all 7 agents the same question."""
    body = request.json or {}
    task = (body.get('task') or '').strip()
    if not task:
        return _err('task is required')
    return _ok(broadcast(task))


# ── Memory / Cache Routes ─────────────────────────────────────────────────────

@app.route('/aura/memory', methods=['POST'])
def handle_memory():
    """
    Raw AINL primitive operations.
    Body: { op: 'store'|'find'|'search', key?, value?, ttl?, query?, top_k? }
    """
    body = request.json or {}
    op   = body.get('op', '').lower()

    if op == 'store':
        ok = cache.save(body.get('key', ''), body.get('value'), body.get('ttl', 86400))
        return _ok({'stored': ok})

    if op == 'find':
        result = cache.find(body.get('key', ''))
        return _ok({'result': result, 'found': result is not None})

    if op == 'search':
        results = cache.search(body.get('query', ''), body.get('top_k', 5))
        return _ok({'results': results, 'count': len(results)})

    return _err(f'Unknown op: {op}. Use store, find, or search.')


@app.route('/aura/cache/flush', methods=['POST'])
def handle_flush():
    deleted = cache.flush_expired()
    return _ok({'deleted': deleted, 'message': f'Flushed {deleted} expired entries'})


# ── Status / Health ───────────────────────────────────────────────────────────

@app.route('/aura/health', methods=['GET'])
def handle_health():
    agents = agent_health()
    providers = llm.health_all()
    return _ok({
        'aura':      'online',
        'port':      AURA_PORT,
        'agents':    agents,
        'providers': providers,
        'timestamp': datetime.now().isoformat(),
    })


@app.route('/aura/stats', methods=['GET'])
def handle_stats():
    s = cache.stats()
    return _ok({
        'cache':  s,
        'uptime': 'check process manager',
    })


@app.route('/aura/ping', methods=['GET'])
def ping():
    return _ok({'message': 'AURA online', 'version': '1.0.0'})


# ── Workflow: save + replay ───────────────────────────────────────────────────

@app.route('/aura/workflow/save', methods=['POST'])
def save_workflow():
    """Save a named multi-step workflow for deterministic replay."""
    body = request.json or {}
    name  = body.get('name', '').strip()
    steps = body.get('steps', [])
    if not name or not steps:
        return _err('name and steps are required')
    cache.save(f'workflow:{name}', {'name': name, 'steps': steps}, ttl=86400 * 30)
    return _ok({'saved': name, 'steps': len(steps)})


@app.route('/aura/workflow/run', methods=['POST'])
def run_workflow():
    """Replay a saved workflow by name."""
    body = request.json or {}
    name = body.get('name', '').strip()
    if not name:
        return _err('name is required')
    wf = cache.find(f'workflow:{name}')
    if not wf:
        return _err(f'Workflow "{name}" not found')

    results = []
    context = body.get('context', '')
    for i, step in enumerate(wf['steps']):
        step_task = step.get('task', '')
        step_agent = step.get('agent', 'auto')
        if step_agent == 'auto':
            res = route_to_best(step_task)
        else:
            res = call_agent(step_agent, step_task, context)
        results.append({'step': i + 1, 'task': step_task, 'result': res})
        # Pass result as context for next step
        if 'response' in res:
            context = res['response']

    return _ok({'workflow': name, 'steps_run': len(results), 'results': results})


@app.route('/aura/workflow/list', methods=['GET'])
def list_workflows():
    """List saved workflows (stored in cache with 'workflow:' prefix)."""
    # SQLite LIKE query for workflow keys
    import sqlite3
    from aura_config import CACHE_DB_PATH
    import time
    workflows = []
    try:
        conn = sqlite3.connect(CACHE_DB_PATH, timeout=5)
        conn.execute('PRAGMA journal_mode=WAL')
        rows = conn.execute(
            'SELECT key, created_at FROM cache WHERE expires_at > ? ORDER BY created_at DESC',
            (time.time(),)
        ).fetchall()
        conn.close()
        # We can't easily filter by original key since we hash — return count only for now
        return _ok({'count': len(rows), 'note': 'Workflow keys are hashed for security'})
    except Exception as e:
        return _err(str(e))


def _prewarm_on_startup():
    """Pre-warm cache with common queries if empty."""
    try:
        stats = cache.stats()
        if stats.get('cache_entries', 0) < 10:
            print('[AURA] Cache sparse — pre-warming common queries...')
            import prewarm_cache
            prewarm_cache.prewarm()
        else:
            print(f"[AURA] Cache warm: {stats.get('cache_entries', 0)} entries, {stats.get('hit_rate_pct', 0)}% hit rate")
    except Exception as e:
        print(f'[AURA] Prewarm skipped: {e}')


if __name__ == '__main__':
    _prewarm_on_startup()
    print(f'[AURA] Starting on port {AURA_PORT}...')
    print(f'[AURA] Endpoints: /aura/task  /aura/chat  /aura/health  /aura/stats')
    app.run(host=AURA_HOST, port=AURA_PORT, debug=DEBUG, threaded=True)
