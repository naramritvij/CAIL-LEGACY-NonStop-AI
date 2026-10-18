import type { KnowledgeNode, KnowledgeRevision, LegacyTreeResponse } from '@/api/types'

/**
 * Fictional HPE NonStop-themed SHOWCASE for the hackathon narrative.
 * These are invented training lessons, NOT approved expert knowledge.
 * They never enter the backend corpus, real approved Tree, or model context.
 */
function lesson(
  partial: Omit<KnowledgeNode, 'review_status' | 'revision' | 'updated_at' | 'synthetic'> & { revisions: KnowledgeRevision[] },
): KnowledgeNode {
  const last=partial.revisions[partial.revisions.length-1]
  return {...partial,review_status:'approved',revision:last.revision,updated_at:last.created_at,synthetic:true}
}

const NODES:KnowledgeNode[]=[
  lesson({
    lesson_id:'DEMO-NONSTOP-001',title:'Recognizing $DATA03 capacity pressure',
    knowledge_area:'Monitoring',asset_type:'Disk',
    summary:'Use baseline, growth and configured training thresholds to identify storage pressure without guessing the culprit.',
    operational_reasoning:'A rising synthetic utilization signal should trigger evidence collection; it does not prove which file is responsible or authorize deletion.',
    related_incident_ids:['INC-DISK-001'],evidence_ids:['SIM-EVT-101','SIM-EVT-103'],
    derived_from_lesson_id:null,revisions:[
      {revision:1,created_at:'2026-09-28T10:00:00Z',change_summary:'First synthetic shift capacity review.'},
      {revision:2,created_at:'2026-10-10T10:00:00Z',change_summary:'Added ownership/retention verification before any action.'},
    ],
  }),
  lesson({
    lesson_id:'DEMO-NONSTOP-002',title:'Event timeline before intervention',
    knowledge_area:'Troubleshooting',asset_type:'EMS',
    summary:'Trace simulated events in order before inferring a cause or escalating.',
    operational_reasoning:'A single alert is incomplete context. Related warnings, timestamps and known missing observations must be gathered before reaching a conclusion.',
    related_incident_ids:['INC-DISK-001','INC-PATH-002'],evidence_ids:['SIM-EVT-102','SIM-EVT-201'],
    derived_from_lesson_id:'DEMO-NONSTOP-001',
    revisions:[{revision:1,created_at:'2026-10-11T08:30:00Z',change_summary:'Adds chronology and evidence-registration discipline.'}],
  }),
  lesson({
    lesson_id:'DEMO-NONSTOP-003',title:'Pathway response degradation triage',
    knowledge_area:'Operations',asset_type:'Pathway',
    summary:'Differentiate a simulated high-latency alert from a non-responsive Pathway service instance.',
    operational_reasoning:'Latency and availability signals warrant investigation. Process state and dependency health remain unknown without subsystem confirmation.',
    related_incident_ids:['INC-PATH-002'],evidence_ids:['SIM-EVT-201','SIM-EVT-202'],
    derived_from_lesson_id:null,revisions:[
      {revision:1,created_at:'2026-10-02T12:00:00Z',change_summary:'Synthetic Pathway event review.'},
      {revision:2,created_at:'2026-10-13T12:00:00Z',change_summary:'Added unknown primary/backup state checks.'},
    ],
  }),
  lesson({
    lesson_id:'DEMO-NONSTOP-004',title:'SCF source verification checklist',
    knowledge_area:'Safety',asset_type:'SCF',
    summary:'Distinguish missing subsystem status from a verified healthy signal.',
    operational_reasoning:'A disconnected or absent SCF status is UNKNOWN, never GREEN. Command applicability varies by release, subsystem, access and approval.',
    related_incident_ids:['INC-PATH-002'],evidence_ids:['SIM-EVT-202'],
    derived_from_lesson_id:'DEMO-NONSTOP-003',
    revisions:[{revision:1,created_at:'2026-10-14T09:00:00Z',change_summary:'Introduced unknown-status handling.'}],
  }),
  lesson({
    lesson_id:'DEMO-NONSTOP-005',title:'Reading ASAP-style performance signals',
    knowledge_area:'Monitoring',asset_type:'ASAP',
    summary:'Read baseline and current synthetic metrics without presenting them as actual ASAP observations.',
    operational_reasoning:'Simulated latency and availability can help prioritize an investigation but cannot authenticate real tool provenance or establish a root cause.',
    related_incident_ids:['INC-PATH-002'],evidence_ids:['SIM-EVT-201'],
    derived_from_lesson_id:'DEMO-NONSTOP-003',
    revisions:[{revision:1,created_at:'2026-10-15T09:00:00Z',change_summary:'Added source labels and simulation caveats.'}],
  }),
  lesson({
    lesson_id:'DEMO-NONSTOP-006',title:'Human-approved Decision DNA',
    knowledge_area:'Knowledge Transfer',asset_type:'Decision DNA',
    summary:'Turn incident evidence, reasoning, rejected options, and missing prerequisites into a reviewed reusable lesson.',
    operational_reasoning:'An AI response or expert-authored draft is not approved evidence. A distinct review gate is necessary before the Tree or learning exercises use it.',
    related_incident_ids:['INC-DISK-001'],evidence_ids:['SIM-EVT-103'],
    derived_from_lesson_id:'DEMO-NONSTOP-001',
    revisions:[{revision:1,created_at:'2026-10-16T10:00:00Z',change_summary:'Formalized independent review and source link requirements.'}],
  }),
  lesson({
    lesson_id:'DEMO-NONSTOP-007',title:'Apprentice handover under changed conditions',
    knowledge_area:'Learning',asset_type:'Training',
    summary:'Practice a revised synthetic incident with safe first actions, supported observations and prerequisites.',
    operational_reasoning:'A training pass requires both correct read-only diagnostics and evidence; a score does not prove production competence.',
    related_incident_ids:['INC-DISK-001','INC-PATH-002'],evidence_ids:['SIM-EVT-101','SIM-EVT-201'],
    derived_from_lesson_id:'DEMO-NONSTOP-006',
    revisions:[{revision:1,created_at:'2026-10-17T10:00:00Z',change_summary:'Added gated, non-persisted simulation assessment.'}],
  }),
]

export const SHOWCASE_TREE:LegacyTreeResponse={
  synthetic:true,generated_at:'2026-10-17T10:00:00Z',
  nodes:NODES,withheld_count:0,
}
