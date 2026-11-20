  // ---- 롤체갤 실시간 (2026-11-13 사용자: "크롬 확장처럼 1초에 한 번씩 목록 리로딩") ----
  // 앱이 디시 모바일 목록(m.dcinside.com/board/tft)을 대신 받아(/proxy) 정해진 간격으로 다시 그린다.
  // 이 탭을 보고 있을 때만 돌고, 앞 요청이 끝나야 다음 요청을 보낸다. 실패하면 간격을 늘렸다가 성공하면 되돌린다.
  var DC_KEY = "tft-guide-dc", DC_URL = "https://m.dcinside.com/board/tft";
  var DC = { mode: "all", iv: 1000, busy: false, timer: null, fail: 0, at: 0, seen: null, rows: [], page: 1, more: false, end: false };
  var DC_MAX = 600;  // 이만큼 넘게 쌓이면 오래된 글부터 버린다
  try { var dcs = JSON.parse(localStorage.getItem(DC_KEY) || "{}"); if (dcs.m) DC.mode = dcs.m; if (dcs.v != null) DC.iv = dcs.v; } catch (e) {}
  function dcUrl(page) { var q = []; if (DC.mode === "rec") q.push("recommend=1"); if (page > 1) q.push("page=" + page); return DC_URL + (q.length ? "?" + q.join("&") : ""); }
  function dcSave() { try { localStorage.setItem(DC_KEY, JSON.stringify({ m: DC.mode, v: DC.iv })); } catch (e) {} }
  function dcParse(h) {
    var doc = new DOMParser().parseFromString(h, "text/html"), out = [];
    doc.querySelectorAll(".gall-detail-lnktb").forEach(function (b) {
      var a = b.querySelector("a.lt"); if (!a) return;
      var m = (a.getAttribute("href") || "").match(/\/board\/tft\/(\d+)/); if (!m) return;
      var li = [].slice.call(b.querySelectorAll(".ginfo li")).map(function (x) { return x.textContent.trim(); });
      var nick = (b.querySelector(".list-nick") || {}).textContent || "";
      out.push({ no: +m[1], href: a.getAttribute("href"), t: ((b.querySelector(".subjectin") || {}).textContent || "").trim(),
        img: !!b.querySelector(".sp-lst-img"), cat: li[0] || "", nick: nick.trim(), time: li[2] || "",
        view: (li[3] || "").replace(/[^0-9]/g, ""), rec: (li[4] || "").replace(/[^0-9]/g, ""), cmt: ((b.querySelector(".ct") || {}).textContent || "0").trim() });
    });
    return out;
  }
  // 받은 줄을 쌓아 둔 목록에 합친다: 같은 글은 숫자(조회·추천·댓글)만 새로, 처음 보는 글은 끼워 넣는다 (글 번호 큰 순)
  function dcMerge(rows, top) {
    var by = {}; DC.rows.forEach(function (r) { by[r.no] = r; });
    var added = 0;
    rows.forEach(function (r) {
      var o = by[r.no];
      if (o) { o.view = r.view; o.rec = r.rec; o.cmt = r.cmt; o.t = r.t; o.isNew = false; }
      else { r.isNew = !!top && DC.rows.length > 0; by[r.no] = r; added++; }
    });
    DC.rows = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.no - a.no; }).slice(0, DC_MAX);
    return added;
  }
  function dcDraw() {
    var ul = document.getElementById("dc-list");
    // 읽던 자리 지키기: 화면 위쪽에 보이던 글이 다시 그린 뒤에도 같은 높이에 있게
    var anchor = null, top0 = 0;
    if (window.scrollY > 40) {
      var hdr = (document.querySelector(".dc-bar") || ul).getBoundingClientRect().bottom;
      var lis = ul.querySelectorAll("li[data-no]");
      for (var k = 0; k < lis.length; k++) { var rc = lis[k].getBoundingClientRect(); if (rc.bottom > hdr) { anchor = lis[k].dataset.no; top0 = rc.top; break; } }
    }
    ul.innerHTML = "";
    if (!DC.rows.length) { ul.appendChild(el("li", "dc-empty", DC.fail ? "목록을 받지 못했어요. 잠시 뒤 다시 시도해요" : "불러오는 중")); dcMoreBox(); return; }
    DC.rows.forEach(function (r) {
      var li = el("li", r.isNew ? "new" : null), a = el("a");
      li.dataset.no = r.no;
      a.href = r.href.replace(/\?.*$/, ""); a.target = "_blank"; a.rel = "noopener";
      a.addEventListener("click", function (e) { if (!APP) return; e.preventDefault(); dcOpen(r); });
      var t = el("div", "dc-t");
      if (r.img) t.appendChild(el("span", "dc-img", "사진"));
      t.appendChild(el("span", "dc-tt", r.t));
      if (+r.cmt) t.appendChild(el("span", "dc-cmt", r.cmt));
      a.appendChild(t);
      a.appendChild(el("div", "dc-m", [r.nick, r.time, "조회 " + r.view, +r.rec ? "추천 " + r.rec : ""].filter(Boolean).join(" · ")));
      li.appendChild(a); ul.appendChild(li);
    });
    if (anchor) { var li2 = ul.querySelector('li[data-no="' + anchor + '"]'); if (li2) window.scrollBy(0, li2.getBoundingClientRect().top - top0); }
    dcMoreBox();
  }
  // 목록 끝: 거기까지 내리면 다음 쪽을 받아 붙인다 (못 보면 버튼으로도)
  var dcObs = null;
  function dcMoreBox() {
    var box = document.getElementById("dc-more");
    box.innerHTML = "";
    if (!DC.rows.length) return;
    if (DC.end) { box.appendChild(el("p", "dc-endtxt", "더 이전 글은 없어요")); return; }
    var b = el("button", "dc-morebtn", DC.more ? "불러오는 중" : "이전 글 더 보기"); b.type = "button"; b.disabled = DC.more;
    b.addEventListener("click", dcLoadMore);
    box.appendChild(b);
    if (!dcObs && window.IntersectionObserver) {
      dcObs = new IntersectionObserver(function (es) { if (es[0].isIntersecting) dcLoadMore(); }, { rootMargin: "600px 0px" });
      dcObs.observe(box);
    }
  }
  function dcDrawWeb() {
    var secEl = document.getElementById("dc"), bar = secEl && secEl.querySelector(".dc-bar"), ab = secEl && secEl.querySelector(".about");
    if (bar) bar.hidden = true;
    if (ab) ab.hidden = true;
    var ul = document.getElementById("dc-list"), box = document.getElementById("dc-more");
    if (ul) { ul.innerHTML = ""; ul.hidden = true; }
    if (!box) return;
    box.innerHTML = "";
    var card = el("div", "fcard dc-web");
    card.appendChild(el("h3", null, "디시인사이드 롤체 갤러리"));
    card.appendChild(el("p", "sub", "실시간 목록 자동 갱신과 앱 내 글 보기는 안드로이드 앱에서 볼 수 있어요. 브라우저에서는 갤러리로 바로 이동해 보세요."));
    var a = el("a", "codebtn big", "롤체갤 열기");
    a.href = DC_URL; a.target = "_blank"; a.rel = "noopener";
    card.appendChild(a);
    box.appendChild(card);
  }
  function dcLoadMore() {
    if (DC.more || DC.end || !APP || current !== "dc" || !DC.rows.length) return;
    DC.more = true; dcMoreBox();
    var mode = DC.mode, page = DC.page + 1;
    viaAppText(dcUrl(page)).then(function (h) {
      if (mode !== DC.mode) return;
      var rows = dcParse(h);
      DC.page = page;
      if (!rows.length) { DC.end = true; return; }
      var added = dcMerge(rows, false);
      DC.more = false; dcDraw();
      // 그 사이 새 글이 올라와 앞 쪽과 겹쳐서 새 줄이 없었으면 한 쪽 더
      if (!added) setTimeout(dcLoadMore, 300);
    }).catch(function () {}).then(function () { DC.more = false; dcMoreBox(); });
  }
  function dcStat() {
    var s = document.getElementById("dc-stat"), dot = document.getElementById("dc-dot");
    var t = DC.at ? new Date(DC.at).toTimeString().slice(0, 8) : "";
    s.textContent = !APP ? "앱에서 볼 수 있어요" : DC.iv === 0 ? (t ? t + " 갱신 · 멈춤" : "멈춤") : DC.fail ? "연결이 불안정해요 · " + Math.round(dcWait() / 1000) + "초 뒤 다시" : (t ? t + " 갱신" : "불러오는 중");
    dot.className = "dc-dot" + (APP && DC.iv && !DC.fail ? " on" : "");
  }
  function dcWait() { return DC.fail ? Math.min(30000, Math.max(DC.iv || 1000, 1000) * Math.pow(2, DC.fail)) : DC.iv; }
  function dcOn() { return APP && current === "dc" && !document.hidden && !DC.view; }
  function dcTick() {
    clearTimeout(DC.timer); DC.timer = null;
    if (!dcOn() || DC.busy) return;
    DC.busy = true;
    var mode = DC.mode;
    viaAppText(dcUrl(1)).then(function (h) {
      var rows = dcParse(h);
      if (!rows.length) throw new Error("빈 목록");
      if (mode === DC.mode) { dcMerge(rows, true); DC.fail = 0; DC.at = Date.now(); dcDraw(); }
    }).catch(function () { DC.fail = Math.min(DC.fail + 1, 5); if (!DC.rows.length) dcDraw(); })
      .then(function () { DC.busy = false; dcStat(); if (dcOn() && DC.iv) DC.timer = setTimeout(dcTick, dcWait()); });
  }
  function dcStart() {
    if (!APP) { dcDrawWeb(); return; }
    var secEl = document.getElementById("dc"), bar = secEl && secEl.querySelector(".dc-bar"), ab = secEl && secEl.querySelector(".about"), ul = document.getElementById("dc-list");
    if (bar) bar.hidden = false;
    if (ab) ab.hidden = false;
    if (ul) ul.hidden = false;
    dcStat(); if (!DC.rows.length) dcDraw(); if (dcOn()) dcTick();
  }
  function buildDc() {
    document.querySelectorAll("#dc-mode button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.m === DC.mode);
      b.addEventListener("click", function () {
        DC.mode = b.dataset.m; DC.rows = []; DC.page = 1; DC.end = false; DC.more = false; dcSave(); window.scrollTo(0, 0);
        document.querySelectorAll("#dc-mode button").forEach(function (x) { x.classList.toggle("on", x === b); });
        dcDraw(); if (!DC.busy) dcTick();
      });
    });
    document.querySelectorAll("#dc-iv button").forEach(function (b) {
      b.classList.toggle("on", +b.dataset.v === DC.iv);
      b.addEventListener("click", function () {
        DC.iv = +b.dataset.v; DC.fail = 0; dcSave();
        document.querySelectorAll("#dc-iv button").forEach(function (x) { x.classList.toggle("on", x === b); });
        dcStat(); if (!DC.busy) dcTick();
      });
    });
    document.addEventListener("visibilitychange", function () { if (dcOn() && !DC.busy && !DC.timer) dcTick(); });
    dcStat();
  }
  // ---- 글 보기 (앱 안에서): 본문·사진·댓글. 사진은 앱이 디시 주소로 대신 받는다 (바로 부르면 막힘) ----
  var DC_TAGS = { P: 1, DIV: 1, BR: 1, SPAN: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, A: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, H1: 1, H2: 1, H3: 1, H4: 1, IMG: 1, VIDEO: 1, SOURCE: 1, TABLE: 1, TBODY: 1, TR: 1, TD: 1, TH: 1 };
  // 디시 사진 서버는 가끔 한 번씩 빈 응답을 준다: 한 번 더 받아 보고, 그래도 안 되면 자리표시 (원래 주소는 data-u에 남김)
  function dcImgRetry(im, u) {
    var tried = false;
    im.addEventListener("error", function () {
      if (!tried) { tried = true; setTimeout(function () { im.src = dcImg(u) + "&r=1"; }, 800); return; }
      var x = el("span", "dc-picx", "사진을 불러오지 못했어요"); x.dataset.u = u; im.replaceWith(x);
    });
  }
  function dcImg(u) { return APP ? "/proxy?u=" + encodeURIComponent(u) : u; }
  function dcClean(src) {  // 디시 본문 -> 허용한 태그만, 속성은 주소만 (스크립트·광고·이벤트 속성 없음)
    var out = document.createDocumentFragment();
    (function walk(from, to) {
      [].forEach.call(from.childNodes, function (n) {
        if (n.nodeType === 3) { to.appendChild(document.createTextNode(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        var tag = n.tagName;
        if (/^(SCRIPT|STYLE|NOSCRIPT|IFRAME|OBJECT|EMBED|FORM|INPUT|BUTTON|SELECT|TEXTAREA|INS)$/.test(tag)) return;
        var cls = " " + (n.getAttribute("class") || "") + " ", id = n.id || "";
        if (/adv-|dcads|auto_picture|btn-|blind/.test(cls) || /^auto_/.test(id)) return;
        if (!DC_TAGS[tag]) { walk(n, to); return; }
        if (tag === "IMG") {
          var u = n.getAttribute("data-original") || n.getAttribute("data-src") || n.getAttribute("src") || "";
          var fno = n.getAttribute("data-fileno");
          if (/m_webp/.test(u) && fno) {  // 모바일은 움직이는 사진을 자리표시만 줌 -> PC 화면 주소로 나중에 채움
            var ph = document.createElement("img"); ph.className = "dc-pic dc-wait"; ph.alt = ""; ph.dataset.fno = fno; to.appendChild(ph); return;
          }
          if (!/^https:\/\//.test(u) || /loading|nstatic\.dcinside\.com\/dc\/m\/img/.test(u)) return;
          var im = document.createElement("img"); im.src = dcImg(u); im.loading = "lazy"; im.alt = ""; im.className = "dc-pic";
          dcImgRetry(im, u);
          to.appendChild(im); return;
        }
        if (tag === "VIDEO" || tag === "SOURCE") {
          var vs = n.getAttribute("src") || (n.querySelector && n.querySelector("source") ? n.querySelector("source").getAttribute("src") : "");
          if (tag === "VIDEO") { var v = document.createElement("video"); v.controls = true; v.preload = "metadata"; v.className = "dc-pic"; if (vs) v.src = dcImg(vs); to.appendChild(v); }
          return;
        }
        var e = document.createElement(tag);
        if (tag === "A") { var h = n.getAttribute("href") || ""; if (/^https?:\/\//.test(h)) { e.href = h; e.target = "_blank"; e.rel = "noopener"; } }
        walk(n, e); to.appendChild(e);
      });
    })(src, out);
    return out;
  }
  function dcParsePost(h) {
    var doc = new DOMParser().parseFromString(h, "text/html");
    var tit = doc.querySelector(".gallview-tit-box .tit"), body = doc.querySelector(".thum-txtin");
    if (!tit || !body) return null;
    var info = [].slice.call(doc.querySelectorAll(".gallview-tit-box .ginfo2 li")).map(function (x) { return x.textContent.replace(/\s+/g, " ").trim(); });
    var stat = [].slice.call(doc.querySelectorAll(".gall-thum-btm-inner .ginfo2 li")).map(function (x) { return x.textContent.replace(/\s+/g, " ").trim(); });
    var cm = [].slice.call(doc.querySelectorAll(".all-comment-lst > li")).map(function (li) {
      var txt = li.querySelector(".txt"), nick = li.querySelector(".nick");
      if (!txt && !li.querySelector("img")) return null;
      return { nick: nick ? nick.textContent.trim() : "", ip: ((li.querySelector(".ip, .blockCommentIp") || {}).textContent || "").trim(), date: ((li.querySelector(".date") || {}).textContent || "").trim(),
        reply: /comment-add/.test(li.className), node: txt || li, del: /삭제된 댓글/.test(li.textContent) && !txt };
    }).filter(Boolean);
    var total = +((doc.getElementById("reple_totalCnt") || {}).value || cm.length);
    return { t: tit.textContent.replace(/\s+/g, " ").trim(), who: info[0] || "", when: info[1] || "", stat: stat.filter(function (x) { return x && !/^댓글/.test(x); }).join(" · "), body: body, cm: cm, total: total };
  }
  function dcFillWebp(box, no) {  // 움직이는 사진: PC 글 화면에서 data-fileno가 같은 img의 주소를 찾아 넣는다
    var wait = box.querySelectorAll("img.dc-wait");
    if (!wait.length) return;
    viaAppText("https://gall.dcinside.com/mgallery/board/view/?id=tft&no=" + no).then(function (h) {
      var map = {}, re = /<img[^>]*src="(https:\/\/dcimg\d*\.dcinside\.co\.kr\/viewimage\.php[^"]+)"[^>]*data-fileno="(\d+)"/g, m;
      while ((m = re.exec(h))) map[m[2]] = m[1].replace(/&amp;/g, "&");
      [].forEach.call(wait, function (im) {
        var u = map[im.dataset.fno];
        if (!u) { im.replaceWith(el("span", "dc-picx", "움직이는 사진은 디시에서 볼 수 있어요")); return; }
        im.classList.remove("dc-wait"); im.loading = "lazy";
        dcImgRetry(im, u);
        im.src = dcImg(u);
      });
    }).catch(function () { [].forEach.call(wait, function (im) { im.replaceWith(el("span", "dc-picx", "움직이는 사진은 디시에서 볼 수 있어요")); }); });
  }
  function dcOpen(r) {
    var v = el("div", "dc-view"); v.setAttribute("role", "dialog");
    var top = el("div", "dc-vtop"), back = el("button", "dc-back", "목록"); back.type = "button";
    var ext = el("a", "dc-ext", "디시에서 보기"); ext.href = r.href.replace(/\?.*$/, ""); ext.target = "_blank"; ext.rel = "noopener";
    top.appendChild(back); top.appendChild(ext); v.appendChild(top);
    var sc = el("div", "dc-vbody"); v.appendChild(sc);
    sc.appendChild(el("p", "dc-empty", "불러오는 중"));
    document.body.appendChild(v); document.body.classList.add("dc-open");
    DC.view = v; clearTimeout(DC.timer); DC.timer = null;
    function close() { v.remove(); document.body.classList.remove("dc-open"); DC.view = null; if (dcOn() && !DC.busy) dcTick(); }
    back.addEventListener("click", function () { navBack("dcview", close); });
    navPush("dcview", close);
    function load() {
      return viaAppText(r.href.replace(/\?.*$/, "")).then(function (h) {
        var p = dcParsePost(h);
        if (!p) throw new Error();
        if (DC.view !== v) return;
        var keep = sc.scrollTop;
        sc.innerHTML = "";
        sc.appendChild(el("h3", "dc-vt", p.t));
        sc.appendChild(el("p", "dc-vm", [p.who, p.when, p.stat].filter(Boolean).join(" · ")));
        var bd = el("div", "dc-vtext"); bd.appendChild(dcClean(p.body)); sc.appendChild(bd);
        dcFillWebp(bd, r.no);
        var ch = el("div", "dc-ch"), rl = el("button", "dc-rl", "새로고침"); rl.type = "button";
        ch.appendChild(el("b", null, "댓글 " + p.total)); ch.appendChild(rl); sc.appendChild(ch);
        rl.addEventListener("click", function () { rl.disabled = true; rl.textContent = "불러오는 중"; load().then(function () {}, function () {}); });
        var ul = el("ul", "dc-cm");
        if (!p.cm.length) ul.appendChild(el("li", "dc-cnone", "댓글이 없어요"));
        p.cm.forEach(function (c) {
          var li = el("li", c.reply ? "re" : null);
          var hd = el("div", "dc-ch2"); hd.appendChild(el("b", null, c.nick + (c.ip ? " " + c.ip : ""))); hd.appendChild(el("small", null, c.date));
          li.appendChild(hd);
          var tx = el("div", "dc-ctx"); if (c.del) tx.textContent = "삭제된 댓글이에요"; else tx.appendChild(dcClean(c.node));
          li.appendChild(tx); ul.appendChild(li);
        });
        sc.appendChild(ul);
        if (p.total > p.cm.length) { var more = el("a", "dc-morecm", "나머지 댓글 " + (p.total - p.cm.length) + "개는 디시에서 보기"); more.href = ext.href + "#comment_box"; more.target = "_blank"; more.rel = "noopener"; sc.appendChild(more); }
        sc.scrollTop = keep;
      });
    }
    load().catch(function () { if (DC.view === v) { sc.innerHTML = ""; sc.appendChild(el("p", "dc-empty", "글을 불러오지 못했어요. 삭제된 글일 수 있어요")); } });
  }
  buildDc();
