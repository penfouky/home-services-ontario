import { icons, teddy, star, sdArt } from './art.js';
import { confetti, sparkle, chime, pop, setSounds } from './fx.js';
import { startRecording, maxSeconds } from './recorder.js';

/* ---------- little helpers ---------- */

/* builds DOM; strings always become text, only our own SVG goes in through `html` */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [name, v] of Object.entries(value)) {
        if (name.startsWith('--')) node.style.setProperty(name, v);
        else node.style[name] = v;
      }
    }
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
/* replaces a node's children, skipping the empty ones (null would show up as the text "null") */
const put = (node, ...children) => node.replaceChildren(...children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false));
const icon = (name, cls = 'i') => el('span', { class: cls, html: icons[name] || '' });
const $ = selector => document.querySelector(selector);

function duration(seconds) {
  seconds = Math.round(seconds || 0);
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return `0:${String(seconds).padStart(2, '0')}`;
}
const minutes = seconds => seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${Math.round(seconds)} sec`;
function bytes(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}
const naturalKey = name => name.toLowerCase().replace(/\d+/g, d => d.padStart(10, '0'));

async function api(path, { method = 'GET', body, raw } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (raw) {
    options.body = raw;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch('/api' + path, options);
  const type = response.headers.get('content-type') || '';
  const data = type.includes('json') ? await response.json() : null;
  if (!response.ok) {
    throw new Error((data && data.error) || `Something went wrong (${response.status})`);
  }
  return data;
}
const post = (path, body = {}) => api(path, { method: 'POST', body });

/* waits for a background job, calling back with its progress */
async function follow(job, onUpdate) {
  for (;;) {
    const current = await api(`/jobs/${job.id}`);
    onUpdate?.(current);
    if (current.state === 'done') return current.result;
    if (current.state === 'failed') throw new Error(current.error || 'That did not work.');
    if (current.state === 'cancelled') throw Object.assign(new Error('Stopped.'), { cancelled: true });
    await new Promise(resolve => setTimeout(resolve, 350));
  }
}

function toast(message, kind = '', ms = 4200) {
  const node = el('div', { class: `toast ${kind}` }, icon(kind === 'bad' ? 'info' : kind === 'good' ? 'check' : 'sparkles'), el('span', { text: message }));
  const box = $('#toasts');
  box.append(node);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => node.remove(), ms);
}

/* ---------- state ---------- */

const state = {
  app: null,
  db: null,
  settings: null,
  cards: [],
  cardId: null,
  signature: null,
  tonies: null,
  shelf: 0,
  filter: 'all',
  search: '',
  ejected: null
};
const card = () => state.cards.find(c => c.id === state.cardId);
const languages = { en: '🇬🇧 English', 'en-us': '🇺🇸 English', 'en-gb': '🇬🇧 English', de: '🇩🇪 Deutsch', 'de-de': '🇩🇪 Deutsch', fr: '🇫🇷 Français', 'fr-fr': '🇫🇷 Français', nl: '🇳🇱 Nederlands', 'nl-nl': '🇳🇱 Nederlands', es: '🇪🇸 Español', 'es-es': '🇪🇸 Español', it: '🇮🇹 Italiano', 'it-it': '🇮🇹 Italiano', pl: '🇵🇱 Polski', 'pl-pl': '🇵🇱 Polski', pt: '🇵🇹 Português', ga: '🇮🇪 Gaeilge', sv: '🇸🇪 Svenska', da: '🇩🇰 Dansk' };
const language = code => code ? languages[code.toLowerCase()] || code : null;
const childName = () => state.settings?.childName || 'Crew';

/* ---------- layers: drawers and dialogs ---------- */

const layers = [];
function openLayer(node, { onClose, locked } = {}) {
  const layer = { node, onClose, locked: locked || (() => false) };
  layers.push(layer);
  $('#overlay').hidden = false;
  document.body.append(node);
  setTimeout(() => node.querySelector('[autofocus], input, button')?.focus(), 60);
  return () => closeLayer(layer);
}
function closeLayer(layer = layers[layers.length - 1]) {
  if (!layer) return;
  const index = layers.indexOf(layer);
  if (index < 0) return;
  layers.splice(index, 1);
  layer.node.remove();
  layer.onClose?.();
  if (layers.length === 0) $('#overlay').hidden = true;
}
$('#overlay').addEventListener('click', () => {
  const top = layers[layers.length - 1];
  if (top && !top.locked()) closeLayer(top);
});
document.addEventListener('keydown', event => {
  const top = layers[layers.length - 1];
  if (event.key === 'Escape' && top && !top.locked()) closeLayer(top);
});

function dialog({ title, subtitle, body, foot, small, head }) {
  const node = el('div', { class: `dialog ${small ? 'small' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('div', { class: 'dialog-head' },
      el('h2', { text: title }),
      subtitle && el('p', { text: subtitle }),
      head,
      el('button', { class: 'close', 'aria-label': 'Close', onclick: () => closeLayer() }, icon('x'))),
    el('div', { class: 'dialog-body' }, body),
    foot && el('div', { class: 'dialog-foot' }, foot));
  return node;
}

function confirmBox({ title, text, ok = 'Yes', danger = false }) {
  return new Promise(resolve => {
    let answered = false;
    const answer = value => {
      answered = true;
      close();
      resolve(value);
    };
    const close = openLayer(dialog({
      title,
      small: true,
      body: el('p', { class: 'about', style: { fontSize: '16px', margin: 0 }, text }),
      foot: el('div', { class: 'right' },
        el('button', { class: 'btn btn-ghost', onclick: () => answer(false) }, 'Not now'),
        el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, autofocus: true, onclick: () => answer(true) }, ok))
    }), { onClose: () => { if (!answered) resolve(false); } });
  });
}

/* ---------- pictures of tonies ---------- */

const kindInfo = {
  official: { badge: 'Official', emoji: '🎧', color: '#58b8ff' },
  custom: { badge: 'Made by us ✨', emoji: '🧸', color: '#ffc94d' },
  creative: { badge: 'Creative', emoji: '🎨', color: '#ff6fae' },
  system: { badge: 'Box sound', emoji: '🔔', color: '#22c09a' },
  mystery: { badge: 'Mystery', emoji: '🎁', color: '#7c5cff' },
  broken: { badge: 'Needs help', emoji: '🩹', color: '#e8456a' }
};

function stage(tonie, { badge = false } = {}) {
  const info = kindInfo[tonie.kind] || kindInfo.mystery;
  const color = tonie.color || info.color;
  const node = el('div', {
    class: 'stage',
    style: { background: `radial-gradient(circle at 50% 112%, #fff 0 30%, transparent 31%), linear-gradient(160deg, ${color}33, ${color}14 60%, #fff5fb)` }
  });
  if (badge) node.append(el('span', { class: `badge badge-${tonie.kind} stage-badge`, text: info.badge }));
  const emojiFigure = () => el('div', { class: 'emoji-figure figure', style: { '--c': color }, text: tonie.emoji || info.emoji });
  if (tonie.image && !tonie.emoji) {
    /* a photo on this Mac (or a preview) is used as-is; a shop picture goes through our cache */
    const local = /^(blob:|data:|\/)/.test(tonie.image);
    const img = el('img', { class: 'figure', alt: '', loading: 'lazy', src: local ? tonie.image : `/api/image?url=${encodeURIComponent(tonie.image)}` });
    img.addEventListener('error', () => img.replaceWith(emojiFigure()));
    node.append(img);
  } else {
    node.append(emojiFigure());
    node.append(el('span', { class: 'sparkle-deco', style: { right: '22%', top: '18px' }, html: star(16) }));
    node.append(el('span', { class: 'sparkle-deco', style: { left: '20%', top: '46px' }, html: star(11) }));
  }
  return node;
}

function tonieCard(tonie, index = 0) {
  const meta = [];
  if (tonie.chapters) meta.push(el('span', {}, icon('music'), ` ${tonie.chapters} ${tonie.chapters === 1 ? 'chapter' : 'chapters'}`));
  if (tonie.seconds) meta.push(el('span', {}, icon('clock'), ` ${minutes(tonie.seconds)}`));
  return el('button', { class: 'tonie', style: { animationDelay: `${Math.min(index, 20) * 35}ms` }, onclick: () => openTonie(tonie) },
    stage(tonie, { badge: true }),
    el('div', { class: 'tonie-body' },
      el('div', { class: 'tonie-title', text: tonie.title }),
      tonie.tagName && el('div', { class: 'tonie-meta' }, icon('tag'), tonie.tagName),
      el('div', { class: 'tonie-meta' }, meta),
      tonie.problem === 'incomplete' && el('span', { class: 'badge badge-warn', text: 'Not fully downloaded' })));
}

/* ---------- header ---------- */

function sprinkleStars() {
  const box = $('.stars');
  for (let placed = 0; placed < 60;) {
    const left = Math.random() * 100;
    const top = Math.random() * 85;
    if (left < 44 && top > 22 && top < 78) continue;
    const size = 4 + Math.random() * 10;
    box.append(el('span', {
      html: star(size, Math.random() < 0.2 ? '#ffd76a' : '#fff6d6'),
      style: { left: `${left}%`, top: `${top}%`, animationDelay: `${Math.random() * 3.6}s`, animationDuration: `${2.4 + Math.random() * 3}s` }
    }));
    placed++;
  }
}

function renderHeader() {
  document.title = "Crew's Tonie Box";
  $('#title').textContent = `${childName()}'s Tonie Box`;
  const count = $('#shelf-count');
  count.hidden = !state.shelf;
  count.textContent = state.shelf;

  const pill = $('#card-pill');
  const current = card();
  pill.hidden = !current;
  if (!current) return;
  const used = current.totalBytes ? 1 - current.freeBytes / current.totalBytes : 0;
  const name = state.cards.length > 1
    ? el('select', { 'aria-label': 'SD card', onchange: event => selectCard(event.target.value) },
      state.cards.map(c => el('option', { value: c.id, selected: c.id === current.id, text: c.name })))
    : el('span', { text: current.name });
  put(pill, icon('sd'), name,
    current.totalBytes ? el('span', { class: 'meter', title: `${bytes(current.freeBytes)} free` }, el('b', { style: { width: `${Math.round(used * 100)}%` } })) : null,
    current.totalBytes ? el('span', { class: 'free', text: `${bytes(current.freeBytes)} free` }) : null,
    current.removable && state.app?.eject ? el('button', { class: 'btn btn-glass btn-small', onclick: eject }, icon('eject'), 'Eject') : null,
    current.manual ? el('button', { class: 'btn btn-glass btn-small', onclick: () => post(`/cards/${current.id}/forget`).then(refresh) }, icon('x'), 'Close') : null);
}

async function eject() {
  const current = card();
  if (!current) return;
  try {
    const result = await post(`/cards/${current.id}/eject`);
    if (result.ok) {
      state.ejected = current.name;
      toast(result.message, 'good');
      chime();
    } else {
      toast(result.message, 'bad', 7000);
    }
    refresh();
  } catch (error) {
    toast(error.message, 'bad');
  }
}

/* ---------- main page ---------- */

function renderMain() {
  const main = $('#main');
  if (!state.app) {
    put(main, skeletonGrid());
    return;
  }
  if (!card()) {
    put(main, noCard());
    return;
  }
  if (!state.tonies) {
    put(main, sectionHead(), skeletonGrid());
    return;
  }
  const query = state.search.trim().toLowerCase();
  const shown = state.tonies.filter(t =>
    (state.filter === 'all' || (state.filter === 'custom' ? t.kind === 'custom' : state.filter === 'official' ? t.kind === 'official' : !['custom', 'official'].includes(t.kind))) &&
    (!query || [t.title, t.series, t.tagName, t.uidPretty].some(v => v && v.toLowerCase().includes(query))));
  const grid = el('div', { class: 'grid' },
    el('button', { class: 'tonie add-card', onclick: () => openMake() },
      el('span', { class: 'plus' }, icon('plus')),
      'Make a new tonie',
      el('span', { class: 'hint', text: 'Stories, songs or your own voice' })),
    shown.map(tonieCard));
  const content = [sectionHead(), grid];
  if (state.tonies.length === 0) {
    content.push(el('div', { class: 'empty' },
      el('div', { class: 'art', html: teddy('happy', 110) }),
      el('h2', { text: 'This card is ready for magic' }),
      el('p', { text: `There are no tonies on it yet. Put a tonie on the Toniebox once so it knows the tag, or make one here for ${childName()}.` })));
  } else if (shown.length === 0) {
    content.push(el('p', { class: 'hint', style: { textAlign: 'center', marginTop: '26px', fontSize: '16px' }, text: 'No tonies match. Try another word or filter.' }));
  }
  put(main, ...content);
}

function sectionHead() {
  const counts = state.tonies ? {
    all: state.tonies.length,
    custom: state.tonies.filter(t => t.kind === 'custom').length,
    official: state.tonies.filter(t => t.kind === 'official').length,
    other: state.tonies.filter(t => !['custom', 'official'].includes(t.kind)).length
  } : {};
  const chip = (key, label) => el('button', {
    class: `chip ${state.filter === key ? 'on' : ''}`,
    onclick: () => { state.filter = key; renderMain(); }
  }, label, counts[key] !== undefined ? ` ${counts[key]}` : '');
  const search = el('input', { type: 'search', placeholder: 'Find a tonie', value: state.search, 'aria-label': 'Find a tonie' });
  search.addEventListener('input', () => {
    state.search = search.value;
    renderMain();
    const again = $('.search input');
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  });
  return el('div', { class: 'section-head' },
    el('h2', {}, `${childName()}'s tonies`, state.tonies ? el('small', { text: `${state.tonies.length} on the card` }) : null),
    el('div', { class: 'filters' },
      chip('all', 'All'), chip('custom', 'Made by us'), chip('official', 'Official'), counts.other ? chip('other', 'Others') : null,
      el('label', { class: 'search' }, icon('search'), search)));
}

function skeletonGrid() {
  return el('div', { class: 'grid' }, Array.from({ length: 6 }, () =>
    el('div', { class: 'tonie', style: { height: '262px' } }, el('div', { class: 'skeleton', style: { height: '100%', borderRadius: '28px' } }))));
}

function noCard() {
  const pickFolder = state.app.dialogs
    ? el('button', { class: 'btn btn-soft', onclick: addFolder }, icon('folder'), 'Open a card folder')
    : null;
  return el('div', { class: 'empty' },
    el('div', { class: 'art' }, el('span', { html: sdArt(130) }), el('span', { class: 'zzz', text: 'z z z' })),
    el('h2', { text: state.ejected ? 'Bye bye, SD card!' : 'Pop in the Toniebox SD card' }),
    el('p', { text: state.ejected
      ? 'It is safe to take the card out now. Put it back into the Toniebox, place a tonie on top and press an ear.'
      : `Put the SD card from the Toniebox into this Mac (with a card reader if you need one). ${childName()}'s tonies show up here by themselves.` }),
    el('div', { class: 'waiting' }, el('span', { class: 'spinner' }), el('span', { class: 'dots', text: 'Looking for the card' })),
    el('div', { class: 'steps-row' },
      el('div', { class: 'mini-step' }, el('b', { text: '1' }), 'Put the SD card into your Mac'),
      el('div', { class: 'mini-step' }, el('b', { text: '2' }), 'Pick a tonie and add stories or songs'),
      el('div', { class: 'mini-step' }, el('b', { text: '3' }), 'Eject, put the card back and listen')),
    el('div', { class: 'button-row' },
      el('button', { class: 'btn btn-primary', onclick: () => openMake({ toMac: true }) }, icon('wand'), 'Make a tonie for later'),
      pickFolder));
}

async function addFolder() {
  try {
    const result = await post('/cards/add-folder', {});
    if (result.added) {
      state.cardId = result.id;
      await refresh();
    }
  } catch (error) {
    toast(error.message, 'bad', 6000);
  }
}

/* ---------- data ---------- */

async function refresh() {
  try {
    const next = await api('/state');
    state.app = next.app;
    state.db = next.db;
    state.settings = next.settings;
    state.shelf = next.shelf;
    state.cards = next.cards;
    setSounds(next.settings.sounds);
    if (!card()) {
      state.cardId = next.cards[0]?.id || null;
      state.signature = null;
      state.tonies = null;
    }
    if (card()) state.ejected = null;
    renderHeader();
    const current = card();
    if (current && current.signature !== state.signature) {
      state.signature = current.signature;
      await loadTonies();
    } else if (!current) {
      renderMain();
    }
  } catch (error) {
    console.warn(error);
  }
}

async function loadTonies() {
  const current = card();
  if (!current) return;
  if (!state.tonies) renderMain();
  try {
    state.tonies = await api(`/cards/${current.id}/tonies`);
  } catch (error) {
    state.tonies = [];
    toast(error.message, 'bad');
  }
  renderMain();
}

function selectCard(id) {
  state.cardId = id;
  state.signature = null;
  state.tonies = null;
  refresh();
}

/* ---------- listening ---------- */

const player = $('#player');
let playing = null;
/* tonie chapters come as Ogg Opus where the web view plays that, else as WAV; a failed Ogg is not tried again */
let oggWorks = !!player.canPlayType('audio/ogg; codecs="opus"');

function stopPlaying() {
  player.pause();
  player.removeAttribute('src');
  if (playing) {
    playing.button.classList.remove('loading');
    put(playing.button, icon('play'));
    playing.row?.classList.remove('playing');
  }
  playing = null;
}

/* source: a URL, or a function giving the URL of a tonie chapter for 'ogg' or 'wav' */
function playButton(source, row, label) {
  const button = el('button', { class: 'play', 'aria-label': `Listen to ${label}` }, icon('play'));
  button.addEventListener('click', event => {
    event.stopPropagation();
    if (playing && playing.button === button) {
      stopPlaying();
      return;
    }
    stopPlaying();
    const formats = typeof source === 'function' ? (oggWorks ? ['ogg', 'wav'] : ['wav']) : [null];
    playing = { button, row: row(), source, formats, attempt: -1 };
    button.classList.add('loading');
    playing.row?.classList.add('playing');
    nextSource();
  });
  return button;
}

function nextSource() {
  const current = playing;
  current.attempt++;
  const format = current.formats[current.attempt];
  current.url = new URL(typeof current.source === 'function' ? current.source(format) : current.source, location.href).href;
  player.src = current.url;
  const url = current.url;
  player.play().catch(error => {
    if (error.name !== 'AbortError') failed(url);
  });
}

function failed(url) {
  if (!playing || playing.url !== url) return;
  if (playing.formats[playing.attempt] === 'ogg') oggWorks = false;
  if (playing.attempt + 1 < playing.formats.length) {
    nextSource();
  } else {
    stopPlaying();
    toast('This one cannot be played here, but it will work on the tonie.', 'bad');
  }
}

player.addEventListener('playing', () => {
  if (!playing) return;
  playing.button.classList.remove('loading');
  put(playing.button, icon('pause'));
});
player.addEventListener('ended', stopPlaying);
player.addEventListener('error', () => failed(player.currentSrc || player.src));

/* ---------- asking for a little text ---------- */

function askText({ title, label, value = '', placeholder = '', ok = 'Save', max = 40 }) {
  return new Promise(resolve => {
    let answered = false;
    const input = el('input', { class: 'input big', value, placeholder, maxlength: max, autofocus: true });
    const answer = result => {
      answered = true;
      close();
      resolve(result);
    };
    input.addEventListener('keydown', event => { if (event.key === 'Enter') answer(input.value.trim()); });
    const close = openLayer(dialog({
      title,
      small: true,
      body: el('div', { class: 'field' }, el('label', { text: label }), input),
      foot: el('div', { class: 'right' },
        el('button', { class: 'btn btn-ghost', onclick: () => answer(null) }, 'Cancel'),
        el('button', { class: 'btn btn-primary', onclick: () => answer(input.value.trim()) }, icon('check'), ok))
    }), { onClose: () => { if (!answered) resolve(null); } });
    setTimeout(() => input.select(), 80);
  });
}

/* ---------- a tonie up close ---------- */

async function openTonie(tonie) {
  const current = card();
  const body = el('div', {}, el('div', { class: 'empty' }, el('span', { class: 'spinner' })));
  const node = el('div', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': tonie.title },
    el('div', { class: 'drawer-head' },
      el('div', { class: 'hero' }, stage(tonie),
        el('div', {},
          el('h2', { text: tonie.title }),
          tonie.series && tonie.series !== tonie.title ? el('div', { class: 'series', text: tonie.series }) : null,
          el('div', { class: 'badges' },
            el('span', { class: `badge badge-${tonie.kind}`, text: (kindInfo[tonie.kind] || kindInfo.mystery).badge }),
            tonie.language ? el('span', { class: 'badge badge-lang', text: language(tonie.language) }) : null))),
      el('button', { class: 'close', 'aria-label': 'Close', onclick: () => closeLayer() }, icon('x'))),
    el('div', { class: 'drawer-body' }, body));
  openLayer(node, { onClose: stopPlaying });

  let detail;
  try {
    detail = await api(`/cards/${current.id}/tonies/${tonie.uid}`);
  } catch (error) {
    put(body, el('div', { class: 'note bad' }, icon('info'), error.message));
    return;
  }
  const t = detail.tonie;
  const seconds = detail.chapterSeconds || [];
  const parts = [];

  const tagName = el('span');
  const tagButton = el('button', {
    class: 'btn btn-ghost btn-small', onclick: async () => {
      const name = await askText({ title: t.tagName ? 'Rename this tag' : 'Name this tag', label: 'A nickname, so you know which tonie it is', value: t.tagName || '', placeholder: 'Like “the red star tonie”' });
      if (name === null) return;
      await post(`/cards/${current.id}/tags/${t.uid}/name`, { name });
      t.tagName = name.trim();
      showTagName();
      loadTonies();
    }
  });
  const showTagName = () => {
    tagName.textContent = t.tagName ? `“${t.tagName}”` : '';
    put(tagButton, icon('edit'), t.tagName ? 'Rename tag' : 'Name this tag');
  };
  showTagName();
  parts.push(el('div', { class: 'tag-line' }, icon('tag'), 'Tag', el('code', { text: t.uidPretty }), tagName, tagButton));

  if (t.problem === 'incomplete') {
    parts.push(el('div', { class: 'note' }, icon('info'), 'This tonie was not fully downloaded by the Toniebox. When the box is online it finishes the download, or you can put your own stories on it.'));
  } else if (t.kind === 'broken') {
    parts.push(el('div', { class: 'note bad' }, icon('info'), 'This file cannot be read. When the Toniebox is online it usually downloads it again. You can also put new stories on this tag.'));
  } else if (t.kind === 'mystery') {
    parts.push(el('div', { class: 'note info' }, icon('info'), 'This one is not in the tonie list yet. It may be a Creative-Tonie recording or a very new tonie. You can listen to it and give it a name.'));
  } else if (t.kind === 'official' && !t.exactMatch) {
    parts.push(el('div', { class: 'note info' }, icon('info'), 'The name comes from the tonie list, but this audio is a different version of it.'));
  }

  if (t.chapters > 0 && t.kind !== 'broken') {
    const list = el('ol', { class: 'chapters' });
    for (let i = 0; i < t.chapters; i++) {
      const name = t.chapterTitles?.[i] || `Chapter ${i + 1}`;
      const row = el('li', {});
      row.append(
        playButton(format => `/api/cards/${current.id}/tonies/${t.uid}/chapters/${i}.${format}`, () => row, name),
        el('span', { class: 'num', text: i + 1 }),
        el('span', { class: 'name', text: name, title: name }),
        el('span', { class: 'len', text: seconds[i] !== undefined ? duration(seconds[i]) : '' }));
      list.append(row);
    }
    parts.push(el('div', { class: 'label-line', style: { marginBottom: '8px' } }, `${t.chapters} ${t.chapters === 1 ? 'chapter' : 'chapters'} · ${duration(t.seconds)}`), list);
  }

  const action = (color, iconName, title, text, onClick, wide) =>
    el('button', { class: `action ${wide ? 'wide' : ''}`, onclick: onClick },
      el('span', { class: `ic ${color}` }, icon(iconName)), el('span', {}, title, el('small', { text })));

  const actions = el('div', { class: 'actions' },
    action('ic-gold', 'wand', 'Put new stories on it', 'Your own songs, stories or voice', () => { closeLayer(); openMake({ target: t }); }, true),
    t.kind !== 'broken' ? action('ic-purple', 'shelf', 'Keep a copy', 'Saved on this Mac', () => backup(t)) : null,
    t.kind !== 'broken' ? action('ic-mint', 'music', 'Save as songs', state.app.m4a ? 'For the Music app' : 'Audio files on this Mac', () => exportSongs(`/cards/${current.id}/tonies/${t.uid}/export`)) : null,
    t.kind === 'custom' ? action('ic-pink', 'edit', 'Name & look', 'Title, emoji and color', () => renameTonie(t)) : null,
    action('ic-red', 'trash', t.kind === 'custom' || t.kind === 'broken' ? 'Take it off the card' : 'Give back the original',
      t.kind === 'custom' || t.kind === 'broken' ? 'A copy stays on this Mac' : 'The box downloads it again when online', () => removeTonie(t)));
  const small = actions.querySelectorAll('.action:not(.wide)');
  if (small.length % 2) small[small.length - 1].classList.add('wide');
  parts.push(actions);

  parts.push(el('details', { class: 'grownups' },
    el('summary', { text: 'Details for grown-ups' }),
    el('dl', {},
      el('dt', { text: 'Tag ID' }), el('dd', { text: t.uidPretty }),
      el('dt', { text: 'File' }), el('dd', { text: `CONTENT/${t.folder}/${t.file}` }),
      el('dt', { text: 'Size' }), el('dd', { text: bytes(t.size) }),
      el('dt', { text: 'Audio ID' }), el('dd', { text: `${t.audioId} (0x${t.audioId.toString(16).toUpperCase()})` }),
      el('dt', { text: 'Checksum' }), el('dd', { text: t.hash || '–' }),
      t.web ? el('dt', { text: 'Shop page' }) : null, t.web ? el('dd', { text: t.web }) : null)));

  put(body, ...parts);
}

async function backup(tonie) {
  try {
    await follow(await post(`/cards/${tonie.cardId}/tonies/${tonie.uid}/backup`));
    toast(`A copy of “${tonie.title}” is on your shelf.`, 'good');
    pop();
    refresh();
  } catch (error) {
    toast(error.message, 'bad');
  }
}

async function exportSongs(path) {
  const format = state.app.m4a ? 'm4a' : 'ogg';
  toast('Saving the chapters as songs…');
  try {
    const result = await follow(await post(path, { format }));
    toast('The songs are in your Music folder.', 'good');
    chime();
    post('/reveal', { path: result.folder }).catch(() => {});
  } catch (error) {
    toast(error.message, 'bad', 7000);
  }
}

async function removeTonie(tonie) {
  const custom = tonie.kind === 'custom' || tonie.kind === 'broken';
  const ok = await confirmBox({
    title: custom ? 'Take it off the card?' : 'Give back the original?',
    text: custom
      ? `“${tonie.title}” is removed from the SD card. A copy stays on your shelf, so you can put it back any time.`
      : `The file is removed from the SD card. The next time the Toniebox is online and this tonie is placed on it, it downloads “${tonie.title}” again. A copy stays on your shelf.`,
    ok: custom ? 'Take it off' : 'Remove it',
    danger: true
  });
  if (!ok) return;
  try {
    await follow(await post(`/cards/${tonie.cardId}/tonies/${tonie.uid}/remove`));
    closeLayer();
    toast('Done. There is a copy on your shelf.', 'good');
    refresh();
  } catch (error) {
    toast(error.message, 'bad');
  }
}

function renameTonie(tonie) {
  const hasPhoto = !!tonie.image && tonie.image.startsWith('/api/cover');
  const look = {
    title: tonie.title, emoji: tonie.emoji || '🧸', color: tonie.color || '#ffc94d',
    usePhoto: hasPhoto, photoRef: hasPhoto ? 'keep' : null, previewUrl: hasPhoto ? tonie.image : null
  };
  const titleInput = el('input', { class: 'input big', value: look.title, maxlength: 60 });
  const close = openLayer(dialog({
    title: 'Name & look',
    small: true,
    body: el('div', {}, el('div', { class: 'field' }, el('label', { text: 'Name' }), titleInput), lookPicker(look)),
    foot: el('div', { class: 'right' },
      el('button', { class: 'btn btn-ghost', onclick: () => close() }, 'Cancel'),
      el('button', {
        class: 'btn btn-primary', onclick: async () => {
          await post(`/cards/${tonie.cardId}/tonies/${tonie.uid}/rename`, {
            title: titleInput.value.trim() || tonie.title, emoji: look.emoji, color: look.color,
            picture: look.usePhoto ? look.photoRef : ''
          });
          close();
          closeLayer();
          pop();
          loadTonies();
        }
      }, icon('check'), 'Save'))
  }));
}

/* ---------- emoji and color picker ---------- */

const emojis = [
  '🧸', '🦄', '🐻', '🐰', '🦊', '🐶', '🐱', '🐼', '🦁', '🐯', '🐨', '🐮', '🐷', '🐵', '🦉',
  '🐢', '🐙', '🦈', '🐳', '🐬', '🦕', '🦖', '🐉', '🦋', '🐝', '🐞', '🐧', '🦜', '🦩', '🦔',
  '🐸', '🐴', '🦓', '🦒', '🐘', '🌈', '⭐', '🌟', '🌙', '☀️', '☁️', '⛄', '🌻', '🌸', '🍄',
  '🚀', '🛸', '✈️', '🚂', '🚒', '🚗', '⛵', '🏰', '🎪', '🎠', '🧚', '🧜‍♀️', '🧙', '🦸', '🦸‍♀️',
  '🎈', '🎁', '🎵', '🥁', '🎸', '📚', '🎂', '🍦', '🍭', '👑', '💎', '❤️'];
const palette = ['#ffc94d', '#ff6fae', '#7c5cff', '#58b8ff', '#22c09a', '#ff8a65', '#b388ff', '#8bd346'];

/* look: { emoji, color, usePhoto, photoRef, previewUrl }
   photoRef is an uploaded photo's id, or 'keep' for a photo the tonie already has */
function lookPicker(look, onChange = () => {}) {
  const emojiGrid = el('div', { class: 'emoji-grid' });
  const colorRow = el('div', { class: 'color-row' });
  const photoRow = el('div', { class: 'photo-row' });
  const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const result = await api(`/covers/upload?name=${encodeURIComponent(file.name)}`, { method: 'PUT', raw: file });
      if (look.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(look.previewUrl);
      look.photoRef = result.id;
      look.previewUrl = URL.createObjectURL(file);
      look.usePhoto = true;
      draw();
      onChange();
      pop();
    } catch (error) {
      toast(error.message, 'bad');
    }
  });
  const pickEmoji = emoji => { look.emoji = emoji; look.usePhoto = false; draw(); onChange(); pop(); };
  const draw = () => {
    put(emojiGrid, ...emojis.map(e => el('button', {
      class: !look.usePhoto && e === look.emoji ? 'on' : '', type: 'button', 'aria-label': e, text: e,
      onclick: () => pickEmoji(e)
    })));
    put(colorRow, ...palette.map(c => el('button', {
      class: c === look.color ? 'on' : '', type: 'button', 'aria-label': `Color ${c}`, style: { background: c },
      onclick: () => { look.color = c; draw(); onChange(); }
    })));
    put(photoRow,
      look.previewUrl ? el('button', {
        class: `photo-thumb ${look.usePhoto ? 'on' : ''}`, type: 'button', 'aria-label': 'Use this photo',
        onclick: () => { look.usePhoto = true; draw(); onChange(); }
      }, el('img', { src: look.previewUrl, alt: '' })) : null,
      el('button', { class: 'btn btn-soft btn-small', type: 'button', onclick: () => fileInput.click() },
        icon('file'), look.previewUrl ? 'Choose another photo' : 'Use your own photo'),
      fileInput);
  };
  draw();
  return el('div', {},
    el('div', { class: 'field' }, el('label', { text: 'Pick a picture' }), emojiGrid),
    el('div', { class: 'field' }, el('label', { text: 'or your own photo' }), photoRow),
    el('div', { class: 'field' }, el('label', { text: 'Pick a color' }), colorRow));
}

/* ---------- choosing a tag ---------- */

function targetPicker(selected, onPick, { allowMac = true, excludeUid } = {}) {
  const current = card();
  const box = el('div', {});
  const tonies = (state.tonies || []).filter(t => t.uid !== excludeUid);
  const uidInput = el('input', { class: 'input', placeholder: 'Like E0:04:03:50:1E:E9:18:F2', value: selected.type === 'new' ? selected.uid : '', 'aria-label': 'Tag ID' });
  const uidHint = el('div', { class: 'hint', text: 'The tag ID has 16 letters and numbers. Apps like “NFC Tools” on a phone can read it from the tonie.' });
  const draw = () => {
    const cards = tonies.map(t => el('button', {
      class: `pick ${selected.type === 'tag' && selected.uid === t.uid ? 'on' : ''}`, type: 'button',
      onclick: () => { onPick({ type: 'tag', uid: t.uid, existing: t }); draw(); }
    }, stage(t), el('div', { class: 'label', text: t.title }), el('small', { text: t.tagName || t.uidPretty })));
    put(box, 
      current ? el('div', { class: 'label-line', style: { marginBottom: '10px' } }, `Tags on ${current.name}`) : null,
      current && tonies.length ? el('div', { class: 'pick-grid' }, cards) : null,
      current && !tonies.length ? el('div', { class: 'note info' }, icon('info'), 'No tags on this card yet. Put a tonie on the Toniebox once, then its tag shows up here. Or type the tag ID below.') : null,
      current ? el('div', { class: 'or', text: 'or a tag by its ID' }) : null,
      current ? el('div', { class: 'field' }, uidInput, uidHint) : null,
      allowMac ? el('div', { class: 'or', text: current ? 'or' : 'no SD card right now' }) : null,
      allowMac ? el('div', { class: 'choice-row' }, el('button', {
        class: `choice ${selected.type === 'mac' ? 'on' : ''}`, type: 'button',
        onclick: () => { onPick({ type: 'mac' }); draw(); }
      }, '💾 Keep it on this Mac for later', el('small', { text: 'It goes on your shelf, and onto a tonie whenever you like.' }))) : null);
  };
  let check = 0;
  uidInput.addEventListener('input', async () => {
    const mine = ++check;
    const value = uidInput.value.trim();
    if (!value) {
      uidHint.className = 'hint';
      uidHint.textContent = 'The tag ID has 16 letters and numbers.';
      return;
    }
    const result = await api(`/uid/${encodeURIComponent(value.replace(/[^0-9a-fA-F]/g, ''))}`).catch(() => ({ valid: false }));
    if (mine !== check) return;
    if (result.valid) {
      const existing = tonies.find(t => t.uid === result.uid);
      uidHint.className = result.tonieLike ? 'hint good' : 'hint';
      uidHint.textContent = existing
        ? `That is “${existing.title}”.`
        : result.tonieLike ? `Looks great: ${result.pretty}` : `${result.pretty} (tonie tags usually start with E0:04)`;
      onPick({ type: existing ? 'tag' : 'new', uid: result.uid, existing });
      box.querySelectorAll('.pick.on, .choice.on').forEach(n => n.classList.remove('on'));
    } else {
      uidHint.className = 'hint bad';
      uidHint.textContent = 'That does not look like a tag ID yet.';
      onPick({ type: 'none' });
    }
  });
  draw();
  return box;
}

/* ---------- making a tonie ---------- */

/* the make wizard that is open, so sounds dropped on the window can go into it */
let activeWizard = null;

async function readEntry(entry) {
  /* the path inside the dropped folder keeps "CD 1/03" before "CD 2/01" */
  if (entry.isFile) return [await new Promise((resolve, reject) => entry.file(file => resolve(Object.assign(file, { sortPath: entry.fullPath })), reject))];
  if (!entry.isDirectory) return [];
  const reader = entry.createReader();
  const all = [];
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    all.push(...batch);
  }
  return (await Promise.all(all.map(readEntry))).flat();
}

/* files and whole folders from a drop; the entries have to be taken before the first await */
function droppedFiles(transfer) {
  if (!transfer || ![...transfer.types].includes('Files')) return Promise.resolve([]);
  const entries = [...transfer.items].map(item => item.webkitGetAsEntry?.()).filter(Boolean);
  return entries.length ? Promise.all(entries.map(readEntry)).then(lists => lists.flat()) : Promise.resolve([...transfer.files]);
}

/* pick chapters out of tonies already on the card or shelf, to mix into a new tonie */
async function openChapterPicker(onAdd) {
  const current = card();
  const body = el('div', {}, el('div', { class: 'empty' }, el('span', { class: 'spinner' })));
  const close = openLayer(dialog({
    title: 'Add from a tonie',
    subtitle: 'Take chapters from tonies you already have and mix them into this one',
    body,
    foot: el('div', { class: 'right' }, el('button', { class: 'btn btn-primary', onclick: () => close() }, icon('check'), 'Done'))
  }));

  let shelf = [];
  try {
    shelf = await api('/shelf');
  } catch (error) {
    /* the shelf is a bonus here */
  }
  const sources = [
    ...(current ? (state.tonies || []).filter(t => t.kind !== 'broken' && t.chapters > 0).map(t => ({
      kind: t.kind, title: t.title, chapters: t.chapters, image: t.image, emoji: t.emoji, color: t.color, where: 'on the card',
      detail: () => api(`/cards/${current.id}/tonies/${t.uid}`).then(d => ({ seconds: d.chapterSeconds || [], titles: d.tonie.chapterTitles || [] })),
      stage: n => post(`/cards/${current.id}/tonies/${t.uid}/chapters/${n}/stage`)
    })) : []),
    ...shelf.filter(s => s.chapters > 0).map(s => ({
      kind: s.kind || 'custom', title: s.title, chapters: s.chapters, image: s.image, emoji: s.emoji || '🧸', color: s.color, where: 'on your shelf',
      detail: () => api(`/shelf/${s.id}`).then(d => ({ seconds: d.chapterSeconds || [], titles: d.chapterTitles || [] })),
      stage: n => post(`/shelf/${s.id}/chapters/${n}/stage`)
    }))
  ];

  if (!sources.length) {
    put(body, el('div', { class: 'note info' }, icon('info'), 'There are no other tonies to take chapters from yet. Make one first, or add sounds from files.'));
    return;
  }

  const list = el('div', { class: 'source-list' });
  put(body, list);
  list.append(...sources.map(source => {
    const chapters = el('ol', { class: 'chapters', hidden: true });
    const chev = el('span', { class: 'i chev', html: icons.next });
    let loaded = false;
    const addChapter = async (index, name, seconds, button) => {
      button.disabled = true;
      button.classList.add('loading');
      try {
        const staged = await source.stage(index);
        onAdd([staged]);
        put(button, icon('check'), 'Added');
        pop();
      } catch (error) {
        button.disabled = false;
        button.classList.remove('loading');
        toast(error.message, 'bad');
      }
    };
    const toggle = async () => {
      if (!chapters.hidden) {
        chapters.hidden = true;
        chev.style.transform = '';
        return;
      }
      chapters.hidden = false;
      chev.style.transform = 'rotate(90deg)';
      if (loaded) return;
      loaded = true;
      put(chapters, el('li', {}, el('span', { class: 'spinner' })));
      try {
        const { seconds, titles } = await source.detail();
        const rows = [];
        rows.push(el('li', { class: 'add-all' },
          el('span', { class: 'name', text: 'All chapters' }),
          el('button', {
            class: 'btn btn-soft btn-small', onclick: async event => {
              const button = event.currentTarget;
              button.disabled = true;
              for (let i = 0; i < source.chapters; i++) {
                try {
                  onAdd([await source.stage(i)]);
                } catch (error) {
                  toast(error.message, 'bad');
                  break;
                }
              }
              put(button, icon('check'), 'Added');
              pop();
            }
          }, icon('plus'), 'Add all')));
        for (let i = 0; i < source.chapters; i++) {
          const name = titles[i] || `Chapter ${i + 1}`;
          const button = el('button', { class: 'btn btn-soft btn-small' }, icon('plus'), 'Add');
          button.addEventListener('click', () => addChapter(i, name, seconds[i], button));
          rows.push(el('li', {},
            el('span', { class: 'num', text: i + 1 }),
            el('span', { class: 'name', text: name, title: name }),
            el('span', { class: 'len', text: seconds[i] !== undefined ? duration(seconds[i]) : '' }),
            button));
        }
        put(chapters, ...rows);
      } catch (error) {
        put(chapters, el('li', {}, el('span', { class: 'name', text: error.message })));
      }
    };
    return el('div', { class: 'source' },
      el('button', { class: 'source-head', onclick: toggle },
        stage({ kind: source.kind, image: source.image, emoji: source.emoji, color: source.color }),
        el('div', { class: 'info' }, el('b', { text: source.title, title: source.title }),
          el('span', { text: `${source.chapters} ${source.chapters === 1 ? 'chapter' : 'chapters'} · ${source.where}` })),
        chev),
      chapters);
  }));
}

/* free public-domain audiobooks (LibriVox) to import straight into a tonie */
function openLibrivox(onAdd) {
  const results = el('div', { class: 'source-list' });
  const status = el('div', { class: 'hint', style: { textAlign: 'center', marginTop: '20px' } }, 'Search for a story or an author above.');
  const search = el('input', { type: 'search', class: 'input', placeholder: 'e.g. Peter Rabbit, Grimm, Aesop', autofocus: true });
  let seq = 0;

  const run = async () => {
    const query = search.value.trim();
    const mine = ++seq;
    if (!query) {
      put(results);
      status.hidden = false;
      status.textContent = 'Search for a story or an author above.';
      return;
    }
    status.hidden = false;
    put(results, el('div', { class: 'empty', style: { padding: '20px' } }, el('span', { class: 'spinner' })));
    status.textContent = '';
    let books;
    try {
      books = await api(`/import/search?q=${encodeURIComponent(query)}`);
    } catch (error) {
      if (mine === seq) {
        put(results);
        status.textContent = 'Could not reach LibriVox. Check your internet.';
      }
      return;
    }
    if (mine !== seq) return;
    put(results);
    if (!books.length) {
      status.textContent = `Nothing found for “${query}”. Try another word.`;
      return;
    }
    status.hidden = true;
    put(results, ...books.map(bookRow));
  };

  function bookRow(book) {
    const chapters = el('ol', { class: 'chapters', hidden: true });
    const chev = el('span', { class: 'i chev', html: icons.next });
    let loaded = false;
    const toggle = async () => {
      if (!chapters.hidden) {
        chapters.hidden = true;
        chev.style.transform = '';
        return;
      }
      chapters.hidden = false;
      chev.style.transform = 'rotate(90deg)';
      if (loaded) return;
      loaded = true;
      put(chapters, el('li', {}, el('span', { class: 'spinner' })));
      let tracks;
      try {
        tracks = await api(`/import/${encodeURIComponent(book.id)}/tracks`);
      } catch (error) {
        tracks = [];
      }
      if (!tracks.length) {
        put(chapters, el('li', {}, el('span', { class: 'name', text: 'Could not list the chapters.' })));
        return;
      }
      const add = async (track, button) => {
        button.disabled = true;
        button.classList.add('loading');
        try {
          onAdd([await post('/import/track', { url: track.url, title: track.title })]);
          put(button, icon('check'), 'Added');
          pop();
        } catch (error) {
          button.disabled = false;
          button.classList.remove('loading');
          toast(error.message, 'bad', 6000);
        }
      };
      const rows = [el('li', { class: 'add-all' },
        el('span', { class: 'name', text: `All ${tracks.length} chapters` }),
        el('button', {
          class: 'btn btn-soft btn-small', onclick: async event => {
            const button = event.currentTarget;
            button.disabled = true;
            put(button, el('span', { class: 'spinner' }), 'Getting…');
            let n = 0;
            for (const track of tracks) {
              try {
                onAdd([await post('/import/track', { url: track.url, title: track.title })]);
                n++;
              } catch (error) {
                toast(error.message, 'bad', 6000);
                break;
              }
            }
            put(button, icon('check'), `Added ${n}`);
            pop();
          }
        }, icon('plus'), 'Add all'))];
      for (const track of tracks) {
        const button = el('button', { class: 'btn btn-soft btn-small' }, icon('plus'), 'Add');
        button.addEventListener('click', () => add(track, button));
        rows.push(el('li', {}, el('span', { class: 'name', text: track.title, title: track.title }),
          el('span', { class: 'len', text: track.seconds ? duration(track.seconds) : '' }), button));
      }
      put(chapters, ...rows);
    };
    return el('div', { class: 'source' },
      el('button', { class: 'source-head', onclick: toggle },
        el('span', { class: 'i', html: icons.music, style: { color: 'var(--purple)', width: '28px', height: '28px' } }),
        el('div', { class: 'info' }, el('b', { text: book.title, title: book.title }),
          el('span', { text: [book.author, `${book.sections} ${book.sections === 1 ? 'chapter' : 'chapters'}`, book.seconds ? minutes(book.seconds) : ''].filter(Boolean).join(' · ') })),
        chev),
      chapters);
  }

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); });
  search.addEventListener('keydown', event => { if (event.key === 'Enter') { clearTimeout(timer); run(); } });

  openLayer(dialog({
    title: 'Free audiobooks',
    subtitle: 'Public-domain stories from LibriVox, read by volunteers',
    body: el('div', {}, el('label', { class: 'search', style: { display: 'flex', marginBottom: '4px' } }, icon('search'), search), status, results),
    foot: el('div', { class: 'right' },
      el('span', { class: 'hint', style: { marginRight: 'auto' }, text: 'LibriVox recordings are in the public domain.' }),
      el('button', { class: 'btn btn-primary', onclick: () => closeLayer() }, icon('check'), 'Done'))
  }));
}

function openMake({ target, toMac, files } = {}) {
  const current = card();
  const make = {
    step: target ? 2 : 1,
    target: target ? { type: 'tag', uid: target.uid, existing: target } : toMac || !current ? { type: 'mac' } : { type: 'none' },
    tracks: [],
    look: { title: target && target.kind === 'custom' ? target.title : '', emoji: target?.emoji || emojis[Math.floor(Math.random() * 15)], color: target?.color || palette[Math.floor(Math.random() * palette.length)], usePhoto: false, photoRef: null, previewUrl: null },
    keepAudioId: true,
    quality: state.settings?.bitRate || 96,
    job: null,
    busy: false
  };
  const stepNames = ['Pick a tonie', 'Add sounds', 'Name it', 'Magic!'];
  const stepsBar = el('div', { class: 'wizard-steps' });
  const body = el('div', {});
  const foot = el('div', { style: { display: 'flex', width: '100%', gap: '10px', alignItems: 'center' } });
  const node = dialog({ title: 'Make a new tonie', subtitle: 'Three little steps to a new story', body, foot, head: stepsBar });
  const close = openLayer(node, {
    locked: () => make.busy,
    onClose: () => {
      stopPlaying();
      if (activeWizard === self) activeWizard = null;
    }
  });

  const totalSeconds = () => make.tracks.reduce((sum, t) => sum + (t.seconds || 0), 0);
  const ready = () => make.tracks.length > 0 && make.tracks.every(t => t.id);

  /* sounds can arrive on any step: dropped on the window, picked, or uploaded */
  let showTracks = () => {};
  function addStaged(staged) {
    for (const file of staged) {
      make.tracks.push({ id: file.id, name: file.name, title: file.title, seconds: file.seconds });
    }
    if (staged.length) pop();
    showTracks();
  }

  async function uploadFiles(list) {
    const formats = state.app.formats;
    const visible = list.filter(f => !f.name.startsWith('.'));
    const usable = visible.filter(f => formats.some(ext => f.name.toLowerCase().endsWith(ext)));
    const skipped = visible.length - usable.length;
    if (skipped) toast(skipped === 1 ? '1 file is not a sound file, so it was skipped.' : `${skipped} files are not sound files, so they were skipped.`);
    const sortKey = f => naturalKey(f.sortPath || f.webkitRelativePath || f.name);
    usable.sort((a, b) => sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0);
    const placeholders = usable.map(f => ({ name: f.name, title: f.name.replace(/\.[^.]+$/, ''), uploading: true }));
    make.tracks.push(...placeholders);
    showTracks();
    let added = 0;
    await Promise.all(usable.map(async (file, i) => {
      try {
        const result = await api(`/files/upload?name=${encodeURIComponent(file.name)}`, { method: 'PUT', raw: file });
        Object.assign(placeholders[i], { id: result.id, title: result.title, seconds: result.seconds, uploading: false, track: result.track });
        added++;
      } catch (error) {
        const at = make.tracks.indexOf(placeholders[i]);
        if (at >= 0) make.tracks.splice(at, 1);
        toast(error.message, 'bad');
      }
    }));
    /* files from one drop that all have track numbers keep that order, unless they were moved meanwhile */
    const batch = placeholders.filter(p => p.id);
    const start = make.tracks.indexOf(batch[0]);
    if (batch.length > 1 && batch.every(p => p.track > 0) && batch.every((p, k) => make.tracks[start + k] === p)) {
      make.tracks.splice(start, batch.length, ...[...batch].sort((a, b) => a.track - b.track));
    }
    if (added) pop();
    showTracks();
  }

  const self = {
    busy: () => make.busy,
    accepting: () => make.step <= 3,
    close: () => close(),
    addFiles(list) {
      uploadFiles(list);
      if (make.step === 1) toast('Got the sounds! Now pick the tonie they should go on.');
      if (make.step === 3) go(2);
    }
  };
  activeWizard = self;

  function go(step) {
    make.step = step;
    draw();
  }

  function draw() {
    showTracks = () => {};
    put(stepsBar, ...stepNames.map((name, i) =>
      el('span', { class: i + 1 === make.step ? 'on' : i + 1 < make.step ? 'done' : '' }, i + 1 < make.step ? icon('check') : null, name)));
    if (make.step === 1) drawTarget();
    if (make.step === 2) drawSounds();
    if (make.step === 3) drawLook();
  }

  function footer(back, next, nextLabel, nextIcon = 'next', magic = false) {
    const nextButton = el('button', { class: `btn ${magic ? 'btn-magic' : 'btn-primary'}`, disabled: !next.enabled, onclick: event => { if (magic) sparkle(event.currentTarget); next.go(); } }, nextLabel, icon(nextIcon));
    put(foot, 
      back ? el('button', { class: 'btn btn-ghost', onclick: back }, icon('back'), 'Back') : el('span'),
      el('div', { class: 'right' }, nextButton));
    return nextButton;
  }

  function drawTarget() {
    let nextButton;
    const valid = () => ['tag', 'new', 'mac'].includes(make.target.type);
    put(body, 
      el('div', { class: 'note info' }, icon('info'), 'Every tonie has a little tag inside. Pick the one that should play the new stories.'),
      targetPicker(make.target, target => { make.target = target; nextButton.disabled = !valid(); }));
    nextButton = footer(null, { enabled: valid(), go: () => go(2) }, 'Next');
  }

  function drawSounds() {
    const list = el('ol', { class: 'tracks' });
    const totals = el('div', { class: 'totals' });
    let nextButton;

    const drawList = () => {
      if (!list.isConnected && make.step !== 2) return;
      put(list, ...make.tracks.map((track, index) => trackRow(track, index)));
      const seconds = totalSeconds();
      put(totals, 
        el('span', { text: make.tracks.length ? `${make.tracks.length} ${make.tracks.length === 1 ? 'chapter' : 'chapters'}` : '' }),
        el('span', { text: seconds ? `${duration(seconds)} · about ${bytes(seconds * (make.quality * 1000 / 8) * 1.06)}` : '' }));
      if (nextButton) nextButton.disabled = !ready();
    };

    let dragIndex = null;
    function trackRow(track, index) {
      const titleInput = el('input', { value: track.title || '', 'aria-label': `Name of chapter ${index + 1}`, placeholder: 'Chapter name' });
      titleInput.addEventListener('input', () => { track.title = titleInput.value; });
      const row = el('li', { class: `track ${track.id ? '' : 'uploading'}`, draggable: 'true' },
        el('span', { class: 'handle', title: 'Drag to move' }, icon('grip')),
        el('span', { class: 'num', text: index + 1 }),
        track.id ? playButton(`/api/files/${track.id}/audio`, () => row, track.title || track.name) : el('span', { class: 'spinner' }),
        titleInput,
        el('span', { class: 'file-name', text: track.name, title: track.name }),
        el('span', { class: 'len', text: track.seconds ? duration(track.seconds) : '' }),
        el('button', { class: 'small-btn', 'aria-label': 'Move up', disabled: index === 0, onclick: () => { move(index, index - 1); } }, el('span', { class: 'i', html: icons.back, style: { transform: 'rotate(90deg)' } })),
        el('button', { class: 'small-btn', 'aria-label': 'Remove', onclick: () => { make.tracks.splice(index, 1); drawList(); } }, icon('x')));
      row.addEventListener('dragstart', event => { dragIndex = index; row.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); });
      row.addEventListener('dragend', () => { dragIndex = null; row.classList.remove('dragging'); list.querySelectorAll('.track').forEach(n => n.classList.remove('drop-before', 'drop-after')); });
      row.addEventListener('dragover', event => {
        if (dragIndex === null) return;
        event.preventDefault();
        const after = event.offsetY > row.offsetHeight / 2;
        row.classList.toggle('drop-after', after);
        row.classList.toggle('drop-before', !after);
      });
      row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
      row.addEventListener('drop', event => {
        if (dragIndex === null) return;
        event.preventDefault();
        event.stopPropagation();
        const after = event.offsetY > row.offsetHeight / 2;
        let to = index + (after ? 1 : 0);
        if (dragIndex < to) to--;
        move(dragIndex, to);
        dragIndex = null;
      });
      return row;
    }

    function move(from, to) {
      if (to < 0 || to >= make.tracks.length || from === to) return;
      const [track] = make.tracks.splice(from, 1);
      make.tracks.splice(to, 0, track);
      drawList();
    }

    const fileInput = el('input', { type: 'file', multiple: true, accept: 'audio/*,' + state.app.formats.join(','), hidden: true });
    fileInput.addEventListener('change', () => { uploadFiles([...fileInput.files]); fileInput.value = ''; });
    const folderInput = el('input', { type: 'file', webkitdirectory: true, hidden: true });
    folderInput.addEventListener('change', () => { uploadFiles([...folderInput.files]); folderInput.value = ''; });

    const pickFiles = async () => {
      if (!state.app.dialogs) return fileInput.click();
      try { addStaged(await post('/files/pick')); } catch (error) { toast(error.message, 'bad'); }
    };
    const pickFolder = async () => {
      if (!state.app.dialogs) return folderInput.click();
      try { addStaged(await post('/files/pick-folder')); } catch (error) { toast(error.message, 'bad'); }
    };

    const zone = el('div', { class: 'dropzone' },
      el('span', { class: 'i music-icon', html: icons.music }),
      el('h3', { text: 'Drop stories and songs here' }),
      el('p', { text: 'MP3, M4A, voice memos, WAV, AIFF, FLAC or Ogg. Whole folders work too.' }),
      el('div', { class: 'button-row' },
        el('button', { class: 'btn btn-primary', onclick: pickFiles }, icon('file'), 'Choose files'),
        el('button', { class: 'btn btn-soft', onclick: pickFolder }, icon('folder'), 'Choose a folder'),
        navigator.mediaDevices?.getUserMedia ? el('button', { class: 'btn btn-soft', onclick: () => openRecorder(file => uploadFiles([file])) }, icon('mic'), 'Record my voice') : null,
        el('button', { class: 'btn btn-soft', onclick: () => openChapterPicker(addStaged) }, icon('shelf'), 'Add from a tonie'),
        state.app.import ? el('button', { class: 'btn btn-soft', onclick: () => openLibrivox(addStaged) }, icon('search'), 'Free audiobooks') : null),
      fileInput, folderInput);
    /* the drop itself is handled for the whole window, see the end of this file */
    zone.addEventListener('dragover', event => { if ([...event.dataTransfer.types].includes('Files')) zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', () => zone.classList.remove('over'));

    const where = make.target.type === 'mac' ? 'your shelf on this Mac' : make.target.existing ? `“${make.target.existing.title}”` : `tag ${make.target.uid}`;
    put(body, 
      el('div', { class: 'note info' }, icon('sparkles'), `The new stories go on ${where}. Drag them into the order they should play.`),
      zone, list, totals);
    showTracks = drawList;
    drawList();
    nextButton = footer(target ? null : () => go(1), { enabled: ready(), go: () => go(3) }, 'Next');
  }

  function drawLook() {
    const titleInput = el('input', { class: 'input big', value: make.look.title, placeholder: `${childName()}'s bedtime stories`, maxlength: 60, autofocus: true });
    const preview = el('div', { class: 'preview-card' });
    const drawPreview = () => put(preview, tonieCard({
      kind: 'custom', title: make.look.title || titleInput.placeholder,
      emoji: make.look.usePhoto ? null : make.look.emoji, image: make.look.usePhoto ? make.look.previewUrl : null, color: make.look.color,
      chapters: make.tracks.length, seconds: totalSeconds()
    }));
    titleInput.addEventListener('input', () => { make.look.title = titleInput.value; drawPreview(); });
    drawPreview();

    const replacing = make.target.existing && make.target.existing.problem !== 'unreadable';
    const qualityChoice = (value, label, text) => el('button', {
      class: `choice ${make.quality === value ? 'on' : ''}`, type: 'button',
      onclick: event => { make.quality = value; event.currentTarget.parentNode.querySelectorAll('.choice').forEach(c => c.classList.remove('on')); event.currentTarget.classList.add('on'); }
    }, label, el('small', { text }));
    const keepSwitch = el('input', { type: 'checkbox', checked: make.keepAudioId });
    keepSwitch.addEventListener('change', () => { make.keepAudioId = keepSwitch.checked; });

    put(body, 
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 240px', gap: '24px', alignItems: 'start' } },
        el('div', {},
          el('div', { class: 'field' }, el('label', { text: 'What is it called?' }), titleInput),
          lookPicker(make.look, drawPreview)),
        preview),
      el('details', { class: 'grownups', style: { marginTop: '6px' } },
        el('summary', { text: 'Grown-up options' }),
        el('div', { class: 'field', style: { marginTop: '12px' } },
          el('div', { class: 'label-line', text: 'Sound quality' }),
          el('div', { class: 'choice-row' },
            qualityChoice(64, 'Smaller', 'Fits more on the card'),
            qualityChoice(96, 'Great ⭐', 'Like the original tonies'),
            qualityChoice(128, 'Extra', 'For music lovers'))),
        replacing ? el('div', { class: 'switch-row' },
          el('span', {}, 'Keep the tonie\'s audio ID', el('small', { text: 'Helps an online Toniebox keep your stories instead of downloading the old ones again.' })),
          el('label', { class: 'switch' }, keepSwitch, el('span'))) : null));
    footer(() => go(2), { enabled: true, go: startMagic }, 'Make the magic', 'wand', true);
  }

  async function startMagic() {
    showTracks = () => {};
    make.step = 4;
    make.busy = true;
    put(stepsBar, ...stepNames.map((name, i) => el('span', { class: i === 3 ? 'on' : 'done' }, i < 3 ? icon('check') : null, name)));
    const bar = el('b', { style: { width: '2%' } });
    const label = el('div', { class: 'progress-label', text: '0%' });
    const step = el('p', { text: 'Sprinkling magic dust…' });
    const orbit = el('div', { class: 'orbit' },
      [0, 72, 144, 216, 288].map((deg, i) => el('span', { html: star(14 + (i % 2) * 6, ['#ffc94d', '#ff6fae', '#7c5cff', '#58b8ff', '#22c09a'][i]), style: { left: `${50 + 46 * Math.cos(deg * Math.PI / 180)}%`, top: `${50 + 46 * Math.sin(deg * Math.PI / 180)}%` } })));
    const cancel = el('button', { class: 'btn btn-ghost', onclick: () => make.job && post(`/jobs/${make.job.id}/cancel`) }, icon('x'), 'Stop');
    put(body, el('div', { class: 'making' },
      el('div', { class: 'wand-art' }, orbit, el('span', { html: teddy('happy', 120) })),
      el('h3', { text: 'Making magic…' }), step, el('div', { class: 'progress' }, bar), label));
    put(foot, el('span'), el('div', { class: 'right' }, cancel));

    const title = make.look.title.trim() || `${childName()}'s bedtime stories`;
    try {
      make.job = await post('/make', {
        title,
        emoji: make.look.usePhoto ? null : make.look.emoji,
        color: make.look.color,
        picture: make.look.usePhoto ? make.look.photoRef : null,
        cardId: make.target.type === 'mac' ? null : card()?.id,
        uid: make.target.uid,
        keepAudioId: make.keepAudioId,
        bitRate: make.quality,
        tracks: make.tracks.map(t => ({ id: t.id, title: (t.title || '').trim() || t.name }))
      });
      await follow(make.job, job => {
        const pct = Math.round((job.progress || 0) * 100);
        bar.style.width = `${Math.max(2, pct)}%`;
        label.textContent = `${pct}%`;
        if (job.step) step.textContent = job.step;
      });
      make.busy = false;
      done(title);
    } catch (error) {
      make.busy = false;
      if (error.cancelled) {
        toast('Stopped. Nothing was changed.');
        go(3);
        return;
      }
      put(body, el('div', { class: 'making' },
        el('div', { html: teddy('sleepy', 110) }),
        el('h3', { text: 'Oops, the magic fizzled' }),
        el('div', { class: 'note bad', style: { justifyContent: 'center' } }, icon('info'), error.message)));
      put(foot, el('button', { class: 'btn btn-ghost', onclick: () => go(2) }, icon('back'), 'Back to the sounds'), el('div', { class: 'right' }, el('button', { class: 'btn btn-primary', onclick: () => close() }, 'Close')));
    }
  }

  function done(title) {
    confetti();
    chime();
    const toMac = make.target.type === 'mac';
    put(body, el('div', { class: 'making' },
      el('div', { class: 'done-art', html: teddy('wave', 130) }),
      el('h3', { text: `Ta-da! “${title}” is ready` }),
      el('p', { text: toMac
        ? 'It is on your shelf. Put it on a tonie any time from “My shelf”.'
        : `Eject the SD card, put it back into the Toniebox, place the tonie on top and ${childName()} can listen right away.` })));
    const current = card();
    put(foot, 
      el('button', { class: 'btn btn-ghost', onclick: () => { close(); openMake({ toMac }); } }, icon('plus'), 'Make another'),
      el('div', { class: 'right' },
        !toMac && current?.removable && state.app.eject ? el('button', { class: 'btn btn-soft', onclick: () => { close(); eject(); } }, icon('eject'), 'Eject the card') : null,
        el('button', { class: 'btn btn-primary', onclick: () => close() }, icon('heart'), 'Yay!')));
    refresh();
  }

  draw();
  if (files?.length) self.addFiles(files);
}

/* ---------- recording a story ---------- */

let recordings = 0;

function openRecorder(onAdd) {
  let recording = null;
  let timer = null;
  let url = null;
  const body = el('div', { class: 'recorder' });
  const foot = el('div', { class: 'right' });
  const name = el('input', { class: 'input', value: `My story ${recordings + 1}`, maxlength: 60, 'aria-label': 'Chapter name' });
  const stopTimer = () => {
    clearInterval(timer);
    timer = null;
  };

  function idle(problem) {
    put(body,
      el('button', { class: 'rec-button', 'aria-label': 'Start recording', onclick: start }, icon('mic')),
      el('h3', { text: 'Tap the big button and start talking' }),
      el('p', { class: 'hint', text: `Read a story, sing a song or say good night. Up to ${maxSeconds / 60} minutes.` }),
      problem ? el('div', { class: 'note bad' }, icon('info'), problem) : null);
    put(foot, el('button', { class: 'btn btn-ghost', onclick: () => close() }, 'Cancel'));
  }

  async function start() {
    try {
      recording = await startRecording();
    } catch (error) {
      idle(error.name === 'NotAllowedError' || error.name === 'SecurityError'
        ? 'The microphone is switched off for this app. On the Mac: System Settings › Privacy & Security › Microphone, then turn on Crew’s Tonie Box.'
        : `No microphone was found. ${error.message}`);
      return;
    }
    const time = el('div', { class: 'rec-time', text: '0:00' });
    const meter = el('div', { class: 'rec-meter', 'aria-hidden': 'true' }, Array.from({ length: 28 }, () => el('span')));
    put(body,
      el('button', { class: 'rec-button on', 'aria-label': 'Stop recording', onclick: stop }, icon('stop')),
      time, meter,
      el('p', { class: 'hint', text: 'Recording… tap the button again when you are done.' }));
    put(foot,
      el('button', { class: 'btn btn-ghost', onclick: () => { recording.cancel(); recording = null; stopTimer(); idle(); } }, 'Start over'),
      el('button', { class: 'btn btn-primary', onclick: stop }, icon('stop'), 'Done'));
    const levels = [];
    timer = setInterval(() => {
      time.textContent = duration(recording.seconds());
      levels.push(recording.level());
      if (levels.length > meter.children.length) levels.shift();
      [...meter.children].forEach((bar, i) => { bar.style.height = `${6 + (levels[i] || 0) * 56}px`; });
      if (recording.full()) stop();
    }, 80);
  }

  function stop() {
    if (!recording) return;
    stopTimer();
    const seconds = recording.seconds();
    const blob = recording.stop();
    recording = null;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    const row = el('li', {});
    row.append(playButton(url, () => row, 'the recording'), el('span', { class: 'name', text: 'Your recording' }), el('span', { class: 'len', text: duration(seconds) }));
    put(body,
      el('div', { class: 'done-art', html: teddy('happy', 84) }),
      el('h3', { text: 'Lovely! Have a listen' }),
      el('ol', { class: 'chapters' }, row),
      el('div', { class: 'field' }, el('label', { text: 'Chapter name' }), name));
    put(foot,
      el('button', { class: 'btn btn-ghost', onclick: () => { stopPlaying(); idle(); } }, icon('refresh'), 'Record again'),
      el('button', {
        class: 'btn btn-primary', onclick: () => {
          stopPlaying();
          recordings++;
          onAdd(new File([blob], `${name.value.trim().replace(/[\\/:*?"<>|]/g, ' ') || 'My story'}.wav`, { type: 'audio/wav' }));
          close();
        }
      }, icon('plus'), 'Add it'));
  }

  const close = openLayer(dialog({ title: 'Record a story', subtitle: 'Your own voice on a tonie', small: true, body, foot }), {
    locked: () => !!recording,
    onClose: () => {
      stopTimer();
      recording?.cancel();
      stopPlaying();
      if (url) URL.revokeObjectURL(url);
    }
  });
  idle();
}

/* ---------- the shelf ---------- */

async function openShelf() {
  const body = el('div', {}, el('div', { class: 'empty' }, el('span', { class: 'spinner' })));
  const close = openLayer(dialog({
    title: 'My shelf',
    subtitle: 'Tonies kept safe on this Mac: copies and tonies made for later',
    body,
    foot: el('div', { class: 'right' },
      el('button', { class: 'btn btn-ghost', onclick: () => post('/reveal', { path: state.app.shelf }) }, icon('finder'), 'Show in Finder'),
      el('button', { class: 'btn btn-primary', onclick: () => close() }, 'Close'))
  }), { onClose: stopPlaying });

  const reasons = { made: 'Made here', backup: 'Copy', 'before replacing': 'Saved before replacing', 'before removing': 'Saved before removing' };
  async function draw() {
    const items = await api('/shelf');
    state.shelf = items.length;
    renderHeader();
    if (!items.length) {
      put(body, el('div', { class: 'empty' },
        el('div', { class: 'art', html: teddy('happy', 100) }),
        el('h2', { text: 'The shelf is empty' }),
        el('p', { text: 'Copies of tonies land here, for example before something is replaced. Nothing gets lost.' })));
      return;
    }
    put(body, el('div', { class: 'shelf-list' }, items.map(item => shelfItem(item))));

    function shelfItem(item) {
      const chapters = el('ol', { class: 'chapters', hidden: true });
      const listen = async () => {
        if (!chapters.hidden) {
          chapters.hidden = true;
          stopPlaying();
          return;
        }
        chapters.hidden = false;
        if (chapters.childElementCount) return;
        put(chapters, el('li', {}, el('span', { class: 'spinner' })));
        try {
          const detail = await api(`/shelf/${item.id}`);
          const seconds = detail.chapterSeconds || [];
          put(chapters, seconds.map((length, i) => {
            const name = detail.chapterTitles?.[i] || `Chapter ${i + 1}`;
            const row = el('li', {});
            row.append(
              playButton(format => `/api/shelf/${item.id}/chapters/${i}.${format}`, () => row, name),
              el('span', { class: 'num', text: i + 1 }),
              el('span', { class: 'name', text: name, title: name }),
              el('span', { class: 'len', text: duration(length) }));
            return row;
          }));
        } catch (error) {
          put(chapters, el('li', {}, el('span', { class: 'name', text: error.message })));
        }
      };
      return el('div', { class: 'shelf-group' }, el('div', { class: 'shelf-item' },
      stage({ kind: item.kind || 'custom', image: item.image, emoji: item.emoji || (item.kind === 'custom' ? '🧸' : null), color: item.color }),
      el('div', { class: 'info' },
        el('b', { text: item.title || 'A tonie', title: item.title }),
        el('span', { text: `${reasons[item.reason] || 'Copy'} · ${new Date(item.saved).toLocaleDateString()} · ${item.chapters} ${item.chapters === 1 ? 'chapter' : 'chapters'} · ${minutes(item.seconds)}` })),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-soft btn-small', onclick: listen }, icon('play'), 'Listen'),
        card() ? el('button', { class: 'btn btn-primary btn-small', onclick: () => putOnTag(item, draw) }, icon('wand'), 'Put on a tonie') : null,
        el('button', { class: 'btn btn-soft btn-small', onclick: () => exportSongs(`/shelf/${item.id}/export`) }, icon('music'), 'Songs'),
        el('button', {
          class: 'btn btn-ghost btn-small', 'aria-label': 'Delete', onclick: async () => {
            if (await confirmBox({ title: 'Delete this copy?', text: `“${item.title}” is deleted from this Mac. Tonies on the SD card stay as they are.`, ok: 'Delete', danger: true })) {
              await api(`/shelf/${item.id}`, { method: 'DELETE' });
              draw();
            }
          }
        }, icon('trash')))), chapters);
    }
  }
  draw().catch(error => put(body, el('div', { class: 'note bad' }, icon('info'), error.message)));
}

function putOnTag(item, after) {
  let target = { type: 'none' };
  let goButton;
  const close = openLayer(dialog({
    title: `Put “${item.title}” on a tonie`,
    subtitle: 'Pick the tonie that should play it',
    body: targetPicker(target, picked => { target = picked; goButton.disabled = !['tag', 'new'].includes(picked.type); }, { allowMac: false }),
    foot: el('div', { class: 'right' },
      el('button', { class: 'btn btn-ghost', onclick: () => close() }, 'Cancel'),
      goButton = el('button', {
        class: 'btn btn-magic', disabled: true, onclick: async event => {
          sparkle(event.currentTarget);
          goButton.disabled = true;
          try {
            await follow(await post(`/shelf/${item.id}/put`, { cardId: card().id, uid: target.uid }));
            close();
            confetti();
            chime();
            toast(`“${item.title}” is on the tonie now.`, 'good');
            refresh();
            after?.();
          } catch (error) {
            goButton.disabled = false;
            toast(error.message, 'bad', 7000);
          }
        }
      }, icon('wand'), 'Put it on'))
  }));
}

/* ---------- settings ---------- */

function openSettings() {
  const s = { ...state.settings };
  const save = async () => {
    state.settings = await post('/settings', s);
    setSounds(state.settings.sounds);
    renderHeader();
    renderMain();
  };
  const toggle = (key, title, text) => {
    const input = el('input', { type: 'checkbox', checked: s[key] });
    input.addEventListener('change', () => { s[key] = input.checked; save(); });
    return el('div', { class: 'switch-row' }, el('span', {}, title, el('small', { text })), el('label', { class: 'switch' }, input, el('span')));
  };
  const nameInput = el('input', { class: 'input', value: s.childName, maxlength: 30 });
  nameInput.addEventListener('change', () => { s.childName = nameInput.value.trim() || 'Crew'; save(); });
  const quality = el('select', { class: 'input' },
    [[64, 'Smaller (64 kbps)'], [96, 'Great (96 kbps) ⭐'], [128, 'Extra (128 kbps)']].map(([value, text]) => el('option', { value, selected: s.bitRate === value, text })));
  quality.addEventListener('change', () => { s.bitRate = Number(quality.value); save(); });
  const dbLine = el('span', { text: `${state.db.count.toLocaleString()} tonies known (${state.db.source})` });
  const current = card();

  openLayer(dialog({
    title: 'Settings',
    subtitle: 'Make the tonie box yours',
    body: el('div', {},
      el('div', { class: 'settings-section' },
        el('h3', { text: 'Who is listening?' }),
        el('div', { class: 'field' }, el('label', { text: 'Name' }), nameInput),
        el('div', { class: 'field' }, el('label', { text: 'Sound quality for new tonies' }), quality)),
      el('div', { class: 'settings-section' },
        el('h3', { text: 'Safety & fun' }),
        toggle('backupBeforeReplace', 'Keep a copy before replacing', 'Tonies are saved on your shelf before anything changes them.'),
        toggle('sounds', 'Happy sounds', 'A little twinkle when something is done.'),
        toggle('autoUpdateTonies', 'Keep the tonie list fresh', 'Downloads new tonie names and pictures once a week.')),
      el('div', { class: 'settings-section' },
        el('h3', { text: 'Helpers' }),
        el('div', { class: 'switch-row' }, el('span', {}, 'Tonie names & pictures', el('small', {}, dbLine)),
          el('button', {
            class: 'btn btn-soft btn-small', onclick: async event => {
              const button = event.currentTarget;
              button.disabled = true;
              try {
                const result = await follow(await post('/db/update'));
                dbLine.textContent = `${result.count.toLocaleString()} tonies known (${result.source})`;
                toast('The tonie list is fresh.', 'good');
                loadTonies();
              } catch (error) {
                toast('Could not reach the internet: ' + error.message, 'bad', 6000);
              }
              button.disabled = false;
            }
          }, icon('refresh'), 'Update now')),
        current ? el('div', { class: 'switch-row' }, el('span', {}, 'Tidy up the SD card', el('small', { text: 'Removes hidden “._” files that Macs leave behind.' })),
          el('button', {
            class: 'btn btn-soft btn-small', onclick: async () => {
              const result = await post(`/cards/${current.id}/tidy`);
              toast(result.count ? `Swept away ${result.count} hidden files.` : 'All tidy already!', 'good');
            }
          }, icon('broom'), 'Tidy up')) : null,
        current ? el('div', { class: 'switch-row' }, el('span', {}, 'Keep a copy of every tonie', el('small', { text: 'Saves all tonies on the card to your shelf (skips ones already there).' })),
          el('button', {
            class: 'btn btn-soft btn-small', onclick: async () => {
              toast('Saving copies of all tonies…');
              try {
                const result = await follow(await post(`/cards/${current.id}/backup-all`));
                toast(`${result.saved.length} tonies are safe on your shelf.`, 'good');
                refresh();
              } catch (error) {
                toast(error.message, 'bad');
              }
            }
          }, icon('shelf'), 'Save all')) : null,
        current ? el('div', { class: 'switch-row' }, el('span', {}, 'Open the card in Finder', el('small', { text: 'For grown-ups who like to peek.' })),
          el('button', { class: 'btn btn-soft btn-small', onclick: () => post(`/cards/${current.id}/reveal`) }, icon('finder'), 'Open')) : null),
      el('div', { class: 'settings-section about' },
        el('h3', { text: 'About' }),
        el('p', {}, `Crew's Tonie Box ${state.app.version} · audio by ${state.app.encoder}`),
        el('p', { text: 'Built on teddy by g3gg0 and the Toniebox reverse engineering community, with libopus, Concentus, NAudio, NLayer, NVorbis, ID3.NET, Photino and .NET. Tonie names and pictures come from the community tonies.json. Fonts: Fredoka and Nunito (SIL Open Font License). All licenses are in Licenses.txt, next to the app.' }),
        el('p', { text: 'Not made by or connected to tonies GmbH. Toniebox and tonies are their trademarks. Please only use it with audio you own.' })))
  }));
}

/* ---------- sounds dropped anywhere ---------- */

document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', async event => {
  event.preventDefault();
  const files = await droppedFiles(event.dataTransfer);
  if (!files.length) return;
  if (activeWizard?.busy()) {
    toast('Wait until the magic is done, then drop more sounds.');
  } else if (activeWizard?.accepting()) {
    activeWizard.addFiles(files);
  } else {
    activeWizard?.close();
    openMake({ files });
  }
});

/* ---------- start ---------- */

function start() {
  sprinkleStars();
  const mascot = $('#mascot');
  mascot.innerHTML = teddy('wave', 92);
  const hellos = ['Hi! I am Teddy 🧸', 'Ready for a story?', 'Let’s make some magic! ✨', 'Psst… try making a tonie with your own voice!', 'Sweet dreams! 🌙'];
  let hello = 0;
  mascot.addEventListener('click', event => {
    sparkle(event.currentTarget);
    pop();
    toast(hellos[hello++ % hellos.length]);
  });
  document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icons[node.dataset.icon]; });
  $('#make-button').addEventListener('click', event => { sparkle(event.currentTarget); openMake(); });
  $('#shelf-button').addEventListener('click', openShelf);
  $('#settings-button').addEventListener('click', openSettings);
  renderMain();
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 2500);
}

start();
