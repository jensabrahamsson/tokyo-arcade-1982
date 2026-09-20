import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AUDIO = join(__dirname, '..', '..', 'static', 'audio');

const MPEG1_LAYER3_BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG1_SR = [44100, 48000, 32000];

/** skip ID3v2 and walk MPEG-1 Layer III frames; duration in seconds (0 if none) */
export function mpeg1Layer3DurationSec(buf: Uint8Array): number {
  let i = 0;
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6]! & 0x7f) << 21) | ((buf[7]! & 0x7f) << 14) | ((buf[8]! & 0x7f) << 7) | (buf[9]! & 0x7f);
    i = 10 + size;
  }
  let frames = 0;
  let sampleRate = 44100;
  while (i + 4 < buf.length) {
    if (buf[i] === 0xff && (buf[i + 1]! & 0xe0) === 0xe0) {
      const ver = (buf[i + 1]! >> 3) & 3;
      const layer = (buf[i + 1]! >> 1) & 3;
      const brIdx = (buf[i + 2]! >> 4) & 0xf;
      const srIdx = (buf[i + 2]! >> 2) & 3;
      const padding = (buf[i + 2]! >> 1) & 1;
      if (ver !== 3 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) {
        i++;
        continue;
      }
      sampleRate = MPEG1_SR[srIdx]!;
      const br = MPEG1_LAYER3_BR[brIdx]! * 1000;
      const frameLen = Math.floor((144 * br) / sampleRate) + padding;
      if (frameLen < 4) {
        i++;
        continue;
      }
      i += frameLen;
      frames++;
    } else {
      i++;
    }
  }
  return frames * 1152 / sampleRate;
}

describe('Lyria sample files (P2-J)', () => {
  const files = ['Late_Night_Cabinet.mp3', 'coast_yosen_start_ja.mp3'] as const;

  for (const name of files) {
    it(`${name} decodes to a non-empty MPEG duration`, () => {
      const buf = readFileSync(join(AUDIO, name));
      expect(buf.byteLength).toBeGreaterThan(1024);
      const sec = mpeg1Layer3DurationSec(buf);
      expect(sec).toBeGreaterThan(1);
    });
  }
});
