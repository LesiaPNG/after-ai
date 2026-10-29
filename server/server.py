#!/usr/bin/env python3
# Copyright 2026 Ачкасова Олеся. SPDX-License-Identifier: GPL-3.0-only
"""Dependency-free download site; serves an explicit public-file allowlist only."""
import http.server
import os
import pathlib
import re
import urllib.parse

ROOT = pathlib.Path(os.environ.get('AIFLOW_PUBLIC_ROOT', pathlib.Path(__file__).resolve().parent.parent / 'dist/site')).resolve()
PORT = int(os.environ.get('AIFLOW_PORT', '47683'))
HOST = os.environ.get('AIFLOW_HOST', '0.0.0.0')
ALLOWED = re.compile(r'^(index\.html|site\.css|LICENSE|COPYRIGHT|updates/experimental\.json|downloads/(AI-Flow-\d+\.\d+\.\d+-Setup\.exe|SHA256SUMS))$')

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # No request URLs, user addresses or arbitrary HTTP data in logs.

    def do_GET(self):
        self.respond(False)

    def do_HEAD(self):
        self.respond(True)

    def respond(self, head):
        name = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path).lstrip('/') or 'index.html'
        if name == 'health':
            body = b'{"product":"AI Flow","status":"ok"}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if not head:
                self.wfile.write(body)
            return
        if not ALLOWED.fullmatch(name):
            self.send_error(404)
            return
        file = (ROOT / name).resolve()
        if ROOT not in file.parents or not file.is_file():
            self.send_error(404)
            return
        mime = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.exe': 'application/vnd.microsoft.portable-executable'}.get(file.suffix, 'text/plain; charset=utf-8')
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(file.stat().st_size))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header('Cache-Control', 'public, max-age=86400' if file.suffix == '.exe' else 'no-cache')
        self.end_headers()
        if not head:
            with file.open('rb') as source:
                while True:
                    chunk = source.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)

if __name__ == '__main__':
    print('AI Flow download site listening on port ' + str(PORT), flush=True)
    http.server.ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
