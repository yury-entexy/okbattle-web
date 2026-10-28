// Rewrites the static export so it runs from any sub-path (artifact viewer, file share, CDN folder):
// Next.js always emits root-absolute "/_next/..." URLs, which break outside a domain root.
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const OUT = 'out';
// Hosts such as the artifact viewer reserve names starting with "_", so the bundle folder is renamed.
const ASSETS = 'app-static';
renameSync(join(OUT, '_next'), join(OUT, ASSETS));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let changed = 0;
for (const file of walk(OUT)) {
  const ext = extname(file);
  if (!['.html', '.js', '.css', '.txt'].includes(ext)) continue;
  const before = readFileSync(file, 'utf8');
  let after = before;
  if (ext === '.css') {
    after = after.replaceAll('url(/_next/static/media/', 'url(../media/');
  } else {
    after = after
      .replaceAll('"/_next/', `"./${ASSETS}/`)
      .replaceAll("'/_next/", `'./${ASSETS}/`)
      .replaceAll('href="/icon.png', 'href="./icon.png');
    // Some hosts reject files containing a raw U+FFFD; inside JS strings the escape is equivalent.
    if (ext === '.js') after = after.replaceAll('\uFFFD', '\\uFFFD');
  }
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
  }
}
console.log(`relativized ${changed} files`);

// The artifact viewer wraps a page in its own <html>/<head>/<body>, so also emit the page's
// head and body contents as one fragment (artifact.html) for publishing there.
const html = readFileSync(join(OUT, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? '';
const title = head.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '<title>OK Battle</title>';
const headRest = head
  .replace(/<title>[\s\S]*?<\/title>/, '')
  .replace(/<meta charSet="utf-8"\/>/, '')
  .replace(/<meta name="viewport"[^>]*\/>/, '');
writeFileSync(
  join(OUT, 'artifact.html'),
  `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${headRest}\n${body}\n`,
);
