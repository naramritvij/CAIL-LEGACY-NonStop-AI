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
const reuseApi = process.argv.includes('--reuse-api')
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
function probePort(host, port) {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', error => {
      if (error.code === 'EADDRINUSE') resolvePort(null)
      else reject(error)
    })
    probe.listen(Number(port), host, () => {
      const available = probe.address().port
      probe.close(error => error ? reject(error) : resolvePort(available))
    })
  })
}
async function isWorkspaceApi() {
  try {
    const options = { signal: AbortSignal.timeout(2000), redirect: 'error' }
    const health = await fetch(address + '/api/v1/health', options)
    if (!health.ok) return false
    const { status, mode } = await health.json()
    if (status !== 'ok' || mode !== 'synthetic_read_only') return false
    const session = await fetch(address + '/api/v1/workspace/session', options)
    if (session.status === 401) return true
    if (!session.ok) return false
    const operator = await session.json()
    return typeof operator.id === 'string' && typeof operator.name === 'string' && operator.transfer_demo !== true
  } catch {
    return false
  }
}
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
  const portForPractice = await probePort('127.0.0.1', 0)
  if (portForPractice === null) throw new Error('A loopback port could not be allocated.')
  if (closing) return ''
  start(python, ['-m', 'app.graph_practice', '--port', String(portForPractice), '--data-dir',
                resolve(root, 'data/transfer-demo', `workspace-${port}`)],
        resolve(root, 'backend'), process.env, { optional: true })
  return `http://127.0.0.1:${portForPractice}`
}

async function run() {
  if (await probePort(host, port) === null) {
    throw new Error(`Frontend port ${port} is in use. Stop the previous frontend before starting this one.`)
  }
  const availableApi = await probePort('127.0.0.1', apiPort)
  if (closing) return
  if (availableApi === null) {
    if (seedDemo) throw new Error(`The reviewer demo requires a free backend port. Port ${apiPort} is in use.`)
    if (!reuseApi) {
      throw new Error(`Backend port ${apiPort} is in use. To use a running CAIL workspace API, rerun with --reuse-api.`)
    }
    if (!await isWorkspaceApi()) {
      throw new Error(`Port ${apiPort} is in use. Choose a free CAIL_API_PORT or point it at a running CAIL workspace API.`)
    }
    console.log(`Using the existing CAIL workspace API at ${address}.`)
  } else {
    const apiArgs = ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', apiPort]
    if (seedDemo) apiArgs.push('--no-access-log')
    start(python, apiArgs, resolve(root, 'backend'))
  }
  if (closing) return
  if (seedDemo) {
    if (!await startReviewerDemo() && !closing) {
      throw new Error('The local reviewer demo did not become ready.')
    }
    return
  }
  const practiceTarget = await startGraphPractice().catch(error => {
    console.error(`Knowledge Tree practice is unavailable: ${error.message}`)
    return ''
  })
  if (!closing) startFrontend(practiceTarget)
}

try {
  await run()
} catch (error) {
  if (!closing) {
    console.error(error.message)
    stop(1)
  }
}
