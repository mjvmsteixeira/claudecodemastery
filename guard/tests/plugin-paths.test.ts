import { test, expect } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'
import { latestPluginDir } from '../hooks/plugin-paths.ts'

const ROOT = '/h/.claude/plugins/cache/prumo/prumo-base'

type Entry = { name: string; kind: 'dir' | 'file' | 'other' }
type Leads = Record<string, 'dir' | 'file' | 'other' | 'broken'>

function engine(entries: Entry[], leads: Leads = {}): EngineInterface {
  return {
    env: { get: async () => '/h' },
    fs: {
      list: async () => entries.map(e => ({ ...e, size: 0, mtimeMs: 0, isLink: e.kind === 'other' })),
      stat: async (path: string) => {
        const lead = leads[path.slice(ROOT.length + 1)]
        if (lead === undefined || lead === 'broken') throw new Error('ENOENT')
        return { kind: lead, size: 0, mtimeMs: 0, isLink: true }
      },
    },
  } as unknown as EngineInterface
}

test('diretórios reais: escolhe a versão mais alta', async () => {
  const $ = engine([{ name: '0.9.3', kind: 'dir' }, { name: '0.12.0', kind: 'dir' }, { name: '0.2.0', kind: 'dir' }])
  expect(await latestPluginDir($, 'prumo-base')).toBe(`${ROOT}/0.12.0`)
})

test('symlink que resolve para diretório conta como versão', async () => {
  const $ = engine([{ name: '0.9.3', kind: 'dir' }, { name: '0.14.0', kind: 'other' }], { '0.14.0': 'dir' })
  expect(await latestPluginDir($, 'prumo-base')).toBe(`${ROOT}/0.14.0`)
})

test('symlink partido é ignorado', async () => {
  const $ = engine([{ name: '0.9.3', kind: 'dir' }, { name: '0.14.0', kind: 'other' }], { '0.14.0': 'broken' })
  expect(await latestPluginDir($, 'prumo-base')).toBe(`${ROOT}/0.9.3`)
})

test('symlink para ficheiro é ignorado', async () => {
  const $ = engine([{ name: '0.14.0', kind: 'other' }], { '0.14.0': 'file' })
  expect(await latestPluginDir($, 'prumo-base')).toBeNull()
})

test('nomes que não são versão são ignorados mesmo sendo symlinks para diretórios', async () => {
  const $ = engine([{ name: 'latest', kind: 'other' }], { latest: 'dir' })
  expect(await latestPluginDir($, 'prumo-base')).toBeNull()
})
