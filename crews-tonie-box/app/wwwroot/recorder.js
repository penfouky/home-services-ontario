/* records the microphone into a WAV file (16 bit mono), which the app turns into a chapter like any other sound */

export const maxSeconds = 30 * 60;

export async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This window cannot use a microphone.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
  });
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  if (context.state === 'suspended') {
    await context.resume();
  }
  const source = context.createMediaStreamSource(stream);
  const chunks = [];
  let samples = 0;
  let level = 0;
  let paused = false;
  let node;

  const take = block => {
    if (paused || samples >= maxSeconds * context.sampleRate) {
      return;
    }
    const pcm = new Int16Array(block.length);
    let sum = 0;
    for (let i = 0; i < block.length; i++) {
      const value = Math.max(-1, Math.min(1, block[i]));
      pcm[i] = value < 0 ? value * 32768 : value * 32767;
      sum += value * value;
    }
    chunks.push(pcm);
    samples += block.length;
    /* a lively meter: quick up, slow down */
    const rms = Math.sqrt(sum / block.length);
    level = Math.max(Math.min(1, rms * 4), level * 0.8);
  };

  if (context.audioWorklet && window.AudioWorkletNode) {
    await context.audioWorklet.addModule('recorder-worklet.js');
    node = new AudioWorkletNode(context, 'capture', { numberOfInputs: 1, numberOfOutputs: 0 });
    node.port.onmessage = event => take(event.data);
    source.connect(node);
  } else {
    node = context.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = event => take(new Float32Array(event.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(context.destination);
  }

  const release = () => {
    stream.getTracks().forEach(track => track.stop());
    source.disconnect();
    node.disconnect();
    context.close().catch(() => {});
  };

  return {
    seconds: () => samples / context.sampleRate,
    level: () => {
      level *= 0.94;
      return level;
    },
    full: () => samples >= maxSeconds * context.sampleRate,
    pause: () => { paused = true; },
    resume: () => { paused = false; },
    cancel: release,
    stop() {
      release();
      return wav(chunks, samples, context.sampleRate);
    }
  };
}

function wav(chunks, samples, rate) {
  const header = new DataView(new ArrayBuffer(44));
  const text = (offset, value) => [...value].forEach((ch, i) => header.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  header.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVEfmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, rate, true);
  header.setUint32(28, rate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  text(36, 'data');
  header.setUint32(40, samples * 2, true);
  return new Blob([header, ...chunks], { type: 'audio/wav' });
}
