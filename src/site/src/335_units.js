  /* ---- 챔피언 통계 탭(#units) · 공통 챔피언 통계/삼신기 블록(buildUnitStatsBlock) ---- */
  var UN_KEY = "tft-guide-units", UN_LIVE = "tft-guide-units-live";
  var unCost = "0", unSort = "avg", unReady = false;
  try {
    var uns = JSON.parse(localStorage.getItem(UN_KEY) || "null");
    if (uns) { unCost = uns.c || "0"; unSort = uns.s || "avg"; }
  } catch (e) {}

  function unFmtN(n) {
    if (n == null) return "-";
    if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "만";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
  }
  function unAvgT(avg) { return (4.85 - avg) / 1.65; }
  function unDeltaEl(d) {
    if (d == null) return el("span", "ust-d", "-");
    var v = Number(d);
    var cls = "ust-d" + (v <= -0.05 ? " good" : v >= 0.05 ? " bad" : "");
    return el("span", cls, (v > 0 ? "+" : "") + v.toFixed(2));
  }
  function unTopItems(u, limit) {
    if (!u || !u.items || !u.items.length) return [];
    return u.items.slice().sort(function (a, b) { return (b[1].n || 0) - (a[1].n || 0); }).slice(0, limit || 3);
  }
  function unDecksUsing(name) {
    if (!META || !META.decks) return [];
    return allViews().filter(function (v) {
      return v && v.board && v.board.some(function (b) { return !b.plant && b.u === name; });
    }).sort(function (a, b) {
      var x = basisSt(a.st, "emer"), y = basisSt(b.st, "emer");
      return (x ? x[0] : 9) - (y ? y[0] : 9);
    }).slice(0, 4);
  }
  function unLiveApply(L) {
    if (!L || !DB || !L.u) return;
    if (L.pbe !== !!DB.pbe) return;
    if (L.at <= Date.parse(DB.updated || 0)) return;
    var tot = L.g || DB.games || 1;
    Object.keys(L.u).forEach(function (api) {
      var info = DB.names && DB.names.u && DB.names.u[api];
      var nm = info ? info[0] : null;
      var u = nm && DB.units[nm];
      if (!u) return;
      var p = L.u[api];
      var n = 0, s = 0;
      for (var i = 0; i < 8; i++) { n += p[i]; s += p[i] * (i + 1); }
      if (n < 30) return;
      var avg = Math.round(s / n * 100) / 100;
      var t4 = Math.round((p[0] + p[1] + p[2] + p[3]) / n * 100);
      var win = Math.round(p[0] / n * 1000) / 10;
      u.base.n = n; u.base.avg = avg; u.base.top4 = t4; u.base.win = win;
      u.base.freq = Math.round(n / tot * 800) / 100;
      u.meta.base = avg;
    });
    if (L.g) DB.games = L.g;
    DB.liveAt = L.at;
  }
  function unUpdLabel(msg) {
    var t = document.getElementById("un-upd-t");
    if (!t || !DB) return;
    var at = DB.liveAt || Date.parse(DB.updated || 0);
    var head = DB.pbe
      ? ("19시즌 " + pbeLabel(3) + (DB.games ? " · " + Math.round(DB.games / 1e4).toLocaleString() + "만 판" : ""))
      : ("에메+ · 최근 3일" + (DB.games ? " " + Math.round(DB.games / 1e4).toLocaleString() + "만 판" : ""));
    t.textContent = msg || (head + (at ? "\n" + updAt(at) + " · " + ago(at) + " · MetaTFT" : ""));
  }
  function unRefresh(btn) {
    if (!DB || !LIVE) return;
    btn.disabled = true; btn.textContent = "불러오는 중";
    var url = DB.pbe
      ? "https://api-hc.metatft.com/tft-stat-api/units?queue=PBE&patch=current&days=3"
      : "https://api-hc.metatft.com/tft-stat-api/units?queue=1100&patch=current&days=3&rank=EMERALD,DIAMOND,MASTER,GRANDMASTER,CHALLENGER&permit_filter_adjustment=true";
    viaApp(url).then(function (r) {
      var res = r && r.results;
      if (!res || !res.length) throw new Error("empty");
      var uMap = {}, tot = 0;
      res.forEach(function (x) {
        if (x.unit === "games" || !x.unit) { tot = (x.places && x.places[0]) || tot; return; }
        if (x.places && x.places.length >= 8) uMap[x.unit] = x.places.slice(0, 8);
      });
      if (!tot) {
        var vals = Object.keys(uMap).map(function (k) { return uMap[k].reduce(function (a, b) { return a + b; }, 0); });
        tot = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / 8) : (DB.games || 1);
      }
      var L = { at: Date.now(), pbe: !!DB.pbe, g: tot, u: uMap };
      try { localStorage.setItem(UN_LIVE, JSON.stringify(L)); } catch (e) {}
      unLiveApply(L);
      unitsRender();
    }).catch(function () {
      unUpdLabel("불러오지 못했어요. 다시 시도해 주세요");
    }).then(function () {
      btn.disabled = false; btn.textContent = "새로고침";
    });
  }

  function unitsRender() {
    var box = document.getElementById("un-rows");
    if (!box || !DB || !IDX) return;
    unUpdLabel();
    var qEl = document.getElementById("un-q");
    var q = qEl ? qEl.value.trim() : "";
    var list = Object.keys(DB.units).map(function (name) {
      return { name: name, u: DB.units[name], unl: !!unlockOf(name) };
    }).filter(function (x) {
      if (unCost === "unl") { if (!x.unl) return false; }
      else if (unCost !== "0" && String(x.u.cost) !== unCost) return false;
      if (!q) return true;
      return matches(x.name, q) || (x.u.traits || []).some(function (t) { return matches(t, q); });
    });
    list.sort(function (a, b) {
      var x = a.u.base, y = b.u.base;
      if (unSort === "win") return (y.win || 0) - (x.win || 0) || (x.avg || 9) - (y.avg || 9);
      if (unSort === "top4") return (y.top4 || 0) - (x.top4 || 0) || (x.avg || 9) - (y.avg || 9);
      if (unSort === "freq") return (y.freq || 0) - (x.freq || 0) || (x.avg || 9) - (y.avg || 9);
      if (unSort === "cost") return (b.u.cost || 0) - (a.u.cost || 0) || (x.avg || 9) - (y.avg || 9);
      return (x.avg || 9) - (y.avg || 9) || (y.win || 0) - (x.win || 0);
    });
    box.innerHTML = "";
    list.forEach(function (x) {
      var u = x.u, b = u.base, ic = IDX.units[u.icon] || IDX.units[x.name];
      var row = el("button", "un-row"); row.type = "button";
      row.dataset.c = u.cost;
      var main = el("div", "un-main");
      var face = el("span", "un-face"); face.dataset.c = u.cost;
      if (ic && ic.icon) face.appendChild(img(ic.icon, x.name));
      if (x.unl) face.appendChild(lockBadge());
      main.appendChild(face);
      var info = el("div", "un-info");
      var nmLine = el("div", "un-nm");
      nmLine.appendChild(el("b", null, x.name));
      nmLine.appendChild(el("span", "un-cost c" + u.cost, u.cost + "코"));
      info.appendChild(nmLine);
      var subLine = el("div", "un-sub");
      subLine.appendChild(el("span", "un-tr", (u.traits || []).join(" · ")));
      var top3 = unTopItems(u, 3);
      if (top3.length) {
        var mobIts = el("span", "un-its-mob");
        top3.forEach(function (it) {
          var iic = IDX.items[it[0]];
          if (iic && iic.icon) mobIts.appendChild(img(iic.icon, it[0]));
        });
        subLine.appendChild(mobIts);
      }
      info.appendChild(subLine);
      main.appendChild(info);
      row.appendChild(main);

      var avgCell = el("div", "un-n un-avg");
      avgCell.appendChild(dkGrad(el("b", null, fmt(b.avg)), unAvgT(b.avg)));
      row.appendChild(avgCell);

      var t4Cell = el("div", "un-n");
      t4Cell.appendChild(dkGrad(el("b", null, b.top4 + "%"), dkTop4T(b.top4)));
      row.appendChild(t4Cell);

      var winCell = el("div", "un-n");
      winCell.appendChild(dkGrad(el("b", null, Number(b.win).toFixed(1) + "%"), dkWinT(b.win)));
      row.appendChild(winCell);

      var fqCell = el("div", "un-n un-fq");
      fqCell.appendChild(el("b", null, b.freq != null ? b.freq.toFixed(2) : "-"));
      if (b.n) fqCell.appendChild(el("small", null, unFmtN(b.n)));
      row.appendChild(fqCell);

      var pcIts = el("div", "un-its-pc");
      top3.forEach(function (it) {
        var iic = IDX.items[it[0]];
        if (iic && iic.icon) {
          var im = img(iic.icon, it[0]); im.title = it[0] + " · 평균 " + fmt(it[1].avg);
          pcIts.appendChild(im);
        }
      });
      row.appendChild(pcIts);

      row.addEventListener("click", function () { openSheet("u", x.name); });
      box.appendChild(row);
    });
    if (!list.length) box.appendChild(el("p", "empty", "맞는 챔피언이 없어요"));
    var note = document.getElementById("un-note");
    if (note) note.textContent = "챔피언을 누르면 삼신기(3템 조합), 아이템 통계, 성급별 성적을 볼 수 있어요";
    try { localStorage.setItem(UN_KEY, JSON.stringify({ c: unCost, s: unSort })); } catch (e) {}
  }

  function buildUnits() {
    if (!DB) return;
    try { unLiveApply(JSON.parse(localStorage.getItem(UN_LIVE) || "null")); } catch (e) {}
    if (!unReady) {
      unReady = true;
      var sortSel = document.getElementById("un-sort");
      if (sortSel) {
        sortSel.value = unSort;
        pickify(sortSel);
        sortSel.addEventListener("change", function () { unSort = sortSel.value; unitsRender(); });
      }
      document.querySelectorAll("#un-cost button").forEach(function (b) {
        b.classList.toggle("on", b.dataset.c === unCost);
        b.addEventListener("click", function () {
          unCost = b.dataset.c;
          document.querySelectorAll("#un-cost button").forEach(function (x) { x.classList.toggle("on", x === b); });
          unitsRender();
        });
      });
      var q = document.getElementById("un-q");
      if (q) q.addEventListener("input", unitsRender);
      var btn = document.getElementById("un-upd-btn");
      if (btn && LIVE) {
        btn.hidden = false;
        btn.addEventListener("click", function () { unRefresh(btn); });
      }
    }
    unitsRender();
  }

  /* ---- 개별 챔피언 MetaTFT 실시간 갱신 (unit_detail) ---- */
  function unParseDetail(u, d) {
    if (!u || !d || !DB || !DB.names || !DB.names.i) return false;
    var iNames = DB.names.i;
    var levels = d.levels || [], itemRows = d.items || [], buildRows = d.builds || [];
    var totN = 0, totSum = 0, totT4 = 0, totWin = 0;
    var b1N = 0, b1Sum = 0, b3N = 0, b3Sum = 0;
    var starAcc = {};
    levels.forEach(function (r) {
      var p = r.places || [];
      if (p.length < 8) return;
      var n = 0, s = 0;
      for (var i = 0; i < 8; i++) { n += p[i]; s += p[i] * (i + 1); }
      if (!n) return;
      totN += n; totSum += s; totT4 += p[0] + p[1] + p[2] + p[3]; totWin += p[0];
      if ((r.item_count || 0) >= 1) { b1N += n; b1Sum += s; }
      if ((r.item_count || 0) >= 3) { b3N += n; b3Sum += s; }
      var st = String(r.tier || 0);
      if (st === "1" || st === "2" || st === "3") {
        if (!starAcc[st]) starAcc[st] = [0, 0, 0, 0];
        starAcc[st][0] += n; starAcc[st][1] += s; starAcc[st][2] += p[0] + p[1] + p[2] + p[3]; starAcc[st][3] += p[0];
      }
    });
    if (!totN) return false;
    u.base.n = totN;
    u.base.avg = Math.round(totSum / totN * 100) / 100;
    u.base.top4 = Math.round(totT4 / totN * 100);
    u.base.win = Math.round(totWin / totN * 1000) / 10;
    if (b1N) u.base.b1 = Math.round(b1Sum / b1N * 100) / 100;
    if (b3N) u.base.b3 = Math.round(b3Sum / b3N * 100) / 100;
    if (DB.games) u.base.freq = Math.round(totN / DB.games * 800) / 100;
    var stars = {};
    ["1", "2", "3"].forEach(function (k) {
      var a = starAcc[k]; if (!a || !a[0]) return;
      stars[k] = { n: a[0], pick: Math.round(a[0] / totN * 1000) / 10, avg: Math.round(a[1] / a[0] * 100) / 100, top4: Math.round(a[2] / a[0] * 100), win: Math.round(a[3] / a[0] * 1000) / 10 };
    });
    if (Object.keys(stars).length) u.stars = stars;

    var base1 = u.base.b1 || u.base.avg, base3 = u.base.b3 || u.base.avg;
    var itemGames = d.item_games || b1N || totN;
    var minI = Math.max(15, Math.floor(itemGames * 0.005));
    var items = [];
    itemRows.forEach(function (r) {
      var api = r.itemName || "";
      if (!api || /Radiant/i.test(api)) return;
      var nm = iNames[api]; if (!nm) return;
      var inf = DB.info && DB.info.i && DB.info.i[nm];
      if (inf && inf.g === "재료") return;
      var p = r.places || []; if (p.length < 8) return;
      var n = 0, s = 0; for (var i = 0; i < 8; i++) { n += p[i]; s += p[i] * (i + 1); }
      if (n < minI) return;
      var avg = Math.round(s / n * 100) / 100;
      items.push([nm, { n: n, pick: Math.round(n / itemGames * 1000) / 10, avg: avg, top4: Math.round((p[0] + p[1] + p[2] + p[3]) / n * 100), win: Math.round(p[0] / n * 1000) / 10, d: Math.round((avg - base1) * 100) / 100 }]);
    });
    if (items.length) {
      var byPop = items.slice().sort(function (a, b) { return b[1].n - a[1].n; }).slice(0, 8);
      var byAvg = items.slice().sort(function (a, b) { return a[1].avg - b[1].avg; }).slice(0, 8);
      var seenI = {}, mergedI = [];
      byPop.concat(byAvg).forEach(function (x) { if (!seenI[x[0]]) { seenI[x[0]] = 1; mergedI.push(x); } });
      u.items = mergedI.sort(function (a, b) { return a[1].avg - b[1].avg; }).slice(0, 12);
    }

    var buildGames = d.build_games || b3N || totN;
    var minB = Math.max(10, Math.floor(buildGames * 0.002));
    var trios = [];
    buildRows.forEach(function (r) {
      var raw = String(r.buildNames || "").split("|").filter(Boolean);
      if (raw.length !== 3 || raw.some(function (x) { return /Radiant/i.test(x); })) return;
      var nms = raw.map(function (x) { return iNames[x]; });
      if (nms.some(function (x) { return !x || (DB.info && DB.info.i && DB.info.i[x] && DB.info.i[x].g === "재료"); })) return;
      var p = r.places || []; if (p.length < 8) return;
      var n = 0, s = 0; for (var i = 0; i < 8; i++) { n += p[i]; s += p[i] * (i + 1); }
      if (n < minB) return;
      var avg = Math.round(s / n * 100) / 100;
      trios.push([nms, { n: n, pick: Math.round(n / buildGames * 1000) / 10, avg: avg, top4: Math.round((p[0] + p[1] + p[2] + p[3]) / n * 100), win: Math.round(p[0] / n * 1000) / 10, d: Math.round((avg - base3) * 100) / 100 }]);
    });
    if (trios.length) {
      var tPop = trios.slice().sort(function (a, b) { return b[1].n - a[1].n; }).slice(0, 6);
      var tAvg = trios.slice().sort(function (a, b) { return a[1].avg - b[1].avg; }).slice(0, 6);
      var seenT = {}, mergedT = [];
      tPop.concat(tAvg).forEach(function (x) { var k = x[0].join("|"); if (!seenT[k]) { seenT[k] = 1; mergedT.push(x); } });
      u.trios = mergedT.sort(function (a, b) { return b[1].n - a[1].n; }).slice(0, 10);
    }
    u._liveAt = Date.now();
    return true;
  }

  /* ---- 공통 챔피언 통계 · 삼신기 · 아이템 통계 블록 (unitSheet + s19OpenUnit 공용) ---- */
  function buildUnitStatsBlock(name, opt) {
    if (!DB || !IDX) return null;
    var base = String(name || "").replace(/ \([^)]+\)$/, "");
    var u = DB.units[base];
    if (!u || !u.base) return null;
    var mode = (opt && opt.mode) || "sheet";
    var closeFn = opt && opt.closeFn;
    var wrap = el("div", "ust-wrap ust-" + mode);
    var trioSort = "pop", itemSort = "pop", trioMore = false, itemMore = false;

    function render() {
      wrap.innerHTML = "";
      var b = u.base;
      var srcBar = el("div", "ust-src");
      var srcTxt = (DB.pbe ? "19시즌 PBE" : "다이아+") + (b.n ? " · " + b.n.toLocaleString() + "판" : "") + " · MetaTFT";
      srcBar.appendChild(el("span", null, srcTxt + (u._liveAt ? " · 방금 갱신" : "")));
      if (LIVE && u.api) {
        var rbtn = el("button", "ust-rf", "새로고침"); rbtn.type = "button";
        rbtn.addEventListener("click", function () {
          rbtn.disabled = true; rbtn.textContent = "불러오는 중";
          var url = "https://api-hc.metatft.com/tft-stat-api/unit_detail?unit=" + encodeURIComponent(u.api)
            + "&queue=" + (DB.pbe ? "PBE" : "1100") + "&patch=current&days=3"
            + (DB.pbe ? "" : "&rank=DIAMOND,MASTER,GRANDMASTER,CHALLENGER&permit_filter_adjustment=true");
          viaApp(url).then(function (d) {
            if (unParseDetail(u, d)) { render(); if (unReady) unitsRender(); }
            else { rbtn.disabled = false; rbtn.textContent = "새로고침"; }
          }).catch(function () {
            rbtn.disabled = false; rbtn.textContent = "다시 시도";
          });
        });
        srcBar.appendChild(rbtn);
      }
      wrap.appendChild(srcBar);

      // 1) 핵심 지표 4칸 (평균 등수 · 순방률 · 승률 · 로비당 빈도)
      var kpi = el("div", "ust-kpi");
      [
        ["평균 등수", fmt(b.avg), unAvgT(b.avg)],
        ["순방률", b.top4 != null ? b.top4 + "%" : "-", b.top4 != null ? dkTop4T(b.top4) : null],
        ["승률", b.win != null ? Number(b.win).toFixed(1) + "%" : "-", b.win != null ? dkWinT(b.win) : null],
        ["빈도", b.freq != null ? b.freq.toFixed(2) : "-", null]
      ].forEach(function (x) {
        var cell = el("div", "ust-k");
        var v = el("b", null, x[1]);
        if (x[2] != null) dkGrad(v, x[2]);
        cell.appendChild(v);
        cell.appendChild(el("span", null, x[0]));
        kpi.appendChild(cell);
      });
      wrap.appendChild(kpi);

      // 2) 삼신기 (3템 조합)
      if (u.trios && u.trios.length) {
        var ts = el("div", "ust-sec");
        var th = el("div", "ust-sh");
        var ttl = el("h4", null, "삼신기");
        ttl.appendChild(el("small", null, "3템 조합 · 기준 " + fmt(b.b3 || b.avg)));
        th.appendChild(ttl);
        var tg = el("div", "ust-tog");
        [["pop", "인기순"], ["avg", "평균순"]].forEach(function (x) {
          var bt = el("button", trioSort === x[0] ? "on" : null, x[1]); bt.type = "button";
          bt.addEventListener("click", function () { trioSort = x[0]; render(); });
          tg.appendChild(bt);
        });
        th.appendChild(tg);
        ts.appendChild(th);
        var thead = el("div", "ust-rhead ust-gt");
        ["조합", "평균", "Δ", "승률"].forEach(function (h) { thead.appendChild(el("span", null, h)); });
        ts.appendChild(thead);

        var tList = u.trios.slice().sort(function (x, y) {
          return trioSort === "avg" ? (x[1].avg - y[1].avg || y[1].n - x[1].n) : (y[1].n - x[1].n || x[1].avg - y[1].avg);
        });
        var tShow = trioMore ? tList : tList.slice(0, 5);
        tShow.forEach(function (r) {
          var row = el("div", "ust-row ust-gt");
          var left = el("div", "ust-tleft");
          var ics = el("div", "ust-tics");
          r[0].forEach(function (inm) {
            var iic = IDX.items[inm];
            if (iic && iic.icon) {
              var im = img(iic.icon, inm); im.title = inm; im.dataset.item = inm;
              ics.appendChild(im);
            }
          });
          left.appendChild(ics);
          left.appendChild(el("div", "ust-tnm", r[0].join(" · ")));
          row.appendChild(left);

          var cAvg = el("div", "ust-n");
          cAvg.appendChild(dkGrad(el("b", null, fmt(r[1].avg)), unAvgT(r[1].avg)));
          cAvg.appendChild(el("small", null, "순방 " + r[1].top4 + "%"));
          row.appendChild(cAvg);

          var cDel = el("div", "ust-n");
          cDel.appendChild(unDeltaEl(r[1].d != null ? r[1].d : (r[1].avg - (b.b3 || b.avg))));
          row.appendChild(cDel);

          var cWin = el("div", "ust-n");
          cWin.appendChild(el("b", null, Number(r[1].win).toFixed(1) + "%"));
          cWin.appendChild(el("small", null, unFmtN(r[1].n)));
          row.appendChild(cWin);
          ts.appendChild(row);
        });
        if (tList.length > 5) {
          var tm = el("button", "ust-more", trioMore ? "접기" : "삼신기 " + (tList.length - 5) + "개 더 보기"); tm.type = "button";
          tm.addEventListener("click", function () { trioMore = !trioMore; render(); });
          ts.appendChild(tm);
        }
        wrap.appendChild(ts);
      }

      // 3) 추천 아이템 통계
      if (u.items && u.items.length) {
        var isec = el("div", "ust-sec");
        var ih = el("div", "ust-sh");
        var itl = el("h4", null, "추천 아이템");
        itl.appendChild(el("small", null, "기준 " + fmt(b.b1 || b.avg)));
        ih.appendChild(itl);
        var itg = el("div", "ust-tog");
        [["pop", "인기순"], ["avg", "평균순"]].forEach(function (x) {
          var bt = el("button", itemSort === x[0] ? "on" : null, x[1]); bt.type = "button";
          bt.addEventListener("click", function () { itemSort = x[0]; render(); });
          itg.appendChild(bt);
        });
        ih.appendChild(itg);
        isec.appendChild(ih);
        var ihead = el("div", "ust-rhead ust-gi");
        ["아이템", "평균", "Δ", "사용"].forEach(function (h) { ihead.appendChild(el("span", null, h)); });
        isec.appendChild(ihead);

        var iList = u.items.slice().sort(function (x, y) {
          return itemSort === "avg" ? (x[1].avg - y[1].avg || y[1].n - x[1].n) : (y[1].n - x[1].n || x[1].avg - y[1].avg);
        });
        var iShow = itemMore ? iList : iList.slice(0, 6);
        iShow.forEach(function (r) {
          var row = el("div", "ust-row ust-gi");
          var left = el("div", "ust-ileft"); left.dataset.item = r[0];
          var iic = IDX.items[r[0]];
          if (iic && iic.icon) left.appendChild(img(iic.icon, r[0]));
          left.appendChild(el("span", "ust-inm", r[0]));
          row.appendChild(left);

          var cAvg = el("div", "ust-n");
          cAvg.appendChild(dkGrad(el("b", null, fmt(r[1].avg)), unAvgT(r[1].avg)));
          cAvg.appendChild(el("small", null, "승률 " + Math.round(r[1].win) + "%"));
          row.appendChild(cAvg);

          var cDel = el("div", "ust-n");
          cDel.appendChild(unDeltaEl(r[1].d != null ? r[1].d : (r[1].avg - (b.b1 || b.avg))));
          row.appendChild(cDel);

          var cPk = el("div", "ust-n");
          cPk.appendChild(el("b", null, r[1].pick + "%"));
          cPk.appendChild(el("small", null, unFmtN(r[1].n)));
          row.appendChild(cPk);
          isec.appendChild(row);
        });
        if (iList.length > 6) {
          var im = el("button", "ust-more", itemMore ? "접기" : "아이템 " + (iList.length - 6) + "개 더 보기"); im.type = "button";
          im.addEventListener("click", function () { itemMore = !itemMore; render(); });
          isec.appendChild(im);
        }
        wrap.appendChild(isec);
      }

      // 4) 2템 핵심 조합 (접기/펼치기)
      if (u.pairs && u.pairs.length) {
        var det = el("details", "ust-det");
        if (mode === "full") det.open = false;
        det.appendChild(el("summary", null, "2템 핵심 조합 (" + u.pairs.length + ")"));
        var pBox = el("div", "ust-pairs");
        u.pairs.slice(0, 6).forEach(function (r) {
          var row = el("div", "ust-row ust-gi");
          var left = el("div", "ust-tleft");
          var ics = el("div", "ust-tics");
          r[0].forEach(function (inm) {
            var iic = IDX.items[inm];
            if (iic && iic.icon) { var im = img(iic.icon, inm); im.title = inm; im.dataset.item = inm; ics.appendChild(im); }
          });
          left.appendChild(ics);
          left.appendChild(el("div", "ust-tnm", r[0].join(" · ")));
          row.appendChild(left);
          var cAvg = el("div", "ust-n"); cAvg.appendChild(dkGrad(el("b", null, fmt(r[1].avg)), unAvgT(r[1].avg))); row.appendChild(cAvg);
          var cDel = el("div", "ust-n"); cDel.appendChild(unDeltaEl(r[1].d)); row.appendChild(cDel);
          var cN = el("div", "ust-n"); cN.appendChild(el("b", null, Math.round(r[1].win) + "%")); cN.appendChild(el("small", null, unFmtN(r[1].n))); row.appendChild(cN);
          pBox.appendChild(row);
        });
        det.appendChild(pBox);
        wrap.appendChild(det);
      }

      // 5) 성급별 성적 (1★ · 2★ · 3★)
      var stKeys = ["1", "2", "3"].filter(function (k) { return u.stars && u.stars[k]; });
      if (stKeys.length) {
        var ssec = el("div", "ust-sec");
        var sh = el("div", "ust-sh"); sh.appendChild(el("h4", null, "성급별 성적")); ssec.appendChild(sh);
        var sgrid = el("div", "ust-stars");
        stKeys.forEach(function (k) {
          var s = u.stars[k], c = el("div", "ust-st");
          c.appendChild(el("span", "ust-stl", "★".repeat(+k) + " " + k + "성"));
          c.appendChild(dkGrad(el("b", null, fmt(s.avg)), unAvgT(s.avg)));
          c.appendChild(el("small", null, "승률 " + Number(s.win).toFixed(0) + "% · " + s.pick + "%"));
          sgrid.appendChild(c);
        });
        ssec.appendChild(sgrid);
        wrap.appendChild(ssec);
      }

      // 6) 이 챔피언을 쓰는 메타 덱
      var dks = unDecksUsing(base);
      if (dks.length) {
        var dsec = el("div", "ust-sec");
        var dh = el("div", "ust-sh"); dh.appendChild(el("h4", null, "쓰이는 메타 덱")); dsec.appendChild(dh);
        var dlist = el("div", "ust-dks");
        dks.forEach(function (v) {
          var bs = basisSt(v.st, "emer"), bt = basisTier(v.st, "emer"), areq = augReq(v.st);
          var btn = el("button", "ust-dk"); btn.type = "button";
          btn.appendChild(el("span", "dk-tbadge t-" + bt, bt === "X" ? "-" : bt));
          if (areq) btn.appendChild(augReqBadge(areq, false));
          btn.appendChild(el("span", "ust-dkn", deckName(v)));
          if (bs) btn.appendChild(dkGrad(el("b", null, bs[0].toFixed(2)), dkAvgT(bs[0])));
          btn.addEventListener("click", function () {
            var go = function () { openDeck(v.id); };
            if (closeFn) closeFn(go); else go();
          });
          dlist.appendChild(btn);
        });
        dsec.appendChild(dlist);
        wrap.appendChild(dsec);
      }
    }

    render();
    return wrap;
  }
