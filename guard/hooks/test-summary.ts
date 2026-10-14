const TEST_CMD_RE =
  /(^|[\s;&|(])((bundle exec )?rspec|(bin\/)?rails test|pytest|py\.test|(npx |yarn |pnpm )?(vitest|jest)|npm (run )?test|yarn test|pnpm test|go test|cargo test|mix test|phpunit|dotnet test)(\s|$)/

export function isTestCommand(cmd: string): boolean {
  return TEST_CMD_RE.test(cmd)
}

const num = (s: string | undefined) => (s === undefined ? 0 : Number(s))

export function parseTestSummary(output: string): { passed: number; failed: number } | null {
  let m: RegExpExecArray | null
  if ((m = /(\d+) examples?, (\d+) failures?/.exec(output))) return { passed: num(m[1]) - num(m[2]), failed: num(m[2]) }
  if ((m = /(\d+) runs?, \d+ assertions?, (\d+) failures?, (\d+) errors?/.exec(output)))
    return { passed: num(m[1]) - num(m[2]) - num(m[3]), failed: num(m[2]) + num(m[3]) }
  const cargo = [...output.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed/g)]
  if (cargo.length > 0) return { passed: cargo.reduce((n, c) => n + num(c[1]), 0), failed: cargo.reduce((n, c) => n + num(c[2]), 0) }
  if ((m = /^[ \t]*Tests:?[ \t]+(.*)$/m.exec(output))) {
    const f = /(\d+) failed/.exec(m[1] ?? ''), p = /(\d+) passed/.exec(m[1] ?? '')
    if (f || p) return { passed: num(p?.[1]), failed: num(f?.[1]) }
  }
  if ((m = /^[= ]*(\d+ \w+(?:, \d+ \w+)*) in [\d.]+s/m.exec(output))) {
    const f = /(\d+) failed/.exec(m[1] ?? ''), p = /(\d+) passed/.exec(m[1] ?? ''), e = /(\d+) errors?/.exec(m[1] ?? '')
    if (f || p || e) return { passed: num(p?.[1]), failed: num(f?.[1]) + num(e?.[1]) }
  }
  const goOk = (output.match(/^ok\s+\S+/gm) ?? []).length
  const goFail = (output.match(/^FAIL\s+\S+/gm) ?? []).length
  if (goOk + goFail > 0) return { passed: goOk, failed: goFail }
  return null
}

export function failureSignature(output: string): string {
  return output
    .split('\n')
    .filter(l => /fail|error|✗|✕|×/i.test(l))
    .map(l => l.replace(/\d+(\.\d+)?\s*(ms|s|seconds?)\b/g, '').replace(/\s+/g, ' ').trim())
    .sort()
    .join('\n')
    .slice(0, 2000)
}

export function shortHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
