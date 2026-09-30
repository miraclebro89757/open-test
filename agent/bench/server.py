"""HTTP workbench for the test agent. One process, no project dashboard."""

from __future__ import annotations

import json
import threading
import traceback
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from agent.bench.jobs import JobError, KINDS, LABELS, execute, public_status
from agent.llm.config import is_usable, resolve_llm_config


STATIC = Path(__file__).resolve().parent / "static"
HOST = "0.0.0.0"
PORT = 8787
MAX_BODY = 100_000

_lock = threading.Lock()
_runs: list[dict[str, Any]] = []
_memory: dict[str, Any] = {}


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _event(run: dict[str, Any], text: str) -> None:
    with _lock:
        run["events"].append({"at": _now(), "text": text})


def _public_run(run: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": run["id"],
        "kind": run["kind"],
        "label": LABELS.get(run["kind"], run["kind"]),
        "input": run["input"],
        "status": run["status"],
        "events": list(run["events"]),
        "artifact": run["artifact"],
        "error": run["error"],
        "createdAt": run["createdAt"],
    }


def _work(run: dict[str, Any]) -> None:
    try:
        resolved = resolve_llm_config()
        status = public_status(resolved)
        if not is_usable(resolved.config):
            raise JobError("当前模型配置不能调用。检查挂载的 ~/.opentest/config.json。")
        _event(run, f"调用 {status['provider']} · {status['model']}")
        with _lock:
            memory = dict(_memory)
        artifact = execute(run["kind"], run["input"], memory)
        with _lock:
            if artifact.get("kind") == "cases":
                _memory["cases"] = artifact.get("cases") or []
            run["artifact"] = artifact
            run["status"] = "done"
        count = len(artifact.get("cases") or []) if artifact.get("kind") == "cases" else 0
        _event(run, f"写好了 {count} 条用例" if count else "写好了")
    except JobError as exc:
        with _lock:
            run["status"] = "error"
            run["error"] = str(exc)
        _event(run, str(exc))
    except Exception as exc:
        traceback.print_exc()
        message = str(exc).strip() or exc.__class__.__name__
        with _lock:
            run["status"] = "error"
            run["error"] = message[:500]
        _event(run, "这次没有写完")


class Handler(BaseHTTPRequestHandler):
    server_version = "OpenTestBench/1"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[bench] {self.address_string()} {fmt % args}", flush=True)

    def _send(self, status: int, payload: dict[str, Any] | None = None, body: bytes | None = None, content_type: str = "application/json; charset=utf-8") -> None:
        data = body if body is not None else json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0 or length > MAX_BODY:
            raise JobError("请求体为空或过长。")
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise JobError("请求不是 JSON。") from exc
        if not isinstance(data, dict):
            raise JobError("请求不是 JSON 对象。")
        return data

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            try:
                payload = public_status(resolve_llm_config())
            except Exception as exc:
                payload = {"ok": False, "error": str(exc)[:300]}
            self._send(200, payload)
            return
        if path == "/api/runs":
            with _lock:
                runs = [_public_run(item) for item in _runs]
            self._send(200, {"runs": runs})
            return
        if path == "/api/jobs":
            self._send(200, {"jobs": [{"kind": kind, "label": LABELS[kind]} for kind in KINDS]})
            return
        if path == "/":
            self._file("index.html")
            return
        if path.startswith("/static/"):
            self._file(path.removeprefix("/static/"))
            return
        self._send(404, {"error": "没有这个地址。"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/runs":
            self._send(404, {"error": "没有这个地址。"})
            return
        try:
            data = self._read_json()
            kind = str(data.get("kind") or "")
            text = str(data.get("input") or "")
            with _lock:
                prepare_memory = dict(_memory)
            from agent.bench.jobs import prepare

            prepare(kind, text, prepare_memory)
        except JobError as exc:
            self._send(400, {"error": str(exc)})
            return
        run = {
            "id": uuid.uuid4().hex[:12],
            "kind": kind,
            "input": text.strip(),
            "status": "running",
            "events": [{"at": _now(), "text": "已接收"}],
            "artifact": None,
            "error": "",
            "createdAt": _now(),
        }
        with _lock:
            _runs.append(run)
            del _runs[:-30]
        threading.Thread(target=_work, args=(run,), daemon=True).start()
        self._send(202, _public_run(run))

    def _file(self, name: str) -> None:
        root = STATIC.resolve()
        target = (root / name).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            self._send(404, {"error": "没有这个文件。"})
            return
        types = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8"}
        self._send(200, body=target.read_bytes(), content_type=types.get(target.suffix, "application/octet-stream"))


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Test bench listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
