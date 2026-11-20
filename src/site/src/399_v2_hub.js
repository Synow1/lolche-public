  /* ---- v2.0.0 허브 · 통합 스포트라이트 검색 · 테마 · 터치 제스처 · 프리즘 캔버스 ---- */
  var V2_TH_KEY = "tft-guide-theme";
  function v2ApplyTheme(mode) {
    var root = document.documentElement;
    if (mode === "dark" || mode === "light") root.setAttribute("data-theme", mode);
    else root.removeAttribute("data-theme");
    document.querySelectorAll("#theme-seg button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.th === (mode || "auto"));
    });
  }
  function v2ThemeInit() {
    var saved = "auto";
    try { saved = localStorage.getItem(V2_TH_KEY) || "auto"; } catch (e) {}
    v2ApplyTheme(saved);
    document.querySelectorAll("#theme-seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.dataset.th;
        try { localStorage.setItem(V2_TH_KEY, m); } catch (e) {}
        v2ApplyTheme(m);
      });
    });
  }

  /* ---- 홈 허브 렌더링 ---- */
  var V2_CHG = null;
  function homeRender() {
    var sec = document.getElementById("home"); if (!sec) return;
    // 1) 19시즌 히어로 KPI + 7코스트 가로 레일
    if (S19) {
      var dd = document.getElementById("hm-dday");
      if (dd) dd.textContent = "19시즌 PBE · " + s19DdayText();
      var upd = document.getElementById("hm-s19-upd");
      if (upd) upd.textContent = updAt(S19.pbe || S19.updated);
      var kpi = document.getElementById("hm-s19-kpi");
      if (kpi) {
        kpi.innerHTML = "";
        [
          [S19.units.length, "챔피언", "units"],
          [S19.traits.filter(function (t) { return !t.uniq; }).length, "시너지", "traits"],
          [S19.units.filter(function (u) { return u.unl; }).length, "해금", "unlock"],
          [S19.augs.filter(function (a) { return a.new; }).length, "새 증강", "augs"]
        ].forEach(function (x) {
          var b = el("button", "hm-k"); b.type = "button";
          b.appendChild(el("b", null, String(x[0])));
          b.appendChild(el("span", null, x[1]));
          b.addEventListener("click", function () { s19Jump(x[2], x[2] === "augs" ? { an: true } : null); });
          kpi.appendChild(b);
        });
      }
      var seven = S19.units.filter(function (u) { return u.c === 7 || (u.c === 5 && u.unl); })
        .sort(function (a, b) { return b.c - a.c || (b.unl ? 1 : 0) - (a.unl ? 1 : 0); })
        .slice(0, 12);
      var sw = document.getElementById("hm-s19-seven-wrap"), sr = document.getElementById("hm-s19-seven");
      if (sw && sr && seven.length) {
        sw.hidden = false; sr.innerHTML = "";
        seven.forEach(function (u) {
          var c = el("button", "hm-u7"); c.type = "button";
          c.appendChild(s19Pic(u, 48));
          c.appendChild(el("b", null, u.n));
          c.appendChild(el("small", null, u.c + "코" + (u.unl ? " · 해금" : "")));
          c.addEventListener("click", function () { s19OpenUnit(u); });
          sr.appendChild(c);
        });
      }
    }
    // 2) 지금 18시즌 상위 덱 TOP 4
    var dbox = document.getElementById("hm-decks");
    if (dbox && META && IDX) {
      var msub = document.getElementById("hm-meta-sub");
      if (msub) msub.textContent = "에메+ · 패치 " + (META.patch || "");
      var list = allViews().filter(function (v) { return v && basisSt(v.st, "emer"); })
        .sort(function (a, b) { return basisSt(a.st, "emer")[0] - basisSt(b.st, "emer")[0]; })
        .slice(0, 4);
      dbox.innerHTML = "";
      list.forEach(function (v) {
        var d = v.st, bt = basisTier(d, "emer"), bs = basisSt(d, "emer"), mc = mainOf(v);
        var r = el("button", "mt-row dk hm-dk t-" + bt); r.type = "button";
        r.appendChild(dkPortrait(mc, null));
        var mid = el("div", "mt-mid");
        var meta = el("div", "dk-meta");
        meta.appendChild(el("span", "dk-tbadge t-" + bt, bt === "X" ? "-" : bt));
        var mtxt = el("span", "dk-sub");
        if (d && d.style) mtxt.appendChild(document.createTextNode(styleKo(d.style)));
        var pl = perLobby(d, "emer");
        if (pl != null) { if (mtxt.textContent) mtxt.appendChild(document.createTextNode(" · ")); mtxt.appendChild(el("span", "dk-pl", "선택률 " + pl)); }
        if (mtxt.textContent) meta.appendChild(mtxt);
        mid.appendChild(meta);
        mid.appendChild(el("div", "mt-name", deckName(v)));
        var rest = starOrder(v.board, mc && mc.u).filter(function (b) { return b !== mc; }).slice(0, 6);
        mid.appendChild(strip(rest.map(function (b) { return b.u; })));
        r.appendChild(mid);
        var num = el("div", "mt-num dk-kpi2");
        num.appendChild(dkGrad(el("b", "dk-avg", bs[0].toFixed(2)), dkAvgT(bs[0])));
        num.appendChild(dkGrad(el("span", "dk-top4", "승률 " + bs[2].toFixed(1) + "%"), dkWinT(bs[2])));
        r.appendChild(num);
        r.addEventListener("click", function () { openDeck(v.id); });
        dbox.appendChild(r);
      });
    }
    // 3) 최근 데이터 변화 요약
    var cw = document.getElementById("hm-chg-wrap"), cb = document.getElementById("hm-chg");
    if (cw && cb && V2_CHG && V2_CHG.log && V2_CHG.log.length) {
      var latest = V2_CHG.log[0];
      if (latest && latest.items && latest.items.length) {
        cw.hidden = false; cb.innerHTML = "";
        cb.appendChild(el("div", "hm-chg-d", wnFmt(latest.id) + " 업데이트"));
        latest.items.slice(0, 3).forEach(function (it) {
          var row = el("button", "hm-chg-r"); row.type = "button";
          row.appendChild(el("b", null, it.name));
          row.appendChild(el("span", null, (it.lines || []).slice(0, 2).join(" · ")));
          row.addEventListener("click", function () { goTab(it.tab); });
          cb.appendChild(row);
        });
      }
    }
  }

  function homeInit() {
    var go = document.getElementById("hm-s19-go");
    if (go) go.addEventListener("click", function () { s19Jump("home"); });
    document.querySelectorAll("#home [data-s19]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.dataset.s19;
        s19Jump(v, v === "augs" ? { an: true } : null);
      });
    });
    var st = document.getElementById("hm-search-trig");
    if (st) st.addEventListener("click", function () { spotOpen(); });
    var wn = document.getElementById("hm-wn-open");
    if (wn) wn.addEventListener("click", function () { whatsNew("again"); });
    // 홈에서 필요한 19시즌·변화 데이터 선로딩
    s19Load().catch(function () {});
    fetch("changes.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      V2_CHG = d; homeRender();
    }).catch(function () {});
  }

  /* ---- 19시즌 프리즘 히어로 경량 Canvas 2D 오로라 리본 ---- */
  function v2PrismInit() {
    var cv = document.getElementById("hm-prism");
    if (!cv || reduce || OVERLAY) return;
    var ctx = cv.getContext && cv.getContext("2d");
    if (!ctx) return;
    var raf = 0, t = 0;
    function resize() {
      var rc = cv.getBoundingClientRect();
      if (!rc.width || !rc.height) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(rc.width * dpr);
      cv.height = Math.round(rc.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function frame() {
      raf = 0;
      if (document.hidden || current !== "home") return;
      var w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      t += 0.012;
      ctx.clearRect(0, 0, w, h);
      var dark = document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.getAttribute("data-theme") && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      var orbs = [
        { x: w * (0.78 + Math.sin(t * 0.9) * 0.12), y: h * (0.22 + Math.cos(t * 0.7) * 0.14), r: Math.max(w, h) * 0.52, c: dark ? "rgba(56,189,248,0.16)" : "rgba(3,105,161,0.10)" },
        { x: w * (0.20 + Math.cos(t * 0.6) * 0.14), y: h * (0.18 + Math.sin(t * 0.8) * 0.12), r: Math.max(w, h) * 0.48, c: dark ? "rgba(232,185,79,0.15)" : "rgba(154,103,0,0.09)" },
        { x: w * (0.55 + Math.sin(t * 0.5 + 1.4) * 0.18), y: h * (0.85 + Math.cos(t * 0.6) * 0.10), r: Math.max(w, h) * 0.42, c: dark ? "rgba(99,102,241,0.11)" : "rgba(79,70,229,0.07)" }
      ];
      orbs.forEach(function (o) {
        var g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0, o.c); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      });
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (reduce || OVERLAY || current !== "home" || document.hidden) return;
      resize();
      if (!raf) raf = requestAnimationFrame(frame);
    }
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) start(); });
    window.v2PrismKick = start;
    setTimeout(start, 120);
  }

  /* ---- 글로벌 통합 스포트라이트 검색 (초성 + 19시즌 + 18시즌·덱·템·증강·소환사) ---- */
  var spotScope = "all";
  function spotOpen(preset) {
    var ov = document.getElementById("spot-ov"), inp = document.getElementById("spot-q");
    if (!ov || !inp) return;
    if (ov.hidden) navPush("spot", spotClose);
    ov.hidden = false;
    document.body.classList.add("spot-open");
    if (!S19) s19Load().then(spotRender).catch(function () {});
    if (preset != null) inp.value = preset;
    spotRender();
    setTimeout(function () { inp.focus(); }, 40);
  }
  function spotClose() {
    var ov = document.getElementById("spot-ov");
    if (!ov) return;
    ov.hidden = true;
    document.body.classList.remove("spot-open");
  }
  function spotCloseUI() {
    var ov = document.getElementById("spot-ov");
    if (ov && !ov.hidden) navBack("spot", spotClose);
  }
  function spotGroup(box, title, rows) {
    if (!rows.length) return;
    box.appendChild(el("div", "spot-gh", title));
    rows.forEach(function (r) {
      var b = el("button", "spot-row"); b.type = "button";
      if (r.icon) {
        var im = img(r.icon, "");
        im.className = "spot-ic" + (r.round ? " round" : "") + (r.dark ? " dark" : "");
        b.appendChild(im);
      } else {
        b.appendChild(el("span", "spot-ic spot-dot", r.badge || "•"));
      }
      var m = el("div", "spot-m");
      m.appendChild(el("b", null, r.title));
      if (r.sub) m.appendChild(el("small", null, r.sub));
      b.appendChild(m);
      if (r.tag) b.appendChild(el("span", "spot-tag" + (r.tagCls ? " " + r.tagCls : ""), r.tag));
      b.addEventListener("click", function () {
        spotCloseUI();
        setTimeout(r.go, 90);
      });
      box.appendChild(b);
    });
  }
  function spotRender() {
    var box = document.getElementById("spot-res"), inp = document.getElementById("spot-q");
    if (!box || !inp) return;
    var q = inp.value.trim();
    box.innerHTML = "";
    if (!q) {
      spotGroup(box, "빠른 이동", [
        { badge: "19", title: "19시즌 프리즘 투어", sub: "시너지 · 7코스트 · 해금 · 스쿼드 빌더", tag: "PBE", tagCls: "cyan", go: function () { s19Jump("home"); } },
        { badge: "빌", title: "19시즌 스쿼드 빌더", sub: "챔피언 조합 시너지·해금 실시간 계산", tag: "19시즌", tagCls: "cyan", go: function () { s19Jump("builder"); } },
        { badge: "해", title: "19시즌 해금 조건", sub: "조건별 검색 · 암기 체크리스트", tag: "19시즌", tagCls: "cyan", go: function () { s19Jump("unlock"); } },
        { badge: "덱", title: "18시즌 메타 덱", sub: "에메+ 평균 등수 · 순방률 · 선택률", tag: "라이브", tagCls: "gold", go: function () { goTab("meta"); } },
        { badge: "재", title: "재료 → 덱", sub: "보유 재료 기반 추천 덱", tag: "도구", go: function () { goTab("parts"); } },
        { badge: "템", title: "아이템 티어표 · 조합표", sub: "조합템 · 찬란한 · 유물 · 상징", tag: "도감", go: function () { goTab("items"); } }
      ]);
      return;
    }
    var want19 = spotScope !== "live", wantLive = spotScope !== "s19";
    var total = 0;
    // 1) 19시즌 챔피언·시너지·증강
    if (want19 && S19) {
      var u19 = S19.units.filter(function (u) {
        return matches(u.n, q) || u.t.some(function (t) { return matches(t, q); }) || (u.unl && u.unl.c.some(function (c) { return matches(c, q); }));
      }).slice(0, 6).map(function (u) {
        return {
          icon: u.img, title: u.n,
          sub: u.c + "코 · " + u.t.join(" · ") + (u.unl ? " · 해금" : ""),
          tag: "19시즌", tagCls: "cyan",
          go: function () { s19OpenUnit(u); }
        };
      });
      total += u19.length;
      spotGroup(box, "19시즌 챔피언", u19);

      var t19 = S19.traits.filter(function (t) { return matches(t.n, q) || matches(t.en || "", q); }).slice(0, 5).map(function (t) {
        return {
          icon: t.img, dark: true, title: t.n,
          sub: (t.uniq ? "고유" : t.type === "ORIGIN" ? "계열" : "직업") + " · " + t.u.length + "명",
          tag: "19시즌", tagCls: "cyan",
          go: function () { s19OpenTrait(t); }
        };
      });
      total += t19.length;
      spotGroup(box, "19시즌 시너지", t19);

      var a19 = S19.augs.filter(function (a) { return matches(a.n, q); }).slice(0, 4).map(function (a) {
        return {
          icon: a.img, round: true, title: a.n,
          sub: (S19_TIER[a.tier] || "") + (a.new ? " · 새 증강" : ""),
          tag: "19증강", tagCls: "cyan",
          go: function () { s19Jump("augs", { q: a.n, an: false }); }
        };
      });
      total += a19.length;
      spotGroup(box, "19시즌 증강", a19);
    }
    // 2) 18시즌 메타 덱
    if (wantLive && META && IDX) {
      var dks = allViews().filter(function (v) {
        return v && (matches(deckName(v), q) || v.board.some(function (b) { return matches(b.u, q); }));
      }).slice(0, 5).map(function (v) {
        var bs = basisSt(v.st, "emer"), mc = mainOf(v), ic = mc && IDX.units[mc.u] && IDX.units[mc.u].icon;
        return {
          icon: ic, title: deckName(v),
          sub: bs ? ("에메+ 평균 " + bs[0].toFixed(2) + " · 승률 " + bs[2].toFixed(1) + "%") : "추천 덱",
          tag: basisTier(v.st, "emer") + " 티어", tagCls: "gold",
          go: function () { openDeck(v.id); }
        };
      });
      total += dks.length;
      spotGroup(box, "18시즌 메타 덱", dks);
    }
    // 3) 18시즌 유닛·아이템·증강·시너지
    if (wantLive && DB && IDX) {
      var us = Object.keys(DB.units).filter(function (n) { return matches(n, q); }).slice(0, 4).map(function (n) {
        var u = DB.units[n], ic = IDX.units[n];
        return {
          icon: ic && ic.icon, title: n,
          sub: u.cost + "코 · " + (u.traits || []).join(" · "),
          tag: "유닛", go: function () { openSheet("u", n); }
        };
      });
      total += us.length;
      spotGroup(box, "18시즌 유닛", us);

      var its = Object.keys(DB.info.i).filter(function (n) { return matches(n, q); }).slice(0, 5).map(function (n) {
        var inf = DB.info.i[n], ic = IDX.items[n];
        return {
          icon: ic && ic.icon, title: n,
          sub: inf.g || "아이템",
          tag: "아이템", go: function () { openSheet("i", n); }
        };
      });
      total += its.length;
      spotGroup(box, "아이템", its);

      var ags = Object.keys(DB.info.a).filter(function (n) { return matches(n, q); }).slice(0, 4).map(function (n) {
        var inf = DB.info.a[n];
        return {
          icon: IDX.augments[n], round: true, title: n,
          sub: [inf.r, inf.t ? inf.t + "티어" : ""].filter(Boolean).join(" · "),
          tag: "증강", go: function () { openSheet("a", n); }
        };
      });
      total += ags.length;
      spotGroup(box, "증강", ags);
    }
    // 4) 소환사 전적 검색 바로가기
    spotGroup(box, "소환사 전적", [{
      badge: "KR", title: '"' + q + '" 전적 검색',
      sub: "롤체지지 KR 전적·LP 그래프 조회", tag: "전적",
      go: function () {
        goTab("rank");
        var sb = document.querySelector('#rk-seg [data-v="search"]'); if (sb) sb.click();
        var rq = document.getElementById("rk-q");
        if (rq) { rq.value = q; rq.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); }
      }
    }]);
    if (!total) {
      box.insertBefore(el("p", "spot-none", "일치하는 도감·덱 항목이 없어요. 아래에서 소환사 전적을 바로 검색할 수 있어요"), box.firstChild);
    }
  }
  function spotInit() {
    var btn = document.getElementById("spot-btn"), ov = document.getElementById("spot-ov");
    var inp = document.getElementById("spot-q"), x = document.getElementById("spot-x");
    if (!btn || !ov || !inp) return;
    btn.addEventListener("click", function () { spotOpen(); });
    if (x) x.addEventListener("click", spotCloseUI);
    ov.addEventListener("click", function (e) { if (e.target === ov) spotCloseUI(); });
    inp.addEventListener("input", spotRender);
    document.querySelectorAll("#spot-scope button").forEach(function (b) {
      b.addEventListener("click", function () {
        spotScope = b.dataset.sc;
        document.querySelectorAll("#spot-scope button").forEach(function (k) { k.classList.toggle("on", k === b); });
        spotRender();
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !ov.hidden) { spotCloseUI(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); spotOpen(); return; }
      if (e.key === "/" && ov.hidden && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) { e.preventDefault(); spotOpen(); }
    });
  }

  /* ---- 바텀 시트 터치 스와이프 닫기 제스처 ---- */
  function v2SheetGesture() {
    var sy = 0, dy = 0, st = 0, dragging = false;
    document.addEventListener("touchstart", function (e) {
      var sh = document.getElementById("sheet");
      if (!sh || sh.hidden || !sh.contains(e.target)) return;
      if (sh.scrollTop > 2 && !e.target.closest(".sh-top")) return;
      sy = e.touches[0].clientY; dy = 0; st = Date.now(); dragging = true;
      sh.style.transition = "none";
    }, { passive: true });
    document.addEventListener("touchmove", function (e) {
      if (!dragging) return;
      var sh = document.getElementById("sheet"), bg = document.getElementById("sheet-bg");
      if (!sh || sh.hidden) { dragging = false; return; }
      dy = e.touches[0].clientY - sy;
      if (dy < 0) { dy = 0; return; }
      sh.style.transform = "translateY(" + dy + "px)";
      if (bg) bg.style.opacity = String(Math.max(0.15, 1 - dy / 340));
    }, { passive: true });
    document.addEventListener("touchend", function () {
      if (!dragging) return;
      dragging = false;
      var sh = document.getElementById("sheet"), bg = document.getElementById("sheet-bg");
      if (!sh) return;
      var fast = dy > 36 && (Date.now() - st) < 220;
      sh.style.transition = "transform .22s cubic-bezier(.2,.8,.2,1)";
      if (dy > 96 || fast) {
        sh.style.transform = "translateY(100%)";
        setTimeout(function () {
          sh.style.transition = ""; sh.style.transform = "";
          if (bg) bg.style.opacity = "";
          closeSheetUI();
        }, 180);
      } else {
        sh.style.transform = "";
        if (bg) bg.style.opacity = "";
        setTimeout(function () { sh.style.transition = ""; }, 230);
      }
    }, { passive: true });
  }
