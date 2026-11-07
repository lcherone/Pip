import { execFile } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Project } from './types'

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => execFile('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', cwd, ...args], { timeout: 4000, maxBuffer: 64000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (error, stdout) => resolve(error ? '' : stdout.trim())))
}
export async function inspectProject(directory: string): Promise<Omit<Project, 'id' | 'instructions'>> {
  const canonical = await realpath(directory)
  if (!(await stat(canonical)).isDirectory()) throw new Error('Choose a project directory')
  const root = await git(canonical, ['rev-parse', '--show-toplevel']) || canonical
  const [branch, remote, conflicts] = await Promise.all([
    git(root, ['branch', '--show-current']), git(root, ['config', '--get', 'remote.origin.url']), git(root, ['diff', '--no-ext-diff', '--name-only', '--diff-filter=U']),
  ])
  return { name: path.basename(root), path: canonical, root, branch: branch || 'No branch', remote: remote.replace(/(https?:\/\/)[^/@\s]+@/g, '$1[redacted]@'), conflicts: Boolean(conflicts) }
}
