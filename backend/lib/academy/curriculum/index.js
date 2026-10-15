'use strict';
const { ENTRIES } = require('./entries');
const { RUBRICS } = require('./rubrics');
const { compileBook } = require('../press');

// Registers the seed curriculum: rubrics, benchmarks, skills, and one house course book per skill in its faculty room.
// Idempotent and non-destructive: anything that already exists (including a skill a teacher has since edited to a newer version)
// is left exactly as it is.
function seedCurriculum(academy) {
  const report = { rubrics: 0, benchmarks: 0, skills: 0, books: 0, skipped: 0 };
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
    if (academy.press) {
      const book = academy.press.publishHouse({
        agent: e.skill.teacher.id, title: e.skill.name + ': course book', kind: 'course-book',
        body: compileBook(e.skill), price_sparks: e.skill.tier === 'spark' ? 10 : 30
      });
      if (!book.ok) throw new Error('seed book ' + e.skill.id + ': ' + book.error);
      if (book.created) report.books++; else report.skipped++;
    }
  }
  return report;
}

module.exports = { ENTRIES, RUBRICS, seedCurriculum };
