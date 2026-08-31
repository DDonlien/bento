// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Pure slide-list/section moves used by the sidebar and its DOM-free rig.

import type { BentoDoc, Slide } from '../model'

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

function asRoot(slide: Slide, sectionId?: string): Slide {
  if (!slide.stateOf && slide.sectionId === sectionId) return slide
  const copy = { ...slide }
  delete copy.stateOf
  if (sectionId) copy.sectionId = sectionId
  else delete copy.sectionId
  return copy
}

function asState(slide: Slide, parentId: string): Slide {
  if (slide.stateOf === parentId && !slide.sectionId) return slide
  const copy = { ...slide, stateOf: parentId }
  // A state inherits its parent's section. Carrying its own membership would
  // give one page two answers and makes a parent move tear the outline apart.
  delete copy.sectionId
  return copy
}

function withRootSection(slide: Slide, sectionId?: string): Slide {
  if (slide.stateOf) {
    if (!slide.sectionId) return slide
    const copy = { ...slide }
    delete copy.sectionId
    return copy
  }
  if (slide.sectionId === sectionId) return slide
  const copy = { ...slide }
  if (sectionId) copy.sectionId = sectionId
  else delete copy.sectionId
  return copy
}

function sameArrangement(before: readonly Slide[], after: readonly Slide[]): boolean {
  return before.length === after.length && before.every((slide, index) =>
    slide.id === after[index]?.id
      && slide.stateOf === after[index]?.stateOf
      && slide.sectionId === after[index]?.sectionId)
}

/** Resolve a state to the root slide whose outline membership it inherits. */
export function rootSlideFor(slides: readonly Slide[], slideId: string): Slide | undefined {
  const byId = new Map(slides.map((slide) => [slide.id, slide]))
  let slide = byId.get(slideId)
  const seen = new Set<string>()
  while (slide?.stateOf && !seen.has(slide.id)) {
    seen.add(slide.id)
    slide = byId.get(slide.stateOf)
  }
  return slide
}

/** Section inherited by a root slide or any of its interactive states. */
export function sectionIdForSlide(slides: readonly Slide[], slideId: string): string | undefined {
  return rootSlideFor(slides, slideId)?.sectionId
}

/** Remove metadata for sections that no root slide uses. Call inside a commit. */
export function pruneSections(doc: BentoDoc): void {
  if (!Array.isArray(doc.sections) || !doc.sections.length) return
  const used = new Set(doc.slides.filter((slide) => !slide.stateOf && slide.sectionId).map((slide) => slide.sectionId!))
  const next = doc.sections.filter((section) => used.has(section.id))
  if (next.length) doc.sections = next
  else delete doc.sections
}

/**
 * PowerPoint-style "Add section" boundary. Starting at a root slide takes the
 * rest of its current contiguous section (or unsectioned run), so the old
 * section cannot be split into two disconnected islands.
 */
export function startSectionAtSlide(
  slides: readonly Slide[],
  slideId: string,
  sectionId: string,
): Slide[] | null {
  const root = rootSlideFor(slides, slideId)
  if (!root) return null
  const start = slides.findIndex((slide) => slide.id === root.id)
  if (start < 0) return null
  const previousSectionId = root.sectionId
  let inRun = false
  let changed = false
  const next = slides.map((slide, index) => {
    if (slide.stateOf) {
      if (!slide.sectionId) return slide
      changed = true
      const copy = { ...slide }
      delete copy.sectionId
      return copy
    }
    if (index === start) inRun = true
    else if (inRun && slide.sectionId !== previousSectionId) inRun = false
    if (!inRun || slide.sectionId === sectionId) return slide
    changed = true
    return withRootSection(slide, sectionId)
  })
  return changed ? next : null
}

/**
 * Drop at a root-level sidebar gap. Selected slides keep document order. A
 * parent carries its states; a state moved alone becomes an ordinary slide.
 * The gap's section is explicit, so dropping across a boundary also updates
 * membership without a second gesture.
 */
export function moveSlidesToGap(
  slides: readonly Slide[],
  selectedIds: readonly string[],
  at: number,
  sectionId?: string,
): Slide[] | null {
  const moveIds = expandedMoveIds(slides, selectedIds)
  if (!moveIds.size) return null

  const moving = slides
    .filter((slide) => moveIds.has(slide.id))
    .map((slide) => {
      if (slide.stateOf && !moveIds.has(slide.stateOf)) return asRoot(slide, sectionId)
      return withRootSection(slide, sectionId)
    })
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

/** Drop selected slide families at the end of a named section. */
export function moveSlidesToSection(
  slides: readonly Slide[],
  selectedIds: readonly string[],
  sectionId: string,
): Slide[] | null {
  const roots = slides.filter((slide) => !slide.stateOf && slide.sectionId === sectionId)
  if (!roots.length) return null
  const lastRoot = roots[roots.length - 1]
  const family = expandedMoveIds(slides, [lastRoot.id])
  let at = 0
  slides.forEach((slide, index) => { if (family.has(slide.id)) at = Math.max(at, index + 1) })
  return moveSlidesToGap(slides, selectedIds, at, sectionId)
}

/**
 * Drop on an ordinary slide. Every moved slide becomes a sibling state of the
 * target, after its current states. Descendant states of a moved parent come
 * along and flatten into that same family; nested state families are not part
 * of the model.
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
    .map((slide) => asState(slide, parentId))
  const remaining = slides.filter((slide) => !moveIds.has(slide.id))

  // Pull every existing state next to its parent as part of the same move.
  // This also repairs files whose State-of dropdown left a family non-adjacent.
  const currentStates = remaining
    .filter((slide) => slide.stateOf === parentId)
    .map((slide) => asState(slide, parentId))
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

/** Move every slide family in one section as a single block to a root gap. */
export function moveSectionToGap(
  slides: readonly Slide[],
  sectionId: string,
  at: number,
): Slide[] | null {
  const rootIds = slides
    .filter((slide) => !slide.stateOf && slide.sectionId === sectionId)
    .map((slide) => slide.id)
  const moveIds = expandedMoveIds(slides, rootIds)
  if (!moveIds.size) return null
  const moving = slides.filter((slide) => moveIds.has(slide.id))
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

/** Move one section immediately before another section. */
export function moveSectionBefore(
  slides: readonly Slide[],
  sectionId: string,
  beforeSectionId: string,
): Slide[] | null {
  if (sectionId === beforeSectionId) return null
  const at = slides.findIndex((slide) => !slide.stateOf && slide.sectionId === beforeSectionId)
  return at < 0 ? null : moveSectionToGap(slides, sectionId, at)
}

/** Remove a section boundary while leaving every slide exactly where it is. */
export function removeSectionFromSlides(slides: readonly Slide[], sectionId: string): Slide[] {
  return slides.map((slide) => slide.sectionId === sectionId ? withRootSection(slide) : slide)
}
