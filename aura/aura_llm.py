"""
AURA LLM Manager — Full 8-provider fallback chain.
Tries providers in order until one succeeds. Always starts with Ollama (free).
"""

import requests
import json
import time
from typing import List, Dict, Optional, Any
from aura_config import LLM_PROVIDERS, OLLAMA_URL, OLLAMA_MODEL, OLLAMA_TIMEOUT


class LLMResult:
    def __init__(self, response: str, provider: str, model: str,
                 tokens_used: int = 0, cost_usd: float = 0.0, latency_ms: int = 0):
        self.response    = response
        self.provider    = provider
        self.model       = model
        self.tokens_used = tokens_used
        self.cost_usd    = cost_usd
        self.latency_ms  = latency_ms

    def to_dict(self) -> Dict:
        return {
            'response':    self.response,
            'provider':    self.provider,
            'model':       self.model,
            'tokens_used': self.tokens_used,
            'cost_usd':    self.cost_usd,
            'latency_ms':  self.latency_ms,
        }


class LLMManager:

    def chat(self, messages: List[Dict], prefer_free: bool = True,
             system: str = None, max_tokens: int = 1024) -> LLMResult:
        """
        Send messages to the best available provider.
        Tries in order: ollama → acedatacloud → groq → gemini → openai → anthropic → deepseek → xai
        """
        if system:
            messages = [{'role': 'system', 'content': system}] + messages

        providers = LLM_PROVIDERS
        if not prefer_free:
            # Move ollama to end when caller wants best quality
            providers = [p for p in providers if p['name'] != 'ollama'] + \
                        [p for p in providers if p['name'] == 'ollama']

        last_error = None
        for provider in providers:
            if not provider['enabled']:
                continue
            try:
                result = self._call_provider(provider, messages, max_tokens)
                if result:
                    return result
            except Exception as e:
                last_error = e
                print(f'[AURA LLM] {provider["name"]} failed: {e}')
                continue

        raise RuntimeError(f'All LLM providers failed. Last error: {last_error}')

    def _call_provider(self, provider: Dict, messages: List[Dict], max_tokens: int) -> Optional[LLMResult]:
        name = provider['name']
        start = time.time()

        if name == 'ollama':
            return self._ollama(messages, provider, max_tokens, start)
        elif name == 'shaddai_agent':
            return self._shaddai_agent(messages, provider, max_tokens, start)
        elif name == 'anthropic':
            return self._anthropic(messages, provider, max_tokens, start)
        elif name == 'gemini':
            return self._gemini(messages, provider, max_tokens, start)
        else:
            # OpenAI-compatible: lmstudio, janai, openrouter, acedatacloud, groq, openai, deepseek, xai
            return self._openai_compat(messages, provider, max_tokens, start)

    # ── SHADDAI Local Agent (port 8000 — free, always-available fallback) ─────

    def _shaddai_agent(self, messages, provider, max_tokens, start) -> Optional[LLMResult]:
        """Use SHADDAI agent running on port 8000 as a local LLM fallback."""
        from aura_config import AGENT_PORTS
        port = AGENT_PORTS.get('shaddai', 8000)
        task = next((m['content'] for m in reversed(messages) if m['role'] == 'user'), '')
        if not task:
            return None
        resp = requests.post(
            f'http://localhost:{port}/chat',
            json={'message': task},
            timeout=provider.get('timeout', 20),
        )
        resp.raise_for_status()
        data = resp.json()
        content = data.get('response') or data.get('message', {}).get('content', '')
        if not content:
            return None
        return LLMResult(
            response=content,
            provider='shaddai_agent',
            model='shaddai:local',
            tokens_used=0,
            cost_usd=0.0,
            latency_ms=int((time.time() - start) * 1000),
        )

    # ── Ollama (local, free) ──────────────────────────────────────────────────

    def _ollama(self, messages, provider, max_tokens, start) -> Optional[LLMResult]:
        payload = {
            'model':    provider['model'],
            'messages': messages,
            'stream':   False,
            'options':  {'num_predict': max_tokens},
        }
        resp = requests.post(
            f'{OLLAMA_URL}/api/chat',
            json=payload,
            timeout=OLLAMA_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data.get('message', {}).get('content', '')
        if not content:
            return None
        return LLMResult(
            response=content,
            provider='ollama',
            model=provider['model'],
            tokens_used=data.get('eval_count', 0),
            cost_usd=0.0,
            latency_ms=int((time.time() - start) * 1000),
        )

    # ── OpenAI-compatible (acedatacloud, groq, openai, deepseek, xai) ────────

    def _openai_compat(self, messages, provider, max_tokens, start) -> Optional[LLMResult]:
        headers = {
            'Authorization': f'Bearer {provider["key"]}',
            'Content-Type':  'application/json',
        }
        payload = {
            'model':      provider['model'],
            'messages':   messages,
            'max_tokens': max_tokens,
        }
        resp = requests.post(
            f'{provider["url"]}/chat/completions',
            headers=headers,
            json=payload,
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data['choices'][0]['message']['content']
        usage = data.get('usage', {})
        tokens = usage.get('total_tokens', 0)
        # Rough cost estimates per 1K tokens
        cost_per_1k = {'acedatacloud': 0.002, 'groq': 0.0001, 'openai': 0.003,
                       'deepseek': 0.0008, 'xai': 0.005}.get(provider['name'], 0.002)
        return LLMResult(
            response=content,
            provider=provider['name'],
            model=provider['model'],
            tokens_used=tokens,
            cost_usd=round(tokens / 1000 * cost_per_1k, 6),
            latency_ms=int((time.time() - start) * 1000),
        )

    # ── Anthropic (different API format) ────────────────────────────────────

    def _anthropic(self, messages, provider, max_tokens, start) -> Optional[LLMResult]:
        system_msg = ''
        chat_messages = []
        for m in messages:
            if m['role'] == 'system':
                system_msg = m['content']
            else:
                chat_messages.append(m)

        headers = {
            'x-api-key':         provider['key'],
            'anthropic-version': '2023-06-01',
            'Content-Type':      'application/json',
        }
        payload = {
            'model':      provider['model'],
            'max_tokens': max_tokens,
            'messages':   chat_messages,
        }
        if system_msg:
            payload['system'] = system_msg

        resp = requests.post(
            f'{provider["url"]}/messages',
            headers=headers,
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data['content'][0]['text']
        tokens = data.get('usage', {}).get('input_tokens', 0) + \
                 data.get('usage', {}).get('output_tokens', 0)
        return LLMResult(
            response=content,
            provider='anthropic',
            model=provider['model'],
            tokens_used=tokens,
            cost_usd=round(tokens / 1000 * 0.004, 6),
            latency_ms=int((time.time() - start) * 1000),
        )

    # ── Gemini (Google format) ───────────────────────────────────────────────

    def _gemini(self, messages, provider, max_tokens, start) -> Optional[LLMResult]:
        # Convert OpenAI-style messages to Gemini format
        parts = []
        for m in messages:
            if m['role'] == 'system':
                parts.append({'role': 'user', 'parts': [{'text': '[System] ' + m['content']}]})
            elif m['role'] == 'user':
                parts.append({'role': 'user', 'parts': [{'text': m['content']}]})
            elif m['role'] == 'assistant':
                parts.append({'role': 'model', 'parts': [{'text': m['content']}]})

        url = (f'{provider["url"]}/models/{provider["model"]}:generateContent'
               f'?key={provider["key"]}')
        payload = {
            'contents':         parts,
            'generationConfig': {'maxOutputTokens': max_tokens},
        }
        resp = requests.post(url, json=payload, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        content = data['candidates'][0]['content']['parts'][0]['text']
        tokens = data.get('usageMetadata', {}).get('totalTokenCount', 0)
        return LLMResult(
            response=content,
            provider='gemini',
            model=provider['model'],
            tokens_used=tokens,
            cost_usd=round(tokens / 1000 * 0.00015, 6),
            latency_ms=int((time.time() - start) * 1000),
        )

    # ── Health checks ────────────────────────────────────────────────────────

    def ping(self, provider_name: str) -> bool:
        """Return True if provider is reachable."""
        try:
            if provider_name == 'ollama':
                r = requests.get(f'{OLLAMA_URL}/api/tags', timeout=3)
                return r.ok
            if provider_name in ('lmstudio', 'janai'):
                for p in LLM_PROVIDERS:
                    if p['name'] == provider_name:
                        r = requests.get(p['url'].rstrip('/v1') + '/v1/models', timeout=3)
                        return r.ok
            if provider_name == 'shaddai_agent':
                r = requests.get('http://localhost:8000/health', timeout=3)
                return r.ok
            for p in LLM_PROVIDERS:
                if p['name'] == provider_name and p.get('key'):
                    r = requests.head(p['url'], timeout=3)
                    return r.status_code < 500
        except Exception:
            pass
        return False

    def health_all(self) -> Dict[str, Any]:
        """Ping all providers and return status dict."""
        results = {}
        for p in LLM_PROVIDERS:
            results[p['name']] = {
                'enabled': p['enabled'],
                'cost':    p['cost'],
                'online':  self.ping(p['name']) if p['enabled'] else False,
            }
        return results


# Singleton
llm = LLMManager()
