import type { EngineInterface } from 'claude-code'

const cmp = (a: string, b: string) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export async function latestPluginDir($: EngineInterface, plugin: string): Promise<string | null> {
  const root = `${(await $.env.get('HOME')) ?? ''}/.claude/plugins/cache/prumo/${plugin}`
  try {
    const versions = (await $.fs.list(root)).filter(e => e.kind === 'dir' && /^\d+(\.\d+)*$/.test(e.name)).map(e => e.name)
    if (versions.length === 0) return null
    versions.sort(cmp)
    return `${root}/${versions[versions.length - 1]}`
  } catch {
    return null
  }
}
