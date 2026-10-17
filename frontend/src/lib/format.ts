import { clsx, type ClassValue } from 'clsx'

/** Shared classname combiner; deliberately committed (root gitignore ignores generic lib/). */
export function cn(...values: ClassValue[]): string {
  return clsx(...values)
}

/** Consistent, locale-independent timestamp label for reproducible synthetic evidence. */
export function formatTime(value: string): string {
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? 'Time unknown' : time.toISOString().slice(11, 16) + ' UTC'
}

/** Elapsed time between two explicit timestamps; never use the wall clock for a demo. */
export function formatDuration(start: string, end: string): string {
  const begin = new Date(start).getTime()
  const finish = new Date(end).getTime()
  if (!Number.isFinite(begin) || !Number.isFinite(finish) || finish < begin) return 'Unknown'
  const minutes = Math.floor((finish - begin) / 60000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remain = minutes % 60
  return remain ? `${hours}h ${remain}m` : `${hours}h`
}

/** The synthetic UI uses a fixed epoch date for source events, not an observed date. */
export function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unknown' : date.toISOString().slice(0, 10) + ' (synthetic)'
}

export function formatValue(value: number, unit = ''): string {
  if (!Number.isFinite(value)) return 'Unknown'
  const number = Number.isInteger(value) ? value.toString() : value.toFixed(1)
  return unit === '%' ? number + '%' : unit ? number + ' ' + unit : number
}

/** Relative delta vs baseline only; not a causal or severity assessment. */
export function formatChange(current: number, baseline: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return 'n/a'
  const percent = ((current - baseline) / Math.abs(baseline)) * 100
  return (percent > 0 ? '+' : '') + percent.toFixed(1) + '% vs baseline'
}
