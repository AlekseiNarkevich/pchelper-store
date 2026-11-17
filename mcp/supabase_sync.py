"""
PCHelper MCP — синхронизация каталога из Supabase в локальную SQLite-копию.

LP8 требует подключения MCP-сервера к базе данных проекта. Вместо переписывания
доменной логики мы подтягиваем реальные таблицы Supabase в те же таблицы SQLite,
с которыми работает MCP. Таким образом инструменты MCP оперируют реальными
96 товарами и 7 готовыми сборками, а бизнес-правила остаются прежними.

Переменные окружения:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (или ANON/PUBLISHABLE/SECRET).
"""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

from db import DB_PATH, TABLE_BY_TYPE, init_db


def _key() -> str | None:
    """Возвращает ключ Supabase по тому же приоритету, что и backend."""
    for name in (
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SECRET_KEY",
        "SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_ANON_KEY",
        "SUPABASE_KEY",
    ):
        value = os.getenv(name)
        if value:
            return value
    return None


def _fetch_table(base_url: str, key: str, table: str) -> list[dict[str, Any]]:
    """Читает одну таблицу через PostgREST Supabase."""
    url = f"{base_url.rstrip('/')}/rest/v1/{quote(table)}?select=*"
    request = Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def sync_from_supabase() -> Path:
    """Синхронизирует 8 таблиц каталога из Supabase в SQLite.

    :return: путь к обновлённой SQLite-базе.
    :raises RuntimeError: если нет URL/ключа или Supabase недоступен.
    """
    base_url = os.getenv("SUPABASE_URL")
    key = _key()
    if not base_url or not key:
        raise RuntimeError(
            "Для синхронизации нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY"
        )

    if not Path(DB_PATH).exists():
        init_db()

    counts: dict[str, int] = {}
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        for table in TABLE_BY_TYPE.values():
            try:
                rows = _fetch_table(base_url, key, table)
            except Exception as error:  # noqa: BLE001 — сеть/HTTP
                raise RuntimeError(f"Не удалось прочитать «{table}»: {error}") from error

            columns = [
                row[1] for row in conn.execute(f'PRAGMA table_info("{table}")').fetchall()
            ]
            conn.execute(f'DELETE FROM "{table}"')
            for row in rows:
                data = {k: v for k, v in row.items() if k in columns}
                for name, value in list(data.items()):
                    if isinstance(value, (dict, list)):
                        data[name] = json.dumps(value, ensure_ascii=False)
                if not data:
                    continue
                names = ", ".join(f'"{name}"' for name in data)
                marks = ", ".join("?" for _ in data)
                conn.execute(
                    f'INSERT INTO "{table}" ({names}) VALUES ({marks})',
                    tuple(data.values()),
                )
            counts[table] = len(rows)
        conn.commit()
    finally:
        conn.close()

    print("[PCHelper MCP] синхронизация из Supabase:", counts)
    return DB_PATH
