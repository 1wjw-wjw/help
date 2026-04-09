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
const globalCsvFiles = [
  'health_datas.csv',
  'lisa_cluster_result_knn5.csv',
  'WHO_Region_Mean_Resource_Demand_Gap_2023.csv',
  'Global_Resource_Need_Capacity_Gap_Trend_2000_2023.csv'
]
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

function tryRun(command, args, cwd = rootDir) {
  return spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
}

function injectGhPagesScript(htmlPath, scriptSrc = './gh-pages.js') {
  if (!existsSync(htmlPath)) return
  const content = readFileSync(htmlPath, 'utf8')
  const tag = `<script src="${scriptSrc}"></script>`
  if (content.includes(tag)) return
  const next = content.includes('</head>') ? content.replace('</head>', `  ${tag}\n</head>`) : `${content}\n${tag}\n`
  writeFileSync(htmlPath, next)
}

for (const app of apps) {
  const appDir = path.join(rootDir, app.source)
  if (!existsSync(path.join(appDir, 'package.json'))) {
    throw new Error(`Missing package.json in ${app.source}`)
  }

  // Prefer deterministic installs with npm ci.
  // Fallback to npm install when lockfile/state causes ci failure.
  const ciResult = tryRun('npm', ['ci'], appDir)
  if (ciResult.status !== 0) {
    console.warn(`[vercel-build] npm ci failed in ${app.source}, fallback to npm install`)
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

// Global screen reads these CSV files at runtime; include them under the same subpath output.
for (const fileName of globalCsvFiles) {
  const src = path.join(rootDir, fileName)
  const dest = path.join(outputDir, 'global-screen', fileName)
  if (existsSync(src)) {
    cpSync(src, dest)
  }
}

const rootIndexPath = path.join(rootDir, 'index.html')
const outIndexPath = path.join(outputDir, 'index.html')
writeFileSync(outIndexPath, readFileSync(rootIndexPath))

// GitHub Pages: publish root is docs/; need 404.html for SPA-style fallback and .nojekyll to disable Jekyll.
const root404Path = path.join(rootDir, '404.html')
if (existsSync(root404Path)) {
  writeFileSync(path.join(outputDir, '404.html'), readFileSync(root404Path))
} else {
  writeFileSync(path.join(outputDir, '404.html'), readFileSync(rootIndexPath))
}

const rootNojekyllPath = path.join(rootDir, '.nojekyll')
const outNojekyllPath = path.join(outputDir, '.nojekyll')
if (existsSync(rootNojekyllPath)) {
  writeFileSync(outNojekyllPath, readFileSync(rootNojekyllPath))
} else {
  writeFileSync(outNojekyllPath, '')
}

const rootGhPagesScriptPath = path.join(rootDir, 'gh-pages.js')
const outGhPagesScriptPath = path.join(outputDir, 'gh-pages.js')
if (existsSync(rootGhPagesScriptPath)) {
  writeFileSync(outGhPagesScriptPath, readFileSync(rootGhPagesScriptPath))
}

injectGhPagesScript(path.join(outputDir, 'index.html'), './gh-pages.js')
injectGhPagesScript(path.join(outputDir, '404.html'), './gh-pages.js')
for (const app of apps) {
  injectGhPagesScript(path.join(outputDir, app.output, 'index.html'), '../gh-pages.js')
}

const docsDir = path.join(rootDir, 'docs')
rmSync(docsDir, { recursive: true, force: true })
cpSync(outputDir, docsDir, { recursive: true })
