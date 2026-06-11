import { spawnSync } from 'child_process'
import { homedir } from 'os'

let cachedPath: string | undefined

const PATH_SEP = process.platform === 'win32' ? ';' : ':'

function defaultPathEntries(): string[] {
  const home = homedir()
  return [
    `${home}/.local/bin`,
    `${home}/.cargo/bin`,
    `${home}/.npm-global/bin`,
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ]
}

function mergePathEntries(...groups: string[][]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const group of groups) {
    for (const entry of group) {
      if (!entry || seen.has(entry)) continue
      seen.add(entry)
      out.push(entry)
    }
  }
  return out.join(PATH_SEP)
}

/** Resolve a PATH that includes tools installed via Homebrew, npm, etc.
 *  GUI apps on macOS/Linux inherit a stripped-down PATH from the launcher. */
export function resolveAppPath(): string {
  if (cachedPath) return cachedPath

  const existing = (process.env.PATH ?? '').split(PATH_SEP).filter(Boolean)
  const defaults = defaultPathEntries()

  if (process.platform !== 'win32') {
    const shell = process.env.SHELL || '/bin/zsh'
    try {
      const result = spawnSync(shell, ['-ilc', 'echo -n "$PATH"'], {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, HOME: homedir() }
      })
      const loginPath = result.stdout?.trim()
      if (result.status === 0 && loginPath) {
        cachedPath = mergePathEntries(loginPath.split(':'), defaults, existing)
        return cachedPath
      }
    } catch {
      // fall through to defaults
    }
  }

  cachedPath = mergePathEntries(existing, defaults)
  return cachedPath
}

/** Build process env with HOME, PATH, and platform-specific fixes for subprocesses/PTY. */
export function buildAppEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: homedir(),
    PATH: resolveAppPath(),
    ...extra
  }

  if (process.platform === 'win32' && !env.SSH_AUTH_SOCK) {
    env.SSH_AUTH_SOCK = '//./pipe/openssh-ssh-agent'
  }

  return env
}

export function resolveUnixShell(): string {
  return process.env.SHELL || '/bin/zsh'
}
