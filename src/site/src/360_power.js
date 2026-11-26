  function pwKey(s) { return String(s || "").replace(/^(DA|TFT\d*)_(\d+_)?(Item_)?/, ""); }
  // build_power.py feats()와 똑같이 계산 (바꾸면 둘 다)
  var PW_COMP = { BFSword: 1, RecurveBow: 1, NeedlesslyLargeRod: 1, TearOfTheGoddess: 1, ChainVest: 1, NegatronCloak: 1, GiantsBelt: 1, SparringGloves: 1, Spatula: 1, FryingPan: 1 };
  var PW_GRP = { sk3: "유닛", usum: "유닛", umax: "유닛", isum: "템", lv: "레벨", sl: "레벨", ls: "레벨", u: "유닛", c: "유닛", val: "유닛", i: "템", ic: "템", dup: "템", ni: "템", ui: "캐리 템", k: "캐리 템", kc: "캐리 템", t: "시너지", tn: "시너지", nt: "시너지", tsum: "시너지", tmax: "시너지" };
  function pwItemKind(k) {
    if (/Radiant/.test(k)) return "radiant";
    if (/Artifact/.test(k)) return "artifact";
    if (/Emblem/.test(k)) return "emblem";
    if (/^Component_/.test(k) || PW_COMP[k]) return "component";
    if (/^Tactician/.test(k)) return "tactician";
    return "normal";
  }
  function pwModel(setNum) {
    if (setNum && typeof POWER_S19 !== "undefined" && POWER_S19 && !POWER_S19.off && String(POWER_S19.set) === String(setNum)) return POWER_S19;
    return POWER;
  }
  function boardPower(units, traits, level, setNum) {
    if (!units || !units.length) return null;
    var M = pwModel(setNum);
    var nitem = 0, umax = 0, SKP = (M && M.sk) || {}, UPP = (M && M.up) || {}, IPP = (M && M.ip) || {};
    var W = M && !M.off ? M.w : null, C = (M && M.cost) || {}, val = 0, g = { "레벨": 0, "유닛": 0, "템": 0, "캐리 템": 0, "시너지": 0 };
    var LOGK = { "c:4:3": 0, "c:5:3": 0, "kc:4:3": 0, "kc:5:3": 0 };  // 4·5코 3성은 개수를 log2(1+n)로 (build_power.py와 같게)
    var UQ = {}; ((M && M.uq) || []).forEach(function (t) { UQ[t] = 1; });
    var grp = function (k) { var p = k.split(":"); return (p[0] === "t" || p[0] === "tn") && UQ[p[1]] ? "유닛" : PW_GRP[p[0]]; };  // 고유 특성은 '유닛'으로 (build_power.py group_of와 같게)
    var add = function (k, v) { if (k in LOGK) { LOGK[k] += v; return; } if (W && W[k] && v) g[grp(k)] += W[k] * v; };
    units.forEach(function (u) {
      var id = pwKey(u.character_id), st = u.tier || 1, c = C[id] || (apiUnit(u.character_id, setNum) || {}).cost || 1;
      var its = (u.itemNames || u.items || []).map(pwKey), seen = {}, uniq = 0;
      val += c * Math.pow(3, st - 1);
      add("u:" + id + ":" + st, 1); add("c:" + c + ":" + st, 1);
      if (st >= 3 && SKP[id]) add("sk3", SKP[id]);  // 3성 스킬 배율 (build_power.py feats와 같게)
      var pa = (UPP[id] || [])[Math.min(st, 3) - 1]; if (pa) { add("usum", 4.5 - pa); umax = Math.max(umax, 4.5 - pa); }
      its.forEach(function (it) {
        add("i:" + it, 1); add("ic:" + pwItemKind(it), 1); if (IPP[it]) add("isum", 4.5 - IPP[it]);
        if (!seen[it]) { seen[it] = 1; uniq++; add("ui:" + id + ":" + it, 1); }
      });
      add("dup", its.length - uniq);
      nitem += its.length;
      if (its.length >= 3) { add("k:" + id + ":" + st, 1); add("kc:" + c + ":" + st, 1); }
    });
    if (!W) return { val: val };
    Object.keys(LOGK).forEach(function (k) { var n = LOGK[k]; if (n && W && W[k]) g[PW_GRP[k.split(":")[0]]] += W[k] * Math.log2(1 + n); });
    add("umax", umax);
    add("ni:" + Math.min(nitem, 12), 1);
    var nt = 0, tsum = 0, tmax = 0, TA = M.ta || {};
    (traits || []).forEach(function (t) {
      var tc = t.tier_current != null ? t.tier_current : t.tierCurrent, n = t.num_units != null ? t.num_units : t.numUnits, tk = pwKey(t.name);
      if (tc > 0) {
        add("t:" + tk + ":" + tc, 1);
        if (n) add("tn:" + tk + ":" + n, 1);
        if (!/Unique/.test(t.name)) nt++;
        var a = TA[tk + ":" + tc]; if (a) { tsum += 4.5 - a; tmax = Math.max(tmax, 4.5 - a); }
      }
    });
    add("nt:" + Math.min(nt, 9), 1); add("tsum", tsum); add("tmax", tmax);
    // 라이엇 기록에 켜진 일반 시너지가 없는데 보드가 큰 판 (소환 유닛 등 기록 오류): 시너지 점수는 평균으로 (build_power.py no_traits와 같게)
    if (nt === 0 && units.length >= 5) g["시너지"] = (M.base || {})["시너지"] || 0;
    var lv = Math.min(10, Math.max(4, level || 0));
    var sd = Math.max(-2, Math.min(2, units.length - lv));
    add("lv:" + lv, 1); add("sl:" + sd, 1); add("ls:" + lv + ":" + sd, 1); add("val", val / 10);
    // 압도적인 덱 보정 (build_power.py dominance·adj_shift와 같게): 4코 3성, 프리즘 시너지. 덱파워 구간별로 더하는 점수 표(M.adj)
    var ADJ = M.adj || {}, CH = M.chroma || {}, n4 = 0, dom = [];
    units.forEach(function (u) { var id = pwKey(u.character_id), c = C[id] || (apiUnit(u.character_id, setNum) || {}).cost || 1; if (c === 4 && (u.tier || 1) >= 3) n4++; });
    if (n4 === 1 && val - 36 * n4 < 45) dom.push(["a4w", "유닛"]);  // 4코 3성 1개 + 나머지 약함 (build_power.py dominance와 같게)
    else { if (n4) dom.push(["a4:1", "유닛"]); if (n4 >= 2) dom.push(["a4:2", "유닛"]); }
    if ((traits || []).some(function (t) { var tc = t.tier_current != null ? t.tier_current : t.tierCurrent, n = t.num_units != null ? t.num_units : t.numUnits, m = CH[pwKey(t.name)]; return tc > 0 && n && m && n >= m; })) dom.push(["ap", "시너지"]);
    if (dom.length && ADJ._sd) {
      var s0 = M.b0; Object.keys(g).forEach(function (k) { s0 += g[k]; });
      var pwb = 100 + (M.scale || 24) * (ADJ._mu - s0) / ADJ._sd, best = null;
      dom.forEach(function (d) {
        var t = ADJ[d[0]]; if (!t || !t.length) return;
        var sh = pwb <= t[0][0] ? t[0][1] : pwb >= t[t.length - 1][0] ? t[t.length - 1][1] : 0;
        for (var ti = 1; ti < t.length; ti++) if (pwb >= t[ti - 1][0] && pwb <= t[ti][0]) { sh = t[ti - 1][1] + (pwb - t[ti - 1][0]) / (t[ti][0] - t[ti - 1][0]) * (t[ti][1] - t[ti - 1][1]); break; }
        if (!best || sh > best[0]) best = [sh, d[1]];
      });
      if (best) g[best[1]] -= best[0] * ADJ._sd / (M.scale || 24);
    }
    var s = M.b0, parts = [];
    Object.keys(g).forEach(function (k) { s += g[k]; parts.push([k, Math.round(-(g[k] - ((M.base || {})[k] || 0)) * (M.scale || 24) / M.sd)]); });  // 평균 보드보다 덱파워 몇 점 +/-
    var q = M.q, k = 0; while (k < 100 && q[k + 1] <= s) k++;  // 학습 판 중 나보다 예상 등수가 좋은(작은) 보드 비율
    var top = Math.min(99, Math.max(1, k));
    if (k === 0 && M.qf) {  // 상위 1% 안: 0.01% 단위 (qf = 잘리지 않은 값의 0~1% 분위)
      var j = 0; while (j < M.qf.length && M.qf[j] <= s) j++;
      top = j === 0 ? 0.005 : Math.min(1, j / 100);
    }
    var big = [];  // 4코·5코·7코 3성 (극고점)
    units.forEach(function (u) { var c = C[pwKey(u.character_id)] || (apiUnit(u.character_id, setNum) || {}).cost || 1; if (c >= 4 && (u.tier || 1) >= 3) big.push({ name: (apiUnit(u.character_id, setNum) || {}).name || pwKey(u.character_id), cost: c }); });
    var pred = pwPredOf(s, M);
    var power = Math.round(Math.round((100 + (M.scale || 24) * (M.mu - s) / M.sd) * 1e6) / 1e6);  // build_power.py와 같게 (소수 6자리에서 자르고 반올림)
    if (M.f5 != null) power = big.some(function (b) { return b.cost >= 5; }) ? Math.max(power, M.f5) : pwCap5(power, M.f5, M);  // 5코+ 3성 덱은 항상 위
    power = Math.max(0, power);
    var pr = pwProbOf(s, M);
    return { val: val, pred: pred, power: power, top: top, big: big, parts: parts, p1: pr[0], p4: pr[1],
      vtop: Math.max(1, 100 - M.vq.filter(function (x) { return x <= val; }).length + 1) };
  }
  function pwPct(top) {
    if (top < 1) return top < 0.01 ? "상위 0.01% 미만" : "상위 " + (+top.toFixed(2)) + "%";
    return top <= 50 ? "상위 " + top + "%" : "하위 " + Math.max(1, 100 - top) + "%";
  }
  function pwPredOf(s, M) {
    M = M || POWER;
    var pred = Math.min(8, Math.max(1, s)), cal = M.cal, cp = M.calp, sc0 = M.scale || 15;
    if (cal && cal.length) {
      var lg = cp ? 1 + 7 / (1 + Math.exp(((100 + sc0 * (M.mu - s) / M.sd) - cp[1]) / cp[0])) : null;
      if (s <= cal[0][0]) pred = lg != null ? Math.min(cal[0][1], lg) : cal[0][1];
      else if (s >= cal[cal.length - 1][0]) pred = lg != null ? Math.max(cal[cal.length - 1][1], lg) : cal[cal.length - 1][1];
      else for (var ci = 1; ci < cal.length; ci++) if (s <= cal[ci][0]) { var f0 = (s - cal[ci - 1][0]) / (cal[ci][0] - cal[ci - 1][0]); pred = cal[ci - 1][1] + f0 * (cal[ci][1] - cal[ci - 1][1]); break; }
    }
    return pred;
  }
  function pwCap5(pw, f5, M) { M = M || POWER; var K = (M.scale || 24) / 24, k = f5 - Math.round(31 * K), c = 30 * K; return pw <= k ? Math.round(pw) : Math.floor(k + c * (1 - Math.exp(-(pw - k) / c))); }
  function pwProbOf(s, M) {
    M = M || POWER;
    var t = M.calw; if (!t || !t.length) return [null, null];
    if (s <= t[0][0]) return [t[0][1], t[0][2]];
    if (s >= t[t.length - 1][0]) return [t[t.length - 1][1], t[t.length - 1][2]];
    for (var i = 1; i < t.length; i++) if (s <= t[i][0]) { var f = (s - t[i - 1][0]) / (t[i][0] - t[i - 1][0]); return [t[i - 1][1] + f * (t[i][1] - t[i - 1][1]), t[i - 1][2] + f * (t[i][2] - t[i - 1][2])]; }
    return [null, null];
  }
  function pctTxt(p) { var v = p * 100; return v >= 99.5 ? "99%" : v < 0.5 ? (v < 0.05 ? "0%" : "1% 미만") : Math.round(v) + "%"; }
  function pwProbTxt(r) { return r.p1 == null ? "예상 " + r.pred.toFixed(1) + "등" : "1등 " + pctTxt(r.p1) + " · 순방 " + pctTxt(r.p4); }
  function pwPredOfPower(pw, M) { M = M || POWER; return pwPredOf(M.mu - (pw - 100) * M.sd / (M.scale || 24), M); }
  function pwOtherSet(patch, setNum) {
    var sn = setNum || (patch ? String(patch).split(".")[0] : "");
    if (!sn) return false;
    if (String(sn) === String(guideSetNum()) && !POWER_S19) return false;
    if (String(sn) === String(liveSetNum()) && !POWER) return false;
    var M = pwModel(sn);
    return !(M && !M.off && String(M.set) === String(sn));
  }
  function pwOld(patch, setNum) {
    var sn = setNum || (patch ? String(patch).split(".")[0] : "");
    var M = pwModel(sn);
    return !!(patch && M && !M.off && M.patch && M.patch.indexOf(patch) < 0);
  }
  // 덱파워 색 = 예상 등수: 1.0등 특별 · 1.3등까지 무지개 · 1.5등까지 1등 색 · 2.5등까지 2등 색 · 3.5등 3등 색 · 4.5등 4등 색 · 그 밑 회색
  function pwClsP(pred) { var v = Math.round(pred * 10) / 10; return v <= 1.0 ? "q0" : v <= 1.3 ? "q1" : v <= 1.5 ? "r1" : v <= 2.5 ? "r2" : v <= 3.5 ? "r3" : v <= 4.5 ? "r4" : "r5"; }
  function pwCls(pw, M) { return pwClsP(pwPredOfPower(pw, M)); }  // 색은 예상 등수 기준이라 척도(표준편차)와 상관없다
  var POWER_S19 = null, PW_TOP_S19 = null;
  var PW_WAIT = [];
  function pwFlushWait() {
    var rest = [];
    PW_WAIT.splice(0).forEach(function (x) {
      if (!x[0].isConnected) return;
      var M = pwModel(x[5]);
      if (!M || (x[5] && String(M.set) !== String(x[5]))) { rest.push(x); return; }
      var t = powerTag(x[1], x[2], x[3], x[4], x[5]);
      if (!t) { x[0].remove(); return; }
      while (x[0].firstChild) t.appendChild(x[0].firstChild);
      x[0].replaceWith(t);
    });
    PW_WAIT = rest;
  }
  function powerReady(d) {
    POWER = d; pwFlushWait();
    if (current === "power") pwRender();
    if (typeof frView !== "undefined" && frView === "top" && current === "friends") frTop();
  }
  function powerReadyS19(d) {
    POWER_S19 = d; pwFlushWait();
    if (current === "power") pwRender();
  }
  function powerTag(units, traits, level, small, setNum) {
    var mSet = setNum || detectMatchSet({ units: units, traits: traits });
    var M = pwModel(mSet);
    if (!M || (mSet && String(M.set) !== String(mSet))) {
      if (!units || !units.length) return null;
      if (String(mSet) === String(guideSetNum()) && !POWER_S19) { var ph19 = el("span", "pw" + (small ? " sm" : "")); PW_WAIT.push([ph19, units, traits, level, small, mSet]); return ph19; }
      if (!POWER) { var ph = el("span", "pw" + (small ? " sm" : "")); PW_WAIT.push([ph, units, traits, level, small, mSet]); return ph; }
      return null;
    }
    var r = boardPower(units, traits, level, mSet); if (!r) return null;
    var w = el("span", "pw" + (small ? " sm" : ""));
    var v = el("span", "pw-v"); v.appendChild(el("i", "coin")); v.appendChild(document.createTextNode(r.val));
    var bar = el("span", "pw-bar"); var fill = el("i"); fill.style.width = Math.max(4, 100 - r.vtop) + "%"; bar.appendChild(fill); v.appendChild(bar);
    w.appendChild(v);
    if (r.power != null) {
      var p = el("button", "pw-p " + pwClsP(r.pred)); p.type = "button"; p.appendChild(el("b", null, r.power));
      var sm = el("small"); if (!small) sm.appendChild(el("span", "pw-lbl", "덱파워 · "));
      sm.appendChild(document.createTextNode(pwProbTxt(r))); p.appendChild(sm);
      w.appendChild(p);
      var bg = {}; (r.big || []).forEach(function (b) { var k = b.cost + "|" + b.name; bg[k] = (bg[k] || 0) + 1; });
      Object.keys(bg).sort().reverse().forEach(function (k) { var x = k.split("|"); w.appendChild(el("span", "pw-hi c" + Math.min(+x[0], 5), "★★★ " + x[0] + "코 " + x[1] + (bg[k] > 1 ? " ×" + bg[k] : ""))); });
      var TA = (M && M.ta) || {};
      synOfMatch(traits, mtBoard(units, mSet), mSet).forEach(function (x) {
        if (x.style === "unique") return;
        var a = x.api && x.tc ? TA[pwKey(x.api) + ":" + x.tc] : null;
        if (a && a <= 3.0) w.appendChild(el("span", "pw-hi syn", x.t + " " + x.n));
      });
      p.title = "필드 가치 " + r.val + "골드 · 덱파워 " + r.power + " · " + pwProbTxt(r) + " · 최종 덱 중 " + pwPct(r.top) + " · 예상 " + r.pred.toFixed(1) + "등";
      var bd = null;
      p.addEventListener("click", function (e) {
        e.stopPropagation();
        if (bd) { bd.remove(); bd = null; return; }
        bd = el("div", "pw-bd");
        bd.appendChild(el("span", "pw-bdh", "최종 덱 중 " + pwPct(r.top) + " · 예상 " + r.pred.toFixed(1) + "등 · 평균 대비"));
        r.parts.forEach(function (x) { bd.appendChild(el("span", "pw-pt " + (x[1] > 0 ? "up" : x[1] < 0 ? "dn" : ""), x[0] + " " + (x[1] > 0 ? "+" : "") + x[1])); });
        var host = w.closest(".lb-mid") || w.parentNode;
        if (w.closest(".lb-mid")) host.insertBefore(bd, w.closest(".lb-top").nextSibling); else w.after(bd);
      });
    }
    return w;
  }

  /* ---- 덱파워 탭: 최근 7일 센 판(site/power_top.json, power_top_s19.json) · 그마·챌 최근 1등(롤체지지 실시간)을 덱파워 순으로 ---- */
  var PW_TOP = null, pwSrc = "top", pwBand = "all";
  function pwRawUnits(u) { return u.map(function (x) { return { character_id: x[0], tier: x[1], itemNames: x[2] || [] }; }); }
  function pwRawTraits(t) { return t.map(function (x) { return { name: x[0], tier_current: x[1], num_units: x[2] }; }); }
  function pwCard(g, i) {
    var mSet = g.set || detectMatchSet(g), M = pwModel(mSet);
    var c = el("article", "pwc"), hd = el("div", "pwc-hd"), r = boardPower(g.units, g.traits, g.level, mSet) || {};
    hd.appendChild(el("span", "pwc-rk", i + 1));
    var pw = r.power != null ? r.power : g.pw;
    var bigB = el("button", "pwc-big " + (r.pred != null ? pwClsP(r.pred) : pwCls(pw, M)), pw); bigB.type = "button"; bigB.setAttribute("aria-label", "덱파워 " + pw + ", 항목별 점수 보기");
    hd.appendChild(bigB);
    var tx = el("div", "pwc-tx");
    if (g.who) { var w = el("button", "who", g.who.split("#")[0]); w.type = "button"; w.addEventListener("click", function () { openProfile(g.who, g.reg || (isGuideSet(mSet) && META && META.pbe ? "pbe1" : "kr")); }); tx.appendChild(w); }
    tx.appendChild(el("small", null, [g.tier, g.level + "렙", ago(g.t)].filter(Boolean).join(" · ")));
    hd.appendChild(tx);
    if (g.pl) { hd.appendChild(el("span", "gm-pl pwc-pl " + plCls(g.pl), "#" + g.pl)); c.className += " " + plCls(g.pl); }
    c.appendChild(hd);
    var pt = powerTag(g.units, g.traits, g.level, false, mSet); if (pt) c.appendChild(pt);
    var ptb = pt && pt.querySelector(".pw-p");
    if (ptb) bigB.addEventListener("click", function () { ptb.click(); });
    var board = mtBoard(g.units, mSet);
    c.appendChild(dkLine(board, g.traits, "pw", !isGuideSet(mSet), mSet));
    c.appendChild(synRow(synOfMatch(g.traits, board, mSet), false, 8));
    var mini = el("div", "mini sm");
    board.sort(function (a, b) { return (b.cost - a.cost) || (b.star - a.star); }).forEach(function (u) { mini.appendChild(miniUnit({ name: u.u, cost: u.cost, star: u.star, icon: u.icon, old: u.old, set: u.set, items: u._ii || u.i.map(function (n) { return { name: n }; }) }, true)); });
    c.appendChild(mini);
    return c;
  }
  function pwChart(M) {
    M = M || POWER;
    var box = document.getElementById("pw-chart"); box.innerHTML = "";
    var D = M && M.dist; if (!D) { box.hidden = true; return; }
    box.hidden = false;
    var sc = M.scale || 24, st = D.step || 6, lo = 100 - 9 * st, hi = 100 + 11 * st;
    var bins = [], x0 = lo, x1 = hi + st;
    D.bins.forEach(function (b) { var e = Math.min(hi, Math.max(lo, b[0])), last = bins[bins.length - 1]; if (last && last[0] === e) last[1] += b[1]; else bins.push([e, b[1]]); });
    var W = 360, H = 168, L = 8, R = 8, T = 10, B = 26, max = Math.max.apply(null, bins.map(function (b) { return b[1]; }));
    var X = function (v) { return L + (Math.min(x1, Math.max(x0, v)) - x0) / (x1 - x0) * (W - L - R); }, Yb = H - B - 34, Y = function (c) { return T + (1 - c / max) * (Yb - T); };
    var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "pwd-svg"); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "덱파워 분포. 평균 100");
    var mk = function (tag, at, txt) { var e = document.createElementNS(ns, tag); for (var k in at) e.setAttribute(k, at[k]); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; };
    var defs = document.createElementNS(ns, "defs"); defs.innerHTML = '<linearGradient id="pwRb" x1="0" x2="1"><stop offset="0" stop-color="#ff4d6d"/><stop offset=".3" stop-color="#ffb43d"/><stop offset=".55" stop-color="#3ddc84"/><stop offset=".8" stop-color="#3db8ff"/><stop offset="1" stop-color="#9b6bff"/></linearGradient>'; svg.appendChild(defs);
    [100 - 2 * sc, 100 - sc, 100, 100 + sc, 100 + 2 * sc].forEach(function (v) { mk("line", { x1: X(v), x2: X(v), y1: T, y2: Yb, class: "pwd-grid" }); mk("text", { x: X(v), y: Yb + 13, class: "pwd-ax", "text-anchor": "middle" }, v); });
    var share = function (lim) { return bins.reduce(function (a, b) { return a + (pwPredOfPower(b[0] + st / 2, M) <= lim ? b[1] : 0); }, 0) / D.n * 100; };
    var cap = el("p", "pwd-cap"), def = "S" + (M.set || "") + " 평균 100 (" + (M.n || 0).toLocaleString() + "판) · 예상 1.5등 이내 " + share(1.5).toFixed(1) + "% · 1.3등 이내 " + share(1.3).toFixed(1) + "%";
    cap.textContent = def;
    var on = null;
    bins.forEach(function (b) {
      var bw = (W - L - R) / ((x1 - x0) / st) - 2, x = X(b[0]) + 1, y = Y(b[1]), cls = pwCls(b[0] + st / 2, M);
      var r = mk("rect", { x: x, y: y, width: bw, height: Math.max(0, Yb - y), rx: 2, class: "pwd-bar " + cls });
      if (cls === "q1") r.style.fill = "url(#pwRb)"; else if (cls === "q0") r.style.fill = "#3b1f6b";
      var hit = mk("rect", { x: x - 1, y: T, width: bw + 2, height: Yb - T, fill: "transparent", class: "pwd-hit" });
      hit.addEventListener("click", function () {
        if (on) on.classList.remove("on");
        if (on === r) { on = null; cap.textContent = def; return; }
        on = r; r.classList.add("on");
        var lab = b[0] === lo ? (lo + st) + " 미만" : b[0] === hi ? hi + " 이상" : b[0] + "~" + (b[0] + st - 1);
        cap.textContent = "덱파워 " + lab + " · 예상 " + pwPredOfPower(b[0] + st / 2, M).toFixed(1) + "등 · 전체 덱의 " + (b[1] / D.n * 100).toFixed(1) + "%";
      });
    });
    mk("line", { x1: L, x2: W - R, y1: Yb, y2: Yb, class: "pwd-base" });
    var yr = H - 14;
    mk("text", { x: L, y: yr - 14, class: "pwd-ax" }, "등수별 평균");
    D.byPl.forEach(function (v, i) {
      mk("circle", { cx: X(v), cy: yr, r: 6, class: "pwd-pl pl" + Math.min(5, i + 1) });
      mk("text", { x: X(v), y: yr + 3, class: "pwd-pln", "text-anchor": "middle" }, i + 1);
    });
    box.appendChild(svg); box.appendChild(cap);
  }

  function pwRender() {
    var box = document.getElementById("pw-list"), note = document.getElementById("pw-note"), bandBox = document.getElementById("pw-band");
    document.querySelectorAll("#pw-src button").forEach(function (b) { b.classList.toggle("on", b.dataset.s === pwSrc); });
    pwChart(pwSrc === "s19" ? POWER_S19 : POWER);
    bandBox.innerHTML = ""; bandBox.hidden = pwSrc !== "top";
    if (pwSrc === "s19") {
      if (!PW_TOP_S19 || !POWER_S19) { box.innerHTML = ""; box.appendChild(el("p", "empty", "불러오는 중")); return; }
      var s19Set = +(POWER_S19.set || guideSetNum());
      var list19 = (PW_TOP_S19.top.all || []).map(function (g) { return { pw: g.pw, who: g.who, tier: g.tier || "PBE", reg: "pbe1", pl: g.pl, level: g.lv, t: g.t, set: s19Set, units: pwRawUnits(g.u), traits: pwRawTraits(g.tr) }; });
      note.textContent = "19시즌 PBE " + (POWER_S19.n || 0).toLocaleString() + "판 학습 · " + updAt(PW_TOP_S19.updated) + " · 출처 롤체지지 PBE";
      box.innerHTML = "";
      if (!list19.length) { box.appendChild(el("p", "empty", "아직 기록이 없어요")); return; }
      list19.forEach(function (g, i) { box.appendChild(pwCard(g, i)); });
      return;
    }
    if (LIVE_SET_ID !== SET_ID && !OLD) { box.innerHTML = ""; box.appendChild(el("p", "empty", "불러오는 중")); loadOld().then(pwRender); return; }
    if (pwSrc === "top") {
      if (!PW_TOP) { box.innerHTML = ""; box.appendChild(el("p", "empty", "불러오는 중")); return; }
      PW_TOP.bands.forEach(function (b) {
        var x = el("button", b[0] === pwBand ? "on" : null, b[1]); x.type = "button";
        x.addEventListener("click", function () { pwBand = b[0]; pwRender(); }); bandBox.appendChild(x);
      });
      var topSet = (POWER && POWER.set) || liveSetNum();
      var list = (PW_TOP.top[pwBand] || []).map(function (g) { return { pw: g.pw, who: g.who, tier: g.tier, reg: "kr", pl: g.pl, level: g.lv, t: g.t, set: topSet, units: pwRawUnits(g.u), traits: pwRawTraits(g.tr) }; });
      note.textContent = "최근 7일 · " + updAt(PW_TOP.updated) + " · 출처 롤체지지";
      box.innerHTML = "";
      if (!list.length) { box.appendChild(el("p", "empty", "아직 기록이 없어요")); return; }
      list.forEach(function (g, i) { box.appendChild(pwCard(g, i)); });
      return;
    }
    box.innerHTML = ""; box.appendChild(el("p", "empty", LIVE ? "불러오는 중" : "그마·챌 최근 1등은 앱이나 PC 웹에서 볼 수 있어요"));
    if (!LIVE) return;
    winLoad(false).then(function (all) {
      var list = all.map(function (g) { var r = boardPower(g.raw, g.traits, g.level, g.set) || {}; return { pw: r.power || 0, who: g.who, tier: (TIER_KO[g.tier] || g.tier), reg: "kr", pl: 1, level: g.level, t: g.t, set: g.set, units: g.raw, traits: g.traits }; })
        .sort(function (a, b) { return b.pw - a.pw; });
      note.textContent = "그마·챌 최근 1등 " + list.length + "판 · 출처 롤체지지";
      box.innerHTML = "";
      list.forEach(function (g, i) { box.appendChild(pwCard(g, i)); });
    }).catch(function (e) { box.innerHTML = ""; box.appendChild(el("p", "empty", "불러오지 못했어요. 잠시 후 다시 시도해 주세요")); });
  }

  function lobbyView(m, me) {
    var box = el("div", "lobby");
    box.appendChild(el("p", "sub", "불러오는 중"));
    var src = m._lobby ? Promise.resolve({ info: { participants: m._lobby }, _dak: true }) : viaApp(m.match_data_url);
    src.then(function (md) {
      var mSet = detectMatchSet(m) || detectMatchSet(md && md.info);
      if (!isGuideSet(mSet) && !OLD) return loadOld().then(function () { return md; });
      return md;
    }).then(function (md) {
      box.innerHTML = "";
      var mSet = detectMatchSet(m) || detectMatchSet(md && md.info);
      var info = (md._metatft || {}).participant_info || [];
      var names = {}; info.forEach(function (p) { names[p.puuid] = p; });
      md.info.participants.slice().sort(function (a, b) { return a.placement - b.placement; }).forEach(function (p) {
        var pi = names[p.puuid] || (p.rating ? { ranked: { rating_text: p.rating } } : {}), rid = p.riotIdGameName ? p.riotIdGameName + "#" + p.riotIdTagline : (p.riot_id || pi.riot_id || "?");
        var row = el("div", "lb-row" + (p.puuid === me ? " me" : ""));
        row.appendChild(el("span", "lb-pl " + plCls(p.placement), p.placement));
        var mid = el("div", "lb-mid");
        var nm = el("button", "lb-name", rid.split("#")[0]); nm.type = "button";
        nm.addEventListener("click", function () { rkProfile(rid, null, m._reg || rkReg); window.scrollTo(0, 0); });
        var top = el("div", "lb-top"); top.appendChild(nm);
        var rt = pi.ranked && pi.ranked.rating_text;
        var tsm = el("small", null, p.level + "렙" + (rt ? " · " + (md._dak ? tierText(rt).replace(/ · \d+LP$/, "") : tierText(rt, true)) : ""));
        top.appendChild(tsm);
        var pt = pwOtherSet(m.patch, mSet) ? null : powerTag(p.units, p.traits, p.level, true, mSet); if (pt) top.appendChild(pt);
        mid.appendChild(top);
        var board = mtBoard(p.units, mSet);
        mid.appendChild(dkLine(board, p.traits, "sm", !isGuideSet(mSet), mSet));
        mid.appendChild(synRow(synOfMatch(p.traits, board, mSet), false, 7));
        var mini = el("div", "mini sm");
        board.sort(function (a, b) { return (b.cost - a.cost) || (b.star - a.star); }).forEach(function (u) { mini.appendChild(miniUnit({ name: u.u, cost: u.cost, star: u.star, icon: u.icon, old: u.old, set: u.set, items: u._ii || u.i.map(function (n) { return { name: n }; }) }, true)); });
        mid.appendChild(mini);
        row.appendChild(mid); box.appendChild(row);
      });
      var M = pwModel(mSet);
      if (M && !M.off && !pwOtherSet(m.patch, mSet)) box.appendChild(el("p", "pw-note", "필드 가치는 필드 유닛의 가격 합, 덱파워는 최종 덱의 강함이에요. 100이 평균이에요" + (pwOld(m.patch, mSet) ? ". " + m.patch + " 판이라 덱파워는 지금 패치 기준이에요" : "")));
    }).catch(function (e) { box.innerHTML = ""; box.appendChild(el("p", "sub", "로비 정보를 불러오지 못했어요")); });
    return box;
  }

  /* ---- 판 보드가 무슨 덱인지: MetaTFT 덱 묶음(meta.json) 중 가장 비슷한 덱. 유닛마다 코스트 × (템 2개 이상이면 2) 가중치로 겹치는 비율,
     덱의 메인 캐리가 없으면 깎는다. 비슷한 덱이 없으면 제일 높은 시너지 + 메인 캐리로 이름을 짓는다 ---- */
  var DK_VEC = null;
