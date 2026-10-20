#!/usr/bin/env python3
"""Serve the frontend with no build step (Python standard library only).

Usage:
    python tools/serve_frontend.py --port 8000
Then open http://127.0.0.1:8000/

The API is expected at /api/v1 on the same origin. Without a backend the UI
detects the failed health probe and switches to its demo dataset.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import os
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src" / "frontend"


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static handler with SPA fallback and explicit cache policy."""

    protocol_version = "HTTP/1.1"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        sys.stderr.write("[static] %s\n" % (fmt % args))

    def send_head(self):  # type: ignore[override]
        path = self.translate_path(self.path)
        if not os.path.exists(path) and "." not in os.path.basename(path):
            self.path = "/index.html"
        return super().send_head()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve src/frontend")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--open", action="store_true", help="open the browser")
    args = parser.parse_args()

    if not ROOT.exists():
        print("Frontend directory not found: %s" % ROOT, file=sys.stderr)
        return 1

    handler = functools.partial(Handler, directory=str(ROOT))
    with Server((args.host, args.port), handler) as httpd:
        url = "http://%s:%d/" % (args.host, args.port)
        print("AI Career Navigator frontend: %s" % url)
        print("Serving %s" % ROOT)
        if args.open:
            import webbrowser

            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
