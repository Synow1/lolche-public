// 앱 화면 확인 (Playwright). 앱 모드(APP=true)로 site/tft-guide.html을 띄우고 탭을 찍는다.
// 롤체지지·MetaTFT 호출은 /proxy로 실제로 받아 온다 (앱의 LolcheApp 브리지를 흉내).
//
// node scripts/ui_check.js <탭> [출력 폴더] [--dark] [--full] [--search 이름#태그] [--w 400]
//   --full: 화면 하나가 아니라 페이지 끝까지 찍는다
//   --click 선택자: 찍기 전에 누른다 (여러 번 써도 됨, 순서대로). --name 파일이름: 저장 이름을 <탭> 대신
//   예) node scripts/ui_check.js power /tmp/shots
//       node scripts/ui_check.js rank /tmp/shots --search "Synow#KR1"
//   탭: meta rank augments items power esports friends find more ...
// 결과: <출력 폴더>/<탭>.png (+ 검색이면 <탭>_game.png 첫 판 카드), 콘솔에 페이지 오류 목록
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const SITE = path.join(__dirname, '..', 'site');
const args = process.argv.slice(2);
const tab = args[0] || 'meta';
const out = args[1] && !args[1].startsWith('--') ? args[1] : '/tmp';
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const dark = args.includes('--dark'), full = args.includes('--full'), who = opt('--search'), W = +(opt('--w') || 400);
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: W, height: 860 }, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light' });
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.addInitScript(() => { window.LolcheApp = { version: () => 'test', canOverlay: () => false, startBubble() {}, stopBubble() {}, copy() {}, hidePanel() {} }; });
  await pg.route('https://lolche.local/**', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/proxy') {
      let body = '';
      const t = u.searchParams.get('u'), dc = /dcinside\.com/.test(t);  // 디시는 휴대폰 브라우저처럼 (앱 proxy와 같게)
      try { body = cp.execSync('curl -s --compressed ' + (dc ? '-H "User-Agent: Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36" ' : '-H "User-Agent: Mozilla/5.0" -H "Origin: https://www.metatft.com" ') + JSON.stringify(t), { maxBuffer: 1 << 28 }); } catch (e) {}
      return r.fulfill({ status: 200, contentType: dc ? 'text/html' : 'application/json', body });
    }
    if (u.pathname === '/' || u.pathname === '/index.html') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body>' + fs.readFileSync(path.join(SITE, 'tft-guide.html'), 'utf8') });
    const f = path.join(SITE, decodeURIComponent(u.pathname));
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ body: fs.readFileSync(f) });
  });
  await pg.goto('https://lolche.local/index.html');
  await pg.waitForTimeout(2500);
  await pg.evaluate((h) => { const a = document.createElement('a'); a.href = '#' + h; document.body.appendChild(a); a.click(); }, tab);
  await pg.waitForTimeout(2500);
  if (who) {
    await pg.evaluate((w) => { document.querySelector('#rk-seg [data-v=search]').click(); const q = document.getElementById('rk-q'); q.value = w; q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); }, who);
    await pg.waitForSelector('.rk-gm', { timeout: 60000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    const g = await pg.$('.rk-gm'); if (g) await g.screenshot({ path: path.join(out, tab + '_game.png') });
  }
  for (let i = 0; i < args.length; i++) if (args[i] === '--click') {
    await pg.evaluate((q) => { const e = document.querySelector(q); if (e) e.click(); else console.error('못 찾음: ' + q); }, args[i + 1]);
    await pg.waitForTimeout(800);
  }
  const fn = (opt('--name') || tab) + (dark ? '_dark' : '') + '.png';
  await pg.screenshot({ path: path.join(out, fn), fullPage: full });
  console.log('저장:', path.join(out, fn));
  console.log('페이지 오류:', errs.length ? errs.join('\n') : '없음');
  await b.close();
})();
