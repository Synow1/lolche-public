  function embStat(n, g) { if (g === "all" && ITEMS && ITEMS.tiers.emer) g = "emer"; var t = ITEMS && ITEMS.tiers[g] && ITEMS.tiers[g].items[n]; return t || null; }
  function embBad(n) { var a = embStat(n, "all"); return a && (a[4] === "D" || a[1] >= 4.5); }
  document.getElementById("mt-emb").addEventListener("click", function () { goTab("emb"); });
  document.getElementById("mt-parts").addEventListener("click", function () { goTab("parts"); });
  document.querySelectorAll("#pt-basis button").forEach(function (b) { b.addEventListener("click", function () { ptBasis = b.dataset.b; ptSave(); ptRender(); }); });
  function embInit() {
    if (!ITEMS || !META || embInit.done) return;
    embInit.done = true;
    var names = Object.keys(ITEMS.tiers.all.items).filter(function (n) { return / 상징$/.test(n); })
      .sort(function (a, b) { return embStat(a, "all")[1] - embStat(b, "all")[1]; });
    var box = document.getElementById("emb-pick");
    names.forEach(function (n) {
      var b = el("button", embBad(n) ? "bad" : null); b.type = "button"; b.dataset.e = n;
      var ic = IDX.items[n]; if (ic) b.appendChild(img(ic.icon, ""));
      b.appendChild(document.createTextNode(n.replace(/ 상징$/, "")));
      b.appendChild(el("i", null, embStat(n, "all")[4]));
      b.classList.toggle("on", embSel.indexOf(n) >= 0);
      b.addEventListener("click", function () {
        var k = embSel.indexOf(n); if (k >= 0) embSel.splice(k, 1); else embSel.push(n);
        b.classList.toggle("on", k < 0);
        try { localStorage.setItem(EMB_KEY, JSON.stringify(embSel)); } catch (e) {}
        embRender();
      });
      box.appendChild(b);
    });
    embSel = embSel.filter(function (n) { return names.indexOf(n) >= 0; });
    embRender();
  }
  function openDeck(id) {
    if (current === "meta") { metaShow(id); return; }
    var prev = current, y = window.scrollY, was = !document.getElementById("mt-detail").hidden ? mtCurId : null;
    navPush("tab", function () {
      if (was) metaShow(was, true); else metaBack();
      showTab(prev, false); window.scrollTo(0, y);
    });
    showTab("meta", false); metaShow(id, true); window.scrollTo(0, 0);
  }
  function embRender() {
    var out = document.getElementById("emb-out"); out.innerHTML = "";
    if (!embSel.length) { out.appendChild(el("p", "empty", "위에서 상징을 골라 주세요")); return; }
    // 1) 상징 카드: 성적·조합식·팁·넣는 챔피언
    embSel.forEach(function (n) {
      var c = el("div", "emb-card"), h = el("div", "emb-head"), ic = IDX.items[n];
      if (ic) h.appendChild(img(ic.icon, ""));
      var t = el("div"); t.appendChild(el("h3", null, n));
      var a = embStat(n, "all"), lo = embStat(n, "low"), p = el("p");
      p.appendChild(document.createTextNode("단 판 평균 에메+ ")); p.appendChild(el("b", null, a[1].toFixed(2)));
      if (lo) { p.appendChild(document.createTextNode(" · 플래 미만 ")); p.appendChild(el("b", null, lo[1].toFixed(2))); }
      p.appendChild(document.createTextNode(" · " + a[4] + "등급"));
      t.appendChild(p); h.appendChild(t);
      if (ic && ic.recipe && ic.recipe.length) {
        var r = el("span", "emb-rec");
        ic.recipe.forEach(function (x, i) { if (i) r.appendChild(document.createTextNode("+")); var it = IDX.items[x]; if (it) { var im = img(it.icon, x); im.title = x; r.appendChild(im); } });
        h.appendChild(r);
      }
      c.appendChild(h);
      if (embBad(n)) c.appendChild(el("p", "emb-tip warn", "효율이 낮은 상징이에요. 재조합기가 있으면 바꾸세요"));
      if (EMB_TIP[n]) c.appendChild(el("p", "emb-tip", EMB_TIP[n]));
      var hs = (ITEMS.units[n] || []).slice(0, 6);
      if (hs.length) {
        var hd = el("div", "emb-hold");
        hs.forEach(function (x) {
          var sp = el("span"), u = IDX.units[x[0]]; if (u) sp.appendChild(img(u.icon, ""));
          sp.appendChild(document.createTextNode(x[0])); sp.appendChild(el("b", null, x[2].toFixed(2))); sp.dataset.unit = x[0]; hd.appendChild(sp);
        });
        c.appendChild(sec("많이 넣는 챔피언", "다이아+ · 단 판 평균"));
        c.appendChild(hd);
      }
      out.appendChild(c);
    });
    // 2) 갈 덱: 롤체지지 [상징] 덱 + MetaTFT 덱(그 상징을 3% 넘게 쓰고 400판 넘는 덱), 고른 상징을 많이 쓰는 덱부터
    var rows = [];
    (GUIDES ? GUIDES.decks : []).forEach(function (g, i) {
      var use = [];
      embSel.forEach(function (n) { g.board.forEach(function (b) { if (b.i && b.i.indexOf(n) >= 0) use.push([n, b.u]); }); });
      if (!use.length) return;
      var st = statOf(g.cluster);
      rows.push({ id: "g" + i, cluster: g.cluster, name: g.name, tier: st ? st.tier : "-", board: g.board, guide: true, use: use.map(function (x) { var e = st && st.emb && st.emb[x[0]]; return [x[0], x[1], e ? e[1] : null, e ? e[2] : null]; }), score: st ? ((st.emb || {})[use[0][0]] || [0, st.avg])[1] : 4.5 });
    });
    META.decks.forEach(function (d) {
      var use = [];
      embSel.forEach(function (n) { var e = d.emb && d.emb[n]; if (e && e[0] >= 400 && e[2] >= 3) use.push([n, e[3][0] ? e[3][0][0] : "", e[1], e[2], e[3]]); });
      if (!use.length) return;
      if (rows.some(function (r) { return r.guide && r.cluster === d.id; })) return;  // 롤체지지 덱과 같은 덱이면 한 번만
      rows.push({ id: d.id, name: d.name, tier: d.tier, board: d.board, guide: false, use: use, score: use.reduce(function (s, x) { return s + x[2]; }, 0) / use.length });
    });
    rows.sort(function (a, b) { return (b.use.length - a.use.length) || ((b.guide ? 1 : 0) - (a.guide ? 1 : 0)) || (a.score - b.score); });
    // MetaTFT 덱은 상징 단 판 평균이 4.6 안쪽만 (나머지는 그 상징을 넣어도 약한 덱)
    var ms = rows.filter(function (r) { return !r.guide && r.score <= 4.6; }).slice(0, 8);
    var list = rows.filter(function (r) { return r.guide || ms.indexOf(r) >= 0; });
    var dsec = sec("갈 덱", "상징을 단 판의 평균 등수");
    var box = el("div", "emb-decks");
    if (!list.length) box.appendChild(el("p", "empty", "이 상징을 주로 쓰는 덱이 없어요. 재조합기로 바꾸거나 메인 딜러·탱커 시너지를 올리는 데 쓰세요."));
    list.forEach(function (r) {
      var b = el("button", "mt-row"); b.type = "button";
      b.appendChild(el("span", "tierb " + r.tier, r.tier));
      var mid = el("div", "mt-mid"), nm = el("div", "mt-name", r.name);
      if (r.guide) nm.appendChild(el("span", "emb-gl", "롤체지지"));
      mid.appendChild(nm);
      var us = el("div", "emb-use");
      r.use.forEach(function (x) {
        var sp = el("span"), ic = IDX.items[x[0]]; if (ic) sp.appendChild(img(ic.icon, ""));
        var who = x[4] ? x[4].filter(function (h) { return h[1] >= 15; }).map(function (h) { return h[0]; }).slice(0, 2).join("·") : x[1];
        sp.appendChild(document.createTextNode("→ " + (who || x[1])));
        if (x[3] != null) sp.appendChild(el("small", null, "덱의 " + Math.round(x[3]) + "%"));
        us.appendChild(sp);
      });
      mid.appendChild(us);
      mid.appendChild(strip(carriesFirst(r.board).map(function (u) { return u.u; })));
      b.appendChild(mid);
      var e0 = r.use.filter(function (x) { return x[2] != null; })[0];
      var num = el("div", "mt-num", e0 ? r.score.toFixed(2) : "-");
      var st = statOf(r.guide ? GUIDES.decks[+r.id.slice(1)].cluster : r.id);
      if (st) num.appendChild(el("small", null, "덱 " + st.avg.toFixed(2)));
      b.appendChild(num);
      b.addEventListener("click", function () { openDeck(r.id); });
      box.appendChild(b);
    });
    dsec.appendChild(box); out.appendChild(dsec);
  }

  function buildGuides(data) {
    GUIDES = data; setPatch();
    if (!metaReady) return;
    metaList();
    if (metaPending && deckView(metaPending)) { metaShow(metaPending, true); metaPending = null; }
  }
  var VER = null;
  function buildVersion(v) {
    VER = v; setPatch();
    var box = document.getElementById("vlog-list"); box.innerHTML = "";
    v.notes.forEach(function (n) {
      var d = el("div", "vl"); var h = el("div", "vl-h"); h.appendChild(el("b", null, "v" + n.v)); h.appendChild(el("span", null, n.date.slice(5).replace("-", "/"))); d.appendChild(h);
      var ul = el("ul"); n.items.forEach(function (t) { ul.appendChild(el("li", null, t)); }); d.appendChild(ul); box.appendChild(d);
    });
    document.getElementById("vlog").hidden = false;
  }
  function setPatch() {
    var cands = [META && META.patch, DB && DB.patch, GUIDES && GUIDES.patch].map(function (s) {
      var m = s && /v?(\d+)\.(\d+)([a-z]?)/i.exec(String(s));
      return m ? { txt: m[1] + "." + m[2] + (m[3] || "").toLowerCase(), a: +m[1], b: +m[2], c: (m[3] || "").toLowerCase() } : null;
    }).filter(Boolean).sort(function (x, y) { return (y.a - x.a) || (y.b - x.b) || (y.c > x.c ? 1 : y.c < x.c ? -1 : 0); });
    var p = cands.length ? cands[0].txt : "";
    var b = document.getElementById("patch-badge"); if (p) { b.textContent = p; b.hidden = false; }
    var about = document.getElementById("about");
    var ver = VER ? "<b>롤체 노트 v" + VER.version + "</b>" + (APP && window.LolcheApp.built ? " · 빌드 " + window.LolcheApp.built() : "") + "<br>" : "";
    if (about) about.innerHTML = ver + "<b>데이터</b> MetaTFT · 롤체지지 · tactics.tools · TFT Academy · Riot<br>" + (p ? "패치 " + p + " · " : "") + (META ? "덱 통계 " + updAt(META.updated) : "") + "<br>아이콘은 Riot Games 소유";
  }

  /* ---- 팀 빌더: 유닛을 넣으면 시너지·비슷한 메타 덱·팀 코드 ---- */
  var TB_KEY = "tft-guide-builder", tbUnits = [];
  try { tbUnits = JSON.parse(localStorage.getItem(TB_KEY) || "[]") || []; } catch (e) {}
  function tbSave() { try { localStorage.setItem(TB_KEY, JSON.stringify(tbUnits)); } catch (e) {} }
  function traitBreaks(t) { var inf = DB.info.t[t]; return inf ? inf.e.map(function (e) { return e[0]; }) : []; }
  function traitCounts(names) {
    var c = {};
    names.forEach(function (n) { var u = DB.units[n]; if (u) u.traits.forEach(function (t) { c[t] = (c[t] || 0) + 1; }); traitBonus(n, c); });
    return Object.keys(c).map(function (t) {
      var br = traitBreaks(t), lv = br.filter(function (b) { return c[t] >= b; }).length;
      return { t: t, n: c[t], br: br, lv: lv };
    }).sort(function (a, b) { return (b.lv > 0) - (a.lv > 0) || b.lv - a.lv || b.n - a.n; });
  }
  function traitChipFull(x) {
    var max = x.br.length || 1;
    var cls = x.lv === 0 ? "" : x.br.length === 1 ? "lv3" : x.lv === max ? (max >= 4 ? "lv4" : "lv3") : x.lv === 1 ? "lv1" : "lv2";
    var c = el("span", "trc " + cls); c.dataset.trait = x.t;
    if (IDX.traits[x.t]) c.appendChild(img(IDX.traits[x.t], ""));
    c.appendChild(el("b", null, x.n));
    c.appendChild(document.createTextNode(" " + x.t + (x.br.length > 1 ? " " + x.br.join("/") : "")));
    return c;
  }
  function tbRender() {
    if (!DB) return;
    var board = document.getElementById("tb-board");
    board.innerHTML = "";
    for (var i = 0; i < 10; i++) {
      var n = tbUnits[i], b = el("button", "tb-slot" + (n ? " full" : "")); b.type = "button";
      if (n) {
        var u = IDX.units[n]; b.dataset.c = u ? u.cost : 1; b.setAttribute("aria-label", n + " 빼기");
        if (u) b.appendChild(img(u.icon, n));
        b.appendChild(el("span", "x", "✕"));
        (function (name) { b.addEventListener("click", function () { tbUnits = tbUnits.filter(function (x) { return x !== name; }); tbSave(); tbRender(); }); })(n);
      } else b.setAttribute("aria-label", "빈 칸");
      board.appendChild(b);
    }
    var tr = document.getElementById("tb-traits"); tr.innerHTML = "";
    traitCounts(tbUnits).forEach(function (x) { tr.appendChild(traitChipFull(x)); });
    if (!tbUnits.length) tr.appendChild(el("span", "sub", "유닛을 넣으면 시너지가 표시돼요"));
    document.getElementById("tb-copy").disabled = !tbUnits.length;
    tbPos();
    tbNear();
    document.querySelectorAll(".tb-unit").forEach(function (b) { b.classList.toggle("in", tbUnits.indexOf(b.dataset.name) >= 0); });
  }
  // 추천 배치: 롤체지지 자리 통계(team-builder-cell-stats, 챔피언별로 어느 칸에 많이 서는지)로 칸을 나눠 준다
  var CELLS = null, CELLS_KEY = "tft-guide-cells";
  function cellsLoad() {
    if (CELLS) return Promise.resolve(CELLS);
    try { var c = JSON.parse(localStorage.getItem(CELLS_KEY) || "null"); if (c && Date.now() - c.at < 864e5 && c.season === dakSeason()) { CELLS = c.d; return Promise.resolve(CELLS); } } catch (e) {}
    if (!APP) return Promise.reject(new Error("앱 전용"));
    return dakGet("team-builder-cell-stats?hl=ko&season=" + dakSeason() + "&tier=1").then(function (r) {
      var d = {};
      ((r.teamBuilderCellStat || {}).championCellStats || []).forEach(function (x) {
        var nm = DB.names.u[x.key]; nm = nm ? nm[0] : null; if (!nm || d[nm]) return;
        d[nm] = x.cellStats.map(function (c) { return [+c[0].replace("cell_", ""), c[1] / x.count]; });
      });
      CELLS = d;
      try { localStorage.setItem(CELLS_KEY, JSON.stringify({ at: Date.now(), season: dakSeason(), d: d })); } catch (e) {}
      return d;
    });
  }
  function tbPos() {
    var box = document.getElementById("tb-pos"); if (!box) return;
    box.innerHTML = "";
    if (tbUnits.length < 2) return;
    cellsLoad().then(function (C) {
      box.innerHTML = "";
      var cand = [];
      tbUnits.forEach(function (n) { (C[n] || []).forEach(function (c) { cand.push([n, c[0], c[1]]); }); });
      cand.sort(function (a, b) { return b[2] - a[2]; });
      var taken = {}, pos = {};
      cand.forEach(function (x) { if (pos[x[0]] || taken[x[1]]) return; pos[x[0]] = x[1]; taken[x[1]] = 1; });
      var board = tbUnits.map(function (n) {
        var c = pos[n]; if (!c) { for (var k = 1; k <= 28; k++) if (!taken[k]) { c = k; taken[k] = 1; break; } }
        var m = c - 1;  // 1~7 뒷줄 … 22~28 앞줄
        return { u: n, c: (IDX.units[n] || {}).cost || 1, s: 1, pos: [3 - Math.floor(m / 7), m % 7], i: [] };
      });
      var sc = sec("추천 배치", "가장 많이 쓰는 자리 · 출처 롤체지지");
      sc.appendChild(hexBoard(board));
      box.appendChild(sc);
    }).catch(function () {});
  }
  function tbNear() {
    var box = document.getElementById("tb-near"); box.innerHTML = "";
    if (!META || tbUnits.length < 2) return;
    var scored = META.decks.map(function (d) {
      var names = d.board.map(function (u) { return u.u; });
      Object.keys(d.levels).forEach(function (k) { d.levels[k].forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); }); });
      var hit = tbUnits.filter(function (n) { return names.indexOf(n) >= 0; }).length;
      return [hit - d.avg / 10, hit, d];
    }).filter(function (x) { return x[1] >= 2; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 3);
    if (!scored.length) return;
    var wrap = el("div", "tb-near"); wrap.appendChild(el("h4", null, "비슷한 메타 덱"));
    scored.forEach(function (x) {
      var d = x[2], r = el("button", "mt-row" + (d.mine ? " mine" : "")); r.type = "button";
      r.appendChild(el("span", "tierb " + d.tier, d.tier));
      var nm = el("div", "mt-name", d.name); nm.appendChild(el("small", null, x[1] + "개 겹침 · " + styleKo(d.style))); r.appendChild(nm);
      var num = el("div", "mt-num", d.avg.toFixed(2)); num.appendChild(el("small", null, "승률 " + Math.round(d.win) + "%")); r.appendChild(num);
      r.appendChild(strip(d.board.map(function (u) { return u.u; })));
      r.addEventListener("click", function () { openDeck(d.id); });
      wrap.appendChild(r);
    });
    box.appendChild(wrap);
  }
  function tbPool() {
    var box = document.getElementById("tb-pool"), q = document.getElementById("tb-q").value.trim();
    box.innerHTML = "";
    for (var c = 1; c <= 5; c++) {
      var names = Object.keys(DB.units).filter(function (n) {
        var u = DB.units[n];
        return u.cost === c && (!q || matches(n, q) || u.traits.some(function (t) { return matches(t, q); }));
      }).sort(function (a, b) { return a.localeCompare(b, "ko"); });
      if (!names.length) continue;
      var row = el("div", "tb-row"); row.appendChild(el("b", null, c + "코"));
      names.forEach(function (n) {
        var b = el("button", "tb-unit"); b.type = "button"; b.dataset.name = n; b.dataset.c = c;
        var f = el("span", "face"), ic = IDX.units[n]; if (ic) f.appendChild(img(ic.icon, ""));
        b.appendChild(f); b.appendChild(el("span", "nm", n)); b.setAttribute("aria-label", n + " 넣기");
        var timer = null, long = false;
        b.addEventListener("pointerdown", function () { long = false; timer = setTimeout(function () { long = true; openSheet("u", n); }, 450); });
        ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { b.addEventListener(ev, function () { clearTimeout(timer); }); });
        b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
        b.addEventListener("click", function () {
          if (long) return;
          var i = tbUnits.indexOf(n);
          if (i >= 0) tbUnits.splice(i, 1); else if (tbUnits.length < 10) tbUnits.push(n); else { toast("10칸이 꽉 찼어요"); return; }
          tbSave(); tbRender();
        });
        row.appendChild(b);
      });
      box.appendChild(row);
    }
    tbRender();
  }
  function buildBuilder() {
    document.getElementById("tb-q").addEventListener("input", tbPool);
    document.getElementById("tb-clear").addEventListener("click", function () { tbUnits = []; tbSave(); tbRender(); });
    document.getElementById("tb-copy").addEventListener("click", function () {
      var code = codeOfNames(tbUnits); if (!code) return;
      copyText(code).then(function () { toast("팀 코드를 복사했어요. 게임의 팀 플래너에 붙여넣어 주세요"); })
        .catch(function () { toast("복사하지 못했어요. 아래 코드를 길게 눌러 복사해 주세요", code); });
    });
    tbPool();
  }
  function tbLoad(names) { tbUnits = names.filter(function (n) { return DB.units[n]; }).slice(0, 10); tbSave(); tbRender(); goTab("builder"); }

  /* ---- 증강 티어 목록: 증강 고를 때 이름 쳐서 바로 찾기 ---- */
  var agRar = "";
  function agList() {
    var box = document.getElementById("ag-list"), q = document.getElementById("ag-q").value.trim();
    box.innerHTML = "";
    var au = document.getElementById("ag-upd-t"), dat = Date.parse(DB.updated);
    if (au && dat) au.textContent = "증강 티어 " + updAt(DB.updated) + " · " + ago(dat) + " · MetaTFT";
    var groups = {};
    Object.keys(DB.info.a).forEach(function (n) {
      var a = DB.info.a[n];
      if (agRar && a.r !== agRar) return;
      if (q && !matches(n, q)) return;
      (groups[a.t || "X"] = groups[a.t || "X"] || []).push(n);
    });
    ["S", "A", "B", "C", "D", "X"].forEach(function (t) {
      var list = groups[t]; if (!list) return;
      var row = el("div", "ag-tier");
      row.appendChild(el("span", "tierb " + t, t === "X" ? "?" : t));
      var subs = el("div", "ag-subs");
      ["프리즘", "골드", "실버"].forEach(function (r) {  // 같은 티어 안에서 등급별 줄
        var part = list.filter(function (n) { return DB.info.a[n].r === r; }).sort(function (a, b) { return a.localeCompare(b, "ko"); });
        if (!part.length) return;
        var sub = el("div", "ag-sub");
        var lab = el("span", "rar", r); lab.dataset.r = r; sub.appendChild(lab);
        var cards = el("div", "ag-cards");
        part.forEach(function (n) {
          var c = el("span", "ag-card"); c.dataset.aug = n; c.dataset.r = r;
          if (IDX.augments[n]) { var im = img(IDX.augments[n], ""); im.dataset.r = r; c.appendChild(im); }
          c.appendChild(document.createTextNode(n));
          cards.appendChild(c);
        });
        sub.appendChild(cards); subs.appendChild(sub);
      });
      row.appendChild(subs); box.appendChild(row);
    });
    if (!box.children.length) box.appendChild(el("p", "sub", "맞는 증강이 없어요"));
  }
  function buildAugList() {
    document.getElementById("ag-q").addEventListener("input", agList);
    document.querySelectorAll("#ag-rar button").forEach(function (b) {
      b.addEventListener("click", function () {
        agRar = b.dataset.r;
        document.querySelectorAll("#ag-rar button").forEach(function (x) { x.classList.toggle("on", x === b); });
        agList();
      });
    });
    agList();
  }

  /* ---- 시너지 목록 ---- */
  function buildTraitList() {
    var box = document.getElementById("tr-list"); box.innerHTML = "";
    [["origin", "계열"], ["class", "직업"], ["unique", "고유"]].forEach(function (g) {
      var names = Object.keys(DB.info.t).filter(function (n) { return DB.info.t[n].type === g[0] && DB.info.t[n].u.length; })
        .sort(function (a, b) { return a.localeCompare(b, "ko"); });
      if (!names.length) return;
      var grp = el("div", "tr-group"); grp.appendChild(el("h3", null, g[1] + " " + names.length));
      names.forEach(function (n) {
        var inf = DB.info.t[n], row = el("div", "tr-row");
        if (IDX.traits[n]) { var im = img(IDX.traits[n], n); im.dataset.trait = n; row.appendChild(im); } else row.appendChild(el("span"));
        var t1 = el("div", "t1"); t1.dataset.trait = n;
        t1.appendChild(el("b", null, n));
        t1.appendChild(el("span", null, inf.e.map(function (e) { return e[0]; }).join(" / ")));
        row.appendChild(t1);
        row.appendChild(strip(inf.u.map(function (u) { return u[0]; })));
        grp.appendChild(row);
      });
      box.appendChild(grp);
    });
  }

  /* ---- 랭킹·전적 검색: 앱에서는 MetaTFT 실시간, claude.ai에서는 rank.json 스냅샷 ---- */
  var MT = "https://api.metatft.com/";
  var TIER_KO = { IRON: "아이언", BRONZE: "브론즈", SILVER: "실버", GOLD: "골드", PLATINUM: "플래티넘", EMERALD: "에메랄드", DIAMOND: "다이아", MASTER: "마스터", GRANDMASTER: "그마", CHALLENGER: "챌린저" };
  var TIER_COLOR = { IRON: "#7b6f6a", BRONZE: "#a8724c", SILVER: "#9aa6b2", GOLD: "#d9a63a", PLATINUM: "#3fa7a0", EMERALD: "#2f9e5b", DIAMOND: "#5b8fe0", MASTER: "#b05ed3", GRANDMASTER: "#d1495b", CHALLENGER: "#e7b84a" };
  var TIER_BANDS = [[0, "IRON"], [400, "BRONZE"], [800, "SILVER"], [1200, "GOLD"], [1600, "PLATINUM"], [2000, "EMERALD"], [2400, "DIAMOND"], [2800, "MASTER"]];
  var DIV = { I: 1, II: 2, III: 3, IV: 4 };
  var RK_TOPS = {}, RK_FAV = "tft-guide-fav", RK_FAVT = "tft-guide-favtier", rkPage = 0, rkRows = [], rkCut = null;
