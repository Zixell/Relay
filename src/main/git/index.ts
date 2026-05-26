import { execSync, spawnSync } from 'child_process'

export interface GitFileChange {
  path: string
  type: 'modified' | 'added' | 'deleted' | 'renamed'
  additions: number
  deletions: number
}

export interface GitChangesResult {
  isGitRepo: boolean
  branch: string
  baseBranch: string
  files: GitFileChange[]
  committedCount: number
  isActiveBranch: boolean  // whether the task branch is currently checked out
}

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 8000
    }).trim()
  } catch {
    return ''
  }
}

// Runs a git command and returns { success, stderr } — does NOT throw
function git(args: string[], cwd: string): { success: boolean; stdout: string; stderr: string } {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 10000
  })
  return {
    success: result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim()
  }
}

/**
 * Ensures the given branch exists and is checked out in `cwd`.
 * - If the branch exists locally: switches to it.
 * - If it does not exist: creates it from current HEAD.
 * Throws with a human-readable message on failure.
 */
export function ensureBranch(cwd: string, branch: string): { created: boolean } {
  const isRepo = run('git rev-parse --is-inside-work-tree', cwd)
  if (isRepo !== 'true') {
    throw new Error(`"${cwd}" is not inside a git repository`)
  }

  // Check if branch exists locally
  const exists = git(['rev-parse', '--verify', branch], cwd).success

  if (exists) {
    const checkout = git(['checkout', branch], cwd)
    if (!checkout.success) {
      throw new Error(
        `Failed to checkout branch "${branch}": ${checkout.stderr || 'unknown error'}`
      )
    }
    return { created: false }
  } else {
    const create = git(['checkout', '-b', branch], cwd)
    if (!create.success) {
      throw new Error(
        `Failed to create branch "${branch}": ${create.stderr || 'unknown error'}`
      )
    }
    return { created: true }
  }
}

function detectBaseBranch(cwd: string): string {
  // Try origin/HEAD first (most reliable)
  const originHead = run('git symbolic-ref refs/remotes/origin/HEAD --short', cwd)
  if (originHead) return originHead.replace('origin/', '')

  // Check local main / master
  if (run('git rev-parse --verify main', cwd)) return 'main'
  if (run('git rev-parse --verify master', cwd)) return 'master'
  if (run('git rev-parse --verify develop', cwd)) return 'develop'

  return ''
}

function parseNumstat(output: string): Map<string, { additions: number; deletions: number }> {
  const map = new Map<string, { additions: number; deletions: number }>()
  for (const line of output.split('\n')) {
    const parts = line.trim().split('\t')
    if (parts.length >= 3) {
      const additions = parseInt(parts[0]) || 0
      const deletions = parseInt(parts[1]) || 0
      const path = parts[2].replace(/^"|"$/g, '')
      if (!path) continue
      const existing = map.get(path)
      if (existing) {
        map.set(path, {
          additions: Math.max(existing.additions, additions),
          deletions: Math.max(existing.deletions, deletions)
        })
      } else {
        map.set(path, { additions, deletions })
      }
    }
  }
  return map
}

export function getCurrentCommit(cwd: string): string {
  return run('git rev-parse HEAD', cwd)
}

export function getGitChanges(cwd: string, taskBranch?: string, startCommit?: string): GitChangesResult {
  const empty: GitChangesResult = {
    isGitRepo: false,
    branch: '',
    baseBranch: '',
    files: [],
    committedCount: 0,
    isActiveBranch: false
  }

  const isRepo = run('git rev-parse --is-inside-work-tree', cwd)
  if (isRepo !== 'true') return empty

  const currentBranch = run('git rev-parse --abbrev-ref HEAD', cwd)
  const targetBranch = (taskBranch && git(['rev-parse', '--verify', taskBranch], cwd).success)
    ? taskBranch
    : currentBranch
  const isActiveBranch = targetBranch === currentBranch
  const baseBranch = detectBaseBranch(cwd)

  const seenPaths = new Set<string>()
  const files: GitFileChange[] = []

  // ── COMMITTED CHANGES ───────────────────────────────────────────
  // Always diff two explicit refs: baseRef → targetBranch (branch tip, NOT working tree).
  // This scopes results to commits made on the task branch only.
  const hasValidStartCommit = startCommit
    ? git(['cat-file', '-e', startCommit], cwd).success
    : false
  const committedBase = hasValidStartCommit
    ? startCommit!
    : (baseBranch && baseBranch !== targetBranch ? baseBranch : null)

  if (committedBase) {
    const statsMap = parseNumstat(run(`git diff --numstat ${committedBase} ${targetBranch}`, cwd))

    // Use --name-status to get exact file types from committed diff
    const nameStatus = run(`git diff --name-status ${committedBase} ${targetBranch}`, cwd)
    for (const line of nameStatus.split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const code = parts[0]

      let type: GitFileChange['type'] = 'modified'
      let path: string

      if (code.startsWith('R')) {
        type = 'renamed'
        path = parts[2]?.replace(/^"|"$/g, '') ?? parts[1]?.replace(/^"|"$/g, '')
      } else if (code === 'A') {
        type = 'added'
        path = parts[1]?.replace(/^"|"$/g, '')
      } else if (code === 'D') {
        type = 'deleted'
        path = parts[1]?.replace(/^"|"$/g, '')
      } else {
        path = parts[1]?.replace(/^"|"$/g, '')
      }

      if (!path || seenPaths.has(path)) continue
      seenPaths.add(path)

      const stats = statsMap.get(path) ?? { additions: 0, deletions: 0 }
      files.push({ path, type, additions: stats.additions, deletions: stats.deletions })
    }
  }

  // ── UNCOMMITTED CHANGES (only when task branch is active) ────────
  // git diff HEAD shows staged+unstaged vs the current branch tip —
  // these are changes made during this session that aren't committed yet.
  if (isActiveBranch) {
    const uncommittedStats = new Map<string, { additions: number; deletions: number }>()
    for (const cmd of ['git diff --numstat --cached HEAD', 'git diff --numstat HEAD']) {
      for (const [p, s] of parseNumstat(run(cmd, cwd))) {
        const ex = uncommittedStats.get(p)
        uncommittedStats.set(p, ex
          ? { additions: Math.max(ex.additions, s.additions), deletions: Math.max(ex.deletions, s.deletions) }
          : s
        )
      }
    }

    const statusOut = run('git status --porcelain', cwd)
    for (const line of statusOut.split('\n')) {
      if (!line.trim()) continue
      const x = line[0]
      const y = line[1]
      const rest = line.slice(3)

      let type: GitFileChange['type'] = 'modified'
      let path = rest.replace(/^"|"$/g, '')

      if (x === 'R' || y === 'R') {
        type = 'renamed'
        const arrowIdx = rest.indexOf(' -> ')
        if (arrowIdx !== -1) path = rest.slice(arrowIdx + 4).replace(/^"|"$/g, '')
      } else if (x === 'A' || y === 'A' || (x === '?' && y === '?')) {
        type = 'added'
      } else if (x === 'D' || y === 'D') {
        type = 'deleted'
      }

      if (!path) continue
      const stats = uncommittedStats.get(path) ?? { additions: 0, deletions: 0 }

      if (seenPaths.has(path)) {
        // File already in committed list — update stats to reflect latest state
        const existing = files.find((f) => f.path === path)
        if (existing) {
          existing.additions = Math.max(existing.additions, stats.additions)
          existing.deletions = Math.max(existing.deletions, stats.deletions)
        }
      } else {
        seenPaths.add(path)
        files.push({ path, type, additions: stats.additions, deletions: stats.deletions })
      }
    }
  }

  // Count commits on the task branch since session start
  let committedCount = 0
  if (hasValidStartCommit) {
    committedCount = parseInt(run(`git rev-list --count ${startCommit}..${targetBranch}`, cwd)) || 0
  } else if (baseBranch && targetBranch !== baseBranch) {
    committedCount = parseInt(run(`git rev-list --count ${baseBranch}..${targetBranch}`, cwd)) || 0
  }

  return { isGitRepo: true, branch: targetBranch, baseBranch, files, committedCount, isActiveBranch }
}
