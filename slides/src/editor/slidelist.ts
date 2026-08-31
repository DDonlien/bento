// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Pure slide-list moves used by the sidebar and its DOM-free regression rig.

import type { Slide } from '../model'

/**
 * Moving a normal slide also moves every state descended from it. A state
 * moved on its own is independent and can therefore be promoted or re-parented.
 */
function expandedMoveIds(slides: readonly Slide[], selectedIds: readonly string[]): Set<string> {
  const known = new Set(slides.map((slide) => slide.id))
  const ids = new Set(selectedIds.filter((id) => known.has(id)))
  let grew = true
  while (grew) {
    grew = false
    for (const slide of slides) {
      if (slide.stateOf && ids.has(slide.stateOf) && !ids.has(slide.id)) {
        ids.add(slide.id)
        grew = true
      }
    }
  }
  return ids
}

function withStateOf(slide: Slide, parentId?: string): Slide {
  if (slide.stateOf === parentId) return slide
  const copy = { ...slide }
  if (parentId) copy.stateOf = parentId
  else delete copy.stateOf
  return copy
}

function sameArrangement(before: readonly Slide[], after: readonly Slide[]): boolean {
  return before.length === after.length && before.every((slide, index) =>
    slide.id === after[index]?.id && slide.stateOf === after[index]?.stateOf)
}

/**
 * Drop at a root-level sidebar gap. Selected slides keep their document order.
 * A selected parent carries its states as one family; a state moved without
 * its parent becomes an ordinary slide because the destination is root-level.
 */
export function moveSlidesToGap(
  slides: readonly Slide[],
  selectedIds: readonly string[],
  at: number,
): Slide[] | null {
  const moveIds = expandedMoveIds(slides, selectedIds)
  if (!moveIds.size) return null

  const moving = slides
    .filter((slide) => moveIds.has(slide.id))
    .map((slide) => slide.stateOf && !moveIds.has(slide.stateOf)
      ? withStateOf(slide)
      : slide)
  const remaining = slides.filter((slide) => !moveIds.has(slide.id))
  const clampedAt = Math.max(0, Math.min(at, slides.length))
  const originalIndex = new Map(slides.map((slide, index) => [slide.id, index]))
  const insertAt = remaining.filter((slide) => (originalIndex.get(slide.id) ?? slides.length) < clampedAt).length
  const next = [
    ...remaining.slice(0, insertAt),
    ...moving,
    ...remaining.slice(insertAt),
  ]
  return sameArrangement(slides, next) ? null : next
}

/**
 * Drop on an ordinary slide. Every moved slide becomes a sibling state of the
 * target, in its existing document order, after the target's current states.
 * Descendant states of a moved parent come along and are flattened into that
 * same state family; nested state families are not part of the slides model.
 */
export function moveSlidesToState(
  slides: readonly Slide[],
  selectedIds: readonly string[],
  parentId: string,
): Slide[] | null {
  const parent = slides.find((slide) => slide.id === parentId)
  if (!parent || parent.stateOf) return null

  const moveIds = expandedMoveIds(slides, selectedIds)
  if (!moveIds.size || moveIds.has(parentId)) return null

  const moving = slides
    .filter((slide) => moveIds.has(slide.id))
    .map((slide) => withStateOf(slide, parentId))
  const remaining = slides.filter((slide) => !moveIds.has(slide.id))

  // Pull every existing state next to its parent as part of the same move.
  // This also repairs files whose State-of dropdown left a family non-adjacent.
  const currentStates = remaining.filter((slide) => slide.stateOf === parentId)
  const roots = remaining.filter((slide) => slide.stateOf !== parentId)
  const parentIndex = roots.findIndex((slide) => slide.id === parentId)
  if (parentIndex < 0) return null

  const insertAt = parentIndex + 1
  const next = [
    ...roots.slice(0, insertAt),
    ...currentStates,
    ...moving,
    ...roots.slice(insertAt),
  ]
  return sameArrangement(slides, next) ? null : next
}
