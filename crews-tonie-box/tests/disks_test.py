"""Tests the microSD prepare/format feature with a fake `diskutil`, so it runs anywhere and
erases nothing real.

usage: disks_test.py <CrewsTonieBox executable>
Starts the app with CTB_FORCE_DISKS=1 and CTB_DISKUTIL pointed at a fake that lists one card and,
on eraseDisk, records the command and creates a mount folder under CTB_VOLUMES. Needs only python3.
"""
import http.client
import json
import os
import re
import shutil
import socket
import stat
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
    return response.status, (json.loads(data) if data and response.getheader('Content-Type', '').startswith('application/json') else data)


def job(port, token, started):
    for _ in range(80):
        current = request(port, token, 'GET', '/api/jobs/' + started['id'])[1]
        if current['state'] != 'running':
            return current
        time.sleep(0.2)
    raise SystemExit('job timed out')


def main(exe):
    work = tempfile.mkdtemp()
    volumes = os.path.join(work, 'Volumes')
    os.makedirs(os.path.join(volumes, 'SDCARD', 'CONTENT'))
    erase_log = os.path.join(work, 'erase.log')
    fake = os.path.join(work, 'diskutil.sh')
    with open(fake, 'w') as f:
        f.write(f'''#!/bin/sh
if [ "$1" = "list" ]; then
cat <<'PL'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
 <key>AllDisksAndPartitions</key><array><dict>
   <key>DeviceIdentifier</key><string>disk9</string>
   <key>Size</key><integer>31914983424</integer>
   <key>Partitions</key><array><dict>
     <key>DeviceIdentifier</key><string>disk9s1</string>
     <key>VolumeName</key><string>SDCARD</string>
     <key>MountPoint</key><string>{volumes}/SDCARD</string>
   </dict></array>
 </dict></array>
</dict></plist>
PL
elif [ "$1" = "eraseDisk" ]; then
  echo "$@" >> "{erase_log}"
  mkdir -p "{volumes}/$3"
fi
''')
    os.chmod(fake, os.stat(fake).st_mode | stat.S_IEXEC)

    port = free_port()
    env = dict(os.environ, CTB_FORCE_DISKS='1', CTB_DISKUTIL=f'sh {fake}', CTB_VOLUMES=volumes)
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
        check(status == 200 and state['app']['format'], 'formatting is offered')

        status, listing = request(port, token, 'GET', '/api/disks')
        disk = listing['disks'][0] if listing['disks'] else {}
        check(status == 200 and disk.get('id') == '/dev/disk9' and disk.get('name') == 'SDCARD' and disk.get('hasContent'),
              f'the card is listed with its size and name ({disk})')

        blank = os.path.join(volumes, 'BLANK')
        os.makedirs(blank)
        status, prep = request(port, token, 'POST', '/api/disks/prepare', {'path': blank})
        check(status == 200 and prep['ok'] and os.path.isdir(os.path.join(blank, 'CONTENT')), 'preparing a blank card adds CONTENT')

        wrong = job(port, token, request(port, token, 'POST', '/api/disks/format', {'id': '/dev/disk9', 'label': 'Crew', 'confirm': 'nope'})[1])
        check(wrong['state'] == 'failed', 'formatting without the right confirmation is refused')
        check(not os.path.exists(erase_log), 'nothing was erased on a bad confirmation')

        done = job(port, token, request(port, token, 'POST', '/api/disks/format', {'id': '/dev/disk9', 'label': "Crew's!", 'confirm': '/dev/disk9'})[1])
        erased = open(erase_log).read() if os.path.exists(erase_log) else ''
        check(done['state'] == 'done' and 'eraseDisk FAT32 CREWS MBRFormat /dev/disk9' in erased,
              f'formatting runs diskutil with a sanitized label ({erased.strip()})')
        check(done.get('result', {}).get('ok') and os.path.isdir(os.path.join(volumes, 'CREWS', 'CONTENT')),
              'the freshly formatted card gets its CONTENT folder')
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
