// Clicks through Crew's Tonie Box in a real browser engine and checks what a person would see.
//
//   node tests/ui_tour.js --app <CrewsTonieBox> --teddy <teddy> [--browser chromium|webkit]
//                         [--tonies-json build/toniesV2.json] [--out screenshots]
//
// Starts the app without a window on a fake SD card (tests/fixtures.py), saves a screenshot of
// every step and exits with the number of failed checks. Needs node and the playwright package.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const playwright = require('playwright');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const browserName = args.browser || 'chromium';
const out = path.resolve(args.out || 'screenshots');
fs.mkdirSync(out, { recursive: true });

let failures = 0;
function check(ok, message) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${message}`);
  if (!ok) failures++;
  return ok;
}

/* a stereo sine WAV, so the test needs no audio tools */
function toneWav(file, seconds, freq) {
  const rate = 44100;
  const frames = Math.round(seconds * rate);
  const buffer = Buffer.alloc(44 + frames * 4);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    const value = Math.round(12000 * Math.sin(2 * Math.PI * freq * i / rate));
    buffer.writeInt16LE(value, 44 + i * 4);
    buffer.writeInt16LE(value, 46 + i * 4);
  }
  fs.writeFileSync(file, buffer);
  return file;
}

/* a tiny PNG, so the test needs no image tools */
function makePng(file) {
  const zlib = require('zlib');
  const crc = buf => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    const out = Buffer.alloc(4);
    out.writeUInt32BE((~c) >>> 0, 0);
    return out;
  };
  const chunk = (tag, data) => {
    const body = Buffer.concat([Buffer.from(tag), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    return Buffer.concat([len, body, crc(body)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(16, 0);
  ihdr.writeUInt32BE(16, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 16 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(48, 0xcc)])));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(file, png);
  return file;
}

function startApp(work) {
  const sd = path.join(work, 'sd');
  fs.mkdirSync(sd);
  const fixtureArgs = [path.join(__dirname, 'fixtures.py'), args.teddy, sd];
  if (args['tonies-json']) fixtureArgs.push(args['tonies-json']);
  execFileSync('python3', fixtureArgs, { stdio: ['ignore', 'ignore', 'inherit'] });
  const port = 5100 + Math.floor(Math.random() * 800);
  const app = spawn(args.app, ['--no-window', '--port', String(port), '--data', path.join(work, 'data'), '--sd-root', sd]);
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('the app did not start: ' + text)), 60000);
    app.stdout.on('data', chunk => {
      text += chunk;
      const match = text.match(/Open (http:\/\/\S+\?t=[0-9A-F]+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ app, url: match[1] });
      }
    });
    app.on('exit', code => reject(new Error(`the app stopped (${code}): ${text}`)));
  });
}

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ctb-ui-'));
  const { app, url } = await startApp(work);
  const chromium = browserName === 'chromium';
  const browser = await playwright[browserName].launch(chromium
    ? { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] }
    : {});
  const page = await browser.newPage({ viewport: { width: 1240, height: 840 } });
  const problems = [];
  page.on('pageerror', error => problems.push('page error: ' + error.message));
  /* tonie pictures come from the internet, which a test machine may not reach: the app shows an emoji then */
  const expected = where => /\/api\/image\?/.test(where || '');
  page.on('console', message => { if (message.type() === 'error' && !expected(message.location().url)) problems.push(`console: ${message.text()} (${message.location().url})`); });
  page.on('response', response => { if (response.status() >= 400 && !expected(response.url())) problems.push(`${response.status()} ${response.url()}`); });
  let step = 0;
  const shot = async name => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `${String(++step).padStart(2, '0')}-${name}.png`) });
  };
  const titles = () => page.locator('.grid .tonie-title').allTextContents();

  try {
    await page.goto(url);
    await page.waitForSelector('.grid .tonie:not(.add-card)', { timeout: 20000 });
    await shot('home');
    const cards = await page.locator('.grid .tonie:not(.add-card)').count();
    check(cards >= 5, `the SD card's tonies are shown (${cards})`);
    check(await page.locator('.grid .badge-custom').count() >= 2, 'home-made tonies are marked "Made by us"');
    check(await page.locator('.grid .badge-broken').count() === 1, 'the broken file is shown as needing help');
    check(await page.locator('.grid .badge-warn').count() === 1, 'the unfinished download is marked');

    // a tonie up close, and listening to a chapter: pick the home-made one with three chapters
    // by its own text, not by grid position (the card also has a one-chapter home-made tonie)
    await page.locator('.grid .tonie', { has: page.locator('.badge-custom'), hasNot: page.locator('.badge-warn'), hasText: '3 chapters' }).first().click();
    await page.waitForSelector('.drawer .chapters li');
    await shot('tonie');
    check(await page.locator('.drawer .chapters li').count() === 3, 'its three chapters are listed');
    await page.locator('.drawer .chapters .play').nth(1).click();
    const played = await page.waitForFunction(() => document.getElementById('player').currentTime > 0.3, null, { timeout: 15000 }).then(() => true, () => false);
    const player = await page.evaluate(() => { const p = document.getElementById('player'); return { src: p.currentSrc.replace(/^.*\/chapters\//, ''), time: p.currentTime, error: p.error && p.error.code }; });
    check(played, `a chapter plays (${JSON.stringify(player)})`);
    await shot('playing');
    if (!chromium) {
      /* jump into the middle, the way a player asks for a byte range */
      await page.evaluate(() => { document.getElementById('player').currentTime = 1.2; });
      const jumped = await page.waitForFunction(() => document.getElementById('player').currentTime > 1.3, null, { timeout: 10000 }).then(() => true, () => false);
      check(jumped, 'jumping within a chapter works');
    }
    await page.locator('.drawer .chapters .play').nth(1).click();
    await page.keyboard.press('Escape');

    // making a tonie on a tag
    toneWav(path.join(work, '01 Hello.wav'), 2, 660);
    toneWav(path.join(work, '02 Good night.wav'), 1.5, 990);
    await page.click('#make-button');
    await page.waitForSelector('.pick');
    await shot('make-pick');
    await page.locator('.pick').first().click();
    await page.click('.dialog-foot .btn-primary');
    await page.locator('.dropzone input[type=file]:not([webkitdirectory])').setInputFiles([path.join(work, '01 Hello.wav'), path.join(work, '02 Good night.wav')]);
    await page.waitForFunction(() => document.querySelectorAll('.track').length === 2 && !document.querySelector('.track.uploading'), null, { timeout: 30000 });
    const tracks = await page.locator('.track input').evaluateAll(inputs => inputs.map(input => input.value));
    check(tracks.join('|') === 'Hello|Good night', `sounds added in order with clean names (${tracks.join(', ')})`);
    // pull a chapter out of a tonie already on the card, into this playlist
    await page.locator('.btn', { hasText: 'Add from a tonie' }).click();
    await page.waitForSelector('.source-list .source');
    await shot('make-add-from-tonie');
    await page.locator('.source .source-head').first().click();
    await page.waitForSelector('.source .chapters li .btn');
    await page.locator('.source .chapters li .btn', { hasText: /^Add$/ }).first().click();
    await page.waitForTimeout(600);
    await page.locator('.dialog .btn-primary', { hasText: 'Done' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.track').length === 3 && !document.querySelector('.track.uploading'), null, { timeout: 20000 });
    check(await page.locator('.track').count() === 3, 'a chapter from another tonie joins the playlist');
    await shot('make-sounds');
    await page.click('.dialog-foot .btn-primary');
    await page.fill('.input.big', 'Test bedtime');
    await page.locator('.emoji-grid button').nth(3).click();
    // and a photo of your own
    makePng(path.join(work, 'cover.png'));
    await page.setInputFiles('.photo-row input[type=file]', path.join(work, 'cover.png'));
    await page.waitForSelector('.photo-thumb.on', { timeout: 10000 });
    check(await page.locator('.preview-card .stage img').count() === 1, 'your own photo shows in the preview');
    await shot('make-name');
    await page.click('.dialog-foot .btn-magic');
    const done = await page.waitForSelector('.done-art', { timeout: 60000 }).then(() => true, () => false);
    check(done, 'the magic finishes');
    await shot('make-done');
    await page.click('.dialog-foot .btn-primary');
    await page.waitForTimeout(1500);
    check((await titles()).includes('Test bedtime'), 'the new tonie shows up on the card');

    // a recording, where the browser can fake a microphone
    if (chromium) {
      await page.click('#make-button');
      await page.locator('.choice', { hasText: 'Keep it on this Mac' }).click();
      await page.click('.dialog-foot .btn-primary');
      await page.locator('.btn', { hasText: 'Record my voice' }).click();
      await page.locator('.rec-button').click();
      await page.waitForTimeout(2200);
      await shot('recording');
      await page.locator('.rec-button').click();
      await page.waitForSelector('.recorder .chapters');
      await page.locator('.dialog .btn-primary', { hasText: 'Add it' }).click();
      const recorded = await page.waitForFunction(() => document.querySelectorAll('.track').length === 1 && !document.querySelector('.track.uploading'), null, { timeout: 30000 }).then(() => true, () => false);
      check(recorded, 'a recording becomes a chapter');
      await page.click('.dialog-foot .btn-primary');
      await page.fill('.input.big', 'Recorded story');
      await page.click('.dialog-foot .btn-magic');
      check(await page.waitForSelector('.done-art', { timeout: 60000 }).then(() => true, () => false), 'the recorded tonie is saved on the shelf');
      await page.click('.dialog-foot .btn-primary');
    }

    // the shelf
    await page.click('#shelf-button');
    await page.waitForSelector('.shelf-item');
    await shot('shelf');
    const shelfTitles = await page.locator('.shelf-item .info b').allTextContents();
    check(shelfTitles.length >= 1, `the replaced tonie was kept on the shelf (${shelfTitles.join(', ')})`);
    await page.locator('.shelf-item .btn', { hasText: 'Listen' }).first().click();
    check(await page.waitForSelector('.shelf-group .chapters li .play', { timeout: 15000 }).then(() => true, () => false), 'shelf tonies can be listened to');
    await page.keyboard.press('Escape');

    // settings: the child's name is used everywhere
    await page.click('#settings-button');
    await shot('settings');
    await page.locator('.settings-section .input').first().fill('Mia');
    await page.locator('.settings-section .input').first().press('Tab');
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
    check((await page.locator('#title').textContent()) === "Mia's Tonie Box", 'the name shows in the title');

    // the visual tonie library
    await page.click('#library-button');
    await page.waitForSelector('.source-list .source', { timeout: 15000 });
    const libRows = await page.locator('.source-list .source').count();
    check(libRows > 5, `the library shows the catalog (${libRows} rows)`);
    // typing is debounced 300 ms and then clears the list while it fetches, so wait for the
    // search response and the re-render rather than a fixed delay (which raced on slower runners)
    await page.fill('.dialog input[type=search]', 'grimm');
    await page.waitForResponse(r => /[?&]q=grimm/i.test(r.url()) && r.url().includes('/library/search') && r.ok(), { timeout: 15000 });
    const narrowed = await page.waitForFunction(() => document.querySelectorAll('.source-list .source').length >= 1, { timeout: 8000 }).then(() => true, () => false);
    const found = await page.locator('.source-list .source').count();
    check(narrowed && found >= 1 && found <= 60, `searching the library narrows it (${found})`);
    await page.locator('.source .source-head').first().click();
    check(await page.waitForSelector('.source .chapters li', { timeout: 8000 }).then(() => true, () => false), 'a catalog item shows its chapter names');
    await shot('library');
    await page.keyboard.press('Escape');

    // dropping files anywhere opens the wizard with them
    const wavBase64 = fs.readFileSync(path.join(work, '01 Hello.wav')).toString('base64');
    const transfer = await page.evaluateHandle(data => {
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'Dropped song.wav', { type: 'audio/wav' }));
      return dt;
    }, wavBase64);
    await page.dispatchEvent('main', 'drop', { dataTransfer: transfer });
    const dropped = await page.waitForSelector('.wizard-steps', { timeout: 10000 }).then(() => true, () => false);
    check(dropped, 'dropping a sound on the window opens "Make a new tonie"');
    await shot('dropped');
    if (dropped) await page.keyboard.press('Escape');

    // a small window
    await page.setViewportSize({ width: 960, height: 640 });
    await shot('small-window');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(!overflow, 'nothing sticks out sideways in a small window');

    check(problems.length === 0, 'no errors in the page' + (problems.length ? ': ' + problems.join(' | ') : ''));
  } catch (error) {
    check(false, 'the tour stopped: ' + error.message);
    await page.screenshot({ path: path.join(out, 'error.png') }).catch(() => {});
  } finally {
    await browser.close();
    app.kill();
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(`\n${failures ? failures + ' TEST(S) FAILED' : 'ALL TESTS PASSED'} (${browserName}, screenshots in ${out})`);
  process.exit(failures ? 1 : 0);
})();
