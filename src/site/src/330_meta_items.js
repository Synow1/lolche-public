  function winLoad(force) {
    if (!APP) return Promise.reject(new Error("앱에서만 돼요"));
    if (WIN && !force && Date.now() - WIN_AT < 120000) return Promise.resolve(WIN);
    return dakGet("recent-win-matches?shard=kr").then(function (r) {
      var lg = {}; (r.summonerLeagues || []).forEach(function (x) { if (x.queueId === 1100) lg[x.puuid] = x; });
      var sm = {}; (r.summoners || []).forEach(function (x) { sm[x.puuid] = x; });
      WIN = (r.matches || []).map(function (m) {
        var p = m.participants[0]; if (!p) return null;
        var l = lg[p.puuid] || {}, w = sm[p.puuid];
        var raw = (p.units || []).map(function (u) { return { character_id: u.character_id, tier: u.tier, itemNames: u.items || [] }; });
        return { t: m.gameCreatedAt, tier: l.tier || "", rank: l.rank || "", who: w ? w.gameName + "#" + w.tagLine : "", level: p.level, traits: p.traits, raw: raw, board: mtBoard(raw) };
      }).filter(Boolean).sort(function (a, b) { return b.t - a.t; });
      WIN_AT = Date.now();
      return WIN;
    });
  }

  function metaList() {
    var box = document.getElementById("mt-rows");
    metaUpdLabel();
    var q = document.getElementById("mt-q").value.trim();
    var basis = document.getElementById("mt-basis").value;
    box.innerHTML = "";
    var list = allViews().filter(function (v) {
      if (!v) return false;
      var d = v.st;
      if (mtFilter === "mine" && !(d && d.mine)) return false;
      if (mtFilter === "reroll" && !isReroll(d)) return false;
      if ((mtFilter === "8" || mtFilter === "9") && (!d || isReroll(d) || (mtFilter === "8" ? d.level !== 8 : d.level < 9))) return false;
      if (q && !v.board.some(function (b) { return matches(b.u, q); }) && !matches(v.name, q)) return false;
      return true;
    }).sort(function (a, b) {  // 그 기준에 판수가 모자란 덱은 맨 아래
      var x = basisSt(a.st, basis), y = basisSt(b.st, basis);
      if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1);
      return mtSort === "win" ? y[2] - x[2] : mtSort === "top4" ? y[1] - x[1] : mtSort === "pick" ? (y[3] || 0) - (x[3] || 0) : x[0] - y[0];
    });
    list.forEach(function (v) {
      var d = v.st, r = el("button", "mt-row" + (d && d.mine ? " mine" : "")); r.type = "button";
      var bt = basisTier(d, basis), bs = basisSt(d, basis), mc = mainOf(v);
      r.classList.add("dk", "t-" + bt);
      r.appendChild(dkPortrait(mc, null));
      var mid = el("div", "mt-mid");
      var meta = el("div", "dk-meta");
      meta.appendChild(el("span", "dk-tbadge t-" + bt, bt === "X" ? "-" : bt));
      var mtxt = el("span", "dk-sub");
      if (d && d.style) mtxt.appendChild(document.createTextNode(styleKo(d.style)));
      if (d && d.diff) { if (mtxt.textContent) mtxt.appendChild(document.createTextNode(" · ")); mtxt.appendChild(el("span", "dd" + d.diff, DIFF[d.diff])); }
      var pl = perLobby(d, basis);
      if (pl != null) { if (mtxt.textContent) mtxt.appendChild(document.createTextNode(" · ")); mtxt.appendChild(el("span", "dk-pl", "선택률 " + pl)); }
      if (mtxt.textContent) meta.appendChild(mtxt);
      mid.appendChild(meta);
      var nm = el("div", "mt-name", deckName(v));
      var pre = /^\[([^\]]+)\]/.exec(v.name), req = embReq(d);
      if (pre && !(req && /상징/.test(pre[1]))) nm.insertBefore(el("span", "pre", PRE_KO[pre[1]] || pre[1]), nm.firstChild);
      if (req) nm.insertBefore(embBadge(req), nm.firstChild);
      if (v.tag === "hot") nm.appendChild(el("span", "hot", "HOT"));
      if (d && d.mine) nm.appendChild(el("span", "tag", d.mine));
      mid.appendChild(nm);
      var rest = starOrder(v.board, mc && mc.u).filter(function (b) { return b !== mc; });
      mid.appendChild(rest.some(function (b) { return (b.s || 0) >= 3; }) ? tfaUnitIcons(rest) : strip(rest.map(function (b) { return b.u; })));
      r.appendChild(mid);
      var num = el("div", "mt-num dk-kpi2");
      if (bs) {
        if (mtSort === "win") {
          num.appendChild(el("b", "dk-avg", bs[2].toFixed(1) + "%"));
          num.appendChild(el("span", "dk-top4", "평균 " + bs[0].toFixed(2)));
        } else if (mtSort === "top4") {
          num.appendChild(el("b", "dk-top4-hi", bs[1] + "%"));
          num.appendChild(el("span", "dk-avg-sub", "평균 " + bs[0].toFixed(2)));
        } else {
          num.appendChild(el("b", "dk-avg", bs[0].toFixed(2)));
          num.appendChild(el("span", "dk-top4", "승률 " + bs[2].toFixed(1) + "%"));
        }
      } else {
        num.appendChild(el("small", null, d ? "판수 부족" : "통계 없음"));
      }
      r.appendChild(num);
      r.addEventListener("click", function () { metaShow(v.id); });
      box.appendChild(r);
    });
    if (!list.length) box.appendChild(el("p", "empty", "맞는 덱이 없어요"));
  }

  function hexBoard(board) {
    var wrap = el("div", "hexboard"), at = {};
    board.forEach(function (u) { if (u.pos) at[u.pos[0] + "," + u.pos[1]] = u; });
    for (var r = 0; r < 4; r++) {
      var row = el("div", "hexrow" + (r % 2 ? " shift" : ""));
      for (var c = 0; c < 7; c++) {
        var u = at[r + "," + c], cellw = el("div", "hxwrap"), hx = el("div", "hx"), inner = el("div", "in");
        if (u) {
          var ic = IDX.units[u.u], cost = u.plant ? "p" : (u.c || (ic && ic.cost) || 1);
          hx.dataset.c = cost;
          if (ic) inner.appendChild(img(ic.icon, u.u));
          cellw.title = u.u; if (!u.plant) cellw.dataset.unit = u.u;
          if (u.s >= 2) cellw.appendChild(el("div", "st", "★".repeat(u.s)));
          cellw.appendChild(el("div", "hxn" + (u.i && u.i.length ? " lift" : ""), u.u.replace(/ /g, "")));
          if (u.i && u.i.length) {
            var its = el("div", "its");
            u.i.forEach(function (n) { var it = IDX.items[n]; if (it) { var im = img(it.icon, n); im.title = n; im.dataset.item = n; its.appendChild(im); } });
            cellw.appendChild(its);
          }
        }
        hx.appendChild(inner); cellw.appendChild(hx); row.appendChild(cellw);
      }
      wrap.appendChild(row);
    }
    return wrap;
  }

  function sec(title, hint) {
    var s = el("div", "mt-sec"), h = el("h4", null, title);
    if (hint) h.appendChild(el("small", null, hint));
    s.appendChild(h); return s;
  }
  function augCard(n, tierNum) {
    var inf = DB && DB.info.a[n], r = inf ? inf.r : ({ 1: "실버", 2: "골드", 3: "프리즘" })[tierNum] || "";
    var c = el("span", "augc"); c.dataset.aug = n;
    if (IDX.augments[n]) { var im = img(IDX.augments[n], ""); im.dataset.r = r; c.appendChild(im); }
    var t = el("span", "augt"); t.appendChild(el("b", null, n));
    t.appendChild(el("small", null, [r, inf && inf.t ? inf.t + "티어" : ""].filter(Boolean).join(" · ")));
    c.appendChild(t);
    return c;
  }
  // 덱 시너지에 맞는 증강: 켜진 시너지 이름이 설명에 들어간 S·A 티어 증강
  function synAugs(syn, skip) {
    if (!DB) return [];
    var keys = syn.filter(function (s) { return s.style !== "unique"; }).slice(0, 3).map(function (s) { return s.t; });
    return Object.keys(DB.info.a).filter(function (n) {
      var a = DB.info.a[n];
      return (a.t === "S" || a.t === "A") && skip.indexOf(n) < 0 && keys.some(function (k) { return a.d.indexOf(k) >= 0 || n.indexOf(k) >= 0; });
    }).sort(function (a, b) { return DB.info.a[a].t.localeCompare(DB.info.a[b].t); }).slice(0, 4);
  }

  // 레벨별 필드: 탭으로 4~10렙 보드를 바꿔 본다. 탭 밑에 그 레벨 라운드(가이드 추천 > MetaTFT 평균)
  function levelBoards(v, d) {
    var wrap = el("div", "lvwrap"), lvs = v.lvs || {}, keys = Object.keys(lvs).map(Number).sort(function (a, b) { return a - b; });
    if (keys.length < 2) { wrap.appendChild(hexBoard(v.board)); return wrap; }
    var when = {};
    if (v.lvup && v.lvup.length) v.lvup.forEach(function (x) { when[x[1]] = /여유/.test(x[0]) ? "여유골드" : x[0].replace(/ /g, "").replace(/~.*$/, ""); });
    else (d && d.timeline || []).forEach(function (x) { if (!/^7-/.test(x[0]) && !when[x[1]]) when[x[1]] = x[0]; });
    var names = function (b) { return b.filter(function (u) { return !u.plant; }).map(function (u) { return u.u; }).sort().join(); };
    var finalKey = names(v.board), cur = keys.filter(function (k) { return names(lvs[k]) === finalKey; }).pop();
    if (cur == null) cur = d && keys.indexOf(d.level) >= 0 ? d.level : keys[keys.length - 1];
    var tabs = el("div", "lvtabs"), bar = el("div", "lvbar"), slot = el("div");
    function show(k) {
      cur = k;
      [].forEach.call(tabs.children, function (b) { b.classList.toggle("on", +b.dataset.lv === k); });
      var b = names(lvs[k]) === finalKey ? v.board : lvs[k];
      bar.innerHTML = ""; bar.appendChild(synRow(synOf(b), false, 7));
      var code = codeOfNames(b.filter(function (u) { return !u.plant; }).map(function (u) { return u.u; }));
      if (code) bar.appendChild(codeButton(code, "코드"));
      slot.innerHTML = ""; slot.appendChild(hexBoard(b));
    }
    keys.forEach(function (k) {
      var b = el("button", null, k + "렙"); b.type = "button"; b.dataset.lv = k;
      if (when[k]) b.appendChild(el("small", null, when[k]));
      b.addEventListener("click", function () { show(k); });
      tabs.appendChild(b);
    });
    wrap.appendChild(tabs); wrap.appendChild(bar); wrap.appendChild(slot);
    show(cur);
    return wrap;
  }

  function metaShow(id, noScroll) {
    var v = deckView(id); if (!v) return;
    if (!noScroll && document.getElementById("mt-detail").hidden) { var ly = window.scrollY; navPush("deck", function () { metaBack(); window.scrollTo(0, ly); }); }
    mtCurId = id;
    var d = v.st, box = document.getElementById("mt-detail"), basis = document.getElementById("mt-basis").value;
    box.innerHTML = "";
    var back = el("button", "back", "‹ 목록"); back.type = "button"; back.addEventListener("click", function () { navBack("deck", metaBack); }); box.appendChild(back);
    var hbt = basisTier(d, basis), hmc = mainOf(v), head = el("div", "dk-hero t-" + hbt);
    if (hmc && IDX.units[hmc.u]) { var art = img(IDX.units[hmc.u].icon, ""); art.className = "art"; head.appendChild(art); }
    head.appendChild(dkPortrait(hmc && { u: hmc.u }, null));
    var t = el("div");
    t.appendChild(el("span", "tk", hbt === "X" ? "티어 없음" : hbt + " 티어"));
    var th = el("h3", null, deckName(v)), tp = /^\[([^\]]+)\]/.exec(v.name);
    if (tp) th.insertBefore(el("span", "pre", PRE_KO[tp[1]] || tp[1]), th.firstChild);
    t.appendChild(th);
    if (d) t.appendChild(el("p", null, [styleKo(d.style), d.level + "렙 완성", d.diff ? DIFF[d.diff] : "", d.mine].filter(Boolean).join(" · ")));
    var dreq = embReq(d); if (dreq) { var rq = el("p", "emb-reqline"); rq.appendChild(embBadge(dreq)); rq.appendChild(document.createTextNode("이 덱 판의 " + Math.round(dreq[1]) + "%가 사용해요")); t.appendChild(rq); }
    head.appendChild(t); box.appendChild(head);
    if (d) {
      var st = el("div", "dk-kpi"), hs = basisSt(d, basis) || basisSt(d, "all");
      var plv = perLobby(d, basisSt(d, basis) ? basis : "all");
      [[BASIS_LABEL[basisSt(d, basis) ? basis : "all"] + " 평균 등수", hs[0].toFixed(2), "g"], ["순방", hs[1] + "%", "c"], ["승률", Math.round(hs[2]) + "%"]].concat(plv != null ? [["선택률", plv]] : []).forEach(function (x) {
        var sp = el("div"); sp.appendChild(el("b", x[2] || null, x[1])); sp.appendChild(el("span", null, x[0])); st.appendChild(sp);
      });
      box.appendChild(st);
    }
    box.appendChild(synRow(v.syn, true));
    var names = v.board.filter(function (b) { return !b.plant; }).map(function (b) { return b.u; });
    var code = codeOfNames(names);
    var acts = el("div", "tb-actions");
    if (code) acts.appendChild(codeButton(code, "팀 코드 복사", "codebtn big"));
    var tbb = el("button", "tb-clear", "빌더로"); tbb.type = "button";
    tbb.addEventListener("click", function () { tbLoad(names); });
    acts.appendChild(tbb); box.appendChild(acts);

    var cols = el("div", "mt-cols"), A = el("div"), B = el("div");
    A.appendChild(levelBoards(v, d));
    // 추천 증강: 프리즘·골드·실버 3개씩. 롤체지지 가이드 픽(★)이 먼저, 다음은 MetaTFT 프로 가이드 등급 또는 이 덱 시너지 증강
    // 롤체지지 가이드 공략 원문 (scripts/build_guides.py parse_guide)
    var GD = v.gd || null;
    if (GD && GD.tips && GD.tips.length) {
      var gt = sec("공략", "출처 롤체지지"), ul = el("ul", "gd-tips");
      GD.tips.forEach(function (x) { ul.appendChild(el("li", null, x)); });
      gt.appendChild(ul);
      if (GD.charms && GD.charms.length) {
        var ch = el("div", "gd-charms"); ch.appendChild(el("span", "gd-lab", "도움되는 수호령"));
        GD.charms.forEach(function (x) { ch.appendChild(el("span", "gd-chip", x)); });
        gt.appendChild(ch);
      }
      A.appendChild(gt);
    }
    var RAR = { 3: "프리즘", 2: "골드", 1: "실버" }, picked = {}, rows = { "프리즘": [], "골드": [], "실버": [] };
    (v.augs || []).forEach(function (a) { var r = (DB && DB.info.a[a.n] && DB.info.a[a.n].r) || RAR[a.tier]; if (rows[r] && !picked[a.n]) { rows[r].push(a.n); picked[a.n] = "g"; } });
    var pool = d && d.augs ? d.augs : null;
    if (!pool) { pool = { "프리즘": [], "골드": [], "실버": [] }; synAugs(v.syn, []).forEach(function (n) { var r = DB && DB.info.a[n] && DB.info.a[n].r; if (pool[r]) pool[r].push(n); }); }
    Object.keys(rows).forEach(function (r) { (pool[r] || []).forEach(function (n) { if (rows[r].length < 3 && !picked[n]) { rows[r].push(n); picked[n] = 1; } }); });
    if (GD && GD.augs && GD.augs.length) {  // 롤체지지 가이드: 등급마다 공통·전투·경제·아이템
      var sg = sec("추천 증강", "출처 롤체지지");
      GD.augs.slice().sort(function (a, b) { return ["프리즘", "골드", "실버"].indexOf(a[0]) - ["프리즘", "골드", "실버"].indexOf(b[0]); }).forEach(function (t) {
        var line = el("div", "aug-rar"); line.appendChild(el("span", "aug-lab r-" + t[0], t[0]));
        t[1].forEach(function (c) {
          var r = el("div", "gd-augrow"); r.appendChild(el("span", "gd-lab", c[0]));
          var w = el("div", "gd-augs");
          c[1].forEach(function (n) {
            var b = el("button", "gd-aug"); b.type = "button"; var ic = IDX.augments[n] || IDX.augments[n + " I"];
            if (ic) b.appendChild(img(ic, "")); b.appendChild(document.createTextNode(n));
            b.addEventListener("click", function () { openSheet("a", n); }); w.appendChild(b);
          });
          r.appendChild(w); line.appendChild(r);
        });
        sg.appendChild(line);
      });
      A.appendChild(sg);
    } else if (rows["프리즘"].length + rows["골드"].length + rows["실버"].length) {
      var sa = sec("추천 증강", d && d.augsrc === "pro" ? "출처 롤체지지, MetaTFT 프로 가이드" : "출처 롤체지지");
      Object.keys(rows).forEach(function (r) {
        if (!rows[r].length) return;
        var line = el("div", "aug-rar"); line.appendChild(el("span", "aug-lab r-" + r, r));
        var ac = el("div", "augs3");
        rows[r].forEach(function (n) { var c = augCard(n); if (picked[n] === "g") c.classList.add("gpick"); ac.appendChild(c); });
        line.appendChild(ac); sa.appendChild(line);
      });
      A.appendChild(sa);
    }
    // 캐리 템: 추천 덱의 템, 통계가 있으면 다른 빌드도
    var carriers = v.board.filter(function (b) { return !b.plant && b.i && b.i.length; });
    if (carriers.length) {
      var sb = sec("캐리 템");
      carriers.forEach(function (b) {
        var row = el("div", "mt-build"); row.appendChild(unitChip(b.u));
        var its = el("div", "its"); b.i.forEach(function (n) { its.appendChild(itemSpan(n)); }); row.appendChild(its);
        var alt = d && d.builds[b.u];
        if (alt) alt.slice(0, 2).forEach(function (x) {
          if (x[0].join() === b.i.join()) return;
          var a = el("div", "alt"); a.appendChild(document.createTextNode("또는 "));
          x[0].forEach(function (n) { var it = IDX.items[n]; if (it) { var im = img(it.icon, n); im.title = n; im.dataset.item = n; a.appendChild(im); } });
          a.appendChild(el("b", null, x[1].toFixed(2))); row.appendChild(a);
        });
        sb.appendChild(row);
      });
      A.appendChild(sb);
    }
    if (GD && GD.items && GD.items.length) {  // 롤체지지 가이드: 챔피언별 주요·대체 아이템
      var si = sec("아이템 공략", "출처 롤체지지");
      var itemsOf = function (txt) {
        var w = el("div", "gd-its");
        txt.split(" / ").forEach(function (n, i) { if (i) w.appendChild(el("i", null, "/")); var nm = n.replace(/\s*\(.*?\)\s*$/, ""); w.appendChild(itemSpan(nm, n)); });
        return w;
      };
      GD.items.forEach(function (x) {
        var box = el("div", "gd-item"), hd = el("div", "gd-ihd");
        x.u.split("▶").forEach(function (u, i) {  // 가이드는 '어스름 늑대'처럼 띄어 쓰기도 해서 띄어쓰기 빼고 맞춘다
          if (i) hd.appendChild(el("i", null, "›"));
          var nm = u.trim(), key = nm.replace(/\s/g, "");
          if (!IDX.units[nm]) Object.keys(IDX.units).some(function (k) { if (k.replace(/\s/g, "") === key) { nm = k; return true; } });
          hd.appendChild(unitChip(nm));
        });
        box.appendChild(hd);
        if (x.d || x.note) box.appendChild(el("p", "gd-note", [x.d, x.note].filter(Boolean).join(" · ")));
        if (x.main.length) { var m = el("div", "gd-main"); m.appendChild(el("span", "gd-lab", "주요")); x.main.forEach(function (n) { m.appendChild(itemsOf(n)); }); box.appendChild(m); }
        if (x.alt.length) { var a2 = el("div", "gd-alt"); a2.appendChild(el("span", "gd-lab", "대체")); x.alt.forEach(function (n) { a2.appendChild(itemsOf(n)); }); box.appendChild(a2); }
        si.appendChild(box);
      });
      A.appendChild(si);
    }
    if (d) {
      if (v.lvup && v.lvup.length) {
        var gl = sec("레벨업 추천", "롤체지지 가이드"), gline = el("div", "tl");
        v.lvup.forEach(function (x, i) {
          if (i) gline.appendChild(el("i", null, "›"));
          var sp = el("span"); sp.appendChild(el("b", null, x[0].replace(/ /g, ""))); sp.appendChild(document.createTextNode(" " + x[1] + "렙")); gline.appendChild(sp);
        });
        gl.appendChild(gline); B.appendChild(gl);
      }
      if (d.timeline.length) {
        var tl = sec(v.lvup && v.lvup.length ? "레벨업 타이밍" : "레벨업"); var line = el("div", "tl");
        d.timeline.filter(function (x) { return !/^7-/.test(x[0]); }).forEach(function (x, i) {
          if (i) line.appendChild(el("i", null, "›"));
          var sp = el("span"); sp.appendChild(el("b", null, x[0])); sp.appendChild(document.createTextNode(" " + x[1] + "렙")); line.appendChild(sp);
        });
        if (d.roll) { var rs = el("span", "roll"); rs.appendChild(document.createTextNode("롤 ")); rs.appendChild(el("b", null, d.roll[0] + "렙")); line.appendChild(rs); }
        tl.appendChild(line); B.appendChild(tl);
      }
      if (!Object.keys(v.lvs || {}).length) {
      var boards = [[d.level, d.board.map(function (u) { return u.u; }), d.codes && d.codes[String(d.level)]]];
      Object.keys(d.early).concat(Object.keys(d.levels)).forEach(function (k) { boards.push([+k, d.early[k] || d.levels[k], d.codes && d.codes[k]]); });
      var ea = sec("레벨별 보드");
      boards.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (x) {
        var r = el("div", "minirow"); r.appendChild(el("b", null, x[0] + "렙")); r.appendChild(strip(x[1]));
        if (x[2]) r.appendChild(codeButton(x[2], "복사"));
        ea.appendChild(r);
      });
      B.appendChild(ea);
      }
      if (d.finals.length) {
        var fi = sec("완성 레벨별 평균"); var kv = el("div", "kv");
        var bestAvg = Math.min.apply(null, d.finals.filter(function (x) { return x[2] >= 5; }).map(function (x) { return x[1]; }));
        d.finals.filter(function (x) { return x[2] >= 2; }).forEach(function (x) {
          var sp = el("span", x[1] === bestAvg ? "best" : null, x[0] + "렙"); sp.appendChild(el("b", null, x[1].toFixed(2))); sp.appendChild(el("small", null, x[2] + "%")); kv.appendChild(sp);
        });
        fi.appendChild(kv); B.appendChild(fi);
      }
      var rk = sec("티어별 평균"); var kv2 = el("div", "kv");
      ["low", "all", "emer", "dia", "top", "gmc"].forEach(function (g) { var x = basisSt(d, g); if (!x) return; var sp = el("span", null, BASIS_LABEL[g] + " " + (basisTier(d, g) === "X" ? "" : basisTier(d, g))); sp.appendChild(el("b", null, x[0].toFixed(2))); sp.appendChild(el("small", null, "승률 " + Math.round(x[2]) + "%")); kv2.appendChild(sp); });
      rk.appendChild(kv2); B.appendChild(rk);
      if (d.counters.length) {
        var co = sec("상대하기 힘든 덱"); var kv3 = el("div", "kv");
        d.counters.forEach(function (c) { var sp = el("span", null, c[0]); sp.appendChild(el("b", "bad", "+" + c[1].toFixed(2))); kv3.appendChild(sp); });
        co.appendChild(kv3); B.appendChild(co);
      }
    }
    cols.appendChild(A); cols.appendChild(B); box.appendChild(cols);
    document.getElementById("mt-list-view").hidden = true;
    box.hidden = false;
    try { localStorage.setItem(MT_KEY, JSON.stringify({ id: id, f: mtFilter, b: basis, s: mtSrc, o: mtSort })); } catch (e) {}
    if (!noScroll) window.scrollTo(0, 0);
  }

  var mtCurId = null;
  // 선택률 = 이 덱 판 수 / 전체 판 수 × 8 = 로비 8명 중 이 덱을 하는 평균 인원 (MetaTFT 'Pick Rate'와 같은 정의, 2026-11-14 사용자: 이름은 "선택률"). 겹침 가늠용
  function perLobby(d, b) {
    var x = d && basisSt(d, b), tot = META && META.totals && META.totals[b];
    if (!x || !tot || !x[3]) return null;
    return (x[3] / tot * 8).toFixed(2);  // MetaTFT 'Pick Rate'처럼 소수 둘째 자리 (0.62 = 로비 8명 중 평균 0.62명)
  }
  function metaBack() {
    mtCurId = null;
    document.getElementById("mt-detail").hidden = true;
    document.getElementById("mt-list-view").hidden = false;
    metaSave();
  }
  function metaSave() {
    try { localStorage.setItem(MT_KEY, JSON.stringify({ id: null, f: mtFilter, b: document.getElementById("mt-basis").value, s: mtSrc, o: mtSort })); } catch (e) {}
  }
  // 기본 <select> 목록은 떠있는 창(오버레이) 웹뷰에서 안 열려서, 페이지 안에서 그리는 목록으로 바꾼다.
  function pickify(sel) {
    var box = document.createElement("div"), btn = document.createElement("button"), ul = document.createElement("ul");
    box.className = "dd"; btn.type = "button"; btn.setAttribute("aria-label", sel.getAttribute("aria-label") || "");
    ul.hidden = true;
    function sync() {
      btn.textContent = sel.options[sel.selectedIndex].text;
      ul.querySelectorAll("li").forEach(function (li) { li.classList.toggle("on", li.dataset.v === sel.value); });
    }
    Array.prototype.forEach.call(sel.options, function (o) {
      var li = document.createElement("li"); li.textContent = o.text; li.dataset.v = o.value;
      li.addEventListener("click", function () {
        ul.hidden = true;
        if (sel.value === o.value) return;
        sel.value = o.value; sync(); sel.dispatchEvent(new Event("change"));
      });
      ul.appendChild(li);
    });
    btn.addEventListener("click", function (e) { e.stopPropagation(); ul.hidden = !ul.hidden; });
    document.addEventListener("click", function (e) { if (!box.contains(e.target)) ul.hidden = true; });
    sel.hidden = true; sel.parentNode.insertBefore(box, sel);
    box.appendChild(btn); box.appendChild(ul); box.appendChild(sel);
    sync();
  }
  /* ---- 아이템 티어표: site/items.json (scripts/build_items.py) ---- */
  var ITEMS = null, IT_KEY = "tft-guide-items", itGrp = "조합템";
  var RANK_LABEL = { emer: "에메+", all: "플래+", low: "플래 미만", dia: "다이아+", top: "마스터+" };
  function itCls(v, base, lowGood) { return v == null ? "" : lowGood ? (v <= base - 0.1 ? "good" : v >= base + 0.1 ? "bad" : "") : ""; }
  function itList() {
    var box = document.getElementById("it-rows"); if (!ITEMS || !DB) return;
    var rank = document.getElementById("it-rank").value, sort = document.getElementById("it-sort").value;
    var q = document.getElementById("it-q").value.trim();
    var t = ITEMS.tiers[rank] || ITEMS.tiers.all, games = t.games;
    var rows = Object.keys(t.items).filter(function (n) { return (DB.info.i[n] || {}).g === itGrp; }).map(function (n) {
      var v = t.items[n]; return { n: n, cnt: v[0], avg: v[1], top4: v[2], win: v[3], g: v[4], sc: v[5], us: ITEMS.units[n] || [] };
    });
    // 챔피언 이름을 정확히 치면 그 챔피언이 들었을 때 성적으로 (MetaTFT 유닛 필터처럼, 다이아+)
    var unit = q && DB.units[q] ? q : null;
    if (unit) rows = rows.map(function (r) {
      var u = r.us.filter(function (x) { return x[0] === unit; })[0];
      return u ? { n: r.n, cnt: u[1], avg: u[2], top4: u[3], win: u[4], g: "X", sc: -u[2], us: [u], unit: true } : null;
    }).filter(Boolean);
    else if (q) rows = rows.filter(function (r) { return matches(r.n, q) || r.us.some(function (u) { return matches(u[0], q); }); });
    var key = { grade: function (r) { return -r.sc; }, avg: function (r) { return r.avg; }, top4: function (r) { return -r.top4; }, win: function (r) { return -r.win; }, n: function (r) { return -r.cnt; } }[sort];
    rows.sort(function (a, b) { return key(a) - key(b); });
    var base = rows.length ? rows.reduce(function (a, r) { return a + r.avg * r.cnt; }, 0) / rows.reduce(function (a, r) { return a + r.cnt; }, 0) : 4.5;
    box.innerHTML = "";
    rows.forEach(function (r) {
      var row = el("button", "it-row tbar t-" + r.g); row.type = "button";
      row.appendChild(el("span", "tierb " + r.g, r.g === "X" ? "-" : r.g));
      var main = el("div", "it-main"), ic = IDX.items[r.n];
      if (ic) main.appendChild(img(ic.icon, ""));
      var nm = el("div", "nm"); nm.appendChild(el("b", null, r.n));
      // 잘 쓰는 챔피언: 다이아+에서 이 템을 많이 든 유닛 중 평균 등수가 좋은 순
      var best = r.us.filter(function (u) { return u[1] >= Math.max(40, r.us[0][1] * 0.08); }).sort(function (a, b) { return a[2] - b[2]; }).slice(0, 5);
      if (r.unit) nm.appendChild(el("small", "fnote", unit + " 착용"));
      else if (best.length) nm.appendChild(strip(best.map(function (u) { return u[0]; })));
      main.appendChild(nm); row.appendChild(main);
      var a = el("div", "n avg " + itCls(r.avg, base, true), r.avg.toFixed(2)); row.appendChild(a);
      row.appendChild(el("div", "n", r.top4 + "%"));
      row.appendChild(el("div", "n", r.win + "%"));
      var fq = el("div", "n fq", r.cnt >= 1e4 ? Math.round(r.cnt / 1e3) + "k" : String(r.cnt));
      if (!r.unit) fq.appendChild(el("small", null, (r.cnt / games * 100).toFixed(r.cnt / games < 0.01 ? 2 : 1) + "%"));
      row.appendChild(fq);
      row.addEventListener("click", function () { openSheet("i", r.n); });
      box.appendChild(row);
    });
    if (!rows.length) box.appendChild(el("p", "empty", "맞는 템이 없어요"));
    document.getElementById("it-note").textContent = unit ? unit + " 착용 · 다이아+ · 출처 tactics.tools" : "";
    itUpdLabel(rank, games);
    try { localStorage.setItem(IT_KEY, JSON.stringify({ g: itGrp, r: rank, s: sort })); } catch (e) {}
  }
  // 아이템 탭 맨 위: 기준·판수·업데이트 시각 + 새로고침
  var IT_LIVE = "tft-guide-items-live";
  var IT_RANK_Q = { emer: "CHALLENGER,DIAMOND,EMERALD,GRANDMASTER,MASTER", all: "CHALLENGER,DIAMOND,EMERALD,GRANDMASTER,MASTER,PLATINUM", low: "IRON,BRONZE,SILVER,GOLD", dia: "DIAMOND,MASTER,GRANDMASTER,CHALLENGER", top: "MASTER,GRANDMASTER,CHALLENGER" };
  function itUpdLabel(rank, games, msg) {
    var t = document.getElementById("it-upd-t"); if (!t || !ITEMS) return;
    var at = ITEMS.liveAt || Date.parse(ITEMS.updated);
    if (rank == null) { rank = document.getElementById("it-rank").value; games = (ITEMS.tiers[rank] || ITEMS.tiers.all).games; }
    t.textContent = msg || (RANK_LABEL[rank] + " · 최근 3일 " + Math.round(games / 1e4).toLocaleString() + "만 판\n" + updAt(at) + " · " + ago(at) + " · MetaTFT");
  }
  function itGrade(g, avg, freq) {  // scripts/build_items.py grade()와 같게
    var pk = { "조합템": [0.5, 1], "상징": [0.125, 0.25] }[g] || [0, 0], sc = (4.5 - avg + pk[0]) * Math.pow(freq, pk[1]);
    return [sc > 0.3 ? "S" : sc > 0.2 ? "A" : sc > 0.1 ? "B" : sc > 0 ? "C" : "D", Math.round(sc * 1000) / 1000];
  }
  function itApplyLive(L) {
    if (!L || !ITEMS || !DB) return;
    if (L.at <= Date.parse(ITEMS.updated)) return;  // 앱 데이터가 더 새로우면 그대로
    Object.keys(L.t).forEach(function (k) {
      var x = L.t[k], rows = {};
      (x.r || []).forEach(function (r) {
        var name = DB.names.i[r[0]] || r[0], inf = DB.info.i[name], g = inf && inf.g, n = r[1].reduce(function (a, b) { return a + b; }, 0);
        if (!g || ["조합템", "찬란한", "유물", "상징"].indexOf(g) < 0 || n < 50) return;
        var avg = r[1].reduce(function (a, c, i) { return a + c * (i + 1); }, 0) / n, gr = itGrade(g, avg, n / x.g);
        rows[name] = [n, Math.round(avg * 100) / 100, Math.round(100 * (r[1][0] + r[1][1] + r[1][2] + r[1][3]) / n), Math.round(1000 * r[1][0] / n) / 10, gr[0], gr[1]];
      });
      if (Object.keys(rows).length > 50) ITEMS.tiers[k] = { games: x.g, items: rows };
    });
    ITEMS.liveAt = L.at;
  }
  function itRefresh(btn) {
    btn.disabled = true; btn.textContent = "불러오는 중";
    var keys = Object.keys(IT_RANK_Q);
    Promise.all(keys.map(function (k) { return viaApp("https://api-hc.metatft.com/tft-stat-api/items_matches?queue=1100&patch=current&days=3&rank=" + IT_RANK_Q[k] + "&permit_filter_adjustment=true"); })).then(function (rs) {
      var L = { at: Date.now(), t: {} };
      keys.forEach(function (k, i) {
        var d = rs[i] || {}, g = (d.games || []).reduce(function (a, x) { return a + (x.count || 0); }, 0) || 1;
        L.t[k] = { g: g, r: (d.results || []).map(function (r) { return [r.itemName, (r.places || []).slice(0, 8)]; }) };
      });
      try { localStorage.setItem(IT_LIVE, JSON.stringify(L)); } catch (e) {}
      itApplyLive(L); itList();
    }).catch(function () { itUpdLabel(null, null, "불러오지 못했어요. 다시 시도해 주세요"); })
      .then(function () { btn.disabled = false; btn.textContent = "새로고침"; });
  }
  function buildItems(d) {
    ITEMS = d; setTimeout(embInit, 0);
    try { itApplyLive(JSON.parse(localStorage.getItem(IT_LIVE) || "null")); } catch (e) {}
    var ib = document.getElementById("it-upd-btn");
    if (APP && !ib.dataset.on) { ib.dataset.on = 1; ib.hidden = false; ib.addEventListener("click", function () { itRefresh(ib); }); }
    var saved = {}; try { saved = JSON.parse(localStorage.getItem(IT_KEY) || "{}") || {}; } catch (e) {}
    if (saved.g) itGrp = saved.g;
    var rk = document.getElementById("it-rank"), so = document.getElementById("it-sort");
    if (saved.r) rk.value = saved.r; if (saved.s) so.value = saved.s;
    document.querySelectorAll("#it-grp button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.g === itGrp);
      b.addEventListener("click", function () { itGrp = b.dataset.g; document.querySelectorAll("#it-grp button").forEach(function (x) { x.classList.toggle("on", x === b); }); itList(); });
    });
    rk.addEventListener("change", itList); so.addEventListener("change", itList);
    pickify(rk); pickify(so);
    document.getElementById("it-q").addEventListener("input", itList);
    document.querySelectorAll("#it-seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll("#it-seg button").forEach(function (x) { var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on ? "true" : "false"); });
        document.getElementById("it-tier").hidden = b.dataset.v !== "tier"; document.getElementById("it-guide").hidden = b.dataset.v !== "guide";
      });
    });
    itList();
  }

  var DIFF = { 1: "쉬움", 2: "보통", 3: "어려움", 4: "매우 어려움" };  // MetaTFT 프로 가이드 난이도
  var metaReady = false, metaPending = null;
  function metaInit() {
    if (metaReady || !META) return;
    metaReady = true;
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(MT_KEY) || "{}") || {}; } catch (e) {}
    var basis = document.getElementById("mt-basis");
    if (saved.b) basis.value = saved.b;
    if (saved.f && saved.f !== "mine") mtFilter = saved.f;
    if (saved.s) mtSrc = saved.s === "win" || saved.s === "tfa" ? "guide" : saved.s;
    metaPending = saved.id || null;
    function chips(sel, attr, get, set) {
      document.querySelectorAll(sel + " button[data-" + attr + "]").forEach(function (b) {
        b.classList.toggle("on", b.dataset[attr] === get());
        b.addEventListener("click", function () { set(b.dataset[attr]); document.querySelectorAll(sel + " button[data-" + attr + "]").forEach(function (x) { x.classList.toggle("on", x === b); }); metaList(); metaSave(); });
      });
    }
    chips("#mt-filter", "f", function () { return mtFilter; }, function (v) { mtFilter = v; });  // (정렬 버튼은 data-f가 없어서 아래에서 따로)
    chips("#mt-src", "s", function () { return mtSrc; }, function (v) { mtSrc = v; });
    if (saved.o) mtSort = saved.o;
    var sortSel = document.getElementById("mt-sort");
    sortSel.value = mtSort; if (sortSel.value !== mtSort) { mtSort = "avg"; sortSel.value = "avg"; }
    sortSel.addEventListener("change", function () { mtSort = sortSel.value; metaList(); metaSave(); });
    pickify(sortSel);
    if (!BASIS_LABEL[basis.value]) basis.value = "emer";
    basis.addEventListener("change", function () { metaList(); metaSave(); });
    pickify(basis);
    document.getElementById("mt-q").addEventListener("input", metaList);
    metaList();
    if (metaPending && deckView(metaPending)) { metaShow(metaPending, true); metaPending = null; }
  }
  function buildMeta(data) { META = data; PT_NEED = null; DK_VEC = null; if (current === "parts") setTimeout(ptRender, 0); metaLoadLive(); if (DB) tbNear(); setPatch(); metaInit(); metaUpdLabel(); embInit(); }

  /* ---- 덱 통계 새로고침: 앱은 MetaTFT comps_stats(티어별 5번)를 바로 받아 숫자만 바꾼다 (보드·템은 그대로).
     claude.ai 페이지는 네트워크가 막혀 있어서 작업 세션에 갱신 요청을 보낸다. ---- */
  var META_LIVE = "tft-guide-meta-live";
  var RANK_Q = { all: "CHALLENGER,DIAMOND,EMERALD,GRANDMASTER,MASTER,PLATINUM", emer: "CHALLENGER,DIAMOND,EMERALD,GRANDMASTER,MASTER", low: "IRON,BRONZE,SILVER,GOLD", dia: "DIAMOND", top: "MASTER,GRANDMASTER,CHALLENGER", gmc: "GRANDMASTER,CHALLENGER" };
  var RANK_MIN = { gmc: 60, top: 200, dia: 250 };
  function plAvg(a) { var n = a[8] || 1, s = 0; for (var i = 0; i < 8; i++) s += a[i] * (i + 1); return Math.round(s / n * 100) / 100; }
  function metaApply(L) {
    META.decks.forEach(function (d) {
      var a = L.s.all[d.id]; if (!a) return;
      var n = a[8];
      d.n = n; d.avg = plAvg(a); d.top4 = Math.round((a[0] + a[1] + a[2] + a[3]) / n * 100); d.win = Math.round(a[0] / n * 1000) / 10; d.pick = Math.round(n / L.total * 1000) / 10;
    });
    Object.keys(RANK_Q).forEach(function (g) {  // 기준마다 [평균, 순방, 승률, 판수]와 그 기준 안에서 매긴 티어
      if (!L.s[g]) return;
      var ok = [];
      META.decks.forEach(function (d) {
        var x = L.s[g][d.id]; if (!x || x[8] < (RANK_MIN[g] || 300)) { if (d.st) delete d.st[g]; if (d.tiers) delete d.tiers[g]; return; }
        var n = x[8]; d.st = d.st || {}; d.st[g] = [plAvg(x), Math.round((x[0] + x[1] + x[2] + x[3]) / n * 100), Math.round(x[0] / n * 1000) / 10, n]; ok.push(d);
      });
      ok.sort(function (a, b) { return a.st[g][0] - b.st[g][0]; });
      ok.forEach(function (d, i) { var q = i / ok.length; d.tiers = d.tiers || {}; d.tiers[g] = q < 0.12 ? "S" : q < 0.35 ? "A" : q < 0.7 ? "B" : "C"; });
    });
    var order = META.decks.slice().sort(function (a, b) { return a.avg - b.avg; });
    order.forEach(function (x, i) { var q = i / order.length; x.tier = q < 0.12 ? "S" : q < 0.35 ? "A" : q < 0.7 ? "B" : "C"; });
    META.liveAt = L.at;
    if (L.src) META.srcAt = L.src;
    if (L.totals) META.totals = Object.assign({}, META.totals, L.totals);
  }
  function metaLoadLive() {
    try {
      var L = JSON.parse(localStorage.getItem(META_LIVE) || "null");
      if (L && L.cid === String(META.cluster_id || L.cid) && L.at > metaAt()) metaApply(L);
    } catch (e) {}
  }
  function metaUpdLabel(msg) {
    var t = document.getElementById("mt-upd-t"); if (!t || !META) return;
    // MetaTFT처럼 업데이트 시각과 분석된 덱 수를 같이 (지금 고른 티어 기준)
    var b = (document.getElementById("mt-basis") || {}).value || "emer", tot = (META.totals || {})[b];
    var at = META.srcAt || META.src_at || (META.liveAt ? new Date(META.liveAt) : META.updated);
    var ats = typeof at === "number" ? at : at instanceof Date ? +at : Date.parse(at);
    t.textContent = msg || ((tot ? "분석된 덱 " + tot.toLocaleString() + " · MetaTFT 최근 3일\n" : "") + updAt(at) + (ats ? " · " + ago(ats) : "") + (tot ? "" : " · MetaTFT 최근 3일"));
  }
  function metaRefresh(btn) {
    btn.disabled = true; btn.textContent = "불러오는 중";
    var keys = Object.keys(RANK_Q);
    Promise.all(keys.map(function (k) { return viaApp("https://api-hc.metatft.com/tft-comps-api/comps_stats?queue=1100&patch=current&days=3&permit_filter_adjustment=false&rank=" + RANK_Q[k]); })).then(function (rs) {
      var cid = String(rs[0].cluster_id);
      if (META.cluster_id && cid !== String(META.cluster_id)) { metaUpdLabel("덱 구성이 바뀌어서 다음 앱 업데이트 때 반영돼요"); return; }
      var L = { at: Date.now(), cid: cid, s: {}, total: 1, totals: {}, src: 0 };
      keys.forEach(function (k, i) {
        L.s[k] = {}; L.src = Math.max(L.src, rs[i].updated || 0);
        (rs[i].results || []).forEach(function (r) { if (r.cluster) L.s[k][r.cluster] = r.places; else { L.totals[k] = r.places[0]; if (k === "all") L.total = r.places[0]; } });
      });
      try { localStorage.setItem(META_LIVE, JSON.stringify(L)); } catch (e) {}
      metaApply(L); metaUpdLabel(); metaList();
    }).catch(function (e) { metaUpdLabel("불러오지 못했어요. 다시 시도해 주세요"); })
      .then(function () { btn.disabled = false; btn.textContent = "새로고침"; });
  }
  function setupMetaRefresh() {
    var btn = document.getElementById("mt-upd-btn");
    if (APP) { btn.hidden = false; btn.addEventListener("click", function () { metaRefresh(btn); }); return; }
    if (!window.claude || !window.claude.use) return;
    window.claude.use("mcp").then(function (mcp) {
      if (!mcp) return;
      btn.hidden = false; btn.textContent = "갱신 요청";
      btn.addEventListener("click", function () {
        btn.disabled = true; metaUpdLabel("요청 보내는 중");
        mcp.callTool("Claude Code Remote", "send_message", { session_id: SESSION, message: "[공략 노트 페이지 버튼] 덱 통계 갱신 요청이에요. CLAUDE.md '덱 통계 갱신 요청' 절차대로 해 주세요." })
          .then(function () { metaUpdLabel("요청했어요. 10분쯤 뒤에 반영돼요"); })
          .catch(function (e) { metaUpdLabel("요청을 보내지 못했어요. 다시 시도해 주세요"); btn.disabled = false; });
      });
    });
  }
  /* ---- 상징 → 덱: 상징을 고르면 갈 덱(MetaTFT 덱별 상징 성적 + 롤체지지 [상징] 덱)과 넣을 챔피언 ---- */
  var EMB_KEY = "tft-guide-emb", embSel = [];
  try { embSel = JSON.parse(localStorage.getItem(EMB_KEY) || "[]") || []; } catch (e) {}
  var EMB_TIP = {
    "나무정령 상징": "아펠리오스에게. 이즈리얼·아펠리오스 8렙 나무정령 7, 상징이 없으면 나무정령 5",
    "속사포 상징": "아펠리오스 속사포 5, 이즈리얼",
    "기원자 상징": "아리·알룬. 아리 덱이면 감시자에 방템 3개",
    "처형자 상징": "소라카·아리, 햇빛 유나라. 5렙 처형자 2, 6렙 처형자 3",
    "주문술사 상징": "소라카, 모르가나",
    "요정 상징": "트리스타나 리롤 요정 4",
    "사냥꾼 상징": "아칼리, AD 니달리",
    "엄호대 상징": "카시오페아, 엄호대 렝가",
    "싸움꾼 상징": "마스터 이, 헤카림·릴리아 탱커",
    "전쟁기계 상징": "전쟁기계 6. 저코스트 전쟁기계 대신 케넨·아이번·타릭",
    "지옥불 상징": "애쉬·럭스. 지옥불 덱은 치유 감소 템이 필요 없어요",
    "검은 가시 상징": "카직스, 검은 가시 유나라",
    "치명적인 꽃 상징": "베이가, 알룬, 적응형 투구 든 이즈리얼",
    "악의 여단 상징": "쓸 덱이 거의 없어요"
  };
