import { readdirSync, existsSync, writeFileSync } from 'fs';
const C = new URL('../characters/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dirs = readdirSync(C, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const chars = dirs.filter((n) => existsSync(`${C}${n}/sprites/${n}-walking-strip.png`));
const others = dirs.filter((n) => !chars.includes(n));
const card = (n) => `<figure><img loading=lazy src="../characters/${n}/sprites/${n}-walking-strip.png"><figcaption>${n}</figcaption></figure>`;
const links = [['roster-viewer.html','Roster viewer (12 chars, classic/voxel, 3D)'],['mount-viewer.html','Mounts & vehicles (3D)'],['farm-realm-scene.html','Farm Realm scene (walk around)'],['city-center.html','City Center plaza'],['character-select.html','Character select'],['equip-viewer.html','Weapon equip test']];
writeFileSync(new URL('gallery.html', import.meta.url), `<!doctype html><meta charset=utf-8><title>Forge Gallery</title>
<style>body{background:#06080b;color:#e8c45c;font:14px system-ui;margin:20px}h2{color:#00ff9c}a{color:#5fe0ff;display:block;margin:4px 0}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:10px}figure{margin:0;background:#101418;padding:6px;border-radius:6px}
img{width:100%;background:repeating-conic-gradient(#1a1f25 0 25%,#12161b 0 50%) 0/16px 16px}figcaption{text-align:center}</style>
<h1>Forge Gallery</h1><h2>Interactive</h2>${links.map(([h,t])=>`<a href="${h}">${t}</a>`).join('')}
<h2>2D sprite strips (walking) — ${chars.length} characters</h2><div class=g>${chars.map(card).join('')}</div>
<h2>3D-only assets (open in Mounts viewer)</h2><p>${others.join(' · ')}</p>`);
console.log(chars.length, 'chars');
