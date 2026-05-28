"""
AURA Cache — SQLite-backed Save/Find/Search operations.
Implements 3 of the 5 AINL primitives:
  S STORE  → save()
  F FETCH  → find()
  Q QUERY  → search()
"""

import sqlite3
import json
import hashlib
import time
import math
import re
from typing import Optional, Any, List, Dict
from aura_config import CACHE_DB_PATH, CACHE_TTL_DEFAULT, CACHE_SIMILARITY_THRESHOLD


from contextlib import contextmanager

@contextmanager
def _db():
    """Open a SQLite connection, yield it, then always close it.
    WAL journal mode allows concurrent reads alongside writes."""
    conn = sqlite3.connect(CACHE_DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')  # concurrent readers + writer
    conn.execute('PRAGMA synchronous=NORMAL')
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _get_conn() -> sqlite3.Connection:
    """Legacy helper — kept for any direct callers outside context manager."""
    conn = sqlite3.connect(CACHE_DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def init_db():
    """Create tables if they don't exist."""
    with _db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS cache (
                key         TEXT PRIMARY KEY,
                value_json  TEXT NOT NULL,
                created_at  REAL NOT NULL,
                expires_at  REAL NOT NULL,
                hit_count   INTEGER DEFAULT 0,
                source      TEXT DEFAULT 'llm'
            );

            CREATE TABLE IF NOT EXISTS memory (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                content     TEXT NOT NULL,
                response    TEXT NOT NULL,
                tokens_vec  TEXT NOT NULL,
                created_at  REAL NOT NULL,
                expires_at  REAL NOT NULL,
                agent       TEXT DEFAULT '',
                task_type   TEXT DEFAULT 'general'
            );

            CREATE TABLE IF NOT EXISTS stats (
                id              INTEGER PRIMARY KEY CHECK (id = 1),
                total_requests  INTEGER DEFAULT 0,
                cache_hits      INTEGER DEFAULT 0,
                tokens_saved    INTEGER DEFAULT 0,
                cost_saved_usd  REAL DEFAULT 0.0,
                last_reset      REAL
            );

            INSERT OR IGNORE INTO stats (id, last_reset) VALUES (1, unixepoch());

            CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
            CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory(expires_at);
        """)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash(text: str) -> str:
    return hashlib.sha256(text.strip().lower().encode()).hexdigest()


def _tokenize(text: str) -> Dict[str, float]:
    """Simple TF-IDF-style word frequency vector (no GPU needed)."""
    words = re.findall(r'\b[a-z]{2,}\b', text.lower())
    if not words:
        return {}
    freq: Dict[str, float] = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    total = sum(freq.values())
    return {w: c / total for w, c in freq.items()}


def _cosine_similarity(a: Dict[str, float], b: Dict[str, float]) -> float:
    """Cosine similarity between two word-frequency dicts."""
    if not a or not b:
        return 0.0
    common = set(a) & set(b)
    if not common:
        return 0.0
    dot = sum(a[w] * b[w] for w in common)
    mag_a = math.sqrt(sum(v * v for v in a.values()))
    mag_b = math.sqrt(sum(v * v for v in b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


# ── S: STORE ─────────────────────────────────────────────────────────────────

def save(key: str, value: Any, ttl: int = CACHE_TTL_DEFAULT, source: str = 'llm') -> bool:
    """
    S STORE — persist a result so it never has to be recomputed.
    key: descriptive string (will be hashed internally)
    value: anything JSON-serialisable
    ttl: seconds until expiry
    """
    hashed = _hash(key)
    now = time.time()
    try:
        with _db() as conn:
            conn.execute("""
                INSERT INTO cache (key, value_json, created_at, expires_at, source)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value_json = excluded.value_json,
                    created_at = excluded.created_at,
                    expires_at = excluded.expires_at,
                    source = excluded.source
            """, (hashed, json.dumps(value), now, now + ttl, source))
        return True
    except Exception as e:
        print(f'[AURA cache] save error: {e}')
        return False


# ── F: FETCH ─────────────────────────────────────────────────────────────────

def find(key: str) -> Optional[Any]:
    """
    F FETCH — retrieve a saved result. Returns None if missing or expired.
    This is the first line of defence: if we already know the answer, never
    spend tokens asking again.
    """
    hashed = _hash(key)
    now = time.time()
    result = None
    try:
        with _db() as conn:
            row = conn.execute(
                'SELECT value_json, expires_at FROM cache WHERE key = ?', (hashed,)
            ).fetchone()
            if row and row['expires_at'] > now:
                conn.execute('UPDATE cache SET hit_count = hit_count + 1 WHERE key = ?', (hashed,))
                result = json.loads(row['value_json'])
    except Exception as e:
        print(f'[AURA cache] find error: {e}')
    if result is not None:
        _record_hit(tokens_saved=150)  # outside the DB context to avoid nested lock
    return result


# ── Q: QUERY ─────────────────────────────────────────────────────────────────

def search(query_text: str, top_k: int = 3, threshold: float = CACHE_SIMILARITY_THRESHOLD) -> List[Dict]:
    """
    Q QUERY — semantic similarity search over memory.
    Returns up to top_k results that are at least `threshold` similar.
    No GPU, no embeddings API — pure cosine similarity on word frequencies.
    """
    query_vec = _tokenize(query_text)
    now = time.time()
    results = []
    try:
        with _db() as conn:
            rows = conn.execute(
                'SELECT content, response, tokens_vec, agent, task_type FROM memory WHERE expires_at > ?',
                (now,)
            ).fetchall()
            for row in rows:
                try:
                    stored_vec = json.loads(row['tokens_vec'])
                    score = _cosine_similarity(query_vec, stored_vec)
                    if score >= threshold:
                        results.append({
                            'content':   row['content'],
                            'response':  row['response'],
                            'score':     round(score, 3),
                            'agent':     row['agent'],
                            'task_type': row['task_type'],
                        })
                except Exception:
                    continue
    except Exception as e:
        print(f'[AURA cache] search error: {e}')
    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:top_k]


def save_to_memory(content: str, response: str, ttl: int = CACHE_TTL_DEFAULT,
                   agent: str = '', task_type: str = 'general') -> bool:
    """Save a content+response pair to the similarity-searchable memory table."""
    vec = _tokenize(content)
    now = time.time()
    try:
        with _db() as conn:
            conn.execute("""
                INSERT INTO memory (content, response, tokens_vec, created_at, expires_at, agent, task_type)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (content, response, json.dumps(vec), now, now + ttl, agent, task_type))
        return True
    except Exception as e:
        print(f'[AURA cache] save_to_memory error: {e}')
        return False


# ── Housekeeping ──────────────────────────────────────────────────────────────

def flush_expired() -> int:
    """Remove expired cache and memory entries. Returns number of rows deleted."""
    now = time.time()
    deleted = 0
    try:
        with _db() as conn:
            c1 = conn.execute('DELETE FROM cache WHERE expires_at < ?', (now,))
            c2 = conn.execute('DELETE FROM memory WHERE expires_at < ?', (now,))
            deleted = c1.rowcount + c2.rowcount
    except Exception as e:
        print(f'[AURA cache] flush error: {e}')
    return deleted


def stats() -> Dict:
    """Return cache hit rate, size, and estimated savings."""
    try:
        with _db() as conn:
            s = conn.execute('SELECT * FROM stats WHERE id = 1').fetchone()
            cache_count = conn.execute('SELECT COUNT(*) as n FROM cache').fetchone()['n']
            memory_count = conn.execute('SELECT COUNT(*) as n FROM memory').fetchone()['n']
            total = s['total_requests'] or 1
            return {
                'total_requests':  s['total_requests'],
                'cache_hits':      s['cache_hits'],
                'hit_rate_pct':    round(s['cache_hits'] / total * 100, 1),
                'tokens_saved':    s['tokens_saved'],
                'cost_saved_usd':  round(s['cost_saved_usd'], 4),
                'cache_entries':   cache_count,
                'memory_entries':  memory_count,
            }
    except Exception:
        return {}


def _record_hit(tokens_saved: int = 150, cost_usd: float = 0.0003):
    """Increment hit counter and savings estimate."""
    try:
        with _db() as conn:
            conn.execute("""
                UPDATE stats SET
                    cache_hits    = cache_hits + 1,
                    tokens_saved  = tokens_saved + ?,
                    cost_saved_usd = cost_saved_usd + ?
                WHERE id = 1
            """, (tokens_saved, cost_usd))
    except Exception:
        pass


def record_request():
    """Call once per incoming request to track total volume."""
    try:
        with _db() as conn:
            conn.execute('UPDATE stats SET total_requests = total_requests + 1 WHERE id = 1')
    except Exception:
        pass


# ── Init on import ────────────────────────────────────────────────────────────
init_db()
