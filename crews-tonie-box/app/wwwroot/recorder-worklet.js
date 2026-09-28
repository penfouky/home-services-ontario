/* runs on the audio thread: hands the microphone signal (mono) to the page in blocks of 4096 samples */
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(4096);
    this.filled = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (channels && channels.length) {
      const frames = channels[0].length;
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels.length; c++) {
          sum += channels[c][i];
        }
        this.block[this.filled++] = sum / channels.length;
        if (this.filled === this.block.length) {
          this.port.postMessage(this.block);
          this.block = new Float32Array(4096);
          this.filled = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('capture', Capture);
