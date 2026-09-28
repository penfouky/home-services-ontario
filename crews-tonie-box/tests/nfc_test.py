"""Tests the NFC reader integration with a fake reader, so it needs no hardware.

usage: nfc_test.py <CrewsTonieBox executable>
The app is started with CTB_NFC_CMD='cat <file>'; the test writes different reader outputs to
that file and checks the parsed UID (Tonie tags are 8-byte ISO 15693, starting E0 04).
Needs only python3.
"""
import http.client
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time

failures = 0


def check(ok, message):
    global failures
    print(('PASS: ' if ok else 'FAIL: ') + message)
    if not ok:
        failures += 1


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
    return response.status, (json.loads(data) if data else None)


def main(exe):
    work = tempfile.mkdtemp()
    out = os.path.join(work, 'nfc.txt')
    open(out, 'w').close()
    port = free_port()
    env = dict(os.environ, CTB_NFC_CMD=f'cat "{out}"', CTB_NFC_TOOL='Proxmark3')
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

    def read_with(text):
        with open(out, 'w') as f:
            f.write(text)
        return request(port, token, 'POST', '/api/nfc/read')[1]

    try:
        if not token:
            raise SystemExit('the app did not start')
        status, state = request(port, token, 'GET', '/api/state')
        check(status == 200 and state['app']['nfc']['available'] and state['app']['nfc']['tool'] == 'Proxmark3',
              'a reader is detected from CTB_NFC_CMD')

        cases = {
            'Proxmark3 hf 15': (' UID: E0 04 03 50 1E E9 18 F2', 'E00403501EE918F2'),
            'lower case with UID =': ('found tag, UID = e0 04 03 50 1e e9 18 f2', 'E00403501EE918F2'),
            'contiguous hex': ('UID(hex): E00403501EE918F2', 'E00403501EE918F2'),
            'libnfc NFCID1 (8 byte)': ('       UID (NFCID1): E0  04  03  50  1e  e9  18  f2', 'E00403501EE918F2'),
        }
        for name, (text, expected) in cases.items():
            got = read_with(text).get('uid')
            check(got == expected, f'{name}: {got}')

        check(read_with('').get('uid') is None, 'no tag on the reader returns nothing')
        check(read_with('hf 14a: 04 9a bc 1e  (7-byte NTAG)').get('uid') is None,
              'a 7-byte NTAG (not a Toniebox tag) is not accepted')
    finally:
        try:
            request(port, token, 'POST', '/api/quit')
            proc.wait(timeout=20)
        except Exception:
            proc.kill()
        shutil.rmtree(work, ignore_errors=True)
    print()
    print('ALL TESTS PASSED' if failures == 0 else f'{failures} TEST(S) FAILED')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main(sys.argv[1])
