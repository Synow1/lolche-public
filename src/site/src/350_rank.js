  function tierParts(text) {  // "DIAMOND II 34 LP" -> ["DIAMOND", "2", 34]
    var m = /^([A-Z]+)\s+(I{1,3}|IV)?\s*(\d+)\s*LP/.exec(text || "");
    return m ? [m[1], DIV[m[2]] || "", +m[3]] : null;
  }
  function tierText(text, short) {
    var p = tierParts(text); if (!p) return text || "언랭";
    var apex = p[0] === "MASTER" || p[0] === "GRANDMASTER" || p[0] === "CHALLENGER";
    return TIER_KO[p[0]] + (apex ? "" : " " + p[1]) + (short ? " " : " · ") + p[2] + "LP";
  }
  function tierImg(tier, cls) {  // 랭크 문장 (site/icons/tier)
    var i = el("img", cls || "temb"); i.alt = ""; i.loading = "lazy";
    i.src = "icons/tier/" + (TIER_KO[tier] ? tier.toLowerCase() : "unranked") + ".webp";
    return i;
  }
  function tierBadge(text) {
    var p = tierParts(text), b = el("span", "tierpill");
    b.appendChild(tierImg(p && p[0])); b.appendChild(el("b", null, tierText(text, true)));
    if (p) b.style.setProperty("--tc", TIER_COLOR[p[0]]);
    return b;
  }
  var ROMAN = ["", "I", "II", "III", "IV"];
  // 지난·본섭(비공략) 시즌 전적: 유닛·시너지·아이템 이름과 아이콘 (site/oldsets.json, scripts/build_oldsets.py)
  var RK_SEASON = null, OLD = null, OLD_PROM = null, OLD_UI = {}, OLD_II = {}, OLD_TI = {};
  function loadOld() {
    if (OLD) return Promise.resolve(OLD);
    if (!OLD_PROM) OLD_PROM = fetch("oldsets.json").then(function (r) { return r.json(); }).then(function (d) { OLD = d; return d; }).catch(function () { OLD = { u: {}, t: {}, i: {} }; return OLD; });
    return OLD_PROM;
  }
  function oldName(id) { return String(id || "").replace(/^(DA_|TFT\d+b?_|Set\d+_)/i, "").replace(/(\d+)?_?(Base|AP|AD)?$/i, ""); }
  function apiUnit(id, setNum) {
    var sn = setNum || parseSetNum(id) || (RK_SEASON ? parseSetNum(RK_SEASON) : liveSetNum());
    if (isGuideSet(sn)) {
      var x = DB && DB.names.u[id];
      if (x) return { name: x[0], cost: x[1], icon: (IDX && IDX.units[x[0]] && IDX.units[x[0]].icon) || "", set: sn, old: false };
      return { name: oldName(id), cost: 1, icon: "", set: sn, old: false };
    }
    var o = OLD && OLD.u[String(id).toLowerCase()];
    if (o) { OLD_UI[o[0]] = o[2]; return { name: o[0], cost: o[1], icon: o[2], set: sn, old: true }; }
    return { name: oldName(id), cost: 1, icon: "", set: sn, old: true };
  }
  function itemInfo(i, setNum) {
    var sn = setNum || (RK_SEASON ? parseSetNum(RK_SEASON) : liveSetNum());
    if (isGuideSet(sn)) {
      var nm = (DB && DB.names.i[i]) || i;
      return { name: nm, icon: (IDX && IDX.items[nm] && IDX.items[nm].icon) || "" };
    }
    var o = OLD && OLD.i[String(i).toLowerCase()];
    if (o) { OLD_II[o[0]] = o[1]; return { name: o[0], icon: o[1] }; }
    return { name: oldName(i), icon: "" };
  }
  function itemName(i, setNum) { return itemInfo(i, setNum).name; }
  function getMT(path) { return LIVE ? viaApp(MT + path) : Promise.reject(new Error("실시간 조회 불가")); }
  function favs() { try { return JSON.parse(localStorage.getItem(RK_FAV) || "[]"); } catch (e) { return []; } }
  function setFavs(f) { try { localStorage.setItem(RK_FAV, JSON.stringify(f.slice(0, 12))); } catch (e) {} }

  function rkView(v) {
    document.querySelectorAll("#rk-seg button").forEach(function (b) { var on = b.dataset.v === v; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    document.getElementById("rk-board").hidden = v !== "board";
    document.getElementById("rk-search").hidden = v !== "search";
    if (v === "board") rkRefresh(false);
  }

  // 그마·챌 컷: MetaTFT의 그마 값은 최소 조건(200)이라, 실제 컷(롤체지지: 400등·1200등 LP)으로 덮어쓴다
  var CUTH = null, CUT_NOW = null;
  function applyCutNow(list) {
    var m = {}; (list || []).forEach(function (x) { m[x.tier] = x.leaguePoints; });
    if (m.CHALLENGER == null && m.GRANDMASTER == null) return;
    CUT_NOW = { c: m.CHALLENGER, g: m.GRANDMASTER, t: Date.now() };
    if (rkCut) rkCutoff(rkCut);
  }
  function cutSeries() {  // {c: [[시각, 점수]], g: [...]} 날짜별 기록 + 지금 값
    if (RK_SEASON) return { c: [], g: [] };  // 지난 시즌은 컷 기록이 없다
    var out = { c: [], g: [] }, h = CUTH && CUTH[dakSeason()];
    if (h) Object.keys(h).sort().forEach(function (d) {
      var t = Date.parse(d + "T12:00:00+09:00");
      if (h[d][0] > 200) out.c.push([t, 2800 + h[d][0]]);  // 200 이하는 순위표가 덜 찬 시즌 초 자리값
      if (h[d][1] > 200) out.g.push([t, 2800 + h[d][1]]);
    });
    if (CUT_NOW) { if (CUT_NOW.c != null) out.c.push([CUT_NOW.t, 2800 + CUT_NOW.c]); if (CUT_NOW.g != null) out.g.push([CUT_NOW.t, 2800 + CUT_NOW.g]); }
    return out;
  }
  function rkCutoff(c) {
    rkCut = c || rkCut;
    if (rkCut && CUT_NOW) { if (CUT_NOW.c != null) rkCut.challenger_threshold = CUT_NOW.c; if (CUT_NOW.g != null) rkCut.grandmaster_threshold = CUT_NOW.g; c = c || rkCut; }
    var box = document.getElementById("rk-cut"); box.innerHTML = "";
    if (!c) return;
    [["챌린저 컷", c.challenger_threshold + "LP", c.challenger_size + "명", "CHALLENGER"], ["그마 컷", c.grandmaster_threshold + "LP", c.grandmaster_size + "명", "GRANDMASTER"], ["마스터", (c.master_size || 0).toLocaleString() + "명", "", "MASTER"]].forEach(function (x) {
      var t = el("div", "tile"); t.style.setProperty("--tc", TIER_COLOR[x[3]]);
      t.appendChild(tierImg(x[3], "cutemb")); t.appendChild(el("b", null, x[1])); t.appendChild(el("span", null, x[0])); if (x[2]) t.appendChild(el("small", null, x[2])); box.appendChild(t);
    });
  }

  // 1주 변동: 7일 전 순위표 스냅샷(site/rank_hist.json, scripts/snap_rank.py)과 비교
  var RK_HIST = null;
  function rkDelta(p) {
    if (!RK_HIST || !RK_HIST.players) return null;
    var old = RK_HIST.players[p.riot_id.toLowerCase()], lp = p.rating_numeric != null ? p.rating_numeric - 2800 : null;
    if (!old) return { isNew: true };
    return { lp: lp != null ? lp - old[1] : null, rank: old[0] - p.rank };
  }
  function rkSpan() {  // 변동 기준: 7일이면 '1주', 아니면 'N일'
    var d = RK_HIST && RK_HIST.date ? Math.round((Date.now() - Date.parse(RK_HIST.date + "T12:00:00+09:00")) / 864e5) : 7;
    return d === 7 ? "1주" : d + "일";
  }
  function rkRow(p) {
    var r = el("button", "rk-row" + (p.rank <= 3 ? " m" + p.rank : "")); r.type = "button";
    var no = el("span", "rk-no"); no.appendChild(el("b", null, p.rank));
    var dl = rkDelta(p);
    if (dl && dl.isNew) no.appendChild(el("small", "rk-dr new", "NEW"));
    else if (dl && dl.rank) no.appendChild(el("small", "rk-dr " + (dl.rank > 0 ? "up" : "dn"), (dl.rank > 0 ? "▲" : "▼") + Math.abs(dl.rank)));
    r.appendChild(no);
    var mid = el("div", "rk-mid");
    var top = el("div", "rk-name"); top.appendChild(el("b", null, p.riot_id.split("#")[0])); top.appendChild(el("small", null, "#" + p.riot_id.split("#")[1]));
    mid.appendChild(top);
    var sub = el("div", "rk-sub"); sub.appendChild(tierBadge(p.rating));
    var st = p.stats || {};
    if (st.num_played) sub.appendChild(el("span", null, "평균 " + (st.place_sum / st.num_played).toFixed(2) + " · " + st.num_played + "판"));
    mid.appendChild(sub);
    // 셋째 줄: 많이 쓴 캐리 + 1주 LP 변동 (본섭 랭킹은 본섭 세트 사전만 조회)
    var rkSet = liveSetNum();
    var carries = ((st.currentPatchResult || {}).topCarries || []).slice(0, 3).map(function (c) { return apiUnit(c.character_id, rkSet); });
    var l3 = el("div", "rk-l3");
    if (carries.length) l3.appendChild(stripUnits(carries));
    if (dl && dl.lp != null) l3.appendChild(el("span", "rk-dlp " + (dl.lp > 0 ? "up" : dl.lp < 0 ? "dn" : ""), rkSpan() + " " + (dl.lp > 0 ? "+" : "") + dl.lp + "LP"));
    if (l3.childNodes.length) mid.appendChild(l3);
    r.appendChild(mid);
    // 오른쪽 두 칸: 승률(1등 비율, MetaTFT)과 순방률(4등 안 비율, 롤체지지 tops). 같은 크기, 이름은 위 고정 머리줄에
    var tops = p.tops || RK_TOPS[p.riot_id.toLowerCase()];
    // 색: 승률은 1등 색, 순방률은 4등 색. 기준(승률 12.5%, 순방률 50%)보다 높을수록 진하게
    var wr = st.num_played ? st.wins / st.num_played * 100 : null, tr = tops && tops[1] ? tops[0] / tops[1] * 100 : null;
    var wl = wr == null ? 0 : wr >= 25 ? 3 : wr >= 18 ? 2 : wr >= 13 ? 1 : 0, tl = tr == null ? 0 : tr >= 65 ? 3 : tr >= 58 ? 2 : tr >= 52 ? 1 : 0;
    r.appendChild(el("div", "rk-num w l" + wl, wr != null ? Math.round(wr) + "%" : "-"));
    r.appendChild(el("div", "rk-num t l" + tl, tr != null ? Math.round(tr) + "%" : "-"));
    r.addEventListener("click", function () { rkProfile(p.riot_id, null, "kr"); window.scrollTo(0, 0); });  // rkProfile이 목록 위치를 기억하게 rkView보다 먼저
    return r;
  }
  function rkRender(note) {
    if (LIVE_SET_ID !== SET_ID && !OLD) { loadOld().then(function () { rkRender(note); }); return; }
    var box = document.getElementById("rk-rows"); box.innerHTML = "";
    rkRows.forEach(function (p) { box.appendChild(rkRow(p)); });
    document.getElementById("rk-note").textContent = note || "";
  }
  var rkTopsPages = {};
  function rkLoad(more) {
    var btn = document.getElementById("rk-more");
    if (!LIVE) {  // 스냅샷
      fetch("rank.json").then(function (r) { return r.json(); }).then(function (d) {
        rkRows = d.data; rkCutoff(d.cutoff);
        rkRender(updAt(d.updated));
        btn.hidden = true;
      }).catch(function () { rkRender("불러오지 못했어요. 다시 시도해 주세요"); });
      return;
    }
    if (!more) { rkPage = 0; rkRows = []; getMT("public/promotion_thresholds/latest").then(function (d) { rkCutoff(d.filter(function (c) { return c.region.toLowerCase() === "kr"; })[0]); }).catch(function () {}); }
    btn.disabled = true; btn.textContent = "불러오는 중";
    getMT("tft-leaderboard/v2/kr?offset=" + rkPage * 50 + "&limit=50").then(function (d) {
      rkRows = rkRows.concat(d.data || []); rkPage++;
      if (!more) rkAt = Date.now();
      rkRender(rkStamp());
      var dp = Math.floor((rkPage - 1) * 50 / 100) + 1;  // 롤체지지 랭킹은 100명씩
      if (!rkTopsPages[dp]) {
        rkTopsPages[dp] = 1;
        viaApp("https://tft.dakgg.io/api/v1/leaderboards/summoners/kr?page=" + dp + "&queueId=1100&hl=ko").then(function (x) {
          (x.summonerRankings || []).forEach(function (y) { RK_TOPS[(y.gameName + "#" + y.tagLine).toLowerCase()] = [y.tops, y.plays]; });
          applyCutNow(x.summonerTierCutoffs);
          rkRender(LIVE ? rkStamp() : "");
        }).catch(function () { rkTopsPages[dp] = 0; });
      }
      btn.hidden = rkRows.length >= (d.meta ? d.meta.total : 1000); btn.disabled = false; btn.textContent = "50명 더 보기";
    }).catch(function (e) { btn.disabled = false; btn.textContent = "다시 시도"; document.getElementById("rk-note").textContent = "불러오지 못했어요"; });
  }

  // 한국 랭킹은 탭을 열 때와 보고 있는 동안 3분마다 다시 받는다 (받아둔 쪽수 그대로, 스크롤 유지)
  var rkAt = 0;
  function rkStamp() { return updAt(rkAt) + " · " + ago(rkAt) + "\n" + (RK_HIST && RK_HIST.date ? "변동은 " + (+RK_HIST.date.slice(5, 7)) + "/" + (+RK_HIST.date.slice(8)) + " 대비 · " : "") + "MetaTFT·롤체지지"; }
  function rkRefresh(force) {
    if (!LIVE || !rkPage || document.hidden || current !== "rank" || document.getElementById("rk-board").hidden) return;
    if (!force && Date.now() - rkAt < 170000) return;
    rkAt = Date.now();
    var ps = []; for (var k = 0; k < rkPage; k++) ps.push(getMT("tft-leaderboard/v2/kr?offset=" + k * 50 + "&limit=50"));
    Promise.all(ps).then(function (rs) { rkRows = [].concat.apply([], rs.map(function (d) { return d.data || []; })); rkRender(rkStamp()); }).catch(function () {});
    getMT("public/promotion_thresholds/latest").then(function (d) { rkCutoff(d.filter(function (c) { return c.region.toLowerCase() === "kr"; })[0]); }).catch(function () {});
  }
  setInterval(function () { rkRefresh(false); }, 60000);
  function rkUpdSetup() {  // 한국 랭킹 맨 위 새로고침 (앱·웹). 환경 분기가 정해진 뒤 시작할 때 부른다
    var b = document.getElementById("rk-upd-btn"); if (!LIVE || !b) return;
    b.hidden = false;
    b.addEventListener("click", function () { b.disabled = true; rkRefresh(true); setTimeout(function () { b.disabled = false; }, 3000); });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) rkRefresh(false); });

  // 전적 검색
  var rkReg = "kr", RK_FAV_PBE = "tft-guide-fav-pbe";
  function pbeFavs() { try { return JSON.parse(localStorage.getItem(RK_FAV_PBE) || "[]"); } catch (e) { return []; } }
  function setPbeFavs(a) { try { localStorage.setItem(RK_FAV_PBE, JSON.stringify(a.slice(0, 12))); } catch (e) {} }
  function rkSetReg(reg, redraw) {
    rkReg = reg === "pbe1" ? "pbe1" : "kr";
    var btn = document.getElementById("rk-reg");
    if (btn) { btn.textContent = rkReg === "pbe1" ? "PBE" : "KR"; btn.classList.toggle("pbe", rkReg === "pbe1"); }
    document.querySelectorAll("#rk-regchips button").forEach(function (b) { b.classList.toggle("on", b.dataset.reg === rkReg); });
    var inp = document.getElementById("rk-q");
    if (inp) inp.placeholder = rkReg === "pbe1" ? "PBE 소환사 이름#태그" : "소환사 이름#태그";
    if (redraw) rkSuggest();
  }
  // ---- 소환사 고르기 목록 (전적 검색·친구 추가 공용): 빈 칸이면 즐겨찾기·최근 검색, 치면 맞는 기록 + MetaTFT 검색 결과
  var RK_STAR = "tft-guide-star";
  function stars() { try { return JSON.parse(localStorage.getItem(RK_STAR) || "[]"); } catch (e) { return []; } }
  function isStar(id) { return stars().indexOf(id) >= 0; }
  function toggleStar(id) { var a = stars(), i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.unshift(id); try { localStorage.setItem(RK_STAR, JSON.stringify(a.slice(0, 30))); } catch (e) {} return i < 0; }
  function starBtn(id, onChange) {
    var b = el("button", "rk-star" + (isStar(id) ? " on" : "")); b.type = "button";
    b.setAttribute("aria-label", isStar(id) ? id + " 즐겨찾기 빼기" : id + " 즐겨찾기");
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/></svg>';
    b.addEventListener("pointerdown", function (e) { e.preventDefault(); });  // 입력창 포커스 유지
    b.addEventListener("click", function (e) { e.stopPropagation(); var on = toggleStar(id); b.classList.toggle("on", on); b.setAttribute("aria-label", on ? id + " 즐겨찾기 빼기" : id + " 즐겨찾기"); if (onChange) onChange(); });
    return b;
  }
  function rkWhoRow(id, rating, onDel, label, onPick, onChange, reg) {  // 티어 문장 · 이름#태그 · 티어 한 줄 + 즐겨찾기
    var r = el("div", "rk-who-row"), p = tierParts(rating), isPbe = reg === "pbe1";
    var b = el("button", "rk-who-main"); b.type = "button";
    b.appendChild(tierImg(p && p[0]));
    var t = el("div"); var nm = el("b", null, id.split("#")[0]); nm.appendChild(el("small", null, "#" + (id.split("#")[1] || ""))); t.appendChild(nm);
    t.appendChild(el("span", null, (label ? label + " · " : "") + (isPbe ? "PBE 19시즌" : rating ? tierText(rating, true) : "티어 기록 없음")));
    if (p && !isPbe) t.lastChild.style.color = TIER_COLOR[p[0]];
    b.appendChild(t);
    b.addEventListener("pointerdown", function (e) { e.preventDefault(); });
    b.addEventListener("click", function () { if (onPick) onPick(id); else rkProfile(id, null, reg || rkReg); });
    r.appendChild(b);
    if (!isPbe) r.appendChild(starBtn(id, onChange));
    if (onDel) { var x = el("button", "rk-who-x", "✕"); x.type = "button"; x.setAttribute("aria-label", id + " 지우기"); x.addEventListener("pointerdown", function (e) { e.preventDefault(); }); x.addEventListener("click", function (e) { e.stopPropagation(); onDel(); }); r.appendChild(x); }
    return r;
  }
  // box에 목록을 그린다. o: {pick(id), me: 내 계정 보이기, skip: 뺄 이름들, reg: 'kr'|'pbe1'}
  var whoTimers = {};
  function whoList(box, q, o) {
    o = o || {}; q = (q || "").trim(); box.innerHTML = ""; clearTimeout(whoTimers[box.id]);
    var reg = o.reg || (box.id === "rk-sug" ? rkReg : "kr"), isPbe = reg === "pbe1";
    var ft = {}; try { ft = JSON.parse(localStorage.getItem(RK_FAVT) || "{}") || {}; } catch (e) {}
    var skip = o.skip || [], redraw = function () { whoList(box, q, o); };
    var st = isPbe ? [] : stars().filter(function (f) { return skip.indexOf(f) < 0; });
    var rc = (isPbe ? pbeFavs() : favs()).filter(function (f) { return st.indexOf(f) < 0 && skip.indexOf(f) < 0 && (WEB || f !== "Synow#KR1"); });
    var low = q.toLowerCase(), hit = function (f) { return !q || f.toLowerCase().indexOf(low) >= 0; };
    function group(title, ids, del, label) {
      ids = ids.filter(hit); if (!ids.length) return;
      var g = el("div", "rk-list"); g.appendChild(el("h4", null, title));
      ids.forEach(function (f) {
        var delFn = del ? function () { if (isPbe) setPbeFavs(pbeFavs().filter(function (x) { return x !== f; })); else setFavs(favs().filter(function (x) { return x !== f; })); redraw(); } : null;
        g.appendChild(rkWhoRow(f, isPbe ? null : ft[f], delFn, label && label(f), o.pick, redraw, reg));
      });
      box.appendChild(g);
    }
    if (!WEB && o.me && skip.indexOf("Synow#KR1") < 0 && (isPbe || !isStar("Synow#KR1"))) group(isPbe ? "내 PBE 계정" : "내 계정", ["Synow#KR1"], false, function () { return "나"; });
    group("즐겨찾기", st, false);
    group(isPbe ? "최근 PBE 검색" : "최근 검색", rc, true);
    if (!q) return;
    if (!LIVE) return;
    var res = el("div", "rk-list"); res.appendChild(el("h4", null, "검색 결과")); var rb = el("div"); rb.appendChild(el("p", "sub", "불러오는 중")); res.appendChild(rb); box.appendChild(res);
    whoTimers[box.id] = setTimeout(function () {
      getMT("public/search/" + encodeURIComponent(q.indexOf("#") >= 0 ? q : q + "#")).then(function (d) {
        rb.innerHTML = "";
        var list = (d.data || []).filter(function (x) { return x.region === reg && skip.indexOf(x.riot_id) < 0; }).slice(0, 8);
        if (!list.length) rb.appendChild(el("p", "sub", isPbe ? "자동완성에 없어도 이름#태그 입력 후 바로 검색할 수 있어요" : "소환사를 찾을 수 없어요. 이름#태그를 확인해 주세요"));
        list.forEach(function (x) { rb.appendChild(rkWhoRow(x.riot_id, x.rating, null, null, o.pick, redraw, reg)); });
      }).catch(function () { rb.innerHTML = ""; rb.appendChild(el("p", "sub", "불러오지 못했어요. 다시 시도해 주세요")); });
    }, 250);
  }
  function rkSuggest() {
    var q = document.getElementById("rk-q").value.trim(), box = document.getElementById("rk-sug");
    if (!LIVE && q) { box.innerHTML = ""; box.appendChild(el("p", "empty", "전적 검색은 앱이나 PC 웹에서 볼 수 있어요")); return; }
    whoList(box, q, { me: !WEB, reg: rkReg });
  }
  function rkFavs() { whoList(document.getElementById("rk-sug"), "", { me: !WEB, reg: rkReg }); }

  // ---- 전적: 판마다 LP를 맞춘다. 판 요약의 player_rating은 그 판 '전' 점수, ranked_rating_changes는 판 '뒤' 스냅샷.
  var RK_RANGE = "tft-guide-rkrange2";  // 기본 50판으로 바꾸며 키를 새로 (v1.51.1)
  function lpText(v) {  // 숫자 점수 -> "실버 3 · 51LP" (마스터 이상은 승급 컷으로 구분)
    if (v == null) return "-";
    if (v >= 2800) {
      var lp = v - 2800, t = rkCut && lp >= rkCut.challenger_threshold ? "CHALLENGER" : rkCut && lp >= rkCut.grandmaster_threshold ? "GRANDMASTER" : "MASTER";
      return TIER_KO[t] + " " + lp + "LP";
    }
    var b = TIER_BANDS[Math.floor(v / 400)] || TIER_BANDS[0];
    return TIER_KO[b[1]] + " " + (4 - Math.floor((v % 400) / 100)) + " · " + (v % 100) + "LP";
  }
  function lpOf(d) {
    // 판 시각(match_timestamp)은 로비 전체가 끝난 시각이고, LP는 내가 탈락한 순간 바뀐다 → 이 판의 LP 스냅샷은 [판 시작, 판 끝 + 15분] 안에 있다.
    // 판 뒤 LP = 다음 판의 '판 전' 점수(MetaTFT)가 있으면 그게 제일 정확하다.
    var snaps = [];
    (d.ranked_rating_changes || []).forEach(function (c) { if (c.queue_id === 1100 && c.rating_numeric != null) snaps.push([Date.parse(c.created_timestamp + "Z"), c.rating_numeric, c.num_games != null ? c.num_games : null]); });
    snaps.sort(function (a, b) { return a[0] - b[0]; });
    var ranked = (d.matches || []).filter(function (m) { return String(m.queue_id) === "1100"; }).sort(function (a, b) { return a.match_timestamp - b.match_timestamp; });
    function st(m) { return m.match_timestamp - (m.game_duration ? m.game_duration * 1000 : 24e5) - 6e4; }  // 판 시작 (1분 여유)
    function en(m) { return m.match_timestamp + 9e5; }
    var out = {};
    // 스냅샷마다 '그때까지 랭크 판 수'가 있으면 판 번호로 맞춘다 (탈락하고 바로 다음 판을 돌리면 두 판의 시간이 겹쳐서 시각만으로는 못 가른다)
    if (ranked.length && snaps.length && snaps.every(function (k) { return k[2] != null; })) {
      // 롤체지지 LP 기록 시각은 실제보다 늦거나(다음 판 도중에 찍힘) 게임 도중(전 판 점수)일 수 있어서, 내가 탈락한 뒤 ~ 판 끝 + 15분 안의 기록만 표로 쓴다
      function el(m) { var t = (m.summary || {}).time_eliminated; return st(m) + (t ? t * 1000 : 0); }
      var V = ranked.map(function () { return {}; }), O = {};
      snaps.forEach(function (k) {
        var c = []; ranked.forEach(function (m, i) { if (k[0] > el(m) && k[0] <= en(m)) c.push(i); });
        if (c.length === 1) { var o0 = k[2] - (c[0] + 1); V[c[0]][o0] = (V[c[0]][o0] || 0) + 1; O[o0] = 1; }
      });
      var Os = Object.keys(O).map(Number).sort(function (a, b) { return a - b; }), offs = null;
      if (Os.length) {
        // 판마다 offset(판 번호 - 순서)을 따로: 판 목록에 빠진 판이 있으면 그 뒤로 offset이 1씩 커진다.
        // offset 하나로 다 맞추면 옛 판이 많은 '시즌 전체'에서 최근 판이 한 판씩 밀린다 (2026-11-15 앙기모링딩둉 15시즌: 8등 판에 +23LP, 마지막 판이 '기록 대기 중')
        // → 줄지 않는 계단 중 표와 가장 많이 맞는 것 (계단 한 번에 0.9표 벌점)
        var J = 0.9, cost = Os.map(function () { return 0; }), back = [];
        V.forEach(function (v, i) {
          var tot = 0, nc = [], bk = [], bc = Infinity, bb = 0; Object.keys(v).forEach(function (k) { tot += v[k]; });
          Os.forEach(function (o, a) {
            var c = cost[a], b = a;
            if (i && bc + J < c) { c = bc + J; b = bb; }
            if (!i) c = 0;
            nc.push(c + tot - (v[o] || 0)); bk.push(b);
            if (cost[a] < bc) { bc = cost[a]; bb = a; }
          });
          cost = nc; back.push(bk);
        });
        var a0 = 0; cost.forEach(function (c, a) { if (c < cost[a0]) a0 = a; });
        offs = []; for (var bi = V.length - 1; bi >= 0; bi--) { offs[bi] = Os[a0]; a0 = back[bi][a0]; }
      }
      if (offs) {
        // 같은 판 수의 기록이 여러 개면: 첫 기록 = 그 판 바로 뒤 점수, 마지막 기록 = 다음 판 직전 점수.
        // 판 없이 LP만 깎인 기록은 휴면 감소다 (2026-11-14: 챌린저가 1등 판 뒤 15일 쉬고 휴면 감소 -222가 그 판 LP로 붙었었음)
        var byN = {}, byNL = {}, maxN = 0, lastT = 0;
        snaps.forEach(function (k) { if (byN[k[2]] == null) byN[k[2]] = k[1]; byNL[k[2]] = k[1]; if (k[2] >= maxN) { maxN = k[2]; lastT = k[0]; } });
        ranked.forEach(function (m, i) {
          var n = i + 1 + offs[i], nx = ranked[i + 1], s = m.summary || {};
          var before = s.player_rating_numeric != null ? s.player_rating_numeric : byNL[n - 1];
          var after = byN[n] != null ? byN[n] : nx && (nx.summary || {}).player_rating_numeric != null ? nx.summary.player_rating_numeric : null;
          if (after == null && !nx && maxN < n && d.ranked && d.ranked.rating_numeric != null) after = d.ranked.rating_numeric;
          var decay = byN[n] != null && byNL[n] != null && byNL[n] < byN[n] ? byN[n] - byNL[n] : 0;  // 이 판 뒤, 다음 판 전에 판 없이 깎인 LP
          out[m.riot_match_id] = { before: before != null ? before : null, after: after != null ? after : null, diff: before != null && after != null ? after - before : null, _n: n, decay: decay };
        });
        // 사이에 LP 기록이 없는 판: 이 사람의 등수별 평균 LP 변화로 채우고, 뒤 기록과 맞으면 '추정'으로 쓴다
        // (마스터 이상은 0LP 아래로 안 내려감: 10LP에서 5등이면 0LP로 갔다가 다음 판에서 다시 오름)
        var byP = {}, DEF = [0, 47, 33, 20, 10, -10, -22, -35, -50];  // 등수별 LP 변화 (롤체지지 실제 2,742판, 플래+ 중앙값. guide/kb/rules.md 'LP 규칙')
        // 마스터 바닥(0LP)에 걸린 판은 실제로 더 깎였을 판이라 중앙값에서 뺀다 (넣으면 하위 등수 손실이 작게 잡힌다)
        ranked.forEach(function (m) { var o = out[m.riot_match_id]; if (o.diff != null && !(o.after === 2800 && o.diff < 0)) (byP[m.placement] = byP[m.placement] || []).push(o.diff); });
        function guess(pl) { var a = (byP[pl] || []).slice().sort(function (x, y) { return x - y; }); return a.length >= 2 ? a[Math.floor(a.length / 2)] : a.length ? Math.round((a[0] + DEF[pl]) / 2) : DEF[pl]; }
        // 기록 없는 판들 + 다음 기록 판: 시작·끝 점수는 안다. 등수별 중앙값에서 가장 덜 벗어나게(최소제곱) 나누되,
        // 마스터 이상은 0LP 아래로 안 내려가고, 중앙값만큼 깎이면 바닥을 뚫는 판은 바닥(0LP)에서 멈춘 것으로 본다
        // LP 규칙 (실제 판으로 확인): 깎일 때 한 판에 구간 0LP 아래로는 안 내려간다. 구간 0LP에서 지면 같은 티어 안이면 아래 구간 75LP(-25),
        // 티어 경계(IV 0LP)면 그대로 0LP. 마스터 이상은 0LP가 바닥.
        function lossLand(v, w) {
          if (v >= 2800) return Math.max(w, 2800);
          var fl = Math.floor(v / 100) * 100;
          if (v === fl) return v % 400 === 0 ? v : v - 25;
          return Math.max(w, fl);
        }
        // 기록 없는 판들 + 다음 기록 판: 시작·끝 점수는 안다. 등수별 중앙값에서 가장 덜 벗어나게(최소제곱) 나누고,
        // 깎이는 판이 바닥(구간 0LP·마스터 0LP) 근처(10LP 안)로 가거나 중앙값만큼 깎이면 바닥을 뚫는 경우는 위 규칙대로 바닥에서 멈춘 걸로 본다
        function split(v0, pls, vE) {
          var ms = pls.map(guess), k = pls.length, res = (vE - v0 - ms.reduce(function (a, b) { return a + b; }, 0)) / k, out2 = [], v = v0;
          for (var i = 0; i < k - 1; i++) {
            var w = Math.round(v + ms[i] + res);
            if (ms[i] < 0) {
              var fl = v >= 2800 ? 2800 : Math.floor(v / 100) * 100;
              if (v === fl || w < fl + 10 || v + ms[i] < fl) { var land = lossLand(v, fl - 1); return out2.concat([land], split(land, pls.slice(i + 1), vE)); }
            }
            out2.push(w); v = w;
          }
          return out2.concat([vE]);
        }
        for (var gi = 0; gi < ranked.length; gi++) {
          var g0 = out[ranked[gi].riot_match_id];
          if (g0.after != null || gi === 0 || out[ranked[gi - 1].riot_match_id].after == null) continue;
          var run = [], j = gi;
          while (j < ranked.length && out[ranked[j].riot_match_id].after == null) run.push(j++);
          if (j >= ranked.length) break;  // 뒤에 기록이 없으면 못 맞춤
          var prev = out[ranked[gi - 1].riot_match_id].after, end = out[ranked[j].riot_match_id];
          if (end.after == null) { gi = j; continue; }
          var idx = run.concat([j]), vs = split(prev, idx.map(function (k) { return ranked[k].placement; }), end.after);
          // 등수와 방향이 맞을 때만 쓴다 (4등 안은 안 깎이고, 5등 밑은 안 오른다)
          var ok = idx.every(function (k, q) { var d = vs[q] - (q ? vs[q - 1] : prev), pl = ranked[k].placement; return pl <= 4 ? d >= 0 : d <= 0; });
          if (ok) idx.forEach(function (k, q) {
            var o = out[ranked[k].riot_match_id]; o.before = q ? vs[q - 1] : prev; o.after = vs[q]; o.diff = o.after - o.before; o.est = true;
            if (q < run.length) o.estA = true;  // 판 뒤 점수까지 추정 (마지막 판은 판 뒤 점수가 실제 기록)
          });
          gi = j;
        }
        var nw = ranked[ranked.length - 1], nn = ranked.length + offs[ranked.length - 1];
        out._newest = nw;
        if (maxN > nn && byN[nn] != null) out._pending = { before: byN[nn], after: byN[maxN], diff: byN[maxN] - byN[nn], t: lastT, n: maxN - nn };
        return out;
      }
    }
    ranked.forEach(function (m, i) {
      var nx = ranked[i + 1], pv = ranked[i - 1], s = m.summary || {}, before = s.player_rating_numeric, after = null, att = null;
      if (before == null) {
        var pa = pv && out[pv.riot_match_id];
        if (pa && pa.after != null) before = pa.after;
        else snaps.forEach(function (k) { if (k[0] <= st(m) && (!pv || k[0] > st(pv))) before = k[1]; });
      }
      if (nx && (nx.summary || {}).player_rating_numeric != null) after = nx.summary.player_rating_numeric;
      else for (var j = 0; j < snaps.length; j++) if (snaps[j][0] > st(m) && snaps[j][0] <= en(m) && (!nx || snaps[j][0] <= st(nx))) { att = snaps[j]; after = att[1]; break; }
      // 이 판 뒤 스냅샷이 판 수로 2판 이상 건너뛰면 사이에 기록 안 된 판이 있다 → 이 판 뒤 점수는 모름
      if (att && att[2] != null && pv) { var pa2 = out[pv.riot_match_id]; if (pa2 && pa2._n != null && att[2] - pa2._n >= 2) { after = null; att = null; } }
      // 스냅샷이 하나도 없을 때만 현재 점수를 마지막 판에 (판 기록이 늦게 와서 현재 점수가 다음 판 것일 수 있다)
      if (after == null && !nx && !att && d.ranked && d.ranked.rating_numeric != null && !snaps.some(function (k) { return k[0] > st(m); })) after = d.ranked.rating_numeric;
      out[m.riot_match_id] = { before: before, after: after, diff: before != null && after != null ? after - before : null, _n: att ? att[2] : null, _t: att ? att[0] : null };
    });
    // 판은 끝났는데 라이엇 판 기록이 아직 안 나온 판 (로비가 다 끝나야 기록이 나온다): 마지막 판 창 뒤에 찍힌 스냅샷
    var newest = ranked[ranked.length - 1], last = snaps[snaps.length - 1];
    out._newest = newest;
    if (newest && last) {
      var o = out[newest.riot_match_id], base = o && o.after != null ? o.after : null;
      var later = last[0] > en(newest) || (o && o._t != null && last[0] > o._t + 3e5);
      var more = o && o._n != null && last[2] != null ? last[2] - o._n : (later && base != null && last[1] !== base ? 1 : 0);
      if (later && more > 0 && base != null) out._pending = { before: base, after: last[1], diff: last[1] - base, t: last[0], n: more };
    }
    return out;
  }
  // 업데이트 시각 표기 하나로: "11/6 07:57 업데이트". 날짜만 있는 값("2026-11-06")은 "11/6 업데이트"
  function cupIcon() {  // 우승 표시 (이모지 대신 아이콘)
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "cupi"); s.setAttribute("aria-label", "우승");
    s.innerHTML = '<path fill="currentColor" d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z"/>';
    return s;
  }
  function updAt(x) {
    var dateOnly = typeof x === "string" && x.length <= 10;
    var d = x instanceof Date ? x : typeof x === "number" ? new Date(x) : new Date(dateOnly ? x + "T00:00:00" : x);
    if (isNaN(d)) return "";
    return (d.getMonth() + 1) + "/" + d.getDate() + (dateOnly ? "" : " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0")) + " 업데이트";
  }
  function metaAt() { return META ? Date.parse(META.updated.length <= 10 ? META.updated + "T23:59:59" : META.updated) : 0; }
  function ago(ts) {
    var m = Math.round((Date.now() - ts) / 6e4);
    if (m < 60) return Math.max(1, m) + "분 전";
    if (m < 1440) return Math.round(m / 60) + "시간 전";
    if (m < 1440 * 30) return Math.round(m / 1440) + "일 전";
    return fmtMD(new Date(ts));
  }
  // 날짜: 올해면 "10/1", 다른 해면 "2025/10/1" (2026-11-15 사용자: "년도 다르면 년도 써줘")
  function fmtMD(d) { return (d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + "/" : "") + (d.getMonth() + 1) + "/" + d.getDate(); }
  function setNo(k) { var m = /Set(\d+)(?:_(\d+))?/.exec(k); return m ? +m[1] + (m[2] ? 0.5 : 0) : 0; }  // TFTSet9_2 -> 9.5
  function mmss(sec) { sec = Math.round(sec || 0); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function plCls(p) { return "pl" + Math.min(5, p) + (p <= 4 ? " top" : ""); }  // 1 금 · 2 은 · 3 동 · 4 청록 · 5~8 회색 (롤체지지 색)
  function mtBoard(units, setNum) {  // MetaTFT/Riot 유닛 -> 페이지 보드 모양 {u, i, _ii, star, cost, icon, old, set}
    var sn = setNum || detectMatchSet({ units: units });
    return (units || []).map(function (u) {
      var a = apiUnit(u.character_id, sn);
      var its = (u.itemNames || u.items || []).map(function (it) { return itemInfo(it, sn); });
      return { u: a.name, cost: a.cost, star: u.tier, icon: a.icon || "", old: !!a.old, set: sn, i: its.map(function (x) { return x.name; }), _ii: its };
    });
  }
  function plStr(arr) {
    var s = el("div", "plstr");
    arr.forEach(function (m) { s.appendChild(el("span", plCls(m.placement), "#" + m.placement)); });
    return s;
  }

  // 세로축: 티어 문장 + 단계(IV~I). 구간이 넓으면 티어 경계만.
  // 세로축: 영어 약칭 글자만 (S3, D4, M 0, C 1200). 구간이 넓으면 눈금 간격을 넓혀서 6개 이하로.
  function axisLab(v) { var t = tierAt(v); return v >= 2800 ? TIER_ABBR[t] + " " + (v - 2800) : TIER_ABBR[t] + (4 - Math.floor((v % 400) / 100)); }
  function tierAxis(mk, Y, lo, hi, x1, x2) {
    var span = hi - lo, step = [100, 200, 400, 800, 1200, 1600, 2000].filter(function (st) { return span / st <= 6; })[0] || 2400;
    for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      var edge = v < 2800 ? v % 400 === 0 : v === 2800;
      mk("line", { x1: x1, x2: x2, y1: Y(v), y2: Y(v), class: edge ? "band" : "band sub" });
      mk("text", { x: 4, y: Y(v) + 6, class: "ylab", fill: LINE_COLOR[tierAt(v)] }, axisLab(v));
    }
  }
  function smoothPath(xy) {  // 점을 지나치지 않게 묶은 곡선 (위아래·앞뒤 모두)
    if (xy.length < 3) return xy.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var d = "M" + xy[0][0].toFixed(1) + " " + xy[0][1].toFixed(1);
    for (var i = 0; i < xy.length - 1; i++) {
      var p0 = xy[i - 1] || xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] || p2;
      var lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
      var c1y = Math.max(lo, Math.min(hi, p1[1] + (p2[1] - p0[1]) / 6)), c2y = Math.max(lo, Math.min(hi, p2[1] - (p3[1] - p1[1]) / 6));
      // 조절점 x도 두 점 사이로 묶는다. 간격이 들쭉날쭉하면(며칠 쉬고 연달아 한 판) 선이 뒤로 감긴다.
      var xl = Math.min(p1[0], p2[0]), xh = Math.max(p1[0], p2[0]);
      var c1x = Math.max(xl, Math.min(xh, p1[0] + (p2[0] - p0[0]) / 6)), c2x = Math.max(xl, Math.min(xh, p2[0] - (p3[0] - p1[0]) / 6));
      d += " C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) + " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
    }
    return d;
  }
  var lpGid = 0, DISTH = null;  // DISTH: 날짜별 티어 분포 (scripts/snap_dist.py)
  var TIER_ABBR = { IRON: "I", BRONZE: "B", SILVER: "S", GOLD: "G", PLATINUM: "P", EMERALD: "E", DIAMOND: "D", MASTER: "M", GRANDMASTER: "GM", CHALLENGER: "C" };
  function shortTier(v) {  // 2716 -> "D1 16", 4716 -> "C1 1916" (그래프 끝 말풍선)
    var t = tierAt(v);
    return v >= 2800 ? TIER_ABBR[t] + "1 " + (v - 2800) : TIER_ABBR[t] + (4 - Math.floor((v % 400) / 100)) + " " + (v % 100);
  }
  var LINE_COLOR = { IRON: "#7a6c66", BRONZE: "#b5713f", SILVER: "#7f93a8", GOLD: "#d39a12", PLATINUM: "#1d9e95", EMERALD: "#17a35b", DIAMOND: "#4d82e6", MASTER: "#a84fd8", GRANDMASTER: "#e2445b", CHALLENGER: "#e6a92a" };
  function tierAt(v) {
    if (v >= 2800) { var lp = v - 2800; return rkCut && lp >= rkCut.challenger_threshold ? "CHALLENGER" : rkCut && lp >= rkCut.grandmaster_threshold ? "GRANDMASTER" : "MASTER"; }
    return (TIER_BANDS[Math.floor(Math.max(0, v) / 400)] || TIER_BANDS[0])[1];
  }
  // 티어 구간마다 옅은 색 띠 (그래프 뒤)
  function tierBg(mk, Y, lo, hi, x1, x2) {
    var edges = TIER_BANDS.map(function (b) { return b[0]; }).concat(rkCut ? [2800 + rkCut.grandmaster_threshold, 2800 + rkCut.challenger_threshold] : []).concat([1e5]).sort(function (a, b) { return a - b; });
    for (var i = 0; i < edges.length - 1; i++) {
      var a = Math.max(lo, edges[i]), b = Math.min(hi, edges[i + 1]); if (b <= a) continue;
      mk("rect", { x: x1, width: x2 - x1, y: Y(b), height: Y(a) - Y(b), fill: LINE_COLOR[tierAt(edges[i])], "fill-opacity": i % 2 ? .07 : .045 });
    }
  }
  // 선 색이 점수(티어)에 따라 바뀌는 세로 그라데이션
  function tierStroke(defs, ns, id, Y, lo, hi) {
    var g = document.createElementNS(ns, "linearGradient");
    g.setAttribute("id", id); g.setAttribute("gradientUnits", "userSpaceOnUse"); g.setAttribute("x1", 0); g.setAttribute("x2", 0); g.setAttribute("y1", Y(hi)); g.setAttribute("y2", Y(lo));
    for (var k = 0; k <= 12; k++) {
      var v = hi - (hi - lo) * k / 12, st = document.createElementNS(ns, "stop");
      st.setAttribute("offset", (k / 12).toFixed(3)); st.setAttribute("stop-color", LINE_COLOR[tierAt(v)]); g.appendChild(st);
    }
    defs.appendChild(g);
  }
  function lpChart(games, lp) {  // games: 랭크 판, 옛날 -> 최근
    var pts = [];
    games.forEach(function (m, i) {
      var x = lp[m.riot_match_id]; if (!x) return;
      if (!pts.length && x.before != null) pts.push({ i: i - 0.5, v: x.before, start: true });
      if (x.after != null) pts.push({ i: i, v: x.after, m: m, diff: x.diff, est: !!x.estA, n: x._n });
      else if (pts.length) pts.push({ i: i, v: null, m: m, gap: true, n: x._n });  // 이 판 뒤 LP 기록이 없음 (사이에 아무도 갱신 안 함)
    });
    // 기록 없는 판: 앞뒤 기록 사이에 이어서 빈 점으로. 뒤에 기록이 없으면 버림
    while (pts.length && pts[pts.length - 1].gap) pts.pop();
    pts.forEach(function (p, k) {
      if (!p.gap) return;
      var a = k - 1; while (pts[a].gap) a--;
      var b = k + 1; while (pts[b].gap) b++;
      p.v = pts[a].v + (pts[b].v - pts[a].v) * (p.i - pts[a].i) / (pts[b].i - pts[a].i);
      p.sum = pts[b].v - pts[a].v;
    });
    var pd = lp._pending;
    if (pd && games.length && games[games.length - 1] === lp._newest) pts.push({ i: games.length - 1 + pd.n, v: pd.after, m: { match_timestamp: pd.t, placement: 0 }, diff: pd.diff, pend: true });
    if (pts.length < 2) return null;
    var W = 600, H = 250, pad = { l: 74, r: 14, t: 22, b: 26 }, n = games.length + (pd && pts[pts.length - 1].pend ? pd.n : 0);
    var ys = pts.map(function (p) { return p.v; });
    // 그마·챌 컷 선: 마스터 이상 구간이 있는 그래프에서만. 챌 컷은 그마 근처까지 왔을 때만 (아니면 그래프가 납작해짐)
    var cuts = [], hiP = Math.max.apply(null, ys);
    if (lp._cut && hiP >= 2800) {
      var tOf = function (k) { var p = pts[k]; return p.m ? p.m.match_timestamp : (pts[k + 1] && pts[k + 1].m ? pts[k + 1].m.match_timestamp : Date.now()); };
      var at = function (ser, t) { var v = ser[0][1]; ser.forEach(function (x) { if (x[0] <= t) v = x[1]; }); return v; };  // 기록 전이면 첫 기록 값
      [["g", "그마", "#e5484d"], ["c", "챌", "#e0a21a"]].forEach(function (k) {
        var ser = lp._cut[k[0]]; if (!ser || !ser.length) return;
        var vals = pts.map(function (p, j) { return at(ser, tOf(j)); });
        cuts.push({ name: k[1], color: k[2], vals: vals });  // 그래프 범위는 내 점수로만 (컷 때문에 줌아웃 안 함)
      });
    }
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), span = Math.max(120, hi - lo);
    lo = Math.max(0, lo - span * 0.2); hi = hi + span * 0.2;
    var x0 = pts[0].i, x1 = Math.max(pts[pts.length - 1].i, x0 + 1);
    var X = function (i) { return pad.l + (W - pad.l - pad.r) * (i - x0) / (x1 - x0); };
    var Y = function (v) { return pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / (hi - lo)); };
    var ns = "http://www.w3.org/2000/svg", gid = "lpg" + (++lpGid);
    var svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "lpchart");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "LP 그래프: " + lpText(pts[0].v) + "에서 " + lpText(pts[pts.length - 1].v));
    function mk(tag, attrs, txt) { var e = document.createElementNS(ns, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; }
    var defs = mk("defs", {});
    tierStroke(defs, ns, gid, Y, lo, hi);
    tierBg(mk, Y, lo, hi, pad.l, W - pad.r);
    tierAxis(mk, Y, lo, hi, pad.l, W - pad.r, Math.max.apply(null, ys));
    cuts = cuts.filter(function (c) { return c.vals.some(function (v) { return v >= lo && v <= hi; }); });  // 보이는 범위 안에 들어올 때만
    if (cuts.length) { var cp = mk("clipPath", { id: gid + "c" }); var cr = document.createElementNS(ns, "rect"); cr.setAttribute("x", pad.l); cr.setAttribute("y", pad.t); cr.setAttribute("width", W - pad.l - pad.r); cr.setAttribute("height", H - pad.t - pad.b); cp.appendChild(cr); }
    cuts.forEach(function (c) {
      var cxy = pts.map(function (p, j) { return [X(p.i), Y(c.vals[j])]; });
      mk("path", { d: smoothPath(cxy), class: "cutline", stroke: c.color, "clip-path": "url(#" + gid + "c)" });
      var lv = c.vals[c.vals.length - 1] - 2800, j0 = c.vals.findIndex(function (v) { return v >= lo && v <= hi; });
      mk("text", { x: Math.max(pad.l + 6, cxy[j0][0] + 4), y: Math.max(pad.t + 12, cxy[j0][1] - 6), class: "cutlab", fill: c.color }, c.name + " 컷 " + lv);
      c.xy = cxy;
    });
    var xy = pts.filter(function (p) { return !p.gap; }).map(function (p) { return [X(p.i), Y(p.v)]; }), path = smoothPath(xy);
    mk("path", { d: path, class: "glow", stroke: "url(#" + gid + ")" });  // 번진 빛
    mk("path", { d: path, class: "line", stroke: "url(#" + gid + ")" });
    var real = pts.filter(function (p) { return p.m; });
    var dr = n <= 20 ? 4.5 : n <= 40 ? 3.8 : n <= 60 ? 3 : 0;  // 판마다 점 (선과 같은 티어 색)
    if (dr) real.forEach(function (p) { if (!p.pend && !p.gap && !p.est) mk("circle", { cx: X(p.i), cy: Y(p.v), r: dr, fill: LINE_COLOR[tierAt(p.v)], class: "gdot" }); });
    real.forEach(function (p) { if (p.gap || p.est) mk("circle", { cx: X(p.i), cy: Y(p.v), r: Math.max(dr, 3.5), class: "gapdot" }); });
    // 라벨 자리: 선·점을 가장 적게 가리는 곳 (위 / 아래 / 왼쪽), 그래프 밖으로 안 나가게
    var samp = [];
    for (var q = 1; q < xy.length; q++) for (var t = 0; t <= 8; t++) samp.push([xy[q - 1][0] + (xy[q][0] - xy[q - 1][0]) * t / 8, xy[q - 1][1] + (xy[q][1] - xy[q - 1][1]) * t / 8]);
    if (xy.length === 1) samp.push(xy[0]);
    cuts.forEach(function (c) { for (var q = 1; q < c.xy.length; q++) for (var t = 0; t <= 8; t++) samp.push([c.xy[q - 1][0] + (c.xy[q][0] - c.xy[q - 1][0]) * t / 8, c.xy[q - 1][1] + (c.xy[q][1] - c.xy[q - 1][1]) * t / 8]); });
    function hits(r) {
      var n = 0, m = 5;
      samp.forEach(function (s) { if (s[0] > r.x - m && s[0] < r.x + r.w + m && s[1] > r.y - m && s[1] < r.y + r.h + m) n++; });
      if (r.y < 2 || r.y + r.h > H - pad.b - 2 || r.x < pad.l - 4 || r.x + r.w > W - 2) n += 100;
      return n;
    }
    function over(a, b) { return a && b && a.x < b.x + b.w + 4 && b.x < a.x + a.w + 4 && a.y < b.y + b.h + 4 && b.y < a.y + a.h + 4; }
    function place(cx, cy, w, h, avoid) {
      var cl = function (x) { return Math.max(pad.l - 2, Math.min(W - 4 - w, x)); };
      var cands = [{ x: cl(cx - w / 2), y: cy - h - 14 }, { x: cl(cx - w / 2), y: cy + 14 }, { x: cx - w - 16, y: cy - h / 2 }, { x: cl(cx - w - 10), y: cy - h - 14 }, { x: cl(cx - w - 10), y: cy + 14 }];
      cands.forEach(function (r) { r.w = w; r.h = h; r.s = hits(r) + (over(r, avoid) ? 50 : 0); });
      return cands.reduce(function (a, r) { return r.s < a.s ? r : a; });
    }
    var known = real.filter(function (p) { return !p.gap; });
    var top = known.reduce(function (a, p) { return p.v > a.v ? p : a; }, known[0]), last = real[real.length - 1];
    var lc = LINE_COLOR[tierAt(last.v)];
    mk("circle", { cx: X(last.i), cy: Y(last.v), r: 11, fill: lc, "fill-opacity": .18 });
    mk("circle", { cx: X(last.i), cy: Y(last.v), r: 6, fill: lc, class: "lastdot" });
    var lv = shortTier(last.v), lw = lv.length * 12.5 + 18;
    var lr = place(X(last.i), Y(last.v), lw, 30, null);
    if (top !== last && top.v > last.v) {  // 최고점 (마지막이 아니면)
      mk("circle", { cx: X(top.i), cy: Y(top.v), r: 4.5, class: "peakdot" });
      var pt = "최고 " + shortTier(top.v), pr = place(X(top.i), Y(top.v), pt.replace(/[^가-힣]/g, "").length * 17 + pt.replace(/[가-힣]/g, "").length * 10.5 + 6, 18, lr);
      if (pr.s < 50) mk("text", { x: pr.x + pr.w / 2, y: pr.y + 14, class: "peaklab", "text-anchor": "middle" }, pt);
    }
    mk("rect", { x: lr.x, y: lr.y, width: lw, height: 30, rx: 15, fill: lc });
    mk("text", { x: lr.x + lw / 2, y: lr.y + 21, class: "lastlab", "text-anchor": "middle" }, lv);
    var d0 = new Date(real[0].m.match_timestamp), d1 = new Date(last.m.match_timestamp), dm = new Date((real[0].m.match_timestamp + last.m.match_timestamp) / 2);
    var fd = fmtMD;
    mk("text", { x: pad.l, y: H - 6, class: "axis" }, fd(d0));
    if (fd(dm) !== fd(d0) && fd(dm) !== fd(d1)) mk("text", { x: (pad.l + W - pad.r) / 2, y: H - 6, class: "axis", "text-anchor": "middle" }, fd(dm));
    mk("text", { x: W - pad.r, y: H - 6, class: "axis", "text-anchor": "end" }, fd(d1));
    var cur = mk("line", { y1: pad.t, y2: H - pad.b, class: "cursor", visibility: "hidden" });
    var tip = el("div", "lptip2"); tip.hidden = true;
    var wrap = el("div", "lpwrap"); wrap.appendChild(svg); wrap.appendChild(tip);
    function show(ev) {
      var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W, best = real[0];
      real.forEach(function (p) { if (Math.abs(X(p.i) - x) < Math.abs(X(best.i) - x)) best = p; });
      cur.setAttribute("x1", X(best.i)); cur.setAttribute("x2", X(best.i)); cur.setAttribute("visibility", "visible");
      var dt = new Date(best.m.match_timestamp);
      tip.innerHTML = "";
      tip.appendChild(el("span", "tp " + (best.pend ? "pl5" : plCls(best.m.placement)), best.pend ? "?" : "#" + best.m.placement));
      var tx = el("div"); tx.appendChild(el("b", null, best.gap ? "LP 기록 없음" : (best.est ? "≈" : "") + lpText(best.v)));
      tx.appendChild(el("small", null, best.pend ? "방금 끝난 게임 · 기록 대기 중" : (best.n ? best.n + "판째 · " : "") + fmtMD(dt) + " " + String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0")));
      tip.appendChild(tx);
      if (best.gap) tip.appendChild(el("span", "lpd na", "앞뒤 합 " + (best.sum >= 0 ? "+" : "") + Math.round(best.sum)));
      else if (best.diff != null) tip.appendChild(el("span", "lpd " + (best.diff >= 0 ? "up" : "dn"), (best.diff >= 0 ? "+" : "") + best.diff));
      tip.hidden = false; tip.style.left = Math.min(r.width - 80, Math.max(80, X(best.i) / W * r.width)) + "px";
    }
    svg.addEventListener("pointermove", show); svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", function () { cur.setAttribute("visibility", "hidden"); tip.hidden = true; });
    return wrap;
  }
  function placeBars(pl) {
    var total = pl.reduce(function (a, b) { return a + b; }, 0), max = Math.max.apply(null, pl) || 1;
    var box = el("div", "plbars");
    pl.forEach(function (n, i) {
      var c = el("div", "plbar " + plCls(i + 1));
      var bar = el("i"); bar.style.height = (n / max * 100) + "%"; c.appendChild(el("span", "v", n)); c.appendChild(bar); c.appendChild(el("b", null, (i + 1) + "등"));
      box.appendChild(c);
    });
    return box;
  }
  function kvBox(list) {
    var st = el("div", "mt-stats rk-stats");
    list.forEach(function (x) { var sp = el("div"); var b = el("b", x[2] || null, x[1]); sp.appendChild(b); sp.appendChild(el("span", null, x[0])); st.appendChild(sp); });
    return st;
  }

  /* ---- 필드 가치 + 덱파워: site/power.json (scripts/build_power.py, 롤체지지 랭크 판 수천 판으로 학습한 '판 끝 보드 -> 예상 등수') ---- */
  var POWER = null;
