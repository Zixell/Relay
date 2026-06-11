const { join } = require('path')
const { fixNodePtyPermissions } = require('./fix-node-pty-perms')

/** @param {import('electron-builder').AfterPackContext} context */
exports.default = async function afterPack(context) {
  const appName = `${context.packager.appInfo.productFilename}.app`
  const unpackedRoot = join(context.appOutDir, appName, 'Contents', 'Resources', 'app.asar.unpacked')
  fixNodePtyPermissions(unpackedRoot)
}
