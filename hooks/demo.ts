// Piksel Ofis: the demo. A script of made-up events that shows every
// animation once, with no agent running. The tests replay the same script.

import { MAIN } from './sim'
import type { OfficeEvent } from './sim'

export type DemoStep = { at: number; event: OfficeEvent }

/** The lead's model in the demo. */
export const DEMO_MODEL = 'claude-fable-5'

const A = 'demo-a'
const B = 'demo-b'
const C = 'demo-c'
const D = 'demo-d'
const E = 'demo-e'

export const DEMO: readonly DemoStep[] = [
  // the lead reads on its own
  { at: 600, event: { type: 'tool', id: MAIN, key: 't1', kind: 'read', label: 'README.md', path: 'README.md' } },
  { at: 2600, event: { type: 'done', id: MAIN, key: 't1', kind: 'read', ok: true } },
  // it hands work out: three agents come in through the door
  { at: 4200, event: { type: 'spawn', id: A, model: 'claude-opus-5', task: 'API katmanını incele' } },
  { at: 6600, event: { type: 'spawn', id: B, model: 'claude-sonnet-5', task: 'Testleri yaz' } },
  { at: 8600, event: { type: 'spawn', id: C, model: 'claude-haiku-5', task: 'Dosyaları tara' } },
  // reading and searching at the bookshelf
  { at: 10400, event: { type: 'tool', id: A, key: 't2', kind: 'read', label: 'routes.ts', path: 'src/api/routes.ts' } },
  { at: 10900, event: { type: 'tool', id: C, key: 't3', kind: 'read', label: '**/*.ts' } },
  { at: 12900, event: { type: 'done', id: A, key: 't2', kind: 'read', ok: true } },
  { at: 13000, event: { type: 'done', id: C, key: 't3', kind: 'read', ok: true } },
  // editing at a desk, a new file from the printer, the web at the window
  { at: 13400, event: { type: 'tool', id: A, key: 't4', kind: 'edit', label: 'routes.ts', path: 'src/api/routes.ts' } },
  { at: 13900, event: { type: 'tool', id: B, key: 't5', kind: 'write', label: 'api.test.ts', path: 'tests/api.test.ts' } },
  { at: 14600, event: { type: 'tool', id: C, key: 't6', kind: 'web', label: 'docs.example.dev' } },
  { at: 16400, event: { type: 'done', id: B, key: 't5', kind: 'write', ok: true } },
  { at: 16800, event: { type: 'done', id: A, key: 't4', kind: 'edit', ok: true } },
  // a test that fails in the lab, a terminal command at the desk
  { at: 17200, event: { type: 'tool', id: B, key: 't7', kind: 'test', label: 'npm test' } },
  { at: 17600, event: { type: 'tool', id: A, key: 't8', kind: 'bash', label: 'git status' } },
  { at: 18200, event: { type: 'done', id: C, key: 't6', kind: 'web', ok: true } },
  { at: 20400, event: { type: 'done', id: B, key: 't7', kind: 'test', ok: false } },
  { at: 20800, event: { type: 'done', id: A, key: 't8', kind: 'bash', ok: true } },
  // two agents talk it over
  { at: 22000, event: { type: 'message', from: B, to: A, text: 'routes.ts içindeki sıralama hatası testi kırıyor, bakabilir misin?' } },
  { at: 24400, event: { type: 'message', from: A, to: B, text: 'Baktım, düzeltiyorum.' } },
  { at: 25600, event: { type: 'tool', id: A, key: 't9', kind: 'edit', label: 'routes.ts', path: 'src/api/routes.ts' } },
  { at: 27400, event: { type: 'done', id: A, key: 't9', kind: 'edit', ok: true } },
  // the test again: it passes
  { at: 27800, event: { type: 'tool', id: B, key: 't10', kind: 'test', label: 'npm test' } },
  { at: 30600, event: { type: 'done', id: B, key: 't10', kind: 'test', ok: true } },
  // a question for the person, then a command that waits for permission
  { at: 31000, event: { type: 'ask', id: C, key: 'q1', text: 'Hangi sürümü hedefleyelim?' } },
  { at: 33000, event: { type: 'permission', id: A, key: 'p1', text: 'rm -rf dist' } },
  { at: 35000, event: { type: 'resolved', id: C, key: 'q1' } },
  { at: 36200, event: { type: 'resolved', id: A, key: 'p1' } },
  { at: 36400, event: { type: 'tool', id: A, key: 't11', kind: 'bash', label: 'rm -rf dist' } },
  { at: 38000, event: { type: 'done', id: A, key: 't11', kind: 'bash', ok: true } },
  // a model the office does not know, and a second Opus
  { at: 38400, event: { type: 'spawn', id: D, model: 'yerel-model-1', task: 'Belgeleri güncelle' } },
  { at: 40400, event: { type: 'spawn', id: E, model: 'claude-opus-5', task: 'Değişiklikleri gözden geçir' } },
  { at: 41600, event: { type: 'tool', id: D, key: 't12', kind: 'write', label: 'API.md', path: 'docs/API.md' } },
  { at: 42600, event: { type: 'tool', id: E, key: 't13', kind: 'work', label: 'TodoWrite' } },
  { at: 44200, event: { type: 'done', id: D, key: 't12', kind: 'write', ok: true } },
  { at: 44600, event: { type: 'done', id: E, key: 't13', kind: 'work', ok: true } },
  // everyone finishes and leaves by the door
  { at: 45600, event: { type: 'finish', id: C } },
  { at: 46800, event: { type: 'finish', id: D } },
  { at: 48000, event: { type: 'finish', id: B } },
  { at: 49200, event: { type: 'finish', id: E } },
  { at: 50400, event: { type: 'finish', id: A } },
  // the lead wraps up at its own desk
  { at: 52000, event: { type: 'tool', id: MAIN, key: 't14', kind: 'edit', label: 'CHANGELOG.md', path: 'CHANGELOG.md' } },
  { at: 55000, event: { type: 'done', id: MAIN, key: 't14', kind: 'edit', ok: true } },
]

/** How long the demo runs, its last animation included. */
export const DEMO_LENGTH = 58000
