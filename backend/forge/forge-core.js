// backend/forge/forge-core.js — CJS port of the tested Operative Forge core.
// Pure logic + data. No I/O. Mirrors shaddai-nft-art-v2/forge/{assets,core}.mjs
// (18 node:test cases). Shared by forge-routes.js and the in-dashboard engine.

const SLOTS = ['body','headwear','outfit','aura','handheld','hair','eyes','background','accent'];

// weight tiers: common 10, rare 25, epic 50, legendary 100
const ASSETS = {
  body: {
    humanoid:   { name:'Humanoid',    fragment:'natural human operative, detailed skin', weight:10, lean:'organic',   sprite:'body-humanoid' },
    android:    { name:'Android',     fragment:'sleek matte-white synthetic plating, gold-lined joints, robotic', weight:25, lean:'synthetic', sprite:'body-android' },
    cyborg:     { name:'Cyborg',      fragment:'half-machine face, exposed chrome wires, gritty cyborg', weight:25, lean:'synthetic', sprite:'body-cyborg' },
    'sylvan-form':{ name:'Sylvan-Form', fragment:'bark-textured skin, glowing leaf-veins, organic druidic physique', weight:100, lean:'organic', sprite:'body-sylvan' },
  },
  headwear: {
    'mage-hood':{ name:'Mage Hood',   fragment:'flowing arcane mage hood', weight:10, lean:'organic',   sprite:'head-hood' },
    'neural-crown':{ name:'Neural Crown', fragment:'glowing cybernetic neural crown circlet', weight:25, lean:'synthetic', sprite:'head-neural' },
    antlers:    { name:'Antlers',     fragment:'magnificent flowering wooden antlers, blooming sakura blossoms', weight:50, lean:'organic', sprite:'head-antlers' },
    'oni-mask': { name:'Oni Mask',    fragment:'intricate red demonic hannya mask, gold-leaf details, traditional', weight:100, lean:'organic', sprite:'head-oni' },
  },
  outfit: {
    hoodie:     { name:'Hoodie',      fragment:'streetwear tech hoodie', weight:10, lean:'synthetic', sprite:'fit-hoodie' },
    'plate-armor':{ name:'Plate Armor', fragment:'glowing ornate plate armor', weight:25, lean:'synthetic', sprite:'fit-plate' },
    'leaf-woven-mantle':{ name:'Leaf-Woven Mantle', fragment:'mantle woven from living leaves and vines', weight:50, lean:'organic', sprite:'fit-leaf' },
    'tech-kimono':{ name:'Tech-Kimono', fragment:'modern cyberpunk kimono, tech-wear fabrics, glowing neon patterns', weight:50, lean:'synthetic', sprite:'fit-kimono' },
  },
  aura: {
    neon:       { name:'Neon',        fragment:'neon glow energy aura', weight:10, lean:'synthetic', sprite:'aura-neon' },
    flames:     { name:'Flames',      fragment:'blazing flame energy aura', weight:25, lean:'synthetic', sprite:'aura-flames' },
    'sprouting-vines':{ name:'Sprouting Vines', fragment:'sprouting green vines and leaves swirling', weight:50, lean:'organic', sprite:'aura-vines' },
    'cosmic-nebula':{ name:'Cosmic Nebula', fragment:'swirling galaxy dust, nebula clouds, deep space psionic energy', weight:100, lean:'organic', sprite:'aura-nebula' },
  },
  handheld: {
    'coffee-cup':{ name:'Coffee Cup', fragment:'holding a steaming coffee cup', weight:10, lean:'synthetic', sprite:'hand-coffee' },
    'mage-staff':{ name:'Mage Staff', fragment:'glowing arcane mage staff', weight:25, lean:'organic', sprite:'hand-staff' },
    'wooden-scythe':{ name:'Wooden Scythe', fragment:'rustic carved wooden scythe', weight:25, lean:'organic', sprite:'hand-scythe' },
    'cyber-katana':{ name:'Cyber-Katana', fragment:'razor-sharp cyber-katana, glowing edge, traditional hilt', weight:50, lean:'synthetic', sprite:'hand-katana' },
  },
  hair: {
    natural:    { name:'Natural',     fragment:'natural dark hair', weight:10, lean:'organic',   sprite:'hair-natural' },
    silver:     { name:'Silver',      fragment:'flowing silver hair', weight:10, lean:'organic',   sprite:'hair-silver' },
    green:      { name:'Green',       fragment:'vibrant green hair', weight:25, lean:'organic',   sprite:'hair-green' },
    violet:     { name:'Violet',      fragment:'glowing violet hair', weight:25, lean:'synthetic', sprite:'hair-violet' },
  },
  eyes: {
    normal:     { name:'Normal',      fragment:'expressive natural eyes', weight:10, lean:'organic',   sprite:'eyes-normal' },
    glowing:    { name:'Glowing',     fragment:'glowing luminous eyes', weight:25, lean:'synthetic', sprite:'eyes-glowing' },
    scanner:    { name:'Scanner',     fragment:'cybernetic scanner-visor eye', weight:25, lean:'synthetic', sprite:'eyes-scanner' },
    'third-eye':{ name:'Third Eye',   fragment:'mystic glowing third eye on the forehead', weight:100, lean:'organic', sprite:'eyes-third' },
  },
  background: {
    void:       { name:'Void',        fragment:'dark atmospheric void background', weight:10, lean:'synthetic', sprite:'bg-void' },
    'neon-city':{ name:'Neon City',   fragment:'distant neon cyberpunk city background', weight:10, lean:'synthetic', sprite:'bg-city' },
    'crystal-cavern':{ name:'Crystal Cavern', fragment:'glowing fantasy crystal cavern background', weight:25, lean:'organic', sprite:'bg-cavern' },
    'matrix-rain':{ name:'Matrix Rain', fragment:'cascading green matrix code background', weight:25, lean:'synthetic', sprite:'bg-matrix' },
  },
  accent: {
    azure:      { name:'Azure',       fragment:'azure accent lighting', weight:10, lean:'synthetic', sprite:'accent-azure' },
    magenta:    { name:'Magenta',     fragment:'magenta accent lighting', weight:10, lean:'synthetic', sprite:'accent-magenta' },
    green:      { name:'Green',       fragment:'emerald-green accent lighting', weight:10, lean:'organic',   sprite:'accent-green' },
    gold:       { name:'Gold',        fragment:'radiant gold accent lighting', weight:25, lean:'organic',   sprite:'accent-gold' },
  },
};

const ARCHETYPES = {
  vanguard:     { name:'Vanguard',     lean:'synthetic', loadout:{ body:'cyborg',     headwear:'neural-crown', outfit:'plate-armor',        aura:'flames',          handheld:'cyber-katana', hair:'violet',  eyes:'glowing',  background:'void',           accent:'magenta' } },
  ghost:        { name:'Ghost',        lean:'synthetic', loadout:{ body:'android',    headwear:'neural-crown', outfit:'hoodie',             aura:'neon',            handheld:'cyber-katana', hair:'silver',  eyes:'scanner',  background:'matrix-rain',     accent:'azure' } },
  artisan:      { name:'Artisan',      lean:'organic',   loadout:{ body:'humanoid',   headwear:'mage-hood',    outfit:'leaf-woven-mantle',  aura:'neon',            handheld:'coffee-cup',   hair:'natural', eyes:'normal',   background:'neon-city',       accent:'gold' } },
  oracle:       { name:'Oracle',       lean:'organic',   loadout:{ body:'humanoid',   headwear:'oni-mask',     outfit:'tech-kimono',        aura:'cosmic-nebula',   handheld:'mage-staff',   hair:'violet',  eyes:'third-eye',background:'crystal-cavern',  accent:'gold' } },
  'street-deity':{ name:'Street-Deity',lean:'synthetic', loadout:{ body:'android',    headwear:'neural-crown', outfit:'hoodie',             aura:'neon',            handheld:'coffee-cup',   hair:'green',   eyes:'glowing',  background:'neon-city',       accent:'magenta' } },
  'gaia-link':  { name:'Gaia-Link',    lean:'organic',   loadout:{ body:'sylvan-form',headwear:'antlers',      outfit:'leaf-woven-mantle',  aura:'sprouting-vines', handheld:'wooden-scythe',hair:'green',   eyes:'normal',   background:'crystal-cavern',  accent:'green' } },
  psionic:      { name:'Psionic',      lean:'organic',   loadout:{ body:'humanoid',   headwear:'oni-mask',     outfit:'tech-kimono',        aura:'cosmic-nebula',   handheld:'mage-staff',   hair:'silver',  eyes:'third-eye',background:'crystal-cavern',  accent:'azure' } },
  harvester:    { name:'Harvester',    lean:'organic',   loadout:{ body:'humanoid',   headwear:'mage-hood',    outfit:'leaf-woven-mantle',  aura:'sprouting-vines', handheld:'wooden-scythe',hair:'natural', eyes:'normal',   background:'crystal-cavern',  accent:'green' } },
};

const STYLE = 'premium NFT trading-card character portrait, dramatic rim lighting, volumetric glow, intricate fine detail, sharp focus, centered bust, highly detailed, no text, no watermark, no letters';

const ETHNIC = [
  'a Black African person with deep dark melanated skin',
  'an East Asian person',
  'a South Asian person with warm brown skin',
  'a Latina/o person with golden-brown skin',
  'a Middle Eastern person with olive skin',
  'a Southeast Asian person with brown skin',
  'a Pacific Islander person with dark skin',
  'an Indigenous person with bronze skin',
  'a mixed-race person with medium-brown skin',
  'a Black person with rich dark skin and natural hair',
];

const TIER = [[100,'legendary'],[50,'epic'],[25,'rare'],[10,'common']];
function tierName(weight){ for (const [w,n] of TIER) if (weight >= w) return n; return 'common'; }

function buildHash(build){
  const str = SLOTS.map(s => `${s}:${build.slots[s]}`).sort().join('|');
  let h = 2166136261;
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8,'0');
}

function rarityOf(build){
  let max = 0;
  for (const s of SLOTS){ const w = (ASSETS[s][build.slots[s]] || {}).weight || 10; if (w > max) max = w; }
  return tierName(max);
}

function loadoutFor(archetype){
  const a = ARCHETYPES[archetype];
  if (!a) throw new Error(`unknown archetype: ${archetype}`);
  return { archetype, organic: a.lean === 'organic', slots: { ...a.loadout } };
}

function validateBuild(build){
  const errs = [];
  for (const s of SLOTS){
    const key = build && build.slots ? build.slots[s] : undefined;
    if (key == null) errs.push(`missing slot: ${s}`);
    else if (!(key in ASSETS[s])) errs.push(`invalid ${s}: ${key}`);
  }
  return errs;
}

function assemblePrompt(build, seed){
  seed = seed || 0;
  const eth = ETHNIC[Math.abs(seed) % ETHNIC.length];
  const frags = SLOTS.map(s => (ASSETS[s][build.slots[s]] || {}).fragment).filter(Boolean);
  return `${frags[0]}, ${eth}, ${frags.slice(1).join(', ')}, ${STYLE}`;
}

const SLOT_LABEL = { body:'Body', headwear:'Headwear', outfit:'Outfit', aura:'Aura',
  handheld:'Handheld', hair:'Hair', eyes:'Eyes', background:'Background', accent:'Accent' };

function forgeMetadata(build, tokenId, image, owner){
  const rarity = rarityOf(build);
  const attributes = SLOTS.map(s => ({ trait_type: SLOT_LABEL[s], value: ASSETS[s][build.slots[s]].name }));
  return {
    name: `SHADDAI Operative #${tokenId}`,
    description: `A ${rarity}-tier SHADDAI Operative forged in the Builder.`,
    image, tokenId, owner, buildHash: buildHash(build),
    archetype: build.archetype, rarity, attributes,
  };
}

module.exports = { SLOTS, ASSETS, ARCHETYPES, STYLE, ETHNIC,
  tierName, buildHash, rarityOf, loadoutFor, validateBuild, assemblePrompt, forgeMetadata };
