  /* ---- 19시즌(프리즘 투어) 미리보기 탭 (2026-11-18 사용자: "19시즌 탭을 아예 새로 만들어, 공부하기 쉽게 야무지게")
     site/s19.json (scripts/build_s19.py: MetaTFT PBE 원문 + 롤체지지 한국어). 보기: 개요·시너지·챔피언·해금·증강·아이템 ---- */
  var S19 = null, S19_KEY = "tft-guide-s19", s19St = { v: "home", tf: "all", cf: 0, af: 0, an: false, q: "" };
  try { var s19s = JSON.parse(localStorage.getItem(S19_KEY) || "null"); if (s19s) for (var k19 in s19s) s19St[k19] = s19s[k19]; s19St.q = ""; } catch (e) {}
  function s19Save() { try { localStorage.setItem(S19_KEY, JSON.stringify({ v: s19St.v, tf: s19St.tf, cf: s19St.cf, af: s19St.af, an: s19St.an })); } catch (e) {} }
  var S19_COST = { 1: "c1", 2: "c2", 3: "c3", 4: "c4", 5: "c5", 7: "c7" };
  var S19_TIER = { 1: "실버", 2: "골드", 3: "프리즘" };
  function s19Unit(k) { return S19 && S19.units.filter(function (u) { return u.k === k; })[0]; }
  function s19Trait(n) { return S19 && S19.traits.filter(function (t) { return t.n === n || t.k === n; })[0]; }
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
  function s19Text(s) {  // 원문 줄바꿈을 살린 글
    var p = el("p", "s19-txt"); (s || "").split("\n").forEach(function (l, i) { if (i) p.appendChild(document.createElement("br")); p.appendChild(document.createTextNode(l)); }); return p;
  }
  function s19Load() {
    if (S19) return Promise.resolve(S19);
    return fetch("s19.json").then(function (r) { return r.json(); }).then(function (d) { S19 = d; return d; });
  }
  function s19Render() {
    var out = document.getElementById("s19-out"), tools = document.getElementById("s19-tools");
    if (!out) return;
    document.querySelectorAll("#s19-view button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === s19St.v); });
    if (!S19) { out.innerHTML = '<p class="empty">불러오는 중</p>'; s19Load().then(s19Render).catch(function () { out.innerHTML = '<p class="empty">불러오지 못했어요. 앱을 다시 열어 주세요</p>'; }); return; }
    var rel = S19.release ? (+S19.release.slice(5, 7)) + "/" + (+S19.release.slice(8, 10)) : "";
    document.getElementById("s19-meta").textContent = (rel ? rel + " 출시 예정 · " : "") + "PBE " + updAt(S19.pbe || S19.updated) + " · 출시 전이라 수치가 바뀔 수 있어요";
    tools.innerHTML = ""; out.innerHTML = "";
    ({ home: s19Home, traits: s19Traits, units: s19Units, unlock: s19Unlocks, augs: s19Augs, items: s19Items })[s19St.v](out, tools);
  }
  function s19Go(v) { s19St.v = v; s19Save(); s19Render(); window.scrollTo(0, 0); }
  function s19Search(tools, ph) {
    var i = el("input", "s19-q"); i.type = "search"; i.placeholder = ph; i.value = s19St.q;
    i.addEventListener("input", function () { s19St.q = i.value; var pos = i.selectionStart; s19Render(); var j = document.querySelector("#s19-tools .s19-q"); if (j) { j.focus(); try { j.setSelectionRange(pos, pos); } catch (e) {} } });
    tools.appendChild(i);
  }
  function s19Chips(tools, list, cur, set) {
    var c = el("div", "mt-chips s19-chips");
    list.forEach(function (x) { var b = el("button", x[0] === cur ? "on" : null, x[1]); b.type = "button"; b.addEventListener("click", function () { set(x[0]); s19Save(); s19Render(); }); c.appendChild(b); });
    tools.appendChild(c);
  }
  function s19Match(s) { var q = s19St.q.trim().toLowerCase(); return !q || (s || "").toLowerCase().indexOf(q) >= 0; }

  // 개요: 숫자 한눈에, 공부 순서, 돌아온 시너지, 7코스트, 새 규칙
  function s19Home(out) {
    var U = S19.units, kp = el("div", "s19-kpi");
    [["챔피언", U.length, "units"], ["시너지", S19.traits.filter(function (t) { return !t.uniq; }).length, "traits"], ["해금 챔피언", U.filter(function (u) { return u.unl; }).length, "unlock"], ["새 증강", S19.augs.filter(function (a) { return a.new; }).length, "augs"]].forEach(function (x) {
      var b = el("button", "s19-k"); b.type = "button"; b.appendChild(el("b", null, x[1])); b.appendChild(el("small", null, x[0]));
      b.addEventListener("click", function () { if (x[2] === "augs") s19St.an = true; s19Go(x[2]); }); kp.appendChild(b);
    });
    out.appendChild(kp);
    var how = el("div", "s19-card"); how.appendChild(el("h3", null, "공부 순서"));
    var ol = el("ol", "s19-steps");
    [["계열 시너지부터", "시너지 보기에서 '계열'만 골라 이름과 마지막 단계 효과를 훑어요. 덱의 뼈대예요", "traits"],
     ["코스트별 캐리", "챔피언 보기에서 4·5코스트 스킬과 1~3성 수치를 봐요. 캐리 후보가 보여요", "units"],
     ["해금 조건", "이번 시즌 핵심이에요. 조건을 채워야 상점에 나오는 챔피언이 있어요", "unlock"],
     ["새 증강", "프리즘·골드부터 '새 증강'만 걸러 봐요", "augs"],
     ["상징", "조합할 수 있는 상징과 못 하는 상징이 나뉘어요", "items"]].forEach(function (x, i) {
      var li = el("li"); var b = el("button", "s19-step"); b.type = "button";
      b.appendChild(el("b", null, (i + 1) + ". " + x[0])); b.appendChild(el("small", null, x[1]));
      b.addEventListener("click", function () { if (x[2] === "traits") s19St.tf = "ORIGIN"; if (x[2] === "augs") s19St.an = true; s19Go(x[2]); });
      li.appendChild(b); ol.appendChild(li);
    });
    how.appendChild(ol); out.appendChild(how);
    var seven = U.filter(function (u) { return u.c === 7; });
    if (seven.length) {
      var c7 = el("div", "s19-card"); c7.appendChild(el("h3", null, "7코스트 챔피언"));
      c7.appendChild(el("p", "sub", "이번 시즌에 새로 생긴 가장 비싼 칸이에요. 대부분 해금 조건이 있어요"));
      var r7 = el("div", "s19-urow"); seven.forEach(function (u) { r7.appendChild(s19UnitBtn(u)); }); c7.appendChild(r7); out.appendChild(c7);
    }
    var back = S19.traits.filter(function (t) { return t.back && t.back.length && !t.uniq; });
    if (back.length) {
      var cb = el("div", "s19-card"); cb.appendChild(el("h3", null, "돌아온 시너지"));
      cb.appendChild(el("p", "sub", "예전 세트에 있던 이름이에요. 효과는 새로 바뀌었을 수 있어요"));
      var rb = el("div", "s19-tchips");
      back.forEach(function (t) { var b = el("button", "s19-tchip"); b.type = "button"; b.appendChild(s19Ti(t, 18)); b.appendChild(el("span", null, t.n)); b.appendChild(el("small", null, "세트 " + t.back.join("·"))); b.addEventListener("click", function () { s19OpenTrait(t); }); rb.appendChild(b); });
      cb.appendChild(rb); out.appendChild(cb);
    }
    var rules = el("div", "s19-card"); rules.appendChild(el("h3", null, "알아 둘 새 규칙"));
    var ul = el("ul", "s19-rules");
    [["해금", "일부 챔피언은 조건(예: 시너지 별 레벨 총합, 아이템 장착, 연승)을 채워야 상점에 나와요. 알리스타·징크스처럼 7레벨부터 조건을 세는 챔피언도 있어요"],
     ["프리즘 퀘스트", "K/DA·HEARTSTEEL·펜타킬·Ionic Spark는 상징 말고도 프리즘 퀘스트 아이템이 있어요"],
     ["고유 시너지", "챔피언 한 명만 가진 시너지가 많아요. 그 챔피언을 넣는 순간 켜져요"],
     ["출처", "MetaTFT PBE 원문과 롤체지지 한국어 데이터예요. 영어로만 있던 글은 번역했어요"]].forEach(function (x) { var li = el("li"); li.appendChild(el("b", null, x[0])); li.appendChild(document.createTextNode(" " + x[1])); ul.appendChild(li); });
    rules.appendChild(ul); out.appendChild(rules);
  }
  function s19UnitBtn(u) {
    var b = el("button", "s19-ut"); b.type = "button"; b.appendChild(s19Pic(u)); b.appendChild(el("span", "s19-un", u.n));
    if (u.unl) b.appendChild(el("i", "s19-lock", "해금"));
    b.addEventListener("click", function () { s19OpenUnit(u); }); return b;
  }

  // 시너지
  function s19Traits(out, tools) {
    s19Search(tools, "시너지·챔피언 이름");
    s19Chips(tools, [["all", "전체"], ["ORIGIN", "계열"], ["CLASS", "직업"], ["uniq", "고유"]], s19St.tf, function (v) { s19St.tf = v; });
    var list = S19.traits.filter(function (t) {
      if (s19St.tf === "uniq" ? !t.uniq : s19St.tf !== "all" && (t.uniq || t.type !== s19St.tf)) return false;
      return s19Match(t.n) || t.u.some(function (k) { var u = s19Unit(k); return u && s19Match(u.n); });
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
    mid.appendChild(el("small", null, (t.uniq ? "고유 · " : t.type === "ORIGIN" ? "계열 · " : t.type === "CLASS" ? "직업 · " : "") + (bp.length ? bp.join(" · ") : "") + (t.back && t.back.length ? " · 세트 " + t.back.join("·") + "에도 있었음" : "")));
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
    s19Search(tools, "챔피언·시너지 이름");
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

  // 해금
  function s19Unlocks(out) {
    var list = S19.units.filter(function (u) { return u.unl; });
    out.appendChild(el("p", "sub s19-lead", "조건을 채우면 상점에 나오기 시작해요. 레벨 표시가 있으면 그 레벨부터 조건을 세요"));
    list.sort(function (a, b) { return a.c - b.c; }).forEach(function (u) {
      var r = el("button", "s19-card s19-ul"); r.type = "button"; r.appendChild(s19Pic(u, 44));
      var m = el("div", "s19-ulm"); m.appendChild(el("b", null, u.n + " "));
      m.firstChild.appendChild(el("small", null, u.c + "코" + (u.unl.lv ? " · " + u.unl.lv + "레벨부터" : "")));
      u.unl.c.forEach(function (c, i) { m.appendChild(el("p", null, (u.unl.c.length > 1 && i ? "또는 " : "") + c)); });
      r.appendChild(m); r.addEventListener("click", function () { s19OpenUnit(u); }); out.appendChild(r);
    });
  }

  // 증강
  function s19Augs(out, tools) {
    s19Search(tools, "증강 이름·설명");
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
