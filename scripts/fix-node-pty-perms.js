#!/usr/bin/env node
/**
 * node-pty ships spawn-helper without the executable bit in npm prebuilds.
 * electron-builder preserves that, so posix_spawnp fails at runtime.
 */
const { chmodSync, existsSync, readdirSync } = require('fs')
const { join } = require('path')

function toUnpackedPath(filePath) {
  if (filePath.includes('app.asar') && !filePath.includes('app.asar.unpacked')) {
    return filePath.replace('app.asar', 'app.asar.unpacked')
  }
  return filePath
}

function fixSpawnHelperAt(helperPath) {
  const resolved = toUnpackedPath(helperPath)
  if (!existsSync(resolved)) return false
  chmodSync(resolved, 0o755)
  console.log(`[relay] chmod +x ${resolved}`)
  return true
}

function fixNodePtyDir(nodePtyDir) {
  if (!existsSync(nodePtyDir)) return

  const prebuildsDir = join(nodePtyDir, 'prebuilds')
  if (existsSync(prebuildsDir)) {
    for (const platform of readdirSync(prebuildsDir)) {
      if (!platform.startsWith('darwin-')) continue
      fixSpawnHelperAt(join(prebuildsDir, platform, 'spawn-helper'))
    }
  }

  fixSpawnHelperAt(join(nodePtyDir, 'build', 'Release', 'spawn-helper'))
}

function fixNodePtyPermissions(rootDir) {
  fixNodePtyDir(join(rootDir, 'node_modules', 'node-pty'))
  fixNodePtyDir(join(rootDir, 'node-pty'))
}

if (require.main === module) {
  fixNodePtyPermissions(process.argv[2] || join(__dirname, '..'))
}

module.exports = { fixNodePtyPermissions, fixNodePtyDir }
