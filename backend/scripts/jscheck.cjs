// Extract the first <script type="module"> ... </script> from the world HTML and syntax-check it.
const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

const html = fs.readFileSync(process.argv[2], 'utf8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.log('no module script found'); process.exit(2); }
const tmp = path.join(os.tmpdir(), 'worldcheck.mjs');
fs.writeFileSync(tmp, m[1]);
try {
  execSync('node --check "' + tmp + '"', { stdio: 'pipe' });
  console.log('✅ module script: SYNTAX OK (' + m[1].split('\n').length + ' lines)');
} catch (e) {
  console.log('❌ SYNTAX ERROR:\n' + (e.stderr ? e.stderr.toString() : e.message));
  process.exit(1);
}
