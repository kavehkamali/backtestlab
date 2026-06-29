"""Equilima data warehouse — DuckDB store of free/legal market & gov data.

See docs/DATA_PLATFORM.md. Importable for both reading (web app/agent) and
collecting (CLI scripts run by systemd timers on Neo).
"""

from .db import connect, init_schema, warehouse_path  # noqa: F401
