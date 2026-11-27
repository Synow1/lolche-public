  function ptSave() { try { localStorage.setItem(PT_KEY, JSON.stringify({ h: ptHeld, b: ptBasis, u: ptUnits, e: ptEmbs, c: ptChamp })); } catch (e) {} }
  function partRecipe(n) { var it = IDX && IDX.items[n]; return it && it.recipe && it.recipe.length === 2 ? it.recipe : null; }  // 조합표의 recipeOf(재료, 재료)와 이름이 겹치면 안 됨
  // 덱마다 재료 수요: 템 든 유닛별로 빌드 판수 비율만큼 템 → 재료 (메인 캐리 1, 나머지 0.8)
  function ptNeed() {
    if (PT_NEED) return PT_NEED;
    PT_NEED = {};
    META.decks.forEach(function (d) {
      var main = mainOf(d), need = {}, itemW = {};
      d.board.filter(function (b) { return b.i && b.i.length; }).forEach(function (b) {
        var w = main && b.u === main.u ? 1 : 0.8, bl = (d.builds && d.builds[b.u]) || [], tot = 0, f = {};
        bl.forEach(function (x) { tot += x[2] || 0; });
        if (tot) bl.forEach(function (x) { x[0].forEach(function (n) { f[n] = (f[n] || 0) + (x[2] || 0) / tot; }); });
        else b.i.forEach(function (n) { f[n] = 1; });
        Object.keys(f).forEach(function (n) {
          var r = partRecipe(n), v = Math.min(1, f[n]) * w; if (!r) return;
          itemW[n] = Math.max(itemW[n] || 0, v);
          r.forEach(function (c) { need[c] = (need[c] || 0) + v; });
        });
      });
      PT_NEED[d.id] = { need: need, items: itemW };
    });
    return PT_NEED;
  }
  function ptCount(list) { var c = {}; list.forEach(function (x) { c[x] = (c[x] || 0) + 1; }); return c; }
  // 가진 재료로 바로 만들 수 있는 템 (두 재료가 다 있는 조합)
  function ptBuildable(held) {
    var c = ptCount(held), out = [];
    Object.keys(IDX.items).forEach(function (n) {
      var r = partRecipe(n); if (!r) return;
      var ok = r[0] === r[1] ? (c[r[0]] || 0) >= 2 : (c[r[0]] || 0) >= 1 && (c[r[1]] || 0) >= 1;
      if (ok) out.push(n);
    });
    return out;
  }
  // 보유 재료(최대 8개)의 모든 상호 배타 완성템 분배 조합 생성 (중복 제거)
  function ptPairings(held) {
    var arr = held.slice(0, 8), seen = {}, out = [];
    function rec(rem, items) {
      if (rem.length < 2) {
        var sorted = items.slice().sort(), left = rem[0] || "";
        var key = sorted.join("|") + "::" + left;
        if (sorted.length && !seen[key]) { seen[key] = 1; out.push({ items: sorted, left: left }); }
        return;
      }
      // 홀수 개일 때 각 원소를 남기는 분기 (rem.length === arr.length일 때 한 번만 분기)
      if (rem.length % 2 === 1) {
        var triedLeft = {};
        for (var li = 0; li < rem.length; li++) {
          if (triedLeft[rem[li]]) continue;
          triedLeft[rem[li]] = 1;
          var next = rem.slice(0, li).concat(rem.slice(li + 1));
          recEven(next, items, rem[li]);
        }
        return;
      }
      recEven(rem, items, "");
    }
    function recEven(rem, items, left) {
      if (!rem.length) {
        var sorted = items.slice().sort(), key = sorted.join("|") + "::" + left;
        if (sorted.length && !seen[key]) { seen[key] = 1; out.push({ items: sorted, left: left }); }
        return;
      }
      var first = rem[0], tried = {};
      for (var i = 1; i < rem.length; i++) {
        var partner = rem[i];
        if (tried[partner]) continue;
        tried[partner] = 1;
        var made = recipeOf(first, partner);
        if (!made) continue;
        var rest = rem.slice(1, i).concat(rem.slice(i + 1));
        items.push(made);
        recEven(rest, items, left);
        items.pop();
      }
    }
    rec(arr, []);
    return out;
  }
  function ptScoreSplits(splits, champ, topDecks, N) {
    var u = champ && DB && DB.units && DB.units[champ];
    var itStats = (ITEMS && ITEMS.tiers && (ITEMS.tiers[ptBasis] || ITEMS.tiers.emer || ITEMS.tiers.all) && (ITEMS.tiers[ptBasis] || ITEMS.tiers.emer || ITEMS.tiers.all).items) || {};
    var uItemMap = {}, uPairMap = {}, uTrioMap = {};
    if (u) {
      (u.items || []).forEach(function (x) { uItemMap[x[0]] = x[1]; });
      (u.pairs || []).forEach(function (x) { uPairMap[x[0].slice().sort().join("|")] = x[1]; });
      (u.trios || []).forEach(function (x) { uTrioMap[x[0].slice().sort().join("|")] = x[1]; });
    }
    return splits.map(function (sp) {
      var its = sp.items;
      if (u) {
        var base = Number((u.base && typeof u.base === "object" ? u.base.avg : u.base)) || 4.5, tag = "", avg = null, delta = 0;
        if (its.length === 3 && uTrioMap[its.join("|")]) {
          var t = uTrioMap[its.join("|")]; avg = Number(t.avg); delta = t.d != null ? Number(t.d) : (avg - base); tag = "3템 실통계";
        } else {
          // 2템 시너지 매칭 시도
          var bestP = null, bestPairIdx = null;
          for (var i = 0; i < its.length; i++) {
            for (var j = i + 1; j < its.length; j++) {
              var pk = [its[i], its[j]].sort().join("|");
              if (uPairMap[pk] && (!bestP || uPairMap[pk].avg < bestP.avg)) { bestP = uPairMap[pk]; bestPairIdx = [i, j]; }
            }
          }
          if (bestP) {
            avg = Number(bestP.avg); delta = bestP.d != null ? Number(bestP.d) : (avg - base);
            its.forEach(function (it, idx) {
              if (idx !== bestPairIdx[0] && idx !== bestPairIdx[1]) {
                var s = uItemMap[it];
                var d1 = s ? (s.d != null ? Number(s.d) : Number(s.avg) - base) : 0.18;
                avg += d1 * 0.65; delta += d1 * 0.65;
              }
            });
            tag = "2템 시너지 반영";
          } else {
            var known = 0;
            its.forEach(function (it) {
              var s = uItemMap[it];
              if (s) { known++; delta += (s.d != null ? Number(s.d) : Number(s.avg) - base); }
              else delta += 0.22;
            });
            avg = Math.max(1.5, Math.min(7.5, base + delta * 0.72));
            tag = known ? "단일 템 통계" : "추천 외 조합";
          }
        }
        if (!isFinite(avg)) avg = base;
        return { items: its, left: sp.left, score: -avg, avg: avg, delta: delta, tag: tag };
      }
      // 전체 메타 기준: 상위 추천 덱 활용 수 + 아이템 평균 등수
      var deckHits = 0, avgSum = 0, avgCnt = 0;
      its.forEach(function (it) {
        deckHits += topDecks.filter(function (x) { return (N[x.d.id].items[it] || 0) >= 0.25; }).length;
        var s = itStats[it];
        if (s && s[1]) { avgSum += s[1]; avgCnt++; }
      });
      var mAvg = avgCnt ? avgSum / avgCnt : 4.55;
      return { items: its, left: sp.left, score: deckHits * 3.2 - (mAvg - 4.3) * 18, avg: mAvg, deckHits: deckHits, tag: deckHits ? "상위 덱 " + deckHits + "회 활용" : "범용 조합" };
    }).sort(function (a, b) { return b.score - a.score; });
  }
  function ptExtraBind() {
    var inp = document.getElementById("pt-uq"), sug = document.getElementById("pt-usug");
    if (!inp || !sug || ptExtraBind.done) return;
    ptExtraBind.done = true;
    inp.addEventListener("input", function () {
      var q = inp.value.trim();
      sug.innerHTML = "";
      if (!q || !IDX) return;
      var hits = [];
      Object.keys(IDX.units || {}).forEach(function (n) {
        if (ptUnits.indexOf(n) < 0 && matches(n, q)) hits.push({ kind: "u", n: n, icon: IDX.units[n].icon, c: IDX.units[n].cost });
      });
      Object.keys(IDX.items || {}).forEach(function (n) {
        if (/ 상징$/.test(n) && ptEmbs.indexOf(n) < 0 && matches(n, q)) hits.push({ kind: "e", n: n, icon: IDX.items[n].icon });
      });
      hits.slice(0, 8).forEach(function (h) {
        var b = el("button", "pt-sug-b"); b.type = "button";
        if (h.icon) b.appendChild(img(h.icon, ""));
        b.appendChild(document.createTextNode(h.n));
        b.addEventListener("click", function () {
          if (h.kind === "u") { if (ptUnits.length < 6) ptUnits.push(h.n); else toast("기물은 최대 6명까지 넣을 수 있어요"); }
          else { if (ptEmbs.length < 3) ptEmbs.push(h.n); else toast("상징은 최대 3개까지 넣을 수 있어요"); }
          inp.value = ""; sug.innerHTML = ""; ptSave(); ptRender();
        });
        sug.appendChild(b);
      });
      if (!hits.length) sug.appendChild(el("span", "sub", "맞는 기물이나 상징이 없어요"));
    });
  }
  function ptRender() {
    var pick = document.getElementById("pt-pick"), tray = document.getElementById("pt-tray"), out = document.getElementById("pt-out");
    if (!pick) return;
    if (!IDX || !META) { out.innerHTML = '<p class="empty">불러오는 중</p>'; return; }
    ptExtraBind();
    ptUnits = ptUnits.filter(function (n) { return !!(IDX.units && IDX.units[n]); });
    ptEmbs = ptEmbs.filter(function (n) { return !!(IDX.items && IDX.items[n]); });
    if (ptChamp && !(DB && DB.units && DB.units[ptChamp])) ptChamp = "";
    var cnt = ptCount(ptHeld);
    pick.innerHTML = "";
    PARTS.forEach(function (n) {
      var b = el("button", "pt-p" + (cnt[n] ? " on" : "")); b.type = "button"; b.setAttribute("aria-label", n + " 추가");
      var it = IDX.items[n]; if (it) b.appendChild(img(it.icon, ""));
      b.appendChild(el("span", null, PART_SHORT[n]));
      if (cnt[n]) b.appendChild(el("b", "pt-n", String(cnt[n])));
      b.addEventListener("click", function () { if (ptHeld.length < 12) { ptHeld.push(n); ptSave(); ptRender(); } });
      pick.appendChild(b);
    });
    tray.innerHTML = "";
    var hasAny = ptHeld.length || ptUnits.length || ptEmbs.length;
    if (hasAny) {
      ptHeld.forEach(function (n, i) {
        var b = el("button", "pt-chip"); b.type = "button"; b.setAttribute("aria-label", n + " 빼기");
        var it = IDX.items[n]; if (it) b.appendChild(img(it.icon, ""));
        b.appendChild(el("i", null, "×"));
        b.addEventListener("click", function () { ptHeld.splice(i, 1); ptSave(); ptRender(); });
        tray.appendChild(b);
      });
      var clr = el("button", "pt-clear", "초기화"); clr.type = "button";
      clr.addEventListener("click", function () { ptHeld = []; ptUnits = []; ptEmbs = []; ptChamp = ""; ptSave(); ptRender(); });
      tray.appendChild(clr);
    }
    var uch = document.getElementById("pt-uchips");
    if (uch) {
      uch.innerHTML = "";
      ptUnits.forEach(function (n, i) {
        var b = el("button", "pt-uchip u"); b.type = "button";
        var ic = IDX.units[n]; if (ic) b.appendChild(img(ic.icon, ""));
        b.appendChild(document.createTextNode(n)); b.appendChild(el("i", null, "×"));
        b.addEventListener("click", function () { ptUnits.splice(i, 1); ptSave(); ptRender(); });
        uch.appendChild(b);
      });
      ptEmbs.forEach(function (n, i) {
        var b = el("button", "pt-uchip e"); b.type = "button";
        var ic = IDX.items[n]; if (ic) b.appendChild(img(ic.icon, ""));
        b.appendChild(document.createTextNode(n)); b.appendChild(el("i", null, "×"));
        b.addEventListener("click", function () { ptEmbs.splice(i, 1); ptSave(); ptRender(); });
        uch.appendChild(b);
      });
    }
    document.querySelectorAll("#pt-basis button").forEach(function (b) { b.classList.toggle("on", b.dataset.b === ptBasis); });
    var ptb = document.getElementById("pt-basis"); if (ptb) ptb.hidden = !!(META && META.pbe);  // PBE 통계엔 티어 구분이 없음
    out.innerHTML = "";
    if (!hasAny) { out.appendChild(el("p", "empty", "위에서 보유한 재료나 기물·상징을 선택해 주세요")); return; }
    var N = ptNeed(), held = ptCount(ptHeld), made = ptBuildable(ptHeld);
    var decks = META.decks.map(function (d) {
      var st = basisSt(d, ptBasis); if (!st) return null;
      var nd = N[d.id].need, dot = 0, hh = 0, dd = 0;
      PARTS.forEach(function (c) { var h = held[c] || 0, v = nd[c] || 0; dot += h * v; hh += h * h; dd += v * v; });
      var fit = hh && dd ? dot / Math.sqrt(hh * dd) : 0;
      var items = made.filter(function (n) { return (N[d.id].items[n] || 0) >= 0.25; })
        .sort(function (a, b) { return N[d.id].items[b] - N[d.id].items[a]; });
      var mc = mainOf(d);
      var boardSet = {}, earlySet = {};
      d.board.forEach(function (b) { if (!b.plant) boardSet[b.u] = 1; });
      Object.keys(d.levels || {}).forEach(function (k) { (d.levels[k] || []).forEach(function (un) { earlySet[un] = 1; }); });
      var hitU = [], uBonus = 0;
      ptUnits.forEach(function (un) {
        if (mc && mc.u === un) { hitU.push(un); uBonus += 32; }
        else if (boardSet[un]) { hitU.push(un); uBonus += 20; }
        else if (earlySet[un]) { hitU.push(un); uBonus += 10; }
      });
      var hitE = [], eBonus = 0, reqE = embReq(d);
      ptEmbs.forEach(function (em) {
        var eStat = d.emb && d.emb[em];
        if ((reqE && reqE[0] === em) || (eStat && (eStat[2] >= 3 || eStat[0] >= 150))) {
          hitE.push(em); eBonus += 45 + (eStat && eStat[1] <= 4.3 ? 10 : 0);
        }
      });
      var keep = (!ptUnits.length && !ptEmbs.length) ? (fit >= 0.35) : (hitU.length > 0 || hitE.length > 0 || (ptHeld.length > 0 && fit >= 0.45));
      if (!keep) return null;
      var score = (ptHeld.length ? fit * 100 : 0) + uBonus + eBonus - (st[0] - 4.2) * 38;
      return { d: d, st: st, fit: fit, items: items, hitU: hitU, hitE: hitE, score: score };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });

    var top = decks.slice(0, 15);
    if (made.length) {
      var sm = sec("바로 만들 수 있는 템", "상위 추천 덱 15개 기준 활용 수"), w = el("div", "pt-made");
      made.map(function (n) { return [n, top.filter(function (x) { return (N[x.d.id].items[n] || 0) >= 0.25; }).length]; })
        .sort(function (a, b) { return b[1] - a[1]; }).forEach(function (x) {
          var c = el("span", "pt-mi" + (x[1] ? "" : " dim")); c.dataset.item = x[0];
          var it = IDX.items[x[0]]; if (it) c.appendChild(img(it.icon, ""));
          var t = el("span"); t.appendChild(el("b", null, x[0])); t.appendChild(el("small", null, x[1] ? x[1] + "개 덱" : "사용률 낮음")); c.appendChild(t);
          w.appendChild(c);
        });
      sm.appendChild(w); out.appendChild(sm);
    }

    // 최적 완성템 분배 시뮬레이터 (보유 재료 2개 이상일 때)
    if (ptHeld.length >= 2) {
      var splits = ptPairings(ptHeld);
      if (splits.length) {
        var sim = sec("최적 완성템 분배 시뮬레이터", ptHeld.length > 8 ? "앞 8개 재료 기준" : "보유 재료로 만들 수 있는 최적 조합");
        var cands = [];
        ptUnits.forEach(function (un) { if (cands.indexOf(un) < 0 && DB && DB.units && DB.units[un]) cands.push(un); });
        top.slice(0, 6).forEach(function (x) {
          var m = mainOf(x.d);
          if (m && cands.indexOf(m.u) < 0 && DB && DB.units && DB.units[m.u]) cands.push(m.u);
        });
        if (ptChamp && cands.indexOf(ptChamp) < 0) cands.unshift(ptChamp);
        var crow = el("div", "mt-chips pt-sim-ch");
        var bAll = el("button", !ptChamp ? "on" : null, "전체 메타"); bAll.type = "button";
        bAll.addEventListener("click", function () { ptChamp = ""; ptSave(); ptRender(); });
        crow.appendChild(bAll);
        cands.slice(0, 6).forEach(function (un) {
          var b = el("button", ptChamp === un ? "on" : null, un); b.type = "button";
          b.addEventListener("click", function () { ptChamp = un; ptSave(); ptRender(); });
          crow.appendChild(b);
        });
        sim.appendChild(crow);
        var ranked = ptScoreSplits(splits, ptChamp, top, N).slice(0, 4);
        var slist = el("div", "pt-sim-list");
        ranked.forEach(function (sp, idx) {
          var row = el("div", "pt-sim-row" + (idx === 0 ? " best" : ""));
          var left = el("div", "pt-sim-l");
          left.appendChild(el("span", "pt-sim-rk", String(idx + 1)));
          var itemsWrap = el("div", "pt-sim-its");
          sp.items.forEach(function (n) {
            var it = IDX.items[n], chip = el("span", "pt-sim-it"); chip.dataset.item = n;
            if (it) chip.appendChild(img(it.icon, n));
            chip.appendChild(document.createTextNode(n));
            itemsWrap.appendChild(chip);
          });
          if (sp.left) {
            var lf = el("span", "pt-sim-left", "남음 " + (PART_SHORT[sp.left] || sp.left));
            itemsWrap.appendChild(lf);
          }
          left.appendChild(itemsWrap);
          row.appendChild(left);
          var right = el("div", "pt-sim-r");
          right.appendChild(dkGrad(el("b", null, sp.avg.toFixed(2)), dkAvgT(sp.avg)));
          right.appendChild(el("small", null, sp.tag));
          row.appendChild(right);
          slist.appendChild(row);
        });
        sim.appendChild(slist);
        out.appendChild(sim);
      }
    }

    var sd = sec("추천 덱", (ptUnits.length || ptEmbs.length ? "보유 재료·기물·상징 통합 추천 · " : "재료 궁합과 ") + (META.pbe ? "PBE 평균 등수 기준" : BASIS_LABEL[ptBasis] + " 평균 등수 기준"));
    if (!decks.length) sd.appendChild(el("p", "empty", "선택한 조건에 맞는 추천 덱이 없어요"));
    var rows = el("div", "mt-rows");
    decks.slice(0, 12).forEach(function (x) {
      var d = x.d, bt = basisTier(d, ptBasis), mc = mainOf(d), r = el("button", "mt-row dk t-" + bt); r.type = "button";
      r.appendChild(dkPortrait(mc, null));
      var mid = el("div", "mt-mid");
      var meta = el("div", "dk-meta");
      meta.appendChild(el("span", "dk-tbadge t-" + bt, bt === "X" ? "-" : bt));
      var sub = el("span", "dk-sub");
      if (ptHeld.length) sub.appendChild(el("span", "pt-fit", "재료 궁합 " + Math.round(x.fit * 100) + "%"));
      x.hitU.slice(0, 2).forEach(function (un) {
        if (sub.childNodes.length) sub.appendChild(document.createTextNode(" · "));
        sub.appendChild(el("span", "pt-hit u", un));
      });
      x.hitE.slice(0, 1).forEach(function (em) {
        if (sub.childNodes.length) sub.appendChild(document.createTextNode(" · "));
        sub.appendChild(el("span", "pt-hit e", em));
      });
      if (d.style) { if (sub.childNodes.length) sub.appendChild(document.createTextNode(" · ")); sub.appendChild(styleTag(d.style)); }
      meta.appendChild(sub);
      mid.appendChild(meta);
      var nm = el("div", "mt-name", deckName(d)), req = embReq(d), areq = augReq(d);
      if (req) nm.insertBefore(embBadge(req), nm.firstChild);
      if (areq) nm.insertBefore(augReqBadge(areq, false), nm.firstChild);
      mid.appendChild(nm);
      if (x.items.length) {
        var iw = el("div", "pt-its"); iw.appendChild(el("span", null, "바로"));
        x.items.slice(0, 4).forEach(function (n) { var it = IDX.items[n]; if (it) iw.appendChild(img(it.icon, n)); });
        mid.appendChild(iw);
      } else mid.appendChild(strip(carriesFirst(d.board).filter(function (b) { return b !== mc; }).map(function (b) { return b.u; })));
      r.appendChild(mid);
      var num = el("div", "mt-num dk-kpi2");
      num.appendChild(dkGrad(el("b", "dk-avg", x.st[0].toFixed(2)), dkAvgT(x.st[0])));
      num.appendChild(dkGrad(el("span", "dk-top4", "승률 " + x.st[2].toFixed(1) + "%"), dkWinT(x.st[2])));
      r.appendChild(num);
      r.addEventListener("click", function () {
        var bs = document.getElementById("mt-basis"); if (bs && bs.value !== ptBasis && BASIS_LABEL[ptBasis]) { bs.value = ptBasis; bs.dispatchEvent(new Event("change")); }
        var gi = GUIDES ? GUIDES.decks.findIndex(function (g) { return g.cluster === d.id; }) : -1;  // 롤체지지 공략이 있는 덱은 공략까지 보이게
        openDeck(gi >= 0 ? "g" + gi : d.id);
      });
      rows.appendChild(r);
    });
    sd.appendChild(rows); out.appendChild(sd);
    out.appendChild(el("p", "fnote", "MetaTFT 덱·챔피언 아이템 통계로 계산해요. 재료·기물·상징을 함께 넣을수록 정확한 덱을 추천해요. " + (META ? updAt(META.updated) : "")));
  }

  /* ---- TFT 아카데미: Dishsoap·Frodan의 TFT Academy 티어표 (scripts/build_tfa.py -> site/tfa.json) ---- */
  var TFA = null, tfaView = "comps", tfaF = "all", tfaRar = "2", tfaStage = "All", tfaType = "조합템", TFA_KEY = "tft-guide-tfa";
  try { var tk = JSON.parse(localStorage.getItem(TFA_KEY) || "{}"); tfaView = tk.v || tfaView; tfaF = tk.f || tfaF; tfaRar = tk.r || tfaRar; tfaStage = tk.s || tfaStage; tfaType = tk.t || tfaType; } catch (e) {}
