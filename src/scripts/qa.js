// 앱 자동 점검 (올리기 전에 반드시). 사용자가 직접 찾아내던 종류의 문제를 기계가 먼저 잡는다.
//   node scripts/qa.js            -> 문제가 있으면 목록을 찍고 종료 코드 1 (publish_app.sh가 올리지 않음)
//   node scripts/qa.js --all      -> 바뀐 것과 상관없이 전부
// 바뀐 곳만 (2026-11-21 사용자: "모든 탭 확인하는 게 뭔 소리여, 업뎃한 쪽만 보는 식으로"): 지난번 통과 때 파일 지문(data/qa_base.json)과
// 비교해 바뀐 조각·데이터가 쓰이는 탭과 검사 묶음만 돌린다. 공통 조각(스타일·핵심 스크립트·셸)이나 qa.js 자체가 바뀌면 전부.
// 검사 묶음은 동시에 3개씩 돌린다.
// 무엇을 보나
//  1. 모든 탭 × 폭 360·412: 페이지 오류, 화면보다 넓어짐(가로 밀림), 깨진 이미지, hidden인데 보이는 요소
//  2. 탭마다 '내용이 실제로 있는지' (조합표 칸에 템 그림, 덱 줄 수, 증강 카드 수 ...): 비어도 오류가 안 나는 고장을 잡는다
//  3. 기능 동작: TFT 아카데미 전환·상세, 재료 → 덱 계산, 조합표 칸 누르기, 아이템 새로고침·랭킹 새로고침 버튼(앱 모드)
//  4. 데이터 신선도: 덱·아이템·TFT 아카데미·DB 48시간, 월즈 3주 안이면 명단 48시간
// 지난 실수 목록: guide/kb/corrections.md (각 항목이 여기 검사 하나씩)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http');
const SITE = path.join(__dirname, '..', 'site');
const fails = [], notes = [];
const fail = (m) => fails.push(m);
// 새 세트 첫 2주 (data/patch_state.json set_started, check_patch.py가 적음): 판·랭킹·덱파워·아카데미 티어표가 아직 없을 수 있어
// 그 데이터가 있어야 하는 검사는 실패 대신 참고로 (화면 밀림·오류 검사는 그대로). 세트 19 대비, 2026-11-16
const FRESH = (() => { try { const st = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'patch_state.json'), 'utf8')); return st.set_started && (Date.now() - Date.parse(st.set_started)) / 864e5 < 14; } catch (e) { return false; } })() || process.env.QA_FRESH === '1';
const soft = (m) => FRESH ? notes.push('새 시즌 초기라 참고: ' + m) : fail(m);
// 외부 자료 받기는 기다리지 않는 방식으로 (동기 curl은 qa 전체를 멈춰 동시에 도는 다른 검사의 1초 간격 측정이 밀린다, 2026-11-21)
const execA = (cmd, opt) => new Promise((res, rej) => cp.exec(cmd, Object.assign({ encoding: 'buffer', maxBuffer: 1 << 28 }, opt), (e, out) => e ? rej(e) : res(out)));
const FAST = process.argv.includes('--fast') || process.env.QA_FAST === '1';
const proxyCache = new Map();
const proxyGet = (targetUrl) => {
  if (FAST) return Promise.resolve(Buffer.from('{}'));
  const noCache = /dcinside|summoner-sync|comps_stats|items_stats/.test(targetUrl);
  if (!noCache && proxyCache.has(targetUrl)) return proxyCache.get(targetUrl);
  const p = execA('curl -s --compressed -H "User-Agent: Mozilla/5.0" -H "Origin: https://www.metatft.com" ' + JSON.stringify(targetUrl), { maxBuffer: 1 << 28, timeout: 60000 }).catch(() => Buffer.alloc(0));
  if (!noCache) proxyCache.set(targetUrl, p);
  return p;
};

// ---- 검사 범위: 지난번 통과 때와 비교해 바뀐 파일 -> 탭 (2026-11-21)
const crypto = require('crypto');
const BASE = path.join(__dirname, '..', 'data', 'qa_base.json');
// 모든 탭에 걸리는 조각: 바뀌면 전부
const CORE = ['000_head.html', '010_base.css', '013_theme_v2.css', '020_shell.html', '200_script_open.html', '300_core.js', '399_v2_hub.js', '400_app.js', '900_script_close.html'];
const CSS_TAGS = {
  '011_decks.css': ['meta', 'units', 'tfa', 'parts', 'builder', 'items', 'augments', 'traits', 'emb', 'home', 'overlay'],
  '012_rank_esports.css': ['rank', 'friends', 'power', 'esports', 'home'],
  '014_desktop.css': ['web'],
};
const JS_TAGS = {
  '310_parts.js': ['parts'], '320_tfa.js': ['tfa'], '330_meta_items.js': ['meta', 'items', 'home', 'overlay'],
  '335_units.js': ['units', 's19', 'meta', 'find'],
  '340_emb_builder_lists.js': ['emb', 'builder', 'traits', 'find', 'flow', 'wisps', 'numbers', 'scout', 'patch', 'augments'],
  '350_rank.js': ['rank', 'friends'], '360_power.js': ['power', 'rank'], '370_profile.js': ['rank', 'friends'], '380_friends.js': ['friends'],
  '390_esports.js': ['esports', 'home'], '395_dc.js': ['dc'], '397_whatsnew.js': ['whatsnew'], '398_s19.js': ['s19', 'home', 'units'],
};
const DATA_TAGS = {
  'meta.json': ['meta', 'home', 'parts', 'emb', 'overlay', 'units'], 'guides.json': ['meta', 'home', 'parts', 'emb'], 'tfa.json': ['tfa', 'augments'],
  'items.json': ['items'], 'db.json': ['find', 'builder', 'items', 'traits', 'meta', 'rank', 'augments', 'units', 's19'], 'esports.json': ['esports', 'home'],
  'friends.json': ['friends'], 'rank.json': ['rank'], 'rank_hist.json': ['rank'], 'dist.json': ['rank'], 'cutoffs.json': ['rank'],
  'power.json': ['power', 'rank', 'friends'], 'power_top.json': ['power'], 'power_s19.json': ['power', 'rank'], 'power_top_s19.json': ['power'], 's19.json': ['s19', 'home', 'units'], 'oldsets.json': ['rank'],
  'changes.json': ['whatsnew'], 'version.json': ['whatsnew', 'more'],
};
const SCOPE = (() => {
  const now = {};
  for (const f of fs.readdirSync(path.join(SITE, 'src'))) if (!f.startsWith('.')) now['src/' + f] = path.join(SITE, 'src', f);
  for (const f of fs.readdirSync(SITE)) if (f.endsWith('.json')) now[f] = path.join(SITE, f);
  now['qa.js'] = __filename;
  for (const k of Object.keys(now)) now[k] = crypto.createHash('sha1').update(fs.readFileSync(now[k])).digest('hex').slice(0, 12);
  let base = null; try { base = JSON.parse(fs.readFileSync(BASE, 'utf8')); } catch (e) {}
  let all = !base || process.argv.includes('--all') || process.env.QA_ALL === '1';
  let webAll = false;
  const tags = new Set(), changed = Object.keys(now).filter(k => !base || base[k] !== now[k]);
  for (const k of changed) {
    const f = k.replace(/^src\//, ''), m = /^\d{3}_(\w+)\.html$/.exec(f);
    if (k === 'qa.js' || CORE.includes(f)) all = true;
    else if (k.startsWith('src/') && m) tags.add(m[1]);
    else if (k.startsWith('src/') && CSS_TAGS[f]) {
      CSS_TAGS[f].forEach(t => tags.add(t));
      if (f === '014_desktop.css') webAll = true;
    }
    else if (JS_TAGS[f] || DATA_TAGS[f]) (k.startsWith('src/') ? JS_TAGS[f] : DATA_TAGS[f]).forEach(t => tags.add(t));
    else all = true;  // 모르는 파일이면 안전하게 전부
  }
  return { all, webAll, tags, now, changed };
})();
const need = (t) => SCOPE.all || SCOPE.tags.has(t);
const needWeb = (t) => SCOPE.all || SCOPE.webAll || SCOPE.tags.has(t);
const saveBase = () => { if (FAST) return; try { fs.writeFileSync(BASE, JSON.stringify(SCOPE.now, null, 0)); } catch (e) {} };
const T0 = Date.now();

// 띄어쓰기 없는 짧은 글(S18, 21.2%, 하이퍼팝 등)이 두 줄로 꺾이면 실패 (2026-11-22 사용자 폰 스크린샷: 전적 시즌 배지 'S1 / 8').
// root 안 보이는 요소 중 자기 글이 공백 없이 2~12자인데 높이가 줄 높이의 1.6배를 넘는 것. 반환: ['클래스:글', ...]
const WRAP_FN = `(root) => { const out = []; (root || document).querySelectorAll('*').forEach(e => {
  if (!e.offsetParent || e.closest('svg, input, textarea, select, .sr-title, [aria-hidden=true]') || e.children.length) return;
  const tn = [...e.childNodes].filter(n => n.nodeType === 3), t = tn.map(n => n.textContent).join('').trim();
  if (t.length < 2 || t.length > 12 || /\\s/.test(t)) return;
  // 글자가 실제로 그려진 줄 수: 글 조각의 줄마다 사각형이 하나씩 (높이·여백과 무관)
  const tops = new Set(); tn.forEach(n => { const r = document.createRange(); r.selectNodeContents(n); [...r.getClientRects()].forEach(c => { if (c.width > 0.5) tops.add(Math.round(c.top)); }); });
  if (tops.size > 1) out.push((String(e.className || e.tagName).split(' ')[0]) + ':' + t);
}); return out; }`;
function fresh(file, key, hours) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(SITE, file), 'utf8'));
    const t = Date.parse(String(d[key]).length <= 10 ? d[key] + 'T00:00:00Z' : d[key]);
    const h = (Date.now() - t) / 36e5;
    if (!(h < hours)) fail(`${file} 데이터가 ${Math.round(h)}시간 묵음 (기준 ${hours}시간)`);
    return d;
  } catch (e) { fail(`${file} 못 읽음: ${e.message}`); return null; }
}

(async () => {
  // ---- 4. 데이터 신선도
  // 덱 배치판 유닛 이름이 영어로 남으면 그림 없이 'Lillia'처럼 보인다 (2026-11-21 사용자 스크린샷: PBE 판의 지난 세트 이름표 DA_18_*)
  { const m = JSON.parse(fs.readFileSync(path.join(SITE, 'meta.json'), 'utf8')), bad = new Set();
    for (const d of m.decks || []) { for (const b of [d.board || [], ...Object.values(d.lvb || {})]) for (const u of b) if (/^[\x00-\x7f]+$/.test(u.u)) bad.add(u.u); }
    if (bad.size) fail('덱 자료: 한국어로 안 바뀐 유닛 이름 ' + [...bad].slice(0, 6).join(', ')); }
  // 추천 덱이 같은 덱의 '잡다한 묶음'에 연결되면 같은 덱이 S·C로 갈려 보인다 (2026-11-21 사용자: 고밸류 제리 C 5.69 vs 신속타격대 제리 S 3.98).
  // 추천 덱이 붙은 묶음은 같은 이름의 덱 목록에 있어야 한다 (build_meta가 잡다한 묶음을 빼므로 목록에 없으면 잘못 연결된 것)
  { const m = JSON.parse(fs.readFileSync(path.join(SITE, 'meta.json'), 'utf8')), g = JSON.parse(fs.readFileSync(path.join(SITE, 'guides.json'), 'utf8')), ids = new Set((m.decks || []).map(d => String(d.id)));
    const orphan = (g.decks || []).filter(x => x.cluster && !ids.has(String(x.cluster))).map(x => x.name);
    if (m.pbe && orphan.length) fail('추천 덱: 덱 목록에 없는 묶음(잡다한 묶음일 수 있음)에 연결됨 ' + orphan.slice(0, 4).join(', ')); }
  // PBE 추천 증강: 시너지로 채운 증강은 덱마다 거의 같아 넣지 않는다 (2026-11-21 사용자: "추천 증강 다 똑같다, 정보 없으면 지워라")
  { const m = JSON.parse(fs.readFileSync(path.join(SITE, 'meta.json'), 'utf8'));
    if (m.pbe && (m.decks || []).some(d => d.augs && d.augsrc !== 'pro')) fail('덱 자료: PBE인데 근거 없는(시너지로 채운) 추천 증강이 들어 있음'); }
  // 월즈 진출자 명단에 같은 이름이 두 번 들어가면 안 됨 (2026-11-15: Liquipedia가 CSFX를 CangShan으로 바꿔 두 번 들어가고 HangHang이 빠졌음)
  { const c = (JSON.parse(fs.readFileSync(path.join(SITE, 'esports.json'), 'utf8')).crown || {}).players || [], seen = {};
    c.forEach(p => { const k = p.n.toLowerCase(); if (seen[k]) fail('이스포츠: 월즈 진출자 명단에 ' + p.n + '가 두 번 들어감'); seen[k] = 1; }); }
  // 역대 월즈에 아직 안 끝난 월즈가 들어가면 안 됨 (2026-11-14: 진행 중 상금표의 33위가 '우승'으로 나왔었음)
  { const e = JSON.parse(fs.readFileSync(path.join(SITE, 'esports.json'), 'utf8')), t = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
    (e.worlds || []).filter(w => w.top && w.top.length && (w.end || '9999') >= t).forEach(w => fail(`이스포츠: 역대 월즈에 안 끝난 S${w.set}가 들어감 (우승 ${w.top[0][0]})`)); }
  fresh('meta.json', 'updated', 48); fresh('items.json', 'updated', 48); fresh('tfa.json', 'updated', 48); fresh('db.json', 'updated', 48);
  const esp = fresh('esports.json', 'updated', 30 * 24);
  if (esp && esp.crown && esp.crown.start) {
    const days = (Date.parse(esp.crown.start) - Date.now()) / 864e5;
    if (days >= 0 && days <= 21 && (Date.now() - Date.parse(esp.crown.updated)) / 36e5 > 48) fail(`월즈 ${Math.round(days)}일 전인데 진출자 명단이 ${esp.crown.updated} 그대로`);
  }
  try { const h = JSON.parse(fs.readFileSync(path.join(SITE, 'rank_hist.json'), 'utf8')); const dd = (Date.now() - Date.parse(h.date + 'T12:00:00+09:00')) / 864e5; if (dd < 3 || dd > 10) notes.push('랭킹 변동 기준일이 ' + Math.round(dd) + '일 전 (' + h.date + ')'); } catch (e) { fail('rank_hist.json 못 읽음'); }
  try { const r = JSON.parse(fs.readFileSync(path.join(SITE, 'icons', 'radiant.json'), 'utf8')); if (Object.keys(r).length < 30) fail('찬란한 템 원본 그림이 ' + Object.keys(r).length + '개뿐'); } catch (e) { fail('icons/radiant.json 없음 (찬란한 템 원본 그림)'); }
  try { cp.execSync('python3 ' + JSON.stringify(path.join(__dirname, 'lint_page.py')), { stdio: 'pipe' }); } catch (e) { fail('lint_page: ' + String(e.stdout)); }
  // CSS 미정의 변수 검사 (2026-11-20: var(--text) 5곳 오타가 숨어 있었음): CSS 조각 전체를 합쳐 폴백 없는 미정의 var(--*) 잡기
  {
    const srcDir = path.join(SITE, 'src');
    const css = fs.readdirSync(srcDir).filter(f => f.endsWith('.css')).sort().map(f => fs.readFileSync(path.join(srcDir, f), 'utf8')).join('\n');
    const jsAll = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(srcDir, f), 'utf8')).join('\n');
    const defined = new Set([...css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map(m => m[1]));
    for (const m of jsAll.matchAll(/setProperty\(\s*['"](--[a-zA-Z0-9_-]+)['"]/g)) defined.add(m[1]);
    const badVars = new Set();
    for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)(\s*,[^)]+)?\)/g)) {
      if (!defined.has(m[1]) && !m[2]) badVars.add(m[1]);
    }
    if (badVars.size) fail('CSS 미정의 변수: ' + [...badVars].join(', '));
  }

  const b = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const tasks = []; const task = (tags, fn) => { if (tags.some(need)) tasks.push(fn); };
  const TABS = ['home', 's19', 'meta', 'units', 'tfa', 'dc', 'rank', 'augments', 'items', 'more', 'traits', 'find', 'builder', 'esports', 'friends', 'power', 'parts', 'emb', 'flow', 'wisps', 'numbers', 'scout', 'patch'];
  for (const [W, scheme] of [[360, 'dark'], [412, 'light']]) task(TABS, async () => {
    const pg = await b.newPage({ viewport: { width: W, height: 860 }, colorScheme: scheme, reducedMotion: 'reduce' });  // 탭 들어올 때 움직임(v2in)이 끝나기 전에 재면 여백이 5px 커 보임
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    await pg.route('https://lolche.local/**', async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/proxy') { const body = await proxyGet(u.searchParams.get('u') || ''); return r.fulfill({ status: 200, contentType: 'application/json', body }); }
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      const f = path.join(SITE, decodeURIComponent(u.pathname)); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ body: fs.readFileSync(f) });
    });
    await pg.goto('https://lolche.local/index.html'); await pg.waitForTimeout(FAST ? 1200 : 3500);
    const go = (t) => pg.evaluate((t) => { const a = document.createElement('a'); a.href = '#' + t; document.body.appendChild(a); a.click(); a.remove(); window.scrollTo(0, 0); }, t);
    const tag = `[${W}/${scheme}]`;
    // ---- 1. 모든 탭 공통
    for (const t of TABS.filter(need)) {
      errs.length = 0;
      await go(t); await pg.waitForTimeout(FAST ? 300 : (['rank', 'friends', 'esports', 'power'].includes(t) ? 3500 : 1000));
      const r = await pg.evaluate((W) => {
        const sec = document.querySelector('section:not([hidden])'), o = { sw: document.documentElement.scrollWidth, broken: [], hid: [], text: sec ? sec.innerText.length : 0 };
        if (!sec) return o;
        // 화면에 undefined·NaN 글자 금지 (v3.0.0: PBE 가이드 시너지 형식이 달라 메타 덱 줄에 'undefined'가 떴음)
        o.bad = (sec.innerText.match(/\bundefined\b|\bNaN\b/g) || []).length;
        sec.querySelectorAll('*').forEach(e => { if (e.hasAttribute('hidden') && getComputedStyle(e).display !== 'none') o.hid.push(e.id || e.className); });
        sec.querySelectorAll('img').forEach(i => { if (i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width) o.broken.push(i.getAttribute('src')); });
        // 화면 맨 위 여백: 첫 내용이 앱 바 아래 14px에서 시작 (탭마다 10~38px로 달랐음, 2026-11-13)
        const bar = document.getElementById('appbar').getBoundingClientRect().bottom;
        const first = [...sec.children].find(c => !c.classList.contains('sr-title') && c.getBoundingClientRect().height > 0);
        if (first) o.gap = Math.round(first.getBoundingClientRect().top - bar);
        return o;
      }, W);
      if (r.gap != null && Math.abs(r.gap - 14) > 1) fail(`${tag} ${t}: 맨 위 여백이 ${r.gap}px (14px이어야 함)`);
      if (r.sw > W) fail(`${tag} ${t}: 화면보다 넓음 ${r.sw}px (가로 밀림)`);
      if (r.broken.length) fail(`${tag} ${t}: 깨진 이미지 ${[...new Set(r.broken)].slice(0, 3).join(', ')}`);
      if (r.hid.length) fail(`${tag} ${t}: 숨겼는데 보임 ${r.hid.slice(0, 3).join(', ')}`);
      { const wr = await pg.evaluate(new Function('return ' + WRAP_FN)()); if (wr.length) fail(`${tag} ${t}: 짧은 글이 두 줄로 꺾임 ${[...new Set(wr)].slice(0, 4).join(', ')}`); }
      if (r.bad) fail(`${tag} ${t}: 화면에 undefined·NaN 글자 ${r.bad}개`);
      // 세트가 바뀌어 지난 세트 공략(data-set)을 숨긴 탭은 '준비 중' 한 줄: 실패 대신 참고로 남겨 새 시즌 글을 쓰게 (세트 19 대비)
      if (r.text < 40 && await pg.evaluate((t) => /새 시즌 내용은 준비 중/.test((document.getElementById(t) || {}).textContent || ''), t)) notes.push(`${tag} ${t}: 새 시즌 공략을 아직 안 씀 (지난 세트 글 숨김)`);
      else if (r.text < 40 && !(FAST && ['dc', 'friends', 'rank'].includes(t))) fail(`${tag} ${t}: 내용이 거의 없음 (${r.text}자)`);
      if (errs.length) fail(`${tag} ${t}: 페이지 오류 ${errs.slice(0, 2).join(' ; ')}`);
    }
    if (W !== 360) { await pg.close(); return; }  // 내용·기능 검사는 한 번만
    // ---- 2·3. 탭별 내용과 기능
    // 버튼이 없어서 누르기가 실패해도 멈추지 말고 실패로 적고 계속 (있어야 할 버튼이 없는 것도 고장)
    const q = async (fn, arg) => { try { return await pg.evaluate(fn, arg); } catch (e) { fail('동작 실패: ' + String(e.message).split('\n')[0].slice(0, 120)); return null; } };
    if (['home', 'more'].some(need)) {
    // v2.0.0 홈 허브 + 통합 스포트라이트 검색 + 5탭(홈·19시즌·덱·전적·더보기)
    await go('home'); await pg.waitForTimeout(800);
    if (await q(() => document.querySelectorAll('#hm-s19-kpi .hm-k').length) !== 4) fail('홈: 19시즌 KPI 4칸이 안 보임');
    if (await q(() => document.querySelectorAll('#hm-decks .mt-row.dk').length) < 3) fail('홈: 18시즌 상위 덱 카드가 안 보임');
    {
      const navs = await q(() => [...document.querySelectorAll('.bnav a')].map(a => a.dataset.nav));
      if (!navs || navs.join(',') !== 'home,decks,dex,rank,more') fail('아래 메뉴: v3.0 5탭(home,decks,dex,rank,more)이 아님 (' + (navs || []).join(',') + ')');
      // 통합 스포트라이트 검색 (초성 포함)
      await q(() => document.getElementById('spot-btn').click()); await pg.waitForTimeout(300);
      await q(() => { const i = document.getElementById('spot-q'); i.value = 'ㅌㅁ'; i.dispatchEvent(new Event('input')); }); await pg.waitForTimeout(300);
      if (await q(() => document.querySelectorAll('#spot-res .spot-row').length) < 2) fail('통합 검색: 초성("ㅌㅁ") 검색 결과가 안 나옴');
      await q(() => document.getElementById('spot-x').click()); await pg.waitForTimeout(300);
      if (await q(() => !document.getElementById('spot-ov').hidden)) fail('통합 검색: 닫기 버튼으로 안 닫힘');
      // 테마 전환 확인
      await go('more'); await pg.waitForTimeout(300);
      await q(() => document.querySelector('#theme-seg [data-th=light]').click()); await pg.waitForTimeout(150);
      if (await q(() => document.documentElement.getAttribute('data-theme')) !== 'light') fail('테마 전환: 라이트 모드 미반영');
      await q(() => document.querySelector('#theme-seg [data-th=auto]').click()); await pg.waitForTimeout(150);
    }
    }
    if (['meta', 'tfa'].some(need)) {
    await go('meta'); await pg.waitForTimeout(800);
    if (await q(() => !!document.getElementById('mt-src'))) fail('덱 탭: 추천 덱/전체 통계 분리 토글(#mt-src)이 남아 있음');
    {
      const n = await q(() => [...document.querySelectorAll('#mt-rows .mt-row')].filter(x => x.offsetParent).length);
      if (n < 15) fail(`덱 탭: 덱 줄 ${n}개`);
      const bad = await q(() => [...document.querySelectorAll('#meta .mt-row.dk')].filter(x => x.offsetParent && !x.querySelector('.dk-hex img')).length);
      if (bad) fail(`덱 탭: 메인 캐리 그림 없는 줄 ${bad}개`);
      // MetaTFT 그대로 (2026-11-22 사용자: "왜 평균을 내냐, MetaTFT 그대로"): MetaTFT 묶음 하나 = 줄 하나, 비슷한 묶음을 합치지 않는다. 가이드 연결 덱엔 '가이드' 표시
      const mtFilterAll = await q(() => (document.querySelector('#mt-filter button.on') || {}).dataset?.f === 'all' && !document.getElementById('mt-q').value);
      const M = JSON.parse(fs.readFileSync(path.join(SITE, 'meta.json'), 'utf8'));
      const G = JSON.parse(fs.readFileSync(path.join(SITE, 'guides.json'), 'utf8'));
      const byId = Object.fromEntries((M.decks || []).map(d => [String(d.id), d]));
      const gLinked = new Set((G.decks || []).map(g => g.cluster && String(g.cluster)).filter(Boolean));
      const rows = await q(() => [...document.querySelectorAll('#mt-rows .mt-row.dk')].map(r => ({
        id: r.dataset.id || '', subs: (r.dataset.subs || '').split(',').filter(Boolean),
        gd: [...r.querySelectorAll('.gd-badge')].some(x => x.textContent.trim() === '가이드')
      })));
      const metaRows = (rows || []).filter(r => byId[r.id]);
      if (mtFilterAll && metaRows.length !== (M.decks || []).length) fail(`덱 탭: MetaTFT 덱 묶음 ${(M.decks || []).length}개인데 줄은 ${metaRows.length}개 (합치거나 빠짐)`);
      if (metaRows.some(r => r.subs.length > 1)) fail('덱 탭: 비슷한 덱 묶음을 한 줄로 합침 (MetaTFT 그대로 따로 보여야 함)');
      const badTier = (M.decks || []).filter(d => d.tier !== (d.avg < 4.25 ? 'S' : d.avg < 4.5 ? 'A' : d.avg < 4.75 ? 'B' : d.avg < 5 ? 'C' : 'D')).map(d => d.name);
      if (badTier.length) fail('덱 자료: 티어가 MetaTFT 표(S<4.25·A<4.5·B<4.75·C<5·D)와 다름 ' + badTier.slice(0, 3).join(', '));
      const missGd = metaRows.filter(r => (r.subs.length ? r.subs : [r.id]).some(id => gLinked.has(id)) && !r.gd);
      if (missGd.length) fail(`덱 탭: 가이드 연결 덱 ${missGd.length}개에 '가이드' 표시가 없음 (${missGd.slice(0, 3).map(x => x.id).join(', ')})`);
      if (!metaRows.some(r => r.gd)) fail('덱 탭: 가이드 표시(.gd-badge)가 하나도 없음');
    }
    // 덱 탭: 선택률(로비 평균 인원) + 상단 메타 줄(.dk-meta .dk-tbadge) + 2단 KPI(.dk-kpi2 평균/순방)
    await go('meta'); await pg.waitForTimeout(600);
    if (await q(() => [...document.querySelectorAll('#mt-rows .mt-row')].filter(r => /선택률 [\d.]+/.test(r.textContent)).length) < 10) fail('덱: 줄마다 "선택률"이 안 보임');
    if (await q(() => document.querySelectorAll('#mt-rows .mt-row.dk .dk-meta .dk-tbadge').length) < 10) fail('덱: 상단 메타 줄에 티어 배지(.dk-tbadge)가 안 보임');
    if (await q(() => [...document.querySelectorAll('#mt-rows .mt-row.dk .dk-kpi2')].filter(k => /승률 \d+(\.\d+)?%/.test(k.textContent)).length) < 10) fail('덱: 오른쪽 2단 KPI에 승률이 안 보임');
    // 덱 통합 서브탭(메타·아카데미·재료·상징) 및 아래 메뉴 활성 표시
    await go('tfa'); await pg.waitForTimeout(600);
    if (await q(() => document.querySelectorAll('#tfa-out .mt-row').length) < 15) soft('TFT 아카데미: 덱 줄 15개 미만');
    if (await q(() => !document.querySelector('.bnav a[data-nav=decks]').classList.contains('on'))) soft('TFT 아카데미: 아래 메뉴 덱 표시가 안 켜짐');
    await q(() => document.querySelector('#tfa-out .mt-row')?.click()); await pg.waitForTimeout(500);
    if (await q(() => document.querySelectorAll('#tfa-detail .hx[data-c]').length) < 6) soft('TFT 아카데미 상세: 배치판 유닛 6개 미만');
    await q(() => document.querySelector('#tfa-detail .back')?.click()); await pg.waitForTimeout(400);
    // 비슷한 덱 탭 (사이트 카드 안 탭, 2026-11-14 사용자: "아리 자이라 말고도 뒤에 다른 탭으로 아리 모르가나 … 반영 안 했나"): 묶인 카드가 있고, 상세에서 탭을 누르면 그 덱으로 바뀐다
    {
      const tf = JSON.parse(fs.readFileSync(path.join(SITE, 'tfa.json'), 'utf8'));
      const vars = tf.comps.filter(c => c.var), slugs = new Set(tf.comps.map(c => c.slug));
      if (!vars.length) soft('TFT 아카데미: 비슷한 덱(탭) 데이터가 없음');
      if (vars.some(c => !slugs.has(c.parent))) soft('TFT 아카데미: 붙을 카드가 없는 탭 덱이 있음');
      const n = await q(() => document.querySelectorAll('#tfa-out .mt-row.tfa-stack').length);
      if (vars.length && !n) soft('TFT 아카데미: 비슷한 덱이 묶인 카드 표시가 없음');
      if (n) {
        await q(() => document.querySelector('#tfa-out .mt-row.tfa-stack').click()); await pg.waitForTimeout(500);
        const t0 = await q(() => (document.querySelector('#tfa-detail .dk-hero h3') || {}).textContent || '');
        const tabs = await q(() => document.querySelectorAll('#tfa-detail .tfa-tab').length);
        if (tabs < 2) soft('TFT 아카데미 상세: 비슷한 덱 탭이 없음');
        await q(() => document.querySelectorAll('#tfa-detail .tfa-tab')[1].click()); await pg.waitForTimeout(500);
        const t1 = await q(() => (document.querySelector('#tfa-detail .dk-hero h3') || {}).textContent || '');
        if (!t1 || t1 === t0) soft('TFT 아카데미 상세: 탭을 눌러도 덱이 안 바뀜');
        if (await q(() => document.querySelectorAll('#tfa-detail .hx[data-c]').length) < 5) soft('TFT 아카데미 상세(탭 덱): 배치판이 비어 있음');
        // 'Flex Units'는 '유연한 교체' (2026-11-14 사용자: "고점 교체가 아니라 유연한 교체 아니냐")
        if (await q(() => /고점 교체/.test(document.getElementById('tfa-detail').textContent))) soft('TFT 아카데미 상세: 아직 "고점 교체"라고 나옴 (사이트 이름은 Flex Units = 유연한 교체)');
        await q(() => document.querySelector('#tfa-detail .back')?.click()); await pg.waitForTimeout(400);
        if (await q(() => document.getElementById('tfa-list').hidden)) soft('TFT 아카데미: 탭을 바꾼 뒤 목록으로 한 번에 안 돌아감');
      }
    }
    await go('meta'); await pg.waitForTimeout(400);
    await q(() => document.querySelector('#mt-rows .mt-row').click()); await pg.waitForTimeout(500);
    const kpi = await q(() => [...document.querySelectorAll('#mt-detail .dk-kpi > div')].map(x => x.textContent));
    if (kpi.length !== 4) notes.push('덱 상세: 숫자 칸이 4개가 아님 (통계 없는 추천 덱일 수 있음)');
    else if (!/선택률/.test(kpi[3])) fail('덱 상세: 넷째 칸이 선택률이 아님');
    if (await q(() => { const k = document.querySelector('#mt-detail .dk-kpi'); return k && k.scrollWidth > k.clientWidth + 1; })) fail('덱 상세: 숫자 칸이 화면 밖으로 넘침');
    // 숫자·이름표가 두 줄로 꺾이면 안 됨 (2026-11-21 사용자 폰 스크린샷: "21.2 / %", "에메+ 평균 / 등수")
    if (JSON.parse(fs.readFileSync(path.join(SITE, 'meta.json'), 'utf8')).pbe && await q(() => /티어별 평균|에메\+ 평균|플래\+ /.test(document.getElementById('mt-detail').innerText))) fail('덱 상세: PBE인데 티어 기준(에메+·플래+·티어별 평균)이 나옴 (PBE는 티어 구분 없음)');
    { const wrap = await q(() => [...document.querySelectorAll('#mt-detail .dk-kpi > div')].filter(x => { const b = x.querySelector('b'), sp = x.querySelector('span'); const lh = (e) => parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.3; return (b && b.getBoundingClientRect().height > lh(b) * 1.5) || (sp && sp.getBoundingClientRect().height > lh(sp) * 1.5); }).map(x => x.textContent));
      if (wrap && wrap.length) fail(`[${W}] 덱 상세: 숫자 칸 글자가 두 줄로 꺾임 (${wrap.join(' / ')})`); }
    // 해금 챔피언 자물쇠 + 누르면 해금 조건 (2026-11-21 사용자: "덱에 해금 챔 있으면 자물쇠, 누르면 해금 조건도 챔 정보에")
    if (JSON.parse(fs.readFileSync(path.join(SITE, 's19.json'), 'utf8')).units.some(u => u.unl) && JSON.parse(fs.readFileSync(path.join(SITE, 'meta.json'), 'utf8')).pbe) {
      await go('meta'); await pg.waitForTimeout(500);
      const lkRow = await q(() => [...document.querySelectorAll('#mt-rows .mt-row')].findIndex(r => r.querySelector('.lk')));
      if (lkRow < 0) fail('덱 줄: 해금 챔피언 자물쇠가 하나도 없음');
      else {
        await q((i) => document.querySelectorAll('#mt-rows .mt-row')[i].click(), lkRow); await pg.waitForTimeout(600);
        await q(() => { const c = [...document.querySelectorAll('#mt-detail .hexboard .hxwrap')].find(w => w.querySelector('.lk')); if (c) c.click(); }); await pg.waitForTimeout(600);
        const unl = await q(() => (document.querySelector('.sh-unl') || {}).innerText || '');
        if (!/해금 조건/.test(unl || '')) fail('덱 상세: 자물쇠 챔피언을 눌러도 챔피언 정보에 해금 조건이 없음');
        await q(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))); await pg.waitForTimeout(300);
        await q(() => document.querySelector('#mt-detail .back')?.click()); await pg.waitForTimeout(300);
      }
    }
    }
    if (['items'].some(need)) {
    await go('items'); await pg.waitForTimeout(600);
    if (await q(() => document.querySelectorAll('#it-rows .it-row').length) < 30) fail('아이템 티어표: 줄 30개 미만');
    const noIcon = await q(() => [...document.querySelectorAll('#it-rows .it-row')].filter(r => !r.querySelector('.it-main > img')).map(r => r.innerText.split('\n')[1]).slice(0, 5));
    if (noIcon.length) fail('아이템 티어표: 그림 없는 템 ' + noIcon.join(', '));
    for (const g of ['찬란한', '유물', '상징']) {
      await q((g) => document.querySelector('#it-grp [data-g="' + g + '"]').click(), g); await pg.waitForTimeout(300);
      const ni = await q(() => [...document.querySelectorAll('#it-rows .it-row')].filter(r => !r.querySelector('.it-main > img')).length);
      if (ni) fail(`아이템 ${g}: 그림 없는 템 ${ni}개`);
    }
    await q(() => document.querySelector('#it-seg [data-v=guide]').click()); await pg.waitForTimeout(500);
    const grid = await q(() => document.querySelectorAll('#rgrid button img').length);
    if (grid < 60) fail(`조합표: 칸 그림 ${grid}개 (64개 이상이어야)`);
    const emb = await q(() => document.querySelectorAll('#emblems img').length);
    if (emb < 16) fail(`상징 조합표: 그림 ${emb}개`);
    await q(() => document.querySelectorAll('#rgrid button')[10].click()); await pg.waitForTimeout(200);
    if (await q(() => /\?/.test(document.getElementById('picked').innerText))) fail('조합표: 칸을 누르면 결과가 "?"');
    if (await q(() => { const g = document.getElementById('rgrid'); return g.scrollWidth > g.clientWidth + 1 || g.getBoundingClientRect().right > innerWidth; })) fail('조합표: 오른쪽이 잘림');
    }
    if (['augments'].some(need)) {
    await go('augments'); await pg.waitForTimeout(500);
    if (await q(() => document.querySelectorAll('#ag-list .ag-card').length) < 80) fail('증강 탭: 카드 80개 미만');
    }
    if (['parts'].some(need)) {
    await go('parts'); await pg.waitForTimeout(500);
    await q(() => { const c = document.querySelector('#pt-tray .pt-clear'); if (c) c.click(); });
    for (const n of ['지팡이', '여눈', '장갑']) await q((n) => [...document.querySelectorAll('.pt-p')].find(x => x.textContent.startsWith(n)).click(), n);
    await pg.waitForTimeout(300);
    if (await q(() => document.querySelectorAll('#pt-out .mt-row').length) < 5) fail('재료 → 덱: 추천 덱 5개 미만');
    await q(() => document.querySelector('#pt-tray .pt-clear').click());
    }
    if (['esports'].some(need)) {
    await go('esports'); await pg.waitForTimeout(800);
    if (await q(() => /\?/.test((document.querySelector('.cr-sum') || {}).innerText || ''))) fail('이스포츠: 월즈 요약에 ?');
    }
    const _oldS18 = JSON.parse(fs.readFileSync(path.join(SITE, 'oldsets.json'), 'utf8'));
    const _s19Data = JSON.parse(fs.readFileSync(path.join(SITE, 's19.json'), 'utf8'));
    const _s18U = new Set(Object.entries(_oldS18.u || {}).filter(([k]) => /18/.test(k)).map(([, v]) => v[0]));
    const _s18T = new Set(Object.entries(_oldS18.t || {}).filter(([k]) => /18/.test(k)).map(([, v]) => v[0]));
    const S19_ONLY_U = (_s19Data.units || []).map(u => u.n).filter(n => !_s18U.has(n));
    const S19_ONLY_T = (_s19Data.traits || []).map(t => t.n).filter(n => !_s18T.has(n));
    const _isPbe = JSON.parse(fs.readFileSync(path.join(SITE, 'meta.json'), 'utf8')).pbe;
    if (!FAST && ['rank'].some(need)) {
    await go('rank'); await pg.waitForTimeout(3000);
    if (await q(() => document.querySelectorAll('#rk-rows .rk-row').length) < 30) soft('한국 랭킹: 줄 30개 미만');
    if (await q(() => document.getElementById('rk-upd-btn').hidden)) fail('한국 랭킹: 앱인데 새로고침 버튼이 숨어 있음');
    if (_isPbe) {
      const rkLeak = await q(() => ({
        locks: document.querySelectorAll('#rk-rows .rk-row .mt-strip .lk').length,
        s19img: [...document.querySelectorAll('#rk-rows .rk-row .mt-strip img')].filter(i => /icons\/s19\//.test(i.getAttribute('src') || '')).length,
      }));
      if (rkLeak && (rkLeak.locks || rkLeak.s19img)) fail(`한국 랭킹: 18시즌 본섭 캐리에 19시즌 해금 자물쇠(${rkLeak.locks})·아이콘(${rkLeak.s19img})이 섞임`);
    }
    }
    if (['power'].some(need)) {
    await go('power'); await pg.waitForTimeout(1500);
    if (await q(() => document.querySelectorAll('#pw-list .pwc').length) < 5) soft('덱파워: 카드 5개 미만');
    if (_isPbe) {
      const pwChk = await q(({ u19, t19 }) => {
        const uSet = new Set(u19), tSet = new Set(t19);
        const badU = [...document.querySelectorAll('#pw-list .mu .nm')].map(e => e.textContent.trim()).filter(n => uSet.has(n));
        const badT = [...document.querySelectorAll('#pw-list .trx')].map(e => e.dataset.trait || '').filter(n => tSet.has(n));
        const badDk = [...document.querySelectorAll('#pw-list .gm-dk b')].map(e => e.textContent.trim()).filter(tx => t19.some(t => tx.includes(t)) || u19.some(u => tx.split(/\s+/).includes(u)));
        const badCh = [...document.querySelectorAll('#pw-list .trx.s-chromatic')].map(e => [e.dataset.trait || '', (e.querySelector('b') || {}).textContent || '']).filter(x => !((x[0] === '나무정령' || x[0] === '개화') && +x[1] >= 11));
        const emptyHx = [...document.querySelectorAll('#pw-list .trx .hx2')].filter(h => !h.querySelector('img')).length;
        const s19img = [...document.querySelectorAll('#pw-list img')].filter(i => /icons\/s19\//.test(i.getAttribute('src') || '')).length;
        return { bad: [...new Set([...badU, ...badT, ...badDk])], badCh, emptyHx, s19img };
      }, { u19: S19_ONLY_U, t19: S19_ONLY_T });
      if (pwChk && (pwChk.bad.length || pwChk.s19img)) fail(`덱파워: 18시즌 보드에 19시즌 기물·시너지(${pwChk.bad.slice(0, 4).join(', ')})·아이콘(${pwChk.s19img})이 섞임`);
      if (pwChk && pwChk.badCh.length) fail(`덱파워: 프리즘이 아닌 시너지에 프리즘 색(.s-chromatic)이 붙음 (${JSON.stringify(pwChk.badCh.slice(0, 4))})`);
      if (pwChk && pwChk.emptyHx) fail(`덱파워: 18시즌 시너지 그림 빈칸 ${pwChk.emptyHx}개`);
    }
    // 19시즌 PBE 덱파워 탭 점검 (PBE 기간엔 노출, 본섭 19 전환 후 live power 활성 시 자동 숨김)
    if (_isPbe) {
      await q(() => { const b = document.querySelector('#pw-src [data-s=s19]'); if (b) b.click(); });
      await pg.waitForTimeout(800);
      const pw19 = await q(() => ({
        n: document.querySelectorAll('#pw-list .pwc').length,
        scores: [...document.querySelectorAll('#pw-list .pwc-big')].map(e => +e.textContent.trim()),
        emptyHx: [...document.querySelectorAll('#pw-list .trx .hx2')].filter(h => !h.querySelector('img')).length,
        sw: document.documentElement.scrollWidth,
      }));
      if (!pw19 || pw19.n < 5) fail('덱파워 19시즌 PBE: 카드 5개 미만');
      else {
        if (pw19.scores.some(x => isNaN(x) || x <= 0)) fail('덱파워 19시즌 PBE: 점수가 비정상');
        if (pw19.emptyHx) fail(`덱파워 19시즌 PBE: 시너지 그림 빈칸 ${pw19.emptyHx}개`);
        if (pw19.sw > W) fail(`덱파워 19시즌 PBE: 화면보다 넓음 ${pw19.sw}px (가로 밀림)`);
        const wr19 = await pg.evaluate(new Function('return ' + WRAP_FN)());
        if (wr19 && wr19.length) fail(`[${W}] 덱파워 19시즌 PBE: 짧은 글이 두 줄로 꺾임 ${[...new Set(wr19)].slice(0, 4).join(', ')}`);
      }
      await q(() => { const b = document.querySelector('#pw-src [data-s=top]'); if (b) b.click(); });
    }
    }
    if (!FAST && ['friends'].some(need)) {
    await go('friends'); await pg.waitForTimeout(6000);
    if (await q(() => document.querySelectorAll('#fr-cards .fr-card').length) < 2) soft('친구: 카드 2개 미만');
    else {
      // 티어순 기본 정렬 + 1, 2, 3... 등수 배지 확인
      const frChk = await q(() => {
        const cards = [...document.querySelectorAll('#fr-cards .fr-card')];
        const rks = cards.map(c => (c.querySelector('.fr-rk') || {}).textContent || '');
        const vals = cards.map(c => {
          const t = (c.querySelector('.tierpill b') || {}).textContent || '';
          const m = /^(챌린저|그랜드마스터|마스터|다이아몬드|에메랄드|플래티넘|골드|실버|브론즈|아이언)\s*(\d)?\s*(\d+)LP/.exec(t);
          if (!m) return -1;
          const B = { '아이언': 0, '브론즈': 400, '실버': 800, '골드': 1200, '플래티넘': 1600, '에메랄드': 2000, '다이아몬드': 2400, '마스터': 2800, '그랜드마스터': 2800, '챌린저': 2800 };
          const d = m[2] ? (4 - (+m[2])) * 100 : 0;
          return B[m[1]] + d + (+m[3]);
        });
        return { rks, vals, sw: document.documentElement.scrollWidth };
      });
      if (frChk) {
        const exp = frChk.rks.map((_, i) => String(i + 1));
        if (JSON.stringify(frChk.rks) !== JSON.stringify(exp)) fail(`친구: 등수 배지 불일치 (${frChk.rks.join(', ')})`);
        for (let i = 1; i < frChk.vals.length; i++) if (frChk.vals[i] > frChk.vals[i - 1]) fail(`친구: 티어 내림차순 정렬 깨짐 (${frChk.vals.join(' -> ')})`);
        if (frChk.sw > W) fail(`친구: 화면보다 넓음 ${frChk.sw}px (가로 밀림)`);
      }
    }
    }
    if (!FAST && need('rank')) {
    // 전적 검색 (좁은 폭에서 판 카드가 화면을 밀던 문제, 덱 이름·LP 그래프·많이 한 덱)
    await go('rank'); await pg.waitForTimeout(500);
    await q(() => { document.querySelector('#rk-seg [data-v=search]').click(); const i = document.getElementById('rk-q'); i.value = 'Synow#KR1'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
    await pg.waitForSelector('.rk-gm', { timeout: 90000 }).catch(() => soft('전적 검색: 판 카드가 안 나옴'));
    await pg.waitForTimeout(2500);
    if (await q(() => document.documentElement.scrollWidth) > W) fail('전적 검색: 화면보다 넓음 (가로 밀림)');
    if (await q(() => document.querySelectorAll('.rk-gm .gm-dk').length) < 5) soft('전적 검색: 판 덱 이름이 안 붙음');
    if (!(await q(() => !!document.querySelector('#rk-prof svg')))) soft('전적 검색: LP 그래프 없음');
    if (await q(() => document.querySelectorAll('.rk-dk').length) < 2) soft('전적 검색: 많이 한 덱 없음');
    // 덱파워 옆 확률 (2026-11-14 사용자: "표준편차 늘리고 확률도 같이 적고"): 판 카드마다 "1등 N% · 순방 N%", 0 아래 점수 없음
    const pwt = await q(() => [...document.querySelectorAll('.rk-gm .pw-p')].map(p => [p.querySelector('b').textContent, p.querySelector('small').textContent]));
    if (!pwt.length) soft('전적 검색: 판 카드에 덱파워가 없음');
    else {
      if (pwt.some(x => !/1등 (\d+%|1% 미만) · 순방 (\d+%|1% 미만)/.test(x[1]))) soft('전적 검색: 덱파워 옆에 1등·순방 확률이 없음 (' + pwt[0][1] + ')');
      if (pwt.some(x => +x[0] < 0 || isNaN(+x[0]))) fail('전적 검색: 덱파워가 음수이거나 숫자가 아님');
    }
    // 로비 8명 줄을 연 상태에서도 화면이 넓어지면 안 됨 (2026-11-14: 로비 줄 덱파워 옆 확률 글자 때문에 360 폭이 412로 넓어졌음, 사용자 "또 이런다")
    await q(() => [...document.querySelectorAll('.rk-gm button')].filter(b => /로비 8명/.test(b.textContent)).slice(0, 6).forEach(b => b.click()));
    await pg.waitForTimeout(5000);
    if (await q(() => document.querySelectorAll('.lb-row').length) < 8) notes.push('전적 검색: 로비 줄을 못 열어 넓이 검사 일부 건너뜀');
    { const sw2 = await q(() => document.documentElement.scrollWidth); if (sw2 > W) fail(`전적 검색: 로비 8명을 열면 화면보다 넓어짐 ${sw2}px (가로 밀림)`); }
    // 판 카드 머리: 덱 이름·평균 등수가 팀 코드 버튼과 겹치지 않게 (2026-11-14 사용자 스크린샷)
    const ov = await q(() => [...document.querySelectorAll('.rk-gm .gm-head')].filter(h => { const dk = h.querySelector('.gm-dk'), cb = h.querySelector('.codebtn'); if (!dk || !cb) return false; const L = cb.getBoundingClientRect().left; return [...dk.children].some(c => c.getBoundingClientRect().right > L + 1) || dk.getBoundingClientRect().right > L + 1; }).length);
    if (ov) fail(`전적 검색: 판 카드 ${ov}개에서 덱 이름·평균이 팀 코드 버튼과 겹침`);
    if (await q(() => !/S\d+/.test((document.querySelector('.rk-sb') || {}).textContent || ''))) fail('전적 검색: 시즌 배지(S18) 없음');
    { const wr = await pg.evaluate(new Function('return ' + WRAP_FN)()); if (wr && wr.length) fail(`[${W}] 전적 검색: 짧은 글이 두 줄로 꺾임 ${[...new Set(wr)].slice(0, 4).join(', ')}`); }
    // 본섭(지난 세트) 판의 시너지 그림 (2026-11-22: PBE 기간 18시즌 판 시너지가 19시즌 그림표에 없어 빈 육각형으로 나왔음)
    { const tr = await q(() => { const hx = [...document.querySelectorAll('#rk-prof .trx .hx2')]; return [hx.length, hx.filter(h => !h.querySelector('img')).length]; });
      if (tr && tr[0] && tr[1] > tr[0] * 0.05) fail(`전적 검색: 시너지 그림이 빈칸 ${tr[1]}/${tr[0]}개`); }
    // 18시즌 본섭 전적: 19시즌 전용 이름·아이콘 금지 + 비프리즘·고유 시너지에 프리즘 색 금지
    if (_isPbe) {
      const rk18 = await q(({ u19, t19 }) => {
        const uSet = new Set(u19), tSet = new Set(t19);
        const badU = [...document.querySelectorAll('#rk-prof .mu .nm, #rk-prof .pchips .u')].map(e => e.textContent.trim()).filter(n => uSet.has(n));
        const badT = [...document.querySelectorAll('#rk-prof .trx')].map(e => e.dataset.trait || '').filter(n => tSet.has(n));
        const badDk = [...document.querySelectorAll('#rk-prof .gm-dk b, #rk-prof .rk-dk b')].map(e => e.textContent.trim()).filter(tx => t19.some(t => tx.includes(t)) || u19.some(u => tx.split(/\s+/).includes(u)));
        const badCh = [...document.querySelectorAll('#rk-prof .trx.s-chromatic')].map(e => [e.dataset.trait || '', (e.querySelector('b') || {}).textContent || '']).filter(x => !((x[0] === '나무정령' || x[0] === '개화') && +x[1] >= 11));
        const s19img = [...document.querySelectorAll('#rk-prof img')].filter(i => /icons\/s19\//.test(i.getAttribute('src') || '')).length;
        return { bad: [...new Set([...badU, ...badT, ...badDk])], badCh, s19img };
      }, { u19: S19_ONLY_U, t19: S19_ONLY_T });
      if (rk18 && (rk18.bad.length || rk18.s19img)) fail(`전적 검색: 18시즌 본섭 전적에 19시즌 전용 기물·시너지(${rk18.bad.slice(0, 4).join(', ')})·아이콘(${rk18.s19img})이 섞임`);
      if (rk18 && rk18.badCh.length) fail(`전적 검색: 비프리즘·고유 시너지에 프리즘 색(.s-chromatic)이 붙음 (${JSON.stringify(rk18.badCh.slice(0, 4))})`);
    }
    // 기본 범위 50판, 등수 줄은 최근 20판까지 (2026-11-11 사용자)
    if (await q(() => ((document.querySelector('.rk-range .mt-chips button.on') || {}).textContent || '')) !== '50판') soft('전적 검색: 기본 범위가 50판이 아님');
    if (await q(() => document.querySelectorAll('.rk-sum .plstr span').length) > 20) fail('전적 검색: 등수 줄이 20판 넘게 보임');

    // PBE 19시즌 전적 검색 + 19시즌 덱파워 점검 (PBE 기간)
    if (_isPbe) {
      const pbeSample = (() => { try { const t = JSON.parse(fs.readFileSync(path.join(SITE, 'power_top_s19.json'), 'utf8')); return (t.top && t.top.all && t.top.all[0] && t.top.all[0].who) || 'TimTorte#8338'; } catch (e) { return 'TimTorte#8338'; } })();
      await q((who) => {
        const b = document.querySelector('#rk-regchips [data-reg=pbe1]'); if (b) b.click();
        const i = document.getElementById('rk-q'); i.value = who; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      }, pbeSample);
      await pg.waitForSelector('#rk-prof .rk-gm', { timeout: 60000 }).catch(() => soft('PBE 전적 검색: 판 카드가 안 나옴'));
      await pg.waitForTimeout(2500);
      const pbeChk = await q(() => ({
        sb: (document.querySelector('#rk-prof .rk-sb') || {}).textContent || '',
        gms: document.querySelectorAll('#rk-prof .rk-gm').length,
        pws: [...document.querySelectorAll('#rk-prof .rk-gm .pw-p')].map(p => [p.querySelector('b').textContent, p.querySelector('small').textContent]),
        hasLpErr: /LP 기록이/.test((document.getElementById('rk-prof') || {}).innerText || ''),
        sw: document.documentElement.scrollWidth,
      }));
      if (!pbeChk || !/PBE/.test(pbeChk.sb)) fail(`PBE 전적 검색: PBE 배지 없음 (${pbeChk && pbeChk.sb})`);
      if (!pbeChk || pbeChk.gms < 3) soft('PBE 전적 검색: 19시즌 판 카드 3개 미만');
      if (!pbeChk || !pbeChk.pws.length) fail('PBE 전적 검색: 19시즌 판 카드에 19시즌 덱파워가 없음');
      else if (pbeChk.pws.some(x => +x[0] < 0 || isNaN(+x[0]))) fail('PBE 전적 검색: 19시즌 덱파워 점수가 비정상');
      if (pbeChk && pbeChk.hasLpErr) fail('PBE 전적 검색: 일반 서버인데 랭크 LP 그래프 안내 문구가 보임');
      if (pbeChk && pbeChk.sw > W) fail(`PBE 전적 검색: 화면보다 넓음 ${pbeChk.sw}px (가로 밀림)`);
      { const wrp = await pg.evaluate(new Function('return ' + WRAP_FN)()); if (wrp && wrp.length) fail(`[${W}] PBE 전적 검색: 짧은 글이 두 줄로 꺾임 ${[...new Set(wrp)].slice(0, 4).join(', ')}`); }
      await q(() => { const b = document.querySelector('#rk-regchips [data-reg=kr]'); if (b) b.click(); });
    }
    }
    await pg.close();
  });
  // 롤체갤 실시간 (2026-11-13 사용자: "1초에 한 번씩 목록 리로딩"): 목록이 차는지, 1초마다 다시 받는지, 탭을 떠나면 멈추는지
  if (!FAST) task(['dc'], async () => {
    const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; localStorage.removeItem('tft-guide-dc'); });
    let dcReq = 0, dcPost = 0, dcPage = '', dcInject = false; const dcCache = {};
    await pg.route('https://lolche.local/**', async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/proxy') {
        const t = u.searchParams.get('u');
        if (/dcinside\.co\.kr|dcimg\d*\.dcinside\.com/.test(t)) {  // 글 속 사진 (앱 proxy처럼 디시 주소로 받아 그대로)
          let buf = Buffer.alloc(0); try { buf = (await execA('curl -s -H "User-Agent: Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile" -H "Referer: https://m.dcinside.com/" ' + JSON.stringify(t), { maxBuffer: 1 << 26, timeout: 30000 })); } catch (e) {}
          return r.fulfill({ status: 200, contentType: 'image/jpeg', body: buf });  // 앱은 octet-stream을 image/jpeg로 바꿔 준다
        }
        if (/gall\.dcinside\.com/.test(t)) { let body = ''; try { body = (await execA('curl -s --compressed -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" ' + JSON.stringify(t), { maxBuffer: 1 << 26, timeout: 30000 })).toString(); } catch (e) {} return r.fulfill({ status: 200, contentType: 'text/html', body }); }
        if (/m\.dcinside\.com\/board\/tft\/\d+/.test(t)) { dcPost++; let body = ''; try { body = (await execA('curl -s --compressed -H "User-Agent: Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36" -H "Referer: https://m.dcinside.com/board/tft" ' + JSON.stringify(t), { maxBuffer: 1 << 26, timeout: 30000 })).toString(); } catch (e) {} return r.fulfill({ status: 200, contentType: 'text/html', body }); }
        if (/m\.dcinside\.com/.test(t)) {
          dcReq++;
          if (dcCache[t] == null) { try { dcCache[t] = (await execA('curl -s --compressed -H "User-Agent: Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36" -H "Referer: https://m.dcinside.com/board/tft" ' + JSON.stringify(t), { maxBuffer: 1 << 26, timeout: 30000 })).toString(); } catch (e) { dcCache[t] = ''; } }
          let body = dcCache[t];
          if (!/page=/.test(t)) dcPage = body;
          // 새 글이 올라온 상황 흉내: 1쪽 맨 위에 글 하나를 더 끼운다 (읽던 자리가 그대로인지 보려고)
          if (dcInject && !/page=/.test(t)) body = body.replace('<li  > <div class="gall-detail-lnktb">', '<li  > <div class="gall-detail-lnktb"> <a href="https://m.dcinside.com/board/tft/9999999" class="lt"> <span class="subject-add"> <span class="subjectin">QA 새 글</span> </span> <ul class="ginfo "> <li>일반</li> <li class="list-nick">qa</li> <li>00:00</li> <li>조회 1</li> <li>추천 <span>0</span></li> </ul> </a> </div> </li> <li  > <div class="gall-detail-lnktb">');
          return r.fulfill({ status: 200, contentType: 'text/html', body });
        }
        return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      const f = path.join(SITE, decodeURIComponent(u.pathname)); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ body: fs.readFileSync(f) });
    });
    await pg.goto('https://lolche.local/index.html'); await pg.waitForTimeout(2500);
    const go = (t) => pg.evaluate((t) => { const a = document.createElement('a'); a.href = '#' + t; document.body.appendChild(a); a.click(); a.remove(); }, t);
    await go('dc'); await pg.waitForTimeout(3000);
    const n0 = dcReq;
    await pg.waitForTimeout(4000);
    const r = await pg.evaluate(() => ({ rows: document.querySelectorAll('#dc-list li a').length, on: (document.querySelector('#dc-iv button.on') || {}).textContent, stat: document.getElementById('dc-stat').textContent, sw: document.documentElement.scrollWidth }));
    const per = dcReq - n0;
    if (!dcPage) notes.push('롤체갤: 디시 목록을 못 받아 검사 일부 건너뜀');
    else if (r.rows < 10) fail(`롤체갤: 글 ${r.rows}개 (10개 이상이어야 함)`);
    if (r.on !== '1초') fail('롤체갤: 기본 새로고침이 1초가 아님');
    if (per < 3) fail(`롤체갤: 4초 동안 ${per}번만 다시 받음 (1초마다여야 함)`);
    if (!/갱신/.test(r.stat)) fail('롤체갤: 갱신 시각이 안 보임 (' + r.stat + ')');
    if (r.sw > 360) fail(`롤체갤: 화면보다 넓음 ${r.sw}px`);
    // 아래로 내리면 이전 글을 더 받아 붙이는지 (사용자: "글 목록 더 아래로 못 내리냐")
    if (dcPage) {
      const before = r.rows;
      for (let k = 0; k < 4; k++) { await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(2500); }
      const after = await pg.evaluate(() => document.querySelectorAll('#dc-list li a').length);
      if (after < before + 15) fail(`롤체갤: 아래로 내려도 이전 글이 안 붙음 (${before} → ${after}줄)`);
      // 중간을 읽는 중에 새 글이 올라와도 보던 글이 제자리에 있는지
      await pg.evaluate(() => window.scrollTo(0, 900)); await pg.waitForTimeout(1500);
      const a0 = await pg.evaluate(() => { const hdr = document.querySelector('.dc-bar').getBoundingClientRect().bottom; const li = [...document.querySelectorAll('#dc-list li[data-no]')].find(x => x.getBoundingClientRect().bottom > hdr + 40); return li ? [li.dataset.no, li.getBoundingClientRect().top] : null; });
      dcInject = true; await pg.waitForTimeout(3000);
      const a1 = await pg.evaluate((no) => { const li = document.querySelector('#dc-list li[data-no="' + no + '"]'); return [li ? li.getBoundingClientRect().top : null, !!document.querySelector('#dc-list li[data-no="9999999"]')]; }, a0 && a0[0]);
      if (!a1[1]) fail('롤체갤: 새 글이 목록에 안 붙음');
      if (a0 && (a1[0] == null || Math.abs(a1[0] - a0[1]) > 3)) fail(`롤체갤: 새 글이 붙으면서 읽던 자리가 밀림 (${a0[1]} → ${a1[0]})`);
    }
    // 글을 누르면 앱 안에서 본문·사진·댓글 (사용자: "글 누르면 내용이랑 댓글 다 앱 안에서")
    if (dcPage) {
      await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForTimeout(500);
      const pick = await pg.evaluate(() => { const ls = [...document.querySelectorAll('#dc-list li[data-no]')].filter(x => x.dataset.no !== '9999999'); const c = ls.find(x => x.querySelector('.dc-cmt')) || ls[0]; c.querySelector('a').click(); return c.dataset.no; });
      await pg.waitForTimeout(4000);
      const v = await pg.evaluate(() => { const v = document.querySelector('.dc-view'); if (!v) return null; return { t: (v.querySelector('.dc-vt') || {}).textContent || '', body: (v.querySelector('.dc-vtext') || {}).textContent || '', imgs: v.querySelectorAll('.dc-vtext img').length, cm: v.querySelectorAll('.dc-cm li:not(.dc-cnone)').length, cmh: (v.querySelector('.dc-ch b') || {}).textContent || '', err: (v.querySelector('.dc-empty') || {}).textContent || '', sw: v.scrollWidth, w: v.clientWidth }; });
      if (!v) fail('롤체갤 글: 눌러도 앱 안에서 안 열림');
      else {
        if (v.err) fail('롤체갤 글: ' + v.err + ' (' + pick + ')');
        if (!v.t) fail('롤체갤 글: 제목이 비어 있음');
        if (!/^댓글 \d+/.test(v.cmh)) fail('롤체갤 글: 댓글 수 줄이 없음');
        if (+v.cmh.replace(/\D/g, '') > 0 && !v.cm) fail('롤체갤 글: 댓글이 있는데 목록이 비어 있음');
        if (v.sw > v.w + 1) fail('롤체갤 글: 화면보다 넓음');
      }
      if (await pg.evaluate(() => !!document.querySelector('.dc-view script, .dc-view iframe, .dc-view [onclick], .dc-view [onerror]'))) fail('롤체갤 글: 스크립트·광고 틀이 그대로 들어옴');
      // 글을 보는 동안은 목록을 안 받는다
      const n2 = dcReq; await pg.waitForTimeout(2500); if (dcReq - n2 > 0) fail('롤체갤 글: 글을 보는 중에도 목록을 계속 받음');
      // 사진 글: 사진이 실제로 뜨는지 (디시는 다른 곳에서 바로 부르면 막아서 앱이 대신 받음)
      await pg.evaluate(() => document.querySelector('.dc-back').click()); await pg.waitForTimeout(1500);
      if (await pg.evaluate(() => !!document.querySelector('.dc-view'))) fail('롤체갤 글: 목록 버튼을 눌러도 안 닫힘');
      // 사진 글 최대 3개를 열어 하나라도 사진이 뜨면 통과 (지워진 사진처럼 디시 쪽에서 안 주는 사진도 있어서 글 하나로는 판단 안 함)
      const imgNos = await pg.evaluate(() => [...document.querySelectorAll('#dc-list li[data-no]')].filter(x => x.querySelector('.dc-img')).slice(0, 3).map(x => x.dataset.no));
      let imgOk = 0, imgTried = 0, imgSeen = 0, imgUrl = '';
      for (const no of imgNos) {
        await pg.evaluate((no) => document.querySelector('#dc-list li[data-no="' + no + '"] a').click(), no);
        await pg.waitForTimeout(3000);
        await pg.evaluate(() => { const i = document.querySelector('.dc-view .dc-vtext img'); if (i) i.scrollIntoView(); });
        for (let k = 0; k < 15; k++) { if (await pg.evaluate(() => [...document.querySelectorAll('.dc-view .dc-vtext img')].some(i => i.complete && i.naturalWidth > 0))) break; await pg.waitForTimeout(1000); }
        const im = await pg.evaluate(() => { const ims = [...document.querySelectorAll('.dc-view .dc-vtext img')]; return { n: ims.length, ok: ims.filter(i => i.complete && i.naturalWidth > 0).length, x: document.querySelectorAll('.dc-view .dc-picx').length }; });
        imgTried++; if (im.n + im.x) imgSeen++; if (im.ok) imgOk++;
        if (!imgUrl) imgUrl = await pg.evaluate(() => { const i = document.querySelector('.dc-view .dc-vtext img[src*="proxy"]'), x = document.querySelector('.dc-view .dc-picx[data-u]'); return i ? new URL(i.src).searchParams.get('u') : x ? x.dataset.u : ''; });
        await pg.goBack(); await pg.waitForTimeout(1200);
        if (await pg.evaluate(() => !!document.querySelector('.dc-view'))) { fail('롤체갤 글: 휴대폰 뒤로가기로 안 닫힘'); break; }
        if (imgOk) break;
      }
      if (imgSeen && !imgOk) {
        // 디시 사진 서버가 그 순간 안 주는 건지(서버 쪽), 앱이 못 그리는 건지 가른다: 같은 주소를 직접 받아 본다
        let direct = 0; try { direct = cp.execSync('curl -s -o /dev/null -w "%{size_download}" --max-time 30 -H "User-Agent: Mozilla/5.0" -H "Referer: https://m.dcinside.com/" ' + JSON.stringify(imgUrl)).toString() | 0; } catch (e) {}
        if (imgUrl && direct > 1000) fail(`롤체갤 글: 사진 글 ${imgTried}개를 열었는데 사진이 하나도 안 뜸 (디시는 사진을 주는데 앱이 못 그림)`);
        else notes.push(`롤체갤 글: 사진 ${imgTried}개가 안 떴지만 디시 사진 서버도 그때 응답이 없음 (${imgUrl ? direct + '바이트' : '주소 없음'})`);
      }
      else if (imgTried && !imgSeen) notes.push('롤체갤 글: 사진 글인데 본문에 사진이 없음 (동영상·외부 링크일 수 있음)');
      const n3 = dcReq; await pg.waitForTimeout(2500); if (dcReq - n3 < 1) fail('롤체갤 글: 닫은 뒤 목록 새로고침이 다시 안 돎');
    }
    await go('meta'); await pg.waitForTimeout(1500); const n1 = dcReq; await pg.waitForTimeout(3000);
    if (dcReq - n1 > 0) fail('롤체갤: 다른 탭으로 가도 계속 받음');
    if (errs.length) fail('롤체갤: 페이지 오류 ' + errs.slice(0, 2).join(' ; '));
    await ctx.close();
  });
  // 월즈 실시간 순위 (2026-11-13 사용자: "월즈 시작했는데 실시간 현황판 바로 안 넣어놓냐"): 일정을 오늘로, MetaTFT 대회 목록에
  // 지난 세트 월즈(TCROWN S17) 게임을 이번 세트 이름으로 넣어 보여주고, 순위표·단계 칩·한국 선수 줄·프로 포인트 접힘을 본다
  if (!FAST) task(['esports'], async () => {
    const pg = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    const curl = (u) => { try { return cp.execSync('curl -s --compressed -H "User-Agent: Mozilla/5.0" -H "Origin: https://www.metatft.com" ' + JSON.stringify(u), { maxBuffer: 1 << 28, timeout: 90000 }).toString(); } catch (e) { return ''; } };
    const today = new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
    let tours = [], set = 18, sheetOn = false;
    try { tours = JSON.parse(curl('https://api.metatft.com/public/esports/tournaments')).data || []; } catch (e) {}
    const old = tours.filter(t => /TCROWN/i.test(t.competition_name)).sort((a, b) => a.date_start < b.date_start ? 1 : -1)[0];
    const oldMatches = old ? curl('https://api.metatft.com/public/esports/tournaments/' + encodeURIComponent(old.competition_name) + '/matches') : '';
    await pg.route('https://lolche.local/**', async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/proxy') {
        const t = u.searchParams.get('u');
        if (/competetft\.com/.test(t)) return r.fulfill({ status: 200, contentType: 'text/html', body: sheetOn ? curl('https://competetft.com/en-US/tournament/116912912421782425/overview') : '<html></html>' });  // 시트 검사 땐 지난 AMER 지역 결승 페이지(시트 링크 있음)
        if (/docs\.google\.com/.test(t)) { let b2 = ''; try { b2 = (await execA('curl -s -L ' + JSON.stringify(t), { maxBuffer: 1 << 26, timeout: 60000 })).toString(); } catch (e) {} return r.fulfill({ status: 200, contentType: 'text/plain', body: b2 }); }
        if (/esports\/tournaments$/.test(t)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ competition_name: 'TCROWN S' + set, stages: [], date_start: today, date_end: today }] }) });
        if (/esports\/tournaments\/.*matches/.test(t)) return r.fulfill({ status: 200, contentType: 'application/json', body: oldMatches || '{"data":[]}' });
        return r.fulfill({ status: 200, contentType: 'application/json', body: curl(t) || '{}' });
      }
      if (u.pathname === '/esports.json') {
        const d = JSON.parse(fs.readFileSync(path.join(SITE, 'esports.json'), 'utf8'));
        set = (d.schedule[0] || {}).set || set;
        d.schedule = [{ ...(d.schedule[0] || {}), start: today, end: today }];
        delete d.schedule[0].sheet;  // 고정 시트 주소는 빼고: MetaTFT 단계 → 대회 페이지에서 시트 찾기 순서로 시험
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(d) });
      }
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      const f = path.join(SITE, decodeURIComponent(u.pathname)); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ body: fs.readFileSync(f) });
    });
    await pg.goto('https://lolche.local/index.html'); await pg.waitForTimeout(3000);
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#esports'; document.body.appendChild(a); a.click(); a.remove(); });
    await pg.waitForTimeout(2500);
    // 월즈는 대회 목록 맨 위 금색 카드 (2026-11-15 사용자: "대회로 치는데 그냥 월즈인 것처럼 강조만 해")
    const top0 = await pg.evaluate(() => { const f = document.querySelector('#esp-list > *'); return { view: (document.querySelector('#esp-view button.on') || { dataset: {} }).dataset.v || '', firstWd: !!f && f.classList.contains('wd-card'), pastWd: document.querySelectorAll('#esp-list article.wd').length }; });
    await pg.evaluate(() => { const h = document.querySelector('#esp-list .wd-card .esp-head'); if (h) h.click(); });
    await pg.waitForTimeout(8000);
    const r = await pg.evaluate(() => {
      const lv = document.getElementById('esp-live');
      return { shown: !!lv && !lv.hidden, rows: lv ? lv.querySelectorAll('tbody tr').length : 0, chips: lv ? lv.querySelectorAll('.mt-chips button').length : 0,
        pl: lv ? lv.querySelectorAll('.sht .pv').length : 0,
        // 시트 표: 표는 좌우로 밀리되(안에서 스크롤) 화면 전체는 안 넓어지고, 앞 세 칸(순위·선수·점수)은 고정
        clip: lv && lv.querySelector('.sht') ? (lv.querySelector('.sht').scrollWidth > lv.querySelector('.sht').clientWidth ? (() => { const sh = lv.querySelector('.sht'); sh.scrollIntoView({ block: 'center' }); sh.scrollLeft = 400; const row = sh.querySelector('tbody tr'), pt = row.querySelector('.c-pt').getBoundingClientRect(), rb = row.getBoundingClientRect(), y = rb.top + rb.height / 2, x0 = sh.getBoundingClientRect().left; let leak = 0; for (let x = Math.max(0, x0) + 1; x < pt.right - 1; x += 4) { const e = document.elementFromPoint(x, y); if (e && e.closest('.gc')) leak++; } sh.scrollLeft = 0; window.scrollTo(0, 0); return leak ? 1 : 0; })() : 0) : 1, ptOpen: !document.querySelector('#esports .esp-pane[data-v=points]').hidden, view: (document.querySelector('#esp-view button.on') || {}).dataset ? document.querySelector('#esp-view button.on').dataset.v : '', vis: [...document.querySelectorAll('#esp-live tbody tr')].filter(t => !t.hidden).length, sw: document.documentElement.scrollWidth };
    });
    if (!old) notes.push('월즈 실시간 순위: MetaTFT에 지난 월즈 기록이 없어 검사 못 함');
    else {
      if (!r.shown) fail('월즈 실시간 순위: 대회 기간인데 안 보임');
      if (r.rows < 8) fail(`월즈 실시간 순위: 순위 줄 ${r.rows}개 (8개 이상이어야 함)`);
      if (r.pl < r.rows) fail('월즈 실시간 순위: 게임별 등수가 비어 있음');
      if (r.chips < 2) fail('월즈 실시간 순위: 단계(결승·누적·일차) 칩이 없음');
      if (r.clip) fail('월즈 실시간 순위: 시트 표가 없거나, 옆으로 밀면 고정 칸 옆·뒤로 게임 칸이 비침');
      // 칩을 눌러도 오류 없이 다시 그려지는지
      const n = await pg.evaluate(() => { const bs = document.querySelectorAll('#esp-live .mt-chips button'); if (bs.length) bs[bs.length - 1].click(); return document.querySelectorAll('#esp-live tbody tr').length; });
      if (n < 8) fail('월즈 실시간 순위: 다른 단계를 누르니 표가 빔');
    }
    if (r.ptOpen) fail('이스포츠: 프로 포인트가 처음부터 보임 (월즈 기간엔 월즈 보기가 먼저)');
    // 이스포츠 탭 구조 (2026-11-14 사용자: "월즈라고 해도 너무 탭을 길게 차지하고 줄일 수도 없잖아"): 월즈·대회·포인트·안내 전환, 순위판 16줄까지
    if (top0.view !== 'events') fail('이스포츠: 처음 보기가 대회 목록이 아님 (' + top0.view + ')');
    if (!top0.firstWd) fail('이스포츠: 월즈 기간인데 대회 목록 맨 위가 월즈 카드가 아님');
    if (!top0.pastWd) fail('이스포츠: 대회 목록에 역대 월즈 카드가 없음');
    if (!(await pg.evaluate(() => { const v = document.querySelector('.fs-view'); return !!v && !!v.querySelector('#esp-live') && !!v.querySelector('#esp-crown'); }))) fail('이스포츠: 월즈 카드를 눌러도 실시간 순위·명단 화면이 안 열림');
    if (r.vis > 18) fail(`이스포츠: 실시간 순위판이 ${r.vis}줄 펼쳐져 있음 (16줄까지만, 나머지는 버튼)`);
    await pg.evaluate(() => { const b = document.querySelector('.fs-view .dc-back'); if (b) b.click(); }); await pg.waitForTimeout(500);
    if (await pg.evaluate(() => !!document.querySelector('.fs-view') || !document.querySelector('#esp-stash #esp-live') || document.querySelectorAll('#esp-list .esp-card').length < 3)) fail('이스포츠: 월즈 화면에서 뒤로가 안 닫히거나, 순위판이 제자리로 안 돌아가거나, 대회 목록이 비어 있음');
    // 대회 카드도 시트 표 (2026-11-15 사용자: "다른 대회들도 그렇게")
    await pg.evaluate(() => { const h = document.querySelector('#esp-list .esp-card .esp-head'); if (h) h.click(); }); await pg.waitForTimeout(600);
    // 대회를 누르면 전체 화면으로 (2026-11-15 사용자: "다른 화면으로 이동해서 크게 보는 식")
    { const ev = await pg.evaluate(() => { const c = document.querySelector('.fs-view'); return c ? { sht: c.querySelectorAll('.sht').length, pv: c.querySelectorAll('.sht .pv').length, sw: document.documentElement.scrollWidth, vw: c.scrollWidth } : null; });
      if (!ev) fail('이스포츠: 대회를 눌러도 전체 화면으로 안 열림');
      else if (!ev.sht || ev.pv < 8) fail('이스포츠: 대회 화면에 시트 표(게임별 칸)가 없음');
      else if (ev.sw > 360 || ev.vw > 360) fail(`이스포츠: 대회 화면이 화면보다 넓어짐 ${Math.max(ev.sw, ev.vw)}px`);
      await pg.evaluate(() => { const b = document.querySelector('.fs-view .dc-back'); if (b) b.click(); }); await pg.waitForTimeout(500);
      if (await pg.evaluate(() => !!document.querySelector('.fs-view'))) fail('이스포츠: 대회 화면에서 뒤로가 안 닫힘'); }
    // 지역 칩 줄과 첫 카드 사이 (2026-11-15 사용자: "전체랑 저거 겹치는 거 불편")
    { const gap = await pg.evaluate(() => { const a = document.getElementById('esp-reg'), b = document.querySelector('#esp-list > *'); if (!a || !b || a.offsetParent === null) return null; const bs = [...a.querySelectorAll('button')].map(x => x.getBoundingClientRect().bottom); return b.getBoundingClientRect().top - Math.max(...bs); });
      if (gap != null && gap < 8) fail(`이스포츠: 지역 칩과 첫 대회 카드 사이가 ${Math.round(gap)}px (붙어서 겹쳐 보임)`); }
    // 게임 수가 다른 칸 (2026-11-15 사용자: "게임을 하다 만 거여?"): 빈 칸이 탈락이면 '탈락', MetaTFT 기록이 빠진 단계면 경고
    { const E = JSON.parse(fs.readFileSync(path.join(SITE, 'esports.json'), 'utf8'));
      const pick = (want) => { for (const t of E.tournaments.filter(t => t.kind !== 'crown')) for (const e of t.events) for (const st of e.stages) { const gs = st.table.map(r => r.g || 0), mx = Math.max(...gs), tot = gs.reduce((a, b) => a + b, 0), kinds = new Set(gs).size;
        const gaps = t.source !== 'apactft' && !st.lq && !st.lqg && (tot % 8 !== 0 || kinds > 4);
        if (want === 'gaps' ? gaps : !gaps && st.table.some(r => (r.p || []).length && (r.p || []).length < mx && !r.adv)) return { name: t.name, ev: e.ev, st: st.name, many: e.stages.length > 1 }; } return null; };
      for (const want of ['gaps', 'clean']) {
        const x = pick(want); if (!x) continue;
        const ok = await pg.evaluate(async (x) => {
          const c = [...document.querySelectorAll('#esp-list .esp-card')].find(c => c.dataset.name === x.name); if (!c) return 'nocard';
          c.querySelector('.esp-head').click(); await new Promise(r => setTimeout(r, 500));
          const v = document.querySelector('.fs-view'); if (!v) return 'noview';
          const cs = [...v.querySelectorAll('.mt-chips')];
          const evb = cs.length ? [...cs[0].querySelectorAll('button')].find(b => b.textContent.trim().startsWith(x.ev)) : null; if (evb) { evb.click(); await new Promise(r => setTimeout(r, 300)); }
          const cs2 = [...v.querySelectorAll('.mt-chips')]; const stb = cs2.length > 1 ? [...cs2[cs2.length - 1].querySelectorAll('button')].find(b => b.textContent.trim() === x.st) : null; if (stb) { stb.click(); await new Promise(r => setTimeout(r, 300)); }
          const res = { warn: !!v.querySelector('.esp-cm.warn'), end: v.querySelectorAll('.gend').length };
          v.querySelector('.dc-back').click(); await new Promise(r => setTimeout(r, 300));
          return res;
        }, x);
        if (typeof ok === 'string') notes.push('게임 수 다른 칸: ' + x.name + ' 화면을 못 엶 (' + ok + ')');
        else if (want === 'gaps' && !ok.warn) fail(`이스포츠: ${x.name} ${x.ev} ${x.st}는 MetaTFT 기록이 빠졌는데 경고가 없음`);
        else if (want === 'clean' && (!ok.end || ok.warn)) fail(`이스포츠: ${x.name} ${x.ev} ${x.st}에서 먼저 끝난 선수 뒤 칸에 '탈락'이 없음 (빈 칸이 게임을 하다 만 것처럼 보임)`);
      }
    }
    // 역대 월즈도 전체 화면 + 단계별 기록
    { const hasSt = JSON.parse(fs.readFileSync(path.join(SITE, 'esports.json'), 'utf8')).worlds.some(w => w.stages && w.stages.length);
      // 역대 월즈 전부 단계별 기록 (2026-11-15 사용자: "역대 월즈들도 다 기록해서 넣어 줘"): 시즌마다 Liquipedia 형식이 달라 빠지기 쉽다
      { const ws = JSON.parse(fs.readFileSync(path.join(SITE, 'esports.json'), 'utf8')).worlds;
        const bad = ws.filter(w => !(w.stages || []).length || !(w.stages || []).some(x => x.name === '결승' && x.rows.length === 8) || (w.stages || []).some(x => !/[가-힣]/.test(x.name)));
        // 점수가 이어지는 단계(40강~8강, 1·2일차)는 시트 하나로 (2026-11-15 사용자: 16강만 따로 보니 그 단계 점수뿐이라 순위가 엉망)
        const split = ws.filter(w => (w.stages || []).filter(x => /^\d+강$|^\d일차$/.test(x.name)).length >= 2);
        if (split.length) fail('역대 월즈: 이어지는 단계가 따로 나뉨 ' + split.map(w => 'S' + w.set).join(', '));
        if (bad.length) fail('역대 월즈: 단계별 기록이 없거나 결승 8명이 없거나 단계 이름이 안 바뀐 시즌 ' + bad.map(w => 'S' + w.set).join(', ')); }
      await pg.evaluate(() => { const hs = document.querySelectorAll('#esp-list article.wd .wd-head'); const h = hs[hs.length - 1]; if (h) h.click(); }); await pg.waitForTimeout(600);
      const wv = await pg.evaluate(() => { const c = document.querySelector('.fs-view'); return c ? { top: c.querySelectorAll('.wd-top li').length, pv: c.querySelectorAll('.sht .pv').length, nan: /NaN|undefined/.test(c.textContent) } : null; });
      if (!wv || wv.top < 8) fail('이스포츠: 역대 월즈를 눌러도 화면이 안 열리거나 상위 8명이 없음');
      if (wv && wv.nan) fail('이스포츠: 역대 월즈 화면에 NaN·undefined 글자 (상금 "200,000"처럼 쉼표 든 값)');
      await pg.evaluate(() => { const b = document.querySelector('.fs-view .dc-back'); if (b) b.click(); }); await pg.waitForTimeout(400);
      if (hasSt) { const n = await pg.evaluate(() => { const hs = [...document.querySelectorAll('#esp-list article.wd .wd-head')]; return hs.length; }); if (!n) fail('이스포츠: 역대 월즈 목록이 비어 있음'); } }
    await pg.evaluate(() => document.querySelector('#esp-view [data-v=events]').click()); await pg.waitForTimeout(300);
    await pg.evaluate(() => document.querySelector('#esp-view [data-v=points]').click()); await pg.waitForTimeout(400);
    if (await pg.evaluate(() => document.querySelectorAll('#esp-pts tr').length) < 5) fail('이스포츠: 포인트 보기에 표가 없음');
    await pg.evaluate(() => { localStorage.removeItem('tft-guide-espview'); });
    // 월즈 진행 방식 (2026-11-14 사용자: "1일차는 하위 8명 탈락, 몇 판 해야 되는지 … 그게 보여야지"): 공식 시트로 단계 막대·규칙·탈락 표시
    {
      const p2 = await b.newPage({ viewport: { width: 360, height: 900 }, colorScheme: 'dark' });
      await p2.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
      await p2.route('https://lolche.local/**', async (r2) => {
        const u = new URL(r2.request().url());
        if (u.pathname === '/proxy') { const t = u.searchParams.get('u'); if (/metatft/.test(t)) return r2.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }); let b2 = ''; try { b2 = (await execA('curl -s -L ' + JSON.stringify(t), { maxBuffer: 1 << 26, timeout: 60000 })).toString(); } catch (e) {} return r2.fulfill({ status: 200, contentType: 'text/plain', body: b2 }); }
        if (u.pathname === '/esports.json') { const d = JSON.parse(fs.readFileSync(path.join(SITE, 'esports.json'), 'utf8')); d.schedule = [{ ...(d.schedule[0] || {}), start: today, end: today }]; return r2.fulfill({ contentType: 'application/json', body: JSON.stringify(d) }); }
        if (u.pathname === '/index.html') return r2.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
        const f = path.join(SITE, decodeURIComponent(u.pathname)); if (!fs.existsSync(f)) return r2.fulfill({ status: 404, body: '' }); return r2.fulfill({ body: fs.readFileSync(f) });
      });
      await p2.goto('https://lolche.local/index.html'); await p2.waitForTimeout(2500);
      await p2.evaluate(() => { const a = document.createElement('a'); a.href = '#esports'; document.body.appendChild(a); a.click(); a.remove(); });
      await p2.waitForTimeout(1500); await p2.evaluate(() => { const h = document.querySelector('#esp-list .wd-card .esp-head'); if (h) h.click(); });
      // 결승 날엔 기본 탭이 결승이라 단계 막대가 없다 → 1·2일차 탭(진행 방식이 붙는 탭)을 눌러 본다
      for (let k = 0; k < 40; k++) { if (await p2.evaluate(() => { if (document.querySelector('#esp-live .lv-steps')) return true; const bs = [...document.querySelectorAll('#esp-live .mt-chips button')]; const b = bs.find(x => !x.classList.contains('on') && !/결승|3일차/.test(x.textContent)); if (b) b.click(); return !!document.querySelector('#esp-live .lv-steps'); })) break; await p2.waitForTimeout(1000); }
      const fm = await p2.evaluate(() => ({ crOut: [...document.querySelectorAll('#esp-crown .cr-p .lv-st')].filter(x => x.textContent === '40강 탈락').length, crN: document.querySelectorAll('#esp-crown .cr-p').length, steps: document.querySelectorAll('#esp-live .lv-step').length, rule: (document.querySelector('#esp-live .lv-rule') || {}).textContent || '', out40: [...document.querySelectorAll('#esp-live .lv-st')].filter(x => x.textContent === '40강 탈락').length, rows: document.querySelectorAll('#esp-live tbody tr').length, sw: document.documentElement.scrollWidth }));
      const sched = JSON.parse(fs.readFileSync(path.join(SITE, 'esports.json'), 'utf8')).schedule[0] || {};
      if (sched.fmt && sched.sheet) {
        if (fm.steps !== sched.fmt.rounds.length + 1) fail(`월즈 진행 방식: 단계 막대 ${fm.steps}칸 (${sched.fmt.rounds.length + 1}칸이어야 함)`);
        if (!fm.rule) fail('월즈 진행 방식: 지금 단계 규칙 줄이 없음');
        if (fm.rows >= 40 && /40강 6\/6|32강|24강|16강|8강|결승 8명/.test(fm.rule) && fm.out40 !== 8) fail(`월즈 진행 방식: 1일차가 끝났는데 40강 탈락 표시가 ${fm.out40}명 (8명이어야 함)`);
        if (fm.sw > 360) fail('월즈 진행 방식: 화면보다 넓음');
        // 진출자 명단도 같은 상태 (2026-11-14 사용자: "명단도 그렇고"): 이름이 공식 시트와 맞아야 붙는다 (CSFX = Cangshan)
        if (fm.out40 === 8 && fm.crN >= 40 && fm.crOut !== 8) fail(`월즈 진출자 명단: 40강 탈락 표시가 ${fm.crOut}명 (순위판은 8명) — 명단 이름이 공식 시트와 안 맞음`);
      }
      await p2.close();
    }
    // 공식 결과 시트가 걸리면 그걸로 (2026-11-14 사용자: "월즈 실시간 점수표 못 찾겠음?"): 대회 페이지에 구글 시트가 있으면 순위표 탭을 CSV로 읽는다
    sheetOn = true;
    await pg.reload(); await pg.waitForTimeout(2500);
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#esports'; document.body.appendChild(a); a.click(); a.remove(); });
    await pg.waitForTimeout(1500); await pg.evaluate(() => { const h = document.querySelector('#esp-list .wd-card .esp-head'); if (h) h.click(); });
    for (let k = 0; k < 30; k++) { if (await pg.evaluate(() => /공식 결과 시트/.test((document.querySelector('#esp-live .lv-sub') || {}).textContent || ''))) break; await pg.waitForTimeout(1000); }
    const sh = await pg.evaluate(() => ({ sub: (document.querySelector('#esp-live .lv-sub') || {}).textContent || '', rows: document.querySelectorAll('#esp-live tbody tr').length, chips: document.querySelectorAll('#esp-live .mt-chips button').length, pl: document.querySelectorAll('#esp-live .sht .pv').length }));
    if (!/공식 결과 시트/.test(sh.sub)) fail('월즈 실시간 순위: 대회 페이지에 결과 시트가 있는데 안 읽음 (' + sh.sub.slice(0, 40) + ')');
    else {
      if (sh.rows < 8) fail(`월즈 실시간 순위(시트): 순위 줄 ${sh.rows}개`);
      if (sh.chips < 2) fail('월즈 실시간 순위(시트): 탭(단계) 칩이 없음');
      if (sh.pl < sh.rows) fail('월즈 실시간 순위(시트): 게임별 등수가 비어 있음');
    }
    if (r.sw > 360) fail(`월즈 실시간 순위: 화면보다 넓음 ${r.sw}px`);
    if (errs.length) fail('월즈 실시간 순위: 페이지 오류 ' + errs.slice(0, 2).join(' ; '));
    await pg.screenshot({ path: path.join(__dirname, '..', 'android', 'out', 'qa_live.png'), fullPage: false });
    await pg.close();
  });
  // 휴면 감소 (2026-11-14 사용자: "막판이 -222가 된 게 아니라 휴면 강등"): 마지막 판 뒤에 판 수는 그대로인 LP 기록(휴면 감소)을 끼워 넣어도
  // 그 판 LP는 판 결과대로, 감소는 '이후 휴면'으로 따로 나와야 한다
  if (!FAST) task(['rank'], async () => {
    const pg = await b.newPage({ viewport: { width: 390, height: 900 }, colorScheme: 'dark' });
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    let inj = null, base = null;
    await pg.route('https://lolche.local/**', async (r) => { const u = new URL(r.request().url());
      if (u.pathname === '/proxy') { const t = u.searchParams.get('u'); let body = (await proxyGet(t || '')).toString();
        if (/Synow-KR1\/league-logs/.test(t) && /page=1\b/.test(t)) { try { const d = JSON.parse(body), L = d.summonerLeagueLogs; base = L[0].slice(); inj = [L[0][0] + 3 * 864e5, L[0][1], L[0][2], Math.max(0, L[0][3] - 20), L[0][4], L[0][5]]; L.unshift(inj); body = JSON.stringify(d); } catch (e) {} }
        return r.fulfill({ status: 200, contentType: 'application/json', body }); }
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      const f = path.join(SITE, decodeURIComponent(u.pathname)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
    await pg.goto('https://lolche.local/index.html'); await pg.waitForTimeout(2500);
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#rank'; document.body.appendChild(a); a.click(); }); await pg.waitForTimeout(800);
    await pg.evaluate(() => { document.querySelector('#rk-seg [data-v=search]').click(); const i = document.getElementById('rk-q'); i.value = 'Synow#KR1'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
    await pg.waitForSelector('.rk-gm', { timeout: 90000 }).catch(() => {}); await pg.waitForTimeout(2500);
    const g = await pg.evaluate(() => { const c = document.querySelector('.rk-gm'); return c ? [c.querySelector('.gm-pl').textContent, [...c.querySelectorAll('.gm-l1 .lpd')].map(x => x.textContent)] : null; });
    if (!inj || !g) notes.push('휴면 감소: 전적을 못 받아 검사 건너뜀');
    else if (inj[3] < base[3]) {
      const pl = +g[0].replace('#', ''), lp = g[1][0] || '';
      if (!g[1].some(x => /휴면/.test(x))) fail('휴면 감소: 판 없이 깎인 LP가 "이후 휴면"으로 따로 안 나옴 (' + g[1].join(' / ') + ')');
      if ((pl <= 4 && /^-/.test(lp)) || (pl >= 5 && /^\+/.test(lp))) fail(`휴면 감소: ${pl}등 판 LP가 ${lp} (휴면 감소가 판 LP에 섞임)`);
    }
    await pg.close();
  });
  // 판 목록에 빠진 판 (2026-11-15 사용자: 앙기모링딩둉 15시즌 '시즌 전체'에서 8등 판에 +23LP, 마지막 판이 '기록 대기 중'):
  // 롤체지지 판 목록은 가끔 판이 빠져서, offset 하나로 맞추면 빠진 판 뒤(최근) 판들이 한 판씩 밀린다. 4번째 랭크 판을 빼고 최근 판 LP가 등수와 맞는지
  if (!FAST) task(['rank'], async () => {
    const pg = await b.newPage({ viewport: { width: 390, height: 900 }, colorScheme: 'dark' });
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    let dropped = null;
    await pg.route('https://lolche.local/**', async (r) => { const u = new URL(r.request().url());
      if (u.pathname === '/proxy') { const t = u.searchParams.get('u'); let body = (await proxyGet(t || '')).toString();
        if (/Synow-KR1\/matches/.test(t) && /page=1\b/.test(t)) { try { const d = JSON.parse(body), rk = d.matches.filter(m => m.queueId === 1100); if (rk.length >= 12) { dropped = rk[3].matchId; d.matches = d.matches.filter(m => m.matchId !== dropped); body = JSON.stringify(d); } } catch (e) {} }
        return r.fulfill({ status: 200, contentType: 'application/json', body }); }
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      const f = path.join(SITE, decodeURIComponent(u.pathname)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
    await pg.goto('https://lolche.local/index.html'); await pg.waitForTimeout(2500);
    await pg.evaluate(() => { localStorage.setItem('tft-guide-rkrange2', JSON.stringify({ n: 20, q: '1100' })); const a = document.createElement('a'); a.href = '#rank'; document.body.appendChild(a); a.click(); }); await pg.waitForTimeout(800);
    await pg.evaluate(() => { document.querySelector('#rk-seg [data-v=search]').click(); const i = document.getElementById('rk-q'); i.value = 'Synow#KR1'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
    await pg.waitForSelector('.rk-gm', { timeout: 90000 }).catch(() => {}); await pg.waitForTimeout(3000);
    const g = await pg.evaluate(() => [...document.querySelectorAll('.rk-gm')].slice(0, 3).map(c => [+(c.querySelector('.gm-pl') || {}).textContent.replace('#', ''), ((c.querySelector('.gm-l1 .lpd') || {}).textContent || '')]));
    if (!dropped || !g.length) notes.push('빠진 판: 랭크 판이 모자라거나 전적을 못 받아 검사 건너뜀');
    else { const bad = g.filter(([pl, lp]) => (pl <= 4 && /^-/.test(lp)) || (pl >= 5 && /^\+/.test(lp)));
      if (bad.length) fail('빠진 판: 판 목록에 판이 하나 빠지면 최근 판 LP가 한 판씩 밀림 (' + bad.map(x => '#' + x[0] + ' ' + x[1]).join(', ') + ')'); }
    await pg.close();
  });
  // 19시즌 미리보기 탭 (2026-11-18 사용자: "19시즌 탭을 새로 만들어, 공부하기 쉽게"): 보기마다 내용, 챔피언·시너지 상세가 열리는지, 영어 틀·남은 자리표시
  task(['s19', 'home'], async () => {
    const S = JSON.parse(fs.readFileSync(path.join(SITE, 's19.json'), 'utf8'));
    if (S.units.length < 60 || S.traits.length < 20) fail(`19시즌: 챔피언 ${S.units.length} · 시너지 ${S.traits.length} (너무 적음)`);
    const raw = JSON.stringify(S);
    if (/\{Set19|%i:|<TFT|TFTCurveTable/.test(raw)) fail('19시즌: 원문 틀(<TFT…>·{Set19…}·%i:)이 글에 그대로 남음');
    if (S.units.some(u => !u.img)) fail('19시즌: 아이콘 없는 챔피언 ' + S.units.filter(u => !u.img).map(u => u.n).slice(0, 3).join(', '));
    const dup = S.units.map(u => u.n).filter((n, i, a) => a.indexOf(n) !== i); if (dup.length) fail('19시즌: 같은 이름 챔피언이 둘 ' + dup.join(', '));
    const tps = S.units.map(u => u.tp).filter(Boolean), tpDup = tps.filter((c, i) => tps.indexOf(c) !== i);
    if (tps.length < S.units.length * 0.8) fail(`19시즌: 팀 플래너 코드 있는 챔피언이 적음 (${tps.length}/${S.units.length})`);
    if (tpDup.length) fail('19시즌: 팀 플래너 코드가 겹침 ' + tpDup.join(', '));
    // PBE 덱 통계 (MetaTFT queue=PBE, 2026-11-21~): 묶음 번호(새로고침용)와 배치판 자리가 다 있어야
    if ((S.decks || []).length < 15) fail(`19시즌: PBE 덱 통계 ${(S.decks || []).length}개 (너무 적음)`);
    if (!S.decksCid || (S.decks || []).some(d => !d.id)) fail('19시즌: PBE 덱에 묶음 번호(id/decksCid)가 없어 새로고침이 안 됨');
    // 운영 방식 (2026-11-21 사용자: "리롤 그런 거, 18시즌 덱처럼"): PBE 덱마다 MetaTFT levelling이 있어야
    if ((S.decks || []).filter(d => !d.style).length > 3) fail(`19시즌: 운영 방식(리롤·운영)이 없는 PBE 덱 ${(S.decks || []).filter(d => !d.style).length}개`);
    const noPos = (S.decks || []).filter(d => d.u.some(c => !c.pos)).map(d => d.n);
    if (noPos.length) fail('19시즌: 배치판에 자리 없는 챔피언이 있는 PBE 덱 ' + noPos.slice(0, 3).join(', '));
    const s19Small = S.units.filter(u => { try { const f = path.join(SITE, u.img); return fs.existsSync(f) && fs.statSync(f).size < 2500; } catch (e) { return false; } }).map(u => u.n);
    if (s19Small.length > 10) notes.push('19시즌: 챔피언 그림이 작은(흐린) 파일이 많음 ' + s19Small.slice(0, 5).join(', '));
    const pg = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    await pg.route('https://lolche.local/**', async (r) => { const u = new URL(r.request().url());
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      // 19시즌 통계 새로고침: 첫 덱을 1등만 한 덱으로 바꾼 가짜 MetaTFT 응답 (s19Apply가 숫자를 바꾸는지)
      if (u.pathname === '/proxy' && /comps_stats\?queue=(PBE|1100)/.test(u.searchParams.get('u') || '') && S.decks[0]) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cluster_id: S.decksCid, updated: Date.now(), results: [{ cluster: '', places: [8000000] }, { cluster: S.decks[0].id, places: [9000, 0, 0, 0, 0, 0, 0, 0, 9000], count: 9000 }] }) });
      if (u.pathname === '/proxy') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      const f = path.join(SITE, decodeURIComponent(u.pathname)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
    const errs = []; pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto('https://lolche.local/index.html'); await pg.waitForTimeout(2500);
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#s19'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(1200);
    // v3.0.0: #s19는 '도감' 탭 (덱·개요는 #home·#meta로 옮김)
    for (const [v, sel, min] of [['traits', '.s19-tc', 20], ['units', '.s19-uc', 60], ['unlock', '.s19-ul', 5], ['builder', '.s19-bpick', 60], ['augs', '.s19-ar', 50], ['items', '.s19-ar', 10]]) {
      await pg.evaluate((v) => document.querySelector('#s19-view [data-v=' + v + ']').click(), v); await pg.waitForTimeout(500);
      const r = await pg.evaluate((sel) => ({ n: document.querySelectorAll('#s19-out ' + sel).length, sw: document.documentElement.scrollWidth, seg: [...document.querySelectorAll('#s19-view button')].some(b => b.getBoundingClientRect().height > 44) }), sel);
      if (r.n < min) fail(`19시즌 ${v}: 항목 ${r.n}개 (최소 ${min})`);
      if (r.sw > 360) fail(`19시즌 ${v}: 화면보다 넓음 ${r.sw}px`);
      if (r.seg) fail('19시즌: 보기 버튼 글자가 두 줄로 꺾임');
    }
    if (await pg.evaluate(() => !!document.querySelector('#s19-view [data-v=decks], #s19-view [data-v=home]'))) fail('도감 탭: 덱·개요 보기가 남아 있음 (v3.0.0에서 #meta·#home으로 옮김)');
    // 검색창이 입력 중에 새로 만들어지면 한글 조합이 끊겨 "ㅈㅔㄹㅣ"가 된다 (2026-11-21 사용자 스크린샷): 입력 뒤에도 같은 검색창이어야
    await pg.evaluate(() => document.querySelector('#s19-view [data-v=units]').click()); await pg.waitForTimeout(400);
    const ime = await pg.evaluate(() => { const i = document.querySelector('#s19-tools .s19-q'); if (!i) return 'none'; window.__q = i; i.value = '자'; i.dispatchEvent(new Event('input', { bubbles: true }));
      const same = document.querySelector('#s19-tools .s19-q') === window.__q; i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return same ? 'ok' : 'replaced'; });
    if (ime !== 'ok') fail(`도감 검색: 입력할 때 검색창이 새로 만들어짐 (한글이 낱자로 끊김) (${ime})`);
    await pg.evaluate(() => document.querySelector('#s19-view [data-v=builder]').click()); await pg.waitForTimeout(350);
    await pg.evaluate(() => document.querySelector('#s19-out .s19-bclr')?.click()); await pg.waitForTimeout(250);
    // 19시즌 스쿼드 빌더: 챔피언 2명 추가 → 시너지 계산 칩 표시 → 비우기
    await pg.evaluate(() => document.querySelector('#s19-view [data-v=builder]').click()); await pg.waitForTimeout(400);
    await pg.evaluate(() => { const p = document.querySelectorAll('#s19-out .s19-bpick'); if (p[0]) p[0].click(); if (p[1]) p[1].click(); }); await pg.waitForTimeout(400);
    const bld = await pg.evaluate(() => ({ slots: document.querySelectorAll('#s19-out .s19-bslot.full').length, pills: document.querySelectorAll('#s19-out .s19-bspill').length }));
    if (bld.slots < 2 || !bld.pills) fail(`19시즌 빌더: 챔피언 추가(${bld.slots}) 또는 시너지 계산(${bld.pills}) 실패`);
    await pg.evaluate(() => document.querySelector('#s19-out .s19-bclr')?.click()); await pg.waitForTimeout(300);
    // 19시즌 해금 체크리스트: 체크 토글 → 진척도 증가 → 해제
    await pg.evaluate(() => document.querySelector('#s19-view [data-v=unlock]').click()); await pg.waitForTimeout(350);
    await pg.evaluate(() => document.querySelector('#s19-out .s19-ul-chk')?.click()); await pg.waitForTimeout(300);
    const ulDone = await pg.evaluate(() => (document.querySelector('#s19-out .s19-prog-h b') || {}).textContent || '');
    if (!/^1\s*\//.test(ulDone)) fail('19시즌 해금 체크: 진척도 갱신 안 됨 (' + ulDone + ')');
    await pg.evaluate(() => document.querySelector('#s19-out .s19-ul-chk')?.click()); await pg.waitForTimeout(250);
    await pg.evaluate(() => document.querySelector('#s19-view [data-v=units]').click()); await pg.waitForTimeout(400);
    await pg.evaluate(() => document.querySelector('#s19-out .s19-uc').click()); await pg.waitForTimeout(500);
    const un = await pg.evaluate(() => { const v = document.querySelector('.fs-view'); return v ? { kv: v.querySelectorAll('.s19-kv b').length, tc: v.querySelectorAll('.s19-tchip').length } : null; });
    if (!un || un.kv < 6 || !un.tc) fail('19시즌: 챔피언을 눌러도 스킬·능력치·시너지 화면이 안 열림');
    await pg.evaluate(() => document.querySelector('.fs-view .s19-tchip')?.click()); await pg.waitForTimeout(500);
    if (!(await pg.evaluate(() => [...document.querySelectorAll('.fs-view')].some(v => v.querySelector('.s19-tc.open'))))) fail('19시즌: 챔피언 화면에서 시너지를 눌러도 시너지 설명이 안 열림');
    if (errs.length) fail('19시즌: 페이지 오류 ' + errs.slice(0, 2).join(' ; '));
    await pg.close();
  });
  // 메타 덱 새로고침 뒤 줄 숫자가 MetaTFT comps_stats 그대로인지 + 티어가 MetaTFT 표대로인지 (가짜 응답, fast에서도 동작)
  task(['meta'], async () => {
    const M = JSON.parse(fs.readFileSync(path.join(SITE, 'meta.json'), 'utf8'));
    const ds = M.decks || [];
    const pair = ds.length >= 2 ? [ds[0], ds[1]] : null;
    if (!pair) return;
    // pair[0]: 6000판 전원 2등(평균 2.00 -> S), pair[1]: 4000판 4등 2000 + 5등 2000(평균 4.50 -> B). 합치지 않고 각자 그대로
    const mockRes = [{ cluster: '', places: [1000000] }];
    ds.forEach(d => {
      if (d.id === pair[0].id) mockRes.push({ cluster: d.id, places: [0, 6000, 0, 0, 0, 0, 0, 0, 6000], count: 6000 });
      else if (d.id === pair[1].id) mockRes.push({ cluster: d.id, places: [0, 0, 0, 2000, 2000, 0, 0, 0, 4000], count: 4000 });
      else mockRes.push({ cluster: d.id, places: [0, 0, 0, 500, 500, 0, 0, 0, 1000], count: 1000 });
    });
    const csUrls = [];
    const pg = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    await pg.route('https://lolche.local/**', async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      if (u.pathname === '/proxy' && /comps_stats/.test(u.searchParams.get('u') || '')) { csUrls.push(u.searchParams.get('u')); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cluster_id: M.cluster_id, updated: Date.now(), results: mockRes }) }); }
      if (u.pathname === '/proxy') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      const f = path.join(SITE, decodeURIComponent(u.pathname)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' });
    });
    await pg.goto('https://lolche.local/index.html'); await pg.waitForTimeout(1800);
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#meta'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(600);
    await pg.evaluate(() => document.getElementById('mt-upd-btn')?.click()); await pg.waitForTimeout(800);
    const got = await pg.evaluate((ids) => ids.map(id => { const row = document.querySelector('#mt-rows .mt-row.dk[data-id="' + id + '"]');
      return row ? { avg: (row.querySelector('.dk-avg') || {}).textContent?.trim(), tier: (row.querySelector('.dk-tbadge') || {}).textContent?.trim() } : null; }), [String(pair[0].id), String(pair[1].id)]);
    if (!got[0] || got[0].avg !== '2.00' || got[0].tier !== 'S' || !got[1] || got[1].avg !== '4.50' || got[1].tier !== 'B') fail(`덱 새로고침: MetaTFT 숫자 그대로·티어 표대로가 아님 (기대 2.00 S / 4.50 B, 실제 ${JSON.stringify(got)})`);
    // 운영 방식 색 (2026-11-22 사용자: "모바일도 9렙 운영·8렙 리롤 이런 거 색깔로 구분"): 폰 덱 줄에 색 칩, 리롤·운영 색이 서로 다름
    const stc = await pg.evaluate(() => { const m = {}; document.querySelectorAll('#mt-rows .mt-row .dk-sub .stc').forEach(e => { const c = [...e.classList].find(x => /^st-/.test(x)); m[c] = getComputedStyle(e).backgroundColor; }); return m; });
    const stKeys = Object.keys(stc);
    if (stKeys.length < 2) fail(`덱 운영 방식: 폰 덱 줄에 색 칩이 없음 (${JSON.stringify(stc)})`);
    else if (new Set(Object.values(stc)).size < stKeys.length) fail(`덱 운영 방식: 운영 방식마다 색이 다르지 않음 (${JSON.stringify(stc)})`);
    // 통계 기간 (2026-11-22 사용자: "MetaTFT처럼 최근 3일 등등 선택 가능하게"): 최근 1~7일을 고르면 그 기간으로 받고, 다시 켜도 기억
    const dd0 = await pg.evaluate(() => { const s = document.getElementById('mt-days'), box = s && s.parentNode; return box && box.classList.contains('dd') ? { n: box.querySelectorAll('li').length, txt: box.querySelector('button').textContent.trim(), sw: document.documentElement.scrollWidth } : null; });
    if (!dd0 || dd0.n !== 7 || dd0.txt !== '최근 3일') fail(`덱 통계 기간: 최근 1~7일 고르기 칸이 없음 (${JSON.stringify(dd0)})`);
    else {
      if (dd0.sw > 360) fail(`덱 통계 기간: 360px 폰에서 가로로 넘침 (${dd0.sw}px)`);
      csUrls.length = 0;
      await pg.evaluate(() => { const box = document.getElementById('mt-days').parentNode; box.querySelector('button').click(); box.querySelector('li[data-v="1"]').click(); }); await pg.waitForTimeout(800);
      const d1 = await pg.evaluate(() => ({ txt: document.getElementById('mt-days').parentNode.querySelector('button').textContent.trim(), saved: localStorage.getItem('tft-guide-meta-days') }));
      if (!csUrls.length || !csUrls.every(x => /[?&]days=1(&|$)/.test(x))) fail(`덱 통계 기간: 최근 1일을 골라도 days=1로 받지 않음 (${csUrls.slice(0, 2).join(' ; ')})`);
      if (d1.txt !== '최근 1일' || d1.saved !== '1') fail(`덱 통계 기간: 고른 기간이 표시·저장되지 않음 (${JSON.stringify(d1)})`);
      csUrls.length = 0;
      await pg.reload(); await pg.waitForTimeout(1800);
      await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#meta'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(800);
      const d2 = await pg.evaluate(() => document.getElementById('mt-days').parentNode.querySelector('button').textContent.trim());
      if (d2 !== '최근 1일') fail(`덱 통계 기간: 다시 켜면 고른 기간을 잊음 (${d2})`);
      await pg.evaluate(() => localStorage.removeItem('tft-guide-meta-days'));
    }
    // 레벨별 보드 위 시너지 줄이 켜진 시너지를 빠뜨리지 않는지 (2026-11-22 사용자: "하트스틸이 위에만 있고 배치판엔 왜 없냐" — 7개 제한에 잘렸음)
    const DBJ = JSON.parse(fs.readFileSync(path.join(SITE, 'db.json'), 'utf8')), STY = JSON.parse(fs.readFileSync(path.join(SITE, 'guides.json'), 'utf8')).styles || {};
    const lvRows = await pg.evaluate(async () => {
      const out = [], codeGap = [], rows = [...document.querySelectorAll('#mt-rows .mt-row.dk')].slice(0, 25);
      for (const r of rows) {
        r.click(); await new Promise(f => setTimeout(f, 60));
        // 팀 코드: 배치판 챔피언이 코드에 들었거나 '빠진 챔피언'으로 알린다 (2026-11-24 사용자: "팀 코드 복사했는데 나서스가 없던데")
        const cb = document.querySelector('#mt-detail .codebtn.big');
        if (cb) {
          const n = (cb.title.slice(2, 32).match(/.{3}/g) || []).filter(x => x !== '000').length, miss = (cb.dataset.miss || '').split(',').filter(Boolean).length;
          const lw = document.querySelector('#mt-detail .lvwrap'), units = new Set([...(lw || document.getElementById('mt-detail')).querySelectorAll('[data-unit]')].map(e => e.dataset.unit));
          if (n + miss < Math.min(units.size, 10)) codeGap.push(`${(r.querySelector('.mt-name') || {}).textContent} 보드 ${units.size} · 코드 ${n} · 알림 ${miss}`);
        }
        const tabs = [...document.querySelectorAll('#mt-detail .lvtabs button')];
        for (const t of tabs) {
          t.click(); await new Promise(f => setTimeout(f, 10));
          const w = t.closest('.lvwrap');
          out.push({ deck: (document.querySelector('#mt-detail h3, #mt-detail .mt-name') || {}).textContent, lv: t.dataset.lv,
            units: [...w.querySelectorAll('[data-unit]')].map(e => e.dataset.unit), traits: [...w.querySelectorAll('.lvbar [data-trait]')].map(e => e.dataset.trait) });
        }
      }
      return { out, codeGap };
    }).then(x => { if (x.codeGap.length) fail(`덱 상세: 팀 코드에서 말없이 빠진 챔피언 (${x.codeGap.slice(0, 3).join(' ; ')})`); return x.out; });
    const lvMiss = [];
    lvRows.forEach(x => {
      const c = {}; [...new Set(x.units)].forEach(u => ((DBJ.units[u] || {}).traits || []).forEach(t => { c[t] = (c[t] || 0) + 1; }));
      Object.keys(c).forEach(t => { const st = (STY[t] || []).filter(y => y[0] != null && c[t] >= y[0]); if (st.length && !x.traits.includes(t)) lvMiss.push(`${(x.deck || '').trim().slice(0, 12)} ${x.lv}렙 ${t}`); });
    });
    if (!lvRows.length) soft('덱 상세: 레벨별 보드가 있는 덱을 못 찾음');
    if (lvMiss.length) fail(`덱 상세: 레벨별 보드 시너지 줄에 켜진 시너지가 빠짐 (${lvMiss.length}곳, 예: ${lvMiss.slice(0, 3).join(', ')})`);
    await pg.close();
  });
  // 업데이트 소식 (2026-11-16 사용자: "업뎃되면 뭐가 업뎃됐는지 한번 띄워"): 새 버전이면 창이 뜨고, 확인을 누르면 닫히고 다시 안 뜬다
  task(['whatsnew'], async () => {
    const pg = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    await pg.route('https://lolche.local/**', async (r) => { const u = new URL(r.request().url());
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      if (u.pathname === '/proxy') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      const f = path.join(SITE, decodeURIComponent(u.pathname)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
    await pg.goto('https://lolche.local/index.html?whatsnew=1'); await pg.waitForSelector('#wn', { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(300);  // 동시에 돌면 느려서 시간 대신 창을 기다린다
    const w = await pg.evaluate(() => { const x = document.getElementById('wn'); if (!x) return null; const c = x.querySelector('.wn-card').getBoundingClientRect(); return { li: x.querySelectorAll('li').length, fits: c.bottom <= innerHeight + 1 && c.right <= innerWidth + 1, sw: document.documentElement.scrollWidth }; });
    if (!w) fail('업데이트 소식: 창이 안 뜸');
    else {
      if (!w.li) fail('업데이트 소식: 내용이 비어 있음');
      if (!w.fits || w.sw > 360) fail('업데이트 소식: 창이 화면 밖으로 넘침');
      await pg.evaluate(() => document.querySelector('#wn .wn-ok').click()); await pg.waitForTimeout(300);
      const after = await pg.evaluate(() => [!!document.getElementById('wn'), localStorage.getItem('tft-guide-seen')]);
      if (after[0] || !after[1]) fail('업데이트 소식: 확인을 눌러도 안 닫히거나 본 것을 기억 못 함');
    }
    if (!fs.existsSync(path.join(SITE, 'changes.json'))) fail('업데이트 소식: site/changes.json 없음 (build.sh의 data_changes.py)');
    // 다시 보기 (2026-11-16 사용자: "실수로 끄면 다시 보고 싶은데"): 더보기 탭 버튼으로 다시 열림
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#more'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(500);
    await pg.evaluate(() => document.getElementById('wn-again')?.click()); await pg.waitForTimeout(1500);
    if (!(await pg.evaluate(() => !!document.querySelector('#wn li')))) fail('업데이트 소식: 더보기의 다시 보기 버튼을 눌러도 안 열림');
    // 줄이지 않고 다 (2026-11-24 사용자: "외 10개 이러지 말고 다 알려줘"): 기록·창에 '외 N건'이 없고, 탭마다 줄 수가 기록과 같다
    const CH = JSON.parse(fs.readFileSync(path.join(SITE, 'changes.json'), 'utf8'));
    const chLines = JSON.stringify(CH).match(/외 \d+건/g) || [];
    if (chLines.length) fail(`업데이트 소식: changes.json에 '외 N건'으로 줄인 줄 ${chLines.length}곳`);
    const wnCut = await pg.evaluate(() => [...document.querySelectorAll('#wn li')].filter(l => /^외 \d+(건|개)$/.test(l.textContent.trim())).length);
    if (wnCut) fail(`업데이트 소식: 창에 '외 N건' 줄 ${wnCut}곳`);
    await pg.close();
  });
  // 게임 위 창(?overlay=1): 앱 바가 숨는데 붙는 머리가 앱 바 높이만큼 내려와 목록 중간에 떠 있던 문제 (2026-11-13)
  task(['meta', 'overlay'], async () => {
    const pg = await b.newPage({ viewport: { width: 540, height: 400 }, colorScheme: 'dark' });
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => true, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    await pg.route('https://lolche.local/**', async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/proxy') { const body = await proxyGet(u.searchParams.get('u') || ''); return r.fulfill({ status: 200, contentType: 'application/json', body }); }
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      const f = path.join(SITE, decodeURIComponent(u.pathname)); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ body: fs.readFileSync(f) });
    });
    await pg.goto('https://lolche.local/index.html?overlay=1'); await pg.waitForTimeout(3000);
    for (const t of ['meta', 'rank']) {
      await pg.evaluate((t) => { const a = document.createElement('a'); a.href = '#' + t; document.body.appendChild(a); a.click(); a.remove(); }, t);
      await pg.waitForTimeout(3000);
      const bad = await pg.evaluate(() => {
        const ab = document.getElementById('appbar'), abh = getComputedStyle(ab).display === 'none' ? 0 : ab.getBoundingClientRect().height;
        const sec = document.querySelector('section:not([hidden])'), out = [];
        sec.querySelectorAll('*').forEach(e => { const cs = getComputedStyle(e); if (cs.position === 'sticky' && e.getBoundingClientRect().height && parseFloat(cs.top) > abh + 1) out.push((e.className || e.tagName) + ' top ' + cs.top); });
        return out;
      });
      if (bad.length) fail(`[게임 위 창] ${t}: 붙는 머리가 맨 위가 아니라 중간에 붙음 (${bad.slice(0, 3).join(', ')})`);
    }
    // 좌우 스크롤바·뒤로 가기 위아래 무빙 (2026-11-25 사용자): 화면 전체는 옆으로 안 밀리고, 스크롤 이동은 애니메이션 없이 바로
    const ovx = await pg.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { ox: cs.overflowX, sb: cs.scrollBehavior }; });
    if (!/hidden|clip/.test(ovx.ox)) fail(`[게임 위 창] 화면 전체가 옆으로 밀릴 수 있음 (html overflow-x=${ovx.ox})`);
    if (ovx.sb === 'smooth') fail('[게임 위 창] 스크롤 이동에 애니메이션이 있음 (뒤로 가기 때 위아래로 움직임)');
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#tfa'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(800);
    await pg.evaluate(() => (document.querySelector('#tfa-list [data-slug]') || document.querySelector('#tfa-rows > *'))?.click()); await pg.waitForTimeout(800);
    const tfaW = await pg.evaluate(() => { window.scrollTo(400, 0); return { x: window.scrollX, det: !document.getElementById('tfa-detail').hidden }; });
    if (tfaW.det && tfaW.x > 0) fail(`[게임 위 창] 아카데미 상세가 옆으로 ${tfaW.x}px 밀림`);
    await pg.close();
  });
  // PC 웹 모드 (1280px): 왼쪽 사이드 메뉴, 앱 전용 UI 숨김, 덱 목록·상세, 프록시 없이 직접 CORS fetch(덱 새로고침·랭킹·전적 검색), #dc 링크 전용, 개인 친구/계정 미노출
  task([...TABS, 'web'], async () => {
    const WEB_ROOT = fs.existsSync(path.join(__dirname, '..', 'build', 'web', 'index.html')) ? path.join(__dirname, '..', 'build', 'web') : SITE;
    const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      let p = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
      if (p === '/index.html' && WEB_ROOT === SITE) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8'));
        return;
      }
      const f = path.join(WEB_ROOT, p);
      if (!f.startsWith(WEB_ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark', ignoreHTTPSErrors: true });
    const pg = await ctx.newPage();
    const errs = [], proxyHits = [], directHosts = new Set();
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('request', r => {
      const u = r.url();
      if (/\/proxy(\?|$)/.test(u)) proxyHits.push(u);
      if (u.startsWith('https://')) { try { directHosts.add(new URL(u).hostname); } catch (e) {} }
    });
    if (FAST) await pg.route('https://**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    try {
      await pg.goto(`http://127.0.0.1:${port}/`); await pg.waitForTimeout(FAST ? 1200 : 3500);
      const go = (t) => pg.evaluate((t) => { const a = document.createElement('a'); a.href = '#' + t; document.body.appendChild(a); a.click(); a.remove(); window.scrollTo(0, 0); }, t);
      const init = await pg.evaluate(() => ({
        web: document.body.classList.contains('web'),
        bubHid: document.getElementById('ab-bubble').hidden,
        moreAppHid: document.getElementById('more-app').hidden,
        mtBtnHid: document.getElementById('mt-upd-btn').hidden,
        mtBtnTxt: document.getElementById('mt-upd-btn').textContent.trim(),
        nav: document.querySelector('.bnav').getBoundingClientRect().toJSON(),
        extra: document.querySelector('.pc-side-extra').getBoundingClientRect().toJSON(),
      }));
      if (!init.web) fail('[WEB/1280] body.web 클래스가 안 붙음');
      if (!init.bubHid || !init.moreAppHid) fail('[WEB/1280] 앱 전용 버튼(떠 있는 버튼·앱 기능)이 숨겨지지 않음');
      if (init.mtBtnHid || init.mtBtnTxt !== '새로고침') fail(`[WEB/1280] 덱 새로고침 버튼 이상 (hidden=${init.mtBtnHid}, text=${init.mtBtnTxt})`);
      if (init.nav.left > 1 || init.nav.width > 260 || init.nav.height < 400) fail(`[WEB/1280] 왼쪽 사이드 메뉴 배치 이상 (${Math.round(init.nav.width)}x${Math.round(init.nav.height)})`);
      if (init.extra.width < 150 || init.extra.height < 100) fail('[WEB/1280] 사이드바 도감·도구 바로가기가 안 보임');

      for (const t of TABS.filter(needWeb)) {
        errs.length = 0;
        await go(t); await pg.waitForTimeout(FAST ? 300 : (['rank', 'esports', 'power'].includes(t) ? 2500 : 700));
        const r = await pg.evaluate(() => {
          const sec = document.querySelector('section:not([hidden])'), o = { sw: document.documentElement.scrollWidth, broken: [], hid: [], tiny: [], text: sec ? sec.innerText.length : 0 };
          if (!sec) return o;
          const SKIP_FS = '.sr-title, .st, .dk-st, .pcdk-st, .tfa-u3 b, .s19-lock, .s19-bslot .x, svg, svg *';
          sec.querySelectorAll('*').forEach(e => {
            if (e.hasAttribute('hidden') && getComputedStyle(e).display !== 'none') o.hid.push(e.id || e.className);
            if (!e.closest('[hidden]') && !e.matches(SKIP_FS) && !e.closest(SKIP_FS)) {
              const rc = e.getBoundingClientRect();
              if (rc.width > 0 && rc.height > 0 && [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim().length > 0)) {
                const fs = parseFloat(getComputedStyle(e).fontSize);
                if (fs < 12) o.tiny.push(`${e.tagName.toLowerCase()}.${String(e.className || '').trim().replace(/\s+/g, '.')}(${fs}px)`);
              }
            }
          });
          sec.querySelectorAll('img').forEach(i => { if (i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width) o.broken.push(i.getAttribute('src')); });
          o.bad = (sec.innerText.match(/\bundefined\b|\bNaN\b/g) || []).length;
          return o;
        });
        if (r.bad) fail(`[WEB/1280] ${t}: 화면에 undefined·NaN 글자 ${r.bad}개`);
        if (r.sw > 1280) fail(`[WEB/1280] ${t}: 화면보다 넓음 ${r.sw}px (가로 밀림)`);
        if (r.broken.length) fail(`[WEB/1280] ${t}: 깨진 이미지 ${[...new Set(r.broken)].slice(0, 3).join(', ')}`);
        if (r.hid.length) fail(`[WEB/1280] ${t}: 숨겼는데 보임 ${r.hid.slice(0, 3).join(', ')}`);
        if (r.tiny.length) fail(`[WEB/1280] ${t}: 12px 미만 글자 ${[...new Set(r.tiny)].slice(0, 4).join(', ')}`);
        if (r.text < 40 && await pg.evaluate((t) => /새 시즌 내용은 준비 중/.test((document.getElementById(t) || {}).textContent || ''), t)) notes.push(`[WEB/1280] ${t}: 새 시즌 공략 미작성`);
        else if (r.text < 40) fail(`[WEB/1280] ${t}: 내용이 거의 없음 (${r.text}자)`);
        if (errs.length) fail(`[WEB/1280] ${t}: 페이지 오류 ${errs.slice(0, 2).join(' ; ')}`);
      }

      if (['items'].some(needWeb)) {
      // 아이템 티어표 머리줄 정렬 확인 (넓은 화면에서 머리줄이 왼쪽 절반에 쏠리지 않아야 함)
      await go('items'); await pg.waitForTimeout(500);
      const itAl = await pg.evaluate(() => {
        const h = document.querySelector('#items .it-head'), r = document.querySelector('#items .it-row');
        return h && r ? { hw: Math.round(h.getBoundingClientRect().width), rw: Math.round(r.getBoundingClientRect().width) } : null;
      });
      if (!itAl || Math.abs(itAl.hw - itAl.rw) > 12) fail(`[WEB/1280] 아이템 티어표 머리줄 폭 어긋남 (head=${itAl && itAl.hw}px, row=${itAl && itAl.rw}px)`);

      }
      if (['s19'].some(needWeb)) {
      // v3.0.0 도감 탭 (PC): 챔피언 카드가 넓게 깔리고 가로 밀림이 없어야 (덱 PC 줄 검사는 #meta로 옮김)
      await go('s19'); await pg.waitForTimeout(500);
      const dx = await pg.evaluate(() => ({ n: document.querySelectorAll('#s19-out .s19-uc').length, sw: document.documentElement.scrollWidth }));
      if (dx.n < 60 || dx.sw > 1280) fail(`[WEB/1280] 도감: 챔피언 ${dx.n}개, 폭 ${dx.sw}px`);
      }
      if (['units'].some(needWeb)) {
      await go('units'); await pg.waitForTimeout(500);
      const unW = await pg.evaluate(() => {
        const h = document.querySelector('#units .un-head'), r = document.querySelector('#units .un-row');
        const visCols = h ? [...h.children].filter(x => getComputedStyle(x).display !== 'none').length : 0;
        const pcIts = r ? r.querySelectorAll('.un-its-pc img').length : 0;
        return { n: document.querySelectorAll('#un-rows .un-row').length, visCols, pcIts, sw: document.documentElement.scrollWidth };
      });
      if (unW.n < 60 || unW.visCols !== 6 || unW.pcIts < 1 || unW.sw > 1280) fail(`[WEB/1280] 챔피언 통계(#units): 표 레이아웃 이상 (${JSON.stringify(unW)})`);
      }
      if (['meta'].some(needWeb)) {
      // 메타 덱 PC 줄 + 펼치기 + 직접 fetch 새로고침 (2026-11-21: 오른쪽 상세 칸 대신 MetaTFT처럼 줄 아래로 펼침)
      await go('meta'); await pg.waitForTimeout(800);
      // PC 덱 줄 안의 챔피언(.pcdk-u)을 누르면 덱 아코디언 대신 챔피언 통계·삼신기 시트가 열려야 함
      const pcuClick = await pg.evaluate(() => {
        const u = document.querySelector('#mt-rows .pcdk .pcdk-u[data-unit]');
        if (!u) return null;
        u.click();
        const sh = document.getElementById('sheet');
        const res = { open: !!(sh && !sh.hidden), trios: sh ? sh.querySelectorAll('.ust-gt.ust-row').length : 0, dkOpen: document.querySelectorAll('#mt-rows .pcdk-open').length };
        document.querySelector('#sheet .sh-btn[aria-label="닫기"]')?.click();
        return res;
      });
      if (!pcuClick || !pcuClick.open || pcuClick.trios < 1 || pcuClick.dkOpen) fail(`[WEB/1280] 메타 덱 PC 줄 챔피언 클릭: 시트/삼신기 이상 (${JSON.stringify(pcuClick)})`);
      const mt2 = await pg.evaluate(() => { const r = [...document.querySelectorAll('#mt-rows .pcdk')], f = r[0]; return { n: r.length, units: f ? f.querySelectorAll('.pcdk-u img').length : 0, stats: f ? [...f.querySelectorAll('.pcdk-stats small')].map(x => x.textContent).join(',') : '', sw: document.documentElement.scrollWidth,
        clip: r.filter(x => { const b = x.querySelector('.pcdk-units'), l = b && b.lastElementChild; return l && l.getBoundingClientRect().right > b.getBoundingClientRect().right + 1; }).length }; });
      if (mt2.n < 15 || mt2.units < 5 || mt2.stats !== '평균 등수,선택률,승률,순방률') fail(`[WEB/1280] 메타 덱: PC 줄 모양이 아님 (${JSON.stringify(mt2)})`);
      if (mt2.clip) fail(`[WEB/1280] 메타 덱: 챔피언이 줄 밖으로 잘린 줄 ${mt2.clip}개`);
      if (!(await pg.evaluate(() => document.querySelectorAll('#mt-rows .pcdk .gd-badge').length))) fail('[WEB/1280] 메타 덱: PC 줄에 가이드 표시(.gd-badge)가 없음');
      if (JSON.parse(fs.readFileSync(path.join(SITE, 'meta.json'), 'utf8')).pbe && !(await pg.evaluate(() => document.querySelectorAll('#mt-rows .pcdk .lk').length))) fail('[WEB/1280] 메타 덱: PC 줄에 해금 챔피언 자물쇠가 없음');
      // 숫자 4칸 색 (2026-11-21 사용자: "덱탭 색깔도 칠해줘, 평등이랑"): 값마다 색이 달라야 (흰 글자 그대로면 실패)
      const mtCol = await pg.evaluate(() => { const f = document.querySelector('#mt-rows .pcdk'); if (!f) return null; const bs = [...f.querySelectorAll('.pcdk-stats b')], ink = getComputedStyle(f.querySelector('.pcdk-name .mt-name')).color;
        return { graded: bs.filter(x => x.classList.contains('dk-grad')).length, plain: bs.filter(x => getComputedStyle(x).color === ink).length }; });
      if (!mtCol || mtCol.graded < 4 || mtCol.plain) fail(`[WEB/1280] 메타 덱: 평균 등수·선택률·승률·순방률 숫자에 색이 안 칠해짐 (${JSON.stringify(mtCol)})`);
      // 운영 칩·글자 가독성 (2026-11-21 사용자: "5렙 리롤 같은 표시 강조, 색깔", "폰트 가독성"): 칩에 색, PC는 자간을 안 좁히고 글자 복사 가능
      const mtTy = await pg.evaluate(() => { const c = [...document.querySelectorAll('#mt-rows .pcdk-chip')], bs = getComputedStyle(document.body);
        return { chips: c.length, styled: c.filter(x => /\bst-(r5|r6|r7|f8|f9|std)\b/.test(x.className)).length, bg: c[0] ? getComputedStyle(c[0]).backgroundColor : '', ls: bs.letterSpacing, sel: bs.userSelect || bs.webkitUserSelect }; });
      if (mtTy.chips < 20 || mtTy.styled < 10 || /rgba\(0, 0, 0, 0\)|transparent/.test(mtTy.bg)) fail(`[WEB/1280] 메타 덱: 운영 방식 칩(리롤·운영)이 안 보이거나 색이 없음 (${JSON.stringify(mtTy)})`);
      if (mtTy.ls !== 'normal' && mtTy.ls !== '0px') fail(`[WEB/1280] PC 글자 자간이 좁혀져 있음 (${mtTy.ls})`);
      if (mtTy.sel === 'none') fail('[WEB/1280] PC에서 글자를 선택·복사할 수 없음 (user-select: none)');
      await pg.evaluate(() => document.querySelectorAll('#mt-rows .pcdk')[1]?.click()); await pg.waitForTimeout(500);
      const mt2b = await pg.evaluate(() => { const o = document.querySelector('#mt-rows .pcdk-open'); return { open: document.querySelectorAll('#mt-rows .pcdk-open').length, after: !!(o && o.previousElementSibling === document.querySelectorAll('#mt-rows .pcdk')[1]), hex: o ? o.querySelectorAll('#mt-detail .hexboard .hx').length : 0, code: !!(o && o.querySelector('.codebtn')) }; });
      if (mt2b.open !== 1 || !mt2b.after || mt2b.hex < 20 || !mt2b.code) fail(`[WEB/1280] 메타 덱: 누른 줄 아래로 상세(배치판·팀 코드)가 안 펼쳐짐 (${JSON.stringify(mt2b)})`);
      await pg.evaluate(() => document.querySelectorAll('#mt-rows .pcdk')[1]?.click()); await pg.waitForTimeout(300);
      if (await pg.evaluate(() => document.querySelectorAll('#mt-rows .pcdk-open').length)) fail('[WEB/1280] 메타 덱: 펼친 줄을 다시 눌러도 안 접힘');
      // 정렬을 바꿔 목록을 다시 그려도 상세(#mt-detail)가 사라지지 않아야 (펼친 칸에 옮겨 둔 채 지우면 같이 지워짐)
      await pg.evaluate(() => document.querySelectorAll('#mt-rows .pcdk')[0]?.click()); await pg.waitForTimeout(300);
      await pg.evaluate(() => { const s = document.getElementById('mt-sort'); s.value = 'win'; s.dispatchEvent(new Event('change')); }); await pg.waitForTimeout(400);
      if (!(await pg.evaluate(() => !!document.getElementById('mt-detail')))) fail('[WEB/1280] 메타 덱: 정렬을 바꾸면 상세 칸이 사라짐');
      await pg.evaluate(() => { const s = document.getElementById('mt-sort'); s.value = 'avg'; s.dispatchEvent(new Event('change')); }); await pg.waitForTimeout(300);
      // v2.3.2 PC 가독성: 덱 줄 챔피언 아이콘이 줄 밖으로 잘리지 않는지(8명 덱), 배치판 이름 12px·별 11px 이상, 스크롤바가 얇은 막대인지
      const pcr = await pg.evaluate(() => {
        const clip = [], small = [];
        document.querySelectorAll('#meta .dk .mt-strip').forEach(s => { const r = s.getBoundingClientRect(), l = s.lastElementChild; if (r.width && l && l.getBoundingClientRect().right > r.right + 0.5) clip.push((s.closest('.dk').querySelector('.mt-name') || {}).textContent); });
        document.querySelectorAll('#meta .hxn, #meta .hxwrap .st, #meta .dk-st, #meta .tfa-u3 b').forEach(e => { const f = parseFloat(getComputedStyle(e).fontSize), min = e.classList.contains('hxn') ? 12 : 11; if (e.offsetParent && f < min) small.push(e.className + ' ' + f + 'px'); });
        return { clip, small, sb: getComputedStyle(document.documentElement).scrollbarWidth };
      });
      if (pcr.clip.length) fail(`[WEB/1280] 덱 줄 챔피언 아이콘이 잘림: ${pcr.clip.slice(0, 3).join(', ')}`);
      if (pcr.small.length) fail(`[WEB/1280] 배치판 이름·별 글자가 작음: ${[...new Set(pcr.small)].slice(0, 3).join(', ')}`);
      if (pcr.sb !== 'thin') fail(`[WEB/1280] 스크롤바가 기본 굵은 막대 (scrollbar-width=${pcr.sb})`);
      if (!FAST) {
        await pg.evaluate(() => document.getElementById('mt-upd-btn')?.click()); await pg.waitForTimeout(3500);
        if (!directHosts.has('api-hc.metatft.com')) fail('[WEB/1280] 덱 새로고침: api-hc.metatft.com 직접 fetch가 일어나지 않음');
      }

      }
      if (['tfa'].some(needWeb)) {
      // TFT 아카데미 2단 보기
      await go('tfa'); await pg.waitForTimeout(700);
      const tf2 = await pg.evaluate(() => ({ lVis: !document.getElementById('tfa-list').hidden, dVis: !document.getElementById('tfa-detail').hidden, hex: document.querySelectorAll('#tfa-detail .hexboard .hx').length }));
      if (!tf2.lVis || !tf2.dVis || tf2.hex < 20) soft(`[WEB/1280] TFT 아카데미 2단 레이아웃 이상 (list=${tf2.lVis}, det=${tf2.dVis}, hex=${tf2.hex})`);

      }
      if (!FAST && ['rank'].some(needWeb)) {
      // 직접 fetch로 한국 랭킹 + 전적 검색 + 개인 계정/친구 미노출 확인
      await go('rank'); await pg.waitForTimeout(4000);
      if (await pg.evaluate(() => document.querySelectorAll('#rk-rows .rk-row').length) < 30) soft('[WEB/1280] 한국 랭킹: 직접 fetch로 30줄 미만');
      if (!directHosts.has('api.metatft.com') || !directHosts.has('tft.dakgg.io')) fail('[WEB/1280] 한국 랭킹: MetaTFT/롤체지지 직접 fetch가 일어나지 않음');
      await pg.evaluate(() => { document.querySelector('#rk-seg [data-v=search]').click(); }); await pg.waitForTimeout(400);
      if (await pg.evaluate(() => /내 계정|Synow#KR1/.test(document.getElementById('rk-sug').textContent))) fail('[WEB/1280] 전적 검색: 공개 웹인데 개인 "내 계정(Synow#KR1)"이 노출됨');
      await pg.evaluate(() => { const i = document.getElementById('rk-q'); i.value = 'Synow#KR1'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
      await pg.waitForSelector('.rk-gm', { timeout: 45000 }).catch(() => soft('[WEB/1280] 전적 검색: 직접 fetch로 판 카드가 안 나옴'));
      await pg.waitForTimeout(2000);
      if (await pg.evaluate(() => document.documentElement.scrollWidth) > 1280) fail('[WEB/1280] 전적 검색: 화면보다 넓음 (가로 밀림)');

      }
      if (['friends'].some(needWeb)) {
      // 친구 탭: 공개 웹에서 개인 기본 친구 목록이 보이지 않아야 함
      await go('friends'); await pg.waitForTimeout(600);
      if (await pg.evaluate(() => document.querySelectorAll('#fr-cards .fr-card').length) > 0) fail('[WEB/1280] 친구 탭: 공개 웹인데 기본 친구 목록이 노출됨');

      }
      if (['dc'].some(needWeb)) {
      // #dc: CORS 차단으로 목록 대신 m.dcinside.com/board/tft 링크만 노출
      await go('dc'); await pg.waitForTimeout(500);
      const dcw = await pg.evaluate(() => ({
        barHid: document.querySelector('#dc .dc-bar').hidden,
        rows: document.querySelectorAll('#dc-list li a').length,
        link: (document.querySelector('#dc a[href="https://m.dcinside.com/board/tft"]') || {}).href || '',
      }));
      if (!dcw.barHid || dcw.rows > 0 || !dcw.link) fail(`[WEB/1280] 롤체갤: 링크 전용 화면이 아님 (barHid=${dcw.barHid}, rows=${dcw.rows}, link=${dcw.link})`);
      }

      if (proxyHits.length) fail(`[WEB/1280] 프록시(/proxy)를 ${proxyHits.length}번 호출함 (${proxyHits[0]})`);
    } finally {
      await ctx.close();
      srv.close();
    }
  });
  // 회귀 검사 (2026-11-26): ① 18시즌 본섭 전적·덱파워·랭킹에 19시즌 전용 이름·덱·아이콘 혼입 금지, ② 비프리즘·고유 시너지에 프리즘 색(.s-chromatic/.st5/.lv4) 금지
  task(['rank', 'power', 'friends', 'meta', 's19', 'builder'], async () => {
    const M = JSON.parse(fs.readFileSync(path.join(SITE, 'meta.json'), 'utf8'));
    const G = JSON.parse(fs.readFileSync(path.join(SITE, 'guides.json'), 'utf8'));
    const S = JSON.parse(fs.readFileSync(path.join(SITE, 's19.json'), 'utf8'));
    // 정적 데이터 검사: 19시즌 퀘스트 프리즘(HEARTSTEEL 7·True Damage 5·펜타킬 7)과 고유 특성은 보드만으로 프리즘(chromatic/5)이 되면 안 됨
    const badGuideCh = [];
    for (const d of G.decks || []) {
      for (const s of d.syn || []) if (s.style === 'chromatic' && /^(HEARTSTEEL|True Damage|펜타킬)$/.test(s.t)) badGuideCh.push(`${d.name}:${s.t}${s.n}`);
      for (const lv of Object.values(d.levels || {})) for (const s of lv.syn || []) if (s.style === 'chromatic' && /^(HEARTSTEEL|True Damage|펜타킬)$/.test(s.t)) badGuideCh.push(`${d.name}:${s.t}${s.n}`);
    }
    if (badGuideCh.length) fail('guides.json: 퀘스트 프리즘 조건 없는 보드에 chromatic 지정 ' + badGuideCh.slice(0, 4).join(', '));
    const uniqNames = new Set((S.traits || []).filter(t => t.uniq).map(t => t.n));
    const badS19Ch = [];
    for (const sec of ['decks', 'guides']) {
      for (const d of S[sec] || []) {
        for (const t of d.t || []) {
          if (t[2] === 5 && (/^(HEARTSTEEL|True Damage|펜타킬)$/.test(t[0]) || uniqNames.has(t[0]))) badS19Ch.push(`${d.n}:${t[0]}${t[1]}`);
        }
      }
    }
    if (badS19Ch.length) fail('s19.json: 비프리즘·고유 시너지에 프리즘(5) 지정 ' + badS19Ch.slice(0, 4).join(', '));

    const _old18 = JSON.parse(fs.readFileSync(path.join(SITE, 'oldsets.json'), 'utf8'));
    const _u18Set = new Set(Object.entries(_old18.u || {}).filter(([k]) => /18/.test(k)).map(([, v]) => v[0]));
    const _t18Set = new Set(Object.entries(_old18.t || {}).filter(([k]) => /18/.test(k)).map(([, v]) => v[0]));
    const _u19Only = (S.units || []).map(u => u.n).filter(n => !_u18Set.has(n));
    const _t19Only = (S.traits || []).map(t => t.n).filter(n => !_t18Set.has(n));

    // 브라우저 모의 테스트 (네트워크 없이 --fast에서도 항상 실행)
    const now = Date.now();
    const mockUnits = [
      { character_id: 'DA_18_Yunara', tier: 2, items: ['DA_GuinsoosRageblade', 'DA_InfinityEdge'] },
      { character_id: 'DA_18_Ahri', tier: 2, items: ['DA_JeweledGauntlet', 'DA_SpearOfShojin'] },
      { character_id: 'DA_18_Akali_AP', tier: 2, items: ['DA_HextechGunblade'] },
      { character_id: 'DA_18_Lux', tier: 2, items: [] },
      { character_id: 'DA_18_Ashe', tier: 2, items: [] },
      { character_id: 'DA_18_Riven', tier: 2, items: [] },
      { character_id: 'DA_18_Kindred', tier: 2, items: [] },
      { character_id: 'DA_18_Maokai', tier: 2, items: [] },
    ];
    const mockMatches = {
      summoners: [{ puuid: 'p1', gameName: 'TestS18', tagLine: 'KR1' }],
      summonerLeagues: [{ puuid: 'p1', queueId: 1100, tier: 'DIAMOND', rank: 'I', leaguePoints: 50 }],
      matches: [
        {
          season: 'set18', shard: 'kr', matchId: 900001, gameCreatedAt: now - 3600000, gameLength: 2000,
          gameVersion: '18.7', patchVersion: '18.7', queueId: 1100,
          participants: [{
            puuid: 'p1', placement: 2, level: 8, timeEliminated: 2000, units: mockUnits,
            // Riot Match-v1 / dak.gg 실제 style: 1 동 · 2 은 · 3 고유 · 4 금 · 5 프리즘 · 6 특수(일월식)
            traits: [
              { name: 'DA_18_Brawler', num_units: 6, tier_current: 3, tier_total: 3, style: 4 },
              { name: 'DA_18_Elderwood', num_units: 7, tier_current: 3, tier_total: 5, style: 4 },
              { name: 'DA_18_Spellweaver', num_units: 4, tier_current: 2, tier_total: 3, style: 2 },
              { name: 'DA_18_LuxUniqueTrait', num_units: 1, tier_current: 1, tier_total: 1, style: 3 },
              { name: 'DA_18_Maokai_UniqueTrait', num_units: 1, tier_current: 1, tier_total: 1, style: 3 },
              { name: 'DA_18_Eclipse', num_units: 0, tier_current: 1, tier_total: 1, style: 6 },
            ],
          }],
        },
        {
          season: 'set18', shard: 'kr', matchId: 900002, gameCreatedAt: now - 7200000, gameLength: 2100,
          gameVersion: '18.7', patchVersion: '18.7', queueId: 1100,
          participants: [{
            puuid: 'p1', placement: 1, level: 9, timeEliminated: 2100, units: mockUnits,
            traits: [
              { name: 'DA_18_Elderwood', num_units: 11, tier_current: 5, tier_total: 5, style: 5 },
              { name: 'DA_18_Greenfather', num_units: 1, tier_current: 1, tier_total: 1, style: 3 },
            ],
          }],
        },
      ],
      meta: { totalCount: 2 },
    };
    const mockProfile = {
      summoner: { puuid: 'p1', gameName: 'TestS18', tagLine: 'KR1', summonerLevel: 100, syncedAt: new Date().toISOString() },
      summonerLeagues: [{ queueId: 1100, tier: 'DIAMOND', rank: 'I', leaguePoints: 50 }],
      summonerSeasonPlacements: [{ queueId: 1100, values: [1, 1, 0, 0, 0, 0, 0, 0] }],
      summonerSeasons: [],
    };
    const pg = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    await pg.route('https://lolche.local/**', async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      if (u.pathname === '/proxy') {
        const tu = u.searchParams.get('u') || '';
        if (/\/profile\?/.test(tu)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockProfile) });
        if (/\/matches\?/.test(tu)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockMatches) });
        if (/\/league-logs\?/.test(tu)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summonerLeagueLogs: [], meta: { totalCount: 0 } }) });
        return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
      const f = path.join(SITE, decodeURIComponent(u.pathname));
      return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' });
    });
    const errs = []; pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto('https://lolche.local/index.html'); await pg.waitForTimeout(1600);

    // ① 18시즌 모의 전적 검색: 19시즌 이름 금지 + style=4(금)·style=3(고유)·style=6(일월식)에 s-chromatic 금지 + style=5(나무정령 11)는 s-chromatic 허용
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#rank'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(400);
    await pg.evaluate(() => { document.querySelector('#rk-seg [data-v=search]').click(); const i = document.getElementById('rk-q'); i.value = 'TestS18#KR1'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
    await pg.waitForSelector('.rk-gm', { timeout: 10000 }).catch(() => fail('회귀 검사: 모의 18시즌 전적 카드가 안 그려짐'));
    await pg.waitForTimeout(500);
    const s18res = await pg.evaluate(({ u19, t19 }) => {
      const uSet = new Set(u19), tSet = new Set(t19);
      const prof = document.getElementById('rk-prof');
      const badU = [...prof.querySelectorAll('.mu .nm, .pchips .u')].map(e => e.textContent.trim()).filter(n => uSet.has(n));
      const badT = [...prof.querySelectorAll('.trx')].map(e => e.dataset.trait || '').filter(n => tSet.has(n));
      const badDk = [...prof.querySelectorAll('.gm-dk b, .rk-dk b')].map(e => e.textContent.trim()).filter(tx => t19.some(t => tx.includes(t)) || u19.some(u => tx.split(/\s+/).includes(u)));
      const cards = [...document.querySelectorAll('#rk-prof .rk-gm')];
      const c0 = cards[0] ? [...cards[0].querySelectorAll('.trx')].map(e => ({ t: e.dataset.trait, n: (e.querySelector('b') || {}).textContent, cls: e.className })) : [];
      const c1 = cards[1] ? [...cards[1].querySelectorAll('.trx')].map(e => ({ t: e.dataset.trait, n: (e.querySelector('b') || {}).textContent, cls: e.className })) : [];
      const s19imgs = [...prof.querySelectorAll('img')].filter(i => /icons\/s19\//.test(i.getAttribute('src') || '')).length;
      return { bad: [...new Set([...badU, ...badT, ...badDk])], c0, c1, s19imgs };
    }, { u19: _u19Only, t19: _t19Only });
    if (s18res.bad.length) fail('회귀 검사 ①: 18시즌 모의 전적에 19시즌 전용 이름이 섞임 ' + s18res.bad.slice(0, 4).join(', '));
    if (s18res.s19imgs) fail(`회귀 검사 ①: 18시즌 모의 전적에 19시즌 아이콘(${s18res.s19imgs}개)이 섞임`);
    if (s18res.c0.some(x => /s-chromatic/.test(x.cls))) fail('회귀 검사 ②: 18시즌 비프리즘(style=4 금·style=3 고유·style=6 일월식)에 s-chromatic이 붙음 ' + JSON.stringify(s18res.c0));
    if (!s18res.c0.some(x => x.t === '싸움꾼' && /s-gold/.test(x.cls)) || !s18res.c0.some(x => x.t === '나무정령' && x.n === '7' && /s-gold/.test(x.cls))) fail('회귀 검사 ②: 18시즌 style=4 시너지가 s-gold로 표시되지 않음 ' + JSON.stringify(s18res.c0));
    if (s18res.c0.some(x => x.t === '화신' || x.t === '고목')) fail('회귀 검사 ②: 18시즌 style=3 고유 특성이 unique로 분류되지 않음 ' + JSON.stringify(s18res.c0));
    if (!s18res.c1.some(x => x.t === '나무정령' && x.n === '11' && /s-chromatic/.test(x.cls))) fail('회귀 검사 ②: 18시즌 진짜 프리즘(style=5 나무정령 11)에 s-chromatic이 안 붙음 ' + JSON.stringify(s18res.c1));

    // ② 덱 탭(#meta): HEARTSTEEL 7·True Damage 5·펜타킬 7 및 고유 특성에 s-chromatic 금지
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#meta'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(500);
    const metaCh = await pg.evaluate(() => {
      const bad = [];
      const rows = [...document.querySelectorAll('#mt-rows .mt-row.dk')].filter(r => /HEARTSTEEL|True Damage|펜타킬/.test(r.innerText || '')).slice(0, 4);
      rows.forEach(r => {
        r.click();
        document.querySelectorAll('#mt-detail .trx.s-chromatic').forEach(e => {
          const t = e.dataset.trait || '', n = (e.querySelector('b') || {}).textContent || '';
          if (/^(HEARTSTEEL|True Damage|펜타킬)$/.test(t)) bad.push(t + n);
        });
      });
      return bad;
    });
    if (metaCh.length) fail('회귀 검사 ②: 덱 상세에서 퀘스트 프리즘(HEARTSTEEL 7·True Damage 5·펜타킬 7)에 s-chromatic이 붙음 ' + metaCh.join(', '));

    // ③ 19시즌 도감 스쿼드 빌더(#s19 builder): 고유 특성은 st6(비프리즘), 7 HEARTSTEEL/5 True Damage/7 펜타킬은 st4(골드, st5 금지)
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#s19'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(500);
    await pg.evaluate(() => { document.querySelector('#s19-view [data-v=builder]').click(); }); await pg.waitForTimeout(350);
    await pg.evaluate(() => { document.querySelector('#s19-out .s19-bclr')?.click(); }); await pg.waitForTimeout(200);
    const bldCh = await pg.evaluate((S19data) => {
      const uniq = new Set((S19data.traits || []).filter(t => t.uniq).map(t => t.n));
      // HEARTSTEEL 챔피언 7명(또는 최대) + 고유 특성 챔피언 담기
      const picks = (S19data.units || []).filter(u => (u.t || []).includes('HEARTSTEEL')).slice(0, 7);
      const uniqU = (S19data.units || []).find(u => (u.t || []).some(t => uniq.has(t)));
      if (uniqU && !picks.some(x => x.k === uniqU.k)) picks.push(uniqU);
      const btns = [...document.querySelectorAll('#s19-out .s19-bpick')];
      picks.forEach(u => { const b = btns.find(x => (x.textContent || '').trim() === u.n); if (b) b.click(); });
      const pills = [...document.querySelectorAll('#s19-out .s19-bspill')].map(p => ({ n: (p.querySelector('span:not(.s19-ti)') || {}).textContent || '', cls: p.className }));
      const badSt5 = pills.filter(p => /\bst5\b/.test(p.cls) && (p.n === 'HEARTSTEEL' || uniq.has(p.n)));
      const badUniq = pills.filter(p => uniq.has(p.n) && !/\bst6\b/.test(p.cls));
      document.querySelector('#s19-out .s19-bclr')?.click();
      return { pills, badSt5, badUniq };
    }, S);
    if (bldCh.badSt5.length) fail('회귀 검사 ②: 도감 빌더에서 비프리즘·고유 시너지에 st5(프리즘)가 붙음 ' + JSON.stringify(bldCh.badSt5));
    if (bldCh.badUniq.length) fail('회귀 검사 ②: 도감 빌더에서 고유 시너지가 st6이 아님 ' + JSON.stringify(bldCh.badUniq));

    // ④ 챔피언 통계(#units) 및 스미치 삼신기·아이템 통계 검사 (2026-11-26)
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#units'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(500);
    const unStat = await pg.evaluate(() => {
      const rows = [...document.querySelectorAll('#un-rows .un-row')];
      const smeech = rows.find(r => (r.querySelector('.un-nm b') || {}).textContent === '스미치');
      return { total: rows.length, hasSmeech: !!smeech, sw: document.documentElement.scrollWidth };
    });
    if (unStat.total < 60 || !unStat.hasSmeech) fail(`챔피언 통계(#units): 목록 이상 (rows=${unStat.total}, smeech=${unStat.hasSmeech})`);
    if (unStat.sw > 360) fail(`챔피언 통계(#units): 화면보다 넓음 ${unStat.sw}px`);
    // 스미치 클릭 -> 시트에 KPI 4칸 + 삼신기 3개 이상 + 추천 아이템 5개 이상 + 인기순/평균순 전환
    await pg.evaluate(() => {
      const r = [...document.querySelectorAll('#un-rows .un-row')].find(x => (x.querySelector('.un-nm b') || {}).textContent === '스미치');
      if (r) r.click();
    }); await pg.waitForTimeout(400);
    const shRes = await pg.evaluate(() => {
      const sh = document.getElementById('sheet');
      if (!sh || sh.hidden) return null;
      const trios = sh.querySelectorAll('.ust-gt.ust-row').length;
      const items = sh.querySelectorAll('.ust-gi.ust-row').length;
      const kpi = sh.querySelectorAll('.ust-kpi .ust-k').length;
      const firstTrio = (sh.querySelector('.ust-gt.ust-row .ust-tnm') || {}).textContent || '';
      const avgBtn = [...sh.querySelectorAll('.ust-tog button')].find(b => b.textContent === '평균순');
      if (avgBtn) avgBtn.click();
      const afterSort = (sh.querySelector('.ust-gt.ust-row .ust-tnm') || {}).textContent || '';
      return { kpi, trios, items, firstTrio, afterSort, sw: sh.scrollWidth, cw: sh.clientWidth };
    });
    if (!shRes || shRes.kpi !== 4 || shRes.trios < 3 || shRes.items < 5) fail('챔피언 시트(스미치): 통계·삼신기 누락 ' + JSON.stringify(shRes));
    if (shRes && shRes.sw > shRes.cw + 2) fail(`챔피언 시트(스미치): 가로 밀림 ${shRes.sw}>${shRes.cw}`);
    await pg.evaluate(() => { document.querySelector('#sheet .sh-btn[aria-label="닫기"]')?.click(); }); await pg.waitForTimeout(250);

    // ⑤ 도감(#s19)에서 스미치 클릭 -> s19OpenUnit 안에도 삼신기·아이템 통계 노출 + 아이템 탭 시 시트가 위에 열림
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#s19'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(400);
    await pg.evaluate(() => { document.querySelector('#s19-view [data-v=units]')?.click(); }); await pg.waitForTimeout(350);
    await pg.evaluate(() => {
      const c = [...document.querySelectorAll('#s19-out .s19-uc')].find(x => (x.querySelector('.s19-ucn b') || {}).textContent === '스미치');
      if (c) c.click();
    }); await pg.waitForTimeout(400);
    const fsRes = await pg.evaluate(() => {
      const fv = document.querySelector('.fs-view');
      if (!fv) return null;
      const trios = fv.querySelectorAll('.ust-gt.ust-row').length;
      const items = fv.querySelectorAll('.ust-gi.ust-row').length;
      const kpi = fv.querySelectorAll('.ust-kpi .ust-k').length;
      const firstIt = fv.querySelector('.ust-tics img[data-item]');
      if (firstIt) firstIt.click();
      const sh = document.getElementById('sheet');
      const shZ = sh ? +getComputedStyle(sh).zIndex : 0;
      const fvZ = +getComputedStyle(fv).zIndex;
      return { kpi, trios, items, shOpen: !!(sh && !sh.hidden), above: shZ > fvZ };
    });
    if (!fsRes || fsRes.kpi !== 4 || fsRes.trios < 3 || fsRes.items < 5) fail('도감 챔피언 상세(스미치): 통계·삼신기 누락 ' + JSON.stringify(fsRes));
    if (fsRes && (!fsRes.shOpen || !fsRes.above)) fail('도감 챔피언 상세: 삼신기 아이템 클릭 시 아이템 시트가 위에 안 열림 ' + JSON.stringify(fsRes));

    // ⑥ 영웅 증강 덱 구분 검사 (2026-11-26): 비치 팝 레넥톤 등 req_aug 덱은 .aug-req 배지 + 상세 안내 + 영웅 증강 필터, 홈 TOP 4에서 제외
    await pg.evaluate(() => { document.querySelector('#sheet .sh-btn[aria-label="닫기"]')?.click(); document.querySelector('.fs-view .dc-back')?.click(); }); await pg.waitForTimeout(250);
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#home'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(400);
    const reqAugIds = new Set((M.decks || []).filter(d => d.req_aug).map(d => String(d.id)));
    if (reqAugIds.size) {
      const hmBad = await pg.evaluate((names) => {
        const set = new Set(names);
        return [...document.querySelectorAll('#hm-decks .mt-row .mt-name')].map(e => e.textContent.trim()).filter(t => set.has(t));
      }, (M.decks || []).filter(d => d.req_aug).map(d => d.name));
      if (hmBad.length) fail('회귀 검사 ⑥: 홈 상위 덱 TOP 4에 영웅 증강 덱이 일반 덱처럼 노출됨 ' + hmBad.join(', '));
      await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#meta'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(400);
      const heroCheck = await pg.evaluate((ids) => {
        const set = new Set(ids);
        const rows = [...document.querySelectorAll('#mt-rows .mt-row.dk')].filter(r => set.has(r.dataset.id));
        const missBadge = rows.filter(r => !r.querySelector('.aug-req')).map(r => r.dataset.id);
        const first = rows[0];
        if (first) first.click();
        const detLine = !!document.querySelector('#mt-detail .aug-reqline .aug-req');
        document.querySelector('#mt-detail .back')?.click();
        document.querySelector('#mt-filter [data-f=hero]')?.click();
        const heroOnly = document.querySelectorAll('#mt-rows .mt-row.dk').length;
        document.querySelector('#mt-filter [data-f=all]')?.click();
        return { matched: rows.length, missBadge, detLine, heroOnly };
      }, [...reqAugIds]);
      if (!heroCheck.matched || heroCheck.missBadge.length || !heroCheck.detLine || heroCheck.heroOnly !== reqAugIds.size) {
        fail('회귀 검사 ⑥: 영웅 증강 덱 표시/필터 이상 ' + JSON.stringify(heroCheck));
      }
    }

    // ⑦ 18시즌 잔재 차단 & 19시즌 본섭(12/1) 자동 전환 모의 검증
    {
      const idx = JSON.parse(fs.readFileSync(path.join(SITE, 'icons', 'index.json'), 'utf8'));
      const x18 = Object.keys(idx.units || {}).filter(k => /\/x_/.test((idx.units[k] || {}).icon || ''));
      if (x18.length) fail('회귀 검사 ⑦: icons/index.json에 18시즌 잔재 유닛이 남음 ' + x18.join(', '));
      for (const tab of ['flow', 'scout']) {
        await pg.evaluate((t) => { const a = document.createElement('a'); a.href = '#' + t; document.body.appendChild(a); a.click(); a.remove(); }, tab);
        await pg.waitForTimeout(200);
        const rem = await pg.evaluate((t) => {
          const sec = document.getElementById(t);
          const txt = sec ? [...sec.querySelectorAll('*')].filter(e => !e.hidden && e.offsetParent !== null && !e.children.length).map(e => e.textContent).join(' ') : '';
          return (txt.match(/악의 여단|지옥불|돈 수호령|수금·소매치기|수호령 타이밍|덩굴정령/g) || []);
        }, tab);
        if (rem.length) fail(`회귀 검사 ⑦: #${tab}에 18시즌 잔재 문구가 남음 ${[...new Set(rem)].join(', ')}`);
      }
    }

    if (errs.length) fail('회귀 검사: 페이지 오류 ' + errs.slice(0, 2).join(' ; '));
    await pg.close();

    // ⑧ 19시즌 본섭 출시(LIVE_SET_ID=TFTSet19, pbe=false) 전환 모의 검증: PBE/18시즌 잔재 없이 자동 전환되는지
    const pgLive = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
    const errsLive = []; pgLive.on('pageerror', e => errsLive.push(String(e)));
    await pgLive.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    await pgLive.route('https://lolche.local/**', async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/index.html') {
        const html = fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8')
          .replace(/var LIVE_SET_ID = "TFTSet\d+";/, 'var LIVE_SET_ID = "TFTSet19";');
        return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + html });
      }
      if (u.pathname === '/meta.json') {
        const m = JSON.parse(fs.readFileSync(path.join(SITE, 'meta.json'), 'utf8'));
        m.pbe = false; m.patch = '19.1'; m.pbe_build = null;
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(m) });
      }
      if (u.pathname === '/power.json') {
        const p19 = JSON.parse(fs.readFileSync(path.join(SITE, 'power_s19.json'), 'utf8'));
        p19.pbe = false;
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(p19) });
      }
      if (u.pathname === '/power_top.json') {
        const t19 = JSON.parse(fs.readFileSync(path.join(SITE, 'power_top_s19.json'), 'utf8'));
        t19.pbe = false;
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(t19) });
      }
      if (u.pathname === '/proxy') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      const f = path.join(SITE, decodeURIComponent(u.pathname));
      return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' });
    });
    await pgLive.goto('https://lolche.local/index.html'); await pgLive.waitForTimeout(2200);
    const liveChk = await pgLive.evaluate(() => {
      const go = (t) => { const a = document.createElement('a'); a.href = '#' + t; document.body.appendChild(a); a.click(); a.remove(); };
      const hmTag = (document.getElementById('hm-dday') || {}).textContent || '';
      go('patch');
      const ptVis = [...document.querySelectorAll('#patch [data-set="19"] *')].filter(e => !e.hidden && e.offsetParent !== null && !e.children.length).map(e => e.textContent).join(' ');
      go('s19');
      const s19Tag = (document.getElementById('s19-dday') || {}).textContent || '';
      const s19Meta = (document.getElementById('s19-meta') || {}).textContent || '';
      go('power');
      const pwTopTxt = (document.querySelector('#pw-src [data-s="top"]') || {}).textContent || '';
      const pwS19Hidden = !!(document.querySelector('#pw-src [data-s="s19"]') || {}).hidden;
      go('rank');
      const rkPbeTxt = (document.querySelector('#rk-regchips [data-reg="pbe1"]') || {}).textContent || '';
      return { hmTag, ptVis, s19Tag, s19Meta, pwTopTxt, pwS19Hidden, rkPbeTxt };
    });
    if (/PBE/.test(liveChk.hmTag)) fail('19시즌 본섭 전환 모의: 홈 배지에 PBE가 남음 (' + liveChk.hmTag + ')');
    if (/12\/1 출시 예정|PBE 테스트 진행 중/.test(liveChk.ptVis)) fail('19시즌 본섭 전환 모의: 패치 노트에 PBE 예정 문구가 남음');
    if (/PBE|출시 예정/.test(liveChk.s19Meta) || liveChk.s19Tag === 'PBE') fail('19시즌 본섭 전환 모의: 도감 헤더에 PBE 문구가 남음 (' + liveChk.s19Tag + ' / ' + liveChk.s19Meta + ')');
    if (liveChk.pwTopTxt !== '19시즌 상위' || !liveChk.pwS19Hidden) fail('19시즌 본섭 전환 모의: 덱파워 탭이 19시즌 본섭으로 안 바뀜 ' + JSON.stringify(liveChk));
    if (liveChk.rkPbeTxt !== 'PBE') fail('19시즌 본섭 전환 모의: 전적 검색 PBE 칩에 19시즌 문구가 남음 (' + liveChk.rkPbeTxt + ')');
    if (errsLive.length) fail('19시즌 본섭 전환 모의: 페이지 오류 ' + errsLive.slice(0, 2).join(' ; '));
    await pgLive.close();
  });
  // 동시에 4개씩 (대부분 I/O·대기 시간이라 겹쳐 돌리면 빨라진다)
  { let next = 0; await Promise.all([0, 1, 2, 3].map(async () => { while (next < tasks.length) { const fn = tasks[next++]; try { await fn(); } catch (e) { fail('검사 중 오류: ' + String(e.message || e).split('\n')[0].slice(0, 160)); } } })); }
  await b.close();
  console.log(`검사 범위: ${SCOPE.all ? '전부' : [...SCOPE.tags].join(', ') || '바뀐 것 없음'}${FAST ? ' (fast)' : ''} · ${Math.round((Date.now() - T0) / 1000)}초`);
  if (notes.length) console.log('참고:\n  ' + notes.join('\n  '));
  if (fails.length) { console.log('앱 점검 실패 ' + fails.length + '건:\n  ' + fails.join('\n  ')); process.exit(1); }
  saveBase();
  console.log('앱 점검 통과');
})();
