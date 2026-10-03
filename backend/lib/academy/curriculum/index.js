'use strict';
const { ENTRIES } = require('./entries');
const { RUBRICS } = require('./rubrics');

// Registers the seed curriculum. Idempotent and non-destructive: anything that already exists (including a skill a teacher has
// since edited to a newer version) is left exactly as it is.
function seedCurriculum(academy) {
  const report = { rubrics: 0, benchmarks: 0, skills: 0, skipped: 0 };
  for (const r of RUBRICS) {
    if (academy.benchmarks.rubric(r.id)) { report.skipped++; continue; }
    const out = academy.benchmarks.registerRubric(r);
    if (!out.ok) throw new Error('seed rubric ' + r.id + ': ' + JSON.stringify(out.errors));
    report.rubrics++;
  }
  for (const e of ENTRIES) {
    if (academy.benchmarks.get(e.bench.id, e.bench.version)) report.skipped++;
    else {
      const out = academy.benchmarks.register(e.bench);
      if (!out.ok) throw new Error('seed benchmark ' + e.bench.id + ': ' + JSON.stringify(out.errors));
      report.benchmarks++;
    }
    if (academy.registry.get(e.skill.id)) report.skipped++;
    else {
      const out = academy.registry.publish(e.skill);
      if (!out.ok) throw new Error('seed skill ' + e.skill.id + ': ' + JSON.stringify(out.errors));
      report.skills++;
    }
  }
  return report;
}

module.exports = { ENTRIES, RUBRICS, seedCurriculum };
