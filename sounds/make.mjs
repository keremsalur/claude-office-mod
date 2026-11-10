// Piksel Ofis: the sound effects, made by code. Run `node sounds/make.mjs`
// to write them again. Short, quiet, 16-bit mono WAV files: nothing sampled.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 22050
const here = dirname(fileURLToPath(import.meta.url))

/** Notes one after another: [frequency in Hz (0: noise), length in ms, shape]. */
function render(notes, volume) {
  const samples = []
  let seed = 7
  for (const [hz, ms, shape = 'sine'] of notes) {
    const count = Math.round((RATE * ms) / 1000)
    for (let i = 0; i < count; i++) {
      const t = i / RATE
      const fade = Math.min(1, i / 60) * Math.pow(1 - i / count, 1.6)
      let wave
      if (hz === 0) {
        seed = (seed * 16807) % 2147483647
        wave = (seed / 2147483647) * 2 - 1
      } else if (shape === 'square') {
        wave = Math.sin(2 * Math.PI * hz * t) >= 0 ? 0.6 : -0.6
      } else {
        wave = Math.sin(2 * Math.PI * hz * t) + 0.25 * Math.sin(4 * Math.PI * hz * t)
      }
      samples.push(wave * fade * volume)
    }
  }
  return samples
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2))
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

const SOUNDS = {
  // someone comes in or goes out: two soft rising notes
  door: render([[523, 70], [784, 110]], 0.28),
  // tests pass: a bright little arpeggio
  pass: render([[784, 60], [988, 60], [1319, 140]], 0.26),
  // tests fail: a low buzz that sinks
  fail: render([[196, 110, 'square'], [147, 170, 'square']], 0.22),
  // a question or a permission request: two short beeps
  alert: render([[880, 80], [0, 1], [880, 120]], 0.3),
  // a new file: a paper tick
  paper: render([[0, 35], [1568, 45]], 0.18),
}

for (const [name, samples] of Object.entries(SOUNDS)) {
  const file = join(here, `${name}.wav`)
  writeFileSync(file, wav(samples))
  console.log(`${name}.wav  ${Math.round((samples.length / RATE) * 1000)} ms`)
}
