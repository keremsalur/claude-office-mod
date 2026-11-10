// The real hooks: what the office hears from a session, and that hearing it
// changes nothing for the session: every call goes on as it came and comes
// back as it was answered.
import { expect, mock, test } from 'claude-code/testing'

import { isTestCommand, sortTool, succeeded } from '../hooks/classify'

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

test('each tool is sorted to its animation', async () => {
  const kind = (tool: string, input: Record<string, unknown> = {}): string => {
    const sorted = sortTool(tool, input)
    return sorted.as === 'tool' ? `${sorted.kind}:${sorted.label}` : sorted.as
  }
  expect(kind('Read', { file_path: '/repo/src/app.ts' })).toBe('read:app.ts')
  expect(kind('Grep', { pattern: 'TODO', path: 'src' })).toBe('read:TODO')
  expect(kind('Glob', { pattern: '**/*.ts' })).toBe('read:**/*.ts')
  expect(kind('Edit', { file_path: 'src/app.ts' })).toBe('edit:app.ts')
  expect(kind('Write', { file_path: 'docs/yeni.md' })).toBe('write:yeni.md')
  expect(kind('Bash', { command: 'git status' })).toBe('bash:git status')
  expect(kind('Bash', { command: 'npm test' })).toBe('test:npm test')
  expect(kind('WebFetch', { url: 'https://docs.example.dev/a/b?c=1' })).toBe('web:docs.example.dev')
  expect(kind('WebSearch', { query: 'svg animation' })).toBe('web:svg animation')
  expect(kind('mcp__tasks__update_plan')).toBe('work:update_plan')
  expect(kind('AskUserQuestion', { questions: [{ question: 'Hangisi?' }] })).toBe('ask')
  expect(kind('Agent', { prompt: 'x' })).toBe('skip')
  expect(kind('SendMessage', { to: 'a' })).toBe('skip')

  for (const command of [
    'pytest -q', 'python -m pytest tests/', 'python3 -m unittest', 'npm test', 'npm run test:unit', 'yarn test --watch=false',
    'pnpm -r test', 'cd app && npx jest', 'go test ./...', 'cargo test --all', 'make test', 'bun test', 'node --test',
    'FOO=1 vitest run', './gradlew test', 'claude plugin test ./mod',
  ]) {
    expect(isTestCommand(command), command).toBe(true)
  }
  for (const command of ['ls tests/', 'git status', 'cat test.txt', 'npm install', 'echo test', 'mkdir tests', 'rm -rf dist']) {
    expect(isTestCommand(command), command).toBe(false)
  }

  expect(succeeded({ result: { exitCode: 0 } })).toBe(true)
  expect(succeeded({ result: { exitCode: 1 } })).toBe(false)
  expect(succeeded({ isError: true, text: 'boom' })).toBe(false)
  expect(succeeded({ deny: 'no' })).toBe(false)
})

test('a tool call is shown, and goes on and comes back untouched', async ($, on) => {
  const clock = mock.clock(on)
  const seen: unknown[] = []
  const answer = { result: { stdout: 'ok', stderr: '', exitCode: 0 }, text: 'ok' }
  on('tool.call', (_, e) => {
    seen.push(e)
    return answer
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  const input = { tool: 'Read', file_path: '/repo/src/app.ts' } as const
  const ran = await $.tool.call(input)

  // what the engine got is what was asked, and what came back is its answer:
  // no field added, no context for a model to read
  expect(seen.length).toBe(1)
  expect(seen[0]).toMatchObject(input)
  expect(ran).toMatchObject(answer)
  expect(ran.context).toBeUndefined()

  await clock.advance(300)
  expect(await ui.find({ type: 'Text', text: /okuyor · app\.ts/ })).toBeDefined()
  expect(String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)).toMatch(/a-read/)
  await ui.unmount()
})

test('a failing test command shows as failed, a passing one as passed', async ($, on) => {
  const clock = mock.clock(on)
  let exitCode = 1
  on('tool.call', () => ({ result: { stdout: '', stderr: '', exitCode } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const picture = async (): Promise<string> => String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)

  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.advance(300)
  expect(await ui.find({ type: 'Text', text: /test başarısız/ })).toBeDefined()
  expect(await picture()).toMatch(/fx-fail/)

  exitCode = 0
  await clock.advance(5000)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.advance(300)
  expect(await ui.find({ type: 'Text', text: /test geçti/ })).toBeDefined()
  expect(await picture()).toMatch(/fx-check/)
  await ui.unmount()
})

test('a call that throws is still marked done, and the error is the caller’s', async ($, on) => {
  const clock = mock.clock(on)
  on('tool.call', () => {
    throw new Error('the tool broke')
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await $.tool.call({ tool: 'Bash', command: 'make build' }).then(
    () => undefined,
    () => undefined,
  )
  await clock.advance(300)
  expect(await ui.find({ type: 'Text', text: /başarısız · make build|komut · make build/ })).toBeDefined()
  await ui.unmount()
})

test('an agent comes in with its model, works, and leaves when it stops', async ($, on) => {
  const clock = mock.clock(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5', agentId: 'agent-1' }))
  on('tool.call', () => ({ result: {} }))
  on('classic.SubagentStop', () => ({}))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const picture = async (): Promise<string> => String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)

  const started = await $.agent.spawn({ prompt: 'Bak', description: 'API katmanını incele' })
  expect(started).toMatchObject({ model: 'claude-opus-5', agentId: 'agent-1' })
  await clock.advance(300)
  expect(await picture()).toMatch(/k-opus/)
  expect(await picture()).toMatch(/door-open/)
  expect(await ui.find({ type: 'Text', text: /Opus: içeri girdi · API katmanını incele/ })).toBeDefined()

  await clock.advance(3000)
  await $.tool.call({ tool: 'Edit', file_path: 'src/api/routes.ts', agentId: 'agent-1' })
  await clock.advance(300)
  expect(await ui.find({ type: 'Text', text: /Opus: düzenliyor · routes\.ts/ })).toBeDefined()

  await $.classic.SubagentStop({
    agent_id: 'agent-1',
    agent_type: 'general-purpose',
    agent_transcript_path: '/tmp/a.jsonl',
    stop_hook_active: false,
  })
  await clock.advance(300)
  expect(await ui.find({ type: 'Text', text: /Opus: işini bitirdi, çıktı/ })).toBeDefined()
  await clock.advance(15000)
  expect(await picture()).not.toMatch(/k-opus/)
  await ui.unmount()
})

test('a message, a question and a permission request each show, then clear', async ($, on) => {
  const clock = mock.clock(on)
  let release: (() => void) | undefined
  on('session.send', () => ({ isDelivered: true }))
  on('classic.PermissionRequest', () => ({}))
  on('tool.call', { tool: 'AskUserQuestion' }, async () => {
    await new Promise<void>(resolve => {
      release = resolve
    })
    return { result: {} }
  })
  on('tool.call', () => ({ result: { exitCode: 0 } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const picture = async (): Promise<string> => String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)

  await $.session.send({ to: 'agent-1', text: 'Sıralama hatasına bakar mısın?' })
  await clock.advance(300)
  expect(await picture()).toMatch(/class="[^"]*bub/)
  expect(await ui.find({ type: 'Text', text: /→ agent-1: Sıralama hatasına bakar mısın\?/ })).toBeDefined()

  // a question: on screen while the call is open, gone once it is answered
  const asked = $.tool.call({ tool: 'AskUserQuestion', questions: [{ question: 'Hangi sürüm?', header: 'Sürüm', options: [], multiSelect: false }] })
  await clock.advance(300)
  expect(await ui.find({ type: 'Text', text: /Soru bekliyor: Hangi sürüm\?/ })).toBeDefined()
  expect(await picture()).toMatch(/a-ask/)
  release?.()
  await asked
  await clock.advance(300)
  expect(await ui.find({ type: 'Text', text: /Soru bekliyor/ })).toBeUndefined()

  // a permission request: on screen until that agent's call is over
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'rm -rf dist' } })
  await clock.advance(300)
  expect(await ui.find({ type: 'Text', text: /İzin bekliyor: rm -rf dist/ })).toBeDefined()
  expect(await picture()).toMatch(/a-permission/)
  await $.tool.call({ tool: 'Bash', command: 'rm -rf dist' })
  await clock.advance(300)
  expect(await ui.find({ type: 'Text', text: /İzin bekliyor/ })).toBeUndefined()
  await ui.unmount()
})

test('what happens during the demo is kept, and is there when the demo ends', async ($, on) => {
  const clock = mock.clock(on)
  on('session.model', () => ({ value: 'claude-sonnet-5' }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5', agentId: 'agent-9' }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const picture = async (): Promise<string> => String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)

  await ui.press({ key: 'demo' })
  await clock.advance(1000)
  const playing = await picture()
  await $.agent.spawn({ prompt: 'Tara', description: 'Dosyaları tara' })
  await clock.advance(150)

  // the demo's picture is not disturbed by the real agent
  expect(await picture()).toBe(playing)
  expect(await picture()).not.toMatch(/k-haiku/)

  await ui.press({ key: 'demo' })
  expect(await picture()).toMatch(/k-haiku/)
  expect(await picture()).not.toMatch(/k-fable/)
  await ui.unmount()
})

test('a burst of calls costs the session next to nothing, and is one picture', async ($, on) => {
  const clock = mock.clock(on)
  on('tool.call', () => ({ result: {} }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await clock.advance(1000)
  const before = String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)

  const started = Date.now()
  for (let i = 0; i < 200; i++) await $.tool.call({ tool: 'Read', file_path: `/repo/src/f${i}.ts` })
  const perCall = (Date.now() - started) / 200
  // the whole dispatch, the test kit's own share included, well under 50 ms
  expect(perCall).toBeLessThan(50)

  // nothing was drawn for calls 2..200 until the batch came due
  const during = String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)
  await clock.advance(300)
  const after = String((await ui.findAll({ type: 'Svg' })).at(-1)?.props.source)
  expect(during).not.toBe(before)
  expect(after).not.toBe(during)
  expect(await ui.find({ type: 'Text', text: /okuyor · f199\.ts/ })).toBeDefined()
  await ui.unmount()
})
