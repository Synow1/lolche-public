  function evName(t, ev) { return t.set === 18 && CUP18[ev] ? CUP18[ev] : ev; }
  // 국기: Liquipedia 국가 코드 -> 이모지 (Liquipedia 고유 코드 몇 개는 ISO로 바꿈)
  function flagEmoji(c) {
    c = ({ ur: "uy", uk: "gb", en: "gb" })[c] || c;
    if (!/^[a-z]{2}$/.test(c || "")) return (c || "").toUpperCase();
    return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 97, 0x1F1E6 + c.charCodeAt(1) - 97);
  }
  var FLAG_N = null;
  function flagOf(name) {
    if (!ESP) return "";
    var f = ESP.flags, low = name.toLowerCase();
    if (f[name]) return f[name];
    for (var k in f) { var kl = k.toLowerCase(); if (kl === low || low.slice(-kl.length - 1) === " " + kl) return f[k]; }
    // 팀 태그·띄어쓰기가 달라도 (M8 L3S Coco = L3SCoco) 글자만 맞춰서
    if (!FLAG_N) { FLAG_N = []; for (var k2 in f) { var nk = k2.toLowerCase().replace(/[^0-9a-z가-힣]/g, ""); if (nk.length >= 3) FLAG_N.push([nk, f[k2]]); } }
    var nl = low.replace(/[^0-9a-z가-힣]/g, "");
    for (var i = 0; i < FLAG_N.length; i++) if (nl === FLAG_N[i][0] || (nl.length > FLAG_N[i][0].length && nl.slice(-FLAG_N[i][0].length) === FLAG_N[i][0] && FLAG_N[i][0].length >= 4)) return FLAG_N[i][1];
    return "";
  }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function evStatus(e) { var t = todayStr(); if (e.start && t < e.start) return "up"; if (e.end && t <= e.end) return "live"; return "done"; }
  // 올해면 "7/11", 다른 해면 "2025/7/11" (2026-11-15 사용자: "년도 다르면 년도 써줘")
  function fmtDay(iso, noYear) { if (!iso) return ""; var p = iso.slice(5, 10).split("-"), y = iso.slice(0, 4); return (!noYear && y !== todayStr().slice(0, 4) ? y + "/" : "") + (+p[0]) + "/" + (+p[1]); }
  function fmtRange(a, b) { return fmtDay(a) + "~" + fmtDay(b, (a || "").slice(0, 4) === (b || "").slice(0, 4)); }
  function dday(iso) { var a = new Date(iso + "T00:00:00"), b = new Date(todayStr() + "T00:00:00"); return Math.round((a - b) / 864e5); }
  function playerCell(name) {
    var c = el("span", "esp-p"), fl = flagOf(name);
    if (fl) c.appendChild(el("span", "flag", FLAG[fl] || flagEmoji(fl)));
    c.appendChild(document.createTextNode(name));
    if (fl === "kr") c.classList.add("kr");
    return c;
  }
  // 체크메이트 결승: 게임 전에 20점 이상이던 선수가 1등하면 우승 → [이름, 몇 번째 게임]
  function checkmateOf(rows) {
    var ng = Math.max.apply(null, rows.map(function (r) { return (r.p || []).length; }).concat([0])), sum = {};
    for (var g = 0; g < ng; g++) {
      var win = null;
      rows.forEach(function (r) { var x = (r.p || [])[g]; if (x === 1 && (sum[r.n] || 0) >= 20) win = r.n; });
      if (win) return [win, g + 1];
      rows.forEach(function (r) { var x = (r.p || [])[g]; if (x) sum[r.n] = (sum[r.n] || 0) + 9 - x; });
    }
    return null;
  }
  // 대회 단계 표도 시트처럼 (2026-11-15 사용자: "다른 대회들도 그렇게"): 게임마다 칸, 좌우로 밀기, 1등·순방 수는 끝 칸
  function espTable(rows, final, toFinal, trialsLast, gaps) {
    var box = el("div"), G = Math.max.apply(null, rows.map(function (r) { return (r.p || []).length; }).concat([0]));
    sheetTbl(box, rows.map(function (r, i) {
      var st = null;
      if (trialsLast) { if (i < 8 && !r.out) st = ["direct", "지역별 결승"]; else if (i < 16) st = ["qp", "선발전 포인트"]; }
      else if (r.adv === "direct_advance") st = ["direct", "조기 진출"];
      else if (toFinal && toFinal.indexOf(r.n) >= 0) st = ["direct", "진출"];
      if (final === "live" && r.pts >= 20) st = ["chk", "체크"];  // 끝난 결승엔 안 붙인다
      // 다른 사람보다 게임이 적으면 그 뒤 칸에 '탈락' (진출한 사람은 이름 밑 표시로 충분). 기록이 빠진 단계면 모르니 안 붙인다
      var end = null, n = (r.p || []).length;
      if (!gaps && n && n < G && !st) end = "탈락";
      return { n: r.n, pts: r.pts, p: r.p || [], st: st, cls: r.out ? "out" : "", w: r.w, t4: r.t4, end: end };
    }), { extra: [["1등", function (r) { return r.w; }], ["순방", function (r) { return r.t4; }]], state: {} });
    return box;
  }
  function stageView(t, e, box) {
    box.innerHTML = "";
    if (!e.stages.length) {
      if (e.players && e.players.length) {
        var kr = e.players.filter(function (p) { return (flagOf(p[1]) || p[0]) === "kr"; }).length;
        box.appendChild(el("p", "esp-meta", fmtRange(e.start, e.end) + " · 참가 " + e.players.length + "명 · 한국 " + kr + "명"));
        var pl = el("div", "esp-players"); e.players.forEach(function (p) { pl.appendChild(playerCell(p[1])); }); box.appendChild(pl);
      } else box.appendChild(el("p", "esp-meta", fmtRange(e.start, e.end) + " · 아직 결과 없음"));
      return;
    }
    var chips = el("div", "mt-chips"), tbox = el("div");
    e.stages.forEach(function (s, i) {
      var b = el("button", i === e.stages.length - 1 ? "on" : null, s.name); b.type = "button";
      b.addEventListener("click", function () { chips.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); draw(s); });
      chips.appendChild(b);
    });
    function draw(s) {
      tbox.innerHTML = "";
      if (s.final && !s.champion && !e.champion && !s.official) {
        var cm = checkmateOf(s.table);
        if (cm) { s.champion = cm[0]; s.decided_at = cm[1]; }
      }
      if (s.final && (s.champion || e.champion)) {
        var ch = el("div", "esp-champ"); var cu = el("span", "cup"); cu.appendChild(cupIcon()); ch.appendChild(cu);
        ch.appendChild(playerCell(s.champion || e.champion));
        if (s.official) ch.appendChild(el("small", null, s.decided_at && !s.lq ? s.decided_at + "번째 게임 체크메이트 · 공식 순위" : "공식 순위"));
        else if (s.decided_at) ch.appendChild(el("small", null, s.decided_at + "번째 게임 체크메이트"));
        else if (t.source === "apactft") ch.appendChild(el("small", null, "공식 순위"));
        tbox.appendChild(ch);
      }
      if (s.final && !(s.champion || e.champion)) {
        var ready = s.table.filter(function (r) { return r.pts >= 20; }).map(function (r) { return r.n; });
        tbox.appendChild(el("p", "esp-cm", "체크메이트: 20점 넘긴 뒤 1등하면 우승" + (ready.length ? " · 체크 " + ready.join(", ") : "")));
      }
      // 다음 단계가 결승이면 결승에 간 선수를 '진출'로, 먼저 확정된 선수는 '조기 진출'
      var nx = e.stages[e.stages.indexOf(s) + 1];
      if (!nx) { var ne = t.events[t.events.indexOf(e) + 1]; nx = ne && ne.stages.length === 1 ? ne.stages[0] : null; }  // 2주차 다음 '그랜드 파이널'이 따로 된 대회
      var toFinal = nx && nx.final ? nx.table.map(function (r) { return r.n; }) : null;
      // MetaTFT 기록이 빠진 단계: 8명 로비라 게임 수 합이 8의 배수가 아니거나, 게임 수가 4단계보다 들쭉날쭉하면 (2026-11-15 사용자: "게임을 하다 만 거여?")
      var gsum = 0, gk = {}; s.table.forEach(function (r) { gsum += r.g || 0; gk[r.g || 0] = 1; });
      s.gaps = t.source !== "apactft" && !s.lq && !s.lqg && (gsum % 8 !== 0 || Object.keys(gk).length > 4);
      if (s.gaps) tbox.appendChild(el("p", "esp-cm warn", "MetaTFT에 이 단계 게임 기록이 일부 빠져 있어요. 빈 칸은 탈락이 아니라 기록이 없는 게임일 수 있어요"));
      var early = s.table.filter(function (r) { return r.adv === "direct_advance"; });
      if (t.kind === "trials") tbox.appendChild(el("p", "esp-cm", ({ "3일차": "3일차 128명은 1주차 통과 56명, 랭크 상위로 바로 온 40명, 하위 지역 대회 32명이에요. 1주차 순위는 공식 사이트에 없어요", "4일차": "4일차 64명 중 상위 32명이 마지막 날로 가요", "5일차": "마지막 날은 3·5·6번째 게임 뒤 8명씩 떨어져요. 남은 8명이 지역별 결승 1주차, 9~16위는 선발전 포인트를 받아요" })[s.name] || ""));
      if (early.length) {
        var gE = Math.max.apply(null, early.map(function (r) { return r.g; })), gA = Math.max.apply(null, s.table.map(function (r) { return r.g; }));
        tbox.appendChild(el("p", "esp-cm", nx && nx.final || t.kind !== "trials" ? "조기 진출: " + gE + "게임 후 상위 " + early.length + "명은 결승 확정" + (gA > gE ? ", 나머지는 " + gA + "게임까지 진행해요" : "")
          : "조기 진출: " + gE + "게임 후 상위 " + early.length + "명은 다음 날 진출 확정, 나머지는 " + gA + "게임까지 진행해요"));
      }
      if (s.lq) tbox.appendChild(el("p", "esp-cm", "공식 최종 순위 · 게임별 점수 없음 · 출처 Liquipedia"));
      var tq = t.kind === "trials" && s.name === "5일차" ? s.table : null;  // 시험 마지막 날: 남은 8명 = 지역별 결승, 9~16위 = 선발전 포인트
      tbox.appendChild(espTable(s.table, s.final && !(s.champion || e.champion) ? "live" : s.final, toFinal, tq, s.gaps));
    }
    if (e.live && e.liveAt) box.appendChild(el("p", "esp-cm", updAt(e.liveAt) + " · 출처 공식 사이트"));
    if (e.stages.length > 1) box.appendChild(chips);
    box.appendChild(tbox); draw(e.stages[e.stages.length - 1]);
  }
  // 전체 화면으로 크게 보기 (카드 안에서 펼치면 좁아서, 2026-11-15 사용자: "아예 다른 화면으로 이동해서 크게 보는 식도 괜찮아")
  function fsOpen(title, sub, build, backLabel) {
    var v = el("div", "dc-view fs-view"); v.setAttribute("role", "dialog");
    var top = el("div", "dc-vtop"), back = el("button", "dc-back", backLabel || "이스포츠"); back.type = "button"; top.appendChild(back); v.appendChild(top);
    var sc = el("div", "dc-vbody");
    sc.appendChild(el("h3", "dc-vt", title)); if (sub) sc.appendChild(el("p", "dc-vm", sub));
    v.appendChild(sc); document.body.appendChild(v); document.body.classList.add("dc-open");
    function close() { v.remove(); if (!document.querySelector(".dc-view")) document.body.classList.remove("dc-open"); }
    v._navClose = function (afterFn) { navBack("fs", close, afterFn); };
    back.addEventListener("click", function () { navBack("fs", close); });
    navPush("fs", close);
    build(sc);
    return v;
  }
  function espOpenFull(t) {
    var startIdx = Math.max(0, t.events.findIndex(function (e) { return evStatus(e) !== "done"; }));
    if (t.events.every(function (e) { return evStatus(e) === "done"; })) startIdx = t.events.length - 1;
    fsOpen((t.region === "WORLD" ? "" : t.region + " ") + KIND_NAME[t.kind], (SET_NAME[t.set] || "S" + t.set) + " · " + fmtRange(t.start, t.end), function (b) {
      var chips = el("div", "mt-chips evchips"), sbox = el("div");
      t.events.forEach(function (e, i) {
        var x = el("button", i === startIdx ? "on" : null, evName(t, e.ev)); x.type = "button"; if (e.champion) x.appendChild(cupIcon());
        x.addEventListener("click", function () { chips.querySelectorAll("button").forEach(function (y) { y.classList.toggle("on", y === x); }); stageView(t, e, sbox); });
        chips.appendChild(x);
      });
      if (t.events.length > 1) b.appendChild(chips);
      b.appendChild(sbox);
      if (t.events.length) stageView(t, t.events[startIdx], sbox);
    });
  }
  function espCard(t) {
    var card = el("article", "esp-card" + (t.kind === "crown" ? " crown" : "")); card.dataset.name = t.name;
    var head = el("button", "esp-head"); head.type = "button";
    var title = el("div");
    var nm = el("b", null, (t.region === "WORLD" ? "" : t.region + " ") + KIND_NAME[t.kind]);
    var stat = t.events.map(evStatus);
    if (stat.indexOf("live") >= 0) nm.appendChild(el("span", "live", "진행 중"));
    else if (stat.indexOf("up") >= 0) nm.appendChild(el("span", "soon", "예정"));
    title.appendChild(nm);
    title.appendChild(el("small", null, (SET_NAME[t.set] || "S" + t.set) + " · " + fmtRange(t.start, t.end)));
    head.appendChild(title);
    var champs = t.events.filter(function (e) { return e.champion; });
    var last = champs[champs.length - 1];
    if (last) {
      var w = el("div", "esp-win"), ws = el("small"); ws.appendChild(cupIcon()); ws.appendChild(document.createTextNode(evName(t, last.ev))); w.appendChild(ws);
      w.appendChild(playerCell(last.champion)); head.appendChild(w);
    }
    card.appendChild(head);
    head.classList.add("go"); head.addEventListener("click", function () { espOpenFull(t); });
    return card;
  }
  function espNow() {
    var box = document.getElementById("esp-now"); box.innerHTML = "";
    var items = [];
    ESP.tournaments.forEach(function (t) {
      t.events.forEach(function (e) {
        var s = evStatus(e);
        if (s === "live" || (s === "up" && dday(e.start) <= 21)) items.push({ t: t, e: e, s: s });
      });
    });
    (ESP.schedule || []).forEach(function (x) { if (dday(x.end) >= 0) items.push({ t: { name: x.name, region: "WORLD", kind: "crown", set: x.set }, e: { ev: x.label || "", start: x.start, end: x.end, stages: [] }, s: evStatus(x), sched: true }); });
    items.sort(function (a, b) { return (a.s === "live" ? 0 : 1) - (b.s === "live" ? 0 : 1) || a.e.start.localeCompare(b.e.start); });
    if (!items.length) { box.hidden = true; return; }
    items.forEach(function (x) {
      var r = el("button", "now-row"); r.type = "button";
      r.appendChild(el("span", x.s === "live" ? "live" : "soon", x.s === "live" ? "LIVE" : "D-" + dday(x.e.start)));
      var mid = el("div");
      mid.appendChild(el("b", null, (x.t.region === "WORLD" ? "" : x.t.region + " ") + KIND_NAME[x.t.kind] + (x.e.ev ? " · " + evName(x.t, x.e.ev) : "")));
      var sub = fmtRange(x.e.start, x.e.end);
      // 아직 경기가 없는 단계(전원 0점)는 건너뛰고 점수가 있는 마지막 단계의 1위
      var st = (x.e.stages || []).filter(function (g) { return g.table.length && g.table[0].pts > 0; }).pop();
      if (st) sub += " · " + (x.e.stages.length > 1 ? st.name + " " : "") + "1위 " + st.table[0].n + " " + st.table[0].pts + "점";
      else if (x.sched && ESP.crown && ESP.crown.players) sub += " · 진출 " + ESP.crown.players.length + "명 확정";
      else if (x.e.players && x.e.players.length) sub += " · " + x.e.players.length + "명 · 한국 " + x.e.players.filter(function (p) { return (flagOf(p[1]) || p[0]) === "kr"; }).length + "명";
      mid.appendChild(el("small", null, sub));
      r.appendChild(mid);
      if (x.sched) r.addEventListener("click", function () { var h = document.querySelector("#esp-list .wd-card .esp-head"); if (h) h.click(); });
      else r.addEventListener("click", function () {
        espOpenFull(x.t);
      });
      box.appendChild(r);
    });
  }
  function espList() {
    var box = document.getElementById("esp-list"); box.innerHTML = "";
    var items = [];
    var cw = (ESP.schedule || []).filter(function (x) { return dday(x.end) >= -3 && dday(x.start) <= 30; })[0];
    // 끝나서 역대 월즈 기록(단계별)이 생기면 실시간 카드 대신 그 카드 하나만 (같은 월즈 카드가 둘 뜨지 않게)
    if (cw && dday(cw.end) < 0 && (ESP.worlds || []).some(function (w) { return w.set === cw.set && w.stages && w.stages.length; })) cw = null;
    if (cw) items.push({ d: cw.start, el: crownCard(cw), r: "WORLD" });
    ESP.tournaments.filter(function (t) { return t.kind !== "crown"; }).forEach(function (t) { items.push({ d: t.start, el: espCard(t), r: t.region }); });
    (ESP.worlds || []).filter(function (w) { return w.top.length; }).forEach(function (w) { items.push({ d: w.start || "", el: wdCard(w), r: "WORLD" }); });
    items.filter(function (x) { return !espRegion || x.r === espRegion; }).sort(function (a, b) { return (b.d || "").localeCompare(a.d || ""); }).forEach(function (x) { box.appendChild(x.el); });
  }
  // 이번 월즈 카드: 누르면 전체 화면에 실시간 순위·진출자를 옮겨 붙인다 (닫으면 제자리로)
  function crownCard(cw) {
    var card = el("article", "esp-card crown wd-card"), head = el("button", "esp-head go"); head.type = "button";
    var title = el("div"), st = evStatus(cw);
    var nm = el("b", null, "월즈 · " + (cw.label || "")); if (st === "live") nm.appendChild(el("span", "live", "진행 중")); else if (st === "up") nm.appendChild(el("span", "soon", "D-" + dday(cw.start)));
    title.appendChild(nm); title.appendChild(el("small", null, "S" + cw.set + " 전략가의 왕관 · " + fmtRange(cw.start, cw.end)));
    head.appendChild(title);
    var r = el("div", "esp-win"), ws = el("small", null, st === "done" ? "우승" : ESP.crown && ESP.crown.players ? "진출 " + ESP.crown.players.length + "명" : ""); r.appendChild(ws); head.appendChild(r);
    card.appendChild(head);
    head.addEventListener("click", function () {
      var live = document.getElementById("esp-live"), cr = document.getElementById("esp-crown"), stash = document.getElementById("esp-stash");
      var v = fsOpen("S" + cw.set + " " + (cw.label || "") + " 월즈", "전략가의 왕관 · " + fmtRange(cw.start, cw.end), function (b) { b.appendChild(live); b.appendChild(cr); });
      LV.box = v; lvDraw(); espCrown(); lvIfDue(true);
      var mo = new MutationObserver(function () { if (!v.isConnected) { stash.appendChild(live); stash.appendChild(cr); LV.box = null; mo.disconnect(); } });
      mo.observe(document.body, { childList: true });
    });
    return card;
  }
  function espPoints(region) {
    var box = document.getElementById("esp-pts"); box.innerHTML = "";
    var keys = Object.keys(ESP.propoints).filter(function (k) { return k.split("|")[1] === region; }).sort();
    var rows = keys.length ? ESP.propoints[keys[keys.length - 1]] : [];
    if (!rows.length) { box.appendChild(el("p", "empty", "아직 기록이 없어요")); return; }
    var wrap = el("div", "tbl esp-tbl"), tb = el("table"), body = el("tbody");
    var th = el("thead"), tr = el("tr"); ["#", "선수", "포인트", ""].forEach(function (h, i) { tr.appendChild(el("th", i > 1 ? "n" : null, h)); }); th.appendChild(tr); tb.appendChild(th);
    rows.forEach(function (r) {
      var stage = r.rank === 1 ? "월즈 직행" : r.rank <= 16 ? "결승 2주차" : r.rank <= 28 ? "결승 1주차" : r.rank <= 32 ? "플레이인" : "";
      var row = el("tr", (flagOf(r.n) === "kr" ? "kr " : "") + (r.rank === 1 ? "cut1" : r.rank <= 16 ? "cut16" : r.rank <= 28 ? "cut28" : "cut32"));
      row.appendChild(el("td", "n", r.rank));
      var td = el("td"); td.appendChild(playerCell(r.n)); row.appendChild(td);
      row.appendChild(el("td", "n b", r.pts == null ? "-" : r.pts));
      row.appendChild(el("td", "n rfstage", stage));
      body.appendChild(row);
    });
    tb.appendChild(body); wrap.appendChild(tb); box.appendChild(wrap);
  }
  // 앱에서는 진행 중인 APAC 대회 순위를 공식 사이트에서 바로 받아 갈아끼운다
  // 이스포츠 탭을 보고 있으면 1분마다 다시 받는다 (탭에 들어올 때도)
  var apacAt = 0;
  function apacLiveIfDue(force) {
    if (!ESP || document.hidden || current !== "esports") return;
    if (!force && Date.now() - apacAt < 55000) return;
    apacAt = Date.now(); apacLive();
  }
  setInterval(function () { apacLiveIfDue(false); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && Date.now() - apacAt > 30000) apacLiveIfDue(true); });
  function apacLive() {
    if (!APP) return;
    ESP.tournaments.forEach(function (t) {
      if (t.region !== "APAC") return;
      t.events.forEach(function (e) {
        if (!e.slug || evStatus(e) !== "live") return;
        var host = "https://set" + t.set + ".apactft.com/" + e.slug + "/standings?lb=";
        var stages = [];
        (function load(lb) {
          fetch("/proxy?u=" + encodeURIComponent(host + lb)).then(function (r) { return r.text(); }).then(function (h) {
            h = h.replace(/\\"/g, '"');
            var objs = (h.match(/\{"player_id":"[^"]+","rank":\d+.*?"is_eliminated":(?:true|false)\}/g) || []).map(function (x) { return JSON.parse(x); });
            // 게임 번호가 대회 전체로 이어져서(결승 첫 게임 = 15) 이 단계에서 나온 번호만 쓴다
            var rounds = [];
            objs.forEach(function (o) { Object.keys(o.round_points || {}).forEach(function (k) { if (o.round_points[k] && rounds.indexOf(+k) < 0) rounds.push(+k); }); });
            rounds.sort(function (a, b) { return a - b; });
            var rows = objs.sort(function (a, b) { return a.rank - b.rank; })
              .map(function (o) {
                var rp = o.round_points || {}, pl = rounds.map(function (k) { return rp[k] ? 9 - rp[k] : 0; });  // 1등 8점 … 8등 1점
                return { n: o.player_name, r: (o.player_region || "").toLowerCase(), pts: o.segment_points || 0, g: Object.keys(rp).length, w: o.first_place_count || 0, t4: o.top4_count || 0, out: !!o.is_eliminated, p: pl, adv: o.tier === "direct_advance" ? o.tier : undefined };
              });
            var n = (h.match(/standings\?lb=(\d+)/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length || 1;
            if (rows.length && rows.some(function (r) { return r.g; })) stages.push({ name: lb === n - 1 && rows.length === 8 ? "결승" : (/trials/.test(e.slug) ? (lb + 3) + "일차" : n > 1 ? (lb + 1) + "부" : "순위"), final: lb === n - 1 && rows.length === 8, table: rows });
            if (lb + 1 < n) load(lb + 1);
            else if (stages.length) { e.stages = stages; e.live = true; e.liveAt = new Date(); espNow(); espList(); }
          }).catch(function () {});
        })(0);
      });
    });
  }
  // 월즈 실시간 순위 (대회 기간, 앱에서만): MetaTFT 대회 게임 기록을 1분마다 받아 바로 계산한다.
  // 1일차 40명 6게임 → 상위 32명, 2일차 32 → 24 → 16 → 8명 결승 (체크메이트: 20점 넘긴 뒤 1등하면 우승). 공식 결과는 다음 날 아침 점검에서 Liquipedia로 맞춘다
  var LV = { at: 0, tour: null, games: null, err: false, pick: null, sheet: null };
  function lvWindow() {
    var s = (ESP && ESP.schedule || []).filter(function (x) { return dday(x.start) <= 1 && dday(x.end) >= 0; })[0];
    return s || null;
  }
  function lvNames(m) {  // MetaTFT 경기 기록 -> {puuid: 선수 이름} (팀 태그 붙은 공식 이름이 있으면 그걸로)
    var names = m.player_names || [], out = {};
    m.data.info.participants.forEach(function (p) {
      var g = (p.riotIdGameName || "").trim(), lo = g.toLowerCase();
      out[p.puuid] = names.filter(function (n) { return n.toLowerCase() === lo; })[0] || names.filter(function (n) { return n.toLowerCase().slice(-lo.length - 1) === " " + lo; })[0] || g || p.puuid.slice(0, 6);
    });
    return out;
  }
  function lvLoad() {
    var w = lvWindow();
    if (!w || !APP) return;
    LV.at = Date.now();
    lvSheet(w).then(function (sh) { if (sh || LV.sheet) { LV.sheet = sh; lvDraw(); } });
    getMT("public/esports/tournaments").then(function (d) {
      var t = (d.data || []).filter(function (x) { return /CROWN/i.test(x.competition_name) && new RegExp("\\bS" + w.set + "\\b", "i").test(x.competition_name); })[0];
      if (!t) { LV.tour = null; LV.games = []; LV.err = false; lvDraw(); return; }
      return getMT("public/esports/tournaments/" + encodeURIComponent(t.competition_name) + "/matches").then(function (r) {
        var games = (r.data || []).map(function (m) {
          var nm = lvNames(m);
          return { stage: m.stage_name || "", at: m.data.info.gameCreation || 0, g: m.data.info.participants.map(function (p) { return [nm[p.puuid], p.placement]; }) };
        }).sort(function (a, b) { return a.at - b.at; });
        LV.tour = t; LV.games = games; LV.err = false; lvDraw();
      });
    }).catch(function () { LV.err = true; lvDraw(); });
  }
  // 공식 결과 시트: competetft.com 대회 페이지의 일차 칸에 구글 시트가 걸리면 그 시트의 순위표 탭을 CSV로 받는다 (지역 결승 때 이 방식, 게임 칸은 그 게임 점수 8~1)
  function csvRows(t) {
    var rows = [], row = [], cur = "", q = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function sheetTable(csv) {  // 머리 줄(Name·Points·GAME n)을 찾아 선수 줄로
    var rows = csvRows(csv), h = -1, ni = -1, pi = -1, gi = [];
    for (var r = 0; r < Math.min(rows.length, 15) && h < 0; r++) {
      var low = rows[r].map(function (x) { return x.trim().toLowerCase(); });
      ni = low.indexOf("name"); pi = low.findIndex(function (x) { return /^(total )?points?$/.test(x); });
      if (ni >= 0 && pi >= 0) { h = r; gi = low.map(function (x, k) { return /^(game|round)\s*\d+$/.test(x) ? k : -1; }).filter(function (k) { return k >= 0; }); }
    }
    if (h < 0) return [];
    var out = [];
    rows.slice(h + 1).forEach(function (c) {
      var n = (c[ni] || "").trim(), pts = parseInt(c[pi], 10);
      if (!n || n === "--" || isNaN(pts)) return;
      var p = gi.map(function (k) { var v = parseInt(c[k], 10); return v >= 1 && v <= 8 ? 9 - v : 0; });
      out.push({ n: n, pts: pts, g: p.filter(Boolean).length, w: p.filter(function (x) { return x === 1; }).length, t4: p.filter(function (x) { return x && x <= 4; }).length, p: p });
    });
    return out;
  }
  function lvSheet(w) {
    // 시트 주소: SCHEDULE.sheet(손으로 넣은 공식 시트, 2PACX 키 또는 문서 번호)가 먼저, 없으면 대회 페이지 일차 칸에서 찾는다
    var known = w.sheet ? Promise.resolve('https://docs.google.com/spreadsheets/d/' + (/^2PACX/.test(w.sheet) ? "e/" : "") + w.sheet + "/")
      : !w.ct ? Promise.resolve("") : fetch("/proxy?u=" + encodeURIComponent("https://competetft.com/en-US/tournament/" + w.ct + "/overview")).then(function (r) { return r.ok ? r.text() : ""; });
    return known.then(function (h) {
      var m = h.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/(e\/)?([A-Za-z0-9_-]{20,})/);
      if (!m) return null;
      var base = "https://docs.google.com/spreadsheets/d/" + (m[1] ? "e/" + m[2] : m[2]);
      return fetch("/proxy?u=" + encodeURIComponent(base + (m[1] ? "/pubhtml" : "/htmlview"))).then(function (r) { return r.text(); }).then(function (hv) {
        var tabs = [], re = /\{name: "([^"]+)", pageUrl: "[^"]*gid=(\d+)/g, x;
        while ((x = re.exec(hv))) tabs.push({ name: x[1].replace(/\\u0026|\\x26/g, "&"), gid: x[2] });
        tabs = tabs.filter(function (t) { return /leaderboard|final|standing|day|round/i.test(t.name) && !/lobb|overview|creator|schedule/i.test(t.name); });
        return Promise.all(tabs.map(function (t) {
          var u = m[1] ? base + "/pub?output=csv&gid=" + t.gid : base + "/export?format=csv&gid=" + t.gid;
          return fetch("/proxy?u=" + encodeURIComponent(u)).then(function (r) { return r.text(); }).then(function (csv) {
            return { name: t.name, rows: sheetTable(csv), final: /grand|final|day\s*3/i.test(t.name) };  // 월즈는 3일차가 결승
          }).catch(function () { return null; });
        }));
      }).then(function (st) { st = (st || []).filter(function (x) { return x && x.rows.some(function (r) { return r.pts > 0; }); }); return st.length ? { url: base, stages: st } : null; });
    }).catch(function () { return null; });
  }
  function lvStages() {  // 단계 이름 순서대로 (처음 게임 시각 순)
    var seen = [];
    (LV.games || []).forEach(function (x) { if (seen.indexOf(x.stage) < 0) seen.push(x.stage); });
    return seen;
  }
  function lvIsFinal(stage) { return /GRAND|FINAL(?!S\s*\|)/i.test(stage.replace(/^.*\|/, "")) || /GRAND/i.test(stage); }
  function lvStageKo(stage) {
    var s = stage.replace(/^.*\|\s*/, "").trim();
    var m = s.match(/ROUND OF (\d+)/i); if (m) return m[1] + "강";
    m = s.match(/DAY\s*(\d)/i); if (m) return m[1] + "일차";
    if (/GRAND|FINAL/i.test(s)) return "결승";
    return s;
  }
  function lvTable(games) {
    var acc = {}, order = [];
    games.forEach(function (x, gi) {
      x.g.forEach(function (p) {
        var a = acc[p[0]] || (acc[p[0]] = { n: p[0], pts: 0, g: 0, w: 0, t4: 0, p: games.map(function () { return 0; }), last: gi });
        a.pts += 9 - p[1]; a.g++; a.w += p[1] === 1; a.t4 += p[1] <= 4; a.p[gi] = p[1]; a.last = gi;
      });
    });
    Object.keys(acc).forEach(function (k) { order.push(acc[k]); });
    return order.sort(function (a, b) { return b.pts - a.pts || (2 * b.w + b.t4) - (2 * a.w + a.t4); });
  }
  function lvDraw() {
    var box = document.getElementById("esp-live"), w = lvWindow();
    if (!box) return;
    if (!w || !APP) { box.hidden = true; return; }
    box.hidden = false; box.className = "lv"; box.innerHTML = "";
    var head = el("div", "lv-head"), h = el("h3");
    var any = (LV.games && LV.games.length) || LV.sheet;
    if (any) h.appendChild(el("span", "lv-dot"));
    h.appendChild(document.createTextNode("월즈 실시간 순위"));
    head.appendChild(h);
    head.appendChild(el("small", "lv-at", LV.at ? new Date(LV.at).toTimeString().slice(0, 5) + " 확인" : ""));
    box.appendChild(head);
    if (LV.sheet) { lvDrawSheet(box); return; }
    if (!LV.games) { box.appendChild(el("p", "lv-empty", "불러오는 중")); return; }
    if (!any) {
      box.appendChild(el("p", "lv-empty", LV.err ? "MetaTFT에 연결하지 못했어요. 1분 뒤 다시 확인해요" : "아직 올라온 경기 기록이 없어요. 기록이 올라오면 1분 안에 여기에 보여요"));
      return;
    }
    var stages = lvStages(), fin = stages.filter(lvIsFinal), pre = stages.filter(function (s) { return !lvIsFinal(s); });
    var views = [];
    if (fin.length) views.push(["결승", fin]);
    if (pre.length) views.push([fin.length ? "본선 누적" : "누적", pre]);
    pre.slice().reverse().forEach(function (s) { views.push([lvStageKo(s), [s]]); });
    if (!LV.pick || !views.some(function (v) { return v[0] === LV.pick; })) LV.pick = views[0][0];
    if (views.length > 1) {
      var chips = el("div", "mt-chips");
      views.forEach(function (v) {
        var b = el("button", v[0] === LV.pick ? "on" : null, v[0]); b.type = "button";
        b.addEventListener("click", function () { LV.pick = v[0]; lvDraw(); });
        chips.appendChild(b);
      });
      box.appendChild(chips);
    }
    var view = views.filter(function (v) { return v[0] === LV.pick; })[0];
    var games = LV.games.filter(function (x) { return view[1].indexOf(x.stage) >= 0; });
    var rows = lvTable(games), isFin = view[0] === "결승";
    var cm = isFin ? checkmateOf(rows) : null;
    if (cm) rows.sort(function (a, b) { return (b.n === cm[0]) - (a.n === cm[0]); });
    // 탈락 표시: 누적 보기에서 마지막 단계에 안 나온 선수
    var lastStage = pre[pre.length - 1], inLast = {};
    LV.games.filter(function (x) { return x.stage === lastStage; }).forEach(function (x) { x.g.forEach(function (p) { inLast[p[0]] = 1; }); });
    var nGames = isFin ? games.length : Math.max.apply(null, rows.map(function (r) { return r.g; }));
    var lobbies = Math.max(1, Math.round(rows.length / 8));
    var kr = rows.filter(function (r) { return flagOf(r.n) === "kr"; });
    var sub = (isFin ? "결승 " + games.length + "게임" + (cm ? " · 우승 " + cm[0] : " · 20점 넘긴 뒤 1등하면 우승") : rows.length + "명 · 선수당 " + nGames + "게임 · 로비 " + lobbies + "개")
      + (kr.length ? " · " + kr.map(function (r) { return r.n + " " + (rows.indexOf(r) + 1) + "위 " + r.pts + "점"; }).join(", ") : "");
    box.appendChild(el("p", "lv-sub", sub));
    var showOut = view[0].indexOf("누적") >= 0 && view[1].length > 1;
    sheetTbl(box, rows.map(function (r, i) {
      var cls = (cm && r.n === cm[0] ? "win " : "") + (showOut && !inLast[r.n] ? "out " : "");
      if (!isFin && view[1].length === 1 && /ROUND OF 40|DAY 1/i.test(view[1][0]) && i === 32) cls += "cut";
      return { n: r.n, pts: r.pts, p: r.p, cls: cls.trim(), st: cm && r.n === cm[0] ? ["win", "우승"] : null };
    }));
  }
  function lvTabKo(n) {  // 시트 탭 이름을 한국어로 (Grand Finals -> 결승, Day 2 -> 2일차, Round of 16 -> 16강)
    var s0 = n.replace(/\s*-?\s*leaderboard/i, "").trim(), m;
    if (/grand\s*final|^finals?$/i.test(s0)) return "결승";
    if ((m = s0.match(/round of (\d+)/i))) return m[1] + "강";
    if ((m = s0.match(/days?\s*(\d+)\s*&\s*(\d+)/i))) return m[1] + "·" + m[2] + "일차";
    if ((m = s0.match(/day\s*(\d+)/i))) return m[1] + "일차";
    if ((m = s0.match(/week\s*(\d+)/i))) return m[1] + "주차";
    if (/play-?ins?/i.test(s0)) return "플레이인";
    return s0;
  }
  // 시트처럼: 게임마다 칸을 나누고 좌우로 밀어서 본다 (순위·선수·점수 칸은 고정). 좁은 폭에 욱여넣어 줄바꿈되던 것보다 읽기 쉽다 (2026-11-14 사용자)
  // rows: [{n, pts, p:[등수…(0 = 안 함)], st:[종류, 글자], cls}], o.groups: [[단계 이름, 게임 수]…]
  function sheetTbl(box, rows, o) {
    o = o || {};
    var G = Math.max.apply(null, rows.map(function (r) { return r.p.length; }).concat([0]));
    var wrap = el("div", "sht"), tb = el("table"), th = el("thead"), body = el("tbody");
    var starts = {}, k0 = 0; (o.groups || []).forEach(function (g) { starts[k0] = 1; k0 += g[1]; });
    if (o.groups && o.groups.length) {
      var tg = el("tr", "sht-g"); ["", "", ""].forEach(function (x, i) { tg.appendChild(el("th", ["c-rk", "c-nm", "c-pt"][i])); });
      var used = 0; o.groups.forEach(function (g) { if (used >= G) return; var c = el("th", "g0", g[0]); c.colSpan = Math.min(g[1], G - used); tg.appendChild(c); used += g[1]; });
      th.appendChild(tg);
    }
    var tr = el("tr"); tr.appendChild(el("th", "c-rk", "#")); tr.appendChild(el("th", "c-nm", "선수")); tr.appendChild(el("th", "c-pt", "점수"));
    for (var g = 0; g < G; g++) tr.appendChild(el("th", "gc" + (starts[g] && g ? " g0" : ""), g + 1));
    (o.extra || []).forEach(function (x, i) { tr.appendChild(el("th", "xc" + (i ? "" : " g0"), x[0])); });
    th.appendChild(tr); tb.appendChild(th);
    rows.forEach(function (r, i) {
      var fl = r.f || flagOf(r.n);
      var row = el("tr", ((fl === "kr" ? "kr " : "") + (r.cls || "")).trim() || null);
      row.appendChild(el("td", "c-rk", r.rk != null ? r.rk : i + 1));
      var pc = playerCell(r.n);
      if (r.f && !pc.querySelector(".flag")) { pc.insertBefore(el("span", "flag", FLAG[r.f] || flagEmoji(r.f)), pc.firstChild); if (r.f === "kr") pc.classList.add("kr"); }
      var td = el("td", "c-nm"); td.appendChild(pc); if (r.st) td.appendChild(el("span", "lv-st " + r.st[0], r.st[1])); row.appendChild(td);
      row.appendChild(el("td", "c-pt", r.pts));
      var last = -1; r.p.forEach(function (v, k) { if (v) last = k; });
      for (var k = 0; k < G; k++) {
        var v = r.p[k], c = el("td", "gc" + (starts[k] && k ? " g0" : "") + (r.end && k > last ? " gx" : ""));
        if (v) c.appendChild(el("span", "pv " + plCls(v), v));
        else if (r.end && k === last + 1) { c.colSpan = G - k; c.appendChild(el("span", "gend", r.end)); row.appendChild(c); break; }  // 뒤 칸을 하나로: 탈락·진출
        row.appendChild(c);
      }
      (o.extra || []).forEach(function (x, j) { var v2 = x[1](r); row.appendChild(el("td", "xc" + (j ? "" : " g0"), v2 == null ? "-" : v2)); });
      body.appendChild(row);
    });
    tb.appendChild(body); wrap.appendChild(tb); box.appendChild(wrap);
    if (!o.noLimit) lvLimit(box, body, o.state);
    return wrap;
  }
  // 순위판은 처음 16줄만, 나머지는 버튼으로 (탭을 너무 길게 차지하던 문제, 2026-11-14 사용자). 펼침 상태는 다시 그려도 유지
  function lvLimit(box, body, state) {
    var S = state || LV, trs = [].slice.call(body.children), N = 16;
    if (trs.length <= N + 2) return;
    var more = el("button", "lv-more"); more.type = "button";
    var set = function () { trs.forEach(function (t, i) { t.hidden = !S.all && i >= N; }); more.textContent = S.all ? "접기" : "전체 " + trs.length + "명 보기"; };
    more.addEventListener("click", function () { S.all = !S.all; set(); if (!S.all) box.scrollIntoView({ block: "start" }); });
    set(); box.appendChild(more);
  }
  function lvDrawSheet(box) {  // 공식 시트 탭마다 칩, 결승 탭은 체크메이트
    var st = LV.sheet.stages.slice().reverse();  // 마지막 탭(최근 단계)부터
    if (!LV.pick || !st.some(function (x) { return x.name === LV.pick; })) LV.pick = st[0].name;
    if (st.length > 1) {
      var chips = el("div", "mt-chips");
      st.forEach(function (x) { var b = el("button", x.name === LV.pick ? "on" : null, lvTabKo(x.name)); b.type = "button"; b.addEventListener("click", function () { LV.pick = x.name; lvDraw(); }); chips.appendChild(b); });
      box.appendChild(chips);
    }
    var cur = st.filter(function (x) { return x.name === LV.pick; })[0];
    var fmt = (lvWindow() || {}).fmt;
    if (fmt && fmt.rounds) { var days = st.filter(function (x) { return !x.final && (!fmt.tab || new RegExp(fmt.tab, "i").test(x.name)); })[0]; if (days) { LV.stat = lvStageStat(days.rows, fmt).stat; crStatus(); } }
    if (fmt && !cur.final && fmt.rounds && (!fmt.tab || new RegExp(fmt.tab, "i").test(cur.name))) { lvFmtTable(box, cur, fmt); return; }
    var rows = cur.rows.slice().sort(function (a, b) { return b.pts - a.pts || (2 * b.w + b.t4) - (2 * a.w + a.t4); });
    var cm = cur.final ? checkmateOf(rows) : null;
    if (cm) rows.sort(function (a, b) { return (b.n === cm[0]) - (a.n === cm[0]); });
    var kr = rows.filter(function (r) { return flagOf(r.n) === "kr"; });
    var ng = Math.max.apply(null, rows.map(function (r) { return r.g; }));
    var sub = "공식 결과 시트 · " + rows.length + "명 · " + ng + "게임" + (cm ? " · 우승 " + cm[0] : "") + (kr.length ? " · " + kr.map(function (r) { return r.n + " " + (rows.indexOf(r) + 1) + "위 " + r.pts + "점"; }).join(", ") : "");
    box.appendChild(el("p", "lv-sub", sub));
    var fin20 = ((lvWindow() || {}).fmt || {}).final || 20;
    sheetTbl(box, rows.map(function (r) {
      var win = cm && r.n === cm[0];
      return { n: r.n, pts: r.pts, p: r.p, cls: win ? "win" : "", st: win ? ["win", "우승"] : cur.final && (lvWindow() || {}).fmt && r.pts >= fin20 ? ["chk", "체크"] : null };  // 20점 넘김: 다음 1등이면 우승
    }));
  }
  // 진행 방식이 있는 대회(월즈): 단계 막대 + 지금 단계 규칙 + 선수마다 상태(탈락 단계·결승 직행·8강) + 컷 줄. 시트 순서(공식 순위)를 그대로 쓴다
  // 진행 방식으로 선수마다 상태 [종류, 글자]와 컷 줄 위치를 계산 (순위판·진출자 명단이 같이 쓴다)
  function lvStageStat(rows, fmt) {
    var R0 = fmt.rounds, cum = [], c = 0;
    R0.forEach(function (x) { c += x.g; cum.push(c); });
    var R = Math.max.apply(null, rows.map(function (r) { return r.g; }).concat([0]));
    var si = cum.findIndex(function (x) { return R <= x; }); if (si < 0) si = R0.length - 1;
    var done = R > 0 && R === cum[si], last = done && si === R0.length - 1;
    // 상태: 끝난 단계에서 멈춘 선수는 그 단계 탈락, 16강을 끝내고 상위면 결승 직행
    var stat = {}, cut = {};
    // 단계 참가자를 그 단계가 끝난 시점 점수로 줄 세운다 (8강 점수가 더해진 지금 순위로 16강 직행을 가르면 틀림)
    var upto = function (r, n) { return r.p.slice(0, n).reduce(function (a, v) { return a + (v ? 9 - v : 0); }, 0); };
    var parts = function (i) {
      return rows.filter(function (r) { return r.g > (i ? cum[i - 1] : 0); })
        .map(function (r, k) { return [r, upto(r, Math.min(cum[i], R)), k]; })
        .sort(function (a, b) { return b[1] - a[1] || a[2] - b[2]; }).map(function (x) { return x[0]; });
    };
    R0.forEach(function (st0, i) {
      var ps = parts(i), finished = R > cum[i] || (R === cum[i]);
      if (!ps.length || (!finished && i !== si)) return;
      ps.forEach(function (r, k) {
        if (finished) {
          if (st0.direct && k < st0.direct) stat[r.n] = ["direct", "결승 직행"];
          else if (k >= st0.keep) stat[r.n] = ["out", st0.n + " 탈락"];
          else if (i === R0.length - 1) stat[r.n] = ["direct", "결승 진출"];
        }
      });
      if (i === si && !last) { if (st0.direct) cut[(ps[st0.direct] || {}).n] = 1; cut[(ps[st0.keep] || {}).n] = 1; }
    });
    return { stat: stat, cut: cut };
  }
  function lvFmtTable(box, cur, fmt) {
    var R0 = fmt.rounds, rows = cur.rows, cum = [], start = [], c = 0, n0 = rows.length;
    R0.forEach(function (x, i) { c += x.g; cum.push(c); start.push(i === 0 ? n0 : R0[i - 1].keep - (R0[i - 1].direct || 0)); });
    var R = Math.max.apply(null, rows.map(function (r) { return r.g; }).concat([0]));
    var si = cum.findIndex(function (x) { return R <= x; }); if (si < 0) si = R0.length - 1;
    var done = R > 0 && R === cum[si], last = done && si === R0.length - 1;
    // 단계 막대
    var steps = el("div", "lv-steps");
    R0.forEach(function (x, i) {
      var cls = i < si || (i === si && done) ? "done" : i === si ? "now" : "";
      var b = el("div", "lv-step " + cls); b.appendChild(el("b", null, x.n)); b.appendChild(el("small", null, start[i] + "명 · " + x.g + "게임")); steps.appendChild(b);
    });
    var fin = el("div", "lv-step fin" + (last ? " now" : "")); fin.appendChild(el("b", null, "결승")); fin.appendChild(el("small", null, "8명 · " + (fmt.final || 20) + "점 체크")); steps.appendChild(fin);
    box.appendChild(steps);
    var x = R0[si], played = R - (si ? cum[si - 1] : 0);
    var rule = x.direct ? "1~" + x.direct + "위 결승 직행, " + (x.direct + 1) + "~" + x.keep + "위 " + ((R0[si + 1] || {}).n || "다음 단계") + ", " + (x.keep + 1) + "~" + start[si] + "위 탈락"
      : si === R0.length - 1 ? "상위 " + x.keep + "명 결승 진출, 나머지 탈락" : "상위 " + x.keep + "명 생존, 하위 " + (start[si] - x.keep) + "명 탈락";
    box.appendChild(el("p", "lv-rule", R === 0 ? "아직 시작 전이에요" : last ? "1·2일차가 끝났어요. 결승 8명이 정해졌어요" : x.n + " " + played + "/" + x.g + "게임 · " + rule + (done ? "" : " (지금 순위 기준)")));
    var SS = lvStageStat(rows, fmt), stat = SS.stat, cut = SS.cut;
    var kr = rows.filter(function (r) { return flagOf(r.n) === "kr"; });
    if (kr.length) box.appendChild(el("p", "lv-sub", kr.map(function (r) { return r.n + " " + (rows.indexOf(r) + 1) + "위 " + r.pts + "점" + (stat[r.n] ? " · " + stat[r.n][1] : ""); }).join(", ")));
    sheetTbl(box, rows.map(function (r) {
      var s0 = stat[r.n];
      return { n: r.n, pts: r.pts, p: r.p, st: s0 || null, cls: [s0 && s0[0] === "out" ? "out" : "", s0 && s0[0] === "direct" ? "adv" : "", cut[r.n] ? "cut" : ""].filter(Boolean).join(" ") };
    }), { groups: fmt.rounds.map(function (x) { return [x.n, x.g]; }) });
  }
  function lvIfDue(force) {
    if (!ESP || document.hidden || current !== "esports" || !lvWindow()) return;
    if (!force && Date.now() - LV.at < 55000) return;
    lvLoad();
  }
  setInterval(function () { lvIfDue(false); }, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && Date.now() - LV.at > 30000) lvIfDue(true); });
  // 이번 월즈 진출자: 지역별로, 누르면 어떻게 들어갔는지 + 이번 세트 기록 (build_esports.py crown_roster, Liquipedia)
  var CR_PATH = { cup: "컵 우승", pp: "프로 포인트 1위", rf: "지역별 결승 상위", tpc: "중국 프로 서킷 우승" };
  var CR_REG = { AMER: "미주", EMEA: "유럽", APAC: "아시아·태평양", CN: "중국" };
  function crSame(a, names) {
    var al = a.toLowerCase(), an = al.replace(/[^0-9a-z가-힣]/g, "");
    return names.some(function (n) {
      var nl = n.toLowerCase(), nn = nl.replace(/[^0-9a-z가-힣]/g, "");
      if (al === nl || al.slice(-nl.length - 1) === " " + nl || (nn.length >= 4 && an === nn) || (nn.length >= 5 && an.slice(-nn.length) === nn)) return true;
      // 대회 표 이름이 팀 태그 + 줄인 이름일 때 (MJS Deleted = JosueDeleted)
      var w = a.split(" "), core = w.length > 1 && /^[A-Z0-9]{2,6}$/.test(w[0]) ? w.slice(1).join("").toLowerCase().replace(/[^0-9a-z가-힣]/g, "") : "";
      return core.length >= 6 && nn.slice(-core.length) === core;
    });
  }
  function crRecords(c, p) {
    var names = [p.n].concat(p.al || []), out = [];
    ESP.tournaments.forEach(function (t) {
      if (t.set !== c.set || t.region === "WORLD") return;
      var hits = [];
      t.events.forEach(function (e) {
        for (var i = e.stages.length - 1; i >= 0; i--) {
          var s = e.stages[i], k = s.table.findIndex(function (r) { return crSame(r.n, names); });
          if (k >= 0) { hits.push({ e: e, s: s, rk: k + 1 }); break; }
        }
      });
      if (t.kind === "finals" && hits.length) hits = hits.slice(-1);  // 지역별 결승은 제일 멀리 간 단계만
      hits.forEach(function (h) {
        var txt = t.region + " ";
        var win = h.s.final && h.rk === 1;
        if (t.kind === "tpc") txt += evName(t, h.e.ev) + (win ? " 우승" : " " + (h.s.final ? "결승 " : "스위스 ") + h.rk + "위");
        else if (t.kind === "finals") txt += "지역별 결승" + (win ? " 우승" : " " + (h.s.final ? "그랜드 파이널 " : h.e.ev.replace(" · 그랜드 파이널", "") + " ") + h.rk + "위");
        else txt += KIND_NAME[t.kind] + " " + h.e.ev.replace(/^시험 /, "") + " " + h.s.name + " " + h.rk + "위";
        out.push({ txt: txt, win: h.s.final && h.rk === 1, d: h.e.start || "" });
      });
    });
    out.sort(function (a, b) { return a.d.localeCompare(b.d); });
    Object.keys(ESP.propoints || {}).forEach(function (k) {
      if (k.split("|")[0] !== "S" + c.set) return;
      var r = ESP.propoints[k].find(function (x) { return crSame(x.n, names); });
      if (r) out.push({ txt: k.split("|")[1] + " 프로 포인트 " + r.rank + "위" + (r.pts == null ? "" : " · " + r.pts + "점"), win: r.rank === 1 });
    });
    return out;
  }
  // 진출자 명단 카드에 월즈 진행 상태(N강 탈락·결승 직행·결승 진출)를 붙인다. 이름은 팀 태그를 빼고 맞춘다 (FW Iron Bog = Iron Bog)
  function crStatus() {
    var st = LV.stat; if (!st) return;
    var nk = function (x) { return String(x || "").toLowerCase().replace(/[^a-z0-9가-힣]/g, ""); }, keys = Object.keys(st);
    document.querySelectorAll("#esp-crown .cr-p").forEach(function (b) {
      var names = (b.dataset.n || "").split("|").map(nk).filter(Boolean);
      var k = keys.filter(function (x) { var a = nk(x); return names.some(function (n) { return a === n || a.slice(-n.length) === n; }); })[0];
      var old = b.querySelector(".lv-st"); if (old) old.remove();
      b.classList.toggle("gone", !!(k && st[k][0] === "out"));
      if (k) b.appendChild(el("span", "lv-st cr-st " + st[k][0], st[k][1]));  // 진출 경로 글이 길면 잘려서 따로 한 줄
    });
  }
  function espCrown() {
    var box = document.getElementById("esp-crown"); box.innerHTML = "";
    var c = ESP.crown;
    if (!c || !c.players || dday(c.end) < 0) { box.hidden = true; return; }
    box.hidden = false; box.className = "cr";
    var h = el("h3", null, "월즈 진출자 "); h.appendChild(el("small", null, (c.label ? c.label + " · " : "") + fmtRange(c.start, c.end))); box.appendChild(h);
    var fl = function (p) { return p.f || flagOf(p.n) || ""; };
    var cur = null;  // 펼친 선수 하나만 (다른 지역 눌러도 앞에 건 닫힘)
    var pend = (c.pending || []).reduce(function (a, x) { return a + x.n; }, 0), tot = c.players.length + pend;
    var kr = c.players.filter(function (p) { return fl(p) === "kr"; });
    var sum = el("p", "cr-sum"); sum.innerHTML = "<b>" + tot + "자리 중 " + c.players.length + "명 확정</b>" + (pend ? " · 미정 " + pend : "") + " · 한국 " + (kr.length ? kr.map(function (p) { return p.n; }).join(", ") : "없음");
    box.appendChild(sum);
    var leg = el("div", "cr-leg");
    ["cup", "pp", "rf", "tpc"].forEach(function (k) { var x = el("span"); var i = el("i"); i.style.background = "var(--" + (k === "tpc" ? "cn" : k) + ")"; x.appendChild(i); x.appendChild(document.createTextNode(CR_PATH[k])); leg.appendChild(x); });
    box.appendChild(leg);
    ["AMER", "EMEA", "APAC", "CN"].forEach(function (reg) {
      var ps = c.players.filter(function (p) { return p.reg === reg; }), pd = (c.pending || []).filter(function (x) { return x.reg === reg; });
      if (!ps.length && !pd.length) return;
      var g = el("div", "cr-reg"), hd = el("h4", null, reg + " ");
      hd.appendChild(el("small", null, CR_REG[reg] + " · " + (ps.length + pd.reduce(function (a, x) { return a + x.n; }, 0)) + "자리"));
      g.appendChild(hd);
      var grid = el("div", "cr-grid");
      ps.forEach(function (p) {
        var b = el("button", "cr-p " + p.path + (fl(p) === "kr" ? " kr" : "")); b.type = "button";
        b.dataset.n = [p.n].concat(p.al || []).join("|");
        var nm = el("b"); var f = fl(p); if (f) nm.appendChild(el("span", "flag", (FLAG[f] || flagEmoji(f)) + " ")); nm.appendChild(document.createTextNode(p.n));
        b.appendChild(nm); b.appendChild(el("small", null, p.tag + ((p.also || []).length ? " · 중복 진출" : "")));
        b.addEventListener("click", function () {
          var was = cur && cur.b === b;
          if (cur) { cur.det.remove(); cur.b.classList.remove("on"); cur = null; }
          if (was) return;
          var det = el("div", "cr-det"); cur = { b: b, det: det }; b.classList.add("on");
          var t = el("b"); if (f) t.appendChild(document.createTextNode((FLAG[f] || flagEmoji(f)) + " ")); t.appendChild(document.createTextNode(p.n + (p.al && p.al.length ? " (" + p.al.join(", ") + ")" : "")));
          det.appendChild(t);
          det.appendChild(el("div", "how", "진출: " + p.how));
          (p.also || []).forEach(function (a) { det.appendChild(el("div", "also", "＋ " + a)); });
          var rec = crRecords(c, p);
          if (rec.length) {
            det.appendChild(el("div", "also", "이번 세트 기록"));
            var ul = el("ul"); rec.forEach(function (r) { ul.appendChild(el("li", r.win ? "win" : null, r.txt)); }); det.appendChild(ul);
          } else det.appendChild(el("div", "also", reg === "CN" ? "중국 대회 기록은 제공하지 않아요" : "이번 세트 대회 기록 없음"));
          // 누른 칸이 있는 줄 바로 아래에 펼친다
          var items = [].slice.call(grid.querySelectorAll(".cr-p")), i = items.indexOf(b), cols = 2;
          var after = items[Math.min(items.length - 1, Math.floor(i / cols) * cols + cols - 1)];
          after.after(det);
        });
        grid.appendChild(b);
      });
      pd.forEach(function (x) { grid.appendChild(el("div", "cr-pend", "미정 " + x.n + "자리 · " + x.how)); });
      g.appendChild(grid); box.appendChild(g);
    });
    box.appendChild(el("p", "cr-note", "지역마다 프로 서킷 컵 우승 3명, 프로 포인트 1위, 지역별 결승 상위권이 진출해요. 이미 진출한 선수가 결승 상위권에 들면 그 자리는 다음 순위로 내려가요. 출처 Liquipedia"));
    // 접기: 실시간 순위판이 있는 동안은 접어 두고 요약 줄(몇 명 확정·한국)만. 누르면 펼침 (기억)
    var kids = [].slice.call(box.children).filter(function (x) { return x !== h && x !== sum; });
    var wrapC = el("div", "cr-body"); kids.forEach(function (x) { wrapC.appendChild(x); }); box.appendChild(wrapC);
    var openK = null; try { openK = localStorage.getItem("tft-guide-crown"); } catch (e) {}
    var open = openK != null ? openK === "1" : !lvWindow();
    h.classList.add("cr-tog"); h.setAttribute("role", "button"); h.tabIndex = 0;
    var setO = function () { wrapC.hidden = !open; h.classList.toggle("open", open); };
    var tog = function () { open = !open; setO(); try { localStorage.setItem("tft-guide-crown", open ? "1" : "0"); } catch (e) {} };
    h.addEventListener("click", tog); h.addEventListener("keydown", function (e) { if (e.key === "Enter") tog(); });
    setO(); crStatus();
  }
  function espWorlds() {}  // 역대 월즈는 대회 목록 안 카드로 (wdCard)
  function wdCard(w) {
    {
      var card = el("article", "wd");
      var head = el("button", "wd-head"); head.type = "button";
      var l = el("div", "wd-set"); l.appendChild(el("b", null, "S" + w.set)); l.appendChild(el("small", null, (w.start || "").slice(0, 4)));
      head.appendChild(l);
      var mid = el("div", "wd-mid");
      var champ = el("div", "wd-champ"); champ.appendChild(cupIcon()); champ.appendChild(wdPlayer(w.top[0])); mid.appendChild(champ);
      mid.appendChild(el("small", null, w.name + (w.city ? " · " + w.city : "")));
      head.appendChild(mid);
      var kr = w.kr[0];
      var right = el("div", "wd-kr", kr ? "한국 최고 " + kr[0] + "위" : "");
      head.appendChild(right);
      card.appendChild(head);
      // 누르면 전체 화면: 상위 8명 + 단계별 전체 기록(시트 표)
      head.classList.add("go");
      head.addEventListener("click", function () {
        var meta = [fmtRange(w.start, w.end), w.city, +String(w.prize || "").replace(/[^\d.]/g, "") ? "$" + (+String(w.prize).replace(/[^\d.]/g, "")).toLocaleString("en-US") : ""].filter(Boolean).join(" · ");
        fsOpen("S" + w.set + " " + (SET_NAME[w.set] || w.name) + " 월즈", meta + (w.kr.length ? " · 한국: " + w.kr.map(function (k) { return k[1] + " " + k[0] + "위"; }).join(", ") : ""), function (b) {
          var ol = el("ol", "wd-top");
          w.top.forEach(function (p) { var li = el("li", p[1] === "kr" ? "kr" : null); li.appendChild(wdPlayer(p)); ol.appendChild(li); });
          b.appendChild(ol);
          if (!(w.stages && w.stages.length)) { b.appendChild(el("p", "esp-meta", "게임별 기록은 아직 없어요")); return; }
          var rec = el("div", "wd-rec");
          var drawRec = function (pick) {
            rec.innerHTML = "";
            var ch = el("div", "mt-chips");
            w.stages.forEach(function (st0, k) { var x = el("button", k === pick ? "on" : null, st0.name + " " + st0.rows.length + "명"); x.type = "button"; x.addEventListener("click", function () { drawRec(k); }); ch.appendChild(x); });
            rec.appendChild(ch);
            var st1 = w.stages[pick], champ = w.top[0] && w.top[0][0], rows = st1.rows.slice();
            if (st1.name === "결승" && champ) rows.sort(function (a, c) { return (c.n === champ) - (a.n === champ); });  // 결승은 체크메이트: 우승자를 맨 위로
            // 이어지는 단계(40강~8강, 1·2일차)는 시트 하나: 단계별 칸 묶음, 결승 진출 표시, 일찍 끝난 선수 뒤 칸은 '탈락'
            var G = Math.max.apply(null, rows.map(function (r) { return r.p.length; }));
            sheetTbl(rec, rows.map(function (r) {
              var win = st1.name === "결승" && r.n === champ;
              return { n: r.n, f: r.f, pts: r.pts, p: r.p, st: win ? ["win", "우승"] : r.adv ? ["direct", r.adv] : null, cls: win ? "win" : "", end: st1.groups && !r.adv && r.p.length < G ? "탈락" : null };
            }), { noLimit: true, groups: st1.groups });
          };
          b.appendChild(rec); drawRec(w.stages.length - 1);
        });
      });
      return card;
    }
  }
  function wdPlayer(p) {
    var c = el("span", "esp-p" + (p[1] === "kr" ? " kr" : ""));
    if (p[1]) c.appendChild(el("span", "flag", FLAG[p[1]] || flagEmoji(p[1])));
    c.appendChild(document.createTextNode(p[0]));
    return c;
  }
  // 인포그래픽 크게 보기: 화면 가득 띄우고 손가락으로 옮겨 보기, 뒤로가기·닫기로 닫힘
  function zoomImg(src) {
    var box = el("div", "imgzoom"), im = document.createElement("img"), x = el("button", null, "닫기");
    im.src = src; box.appendChild(im); box.appendChild(x); box.appendChild(el("p", null, "옆으로 밀어서 보기"));
    function close() { box.remove(); }
    x.type = "button"; x.addEventListener("click", function () { navBack("zoom", close); });
    document.body.appendChild(box); navPush("zoom", close);
  }
  document.addEventListener("click", function (e) { var t = e.target; if (t && t.matches && t.matches(".esp-info img")) zoomImg(t.getAttribute("src")); });
  function espView(v, save) {
    document.querySelectorAll("#esp-view button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === v); b.setAttribute("aria-selected", b.dataset.v === v); });
    document.querySelectorAll("#esports .esp-pane").forEach(function (p) { p.hidden = p.dataset.v !== v; });
    if (save) { try { localStorage.setItem("tft-guide-espview", v); } catch (e) {} window.scrollTo(0, 0); }
  }
  function buildEsports(data) {
    ESP = data; FLAG_N = null;
    document.querySelectorAll("#esp-reg button").forEach(function (b) {
      b.addEventListener("click", function () { espRegion = b.dataset.r; document.querySelectorAll("#esp-reg button").forEach(function (x) { x.classList.toggle("on", x === b); }); espList(); });
    });
    document.querySelectorAll("#esp-ptreg button").forEach(function (b) {
      b.addEventListener("click", function () { document.querySelectorAll("#esp-ptreg button").forEach(function (x) { x.classList.toggle("on", x === b); }); espPoints(b.dataset.r); });
    });
    espNow(); lvDraw(); espCrown(); espList(); espPoints("APAC"); espWorlds(); apacAt = Date.now(); apacLive(); lvLoad();
    // 프로 포인트는 접어 둔다 (월즈 기간엔 실시간 순위·진출자가 먼저). 펼침 상태는 기억
    // 보기 전환 (월즈 · 대회 · 포인트 · 안내): 한 화면에 다 늘어놓으면 너무 길다 (2026-11-14 사용자). 월즈 기간·진출자 발표 뒤엔 월즈가 처음
    var saved = null; try { saved = localStorage.getItem("tft-guide-espview"); } catch (e) {}
    espView(saved && saved !== "worlds" && document.querySelector('#esp-view [data-v="' + saved + '"]') ? saved : "events");
    document.querySelectorAll("#esp-view button").forEach(function (b) { b.addEventListener("click", function () { espView(b.dataset.v, true); }); });
    document.getElementById("esp-upd").textContent = updAt(data.updated);
  }

  /* ---- 눌러서 보기: 챔피언·아이템·시너지·증강 아이콘을 누르면 아래에서 설명이 올라온다 ---- */
  /* ---- 자동 업데이트를 받았을 때 (앱이 부름): 30초 동안 안 만졌으면 바로, 아니면 아래 띠로 묻고 손 떼면 적용 ---- */
  var lastTouch = Date.now(), updTimer = null;
  ["pointerdown", "keydown", "scroll"].forEach(function (ev) { window.addEventListener(ev, function () { lastTouch = Date.now(); }, { passive: true, capture: true }); });
  window.lolcheUpdateReady = function (ver) {
    if (Date.now() - lastTouch > 30000) { location.reload(); return; }
    var bar = document.getElementById("upd-bar");
    if (!bar) {
      bar = el("div", "upd-bar"); bar.id = "upd-bar";
      bar.appendChild(el("span", null, "새 버전 v" + ver + " 받았어요"));
      var go = el("button", null, "지금 적용"); go.type = "button"; go.addEventListener("click", function () { location.reload(); });
      bar.appendChild(go); document.body.appendChild(bar);
    }
    clearInterval(updTimer);
    updTimer = setInterval(function () { if (Date.now() - lastTouch > 30000) location.reload(); }, 5000);
  };

  /* ---- 뒤로가기: 화면을 열 때마다 기록을 남기고, 휴대폰 뒤로가기(=history.back)로 하나씩 닫는다 ---- */
  var NAV = [], navQuiet = false;
