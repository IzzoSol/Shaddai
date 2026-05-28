"""
AURA Test Suite — validates all 5 AINL primitives and the full stack.
Run: python aura_test.py
Requires: AURA server running on port 8010  (python aura_server.py)
"""

import json
import time
import sys
import requests

BASE = 'http://localhost:8010'
PASS = '✅'
FAIL = '❌'
SKIP = '⏭ '

results = []


def check(name: str, ok: bool, detail: str = ''):
    icon = PASS if ok else FAIL
    msg = f'  {icon} {name}'
    if detail:
        msg += f'  ({detail})'
    print(msg)
    results.append((name, ok))
    return ok


def post(path, body):
    try:
        r = requests.post(BASE + path, json=body, timeout=15)
        return r.json(), r.status_code
    except Exception as e:
        return {'error': str(e)}, 0


def get(path):
    try:
        r = requests.get(BASE + path, timeout=10)
        return r.json(), r.status_code
    except Exception as e:
        return {'error': str(e)}, 0


# ── 0. Server reachable ───────────────────────────────────────────────────────

print('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
print('  AURA Test Suite — AINL Primitives  ')
print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

data, code = get('/aura/ping')
if not check('Server reachable', code == 200, f'status={code}'):
    print('\n  [FATAL] AURA server is not running.')
    print('  Start it with:  python aura_server.py')
    sys.exit(1)


# ── 1. Health ────────────────────────────────────────────────────────────────

print('\n[Health]')
data, code = get('/aura/health')
check('Health endpoint', code == 200)
check('Health has agents key', 'agents' in data)
check('Health has providers key', 'providers' in data)


# ── 2. S — STORE (cache write) ───────────────────────────────────────────────

print('\n[S — STORE]')
data, code = post('/aura/memory', {'op': 'store', 'key': 'test_store_key', 'value': {'response': 'hello from store'}, 'ttl': 300})
check('STORE returns ok=True', data.get('ok') is True)
check('STORE.stored is True', data.get('stored') is True)


# ── 3. F — FETCH (exact cache lookup) ────────────────────────────────────────

print('\n[F — FETCH]')
data, code = post('/aura/memory', {'op': 'find', 'key': 'test_store_key'})
check('FETCH returns ok=True', data.get('ok') is True)
check('FETCH.found is True', data.get('found') is True)
check('FETCH.result not None', data.get('result') is not None)

data, code = post('/aura/memory', {'op': 'find', 'key': 'nonexistent_key_xyz_999'})
check('FETCH miss returns found=False', data.get('found') is False)


# ── 4. Q — QUERY (similarity search) ─────────────────────────────────────────

print('\n[Q — QUERY]')
# Store a sentence we can search for later
post('/aura/memory', {'op': 'store', 'key': 'query_test_sentence',
                       'value': {'response': 'The quick brown fox jumps over the lazy dog'}, 'ttl': 300})
time.sleep(0.1)
data, code = post('/aura/memory', {'op': 'search', 'query': 'quick brown fox', 'top_k': 3})
check('QUERY returns ok=True', data.get('ok') is True)
check('QUERY.results is list', isinstance(data.get('results'), list))


# ── 5. C — COMPUTE (local math/datetime) ──────────────────────────────────────

print('\n[C — COMPUTE]')
data, code = post('/aura/task', {'task': '15 + 27'})
check('COMPUTE math: 15+27', data.get('ok') is True and 'method' in data)
if data.get('ok'):
    is_compute = data.get('method') == 'compute'
    resp = data.get('response', '')
    check('COMPUTE math returns 42', '42' in resp, f'got: {resp}')

data, code = post('/aura/task', {'task': 'what is today date'})
check('COMPUTE datetime route', data.get('ok') is True)
if data.get('ok'):
    check('COMPUTE datetime has date in response', len(data.get('response', '')) > 5)

data, code = post('/aura/task', {'task': '100 * 3'})
check('COMPUTE math: 100*3=300', '300' in data.get('response', ''))


# ── 6. L — LOGIC (routing decisions) ──────────────────────────────────────────

print('\n[L — LOGIC / Task Routing]')
data, code = post('/aura/task', {'task': 'what is 5 + 5'})
check('LOGIC routes simple math to compute', data.get('method') == 'compute')

# Cache hit test — compute task always succeeds and gets saved to cache
_cache_task = '321 + 456'
post('/aura/task', {'task': _cache_task})       # first call: compute + saves
time.sleep(0.2)
data2, _ = post('/aura/task', {'task': _cache_task})  # second call: must be cache hit
check('LOGIC cache hit on repeated task', data2.get('cached') is True or data2.get('method') in ('cache', 'similar'),
      f"method={data2.get('method')} cached={data2.get('cached')}")


# ── 7. Tools dispatcher ───────────────────────────────────────────────────────

print('\n[Tools]')
data, code = get('/aura/tools')
check('GET /aura/tools returns ok=True', data.get('ok') is True)
check('Tools list not empty', len(data.get('tools', [])) > 0)
check('generate_image in tools', 'generate_image' in data.get('tools', []))
check('web_search in tools', 'web_search' in data.get('tools', []))

data, code = post('/aura/tools/unknown_tool_xyz', {})
check('Unknown tool returns error', 'error' in data or data.get('ok') is False)


# ── 8. Agent bridge ───────────────────────────────────────────────────────────

print('\n[Agent Bridge]')
data, code = post('/aura/agents/shaddai', {'task': 'hello'})
# May fail if agent is offline — that's acceptable, just check shape
if code == 200 and data.get('ok'):
    check('SHADDAI agent responds', True, 'online')
elif data.get('ok') is False:
    check('SHADDAI agent offline (graceful error)', 'error' in data, 'offline — OK')
else:
    check('SHADDAI agent bridge endpoint', False, f'unexpected: {data}')

data, code = post('/aura/agents/invalid_agent_xyz', {'task': 'hello'})
check('Unknown agent returns error', not data.get('ok') or 'error' in data)

# broadcast endpoint shape
data, code = post('/aura/agents/broadcast', {'task': 'ping'})
check('Broadcast returns results dict', 'results' in data or data.get('ok') is True)


# ── 9. Workflow save + run ─────────────────────────────────────────────────────

print('\n[Workflows]')
wf_name = f'test_wf_{int(time.time())}'
data, code = post('/aura/workflow/save', {
    'name': wf_name,
    'steps': [
        {'task': '2 + 2', 'agent': 'auto'},
        {'task': '10 * 5', 'agent': 'auto'},
    ]
})
check('Workflow save ok', data.get('ok') is True)
check('Workflow save returns name', data.get('saved') == wf_name)

data, code = post('/aura/workflow/run', {'name': wf_name})
check('Workflow run ok', data.get('ok') is True)
check('Workflow ran 2 steps', data.get('steps_run') == 2)

data, code = post('/aura/workflow/run', {'name': 'nonexistent_workflow_xyz'})
check('Workflow not found returns error', data.get('ok') is False)


# ── 10. Cache flush ───────────────────────────────────────────────────────────

print('\n[Cache]')
data, code = post('/aura/cache/flush', {})
check('Cache flush returns ok', data.get('ok') is True)
check('Cache flush has deleted count', 'deleted' in data)

data, code = get('/aura/stats')
check('Stats endpoint returns ok', data.get('ok') is True)
check('Stats has cache key', 'cache' in data)


# ── 11. Chat endpoint ─────────────────────────────────────────────────────────

print('\n[Chat]')
data, code = post('/aura/chat', {'messages': [{'role': 'user', 'content': 'say hi'}]})
check('Chat returns ok or error (any response)', code in (200, 503))
check('Chat has response key on success', 'response' in data if code == 200 else True)

data, code = post('/aura/chat', {})
check('Chat rejects empty messages', data.get('ok') is False)


# ── Results ───────────────────────────────────────────────────────────────────

total  = len(results)
passed = sum(1 for _, ok in results if ok)
failed = total - passed

print(f'\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
print(f'  Results: {passed}/{total} passed  ({failed} failed)')
print(f'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

if failed:
    print('  Failed tests:')
    for name, ok in results:
        if not ok:
            print(f'    {FAIL} {name}')
    print()

sys.exit(0 if failed == 0 else 1)
