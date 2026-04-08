import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const appRoot = path.join(rootDir, 'apps')

const processes = []
const commands = [
  { name: 'china', cwd: path.join(appRoot, 'china-screen') },
  { name: 'global', cwd: path.join(appRoot, 'global-screen') },
  { name: 'province', cwd: path.join(appRoot, 'province-screen') }
]

for (const cmd of commands) {
  const child = spawn('npm', ['run', 'dev'], {
    cwd: cmd.cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  processes.push(child)
}

let hasExited = false
function shutdown(code = 0) {
  if (hasExited) return
  hasExited = true
  for (const child of processes) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }
  process.exit(code)
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown(code)
    }
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
