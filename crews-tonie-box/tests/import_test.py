"""Tests the free-audio (LibriVox) import against a local mock, so it needs no internet.

usage: import_test.py <CrewsTonieBox executable>
Starts a tiny mock LibriVox server and the app pointed at it (CTB_LIBRIVOX_API), then checks
search, listing chapters, downloading a track into staging, and that other hosts are refused.
Needs only python3.
"""
import http.client
import http.server
import json
import os
import re
import socket
import struct
import subprocess
import sys
import threading
import time

failures = 0


def check(ok, message):
    global failures
    print(('PASS: ' if ok else 'FAIL: ') + message)
    if not ok:
        failures += 1


def wav_bytes(seconds=2, rate=8000, freq=440):
    import math
    frames = bytearray()
    for i in range(int(seconds * rate)):
        frames += struct.pack('<h', int(9000 * math.sin(2 * math.pi * freq * i / rate)))
    header = struct.pack('<4sI4s4sIHHIIHH4sI', b'RIFF', 36 + len(frames), b'WAVE', b'fmt ', 16, 1, 1,
                         rate, rate * 2, 2, 16, b'data', len(frames))
    return header + bytes(frames)


class Mock(http.server.BaseHTTPRequestHandler):
    port = 0

    def log_message(self, *a):
        pass

    def do_GET(self):
        base = f'http://127.0.0.1:{Mock.port}'
        if self.path.startswith('/audiobooks/'):
            hit = 'alice' in self.path.lower() or 'carroll' in self.path.lower()
            self._json({'books': [{'id': '1', 'title': "Alice's Adventures in Wonderland",
                                   'authors': [{'first_name': 'Lewis', 'last_name': 'Carroll'}],
                                   'num_sections': '2', 'totaltimesecs': 4}] if hit else []})
        elif self.path.startswith('/audiotracks/'):
            self._json({'sections': [
                {'section_number': '1', 'title': 'Chapter I', 'listen_url': f'{base}/file/ch01.wav', 'playtime': '2'},
                {'section_number': '2', 'title': 'Chapter II', 'listen_url': f'{base}/file/ch02.wav', 'playtime': '2'}]})
        elif self.path.startswith('/file/'):
            body = wav_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'audio/wav')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def _json(self, obj):
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def request(port, token, method, path, body=None):
    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=60)
    headers = {'X-Token': token}
    if body is not None:
        body = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    conn.request(method, path, body=body, headers=headers)
    response = conn.getresponse()
    data = response.read()
    conn.close()
    return response.status, (json.loads(data) if data and response.getheader('Content-Type', '').startswith('application/json') else data)


def main(exe):
    mock_port = free_port()
    Mock.port = mock_port
    server = http.server.HTTPServer(('127.0.0.1', mock_port), Mock)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    import tempfile
    import shutil
    work = tempfile.mkdtemp()
    port = free_port()
    env = dict(os.environ, CTB_LIBRIVOX_API=f'http://127.0.0.1:{mock_port}', CTB_IMPORT_HOSTS='127.0.0.1')
    args = ([exe] if not exe.endswith('.dll') else ['dotnet', exe]) + ['--no-window', '--port', str(port), '--data', os.path.join(work, 'data')]
    proc = subprocess.Popen(args, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    token = None
    deadline = time.time() + 60
    while time.time() < deadline and token is None:
        line = proc.stdout.readline()
        if not line:
            break
        match = re.search(r'\?t=([0-9A-F]+)', line)
        if match:
            token = match.group(1)
    try:
        if not token:
            raise SystemExit('the app did not start')
        status, state = request(port, token, 'GET', '/api/state')
        check(status == 200 and state['app']['import'], 'the import feature is on')

        status, books = request(port, token, 'GET', '/api/import/search?q=alice')
        check(status == 200 and len(books) == 1 and books[0]['author'] == 'Lewis Carroll' and books[0]['sections'] == 2,
              f'search finds the book ({books})')
        _, none = request(port, token, 'GET', '/api/import/search?q=zznothing')
        check(none == [], 'a search with no matches returns nothing')

        status, tracks = request(port, token, 'GET', f'/api/import/{books[0]["id"]}/tracks')
        check(status == 200 and len(tracks) == 2 and tracks[0]['title'] == 'Chapter I', f'chapters are listed ({len(tracks)})')

        status, staged = request(port, token, 'POST', '/api/import/track', {'url': tracks[0]['url'], 'title': 'Down the Rabbit-Hole'})
        check(status == 200 and staged.get('id') and staged['title'] == 'Down the Rabbit-Hole' and staged['seconds'] > 1,
              f'a chapter downloads and is staged ({staged.get("title")}, {round(staged.get("seconds", 0), 1)}s)')

        status, _ = request(port, token, 'POST', '/api/import/track', {'url': 'https://evil.example/x.mp3', 'title': 'x'})
        check(status == 400, 'a download from another site is refused')
    finally:
        try:
            request(port, token, 'POST', '/api/quit')
            proc.wait(timeout=20)
        except Exception:
            proc.kill()
        server.shutdown()
        shutil.rmtree(work, ignore_errors=True)
    print()
    print('ALL TESTS PASSED' if failures == 0 else f'{failures} TEST(S) FAILED')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main(sys.argv[1])
