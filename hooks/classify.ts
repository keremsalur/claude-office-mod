// Piksel Ofis: which animation a tool call is. Pure: reads a call's name and
// arguments, answers what the office should show. It never changes a call.

import type { ToolKind } from './sim'

export type Fields = Readonly<Record<string, unknown>>

export type Sorted =
  | { as: 'skip' }
  | { as: 'ask'; text: string }
  | { as: 'tool'; kind: ToolKind; label: string; path?: string }

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return cut < 0 ? trimmed : trimmed.slice(cut + 1)
}

function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url)
  return match?.[1] ?? url
}

// a test runner called by name, anywhere in a command line
const RUNNER =
  /(^|[\s;&|(])(pytest|py\.test|jest|vitest|mocha|ava|rspec|phpunit|pest|ctest|tox|nose2|nosetests|karma|playwright\s+test|cypress\s+run|xcodebuild\s+test|node\s+--test|plugin\s+test)(\s|$)/i
// a build tool or package manager asked to test: `npm test`, `cargo test`, `npm run test:unit`
const SUBCOMMAND =
  /(^|[\s;&|(])(\.\/)?(npm|pnpm|yarn|bun|deno|npx|cargo|go|dotnet|mvn|mvnw|gradle|gradlew|make|rake|mix|swift|flutter|dart|bazel|nx|turbo|composer|lein|sbt|zig|just|python3?|uv|poetry|pipenv|hatch|rails|artisan)\s+(-\S+\s+)*(run\s+|-m\s+)?(tests?|unittest|test:\S+)(\s|$)/i

/** Whether a shell command runs tests. */
export function isTestCommand(command: string): boolean {
  return RUNNER.test(command) || SUBCOMMAND.test(command)
}

function file(kind: ToolKind, path: string, fallback: string): Sorted {
  return path === ''
    ? { as: 'tool', kind, label: fallback }
    : { as: 'tool', kind, label: baseName(path), path }
}

/** What the office shows for a call of `tool` with these arguments. */
export function sortTool(tool: string, input: Fields): Sorted {
  switch (tool) {
    case 'Read':
    case 'NotebookRead':
    case 'LS':
      return file('read', text(input.file_path) || text(input.notebook_path) || text(input.path), tool)
    case 'Grep':
    case 'Glob': {
      const where = text(input.path)
      const sorted: Sorted = { as: 'tool', kind: 'read', label: text(input.pattern) || tool }
      return where === '' ? sorted : { ...sorted, path: `${where.replace(/\/+$/, '')}/` }
    }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return file('edit', text(input.file_path) || text(input.notebook_path), tool)
    case 'Write':
      return file('write', text(input.file_path), tool)
    case 'Bash': {
      const command = text(input.command).trim()
      return { as: 'tool', kind: isTestCommand(command) ? 'test' : 'bash', label: command || tool }
    }
    case 'WebFetch':
      return { as: 'tool', kind: 'web', label: hostOf(text(input.url)) || tool }
    case 'WebSearch':
      return { as: 'tool', kind: 'web', label: text(input.query) || tool }
    case 'AskUserQuestion': {
      const first = Array.isArray(input.questions) ? (input.questions[0] as Fields | undefined) : undefined
      return { as: 'ask', text: text(first?.question) || 'Bir soru' }
    }
    // an agent starting, a message sent: the office hears of these on their own
    case 'Agent':
    case 'Task':
    case 'SendMessage':
    case 'Workflow':
      return { as: 'skip' }
    default: {
      const short = tool.startsWith('mcp__') ? (tool.split('__').pop() ?? tool) : tool
      const isBrowsing = /browser|chrome|web[_-]?(fetch|search)/i.test(tool)
      return { as: 'tool', kind: isBrowsing ? 'web' : 'work', label: short }
    }
  }
}

/** What a permission request is about, in a few words. */
export function permissionText(tool: string, input: Fields): string {
  const about = text(input.command) || text(input.file_path) || text(input.url) || text(input.notebook_path)
  return about === '' ? tool : tool === 'Bash' ? about : `${tool} · ${baseName(about)}`
}

/** Whether a finished call succeeded: not refused, no error, and for a command a zero exit. */
export function succeeded(ran: Fields): boolean {
  if (ran.deny !== undefined || ran.isError === true) return false
  const result = typeof ran.result === 'object' && ran.result !== null ? (ran.result as Fields) : undefined
  if (result === undefined) return true
  if (typeof result.exitCode === 'number' && result.exitCode !== 0) return false
  return result.interrupted !== true
}

/** The id of an agent a finished Agent call ran to its end, if it did. */
export function finishedAgent(ran: Fields): string | undefined {
  const result = typeof ran.result === 'object' && ran.result !== null ? (ran.result as Fields) : undefined
  return result !== undefined && result.status === 'completed' && typeof result.agentId === 'string'
    ? result.agentId
    : undefined
}
