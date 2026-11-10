#!/usr/bin/env python3
"""Serve this offline game on localhost using only Python's standard library."""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from urllib.parse import unquote, urlsplit
import webbrowser

ROOT = Path(__file__).resolve().parent


class GameHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.wasm': 'application/wasm', '.mjs': 'text/javascript',
                      '.js': 'text/javascript', '.bin': 'application/octet-stream'}

    def send_head(self):
        name = unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
        target = (ROOT / name).resolve()
        if name not in self.server.public_files or not target.is_file() or ROOT not in target.parents:
            self.send_error(404, 'Not found')
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; worker-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000, help='localhost port (default: 8000; 0 selects a free port)')
    parser.add_argument('--no-browser', action='store_true', help='print the URL without opening a browser')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('--port must be between 0 and 65535')
    manifest = json.loads((ROOT / 'MANIFEST.json').read_text(encoding='utf-8'))
    handler = functools.partial(GameHandler, directory=str(ROOT))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    except OSError as error:
        parser.exit(1, f'Cannot open localhost port {args.port}: {error}\nTry: python serve.py --port 0\n')
    server.public_files = set(manifest['files']) | {'MANIFEST.json'}
    url = f'http://127.0.0.1:{server.server_port}/index.html'
    print(f'Small Brains Club: {url}', flush=True)
    print('Keep this window open while playing. Press Ctrl+C to stop.', flush=True)
    if not args.no_browser:
        timer = threading.Timer(.3, webbrowser.open, args=(url,))
        timer.daemon = True
        timer.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
