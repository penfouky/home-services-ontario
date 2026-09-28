"""Tests Crew's Tonie Box through its local web API: security, reading every kind of tonie,
listening, making, replacing, the shelf, exporting, removing and tidying up.

usage: api_test.py <CrewsTonieBox executable> <teddy executable> [tonies.json]
Starts the app without a window on a fake SD card (see fixtures.py). Needs only python3.
"""
import hashlib
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
import wave

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import fixtures  # noqa: E402

failures = 0


def check(condition, message):
    global failures
    print(('PASS: ' if condition else 'FAIL: ') + message)
    if not condition:
        failures += 1
    return condition


class App:
    def __init__(self, exe, data, sd):
        with socket.socket() as s:
            s.bind(('127.0.0.1', 0))
            self.port = s.getsockname()[1]
        args = [exe] if not exe.endswith('.dll') else ['dotnet', exe]
        self.process = subprocess.Popen(args + ['--no-window', '--port', str(self.port), '--data', data, '--sd-root', sd],
                                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        self.token = None
        deadline = time.time() + 60
        while time.time() < deadline and self.token is None:
            line = self.process.stdout.readline()
            if not line:
                break
            print('  app: ' + line.rstrip())
            match = re.search(r'\?t=([0-9A-F]+)', line)
            if match:
                self.token = match.group(1)
        if not self.token:
            raise SystemExit('the app did not start')

    def request(self, method, path, body=None, headers=None, raw=False):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=120)
        all_headers = {'X-Token': self.token}
        all_headers.update(headers or {})
        if body is not None and not isinstance(body, (bytes, bytearray)):
            body = json.dumps(body).encode()
            all_headers['Content-Type'] = 'application/json'
        connection.request(method, path, body=body, headers=all_headers)
        response = connection.getresponse()
        data = response.read()
        connection.close()
        if raw:
            return response, data
        return response.status, (json.loads(data) if data and response.getheader('Content-Type', '').startswith('application/json') else data)

    def get(self, path):
        return self.request('GET', path)[1]

    def post(self, path, body=None):
        return self.request('POST', path, body if body is not None else {})[1]

    def job(self, job, timeout=120):
        deadline = time.time() + timeout
        while time.time() < deadline:
            current = self.get('/api/jobs/' + job['id'])
            if current['state'] != 'running':
                return current
            time.sleep(0.2)
        raise SystemExit('job timed out: ' + json.dumps(job))

    def stop(self):
        try:
            self.request('POST', '/api/quit', {})
            self.process.wait(timeout=30)
        except Exception:
            self.process.kill()


def tone_file(path, seconds, freq):
    fixtures.tone(path, seconds, freq, freq)
    return path


def tiny_png():
    import struct
    import zlib
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    raw = b''.join(b'\0' + b'\xff\x6f\xae' * 16 for _ in range(16))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 16, 16, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


def main(exe, teddy, tonies_json=None):
    work = tempfile.mkdtemp()
    sd, data = os.path.join(work, 'sd'), os.path.join(work, 'data')
    os.makedirs(sd)
    info = json.loads(subprocess.run([sys.executable, os.path.join(here, 'fixtures.py'), teddy, sd] + ([tonies_json] if tonies_json else []),
                                     check=True, capture_output=True, text=True).stdout)
    tags = info['tags']
    app = App(exe, data, sd)
    try:
        run(app, sd, data, work, tags, info)
    finally:
        app.stop()
        shutil.rmtree(work, ignore_errors=True)
    print()
    print('ALL TESTS PASSED' if failures == 0 else f'{failures} TEST(S) FAILED')
    sys.exit(1 if failures else 0)


def run(app, sd, data, work, tags, info):
    print('== Only the app itself may use the API')
    status, _ = app.request('GET', '/api/state', headers={'X-Token': 'wrong'})
    check(status == 401, f'wrong token is refused ({status})')
    status, _ = app.request('GET', '/api/state', headers={'Host': 'evil.example:80'})
    check(status == 403, f'other host names are refused, against DNS rebinding ({status})')
    status, _ = app.request('POST', '/api/quit', {}, headers={'Origin': 'http://evil.example'})
    check(status == 403, f'requests from other web pages are refused ({status})')
    response, _ = app.request('GET', f'/?t={app.token}', raw=True)
    cookie = response.getheader('Set-Cookie', '')
    check(response.status == 302 and 'httponly' in cookie.lower() and 'samesite=strict' in cookie.lower(), 'the start link sets a strict session cookie: ' + cookie.split(';', 1)[-1].strip())
    status, page = app.request('GET', '/')
    check(status == 200 and b"Crew's Tonie Box" in page, 'the page itself loads')
    status, _ = app.request('GET', '/api/image?url=' + 'http%3A%2F%2Fexample.com%2Fx.png')
    check(status == 404, 'pictures only come from the tonies list, not any address')
    status, _ = app.request('POST', '/api/reveal', {'path': '/etc/passwd'})
    check(status == 404, 'Finder is only opened for the app\'s own folders')

    print('== State')
    state = app.get('/api/state')
    check('libopus' in state['app']['encoder'], 'native libopus is used: ' + state['app']['encoder'])
    check(state['db']['count'] > 1000, f"tonies list loaded: {state['db']['count']} tonies ({state['db']['source']})")
    check(len(state['cards']) == 1, 'the test SD card is found')
    card = state['cards'][0]['id']

    print('== Every kind of tonie')
    tonies = {t['uid']: t for t in app.get(f'/api/cards/{card}/tonies')}
    kinds = {name: tonies.get(uid, {}).get('kind') for name, uid in tags.items()}
    print('  ' + json.dumps(kinds))
    check(kinds['custom'] == 'custom' and tonies[tags['custom']]['chapters'] == 3, 'home-made tonie with 3 chapters')
    check(kinds['mystery'] == 'mystery', 'unknown tonie is a mystery')
    check(tonies[tags['incomplete']]['problem'] == 'incomplete', 'unfinished download is marked incomplete')
    check(kinds['broken'] == 'broken', 'garbage file is broken, and does not break the list')
    if 'official' in tags:
        official = tonies[tags['official']]
        check(kinds['official'] == 'official' and official['title'], f"official tonie recognized by its audio id: {official['title']}")
    check(tonies[tags['custom']]['uidPretty'] == 'E0:04:03:50:1E:E9:18:F2', 'tag id from the folder and file name')

    print('== Listening')
    custom = tags['custom']
    detail = app.get(f'/api/cards/{card}/tonies/{custom}')
    seconds = detail['chapterSeconds']
    check(len(seconds) == 3 and abs(seconds[0] - 3.0) < 0.15 and abs(seconds[1] - 2.0) < 0.15, f'chapter lengths {seconds}')
    base = f'/api/cards/{card}/tonies/{custom}/chapters/1'
    response, wav = app.request('GET', base + '.wav', raw=True)
    samples = round(seconds[1] * 48000)
    check(response.status == 200 and wav[:4] == b'RIFF' and abs(len(wav) - (44 + samples * 4)) <= 4 * 480, f'chapter as WAV, {len(wav)} bytes')
    response, part = app.request('GET', base + '.wav', headers={'Range': 'bytes=0-1'}, raw=True)
    check(response.status == 206 and part == wav[:2] and response.getheader('Content-Range') == f'bytes 0-1/{len(wav)}', 'range request for the first bytes (WebKit asks that first)')
    middle = len(wav) // 2 + 1
    response, part = app.request('GET', base + '.wav', headers={'Range': f'bytes={middle}-'}, raw=True)
    check(response.status == 206 and part == wav[middle:], 'range request from the middle gives the same bytes as playing through')
    response, part = app.request('GET', base + '.wav', headers={'Range': 'bytes=-100'}, raw=True)
    check(response.status == 206 and len(part) == 100, 'suffix range request')
    response, part = app.request('GET', base + '.wav', headers={'Range': f'bytes={len(wav) + 10}-'}, raw=True)
    check(response.status == 416, 'range past the end is refused')
    response, ogg = app.request('GET', base + '.ogg', raw=True)
    check(response.status == 200 and ogg[:4] == b'OggS' and b'OpusHead' in ogg[:100], f'chapter as Ogg Opus, {len(ogg)} bytes')
    status, _ = app.request('GET', f'/api/cards/{card}/tonies/{custom}/chapters/7.wav')
    check(status == 404, 'a chapter that does not exist is 404')

    print('== Making a tonie')
    names = [tone_file(os.path.join(work, 'Good night moon.wav'), 2, 523), tone_file(os.path.join(work, 'Twinkle.wav'), 1.5, 784)]
    staged = []
    for name in names:
        status, file = app.request('PUT', '/api/files/upload?name=' + os.path.basename(name).replace(' ', '%20'), open(name, 'rb').read())
        staged.append(file)
    check(all(abs(s['seconds'] - w) < 0.05 for s, w in zip(staged, [2, 1.5])) and staged[0]['title'] == 'Good night moon', f'uploads are probed: {[s["title"] for s in staged]}')
    status, _ = app.request('PUT', '/api/files/upload?name=notes.txt', b'hello')
    check(status == 400, 'other files are refused')
    new_uid = 'E0040350DEADBEEF'
    job = app.job(app.post('/api/make', {'title': 'Bedtime', 'emoji': '🌙', 'color': '#7c5cff', 'cardId': card, 'uid': new_uid,
                                         'tracks': [{'id': staged[0]['id'], 'title': 'Moon'}, {'id': staged[1]['id'], 'title': ''}]}))
    check(job['state'] == 'done', 'made a tonie on a new tag: ' + json.dumps(job.get('error')))
    path = fixtures.content_path(sd, new_uid)
    check(os.path.exists(path) and subprocess.run([sys.executable, os.path.join(here, 'validate_tonie.py'), '--ours', path]).returncode == 0,
          'the file is where the Toniebox looks and has the right layout')
    made = app.get(f'/api/cards/{card}/tonies/{new_uid}')['tonie']
    check(made['kind'] == 'custom' and made['title'] == 'Bedtime' and made['emoji'] == '🌙' and made['chapterTitles'] == ['Moon', 'Twinkle'],
          f"it shows up with its name, picture and chapters: {made['title']} {made['chapterTitles']}")
    check(not any(f.endswith('.tmp') for _, _, files in os.walk(sd) for f in files), 'no temporary files left on the card')

    print('== Replacing keeps a copy and the audio id')
    before = app.get(f'/api/cards/{card}/tonies/{custom}')['tonie']
    job = app.job(app.post('/api/make', {'title': 'New stories', 'cardId': card, 'uid': custom, 'keepAudioId': True,
                                         'tracks': [{'id': staged[1]['id'], 'title': 'Star'}]}))
    after = app.get(f'/api/cards/{card}/tonies/{custom}')['tonie']
    check(job['state'] == 'done' and after['title'] == 'New stories' and after['audioId'] == before['audioId'], 'replaced, with the old audio id kept')
    shelf = app.get('/api/shelf')
    check(any(item['reason'] == 'before replacing' and item['hash'] == before['hash'] for item in shelf), 'the old one is on the shelf')

    print('== The shelf')
    job = app.job(app.post('/api/make', {'title': 'For later', 'cardId': None, 'tracks': [{'id': staged[0]['id'], 'title': 'Later'}]}))
    check(job['state'] == 'done' and job['result'].get('shelf'), 'made a tonie for the shelf only')
    shelf = app.get('/api/shelf')
    later = next(item for item in shelf if item['title'] == 'For later')
    other_uid = tags['custom2']
    job = app.job(app.post(f"/api/shelf/{later['id']}/put", {'cardId': card, 'uid': other_uid}))
    target = fixtures.content_path(sd, other_uid)
    shelf_file = [f for f in os.listdir(os.path.join(data, 'Backups')) if f.endswith('.json') and json.load(open(os.path.join(data, 'Backups', f)))['id'] == later['id']][0]
    same = open(target, 'rb').read() == open(os.path.join(data, 'Backups', shelf_file[:-5] + '.taf'), 'rb').read()
    check(job['state'] == 'done' and same, 'put it on a tag, byte for byte')
    count = len(app.get('/api/shelf'))
    app.job(app.post(f'/api/cards/{card}/tonies/{custom}/backup'))
    app.job(app.post(f'/api/cards/{card}/tonies/{custom}/backup'))
    check(len(app.get('/api/shelf')) == count + 1, 'keeping a copy twice keeps it once')
    detail = app.get(f"/api/shelf/{later['id']}")
    check(detail['chapterTitles'] == ['Later'] and len(detail['chapterSeconds']) == 1, 'shelf tonies can be listened to')

    print('== Saving songs')
    job = app.job(app.post(f'/api/cards/{card}/tonies/{new_uid}/export', {'format': 'ogg'}))
    folder = job['result']['folder'] if job['state'] == 'done' else ''
    files = sorted(os.listdir(folder)) if folder else []
    check(files == ['01 Moon.ogg', '02 Twinkle.ogg'], f'chapters saved as songs: {files}')
    job = app.job(app.post(f"/api/shelf/{later['id']}/export", {'format': 'wav'}))
    check(job['state'] == 'done' and os.listdir(job['result']['folder']) == ['01 Later.wav'], 'shelf tonie saved as WAV')
    with wave.open(os.path.join(job['result']['folder'], '01 Later.wav')) as saved:
        check(saved.getframerate() == 48000 and abs(saved.getnframes() / 48000 - 2) < 0.1, 'the WAV holds the chapter')

    print('== Names')
    app.post(f'/api/cards/{card}/tags/{other_uid}/name', {'name': 'Blue hat'})
    app.post(f'/api/cards/{card}/tonies/{new_uid}/rename', {'title': 'Bedtime stories', 'emoji': '🦄', 'color': '#ff6fae'})
    tonies = {t['uid']: t for t in app.get(f'/api/cards/{card}/tonies')}
    check(tonies[other_uid]['tagName'] == 'Blue hat', 'tag nickname')
    check(tonies[new_uid]['title'] == 'Bedtime stories' and tonies[new_uid]['emoji'] == '🦄', 'renamed tonie')
    uid = app.get('/api/uid/e0:04:03:50:1e:e9:18:f2')
    check(uid['valid'] and uid['uid'] == 'E00403501EE918F2' and uid['tonieLike'] and uid['folder'] == 'F218E91E' and uid['file'] == '500304E0', 'tag id check')
    check(not app.get('/api/uid/1234')['valid'], 'short tag ids are refused')

    print('== The tonie library (catalog reference)')
    lib = app.get('/api/library/search?q=grimm&limit=5')
    check(lib['total'] > 0 and all('article' in i and 'tracks' in i and 'series' in i for i in lib['items']),
          f"searching the catalog works ({lib['total']} for grimm)")
    langs = app.get('/api/library/languages')
    check(isinstance(langs, list) and sum(l['count'] for l in langs) > 1000, f'languages are listed with counts ({len(langs)})')
    filtered = app.get('/api/library/search?lang=de-de&limit=3')
    check(filtered['total'] > 100 and all((i['language'] or '').lower() == 'de-de' for i in filtered['items']), 'the language filter works')
    check(app.get('/api/library/search?q=zzqqxx')['total'] == 0, 'a search with no matches is empty')

    print('== Renaming chapters of a home-made tonie')
    renamed = app.post(f'/api/cards/{card}/tonies/{custom}/chapters/names', {'names': ['My first chapter']})
    check(renamed.get('chapterTitles') == ['My first chapter'], f"a custom tonie's chapters can be renamed ({renamed.get('chapterTitles')})")
    if 'official' in tags:
        status, _ = app.request('POST', f'/api/cards/{card}/tonies/{tags["official"]}/chapters/names', {'names': ['x']})
        check(status == 400, 'official tonie chapters cannot be renamed')

    print('== A custom playlist from chapters of other tonies')
    status, staged1 = app.request('POST', f'/api/cards/{card}/tonies/{custom}/chapters/0/stage')
    check(status == 200 and staged1.get('id') and staged1.get('seconds', 0) > 0, f'staged a chapter from an existing tonie ({staged1.get("title")})')
    status, _ = app.request('POST', f'/api/cards/{card}/tonies/{custom}/chapters/9/stage')
    check(status == 404, 'a chapter that is not there cannot be staged')
    sources = [staged1['id']]
    if 'official' in tags:
        _, off = app.request('POST', f'/api/cards/{card}/tonies/{tags["official"]}/chapters/0/stage')
        sources.append(off['id'])
    job = app.job(app.post('/api/make', {'title': 'Mixed playlist', 'cardId': None, 'tracks': [{'id': i} for i in sources]}))
    mix = app.get(f"/api/shelf/{job['result']['shelf']}") if job['state'] == 'done' else {}
    check(job['state'] == 'done' and len(mix.get('chapterSeconds', [])) == len(sources),
          f'made a new tonie mixing {len(sources)} chapters pulled from other tonies')

    print('== A photo on a tonie')
    png = tiny_png()
    status, up = app.request('PUT', '/api/covers/upload?name=me.png', png)
    check(status == 200 and up.get('id'), 'uploaded a photo')
    status, _ = app.request('PUT', '/api/covers/upload?name=me.txt', png)
    check(status == 400, 'a file that is not a picture is refused')
    _, chap = app.request('POST', f'/api/cards/{card}/tonies/{custom}/chapters/0/stage')
    job = app.job(app.post('/api/make', {'title': 'With a photo', 'cardId': None, 'picture': up['id'], 'tracks': [{'id': chap['id']}]}))
    made_hash = job['result']['hash'] if job['state'] == 'done' else ''
    response, image = app.request('GET', f'/api/cover/{made_hash}', raw=True)
    check(job['state'] == 'done' and response.status == 200 and image[:8] == b'\x89PNG\r\n\x1a\n', 'the photo is kept and served for the tonie')
    _, up2 = app.request('PUT', '/api/covers/upload?name=x.png', png)
    after = app.post(f'/api/cards/{card}/tonies/{other_uid}/rename', {'title': 'Blue hat', 'picture': up2['id']})
    check((after.get('image') or '').startswith('/api/cover/') and not after.get('emoji'), 'a photo can be added to a tonie by renaming it')
    back = app.post(f'/api/cards/{card}/tonies/{other_uid}/rename', {'title': 'Blue hat', 'emoji': '🦄', 'picture': ''})
    check(not back.get('image') and back.get('emoji') == '🦄', 'choosing an emoji again clears the photo')

    print('== Stopping a tonie while it is made')
    long_file = tone_file(os.path.join(work, 'long.wav'), 120, 440)
    status, file = app.request('PUT', '/api/files/upload?name=long.wav', open(long_file, 'rb').read())
    before = hashlib.sha1(open(fixtures.content_path(sd, custom), 'rb').read()).hexdigest()
    job = app.post('/api/make', {'title': 'Long', 'cardId': card, 'uid': custom, 'tracks': [{'id': file['id'], 'title': 'Long'}]})
    time.sleep(0.3)
    app.post(f"/api/jobs/{job['id']}/cancel")
    job = app.job(job)
    after = hashlib.sha1(open(fixtures.content_path(sd, custom), 'rb').read()).hexdigest()
    check(job['state'] == 'cancelled' and before == after, f"stopped, the tag is unchanged ({job['state']})")

    print('== Removing and tidying up')
    job = app.job(app.post(f'/api/cards/{card}/tonies/{new_uid}/remove'))
    check(job['state'] == 'done' and not os.path.exists(fixtures.content_path(sd, new_uid)), 'removed from the card')
    check(any(item['reason'] == 'before removing' and item['title'] == 'Bedtime stories' for item in app.get('/api/shelf')), 'with a copy on the shelf')
    result = app.post(f'/api/cards/{card}/tidy')
    left = [f for _, _, files in os.walk(sd) for f in files if f.startswith('._')]
    check(result['count'] == 2 and not left, f"tidied up {result['count']} Mac files")
    status, _ = app.request('POST', '/api/cards/nope/tidy', {})
    check(status == 404, 'unknown card is 404')


if __name__ == '__main__':
    main(*sys.argv[1:4])
