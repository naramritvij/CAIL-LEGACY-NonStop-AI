import type { KnowledgeNode } from '@/api/types'

/** Coordinates are in the space of the 1408×768 tree artwork so SVG overlays sit on its canopy. */
export const ART = { w: 1408, h: 768 }
export const VIEWBOX = { x: 148, y: 24, w: 1112, h: 712 }
export const CENTER = { x: 704, y: 380 }
export const ROOT = { x: 704, y: 688 }
export const TRUNK_TOP = { x: 704, y: 446 }

export const TRUNK_PATH = `M ${ROOT.x} ${ROOT.y} C ${ROOT.x - 14} ${ROOT.y - 90}, ${TRUNK_TOP.x + 12} ${TRUNK_TOP.y + 100}, ${TRUNK_TOP.x} ${TRUNK_TOP.y}`

export const ROOT_PATHS = [
  `M ${ROOT.x} ${ROOT.y} C 650 698, 560 708, 452 726`,
  `M ${ROOT.x} ${ROOT.y} C 670 708, 620 722, 590 736`,
  `M ${ROOT.x} ${ROOT.y} C 758 698, 850 708, 956 726`,
  `M ${ROOT.x} ${ROOT.y} C 738 708, 790 722, 820 736`,
]

const SLOTS: [number, number][] = [
  [704, 96],
  [512, 160],
  [896, 160],
  [420, 272],
  [988, 272],
  [598, 334],
  [810, 334],
  [704, 226],
  [492, 398],
  [916, 398],
]

function slotFor(index: number): [number, number] {
  if (index < SLOTS.length) return SLOTS[index]
  const k = index - SLOTS.length
  const angle = k * 2.39996
  const radius = 120 + (k % 4) * 36
  return [CENTER.x + Math.cos(angle) * radius * 1.7, 250 + Math.sin(angle) * radius * 0.8]
}

function branchCurve(x: number, y: number): string {
  const dx = x - TRUNK_TOP.x
  return `C ${TRUNK_TOP.x + dx * 0.08} ${TRUNK_TOP.y - 110}, ${x - dx * 0.4} ${y + 90}, ${x} ${y}`
}

const MAX_LINE = 18

export function wrapTitle(title: string): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of title.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= MAX_LINE || !current) {
      current = next
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  if (lines.length <= 2) return lines
  return [lines[0], `${lines.slice(1).join(' ').slice(0, MAX_LINE - 1)}…`]
}

export interface PlacedNode {
  node: KnowledgeNode
  x: number
  y: number
  side: 'left' | 'right'
  lines: string[]
  branchPath: string
  /** Root → trunk → branch: the route a celebration pulse travels. */
  pulsePath: string
}

export function layoutTree(nodes: KnowledgeNode[]): PlacedNode[] {
  const sorted = [...nodes].sort((a, b) => a.lesson_id.localeCompare(b.lesson_id))
  return sorted.map((node, index) => {
    const [x, y] = slotFor(index)
    const curve = branchCurve(x, y)
    return {
      node,
      x,
      y,
      side: x < CENTER.x ? 'left' : 'right',
      lines: wrapTitle(node.title),
      branchPath: `M ${TRUNK_TOP.x} ${TRUNK_TOP.y} ${curve}`,
      pulsePath: `${TRUNK_PATH} ${curve}`,
    }
  })
}

export function lineagePath(from: PlacedNode, to: PlacedNode): string {
  const mx = (from.x + to.x) / 2
  const my = Math.min(from.y, to.y) - 56
  return `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`
}
