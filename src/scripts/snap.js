// 화면 그대로인지 확인 (구조를 바꾸거나 정리할 때). 네트워크 응답과 시계를 얼려서 모든 화면을 찍고,
// 고치기 전(base)과 고친 뒤(cmp)가 픽셀 단위로 같은지 본다. 같으면 '겉으로 바뀐 게 없음'이 증명된다.
//
//   node scripts/snap.js base        # 고치기 전에: 응답·시각을 새로 저장하고 기준 화면을 찍는다
//   node scripts/snap.js cmp         # 고친 뒤에: 같은 응답·시각으로 다시 찍어 기준과 비교 (다르면 exit 1, 다른 화면과 위치를 알려줌)
//   node scripts/snap.js cmp rank    # 일부 화면만
// 일부러 화면을 바꾼 작업이면 cmp에서 '다름'으로 나온 화면이 의도한 화면뿐인지 본다 (나머지는 같아야 함).
// 저장 위치: android/out/snap/{cache,base,new} (커밋 안 함)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const SITE = path.join(__dirname, '..', 'site');
const DIR = path.join(__dirname, '..', 'android', 'out', 'snap');
const mode = process.argv[2] === 'base' ? 'base' : 'cmp', only = process.argv.slice(3);
const CACHE = path.join(DIR, 'cache'), OUT = path.join(DIR, mode === 'base' ? 'base' : 'new');
if (mode === 'base') fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(CACHE, { recursive: true }); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const nowF = path.join(CACHE, 'now.txt');
if (!fs.existsSync(nowF)) fs.writeFileSync(nowF, String(Date.now()));
const NOW = +fs.readFileSync(nowF, 'utf8');
const TABS = ['more', 'meta', 'tfa', 'dc', 'builder', 'traits', 'rank', 'friends', 'esports', 'find', 'power', 'parts', 'emb', 'flow', 'items', 'wisps', 'augments', 'numbers', 'scout', 'patch'];
// 탭 말고 안쪽 화면: [이름, 탭, 그 화면까지 가는 동작]
const INNER = [
  ['meta_detail', 'meta', async (pg) => { await pg.evaluate(() => document.querySelector('#meta .dk, #mt-rows > *').click()); }],
  ['tfa_detail', 'tfa', async (pg) => { await pg.evaluate(() => document.querySelector('#tfa-out .dk, #tfa-out [data-id], #tfa-out a, #tfa-out button').click()); }],
  ['items_recipe', 'items', async (pg) => { await pg.evaluate(() => { const b = document.querySelectorAll('#items .seg2 button, #items .seg button')[1]; if (b) b.click(); }); }],
  ['profile', 'rank', async (pg) => {
    await pg.evaluate(() => { document.querySelector('#rk-seg [data-v=search]').click(); const q = document.getElementById('rk-q'); q.value = 'Synow#KR1'; q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
    await pg.waitForSelector('.rk-gm', { timeout: 90000 }).catch(() => {});
  }],
];
function cached(url) {
  const f = path.join(CACHE, crypto.createHash('sha1').update(url).digest('hex'));
  if (fs.existsSync(f)) return fs.readFileSync(f);
  let body = Buffer.alloc(0);
  try { body = cp.execSync('curl -s --compressed -H "User-Agent: Mozilla/5.0" -H "Origin: https://www.metatft.com" ' + JSON.stringify(url), { maxBuffer: 1 << 28 }); } catch (e) {}
  fs.writeFileSync(f, body);
  return body;
}
async function shot(b, name, tab, act) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce' });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.clock.setFixedTime(NOW);
  await pg.addInitScript(() => { window.LolcheApp = { version: () => 'test', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
  await pg.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'lolche.local') return r.fulfill({ status: 200, contentType: 'application/json', body: cached(u.href) });  // 페이지가 바로 부르는 곳도 얼린다
    if (u.pathname === '/proxy') return r.fulfill({ status: 200, contentType: 'application/json', body: cached(u.searchParams.get('u')) });
    if (u.pathname === '/' || u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(path.join(SITE, 'tft-guide.html'), 'utf8') });
    const f = path.join(SITE, decodeURIComponent(u.pathname));
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ body: fs.readFileSync(f) });
  });
  await pg.goto('https://lolche.local/index.html');
  await pg.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  await pg.waitForTimeout(2000);
  await pg.evaluate((h) => { const a = document.createElement('a'); a.href = '#' + h; document.body.appendChild(a); a.click(); a.remove(); }, tab);
  await pg.waitForTimeout(2500);
  if (act) { try { await act(pg); } catch (e) { errs.push('동작 실패: ' + e.message.split('\n')[0]); } await pg.waitForTimeout(2500); }
  // 그림이 다 뜰 때까지, 그리고 화면이 더 안 변할 때까지 (연속 두 장이 같을 때)
  await pg.evaluate(() => Promise.all([].map.call(document.images, (i) => i.complete ? 0 : new Promise((ok) => { i.onload = i.onerror = ok; setTimeout(ok, 8000); }))));
  let prev = null, buf = null;
  for (let i = 0; i < 12; i++) {
    buf = await pg.screenshot({ fullPage: true });
    if (prev && buf.equals(prev)) break;
    prev = buf; await pg.waitForTimeout(1200);
  }
  fs.writeFileSync(path.join(OUT, name + '.png'), buf);
  await ctx.close();
  return errs;
}
(async () => {
  const b = await chromium.launch();
  let jobs = TABS.map((t) => [t, t, null]).concat(INNER);
  if (only.length) jobs = jobs.filter((j) => only.includes(j[0]));
  const errAll = [];
  for (let i = 0; i < jobs.length; i += 4) {
    await Promise.all(jobs.slice(i, i + 4).map(async (j) => { const e = await shot(b, j[0], j[1], j[2]); if (e.length) errAll.push(j[0] + ': ' + e.join(' | ')); }));
  }
  await b.close();
  if (errAll.length) console.log('페이지 오류:\n  ' + errAll.join('\n  '));
  if (mode === 'base') { console.log('기준 화면 ' + jobs.length + '개 저장: ' + OUT); return; }
  const diff = [];
  for (const j of jobs) {
    const a = path.join(DIR, 'base', j[0] + '.png'), n = path.join(OUT, j[0] + '.png');
    if (!fs.existsSync(a)) { diff.push(j[0] + ': 기준 없음'); continue; }
    if (fs.readFileSync(a).equals(fs.readFileSync(n))) continue;
    let where = '';
    try {
      // 글자 가장자리가 1~2단계 다르게 그려지는 건 무시하고, 눈에 보이는 차이(채널 40 넘게 다른 픽셀 20개 넘게)만 센다
      where = cp.execSync('python3 - ' + JSON.stringify(a) + ' ' + JSON.stringify(n), { input: [
        'import sys', 'from PIL import Image, ImageChops',
        'a = Image.open(sys.argv[1]).convert("RGB"); b = Image.open(sys.argv[2]).convert("RGB")',
        'if a.size != b.size:', '    print("크기 %s -> %s" % (a.size, b.size)); sys.exit()',
        'd = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 40 else 0)',
        'n = d.histogram()[255]',
        'print("None" if n <= 20 else "다른 픽셀 %d개, 위치 (x1,y1,x2,y2) %s" % (n, d.getbbox()))'].join('\n') }).toString().trim();
    } catch (e) {}
    if (/None/.test(where)) continue;
    diff.push(j[0] + ': ' + where);
  }
  if (diff.length) { console.log('화면이 달라진 곳 ' + diff.length + '개:\n  ' + diff.join('\n  ') + '\n비교: ' + path.join(DIR, 'base') + ' / ' + OUT); process.exit(1); }
  console.log('화면 ' + jobs.length + '개 모두 그대로');
})();
