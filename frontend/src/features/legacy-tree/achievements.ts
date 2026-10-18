/**
 * Reusable rules for future confirmed achievements (Mentor, Apprentice, Library).
 * A celebration is never triggered by a click or a preview of an action — only by a
 * backend-confirmed event, or by an explicit, labelled showcase preview.
 */
export type AchievementKind = 'lesson_approved' | 'revision_extended' | 'library_lesson_added' | 'learning_challenge_passed'

export interface AchievementEvent {
  event_id: string
  kind: AchievementKind
  lesson_id?: string
  source: 'backend' | 'showcase_preview'
  /** True only when the backend has confirmed the outcome. */
  confirmed: boolean
}

export type CelebrationStyle = 'verified' | 'personal'

const VERIFIED_KINDS: ReadonlySet<AchievementKind> = new Set(['lesson_approved', 'revision_extended', 'library_lesson_added'])

/** Verified knowledge glows gold on a node; personal learning progress is a violet overlay that never touches a node. */
export function celebrationStyle(kind: AchievementKind): CelebrationStyle {
  return VERIFIED_KINDS.has(kind) ? 'verified' : 'personal'
}

/** Only backend-confirmed approved lessons and revisions may permanently change the verified tree. */
export function affectsVerifiedTree(event: AchievementEvent): boolean {
  return event.source === 'backend' && event.confirmed && VERIFIED_KINDS.has(event.kind) && Boolean(event.lesson_id)
}

export function celebrationTarget(event: AchievementEvent): string | undefined {
  return celebrationStyle(event.kind) === 'verified' ? event.lesson_id : undefined
}

const PLAYED_KEY = 'legacy.celebrated.v1'

function readPlayed(): string[] {
  try {
    const raw = window.localStorage.getItem(PLAYED_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/** Remembers which backend achievements already played so a refresh never replays them. */
export function markCelebrated(eventId: string) {
  try {
    const played = readPlayed().filter((id) => id !== eventId)
    window.localStorage.setItem(PLAYED_KEY, JSON.stringify([...played, eventId].slice(-200)))
  } catch {
    // Storage can be unavailable (private mode); replay protection is best-effort.
  }
}

export function canCelebrate(event: AchievementEvent): boolean {
  if (event.source === 'showcase_preview') return true
  return event.confirmed && !readPlayed().includes(event.event_id)
}
