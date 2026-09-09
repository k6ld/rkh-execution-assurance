/*
 * A deliberately opt-in artifact cleanup utility. It only accepts the RKH
 * pilot root and only removes RKH run artifacts. Metadata-row cleanup remains
 * an IT-approved n8n retention operation, so this utility never touches n8n's
 * database or credentials.
 */
const fs = require('node:fs');
const path = require('node:path');

const apply = process.argv.includes('--apply');
const root = path.resolve(process.env.RKH_ASSURANCE_STORAGE_ROOT || 'C:/RKH/ExecutionAssurance');
const runs = path.resolve(root, 'runs');
if (runs === root || !runs.startsWith(`${root}${path.sep}`)) throw new Error('Invalid RKH artifact root.');
if (!fs.existsSync(runs)) { console.log('No local artifact directory exists.'); process.exit(0); }

const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
const candidates = fs.readdirSync(runs, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^RKH-[A-Z0-9-]+\.(source\.(csv|xls|xlsx)|results\.(json|csv))$/i.test(entry.name))
  .map((entry) => path.join(runs, entry.name))
  .filter((file) => fs.statSync(file).mtimeMs < cutoff);

for (const file of candidates) {
  console.log(`${apply ? 'Removing' : 'Would remove'} ${path.basename(file)}`);
  if (apply) fs.unlinkSync(file);
}
console.log(`${candidates.length} local artifact(s) ${apply ? 'removed' : 'eligible for removal'}.`);
