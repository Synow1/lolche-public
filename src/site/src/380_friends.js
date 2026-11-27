  function frList() { try { var f = JSON.parse(localStorage.getItem(FR_KEY) || "null"); if (f && Array.isArray(f) && (WEB || f.length)) return f; } catch (e) {} return WEB ? [] : FRIENDS.slice(); }
  function frSave(f) { try { localStorage.setItem(FR_KEY, JSON.stringify(f)); } catch (e) {} }
  // 판수별 LP: 시즌 랭크 판수에 맞춰 번호를 매긴다 (MetaTFT에 없는 옛날 판이 있으면 그만큼 밀어서)
  function frSeries(d) {
    if (d._logs && d._logs.length) {  // 롤체지지 LP 기록: [시각, 점수, 그때까지 판수]
      var rk = (d.matches || []).filter(function (m) { return String(m.queue_id) === "1100"; }).sort(function (a, b) { return b.match_timestamp - a.match_timestamp; });
      var ss0 = (d.ranked_season_stats || {})["1100"];
      return { pts: d._logs.map(function (x) { return { g: x[2], t: x[0], v: x[1] }; }), total: ss0 ? ss0.total : rk.length, ranked: rk };
    }
    var lp = lpOf(d);
    var ranked = (d.matches || []).filter(function (m) { return String(m.queue_id) === "1100"; }).sort(function (a, b) { return a.match_timestamp - b.match_timestamp; });
    var ss = (d.ranked_season_stats || {})["1100"], total = Math.max(ss && ss.total || 0, ranked.length), off = total - ranked.length;
    var pts = [];
    ranked.forEach(function (m, i) {
      var x = lp[m.riot_match_id]; if (!x) return;
      if (!pts.length && x.before != null) pts.push({ g: off + i, t: m.match_timestamp - 1, v: x.before });
      if (x.after != null) pts.push({ g: off + i + 1, t: m.match_timestamp, v: x.after, p: m.placement, d: x.diff });
    });
    return { pts: pts, total: total, ranked: ranked.slice().reverse() };
  }
  function frChart() {
    var box = document.getElementById("fr-chart"); box.innerHTML = "";
    var lines = frData.map(function (f, k) {
      var pts = f.s.pts;
      if (frX === "game" && frZoom) pts = pts.filter(function (p) { return p.g <= frZoom; });
      if (frX === "date" && frZoom) { var from = Date.now() - frZoom * 864e5; pts = pts.filter(function (p) { return p.t >= from; }); }
      return { f: f, c: FR_COLORS[k % FR_COLORS.length], pts: pts };
    }).filter(function (l) { return l.pts.length; });
    if (!lines.length) { box.appendChild(el("p", "sub", "LP 기록이 없어요")); return; }
    var all = [].concat.apply([], lines.map(function (l) { return l.pts; }));
    var key = frX === "game" ? "g" : "t";
    var x0 = Math.min.apply(null, all.map(function (p) { return p[key]; })), x1 = Math.max.apply(null, all.map(function (p) { return p[key]; }));
    if (x1 === x0) x1 = x0 + 1;
    var ys = all.map(function (p) { return p.v; }), lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), span = Math.max(150, hi - lo);
    lo = Math.max(0, lo - span * 0.12); hi = hi + span * 0.12;
    var W = 640, H = 300, pad = { l: 74, r: 12, t: 14, b: 26 }, ns = "http://www.w3.org/2000/svg";
    var X = function (v) { return pad.l + (W - pad.l - pad.r) * (v - x0) / (x1 - x0); };
    var Y = function (v) { return pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / (hi - lo)); };
    var svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "lpchart frchart");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "친구 LP 비교 그래프");
    function mk(tag, attrs, txt) { var e = document.createElementNS(ns, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; }
    tierBg(mk, Y, lo, hi, pad.l, W - pad.r);
    tierAxis(mk, Y, lo, hi, pad.l, W - pad.r, Math.max.apply(null, ys));
    var fmtX = function (v) { if (frX === "game") return v + "판"; return fmtMD(new Date(v)); };
    mk("text", { x: pad.l, y: H - 7, class: "axis" }, fmtX(x0));
    mk("text", { x: W - pad.r, y: H - 7, class: "axis", "text-anchor": "end" }, fmtX(x1));
    lines.forEach(function (l) {
      var d = smoothPath(l.pts.map(function (p) { return [X(p[key]), Y(p.v)]; }));
      mk("path", { d: d, class: "frglow", stroke: l.c });
      mk("path", { d: d, class: "frline", stroke: l.c });
      var last = l.pts[l.pts.length - 1];
      mk("circle", { cx: X(last[key]), cy: Y(last.v), r: 5, fill: l.c, class: "frend" });
    });
    // 그래프를 가리지 않게: 위 범례에 지금 LP, 그래프를 누르면 그 시점 LP로 바꾼다 (떠 있는 설명 상자는 그래프를 다 가렸다)
    var head = el("div", "fr-legh"), hl = el("span", null, "지금"), leg = el("div", "fr-leg");
    head.appendChild(hl); box.appendChild(head);
    lines.forEach(function (l) {
      var it = el("span"), dot = el("i"); dot.style.background = l.c; it.appendChild(dot);
      it.appendChild(document.createTextNode(l.f.id.split("#")[0])); l.val = el("small"); it.appendChild(l.val); leg.appendChild(it);
      l.dot = mk("circle", { r: 5.5, fill: l.c, class: "frdot", visibility: "hidden" });
    });
    box.appendChild(leg);
    function setLeg(xv) {
      hl.textContent = xv == null ? "지금" : frX === "game" ? Math.round(xv) + "판째" : fmtX(xv);
      lines.forEach(function (l) {
        var p = null;
        if (xv == null) p = l.pts[l.pts.length - 1];
        else { l.pts.forEach(function (q) { if (q[key] <= xv + (frX === "game" ? 0.5 : 0)) p = q; }); if (frX === "game" && xv > l.pts[l.pts.length - 1][key] + 0.5) p = null; }
        l.val.textContent = p ? (p.v >= 2800 ? TIER_ABBR[tierAt(p.v)] + " " + (p.v - 2800) : TIER_ABBR[tierAt(p.v)] + (4 - Math.floor((p.v % 400) / 100)) + " " + (p.v % 100)) + "LP" : "-";
        if (xv != null && p) { l.dot.setAttribute("cx", X(p[key])); l.dot.setAttribute("cy", Y(p.v)); l.dot.setAttribute("visibility", "visible"); } else l.dot.setAttribute("visibility", "hidden");
      });
    }
    setLeg(null);
    var cur = mk("line", { y1: pad.t, y2: H - pad.b, class: "cursor", visibility: "hidden" });
    var wrap = el("div", "lpwrap"); wrap.appendChild(svg); box.appendChild(wrap);
    function show(ev) {
      var r = svg.getBoundingClientRect(), xv = x0 + ((ev.clientX - r.left) / r.width * W - pad.l) / (W - pad.l - pad.r) * (x1 - x0);
      xv = Math.max(x0, Math.min(x1, xv));
      cur.setAttribute("x1", X(xv)); cur.setAttribute("x2", X(xv)); cur.setAttribute("visibility", "visible");
      setLeg(xv);
    }
    svg.addEventListener("pointermove", show); svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", function () { cur.setAttribute("visibility", "hidden"); setLeg(null); });
  }
  function frCards() {
    var box = document.getElementById("fr-cards"); box.innerHTML = "";
    frData.slice().sort(function (a, b) { return (b.d.ranked.rating_numeric != null ? b.d.ranked.rating_numeric : -1) - (a.d.ranked.rating_numeric != null ? a.d.ranked.rating_numeric : -1) || a.id.localeCompare(b.id, "ko"); }).forEach(function (f, idx) {
      var k = frData.indexOf(f), c = el("div", "fr-card");
      c.style.setProperty("--fc", FR_COLORS[k % FR_COLORS.length]);
      var top = el("div", "fr-top");
      top.appendChild(el("span", "fr-rk" + (idx < 3 ? " r" + (idx + 1) : ""), String(idx + 1)));
      var nm = el("button", "fr-name", f.id.split("#")[0]); nm.type = "button";
      nm.addEventListener("click", function () { openProfile(f.id, "kr"); });
      top.appendChild(nm);
      top.appendChild(tierBadge(f.d.ranked.rating_text));
      if (LIVE && (WEB || f.id !== "Synow#KR1")) {
        var x = el("button", "fr-x", "✕"); x.type = "button"; x.setAttribute("aria-label", f.id + " 빼기");
        x.addEventListener("click", function () { frSave(frList().filter(function (y) { return y !== f.id; })); frLoad(); });
        top.appendChild(x);
      }
      c.appendChild(top);
      var ss = (f.d.ranked_season_stats || {})["1100"];
      if (ss && ss.total) {
        var pl = ss.placements, tot = ss.total, avg = pl.reduce(function (a, n, i) { return a + n * (i + 1); }, 0) / tot;
        c.appendChild(el("div", "fr-st", tot + "판 · 평균 " + avg.toFixed(2) + " · 순방 " + Math.round(pl.slice(0, 4).reduce(function (a, b) { return a + b; }, 0) / tot * 100) + "% · 승률 " + Math.round(pl[0] / tot * 100) + "%"));
      }
      // 마지막 랭크 판이 언제였는지 + 최근 7일 랭크 판 수 (불러온 판이 전부 7일 안이면 더 받아서 센다, 최대 100판)
      var rts = (f.d.matches || []).filter(function (m) { return String(m.queue_id) === "1100"; }).map(function (m) { return m.match_timestamp; });
      if (rts.length || (ss && ss.total)) {
        var last = rts.length ? Math.max.apply(null, rts) : 0, wk = rts.filter(function (t) { return t >= Date.now() - 7 * 864e5; }).length;
        var more = rts.length && wk === rts.length && f.d._canMore && f.d._canMore(rts.length + 20) && rts.length < 100;
        var act = el("div", "fr-act");
        if (last) { act.appendChild(document.createTextNode("마지막 판 ")); act.appendChild(el("b", Date.now() - last < 864e5 ? "on" : null, ago(last))); act.appendChild(document.createTextNode(" · ")); }
        act.appendChild(document.createTextNode("최근 7일 ")); act.appendChild(el("b", wk ? null : "zero", wk + (more ? "판+" : "판")));
        c.appendChild(act);
        if (more && !f._moreBusy) { f._moreBusy = true; f.d._more(rts.length + 20).then(function () { f._moreBusy = false; frCards(); }).catch(function () { f._moreBusy = false; }); }
      }
      var recent = f.s.ranked.slice(0, 10);
      if (recent.length) c.appendChild(plStr(recent));
      box.appendChild(c);
    });
  }
  function frDraw() {
    document.querySelectorAll("#fr-x button").forEach(function (b) { b.classList.toggle("on", b.dataset.x === frX); });
    var zc = document.getElementById("fr-zoom"); zc.innerHTML = "";
    (frX === "game" ? [[0, "전체"], [30, "30판까지"], [100, "100판까지"]] : [[0, "시즌 전체"], [30, "최근 30일"], [7, "최근 7일"]]).forEach(function (z) {
      var b = el("button", z[0] === frZoom ? "on" : null, z[1]); b.type = "button";
      b.addEventListener("click", function () { frZoom = z[0]; frDraw(); }); zc.appendChild(b);
    });
    try { localStorage.setItem(FR_VIEW, JSON.stringify({ x: frX, z: frZoom })); } catch (e) {}
    frChart(); frCards();
    if (frView === "top") frTop();
  }
  function frLoad(synced) {
    var note = document.getElementById("fr-note"), ids = frList(), rf = document.getElementById("fr-refresh");
    var cbox = document.querySelector("#friends .fr-chartbox");
    if (rf) rf.hidden = !LIVE || !ids.length;
    if (LIVE && !ids.length) {
      frData = [];
      if (cbox) cbox.hidden = true;
      document.getElementById("fr-chart").innerHTML = "";
      var cards = document.getElementById("fr-cards"); cards.innerHTML = "";
      cards.appendChild(el("p", "empty", "소환사 이름#태그를 추가하면 티어 그래프와 고점 판을 함께 비교할 수 있어요"));
      note.textContent = "소환사를 추가해 보세요 · 출처 롤체지지";
      if (frView === "top") frTop();
      return;
    }
    if (cbox) cbox.hidden = false;
    if (!synced) { document.getElementById("fr-chart").innerHTML = ""; document.getElementById("fr-cards").innerHTML = ""; note.textContent = "불러오는 중"; }
    var p;
    if (LIVE) p = Promise.all(ids.map(function (id) {
      return dakProfile(id, { queue: "1100" }).then(function (d) { return { id: id, d: d }; }).catch(function () { return null; });
    })).then(function (r) { return { list: r.filter(Boolean), note: "" }; });
    else p = fetch("friends.json").then(function (r) { return r.json(); }).then(function (j) {
      return { list: j.players.map(function (d) { return { id: d.riot_id, d: d }; }), note: updAt(j.updated) + " · 출처 롤체지지" };
    });
    p.then(function (r) {
      frData = r.list.map(function (x) { x.d.ranked = x.d.ranked || {}; x.s = frSeries(x.d); return x; })
        .sort(function (a, b) { return (b.d.ranked.rating_numeric != null ? b.d.ranked.rating_numeric : -1) - (a.d.ranked.rating_numeric != null ? a.d.ranked.rating_numeric : -1) || a.id.localeCompare(b.id, "ko"); });
      note.textContent = LIVE ? (frSyncing ? "갱신 중" : updAt(new Date())) + " · 출처 롤체지지" : r.note;
      frDraw();
    }).catch(function (e) { note.textContent = "불러오지 못했어요. 잠시 후 다시 시도해 주세요"; });
  }
  // 친구 전원 롤체지지 갱신 (라이엇 갱신처럼 한 번에) -> 끝나면 다시 그림. 탭에 들어올 때마다 (2분 간격), '갱신' 버튼은 바로
  var frSyncAt = 0, frSyncing = false;
  function frSyncAll(force) {
    var ids = frList();
    if (!LIVE || !ids.length || frSyncing || (!force && Date.now() - frSyncAt < 120000)) return;
    frSyncing = true; frSyncAt = Date.now();
    var rf = document.getElementById("fr-refresh"), note = document.getElementById("fr-note"), done = 0;
    rf.disabled = true; rf.textContent = "갱신 중 0/" + ids.length;
    Promise.all(ids.map(function (id) { return dakSync(id).then(function () { rf.textContent = "갱신 중 " + (++done) + "/" + ids.length; }); })).then(function () {
      frSyncing = false; rf.disabled = false; rf.textContent = "갱신"; frLoad(true);
    });
  }
  // 고점 판: 친구들 랭크 판을 덱파워 순으로 (덱파워 탭과 같은 카드). 최근 20판은 바로, 100판은 더 받아서
  var frView = "lp", frTopN = 20, frTopWho = "", frTopBusy = false;
  function frTop() {
    var box = document.getElementById("fr-tlist"), nb = document.getElementById("fr-tn"), wb = document.getElementById("fr-tw");
    nb.innerHTML = ""; wb.innerHTML = "";
    [[20, "최근 20판"], [100, "최근 100판"]].forEach(function (x) {
      var b = el("button", x[0] === frTopN ? "on" : null, x[1]); b.type = "button";
      b.addEventListener("click", function () { frTopN = x[0]; frTop(); }); nb.appendChild(b);
    });
    [""].concat(frData.map(function (f) { return f.id; })).forEach(function (id) {
      var b = el("button", id === frTopWho ? "on" : null, id ? id.split("#")[0] : "전체"); b.type = "button";
      b.addEventListener("click", function () { frTopWho = id; frTop(); }); wb.appendChild(b);
    });
    box.innerHTML = "";
    if (!frData.length) { box.appendChild(el("p", "empty", LIVE && !frList().length ? "소환사를 추가하면 최근 고점 판을 비교할 수 있어요" : "불러오는 중")); return; }
    if (!POWER && !POWER_S19) { box.appendChild(el("p", "empty", "불러오는 중")); return; }
    if (LIVE_SET_ID !== SET_ID && !OLD) { box.appendChild(el("p", "empty", "불러오는 중")); loadOld().then(function () { if (frView === "top") frTop(); }); return; }
    var need = frData.filter(function (f) { return f.d._canMore && f.d._canMore(frTopN) && (!frTopWho || f.id === frTopWho); });
    if (need.length) {
      box.appendChild(el("p", "empty", "불러오는 중"));
      if (!frTopBusy) { frTopBusy = true; Promise.all(need.map(function (f) { return f.d._more(frTopN); })).then(function () { frTopBusy = false; if (frView === "top") frTop(); }, function () { frTopBusy = false; }); }
      return;
    }
    var games = [];
    frData.forEach(function (f) {
      if (frTopWho && f.id !== frTopWho) return;
      var ms = (f.d.matches || []).filter(function (m) { return String(m.queue_id) === "1100"; }).slice(0, frTopN);
      ms.forEach(function (m) {
        var s = m.summary || {}, mSet = detectMatchSet(m);
        if (pwOtherSet(m.patch, mSet)) return;
        var r = boardPower(s.units, s.traits, s.level, mSet);
        if (r && r.power != null) games.push({ pw: r.power, who: f.id, tier: m.patch && pwOld(m.patch, mSet) ? m.patch + " 판" : "", pl: m.placement, level: s.level, t: m.match_timestamp, set: mSet, patch: m.patch || "", season: m.season || "", units: s.units, traits: s.traits });
      });
    });
    games.sort(function (a, b) { return b.pw - a.pw; });
    if (!games.length) { box.appendChild(el("p", "empty", "아직 기록이 없어요")); return; }
    games.slice(0, 20).forEach(function (g, i) { box.appendChild(pwCard(g, i)); });
    box.appendChild(el("p", "fnote", "친구마다 최근 랭크 " + frTopN + "판 중 덱파워 상위 20판 · 출처 롤체지지"));
  }
  function frSetView(v) {
    frView = v;
    document.querySelectorAll("#fr-view button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === v); });
    document.getElementById("fr-lp").hidden = v !== "lp"; document.getElementById("fr-top").hidden = v !== "top";
    if (v === "top") frTop();
  }
  function buildFriends() {
    try { var v = JSON.parse(localStorage.getItem(FR_VIEW) || "{}") || {}; if (v.x) frX = v.x; if (v.z != null) frZoom = v.z; } catch (e) {}
    document.querySelectorAll("#fr-view button").forEach(function (b) { b.addEventListener("click", function () { frSetView(b.dataset.v); }); });
    document.querySelectorAll("#fr-x button").forEach(function (b) { b.addEventListener("click", function () { frX = b.dataset.x; frZoom = 0; frDraw(); }); });
    var add = document.getElementById("fr-add"), inp = document.getElementById("fr-q");
    add.hidden = !LIVE;
    function doAdd() {
      var v = inp.value.trim(); if (v.indexOf("#") < 1) { inp.focus(); return; }
      var f = frList(); if (f.indexOf(v) < 0) f.push(v); frSave(f); inp.value = ""; frLoad();
    }
    document.getElementById("fr-addbtn").addEventListener("click", doAdd);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") doAdd(); });
    var sug = document.getElementById("fr-sug");
    var frPick = function (id) { inp.value = id; sug.innerHTML = ""; doAdd(); inp.blur(); };
    var frSug = function () { whoList(sug, inp.value, { me: !WEB, pick: frPick, skip: frList() }); };
    inp.addEventListener("focus", frSug); inp.addEventListener("input", frSug);
    inp.addEventListener("blur", function () { setTimeout(function () { sug.innerHTML = ""; }, 200); });
    var rf = document.getElementById("fr-refresh"); rf.hidden = !LIVE || !frList().length;
    rf.addEventListener("click", function () { frSyncAll(true); });
    frLoad();
  }

  function buildRank() {
    document.querySelectorAll("#rk-seg button").forEach(function (b) { b.addEventListener("click", function () { rkView(b.dataset.v); }); });
    document.getElementById("rk-more").addEventListener("click", function () { rkLoad(true); });
    var regBtn = document.getElementById("rk-reg");
    if (regBtn) regBtn.addEventListener("click", function () { rkSetReg(rkReg === "pbe1" ? "kr" : "pbe1", true); });
    document.querySelectorAll("#rk-regchips button").forEach(function (b) { b.addEventListener("click", function () { rkSetReg(b.dataset.reg, true); }); });
    document.getElementById("rk-q").addEventListener("input", rkSuggest);
    document.getElementById("rk-q").addEventListener("keydown", function (e) { if (e.key === "Enter" && this.value.indexOf("#") > 0) { this.blur(); rkProfile(this.value.trim(), null, rkReg); } });
    document.getElementById("rk-q").addEventListener("focus", function () { var q = this; setTimeout(function () { q.select(); }, 0); whoList(document.getElementById("rk-sug"), rkCur && q.value === rkCur ? "" : q.value, { me: !WEB, reg: rkReg }); });
    document.getElementById("rk-q").addEventListener("blur", function () { setTimeout(function () { if (rkCur) document.getElementById("rk-sug").innerHTML = ""; }, 200); });
    document.getElementById("rk-go").addEventListener("click", function () { var v = document.getElementById("rk-q").value.trim(); if (v.indexOf("#") > 0) rkProfile(v, null, rkReg); else rkSuggest(); });
    rkFavs(); rkLoad(false);
    buildFriends();
  }

  /* ---- 이스포츠: site/esports.json (scripts/build_esports.py) ---- */
  var ESP = null, espRegion = "", espOpen = null;
  var SET_NAME = __SET_NAMES__;  // data/sets.json (조립 때 채움)
  var KIND_NAME = { crown: "전략가의 왕관 (월즈)", finals: "지역별 결승", tpc: "프로 서킷", cup: "전략가의 컵", trials: "전략가의 시험", open: "TFT 오픈", ewc: "EWC", team: "4v4 팀전", event: "이벤트 · 쇼매치", kr: "국내 대회", circuit: "지역 공식" };
  var CUP18 = { "TPC 1": "협곡야수 컵", "TPC 2": "나무정령 컵", "TPC 3": "개화 컵" };
  var FLAG = { kr: "🇰🇷", jp: "🇯🇵", tw: "🇹🇼", vn: "🇻🇳", hk: "🇭🇰", sg: "🇸🇬", au: "🇦🇺", nz: "🇳🇿", ph: "🇵🇭", th: "🇹🇭", cn: "🇨🇳", us: "🇺🇸", ca: "🇨🇦", br: "🇧🇷", de: "🇩🇪", fr: "🇫🇷", es: "🇪🇸", gb: "🇬🇧", pl: "🇵🇱", it: "🇮🇹", my: "🇲🇾", id: "🇮🇩" };
