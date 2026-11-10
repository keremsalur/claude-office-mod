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

test('the desktop pane draws the office as SVG, at a whole scale', async ($, on) => {
  const clock = mock.clock(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // At rest one picture; 60 columns at 8 px fit the canvas twice.
  const drawn = await ui.findAll({ type: 'Svg' })
  expect(drawn.length).toBe(1)
  for (const svg of drawn) {
    expect(svg.props.width).toBe(380)
    expect(svg.props.height).toBe(260)
    expect(svg.props.isInteractive).toBe(true)
    // the document has no size of its own, so a zoom never changes it
    expect(String(svg.props.source)).toMatch(/^<svg xmlns="[^"]+" viewBox="0 0 190 130" shape-rendering/)
    expect(String(svg.props.source).length).toBeLessThan(131072)
  }

  // a change puts a new picture over the old one; both take the new size
  await ui.press({ key: 'zoom-in' })
  expect((await ui.findAll({ type: 'Svg' })).map(s => s.props.width)).toEqual([570, 570])

  await ui.press({ key: 'zoom-fit' })
  expect((await ui.findAll({ type: 'Svg' })).map(s => s.props.width)).toEqual([380, 380])

  // and once the new one has had time to load, the one underneath is let go
  const top = (await ui.findAll({ type: 'Svg' })).at(-1)?.props.source
  await clock.advance(1000)
  const resting = await ui.findAll({ type: 'Svg' })
  expect(resting.length).toBe(1)
  expect(resting[0]?.props.source).toBe(top)
  await ui.unmount()
})

test('the session starts with its own model at the lead desk, and registers no command', async ($, on) => {
  const clock = mock.clock(on)
  let commands = 0
  on('command.register', () => {
    commands++
    return { value: { command: 'x' } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.model', () => ({ value: 'claude-sonnet-5' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  mock.store(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // the start does not wait for the office: the picture follows a moment later
  await clock.advance(50)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const top = (await ui.findAll({ type: 'Svg' })).at(-1)
  expect(String(top?.props.source)).toMatch(/class="[^"]*k-sonnet/)

  // a slash command would leave a record in the conversation each time it is typed
  expect(commands).toBe(0)
  await ui.unmount()
})

test('the demo plays in the pane, then gives the office back', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.model', () => ({ value: 'claude-sonnet-5' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  mock.store(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const picture = async (): Promise<string> => String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)

  await ui.press({ key: 'demo' })
  expect((await ui.find({ key: 'demo' }))?.props.label).toBe('Demoyu durdur')
  expect(await picture()).toMatch(/k-fable/)

  await clock.advance(3000)
  expect(await picture()).toMatch(/a-read/)
  expect(await ui.find({ type: 'Text', text: /okuyor · README\.md/ })).toBeDefined()

  await clock.advance(9000)
  expect(await picture()).toMatch(/k-opus/)
  expect(await picture()).toMatch(/k-haiku/)

  await clock.advance(20000)
  expect(await ui.find({ type: 'Text', text: /Soru bekliyor: Hangi sürümü hedefleyelim\?/ })).toBeDefined()

  // stopping mid-way clears the made-up agents at once
  await ui.press({ key: 'demo' })
  expect((await ui.find({ key: 'demo' }))?.props.label).toBe('Demo')
  expect(await picture()).not.toMatch(/k-opus|k-haiku|k-fable/)
  expect(await picture()).toMatch(/k-sonnet/)

  // and a demo left to run ends by itself
  await ui.press({ key: 'demo' })
  await clock.advance(70000)
  expect((await ui.find({ key: 'demo' }))?.props.label).toBe('Demo')
  expect(await picture()).toMatch(/k-sonnet/)
  await ui.unmount()
})

test('a new picture is laid over the one before it, so nothing blinks', async ($, on) => {
  const clock = mock.clock(on)
  on('session.model', () => ({ value: 'claude-sonnet-5' }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const pictures = async (): Promise<string[]> =>
    (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source))

  await ui.press({ key: 'demo' })
  await clock.advance(700) // the demo's first event, at 0.6 s
  const first = await pictures()

  // the next event, two seconds on: what was on top is now underneath, as it was
  await clock.advance(2000)
  const second = await pictures()
  expect(second[0]).toBe(first[1])
  expect(second[1]).not.toBe(first[1])

  // a redraw that changes nothing hands over the very same documents
  // on to 12.95 s, just past the event at 12.9 s; the one before it was at 10.9 s
  await clock.advance(10250)
  const settled = await pictures()

  // an event 100 ms after another is drawn 200 ms after it: the picture
  // underneath stays the settled one, the one above not having had time to load
  await clock.advance(250) // 13.2 s: the event at 13.0 s, drawn at 13.1 s
  const quick = await pictures()
  expect(quick[0]).toBe(settled[0])
  expect(quick[1]).not.toBe(settled[1])
  await ui.unmount()
})

test('ten quiet seconds after an event the picture is retaken, with nothing left to replay', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.model', () => ({ value: 'claude-sonnet-5' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  mock.store(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const pictures = async (): Promise<string[]> =>
    (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.source))

  await ui.press({ key: 'demo' })
  await clock.advance(700)
  const walking = await pictures()
  // the lead is on its way to the shelf: a row of positions, one after another
  const WALK = /@keyframes k\d+\{(?:[\d.]+%\{transform:translate\(\d+px,\d+px\)\}){3,}\}/
  expect(walking[1]).toMatch(WALK)

  await ui.press({ key: 'demo' }) // stop: back to the session's own office
  const stopped = await pictures()
  await clock.advance(10500)
  const quiet = await pictures()
  expect(quiet[0]).toBe(stopped[1])
  expect(quiet[1]).not.toMatch(WALK)
  await ui.unmount()
})

test('the terminal pane lists who is doing what', async ($, on) => {
  mock.clock(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /masaüstü/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Lider/ })).toBeDefined()
  await ui.unmount()
})
