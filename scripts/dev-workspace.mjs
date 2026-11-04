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
function start(command, args, cwd, env = process.env) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' })
  children.push(child)
  child.on('error', error => { console.error(`Development service failed: ${error.message}`); stop(1) })
  child.on('exit', code => { if (!closing) stop(code || 0) })
}
start(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', apiPort], resolve(root, 'backend'))
start(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--host', host, '--port', port, '--strictPort'], resolve(root, 'frontend'),
      { ...process.env, LEGACY_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` })
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
