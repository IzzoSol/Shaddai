// Extract every inline <script> from an HTML file and syntax-check each block,
// handling ES-module blocks (import/export) via `node --check` on a temp file.
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { execSync } from 'child_process';

const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m, i = 0, bad = 0;
while ((m = re.exec(html))) {
  const attrs = m[1] || '';
  if (/\bsrc\s*=/.test(attrs)) continue;
  if (/type\s*=\s*["']?(application\/json|importmap|text\/html)/i.test(attrs)) continue;
  const code = m[2];
  const isModule = /type\s*=\s*["']?module/i.test(attrs);
  i++;
  try {
    if (isModule) {
      const tmp = path.join(os.tmpdir(), `sw-check-${i}.mjs`);
      fs.writeFileSync(tmp, code);
      try { execSync(`node --check "${tmp}"`, { stdio: 'pipe' }); }
      finally { fs.unlinkSync(tmp); }
    } else {
      new vm.Script(code, { filename: `inline#${i}` });
    }
  } catch (e) {
    bad++;
    const msg = (e.stderr ? e.stderr.toString() : '') || e.message;
    console.log(`\n❌ script #${i} (${isModule ? 'module' : 'classic'}):\n${msg.trim()}`);
  }
}
console.log(bad ? `\n${bad} script block(s) with syntax errors.` : `\n✓ all ${i} inline script blocks parse clean (modules via node --check).`);
process.exit(bad ? 1 : 0);
