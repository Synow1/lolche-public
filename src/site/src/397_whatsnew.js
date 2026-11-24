  /* ---- 업데이트 소식: 앱이 새 버전·새 데이터를 받으면 한 번 띄운다 (2026-11-16 사용자: "업뎃되면 뭐가 업뎃됐는지 한번 띄워, 아카데미 탭도 다른 탭들도 전부")
     version.json의 notes(기능) + changes.json(탭별 데이터 변화: 아카데미·덱·증강·아이템 티어, 이스포츠 우승, 패치). 본 것은 기기에 기억 ---- */
  var WN_KEY = "tft-guide-seen";
  function wnCmp(a, b) { var x = String(a).split("."), y = String(b).split("."); for (var i = 0; i < 3; i++) { var d = (+x[i] || 0) - (+y[i] || 0); if (d) return d; } return 0; }
  function wnFmt(id) { var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d:\d\d)/.exec(id || ""); return m ? (+m[2]) + "/" + (+m[3]) + " " + m[4] : id; }
  function whatsNew(force) {
    Promise.all([
      fetch("version.json").then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch("changes.json").then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (res) {
      var ver = res[0], chg = res[1], seen = {};
      try { seen = JSON.parse(localStorage.getItem(WN_KEY) || "{}") || {}; } catch (e) {}
      if (!ver) return;
      var notes = ver.notes.filter(function (n) { return seen.v ? wnCmp(n.v, seen.v) > 0 : n === ver.notes[0]; }).slice(0, 5);
      var log = (chg && chg.log) || [];
      var data = log.filter(function (x) { return seen.c ? x.id > seen.c : x === log[0]; }).slice(0, 5);
      // 다시 보기(더보기 탭 버튼, 2026-11-16 사용자: "실수로 끄면 다시 보고 싶은데"): 최근 앱 버전 하나 + 데이터 업데이트 최근 5번을 날짜별로
      if (force) { notes = ver.notes.slice(0, 1); data = log.slice(0, force === "again" ? 5 : 1); }
      var mark = function () { try { localStorage.setItem(WN_KEY, JSON.stringify({ v: ver.version, c: log[0] ? log[0].id : seen.c || "" })); } catch (e) {} };
      if (WEB && !force && !seen.v) { mark(); return; }
      if (!notes.length && !data.length) { mark(); return; }
      wnShow(notes, data, mark, force === "again");
    });
  }
  function wnShow(notes, data, mark, sep) {
    var old = document.getElementById("wn"); if (old) old.remove();
    var ov = el("div", "wn"); ov.id = "wn";
    var card = el("div", "wn-card"); ov.appendChild(card);
    card.appendChild(el("h2", null, "업데이트 소식"));
    var body = el("div", "wn-body"); card.appendChild(body);
    if (notes.length) {
      var sec = el("section"); sec.appendChild(el("h3", null, "롤체 노트 v" + notes[0].v));
      var ul = el("ul"); notes.forEach(function (n) { n.items.forEach(function (t) { ul.appendChild(el("li", null, t)); }); }); sec.appendChild(ul); body.appendChild(sec);
    }
    // 데이터: 탭별로 모아서 (새로 받은 여러 번은 탭마다 한 덩어리). 다시 보기는 날짜별로 따로
    function group(list, title) {
      var byTab = {}, order = [];
      list.forEach(function (x) { x.items.forEach(function (it) { if (!byTab[it.tab]) { byTab[it.tab] = { name: it.name, lines: [] }; order.push(it.tab); } it.lines.forEach(function (l) { if (byTab[it.tab].lines.indexOf(l) < 0) byTab[it.tab].lines.push(l); }); }); });
      if (!order.length) return;
      body.appendChild(el("h3", null, title));
      order.forEach(function (k) {
        var t = byTab[k], s2 = el("section", "wn-tab");
        var go = el("button", "wn-go", t.name); go.type = "button";
        go.addEventListener("click", function () { closeUI(function () { goTab(k); }); });
        s2.appendChild(go);
        var u2 = el("ul"); t.lines.forEach(  // 다 보여 준다 (2026-11-24 사용자: "외 10개 이러지 말고 다 알려줘")
function (l) { u2.appendChild(el("li", null, l)); }); s2.appendChild(u2);
        body.appendChild(s2);
      });
    }
    if (sep) data.forEach(function (x) { group([x], "데이터 " + wnFmt(x.id) + " 업데이트"); });
    else if (data.length) group(data, "데이터 " + wnFmt(data[0].id) + " 업데이트");
    if (sep && !data.length) body.appendChild(el("p", "sub", "최근 데이터 변화는 아직 없어요"));
    var ok = el("button", "wn-ok", "확인"); ok.type = "button"; card.appendChild(ok);
    function close() { mark(); ov.remove(); }
    function closeUI(afterFn) { navBack("wn", close, afterFn); }
    navPush("wn", close);
    ok.addEventListener("click", function () { closeUI(); });
    ov.addEventListener("click", function (e) { if (e.target === ov) closeUI(); });
    document.body.appendChild(ov);
  }
  var wnAgain = document.getElementById("wn-again"); if (wnAgain) wnAgain.addEventListener("click", function () { whatsNew("again"); });
  // 게임 위 창에선 안 띄우고, 자동 점검(브라우저 자동화)에선 ?whatsnew=1일 때만
  if (!/overlay=1/.test(location.search) && (!navigator.webdriver || /[?&]whatsnew=1/.test(location.search))) setTimeout(function () { whatsNew(/[?&]whatsnew=1/.test(location.search)); }, 1200);
