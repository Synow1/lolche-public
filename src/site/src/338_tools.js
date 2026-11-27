  /* ---- v3.8.0 실전 도구: 증강 3택 비교기 (#augments) + 리롤 확률·기대 골드 계산기 (#numbers) ---- */
  var AG_CMP_KEY = "tft-guide-agcmp", agCmpList = [], agCmpStage = "All";
  try {
    var acs = JSON.parse(localStorage.getItem(AG_CMP_KEY) || "null");
    if (acs && Array.isArray(acs.l)) agCmpList = acs.l.slice(0, 3);
    if (acs && acs.s) agCmpStage = acs.s;
  } catch (e) {}
  function agCmpSave() { try { localStorage.setItem(AG_CMP_KEY, JSON.stringify({ l: agCmpList, s: agCmpStage })); } catch (e) {} }
  function agCmpRarNum(r) { return r === "프리즘" ? "3" : r === "골드" ? "2" : r === "실버" ? "1" : ""; }
  function agTfaTier(name, rarNum, stage) {
    if (!TFA || !TFA.augs || !rarNum) return "";
    var bySt = (TFA.augs[rarNum] || {})[stage] || {};
    var tiers = ["S", "A", "B", "C"], clean = name.replace(/\+*$/, "");
    for (var i = 0; i < tiers.length; i++) {
      var arr = bySt[tiers[i]] || [];
      if (arr.indexOf(name) >= 0 || arr.indexOf(clean) >= 0) return tiers[i];
    }
    return "";
  }
  function agCmpScore(name, stage) {
    var inf = DB && DB.info && DB.info.a && DB.info.a[name];
    var rn = inf ? agCmpRarNum(inf.r) : "";
    var ord = { S: 5, A: 4, B: 3, C: 2, D: 1 };
    var tStage = agTfaTier(name, rn, stage) || (stage !== "All" ? agTfaTier(name, rn, "All") : "");
    var tMt = (inf && inf.t) || "";
    return (ord[tStage] || 0) * 10 + (ord[tMt] || 0);
  }
  function agCmpDecks(name) {
    var out = [], seen = {};
    if (META && META.decks) {
      META.decks.forEach(function (d) {
        if (seen[d.id]) return;
        var hit = (d.req_aug && d.req_aug.n === name);
        if (!hit && d.augs) {
          ["프리즘", "골드", "실버"].forEach(function (r) {
            if ((d.augs[r] || []).indexOf(name) >= 0) hit = true;
          });
        }
        if (hit) { seen[d.id] = 1; out.push({ id: d.id, name: deckName(d), avg: d.avg, src: "meta" }); }
      });
    }
    // 설명에 특정 시너지가 직접 언급되면 그 시너지 상위 메타 덱 연결
    if (out.length < 3 && DB && DB.info && DB.info.a[name] && META && META.decks) {
      var desc = (DB.info.a[name].d || "") + " " + name;
      var matchedTraits = Object.keys(DB.info.t || {}).filter(function (t) { return t.length >= 2 && desc.indexOf(t) >= 0; });
      if (matchedTraits.length) {
        META.decks.slice().sort(function (a, b) { return a.avg - b.avg; }).forEach(function (d) {
          if (out.length >= 3 || seen[d.id]) return;
          var syn = synOf(d.board);
          if (syn.some(function (s) { return matchedTraits.indexOf(s.t) >= 0 && s.style !== "unique"; })) {
            seen[d.id] = 1; out.push({ id: d.id, name: deckName(d), avg: d.avg, src: "meta" });
          }
        });
      }
    }
    return out.sort(function (a, b) { return (a.avg || 9) - (b.avg || 9); }).slice(0, 3);
  }
  function agCmpToggle(name) {
    var idx = agCmpList.indexOf(name);
    if (idx >= 0) agCmpList.splice(idx, 1);
    else if (agCmpList.length < 3) agCmpList.push(name);
    else { toast("최대 3개까지 비교할 수 있어요"); return; }
    agCmpSave();
    agCmpRender();
    if (typeof agList === "function") agList();
  }
  function agCmpSugRender() {
    var sug = document.getElementById("ag-cmp-sug"), inp = document.getElementById("ag-cmp-q");
    if (!sug || !inp || !DB) return;
    var q = inp.value.trim();
    sug.innerHTML = "";
    if (!q) return;
    var hits = Object.keys(DB.info.a).filter(function (n) { return matches(n, q) && agCmpList.indexOf(n) < 0; })
      .sort(function (a, b) { return agCmpScore(b, agCmpStage) - agCmpScore(a, agCmpStage) || a.localeCompare(b, "ko"); })
      .slice(0, 8);
    hits.forEach(function (n) {
      var a = DB.info.a[n], b = el("button", "ag-sug-b"); b.type = "button";
      if (IDX && IDX.augments && IDX.augments[n]) { var im = img(IDX.augments[n], ""); im.dataset.r = a.r; b.appendChild(im); }
      b.appendChild(document.createTextNode(n));
      if (a.t) b.appendChild(el("span", "tierb " + a.t, a.t));
      b.addEventListener("click", function () {
        if (agCmpList.length >= 3) { toast("최대 3개까지 비교할 수 있어요"); return; }
        agCmpList.push(n); agCmpSave(); inp.value = ""; sug.innerHTML = ""; agCmpRender();
        if (typeof agList === "function") agList();
      });
      sug.appendChild(b);
    });
    if (!hits.length) sug.appendChild(el("span", "sub", "맞는 증강이 없어요"));
  }
  function agCmpRender() {
    var out = document.getElementById("ag-cmp-out"), clr = document.getElementById("ag-cmp-clr");
    if (!out || !DB) return;
    agCmpList = agCmpList.filter(function (n) { return !!DB.info.a[n]; });
    document.querySelectorAll("#ag-cmp-st button").forEach(function (b) { b.classList.toggle("on", b.dataset.s === agCmpStage); });
    if (clr) clr.hidden = !agCmpList.length;
    out.innerHTML = "";
    if (!agCmpList.length) {
      out.appendChild(el("p", "sub ag-cmp-hint", "실전에서 뜬 증강 3개를 검색하거나 아래 목록의 + 버튼을 눌러 시점별 등급과 어울리는 덱을 비교해 보세요"));
      return;
    }
    var scores = agCmpList.map(function (n) { return agCmpScore(n, agCmpStage); });
    var maxSc = Math.max.apply(null, scores);
    var bestCount = scores.filter(function (s) { return s === maxSc; }).length;
    var grid = el("div", "ag-cmp-grid n" + agCmpList.length);
    agCmpList.forEach(function (n, idx) {
      var a = DB.info.a[n], rn = agCmpRarNum(a.r), isBest = agCmpList.length >= 2 && maxSc > 0 && scores[idx] === maxSc && bestCount === 1;
      var card = el("div", "ag-cmp-card" + (isBest ? " best" : ""));
      var top = el("div", "ag-cmp-top");
      if (IDX && IDX.augments && IDX.augments[n]) { var im = img(IDX.augments[n], ""); im.dataset.r = a.r; top.appendChild(im); }
      var ttl = el("div", "ag-cmp-ttl");
      var nm = el("b", null, n); nm.dataset.aug = n; ttl.appendChild(nm);
      var sub = el("div", "ag-cmp-tags");
      var rb = el("span", "rar", a.r); rb.dataset.r = a.r; sub.appendChild(rb);
      if (isBest) sub.appendChild(el("span", "ag-best-b", "추천"));
      ttl.appendChild(sub); top.appendChild(ttl);
      var rm = el("button", "ag-cmp-rm", "×"); rm.type = "button"; rm.setAttribute("aria-label", n + " 빼기");
      rm.addEventListener("click", function () { agCmpToggle(n); });
      top.appendChild(rm); card.appendChild(top);

      var tiers = el("div", "ag-cmp-tiers");
      var tRows = [["MetaTFT", a.t || "-", false]];
      [["2-1", "2-1"], ["3-2", "3-2"], ["4-2", "4-2"], ["All", "전체"]].forEach(function (st) {
        tRows.push([st[1], agTfaTier(n, rn, st[0]) || "-", agCmpStage === st[0]]);
      });
      tRows.forEach(function (tr) {
        var cell = el("div", "ag-cmp-t" + (tr[2] ? " on" : ""));
        cell.appendChild(el("small", null, tr[0]));
        cell.appendChild(el("span", "tierb " + (tr[1] === "-" ? "X" : tr[1]), tr[1]));
        tiers.appendChild(cell);
      });
      card.appendChild(tiers);

      var dks = agCmpDecks(n);
      if (dks.length) {
        var dw = el("div", "ag-cmp-dks");
        dw.appendChild(el("small", null, "어울리는 덱"));
        var dlist = el("div", "ag-cmp-dlist");
        dks.forEach(function (d) {
          var db = el("button", "ag-cmp-dk", d.name + " " + d.avg.toFixed(2)); db.type = "button";
          db.addEventListener("click", function () { openDeck(d.id); });
          dlist.appendChild(db);
        });
        dw.appendChild(dlist); card.appendChild(dw);
      }
      card.appendChild(el("p", "ag-cmp-desc", a.d || ""));
      grid.appendChild(card);
    });
    out.appendChild(grid);
  }
  function buildAugCmp() {
    var inp = document.getElementById("ag-cmp-q"), clr = document.getElementById("ag-cmp-clr");
    if (!inp || buildAugCmp.done) { agCmpRender(); return; }
    buildAugCmp.done = true;
    inp.addEventListener("input", agCmpSugRender);
    if (clr) clr.addEventListener("click", function () { agCmpList = []; agCmpSave(); agCmpRender(); if (typeof agList === "function") agList(); });
    document.querySelectorAll("#ag-cmp-st button").forEach(function (b) {
      b.addEventListener("click", function () { agCmpStage = b.dataset.s; agCmpSave(); agCmpRender(); });
    });
    agCmpRender();
  }

  /* ---- 인터랙티브 리롤 확률 · 기대 골드 계산기 (#numbers) ---- */
  var RR_POOL = { 1: 30, 2: 25, 3: 18, 4: 10, 5: 9, 7: 9 };
  var RR_CHAMPS_S19 = { 1: 14, 2: 13, 3: 14, 4: 13, 5: 8, 7: 9 }; // 19시즌 기본 상점 기물 수 (7코는 해금 시 5코 풀 공유)
  var rrSt = { lv: 8, cost: 4, mine: 0, other: 0, gold: 40 };
  function rrCompute(lv, cost, outMine, outOther, gold) {
    var row = odds[Math.max(0, Math.min(odds.length - 1, lv - 3))];
    var tierP = (row[cost === 7 ? 5 : cost] || 0) / 100;
    var copies = RR_POOL[cost] || 10;
    var champs = RR_CHAMPS_S19[cost] || 13;
    var remMine = Math.max(0, copies - outMine);
    var remOther = Math.max(0, (champs - 1) * copies - outOther);
    if (tierP <= 0 || remMine <= 0) {
      return { p1: 0, p3: 0, p9: 0, shop1: 0, e1: null, e3: null, e9: null, g50_1: null, g80_1: null, g50_3: null, g80_3: null, remMine: remMine, tierPct: Math.round(tierP * 100) };
    }
    var pSlot = function (k) {
      var rm = remMine - k, tot = rm + remOther;
      return rm > 0 && tot > 0 ? tierP * (rm / tot) : 0;
    };
    var p0 = pSlot(0), shop1 = 1 - Math.pow(1 - p0, 5);
    var expGold = function (m) {
      if (m > remMine) return null;
      var slots = 0;
      for (var k = 0; k < m; k++) { var pk = pSlot(k); if (pk <= 0) return null; slots += 1 / pk; }
      return (slots / 5) * 2;
    };
    var maxRolls = Math.max(Math.floor(gold / 2), 150), targetRolls = Math.floor(gold / 2);
    var K = Math.min(9, remMine), dp = new Array(K + 1).fill(0); dp[0] = 1;
    var p1 = 0, p3 = 0, p9 = 0, g50_1 = null, g80_1 = null, g50_3 = null, g80_3 = null;
    for (var r = 1; r <= maxRolls; r++) {
      for (var s = 0; s < 5; s++) {
        var nxt = new Array(K + 1).fill(0);
        for (var k = 0; k < K; k++) {
          if (!dp[k]) continue;
          var pk = pSlot(k);
          nxt[k] += dp[k] * (1 - pk);
          nxt[k + 1] += dp[k] * pk;
        }
        nxt[K] += dp[K];
        dp = nxt;
      }
      var c1 = 1 - dp[0];
      var c3 = K >= 3 ? (1 - dp[0] - dp[1] - dp[2]) : 0;
      var c9 = K >= 9 ? dp[9] : 0;
      if (r === targetRolls) { p1 = c1; p3 = c3; p9 = c9; }
      if (g50_1 == null && c1 >= 0.5) g50_1 = r * 2;
      if (g80_1 == null && c1 >= 0.8) g80_1 = r * 2;
      if (g50_3 == null && c3 >= 0.5) g50_3 = r * 2;
      if (g80_3 == null && c3 >= 0.8) g80_3 = r * 2;
    }
    return {
      p1: p1, p3: p3, p9: p9, shop1: shop1,
      e1: expGold(1), e3: expGold(3), e9: expGold(9),
      g50_1: g50_1, g80_1: g80_1, g50_3: g50_3, g80_3: g80_3,
      remMine: remMine, tierPct: Math.round(tierP * 100)
    };
  }
  function buildRerollCalc() {
    var box = document.getElementById("rr-calc");
    if (!box) return;
    function render() {
      var maxMine = (RR_POOL[rrSt.cost] || 10) - 1;
      if (rrSt.mine > maxMine) rrSt.mine = maxMine;
      var maxOther = Math.min(80, ((RR_CHAMPS_S19[rrSt.cost] || 13) - 1) * (RR_POOL[rrSt.cost] || 10) - 1);
      if (rrSt.other > maxOther) rrSt.other = maxOther;
      var res = rrCompute(rrSt.lv, rrSt.cost, rrSt.mine, rrSt.other, rrSt.gold);
      box.innerHTML = "";
      var head = el("div", "rr-head");
      head.appendChild(el("h3", null, "리롤 확률 · 기대 골드 계산기"));
      head.appendChild(el("small", null, rrSt.lv + "렙 · " + rrSt.cost + "코 " + res.tierPct + "% · 남은 " + res.remMine + "장"));
      box.appendChild(head);

      var ctrls = el("div", "rr-ctrls");
      // 레벨 선택
      var r1 = el("div", "rr-row");
      r1.appendChild(el("span", "rr-lab", "레벨"));
      var lvs = el("div", "mt-chips rr-chips");
      [3, 4, 5, 6, 7, 8, 9, 10].forEach(function (lv) {
        var b = el("button", lv === rrSt.lv ? "on" : null, lv + "렙"); b.type = "button";
        b.addEventListener("click", function () { rrSt.lv = lv; render(); });
        lvs.appendChild(b);
      });
      r1.appendChild(lvs); ctrls.appendChild(r1);

      // 목표 코스트 선택
      var r2 = el("div", "rr-row");
      r2.appendChild(el("span", "rr-lab", "코스트"));
      var cs = el("div", "mt-chips rr-chips");
      [1, 2, 3, 4, 5, 7].forEach(function (c) {
        var b = el("button", (c === rrSt.cost ? "on " : "") + "rr-c" + c, c + "코"); b.type = "button";
        b.addEventListener("click", function () { rrSt.cost = c; render(); });
        cs.appendChild(b);
      });
      r2.appendChild(cs); ctrls.appendChild(r2);

      // 스텝퍼 3개: 보유 골드, 이미 빠진 내 기물, 같은 코스트 다른 기물 빠진 수
      var steps = el("div", "rr-steps");
      function mkStep(label, val, unit, min, max, delta, onChg) {
        var w = el("div", "rr-st");
        w.appendChild(el("span", "rr-slab", label));
        var ctl = el("div", "rr-sctl");
        var m = el("button", null, "−"); m.type = "button"; m.disabled = val <= min;
        m.addEventListener("click", function () { onChg(Math.max(min, val - delta)); render(); });
        var v = el("b", null, val + unit);
        var p = el("button", null, "+"); p.type = "button"; p.disabled = val >= max;
        p.addEventListener("click", function () { onChg(Math.min(max, val + delta)); render(); });
        ctl.appendChild(m); ctl.appendChild(v); ctl.appendChild(p);
        w.appendChild(ctl); return w;
      }
      steps.appendChild(mkStep("보유 골드 (" + Math.floor(rrSt.gold / 2) + "롤)", rrSt.gold, "G", 2, 120, 10, function (v) { rrSt.gold = v; }));
      steps.appendChild(mkStep("빠진 내 기물", rrSt.mine, "장", 0, maxMine, 1, function (v) { rrSt.mine = v; }));
      steps.appendChild(mkStep("같은 코 다른 기물", rrSt.other, "장", 0, maxOther, 5, function (v) { rrSt.other = v; }));
      ctrls.appendChild(steps);
      box.appendChild(ctrls);

      // 결과 KPI
      var kpi = el("div", "rr-kpi");
      var fmtPct = function (x) { return (x * 100 >= 99.5 ? "99.5+" : (x * 100).toFixed(1)) + "%"; };
      var fmtG = function (x) { return x == null ? "-" : Math.round(x) + "G"; };
      var cards = [
        ["1장 이상", fmtPct(res.p1), "기대 " + fmtG(res.e1), res.p1 >= 0.7 ? "good" : res.p1 < 0.35 ? "bad" : ""],
        ["3장 (2성)", fmtPct(res.p3), "기대 " + fmtG(res.e3), res.p3 >= 0.6 ? "good" : res.p3 < 0.25 ? "bad" : ""]
      ];
      if (rrSt.cost <= 3) cards.push(["9장 (3성)", fmtPct(res.p9), "기대 " + fmtG(res.e9), res.p9 >= 0.5 ? "good" : ""]);
      else cards.push(["1상점 적중", fmtPct(res.shop1), "5칸 기준", ""]);
      cards.forEach(function (x) {
        var c = el("div", "rr-k");
        c.appendChild(el("span", null, x[0]));
        c.appendChild(el("b", x[3] || null, x[1]));
        c.appendChild(el("small", null, x[2]));
        kpi.appendChild(c);
      });
      box.appendChild(kpi);

      var note = [];
      if (res.g50_1 != null) note.push("1장 50% " + res.g50_1 + "G · 80% " + (res.g80_1 != null ? res.g80_1 + "G" : "300G+"));
      if (res.g50_3 != null) note.push("3장 50% " + res.g50_3 + "G · 80% " + (res.g80_3 != null ? res.g80_3 + "G" : "300G+"));
      if (note.length) box.appendChild(el("p", "rr-mile", note.join(" / ")));
      box.appendChild(el("p", "sub rr-foot", "19시즌 기본 상점 기물 수 기준이에요. 7코스트는 해금 후 5코스트 상점 확률을 공유해요."));
    }
    render();
  }
