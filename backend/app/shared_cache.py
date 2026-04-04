from __future__ import annotations
"""
Shared server-side cache for expensive computations.
Pre-computes screener results, dashboard data, and research for popular stocks.
All users share the same cache — dramatically faster load times.
"""

import json
import time
import threading
from pathlib import Path
from datetime import datetime

CACHE_DIR = Path.home() / ".equilima_data" / "shared_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# TTLs
SCREENER_TTL = 15 * 60      # 15 min — screener results
DASHBOARD_TTL = 10 * 60     # 10 min — market overview
RESEARCH_TTL = 30 * 60      # 30 min — per-stock research
CRYPTO_TTL = 10 * 60        # 10 min

_locks = {}


def _get_lock(key):
    if key not in _locks:
        _locks[key] = threading.Lock()
    return _locks[key]


def get_cached(key, ttl):
    """Get cached JSON data if fresh enough."""
    path = CACHE_DIR / f"{key}.json"
    if path.exists():
        age = time.time() - path.stat().st_mtime
        if age < ttl:
            try:
                with open(path) as f:
                    return json.load(f)
            except Exception:
                pass
    return None


def set_cached(key, data):
    """Save data to shared cache."""
    path = CACHE_DIR / f"{key}.json"
    try:
        with open(path, "w") as f:
            json.dump(data, f)
    except Exception as e:
        print(f"[shared_cache] Failed to write {key}: {e}")


def get_or_compute(key, ttl, compute_fn):
    """Get from cache or compute and cache. Thread-safe."""
    cached = get_cached(key, ttl)
    if cached is not None:
        return cached

    lock = _get_lock(key)
    if not lock.acquire(blocking=False):
        # Another thread is computing — return stale data if available
        stale = get_cached(key, ttl * 10)  # accept 10x stale
        if stale:
            return stale
        lock.acquire()  # wait for the other thread

    try:
        # Double-check after acquiring lock
        cached = get_cached(key, ttl)
        if cached is not None:
            return cached

        start = time.time()
        data = compute_fn()
        elapsed = time.time() - start
        set_cached(key, data)
        print(f"[shared_cache] Computed {key} in {elapsed:.1f}s")
        return data
    finally:
        lock.release()


def invalidate(key):
    """Remove a cached entry."""
    path = CACHE_DIR / f"{key}.json"
    path.unlink(missing_ok=True)


def cache_stats():
    """Get cache file info for admin."""
    stats = []
    for path in CACHE_DIR.glob("*.json"):
        age = time.time() - path.stat().st_mtime
        size = path.stat().st_size
        stats.append({
            "key": path.stem,
            "size_kb": round(size / 1024, 1),
            "age_min": round(age / 60, 1),
        })
    return sorted(stats, key=lambda x: x["age_min"])
