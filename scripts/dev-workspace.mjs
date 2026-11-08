// One development entry point for the existing FastAPI + Vite application.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
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
const children = []
let closing = false
function stop(code = 0) {
  if (closing) return
  closing = true
  children.forEach(child => child.kill('SIGTERM'))
  process.exitCode = code
}
function start(command, args, cwd, env = process.env, oneShot = false) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' })
  children.push(child)
  child.on('error', error => { console.error(`Development service failed: ${error.message}`); stop(1) })
  child.on('exit', code => { if (!closing && (!oneShot || code !== 0)) stop(code || 0) })
}
start(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', apiPort], resolve(root, 'backend'))
start(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--host', host, '--port', port, '--strictPort'], resolve(root, 'frontend'),
      { ...process.env, LEGACY_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` })
if (process.env.CAIL_TRANSFER_DEMO === 'true' && process.env.CAIL_TRANSFER_DEMO_SEED === 'true') {
  const address = `http://127.0.0.1:${apiPort}`
  const deadline = Date.now() + 15000
  let ready = false
  while (!closing && Date.now() < deadline) {
    try {
      const response = await fetch(address + '/api/v1/health', { signal: AbortSignal.timeout(1000) })
      if (response.ok) { ready = true; break }
    } catch { /* The API is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  if (ready && !closing)
    start(python, ['-m', 'app.transfer_demo'], resolve(root, 'backend'),
          { ...process.env, CAIL_TRANSFER_DEMO_URL: address }, true)
  else if (!closing) {
    console.error('The isolated transfer demo API did not become ready.')
    stop(1)
  }
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
