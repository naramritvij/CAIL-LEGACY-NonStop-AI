import type { KnowledgeNode, KnowledgeRevision, LegacyTreeResponse } from '@/api/types'

/**
 * Synthetic Showcase Mode only. Every lesson, incident and evidence id here is fictional and
 * exists to demonstrate the experience. It never flows through the API adapter.
 */
function lesson(
  partial: Omit<KnowledgeNode, 'review_status' | 'revision' | 'updated_at' | 'synthetic'> & { revisions: KnowledgeRevision[] },
): KnowledgeNode {
  const latest = partial.revisions[partial.revisions.length - 1]
  return { ...partial, review_status: 'approved', revision: latest.revision, updated_at: latest.created_at, synthetic: true }
}

const NODES: KnowledgeNode[] = [
  lesson({
    lesson_id: 'DEMO-LSN-001',
    title: 'Emergency Stop Recovery',
    knowledge_area: 'Safety',
    asset_type: 'Robot',
    summary: 'Safe sequence for recovering a cell after an emergency stop without re-triggering interlocks.',
    operational_reasoning: 'Restarting before the light curtain resets re-latches the stop. Confirming the curtain state first avoids a second stop and a manual reset walk.',
    related_incident_ids: ['DEMO-INC-0412'],
    evidence_ids: ['DEMO-EV-0101', 'DEMO-EV-0102'],
    derived_from_lesson_id: null,
    revisions: [
      { revision: 1, created_at: '2026-01-08T09:00:00Z', change_summary: 'Initial recovery sequence.' },
      { revision: 2, created_at: '2026-02-19T09:00:00Z', change_summary: 'Added light-curtain check before restart.' },
    ],
  }),
  lesson({
    lesson_id: 'DEMO-LSN-002',
    title: 'Robotic Arm Calibration',
    knowledge_area: 'Equipment',
    asset_type: 'Robot',
    summary: 'When and how to recalibrate the pick arm after tooling changes or drift alarms.',
    operational_reasoning: 'Drift alarms after a tooling swap usually mean the tool offset was not re-taught, not that the encoder is failing.',
    related_incident_ids: ['DEMO-INC-0533'],
    evidence_ids: ['DEMO-EV-0201'],
    derived_from_lesson_id: null,
    revisions: [
      { revision: 1, created_at: '2025-11-02T09:00:00Z', change_summary: 'Initial calibration steps.' },
      { revision: 2, created_at: '2026-01-14T09:00:00Z', change_summary: 'Clarified tool-offset re-teach.' },
      { revision: 3, created_at: '2026-03-03T09:00:00Z', change_summary: 'Added drift-alarm triage.' },
    ],
  }),
  lesson({
    lesson_id: 'DEMO-LSN-003',
    title: 'Conveyor Jam Resolution',
    knowledge_area: 'Operations',
    asset_type: 'Conveyor',
    summary: 'Clearing jams at the merge point and preventing immediate recurrence.',
    operational_reasoning: 'Most repeat jams trace back to a mis-set side guide rather than product shape. Checking the guide first shortens recovery.',
    related_incident_ids: ['DEMO-INC-0611'],
    evidence_ids: ['DEMO-EV-0301', 'DEMO-EV-0302'],
    derived_from_lesson_id: null,
    revisions: [{ revision: 1, created_at: '2026-02-27T09:00:00Z', change_summary: 'Initial resolution steps.' }],
  }),
  lesson({
    lesson_id: 'DEMO-LSN-004',
    title: 'Vacuum System Troubleshooting',
    knowledge_area: 'Troubleshooting',
    asset_type: 'Vacuum',
    summary: 'Common causes and resolution steps for insufficient vacuum during picking: leaks, filter blockage and solenoid faults.',
    operational_reasoning: 'Check the filter before the solenoid. A partially blocked filter produces the same symptom and is cheaper and safer to rule out first.',
    related_incident_ids: ['DEMO-INC-0876'],
    evidence_ids: ['DEMO-EV-0012', 'DEMO-EV-0034', 'DEMO-EV-0056'],
    derived_from_lesson_id: null,
    revisions: [
      { revision: 1, created_at: '2025-12-12T09:00:00Z', change_summary: 'Based on the initial incident resolution.' },
      { revision: 2, created_at: '2026-02-05T09:00:00Z', change_summary: 'Added troubleshooting order.' },
      { revision: 3, created_at: '2026-03-09T09:00:00Z', change_summary: 'Included uncommon failure modes.' },
    ],
  }),
  lesson({
    lesson_id: 'DEMO-LSN-005',
    title: 'PLC Communication Loss',
    knowledge_area: 'Process Control',
    asset_type: 'PLC',
    summary: 'Diagnosing intermittent loss of communication between line PLCs and the supervisory system.',
    operational_reasoning: 'Intermittent drops that correlate with shift changes point to a shared switch being power-cycled, not to PLC firmware.',
    related_incident_ids: ['DEMO-INC-0702'],
    evidence_ids: ['DEMO-EV-0501'],
    derived_from_lesson_id: null,
    revisions: [
      { revision: 1, created_at: '2026-01-21T09:00:00Z', change_summary: 'Initial diagnosis path.' },
      { revision: 2, created_at: '2026-03-01T09:00:00Z', change_summary: 'Added switch power-cycle check.' },
    ],
  }),
  lesson({
    lesson_id: 'DEMO-LSN-006',
    title: 'Sensor False Positive',
    knowledge_area: 'Maintenance',
    asset_type: 'Sensor',
    summary: 'Recognising photo-eye false triggers caused by reflective packaging and ambient light.',
    operational_reasoning: 'False triggers that only happen on one product line are usually reflections. Re-angling the sensor beats raising its threshold.',
    related_incident_ids: ['DEMO-INC-0655'],
    evidence_ids: ['DEMO-EV-0601'],
    derived_from_lesson_id: null,
    revisions: [
      { revision: 1, created_at: '2026-01-30T09:00:00Z', change_summary: 'Initial lesson.' },
      { revision: 2, created_at: '2026-02-24T09:00:00Z', change_summary: 'Added re-angling guidance.' },
    ],
  }),
  lesson({
    lesson_id: 'DEMO-LSN-007',
    title: 'Vision System Lighting',
    knowledge_area: 'Equipment',
    asset_type: 'Vision',
    summary: 'Keeping inspection lighting stable so the vision system does not reject good parts.',
    operational_reasoning: 'Extends the sensor false-positive lesson: the same ambient-light changes that fool photo-eyes also shift vision thresholds.',
    related_incident_ids: ['DEMO-INC-0690'],
    evidence_ids: ['DEMO-EV-0701'],
    derived_from_lesson_id: 'DEMO-LSN-006',
    revisions: [{ revision: 1, created_at: '2026-03-06T09:00:00Z', change_summary: 'Branched from Sensor False Positive.' }],
  }),
  lesson({
    lesson_id: 'DEMO-LSN-008',
    title: 'Gripper Wear Inspection',
    knowledge_area: 'Maintenance',
    asset_type: 'Robot',
    summary: 'Spotting gripper pad wear before it causes dropped picks.',
    operational_reasoning: 'Builds on arm calibration: once offsets are confirmed good, repeated slips almost always mean worn pads.',
    related_incident_ids: [],
    evidence_ids: ['DEMO-EV-0801'],
    derived_from_lesson_id: 'DEMO-LSN-002',
    revisions: [{ revision: 1, created_at: '2026-03-11T09:00:00Z', change_summary: 'Branched from Robotic Arm Calibration.' }],
  }),
]

export const SHOWCASE_TREE: LegacyTreeResponse = {
  synthetic: true,
  generated_at: '2026-03-14T15:00:00Z',
  nodes: NODES,
  withheld_count: 0,
}
