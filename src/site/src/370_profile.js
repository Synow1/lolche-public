  function dkWeight(u) { return (u.cost || (IDX.units[u.u] || {}).cost || 1) * ((u.i || []).length >= 2 ? 2 : 1); }
  function deckOfBoard(board, traits, old) {  // old: 지난 세트 판 -> 이번 시즌 덱과 맞추지 않는다 (레오나처럼 이름이 같은 유닛이 있어도 다른 유닛)
    if (old) return dkGuess(board, traits);
    if (META && !DK_VEC) DK_VEC = META.decks.map(function (d) {
      var v = {}; d.board.forEach(function (b) { if (!b.plant) v[b.u] = Math.max(v[b.u] || 0, dkWeight(b)); });
      return { d: d, v: v, main: (mainOf(d) || {}).u };
    });
    var g = {}; board.forEach(function (b) { g[b.u] = Math.max(g[b.u] || 0, dkWeight(b)); });
    var best = null;
    (DK_VEC || []).forEach(function (x) {
      var inter = 0, uni = 0, keys = {};
      Object.keys(x.v).concat(Object.keys(g)).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) { var a = g[k] || 0, b = x.v[k] || 0; inter += Math.min(a, b); uni += Math.max(a, b); });
      var sim = uni ? inter / uni : 0;
      if (x.main && !g[x.main]) sim *= 0.75;
      if (!best || sim > best.sim) best = { d: x.d, sim: sim };
    });
    if (best && best.sim >= 0.42) return { name: deckName(best.d), d: best.d, sim: best.sim };
    var r = dkGuess(board, traits); r.sim = best ? best.sim : 0; return r;
  }
  function dkGuess(board, traits) {  // 비슷한 덱이 없을 때: 제일 높은 시너지 + 메인 캐리
    var syn = synOfMatch(traits || [], board).filter(function (x) { return x.style !== "unique"; });
    var carry = board.filter(function (b) { return (b.i || []).length >= 2; }).sort(function (a, b) { return b.i.length - a.i.length || b.cost - a.cost; })[0];
    var nm = [syn[0] && syn[0].t, carry && carry.u].filter(Boolean).join(" ") || (syn.slice(0, 2).map(function (x) { return x.t; }).join(" ") || "기타");
    return { name: nm, d: null, sim: 0, carry: carry && carry.u };
  }
  function dkLine(board, traits, cls, old) {  // 판 카드·로비 줄의 덱 이름 줄
    var r = deckOfBoard(board, traits, old), w = el(r.d ? "button" : "div", "gm-dk" + (cls ? " " + cls : "") + (r.d ? "" : " guess"));
    w.appendChild(el("b", null, r.name));
    if (r.d) {
      w.type = "button";
      var bs = (document.getElementById("mt-basis") || {}).value || "emer", st = basisSt(r.d, bs) || basisSt(r.d, "all");
      if (st) w.appendChild(el("small", null, BASIS_LABEL[basisSt(r.d, bs) ? bs : "all"] + " 평균 " + st[0].toFixed(2)));
      w.addEventListener("click", function (e) { e.stopPropagation(); openDeck(r.d.id); });
    }
    return w;
  }
  function gameCard(m, lp, me) {
    var s = m.summary, g = el("article", "rk-gm " + plCls(m.placement));
    var h = el("div", "gm-head");
    h.appendChild(el("div", "gm-pl " + plCls(m.placement), "#" + m.placement));
    var t = el("div", "gm-t");
    var l1 = el("div", "gm-l1");
    l1.appendChild(el("b", null, QUEUE[m.queue_id] || m.queue_id));
    var x = lp[m.riot_match_id];
    if (x && x.diff != null) { var sp0 = el("span", "lpd " + (x.diff >= 0 ? "up" : "dn") + (x.est ? " est" : ""), (x.est ? "≈" : "") + (x.diff >= 0 ? "+" : "") + x.diff + "LP"); if (x.est) sp0.title = "LP 기록이 없어 추정한 값"; l1.appendChild(sp0); }
    else if (x && String(m.queue_id) === "1100" && (x.before != null || x.after != null)) l1.appendChild(el("span", "lpd na", "LP ?"));
    l1.appendChild(el("span", null, ago(m.match_timestamp)));
    if (x && x.decay) { var dz = el("span", "lpd dn decay", "이후 휴면 −" + x.decay + "LP"); dz.title = "이 판 뒤 게임 없이 줄어든 LP (휴면 감소)"; l1.appendChild(dz); }
    t.appendChild(l1);
    var board = mtBoard(s.units);
    t.appendChild(dkLine(board, s.traits, null, pwOtherSet(m.patch)));
    t.appendChild(el("div", "gm-l2", [s.level + "렙", mmss(m.game_duration || s.time_eliminated), m.lobby_label || (m.avg_rating ? "로비 " + tierText(m.avg_rating, true) : "")].filter(Boolean).join(" · ")));
    h.appendChild(t);
    var code = codeOfNames(board.map(function (u) { return u.u; }));
    if (code) h.appendChild(codeButton(code, "팀 코드"));
    g.appendChild(h);
    var pt = pwOtherSet(m.patch) ? null : powerTag(s.units, s.traits, s.level, false); if (pt) { if (pwOld(m.patch)) pt.appendChild(el("span", "pw-old", m.patch + " 판 · 지금 패치 기준")); g.appendChild(pt); }
    g.appendChild(synRow(synOfMatch(s.traits, board), false, 8));
    var mini = el("div", "mini cmp");
    board.sort(function (a, b) { return (b.cost - a.cost) || (b.star - a.star); }).forEach(function (u) { mini.appendChild(miniUnit({ name: u.u, cost: u.cost, star: u.star, items: u.i.map(function (n) { return { name: n }; }) }, true)); });
    g.appendChild(mini);
    if (m.match_data_url || m._lobby) {
      var lb = el("button", "gm-more", "로비 8명 보기"); lb.type = "button";
      var slot = el("div");
      lb.addEventListener("click", function () {
        if (slot.firstChild) { slot.innerHTML = ""; lb.textContent = "로비 8명 보기"; return; }
        slot.appendChild(lobbyView(m, me)); lb.textContent = "접기";
      });
      g.appendChild(lb); g.appendChild(slot);
    }
    return g;
  }

  /* ---- 롤체지지(닥지지) API: 전적·친구는 이걸로. MetaTFT는 저티어 판이 빠질 때가 있어서 (롤체지지 화면과 같은 판을 보여주려고) ----
     받은 걸 기존 화면 코드가 쓰는 MetaTFT 모양으로 바꾼다. 지난 시즌 최고 티어·판수만 MetaTFT에서. */
  var DAK = "https://tft.dakgg.io/api/v1/", TIER_BASE = { IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200, PLATINUM: 1600, EMERALD: 2000, DIAMOND: 2400 };
  function dakSeason() { return "set" + LIVE_SET_ID.replace("TFTSet", "").replace("_2", ".5"); }
  function dakNum(tier, rank, lp) {
    if (!tier || tier === "UNRANKED") return null;
    return TIER_BASE[tier] == null ? 2800 + (lp || 0) : TIER_BASE[tier] + (4 - (DIV[rank] || 4)) * 100 + (lp || 0);
  }
  function numRating(v) {  // 숫자 -> "SILVER II 63 LP"
    if (v == null) return "";
    if (v >= 2800) { var lp = v - 2800, t = rkCut && lp >= rkCut.challenger_threshold ? "CHALLENGER" : rkCut && lp >= rkCut.grandmaster_threshold ? "GRANDMASTER" : "MASTER"; return t + " I " + lp + " LP"; }
    var b = TIER_BANDS[Math.floor(v / 400)] || TIER_BANDS[0];
    return b[1] + " " + ROMAN[4 - Math.floor((v % 400) / 100)] + " " + (v % 100) + " LP";
  }
  function dakKey(riotId) { var p = riotId.split("#"); return "summoners/kr/" + encodeURIComponent(p[0] + "-" + (p[1] || "KR1")); }
  function dakGet(path) { return viaApp(DAK + path); }
  function dakMatches(resp, puuid) {
    var sm = {}, lg = {};
    (resp.summoners || []).forEach(function (s) { sm[s.puuid] = s; });
    (resp.summonerLeagues || []).forEach(function (x) { if (x.queueId === 1100) lg[x.puuid] = x; });
    var conv = function (us) { return (us || []).map(function (u) { return { character_id: u.character_id, tier: u.tier, itemNames: u.items || [] }; }); };
    return (resp.matches || []).map(function (m) {
      var me = m.participants.filter(function (p) { return p.puuid === puuid; })[0]; if (!me) return null;
      var lob = m.participants.map(function (p) {
        var s = sm[p.puuid], l = lg[p.puuid];
        // 롤체지지 판 기록엔 로비 사람들 티어만 있고 LP는 없다 (그래서 티어 이름만)
        return { placement: p.placement, level: p.level, puuid: p.puuid, units: conv(p.units), traits: p.traits, riot_id: s ? s.gameName + "#" + s.tagLine : "?", rating: l && l.tier && l.tier !== "UNRANKED" ? l.tier + " " + (l.rank || "I") + " 0 LP" : "" };
      });
      return { riot_match_id: "KR_" + m.matchId, patch: m.patchVersion || "", queue_id: m.queueId, placement: me.placement, match_timestamp: m.gameCreatedAt, game_duration: m.gameLength,
        lobby_label: lobbyLabel(lob.map(function (p) { return lg[p.puuid]; }).filter(Boolean)), summary: { level: me.level, units: conv(me.units), traits: me.traits, time_eliminated: me.timeEliminated }, _lobby: lob };
    }).filter(Boolean);
  }
  function lobbyLabel(ls) {  // 로비 평균 티어 (LP 없이 티어·단계만). 단계마다 1칸, 마스터·그마·챌은 티어 한 칸(4)씩
    ls = ls.filter(function (l) { return l.tier && l.tier !== "UNRANKED"; });
    if (!ls.length) return "";
    var APEX = { MASTER: 28, GRANDMASTER: 32, CHALLENGER: 36 };
    var avg = Math.round(ls.reduce(function (a, l) { return a + (APEX[l.tier] != null ? APEX[l.tier] : Math.floor(dakNum(l.tier, l.rank, 0) / 100)); }, 0) / ls.length);
    if (avg >= 34) return "로비 평균 챌린저";
    if (avg >= 30) return "로비 평균 그랜드마스터";
    if (avg >= 28) return "로비 평균 마스터";
    return "로비 평균 " + TIER_KO[TIER_BANDS[Math.floor(avg / 4)][1]] + " " + (4 - avg % 4);
  }
  function dakHist(seasons) {  // 롤체지지 시즌 기록 (최종 티어만, LP·판수 없음)
    var h = {};
    (seasons || []).forEach(function (s) {
      if (!s.tier || s.tier === "UNRANKED") return;
      var k = "TFTSet" + s.season.replace("set", "").replace(".5", "_2"), t = s.tier + " " + (s.rank || "I") + " 0 LP";
      h[k] = { "1100": { rating_text: t, peak_rating: t, num_games: null, nolp: true } };
    });
    return h;
  }
  // opt: { queue: "1100" 이면 랭크 판만, pages: 받을 판 목록 페이지 수, history: MetaTFT 지난 시즌도 }
  function dakProfile(riotId, opt) {
    opt = opt || {};
    var base = dakKey(riotId), season = opt.season || dakSeason(), q = opt.queue ? "&queueId=" + opt.queue : "";
    function logsFrom(page, acc) {
      return dakGet(base + "/league-logs?queueId=1100&season=" + season + "&page=" + page + "&size=200&sort=desc").then(function (r) {
        acc = acc.concat(r.summonerLeagueLogs || []);
        if (page === 1 && !opt.season) applyCutNow(r.summonerTierCutoffs);
        return r.meta && r.meta.totalCount > acc.length && page < 5 && (r.summonerLeagueLogs || []).length ? logsFrom(page + 1, acc) : acc;
      });
    }
    var mt = opt.history ? getMT("public/profile/lookup_by_riotid/KR/" + encodeURIComponent(riotId.split("#")[0]) + "/" + encodeURIComponent(riotId.split("#")[1] || "KR1") + "?source=full_profile&tft_set=" + LIVE_SET_ID).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([dakGet(base + "/profile?season=" + season), logsFrom(1, []).catch(function () { return []; }), dakGet(base + "/matches?season=" + season + "&page=1" + q).catch(function () { return null; }), mt])
      .then(function (r) {
        var pf = r[0], logs = r[1], m1 = r[2], mtp = r[3];
        if (!pf || !pf.summoner) throw new Error("소환사를 찾을 수 없어요");
        var puuid = pf.summoner.puuid, L = (pf.summonerLeagues || []).filter(function (x) { return x.queueId === 1100; })[0];
        var lg = logs.map(function (x) { return [x[0], dakNum(x[1], x[2], x[3]), x[4]]; }).filter(function (x) { return x[1] != null; }).sort(function (a, b) { return a[0] - b[0]; });
        var cur = L ? dakNum(L.tier, L.rank, L.leaguePoints) : null, peak = lg.reduce(function (a, x) { return Math.max(a, x[1]); }, cur || 0);
        var pl = (pf.summonerSeasonPlacements || []).filter(function (x) { return x.queueId === 1100; })[0];
        var d = {
          summoner: { puuid: puuid, profile_icon_url: pf.summoner.profileIconUrl, summoner_level: pf.summoner.summonerLevel, last_refreshed: Date.parse(pf.summoner.syncedAt) / 1000 },
          ranked: L ? { rating_text: numRating(cur), rating_numeric: cur, peak_rating: peak > cur ? numRating(peak) : null, timestamp: lg.length ? new Date(lg[lg.length - 1][0]).toISOString().slice(0, 23) : "" } : {},
          server_rank: L && L.rating && L.rating.tier ? { rank: L.rating.tier.rank, total: L.rating.tier.total } : null,
          _pct: L && L.rating ? L.rating : null,  // 롤체지지: 판수·승리·순방·승률·순방률의 한국 상위 %
          ranked_season_stats: pl ? { "1100": { total: pl.values.reduce(function (a, b) { return a + b; }, 0), placements: pl.values } } : {},
          rating_history: mtp && mtp.rating_history ? mtp.rating_history : dakHist(pf.summonerSeasons),
          ranked_rating_changes: lg.map(function (x) { return { queue_id: 1100, rating_numeric: x[1], num_games: x[2], created_timestamp: new Date(x[0]).toISOString().slice(0, 23) }; }),
          matches: m1 ? dakMatches(m1, puuid) : [], _logs: lg, _total: m1 && m1.meta ? m1.meta.totalCount : 0
        };
        var got = 1;
        function needPages(want) { return Math.min(Math.ceil(Math.min(want, d._total) / 20), 25); }  // 20판씩, 최대 500판
        d._canMore = function (want) { return got < needPages(want); };
        d._more = function (want) {  // 판 목록 더 받기
          var need = needPages(want), ps = [];
          for (var p = got + 1; p <= need; p++) ps.push(dakGet(base + "/matches?season=" + season + "&page=" + p + q).then(function (x) { return dakMatches(x, puuid); }).catch(function () { return []; }));
          got = Math.max(got, need);
          return Promise.all(ps).then(function (rs) { rs.forEach(function (a) { d.matches = d.matches.concat(a); }); return d; });
        };
        return opt.pages > 1 ? d._more(opt.pages * 20) : d;
      });
  }
  // 지난 시즌 최종 순위표(롤체지지, 100명씩 20쪽)에서 어떤 LP가 몇 위쯤인지. 순위표는 시즌이 끝나면 안 바뀌니 기기에 저장.
  var LB_CACHE = {};
  function lbPage(season, p) {
    var key = season + ":" + p;
    if (LB_CACHE[key]) return Promise.resolve(LB_CACHE[key]);
    try { var c = JSON.parse(localStorage.getItem("tft-guide-lb-" + key) || "null"); if (c) { LB_CACHE[key] = c; return Promise.resolve(c); } } catch (e) {}
    return dakGet("leaderboards/summoners/kr?page=" + p + "&queueId=1100&season=" + season).then(function (r) {
      var a = (r.summonerRankings || []).map(function (x) { return x.leaguePoints; }); LB_CACHE[key] = a;
      try { localStorage.setItem("tft-guide-lb-" + key, JSON.stringify(a)); } catch (e) {}
      return a;
    });
  }
  function ladderPos(season, lp) {  // 순위표 안이면 순위, 순위표(보통 1000~2000명) 끝보다 낮으면 -(순위표 인원) = "그 밖"
    var lo = 1, hi = 20, emptyFrom = 21;
    function step() {
      if (lo > hi) return Promise.resolve(lo >= emptyFrom || lo > 20 ? -((lo - 1) * 100) : (lo - 1) * 100 + 1);
      var mid = Math.floor((lo + hi) / 2);
      return lbPage(season, mid).then(function (a) {
        if (!a.length) { emptyFrom = Math.min(emptyFrom, mid); hi = mid - 1; return step(); }
        if (lp > a[0]) { if (mid === 1) return 1; hi = mid - 1; return step(); }
        if (lp < a[a.length - 1]) { lo = mid + 1; return step(); }
        return (mid - 1) * 100 + a.filter(function (v) { return v > lp; }).length + 1;
      });
    }
    return step().catch(function () { return null; });
  }
  // 롤체지지 갱신: 처음엔 {retry_after: ms}만 오고, 그만큼 기다렸다 다시 부르면 {done: true}. done까지 기다려야 새 LP·판이 보인다 (최대 ~15초)
  function dakSync(riotId) {
    var path = "rpc/summoner-sync/by-name/kr/" + dakKey(riotId).replace("summoners/kr/", "") + "?web=1", tries = 0;
    function step() {
      return dakGet(path).then(function (r) {
        if (r && r.retry_after && ++tries < 12) return new Promise(function (res) { setTimeout(res, Math.min(3000, Math.max(500, r.retry_after))); }).then(step);
        return r;
      });
    }
    return step().catch(function () {});
  }

  // 다른 탭에서 전적 열기: 기록 하나로 (뒤로가기 한 번이면 보던 탭·위치로)
  function openProfile(id) {
    if (current === "rank") { rkProfile(id); window.scrollTo(0, 0); return; }
    var prev = current, y = window.scrollY, wasBoard = !document.getElementById("rk-board").hidden, prevId = rkCur, prevSea = RK_SEASON;
    navPush("tab", function () {
      applyTab(prev, false, y);
      if (wasBoard) rkView("board"); else if (prevId) rkProfile(prevId, prevSea);
    });
    showTab("rank", false);
    navQuiet = true; try { rkProfile(id); } finally { navQuiet = false; }
    window.scrollTo(0, 0);
  }
  var rkCur = null, RK_RETRY = {};
  function rkProfile(riotId, season) {
    var sea = season && season !== dakSeason() ? season : null;  // 지난 시즌 기록 보기 (롤체지지 season=set15 등)
    if (riotId !== rkCur || sea !== RK_SEASON) {  // 뒤로가기: 앞에 보던 전적(로비에서 넘어온 경우·이번 시즌) 또는 검색 첫 화면으로
      var prev = rkCur, prevSea = RK_SEASON, wasBoard = !document.getElementById("rk-board").hidden, py = window.scrollY;
      navPush("prof", function () {
        if (wasBoard) { rkView("board"); window.scrollTo(0, py); return; }  // 한국 랭킹에서 눌렀으면 랭킹 목록 그 위치로
        if (prev) rkProfile(prev, prevSea);
        else { rkCur = null; RK_SEASON = null; document.getElementById("rk-prof").innerHTML = ""; document.getElementById("rk-q").value = ""; rkFavs(); }
        window.scrollTo(0, prev ? 0 : py);
      });
    }
    if (sea && !OLD) { RK_SEASON = sea; rkCur = riotId; document.getElementById("rk-prof").innerHTML = ""; document.getElementById("rk-prof").appendChild(el("p", "sub", "불러오는 중")); loadOld().then(function () { if (rkCur === riotId && RK_SEASON === sea) rkProfile(riotId, sea); }); return; }
    RK_SEASON = sea;
    rkCur = riotId;
    rkView("search");
    var out = document.getElementById("rk-prof"); out.innerHTML = "";
    document.getElementById("rk-q").value = riotId; document.getElementById("rk-sug").innerHTML = "";
    if (!LIVE) { out.appendChild(el("p", "sub", "전적 검색은 앱이나 PC 웹에서 볼 수 있어요")); return; }
    out.appendChild(el("p", "sub", riotId + " 불러오는 중"));
    var parts = riotId.split("#");
    if (!rkCut) getMT("public/promotion_thresholds/latest").then(function (d) { rkCut = d.filter(function (c) { return c.region.toLowerCase() === "kr"; })[0] || null; }).catch(function () {});
    dakProfile(riotId, { history: true, season: sea }).then(function (d) {
      if (rkCur !== riotId || RK_SEASON !== sea) return;
      out.innerHTML = "";
      if (sea) {  // 지난 시즌 보는 중: 맨 위 띠
        var sb = el("div", "rk-sea"); sb.appendChild(el("b", null, "S" + sea.replace("set", "") + " 기록"));
        var back = el("button", "tb-clear", "이번 시즌으로"); back.type = "button"; back.addEventListener("click", function () { rkProfile(riotId); window.scrollTo(0, 0); });
        sb.appendChild(back); out.appendChild(sb);
      }
      var f = favs().filter(function (x) { return x !== riotId; }); f.unshift(riotId); setFavs(f);
      var me = (d.summoner || {}).puuid;
      var rk = d.ranked || {}, sr = d.server_rank;

      // 머리: 소환사 · 랭크 문장 · 시즌 성적 (롤체지지처럼)
      var card = el("div", "fcard rk-card");
      var top = el("div", "rk-top");
      var av = el("div", "rk-av");
      if (d.summoner && (d.summoner.profile_icon_url || d.summoner.profile_icon_id != null)) {
        var ai = el("img"); ai.alt = ""; ai.src = d.summoner.profile_icon_url || "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/" + d.summoner.profile_icon_id + ".jpg";
        ai.onerror = function () { ai.remove(); }; av.appendChild(ai);
      }
      if (d.summoner && d.summoner.summoner_level) av.appendChild(el("span", null, d.summoner.summoner_level));
      top.appendChild(av);
      var who = el("div", "rk-who");
      var h3 = el("h3", null, parts[0]); h3.appendChild(el("small", null, "#" + (parts[1] || ""))); h3.appendChild(starBtn(riotId)); who.appendChild(h3);
      if (d.summoner && d.summoner.last_refreshed) who.appendChild(el("p", "rk-upd", ago(d.summoner.last_refreshed * 1000) + " 업데이트"));
      top.appendChild(who);
      var rf = el("button", "rk-rf", "전적 갱신"); rf.type = "button";
      rf.addEventListener("click", function () {
        rf.disabled = true; rf.textContent = "갱신 중";
        getMT("public/profile/refresh_by_riotid/KR/" + encodeURIComponent(parts[0]) + "/" + encodeURIComponent(parts[1]) + "?source=full_profile&tier=1").catch(function () {});  // 지난 시즌 기록용
        dakSync(riotId).then(function () { rkProfile(riotId, RK_SEASON); });
      });
      top.appendChild(rf); card.appendChild(top);

      var tp = tierParts(rk.rating_text);
      var rb = el("div", "rk-rank"); if (tp) rb.style.setProperty("--tc", TIER_COLOR[tp[0]]);
      rb.appendChild(tierImg(tp && tp[0], "rk-bigemb"));
      var rt = el("div", "rk-rt");
      var seaNo = RK_SEASON ? RK_SEASON.replace("set", "") : LIVE_SET_ID.replace("TFTSet", "").replace("_2", ".5");
      var sl = el("div", "rk-sl"); sl.appendChild(el("span", "rk-sb" + (RK_SEASON ? " old" : ""), "S" + seaNo));
      sl.appendChild(el("small", null, RK_SEASON ? "지난 시즌 랭크 게임" : (LIVE_SET_ID !== SET_ID ? "본섭 " + seaNo + "시즌 랭크 게임 · 12/1 19시즌 전환" : "이번 시즌 랭크 게임"))); rt.appendChild(sl);
      var tn = el("div", "rk-tn");
      var apexT = tp && /MASTER|CHALLENGER/.test(tp[0]);
      tn.appendChild(el("b", null, tp ? TIER_KO[tp[0]] + (tp[1] && !apexT ? " " + ROMAN[tp[1]] : "") : "언랭"));
      if (tp) tn.appendChild(el("span", null, tp[2] + " LP"));
      rt.appendChild(tn);
      if (sr && sr.rank) rt.appendChild(el("p", null, "한국 " + sr.rank.toLocaleString() + "위 · 상위 " + Math.max(0.01, sr.rank / sr.total * 100).toFixed(sr.rank / sr.total < 0.01 ? 2 : 1) + "%"));
      if (rk.peak_rating && rk.peak_rating !== rk.rating_text) rt.appendChild(el("p", "rk-peak", "시즌 최고 " + tierText(rk.peak_rating, true)));
      rb.appendChild(rt); card.appendChild(rb);

      var ss = (d.ranked_season_stats || {})["1100"];
      if (ss && ss.total) {
        var pl = ss.placements, tot = ss.total, t4 = pl.slice(0, 4).reduce(function (a, b) { return a + b; }, 0);
        var avg = pl.reduce(function (a, n, i) { return a + n * (i + 1); }, 0) / tot;
        var gr = el("div", "rk-grid");
        var R = d._pct || {}, pct = function (k) { var r = R[k]; return r && r.percent != null ? "상위 " + (r.percent < 1 ? r.percent.toFixed(2) : r.percent < 10 ? r.percent.toFixed(1) : Math.round(r.percent)) + "%" : ""; };
        [["판수", tot, pct("plays")], ["평균 등수", avg.toFixed(2), ""], ["1등", pl[0], pct("wins")], ["승률", (pl[0] / tot * 100).toFixed(1) + "%", pct("winrate")], ["순방", t4, pct("tops")], ["순방률", (t4 / tot * 100).toFixed(1) + "%", pct("toprate")]].forEach(function (x) {
          var c = el("div"); c.appendChild(el("span", null, x[0])); c.appendChild(el("b", null, x[1]));
          if (x[2]) c.appendChild(el("small", "rk-pct", x[2]));
          gr.appendChild(c);
        });
        card.appendChild(gr);
      }
      // 지난 시즌: 칸은 최종 티어, 누르면 시즌별 최종·최고 티어와 판수 표
      var hist = d.rating_history || {}, past = Object.keys(hist).filter(function (k) { return k !== LIVE_SET_ID && hist[k]["1100"] && (hist[k]["1100"].num_games || hist[k]["1100"].nolp); })
        .sort(function (a, b) { return setNo(b) - setNo(a); });
      function tname(text) { var p = tierParts(text); return p ? TIER_KO[p[0]] + (p[1] && !/MASTER|CHALLENGER/.test(p[0]) ? " " + p[1] : "") : (text || "-"); }
      function tcol(text) { var p = tierParts(text); return p ? "color-mix(in srgb, " + TIER_COLOR[p[0]] + " 70%, var(--ink))" : ""; }
      var nolp = false;
      function tcell(text, place, approx, extra) {  // place: 최종 한국 순위, approx: 최고 LP를 최종 순위표에 넣은 순위(밖이면 음수), extra: 아랫줄 (상위 %·날짜)
        var c = el("div", "rh-t"), p = tierParts(text); c.appendChild(tierImg(p && p[0]));
        var t = el("div"); var b = el("b", null, tname(text)); b.style.color = tcol(text); t.appendChild(b);
        if (p && !nolp) t.appendChild(el("small", null, p[2] + "LP" + (place ? " · " + place.toLocaleString() + "위" : approx > 0 ? " · ≈" + approx.toLocaleString() + "위" : "")));
        if (extra) t.appendChild(el("small", "rh-x", extra));
        c.appendChild(t); return c;
      }
      if (past.length) {
        var ps = el("div", "rk-past"), tbl = el("div", "rk-hist"), sel = null; tbl.hidden = true;
        function chips() { ps.innerHTML = "";
          // 이번 시즌 칩을 맨 앞에: 지금 보는 게 이번 시즌이면 강조, 지난 시즌을 보는 중이면 눌러서 돌아가기
          var cur = el("button", "rk-ps now" + (RK_SEASON ? "" : " on")); cur.type = "button";
          cur.appendChild(el("small", null, "S" + LIVE_SET_ID.replace("TFTSet", "").replace("_2", ".5")));
          if (!RK_SEASON) { var cp = tierParts(rk.rating_text); cur.appendChild(tierImg(cp && cp[0])); var cb = el("b", null, tname(rk.rating_text)); cb.style.color = tcol(rk.rating_text); cur.appendChild(cb); }
          else cur.appendChild(el("b", null, "이번 시즌"));
          cur.addEventListener("click", function () { if (RK_SEASON) { rkProfile(riotId, null); window.scrollTo(0, 0); } });
          ps.appendChild(cur);
          past.forEach(function (k) {
          var r = seasonRow(k), p = tierParts(r.rating_text), pk = tierParts(r.peak_rating), c = el("button", "rk-ps"); c.type = "button";
          c.appendChild(el("small", null, "S" + setNo(k))); c.appendChild(tierImg(p && p[0]));
          var b = el("b", null, tname(r.rating_text)); b.style.color = tcol(r.rating_text); c.appendChild(b);
          if (pk && p && pk[0] !== p[0]) { c.appendChild(el("i", null, "↑")); c.appendChild(tierImg(pk[0], "temb pk")); }  // 최고가 더 높았던 시즌
          c.addEventListener("click", function () { sel = sel === k ? null : k; drawHist(); });
          ps.appendChild(c);
        }); }
        chips();
        var sRank = null;  // 시즌별 최종 순위·LP·판수 (롤체지지, 표를 처음 열 때 받는다)
        // 최종은 롤체지지 기록을 먼저 (MetaTFT는 판이 빠지면 최종 티어가 틀린다), 최고는 둘 중 높은 쪽
        var sPeak = {}, sDist = {};  // 시즌별 최고점(롤체지지 판별 LP 기록: 점수·날짜), 시즌 끝 티어 분포
        function seasonRow(k) {
          var r = hist[k]["1100"], L = sRank && sRank[k], P = sPeak && sPeak[k];  // 칩을 처음 그릴 때는 아직 없음
          var fin = L ? L.tier + " " + (L.rank || "I") + " " + L.leaguePoints + " LP" : r.rating_text;
          var fv = L ? dakNum(L.tier, L.rank, L.leaguePoints) : null, pp = tierParts(r.peak_rating);
          var pv = pp && !r.nolp ? dakNum(pp[0], ROMAN[pp[1]] || "I", pp[2]) : null;
          var peak = pv != null && (fv == null || pv > fv) ? r.peak_rating : fin, peakV = Math.max(pv || 0, fv || 0), peakAt = null;
          if (P && P.v != null && P.v >= peakV) { peak = P.text; peakAt = P.t; }
          if (!L && !P) return r;
          return { rating_text: fin, peak_rating: peak, num_games: L ? L.plays : r.num_games, peakAt: peakAt, finPct: L && L.rating && L.rating.tier ? L.rating.tier.percent : null, nolp: r.nolp && !L };
        }
        function cacheGet(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }
        function cacheSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
        function loadPeakLogs(k) {  // 지난 시즌 기록은 안 바뀌니 기기에 저장
          var season = "set" + setNo(k), ck = "tft-guide-peak-" + riotId + "-" + season, c = cacheGet(ck);
          if (c) { sPeak[k] = c; return Promise.resolve(); }
          var acc = [];
          function page(p) {
            return dakGet(dakKey(riotId) + "/league-logs?queueId=1100&season=" + season + "&page=" + p + "&size=200&sort=desc").then(function (r) {
              acc = acc.concat(r.summonerLeagueLogs || []);
              if (r.meta && r.meta.totalCount > acc.length && p < 6 && (r.summonerLeagueLogs || []).length) return page(p + 1);
            });
          }
          return page(1).then(function () {
            var best = {};
            acc.forEach(function (x) { var v = dakNum(x[1], x[2], x[3]); if (v != null && (best.v == null || v > best.v)) best = { v: v, t: x[0], text: x[1] + " " + (x[2] || "I") + " " + x[3] + " LP" }; });
            sPeak[k] = best; cacheSet(ck, best);
          }).catch(function () {});
        }
        function loadDist(k) {
          var season = "set" + setNo(k), ck = "tft-guide-dist-" + season, c = cacheGet(ck);
          if (c) { sDist[k] = c; return Promise.resolve(); }
          return dakGet("leaderboards/tier-distributions/kr?season=" + season + "&queueId=1100").then(function (r) { if (r.tierDistributions && r.tierDistributions.length) { sDist[k] = r.tierDistributions; cacheSet(ck, r.tierDistributions); } }).catch(function () {});
        }
        function topPct(k, text, at) {  // 위 단계들 비율 + 그 단계 안에서 LP만큼 (예전엔 단계 전체를 넣어 93LP도 0LP와 같은 맨 아래로 잡혔다). 그날 분포를 저장해 뒀으면(시즌 18부터) 그걸로
          var d = sDist && sDist[k], p = tierParts(text), hd = DISTH && DISTH["set" + setNo(k)];
          if (hd && at) { var day = new Date(at).toISOString().slice(0, 10), best = null; Object.keys(hd).forEach(function (x) { if (x <= day && (!best || x > best)) best = x; }); if (best) d = hd[best]; }
          if (!d || !p) return null;
          var key = /MASTER|CHALLENGER/.test(p[0]) ? p[0] : p[0] + " " + ROMAN[p[1]], cum = 0;
          var lp = /MASTER|CHALLENGER/.test(p[0]) ? null : Math.max(0, Math.min(99, +p[2] || 0));
          for (var i = 0; i < d.length; i++) {
            if (d[i][0] === key) return (cum + d[i][1] * (lp == null ? 1 : 1 - lp / 100)) * 100;
            cum += d[i][1];
          }
          return null;
        }
        function pctText(x) { return "상위 " + (x < 1 ? x.toFixed(2) : x.toFixed(1)) + "%"; }
        function loadRanks() {
          sRank = {};
          Promise.all(past.map(function (k) {
            return dakGet(dakKey(riotId) + "/profile?season=set" + setNo(k)).then(function (r) {
              var L = (r.summonerLeagues || []).filter(function (x) { return x.queueId === 1100; })[0]; if (L) sRank[k] = L;
            }).catch(function () {});
          }).concat(past.map(loadPeakLogs), past.map(loadDist))).then(function () { chips(); drawHist(); loadPeaks(); });
        }
        var peakPos = {};
        function loadPeaks() {
          past.forEach(function (k) {
            var r = seasonRow(k), p = tierParts(r.peak_rating);
            if (!p || r.nolp || !/MASTER|CHALLENGER/.test(p[0])) return;
            ladderPos("set" + setNo(k), p[2]).then(function (pos) { if (pos) { peakPos[k] = pos; drawHist(); } });
          });
        }
        function drawHist() {
          ps.querySelectorAll(".rk-ps:not(.now)").forEach(function (c, i) { c.classList.toggle("on", past[i] === sel); });
          tbl.hidden = !sel; tbl.innerHTML = ""; if (!sel) return;
          if (!sRank && LIVE) loadRanks();
          var hd = el("div", "rh-row rh-hd"); ["시즌", "최종", "최고", "판"].forEach(function (x) { hd.appendChild(el("span", null, x)); }); tbl.appendChild(hd);
          past.forEach(function (k) {
            var r = hist[k]["1100"], row = el("div", "rh-row" + (k === sel ? " on" : "")), L = sRank && sRank[k];
            r = seasonRow(k);
            nolp = !!r.nolp;
            var place = L && L.rating && L.rating.tier && /MASTER|CHALLENGER/.test(L.tier) ? L.rating.tier.rank : null;
            var sn = el("div", "rh-s"); sn.appendChild(el("b", null, "S" + setNo(k))); var nm = SET_NAME[Math.floor(setNo(k))];
            if (nm && setNo(k) % 1 === 0) sn.appendChild(el("small", null, nm)); row.appendChild(sn);
            var fx = !place && r.finPct != null ? pctText(r.finPct) : "";
            var pk = peakPos[k], pp2 = topPct(k, r.peak_rating, r.peakAt), px = [];
            // 최고가 최종보다 높은데 %가 더 나쁘게 나오지 않게 (최종은 롤체지지 실제 순위 %, 최고는 분포로 계산이라 기준이 다르다)
            var fp = tierParts(r.rating_text), hp = tierParts(r.peak_rating);
            if (pp2 != null && r.finPct != null && fp && hp && dakNum(hp[0], ROMAN[hp[1]] || "I", hp[2]) >= dakNum(fp[0], ROMAN[fp[1]] || "I", fp[2])) pp2 = Math.min(pp2, r.finPct);
            if (!(pk > 0) && pp2 != null) px.push(pctText(pp2));
            if (r.peakAt) { var dt = new Date(r.peakAt); px.push(dt.getFullYear() % 100 + "." + (dt.getMonth() + 1) + "." + dt.getDate()); }
            row.appendChild(tcell(r.rating_text, place, null, fx)); row.appendChild(tcell(r.peak_rating, null, pk, px.join(" · ")));
            row.appendChild(el("div", "rh-n", r.num_games || "-"));
            // 누르면 그 시즌 그래프와 전적
            var season = "set" + setNo(k);
            row.classList.add("go"); if (RK_SEASON === season) row.classList.add("cur");
            row.setAttribute("role", "button"); row.setAttribute("aria-label", "S" + setNo(k) + " 기록 보기");
            row.addEventListener("click", function () { rkProfile(riotId, season); window.scrollTo(0, 0); });
            tbl.appendChild(row);
            var other = [["1160", "더블업"], ["1130", "초고속"]].filter(function (q) { return hist[k][q[0]] && hist[k][q[0]].num_games; });
            if (other.length) tbl.appendChild(el("div", "rh-o", other.map(function (q) { var x = hist[k][q[0]]; return q[1] + " " + (q[0] === "1130" ? x.rating_text.replace(/^(\w+) (\d+)$/, "$2점") : tierText(x.rating_text, true)) + " · " + x.num_games + "판"; }).join("  ·  ")));
          });
          tbl.appendChild(el("p", "rh-note", "시즌을 누르면 그 시즌 LP 그래프와 전적을 볼 수 있어요"));
          if (sRank) tbl.appendChild(el("p", "rh-note", "≈순위는 최고 LP를 그 시즌 마지막 순위표에 넣었을 때의 순위예요. 상위 %는 시즌 끝 티어 분포로 계산해요"));
        }
        card.appendChild(ps); card.appendChild(tbl);
      }
      out.appendChild(card);
      try { var ft = JSON.parse(localStorage.getItem(RK_FAVT) || "{}") || {}; ft[riotId] = rk.rating_text || ""; localStorage.setItem(RK_FAVT, JSON.stringify(ft)); } catch (e) {}

      // 범위 고르기: 최근 10 / 20 / 50 / 시즌, 랭크 / 전체
      var all = (d.matches || []).filter(function (m) { return m.summary; }).sort(function (a, b) { return b.match_timestamp - a.match_timestamp; });
      var lp = lpOf(d); lp._cut = cutSeries();
      if (sea) delete lp._pending;  // 끝난 시즌엔 '방금 끝난 게임'이 없다 (시즌 끝 휴면 감소를 기록 대기로 보면 안 됨)
      // 판 기록이 아직 안 왔으면 1분마다 롤체지지 갱신 후 다시 (최대 8번)
      if (lp._pending && !sea) {
        RK_RETRY[riotId] = (RK_RETRY[riotId] || 0) + 1;
        if (RK_RETRY[riotId] <= 8) setTimeout(function () { if (rkCur === riotId && current === "rank") dakSync(riotId).then(function () { if (rkCur === riotId) rkProfile(riotId); }); }, 60000);
      } else delete RK_RETRY[riotId];
      var pref = {}; try { pref = JSON.parse(localStorage.getItem(RK_RANGE) || "{}") || {}; } catch (e) {}
      var range = pref.n != null ? pref.n : 50, queue = pref.q || "1100";
      var bar = el("div", "rk-range");
      var c1 = el("div", "mt-chips"), c2 = el("div", "mt-chips");
      [[10, "10판"], [20, "20판"], [50, "50판"], [0, "시즌 전체"]].forEach(function (x) {
        var b = el("button", x[0] === range ? "on" : null, x[1]); b.type = "button";
        b.addEventListener("click", function () { range = x[0]; c1.querySelectorAll("button").forEach(function (y) { y.classList.toggle("on", y === b); }); draw(); });
        c1.appendChild(b);
      });
      [["1100", "랭크"], ["all", "전체"]].forEach(function (x) {
        var b = el("button", x[0] === queue ? "on" : null, x[1]); b.type = "button";
        b.addEventListener("click", function () { queue = x[0]; c2.querySelectorAll("button").forEach(function (y) { y.classList.toggle("on", y === b); }); draw(); });
        c2.appendChild(b);
      });
      bar.appendChild(c1); bar.appendChild(c2); out.appendChild(bar);
      var body = el("div", "rk-body"); out.appendChild(body);

      var keepShown = 10;  // 다시 그릴 때 이만큼 펼쳐 둔다 ('10판 더 받기' 뒤)
      function draw() {
        try { localStorage.setItem(RK_RANGE, JSON.stringify({ n: range, q: queue })); } catch (e) {}
        body.innerHTML = "";
        var want = range ? range * (queue === "1100" ? 1.3 : 1) : 1e4;  // 시즌 전체면 다
        if (d._canMore && d._canMore(want) && !d._busy) {  // 고른 범위만큼 아직 안 받았으면 더 받고 다시 그림
          d._busy = true; body.appendChild(el("p", "sub", "불러오는 중"));
          d._more(want).then(function () { all = d.matches.filter(function (m) { return m.summary; }).sort(function (a, b) { return b.match_timestamp - a.match_timestamp; }); lp = lpOf(d); if (sea) delete lp._pending; lp._cut = cutSeries(); d._busy = false; draw(); });
          return;
        }
        var list = all.filter(function (m) { return queue === "all" || String(m.queue_id) === queue; });
        if (range) list = list.slice(0, range);
        if (!list.length) { body.appendChild(el("p", "sub", queue === "1100" ? "이번 시즌 랭크 판이 없어요" : "판이 없어요")); return; }
        var n = list.length, plc = [0, 0, 0, 0, 0, 0, 0, 0];
        list.forEach(function (m) { plc[m.placement - 1]++; });
        var avg = list.reduce(function (a, m) { return a + m.placement; }, 0) / n;
        var sum = 0, has = false;
        list.forEach(function (m) { var x = lp[m.riot_match_id]; if (x && x.diff != null) { sum += x.diff; has = true; } });

        var c = el("div", "fcard rk-sum");
        var h = el("h4", null, (range && all.length > n ? "최근 " : "") + n + "판" + (queue === "1100" ? " · 랭크" : ""));
        c.appendChild(h);
        if (n > 20) {  // 등수 줄은 최근 20판만, 나머지는 펼치기 (그래프·통계는 고른 범위 전체)
          var ps30 = plStr(list.slice(0, 20)), more30 = el("button", "pl-more", "+" + (n - 20) + "판 더 보기"); more30.type = "button";
          more30.addEventListener("click", function () { var all2 = plStr(list); all2.classList.add("sm"); ps30.replaceWith(all2); more30.remove(); });
          c.appendChild(ps30); c.appendChild(more30);
        } else c.appendChild(plStr(list));
        c.appendChild(kvBox([["평균 등수", avg.toFixed(2), avg <= 4 ? "good" : avg >= 5 ? "bad" : ""], ["순방", Math.round((plc[0] + plc[1] + plc[2] + plc[3]) / n * 100) + "%"], ["승률", Math.round(plc[0] / n * 100) + "%"],
          has ? ["LP", (sum >= 0 ? "+" : "") + sum, sum >= 0 ? "good" : "bad"] : ["판", n]]));
        var ranked = list.filter(function (m) { return String(m.queue_id) === "1100"; }).slice().reverse();
        var chart = lpChart(ranked, lp);
        var s1 = sec("LP 그래프", chart ? "점을 누르면 게임별 LP" : "");
        if (chart) s1.appendChild(chart);
        else {
          // 롤체지지는 누군가 전적을 갱신할 때만 LP를 남긴다. 지난 시즌은 이제 갱신할 수 없어서 남은 기록 수를 같이 알려준다
          var nlog = (d._logs || []).length, t0 = ranked.length ? ranked[0].match_timestamp : 0;
          var inRange = (d._logs || []).filter(function (x) { return x[0] >= t0 - 36e5; }).length;
          s1.appendChild(el("p", "sub", nlog < 2 ? "롤체지지에 남은 " + (RK_SEASON ? "이 시즌 " : "") + "LP 기록이 " + nlog + "개뿐이라 그래프를 그릴 수 없어요. 롤체지지는 전적을 갱신할 때만 LP를 기록해요" + (RK_SEASON ? "" : ". 전적 갱신 후 다시 확인해 주세요")
            : inRange < 2 ? "이 기간에 남은 LP 기록이 " + inRange + "개뿐이에요. 시즌 전체를 누르면 LP 기록이 있는 판까지 볼 수 있어요"
            : "LP 기록과 판을 맞추지 못했어요. 전적 갱신 후 다시 확인해 주세요"));
        }
        c.appendChild(s1);
        var s2 = sec("등수 분포"); s2.appendChild(placeBars(plc)); c.appendChild(s2);

        // 많이 한 덱 (판 보드를 가장 비슷한 MetaTFT 덱으로) · 캐리 (템 2개 이상)
        var dk = {}, ca = {};
        list.forEach(function (m) {
          var old = !!RK_SEASON || pwOtherSet(m.patch), board = mtBoard(m.summary.units), r = deckOfBoard(board, m.summary.traits, old);
          var carry = board.filter(function (b) { return b.i.length >= 2; }).sort(function (a, b) { return b.i.length - a.i.length || b.cost - a.cost; })[0];
          var a = dk[r.name] = dk[r.name] || { n: 0, p: 0, t4: 0, d: r.d, u: r.d ? (mainOf(r.d) || {}).u : carry && carry.u, c: carry && carry.cost, old: old }; a.n++; a.p += m.placement; if (m.placement <= 4) a.t4++;
          var seen = {};
          board.forEach(function (u) { if (u.i.length < 2 || seen[u.u]) return; seen[u.u] = 1; var a = ca[u.u] = ca[u.u] || [0, 0]; a[0]++; a[1] += m.placement; });
        });
        var dkk = Object.keys(dk).sort(function (a, b) { return dk[b].n - dk[a].n || dk[a].p / dk[a].n - dk[b].p / dk[b].n; }).slice(0, 6);
        if (dkk.length) {
          var s3 = sec("많이 한 덱", "비슷한 메타 덱으로 묶음"), dl = el("div", "rk-dks");
          dkk.forEach(function (k) {
            var a = dk[k], row = el(a.d ? "button" : "div", "rk-dk"); if (a.d) row.type = "button";
            // 지난 시즌은 그 세트 아이콘 (이번 시즌에 같은 이름이 있어도 쓰지 않음)
            var ic = a.u && (a.old ? (OLD_UI[a.u] ? { icon: OLD_UI[a.u], cost: a.c || 1 } : null) : IDX.units[a.u]);
            if (ic) { var im = img(ic.icon, a.u); im.dataset.c = ic.cost; row.appendChild(im); }
            row.appendChild(el("b", null, k));
            var av = a.p / a.n;
            var stx = el("span", "st"); stx.appendChild(document.createTextNode(a.n + "판 · 평균 "));
            stx.appendChild(el("i", av <= 4 ? "good" : av >= 5 ? "bad" : null, av.toFixed(1)));
            stx.appendChild(document.createTextNode(" · 순방 " + Math.round(a.t4 / a.n * 100) + "%")); row.appendChild(stx);
            if (a.d) row.addEventListener("click", function () { openDeck(a.d.id); });
            dl.appendChild(row);
          });
          s3.appendChild(dl); c.appendChild(s3);
        }
        var ck = Object.keys(ca).sort(function (a, b) { return ca[b][0] - ca[a][0]; }).slice(0, 6);
        if (ck.length) {
          var s4 = sec("많이 쓴 캐리", "템 2개 이상 · 평균 등수"); var pc2 = el("div", "pchips");
          ck.forEach(function (k) { var a = ca[k], ch = el("span", "c"); ch.appendChild(unitChip(k)); var av = a[1] / a[0]; ch.appendChild(el("b", av <= 4 ? "good" : av >= 5 ? "bad" : null, a[0] + "판 " + av.toFixed(1))); pc2.appendChild(ch); });
          s4.appendChild(pc2); c.appendChild(s4);
        }
        body.appendChild(c);

        var gl = el("div", "rk-games"); body.appendChild(gl);
        if (lp._pending && queue !== "x") {
          var pd = lp._pending, pc = el("div", "rk-pend");
          pc.appendChild(el("b", null, pd.n > 1 ? "방금 " + pd.n + "게임 · 기록 대기 중" : "방금 끝난 게임 · 기록 대기 중"));
          var lpd = el("span", "lpd " + (pd.diff >= 0 ? "up" : "dn"), (pd.diff >= 0 ? "+" : "") + pd.diff + "LP"); pc.appendChild(lpd);
          pc.appendChild(el("small", null, lpText(pd.before) + " → " + lpText(pd.after) + " · 게임 기록은 몇 분 늦게 올라와요"));
          gl.appendChild(pc);
        }
        var shown = 0;
        function canFetch() {  // 고른 범위를 다 봤는데 그 뒤 판이 더 있을 수 있나
          var pool = all.filter(function (m) { return queue === "all" || String(m.queue_id) === queue; }).length;
          return range && (pool > n || (d._canMore && d._canMore(range * 1.3 + 13)));
        }
        function more() {
          if (shown >= n && canFetch()) {  // 범위 넘어서 10판 더: 범위를 10 늘리고 (필요하면 받아서) 그 자리까지 펼친다
            keepShown = shown + 10; range += 10;
            c1.querySelectorAll("button").forEach(function (y) { y.classList.remove("on"); });
            draw(); return;
          }
          var upto = Math.max(shown + 10, Math.min(keepShown, n));
          list.slice(shown, upto).forEach(function (m) { gl.appendChild(gameCard(m, lp, me)); });
          shown = Math.min(upto, n); keepShown = 10;
          mb.hidden = shown >= n && !canFetch();
          mb.textContent = shown >= n ? "10판 더 보기" : "10판 더 보기";
        }
        var mb = el("button", "tb-clear rk-more", "10판 더 보기"); mb.type = "button"; mb.addEventListener("click", more);
        body.appendChild(mb); more();
      }
      draw();
    }).catch(function (e) {
      out.innerHTML = ""; out.appendChild(el("p", "sub", "소환사를 찾지 못했어요. 이름#태그를 확인해 주세요. 한국 서버만 지원해요"));
    });
  }

  /* ---- 친구: 판수별 LP 비교. 앱은 MetaTFT 실시간, claude.ai는 friends.json (scripts/build_friends.py) ---- */
  var FRIENDS = ["Synow#KR1", "이렐꼴1픽#KR1", "날씨가너무덥네요#KR1"], FR_KEY = "tft-guide-friends", FR_VIEW = "tft-guide-frview";
  var FR_COLORS = ["#e0a21a", "#3b82f6", "#e5484d", "#2f9e5a", "#8b5cf6", "#0ea5a4"];
  var frData = [], frX = "game", frZoom = 0;
