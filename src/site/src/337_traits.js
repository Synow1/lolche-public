  /* ---- 시너지 통계 탭(#traits) · 공통 시너지 통계 블록(buildTraitStatsBlock) ---- */
  var TR_KEY = "tft-guide-traits", TR_LIVE = "tft-guide-traits-live";
  var TR_TYPE_KO = { origin: "계열", class: "직업", unique: "고유" };
  var TR_DET_CACHE = {};
  var trView = "tier", trType = "all", trSort = "avg", trReady = false, _trFocusKey = null;
  try {
    var trs = JSON.parse(localStorage.getItem(TR_KEY) || "null");
    if (trs) { trView = trs.v || "tier"; trType = trs.t || "all"; trSort = trs.s || "avg"; }
  } catch (e) {}

  function trAvgT(avg) { return (4.85 - avg) / 1.65; }
  function trSave() { try { localStorage.setItem(TR_KEY, JSON.stringify({ v: trView, t: trType, s: trSort })); } catch (e) {} }
  function trRowsAll() { return (DB && DB.traits && DB.traits.rows) || []; }
  function trRowsOf(name) { return trRowsAll().filter(function (r) { return r.t === name; }); }
  function trBestOf(name) {
    var rs = trRowsOf(name);
    if (!rs.length) return null;
    var ok = rs.filter(function (r) { return r.n >= 30; });
    var pool = ok.length ? ok : rs;
    return pool.slice().sort(function (a, b) { return a.avg - b.avg || b.n - a.n; })[0];
  }
  function trStepStat(name, minUnits, stepIdx) {
    var rs = trRowsOf(name);
    if (!rs.length) return null;
    if (stepIdx != null) {
      var byTier = rs.filter(function (r) { return r.tier === stepIdx + 1; })[0];
      if (byTier && (minUnits == null || byTier.m === minUnits || name === "비치 팝" || name === "True Damage")) return byTier;
    }
    return rs.filter(function (r) { return r.m === minUnits; }).sort(function (a, b) { return b.n - a.n; })[0] || null;
  }
  function trDecksUsing(name) {
    if (!META || !META.decks) return [];
    return allViews().filter(function (v) {
      return v && v.syn && v.syn.some(function (s) { return s.t === name; });
    }).sort(function (a, b) {
      var x = basisSt(a.st, "emer"), y = basisSt(b.st, "emer");
      return (x ? x[0] : 9) - (y ? y[0] : 9);
    }).slice(0, 4);
  }
  function openTraitSheet(name, focusKey) {
    _trFocusKey = focusKey || null;
    return openSheet("t", name);
  }

  function trLiveApply(L) {
    if (!L || !DB || !DB.traits || !L.r) return;
    if (L.pbe !== !!DB.pbe) return;
    if (L.at <= Date.parse(DB.updated || 0)) return;
    var tot = L.g || DB.traits.games || 1;
    var byKey = {};
    (DB.traits.rows || []).forEach(function (row) {
      var p = L.r[row.k];
      if (!p || p.length < 8) return;
      var n = 0, s = 0;
      for (var i = 0; i < 8; i++) { n += p[i]; s += p[i] * (i + 1); }
      if (n < 20) return;
      row.n = n;
      row.avg = Math.round(s / n * 100) / 100;
      row.top4 = Math.round((p[0] + p[1] + p[2] + p[3]) / n * 100);
      row.win = Math.round(p[0] / n * 1000) / 10;
      row.freq = Math.round(n / tot * 800) / 100;
      row.pick = Math.round(n / tot * 1000) / 10;
      byKey[row.k] = row;
    });
    Object.keys(DB.info.t || {}).forEach(function (nm) {
      var inf = DB.info.t[nm];
      if (!inf || !inf.api || !inf.e) return;
      inf.e.forEach(function (e, i) {
        var r = byKey[inf.api + "_" + (i + 1)];
        if (r) { e[2] = r.avg; e[3] = r.top4; e[4] = r.win; e[5] = r.n; }
      });
    });
    if (L.g) DB.traits.games = L.g;
    DB.traits.liveAt = L.at;
  }
  function trUpdLabel(msg) {
    var t = document.getElementById("tr-upd-t");
    if (!t || !DB || !DB.traits) return;
    var at = DB.traits.liveAt || Date.parse(DB.updated || 0);
    var g = DB.traits.games || DB.games || 0;
    var head = DB.pbe
      ? ("19시즌 " + pbeLabel(3) + (g ? " · " + Math.round(g / 1e4).toLocaleString() + "만 판" : ""))
      : ("에메+ · 최근 3일" + (g ? " " + Math.round(g / 1e4).toLocaleString() + "만 판" : ""));
    t.textContent = msg || (head + (at ? "\n" + updAt(at) + " · " + ago(at) + " · MetaTFT" : ""));
  }
  function trRefresh(btn) {
    if (!DB || !LIVE) return;
    btn.disabled = true; btn.textContent = "불러오는 중";
    var url = DB.pbe
      ? "https://api-hc.metatft.com/tft-stat-api/traits?queue=PBE&patch=current&days=3"
      : "https://api-hc.metatft.com/tft-stat-api/traits?queue=1100&patch=current&days=3&rank=EMERALD,DIAMOND,MASTER,GRANDMASTER,CHALLENGER&permit_filter_adjustment=true";
    viaApp(url).then(function (r) {
      var res = r && r.results;
      if (!res || !res.length) throw new Error("empty");
      var map = {};
      res.forEach(function (x) { if (x.trait && x.places && x.places.length >= 8) map[x.trait] = x.places.slice(0, 8); });
      var tot = (r.games || []).reduce(function (a, x) { return a + (x.count || 0); }, 0) || (DB.traits && DB.traits.games) || 1;
      var L = { at: Date.now(), pbe: !!DB.pbe, g: tot, r: map };
      try { localStorage.setItem(TR_LIVE, JSON.stringify(L)); } catch (e) {}
      trLiveApply(L);
      traitsRender();
      if (current === "s19" && typeof s19Render === "function") s19Render();
    }).catch(function () {
      trUpdLabel("불러오지 못했어요. 다시 시도해 주세요");
    }).then(function () {
      btn.disabled = false; btn.textContent = "새로고침";
    });
  }

  function trMatch(name, q) {
    if (!q) return true;
    if (matches(name, q)) return true;
    var inf = DB && DB.info && DB.info.t && DB.info.t[name];
    return !!(inf && inf.u && inf.u.some(function (u) { return matches(u[0], q); }));
  }

  function traitsRender() {
    if (!DB || !IDX) return;
    trUpdLabel();
    var tierPane = document.getElementById("tr-tier");
    var grpPane = document.getElementById("tr-list");
    if (!tierPane || !grpPane) return;
    tierPane.hidden = trView !== "tier";
    grpPane.hidden = trView !== "group";
    var qEl = document.getElementById("tr-q");
    var q = qEl ? qEl.value.trim() : "";

    if (trView === "tier") {
      var box = document.getElementById("tr-rows");
      box.innerHTML = "";
      var list = trRowsAll().filter(function (r) {
        if (r.n < 30) return false;
        if (trType !== "all" && r.type !== trType) return false;
        return trMatch(r.t, q);
      });
      list.sort(function (a, b) {
        if (trSort === "win") return (b.win - a.win) || (a.avg - b.avg);
        if (trSort === "top4") return (b.top4 - a.top4) || (a.avg - b.avg);
        if (trSort === "freq") return (b.freq - a.freq) || (a.avg - b.avg);
        return (a.avg - b.avg) || (b.n - a.n);
      });
      if (!list.length) {
        box.appendChild(el("p", "empty", "조건에 맞는 시너지가 없어요"));
      } else {
        list.forEach(function (r) {
          var row = el("button", "tr-stat-row"); row.type = "button";
          row.dataset.trkey = r.k;
          var main = el("div", "tr-main");
          var ico = el("span", "trx s-" + r.st + " tr-ico");
          var hx = el("span", "hx2");
          if (IDX.traits[r.t]) hx.appendChild(img(IDX.traits[r.t], ""));
          ico.appendChild(hx);
          main.appendChild(ico);

          var info = el("div", "tr-info");
          var nm = el("div", "tr-nm");
          nm.appendChild(el("b", null, r.t));
          nm.appendChild(el("span", "tr-bp s-" + r.st, r.type === "unique" ? "고유" : r.lbl));
          info.appendChild(nm);

          var inf = DB.info.t[r.t];
          var subTxt = r.type === "unique" && inf && inf.u && inf.u.length
            ? (inf.u[0][0] + " · " + unFmtN(r.n) + "판")
            : ((TR_TYPE_KO[r.type] || "") + " · " + unFmtN(r.n) + "판");
          info.appendChild(el("div", "tr-sub", subTxt));
          main.appendChild(info);
          row.appendChild(main);

          var aCell = el("div", "tr-n tr-avg");
          aCell.appendChild(dkGrad(el("b", null, fmt(r.avg)), trAvgT(r.avg)));
          row.appendChild(aCell);

          var t4Cell = el("div", "tr-n");
          t4Cell.appendChild(el("b", null, r.top4 + "%"));
          row.appendChild(t4Cell);

          var wCell = el("div", "tr-n");
          wCell.appendChild(el("b", null, r.win.toFixed(1) + "%"));
          row.appendChild(wCell);

          var fqCell = el("div", "tr-n tr-fq");
          fqCell.appendChild(el("b", null, r.freq.toFixed(2)));
          fqCell.appendChild(el("small", null, r.pick.toFixed(1) + "%"));
          row.appendChild(fqCell);

          var usPc = el("div", "tr-us-pc");
          if (inf && inf.u && inf.u.length) {
            inf.u.slice().sort(function (a, b) { return (b[1] || 0) - (a[1] || 0); }).slice(0, 5).forEach(function (u) {
              var ui = IDX.units[u[0]];
              if (ui && ui.icon) {
                var im = img(ui.icon, u[0]); im.title = u[0]; im.dataset.c = ui.cost || u[1] || 1;
                usPc.appendChild(im);
              }
            });
          }
          row.appendChild(usPc);

          row.addEventListener("click", function () { openTraitSheet(r.t, r.k); });
          box.appendChild(row);
        });
      }
      var note = document.getElementById("tr-note");
      if (note) note.textContent = "총 " + list.length + "개 단계 · 시너지를 누르면 단계별 통계·효과·추천 덱·함께 쓰는 유닛이 나와요";
    } else {
      grpPane.innerHTML = "";
      var groups = [["origin", "계열"], ["class", "직업"], ["unique", "고유"]].filter(function (g) {
        return trType === "all" || trType === g[0];
      });
      var shown = 0;
      groups.forEach(function (g) {
        var names = Object.keys(DB.info.t).filter(function (n) {
          var inf = DB.info.t[n];
          return inf.type === g[0] && inf.u && inf.u.length && trMatch(n, q);
        });
        if (!names.length) return;
        names.sort(function (a, b) {
          var ra = trBestOf(a), rb = trBestOf(b);
          if (!ra && !rb) return a.localeCompare(b, "ko");
          if (!ra) return 1;
          if (!rb) return -1;
          if (trSort === "win") return (rb.win - ra.win) || (ra.avg - rb.avg);
          if (trSort === "top4") return (rb.top4 - ra.top4) || (ra.avg - rb.avg);
          if (trSort === "freq") return (rb.freq - ra.freq) || (ra.avg - rb.avg);
          return (ra.avg - rb.avg) || a.localeCompare(b, "ko");
        });
        shown += names.length;
        var grp = el("div", "tr-group");
        grp.appendChild(el("h3", null, g[1] + " " + names.length));
        names.forEach(function (n) {
          var inf = DB.info.t[n], rs = trRowsOf(n).filter(function (r) { return r.n >= 30; });
          var card = el("div", "tr-row tr-gcard");
          if (IDX.traits[n]) { var im = img(IDX.traits[n], n); im.dataset.trait = n; card.appendChild(im); } else card.appendChild(el("span"));
          var body = el("div", "tr-gbody");
          var t1 = el("div", "t1"); t1.dataset.trait = n;
          t1.appendChild(el("b", null, n));
          var best = trBestOf(n);
          if (best) t1.appendChild(dkGrad(el("span", "tr-gbest", "최고 " + fmt(best.avg)), trAvgT(best.avg)));
          body.appendChild(t1);
          if (rs.length) {
            var pills = el("div", "tr-pills");
            rs.slice().sort(function (a, b) { return a.tier - b.tier; }).forEach(function (r) {
              var p = el("button", "tr-pill s-" + r.st); p.type = "button";
              p.appendChild(el("span", null, r.type === "unique" ? "1" : r.lbl));
              p.appendChild(dkGrad(el("b", null, fmt(r.avg)), trAvgT(r.avg)));
              p.addEventListener("click", function (e) { e.stopPropagation(); openTraitSheet(n, r.k); });
              pills.appendChild(p);
            });
            body.appendChild(pills);
          }
          body.appendChild(strip(inf.u.map(function (u) { return u[0]; })));
          card.appendChild(body);
          grp.appendChild(card);
        });
        grpPane.appendChild(grp);
      });
      if (!shown) grpPane.appendChild(el("p", "empty", "조건에 맞는 시너지가 없어요"));
      var note2 = document.getElementById("tr-note");
      if (note2) note2.textContent = "총 " + shown + "개 시너지 · 단계 배지나 시너지 이름을 누르면 상세 통계가 나와요";
    }
  }

  function buildTraitList() {
    if (!DB || trReady) return;
    trReady = true;
    try { trLiveApply(JSON.parse(localStorage.getItem(TR_LIVE) || "null")); } catch (e) {}
    var vb = document.querySelectorAll("#tr-view button");
    vb.forEach(function (b) {
      b.classList.toggle("on", b.dataset.v === trView);
      b.addEventListener("click", function () {
        trView = b.dataset.v; trSave();
        vb.forEach(function (x) { x.classList.toggle("on", x === b); });
        traitsRender();
      });
    });
    var tb = document.querySelectorAll("#tr-type button");
    tb.forEach(function (b) {
      b.classList.toggle("on", b.dataset.tp === trType);
      b.addEventListener("click", function () {
        trType = b.dataset.tp; trSave();
        tb.forEach(function (x) { x.classList.toggle("on", x === b); });
        traitsRender();
      });
    });
    var q = document.getElementById("tr-q");
    if (q) q.addEventListener("input", traitsRender);
    var so = document.getElementById("tr-sort");
    if (so) {
      so.value = trSort;
      if (so.value !== trSort) { trSort = "avg"; so.value = "avg"; }
      so.addEventListener("change", function () { trSort = so.value; trSave(); traitsRender(); });
      pickify(so);
    }
    var rf = document.getElementById("tr-upd-btn");
    if (rf && LIVE && !rf.dataset.on) {
      rf.dataset.on = 1; rf.hidden = false;
      rf.addEventListener("click", function () { trRefresh(rf); });
    }
    traitsRender();
  }

  /* ---- 공통 시너지 통계 블록 (시트 traitSheet · 도감 s19OpenTrait 공용) ---- */
  function buildTraitStatsBlock(name, opts) {
    opts = opts || {};
    var inf = DB && DB.info && DB.info.t && DB.info.t[name];
    var rows = trRowsOf(name).slice().sort(function (a, b) { return a.tier - b.tier; });
    if (!inf && !rows.length) return null;
    var wrap = el("div", "ust-wrap tst-wrap");
    var g = (DB && DB.traits && DB.traits.games) || (DB && DB.games) || 0;
    var srcBar = el("div", "ust-src");
    srcBar.appendChild(el("span", null, (DB.pbe ? "19시즌 PBE" : "에메+") + (g ? " · " + Math.round(g / 1e4).toLocaleString() + "만 판" : "") + " · MetaTFT"));
    wrap.appendChild(srcBar);

    // 1) 단계별 통계 표
    if (rows.length) {
      var sec1 = el("div", "ust-sec");
      var sh1 = el("div", "ust-sh");
      var h1 = el("h4", null, "단계별 통계");
      h1.appendChild(el("small", null, "평균·순방·승률·빈도"));
      sh1.appendChild(h1);
      sec1.appendChild(sh1);

      var rh = el("div", "ust-rhead tst-gt");
      ["단계", "평균", "순방", "승률"].forEach(function (x) { rh.appendChild(el("span", null, x)); });
      sec1.appendChild(rh);

      rows.forEach(function (r) {
        var isFocus = opts.focusKey && opts.focusKey === r.k;
        var row = el("div", "ust-row tst-gt" + (isFocus ? " focus" : ""));
        var left = el("div", "tst-left");
        left.appendChild(el("span", "tr-bp s-" + r.st, r.type === "unique" ? "고유" : r.lbl));
        var meta = el("div", "tst-meta");
        meta.appendChild(el("b", null, unFmtN(r.n) + "판"));
        meta.appendChild(el("small", null, "빈도 " + r.freq.toFixed(2) + " (" + r.pick.toFixed(1) + "%)"));
        left.appendChild(meta);
        row.appendChild(left);

        var aEl = el("div", "ust-n");
        aEl.appendChild(dkGrad(el("b", null, fmt(r.avg)), trAvgT(r.avg)));
        row.appendChild(aEl);

        var t4El = el("div", "ust-n");
        t4El.appendChild(el("b", null, r.top4 + "%"));
        row.appendChild(t4El);

        var wEl = el("div", "ust-n");
        wEl.appendChild(el("b", null, r.win.toFixed(1) + "%"));
        row.appendChild(wEl);

        sec1.appendChild(row);
      });
      wrap.appendChild(sec1);
    }

    // 2) 이 시너지 쓰는 메타 덱
    var dks = trDecksUsing(name);
    if (dks.length) {
      var dSec = el("div", "ust-sec");
      var dh = el("div", "ust-sh");
      dh.appendChild(el("h4", null, "이 시너지 쓰는 메타 덱"));
      dSec.appendChild(dh);
      var dList = el("div", "ust-dks");
      dks.forEach(function (v) {
        var bs = basisSt(v.st, "emer"), bt = basisTier(v.st, "emer");
        var b = el("button", "ust-dk"); b.type = "button";
        b.appendChild(el("span", "dk-tbadge t-" + bt, bt === "X" ? "-" : bt));
        b.appendChild(el("span", "ust-dkn", deckName(v)));
        if (bs) b.appendChild(dkGrad(el("b", null, bs[0].toFixed(2)), dkAvgT(bs[0])));
        b.addEventListener("click", function () {
          if (opts.closeFn) opts.closeFn(function () { openDeck(v.id); });
          else { closeSheet(); openDeck(v.id); }
        });
        dList.appendChild(b);
      });
      dSec.appendChild(dList);
      wrap.appendChild(dSec);
    }

    // 3) 실시간 MetaTFT trait_detail: 함께 많이 쓰는 핵심 유닛·시너지 (Δ)
    var pickKey = opts.focusKey || (rows.length ? rows.slice().sort(function (a, b) { return b.n - a.n; })[0].k : null);
    if (LIVE && pickKey) {
      var detSlot = el("div", "tst-live");
      wrap.appendChild(detSlot);
      var renderDet = function (d) {
        if (!d || !detSlot.isConnected) return;
        var ov = d.overall && d.overall[0] && d.overall[0].places;
        if (!ov) return;
        var ovN = 0, ovS = 0;
        for (var i = 0; i < 8; i++) { ovN += ov[i] || 0; ovS += (ov[i] || 0) * (i + 1); }
        if (ovN < 30) return;
        var ovAvg = ovS / ovN;
        detSlot.innerHTML = "";
        var curRow = rows.filter(function (r) { return r.k === pickKey; })[0];
        var lbl = curRow ? (curRow.type === "unique" ? name : name + " " + curRow.lbl) : name;

        // 함께 많이 쓰는 핵심 유닛 (상위 6명)
        var us = (d.units || []).map(function (x) {
          var un = DB.names && DB.names.u && DB.names.u[x.units];
          var nm = un ? un[0] : null;
          if (!nm || !DB.units[nm]) return null;
          var p = x.places || [], n = 0, s = 0;
          for (var j = 0; j < 8; j++) { n += p[j] || 0; s += (p[j] || 0) * (j + 1); }
          if (n < Math.max(30, ovN * 0.05)) return null;
          var avg = s / n;
          return { nm: nm, n: n, avg: avg, d: avg - ovAvg };
        }).filter(Boolean).sort(function (a, b) { return b.n - a.n; }).slice(0, 6);

        if (us.length) {
          var uSec = el("div", "ust-sec");
          var uh = el("div", "ust-sh");
          var uh4 = el("h4", null, "함께 쓰는 핵심 유닛");
          uh4.appendChild(el("small", null, lbl + " 기준 · Δ 변화"));
          uh.appendChild(uh4); uSec.appendChild(uh);
          var pc = el("div", "pchips");
          us.forEach(function (x) {
            var c = el("span", "c");
            c.appendChild(unitChip(x.nm));
            c.appendChild(el("b", x.d <= -0.05 ? "good" : x.d >= 0.05 ? "bad" : "", (x.d > 0 ? "+" : "") + x.d.toFixed(2)));
            pc.appendChild(c);
          });
          uSec.appendChild(pc);
          detSlot.appendChild(uSec);
        }

        // 함께 켜는 시너지 (자기 자신 제외, 상위 5개)
        var myApi = inf && inf.api;
        var ts = (d.traits || []).map(function (x) {
          var k = x.traits || "";
          var m = /^(.+)_(\d+)$/.exec(k);
          if (!m || m[1] === myApi) return null;
          var tn = DB.names && DB.names.t && DB.names.t[m[1]];
          var nm = tn ? tn[0] : null;
          if (!nm || nm === name) return null;
          var p = x.places || [], n = 0, s = 0;
          for (var j = 0; j < 8; j++) { n += p[j] || 0; s += (p[j] || 0) * (j + 1); }
          if (n < Math.max(30, ovN * 0.06)) return null;
          var avg = s / n;
          var trRow = trRowsAll().filter(function (r) { return r.k === k; })[0];
          return { nm: nm, k: k, lbl: trRow ? (trRow.type === "unique" ? "" : trRow.lbl) : m[2], n: n, avg: avg, d: avg - ovAvg };
        }).filter(Boolean).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);

        if (ts.length) {
          var tSec = el("div", "ust-sec");
          var th = el("div", "ust-sh");
          var th4 = el("h4", null, "함께 켜는 시너지");
          th4.appendChild(el("small", null, "빈도순 · Δ 변화"));
          th.appendChild(th4); tSec.appendChild(th);
          var pc2 = el("div", "pchips");
          ts.forEach(function (x) {
            var c = el("span", "c tst-co");
            var sp = el("span", "tchip", x.nm + (x.lbl ? " " + x.lbl : ""));
            sp.dataset.trait = x.nm;
            c.appendChild(sp);
            c.appendChild(el("b", x.d <= -0.05 ? "good" : x.d >= 0.05 ? "bad" : "", (x.d > 0 ? "+" : "") + x.d.toFixed(2)));
            pc2.appendChild(c);
          });
          tSec.appendChild(pc2);
          detSlot.appendChild(tSec);
        }
      };

      if (TR_DET_CACHE[pickKey]) {
        renderDet(TR_DET_CACHE[pickKey]);
      } else {
        var detUrl = "https://api-hc.metatft.com/tft-stat-api/trait_detail?trait=" + encodeURIComponent(pickKey)
          + "&queue=" + (DB.pbe ? "PBE" : "1100") + "&patch=current&days=3"
          + (DB.pbe ? "" : "&rank=EMERALD,DIAMOND,MASTER,GRANDMASTER,CHALLENGER&permit_filter_adjustment=true");
        viaApp(detUrl).then(function (d) {
          if (d && d.overall) { TR_DET_CACHE[pickKey] = d; renderDet(d); }
        }).catch(function () {});
      }
    }

    return wrap;
  }
