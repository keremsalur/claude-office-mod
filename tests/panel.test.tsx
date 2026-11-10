// The pane around the picture: the way back to it, the settings, who is
// picked, the log, the wide view, the sounds.
import { expect, mock, test } from 'claude-code/testing'

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

const BAND = {
  plugin: 'piksel-ofis',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 4,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 4 },
    view: {},
  },
} as const

test('a button above the prompt brings the pane back, and is gone while the pane is open', async ($, on) => {
  mock.clock(on)
  const opened: unknown[] = []
  on('ui.panes', () => ({
    value:
      opened.length === 0
        ? []
        : [{ id: 'piksel-ofis', title: 'Piksel Ofis', isShown: true, isFocused: false, isPlaced: true }],
  }))
  on('ui.open', (_, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.invalidate', () => ({ value: undefined }))

  const closed = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await closed.find({ key: 'piksel-ofis-open' }))?.props.label).toBe('▸ Piksel Ofis')
  await closed.press({ key: 'piksel-ofis-open' })
  expect(opened).toMatchObject([{ id: 'piksel-ofis' }])
  await closed.unmount()

  const open = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await open.find({ key: 'piksel-ofis-open' })).toBeUndefined()
  await open.unmount()
})

test('each setting changes the picture, and is kept for later sessions', async ($, on) => {
  const clock = mock.clock(on)
  const kept: Record<string, unknown> = {}
  on('store.set', (_, e) => {
    kept[e.key] = e.value
    return { value: undefined }
  })
  on('tool.call', () => ({ result: {} }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const picture = async (): Promise<string> => String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)

  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })
  await clock.advance(300)
  expect(await picture()).toMatch(/class="lab"/)
  expect(await picture()).toMatch(/infinite/)
  expect(await picture()).toMatch(/prefers-color-scheme/)

  // settings are folded away until asked for
  expect(await ui.find({ key: 'set-showLabels' })).toBeUndefined()
  await ui.press({ key: 'settings' })
  expect((await ui.find({ key: 'set-sound' }))?.props.label).toBe('Kapalı')

  await ui.press({ key: 'set-showLabels' })
  expect(await picture()).not.toMatch(/class="lab"/)
  expect((await ui.find({ key: 'set-showLabels' }))?.props.label).toBe('Kapalı')

  await ui.press({ key: 'set-reduceMotion' })
  expect(await picture()).not.toMatch(/infinite/)

  await ui.press({ key: 'theme-dark' })
  expect(await picture()).not.toMatch(/prefers-color-scheme/)
  expect(await picture()).toMatch(/<style>\.c1\{fill:#3a3341\}/) // the dark wall

  await ui.press({ key: 'speed-2' })
  expect(kept.prefs).toMatchObject({ speed: 2, showLabels: false, reduceMotion: true, theme: 'dark', sound: false })

  // changing a setting keeps the picture before it underneath: no blink
  const before = await ui.findAll({ type: 'Svg' })
  await clock.advance(1000)
  await ui.press({ key: 'set-showBubbles' })
  const after = await ui.findAll({ type: 'Svg' })
  expect(after[0]?.props.source).toBe(before[1]?.props.source)
  await ui.unmount()
})

test('saved settings are read back when a session starts', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.model', () => ({ value: 'claude-sonnet-5' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', (_, e) => ({
    value:
      e.key === 'prefs'
        ? { speed: 2, showBubbles: false, showLabels: true, reduceMotion: true, sound: true, theme: 'light' }
        : e.key === 'zoom'
          ? 3
          : undefined,
  }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.findAll({ type: 'Svg' })).at(-1)?.props.width).toBe(570)
  await ui.press({ key: 'settings' })
  expect((await ui.find({ key: 'set-sound' }))?.props.label).toBe('Açık')
  expect((await ui.find({ key: 'speed-2' }))?.props.variant).toBe('primary')
  await ui.unmount()
})

test('picking a character shows its card: model, task, last actions, files', async ($, on) => {
  const clock = mock.clock(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5', agentId: 'agent-1' }))
  on('tool.call', () => ({ result: {} }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const picture = async (): Promise<string> => String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)

  await $.agent.spawn({ prompt: 'Bak', description: 'API katmanını incele' })
  await clock.advance(300)
  for (const [tool, file] of [['Read', 'a.ts'], ['Read', 'b.ts'], ['Edit', 'b.ts'], ['Write', 'c.ts'], ['Read', 'd.ts'], ['Edit', 'e.ts']] as const) {
    await $.tool.call({ tool, file_path: `/repo/src/${file}`, agentId: 'agent-1' })
    await clock.advance(300)
  }

  expect(await ui.find({ type: 'Text', text: /^Model:/ })).toBeUndefined()
  await ui.press({ key: 'who-agent-1' })
  expect(await ui.find({ type: 'Text', text: /^Model: claude-opus-5$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Görev: API katmanını incele$/ })).toBeDefined()
  // the last five things it did, newest first
  const did = (await ui.findAll({ type: 'Text', text: /^· (okuyor|düzenliyor|yeni dosya)/ })).map(t => t.text)
  expect(did).toEqual(['· düzenliyor · e.ts', '· okuyor · d.ts', '· yeni dosya · c.ts', '· düzenliyor · b.ts', '· okuyor · b.ts'])
  // the files it touched last, each once
  const files = (await ui.findAll({ type: 'Text', text: /^· \/repo/ })).map(t => t.text)
  expect(files).toEqual(['· /repo/src/e.ts', '· /repo/src/d.ts', '· /repo/src/c.ts', '· /repo/src/b.ts', '· /repo/src/a.ts'])
  expect((await ui.find({ key: 'who-agent-1' }))?.props.variant).toBe('primary')
  expect(await picture()).toMatch(/class="sel"/)

  await ui.press({ key: 'who-agent-1' })
  expect(await ui.find({ type: 'Text', text: /^Model:/ })).toBeUndefined()
  expect(await picture()).not.toMatch(/class="sel"/)
  await ui.unmount()
})

test('the picture answers the pointer by itself: a card per character, a balloon’s whole text', async ($, on) => {
  const clock = mock.clock(on)
  on('session.send', () => ({ isDelivered: true }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  const long = 'routes.ts içindeki sıralama hatası testi kırıyor, bakabilir misin?'
  await $.session.send({ to: 'agent-1', text: long })
  await clock.advance(300)
  const source = String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)

  // hover or click, with no script and no round trip to the mod
  expect(source).toMatch(/class="[^"]*\bwho w0" tabindex="0"/)
  expect(source).toMatch(/svg:has\(\.w0:hover\) \.t0,svg:has\(\.w0:focus\) \.t0\{visibility:visible\}/)
  expect(source).toMatch(/class="tip t0"/)
  // the balloon is cut short; its whole text is there to unfold
  expect(source).toMatch(/routes\.ts içindeki sı…/)
  expect(source).toMatch(/class="[^"]*bub say" tabindex="0"/)
  expect(source).toMatch(/class="full"/)
  expect(source).toMatch(/bakabilir misin\?/)
  expect(source).not.toMatch(/<script|onclick|onload/)
  await ui.unmount()
})

test('the log unfolds to every event kept, newest first', async ($, on) => {
  const clock = mock.clock(on)
  on('tool.call', () => ({ result: {} }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  for (let i = 0; i < 5; i++) {
    await $.tool.call({ tool: 'Read', file_path: `/repo/f${i}.ts` })
    await clock.advance(300)
  }

  // folded: one line, the newest event
  expect((await ui.findAll({ type: 'Text', text: /okuyor · f/ })).map(t => t.text)).toEqual(['Lider (Ajan): okuyor · f4.ts'])
  await ui.press({ key: 'log' })
  const lines = (await ui.findAll({ type: 'Text', text: /^\d\d:\d\d:\d\d {2}/ })).map(t => t.text.slice(10))
  expect(lines).toEqual([4, 3, 2, 1, 0].map(i => `Lider (Ajan): okuyor · f${i}.ts`))
  expect(await ui.find({ type: 'Text', text: /Günlük: son 5 olay/ })).toBeDefined()
  await ui.unmount()
})

test('the wide view shows the office alone, and asks for more room', async ($, on) => {
  mock.clock(on)
  const asked: Record<string, unknown>[] = []
  on('ui.open', (_, e) => {
    asked.push(e as unknown as Record<string, unknown>)
    return { value: { isPlaced: true } }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'zoom-in' })
  expect((await ui.findAll({ type: 'Svg' })).at(-1)?.props.width).toBe(570)

  await ui.press({ key: 'wide' })
  expect(asked.at(-1)).toMatchObject({ id: 'piksel-ofis', columns: 120 })
  expect((await ui.find({ key: 'wide' }))?.props.label).toBe('Küçült')
  for (const key of ['log', 'settings', 'demo', 'who-main', 'zoom-in']) expect(await ui.find({ key })).toBeUndefined()
  // in the wide view the picture fits the pane, whatever zoom was set
  expect((await ui.findAll({ type: 'Svg' })).at(-1)?.props.width).toBe(380)

  await ui.press({ key: 'wide' })
  expect(asked.at(-1)?.columns).toBeUndefined()
  expect((await ui.find({ key: 'wide' }))?.props.label).toBe('Büyüt')
  expect(await ui.find({ key: 'log' })).toBeDefined()
  expect((await ui.findAll({ type: 'Svg' })).at(-1)?.props.width).toBe(570)
  await ui.unmount()
})

test('sounds are off unless turned on, and then only short clips of the mod’s own play', async ($, on) => {
  const clock = mock.clock(on)
  const played: unknown[] = []
  let agents = 0
  on('audio.play', (_, e) => {
    played.push(e)
    return { value: undefined }
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-5', agentId: `agent-${++agents}` }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await $.agent.spawn({ prompt: 'Tara', description: 'bir' })
  await clock.advance(2000)
  expect(played).toEqual([])

  await ui.press({ key: 'settings' })
  await ui.press({ key: 'set-sound' })
  await $.agent.spawn({ prompt: 'Tara', description: 'iki' })
  await clock.advance(2000)
  expect(played.length).toBe(1)
  expect(played[0]).toMatchObject({ clip: { asset: 'sounds/door.wav' } })
  await ui.unmount()
})

test('a waiting question has a way to its conversation', async ($, on) => {
  const clock = mock.clock(on)
  const viewed: unknown[] = []
  let release: (() => void) | undefined
  on('ui.view', (_, e) => {
    viewed.push(e)
    return { value: {} }
  })
  on('tool.call', async () => {
    await new Promise<void>(resolve => {
      release = resolve
    })
    return { result: {} }
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  const asked = $.tool.call({
    tool: 'AskUserQuestion',
    agentId: 'agent-7',
    questions: [{ question: 'Hangi sürüm?', header: 'Sürüm', options: [], multiSelect: false }],
  })
  await clock.advance(300)
  await ui.press({ key: 'go-' + (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '').find(k => k.startsWith('go-'))?.slice(3) })
  expect(viewed).toMatchObject([{ agentId: 'agent-7' }])
  release?.()
  await asked
  await ui.unmount()
})
