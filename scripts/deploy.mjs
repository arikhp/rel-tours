/**
 * Publish dist/ to the gh-pages branch. Run with `npm run deploy`.
 *
 * Uses a temporary worktree so your working tree is never touched — no stashing,
 * no branch switching, nothing to clean up if it fails partway.
 *
 * Refuses to run unless `npm run qa` passes first; pass --skip-qa only if you
 * have just run it yourself.
 */
import { spawnSync } from 'node:child_process'
import { rmSync, cpSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(ROOT, 'dist')
const WORKTREE = join(ROOT, '.gh-pages-worktree')
const BRANCH = 'gh-pages'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts })
  if (r.status !== 0) {
    console.error(`\n✖ ${cmd} ${args.join(' ')} failed`)
    process.exit(r.status ?? 1)
  }
  return r
}
const quiet = (cmd, args) =>
  spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })

if (!process.argv.includes('--skip-qa')) {
  console.log('▸ Running QA before deploy…\n')
  sh(npm, ['run', 'qa'])
} else {
  console.log('▸ Skipping QA (--skip-qa)\n')
  sh(npm, ['run', 'build'])
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('✖ dist/index.html missing — build did not produce a site')
  process.exit(1)
}

// Clean up a worktree left behind by an interrupted run.
if (existsSync(WORKTREE)) {
  quiet('git', ['worktree', 'remove', WORKTREE, '--force'])
  rmSync(WORKTREE, { recursive: true, force: true })
}

console.log(`\n▸ Publishing dist/ to ${BRANCH}…`)

const hasBranch =
  quiet('git', ['rev-parse', '--verify', BRANCH]).status === 0 ||
  quiet('git', ['ls-remote', '--exit-code', '--heads', 'origin', BRANCH]).status === 0

if (hasBranch) {
  quiet('git', ['fetch', 'origin', BRANCH])
  sh('git', ['worktree', 'add', WORKTREE, BRANCH])
} else {
  // A branch with no history of its own — the built site is not a code lineage.
  sh('git', ['worktree', 'add', '--detach', WORKTREE])
  sh('git', ['-C', WORKTREE, 'checkout', '--orphan', BRANCH])
  sh('git', ['-C', WORKTREE, 'rm', '-rf', '--quiet', '.'])
}

// Replace the branch contents wholesale, keeping .git itself.
for (const entry of readdirSync(WORKTREE)) {
  if (entry !== '.git') rmSync(join(WORKTREE, entry), { recursive: true, force: true })
}
cpSync(DIST, WORKTREE, { recursive: true })

// Tells GitHub Pages to serve the files as-is instead of running Jekyll, which
// would otherwise drop any path beginning with an underscore.
writeFileSync(join(WORKTREE, '.nojekyll'), '')

const sha = quiet('git', ['rev-parse', '--short', 'HEAD']).stdout.trim()
sh('git', ['-C', WORKTREE, 'add', '--all'])

const staged = quiet('git', ['-C', WORKTREE, 'diff', '--cached', '--name-only']).stdout.trim()
if (!staged) {
  console.log('▸ No change since the last deploy — nothing to publish.')
} else {
  sh('git', ['-C', WORKTREE, 'commit', '-m', `Deploy ${sha}`])
  sh('git', ['-C', WORKTREE, 'push', 'origin', BRANCH])
  console.log('\n✔ Deployed.')
}

quiet('git', ['worktree', 'remove', WORKTREE, '--force'])
rmSync(WORKTREE, { recursive: true, force: true })
