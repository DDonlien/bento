#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// One-time trust bootstrap: carry an existing document block byte-for-byte
// into a freshly built shell. The output must be a NEW path so the source is
// always available as rollback.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const inputArg = opt('input')
const shellArg = opt('shell')
const outputArg = opt('output')
if (!inputArg || !shellArg || !outputArg) {
  console.error('Usage: node scripts/reshell-file.mjs --input old.html --shell fresh.html --output upgraded.html')
  process.exit(1)
}

const inputPath = resolve(inputArg)
const shellPath = resolve(shellArg)
const outputPath = resolve(outputArg)
if (outputPath === inputPath || outputPath === shellPath) {
  console.error('Refusing to overwrite the input document or fresh shell; choose a new --output path.')
  process.exit(1)
}
if (existsSync(outputPath)) {
  console.error(`Refusing to overwrite existing output: ${outputPath}`)
  process.exit(1)
}

const close = '</scr' + 'ipt>'
const open = '<script type="application/bento+json" id="bento-doc">'
const reEscape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const blockRe = new RegExp(`${reEscape(open)}[\\s\\S]*?${reEscape(close)}`)
const input = readFileSync(inputPath, 'utf8')
const shell = readFileSync(shellPath, 'utf8')
const sourceBlock = input.match(blockRe)?.[0]
const shellBlocks = shell.match(new RegExp(blockRe.source, 'g')) ?? []
if (!sourceBlock) throw new Error('input has no regex-extractable #bento-doc block')
if (shellBlocks.length !== 1) throw new Error(`fresh shell has ${shellBlocks.length} #bento-doc blocks; expected 1`)

const raw = sourceBlock.slice(open.length, -close.length).trim()
const parsed = JSON.parse(raw)
if (parsed?.format !== 'bento/slides' && parsed?.format !== 'bento/enc') {
  throw new Error(`input block has unsupported format: ${String(parsed?.format)}`)
}

const upgraded = shell.replace(blockRe, () => sourceBlock)
if (!upgraded.includes(sourceBlock)) throw new Error('document splice failed')
writeFileSync(outputPath, upgraded)

const slideCount = Array.isArray(parsed.slides) ? parsed.slides.length : undefined
console.log(`re-shelled ${inputPath}`)
console.log(`  shell  ${shellPath}`)
console.log(`  output ${outputPath}`)
console.log(`  format ${parsed.format}${slideCount == null ? '' : `, ${slideCount} slide${slideCount === 1 ? '' : 's'}`}`)
