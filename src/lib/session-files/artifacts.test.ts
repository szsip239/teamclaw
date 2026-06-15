import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendArtifactLinks,
  createContainerSessionOutputSnapshot,
  createExternalSessionOutputSnapshot,
  normalizeContainerSessionArtifacts,
  normalizeExternalSessionArtifacts,
  sanitizeOutputArtifactLinks,
  stripOutputArtifactLinksToLabels,
} from './artifacts'
import { buildSessionOutputPath, resolveExternalSessionFilePath } from './helpers'

const tempDirs: string[] = []

async function makeWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'teamclaw-artifacts-'))
  tempDirs.push(dir)
  await fs.mkdir(path.join(dir, 'workspace-telecom'), { recursive: true })
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('session artifact normalization', () => {
  it('copies files created in the agent workspace root into canonical session output', async () => {
    const workspacePath = await makeWorkspace()
    const runStartedAt = new Date()
    await fs.writeFile(
      path.join(workspacePath, 'workspace-telecom', 'report.html'),
      '<html>report</html>',
    )

    const artifacts = await normalizeExternalSessionArtifacts({
      workspacePath,
      agentId: 'telecom',
      chatSessionId: 'chat-1',
      runStartedAt,
    })

    const outputPath = resolveExternalSessionFilePath(
      workspacePath,
      'telecom',
      'chat-1',
      'output',
      'report.html',
    )
    await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe('<html>report</html>')
    expect(artifacts).toEqual([{ fileName: 'report.html', relativePath: 'report.html' }])
  })

  it('copies files created in legacy workspace output while preserving relative paths', async () => {
    const workspacePath = await makeWorkspace()
    const runStartedAt = new Date()
    await fs.mkdir(path.join(workspacePath, 'workspace-telecom', 'output', 'charts'), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(workspacePath, 'workspace-telecom', 'output', 'charts', 'figure.png'),
      'png',
    )

    const artifacts = await normalizeExternalSessionArtifacts({
      workspacePath,
      agentId: 'telecom',
      chatSessionId: 'chat-1',
      runStartedAt,
    })

    const outputPath = resolveExternalSessionFilePath(
      workspacePath,
      'telecom',
      'chat-1',
      'output',
      'charts/figure.png',
    )
    await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe('png')
    expect(artifacts).toEqual([{ fileName: 'figure.png', relativePath: 'charts/figure.png' }])
  })

  it('does not collect old or reserved workspace root files', async () => {
    const workspacePath = await makeWorkspace()
    const old = new Date('2026-01-01T00:00:00.000Z')
    await fs.writeFile(path.join(workspacePath, 'workspace-telecom', 'old.html'), 'old')
    await fs.writeFile(path.join(workspacePath, 'workspace-telecom', 'AGENTS.md'), 'rules')
    await fs.utimes(path.join(workspacePath, 'workspace-telecom', 'old.html'), old, old)

    const artifacts = await normalizeExternalSessionArtifacts({
      workspacePath,
      agentId: 'telecom',
      chatSessionId: 'chat-1',
      runStartedAt: new Date('2026-06-15T00:00:00.000Z'),
    })

    expect(artifacts).toEqual([])
  })

  it('renames a direct canonical output overwrite and restores the previous file', async () => {
    const workspacePath = await makeWorkspace()
    const outputPath = resolveExternalSessionFilePath(
      workspacePath,
      'telecom',
      'chat-1',
      'output',
      'report.html',
    )
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, 'old report')
    const originalMtime = new Date('2026-06-01T00:00:00.000Z')
    await fs.utimes(outputPath, originalMtime, originalMtime)

    const snapshot = await createExternalSessionOutputSnapshot({
      workspacePath,
      agentId: 'telecom',
      chatSessionId: 'chat-1',
    })
    const runStartedAt = new Date(Date.now() - 1_000)
    await fs.writeFile(outputPath, 'new report')

    const artifacts = await normalizeExternalSessionArtifacts({
      workspacePath,
      agentId: 'telecom',
      chatSessionId: 'chat-1',
      runStartedAt,
      outputSnapshot: snapshot,
    })

    await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe('old report')
    const restoredStat = await fs.stat(outputPath)
    expect(Math.abs(restoredStat.mtimeMs - originalMtime.getTime())).toBeLessThan(1_000)
    await expect(
      fs.readFile(
        resolveExternalSessionFilePath(
          workspacePath,
          'telecom',
          'chat-1',
          'output',
          'report-2.html',
        ),
        'utf8',
      ),
    ).resolves.toBe('new report')
    expect(artifacts).toEqual([{ fileName: 'report-2.html', relativePath: 'report-2.html' }])
  })

  it('renames a container canonical output overwrite and restores the previous file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'teamclaw-container-artifacts-'))
    tempDirs.push(root)
    const mapPath = (value: string) =>
      value.startsWith('/workspace') ? path.join(root, value.slice(1)) : value
    const execWithOutput = async (_containerId: string, cmd: string[]) => {
      const mapped = cmd.map(mapPath)
      return execFileSync(mapped[0], mapped.slice(1), { encoding: 'utf8' })
    }

    const outputDir = mapPath(buildSessionOutputPath('sales', 'chat-1'))
    await fs.mkdir(outputDir, { recursive: true })
    await fs.writeFile(path.join(outputDir, 'report.html'), 'old report')
    const originalMtime = new Date('2026-06-01T00:00:00.000Z')
    await fs.utimes(path.join(outputDir, 'report.html'), originalMtime, originalMtime)

    const snapshot = await createContainerSessionOutputSnapshot({
      containerId: 'container-1',
      agentId: 'sales',
      chatSessionId: 'chat-1',
      execWithOutput,
    })
    const runStartedAt = new Date(Date.now() - 1_000)
    await fs.writeFile(path.join(outputDir, 'report.html'), 'new report')

    const artifacts = await normalizeContainerSessionArtifacts({
      containerId: 'container-1',
      agentId: 'sales',
      chatSessionId: 'chat-1',
      runStartedAt,
      execWithOutput,
      outputSnapshot: snapshot,
    })

    await expect(fs.readFile(path.join(outputDir, 'report.html'), 'utf8')).resolves.toBe(
      'old report',
    )
    const restoredStat = await fs.stat(path.join(outputDir, 'report.html'))
    expect(Math.abs(restoredStat.mtimeMs - originalMtime.getTime())).toBeLessThan(1_000)
    await expect(fs.readFile(path.join(outputDir, 'report-2.html'), 'utf8')).resolves.toBe(
      'new report',
    )
    expect(artifacts).toEqual([{ fileName: 'report-2.html', relativePath: 'report-2.html' }])
  })

  it('appends deterministic output links without duplicating existing links', () => {
    const content = '文件已创建: [report.html](output/report.html)'
    expect(
      appendArtifactLinks(content, [
        { fileName: 'report.html', relativePath: 'report.html' },
        { fileName: 'data.csv', relativePath: 'data.csv' },
      ]),
    ).toBe(
      '文件已创建: report.html\n\n[report.html](output/report.html)\n[data.csv](output/data.csv)',
    )
  })

  it('replaces stale model-written output links with the normalized artifact link', () => {
    expect(
      appendArtifactLinks('下载链接: [report.html](output/report.html)', [
        { fileName: 'report-2.html', relativePath: 'report-2.html' },
      ]),
    ).toBe('下载链接: report.html\n\n[report-2.html](output/report-2.html)')
  })

  it('strips malformed legacy output links while preserving valid artifact links', () => {
    expect(
      sanitizeOutputArtifactLinks(
        '已生成：[report.html](output/report.html)\n\n[}](output/%24%7Bsrc%23/workspace/main/sessions/chat/output//%7D)',
      ),
    ).toBe('已生成：[report.html](output/report.html)')
  })

  it('can compare content after replacing output links with labels', () => {
    expect(
      stripOutputArtifactLinksToLabels(
        '页面已生成：[worldcup.html](output/worldcup.html)\n\n[worldcup-2.html](output/worldcup-2.html)',
      ),
    ).toBe('页面已生成：worldcup.html\n\nworldcup-2.html')
  })
})
