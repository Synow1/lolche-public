  function tfaSave() { try { localStorage.setItem(TFA_KEY, JSON.stringify({ v: tfaView, f: tfaF, r: tfaRar, s: tfaStage, t: tfaType })); } catch (e) {} }
  var TFA_FILTER = [["all", "전체"], ["reroll", "리롤"], ["8", "8렙"], ["9", "9렙"]];
  var TFA_RAR = [["3", "프리즘"], ["2", "골드"], ["1", "실버"]], TFA_STAGE = [["All", "전체 시점"], ["2-1", "2-1"], ["3-2", "3-2"], ["4-2", "4-2"]];
  var TFA_AUGT = { ECON: "경제", ITEMS: "아이템", COMBAT: "전투", EMBLEM: "상징" };
  // 증강 아이콘: 이름 그대로 없으면 '+' 뗀 기본 증강, 'I' 붙은 이름 순으로 (흡수하는 꽃+ -> 흡수하는 꽃)
  function augIcon(n) { return IDX.augments[n] || IDX.augments[n.replace(/\+*$/, "")] || IDX.augments[n + " I"] || null; }
  function tfaChips(box, opts, cur, cb, cls) {
    var w = el("div", "mt-chips" + (cls ? " " + cls : ""));
    opts.forEach(function (o) {
      var b = el("button", o[0] === cur ? "on" : null, o[1]); b.type = "button";
      if (cls === "tfa-rar") b.dataset.r = o[1];
      b.addEventListener("click", function () { cb(o[0]); });
      w.appendChild(b);
    });
    box.appendChild(w);
  }
  function tfaBy(slug) { return TFA.comps.filter(function (x) { return x.slug === slug; })[0]; }
  function tfaTabs(c) {  // 카드 안 탭 덱들 (사이트처럼 같은 메인 챔피언의 비슷한 덱, 자기 자신 포함)
    var card = c.var ? tfaBy(c.parent) || c : c;
    return (card.tabs || [card.slug]).map(tfaBy).filter(Boolean);
  }
  function tfaMatch(c) {
    if (tfaF === "reroll") return /리롤/.test(c.style);
    if (tfaF === "8") return /8렙|연패/.test(c.style);
    if (tfaF === "9") return /9렙/.test(c.style);
    return true;
  }
  function tfaTrend(c) {  // 상승·하락: 원 안의 화살표
    if (!c.trend) return null;
    var up = c.trend === "up", s = el("span", "tfa-trend " + c.trend);
    s.title = up ? "상승" : "하락"; s.setAttribute("role", "img"); s.setAttribute("aria-label", s.title);
    s.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/><path d="' + (up ? "M8 4 12 9H9.6v3H6.4V9H4z" : "M8 12 4 7h2.4V4h3.2v3H12z") + '" fill="#fff"/></svg>';
    return s;
  }
  function tfaIcon(b) {  // 3성 목표 유닛은 게임처럼 위에 별 세 개
    var i = uIcon(b.u); if (!i) return null;
    if (b.s < 3) return i;
    var w = el("span", "tfa-u3"); w.appendChild(el("b", null, "★★★")); w.appendChild(i); w.title = b.u + " 3성"; return w;
  }
  function tfaUnitIcons(list) {
    var s = el("div", "mt-strip tfa-strip");
    list.forEach(function (b) { var i = tfaIcon(b); if (i) s.appendChild(i); });
    return s;
  }
  function tfaOrder(c) { return starOrder(c.board, c.main); }
  // 줄에 보이는 유닛 순서: 메인 캐리 > 3성 목표 > 템 든 유닛 > 코스트 높은 순 (리롤 덱은 3성이 핵심이라 앞에)
  function starOrder(board, main) {
    return board.filter(function (b) { return !b.plant; }).slice().sort(function (a, b) {
      var x = (a.u === main ? 4 : 0) + ((a.s || 0) >= 3 ? 2 : 0) + ((a.i || []).length ? 1 : 0), y = (b.u === main ? 4 : 0) + ((b.s || 0) >= 3 ? 2 : 0) + ((b.i || []).length ? 1 : 0);
      return y - x || ((IDX.units[b.u] || {}).cost || 0) - ((IDX.units[a.u] || {}).cost || 0);
    });
  }
  var tfaCurSlug = null;
  function metaForTfa(c) {
    if (!c || !META || !META.decks || !META.decks.length) return null;
    if (TFA && TFA.set && "TFTSet" + TFA.set !== SET_ID) return null;
    var cu = {}; (c.board || []).forEach(function (b) { if (b && b.u && !b.plant) cu[b.u] = 1; });
    var cm = c.main || "", isX = c.tier === "X", best = null;
    META.decks.forEach(function (d) {
      var du = {}, ov = 0, sameM = false, topU = "", topS = -1;
      (d.board || []).forEach(function (b) {
        if (!b || !b.u || b.plant) return;
        du[b.u] = 1;
        if (cu[b.u]) ov++;
        var sc0 = ((b.i || []).length) * 10 + (b.s || 1);
        if (sc0 > topS) { topS = sc0; topU = b.u; }
        if (cm && b.u === cm && (b.i || []).length >= 2) sameM = true;
      });
      if (cm && topU === cm) sameM = true;
      if (!(ov >= 4 || (sameM && ov >= 3))) return;
      var hasReq = !!augReq(d);
      var sc = ov * 2 + (sameM ? 3 : 0) + (isX === hasReq ? 1.5 : 0);
      if (!best || sc > best.sc) best = { d: d, ov: ov, sc: sc };
    });
    return best;
  }
  function tfaForMeta(v) {
    if (!v || !TFA || !TFA.comps || !TFA.comps.length) return null;
    if (TFA.set && "TFTSet" + TFA.set !== SET_ID) return null;
    var bd = v.gboard || v.board || [], du = {}, dItems = {};
    bd.forEach(function (b) { if (b && b.u && !b.plant) { du[b.u] = 1; dItems[b.u] = (b.i || []).length; } });
    var mc = mainOf(v), dm = mc ? mc.u : "", areq = augReq(v.st), best = null;
    TFA.comps.forEach(function (c) {
      var ov = 0;
      (c.board || []).forEach(function (b) { if (b && b.u && !b.plant && du[b.u]) ov++; });
      var cm = c.main || "";
      var sameM = !!(cm && (cm === dm || (dItems[cm] || 0) >= 2));
      if (!(ov >= 5 || (sameM && ov >= 4))) return;
      var isX = c.tier === "X";
      var augHit = !!(areq && (c.mainAug === areq || (c.augs || []).indexOf(areq) >= 0 || (c.title || "").indexOf(areq) >= 0));
      var sc = ov * 2 + (sameM ? 3 : 0) + (augHit ? 4 : 0) + (!!areq === isX ? 1.2 : 0) + (!c.var ? 0.2 : 0);
      if (!best || sc > best.sc) best = { c: c, ov: ov, sc: sc };
    });
    return best;
  }
  function tfaOpenComp(slug) {
    var oldSlug = tfaCurSlug, det = document.getElementById("tfa-detail");
    var was = det && !det.hidden ? oldSlug : null;
    tfaView = "comps"; tfaF = "all"; tfaSave();
    tfaCurSlug = slug;
    if (current === "tfa") {
      if (TFA && IDX) { tfaRender(); tfaShow(slug); }
      return;
    }
    var prev = current, y = window.scrollY;
    navPush("tab", function () {
      if (was) tfaShow(was, true); else tfaBack();
      applyTab(prev, false, y);
    });
    showTab("tfa", false);
    if (TFA && IDX) { tfaRender(); tfaShow(slug, true); }
    if (!isWide()) window.scrollTo(0, 0);
    else {
      var selRow = document.querySelector("#tfa-out .mt-row.sel");
      if (selRow && selRow.scrollIntoView) selRow.scrollIntoView({ block: "nearest" });
    }
  }
  function tfaRender() {
    var box = document.getElementById("tfa-out"), tools = document.getElementById("tfa-tools"), secEl = document.getElementById("tfa");
    if (!box) return;
    if (secEl) secEl.classList.toggle("tfa-wide-single", tfaView !== "comps");
    document.querySelectorAll("#tfa-view button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === tfaView); });
    if (tfaView !== "comps") { document.getElementById("tfa-detail").hidden = true; document.getElementById("tfa-list").hidden = false; }
    if (!TFA || !IDX) { box.innerHTML = '<p class="empty">불러오는 중</p>'; return; }
    var hasV = { comps: true, augs: Object.keys(TFA.augs || {}).length > 0, items: Object.keys(TFA.items || {}).length > 0 };
    document.querySelectorAll("#tfa-view button").forEach(function (b) { b.hidden = !hasV[b.dataset.v]; });
    if (!hasV[tfaView]) {
      tfaView = "comps"; if (secEl) secEl.classList.remove("tfa-wide-single");
      document.querySelectorAll("#tfa-view button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === tfaView); });
    }
    var tv = document.getElementById("tfa-view"); if (tv) tv.hidden = !hasV.augs && !hasV.items;
    document.getElementById("tfa-note").textContent = updAt(TFA.updated) + " · " + ago(Date.parse(TFA.updated)) + " · 출처 TFT Academy";
    tools.innerHTML = ""; box.innerHTML = "";
    // 새 세트 첫날: TFT 아카데미가 새 세트 티어표를 아직 안 올렸으면 (세트 19 대비)
    if (TFA.set && "TFTSet" + TFA.set !== SET_ID) { box.innerHTML = '<p class="empty">새 시즌 티어표는 TFT 아카데미에 올라오면 바로 보여요</p>'; return; }  // 지난 세트 덱을 새 시즌처럼 보이지 않게
    if (!TFA.comps.length && tfaView === "comps") { box.innerHTML = '<p class="empty">새 시즌 덱 티어표는 TFT 아카데미에 올라오면 바로 보여요</p>'; return; }
    if (tfaView === "comps") {
      tfaChips(tools, TFA_FILTER, tfaF, function (v) { tfaF = v; tfaSave(); tfaRender(); });
      var list = TFA.comps.filter(function (c) { return !c.var && tfaTabs(c).some(tfaMatch); }), last = null;
      if (list.length && !TFA.comps.some(function (c) { return !c.var && c.tier === "S"; })) box.appendChild(el("p", "emb-sub tfa-sub", "지금 S 티어 덱은 없어요"));
      var curBasis = (document.getElementById("mt-basis") || {}).value || "emer";
      list.forEach(function (c) {
        if (c.tier !== last) {
          last = c.tier;
          var thd = el("h3", "tfa-th t-" + c.tier), cnt = list.filter(function (x) { return x.tier === c.tier; }).length;
          thd.appendChild(el("span", "tierb " + c.tier, c.tier)); thd.appendChild(document.createTextNode(c.tier === "X" ? "상황별" : c.tier + " 티어")); thd.appendChild(el("small", null, cnt + "개"));
          box.appendChild(thd);
          if (c.tier === "X") box.appendChild(el("p", "emb-sub tfa-sub", "상징·증강·유물처럼 조건이 맞을 때만 하는 덱이에요. 글자는 조건이 맞았을 때의 티어예요"));
        }
        var tl = c.tier === "X" ? c.sub || "X" : c.tier, r = el("button", "mt-row dk t-" + tl); r.type = "button";
        r.dataset.slug = c.slug;
        var mb = c.board.filter(function (x) { return x.u === c.main; })[0] || { u: c.main, s: 1, i: [] }, pt = dkPortrait(mb, null);
        r.appendChild(pt);
        var mid = el("div", "mt-mid");
        var meta = el("div", "dk-meta");
        var tb = el("span", "dk-tbadge t-" + tl + (c.tier === "X" ? " x" : ""), tl);
        meta.appendChild(tb);
        var sb = el("span", "dk-sub", c.style); if (c.diff) { sb.appendChild(document.createTextNode(" · ")); sb.appendChild(el("span", "dd" + ({ "쉬움": 1, "보통": 2, "어려움": 4, "조건부": 3 })[c.diff], c.diff)); }
        if (sb.textContent) meta.appendChild(sb);
        mid.appendChild(meta);
        var nm = el("div", "mt-name", c.title);
        var tr = tfaTrend(c); if (tr) nm.appendChild(tr);
        var tabs = tfaTabs(c);
        if (tabs.length > 1) { r.classList.add("tfa-stack"); nm.appendChild(el("span", "tfa-more", "비슷한 덱 " + (tabs.length - 1))); }
        mid.appendChild(nm);
        mid.appendChild(tfaUnitIcons(tfaOrder(c).filter(function (b) { return b.u !== c.main; })));
        r.appendChild(mid);
        var mh = metaForTfa(c);
        var ms = mh && (basisSt(mh.d, curBasis) || basisSt(mh.d, "all"));
        if (ms) {
          var num = el("div", "mt-num dk-kpi2 tfa-mstat");
          num.appendChild(dkGrad(el("b", "dk-avg", ms[0].toFixed(2)), dkAvgT(ms[0])));
          num.appendChild(dkGrad(el("span", "dk-top4", "승률 " + ms[2].toFixed(1) + "%"), dkWinT(ms[2])));
          r.appendChild(num);
        }
        r.addEventListener("click", function () { tfaShow(c.slug); });
        box.appendChild(r);
      });
      if (!list.length) {
        box.appendChild(el("p", "empty", "맞는 덱이 없어요"));
        if (isWide()) document.getElementById("tfa-detail").hidden = true;
      } else if (isWide()) {
        var hasCur = tfaCurSlug && list.some(function (x) { return x.slug === tfaCurSlug || (x.tabs || []).indexOf(tfaCurSlug) >= 0; });
        tfaShow(hasCur ? tfaCurSlug : list[0].slug, true);
      }
    } else if (tfaView === "augs") {
      tfaChips(tools, TFA_RAR, tfaRar, function (v) { tfaRar = v; tfaSave(); tfaRender(); }, "tfa-rar");
      tfaChips(tools, TFA_STAGE, tfaStage, function (v) { tfaStage = v; tfaSave(); tfaRender(); });
      var rn = ({ 1: "실버", 2: "골드", 3: "프리즘" })[tfaRar], t = (TFA.augs[tfaRar] || {})[tfaStage] || {};
      box.appendChild(el("p", "emb-sub tfa-sub", tfaStage === "All" ? "시점과 관계없이 매긴 등급이에요" : tfaStage + "에 고를 때 등급이에요"));
      ["S", "A", "B", "C"].forEach(function (k) {
        if (!(t[k] || []).length) return;
        var row = el("div", "ag-tier"); row.appendChild(el("span", "tierb " + k, k));
        var cards = el("div", "ag-cards");
        t[k].forEach(function (n) {
          var c = el("span", "ag-card"); c.dataset.aug = n; c.dataset.r = rn;
          var ic = augIcon(n); if (ic) { var im = img(ic, ""); im.dataset.r = rn; c.appendChild(im); }
          c.appendChild(document.createTextNode(n)); cards.appendChild(c);
        });
        row.appendChild(cards); box.appendChild(row);
      });
    } else {
      tfaChips(tools, Object.keys(TFA.items).map(function (k) { return [k, k]; }), tfaType, function (v) { tfaType = v; tfaSave(); tfaRender(); });
      var it = TFA.items[tfaType] || {};
      ["S", "A", "B", "C"].forEach(function (k) {
        if (!(it[k] || []).length) return;
        var row = el("div", "ag-tier"); row.appendChild(el("span", "tierb " + k, k));
        var cards = el("div", "ag-cards");
        it[k].forEach(function (n) {
          var c = el("span", "ag-card"); c.dataset.item = n;
          var ic = IDX.items[n]; if (ic) c.appendChild(img(ic.icon, ""));
          c.appendChild(document.createTextNode(n)); cards.appendChild(c);
        });
        row.appendChild(cards); box.appendChild(row);
      });
    }
  }
  function tfaUnitLine(b, main) {  // 유닛 + 템
    var row = el("div", "mt-build"), hd = el("div", "tfa-uh"); hd.appendChild(unitChip(b.u));
    if (b.s >= 3) hd.appendChild(el("span", "tfa-star", "★★★"));
    if (main) hd.appendChild(el("span", "tfa-tag", "메인"));
    row.appendChild(hd);
    var its = el("div", "its"); b.i.forEach(function (n) { its.appendChild(itemSpan(n)); }); row.appendChild(its);
    return row;
  }
  function tfaShow(slug, noScroll) {
    var c = TFA && TFA.comps.filter(function (x) { return x.slug === slug; })[0]; if (!c) return;
    tfaCurSlug = slug;
    var box = document.getElementById("tfa-detail"), wide = isWide();
    if (!wide && !noScroll && box.hidden) { var ly = window.scrollY; navPush("tfa", function () { tfaBack(); window.scrollTo(0, ly); }); }
    box.innerHTML = "";
    var toprow = el("div", "dk-toprow");
    var back = el("button", "back", "‹ 목록"); back.type = "button"; back.addEventListener("click", function () { navBack("tfa", tfaBack); }); toprow.appendChild(back);
    var xsw = el("button", "dk-xsw", "메타 덱 ⇄"); xsw.type = "button"; xsw.addEventListener("click", function () { goTab("meta"); }); toprow.appendChild(xsw);
    box.appendChild(toprow);
    var tabs = tfaTabs(c);
    if (tabs.length > 1) {  // 비슷한 덱 탭: 눌러도 기록을 새로 쌓지 않고 이 화면만 바꾼다
      var tb = el("div", "tfa-tabs"); tb.setAttribute("role", "tablist");
      tabs.forEach(function (x) {
        var xl = x.tier === "X" ? x.sub || "X" : x.tier, b = el("button", "tfa-tab" + (x.slug === c.slug ? " on" : "")); b.type = "button"; b.setAttribute("role", "tab");
        b.appendChild(el("span", "tierb " + xl, xl)); b.appendChild(el("span", null, x.title));
        b.addEventListener("click", function () { if (x.slug !== c.slug) { tfaShow(x.slug, true); if (isWide()) box.scrollTop = 0; else window.scrollTo(0, 0); } });
        tb.appendChild(b);
      });
      box.appendChild(tb);
      setTimeout(function () { var on = tb.querySelector(".on"); if (on && on.scrollIntoView) tb.scrollLeft = on.offsetLeft - 16; }, 0);
    }
    var tl = c.tier === "X" ? c.sub || "X" : c.tier, head = el("div", "dk-hero t-" + tl);
    if (IDX.units[c.main]) { var art = img(IDX.units[c.main].icon, ""); art.className = "art"; head.appendChild(art); }
    head.appendChild(dkPortrait({ u: c.main }, null));
    var t = el("div");
    t.appendChild(el("span", "tk", c.tier === "X" ? "상황별 " + tl + " 티어" : tl + " 티어"));
    var th = el("h3", null, c.title), tr = tfaTrend(c); if (tr) th.appendChild(tr);
    t.appendChild(th);
    t.appendChild(el("p", null, [c.style, c.diff, c.main ? c.main + " 캐리" : ""].filter(Boolean).join(" · ")));
    head.appendChild(t); box.appendChild(head);
    var mHit = metaForTfa(c);
    if (mHit) {
      var curB = (document.getElementById("mt-basis") || {}).value || "emer";
      var mbt = basisTier(mHit.d, curB), mbs = basisSt(mHit.d, curB) || basisSt(mHit.d, "all");
      var xl = el("button", "dk-xlink"); xl.type = "button";
      xl.appendChild(el("span", "dk-tbadge t-" + mbt, mbt === "X" ? "-" : mbt));
      var xm = el("div", "dk-xm");
      xm.appendChild(el("b", null, "메타 덱 통계 · " + deckName(mHit.d)));
      if (mbs) xm.appendChild(el("small", null, "평균 " + mbs[0].toFixed(2) + " · 순방 " + mbs[1] + "% · 승률 " + mbs[2].toFixed(1) + "%"));
      xl.appendChild(xm);
      xl.appendChild(el("span", "dk-xgo", "통계 보기 ›"));
      xl.addEventListener("click", function () { openDeck(mHit.d.id); });
      box.appendChild(xl);
    }
    if (DB && GUIDES) box.appendChild(synRow(synOf(c.board), true));
    var names = c.board.map(function (b) { return b.u; }), code = codeOfNames(names), acts = el("div", "tb-actions");
    if (code) acts.appendChild(codeButton(code, "팀 코드 복사", "codebtn big", codeMiss(names)));
    var tbb = el("button", "tb-clear", "빌더로"); tbb.type = "button"; tbb.addEventListener("click", function () { tbLoad(names); }); acts.appendChild(tbb);
    box.appendChild(acts);
    var cols = el("div", "mt-cols"), A = el("div"), B = el("div");
    // 배치: 메인 캐리 칸을 빛나게
    var hb = hexBoard(c.board);
    hb.querySelectorAll(".hxwrap").forEach(function (w) { if (w.dataset.unit === c.main) w.classList.add("tfa-carry"); });
    A.appendChild(hb);
    if (c.main) A.appendChild(el("p", "mt-legend", "빛나는 칸이 메인 캐리예요"));
    var carriers = tfaOrder(c).filter(function (b) { return b.i.length; });
    if (carriers.length) { var sb = sec("아이템"); carriers.forEach(function (b) { sb.appendChild(tfaUnitLine(b, b.u === c.main)); }); A.appendChild(sb); }
    if (c.mainAug || c.augs.length) {
      var sa = sec("추천 증강");
      if (c.augTypes.length) {
        var pr = el("div", "tfa-prio"); pr.appendChild(el("span", "gd-lab", "고를 순서"));
        c.augTypes.forEach(function (x, i) { if (i) pr.appendChild(el("i", null, "›")); pr.appendChild(el("span", "gd-chip", TFA_AUGT[x] || x)); });
        sa.appendChild(pr);
      }
      var aw = el("div", "gd-augs");
      [c.mainAug].concat(c.augs.filter(function (n) { return n !== c.mainAug; })).filter(Boolean).forEach(function (n) {
        var b = el("span", "gd-aug" + (n === c.mainAug ? " tfa-main" : "")); b.dataset.aug = n;
        var r = DB && DB.info.a[n] ? DB.info.a[n].r : "", ic = augIcon(n);
        if (ic) { var im = img(ic, ""); if (r) im.dataset.r = r; b.appendChild(im); }
        b.appendChild(document.createTextNode(n)); aw.appendChild(b);
      });
      sa.appendChild(aw);
      if (c.mainAug) sa.appendChild(el("p", "gd-note tfa-gap", "테두리 표시가 가장 추천하는 증강이에요"));
      if (c.augTip) sa.appendChild(el("p", "tfa-txt", c.augTip));
      A.appendChild(sa);
    }
    if (c.tips.length) {
      var st = sec("운영"), ul = el("div", "tfa-tips");
      c.tips.forEach(function (x) { var li = el("div", "tfa-tip"); li.appendChild(el("b", null, x[0])); li.appendChild(el("p", null, x[1])); ul.appendChild(li); });
      st.appendChild(ul); A.appendChild(st);
    }
    if (c.carousel.length) {
      var cs = sec("회전초밥 우선", "왼쪽부터"), cw = el("div", "gd-its");
      c.carousel.forEach(function (n, i) { if (i) cw.appendChild(el("i", null, "›")); cw.appendChild(itemSpan(n)); });
      cs.appendChild(cw); B.appendChild(cs);
    }
    if (c.early.length) {
      var se = sec("초반 덱"); se.appendChild(tfaUnitIcons(c.early));
      c.early.filter(function (b) { return b.i.length; }).forEach(function (b) { se.appendChild(tfaUnitLine(b)); });
      B.appendChild(se);
    }
    if (c.alt.length) { var sl = sec("다른 템 구성"); c.alt.forEach(function (b) { sl.appendChild(tfaUnitLine(b)); }); B.appendChild(sl); }
    if (c.cap.length) {
      // 사이트 이름 'Flex Units': 상황에 따라 바꿔 넣는 유닛 (API 필드 이름이 maxCap이라 '고점 교체'로 잘못 옮겼었음, 2026-11-14 사용자 지적)
      var sc = sec("유연한 교체", "상황에 맞게 바꿔 써요");
      c.cap.forEach(function (b) {
        var r = el("div", "gd-ihd"), slot = (b.from || []).filter(function (f) { return /렙 자리|자리 추가/.test(f); })[0];
        if (slot) { r.appendChild(el("span", "gd-chip", slot === "자리 추가" ? "자리가 늘면" : slot.replace(" 자리", "에"))); r.appendChild(unitChip(b.u)); r.appendChild(el("i", null, "추가")); }
        else { (b.from || []).forEach(function (f, i) { if (i) r.appendChild(el("i", null, "·")); r.appendChild(unitChip(f)); }); if ((b.from || []).length) r.appendChild(el("i", null, "대신")); r.appendChild(unitChip(b.u)); }
        sc.appendChild(r);
      });
      B.appendChild(sc);
    }
    if (c.updated) B.appendChild(el("p", "fnote", "출처 TFT Academy · " + updAt(c.updated)));
    cols.appendChild(A); cols.appendChild(B); box.appendChild(cols);
    document.getElementById("tfa-list").hidden = !wide; box.hidden = false;
    var rootSlug = c.var ? c.parent : c.slug;
    document.querySelectorAll("#tfa-out .mt-row").forEach(function (row) { row.classList.toggle("sel", row.dataset.slug === rootSlug); });
    if (!noScroll) { if (wide) box.scrollTop = 0; else window.scrollTo(0, 0); }
  }
  function tfaBack() {
    if (isWide()) { document.getElementById("tfa-list").hidden = false; return; }
    document.getElementById("tfa-detail").hidden = true;
    document.getElementById("tfa-list").hidden = false;
  }
  /* ---- 최근 1등: 롤체지지 recent-win-matches (한국 그마·챌이 방금 1등한 보드 ~75판) ---- */
  var WIN = null, WIN_AT = 0;
