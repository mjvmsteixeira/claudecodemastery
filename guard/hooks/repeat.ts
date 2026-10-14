import type { PrumoGuardRepeat } from '../types'

export function emptyRepeat(): PrumoGuardRepeat {
  return { lastKey: null, sameCount: 0, lastFailSig: null, failCount: 0, edits: [], flips: 0 }
}

export function trackCall(s: PrumoGuardRepeat, key: string, resultHash: string, limit: number) {
  const k = `${key}#${resultHash}`
  const sameCount = s.lastKey === k ? s.sameCount + 1 : 1
  const next = { ...s, lastKey: k, sameCount }
  return { s: next, trip: limit > 0 && sameCount >= limit ? `a mesma chamada repetiu-se ${sameCount} vezes com o mesmo resultado` : null }
}

export function trackTest(s: PrumoGuardRepeat, failed: number, sig: string, limit: number) {
  if (failed === 0) return { s: { ...s, lastFailSig: null, failCount: 0 }, trip: null }
  const failCount = s.lastFailSig === sig ? s.failCount + 1 : 1
  const next = { ...s, lastFailSig: sig, failCount }
  return { s: next, trip: limit > 0 && failCount >= limit ? `o mesmo teste falhou ${failCount} vezes seguidas` : null }
}

export function trackEdit(s: PrumoGuardRepeat, file: string, old: string, neu: string) {
  const undo = s.edits.some(x => x.file === file && x.old === neu && x.neu === old)
  const flips = undo ? s.flips + 1 : s.flips
  const edits = [...s.edits, { file, old: old.slice(0, 500), neu: neu.slice(0, 500) }].slice(-8)
  return { s: { ...s, edits, flips }, trip: flips >= 3 ? `edições a ${file} desfizeram-se umas às outras ${flips} vezes` : null }
}
