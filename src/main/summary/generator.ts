import { execSync, spawnSync, spawn } from 'child_process'

export interface SessionSummary {
  session_id: string
  timestamp: string
  text: string           // human-readable prose summary
  modified_files: string[]
  commits: string[]
  status: 'completed' | 'waiting'
  lastLogId?: number     // highest terminal_logs.id at generation time — for incremental updates
}

// ── Git helpers ────────────────────────────────────────────────────────────────

function run(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 8000 }).trim()
  } catch {
    return ''
  }
}

function getModifiedFiles(cwd: string, startCommit?: string): string[] {
  try {
    if (startCommit) {
      const out = run(`git diff --name-only ${startCommit} HEAD`, cwd)
      if (out) return out.split('\n').filter(Boolean)
    }
    const out = run('git status --porcelain', cwd)
    return out.split('\n').filter(Boolean).map((l) => l.slice(3).trim()).filter(Boolean)
  } catch {
    return []
  }
}

function getRecentCommits(cwd: string, startCommit?: string): string[] {
  try {
    const range = startCommit ? `${startCommit}..HEAD` : 'HEAD~5..HEAD'
    const out = run(`git rev-list ${range}`, cwd)
    return out.split('\n').filter(Boolean).map((h) => h.slice(0, 7))
  } catch {
    return []
  }
}

// ── Claude CLI ─────────────────────────────────────────────────────────────────

const ANSI_STRIP = /\x1b\[[0-9;]*[a-zA-Z]/g

/** Returns true if the `claude` CLI is available on PATH */
export function isClaudeCliAvailable(): boolean {
  try {
    const result = spawnSync('claude', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      shell: true
    })
    return result.status === 0
  } catch {
    return false
  }
}

/** Runs `claude --print` asynchronously, passing the prompt via stdin to avoid
 *  Windows command-line length limits and newline-escaping issues — never blocks the event loop */
function runClaudeCli(prompt: string, cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      // Pass prompt via stdin, not as a CLI arg — avoids Windows cmd.exe
      // length limits (~8191 chars) and newline/quote escaping breakage.
      child = spawn(
        'claude',
        ['--print', '--dangerously-skip-permissions'],
        { cwd, windowsHide: true, shell: true, env: process.env }
      )
    } catch {
      return resolve(null)
    }

    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => { stdout += chunk })
    child.stderr?.on('data', (chunk) => { stderr += chunk })

    // Write prompt to stdin and close the stream so claude knows input is done
    try {
      child.stdin?.write(prompt, 'utf8')
      child.stdin?.end()
    } catch {
      try { child.kill() } catch { /* ignore */ }
      return resolve(null)
    }

    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      console.warn('[relay] claude CLI timed out after 60s')
      resolve(null)
    }, 60_000)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0 || !stdout.trim()) {
        if (stderr) console.warn('[relay] claude CLI stderr:', stderr.slice(0, 200))
        return resolve(null)
      }
      resolve(stdout.replace(ANSI_STRIP, '').trim())
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      console.warn('[relay] claude CLI spawn error:', err.message)
      resolve(null)
    })
  })
}


// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generates or updates the single summary for a task.
 *
 * - If `existingSummaryText` is undefined: generates a fresh summary from all prompts + output.
 * - If `existingSummaryText` is provided: produces an updated summary by combining the existing
 *   summary with new prompts/output from the latest session only.
 *
 * There is always exactly one summary per task — this replaces any previous one.
 */
export async function generateSessionSummary(
  taskId: string,
  userPrompts: string[],
  cwd: string,
  startCommit?: string,
  status: 'completed' | 'waiting' = 'completed',
  claudeOutput?: string,
  existingSummaryText?: string,
  lastLogId?: number
): Promise<SessionSummary> {
  const sessionId = `sess_${taskId.slice(0, 8)}`
  const timestamp = new Date().toISOString()
  const modifiedFiles = getModifiedFiles(cwd, startCommit)
  const commits = getRecentCommits(cwd, startCommit)

  const fallback = (): SessionSummary => {
    const base = existingSummaryText ?? (userPrompts[0] ?? 'Coding session')
    const filesDesc = modifiedFiles.length > 0
      ? ` Changed files: ${modifiedFiles.join(', ')}.`
      : ''
    return {
      session_id: sessionId,
      timestamp,
      text: base + (existingSummaryText ? '' : filesDesc),
      modified_files: modifiedFiles,
      commits,
      status,
      lastLogId
    }
  }

  if (!isClaudeCliAvailable()) {
    console.warn('[relay] claude CLI not found — using git-based fallback summary')
    return fallback()
  }

  const filesHint = modifiedFiles.length > 0
    ? `Changed files: ${modifiedFiles.join(', ')}`
    : 'No files changed via git.'

  const commitsHint = commits.length > 0
    ? `Commits: ${commits.join(', ')}`
    : ''

  const outputSection = claudeOutput && claudeOutput.trim()
    ? `Agent terminal output (latest session):\n${claudeOutput.slice(-5000)}`
    : ''

  let prompt: string

  if (existingSummaryText) {
    // Incremental update: preserve existing summary, append what's new
    const promptsList = userPrompts.length > 0
      ? userPrompts.map((p, i) => `${i + 1}. ${p}`).join('\n')
      : '(no new explicit requests)'

    prompt =
      `You are updating a running summary of a coding task for a developer's log.\n\n` +
      `Current summary:\n${existingSummaryText}\n\n` +
      `New requests in this session:\n${promptsList}\n\n` +
      (outputSection ? `${outputSection}\n\n` : '') +
      `${filesHint}\n` +
      (commitsHint ? `${commitsHint}\n` : '') +
      `\nWrite an updated summary that incorporates both the previous work and the new work. ` +
      `Keep total length to 3–6 sentences in plain English. ` +
      `Preserve important details from the existing summary and clearly describe what changed in this session. ` +
      `Start with an action verb. Do not use bullet points, JSON, markdown, or any formatting — plain prose only.`
  } else {
    // Fresh summary from scratch
    const promptsList = userPrompts.length > 0
      ? userPrompts.map((p, i) => `${i + 1}. ${p}`).join('\n')
      : '(no explicit requests recorded)'

    prompt =
      `You are writing a brief summary of a coding session for a developer's task log.\n\n` +
      `Task request:\n${promptsList}\n\n` +
      (outputSection ? `${outputSection}\n\n` : '') +
      `${filesHint}\n` +
      (commitsHint ? `${commitsHint}\n` : '') +
      `\nWrite 2–4 sentences in plain English describing what was accomplished. ` +
      `Start with an action verb (e.g. "Implemented", "Fixed", "Added", "Refactored"). ` +
      `Be specific — mention actual file names, endpoint paths, function names, or bug descriptions when relevant. ` +
      `Do not use bullet points, JSON, markdown, or any formatting — plain prose only.\n\n` +
      `Example: "Implemented POST /api/users endpoint with email/password validation and bcrypt hashing. ` +
      `Updated auth middleware in auth.ts to validate JWT tokens on all protected routes. ` +
      `Added migration 004_users.sql and 12 new tests in auth.test.ts."`
  }

  console.log('[relay] Generating task summary via claude CLI...')
  const output = await runClaudeCli(prompt, cwd)

  if (!output) {
    console.warn('[relay] claude CLI returned no output — using fallback')
    return fallback()
  }

  // Clean up any accidental markdown or JSON the model might sneak in
  const text = output
    .replace(/^```[\s\S]*?```$/gm, '')
    .replace(/^[#*>-]+\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!text) {
    console.warn('[relay] claude CLI returned empty text — using fallback')
    return fallback()
  }

  console.log('[relay] Summary generated')
  return { session_id: sessionId, timestamp, text, modified_files: modifiedFiles, commits, status, lastLogId }
}
