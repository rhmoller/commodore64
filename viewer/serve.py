#!/usr/bin/env python3
"""Serve the C64 Dev Library viewer.

The viewer fetches markdown from ../docs/, so the HTTP server root must be the
repository root (the parent of this viewer/ directory). This script handles that
for you and prints the URL to open.

Usage:
    python3 viewer/serve.py [port]      # default port 8000
"""
import http.server
import socketserver
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent   # repo root (parent of viewer/)
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # Avoid stale markdown during editing.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # quiet


def main():
    socketserver.TCPServer.allow_reuse_address = True
    url = f"http://localhost:{PORT}/viewer/"
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving {ROOT}")
        print(f"C64 Dev Library  ->  {url}")
        print("Press Ctrl+C to stop.")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
