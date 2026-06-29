#!/usr/bin/env node
/**
 * SHADDAI World Creation Script
 * Creates multiple themed worlds via World Labs API
 */

const http = require('http');

const API_BASE = 'http://localhost:3000/api/worlds';

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createWorlds() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  SHADDAI WORLD CREATION ENGINE                             ║');
  console.log('║  Using World Labs API + Higgs Physics + Hugging Face       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const worlds = [
    {
      name: 'SHADDAI Prime',
      prompt: 'A neon sci-fi civilization with 7 glowing agent district hubs arranged in a cosmic ring. Tron Legacy aesthetic with gold accents and cyberpunk towers.',
      style: 'shaddai'
    },
    {
      name: 'Grid City',
      prompt: 'A perfect geometric city built on data streams. Cyan neon grid lines create a perfect square layout. 7 districts positioned at cardinal and ordinal directions.',
      style: 'shaddai'
    },
    {
      name: 'Emerald Forest',
      prompt: 'A bioluminescent forest world where 7 agent trees grow together in a sacred grove. Glowing green vines and organic architecture mixed with technology.',
      style: 'shaddai'
    },
    {
      name: 'Void Harbor',
      prompt: 'A mysterious deep space station orbiting a black hole. 7 district domes connected by neon bridges. Purple and magenta accents on obsidian structures.',
      style: 'shaddai'
    },
    {
      name: 'Diamond Citadel',
      prompt: 'An ultra-advanced AI fortress made of crystalline structures. 7 faceted towers arranged in geometric harmony. White and gold neon on translucent walls.',
      style: 'shaddai'
    }
  ];

  let created = 0;
  let failed = 0;

  for (const world of worlds) {
    console.log(`\n[${created + failed + 1}/${worlds.length}] Creating "${world.name}"...`);
    console.log(`  Style: ${world.style}`);
    console.log(`  Prompt: ${world.prompt.substring(0, 60)}...`);

    try {
      const result = await makeRequest('POST', '/create', world);

      if (result.world) {
        const w = result.world;
        console.log(`  ✅ Success!`);
        console.log(`     ID: ${w.id}`);
        console.log(`     Created: ${w.created}`);
        console.log(`     Districts: ${w.districts.length}`);
        console.log(`     Terrains: ${w.terrains.length}`);
        created++;

        // Show district overview
        console.log(`     Districts:`);
        for (const district of w.districts) {
          console.log(`       • ${district.name} (${district.color}) @ [${district.position.map(p => p.toFixed(1)).join(', ')}]`);
        }
      } else if (result.error) {
        console.log(`  ⚠️  Error: ${result.error}`);
        failed++;
      } else {
        console.log(`  ⚠️  Unexpected response:`, result);
        failed++;
      }
    } catch (err) {
      console.log(`  ❌ Failed: ${err.message}`);
      failed++;
    }

    // Rate limit: wait a bit between requests
    if (created + failed < worlds.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  WORLD CREATION COMPLETE                                   ║`);
  console.log(`║  Created: ${String(created).padStart(2)} | Failed: ${String(failed).padStart(2)} | Total: ${worlds.length}                          ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  // List all worlds
  console.log('📋 All Created Worlds:\n');
  try {
    const listResult = await makeRequest('GET', '/');
    if (listResult.worlds && listResult.worlds.length > 0) {
      for (const w of listResult.worlds) {
        console.log(`  • ${w.name}`);
        console.log(`    ID: ${w.id}`);
        console.log(`    Created: ${w.created}`);
        console.log(`    Districts: ${w.districts} | Entities: ${w.entities}`);
      }
    } else {
      console.log('  (No worlds created yet)');
    }
  } catch (err) {
    console.log(`  Failed to fetch worlds: ${err.message}`);
  }

  console.log('\n✨ World generation complete! Worlds are ready for exploration.\n');

  process.exit(created > 0 ? 0 : 1);
}

// Wait for server to be ready
setTimeout(() => {
  createWorlds().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}, 3000);
