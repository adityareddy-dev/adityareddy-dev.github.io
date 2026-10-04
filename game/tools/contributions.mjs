// Rebuilds the contributions part of game/data/content.json from GitHub.
// node game/tools/contributions.mjs   (needs the gh command, signed in)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../data/content.json', import.meta.url));
const AUTHOR = 'adityareddy-dev';
const MAX_TITLE = 90;

const search = (flag, dateKey) =>
  JSON.parse(
    execFileSync('gh', ['search', 'prs', '--author', AUTHOR, flag, '--limit', '200', '--json', `repository,title,url,${dateKey}`], { encoding: 'utf8' }),
  )
    // His own repos aren't contributions to anyone else.
    .filter((p) => p.repository.nameWithOwner.split('/')[0].toLowerCase() !== AUTHOR)
    .map((p) => ({
      repo: p.repository.nameWithOwner,
      title: p.title.length > MAX_TITLE ? `${p.title.slice(0, MAX_TITLE - 1)}…` : p.title,
      url: p.url,
      date: p[dateKey].slice(0, 10),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url));

const merged = search('--merged', 'closedAt');
const open = search('--state=open', 'createdAt');

const counts = new Map();
const bump = (repo, key) => {
  if (!counts.has(repo)) counts.set(repo, { repo, merged: 0, open: 0 });
  counts.get(repo)[key] += 1;
};
merged.forEach((p) => bump(p.repo, 'merged'));
open.forEach((p) => bump(p.repo, 'open'));
const byProject = [...counts.values()].sort((a, b) => b.merged - a.merged || b.open - a.open || a.repo.localeCompare(b.repo));

const content = JSON.parse(readFileSync(file, 'utf8'));
content.contributions = { merged, open, byProject };
content.generated = new Date().toISOString().slice(0, 10);
writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`);
console.log(`${merged.length} merged, ${open.length} open, ${byProject.length} projects`);
