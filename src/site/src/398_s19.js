  /* ---- 19시즌(프리즘 투어) 스튜디오 (v2.2.0: 개요·추천 덱(배치·증강)·시너지·챔피언·해금 트래커·스쿼드 빌더·증강·아이템) ---- */
  var S19 = null, S19_KEY = "tft-guide-s19", s19St = { v: "units", tf: "all", cf: 0, af: 0, an: false, q: "", bcf: 0, ds: "avg", dm: "guide" };
  var S19_SQ_KEY = "tft-guide-s19-squad", s19Sq = [];
  var S19_UL_KEY = "tft-guide-s19-uldone", s19UlDone = {};
  try { var s19s = JSON.parse(localStorage.getItem(S19_KEY) || "null"); if (s19s) for (var k19 in s19s) s19St[k19] = s19s[k19]; s19St.q = ""; } catch (e) {}
  if (s19St.v === "home" || s19St.v === "decks") s19St.v = "units";
  try { var sqs = JSON.parse(localStorage.getItem(S19_SQ_KEY) || "[]"); if (Array.isArray(sqs)) s19Sq = sqs.slice(0, 10); } catch (e) {}
  try { var uls = JSON.parse(localStorage.getItem(S19_UL_KEY) || "{}"); if (uls && typeof uls === "object") s19UlDone = uls; } catch (e) {}
  function s19Save() { try { localStorage.setItem(S19_KEY, JSON.stringify({ v: s19St.v, tf: s19St.tf, cf: s19St.cf, af: s19St.af, an: s19St.an, bcf: s19St.bcf, ds: s19St.ds, dm: s19St.dm })); } catch (e) {} }
  function s19SqSave() { try { localStorage.setItem(S19_SQ_KEY, JSON.stringify(s19Sq)); } catch (e) {} }
  function s19UlSave() { try { localStorage.setItem(S19_UL_KEY, JSON.stringify(s19UlDone)); } catch (e) {} }
  var S19_COST = { 1: "c1", 2: "c2", 3: "c3", 4: "c4", 5: "c5", 7: "c7" };
  var S19_COST_VAR = { 1: "var(--c1)", 2: "var(--c2)", 3: "var(--c3)", 4: "var(--c4)", 5: "var(--c5)", 7: "#ff4d8d" };
  var S19_TIER = { 1: "실버", 2: "골드", 3: "프리즘" };
  function s19Unit(k) { return S19 && S19.units.filter(function (u) { return u.k === k; })[0]; }
  function s19Trait(n) { return S19 && S19.traits.filter(function (t) { return t.n === n || t.k === n; })[0]; }
  function s19Aug(n) { return S19 && S19.augs && S19.augs.filter(function (a) { return a.n === n; })[0]; }
  function s19ItemImg(name) {
    if (IDX && IDX.items && IDX.items[name]) return IDX.items[name].icon;
    var it = S19 && S19.items && S19.items.filter(function (x) { return x.n === name; })[0];
    return it && it.img ? it.img : "";
  }
  function s19DdayText() {
    if (!S19 || !S19.release) return "PBE";
    var target = Date.parse(S19.release + "T00:00:00+09:00");
    var now = Date.now();
    var diff = Math.ceil((target - now) / 86400000);
    return diff > 0 ? "D-" + diff : diff === 0 ? "D-DAY" : "LIVE";
  }
  function s19Pic(u, size) {
    var w = el("span", "s19-pic " + (S19_COST[u.c] || "c1")); if (size) w.style.width = w.style.height = size + "px";
    if (u.img) { var i = img(u.img, u.n); i.loading = "lazy"; w.appendChild(i); } else w.appendChild(el("b", null, u.n.slice(0, 1)));
    return w;
  }
  function s19Ti(t, size) {
    var w = el("span", "s19-ti"); if (size) { w.style.width = w.style.height = size + "px"; }
    if (t && t.img) { var i = img(t.img, t.n); i.loading = "lazy"; w.appendChild(i); }
    return w;
  }
  function s19Text(s) {
    var p = el("p", "s19-txt"); (s || "").split("\n").forEach(function (l, i) { if (i) p.appendChild(document.createElement("br")); p.appendChild(document.createTextNode(l)); }); return p;
  }
  function s19Load() {
    if (S19) return Promise.resolve(S19);
    return fetch("s19.json").then(function (r) { return r.json(); }).then(function (d) { S19 = d; s19LiveLoad(); if (typeof homeRender === "function") homeRender(); return d; });
  }
  function s19Jump(view, opts) {
    if (view === "decks") { goTab("meta"); return; }
    var nextV = (!view || view === "home") ? "units" : view;
    var prevTab = current, prevV = s19St.v, py = window.scrollY;
    if (prevTab && prevTab !== "s19") {
      navPush("tab", function () {
        s19St.v = prevV; s19Save();
        applyTab(prevTab, false, py);
      });
    } else if (prevTab === "s19" && prevV !== nextV) {
      navPush("s19v", function () {
        s19St.v = prevV; s19Save(); s19Render(); window.scrollTo(0, py);
      });
    }
    if (opts) {
      if (opts.tf != null) s19St.tf = opts.tf;
      if (opts.cf != null) s19St.cf = opts.cf;
      if (opts.an != null) s19St.an = opts.an;
      if (opts.q != null) s19St.q = opts.q;
    } else {
      s19St.q = "";
    }
    s19St.v = nextV;
    s19Save();
    showTab("s19", false, 0);
    s19Render();
  }
  // keepTools: 검색어 입력 중에는 검색창이 든 도구 줄은 그대로 두고 결과만 다시 그린다.
  // 검색창까지 새로 만들면 한글 조합이 끊겨 "제리"가 "ㅈㅔㄹㅣ"로 들어간다 (2026-11-21 사용자 스크린샷)
  function s19Render(keepTools) {
    var out = document.getElementById("s19-out"), tools = document.getElementById("s19-tools");
    if (keepTools === true && tools) tools = document.createElement("div");
    if (!out) return;
    var views = { units: s19Units, unlock: s19Unlocks, traits: s19Traits, builder: s19Builder, augs: s19Augs, items: s19Items };
    if (!views[s19St.v]) s19St.v = "units";
    document.querySelectorAll("#s19-view button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === s19St.v); });
    if (!S19) { out.innerHTML = '<p class="empty">불러오는 중</p>'; s19Load().then(s19Render).catch(function () { out.innerHTML = '<p class="empty">불러오지 못했어요. 앱을 다시 열어 주세요</p>'; }); return; }
    var rel = S19.release ? (+S19.release.slice(5, 7)) + "/" + (+S19.release.slice(8, 10)) : "";
    var dd = document.getElementById("s19-dday");
    if (dd) dd.textContent = s19DdayText();
    document.getElementById("s19-meta").textContent = (rel ? rel + " 출시 예정 · " : "") + "PBE " + updAt(S19.pbe || S19.updated) + " · 출시 전 수치는 바뀔 수 있어요";
    tools.innerHTML = ""; out.innerHTML = "";
    views[s19St.v](out, tools);
  }
  function s19Go(v) {
    if (s19St.v !== v) {
      var prevV = s19St.v, py = window.scrollY;
      navPush("s19v", function () { s19St.v = prevV; s19Save(); s19Render(); window.scrollTo(0, py); });
    }
    s19St.v = v; s19Save(); s19Render(); window.scrollTo(0, 0);
  }
  function s19Search(tools, ph) {
    var i = el("input", "s19-q"); i.type = "search"; i.placeholder = ph; i.value = s19St.q;
    i.addEventListener("input", function () { s19St.q = i.value; s19Render(true); });
    tools.appendChild(i);
  }
  function s19Chips(tools, list, cur, set) {
    var c = el("div", "mt-chips s19-chips");
    list.forEach(function (x) { var b = el("button", x[0] === cur ? "on" : null, x[1]); b.type = "button"; b.addEventListener("click", function () { set(x[0]); s19Save(); s19Render(); }); c.appendChild(b); });
    tools.appendChild(c);
  }
  function s19Match(s) {
    var q = s19St.q.trim();
    if (!q) return true;
    return matches(s || "", q);
  }

  // 19시즌 4x7 육각 보드 배치도 (챔피언 누르면 19시즌 상세로 이동)
  /* ---- PBE 덱 통계 새로고침 (2026-11-21 사용자: "pbe 통계도 새로고침 버튼 만들어 줘야지"): MetaTFT comps_stats?queue=PBE를 바로 받아
     덱마다 평균·승률·순방·판수·선택률·티어만 바꾼다 (배치·템은 그대로, 덱 묶음 번호가 바뀌면 다음 업데이트 때). 덱 탭 새로고침과 같은 방식 ---- */
  var S19_LIVE = "tft-guide-s19-live";
  function s19Apply(L) {
    var by = {};
    (S19.decks || []).forEach(function (d) {
      var a = d.id && L.s[d.id]; if (!a) return;
      var n = a[8] || 1, sum = 0; for (var i = 0; i < 8; i++) sum += a[i] * (i + 1);
      d.avg = Math.round(sum / n * 100) / 100; d.win = Math.round(a[0] / n * 1000) / 10; d.top4 = Math.round((a[0] + a[1] + a[2] + a[3]) / n * 1000) / 10;
      d.plays = n; d.pick = Math.round(n / L.total * 800) / 100;  // 선택률 = 로비 8명 중 평균 몇 명 (덱 탭과 같은 정의)
    });
    var order = (S19.decks || []).slice().sort(function (a, b) { return a.avg - b.avg; });
    order.forEach(function (x, i) { var q = i / order.length; x.tier = q < 0.12 ? "S" : q < 0.35 ? "A" : q < 0.7 ? "B" : "C"; by[x.id] = x; });
    (S19.guides || []).forEach(function (g) { var x = g.sid && by[g.sid]; if (x) { g.tier = x.tier; g.avg = x.avg; g.win = x.win; g.top4 = x.top4; g.pick = x.pick; g.plays = x.plays; } });
    S19.decksPlays = Math.floor(L.total / 8);
    if (L.src) S19.decksUpdated = new Date(L.src).toISOString();
    S19.liveAt = L.at;
  }
  function s19LiveLoad() {
    try {
      var L = JSON.parse(localStorage.getItem(S19_LIVE) || "null");
      if (L && L.cid === String(S19.decksCid) && L.src > Date.parse(S19.decksUpdated || 0)) s19Apply(L);
    } catch (e) {}
  }
  function s19Refresh(btn, note) {
    btn.disabled = true; btn.textContent = "불러오는 중";
    viaApp("https://api-hc.metatft.com/tft-comps-api/comps_stats?queue=PBE").then(function (r) {
      if (S19.decksCid && String(r.cluster_id) !== String(S19.decksCid)) { note.textContent = "덱 구성이 바뀌어 다음 업데이트 때 반영돼요"; return; }
      var L = { at: Date.now(), cid: String(r.cluster_id), s: {}, total: 1, src: r.updated || Date.now() };
      (r.results || []).forEach(function (x) { if (x.cluster) L.s[x.cluster] = x.places; else L.total = x.places[0]; });
      try { localStorage.setItem(S19_LIVE, JSON.stringify(L)); } catch (e) {}
      s19Apply(L); s19Render();
    }).catch(function () { note.textContent = "불러오지 못했어요. 다시 시도해 주세요"; })
      .then(function () { btn.disabled = false; btn.textContent = "새로고침"; });
  }
  function s19HexBoard(units) {
    var wrap = el("div", "hexboard s19-hex"), at = {};
    units.forEach(function (x) { if (x.pos && x.pos.length === 2) at[x.pos[0] + "," + x.pos[1]] = x; });
    for (var r = 0; r < 4; r++) {
      var row = el("div", "hexrow" + (r % 2 ? " shift" : ""));
      for (var c = 0; c < 7; c++) {
        var x = at[r + "," + c], cellw = el("div", "hxwrap"), hx = el("div", "hx"), inner = el("div", "in");
        if (x) {
          var u = s19Unit(x.k);
          if (u) {
            hx.dataset.c = u.c === 7 ? 5 : (u.c || 1);
            if (u.c === 7) hx.classList.add("s19-hx7");
            if (u.img) inner.appendChild(img(u.img, u.n));
            cellw.title = u.n;
            cellw.style.cursor = "pointer";
            (function (unitObj) { cellw.addEventListener("click", function () { s19OpenUnit(unitObj); }); })(u);
            if (x.s >= 3) cellw.appendChild(el("div", "st", "★★★"));
            cellw.appendChild(el("div", "hxn" + (x.i && x.i.length ? " lift" : ""), u.n.replace(/ \([^)]+\)$/, "").replace(/ /g, "")));
            if (x.i && x.i.length) {
              var its = el("div", "its");
              x.i.slice(0, 3).forEach(function (inm) { var src = s19ItemImg(inm); if (src) { var im = img(src, inm); im.title = inm; its.appendChild(im); } });
              cellw.appendChild(its);
            }
          }
        }
        hx.appendChild(inner); cellw.appendChild(hx); row.appendChild(cellw);
      }
      wrap.appendChild(row);
    }
    return wrap;
  }

  // 19시즌 PBE 추천 덱 행 & 상세 (롤체지지 추천 가이드 배치 + PBE 메타 통계)
  var s19CurDeck = "";
  // 19시즌 팀 플래너 코드: "02" + 칸 번호 10개(3자리, 빈칸 000) + "TFTSet19" (덱 탭 codeOfNames와 같은 틀)
  function s19CodeOf(keys) {
    var cs = [];
    keys.forEach(function (k) { var u = s19Unit(k); if (u && u.tp && cs.indexOf(u.tp) < 0 && cs.length < 10) cs.push(u.tp); });
    if (!cs.length) return null;
    while (cs.length < 10) cs.push("000");
    return "02" + cs.join("") + "TFTSet19";
  }
  function s19DeckKey(d) { return (d.n || "") + "|" + (d.mc || ""); }
  function s19DeckRow(d, sortBy, onPick) {
    var mcEntry = d.u.filter(function (x) { return x.k === d.mc; })[0] || d.u[0];
    var mcu = mcEntry && s19Unit(mcEntry.k);
    var r = el("button", "mt-row dk t-" + (d.tier || "B")); r.type = "button";
    r.dataset.s19dk = s19DeckKey(d);
    var w = el("div", "dk-mc"), hx = el("div", "dk-hex");
    if (mcu) {
      hx.style.setProperty("--cc", S19_COST_VAR[mcu.c] || "var(--c1)");
      if (mcu.img) { var im = img(mcu.img, mcu.n); im.loading = "lazy"; hx.appendChild(im); }
    }
    w.appendChild(hx);
    if (mcEntry && mcEntry.s >= 3) w.appendChild(el("b", "dk-st", "★★★"));
    if (mcEntry && mcEntry.i && mcEntry.i.length) {
      var its = el("div", "dk-its");
      mcEntry.i.slice(0, 3).forEach(function (inm) { var src = s19ItemImg(inm); if (src) its.appendChild(img(src, inm)); });
      w.appendChild(its);
    }
    r.appendChild(w);
    var mid = el("div", "mt-mid");
    var meta = el("div", "dk-meta");
    meta.appendChild(el("span", "dk-tbadge t-" + (d.tier || "B"), d.tier || "-"));
    var sub = el("span", "dk-sub");
    var has3 = d.u.some(function (x) { return x.s >= 3; });
    var hasPos = d.u.some(function (x) { return x.pos && x.pos.length === 2; });
    // 운영 방식: MetaTFT PBE 덱 묶음의 levelling (18시즌 덱 탭과 같은 '6렙 리롤'·'8렙 운영'), 없으면 3성 유무로 가늠
    sub.appendChild(document.createTextNode((d.style ? styleKo(d.style) : has3 ? "리롤" : "운영") + (hasPos ? " · 배치" : "")));
    if (d.pick) { sub.appendChild(document.createTextNode(" · ")); sub.appendChild(dkPickGrad(el("span", "dk-pl", "선택률 " + d.pick.toFixed(2)), d.pick)); }
    meta.appendChild(sub); mid.appendChild(meta);
    mid.appendChild(el("div", "mt-name", d.n));
    var st = el("div", "mt-strip s19-strip");
    d.u.filter(function (x) { return x !== mcEntry; }).slice(0, 7).forEach(function (x) {
      var u = s19Unit(x.k); if (!u || !u.img) return;
      var im2 = img(u.img, u.n); im2.loading = "lazy"; im2.className = "c" + (u.c === 7 ? 5 : u.c);
      if (u.c === 7) im2.classList.add("c7");
      st.appendChild(im2);
    });
    mid.appendChild(st); r.appendChild(mid);
    var num = el("div", "mt-num dk-kpi2");
    if (d.avg != null) {
      if (sortBy === "win") {
        num.appendChild(dkGrad(el("b", "dk-avg", d.win.toFixed(1) + "%"), s19WinT(d.win)));
        num.appendChild(dkGrad(el("span", "dk-top4", "평균 " + d.avg.toFixed(2)), s19AvgT(d.avg)));
      } else {
        num.appendChild(dkGrad(el("b", "dk-avg", d.avg.toFixed(2)), s19AvgT(d.avg)));
        num.appendChild(dkGrad(el("span", "dk-top4", "승률 " + d.win.toFixed(1) + "%"), s19WinT(d.win)));
      }
    } else {
      num.appendChild(el("small", null, "추천 배치"));
    }
    r.appendChild(num);
    r.addEventListener("click", function () { if (onPick) onPick(d); else s19OpenDeck(d); });
    return r;
  }
  function s19Decks(out, tools) {
    var guides = (S19 && S19.guides) || [], all = (S19 && S19.decks) || [];
    var mode = (s19St.dm === "all" || !guides.length) ? "all" : "guide";
    var list = mode === "guide" ? guides : all;
    if (guides.length && all.length) {
      var seg = el("div", "seg2 s19-dmode");
      [["guide", "추천 덱 (" + guides.length + ")"], ["all", "PBE 전체 통계 (" + all.length + ")"]].forEach(function (x) {
        var b = el("button", x[0] === mode ? "on" : null, x[1]); b.type = "button";
        b.addEventListener("click", function () { s19St.dm = x[0]; s19Save(); s19Render(); });
        seg.appendChild(b);
      });
      tools.appendChild(seg);
    }
    s19Search(tools, "19시즌 덱·챔피언·시너지 검색 (초성 가능)");
    s19Chips(tools, [["avg", "평균 등수순"], ["win", "승률순"], ["plays", "인기순"]], s19St.ds || "avg", function (v) { s19St.ds = v; });
    if (!list.length) { out.appendChild(el("p", "empty", "19시즌 추천 덱 데이터를 불러오는 중이에요")); return; }
    var metaLine = (mode === "guide" ? "롤체지지 추천 배치 · " : "") + "MetaTFT PBE " + (S19.decksPlays ? S19.decksPlays.toLocaleString() + "판 분석" : list.length + "개 덱");
    var upd = el("div", "mt-upd s19-upd"), note = el("span", null, metaLine + (S19.decksUpdated ? "\n" + updAt(S19.decksUpdated) + " · " + ago(Date.parse(S19.decksUpdated)) : ""));
    upd.appendChild(note);
    if (LIVE && S19.decks && S19.decks.length) { var rb = el("button", null, "새로고침"); rb.type = "button"; rb.addEventListener("click", function () { s19Refresh(rb, note); }); upd.appendChild(rb); }
    out.appendChild(upd);
    var f = list.filter(function (d) {
      return s19Match(d.n) || (d.t || []).some(function (t) { return s19Match(t[0]); }) || d.u.some(function (x) { var u = s19Unit(x.k); return u && s19Match(u.n); });
    }).slice().sort(function (a, b) {
      if (s19St.ds === "win") return (b.win || 0) - (a.win || 0);
      if (s19St.ds === "plays") return (b.plays || 0) - (a.plays || 0);
      return (a.avg || 9) - (b.avg || 9);
    });
    if (!f.length) { out.appendChild(el("p", "empty", "조건에 맞는 19시즌 덱이 없어요")); return; }
    if (isWide()) {  // PC: MetaTFT처럼 넓은 줄, 누르면 아래로 펼침 (2026-11-21)
      var prow = el("div", "mt-rows pc-rows s19-pcrows");
      f.forEach(function (d) {
        var units = d.u.slice().sort(function (a, b) { return (a.k === d.mc ? -9 : 0) - (b.k === d.mc ? -9 : 0) || (b.i || []).length - (a.i || []).length || (b.s || 0) - (a.s || 0); }).map(function (x) {
          var u = s19Unit(x.k) || { n: x.k, c: 1 };
          return { name: u.n, c: u.c === 7 ? 5 : u.c, s: x.s, img: u.img, items: (x.i || []).map(function (n) { return [n, s19ItemImg(n)]; }) };
        });
        var traits = (d.t || []).filter(function (x) { return x[2] !== 6; }).slice(0, 8).map(function (x) { var t = s19Trait(x[0]); return { t: x[0], n: x[1], style: PC_TR[x[2]] || "bronze", img: t && t.img }; });
        var nm = el("div", "mt-name", d.n);
        // 18시즌 덱처럼 운영 방식 칩 (2026-11-21 사용자: "완성 레벨 말고 리롤 그런 거, 18시즌 덱처럼")
        var chips = [d.style ? [styleKo(d.style), /^lvl [5-7]/.test(d.style) ? "ch-reroll" : /^Fast/.test(d.style) ? "ch-fast" : "ch-std"] : null,
          d.level ? [d.level + "렙 완성", "ch-lv"] : null].filter(Boolean);
        var sub = d.plays ? d.plays.toLocaleString() + "판" : "";
        var stats = d.avg != null ? [["평균 등수", d.avg.toFixed(2), s19AvgT(d.avg)], ["선택률", d.pick ? d.pick.toFixed(2) : "-", d.pick ? "pick" : null], ["승률", d.win.toFixed(1) + "%", s19WinT(d.win)], ["순방률", d.top4.toFixed(1) + "%", dkTop4T(d.top4)]]
          : [["평균 등수", "-"], ["선택률", "-"], ["승률", "-"], ["통계 없음", "-"]];
        var row = pcDeckRow({ id: s19DeckKey(d), tier: d.tier || "X", name: nm, chips: chips, sub: sub, traits: traits, units: units, stats: stats,
          open: function (box) { s19CurDeck = s19DeckKey(d); box.classList.add("s19-pcopen"); s19DeckDetailBody(box, d); } });
        prow.appendChild(row);
      });
      out.appendChild(prow);
      var again = s19CurDeck && [].filter.call(prow.children, function (r) { return r.dataset.id === s19CurDeck; })[0];
      if (again) again._toggle(true);
      return;
    }
    var rows2 = el("div", "mt-rows");
    f.forEach(function (d) { rows2.appendChild(s19DeckRow(d, s19St.ds)); });
    out.appendChild(rows2);
  }
  function s19DeckDetailBody(b, d) {
    if (d.avg != null) {
      var kpi = el("div", "dk-kpi s19-dk-kpi");
      [["평균 등수", d.avg.toFixed(2), s19AvgT(d.avg)], ["승률", d.win.toFixed(1) + "%", s19WinT(d.win)], ["순방률", d.top4.toFixed(1) + "%", dkTop4T(d.top4)], ["선택률", d.pick ? d.pick.toFixed(2) : "-", d.pick ? "pick" : null]].forEach(function (x) {
        var box = el("div"), bv = el("b", null, x[1]);
        if (x[2] === "pick") dkPickGrad(bv, d.pick);
        else if (x[2] != null) dkGrad(bv, x[2]);
        box.appendChild(bv); box.appendChild(el("span", null, x[0])); kpi.appendChild(box);
      });
      b.appendChild(kpi);
    }
    var hasPos = d.u.some(function (x) { return x.pos && x.pos.length === 2; });
    if (hasPos) {
      var bc = el("div", "s19-card s19-bwrap");
      bc.appendChild(el("h3", null, "추천 배치"));
      bc.appendChild(s19HexBoard(d.u));
      b.appendChild(bc);
    }
    // 팀 코드 복사 (2026-11-21 사용자: "19시즌 덱들도 팀코드 복사 해줘야지"). 19시즌 팀 플래너에 붙여넣는 코드라 PBE·19시즌 시작 뒤에 쓸 수 있다
    var code = s19CodeOf(d.u.map(function (x) { return x.k; }));
    if (code) {
      var cb = codeButton(code, "팀 코드 복사", "codebtn big s19-code"); b.appendChild(cb);
      var miss = d.u.filter(function (x) { var u = s19Unit(x.k); return u && !u.tp; }).map(function (x) { return s19Unit(x.k).n; });
      b.appendChild(el("p", "s19-codenote", "19시즌 팀 플래너용 코드예요" + (miss.length ? ". " + miss.join(", ") + "의 코드는 아직 PBE에 없어서 빠져요" : "")));
    }
    var loadBtn = el("button", "s19-sqact on", "19시즌 스쿼드 빌더로 불러오기"); loadBtn.type = "button";
    loadBtn.addEventListener("click", function () {
      s19Sq = d.u.map(function (x) { return x.k; }).slice(0, 10);
      s19SqSave();
      var fv = b.closest(".fs-view");
      var goB = function () { s19Jump("builder"); toast(d.n + " 스쿼드를 빌더에 불러왔어요"); };
      if (fv && fv._navClose) fv._navClose(goB); else goB();
    });
    b.appendChild(loadBtn);
    if (d.a && d.a.length) {
      var ac = el("div", "s19-card"); ac.appendChild(el("h3", null, "추천 증강"));
      var aw = el("div", "s19-dk-augs");
      d.a.forEach(function (anm) {
        var ag = s19Aug(anm);
        var bt = el("button", "s19-dk-aug"); bt.type = "button";
        if (ag && ag.img) bt.appendChild(img(ag.img, anm));
        var sp = el("span");
        sp.appendChild(el("b", null, anm));
        if (ag && ag.tier) sp.appendChild(el("small", null, S19_TIER[ag.tier] || ""));
        bt.appendChild(sp);
        bt.addEventListener("click", function () {
          var fv = b.closest(".fs-view");
          var goA = function () { s19Jump("augs", { q: anm, an: false }); };
          if (fv && fv._navClose) fv._navClose(goA); else goA();
        });
        aw.appendChild(bt);
      });
      ac.appendChild(aw); b.appendChild(ac);
    }
    if (d.t && d.t.length) {
      var tc = el("div", "s19-card"); tc.appendChild(el("h3", null, "활성 시너지"));
      var tr = el("div", "s19-tchips");
      d.t.forEach(function (x) {
        var t = s19Trait(x[0]), bt = el("button", "s19-tchip"); bt.type = "button";
        if (t) bt.appendChild(s19Ti(t, 18));
        bt.appendChild(el("span", null, x[0]));
        bt.appendChild(el("small", null, String(x[1])));
        if (t) bt.addEventListener("click", function () { s19OpenTrait(t); });
        tr.appendChild(bt);
      });
      tc.appendChild(tr); b.appendChild(tc);
    }
    var unls = d.u.map(function (x) { return s19Unit(x.k); }).filter(function (u) { return u && u.unl; });
    if (unls.length) {
      var ub = el("div", "s19-bunl s19-dk-unl");
      ub.appendChild(el("div", "s19-bunl-h", "필요한 해금 조건 (" + unls.length + "명)"));
      unls.forEach(function (u) {
        var row = el("div", "s19-bunl-r");
        row.appendChild(el("b", null, u.n + (u.unl.lv ? " (" + u.unl.lv + "렙↑)" : "")));
        row.appendChild(el("span", null, u.unl.c.join(" 또는 ")));
        ub.appendChild(row);
      });
      b.appendChild(ub);
    }
    var uc = el("div", "s19-card"); uc.appendChild(el("h3", null, "챔피언 · 추천 아이템 (" + d.u.length + "명)"));
    var ul = el("div", "s19-dk-list");
    d.u.forEach(function (x) {
      var u = s19Unit(x.k); if (!u) return;
      var row = el("button", "s19-dk-u"); row.type = "button";
      row.appendChild(s19Pic(u, 42));
      var inf = el("div", "s19-dk-um");
      var nm = el("b", null, u.n + (x.s >= 3 ? " ★★★" : ""));
      if (x.k === d.mc) nm.appendChild(el("i", "s19-dk-core", "핵심"));
      inf.appendChild(nm);
      inf.appendChild(el("small", null, u.c + "코 · " + u.t.join(" · ")));
      row.appendChild(inf);
      if (x.i && x.i.length) {
        var iw = el("div", "s19-dk-its");
        x.i.forEach(function (inm) {
          var src = s19ItemImg(inm);
          if (src) { var im = img(src, inm); im.title = inm; iw.appendChild(im); }
        });
        row.appendChild(iw);
      }
      row.addEventListener("click", function () { s19OpenUnit(u); });
      ul.appendChild(row);
    });
    uc.appendChild(ul); b.appendChild(uc);
    b.appendChild(el("p", "fnote", (d.guide ? "배치 롤체지지 · 통계 MetaTFT PBE" : "출처 MetaTFT PBE") + " · 패치 전 수치와 조합은 바뀔 수 있어요"));
  }
  function s19OpenDeck(d) {
    var subTxt = "19시즌 PBE" + (d.tier ? " · " + d.tier + "티어" : "") + (d.plays ? " · " + d.plays.toLocaleString() + "판" : "");
    fsOpen(d.n, subTxt, function (b) { s19DeckDetailBody(b, d); }, "19시즌");
  }

  // 개요: 숫자 한눈에, PBE 추천 덱 TOP 3, 빠른 스쿼드 빌더, 학습 순서, 7코스트, 복각 시너지, 핵심 규칙
  function s19Home(out) {
    var U = S19.units, D = (S19.guides && S19.guides.length) ? S19.guides : (S19.decks || []), kp = el("div", "s19-kpi");
    [[D.length ? "추천 덱" : "신규 증강", D.length || S19.augs.filter(function (a) { return a.new; }).length, D.length ? "decks" : "augs"],
     ["챔피언", U.length, "units"],
     ["시너지", S19.traits.filter(function (t) { return !t.uniq; }).length, "traits"],
     ["해금 챔피언", U.filter(function (u) { return u.unl; }).length, "unlock"]].forEach(function (x) {
      var b = el("button", "s19-k"); b.type = "button"; b.appendChild(el("b", null, x[1])); b.appendChild(el("small", null, x[0]));
      b.addEventListener("click", function () { if (x[2] === "augs") s19St.an = true; s19Go(x[2]); }); kp.appendChild(b);
    });
    out.appendChild(kp);
    if (D.length) {
      var dh = el("div", "hm-bh s19-dtop");
      dh.appendChild(el("h3", null, "PBE 추천 덱 상위권"));
      var dm = el("button", "hm-more", "전체 " + D.length + "개 ›"); dm.type = "button";
      dm.addEventListener("click", function () { s19Go("decks"); });
      dh.appendChild(dm); out.appendChild(dh);
      var drows = el("div", "mt-rows s19-drows");
      D.slice().sort(function (a, b) { return (a.avg || 9) - (b.avg || 9); }).slice(0, isWide() ? 4 : 3).forEach(function (d) { drows.appendChild(s19DeckRow(d, "avg")); });
      out.appendChild(drows);
    }
    var cta = el("button", "s19-bcta"); cta.type = "button";
    var ct = el("span"); ct.appendChild(el("b", null, "19시즌 스쿼드 빌더")); ct.appendChild(el("small", null, "챔피언을 고르면 시너지 단계와 해금 조건을 바로 계산해요"));
    cta.appendChild(ct); cta.appendChild(el("i", null, (s19Sq.length ? s19Sq.length + "/10 배치됨 ›" : "조합 만들기 ›")));
    cta.addEventListener("click", function () { s19Go("builder"); });
    out.appendChild(cta);
    var hgrid = el("div", "s19-hgrid");
    var seven = U.filter(function (u) { return u.c === 7; });
    if (seven.length) {
      var c7 = el("div", "s19-card"); c7.appendChild(el("h3", null, "7코스트 챔피언"));
      c7.appendChild(el("p", "sub", "19시즌에 추가된 최상위 7코스트 유닛이에요. 대부분 해금 조건이 필요해요"));
      var r7 = el("div", "s19-urow"); seven.forEach(function (u) { r7.appendChild(s19UnitBtn(u)); }); c7.appendChild(r7); hgrid.appendChild(c7);
    }
    var how = el("div", "s19-card"); how.appendChild(el("h3", null, "학습 순서"));
    var ol = el("ol", "s19-steps");
    [["계열 시너지부터", "시너지 탭에서 '계열' 필터로 핵심 효과와 최종 구간을 먼저 익혀 보세요", "traits"],
     ["코스트별 캐리", "챔피언 탭에서 4·5·7코스트 스킬과 성급별 수치를 확인해 보세요", "units"],
     ["해금 조건", "19시즌 핵심 시스템이에요. 조건을 달성해야 상점에 등장하는 챔피언이 있어요", "unlock"],
     ["스쿼드 빌더로 조합 테스트", "원하는 챔피언을 배치해 활성 시너지와 필요한 해금 조건을 바로 계산해요", "builder"],
     ["신규 증강 · 상징", "프리즘·골드부터 신규 증강과 조합 가능한 상징을 확인해 보세요", "augs"]].forEach(function (x, i) {
      var li = el("li"); var b = el("button", "s19-step"); b.type = "button";
      b.appendChild(el("b", null, (i + 1) + ". " + x[0])); b.appendChild(el("small", null, x[1]));
      b.addEventListener("click", function () { if (x[2] === "traits") s19St.tf = "ORIGIN"; if (x[2] === "augs") s19St.an = true; s19Go(x[2]); });
      li.appendChild(b); ol.appendChild(li);
    });
    how.appendChild(ol); hgrid.appendChild(how);
    var back = S19.traits.filter(function (t) { return t.back && t.back.length && !t.uniq; });
    if (back.length) {
      var cb = el("div", "s19-card"); cb.appendChild(el("h3", null, "복각 시너지"));
      cb.appendChild(el("p", "sub", "이전 시즌에서 복각된 시너지예요. 세부 효과는 달라졌을 수 있어요"));
      var rb = el("div", "s19-tchips");
      back.forEach(function (t) { var b = el("button", "s19-tchip"); b.type = "button"; b.appendChild(s19Ti(t, 18)); b.appendChild(el("span", null, t.n)); b.appendChild(el("small", null, "세트 " + t.back.join("·"))); b.addEventListener("click", function () { s19OpenTrait(t); }); rb.appendChild(b); });
      cb.appendChild(rb); hgrid.appendChild(cb);
    }
    var rules = el("div", "s19-card"); rules.appendChild(el("h3", null, "19시즌 핵심 규칙"));
    var ul = el("ul", "s19-rules");
    [["해금", "일부 챔피언은 조건(시너지 별 레벨 총합, 아이템 장착, 연승 등)을 달성해야 상점에 등장해요. 알리스타·징크스처럼 7레벨부터 조건이 집계되는 챔피언도 있어요"],
     ["프리즘 퀘스트", "K/DA·HEARTSTEEL·펜타킬·Ionic Spark는 상징 외에도 프리즘 퀘스트 아이템이 있어요"],
     ["고유 시너지", "챔피언 1명만 보유한 전용 시너지예요. 필드에 배치하는 즉시 활성화돼요"],
     ["출처", "MetaTFT PBE 원문·덱 통계와 롤체지지 한국어 데이터예요"]].forEach(function (x) { var li = el("li"); li.appendChild(el("b", null, x[0])); li.appendChild(document.createTextNode(" " + x[1])); ul.appendChild(li); });
    rules.appendChild(ul); hgrid.appendChild(rules);
    out.appendChild(hgrid);
  }
  function s19UnitBtn(u) {
    var b = el("button", "s19-ut"); b.type = "button"; b.appendChild(s19Pic(u)); b.appendChild(el("span", "s19-un", u.n));
    if (u.unl) b.appendChild(el("i", "s19-lock", "해금"));
    b.addEventListener("click", function () { s19OpenUnit(u); }); return b;
  }

  // 시너지
  function s19Traits(out, tools) {
    s19Search(tools, "시너지·챔피언 이름 (초성 가능)");
    s19Chips(tools, [["all", "전체"], ["ORIGIN", "계열"], ["CLASS", "직업"], ["uniq", "고유"]], s19St.tf, function (v) { s19St.tf = v; });
    var list = S19.traits.filter(function (t) {
      if (s19St.tf === "uniq" ? !t.uniq : s19St.tf !== "all" && (t.uniq || t.type !== s19St.tf)) return false;
      return s19Match(t.n) || s19Match(t.en || "") || t.u.some(function (k) { var u = s19Unit(k); return u && s19Match(u.n); });
    });
    if (!list.length) { out.appendChild(el("p", "empty", "맞는 시너지가 없어요")); return; }
    list.forEach(function (t) { out.appendChild(s19TraitCard(t, false)); });
  }
  function s19TraitCard(t, open) {
    var c = el("div", "s19-tc" + (open ? " open" : ""));
    var h = el("button", "s19-th"); h.type = "button";
    h.appendChild(s19Ti(t, 30));
    var mid = el("div", "s19-tm"); mid.appendChild(el("b", null, t.n));
    var bp = t.steps.map(function (s) { return s.m; }).filter(function (m, i, a) { return m != null && a.indexOf(m) === i; });
    mid.appendChild(el("small", null, (t.uniq ? "고유 · " : t.type === "ORIGIN" ? "계열 · " : t.type === "CLASS" ? "직업 · " : "") + (bp.length ? bp.join(" · ") : "") + (t.back && t.back.length ? " · 세트 " + t.back.join("·") : "")));
    h.appendChild(mid);
    var mem = el("div", "s19-tmem"); t.u.slice(0, 9).forEach(function (k) { var u = s19Unit(k); if (u) mem.appendChild(s19Pic(u, 24)); }); h.appendChild(mem);
    c.appendChild(h);
    var body = el("div", "s19-tb");
    if (t.d) body.appendChild(s19Text(t.d));
    var st = t.steps.filter(function (s) { return s.d; });
    if (st.length) { var ul = el("ul", "s19-tsteps"); st.forEach(function (s) { var li = el("li", "st" + (s.s || 1)); li.textContent = s.d; ul.appendChild(li); }); body.appendChild(ul); }
    var um = el("div", "s19-urow"); t.u.forEach(function (k) { var u = s19Unit(k); if (u) um.appendChild(s19UnitBtn(u)); }); body.appendChild(um);
    c.appendChild(body);
    h.addEventListener("click", function () { c.classList.toggle("open"); });
    return c;
  }
  function s19OpenTrait(t) { fsOpen(t.n, t.en && t.en !== t.n ? t.en : "", function (b) { b.appendChild(s19TraitCard(t, true)); }, "19시즌"); }

  // 챔피언
  function s19Units(out, tools) {
    s19Search(tools, "챔피언·시너지 이름 (초성 가능)");
    var costs = [[0, "전체"]]; [1, 2, 3, 4, 5, 7].forEach(function (c) { if (S19.units.some(function (u) { return u.c === c; })) costs.push([c, c + "코"]); });
    s19Chips(tools, costs, s19St.cf, function (v) { s19St.cf = v; });
    var list = S19.units.filter(function (u) { return (!s19St.cf || u.c === s19St.cf) && (s19Match(u.n) || u.t.some(s19Match)); });
    if (!list.length) { out.appendChild(el("p", "empty", "맞는 챔피언이 없어요")); return; }
    var last = null, grid = null;
    list.forEach(function (u) {
      if (u.c !== last) { last = u.c; out.appendChild(el("h3", "s19-h " + (S19_COST[u.c] || ""), u.c + "코스트")); grid = el("div", "s19-grid"); out.appendChild(grid); }
      var b = el("button", "s19-card s19-uc"); b.type = "button";
      b.appendChild(s19Pic(u, 48));
      var m = el("div", "s19-ucm"); m.appendChild(el("b", null, u.n)); m.appendChild(el("small", null, u.t.join(" · ")));
      if (u.sk && u.sk.n) m.appendChild(el("small", "s19-skn", u.sk.n));
      b.appendChild(m); if (u.unl) b.appendChild(el("i", "s19-lock", "해금"));
      b.addEventListener("click", function () { s19OpenUnit(u); }); grid.appendChild(b);
    });
  }
  function s19OpenUnit(u) {
    fsOpen(u.n, u.c + "코스트 · " + u.t.join(" · "), function (b) {
      var top = el("div", "s19-uhead"); top.appendChild(s19Pic(u, 72));
      var tr = el("div", "s19-tchips"); u.t.forEach(function (n) { var t = s19Trait(n); var x = el("button", "s19-tchip"); x.type = "button"; if (t) x.appendChild(s19Ti(t, 18)); x.appendChild(el("span", null, n)); if (t) x.addEventListener("click", function () { s19OpenTrait(t); }); tr.appendChild(x); });
      top.appendChild(tr); b.appendChild(top);
      var inSq = s19Sq.indexOf(u.k) >= 0;
      var sqb = el("button", "s19-sqact" + (inSq ? " on" : ""), inSq ? "스쿼드에서 제외" : "스쿼드에 추가"); sqb.type = "button";
      sqb.addEventListener("click", function () {
        var idx = s19Sq.indexOf(u.k);
        if (idx >= 0) { s19Sq.splice(idx, 1); sqb.classList.remove("on"); sqb.textContent = "스쿼드에 추가"; toast(u.n + " 제외했어요"); }
        else if (s19Sq.length < 10) { s19Sq.push(u.k); sqb.classList.add("on"); sqb.textContent = "스쿼드에서 제외"; toast("스쿼드에 " + u.n + " 추가했어요 · " + s19Sq.length + "/10"); }
        else { toast("최대 10명까지 배치할 수 있어요"); }
        s19SqSave();
      });
      b.appendChild(sqb);
      if (u.unl) {
        var ub = el("div", "note gold s19-unl"); ub.appendChild(el("b", null, "해금 조건" + (u.unl.lv ? " · " + u.unl.lv + "레벨부터" : "")));
        u.unl.c.forEach(function (c, i) { ub.appendChild(el("p", null, (u.unl.c.length > 1 ? (i ? "또는 " : "") : "") + c)); }); b.appendChild(ub);
      }
      var sk = el("div", "s19-card"); sk.appendChild(el("h3", null, "스킬 · " + (u.sk.n || "")));
      if (u.st.m) sk.appendChild(el("p", "sub", "마나 " + (u.st.m0 || 0) + "/" + u.st.m));
      if (u.sk.d) sk.appendChild(s19Text(u.sk.d));
      if (u.sk.l && u.sk.l.length) { var tb = el("div", "s19-kv"); u.sk.l.forEach(function (x) { tb.appendChild(el("span", null, x[0])); tb.appendChild(el("b", null, x[1])); }); sk.appendChild(el("small", "sub", "수치는 1성/2성/3성")); sk.appendChild(tb); }
      b.appendChild(sk);
      var s = u.st, stc = el("div", "s19-card"); stc.appendChild(el("h3", null, "능력치"));
      var kv = el("div", "s19-kv");
      [["체력", s.hp != null ? s.hp + " (1성)" : "-"], ["공격력", Array.isArray(s.ad) ? s.ad.map(function (v) { return Math.round(v); }).join("/") : s.ad], ["공격 속도", s.as], ["방어력 / 마법 저항력", (s.ar || 0) + " / " + (s.mr || 0)], ["사거리", s.rng + "칸"], ["상점 개수", u.pool != null ? u.pool + "장" : "-"]].forEach(function (x) { kv.appendChild(el("span", null, x[0])); kv.appendChild(el("b", null, x[1] == null ? "-" : String(x[1]))); });
      stc.appendChild(kv); b.appendChild(stc);
    }, "19시즌");
  }

  // 해금 (학습 체크리스트 + 검색)
  function s19Unlocks(out, tools) {
    s19Search(tools, "해금 챔피언·조건 검색");
    var all = S19.units.filter(function (u) { return u.unl; });
    var doneCnt = all.filter(function (u) { return s19UlDone[u.k]; }).length;
    var prog = el("div", "s19-prog");
    var ph = el("div", "s19-prog-h");
    ph.appendChild(el("span", null, "해금 조건 암기 진척도"));
    ph.appendChild(el("b", null, doneCnt + " / " + all.length));
    prog.appendChild(ph);
    var bar = el("div", "s19-prog-bar"), fill = el("i");
    fill.style.width = (all.length ? Math.round(doneCnt / all.length * 100) : 0) + "%";
    bar.appendChild(fill); prog.appendChild(bar);
    out.appendChild(prog);
    var list = all.filter(function (u) { return s19Match(u.n) || u.t.some(s19Match) || u.unl.c.some(s19Match); });
    out.appendChild(el("p", "sub s19-lead", "조건을 채우면 상점에 나오기 시작해요. 오른쪽 체크로 외운 챔피언을 표시할 수 있어요"));
    list.sort(function (a, b) { return a.c - b.c; }).forEach(function (u) {
      var wrap = el("div", "s19-card s19-ul" + (s19UlDone[u.k] ? " done" : ""));
      var main = el("button", "s19-ul-main"); main.type = "button";
      main.appendChild(s19Pic(u, 44));
      var m = el("div", "s19-ulm"); m.appendChild(el("b", null, u.n + " "));
      m.firstChild.appendChild(el("small", null, u.c + "코" + (u.unl.lv ? " · " + u.unl.lv + "레벨부터" : "")));
      u.unl.c.forEach(function (c, i) { m.appendChild(el("p", null, (u.unl.c.length > 1 && i ? "또는 " : "") + c)); });
      main.appendChild(m); main.addEventListener("click", function () { s19OpenUnit(u); });
      var chk = el("button", "s19-ul-chk" + (s19UlDone[u.k] ? " on" : ""), s19UlDone[u.k] ? "✓" : ""); chk.type = "button";
      chk.setAttribute("aria-label", u.n + " 암기 체크");
      chk.addEventListener("click", function () {
        if (s19UlDone[u.k]) delete s19UlDone[u.k]; else s19UlDone[u.k] = 1;
        s19UlSave(); s19Render();
      });
      wrap.appendChild(main); wrap.appendChild(chk); out.appendChild(wrap);
    });
    if (!list.length) out.appendChild(el("p", "empty", "맞는 해금 챔피언이 없어요"));
  }

  // 19시즌 스쿼드 빌더: 실시간 시너지 단계 + 해금 미션 계산
  function s19Builder(out, tools) {
    s19Sq = s19Sq.filter(function (k) { return !!s19Unit(k); });
    var top = el("div", "s19-bcard");
    var hd = el("div", "s19-bhd");
    hd.appendChild(el("b", null, "내 19시즌 스쿼드 " + s19Sq.length + "/10"));
    var clr = el("button", "s19-bclr", "초기화"); clr.type = "button"; clr.disabled = !s19Sq.length;
    clr.addEventListener("click", function () { s19Sq = []; s19SqSave(); s19Render(); });
    var sqCode = s19CodeOf(s19Sq);
    if (sqCode) hd.appendChild(codeButton(sqCode, "팀 코드"));
    hd.appendChild(clr); top.appendChild(hd);
    var slots = el("div", "s19-bslots");
    for (var i = 0; i < 10; i++) {
      var u = s19Sq[i] ? s19Unit(s19Sq[i]) : null;
      var sl = el("button", "s19-bslot" + (u ? " full " + (S19_COST[u.c] || "c1") : "")); sl.type = "button";
      if (u) {
        if (u.img) sl.appendChild(img(u.img, u.n));
        sl.appendChild(el("span", "x", "×"));
        sl.title = u.n + " 빼기";
        (function (key) { sl.addEventListener("click", function () { s19Sq = s19Sq.filter(function (x) { return x !== key; }); s19SqSave(); s19Render(); }); })(u.k);
      } else {
        sl.appendChild(el("span", "emp", String(i + 1)));
      }
      slots.appendChild(sl);
    }
    top.appendChild(slots);
    // 시너지 실시간 계산
    var counts = {}, squadUnits = s19Sq.map(s19Unit).filter(Boolean);
    squadUnits.forEach(function (u) {
      u.t.forEach(function (tn) { counts[tn] = (counts[tn] || 0) + 1; });
    });
    var synList = Object.keys(counts).map(function (tn) {
      var t = s19Trait(tn), cnt = counts[tn], active = 0, nextM = null, style = 0;
      if (t && t.steps && t.steps.length) {
        t.steps.forEach(function (s) {
          if (s.m != null && cnt >= s.m) { active = s.m; style = s.s || 1; }
          else if (s.m != null && nextM == null) nextM = s.m;
        });
      }
      return { n: tn, t: t, cnt: cnt, active: active, next: nextM, style: t && t.uniq ? 4 : style };
    }).sort(function (a, b) { return (b.active > 0) - (a.active > 0) || b.style - a.style || b.cnt - a.cnt; });
    var synBox = el("div", "s19-bsyn");
    if (!synList.length) {
      synBox.appendChild(el("span", "sub", "아래에서 챔피언을 눌러 시너지를 조합해 보세요"));
    } else {
      synList.forEach(function (x) {
        var b = el("button", "s19-bspill st" + (x.active ? x.style : 0)); b.type = "button";
        if (x.t) b.appendChild(s19Ti(x.t, 16));
        b.appendChild(el("span", null, x.n));
        b.appendChild(el("b", null, x.cnt + (x.next ? "/" + x.next : "")));
        if (x.t) b.addEventListener("click", function () { s19OpenTrait(x.t); });
        synBox.appendChild(b);
      });
    }
    top.appendChild(synBox);
    // 담긴 챔피언 중 해금 조건 자동 요약
    var unls = squadUnits.filter(function (u) { return u.unl; });
    if (unls.length) {
      var ub = el("div", "s19-bunl");
      ub.appendChild(el("div", "s19-bunl-h", "필요한 해금 조건 (" + unls.length + "명)"));
      unls.forEach(function (u) {
        var row = el("div", "s19-bunl-r");
        row.appendChild(el("b", null, u.n + (u.unl.lv ? " (" + u.unl.lv + "렙↑)" : "")));
        row.appendChild(el("span", null, u.unl.c.join(" 또는 ")));
        ub.appendChild(row);
      });
      top.appendChild(ub);
    }
    out.appendChild(top);
    // 챔피언 선택 풀
    s19Search(tools, "빌더 챔피언·시너지 검색");
    var costs = [[0, "전체"]]; [1, 2, 3, 4, 5, 7].forEach(function (c) { if (S19.units.some(function (u) { return u.c === c; })) costs.push([c, c + "코"]); });
    s19Chips(tools, costs, s19St.bcf || 0, function (v) { s19St.bcf = v; });
    var pool = S19.units.filter(function (u) { return (!s19St.bcf || u.c === s19St.bcf) && (s19Match(u.n) || u.t.some(s19Match)); });
    var last = null, row = null;
    pool.forEach(function (u) {
      if (u.c !== last) {
        last = u.c;
        out.appendChild(el("h3", "s19-h " + (S19_COST[u.c] || ""), u.c + "코스트"));
        row = el("div", "s19-bpool");
        out.appendChild(row);
      }
      var on = s19Sq.indexOf(u.k) >= 0;
      var btn = el("button", "s19-bpick" + (on ? " on" : "")); btn.type = "button";
      btn.appendChild(s19Pic(u, 44));
      btn.appendChild(el("span", "s19-un", u.n));
      if (u.unl) btn.appendChild(el("i", "s19-lock", "해금"));
      btn.addEventListener("click", function () {
        var idx = s19Sq.indexOf(u.k);
        if (idx >= 0) s19Sq.splice(idx, 1);
        else if (s19Sq.length < 10) s19Sq.push(u.k);
        else { toast("최대 10명까지 담을 수 있어요"); return; }
        s19SqSave(); s19Render();
      });
      row.appendChild(btn);
    });
  }

  // 증강
  function s19Augs(out, tools) {
    s19Search(tools, "증강 이름·설명 (초성 가능)");
    s19Chips(tools, [[0, "전체"], [3, "프리즘"], [2, "골드"], [1, "실버"]], s19St.af, function (v) { s19St.af = v; });
    var nb = el("button", "s19-new" + (s19St.an ? " on" : ""), "새 증강만"); nb.type = "button";
    nb.addEventListener("click", function () { s19St.an = !s19St.an; s19Save(); s19Render(); }); tools.lastChild.appendChild(nb);
    var list = S19.augs.filter(function (a) { return (!s19St.af || a.tier === s19St.af) && (!s19St.an || a.new) && (s19Match(a.n) || s19Match(a.d)); });
    out.appendChild(el("p", "sub s19-lead", list.length + "개" + (s19St.an ? " · 이번 시즌 새 증강" : "") + (list.some(function (a) { return a.d.indexOf("?") >= 0; }) ? " · ?는 PBE에 아직 수치가 없는 자리예요" : "")));
    list.slice(0, 200).forEach(function (a) {
      var r = el("div", "s19-card s19-ar t" + (a.tier || 1));
      var ic = el("span", "s19-ai"); if (a.img) { var i = img(a.img, a.n); i.loading = "lazy"; ic.appendChild(i); } r.appendChild(ic);
      var m = el("div", "s19-arm"); var h = el("b", null, a.n); h.appendChild(el("small", "s19-tier t" + (a.tier || 1), S19_TIER[a.tier] || "")); if (a.new) h.appendChild(el("small", "s19-nb", "새"));
      m.appendChild(h); m.appendChild(s19Text(a.d)); r.appendChild(m); out.appendChild(r);
    });
    if (list.length > 200) out.appendChild(el("p", "sub", "200개까지 보여요. 검색으로 좁혀 보세요"));
  }

  // 아이템
  function s19Items(out) {
    [["emb", "상징", "조합: 뒤집개 + 재료. '조합 불가'는 증강·보상으로만 얻어요"], ["quest", "프리즘 퀘스트", "시너지를 끝까지 키우면 받는 보상 아이템이에요"], ["set", "시즌 전용", "특정 시너지·챔피언과 함께 나오는 아이템이에요"]].forEach(function (g) {
      var list = S19.items.filter(function (i) { return i.kind === g[0]; }); if (!list.length) return;
      out.appendChild(el("h3", "s19-h", g[1])); out.appendChild(el("p", "sub", g[2]));
      list.forEach(function (i) {
        var r = el("div", "s19-card s19-ar");
        var ic = el("span", "s19-ai"); if (i.img) { var im = img(i.img, i.n); im.loading = "lazy"; ic.appendChild(im); } r.appendChild(ic);
        var m = el("div", "s19-arm"); var h = el("b", null, i.n);
        if (g[0] === "emb") h.appendChild(el("small", "s19-tier " + (i.craft ? "t2" : "t1"), i.craft ? "조합" : "조합 불가"));
        m.appendChild(h); if (i.comp && i.comp.length) m.appendChild(el("small", "sub", i.comp.join(" + ")));
        m.appendChild(s19Text(i.d)); r.appendChild(m); out.appendChild(r);
      });
    });
  }
  document.querySelectorAll("#s19-view button").forEach(function (b) { b.addEventListener("click", function () { s19St.q = ""; s19Go(b.dataset.v); }); });

