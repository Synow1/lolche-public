  function ptSave() { try { localStorage.setItem(PT_KEY, JSON.stringify({ h: ptHeld, b: ptBasis })); } catch (e) {} }
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
  function ptRender() {
    var pick = document.getElementById("pt-pick"), tray = document.getElementById("pt-tray"), out = document.getElementById("pt-out");
    if (!pick) return;
    if (!IDX || !META) { out.innerHTML = '<p class="empty">불러오는 중</p>'; return; }
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
    if (ptHeld.length) {
      ptHeld.forEach(function (n, i) {
        var b = el("button", "pt-chip"); b.type = "button"; b.setAttribute("aria-label", n + " 빼기");
        var it = IDX.items[n]; if (it) b.appendChild(img(it.icon, ""));
        b.appendChild(el("i", null, "×"));
        b.addEventListener("click", function () { ptHeld.splice(i, 1); ptSave(); ptRender(); });
        tray.appendChild(b);
      });
      var clr = el("button", "pt-clear", "비우기"); clr.type = "button";
      clr.addEventListener("click", function () { ptHeld = []; ptSave(); ptRender(); });
      tray.appendChild(clr);
    }
    document.querySelectorAll("#pt-basis button").forEach(function (b) { b.classList.toggle("on", b.dataset.b === ptBasis); });
    out.innerHTML = "";
    if (!ptHeld.length) { out.appendChild(el("p", "empty", "위에서 가진 재료를 눌러 주세요")); return; }
    var N = ptNeed(), held = ptCount(ptHeld), total = ptHeld.length, made = ptBuildable(ptHeld);
    var decks = META.decks.map(function (d) {
      var st = basisSt(d, ptBasis); if (!st) return null;
      // 재료 궁합: 가진 재료 비율과 이 덱의 재료 수요 비율이 얼마나 닮았는지 (코사인). 재료가 적어도 덱마다 갈리게
      var nd = N[d.id].need, dot = 0, hh = 0, dd = 0;
      PARTS.forEach(function (c) { var h = held[c] || 0, v = nd[c] || 0; dot += h * v; hh += h * h; dd += v * v; });
      var fit = hh && dd ? dot / Math.sqrt(hh * dd) : 0, items = made.filter(function (n) { return (N[d.id].items[n] || 0) >= 0.25; })
        .sort(function (a, b) { return N[d.id].items[b] - N[d.id].items[a]; });
      return { d: d, st: st, fit: fit, items: items, score: fit * 100 - (st[0] - 4.2) * 40 };
    }).filter(function (x) { return x && x.fit >= 0.35; }).sort(function (a, b) { return b.score - a.score; });
    // 바로 만들 수 있는 템: 잘 맞는 덱 상위 15개 중 몇 개가 쓰는지
    var top = decks.slice(0, 15);
    if (made.length) {
      var sm = sec("바로 만들 수 있는 템", "잘 맞는 덱 15개 중 쓰는 덱 수"), w = el("div", "pt-made");
      made.map(function (n) { return [n, top.filter(function (x) { return (N[x.d.id].items[n] || 0) >= 0.25; }).length]; })
        .sort(function (a, b) { return b[1] - a[1]; }).forEach(function (x) {
          var c = el("span", "pt-mi" + (x[1] ? "" : " dim")); c.dataset.item = x[0];
          var it = IDX.items[x[0]]; if (it) c.appendChild(img(it.icon, ""));
          var t = el("span"); t.appendChild(el("b", null, x[0])); t.appendChild(el("small", null, x[1] ? x[1] + "개 덱" : "쓰는 덱 적음")); c.appendChild(t);
          w.appendChild(c);
        });
      sm.appendChild(w); out.appendChild(sm);
    }
    var sd = sec("갈 만한 덱", "재료 궁합과 " + BASIS_LABEL[ptBasis] + " 평균 등수로 정렬");
    if (!decks.length) sd.appendChild(el("p", "empty", "이 재료를 많이 쓰는 덱이 없어요"));
    var rows = el("div", "mt-rows");
    decks.slice(0, 12).forEach(function (x) {
      var d = x.d, bt = basisTier(d, ptBasis), mc = mainOf(d), r = el("button", "mt-row dk t-" + bt); r.type = "button";
      r.appendChild(dkPortrait(mc, bt === "X" ? "-" : bt));
      var mid = el("div", "mt-mid");
      var nm = el("div", "mt-name", deckName(d)), req = embReq(d); if (req) nm.insertBefore(embBadge(req), nm.firstChild);
      mid.appendChild(nm);
      var sub = el("div", "dk-sub"); sub.appendChild(el("span", "pt-fit", "재료 궁합 " + Math.round(x.fit * 100) + "%"));
      sub.appendChild(document.createTextNode(" · " + styleKo(d.style))); mid.appendChild(sub);
      if (x.items.length) {
        var iw = el("div", "pt-its"); iw.appendChild(el("span", null, "바로"));
        x.items.slice(0, 4).forEach(function (n) { var it = IDX.items[n]; if (it) iw.appendChild(img(it.icon, n)); });
        mid.appendChild(iw);
      } else mid.appendChild(strip(carriesFirst(d.board).filter(function (b) { return b !== mc; }).map(function (b) { return b.u; })));
      r.appendChild(mid);
      var num = el("div", "mt-num", x.st[0].toFixed(2)); num.appendChild(el("small", null, "승률 " + Math.round(x.st[2]) + "%")); r.appendChild(num);
      r.addEventListener("click", function () {
        var bs = document.getElementById("mt-basis"); if (bs && bs.value !== ptBasis && BASIS_LABEL[ptBasis]) { bs.value = ptBasis; bs.dispatchEvent(new Event("change")); }
        var gi = GUIDES ? GUIDES.decks.findIndex(function (g) { return g.cluster === d.id; }) : -1;  // 롤체지지 공략이 있는 덱은 공략까지 보이게
        openDeck(gi >= 0 ? "g" + gi : d.id);
      });
      rows.appendChild(r);
    });
    sd.appendChild(rows); out.appendChild(sd);
    out.appendChild(el("p", "fnote", "MetaTFT 덱 통계의 캐리·탱커 템 빌드로 계산해요. 재료 궁합은 가진 재료 구성이 이 덱이 쓰는 재료 구성과 얼마나 비슷한지예요. " + (META ? updAt(META.updated) : "")));
  }

  /* ---- TFT 아카데미: Dishsoap·Frodan의 TFT Academy 티어표 (scripts/build_tfa.py -> site/tfa.json) ---- */
  var TFA = null, tfaView = "comps", tfaF = "all", tfaRar = "2", tfaStage = "All", tfaType = "조합템", TFA_KEY = "tft-guide-tfa";
  try { var tk = JSON.parse(localStorage.getItem(TFA_KEY) || "{}"); tfaView = tk.v || tfaView; tfaF = tk.f || tfaF; tfaRar = tk.r || tfaRar; tfaStage = tk.s || tfaStage; tfaType = tk.t || tfaType; } catch (e) {}
