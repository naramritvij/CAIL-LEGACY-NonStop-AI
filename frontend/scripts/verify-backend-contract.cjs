'use strict'
/**
 * Check that the v0 facade recognizes the checked-in FastAPI response SHAPES.
 * These are fixed synthetic contract snapshots (not a live API integration test).
 * Run after npm install: npm run test:contract
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cail-contract-'))
for (const filename of ['errors.ts', 'backend-contract.ts']) {
  const source = fs.readFileSync(path.join(root, 'src', 'api', filename), 'utf8')
  const res = ts.transpileModule(source, {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  })
  if (res.diagnostics?.some((d) => d.category === ts.DiagnosticCategory.Error)) {
    throw new Error('Failed to transpile ' + filename)
  }
  fs.writeFileSync(path.join(tmp, filename.replace(/\.ts$/, '.js')), res.outputText)
}
const requireTmp = createRequire(path.join(tmp, 'verify.cjs'))
const { fromBackendIncidents, fromBackendWorkspace, fromBackendTree, fromBackendGrounded } = requireTmp('./backend-contract.js')

const disk = {
  id: 'INC-DISK-001', title: '$DATA03 capacity increasing', system: 'SIMULATED-NONSTOP-A',
  severity: 'warning', status: 'investigating', synthetic: true,
  summary: 'Disk utilization rose from 72% to 81%; ownership not verified.',
  metrics: [
    { name: 'Disk utilization', value: 81, baseline: 72, unit: '%' },
    { name: 'Simulated threshold', value: 80, baseline: 80, unit: '%' },
  ],
  events: [
    { id: 'SIM-EVT-101', time: '00:00', source: 'disk-monitor', level: 'info', message: 'Synthetic disk capacity 72%' },
    { id: 'SIM-EVT-103', time: '06:00', source: 'disk-monitor', level: 'warning', message: 'Synthetic disk capacity 81%' },
  ],
  hypotheses: ['An application file may be growing.'],
  unknowns: ['File ownership', 'Retention policy'],
}
const pathIncident = {
  ...disk, id: 'INC-PATH-002', title: 'Pathway service degradation', severity: 'high',
  metrics: [{ name: 'Response latency', value: 842, baseline: 120, unit: 'ms' }],
  events: [{ id: 'SIM-EVT-201', time: '14:11', source: 'service-monitor', level: 'warning', message: 'Synthetic high latency' }],
}
const approved = {
  id: 'local-lesson-1', incident_id: 'INC-DISK-001', incident_title: disk.title,
  title: 'Confirm file ownership first', review_status: 'approved',
  reasoning_preview: 'Inspect before any deletion.', source_event_ids: ['SIM-EVT-101'],
  reviewed_at: '2026-10-17T12:00:00Z', revision_of: null,
}
const tree = {
  synthetic: true, review_scope: 'approved_only', identity_or_source_authenticity_verified: false,
  nodes: [approved], edges: [], returned_node_count: 1,
}
const workspace = {
  synthetic: true, operational_action_authorized: false, state_change_executed: false,
  incident_id: disk.id, incident: disk,
  analysis: {
    root_cause_status: 'not_established',
    findings: [{ statement: 'Utilization rose from 72% to 81%', kind: 'observed_trend', evidence_ids: ['SIM-EVT-101','SIM-EVT-103'] }],
    hypotheses_unverified: disk.hypotheses,
    missing_evidence: disk.unknowns,
    recommended_read_only_actions: ['inspect_disk_growth', 'inspect_events', 'purge_files'],
  },
  legacy_tree: tree,
  training_challenges: [{lesson_id:'local-lesson-1'}],
  sentinel_previews: [
    { action_id: 'inspect_disk_growth', classification: 'read_only', allowed: true, simulation_only: true },
    { action_id: 'inspect_events', classification: 'read_only', allowed: true, simulation_only: true },
    { action_id: 'purge_files', classification: 'destructive', allowed: false, simulation_only: true },
  ],
}
let checks = 0
function test(name, fn) {
  try { fn(); checks++; process.stdout.write('✓ ' + name + '\n') }
  catch (err) { process.stderr.write('FAILED: ' + name + ': ' + err.stack + '\n'); process.exitCode = 1 }
}
test('two real incident schemas normalize as synthetic', () => {
  const items = fromBackendIncidents([disk, pathIncident])
  assert.deepEqual(items.map((x) => x.incident_id), ['INC-DISK-001','INC-PATH-002'])
  assert.deepEqual(items.map((x) => x.severity), ['SEV-3','SEV-2'])
  assert.ok(items.every((x) => x.synthetic))
})
test('workspace retains evidence IDs without invented metrics or impact', () => {
  const w = fromBackendWorkspace(workspace)
  assert.equal(w.incident.incident_id, 'INC-DISK-001')
  assert.equal(w.metrics.length, 1)
  assert.equal(w.metrics[0].threshold, 80)
  assert.deepEqual(w.metrics[0].samples, [])
  assert.equal(w.evidence[0].evidence_id, 'SIM-EVT-101')
  assert.equal(w.analysis.observations[0].evidence_ids[1], 'SIM-EVT-103')
  assert.equal(w.analysis.hypotheses[0].status, 'unconfirmed')
  assert.ok(w.incident.impact.includes('not independently measured'))
  assert.deepEqual(w.preview_action_ids, ['inspect_disk_growth','inspect_events'])
  assert.equal(w.knowledge_pointers[0].review_status, 'approved')
})
test('workspace refuses absent read-only safety flags', () => {
  assert.throws(() => fromBackendWorkspace({ ...workspace, state_change_executed: true }), /safety/i)
})
test('workspace rejects unregistered finding evidence', () => {
  assert.throws(() => fromBackendWorkspace({ ...workspace, analysis: { ...workspace.analysis,
    findings: [{ statement:'invented', evidence_ids:['SIM-EVT-999'] }] } }), /unknown or missing/i)
})
test('workspace refuses a supposedly established root cause', () => {
  assert.throws(() => fromBackendWorkspace({ ...workspace, analysis: { ...workspace.analysis,
    root_cause_status:'established' } }), /root cause/i)
})
test('tree maps approved local nodes and discards unapproved nodes', () => {
  const normalized = fromBackendTree({ ...tree, nodes: [approved, { ...approved, id:'draft', review_status:'draft' }] })
  assert.equal(normalized.nodes.length, 1)
  assert.equal(normalized.nodes[0].lesson_id, 'local-lesson-1')
  assert.deepEqual(normalized.nodes[0].evidence_ids, ['SIM-EVT-101'])
})
test('tree refuses missing approved-only backend restriction', () => {
  assert.throws(() => fromBackendTree({ ...tree, review_scope:'all' }), /approved-only/i)
})
test('accepted Ollama response shows only ID-checked citations, not verified truth', () => {
  const response = fromBackendGrounded({
    synthetic:true, operational_action_authorized:false, state_change_executed:false,
    incident_id:'INC-DISK-001', status:'generated_unverified_citation_ids_checked',
    claims:[{ text:'The synthetic metric exceeded its warning threshold.', citations:['SIM-EVT-103'] }],
    source_registry:[{id:'SIM-EVT-103',kind:'synthetic_event',source_text:'Synthetic disk capacity 81%'}],
    missing_evidence: ['Retention policy'],
  })
  assert.equal(response.grounded, false)
  assert.deepEqual(response.claims[0].evidence_ids, ['SIM-EVT-103'])
})
test('unavailable or rejected Ollama output cannot display claims', () => {
  const response = fromBackendGrounded({
    synthetic:true,operational_action_authorized:false,state_change_executed:false,
    incident_id:'INC-DISK-001',status:'model_output_rejected',
    claims:[{text:'Should never appear',citations:['SIM-EVT-103']}],source_registry:[],
  })
  assert.deepEqual(response.claims, [])
})
test('AI citation must appear in source registry', () => {
  assert.throws(() => fromBackendGrounded({
    synthetic:true,operational_action_authorized:false,state_change_executed:false,
    incident_id:'INC-DISK-001',status:'generated_unverified_citation_ids_checked',
    claims:[{text:'Unverified statement',citations:['SIM-EVT-999']}],source_registry:[],
  }), /unregistered/i)
})
process.stdout.write(`\n${checks} contract checks passed${process.exitCode ? ' (with failures)' : ''}.\n`)
fs.rmSync(tmp,{recursive:true,force:true})
if (process.exitCode) process.exit(process.exitCode)
