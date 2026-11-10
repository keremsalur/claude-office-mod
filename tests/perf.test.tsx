// What the office is held to: at most thirty changes a second in a picture,
// a picture the app will always take, and nothing drawn, retaken or played
// while the pane is closed.
import { expect, mock, test } from 'claude-code/testing'

import { DEMO, DEMO_LENGTH, DEMO_MODEL } from '../hooks/demo'
import { FRAME_MS, renderWorld } from '../hooks/scene'
import { newWorld, reduce } from '../hooks/sim'
import type { World } from '../hooks/sim'

const T0 = 1_700_000_000_000
const SVG_LIMIT = 131072

/**
 * The shortest time between two changes in a row that any one animation of a
 * picture makes: between two frames of a loop, between two steps of a walk.
 */
function fastestStep(svg: string): number {
  const frames = new Map<string, string>()
  for (const m of svg.matchAll(/@keyframes (k\d+)\{((?:[^{}]*\{[^{}]*\})*)\}/g)) frames.set(m[1] ?? '', m[2] ?? '')
  let fastest = Infinity
  for (const m of svg.matchAll(/animation:(k\d+) (\d+)ms (linear|step-end|steps\((\d+)\))[^;}]*/g)) {
    const body = frames.get(m[1] ?? '') ?? ''
    const total = Number(m[2])
    const stops = [...body.matchAll(/([\d.]+)%\{([^}]*)\}/g)].map(s => ({ at: Number(s[1]), rule: s[2] ?? '' }))
    // the moments, in milliseconds from the start, at which this animation changes something
    const changes: number[] = []
    if (m[4] !== undefined) {
      for (let j = 1; j <= Number(m[4]); j++) changes.push((total * j) / Number(m[4]))
    } else if (m[3] === 'step-end') {
      for (const stop of stops) if (stop.at > 0) changes.push((total * stop.at) / 100)
      if (/infinite/.test(m[0])) changes.push(total) // a loop comes round
    } else {
      for (let i = 0; i + 1 < stops.length; i++) {
        const steps = /steps\((\d+)\)/.exec(stops[i]?.rule ?? '')
        if (steps === null) continue
        const from = (total * (stops[i]?.at ?? 0)) / 100
        const span = (total * (stops[i + 1]?.at ?? 0)) / 100 - from
        for (let j = 1; j <= Number(steps[1]); j++) changes.push(from + (span * j) / Number(steps[1]))
      }
    }
    for (let i = 1; i < changes.length; i++) {
      const gap = (changes[i] ?? 0) - (changes[i - 1] ?? 0)
      if (gap > 0) fastest = Math.min(fastest, gap)
    }
  }
  return fastest
}

test('nothing in a picture changes more than thirty times a second', async () => {
  let fastest = Infinity
  let pictures = 0
  for (const speed of [0.5, 1, 2]) {
    let world = newWorld(T0, DEMO_MODEL)
    for (const step of DEMO) {
      world = reduce(world, step.event, T0 + step.at, { speed })
      for (const later of [40, 400, 900]) {
        const svg = renderWorld(world, T0 + step.at + later, {
          theme: 'auto', showLabels: true, showBubbles: true, reduceMotion: false, speed,
        })
        fastest = Math.min(fastest, fastestStep(svg))
        pictures++
      }
    }
  }
  expect(pictures).toBe(DEMO.length * 9)
  // a thirtieth of a second, less the rounding of a keyframe's percentage
  expect(fastest).toBeGreaterThanOrEqual(FRAME_MS - 1.5)
  expect(1000 / fastest).toBeLessThanOrEqual(31)
  expect(DEMO_LENGTH).toBeGreaterThan(0)
})

test('with motion reduced a picture has no loop and no walk at all', async () => {
  let world = newWorld(T0, DEMO_MODEL)
  for (const step of DEMO.slice(0, 20)) {
    world = reduce(world, step.event, T0 + step.at)
    const svg = renderWorld(world, T0 + step.at + 40, { theme: 'auto', showLabels: true, showBubbles: true, reduceMotion: true })
    expect(svg).not.toMatch(/infinite/)
      // a walk is one jump on arrival: two positions at most for each walk still ahead
    for (const frames of svg.matchAll(/@keyframes k\d+\{((?:[\d.]+%\{transform:[^}]*\})+)\}/g)) {
      const stops = (frames[1] ?? '').split('}').length - 1
      const ahead = world.actors.reduce((most, a) => Math.max(most, a.stints.length), 1)
      expect(stops).toBeLessThanOrEqual(1 + ahead * 2)
    }
  }
})

test('a picture too big for the app is drawn again with less on it', async () => {
  const kinds = ['read', 'edit', 'write', 'test', 'web', 'bash', 'work'] as const
  let world: World = newWorld(T0, DEMO_MODEL)
  for (let i = 0; i < 30; i++) {
    world = reduce(world, { type: 'spawn', id: `a${i}`, model: 'claude-opus-5', task: `oldukça uzun bir görev açıklaması ${i}` }, T0 + i * 20)
  }
  for (let i = 0; i < 30; i++) {
    world = reduce(world, { type: 'tool', id: `a${i}`, key: `k${i}`, kind: kinds[i % 7]!, label: 'uzun-bir-dosya-adi.ts', path: `src/d${i}/x.ts` }, T0 + 3000 + i * 20)
    world = reduce(world, { type: 'message', from: `a${i}`, to: 'main', text: 'Bu oldukça uzun bir mesaj metni, kısaltılmalı ve açılınca tamamı görünmeli.' }, T0 + 3600 + i * 20)
  }
  expect(world.actors.length).toBe(31)
  const svg = renderWorld(world, T0 + 4600, { theme: 'auto', showLabels: true, showBubbles: true, reduceMotion: false })
  expect(svg.length).toBeLessThan(SVG_LIMIT)
  // the hover cards went first; everyone is still drawn
  expect(svg).not.toMatch(/class="tip/)
  expect((svg.match(/class="[^"]*\bactor\b/g) ?? []).length).toBe(31)
})

const PANE = {
  plugin: 'piksel-ofis',
  component: 'Pane',
  requestId: 'piksel-ofis',
  props: {
    title: 'Piksel Ofis',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('the state keeps one log, capped at 200, however many events come', async ($, on) => {
  const clock = mock.clock(on)
  on('tool.call', () => ({ result: {} }))
  let biggest = 0
  let logs: number[] = []
  on('state.set', (_, e, next) => {
    const held = e.value as { cur?: unknown; value?: unknown } | undefined
    const found = held?.cur !== undefined ? held : (held?.value as { cur?: unknown } | undefined)
    if (found?.cur !== undefined && typeof found.cur === 'object' && found.cur !== null && 'world' in found.cur) {
      const value = found as { cur: { world: World }; prev: { world: World } | null }
      biggest = Math.max(biggest, JSON.stringify(value).length)
      logs = [value.cur.world.log.length, value.prev?.world.log.length ?? 0]
    }
    return next(e)
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  for (let i = 0; i < 450; i++) {
    await $.tool.call({ tool: i % 3 === 0 ? 'Edit' : 'Read', file_path: `/repo/src/dosya-${i}.ts` })
    if (i % 5 === 0) await clock.advance(250)
  }
  await clock.advance(500)

  expect(logs).toEqual([200, 0])
  expect(biggest).toBeLessThan(60_000)
  expect(await ui.find({ type: 'Text', text: /dosya-449\.ts/ })).toBeDefined()
  await ui.unmount()
})

test('after an event the office settles in three small steps, then does nothing at all', async ($, on) => {
  const clock = mock.clock(on)
  const played: unknown[] = []
  let writes = 0
  on('audio.play', (_, e) => {
    played.push(e)
    return { value: undefined }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-5', agentId: 'agent-1' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.model', () => ({ value: 'claude-sonnet-5' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', (_, e) => ({
    value: e.key === 'prefs' ? { speed: 1, showBubbles: true, showLabels: true, reduceMotion: false, sound: true, theme: 'auto' } : undefined,
  }))
  on('state.set', (_, e, next) => {
    const held = e.value as { cur?: unknown; value?: { cur?: unknown } } | undefined
    if (held?.cur !== undefined || held?.value?.cur !== undefined) writes++
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(100)

  // with sound on from the saved settings, an agent coming in is heard once
  await $.agent.spawn({ prompt: 'x', description: 'bir' })
  await clock.advance(300)
  expect(played.length).toBe(1)

  // then three small writes and no more: the picture underneath is let go,
  // ten quiet seconds on the picture is retaken, and its predecessor let go
  const afterEvent = writes
  await clock.advance(11_000)
  expect(writes).toBe(afterEvent + 3)
  await clock.advance(120_000)
  expect(writes).toBe(afterEvent + 3)
})
