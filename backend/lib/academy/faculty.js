'use strict';

const FACULTY = Object.freeze([
  { agent: 'SHADDAI', room: 'deans-atrium', subjects: ['strategy', 'orchestration', 'capstones'] },
  { agent: 'ZEROX', room: 'trading-desk', subjects: ['paper trading', 'risk rules', 'unit economics'] },
  { agent: 'ORACLE', room: 'observatory-lab', subjects: ['astronomy', 'research method', 'data reading'] },
  { agent: 'NEXUS', room: 'tool-foundry', subjects: ['tool use', 'agent craft', 'error recovery'] },
  { agent: 'TURTLE', room: 'co-creation-studio', subjects: ['image creation', 'prompt craft', 'design critique', 'co-creation'] },
  { agent: 'QUILL', room: 'scriptorium', subjects: ['writing', 'copy', 'SEO', 'marketing'] },
  { agent: 'PIKADON', room: 'safety-bureau', subjects: ['security', 'guardrails', 'receipts and audit'] }
]);

module.exports = { FACULTY };
