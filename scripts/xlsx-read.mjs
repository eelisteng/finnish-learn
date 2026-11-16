/**
 * Tiny, dependency-free XLSX reader for the content import pipeline.
 *
 * The repo has no build step and no npm dependencies, so this deliberately
 * implements only the subset of OOXML we actually ship: a ZIP central
 * directory, workbook sheet order, worksheet cells with inline strings
 * (t="inlineStr"), shared strings (t="s") and plain values. It is NOT a
 * general spreadsheet engine: formulas, styles, merged cells and charts are
 * ignored on purpose.
 *
 *   import { readWorkbook } from './xlsx-read.mjs'
 *   const sheets = readWorkbook(path)
 *   // [{ name, header: string[], rows: string[][] }, ...]
 */
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50

/** Read every member of a non-ZIP64 archive as a UTF-8 string. */
function unzipMembers(buffer) {
  let eocd = -1
  const floor = Math.max(0, buffer.length - 65557)
  for (let i = buffer.length - 22; i >= floor; i--) {
    if (buffer.readUInt32LE(i) === SIG_EOCD) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('XLSX: end-of-central-directory record not found')
  const count = buffer.readUInt16LE(eocd + 10)
  let off = buffer.readUInt32LE(eocd + 16)
  const members = new Map()
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(off) !== SIG_CENTRAL) throw new Error('XLSX: bad central directory entry')
    const method = buffer.readUInt16LE(off + 10)
    const compressedSize = buffer.readUInt32LE(off + 20)
    const nameLen = buffer.readUInt16LE(off + 28)
    const extraLen = buffer.readUInt16LE(off + 30)
    const commentLen = buffer.readUInt16LE(off + 32)
    const localOff = buffer.readUInt32LE(off + 42)
    const name = buffer.toString('utf8', off + 46, off + 46 + nameLen)
    const localNameLen = buffer.readUInt16LE(localOff + 26)
    const localExtraLen = buffer.readUInt16LE(localOff + 28)
    const dataOff = localOff + 30 + localNameLen + localExtraLen
    const raw = buffer.subarray(dataOff, dataOff + compressedSize)
    if (method !== 0 && method !== 8) throw new Error(`XLSX: unsupported compression method ${method} in ${name}`)
    const data = method === 8 ? inflateRawSync(raw) : raw
    members.set(name, data.toString('utf8'))
    off += 46 + nameLen + extraLen + commentLen
  }
  return members
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function decodeXml(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (_, ent) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X'
        ? Number.parseInt(ent.slice(2), 16)
        : Number.parseInt(ent.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    }
    return ENTITIES[ent.toLowerCase()] ?? _
  })
}

/** All <t> payloads inside an element (handles rich-text runs). */
function textOf(cellXml) {
  let out = ''
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g
  let m
  while ((m = re.exec(cellXml))) out += decodeXml(m[1])
  return out
}

function colIndex(ref) {
  const letters = String(ref).match(/^[A-Z]+/i)?.[0] ?? 'A'
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function sharedStrings(members) {
  const xml = members.get('xl/sharedStrings.xml')
  if (!xml) return []
  const out = []
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  let m
  while ((m = re.exec(xml))) out.push(textOf(m[1]))
  return out
}

function parseSheet(xml, strings) {
  const rows = []
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  let rm
  while ((rm = rowRe.exec(xml))) {
    const cells = []
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g
    let cm
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1] ?? cm[3] ?? ''
      const body = cm[2] ?? ''
      const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1] ?? ''
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? ''
      const idx = ref ? colIndex(ref) : cells.length
      let value = ''
      if (type === 'inlineStr') value = textOf(body)
      else if (type === 's') value = strings[Number(textOf(body))] ?? ''
      else if (type === 'str') value = decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '')
      else value = decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '')
      while (cells.length < idx) cells.push('')
      cells[idx] = value
    }
    rows.push(cells)
  }
  const width = Math.max(0, ...rows.map((r) => r.length))
  return rows.map((r) => [...r, ...Array(width - r.length).fill('')])
}

/** Resolve r:id -> worksheet target, preserving workbook order. */
function sheetTargets(members) {
  const rels = members.get('xl/_rels/workbook.xml.rels') ?? ''
  const byId = new Map()
  const relRe = /<Relationship\b([^>]*)\/>/g
  let m
  while ((m = relRe.exec(rels))) {
    const id = m[1].match(/\bId="([^"]+)"/)?.[1]
    const target = m[1].match(/\bTarget="([^"]+)"/)?.[1]
    if (id && target) byId.set(id, target.replace(/^\//, ''))
  }
  const wb = members.get('xl/workbook.xml') ?? ''
  const sheetRe = /<sheet\b([^>]*)\/>/g
  const sheets = []
  while ((m = sheetRe.exec(wb))) {
    const name = decodeXml(m[1].match(/\bname="([^"]+)"/)?.[1] ?? '')
    const rid = m[1].match(/r:id="([^"]+)"/)?.[1] ?? ''
    let target = byId.get(rid) ?? ''
    if (target && !target.startsWith('xl/')) target = `xl/${target}`
    sheets.push({ name, target })
  }
  return sheets
}

export function readWorkbook(path) {
  const members = unzipMembers(readFileSync(path))
  const strings = sharedStrings(members)
  const sheets = sheetTargets(members)
  if (!sheets.length) throw new Error('XLSX: no worksheets found')
  return sheets.map(({ name, target }, i) => {
    const xml = members.get(target) ?? members.get(`xl/worksheets/sheet${i + 1}.xml`)
    if (!xml) throw new Error(`XLSX: worksheet XML missing for "${name}" (${target})`)
    const rows = parseSheet(xml, strings)
    return { name, header: rows[0] ?? [], rows: rows.slice(1), all: rows }
  })
}
