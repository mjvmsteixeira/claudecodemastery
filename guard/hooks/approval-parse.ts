import type { PrumoGuardLevel } from '../types'

const LEVEL_RE = /\[prumo-secops\/approval-gate\] Operação (N[123]) detectada:/
const ID_RE = /approval-id: ([0-9a-f]{64})/g

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// O id que o approval-gate dá a um comando: sha256 do comando como o hook o vê. O `$(...)` do bash
// tira as quebras de linha finais e o `tr '\n\t' '  '` troca as restantes e os tabs por espaços.
export async function approvalIdOf(command: string): Promise<string> {
  return sha256Hex(command.replace(/\n+$/, '').replace(/[\n\t]/g, ' '))
}

// Só se confia no nível do banner. O id escreve-se a partir do comando que a pessoa vê (`id`), e o
// texto tem de o trazer: um id que só aparece no texto (na pré-visualização do comando ou no output
// de um comando qualquer) pertence a outro comando e não abre pedido.
export function parseGateDenial(text: string, id: string): { id: string; level: PrumoGuardLevel } | null {
  const level = LEVEL_RE.exec(text)?.[1]
  if (!level) return null
  const ids = [...text.matchAll(ID_RE)].map(m => m[1])
  if (!ids.includes(id)) return null
  return { id, level: level as PrumoGuardLevel }
}

// O comando vem do agente e entra numa linha de utilizador: numa só linha e sem crases, para não
// fechar a citação nem acrescentar texto que se leia como sendo da pessoa.
export function quoteCommand(command: string): string {
  return command.replace(/`/g, "'").replace(/\s+/g, ' ').trim().slice(0, 200)
}

// O que o painel mostra de um comando. O id cobre o comando inteiro, por isso uma cauda escondida
// seria aprovada sem a pessoa a ver: acima do limite mostra o início E o fim, com o meio marcado
// como omitido. A pessoa vê sempre as duas pontas; a linha de contagem diz quanto fica de fora.
export function displayCommand(command: string, max: number): { text: string; omitted: number } {
  if (command.length <= max) return { text: command, omitted: 0 }
  const marker = ' […N omitidos…] '
  const keep = Math.max(16, Math.floor((max - marker.length) / 2))
  const omitted = command.length - 2 * keep
  const head = command.slice(0, keep)
  const tail = command.slice(command.length - keep)
  return { text: `${head} […${omitted} caracteres omitidos…] ${tail}`, omitted }
}
