/**
 * SHADDAI Skills Loader
 * Scans Obsidian vault for SKILL.md files and builds in-memory registry
 * Each skill has: name, description, agent, category, filePath (for on-demand loading)
 */

const fs = require('fs');
const path = require('path');

// Map Obsidian agent folder names → server agent names
const AGENT_NAME_MAP = {
  'XEROX': 'ZEROX',
  'ZEROX': 'ZEROX',
  'NEXUS': 'NEXUS',
  'ORACLE': 'ORACLE',
  'QUILL': 'QUILL',
  'TURTLE': 'TURTLE',
  'PIKADON': 'PIKADON',
  'SHADDAI': 'SHADDAI',
  'Marketing Skills': 'QUILL'
};

// Agent port map
const AGENT_PORTS = {
  SHADDAI: 8000, ZEROX: 8001, ORACLE: 8002,
  NEXUS: 8003, TURTLE: 8004, QUILL: 8005, PIKADON: 8008
};

// Parse YAML frontmatter from skill file
function parseFrontmatter(content) {
  const fm = { name: '', description: '' };
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return fm;
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key === 'name') fm.name = val;
    if (key === 'description') fm.description = val;
  }
  return fm;
}

let _skillIndex = null;
let _loadedAt = null;

function buildSkillIndex(obsidianRoot) {
  const skills = [];
  const agentsDir = path.join(obsidianRoot, 'Agents');

  if (!fs.existsSync(agentsDir)) {
    console.warn('[SKILLS] Obsidian agents dir not found:', agentsDir);
    return skills;
  }

  // Walk agent directories
  const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const agentDir of agentDirs) {
    const agentName = AGENT_NAME_MAP[agentDir] || 'SHADDAI';
    const agentPath = path.join(agentsDir, agentDir);
    const skillsPath = path.join(agentPath, 'Skills');

    const searchRoot = fs.existsSync(skillsPath) ? skillsPath : agentPath;
    walkForSkills(searchRoot, agentName, skills);
  }

  console.log(`[SKILLS] Loaded ${skills.length} skills from Obsidian vault`);
  return skills;
}

function walkForSkills(dir, agentName, skills, depth = 0) {
  if (depth > 4) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch { return; }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      walkForSkills(path.join(dir, entry.name), agentName, skills, depth + 1);
    } else if (entry.name === 'SKILL.md') {
      const filePath = path.join(dir, 'SKILL.md');
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fm = parseFrontmatter(content);
        const skillName = fm.name || path.basename(path.dirname(filePath));
        if (!skillName) continue;

        // Category from parent directory
        const parts = filePath.split(path.sep);
        const skillIdx = parts.indexOf(path.basename(path.dirname(filePath)));
        const category = parts[skillIdx - 1] || 'general';

        skills.push({
          name: skillName,
          description: fm.description || `${skillName} skill`,
          agent: agentName,
          port: AGENT_PORTS[agentName] || 8000,
          category,
          type: 'md',
          filePath
        });
      } catch { /* skip unreadable files */ }
    }
  }
}

function getSkillRegistry(obsidianRoot) {
  if (_skillIndex && _loadedAt && (Date.now() - _loadedAt) < 300000) {
    return _skillIndex; // Cache for 5 minutes
  }
  _skillIndex = buildSkillIndex(obsidianRoot);
  _loadedAt = Date.now();
  return _skillIndex;
}

function getSkillContent(skillName, obsidianRoot) {
  const registry = getSkillRegistry(obsidianRoot);
  const skill = registry.find(s => s.name === skillName);
  if (!skill || !skill.filePath) return null;
  try {
    return fs.readFileSync(skill.filePath, 'utf8');
  } catch {
    return null;
  }
}

module.exports = { getSkillRegistry, getSkillContent, AGENT_PORTS };
