  var navAfterPop = null;
  try { history.scrollRestoration = "manual"; history.replaceState({ nav: 0 }, ""); } catch (e) {}
  function navPush(k, undo) {
    if (navQuiet) return;
    NAV.push({ k: k, f: undo });
    try { history.pushState({ nav: NAV.length }, ""); } catch (e) {}
  }
  function navBack(k, direct, afterFn) {  // 화면 안의 닫기·뒤로 버튼: 기록 맨 위가 그거면 뒤로가기와 같게, 완료 후 afterFn 직렬 실행
    var top = NAV[NAV.length - 1];
    if (top && top.k === k && !top.dead) {
      if (afterFn) navAfterPop = afterFn;
      history.back();
      return;
    }
    for (var i = NAV.length - 1; i >= 0; i--) if (NAV[i].k === k && !NAV[i].dead) { NAV[i].dead = true; break; }
    direct();
    if (afterFn) afterFn();
  }
  function navUnwind(keys, direct, afterFn) {  // 시트 다단계처럼 연속된 기록을 한 번에 정확히 되감고 afterFn 실행
    var cnt = 0;
    for (var i = NAV.length - 1; i >= 0; i--) {
      if (keys.indexOf(NAV[i].k) >= 0 && !NAV[i].dead) cnt++;
      else break;
    }
    if (cnt > 0) {
      if (afterFn) navAfterPop = afterFn;
      history.go(-cnt);
      return;
    }
    for (var j = NAV.length - 1; j >= 0; j--) if (keys.indexOf(NAV[j].k) >= 0 && !NAV[j].dead) NAV[j].dead = true;
    direct();
    if (afterFn) afterFn();
  }
  window.addEventListener("popstate", function (ev) {
    var st = ev && ev.state;
    var target = (st && typeof st.nav === "number") ? st.nav : (st == null && NAV.length ? NAV.length - 1 : 0);
    if (target >= NAV.length) return;
    var runAfter = navAfterPop;
    navAfterPop = null;
    var ran = false;
    while (NAV.length > target) {
      var t = NAV.pop();
      if (!t || t.dead) continue;
      ran = true;
      navQuiet = true; try { t.f(); } finally { navQuiet = false; }
    }
    if (!ran && !runAfter && NAV.some(function (x) { return !x.dead; })) {
      history.back();
      return;
    }
    if (runAfter) { try { runAfter(); } catch (e) {} }
  });
  var sheetStack = [];
  function sheetEls() {
    var bg = document.getElementById("sheet-bg");
    if (bg) return [bg, document.getElementById("sheet")];
    bg = el("div", "sheet-bg"); bg.id = "sheet-bg"; bg.hidden = true;
    var sh = el("div", "sheet"); sh.id = "sheet"; sh.hidden = true;
    sh.setAttribute("role", "dialog"); sh.setAttribute("aria-modal", "true");
    bg.addEventListener("click", function () { closeSheetUI(); });
    document.body.appendChild(bg); document.body.appendChild(sh);
    return [bg, sh];
  }
  function closeSheet() {
    var e = sheetEls(); e[0].hidden = true; e[1].hidden = true; sheetStack = [];
  }
  function closeSheetUI(afterFn) {
    if (!sheetEls()[1].hidden) navUnwind(["sheet", "sheet-step"], closeSheet, afterFn);
    else if (afterFn) afterFn();
  }
  function stepSheetBack() {
    if (sheetStack.length > 1) { sheetStack.pop(); var p = sheetStack[sheetStack.length - 1]; openSheet(p[0], p[1], false); }
    else closeSheet();
  }
  function openSheet(kind, name, push) {
    var body = kind === "u" ? unitSheet(name) : kind === "i" ? itemSheet(name) : kind === "t" ? traitSheet(name) : augSheet(name);
    if (!body) return false;
    var e = sheetEls(), sh = e[1];
    if (sh.hidden) navPush("sheet", closeSheet);
    else if (push !== false) navPush("sheet-step", stepSheetBack);
    if (push !== false) sheetStack.push([kind, name]);
    sh.innerHTML = "";
    var top = el("div", "sh-top");
    if (sheetStack.length > 1) {
      var bk = el("button", "sh-btn", "←"); bk.type = "button"; bk.setAttribute("aria-label", "뒤로");
      bk.addEventListener("click", function () { navBack("sheet-step", stepSheetBack); });
      top.appendChild(bk);
    }
    top.appendChild(el("span", "sh-grab"));
    var x = el("button", "sh-btn", "✕"); x.type = "button"; x.setAttribute("aria-label", "닫기");
    x.addEventListener("click", function () { closeSheetUI(); }); top.appendChild(x);
    sh.appendChild(top); sh.appendChild(body);
    e[0].hidden = false; sh.hidden = false; sh.scrollTop = 0;
    return true;
  }
  function shHead(iconSrc, cost, title, sub) {
    var h = el("div", "sh-head");
    var f = el("div", "sh-face"); if (cost) f.dataset.c = cost;
    if (iconSrc) f.appendChild(img(iconSrc, ""));
    h.appendChild(f);
    var t = el("div"); t.appendChild(el("h3", null, title));
    if (sub) { var p = el("p"); if (typeof sub === "string") p.textContent = sub; else p.appendChild(sub); t.appendChild(p); }
    h.appendChild(t);
    return h;
  }
  function shSec(title) { var s = el("div", "sh-sec"); if (title) s.appendChild(el("h4", null, title)); return s; }
  function traitChip(name) { var s = el("span", "tchip", name); s.dataset.trait = name; return s; }
  function shAction(label, fn) {
    var b = el("button", "sh-act", label); b.type = "button";
    b.addEventListener("click", function () { closeSheetUI(fn); });
    return b;
  }

  function unitSheet(name) {
    var base = name.replace(/ \((AD|AP)\)$/, "");
    var ic = IDX.units[base], u = DB && DB.units[base];
    if (!ic && !u) return null;
    var cost = (u && u.cost) || (ic && ic.cost);
    var sub = el("span");
    sub.appendChild(document.createTextNode(cost + "코 "));
    ((u && u.traits) || []).forEach(function (t) { sub.appendChild(traitChip(t)); });
    var box = el("div");
    box.appendChild(shHead(ic && ic.icon, cost, base, sub));
    // 해금 챔피언이면 조건부터 (2026-11-21 사용자: "누르면 해금 조건도 챔 정보에"). 도감 챔피언 화면과 같은 상자
    var unl = unlockOf(base);
    if (unl) {
      var ub = el("div", "note gold s19-unl sh-unl"); ub.appendChild(el("b", null, "해금 조건" + (unl.lv ? " · " + unl.lv + "레벨부터" : "")));
      unl.c.forEach(function (c, i) { ub.appendChild(el("p", null, (unl.c.length > 1 ? (i ? "또는 " : "") : "") + c)); });
      box.appendChild(ub);
    }
    if (u) {
      var statsBlock = typeof buildUnitStatsBlock === "function" ? buildUnitStatsBlock(base, { mode: "sheet", closeFn: closeSheetUI }) : null;
      if (statsBlock) box.appendChild(statsBlock);
      if (u.skill && u.skill.desc) {
        // PBE 원문은 스킬 이름이 영어로 오는 챔피언이 있어 19시즌 도감(s19.json)의 한국어 이름을 먼저
        var s19u = S19 && S19.units && S19.units.filter(function (x) { return x.n.replace(/ \([^)]+\)$/, "") === base; })[0];
        var skn = s19u && s19u.sk && /[가-힣]/.test(s19u.sk.n || "") ? s19u.sk.n : u.skill.name;
        var s2 = shSec("스킬: " + skn);
        s2.appendChild(el("p", "sh-text", u.skill.desc));
        s2.appendChild(el("p", "fnote", u.stats));
        box.appendChild(s2);
      }
    }
    var acts = el("div", "sh-acts");
    if (u) acts.appendChild(shAction("챔피언 통계 표", function () { goTab("units"); }));
    if (u) acts.appendChild(shAction(tbUnits.indexOf(base) >= 0 ? "팀 빌더에서 제외" : "팀 빌더에 추가", function () {
      var i = tbUnits.indexOf(base);
      if (i >= 0) tbUnits.splice(i, 1); else if (tbUnits.length < 10) tbUnits.push(base);
      tbSave(); tbRender(); toast(i >= 0 ? base + " 제외했어요" : "팀 빌더에 " + base + " 추가했어요 · " + tbUnits.length + "/10");
    }));
    if (META) acts.appendChild(shAction("이 유닛 쓰는 덱", function () { goTab("meta"); metaBack(); document.getElementById("mt-q").value = base; metaList(); }));
    box.appendChild(acts);
    return box;
  }

  function itemSheet(name) {
    var inf = DB && DB.info.i[name], ic = IDX.items[name];
    if (!inf && !ic) return null;
    var box = el("div");
    box.appendChild(shHead(ic && ic.icon, null, name, inf ? inf.g : ""));
    var recipe = (inf && inf.r.length ? inf.r : ic && ic.recipe) || [];
    if (recipe.length) {
      var r = el("div", "sh-items");
      recipe.forEach(function (c, i) { if (i) r.appendChild(el("span", "op", "+")); r.appendChild(itemSpan(c, SHORT[c] || c)); });
      var s0 = shSec("조합"); s0.appendChild(r); box.appendChild(s0);
    }
    if (inf && (inf.s || inf.d)) {
      var s1 = shSec("효과");
      if (inf.s) s1.appendChild(el("p", "sh-stat", inf.s));
      if (inf.d) s1.appendChild(el("p", "sh-text", inf.d));
      if (USE[name]) s1.appendChild(el("p", "fnote", USE[name]));
      box.appendChild(s1);
    }
    var st = ITEMS && (ITEMS.tiers.emer || ITEMS.tiers.all).items[name];
    if (st) {
      var sx = shSec("성적 · 에메+ 최근 3일"), kv = el("div", "sh-kv");
      [["등급", st[4]], ["평균", st[1].toFixed(2)], ["순방", st[2] + "%"], ["승률", st[3] + "%"]].forEach(function (k) { var sp = el("span", null, k[0]); sp.appendChild(el("b", null, k[1])); kv.appendChild(sp); });
      ["low", "top"].forEach(function (k) { var v = ITEMS.tiers[k] && ITEMS.tiers[k].items[name]; if (v) { var sp = el("span", null, RANK_LABEL[k]); sp.appendChild(el("b", null, v[1].toFixed(2))); kv.appendChild(sp); } });
      sx.appendChild(kv); box.appendChild(sx);
    }
    var us = ITEMS && ITEMS.units[name];
    if (us && us.length) {
      var su = shSec("챔피언별 · 다이아+"), uh = el("div", "sh-items");
      us.slice(0, 10).forEach(function (u) {
        var c = el("span", "sh-holder st"); c.appendChild(unitChip(u[0]));
        var b = el("b", u[2] <= 4.2 ? "good" : u[2] >= 4.7 ? "bad" : null, u[2].toFixed(2)); b.appendChild(el("small", null, u[1] >= 1e4 ? Math.round(u[1] / 1e3) + "k" : u[1])); c.appendChild(b); uh.appendChild(c);
      });
      su.appendChild(uh); box.appendChild(su);
      var ua = el("div", "sh-acts");
      ua.appendChild(shAction("아이템 검색에서 보기", function () { goTab("find"); setFindMode("i"); findShow("i", name, false); }));
      box.appendChild(ua);
    }
    var holders = !us && DB && DB.items[name];
    if (holders && holders.length) {
      var s2 = shSec("누구한테 주나 · 다이아+");
      var hs = el("div", "sh-items");
      holders.slice(0, 6).forEach(function (h) { var c = el("span", "sh-holder"); c.appendChild(unitChip(h[0])); c.appendChild(el("b", null, h[1].toFixed(2))); hs.appendChild(c); });
      s2.appendChild(hs); box.appendChild(s2);
      var acts = el("div", "sh-acts");
      acts.appendChild(shAction("아이템 검색에서 보기", function () { goTab("find"); setFindMode("i"); findShow("i", name, false); }));
      box.appendChild(acts);
    }
    return box;
  }

  function traitSheet(name) {
    var inf = DB && DB.info.t[name];
    if (!inf) return null;
    var box = el("div");
    var kind = { origin: "계열", class: "직업", unique: "고유" }[inf.type] || "";
    var th = shHead(IDX.traits[name], null, name, kind);
    th.querySelector(".sh-face").classList.add("dark");  // 시너지 아이콘은 흰 그림이라 어두운 바탕
    box.appendChild(th);
    if (inf.u.length) {
      var s0 = shSec("기물");
      var us = el("div", "sh-items"); inf.u.forEach(function (u) { us.appendChild(unitChip(u[0])); });
      s0.appendChild(us); box.appendChild(s0);
    }
    var s1 = shSec("단계별 효과 · 에메+ 평균 등수");
    if (inf.d) s1.appendChild(el("p", "sh-text", inf.d));
    inf.e.forEach(function (e) {
      var row = el("div", "sh-tier");
      row.appendChild(el("b", null, e[0]));
      row.appendChild(el("span", null, e[1].replace(/^\(\d+\)\s*/, "") || "-"));
      row.appendChild(el("em", null, e[2] != null ? e[2].toFixed(2) : ""));
      s1.appendChild(row);
    });
    if (inf.p) s1.appendChild(el("p", "sh-text sh-post", inf.p));
    box.appendChild(s1);
    return box;
  }

  function augSheet(name) {
    var inf = DB && DB.info.a[name];
    if (!inf) return null;
    var box = el("div");
    var ah = shHead(IDX.augments[name], null, name, [inf.r, inf.t ? inf.t + "티어" : ""].filter(Boolean).join(" · "));
    var aim = ah.querySelector(".sh-face img"); if (aim) aim.dataset.r = inf.r;
    box.appendChild(ah);
    var s = shSec(); s.appendChild(el("p", "sh-text", inf.d)); box.appendChild(s);
    return box;
  }

  function setFindMode(mode) {
    var b = document.querySelector('.seg button[data-mode="' + mode + '"]');
    if (b && !b.classList.contains("on")) b.click();
  }

  // 무엇을 눌렀는지 알아낸다. 버튼·링크 안(덱 줄, 유닛 고르기 등)은 원래 동작을 둔다.
  function inspectTarget(t) {
    var hit = t.closest("[data-unit], [data-item], [data-trait], [data-aug], .u, .it, .ag, img.tr[data-t], .tchips span");
    if (!hit || hit.closest("[data-oldset]") || t.closest("button, a, summary, input, select, label")) return null;
    if (hit.dataset.unit) return ["u", hit.dataset.unit];
    if (hit.dataset.item) return ["i", hit.dataset.item];
    if (hit.dataset.trait) return ["t", hit.dataset.trait];
    if (hit.dataset.aug) return ["a", hit.dataset.aug];
    if (hit.matches("img.tr")) return ["t", hit.dataset.t];
    if (hit.classList.contains("u")) return ["u", hit.textContent.trim()];
    if (hit.classList.contains("it")) return ["i", hit.dataset.i || hit.textContent.trim()];
    if (hit.classList.contains("ag")) return ["a", hit.textContent.trim()];
    if (hit.parentNode.classList.contains("tchips")) return ["t", hit.textContent.replace(/\s*\d+$/, "").trim()];
    return null;
  }
  function setupInspect() {
    document.addEventListener("click", function (e) {
      if (!IDX) return;
      var t = inspectTarget(e.target);
      if (!t) return;
      if (openSheet(t[0], t[1])) { e.preventDefault(); e.stopPropagation(); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheetUI(); });
  }

  /* ---- 실행 환경 구분: 안드로이드 앱(APP / OVERLAY) · PC 웹(WEB) ---- */
  var APP = location.hostname === "lolche.local" && !!window.LolcheApp;
  var OVERLAY = APP && /overlay=1/.test(location.search);
  var WEB = !APP && !(window.claude && window.claude.use);
  var LIVE = APP || WEB;
  function isWide() { return !OVERLAY && window.innerWidth >= 1024; }
  function reloadErr() { return WEB ? "불러오지 못했어요. 페이지를 새로고침해 주세요" : "불러오지 못했어요. 앱을 다시 열어 주세요"; }
  // 받은 업데이트보다 옛 페이지가 떠 있으면 (업데이트를 갈아 끼우는 순간 열린 경우 등) 다시 연다. 무한 반복은 2번까지
  if (APP) try {
    var myWeb = (document.querySelector('meta[name="lolche-web"]') || {}).content, curWeb = window.LolcheApp.webVersion ? window.LolcheApp.webVersion() : "";
    if (myWeb && curWeb && curWeb > myWeb) {
      var tries = +(sessionStorage.getItem("lolche-stale") || 0);
      if (tries < 2) { sessionStorage.setItem("lolche-stale", tries + 1); location.reload(); }
    } else sessionStorage.removeItem("lolche-stale");
  } catch (e) {}
  var SET_ID = "__SET_ID__";  // scripts/setinfo.py 공략·도감 기준 세트 (TFTSet19)
  var LIVE_SET_ID = "__LIVE_SET_ID__";  // 본섭 랭크·전적 기준 세트 (12/1 전까지 TFTSet18, 출시 후 TFTSet19)
  // 손으로 쓴 세트 전용 글(data-set="18": 수호령·패치 노트·덱별 추천템 등)은 세트가 바뀌면 숨긴다. 탭 전체면 안내 한 줄 (세트 19 대비, 2026-11-16)
  document.querySelectorAll("[data-set]").forEach(function (e) {
    if ("TFTSet" + e.dataset.set === SET_ID) return;
    e.hidden = true;
    if (e.tagName === "SECTION") { var n = document.createElement("section"); n.id = e.id; e.id = e.id + "-old"; n.innerHTML = '<p class="empty">새 시즌 내용은 준비 중이에요</p>'; e.parentNode.insertBefore(n, e); }
  });
  var QUEUE = { 1090: "일반", 1100: "랭크", 1130: "초고속", 1160: "더블업" };

  function setupApp() {
    if (WEB) { document.body.classList.add("web"); return; }
    if (!APP) return;
    document.body.classList.add(OVERLAY ? "overlay" : "app");
    if (OVERLAY) return;  // 떠있는 창은 앱 쪽 윗줄에 옮기기·크기·접기 버튼이 있다
    document.getElementById("more-app").hidden = false;
    var bub = document.getElementById("ab-bubble"); bub.hidden = false;
    bub.addEventListener("click", function () { window.LolcheApp.startBubble(); });
    document.getElementById("app-on").addEventListener("click", function () { window.LolcheApp.startBubble(); });
    document.getElementById("app-off").addEventListener("click", function () { window.LolcheApp.stopBubble(); toast("버튼을 껐어요"); });
    document.getElementById("app-upd").addEventListener("click", function () {
      if (window.LolcheApp.checkUpdate) window.LolcheApp.checkUpdate();
      else toast("앱을 완전히 종료한 뒤 다시 열면 업데이트를 확인해요");
    });
  }

  // 외부 요청 통합: 앱은 안드로이드 프록시(/proxy?u=), PC 웹은 브라우저가 직접 fetch
  function fetchUrl(u) {
    return fetch(APP ? "/proxy?u=" + encodeURIComponent(u) : u);
  }
  function viaApp(u) {
    if (!LIVE) return Promise.reject(new Error("앱이나 PC 웹에서 이용할 수 있어요"));
    return fetchUrl(u).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ("HTTP " + r.status)); });
      return r.json();
    });
  }
  function viaAppText(u) {
    if (!LIVE) return Promise.reject(new Error("앱이나 PC 웹에서 이용할 수 있어요"));
    return fetchUrl(u).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }

  // 작업 세션 (claude.ai 페이지의 '갱신 요청' 버튼이 Claude Code Remote 커넥터로 메시지를 보냄. WEB에서는 미사용)
  var SESSION = "session_01VCcDCEg6hT8M9R4abL4j3G";


  var links = Array.prototype.slice.call(document.querySelectorAll("nav.tabs a"));
  var secs = links.map(function (a) { return document.querySelector(a.getAttribute("href")); });
  var nav = document.querySelector("nav.tabs");
  var TAB_KEY = /overlay=1/.test(location.search) ? "tft-guide-tab-overlay" : "tft-guide-tab";
  var current = null;
  function goTab(id) {  // 버튼·링크로 탭을 옮길 때: 뒤로가기로 직전 탭·스크롤 위치로 정확히 복원
    if (current === id) {
      if (!isWide() && id === "meta" && !document.getElementById("mt-detail").hidden) { navBack("deck", metaBack); return; }
      if (!isWide() && id === "tfa" && !document.getElementById("tfa-detail").hidden) { navBack("tfa", tfaBack); return; }
      window.scrollTo(0, 0);
      return;
    }
    var prev = current, y = window.scrollY;
    if (prev && prev !== id) navPush("tab", function () { applyTab(prev, false, y); });
    showTab(id, true);
  }
  var DECK_TABS = ["meta", "units", "tfa", "parts", "emb"], DECK_KEY = "tft-guide-decktab", deckLast = "meta";
  var RANK_TABS = ["rank", "friends", "power"], RANK_KEY = "tft-guide-ranktab", rankLast = "rank";
  try { var dl = localStorage.getItem(DECK_KEY); if (DECK_TABS.indexOf(dl) >= 0) deckLast = dl; } catch (e) {}
  try { var rl = localStorage.getItem(RANK_KEY); if (RANK_TABS.indexOf(rl) >= 0) rankLast = rl; } catch (e) {}
  var TAB_Y = {};
  function applyTab(id, scroll, restoreY) {
    if (!secs.some(function (s) { return s && s.id === id; })) id = secs[0].id;
    var same = current === id;
    if (current && !same) TAB_Y[current] = window.scrollY;
    current = id;
    secs.forEach(function (s) { if (s) s.hidden = s.id !== id; });
    links.forEach(function (a) {
      var on = a.getAttribute("href") === "#" + id;
      a.classList.toggle("on", on);
      a.setAttribute("aria-selected", on ? "true" : "false");
      if (on && a.scrollIntoView) a.scrollIntoView({ block: "nearest", inline: "center" });
    });
    if (restoreY != null) window.scrollTo(0, restoreY);
    else if (scroll) window.scrollTo(0, same ? 0 : TAB_Y[id] || 0);  // 다른 탭에서 돌아오면 보던 위치, 같은 탭을 다시 누르면 맨 위
    if (id === "home") { setTimeout(homeRender, 0); if (window.v2PrismKick) setTimeout(window.v2PrismKick, 60); }
    if (id === "meta" && isWide() && META) setTimeout(metaEnsureWide, 0);
    if (id === "units") setTimeout(unitsRender, 0);
    if (id === "tfa") setTimeout(tfaRender, 0);
    if (id === "s19") setTimeout(s19Render, 0);
    var isDeck = DECK_TABS.indexOf(id) >= 0, isRank = RANK_TABS.indexOf(id) >= 0;
    if (isDeck) { deckLast = id; try { localStorage.setItem(DECK_KEY, id); } catch (e) {} }
    if (isRank) { rankLast = id; try { localStorage.setItem(RANK_KEY, id); } catch (e) {} }
    var dLink = document.querySelector('.bnav a[data-nav="decks"]');
    if (dLink) dLink.setAttribute("href", "#" + deckLast);
    var rLink = document.querySelector('.bnav a[data-nav="rank"]');
    if (rLink) rLink.setAttribute("href", "#" + rankLast);
    var navId = id === "home" ? "home" : id === "s19" ? "dex" : isDeck ? "decks" : isRank ? "rank" : "more";
    var lab = links.filter(function (a) { return a.getAttribute("href") === "#" + id; })[0];
    document.getElementById("ab-title").textContent = (id === "home" || id === "meta") ? "롤체 노트" : lab ? lab.textContent : "롤체 노트";
    document.querySelectorAll(".bnav a").forEach(function (a) { a.classList.toggle("on", a.dataset.nav === navId); });
    document.querySelectorAll(".pc-side-extra a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + id); });
    try { localStorage.setItem(TAB_KEY, id); } catch (e) {}
    if (id === "esports") setTimeout(function () { apacLiveIfDue(false); lvIfDue(false); }, 0);
    if (id === "dc") setTimeout(dcStart, 0);
    if (id === "rank") setTimeout(function () { rkRefresh(false); }, 0);
    if (id === "friends") setTimeout(function () { frSyncAll(false); }, 0);
    if (id === "power") setTimeout(pwRender, 0);
    if (id === "parts") setTimeout(ptRender, 0);
  }
  function showTab(id, scroll, restoreY) {
    if (restoreY == null && !reduce && !navigator.webdriver && current && current !== id && document.startViewTransition) {
      try { document.startViewTransition(function () { applyTab(id, scroll); }); return; } catch (e) {}
    }
    applyTab(id, scroll, restoreY);
  }
  // 아래 탭·더보기·서브 전환·글 속 링크 모두 같은 탭 전환으로
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.closest("nav.tabs")) return;
    var id = a.getAttribute("href").slice(1);
    if (document.getElementById(id) && document.getElementById(id).tagName === "SECTION") {
      e.preventDefault();
      goTab(id);
    }
  });
  window.addEventListener("hashchange", function () {
    if (navQuiet) return;
    var h = (location.hash || "").slice(1);
    if (h && h !== current) showTab(h, true);
  });
  // PC(1024px+) ↔ 모바일 폭 전환 시 덱 목록·상세 2단 레이아웃 동기화
  if (window.matchMedia) {
    var wideMQ = window.matchMedia("(min-width: 1024px)");
    var onWideChange = function () {
      var ml = document.getElementById("mt-list-view"), md = document.getElementById("mt-detail");
      var tl = document.getElementById("tfa-list"), td = document.getElementById("tfa-detail");
      if (isWide()) {
        if (ml) ml.hidden = false;
        if (META) metaEnsureWide();
        if (tl) tl.hidden = false;
        if (TFA && tfaView === "comps") tfaRender();
      } else {
        if (META && document.querySelector("#mt-rows.pc-rows")) { pcHome(); metaList(); }  // PC 줄 -> 폰 줄
        if (ml && md && !ml.hidden && !md.hidden) md.hidden = true;
        if (tl && td && !tl.hidden && !td.hidden) td.hidden = true;
      }
      if (current === "s19" && S19) s19Render();
    };
    if (wideMQ.addEventListener) wideMQ.addEventListener("change", onWideChange);
    else if (wideMQ.addListener) wideMQ.addListener(onWideChange);
  }
  function mark() { if (current) showTab(current, false); }
  links.forEach(function (a) {
    a.setAttribute("role", "tab");
    a.addEventListener("click", function (e) { e.preventDefault(); showTab(a.getAttribute("href").slice(1), true); });
  });
  var start = (location.hash || "").slice(1);
  if (!start) { try { start = localStorage.getItem(TAB_KEY) || ""; } catch (e) {} }
  v2ThemeInit();
  setupApp();
  setupInspect();
  homeInit();
  spotInit();
  v2SheetGesture();
  showTab(start || "home", false);
  v2PrismInit();
  setupMetaRefresh();
  rkUpdSetup();
  var oldReady = LIVE_SET_ID !== SET_ID ? loadOld() : Promise.resolve(null);  // 본섭 18시즌 전적·랭킹·덱파워 사전 선로딩

  // 덱파워 모델은 다른 데이터를 기다리지 않고 바로 받는다. 실패하면 3초 뒤 한 번 더 (18시즌 본섭 + 19시즌 PBE)
  (function loadPower(n) {
    fetch("power.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(powerReady)
      .catch(function () { if (n < 1) setTimeout(function () { loadPower(n + 1); }, 3000); });
  })(0);
  fetch("power_s19.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d) powerReadyS19(d); }).catch(function () {});
  fetch("power_top_s19.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d) { PW_TOP_S19 = d; if (current === "power") pwRender(); } }).catch(function () {});
  fetch("icons/index.json").then(function (r) { return r.json(); }).then(function (d) {
    IDX = d; decorate(); buildGrid(); buildCompList(); buildEmblems(); mark();
    fetch("esports.json").then(function (r) { return r.json(); }).then(buildEsports).catch(function () {
      document.getElementById("esp-list").textContent = reloadErr();
    });
    fetch("guides.json").then(function (r) { return r.json(); }).then(function (g) { buildGuides(g); homeRender(); }).catch(function () {});
    fetch("version.json").then(function (r) { return r.json(); }).then(buildVersion).catch(function () {});
    fetch("tfa.json").then(function (r) { return r.json(); }).then(function (d) { TFA = d; if (current === "tfa") tfaRender(); }).catch(function () {
      var b = document.getElementById("tfa-out"); if (b) b.innerHTML = '<p class="empty">' + reloadErr() + '</p>';
    });
    document.querySelectorAll("#tfa-view button").forEach(function (b) { b.addEventListener("click", function () { tfaView = b.dataset.v; tfaSave(); tfaRender(); }); });
    fetch("dist.json").then(function (r) { return r.json(); }).then(function (d) { DISTH = d; }).catch(function () {});
    Promise.all([fetch("power_top.json").then(function (r) { return r.json(); }), oldReady]).then(function (x) { PW_TOP = x[0]; if (current === "power") pwRender(); }).catch(function () {});
    document.querySelectorAll("#pw-src button").forEach(function (b) { b.addEventListener("click", function () { pwSrc = b.dataset.s; pwRender(); }); });
    fetch("rank_hist.json").then(function (r) { return r.json(); }).then(function (d) { RK_HIST = d; if (rkRows && rkRows.length) rkRender(document.getElementById("rk-note").textContent); }).catch(function () {});
    fetch("cutoffs.json").then(function (r) { return r.json(); }).then(function (d) {
      CUTH = d;
      var h = d[dakSeason()] || {}, ks = Object.keys(h).sort().filter(function (k) { return h[k][1] != null; }), k = ks[ks.length - 1];
      if (k && !CUT_NOW) { CUT_NOW = { c: h[k][0], g: h[k][1], t: Date.parse(k + "T12:00:00+09:00") }; if (rkCut) rkCutoff(rkCut); }
    }).catch(function () {}).then(function () {
      if (!LIVE) return;  // 앱·웹 모두 롤체지지에서 시즌 컷 기록을 바로 받는다 (롤체지지 티어 그래프 점선과 같은 값)
      dakGet("data/summoner-tier-cutoffs?shard=kr&season=" + dakSeason()).then(function (r) {
        var h = {};
        (r.summonerTierCutoffs || []).forEach(function (x) {
          var k = { CHALLENGER: 0, GRANDMASTER: 1 }[x.tier]; if (k == null) return;
          Object.keys(x.leaguePoints || {}).forEach(function (d) { var key = d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6); (h[key] = h[key] || [null, null])[k] = x.leaguePoints[d]; });
        });
        if (Object.keys(h).length) { CUTH = CUTH || {}; CUTH[dakSeason()] = h; }
      }).catch(function () {});
    });
    fetch("meta.json").then(function (r) { return r.json(); }).then(function (m) { buildMeta(m); homeRender(); }).catch(function () {
      document.getElementById("mt-rows").textContent = reloadErr();
    });
    var dbReady = Promise.all([fetch("db.json").then(function (r) { return r.json(); }), oldReady]).then(function (x) { buildFind(x[0]); }).catch(function () {
      document.getElementById("find-sub").textContent = reloadErr();
    });
    Promise.all([fetch("items.json").then(function (r) { return r.json(); }), dbReady]).then(function (x) { buildItems(x[0]); }).catch(function () {
      document.getElementById("it-rows").textContent = reloadErr();
    });
  }).catch(function () {
    document.getElementById("picked").textContent = reloadErr();
  });
})();
