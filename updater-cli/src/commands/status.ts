/**
 * status.ts — Print current version, last tag, last release run result.
 */

import * as p from '@clack/prompts'
import boxen from 'boxen'
import { discoverRepo } from '../lib/repo.js'
import { getLatestRelease, listWorkflowRuns, hasToken } from '../lib/github.js'
import { c, G, link, fmtDuration } from '../lib/ui.js'

export async function runStatus(): Promise<void> {
  const sp = p.spinner()
  sp.start('Fetching status…')

  let ctx
  try {
    ctx = await discoverRepo()
  } catch (e: any) {
    sp.stop(c.red(`Failed: ${e.message}`))
    process.exit(1)
  }

  const lines: string[] = [
    `${c.bold('Repo')}       ${ctx.owner}/${ctx.repo}`,
    `${c.bold('App version')} ${c.cyan(ctx.appVersion)}`,
    `${c.bold('Branch')}     ${ctx.branch}`,
    `${c.bold('Last tag')}   ${ctx.lastTag ?? c.dim('none')}`,
    `${c.bold('Auth')}       ${hasToken() ? c.green('GitHub token found') : c.yellow('No token')}`,
  ]

  // GitHub release status
  try {
    const release = await getLatestRelease(ctx.owner, ctx.repo)
    if (release) {
      lines.push('')
      lines.push(
        `${c.bold('Latest release')} ${c.cyan(release.tag_name)} · ` +
        `${release.draft ? c.yellow('DRAFT') : c.green('Published')} · ` +
        `${link('Open', release.html_url)}`
      )
      lines.push(`  Assets: ${release.assets.map((a) => a.name).join(', ')}`)
    }
  } catch {}

  // Latest workflow run
  try {
    const runs = await listWorkflowRuns(ctx.owner, ctx.repo, ctx.workflowPath)
    if (runs.length > 0) {
      const run = runs[0]
      const conclusionIcon =
        run.conclusion === 'success'
          ? c.green(G.tick)
          : run.conclusion === 'failure'
          ? c.red(G.cross)
          : run.status === 'in_progress'
          ? c.cyan('◐')
          : c.gray(G.queued)
      const dur =
        run.created_at && run.updated_at
          ? fmtDuration(new Date(run.updated_at).getTime() - new Date(run.created_at).getTime())
          : ''
      lines.push('')
      lines.push(
        `${c.bold('Last run')}   ${conclusionIcon} #${run.run_number} · ${run.status}${run.conclusion ? '/' + run.conclusion : ''} · ${dur} · ${link('View', run.html_url)}`
      )
    }
  } catch {}

  sp.stop('')

  console.log(
    boxen(lines.join('\n'), {
      padding: { top: 0, bottom: 0, left: 1, right: 2 },
      borderStyle: 'round',
      borderColor: 'cyan',
      title: ' Status ',
      titleAlignment: 'center',
    })
  )
}
