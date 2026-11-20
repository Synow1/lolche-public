// 앱 자동 점검 (올리기 전에 반드시). 사용자가 직접 찾아내던 종류의 문제를 기계가 먼저 잡는다.
//   node scripts/qa.js            -> 문제가 있으면 목록을 찍고 종료 코드 1 (publish_app.sh가 올리지 않음)
// 무엇을 보나
//  1. 모든 탭 × 폭 360·412: 페이지 오류, 화면보다 넓어짐(가로 밀림), 깨진 이미지, hidden인데 보이는 요소
//  2. 탭마다 '내용이 실제로 있는지' (조합표 칸에 템 그림, 덱 줄 수, 증강 카드 수 ...): 비어도 오류가 안 나는 고장을 잡는다
//  3. 기능 동작: TFT 아카데미 전환·상세, 재료 → 덱 계산, 조합표 칸 누르기, 아이템 새로고침·랭킹 새로고침 버튼(앱 모드)
//  4. 데이터 신선도: 덱·아이템·TFT 아카데미·DB 48시간, 월즈 3주 안이면 명단 48시간
// 지난 실수 목록: guide/kb/corrections.md (각 항목이 여기 검사 하나씩)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const SITE = path.join(__dirname, '..', 'site');
const fails = [], notes = [];
const fail = (m) => fails.push(m);
// 새 세트 첫 2주 (data/patch_state.json set_started, check_patch.py가 적음): 판·랭킹·덱파워·아카데미 티어표가 아직 없을 수 있어
// 그 데이터가 있어야 하는 검사는 실패 대신 참고로 (화면 밀림·오류 검사는 그대로). 세트 19 대비, 2026-11-16
const FRESH = (() => { try { const st = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'patch_state.json'), 'utf8')); return st.set_started && (Date.now() - Date.parse(st.set_started)) / 864e5 < 14; } catch (e) { return false; } })() || process.env.QA_FRESH === '1';
const soft = (m) => FRESH ? notes.push('새 시즌 초기라 참고: ' + m) : fail(m);

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
  // CSS 미정의 변수 검사 (2026-11-20: var(--text) 5곳 오타가 숨어 있었음): CSS에 선언되지 않고 JS setProperty도 없는 폴백 없는 var(--*) 잡기
  {
    const css = fs.readFileSync(path.join(SITE, 'src', '010_style.css'), 'utf8');
    const jsAll = fs.readdirSync(path.join(SITE, 'src')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(SITE, 'src', f), 'utf8')).join('\n');
    const defined = new Set([...css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map(m => m[1]));
    for (const m of jsAll.matchAll(/setProperty\(\s*['"](--[a-zA-Z0-9_-]+)['"]/g)) defined.add(m[1]);
    const badVars = new Set();
    for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)(\s*,[^)]+)?\)/g)) {
      if (!defined.has(m[1]) && !m[2]) badVars.add(m[1]);
    }
    if (badVars.size) fail('CSS 미정의 변수: ' + [...badVars].join(', '));
  }

  const b = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
  const TABS = ['meta', 'tfa', 'dc', 'rank', 'augments', 'items', 'more', 'traits', 'find', 'builder', 'esports', 'friends', 'power', 'parts', 'emb', 'flow', 'wisps', 'numbers', 'scout', 'patch'];
  for (const [W, scheme] of [[360, 'dark'], [412, 'light']]) {
    const pg = await b.newPage({ viewport: { width: W, height: 860 }, colorScheme: scheme });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    await pg.route('https://lolche.local/**', async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/proxy') { let body = ''; try { body = cp.execSync('curl -s --compressed -H "User-Agent: Mozilla/5.0" -H "Origin: https://www.metatft.com" ' + JSON.stringify(u.searchParams.get('u')), { maxBuffer: 1 << 28, timeout: 60000 }); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body }); }
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      const f = path.join(SITE, decodeURIComponent(u.pathname)); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ body: fs.readFileSync(f) });
    });
    await pg.goto('https://lolche.local/index.html'); await pg.waitForTimeout(3500);
    const go = (t) => pg.evaluate((t) => { const a = document.createElement('a'); a.href = '#' + t; document.body.appendChild(a); a.click(); a.remove(); window.scrollTo(0, 0); }, t);
    const tag = `[${W}/${scheme}]`;
    // ---- 1. 모든 탭 공통
    for (const t of TABS) {
      errs.length = 0;
      await go(t); await pg.waitForTimeout(['rank', 'friends', 'esports', 'power'].includes(t) ? 3500 : 1000);
      const r = await pg.evaluate((W) => {
        const sec = document.querySelector('section:not([hidden])'), o = { sw: document.documentElement.scrollWidth, broken: [], hid: [], text: sec ? sec.innerText.length : 0 };
        if (!sec) return o;
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
      // 세트가 바뀌어 지난 세트 공략(data-set)을 숨긴 탭은 '준비 중' 한 줄: 실패 대신 참고로 남겨 새 시즌 글을 쓰게 (세트 19 대비)
      if (r.text < 40 && await pg.evaluate((t) => /새 시즌 내용은 준비 중/.test((document.getElementById(t) || {}).textContent || ''), t)) notes.push(`${tag} ${t}: 새 시즌 공략을 아직 안 씀 (지난 세트 글 숨김)`);
      else if (r.text < 40) fail(`${tag} ${t}: 내용이 거의 없음 (${r.text}자)`);
      if (errs.length) fail(`${tag} ${t}: 페이지 오류 ${errs.slice(0, 2).join(' ; ')}`);
    }
    if (W !== 360) { await pg.close(); continue; }  // 내용·기능 검사는 한 번만
    // ---- 2·3. 탭별 내용과 기능
    // 버튼이 없어서 누르기가 실패해도 멈추지 말고 실패로 적고 계속 (있어야 할 버튼이 없는 것도 고장)
    const q = async (fn, arg) => { try { return await pg.evaluate(fn, arg); } catch (e) { fail('동작 실패: ' + String(e.message).split('\n')[0].slice(0, 120)); return null; } };
    await go('meta'); await pg.waitForTimeout(800);
    for (const s of ['guide', 'stat']) {
      await q((s) => document.querySelector('#mt-src [data-s=' + s + ']').click(), s); await pg.waitForTimeout(600);
      const n = await q(() => [...document.querySelectorAll('#mt-rows .mt-row')].filter(x => x.offsetParent).length);
      if (n < 15) fail(`덱 탭 ${s}: 덱 줄 ${n}개`);
      const bad = await q(() => [...document.querySelectorAll('#meta .mt-row.dk')].filter(x => x.offsetParent && !x.querySelector('.dk-hex img')).length);
      if (bad) fail(`덱 탭 ${s}: 메인 캐리 그림 없는 줄 ${bad}개`);
    }
    // 덱 탭: 선택률(로비 평균 인원) + v3 상단 메타 줄(.dk-meta .dk-tbadge) + 2단 KPI(.dk-kpi2 평균/순방)
    await go('meta'); await pg.waitForTimeout(600);
    if (await q(() => [...document.querySelectorAll('#mt-rows .mt-row')].filter(r => /선택률 [\d.]+/.test(r.textContent)).length) < 10) fail('덱: 줄마다 "선택률"이 안 보임');
    if (await q(() => document.querySelectorAll('#mt-rows .mt-row.dk .dk-meta .dk-tbadge').length) < 10) fail('덱: 상단 메타 줄에 티어 배지(.dk-tbadge)가 안 보임');
    if (await q(() => [...document.querySelectorAll('#mt-rows .mt-row.dk .dk-kpi2')].filter(k => /순방 \d+%/.test(k.textContent)).length) < 10) fail('덱: 오른쪽 2단 KPI에 순방률이 안 보임');
    // 하단 플로팅 독 5탭(덱·아카데미·전적·도감·더보기) 및 도감 전환(아이템·증강·시너지) 검사
    {
      const navs = await q(() => [...document.querySelectorAll('.bnav a')].map(a => a.dataset.nav));
      if (!navs || navs.join(',') !== 'meta,tfa,rank,codex,more') fail('아래 메뉴: 5탭 구조(meta,tfa,rank,codex,more)가 아님 (' + (navs || []).join(',') + ')');
      for (const ct of ['items', 'augments', 'traits']) {
        await go(ct); await pg.waitForTimeout(300);
        if (await q(() => !document.querySelector('.bnav a[data-nav=codex]').classList.contains('on'))) fail(`도감(${ct}): 아래 메뉴 '도감' 표시가 안 켜짐`);
        if (await q((ct) => !document.querySelector(`#${ct} .codex-seg a[href="#${ct}"].on`), ct)) fail(`도감(${ct}): 상단 전환 바 활성 표시가 안 켜짐`);
      }
      await go('meta'); await pg.waitForTimeout(300);
      await q(() => document.querySelector('.bnav a[data-nav=codex]').click()); await pg.waitForTimeout(400);
      if (await q(() => document.querySelector('section:not([hidden])').id) !== 'traits') fail('도감: 마지막 본 하위 탭(traits)으로 복원되지 않음');
      await q(() => document.querySelector('#traits .codex-seg a[href="#items"]').click()); await pg.waitForTimeout(400);
      if (await q(() => document.querySelector('section:not([hidden])').id) !== 'items') fail('도감: 상단 전환 바에서 아이템으로 안 넘어감');
    }
    // TFT 아카데미는 따로 탭 (v1.51.0): 덱 탭 상세를 열어 둔 채 오가도 서로 상태가 남아야 한다
    await go('tfa'); await pg.waitForTimeout(600);
    if (await q(() => document.querySelectorAll('#tfa-out .mt-row').length) < 15) soft('TFT 아카데미: 덱 줄 15개 미만');
    if (await q(() => !document.querySelector('.bnav a[data-nav=tfa]').classList.contains('on'))) soft('TFT 아카데미: 아래 메뉴 표시가 안 켜짐');
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
    await q(() => document.querySelector('#mt-src [data-s=guide]').click()); await pg.waitForTimeout(300);
    await q(() => document.querySelector('#mt-rows .mt-row').click()); await pg.waitForTimeout(500);
    const kpi = await q(() => [...document.querySelectorAll('#mt-detail .dk-kpi > div')].map(x => x.textContent));
    if (kpi.length !== 4) notes.push('덱 상세: 숫자 칸이 4개가 아님 (통계 없는 추천 덱일 수 있음)');
    else if (!/선택률/.test(kpi[3])) fail('덱 상세: 넷째 칸이 선택률이 아님');
    if (await q(() => { const k = document.querySelector('#mt-detail .dk-kpi'); return k && k.scrollWidth > k.clientWidth + 1; })) fail('덱 상세: 숫자 칸이 화면 밖으로 넘침');
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
    await go('augments'); await pg.waitForTimeout(500);
    if (await q(() => document.querySelectorAll('#ag-list .ag-card').length) < 80) fail('증강 탭: 카드 80개 미만');
    await go('parts'); await pg.waitForTimeout(500);
    await q(() => { const c = document.querySelector('#pt-tray .pt-clear'); if (c) c.click(); });
    for (const n of ['지팡이', '여눈', '장갑']) await q((n) => [...document.querySelectorAll('.pt-p')].find(x => x.textContent.startsWith(n)).click(), n);
    await pg.waitForTimeout(300);
    if (await q(() => document.querySelectorAll('#pt-out .mt-row').length) < 5) fail('재료 → 덱: 추천 덱 5개 미만');
    await q(() => document.querySelector('#pt-tray .pt-clear').click());
    await go('esports'); await pg.waitForTimeout(800);
    if (await q(() => /\?/.test((document.querySelector('.cr-sum') || {}).innerText || ''))) fail('이스포츠: 월즈 요약에 ?');
    await go('rank'); await pg.waitForTimeout(3000);
    if (await q(() => document.querySelectorAll('#rk-rows .rk-row').length) < 30) soft('한국 랭킹: 줄 30개 미만');
    if (await q(() => document.getElementById('rk-upd-btn').hidden)) fail('한국 랭킹: 앱인데 새로고침 버튼이 숨어 있음');
    await go('power'); await pg.waitForTimeout(1500);
    if (await q(() => document.querySelectorAll('#pw-list .pwc').length) < 5) soft('덱파워: 카드 5개 미만');
    await go('friends'); await pg.waitForTimeout(6000);
    if (await q(() => document.querySelectorAll('#fr-cards .fr-card').length) < 2) soft('친구: 카드 2개 미만');
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
    // 기본 범위 50판, 등수 줄은 최근 20판까지 (2026-11-11 사용자)
    if (await q(() => ((document.querySelector('.rk-range .mt-chips button.on') || {}).textContent || '')) !== '50판') soft('전적 검색: 기본 범위가 50판이 아님');
    if (await q(() => document.querySelectorAll('.rk-sum .plstr span').length) > 20) fail('전적 검색: 등수 줄이 20판 넘게 보임');
    await pg.close();
  }
  // 롤체갤 실시간 (2026-11-13 사용자: "1초에 한 번씩 목록 리로딩"): 목록이 차는지, 1초마다 다시 받는지, 탭을 떠나면 멈추는지
  {
    const pg = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; localStorage.removeItem('tft-guide-dc'); });
    let dcReq = 0, dcPost = 0, dcPage = '', dcInject = false; const dcCache = {};
    await pg.route('https://lolche.local/**', async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/proxy') {
        const t = u.searchParams.get('u');
        if (/dcinside\.co\.kr|dcimg\d*\.dcinside\.com/.test(t)) {  // 글 속 사진 (앱 proxy처럼 디시 주소로 받아 그대로)
          let buf = Buffer.alloc(0); try { buf = cp.execSync('curl -s -H "User-Agent: Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile" -H "Referer: https://m.dcinside.com/" ' + JSON.stringify(t), { maxBuffer: 1 << 26, timeout: 30000 }); } catch (e) {}
          return r.fulfill({ status: 200, contentType: 'image/jpeg', body: buf });  // 앱은 octet-stream을 image/jpeg로 바꿔 준다
        }
        if (/gall\.dcinside\.com/.test(t)) { let body = ''; try { body = cp.execSync('curl -s --compressed -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36" ' + JSON.stringify(t), { maxBuffer: 1 << 26, timeout: 30000 }).toString(); } catch (e) {} return r.fulfill({ status: 200, contentType: 'text/html', body }); }
        if (/m\.dcinside\.com\/board\/tft\/\d+/.test(t)) { dcPost++; let body = ''; try { body = cp.execSync('curl -s --compressed -H "User-Agent: Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36" -H "Referer: https://m.dcinside.com/board/tft" ' + JSON.stringify(t), { maxBuffer: 1 << 26, timeout: 30000 }).toString(); } catch (e) {} return r.fulfill({ status: 200, contentType: 'text/html', body }); }
        if (/m\.dcinside\.com/.test(t)) {
          dcReq++;
          if (dcCache[t] == null) { try { dcCache[t] = cp.execSync('curl -s --compressed -H "User-Agent: Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36" -H "Referer: https://m.dcinside.com/board/tft" ' + JSON.stringify(t), { maxBuffer: 1 << 26, timeout: 30000 }).toString(); } catch (e) { dcCache[t] = ''; } }
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
    await pg.close();
  }
  // 월즈 실시간 순위 (2026-11-13 사용자: "월즈 시작했는데 실시간 현황판 바로 안 넣어놓냐"): 일정을 오늘로, MetaTFT 대회 목록에
  // 지난 세트 월즈(TCROWN S17) 게임을 이번 세트 이름으로 넣어 보여주고, 순위표·단계 칩·한국 선수 줄·프로 포인트 접힘을 본다
  {
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
        if (/docs\.google\.com/.test(t)) { let b2 = ''; try { b2 = cp.execSync('curl -s -L ' + JSON.stringify(t), { maxBuffer: 1 << 26, timeout: 60000 }).toString(); } catch (e) {} return r.fulfill({ status: 200, contentType: 'text/plain', body: b2 }); }
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
        if (u.pathname === '/proxy') { const t = u.searchParams.get('u'); if (/metatft/.test(t)) return r2.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }); let b2 = ''; try { b2 = cp.execSync('curl -s -L ' + JSON.stringify(t), { maxBuffer: 1 << 26, timeout: 60000 }).toString(); } catch (e) {} return r2.fulfill({ status: 200, contentType: 'text/plain', body: b2 }); }
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
  }
  // 휴면 감소 (2026-11-14 사용자: "막판이 -222가 된 게 아니라 휴면 강등"): 마지막 판 뒤에 판 수는 그대로인 LP 기록(휴면 감소)을 끼워 넣어도
  // 그 판 LP는 판 결과대로, 감소는 '이후 휴면'으로 따로 나와야 한다
  {
    const pg = await b.newPage({ viewport: { width: 390, height: 900 }, colorScheme: 'dark' });
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    let inj = null, base = null;
    await pg.route('https://lolche.local/**', async (r) => { const u = new URL(r.request().url());
      if (u.pathname === '/proxy') { const t = u.searchParams.get('u'); let body = ''; try { body = cp.execSync('curl -s --compressed -H "User-Agent: Mozilla/5.0" -H "Origin: https://www.metatft.com" ' + JSON.stringify(t), { maxBuffer: 1 << 28, timeout: 60000 }).toString(); } catch (e) {}
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
  }
  // 판 목록에 빠진 판 (2026-11-15 사용자: 앙기모링딩둉 15시즌 '시즌 전체'에서 8등 판에 +23LP, 마지막 판이 '기록 대기 중'):
  // 롤체지지 판 목록은 가끔 판이 빠져서, offset 하나로 맞추면 빠진 판 뒤(최근) 판들이 한 판씩 밀린다. 4번째 랭크 판을 빼고 최근 판 LP가 등수와 맞는지
  {
    const pg = await b.newPage({ viewport: { width: 390, height: 900 }, colorScheme: 'dark' });
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    let dropped = null;
    await pg.route('https://lolche.local/**', async (r) => { const u = new URL(r.request().url());
      if (u.pathname === '/proxy') { const t = u.searchParams.get('u'); let body = ''; try { body = cp.execSync('curl -s --compressed -H "User-Agent: Mozilla/5.0" -H "Origin: https://www.metatft.com" ' + JSON.stringify(t), { maxBuffer: 1 << 28, timeout: 60000 }).toString(); } catch (e) {}
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
  }
  // 19시즌 미리보기 탭 (2026-11-18 사용자: "19시즌 탭을 새로 만들어, 공부하기 쉽게"): 보기마다 내용, 챔피언·시너지 상세가 열리는지, 영어 틀·남은 자리표시
  {
    const S = JSON.parse(fs.readFileSync(path.join(SITE, 's19.json'), 'utf8'));
    if (S.units.length < 60 || S.traits.length < 20) fail(`19시즌: 챔피언 ${S.units.length} · 시너지 ${S.traits.length} (너무 적음)`);
    const raw = JSON.stringify(S);
    if (/\{Set19|%i:|<TFT|TFTCurveTable/.test(raw)) fail('19시즌: 원문 틀(<TFT…>·{Set19…}·%i:)이 글에 그대로 남음');
    if (S.units.some(u => !u.img)) fail('19시즌: 아이콘 없는 챔피언 ' + S.units.filter(u => !u.img).map(u => u.n).slice(0, 3).join(', '));
    const dup = S.units.map(u => u.n).filter((n, i, a) => a.indexOf(n) !== i); if (dup.length) fail('19시즌: 같은 이름 챔피언이 둘 ' + dup.join(', '));
    const pg = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    await pg.route('https://lolche.local/**', async (r) => { const u = new URL(r.request().url());
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      if (u.pathname === '/proxy') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      const f = path.join(SITE, decodeURIComponent(u.pathname)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
    const errs = []; pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto('https://lolche.local/index.html'); await pg.waitForTimeout(2500);
    await pg.evaluate(() => { const a = document.createElement('a'); a.href = '#s19'; document.body.appendChild(a); a.click(); a.remove(); }); await pg.waitForTimeout(1200);
    for (const [v, sel, min] of [['home', '.s19-k', 4], ['traits', '.s19-tc', 20], ['units', '.s19-uc', 60], ['unlock', '.s19-ul', 5], ['augs', '.s19-ar', 50], ['items', '.s19-ar', 10]]) {
      await pg.evaluate((v) => document.querySelector('#s19-view [data-v=' + v + ']').click(), v); await pg.waitForTimeout(500);
      const r = await pg.evaluate((sel) => ({ n: document.querySelectorAll('#s19-out ' + sel).length, sw: document.documentElement.scrollWidth, seg: [...document.querySelectorAll('#s19-view button')].some(b => b.getBoundingClientRect().height > 44) }), sel);
      if (r.n < min) fail(`19시즌 ${v}: 항목 ${r.n}개 (최소 ${min})`);
      if (r.sw > 360) fail(`19시즌 ${v}: 화면보다 넓음 ${r.sw}px`);
      if (r.seg) fail('19시즌: 보기 버튼 글자가 두 줄로 꺾임');
    }
    await pg.evaluate(() => document.querySelector('#s19-view [data-v=units]').click()); await pg.waitForTimeout(400);
    await pg.evaluate(() => document.querySelector('#s19-out .s19-uc').click()); await pg.waitForTimeout(500);
    const un = await pg.evaluate(() => { const v = document.querySelector('.fs-view'); return v ? { kv: v.querySelectorAll('.s19-kv b').length, tc: v.querySelectorAll('.s19-tchip').length } : null; });
    if (!un || un.kv < 6 || !un.tc) fail('19시즌: 챔피언을 눌러도 스킬·능력치·시너지 화면이 안 열림');
    await pg.evaluate(() => document.querySelector('.fs-view .s19-tchip')?.click()); await pg.waitForTimeout(500);
    if (!(await pg.evaluate(() => [...document.querySelectorAll('.fs-view')].some(v => v.querySelector('.s19-tc.open'))))) fail('19시즌: 챔피언 화면에서 시너지를 눌러도 시너지 설명이 안 열림');
    if (errs.length) fail('19시즌: 페이지 오류 ' + errs.slice(0, 2).join(' ; '));
    await pg.close();
  }
  // 업데이트 소식 (2026-11-16 사용자: "업뎃되면 뭐가 업뎃됐는지 한번 띄워"): 새 버전이면 창이 뜨고, 확인을 누르면 닫히고 다시 안 뜬다
  {
    const pg = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    await pg.route('https://lolche.local/**', async (r) => { const u = new URL(r.request().url());
      if (u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(process.env.QA_HTML || path.join(SITE, 'tft-guide.html'), 'utf8') });
      if (u.pathname === '/proxy') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      const f = path.join(SITE, decodeURIComponent(u.pathname)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
    await pg.goto('https://lolche.local/index.html?whatsnew=1'); await pg.waitForTimeout(3000);
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
    await pg.close();
  }
  // 게임 위 창(?overlay=1): 앱 바가 숨는데 붙는 머리가 앱 바 높이만큼 내려와 목록 중간에 떠 있던 문제 (2026-11-13)
  {
    const pg = await b.newPage({ viewport: { width: 540, height: 400 }, colorScheme: 'dark' });
    await pg.addInitScript(() => { window.LolcheApp = { version: () => 'qa', canOverlay: () => true, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
    await pg.route('https://lolche.local/**', async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/proxy') { let body = ''; try { body = cp.execSync('curl -s --compressed -H "User-Agent: Mozilla/5.0" -H "Origin: https://www.metatft.com" ' + JSON.stringify(u.searchParams.get('u')), { maxBuffer: 1 << 28, timeout: 60000 }); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body }); }
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
    await pg.close();
  }
  await b.close();
  if (notes.length) console.log('참고:\n  ' + notes.join('\n  '));
  if (fails.length) { console.log('앱 점검 실패 ' + fails.length + '건:\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('앱 점검 통과');
})();
