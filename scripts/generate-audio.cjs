'use strict';

// Original notes and additive synthesis. No recordings, samples or dependencies.
const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_RATE = 22050;
const TAU = Math.PI * 2;
const output = path.resolve(__dirname, '../minigame/assets/audio');
fs.mkdirSync(output, { recursive: true });

function frequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function voice(samples, start, duration, note, gain, { attack = 0.012, release = 0.12, bell = false, wrap = false } = {}) {
  const startIndex = Math.round(start * SAMPLE_RATE);
  const length = Math.round(duration * SAMPLE_RATE);
  const hz = frequency(note);
  for (let index = 0; index < length; index += 1) {
    const time = index / SAMPLE_RATE;
    const envelope = Math.min(1, time / attack) * Math.min(1, (duration - time) / release);
    const decay = bell ? Math.exp(-time * 4.2) : 1;
    // Harmonics remain below Nyquist at all notes used in this composition.
    const tone = Math.sin(TAU * hz * time) +
      (bell ? 0.18 : 0.08) * Math.sin(TAU * hz * 2 * time) +
      (bell ? 0.07 : 0.025) * Math.sin(TAU * hz * 3 * time);
    const target = startIndex + index;
    if (target < samples.length) samples[target] += tone * envelope * decay * gain;
    else if (wrap) samples[target % samples.length] += tone * envelope * decay * gain;
  }
}

function writeWav(name, duration, compose) {
  const samples = new Float64Array(Math.round(duration * SAMPLE_RATE));
  compose(samples);
  const peak = samples.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
  // Peak-limit without increasing quiet samples. PCM remains comfortably unclipped.
  const gain = peak > 0.78 ? 0.78 / peak : 1;
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((value, index) => buffer.writeInt16LE(Math.round(value * gain * 32767), 44 + index * 2));
  fs.writeFileSync(path.join(output, `${name}.wav`), buffer);
  console.log(`${name}.wav  ${duration.toFixed(2)}s  ${buffer.length} bytes`);
}

writeWav('bgm', 10, (samples) => {
  const notes = [60, 64, 67, 69, 67, 64, 62, 60, 62, 64, 67, 64, 62, 60, 55, 60];
  notes.forEach((note, index) => voice(samples, index * 0.625, 0.95, note, 0.12, { bell: true, wrap: true }));
  const chords = [[48, 55, 60], [45, 52, 57], [43, 50, 55], [48, 55, 60]];
  chords.forEach((chord, index) => {
    chord.forEach((note) => voice(samples, index * 2.5, 2.9, note, 0.025,
      { attack: 0.35, release: 0.6, wrap: true }));
  });
});

writeWav('collect', 0.36, (samples) => {
  voice(samples, 0, 0.24, 84, 0.32, { bell: true, attack: 0.006, release: 0.08 });
  voice(samples, 0.07, 0.28, 91, 0.19, { bell: true, attack: 0.006, release: 0.12 });
});

writeWav('start', 0.72, (samples) => {
  [72, 76, 79].forEach((note, index) => voice(samples, index * 0.12, 0.46, note, 0.23,
    { bell: true, release: 0.18 }));
});

writeWav('finish', 1.15, (samples) => {
  [72, 76, 79, 84].forEach((note, index) => voice(samples, index * 0.1, 0.68, note, 0.2,
    { bell: true, release: 0.25 }));
});

writeWav('tap', 0.12, (samples) => {
  voice(samples, 0, 0.11, 79, 0.18, { bell: true, attack: 0.004, release: 0.07 });
});
