import { chmodSync, constants, existsSync, readdirSync, accessSync } from 'fs'
import { dirname, join } from 'path'

/** Native binaries unpacked from asar live under app.asar.unpacked. */
function toUnpackedPath(filePath: string): string {
  if (filePath.includes('app.asar') && !filePath.includes('app.asar.unpacked')) {
    return filePath.replace('app.asar', 'app.asar.unpacked')
  }
  return filePath
}

function ensureExecutable(filePath: string): void {
  const resolved = toUnpackedPath(filePath)
  if (!existsSync(resolved)) return
  try {
    accessSync(resolved, constants.X_OK)
  } catch {
    chmodSync(resolved, 0o755)
    console.log('[relay] Fixed node-pty spawn-helper permissions:', resolved)
  }
}

function getNodePtyRoots(): string[] {
  const roots = new Set<string>()

  try {
    roots.add(dirname(require.resolve('node-pty/package.json')))
  } catch {
    // Packaged app may resolve modules differently during early init.
  }

  if (process.resourcesPath) {
    roots.add(join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'node-pty'))
    roots.add(join(process.resourcesPath, 'app.asar', 'node_modules', 'node-pty'))
  }

  return [...roots]
}

/** Ensure node-pty's spawn-helper is executable (required for PTY on macOS/Linux). */
export function ensureNodePtyPermissions(): void {
  if (process.platform === 'win32') return

  try {
    for (const nodePtyRoot of getNodePtyRoots()) {
      const prebuildsDir = toUnpackedPath(join(nodePtyRoot, 'prebuilds'))
      if (!existsSync(prebuildsDir)) continue

      for (const platform of readdirSync(prebuildsDir)) {
        if (!platform.startsWith('darwin-')) continue
        ensureExecutable(join(prebuildsDir, platform, 'spawn-helper'))
      }

      ensureExecutable(join(nodePtyRoot, 'build', 'Release', 'spawn-helper'))
    }
  } catch (err) {
    console.warn('[relay] Could not verify node-pty spawn-helper permissions:', err)
  }
}
