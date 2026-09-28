/* little celebrations: confetti, sparkles and sounds (made with WebAudio, no sound files) */

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const colors = ['#ffc94d', '#ff6fae', '#7c5cff', '#2ec4a0', '#58b8ff', '#ff8a65'];

let soundsOn = true;
export const setSounds = on => { soundsOn = on; };

export function confetti(duration = 2600) {
  if (reduceMotion()) {
    return;
  }
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const pieces = Array.from({ length: 160 }, (_, i) => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 13 - 4,
    size: 6 + Math.random() * 8,
    color: colors[i % colors.length],
    spin: Math.random() * 6,
    star: Math.random() < 0.35
  }));
  const start = performance.now();
  canvas.classList.add('on');

  function starPath(r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 ? r * 0.45 : r;
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
  }

  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pieces) {
      p.vy += 0.32;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.spin += 0.12;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / duration);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.fillStyle = p.color;
      if (p.star) {
        starPath(p.size);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (t < duration) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      canvas.classList.remove('on');
    }
  }
  requestAnimationFrame(frame);
}

/* a burst of tiny stars from an element, for magic buttons */
export function sparkle(element) {
  if (reduceMotion() || !element) {
    return;
  }
  const box = element.getBoundingClientRect();
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    const angle = (i / 12) * Math.PI * 2;
    const distance = 34 + Math.random() * 30;
    s.style.left = `${box.left + box.width / 2}px`;
    s.style.top = `${box.top + box.height / 2}px`;
    s.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
    s.style.background = colors[i % colors.length];
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}

let audio;
function context() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audio.state === 'suspended') {
    audio.resume();
  }
  return audio;
}

function tone(frequency, when, length, volume = 0.12, type = 'sine') {
  const ctx = context();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, ctx.currentTime + when);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + when);
  osc.stop(ctx.currentTime + when + length + 0.05);
}

/* a rising twinkle for "it worked" */
export function chime() {
  if (!soundsOn) {
    return;
  }
  try {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.09, 0.9, 0.09));
    tone(2093, 0.5, 1.2, 0.04, 'triangle');
  } catch (e) {
    /* no sound is fine */
  }
}

/* a soft bubble pop for small things */
export function pop() {
  if (!soundsOn) {
    return;
  }
  try {
    const ctx = context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(420, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
    /* no sound is fine */
  }
}
