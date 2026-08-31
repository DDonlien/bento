#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Slide-list/view-state regression rig. Runs without a DOM.

import { emptySlide, newDoc, defaultText } from '../slides/src/model.ts'
import { Store } from '../slides/src/store.ts'
import { moveSlidesToGap, moveSlidesToState } from '../slides/src/editor/slidelist.ts'

let checks = 0
let failures = 0

function ok(condition: boolean, message: string) {
  checks++
  if (condition) console.log(`  ok    ${message}`)
  else {
    failures++
    console.error(`  FAIL  ${message}`)
  }
}

function makeStore(ids: string[]): Store {
  const doc = newDoc()
  doc.slides = ids.map((id) => emptySlide({ id, name: id }))
  return new Store(doc)
}

function makeSlides(spec: Array<[id: string, stateOf?: string]>) {
  return spec.map(([id, stateOf]) => {
    const slide = emptySlide({ id, name: id })
    if (stateOf) slide.stateOf = stateOf
    return slide
  })
}

function arrangement(slides: ReturnType<typeof makeSlides> | null): string {
  return slides?.map((slide) => `${slide.id}:${slide.stateOf ?? '-'}`).join(',') ?? 'null'
}

function observeDoc(store: Store) {
  let observed: string[] = []
  store.on('doc', () => { observed.push(store.slide.id) })
  return () => observed
}

console.log('\nslide view reconciliation')

{
  const store = makeStore(['a', 'b', 'c', 'd'])
  store.currentIndex = 3
  store.slide.elements.push(defaultText({ id: 'selected' }))
  store.selection = ['selected']
  const observed = observeDoc(store)
  store.commit(() => { store.doc.slides.splice(0, 1) }, 'slides')
  ok(store.slide.id === 'd' && store.currentIndex === 2, 'deleting before the current slide preserves it by id')
  ok(store.selection[0] === 'selected', 'selection survives when the current slide survives')
  ok(observed().join() === 'd', 'doc listeners only observe a valid reconciled slide')
}

{
  const store = makeStore(['a', 'b', 'c', 'd'])
  store.currentIndex = 1
  store.slide.elements.push(defaultText({ id: 'shared-morph-id' }))
  store.doc.slides[2].elements.push(defaultText({ id: 'shared-morph-id' }))
  store.selection = ['shared-morph-id']
  store.hoverPreview = 'details'
  let currentEvents = 0
  let selectionEvents = 0
  store.on('current', () => { currentEvents++ })
  store.on('selection', () => { selectionEvents++ })
  store.commit(() => { store.doc.slides.splice(1, 1) }, 'slides')
  ok(store.slide.id === 'c' && store.currentIndex === 1, 'deleting the current slide selects its next neighbour')
  ok(store.selection.length === 0 && store.hoverPreview == null, 'switching slides clears transient view state even when element ids repeat')
  ok(currentEvents === 1 && selectionEvents === 1, 'the reconciled slide switch emits current and selection once')
}

{
  const store = makeStore(['a', 'b', 'c', 'd'])
  store.currentIndex = 3
  store.commit(() => { store.doc.slides.pop() }, 'slides')
  ok(store.slide.id === 'c' && store.currentIndex === 2, 'deleting the last current slide selects the previous neighbour')
}

{
  const store = makeStore(['parent', 'state-1', 'state-2', 'next', 'tail'])
  store.currentIndex = 2
  const doomed = new Set(['parent', 'state-1', 'state-2'])
  store.commit(() => { store.doc.slides = store.doc.slides.filter((slide) => !doomed.has(slide.id)) }, 'slides')
  ok(store.slide.id === 'next' && store.currentIndex === 0, 'a deleted state selects the next survivor across a cascade')
}

{
  const store = makeStore(['parent', 'state-1', 'state-2', 'current', 'tail'])
  store.currentIndex = 3
  const doomed = new Set(['parent', 'state-1', 'state-2'])
  store.commit(() => { store.doc.slides = store.doc.slides.filter((slide) => !doomed.has(slide.id)) }, 'slides')
  ok(store.slide.id === 'current' && store.currentIndex === 0, 'a surviving current slide follows its id across a cascade')
}

{
  const store = makeStore(['a', 'b', 'c'])
  store.currentIndex = 1
  store.commit(() => {
    const [current] = store.doc.slides.splice(1, 1)
    store.doc.slides.push(current)
  }, 'slides')
  ok(store.slide.id === 'b' && store.currentIndex === 2, 'reordering preserves the current slide by id')
}

{
  const store = makeStore(['a', 'b', 'c'])
  store.currentIndex = 2
  store.slide.elements.push(defaultText({ id: 'shared-morph-id' }))
  store.doc.slides[0].elements.push(defaultText({ id: 'shared-morph-id' }))
  store.selection = ['shared-morph-id']
  store.hoverPreview = 'details'
  const movedId = store.doc.slides[0].id
  store.goTo(store.doc.slides.findIndex((slide) => slide.id === movedId))
  store.commit(() => {
    const [moved] = store.doc.slides.splice(0, 1)
    store.doc.slides.splice(1, 0, moved)
  }, 'slides')
  ok(store.slide.id === 'a', 'drag navigation selects the moved slide')
  ok(store.selection.length === 0 && store.hoverPreview == null, 'drag navigation clears transient state from the previous slide')
}

console.log('\nhistory reconciliation')

{
  const store = makeStore(['a', 'b', 'c', 'd'])
  store.currentIndex = 3
  store.slide.elements.push(defaultText({ id: 'shared-morph-id' }))
  store.doc.slides[2].elements.push(defaultText({ id: 'shared-morph-id' }))
  store.selection = ['shared-morph-id']
  store.commit(() => { store.doc.slides.splice(0, 1) }, 'slides')
  store.undo()
  ok(store.slide.id === 'd' && store.currentIndex === 3, 'undo restores the pre-edit slide by id rather than by shifted index')
  ok(store.selection[0] === 'shared-morph-id', 'undo keeps selection only on the same surviving slide')
  store.redo()
  ok(store.slide.id === 'd' && store.currentIndex === 2, 'redo restores the post-edit slide by id')
}

{
  const store = makeStore(['a', 'b', 'c'])
  store.currentIndex = 1
  store.selection = ['shared-morph-id']
  store.commit(() => { store.doc.slides.splice(1, 1) }, 'slides')
  store.undo()
  ok(store.slide.id === 'b' && store.selection.length === 0, 'undoing current-slide deletion restores that slide without carrying another slide selection onto it')
}

console.log('\nexternal mutation reconciliation')

{
  const store = makeStore(['a', 'b', 'c', 'd'])
  store.currentIndex = 2
  store.slide.elements.push(defaultText({ id: 'shared-morph-id' }))
  store.doc.slides[3].elements.push(defaultText({ id: 'shared-morph-id' }))
  store.selection = ['shared-morph-id']
  const view = store.captureView()
  store.doc.slides.splice(0, 1) // remote CRDT changes bypass commit()
  const change = store.reconcileView(view)
  ok(store.slide.id === 'c' && store.currentIndex === 1, 'external deletion before current preserves the current slide by id')
  ok(store.selection[0] === 'shared-morph-id' && !change.currentChanged, 'external reconciliation does not transfer selection to a repeated id on another slide')
}

{
  const store = makeStore(['a', 'b'])
  store.currentIndex = 1
  store.selection = ['selected']
  let currentEvents = 0
  let selectionEvents = 0
  store.on('current', () => { currentEvents++ })
  store.on('selection', () => { selectionEvents++ })
  store.commit(() => { store.doc.slides = [emptySlide({ id: 'blank' })] }, 'slides')
  ok(store.slide.id === 'blank' && store.currentIndex === 0, 'whole-deck replacement lands on its valid blank slide')
  ok(currentEvents === 1 && selectionEvents === 1, 'whole-deck replacement emits current and selection exactly once')
}

console.log('\nsidebar slide selection')

{
  const store = makeStore(['a', 'b', 'c', 'd'])
  let slideSelectionEvents = 0
  store.on('slide-selection', () => { slideSelectionEvents++ })
  ok(store.selectedSlideIds.join() === 'a' && store.slideSelectionAnchorId === 'a', 'the first slide starts as the sidebar selection and range anchor')
  store.selectSlide(2)
  store.selectSlide(0, true)
  ok(store.selectedSlideIds.join() === 'a,b,c' && store.slide.id === 'a', 'Shift selects the inclusive slide range and makes its endpoint current')
  ok(store.slideSelectionAnchorId === 'c', 'Shift keeps the last plain selection as its fixed range anchor')
  ok(slideSelectionEvents === 2, 'plain and Shift selections each emit one sidebar-selection event')
  store.selectSlide(1)
  ok(store.selectedSlideIds.join() === 'b' && store.slideSelectionAnchorId === 'b', 'a plain pick collapses a range and moves its anchor')
}

{
  const store = makeStore(['a', 'b', 'c'])
  store.selectSlide(1)
  store.commit(() => {
    const [b] = store.doc.slides.splice(1, 1)
    store.doc.slides.push(b)
  }, 'slides')
  ok(store.selectedSlideIds.join() === 'b' && store.slideSelectionAnchorId === 'b', 'reordering preserves selection and its anchor by slide id')
  store.selectSlide(0, true)
  ok(store.selectedSlideIds.join() === 'a,c,b', 'a later Shift range follows current document order')
}

{
  const store = makeStore(['a', 'b', 'c', 'd'])
  store.selectSlide(2)
  store.selectSlide(0, true)
  store.commit(() => {
    const next = moveSlidesToGap(store.doc.slides, store.selectedSlideIds, store.doc.slides.length)
    if (next) store.doc.slides = next
  }, 'slides')
  ok(store.doc.slides.map((slide) => slide.id).join() === 'd,a,b,c', 'a selected range reorders as one document-order block')
  store.undo()
  ok(store.doc.slides.map((slide) => slide.id).join() === 'a,b,c,d'
    && store.selectedSlideIds.join() === 'a,b,c'
    && store.slideSelectionAnchorId === 'c', 'one undo restores both the group move and its sidebar selection')
}

console.log('\nsidebar slide moves')

{
  const slides = makeSlides([['a'], ['b'], ['c'], ['d']])
  ok(arrangement(moveSlidesToGap(slides, ['b', 'd'], 0)) === 'b:-,d:-,a:-,c:-', 'non-contiguous selected slides keep document order when moved to a gap')
}

{
  const slides = makeSlides([['a'], ['a1', 'a'], ['a2', 'a'], ['b'], ['c']])
  ok(arrangement(moveSlidesToGap(slides, ['a'], slides.length)) === 'b:-,c:-,a:-,a1:a,a2:a', 'moving a parent to a gap carries all of its existing states')
  ok(arrangement(moveSlidesToGap(slides, ['a1'], slides.length)) === 'a:-,a2:a,b:-,c:-,a1:-', 'moving a state alone to a root gap promotes it to an ordinary slide')
}

{
  const slides = makeSlides([['target'], ['t1', 'target'], ['a'], ['b'], ['c']])
  ok(arrangement(moveSlidesToState(slides, ['a', 'c'], 'target')) === 'target:-,t1:target,a:target,c:target,b:-', 'dropping selected slides on a slide appends them to its existing state family')
}

{
  const slides = makeSlides([['parent'], ['p1', 'parent'], ['p2', 'parent'], ['target'], ['tail']])
  ok(arrangement(moveSlidesToState(slides, ['parent'], 'target')) === 'target:-,parent:target,p1:target,p2:target,tail:-', 'assigning a parent carries and flattens its states into the new state family')
}

{
  const slides = makeSlides([['parent'], ['state', 'parent'], ['target'], ['tail']])
  ok(arrangement(moveSlidesToState(slides, ['state'], 'target')) === 'parent:-,target:-,state:target,tail:-', 'a state can be re-parented by dropping it on another ordinary slide')
  ok(moveSlidesToState(slides, ['target'], 'target') == null, 'a slide cannot be dropped onto itself as a state')
  ok(moveSlidesToState(slides, ['tail'], 'state') == null, 'an interactive state cannot own nested states')
}

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures) process.exit(1)
