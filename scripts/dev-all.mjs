import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const appRoot = path.join(rootDir, 'apps')
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const ports = [5172, 5173, 5174]

const processes = []
const commands = [
  { name: 'china', cwd: path.join(appRoot, 'china-screen') },
  { name: 'global', cwd: path.join(appRoot, 'global-screen') },
  { name: 'province', cwd: path.join(appRoot, 'province-screen') }
]

function runAndWait(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32' && command === npmCmd
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code ?? 'unknown'}`))
    })
    child.on('error', reject)
  })
}

async function freePorts() {
  if (process.platform === 'win32') {
    // Kill processes listening on target ports to avoid Vite startup conflicts.
    for (const port of ports) {
      await runAndWait('powershell', [
        '-NoProfile',
        '-Command',
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`
      ]).catch(() => {})
    }
    return
  }

  await runAndWait(npmCmd, ['exec', '--yes', 'kill-port', ...ports.map(String)]).catch(() => {})
}

await freePorts()

for (const cmd of commands) {
  const child = spawn(npmCmd, ['run', 'dev'], {
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
