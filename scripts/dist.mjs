/**
 * 打包发布物。单独一个脚本只为一件事：把 NODE_OPTIONS 设成 --use-system-ca 再拉起 electron-builder。
 * 本机走代理时 GitHub 上那些二进制的证书链验不过（unable to verify the first certificate），
 * 装到 nsis 那一步直接失败；改用 Windows 系统 CA 就正常。
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const opts = new Set((process.env.NODE_OPTIONS || '').split(/\s+/).filter(Boolean))
opts.add('--use-system-ca')
process.env.NODE_OPTIONS = [...opts].join(' ')

const cli = fileURLToPath(new URL('../node_modules/electron-builder/out/cli/cli.js', import.meta.url))
const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status ?? 1)
