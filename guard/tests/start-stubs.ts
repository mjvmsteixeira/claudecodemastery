import type { On } from 'claude-code'

const RAN = { exitCode: 0, stdout: 'host', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

// Respostas do motor às chamadas que o arranque do mod faz (registos, relógio, processos);
// quem testa o session.start liga isto e depois acrescenta os stubs que interessam ao caso.
export function stubStart(on: On, seen: { commands: string[]; tools?: unknown[] } = { commands: [] }): void {
  on('command.register', (_$, e) => { seen.commands.push(e.name); return { value: { command: e.name } } })
  on('tool.register', (_$, e) => { seen.tools?.push(e); return { value: { tool: 'x' } } })
  on('session.id', () => ({ value: 'sid-test' }))
  on('session.cwd', () => ({ value: '/p' }))
  // Um período recusado termina o intervalo. Responder de imediato punha os flushes periódicos
  // (trilho CEF, friday) em ciclo apertado ao lado do teste, a roubar o lote ao do session.end.
  on('clock.every', () => ({ deny: 'sem relógio no teste' }))
  on('fs.write', () => ({ value: undefined }))
  on('process.run', () => ({ value: RAN }))
}

const PRESENTATION = { isFullscreen: false, columns: 80 } as const

// `$.command.run` do kit pede o input inteiro do evento: a origem e a apresentação são do motor.
export function cmd(command: string, args = '', origin: { kind: 'composer' } | { kind: 'plugin'; name: string } = { kind: 'plugin', name: 'outro' }) {
  return { command, args, origin, presentation: PRESENTATION }
}
