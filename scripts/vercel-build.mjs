import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const apps = [
  { source: 'apps/global-screen', output: 'global-screen' },
  { source: 'apps/china-screen', output: 'china-screen' },
  { source: 'apps/province-screen', output: 'province-screen' }
]
const outputDir = path.join(rootDir, 'public_out')

function run(command, args, cwd = rootDir) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

for (const app of apps) {
  const appDir = path.join(rootDir, app.source)
  if (!existsSync(path.join(appDir, 'package.json'))) {
    throw new Error(`Missing package.json in ${app.source}`)
  }

  // Install in CI mode first for deterministic builds; fallback to install if needed.
  const ciResult = spawnSync('npm', ['ci'], {
    cwd: appDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (ciResult.status !== 0) {
    run('npm', ['install'], appDir)
  }

  run('npm', ['run', 'build'], appDir)
}

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(outputDir, { recursive: true })

for (const app of apps) {
  const distDir = path.join(rootDir, app.source, 'dist')
  const targetDir = path.join(outputDir, app.output)

  if (!existsSync(distDir)) {
    throw new Error(`Build output not found: ${distDir}`)
  }

  mkdirSync(targetDir, { recursive: true })
  cpSync(distDir, targetDir, { recursive: true })
}

const rootIndexPath = path.join(rootDir, 'index.html')
const outIndexPath = path.join(outputDir, 'index.html')
writeFileSync(outIndexPath, readFileSync(rootIndexPath))
