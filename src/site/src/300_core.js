(function () {
  var COMPONENTS = ["B.F. 대검", "곡궁", "쇠사슬 조끼", "음전자 망토", "쓸데없이 큰 지팡이", "여신의 눈물", "거인의 허리띠", "연습용 장갑"];
  var SHORT = { "B.F. 대검": "대검", "쓸데없이 큰 지팡이": "지팡이", "여신의 눈물": "여눈", "거인의 허리띠": "허리띠", "연습용 장갑": "장갑", "쇠사슬 조끼": "조끼", "음전자 망토": "망토" };
  var USE = {
    "죽음의 검": "AD 딜", "거인 학살자": "AD 딜, 탱커 상대", "밤의 끝자락": "근접 딜러 생존", "피바라기": "AD 흡혈",
    "마법공학 총검": "AP 흡혈 (아지르·카시)", "쇼진의 창": "마나 회복 딜템", "스테락의 도전": "브루저", "무한의 대검": "치명타 딜템",
    "붉은 덩굴정령": "치감 + 공속 (레드)", "거인의 결의": "브루저 스택", "크라켄의 분노": "AD 원딜", "구인수의 격노검": "공속 스택. 공속 딜러 핵심",
    "공허의 지팡이": "마법 저항 깎기", "내셔의 이빨": "공속 + 주문력", "최후의 속삭임": "방어력 깎기 (라위)",
    "덤불 조끼": "탱템", "가고일 돌갑옷": "탱템. 메인탱 1순위", "크라운가드": "탱템 + 주문력", "수호자의 맹세": "마나 탱템", "태양불꽃 망토": "치감 탱템 (썬파)", "굳건한 심장": "탱템",
    "용의 발톱": "마저 탱템", "이온 충격기": "마법 저항 깎기 탱템", "적응형 투구": "마나 + 역할별 보너스", "저녁갑주": "깎기 탱템", "수은": "CC 면역",
    "라바돈의 죽음모자": "AP 딜", "대천사의 지팡이": "긴 전투 AP", "모렐로노미콘": "치감 AP템", "보석 건틀릿": "AP 치명타",
    "푸른 파수꾼": "마나 (블루)", "정령의 형상": "체력 회복 탱템", "정의의 손길": "딜 + 회복 (정손)",
    "워모그의 갑옷": "체력 탱템", "타격대의 철퇴": "치명타 피증", "도적의 장갑": "무작위 템 2개"
  };
  var IDX = null;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function img(src, alt) {
    var i = document.createElement("img");
    i.src = src; i.alt = alt || ""; i.loading = "lazy"; i.decoding = "async"; i.width = 22; i.height = 22;
    return i;
  }
  function itemSpan(name, label) {
    var s = document.createElement("span"); s.className = "it"; s.textContent = label || name; s.dataset.i = name;
    decorateItem(s, name); return s;
  }
  function decorateItem(el, name) {
    var it = IDX && IDX.items[name];
    if (it && !el.querySelector("img")) el.insertBefore(img(it.icon, ""), el.firstChild);
  }

  function decorate() {
    document.querySelectorAll(".u").forEach(function (el) {
      var u = IDX.units[el.textContent.trim()];
      if (!u || el.querySelector("img")) return;
      el.dataset.cost = u.cost;
      el.insertBefore(img(u.icon, ""), el.firstChild);
    });
    document.querySelectorAll(".it").forEach(function (el) {
      decorateItem(el, el.dataset.i || el.textContent.trim());
    });
    document.querySelectorAll(".ag").forEach(function (el) {
      var a = IDX.augments[el.textContent.trim()];
      if (a && !el.querySelector("img")) el.insertBefore(img(a, ""), el.firstChild);
    });
    document.querySelectorAll("img.tr").forEach(function (el) {
      var t = IDX.traits[el.dataset.t];
      if (t) el.src = t; else el.remove();
    });
  }

  function recipeOf(a, b) {
    for (var name in IDX.items) {
      var r = IDX.items[name].recipe;
      if (r.length === 2 && ((r[0] === a && r[1] === b) || (r[0] === b && r[1] === a))) return name;
    }
    return null;
  }

  function buildGrid() {
    var g = document.getElementById("rgrid");
    var picked = document.getElementById("picked");
    var cells = [];
    var corner = document.createElement("div"); corner.className = "h corner"; g.appendChild(corner);
    COMPONENTS.forEach(function (c) {
      var h = document.createElement("div"); h.className = "h"; h.title = c;
      if (IDX.items[c]) h.appendChild(img(IDX.items[c].icon, c));
      g.appendChild(h);
    });
    COMPONENTS.forEach(function (row, ri) {
      var h = document.createElement("div"); h.className = "h"; h.title = row;
      if (IDX.items[row]) h.appendChild(img(IDX.items[row].icon, row));
      g.appendChild(h);
      COMPONENTS.forEach(function (col, ci) {
        var name = recipeOf(row, col);
        var b = document.createElement("button"); b.type = "button";
        b.setAttribute("aria-label", name ? name + " = " + row + " + " + col : row + " + " + col);
        if (name && IDX.items[name]) b.appendChild(img(IDX.items[name].icon, ""));
        b.addEventListener("click", function () { show(name, row, col, ri, ci); });
        cells.push({ b: b, r: ri, c: ci });
        g.appendChild(b);
      });
    });
    function show(name, a, b2, ri, ci) {
      cells.forEach(function (x) {
        x.b.classList.toggle("sel", x.r === ri && x.c === ci);
        x.b.classList.toggle("hl", (x.r === ri || x.c === ci) && !(x.r === ri && x.c === ci));
      });
      picked.innerHTML = "";
      var eq = document.createElement("div"); eq.className = "eq";
      eq.appendChild(itemSpan(name || "?"));
      var op = document.createElement("span"); op.textContent = "="; op.className = "num"; eq.appendChild(op);
      eq.appendChild(itemSpan(a, SHORT[a] || a));
      var plus = document.createElement("span"); plus.textContent = "+"; plus.className = "num"; eq.appendChild(plus);
      eq.appendChild(itemSpan(b2, SHORT[b2] || b2));
      picked.appendChild(eq);
      var why = document.createElement("div"); why.className = "why"; why.textContent = USE[name] || "";
      picked.appendChild(why);
    }
    show(recipeOf("곡궁", "쓸데없이 큰 지팡이"), "곡궁", "쓸데없이 큰 지팡이", 1, 4);
  }

  function buildCompList() {
    var box = document.getElementById("comp-list");
    var KEY = {
      "B.F. 대검": ["쇼진의 창", "무한의 대검", "밤의 끝자락", "죽음의 검"],
      "곡궁": ["구인수의 격노검", "최후의 속삭임", "크라켄의 분노", "공허의 지팡이"],
      "쇠사슬 조끼": ["가고일 돌갑옷", "수호자의 맹세", "태양불꽃 망토", "밤의 끝자락"],
      "음전자 망토": ["가고일 돌갑옷", "이온 충격기", "용의 발톱", "수은"],
      "쓸데없이 큰 지팡이": ["보석 건틀릿", "라바돈의 죽음모자", "구인수의 격노검", "모렐로노미콘"],
      "여신의 눈물": ["쇼진의 창", "푸른 파수꾼", "정의의 손길", "수호자의 맹세"],
      "거인의 허리띠": ["워모그의 갑옷", "정령의 형상", "모렐로노미콘", "타격대의 철퇴"],
      "연습용 장갑": ["보석 건틀릿", "무한의 대검", "정의의 손길", "도적의 장갑"]
    };
    COMPONENTS.forEach(function (c) {
      var row = document.createElement("div"); row.className = "recipe";
      row.appendChild(itemSpan(c, SHORT[c] || c));
      var arrow = document.createElement("span"); arrow.className = "op"; arrow.textContent = "→"; row.appendChild(arrow);
      KEY[c].forEach(function (n) { row.appendChild(itemSpan(n)); });
      box.appendChild(row);
    });
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function miniUnit(u, withItems) {
    var info = IDX.units[u.name] || {};
    if (RK_SEASON && OLD_UI[u.name]) info = { icon: OLD_UI[u.name], cost: info.cost };  // 지난 시즌은 그 세트 아이콘
    var box = el("div", "mu"); box.dataset.cost = u.cost || info.cost || 1; box.dataset.unit = u.name;
    if ((u.cost || info.cost || 1) >= 4 && (u.star || 1) >= 3) box.classList.add("hi3");  // 4·5코 3성 반짝
    var face = el("div", "face");
    if (info.icon) face.appendChild(img(info.icon, u.name));
    box.appendChild(face);
    box.appendChild(el("div", "stars", "★".repeat(u.star || 1)));
    if (withItems) {
      var its = el("div", "its");
      (u.items || []).forEach(function (it) {
        var ic = IDX.items[it.name]; if (RK_SEASON && OLD_II[it.name]) ic = { icon: OLD_II[it.name] };
        if (ic) { var im = img(ic.icon, it.name); im.title = it.name; im.dataset.item = it.name; its.appendChild(im); }
      });
      box.appendChild(its);
    }
    box.appendChild(el("div", "nm", u.name));
    return box;
  }


  function buildEmblems() {
    var AVG = { "선봉대 상징": 4.09, "싸움꾼 상징": 4.12, "달빛 상징": 4.22, "나무정령 상징": 4.23, "처형자 상징": 4.23, "속사포 상징": 4.26, "약탈자 상징": 4.32, "요정 상징": 4.32, "주문술사 상징": 4.33, "기원자 상징": 4.34, "지옥불 상징": 4.35, "사냥꾼 상징": 4.41, "원시 상징": 4.47, "개화 상징": 4.49, "날렵이 상징": 4.57, "검은 가시 상징": 4.63 };
    var NOTE = { "전략가의 왕관": "팀 규모 +1", "전략가의 망토": "팀 규모 +1", "전략가의 방패": "팀 규모 +1" };
    var tb = document.getElementById("emblems");
    COMPONENTS.concat(["뒤집개", "프라이팬"]).forEach(function (c) {
      var tr = document.createElement("tr");
      var td0 = document.createElement("td"); td0.appendChild(itemSpan(c, SHORT[c] || c)); tr.appendChild(td0);
      ["뒤집개", "프라이팬"].forEach(function (k) {
        var td = document.createElement("td");
        var name = recipeOf(k, c);
        if (name) {
          td.appendChild(itemSpan(name, name.replace(" 상징", "")));
          var extra = AVG[name] ? AVG[name].toFixed(2) : NOTE[name];
          if (extra) { var s = document.createElement("span"); s.className = "num"; s.style.color = "var(--muted)"; s.style.fontSize = "12px"; s.style.marginLeft = "6px"; s.textContent = extra; td.appendChild(s); }
        }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  }

  var odds = [[3,75,25,0,0,0],[4,55,30,15,0,0],[5,45,33,20,2,0],[6,30,40,25,5,0],[7,19,30,40,10,1],[8,15,20,32,30,3],[9,10,17,25,33,15],[10,5,10,20,40,25]];
  var ob = document.getElementById("odds");
  odds.forEach(function (r) {
    var row = document.createElement("div"); row.className = "row";
    var lv = document.createElement("span"); lv.className = "lv"; lv.textContent = r[0] + "렙";
    var bar = document.createElement("div"); bar.className = "bar";
    for (var c = 1; c <= 5; c++) {
      if (!r[c]) continue;
      var seg = document.createElement("i"); seg.className = "k" + c;
      seg.style.width = r[c] + "%"; seg.textContent = r[c] >= 9 ? r[c] : "";
      bar.appendChild(seg);
    }
    bar.setAttribute("aria-label", r[0] + "레벨: " + r.slice(1).map(function (v, i) { return (i + 1) + "코 " + v + "%"; }).join(", "));
    row.appendChild(lv); row.appendChild(bar); ob.appendChild(row);
  });


  /* ---- 검색 탭: site/db.json (scripts/build_db.py) ---- */
  var DB = null, findMode = "u", FIND_KEY = "tft-guide-find";
  var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  function cho(str) {
    var out = "";
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i) - 0xAC00;
      out += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : str[i];
    }
    return out;
  }
  function matches(name, q) {
    if (!q) return true;
    var n = name.replace(/\s/g, ""), qq = q.replace(/\s/g, "");
    return n.indexOf(qq) >= 0 || cho(n).indexOf(qq) >= 0;
  }
  function unitChip(name) {
    var s = el("span", "u", name);
    var u = IDX.units[name.replace(/ \((AD|AP)\)$/, "")];
    if (RK_SEASON && OLD_UI[name]) u = { icon: OLD_UI[name], cost: (u || {}).cost };  // 지난 시즌은 그 세트 아이콘
    if (u) { if (u.cost) s.dataset.cost = u.cost; s.insertBefore(img(u.icon, ""), s.firstChild); }
    return s;
  }
  function fmt(x) { return x == null ? "-" : Number(x).toFixed(2); }
  function cmpCls(avg, base) { return avg <= base - 0.1 ? "good" : avg >= base + 0.1 ? "bad" : ""; }
  function numCell(main, sub, cls) {
    var d = el("div", "n" + (cls ? " " + cls : ""), main);
    if (sub != null) d.appendChild(el("small", null, sub));
    return d;
  }
  function headRow(a, b, c) {
    var h = el("div", "rows-head");
    [a, b, c].forEach(function (t) { h.appendChild(el("span", null, t)); });
    return h;
  }

  function findList() {
    var box = document.getElementById("find-pick");
    var q = document.getElementById("find-q").value.trim();
    box.innerHTML = "";
    if (!DB) return;
    var names = findMode === "u"
      ? Object.keys(DB.units).sort(function (a, b) { return DB.units[a].cost - DB.units[b].cost || a.localeCompare(b, "ko"); })
      : Object.keys(DB.items).sort(function (a, b) { return a.localeCompare(b, "ko"); });
    var hits = names.filter(function (n) { return matches(n, q); });
    hits.forEach(function (n) {
      var b = el("button"); b.type = "button"; b.dataset.name = n;
      var face = el("span", "face");
      if (findMode === "u") {
        var info = DB.units[n]; b.dataset.cost = info.cost;
        var ic = IDX.units[info.icon];
        if (ic) face.appendChild(img(ic.icon, ""));
        b.appendChild(face); b.appendChild(el("span", "nm", n.replace(" (", "(")));
      } else {
        var it = IDX.items[n];
        if (it) face.appendChild(img(it.icon, "")); else face.textContent = n.slice(0, 2);
        b.appendChild(face); b.appendChild(el("span", "nm", n));
      }
      b.setAttribute("aria-label", n);
      b.addEventListener("click", function () { findShow(findMode, n, true); });
      box.appendChild(b);
    });
    if (!hits.length) box.appendChild(el("span", "none", "맞는 이름이 없어요"));
    if (hits.length === 1 && q) findShow(findMode, hits[0], false);
  }

  function findShow(mode, name, scroll) {
    var out = document.getElementById("find-out");
    out.innerHTML = "";
    document.querySelectorAll("#find-pick button").forEach(function (b) { b.classList.toggle("on", b.dataset.name === name); });
    var card = mode === "u" ? unitCard(name) : itemCard(name);
    if (!card) return;
    out.appendChild(card);
    try { localStorage.setItem(FIND_KEY, JSON.stringify([mode, name])); } catch (e) {}
    if (scroll && card.scrollIntoView) card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  function buildRows(card, title, hint, rows, base) {
    if (!rows.length) return;
    var h = el("h4", null, title); h.appendChild(el("small", null, hint)); card.appendChild(h);
    card.appendChild(headRow("템", "평균", "비율"));
    rows.forEach(function (r) {
      var row = el("div", "brow"), its = el("div", "its");
      (Array.isArray(r[0]) ? r[0] : [r[0]]).forEach(function (n) { its.appendChild(itemSpan(n)); });
      row.appendChild(its);
      row.appendChild(numCell(fmt(r[1].avg), "승률 " + Math.round(r[1].win) + "%", "avg " + cmpCls(r[1].avg, base)));
      row.appendChild(numCell(r[1].pick + "%", r[1].n.toLocaleString() + "판"));
      card.appendChild(row);
    });
  }

  function unitCard(name) {
    var u = DB.units[name];
    if (!u) return null;
    var card = el("div", "fcard");
    var head = el("div", "fhead"); head.dataset.cost = u.cost;
    var face = el("div", "face"), ic = IDX.units[u.icon];
    if (ic) face.appendChild(img(ic.icon, name));
    head.appendChild(face);
    var t = el("div"); t.appendChild(el("h3", null, name)); t.appendChild(el("p", null, u.cost + "코 · " + u.traits.join(", ")));
    head.appendChild(t); card.appendChild(head);

    var tiles = el("div", "tiles");
    [[fmt(u.meta.base), "에메+ 평균"], [fmt(u.meta.gm), "그마+ 평균"], [u.base.win + "%", "다이아+ 승률"]].forEach(function (x) {
      var d = el("div", "tile"); d.appendChild(el("b", null, x[0])); d.appendChild(el("span", null, x[1])); tiles.appendChild(d);
    });
    card.appendChild(tiles);

    var base = u.base.avg;
    var sh = el("h4", null, "몇 성으로 끝났나"); sh.appendChild(el("small", null, "다이아+ 평균 " + fmt(base))); card.appendChild(sh);
    card.appendChild(headRow("성급", "평균", "비율"));
    ["1", "2", "3"].forEach(function (k) {
      var s = u.stars[k]; if (!s) return;
      var row = el("div", "brow");
      row.appendChild(el("div", "its", "★".repeat(+k) + " " + k + "성"));
      row.appendChild(numCell(fmt(s.avg), "승률 " + Math.round(s.win) + "%", "avg " + cmpCls(s.avg, base)));
      row.appendChild(numCell(s.pick + "%", s.n.toLocaleString() + "판"));
      card.appendChild(row);
    });

    buildRows(card, "템 3개", "평균 낮은 순", u.trios, base);
    buildRows(card, "템 2개 조합", "평균 낮은 순", u.pairs, base);
    buildRows(card, "템 하나씩", "평균 낮은 순", u.items, base);

    if (u.partners.length) {
      var ph = el("h4", null, "같이 쓰는 유닛"); ph.appendChild(el("small", null, "같이 있을 때 등수 변화")); card.appendChild(ph);
      var pc = el("div", "pchips");
      u.partners.forEach(function (p) {
        var c = el("span", "c"); c.appendChild(unitChip(p[0]));
        c.appendChild(el("b", p[1] <= -0.1 ? "good" : p[1] >= 0.1 ? "bad" : "", (p[1] > 0 ? "+" : "") + p[1].toFixed(2)));
        pc.appendChild(c);
      });
      card.appendChild(pc);
    }

    if (u.weak.length) {
      var mh = el("h4", null, "상성"); mh.appendChild(el("small", null, "맞대결에서 이 유닛이 이긴 비율")); card.appendChild(mh);
      var two = el("div", "two");
      [["약한 상대", u.weak], ["강한 상대", u.strong]].forEach(function (g) {
        var col = el("div"); col.appendChild(el("div", "lab", g[0]));
        var pc2 = el("div", "pchips");
        g[1].forEach(function (m) {
          var c = el("span", "c"); c.appendChild(unitChip(m[0]));
          c.appendChild(el("b", m[1] < 50 ? "bad" : "good", m[1] + "%"));
          pc2.appendChild(c);
        });
        col.appendChild(pc2); two.appendChild(col);
      });
      card.appendChild(two);
    }

    var det = el("details");
    det.appendChild(el("summary", null, "스킬 · 능력치"));
    det.appendChild(el("p", null, u.stats));
    if (u.skill.desc) {
      var sp = el("p"); sp.appendChild(el("b", null, u.skill.name + ": ")); sp.appendChild(document.createTextNode(u.skill.desc));
      det.appendChild(sp);
    }
    card.appendChild(det);
    return card;
  }

  function itemCard(name) {
    var rows = DB.items[name];
    if (!rows) return null;
    var card = el("div", "fcard");
    var head = el("div", "fhead"), face = el("div", "face"), it = IDX.items[name];
    if (it) face.appendChild(img(it.icon, name));
    head.appendChild(face);
    var t = el("div"); t.appendChild(el("h3", null, name));
    var sub = [];
    if (it && it.recipe && it.recipe.length) sub.push(it.recipe.map(function (r) { return SHORT[r] || r; }).join(" + "));
    if (USE[name]) sub.push(USE[name]);
    t.appendChild(el("p", null, sub.join(" · ") || " "));
    head.appendChild(t); card.appendChild(head);
    var h = el("h4", null, "누구한테 주나"); h.appendChild(el("small", null, "평균 낮은 순")); card.appendChild(h);
    card.appendChild(headRow("유닛", "평균", "판수"));
    rows.forEach(function (r) {
      var row = el("div", "brow"), its = el("div", "its");
      its.appendChild(unitChip(r[0]));
      row.appendChild(its);
      var ub = DB.units[r[0]] ? DB.units[r[0]].base.avg : r[1];
      row.appendChild(numCell(fmt(r[1]), "유닛 " + fmt(ub), "avg " + cmpCls(r[1], ub)));
      row.appendChild(numCell(r[2].toLocaleString()));
      card.appendChild(row);
    });
    return card;
  }

  function buildFind(data) {
    DB = data;
    buildBuilder(); buildAugList(); buildTraitList(); buildRank();
    if (metaReady) metaList();
    document.querySelectorAll(".ag img").forEach(function (im) {
      var a = DB.info.a[im.parentNode.textContent.trim()]; if (a) im.dataset.r = a.r;
    });
        var q = document.getElementById("find-q");
    document.querySelectorAll(".seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        findMode = b.dataset.mode;
        document.querySelectorAll(".seg button").forEach(function (x) {
          x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
        q.value = ""; document.getElementById("find-out").innerHTML = ""; findList();
      });
    });
    q.addEventListener("input", findList);
    var last = null;
    try { last = JSON.parse(localStorage.getItem(FIND_KEY) || "null"); } catch (e) {}
    if (last && last[0] === "i") document.querySelector('.seg button[data-mode="i"]').click();
    findList();
    findShow(findMode, last && (last[0] === "u" ? DB.units : DB.items)[last[1]] ? last[1] : "덩굴정령", false);
  }

  /* ---- 팀 플래너 코드 복사: 게임 팀 플래너에서 붙여넣으면 그 덱이 그대로 뜬다 ---- */
  function copyText(text) {
    if (APP && window.LolcheApp.copy) { try { window.LolcheApp.copy(text); return Promise.resolve(); } catch (e) {} }
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.top = "0"; ta.style.opacity = "0"; document.body.appendChild(ta);
      ta.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove(); return ok ? Promise.resolve() : Promise.reject(new Error("copy"));
    }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(fallback);
    return fallback();
  }
  var toastTimer = null;
  function toast(msg, code) {
    var t = document.getElementById("toast");
    if (!t) { t = el("div", "toast"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.innerHTML = ""; t.appendChild(el("div", null, msg));
    if (code) {  // 복사가 막혔으면 길게 눌러 복사할 수 있게 코드를 보여준다
      var inp = el("input"); inp.value = code; inp.readOnly = true; t.appendChild(inp);
      setTimeout(function () { inp.focus(); inp.select(); }, 50);
    }
    t.classList.add("on");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("on"); }, code ? 9000 : 2600);
  }
  function codeButton(code, label, cls) {
    var b = el("button", cls || "codebtn", label); b.type = "button"; b.title = code;
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      copyText(code).then(function () { toast("팀 코드를 복사했어요. 게임의 팀 플래너에 붙여넣어 주세요"); })
        .catch(function () { toast("복사하지 못했어요. 아래 코드를 길게 눌러 복사해 주세요", code); });
    });
    return b;
  }
  function codeOfNames(names) {
    if (!DB) return null;
    var byName = {};
    Object.keys(DB.names.u).forEach(function (k) { var x = DB.names.u[k]; if (x[2] && !byName[x[0]]) byName[x[0]] = x[2]; });
    var cs = []; names.forEach(function (n) { var c = byName[n]; if (c && cs.indexOf(c) < 0 && cs.length < 10) cs.push(c); });
    if (!cs.length) return null;
    while (cs.length < 10) cs.push("000");
    return "02" + cs.join("") + SET_ID;
  }

  // 2026-11-07 기본 기준을 플래+에서 에메+로 바꿨다. 예전 기본값으로 저장된 선택은 한 번만 에메+로 옮긴다
  try {
    if (!localStorage.getItem("tft-guide-basis-emer")) {
      [["tft-guide-meta", "b"], ["tft-guide-items", "r"], ["tft-guide-parts", "b"]].forEach(function (x) {
        var o = JSON.parse(localStorage.getItem(x[0]) || "null"); if (o && o[x[1]] === "all") { o[x[1]] = "emer"; localStorage.setItem(x[0], JSON.stringify(o)); }
      });
      localStorage.setItem("tft-guide-basis-emer", "1");
    }
  } catch (e) {}
  /* ---- 메타 덱: 롤체지지 추천 덱(site/guides.json) + MetaTFT 통계(site/meta.json). 앱의 떠있는 창 첫 화면 ---- */
  var META = null, GUIDES = null, mtFilter = "all", mtSrc = "guide", MT_KEY = "tft-guide-meta";
  var BASIS_LABEL = { all: "플래+", emer: "에메+", dia: "다이아", top: "마스터+", gmc: "그마·챌", low: "플래 미만" };
  var mtSort = "avg";
  var STYLE_ORDER = { chromatic: 0, gold: 1, silver: 2, bronze: 3, unique: 4 };
  function uIcon(name) {
    var u = IDX.units[name];
    if (!u) return null;
    var i = img(u.icon, name); i.dataset.c = u.cost; i.title = name; i.dataset.unit = name;
    return i;
  }
  function strip(names) {
    var s = el("div", "mt-strip");
    names.forEach(function (n) { var i = uIcon(n); if (i) s.appendChild(i); });
    return s;
  }
  // 기준(티어 묶음)별 [평균, 순방%, 승률%, 판수]와 그 기준에서의 티어. 판수가 모자란 기준은 null
  function basisSt(d, b) { if (!d) return null; if (d.st && d.st[b]) return d.st[b]; return b === "all" ? [d.avg, d.top4, d.win, d.n] : null; }
  function basisTier(d, b) { return !d ? "X" : d.tiers && d.tiers[b] ? d.tiers[b] : b === "all" && !d.tiers ? d.tier : "X"; }
  var STYLE_KO = { "Fast 8": "8렙 운영", "Fast 9": "9렙 운영", "lvl 7": "7렙 리롤", "lvl 6": "6렙 리롤", "lvl 5": "5렙 리롤", "lvl 4": "4렙 리롤", "Standard": "기본 운영" };
  function styleKo(x) { return STYLE_KO[x] || x || ""; }
  var PRE_KO = { "영브": "영원한 브론즈" };
  function isReroll(d) { return d && /^lvl [5-7]/.test(d.style); }
  function statOf(id) { return META && id ? META.decks.filter(function (x) { return x.id === id; })[0] : null; }

  // 고유 특성이 다른 시너지 인원을 늘리는 경우: "장로 드래곤은 2개의 팀 슬롯을 차지하며 협곡야수 특성을 +2 추가합니다" -> 장로 드래곤 한 명이 협곡야수 2
  // (판 기록 확인: 협곡야수 유닛 5 + 장로 드래곤 = 7). 시너지 설명에서 읽어서 세트가 바뀌어도 그대로
  var TRAIT_BONUS = null;
  function traitBonus(unit, c) {
    if (!DB) return;
    if (!TRAIT_BONUS) {
      TRAIT_BONUS = {};
      Object.keys(DB.info.t || {}).forEach(function (k) {
        var t = DB.info.t[k], m = t.type === "unique" && /(\S+) 특성을 \+(\d+)/.exec(t.d || "");
        if (m) (t.u || []).forEach(function (x) { TRAIT_BONUS[x[0]] = [m[1], +m[2] - 1]; });  // 자기 몫 1은 이미 셌다
      });
    }
    var b = TRAIT_BONUS[unit]; if (b && b[1] > 0 && (DB.units[unit] || {}).traits && DB.units[unit].traits.indexOf(b[0]) >= 0) c[b[0]] = (c[b[0]] || 0) + b[1];
  }
  // 시너지: 보드 유닛(같은 챔피언 한 번) + 상징으로 세고, 단계 색은 Riot 데이터(guides.json styles)
  function synOf(board) {
    if (!DB || !GUIDES) return [];
    var c = {}, seen = {};
    board.forEach(function (b) {
      if (b.plant || seen[b.u]) return; seen[b.u] = 1;
      var u = DB.units[b.u]; if (u) u.traits.forEach(function (t) { c[t] = (c[t] || 0) + 1; }); traitBonus(b.u, c);
      (b.i || []).forEach(function (it) { if (/ 상징$/.test(it)) { var t = it.replace(/ 상징$/, ""); c[t] = (c[t] || 0) + 1; } });
    });
    var out = [];
    Object.keys(c).forEach(function (t) {
      var st = (GUIDES.styles[t] || []).filter(function (x) { return x[0] != null && c[t] >= x[0]; });
      if (st.length) out.push({ t: t, n: c[t], style: st[st.length - 1][2] });
    });
    // 일월식은 인원 없이 햇빛 3 + 달빛 3이면 켜진다 (고유 특성 취급이라 숨겨지던 것)
    if ((c["햇빛"] || 0) >= 3 && (c["달빛"] || 0) >= 3) out.push({ t: "일월식", n: "", style: "gold" });
    return out.sort(function (a, b) { return (STYLE_ORDER[a.style] - STYLE_ORDER[b.style]) || (b.n - a.n); });
  }
  // 판 기록의 시너지는 라이엇 값(num_units)을 쓴다: 럭스(화신)는 고른 특성이 2개로 세지는데 유닛 목록엔 '기본 럭스'로만 남는다
  function synOfMatch(traits, board) {
    if (!traits || !traits.length || !DB || !GUIDES) return synOf(board);
    var out = [];
    traits.forEach(function (t) {
      var n = t.num_units != null ? t.num_units : t.numUnits, nm = DB.names.t[t.name]; nm = nm ? nm[0] : null;
      var tc = t.tier_current != null ? t.tier_current : t.tierCurrent;
      if (!nm && OLD) {  // 지난 시즌 시너지: 색은 라이엇 기록의 style (1 동 · 2 은 · 3 금 · 4 프리즘)
        var o = OLD.t[String(t.name).toLowerCase()];
        if (o && tc > 0 && t.style) { OLD_TI[o[0]] = o[1]; out.push({ t: o[0], n: n || "", style: ({ 1: "bronze", 2: "silver", 3: "gold", 4: "chromatic", 5: "chromatic" })[t.style] || "gold" }); }
        return;
      }
      if (nm && !n && tc > 0) { out.push({ t: nm, n: "", style: "gold" }); return; }  // 일월식처럼 인원 없이 켜지는 조합 시너지
      if (!nm || !n) return;
      var st = (GUIDES.styles[nm] || []).filter(function (x) { return x[0] != null && n >= x[0]; });
      if (st.length) out.push({ t: nm, n: n, style: st[st.length - 1][2] });
    });
    // 라이엇 기록에 켜진 일반 시너지가 없는데 보드가 큰 경우(소환 유닛 기록 오류 등)는 보드로 직접 센다
    if (!out.some(function (x) { return x.style !== "unique"; }) && board && board.length >= 5) return synOf(board);
    return out.sort(function (a, b) { return (STYLE_ORDER[a.style] - STYLE_ORDER[b.style]) || (b.n - a.n); });
  }
  function synChip(s, withName) {
    var c = el("span", "trx s-" + s.style); c.dataset.trait = s.t; c.title = s.t + " " + s.n;
    var hx = el("span", "hx2"), ti = RK_SEASON && OLD_TI[s.t] ? OLD_TI[s.t] : IDX.traits[s.t]; if (ti) hx.appendChild(img(ti, ""));
    c.appendChild(hx); c.appendChild(el("b", null, s.n));
    if (withName) c.appendChild(el("span", "tn", s.t));
    return c;
  }
  function synRow(list, withName, max) {
    var r = el("div", "synrow");
    list.filter(function (s) { return withName || s.style !== "unique"; }).slice(0, max || 99).forEach(function (s) { r.appendChild(synChip(s, withName)); });
    return r;
  }

  // 목록용 공통 모양: 추천 덱(g)과 통계 덱(c)을 같은 형태로
  function deckView(id) {
    if (/^g/.test(id)) {
      var g = GUIDES && GUIDES.decks[+id.slice(1)]; if (!g) return null;
      var st = statOf(g.cluster);
      var lvs = {};
      Object.keys(g.levels || {}).forEach(function (k) { lvs[k] = g.levels[k].board; });
      if (!Object.keys(lvs).length && st && st.lvb) lvs = st.lvb;
      return { id: id, name: g.name, tag: g.tag, st: st, board: g.board, syn: g.syn, augs: g.augments, guide: true, lvs: lvs, lvup: g.lvup, gd: g.guide };
    }
    var d = statOf(id); if (!d) return null;
    var gs = GUIDES ? GUIDES.decks.filter(function (x) { return x.cluster === d.id; })[0] : null;
    return { id: id, name: d.name, tag: "", st: d, board: d.board, syn: synOf(d.board), augs: gs ? gs.augments : [], guide: false, lvs: d.lvb || {}, lvup: null, gd: gs ? gs.guide : null };
  }
  function allViews() {
    if (mtSrc === "guide" && GUIDES) return GUIDES.decks.map(function (g, i) { return deckView("g" + i); });
    return META ? META.decks.map(function (d) { return deckView(d.id); }) : [];
  }
  // 덱 이름: 앞의 [증강 이름]은 따로 붙이고, "팀 구성"처럼 이름이 없는 덱은 캐리 둘로
  // 상징이 꼭 필요한 덱: 그 덱 판의 절반 넘게 쓴 상징 (meta.json emb: [판수, 평균, 덱 판 중 %, 누구에게])
  function embReq(d) {
    var best = null; Object.keys((d && d.emb) || {}).forEach(function (k) { var x = d.emb[k]; if (x[2] >= 50 && (!best || x[2] > best[1])) best = [k, x[2]]; });
    return best;
  }
  function embBadge(req) {
    var b = el("span", "emb-req"), ic = IDX.items[req[0]];
    if (ic) b.appendChild(img(ic.icon, ""));
    b.appendChild(document.createTextNode(req[0]));
    b.title = "이 덱 판의 " + Math.round(req[1]) + "%가 " + req[0] + " 사용";
    return b;
  }
  function deckName(v) {
    var n = v.name.replace(/^\[[^\]]+\]\s*/, "");
    if (!n || /^팀 ?구성$/.test(n)) n = carriesFirst(v.board).slice(0, 2).map(function (b) { return b.u; }).join(" ");
    return n;
  }
  // 메인 캐리: 덱 이름에 나오는 템 든 유닛(뒤에 나온 쪽), 없으면 템 많은 유닛
  function mainOf(v) {
    var nm = deckName(v), c = carriesFirst(v.board), held = c.filter(function (b) { return b.i && b.i.length; });
    var named = held.filter(function (b) { return nm.indexOf(b.u) >= 0; }).sort(function (a, b) { return nm.lastIndexOf(b.u) - nm.lastIndexOf(a.u); });
    return named[0] || held.sort(function (a, b) { return b.i.length - a.i.length; })[0] || c[0] || null;
  }
  var COST_C = { 1: "var(--c1)", 2: "var(--c2)", 3: "var(--c3)", 4: "var(--c4)", 5: "var(--c5)" };
  function dkPortrait(b, tier) {  // 육각형 초상 + 티어 + 템
    var w = el("div", "dk-mc"); if (!b) return w;
    var u = IDX.units[b.u], hx = el("div", "dk-hex");
    if (u) { hx.style.setProperty("--cc", COST_C[u.cost] || COST_C[1]); hx.appendChild(img(u.icon, b.u)); }
    w.appendChild(hx);
    if (tier) w.appendChild(el("span", "dk-tier", tier));
    if (b.s >= 3) w.appendChild(el("b", "dk-st", "★★★"));
    if (b.i && b.i.length) { var its = el("div", "dk-its"); b.i.forEach(function (n) { var it = IDX.items[n]; if (it) its.appendChild(img(it.icon, n)); }); w.appendChild(its); }
    return w;
  }
  function carriesFirst(board) {
    var real = board.filter(function (b) { return !b.plant; });
    return real.filter(function (b) { return b.i && b.i.length; }).concat(real.filter(function (b) { return !b.i || !b.i.length; }).sort(function (a, b) { return (IDX.units[b.u] || {}).cost - (IDX.units[a.u] || {}).cost; }));
  }
  // 덱 지표 선택적 현저성(Selective Salience) RGB 연속 스케일:
  // 약함(코랄 레드) → 주의(오렌지) → 평균(차분한 쿨그레이) → 강함(에메랄드 민트) → 사기/최상위(아이스 시안 + OP 강조)
  var DK_RGB_D = [[248, 113, 113], [245, 158, 86], [186, 198, 214], [52, 211, 153], [56, 217, 255]];
  var DK_RGB_L = [[220, 38, 38], [194, 65, 12], [71, 85, 105], [5, 150, 105], [2, 132, 199]];
  function dkLerpRgb(stops, t) {
    var v = Math.max(0, Math.min(1, t)), p = v * (stops.length - 1);
    var i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
    var a = stops[i], b = stops[i + 1];
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * f) + "," + Math.round(a[1] + (b[1] - a[1]) * f) + "," + Math.round(a[2] + (b[2] - a[2]) * f) + ")";
  }
  function dkGrad(node, t) {
    var v = Math.max(0, Math.min(1, t));
    node.classList.add("dk-grad");
    if (v >= 0.88) node.classList.add("dk-op");
    node.style.setProperty("--gd", dkLerpRgb(DK_RGB_D, v));
    node.style.setProperty("--gl", dkLerpRgb(DK_RGB_L, v));
    return node;
  }
  function dkAvgT(avg) { return (4.92 - avg) / 0.86; }
  function dkWinT(win) { return win >= 11.5 ? 0.5 + (win - 11.5) / 14 : (win - 5) / 13; }
  function dkTop4T(t4) { return (t4 - 40) / 20; }
  function s19AvgT(avg) { return (4.75 - avg) / 1.85; }
  function s19WinT(win) { return win >= 14 ? 0.5 + (win - 14) / 28 : (win - 5) / 18; }
  // 선택률(겹침) 그라데이션: 낮음(차분한 그레이) → 보통(골드) → 높음(오렌지) → 과밀(코랄 레드)
  var DK_PICK_D = [[154, 168, 188], [232, 185, 79], [249, 134, 64], [248, 92, 92]];
  var DK_PICK_L = [[100, 116, 139], [161, 98, 7], [194, 65, 12], [220, 38, 38]];
  function dkPickGrad(node, pl) {
    var v = Math.max(0, Math.min(1, (pl - 0.15) / 0.85));
    node.classList.add("dk-grad");
    if (v >= 0.78) node.classList.add("dk-hot");
    node.style.setProperty("--gd", dkLerpRgb(DK_PICK_D, v));
    node.style.setProperty("--gl", dkLerpRgb(DK_PICK_L, v));
    return node;
  }

  /* ---- 재료 → 덱: 가진 재료(초반 크립·첫 초밥)로 갈 만한 덱. MetaTFT 덱 통계(meta.json)의 캐리 템 빌드 판수로 계산 ---- */
  var PARTS = ["B.F. 대검", "곡궁", "쓸데없이 큰 지팡이", "여신의 눈물", "쇠사슬 조끼", "음전자 망토", "거인의 허리띠", "연습용 장갑", "뒤집개", "프라이팬"];
  var PART_SHORT = { "B.F. 대검": "대검", "곡궁": "곡궁", "쓸데없이 큰 지팡이": "지팡이", "여신의 눈물": "여눈", "쇠사슬 조끼": "조끼", "음전자 망토": "망토", "거인의 허리띠": "벨트", "연습용 장갑": "장갑", "뒤집개": "뒤집개", "프라이팬": "프라이팬" };
  var PT_KEY = "tft-guide-parts", ptHeld = [], ptBasis = "emer", PT_NEED = null;
  try { var pk = JSON.parse(localStorage.getItem(PT_KEY) || "{}"); ptHeld = (pk.h || []).filter(function (x) { return PARTS.indexOf(x) >= 0; }); ptBasis = pk.b || ptBasis; } catch (e) {}
