/* ══════════════════════════════════════════════════════════════════
   tool-audit.js — the BUILD→AUDIT loop's audit step.
   Executes every registered tool with realistic sample args, classifies
   the result (REAL / NEEDS-KEY / ERROR / EMPTY), and reports per-agent
   counts vs the 250 target. LLM + mutating tools are counted but not
   auto-executed. Usage: node backend/scripts/tool-audit.js [--fails]
   ══════════════════════════════════════════════════════════════════ */
const { TOOLS } = require('../agent-engine.js');

const AGENTS = ['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];
const TARGET = 250;
const SHOW_FAILS = process.argv.includes('--fails');

// LLM-backed tools — real but slow/costly; count, don't auto-run.
const LLM = new Set('write_thread write_blog_post blog_outline seo_keywords meta_description generate_hooks ad_copy cold_email rewrite_tone summarize_text product_description landing_headline cta_variants hashtag_suggest content_calendar tweet_variations youtube_title video_script press_release faq_generate email_subject_lines slogan_generate elevator_pitch brand_name_ideas linkedin_post reddit_post newsletter_intro value_prop name_the_tone logo_brief ui_copy image_prompt moodboard design_critique'.split(' '));
const MUTATING = /(post_|send_|tweet|publish|mint|deploy|shorten|buy|sell|swap|execute_trade|transfer|generate_image|make_music|write_file|save_memory|save_to_inbox|complete_job|bid_on|schedule_task|delegate|set_agent|create_)/i;

const SAFE = {
  text: 'The quick brown fox jumps over the lazy dog. It was a great and wonderful day.',
  message: 'hello world', content: 'hello world', input: 'hello world', word: 'serendipity',
  topic: 'AI agents', subject: 'AI agents', niche: 'AI tools', theme: 'productivity', concept: 'a coffee app',
  query: 'bitcoin', q: 'bitcoin', url: 'https://github.com', address: 'GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ',
  numbers: '4,8,15,16,23,42', list: 'apple,banana,apple,cherry,banana', json: '{"a":{"b":1},"c":2}',
  hex: '#ff6b35', color: '#00e5a0', ids: 'SOL', symbol: 'AAPL', coin: 'bitcoin', name: 'alex',
  password: 'Tr0ub4dor&3xample', pattern: '\\w+', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  host: 'github.com', domain: 'example.com', ip: '8.8.8.8', csv: 'name,age\nAlice,30\nBob,25',
};
const SAMPLES = {
  rgb_to_hex: { r: 255, g: 107, b: 53 }, blend_colors: { a: '#ff0000', b: '#00ff00' }, contrast_check: { fg: '#ffffff', bg: '#0a0a14' },
  gradient_css: { colors: '#ff6b35,#7c3aed' }, favicon_svg: { initials: 'SH' }, duotone_palette: { hue: 210 },
  aspect_ratio: { width: 1920, ratio: '16:9' }, golden_ratio: { total: 1000 }, px_to_rem: { px: 24 }, rem_to_px: { rem: 1.5 },
  type_scale: { base: 16, ratio: 1.25 }, clamp_css: { min: 16, max: 32 }, keyframes_css: { name: 'pulse' }, flexbox_css: { intent: 'center' },
  semver_compare: { a: '1.2.3', b: '1.3.0' }, semver_bump: { version: '1.2.3', level: 'minor' }, correlation: { a: '1,2,3,4', b: '2,4,6,8' },
  gcd_lcm: { a: 12, b: 18 }, list_diff: { a: 'a,b,c', b: 'b,c' }, list_intersect: { a: 'a,b,c', b: 'b,c' },
  anagram_check: { a: 'listen', b: 'silent' }, levenshtein: { a: 'kitten', b: 'sitting' }, string_similarity: { a: 'hello', b: 'hallo' },
  weighted_average: { values: '1,2,3', weights: '1,2,3' }, hypotenuse: { a: 3, b: 4 }, power: { base: 2, exponent: 8 },
  permutations: { n: 5, r: 2 }, combinations: { n: 5, r: 2 }, quadratic: { a: 1, b: -3, c: 2 }, nth_root: { n: 27, root: 3 }, log: { n: 100, base: 10 },
  sol_token_supply: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }, jupiter_quote: { outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount: 1000000000 },
  magiceden_floor: { symbol: 'mad_lads' }, dns_lookup: { host: 'google.com', type: 'MX' }, tcp_port_check: { host: 'github.com', port: 443 },
  jwt_decode: { token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.x' }, jwt_sign: { payload: '{"a":1}', secret: 'k' }, jwt_verify: { token: 'eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.x', secret: 'k' },
  hmac_sign: { message: 'hi', secret: 'k' }, card_type: { number: '4111111111111111' }, luhn_check: { number: '4111111111111111' },
  validate_ipv4: { ip: '8.8.8.8' }, cidr_info: { cidr: '192.168.1.0/24' }, validate_email: { email: 'a@b.com' }, totp_code: { secret_hex: 'deadbeef' },
  parse_csp: { csp: "default-src 'self'; script-src 'self'" }, parse_cookie_flags: { cookie: 'id=1; Secure; HttpOnly' }, parse_spf: { spf: 'v=spf1 include:_spf.google.com ~all' },
  constant_time_equal: { a: 'x', b: 'x' }, defang_url: { url: 'http://evil.com' }, refang_url: { url: 'hxxp://evil[.]com' },
  forex_rate: { from: 'USD', to: 'EUR' }, forex_convert: { amount: 100, from: 'USD', to: 'EUR' }, forex_historical: { date: '2026-01-02', from: 'USD', to: 'EUR' },
  stock_quote: { symbol: 'AAPL' }, stock_history: { symbol: 'AAPL' }, crypto_price_history: { coin: 'bitcoin', days: 7 },
  public_holidays: { country: 'US', year: 2026 }, food_product: { barcode: '737628064502' }, universities: { country: 'Canada' },
  weather_forecast: { latitude: 40.7, longitude: -74 }, on_this_day: { month: 7, day: 14 }, number_fact: { number: 42 },
  csv_column: { csv: 'name,age\nAlice,30\nBob,25', column: 'age' }, csv_stats: { csv: 'x,y\n1,2\n3,4', column: 'x' },
  json_path: { json: '{"a":{"b":1}}', path: 'a.b' }, group_count: { json: '[{"x":1},{"x":1},{"x":2}]', key: 'x' },
  count_matches: { text: 'a1 b2 c3', pattern: '\\d' }, count_occurrences: { text: 'aXaXa', substring: 'X' },
  base_convert: { number: '255', from: 10, to: 16 }, http_status: { code: 404 }, mime_type: { ext: 'png' }, bytes_human: { bytes: 123456789 },
  duration_human: { seconds: 90061 }, cron_describe: { cron: '0 9 * * 1' }, regex_extract: { text: 'a1b2c3', pattern: '\\d' }, regex_replace: { text: 'aaa', pattern: 'a', replacement: 'b' },
  query_parse: { query: 'a=1&b=2' }, query_build: { json: '{"a":1,"b":2}' }, url_parse: { url: 'https://x.com/p?q=1#h' }, markdown_table: { csv: 'a,b\n1,2' },
  env_to_json: { env: 'A=1\nB=two' }, json_to_env: { json: '{"A":1,"B":"two"}' }, wrap_text: { text: 'the quick brown fox jumps', width: 12 }, curl_build: { url: 'https://x.com' },
  uuid_validate: { uuid: '123e4567-e89b-42d3-a456-426614174000' }, escape_regex: { text: 'a.b*c' }, unicode_escape: { text: 'café' },
  compound_interest: { principal: 1000, rate: 5, years: 10 }, loan_payment: { principal: 10000, rate: 6, years: 5 }, roi: { gain: 150, cost: 100 },
  profit_margin: { revenue: 100, cost: 60 }, markup: { cost: 50, markup: 20 }, discount: { price: 100, percent: 20 }, sales_tax: { amount: 100, rate: 8 },
  break_even: { fixed: 1000, price: 20, variable: 12 }, ltv_cac: { ltv: 300, cac: 100 }, mrr_arr: { mrr: 5000 }, percentage_change: { from: 100, to: 120 }, runway: { cash: 100000, burn: 8000 },
  area_convert: { value: 1, from: 'acre', to: 'm2' }, volume_convert: { value: 1, from: 'gal', to: 'l' }, speed_convert: { value: 60, from: 'mph', to: 'kmh' },
  data_convert: { value: 1, from: 'gb', to: 'mb' }, time_convert: { value: 1, from: 'hr', to: 'min' }, angle_convert: { value: 180, from: 'deg', to: 'rad' },
  bmi: { weight_kg: 70, height_cm: 175 }, age_calculator: { birthdate: '1990-01-01' }, gpa: { grades: 'A,B+,A-' }, ordinal: { n: 21 },
  pad_string: { text: '5', length: 3, char: '0' }, repeat_text: { text: 'ab', times: 3 }, truncate_text: { text: 'a'.repeat(200), length: 50 },
  day_of_week: { date: '2026-07-14' }, add_days: { date: '2026-07-14', days: 10 }, week_number: { date: '2026-07-14' }, quarter: { date: '2026-07-14' },
  zodiac_sign: { date: '1990-07-14' }, business_days: { from: '2026-07-01', to: '2026-07-14' }, time_until: { date: '2027-01-01' }, is_leap_year: { year: 2024 },
  format_phone: { number: '5551234567' }, caesar_cipher: { text: 'abc', shift: 3 }, mask_string: { text: 'secret123', visible: 3 },
  percentile: { numbers: '1,2,3,4,5,6,7,8,9,10', p: 90 }, moving_average: { numbers: '1,2,3,4,5', window: 2 }, normalize_list: { numbers: '10,20,30' },
  circle_area: { radius: 5 }, sqrt: { n: 144 }, tailwind_scale: { base: '#00e5a0' }, gravatar_url: { email: 'a@b.com' }, json_to_csv: { json: '[{"a":1,"b":2},{"a":3,"b":4}]' },
  color_palette: { base: '#ff6b35', scheme: 'triadic' }, color_info: { color: '#ff6b35' }, hex_to_rgb: { hex: '#ff6b35' }, hex_to_hsl: { hex: '#ff6b35' }, lighten_color: { hex: '#ff6b35' }, darken_color: { hex: '#ff6b35' }, complementary_color: { hex: '#ff6b35' }, analogous_colors: { hex: '#ff6b35' }, triadic_colors: { hex: '#ff6b35' }, shadow_css: { elevation: 3 }, glassmorphism_css: {}, neon_glow_css: { color: '#00e5a0' }, text_shadow_css: { color: '#00e5a0' }, svg_circle: { color: '#00e5a0' }, svg_star: { color: '#ffd700' },
  rectangle_area: { width: 4, height: 5 }, triangle_area: { base: 6, height: 4 }, trapezoid_area: { a: 3, b: 5, height: 4 }, sphere_volume: { radius: 3 }, cylinder_volume: { radius: 2, height: 5 }, cone_volume: { radius: 2, height: 6 }, distance_2d: { x1: 0, y1: 0, x2: 3, y2: 4 }, midpoint: { x1: 0, y1: 0, x2: 4, y2: 6 }, slope: { x1: 0, y1: 0, x2: 2, y2: 4 },
  simple_interest: { principal: 1000, rate: 5, years: 3 }, future_value: { present: 1000, rate: 5, years: 10 }, present_value: { future: 2000, rate: 5, years: 10 }, rule_of_72: { rate: 8 }, savings_goal: { goal: 12000, months: 12 },
  decimal_to_binary: { n: 42 }, binary_to_decimal: { binary: '101010' }, decimal_to_hex: { n: 255 }, hex_to_decimal: { hex: 'ff' }, clamp_number: { value: 15, min: 0, max: 10 }, add_hours: { datetime: '2026-07-14T00:00:00Z', hours: 5 }, is_weekend: { date: '2026-07-18' }, magic_8ball: { question: 'will it work?' }, count_syllables: { text: 'wonderful' }, acronym: { text: 'as soon as possible' },
  chunk_list: { list: 'a,b,c,d,e', size: 2 }, range_generate: { start: 1, end: 10, step: 2 }, top_n: { list: 'a,a,b,c,c,c', n: 2 },
  temperature_convert: { value: 100, from: 'C', to: 'F' }, length_convert: { value: 1, from: 'mi', to: 'km' }, weight_convert: { value: 1, from: 'kg', to: 'lb' },
  percentage: { part: 25, whole: 200 }, tip_calculator: { bill: 80, percent: 18 }, is_prime: { n: 97 }, factorial: { n: 10 }, fibonacci: { count: 10 },
  roman_numeral: { n: 2026 }, number_to_words: { n: 1234 }, unix_to_date: { unix: 1700000000 }, days_between: { from: '2026-01-01', to: '2026-07-14' },
  dice_roll: { notation: '2d6' }, random_number: { min: 1, max: 100 }, random_pick: { list: 'a,b,c' }, shuffle_list: { list: 'a,b,c' }, median: { numbers: '3,1,2' },
};

function classify(r) {
  const s = typeof r === 'string' ? r : JSON.stringify(r || '');
  if (!s || s.length < 3) return 'EMPTY';
  try { const o = JSON.parse(s); if (o && o.error) return /key|token|auth|401|403|429|unauthorized|not configured|credential/i.test(o.error) ? 'NEEDS-KEY' : 'ERROR'; } catch (_) {}
  return 'REAL';
}

(async () => {
  const names = Object.keys(TOOLS).sort();
  const per = Object.fromEntries(AGENTS.map((a) => [a, 0]));
  const tally = { REAL: 0, 'NEEDS-KEY': 0, ERROR: 0, EMPTY: 0, LLM: 0, MUTATING: 0 };
  const fails = [];

  for (const name of names) {
    const t = TOOLS[name];
    (t.agents || []).forEach((a) => { if (per[a] != null) per[a]++; });
    if (LLM.has(name)) { tally.LLM++; continue; }
    if (MUTATING.test(name)) { tally.MUTATING++; continue; }
    const args = SAMPLES[name] || SAFE;
    let status;
    try {
      const r = await Promise.race([t.execute(args), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))]);
      status = classify(r);
    } catch (e) { status = /timeout/.test(e.message) ? 'ERROR' : 'ERROR'; }
    tally[status] = (tally[status] || 0) + 1;
    if (status === 'ERROR' || status === 'EMPTY') fails.push(name + ' → ' + status);
  }

  const exec = tally.REAL + tally['NEEDS-KEY'] + tally.ERROR + tally.EMPTY;
  console.log('\n═══════════ TOOL AUDIT ═══════════');
  console.log('Total registered tools:', names.length);
  console.log('Executed (non-LLM, non-mutating):', exec);
  console.log('  ✅ REAL       :', tally.REAL);
  console.log('  🔑 NEEDS-KEY  :', tally['NEEDS-KEY']);
  console.log('  ❌ ERROR      :', tally.ERROR);
  console.log('  ⚪ EMPTY      :', tally.EMPTY);
  console.log('  🧠 LLM (skip) :', tally.LLM);
  console.log('  ✋ MUTATING   :', tally.MUTATING);
  const realPct = exec ? Math.round(tally.REAL / exec * 100) : 0;
  console.log('REAL rate (of executed):', realPct + '%');
  console.log('\n─────── per-agent (target ' + TARGET + ') ───────');
  Object.entries(per).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k.padEnd(9), String(v).padStart(3), v >= TARGET ? '✅' : '(+' + (TARGET - v) + ')'));
  const done = Object.values(per).filter((v) => v >= TARGET).length;
  console.log('\nAgents at 250+:', done + '/7');
  if (SHOW_FAILS && fails.length) { console.log('\n─────── FAILS (' + fails.length + ') ───────'); fails.forEach((f) => console.log('  ' + f)); }
  else if (fails.length) console.log('(' + fails.length + ' non-REAL executed tools — run with --fails to list)');
})();
