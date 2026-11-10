// One development entry point for the existing FastAPI + Vite application.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
if (existsSync(resolve(root, '.env')) && process.loadEnvFile) process.loadEnvFile(resolve(root, '.env'))
const localPython = resolve(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python')
const python = process.env.CAIL_PYTHON_BIN || (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3')
const apiPort = process.env.CAIL_API_PORT || '8000'
function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}
const port = argument('--port', process.env.PORT || '5173')
const host = argument('--host', '0.0.0.0')
const seedDemo = process.env.CAIL_TRANSFER_DEMO === 'true' && process.env.CAIL_TRANSFER_DEMO_SEED === 'true'
const children = []
let closing = false
function stop(code = 0) {
  if (closing) return
  closing = true
  children.forEach(child => child.kill('SIGTERM'))
  process.exitCode = code
}
function start(command, args, cwd, env = process.env, { oneShot = false, optional = false } = {}) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
  children.push(child)
  child.on('error', error => {
    console.error(`Development service failed: ${error.message}`)
    if (!optional) stop(1)
  })
  child.on('exit', code => {
    if (closing || (oneShot && code === 0)) return
    if (optional) console.error('Knowledge Tree practice is unavailable. Check the service error above.')
    else stop(code ?? 1)
  })
  return child
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())

const address = `http://127.0.0.1:${apiPort}`
function startFrontend(practiceTarget = '') {
  start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', host, '--port', port, '--strictPort'],
        resolve(root, 'frontend'),
        { ...process.env, LEGACY_API_PROXY_TARGET: address, CAIL_PRACTICE_PROXY_TARGET: practiceTarget })
}
async function ready(url) {
  const deadline = Date.now() + 15000
  while (!closing && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return true
    } catch { /* The service is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  return false
}
async function startReviewerDemo() {
  const frontend = `http://127.0.0.1:${port}`
  if (!await ready(address + '/api/v1/health') || closing) return
  startFrontend()
  if (!await ready(frontend + '/api/v1/health') || closing) return
  const seed = start(python, ['-m', 'app.transfer_demo'], resolve(root, 'backend'),
                     { ...process.env, CAIL_TRANSFER_DEMO_URL: address }, { oneShot: true })
  seed.on('exit', code => {
    if (code === 0 && !closing)
      console.log(`\nReviewer demo ready. Open ${frontend}/#/graph\nPress Ctrl+C here to stop the local demo.\n`)
  })
  return true
}
async function startGraphPractice() {
  // Ask the OS for a loopback port so another local workspace can run alongside this one.
  const portForPractice = await new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const available = probe.address().port
      probe.close(error => error ? reject(error) : resolvePort(String(available)))
    })
  })
  if (closing) return ''
  start(python, ['-m', 'app.graph_practice', '--port', portForPractice, '--data-dir',
                resolve(root, 'data/transfer-demo', `workspace-${port}`)],
        resolve(root, 'backend'), process.env, { optional: true })
  return `http://127.0.0.1:${portForPractice}`
}

const apiArgs = ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', apiPort]
if (seedDemo) apiArgs.push('--no-access-log')
start(python, apiArgs, resolve(root, 'backend'))
if (seedDemo) {
  if (!await startReviewerDemo() && !closing) {
    console.error('The local reviewer demo did not become ready.')
    stop(1)
  }
} else {
  const practiceTarget = await startGraphPractice().catch(error => {
    console.error(`Knowledge Tree practice is unavailable: ${error.message}`)
    return ''
  })
  if (!closing) startFrontend(practiceTarget)
}
