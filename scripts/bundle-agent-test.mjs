/**
 * 把 tests/agent-harness.ts 打成裸 node 能跑的 ESM，并把主进程的真 repo 换成假 repo。
 * 单独一个脚本是因为这条替换规则用 CLI 参数表达不出来。
 */
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const FAKE_REPO = fileURLToPath(new URL('../tests/fake-repo.ts', import.meta.url))

const stubRepo = {
  name: 'stub-repo',
  setup(b) {
    b.onResolve({ filter: /(^|\/)repo$/ }, (args) =>
      args.importer.includes('node_modules') ? undefined : { path: FAKE_REPO }
    )
  }
}

await build({
  entryPoints: ['tests/agent-harness.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: '.tmp/agent-harness.mjs',
  plugins: [stubRepo],
  logLevel: 'warning'
})
