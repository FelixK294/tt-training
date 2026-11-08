/* TT Training – App-Logik (offline, Daten im Gerät gespeichert). */
(function () {
  "use strict";
  const E = window.TTEngine;
  const BUILTIN = window.TTExercises.EXERCISES;
  const BUILT_BY_ID = Object.fromEntries(BUILTIN.map((e) => [e.id, e]));
  // Eigene Übungen liegen als einfache Datensätze in S.custom; für die Engine gibt es je eine Kopie.
  const customCache = new Map();
  function customToEx(c) {
    let o = customCache.get(c.id);
    if (!o || o._src !== c) {
      o = Object.assign({}, c, { custom: true, d: c.d || "Eigene Übung.", t: c.t || "" });
      o._src = c; customCache.set(c.id, o);
    }
    return o;
  }
  const BY_ID = new Proxy({}, { get: (_, id) => {
    if (typeof id !== "string") return undefined;
    if (BUILT_BY_ID[id]) return BUILT_BY_ID[id];
    const c = (S.custom || []).find((x) => x.id === id);
    return c ? customToEx(c) : undefined;
  } });
  const allEx = () => BUILTIN.concat((S.custom || []).map(customToEx));
  const GOAL = Object.fromEntries(E.GOALS.map((g) => [g.id, g]));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const VERSION = "1.4";

  // ------------------------------------------------------------------ Speicher
  const KEY = "tttraining.v1";
  const DEFAULT = () => ({
    v: 1,
    players: [{ name: "Spieler 1", hand: "R" }, { name: "Spieler 2", hand: "R" }],
    favs: [], dur: {},
    settings: { theme: "auto", sound: true, vib: true, pause: 20, lead: 5, both: true },
    weekGoal: 2, plan: {}, log: [], onboarded: false,
    dice: { goals: [], count: 3, lv: 0, ablauf: "all", side: "all" }, diceRes: [],
    lib: { goal: "all", lv: "0", ablauf: "all", side: "all", fav: false, q: "" },
    custom: [], units: [], unitMode: "dice", unitFrom: null,
    people: {}, startWith: 0, delEx: [], lastSync: {}, statsFor: null,
  });
  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function merge(def, d) {
    for (const k in d) {
      if (isObj(d[k]) && isObj(def[k]) && !["plan", "dur", "people", "lastSync"].includes(k)) def[k] = merge(def[k], d[k]);
      else def[k] = d[k];
    }
    return def;
  }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return merge(DEFAULT(), JSON.parse(raw)); } catch (e) { /* leer */ }
    return DEFAULT();
  }
  let S = load();
  const rid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function migrate() {
    const P = S.players;
    if (!P[0].id) P[0].id = rid("p");
    if (!P[1].id) { P[1].id = rid("p"); P[1].local = true; }
    S.log.forEach((l) => {
      if (!l.lid) l.lid = rid("l");
      (l.items || []).forEach((it) => { if (!it.pid) it.pid = P[it.p === 1 ? 1 : 0].id; });
      if (l.manual && !l.pids) l.pids = [P[0].id, P[1].id];
    });
    (S.custom || []).forEach((c) => { if (!c.upd) c.upd = 1; });
    if (!S.people[P[1].id]) S.people[P[1].id] = { name: P[1].name, hand: P[1].hand, local: !!P[1].local };
  }
  migrate();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ohne Speicher weiter */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Speichern nicht möglich"); } }

  // ------------------------------------------------------------------ Datum
  const pad = (n) => String(n).padStart(2, "0");
  const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dstr(new Date());
  const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const WDL = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  function niceDate(s) {
    const d = parseD(s), now = new Date();
    if (s === dstr(now)) return "Heute";
    if (s === dstr(addDays(now, 1))) return "Morgen";
    if (s === dstr(addDays(now, -1))) return "Gestern";
    return `${WD[(d.getDay() + 6) % 7]} ${d.getDate()}.${d.getMonth() + 1}.`;
  }
  const longDate = (s) => { const d = parseD(s); return `${WDL[(d.getDay() + 6) % 7]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
  const fmt = (sec) => { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${pad(sec % 60)}`; };

  // ------------------------------------------------------------------ Spieler
  const pName = (i) => (S.players[i].name || `Spieler ${i + 1}`).trim() || `Spieler ${i + 1}`;
  const handsFor = (a) => ({ A: S.players[a].hand, B: S.players[1 - a].hand });
  const myId = () => S.players[0].id;
  function personName(id) {
    if (id === S.players[0].id) return pName(0);
    if (id === S.players[1].id) return pName(1);
    return (S.people[id] && S.people[id].name) || "Unbekannt";
  }
  const inEntry = (l, pid) => (l.manual ? (l.pids || []).includes(pid) : (l.items || []).some((it) => it.pid === pid));
  const entryPids = (l) => [...new Set(l.manual ? (l.pids || []) : (l.items || []).map((it) => it.pid))];
  const namesFor = (a) => ({ A: pName(a), B: pName(1 - a) });
  const durOf = (ex) => S.dur[ex.id] || E.meta(ex).dur;
  const SIDE_TXT = { VH: "Vorhand", RH: "Rückhand", beide: "Vorhand & Rückhand" };

  // ------------------------------------------------------------------ Ebenen & Zurück-Taste
  const stack = [];
  let zTop = 40;
  function pushLayer(onBack) { stack.push(onBack); history.pushState({ d: stack.length }, ""); }
  function back() { history.back(); }
  const afterPop = [];
  function backThen(fn) { afterPop.push(fn); history.back(); }
  window.addEventListener("popstate", (e) => {
    const depth = (e.state && e.state.d) || 0;
    const fns = stack.splice(Math.min(depth, stack.length)).reverse();
    for (const fn of fns) { try { fn(); } catch (err) { console.error(err); } }
    while (afterPop.length) { const fn = afterPop.shift(); try { fn(); } catch (err) { console.error(err); } }
  });
  function updateLock() {
    const open = !$("#detail").classList.contains("hidden") || !$("#editor").classList.contains("hidden") || !$("#run").classList.contains("hidden") || $("#sheets").children.length > 0;
    document.body.classList.toggle("locked", open);
  }
  function raise(el) { el.style.zIndex = String(++zTop); }

  let toastTimer = 0;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text; t.classList.remove("hidden"); t.style.zIndex = "9999";
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
  }

  function sheet(html, mount, onClose) {
    const wrap = document.createElement("div");
    wrap.className = "sheet-backdrop";
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    raise(wrap);
    $("#sheets").appendChild(wrap);
    updateLock();
    pushLayer(() => { wrap.remove(); updateLock(); if (onClose) onClose(); });
    wrap.addEventListener("click", (e) => { if (e.target === wrap) back(); });
    $$("[data-close]", wrap).forEach((b) => b.addEventListener("click", back));
    if (mount) mount(wrap.firstElementChild);
    return wrap;
  }

  // ------------------------------------------------------------------ Ton & Vibration
  let AC = null;
  function ensureAudio() {
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === "suspended") AC.resume();
    } catch (e) { AC = null; }
  }
  function beep(f = 880, ms = 140, vol = 0.3) {
    if (!S.settings.sound || !AC) return;
    try {
      const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + ms / 1000 + 0.03);
    } catch (e) { /* ohne Ton */ }
  }
  function vib(p) { if (S.settings.vib && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* nicht verfügbar */ } } }
  function endSignal() { beep(660, 260); setTimeout(() => beep(990, 420), 280); vib([350, 150, 350]); }
  function startSignal() { beep(1180, 220); vib(120); }

  // ------------------------------------------------------------------ Diagramm
  const COL_A = "#ffd23f", COL_B = "#f4f4f0";
  function ctrl(g, i) {
    const mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2, dx = g.x2 - g.x1, dy = g.y2 - g.y1;
    const len = Math.hypot(dx, dy) || 1;
    const bend = (i % 2 ? 1 : -1) * Math.min(26, len * 0.06 + 7 * Math.floor(i / 2));
    return { cx: mx - (dy / len) * bend, cy: my + (dx / len) * bend };
  }
  function bez(g, c, t) { const u = 1 - t; return { x: u * u * g.x1 + 2 * u * t * c.cx + t * t * g.x2, y: u * u * g.y1 + 2 * u * t * c.cy + t * t * g.y2 }; }
  const f1 = (n) => Math.round(n * 10) / 10;

  function diagramSVG(ex, h, nm, opt = {}) {
    const G = E.G, P = E.paths(ex, h), thumb = !!opt.thumb;
    let s = `<svg class="${opt.cls || "diagram"}" viewBox="0 0 ${G.w} ${G.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ablaufdiagramm ${esc(ex.name)}">`;
    if (thumb) s += `<rect width="${G.w}" height="${G.h}" fill="#0f3b2c"/>`;
    s += `<rect x="${G.tx}" y="${G.ty}" width="${G.tw}" height="${G.tl}" rx="3" fill="#2f9169" stroke="#f4f4f0" stroke-width="${thumb ? 4 : 2}"/>`;
    if (!thumb) s += `<line x1="${G.tx + G.tw / 2}" y1="${G.ty}" x2="${G.tx + G.tw / 2}" y2="${G.ty + G.tl}" stroke="#f4f4f0" stroke-width="1" opacity=".6"/>`;
    s += `<line x1="${G.tx - 8}" y1="${G.net}" x2="${G.tx + G.tw + 8}" y2="${G.net}" stroke="#f4f4f0" stroke-width="${thumb ? 7 : 3.5}"/>`;
    if (!thumb) {
      const lab = (bottom, lefty) => {
        const y = bottom ? G.ty + G.tl - 8 : G.ty + 14;
        const vx = E.G.tx + G.tw * (((bottom ? 0.8 : 0.2) - 0.5) * (lefty ? -1 : 1) * 1.12 + 0.5);
        const rx = E.G.tx + G.tw * (((bottom ? 0.2 : 0.8) - 0.5) * (lefty ? -1 : 1) * 1.12 + 0.5);
        return `<text x="${f1(vx)}" y="${y}" text-anchor="middle" font-size="9" font-weight="700" fill="#f4f4f0" opacity=".55">VH</text><text x="${f1(rx)}" y="${y}" text-anchor="middle" font-size="9" font-weight="700" fill="#f4f4f0" opacity=".55">RH</text>`;
      };
      s += lab(true, h.A === "L") + lab(false, h.B === "L");
    }
    P.forEach((st, i) => {
      const col = st.active ? COL_A : COL_B;
      const n = st.segs.length;
      const multi = st.step.to.length > 1;
      s += `<g class="dg-step" data-i="${i}">`;
      st.segs.forEach((g) => {
        const c = ctrl(g, i);
        const op = n > 1 ? Math.max(0.45, 1 / Math.sqrt(n)) : 1;
        const sw = thumb ? 5 : 2.2;
        s += `<path d="M${f1(g.x1)} ${f1(g.y1)} Q${f1(c.cx)} ${f1(c.cy)} ${f1(g.x2)} ${f1(g.y2)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"${multi ? ` stroke-dasharray="${thumb ? "10 8" : "5 4"}"` : ""}/>`;
        const tx = g.x2 - c.cx, ty = g.y2 - c.cy, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
        const al = thumb ? 16 : 8, aw = thumb ? 9 : 4.2;
        const bx = g.x2 - ux * al, by = g.y2 - uy * al;
        s += `<path d="M${f1(g.x2)} ${f1(g.y2)} L${f1(bx - uy * aw)} ${f1(by + ux * aw)} L${f1(bx + uy * aw)} ${f1(by - ux * aw)} Z" fill="${col}" opacity="${op}"/>`;
      });
      if (!thumb) {
        const g = st.segs[0], c = ctrl(g, i), p = bez(g, c, [0.24, 0.5, 0.37][Math.floor(i / 2) % 3]);
        s += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="7" fill="${col}" stroke="#0f3b2c" stroke-width="1.2"/><text x="${f1(p.x)}" y="${f1(p.y + 3.2)}" text-anchor="middle" font-size="9" font-weight="700" fill="#16110d">${i + 1}</text>`;
      }
      s += `</g>`;
    });
    if (!thumb) {
      const pl = (y, col, name, top) => {
        const ini = esc((name || "?").charAt(0).toUpperCase());
        return `<circle cx="${G.w / 2}" cy="${y}" r="8.5" fill="${col}" stroke="#0f3b2c" stroke-width="1.5"/><text x="${G.w / 2}" y="${y + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#16110d">${ini}</text>` +
          `<text x="${opt.flip ? G.w / 2 - 14 : G.w / 2 + 14}" y="${y + 3.5}" font-size="10" font-weight="600" fill="${col}">${esc(name.length > 14 ? name.slice(0, 13) + "…" : name)}${top ? "" : ""}</text>`;
      };
      s += pl(G.h - 10, COL_A, nm.A, false) + pl(10, COL_B, nm.B, true);
      s += `<circle class="dg-ball" r="4.6" fill="#ff6a39" stroke="#16110d" stroke-width="1" cx="-20" cy="-20"/>`;
    }
    if (opt.flip) {
      const head = s.indexOf(">") + 1;
      let inner = s.slice(head);
      inner = inner.replace(/<text x="([\d.\-]+)" y="([\d.\-]+)"([^>]*?)font-size="([\d.]+)"/g,
        (m, x, y, rest, fs) => `<text transform="rotate(180 ${x} ${f1(+y - fs * 0.35)})" x="${x}" y="${y}"${rest}font-size="${fs}"`);
      s = s.slice(0, head) + `<g transform="rotate(180 ${G.w / 2} ${G.h / 2})">` + inner + `</g>`;
    }
    return s + `</svg>`;
  }

  const thumbCache = new Map();
  function thumbSVG(ex) {
    const h = handsFor(0), k = ex.id + h.A + h.B;
    if (!thumbCache.has(k)) thumbCache.set(k, diagramSVG(ex, h, namesFor(0), { thumb: true, cls: "ex-thumb" }));
    return thumbCache.get(k);
  }

  class DiagramAnim {
    constructor(svg, ex, h) {
      this.svg = svg; this.ex = ex; this.P = E.paths(ex, h);
      this.ball = svg.querySelector(".dg-ball");
      this.groups = [...svg.querySelectorAll(".dg-step")];
      this.running = false;
    }
    start() {
      if (this.running || !this.ball) return;
      this.running = true; this.i = 0; this.pos = null; this.wait = 0; this.pick(); this.t0 = performance.now();
      const loop = (now) => { if (!this.running) return; this.frame(now); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    }
    stop() { this.running = false; cancelAnimationFrame(this.raf); }
    pick() {
      let segs = this.P[this.i].segs;
      if (this.pos) { const m = segs.filter((g) => g.from.z === this.pos.z && g.from.short === this.pos.short); if (m.length) segs = m; }
      this.cur = segs[Math.floor(Math.random() * segs.length)];
      this.c = ctrl(this.cur, this.i);
      this.groups.forEach((g, k) => { g.style.opacity = k === this.i ? "1" : "0.3"; });
    }
    frame(now) {
      const D = this.P[this.i] && E.STROKES[this.P[this.i].step.st].serve ? 1000 : 820, GAP = 170;
      if (this.wait) {
        if (now < this.wait) return;
        this.wait = 0; this.i = 0; this.pos = null; this.pick(); this.t0 = now; return;
      }
      const el = now - this.t0;
      if (el <= D) {
        const p = bez(this.cur, this.c, el / D);
        this.ball.setAttribute("cx", f1(p.x)); this.ball.setAttribute("cy", f1(p.y));
      } else if (el > D + GAP) {
        this.pos = this.cur.to; this.i++;
        if (this.i >= this.P.length) {
          if (this.ex.end === "loop") this.i = 0;
          else {
            this.wait = now + 1200;
            this.ball.setAttribute("cx", -20);
            this.groups.forEach((g) => { g.style.opacity = "1"; });
            return;
          }
        }
        this.pick(); this.t0 = now;
      }
    }
  }
  let anim = null;
  function playAnim(svg, ex, h) { stopAnim(); if (!svg) return; anim = new DiagramAnim(svg, ex, h); anim.start(); }
  function stopAnim() { if (anim) anim.stop(); anim = null; }

  // ------------------------------------------------------------------ Bausteine
  const lvDots = (lv) => `<span class="lv-dots" title="${E.LEVELS[lv]}" aria-label="Stufe ${E.LEVELS[lv]}">${[1, 2, 3].map((k) => `<i class="${k <= lv ? "on" : ""}"></i>`).join("")}</span>`;
  function exCard(ex, opts = {}) {
    const m = E.meta(ex), fav = S.favs.includes(ex.id);
    const i = opts.ctl, n = opts.n;
    const right = opts.ctl != null
      ? `<div class="ctl">${S.unitMode === "dice" ? `<button data-reroll="${i}" aria-label="Neu würfeln">⟳</button>` : ""}<button data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Nach oben">↑</button><button data-down="${i}" ${i === n - 1 ? "disabled" : ""} aria-label="Nach unten">↓</button><button data-rm="${i}" aria-label="Entfernen">✕</button></div>`
      : opts.add ? `<button class="reroll-btn add-btn ${S.diceRes.includes(ex.id) ? "on" : ""}" data-add="${ex.id}" aria-label="Zur Einheit hinzufügen">${S.diceRes.includes(ex.id) ? "✓" : "+"}</button>`
      : opts.noFav ? "" : `<button class="fav-btn ${fav ? "on" : ""}" data-fav="${ex.id}" aria-label="Favorit">${fav ? "★" : "☆"}</button>`;
    return `<li class="ex-card"><button class="ex-open" data-open="${ex.id}">${thumbSVG(ex)}<span class="ex-info"><strong>${esc(ex.name)}</strong>` +
      `<span class="ex-meta"><span class="goal-tag">${esc(GOAL[ex.goal].name)}</span>${lvDots(ex.lv)}<span>${durOf(ex)} Min</span><span>${E.ABLAUF_NAME[m.ablauf]}</span></span></span></button>${right}</li>`;
  }
  function segHTML(el, items, value, onPick) {
    el.innerHTML = items.map(([v, t]) => `<button type="button" class="seg-btn ${String(v) === String(value) ? "active" : ""}" data-v="${v}">${t}</button>`).join("");
    el.onclick = (e) => { const b = e.target.closest(".seg-btn"); if (!b) return; $$(".seg-btn", el).forEach((x) => x.classList.toggle("active", x === b)); onPick(b.dataset.v); };
  }
  function toggleFav(id) {
    const i = S.favs.indexOf(id);
    if (i >= 0) S.favs.splice(i, 1); else S.favs.push(id);
    save();
    return i < 0;
  }
  function bindListClicks(list, extra) {
    list.addEventListener("click", (e) => {
      const f = e.target.closest("[data-fav]");
      if (f) { const on = toggleFav(f.dataset.fav); f.classList.toggle("on", on); f.textContent = on ? "★" : "☆"; if (S.lib.fav && list.id === "lib-list") renderLib(); return; }
      const o = e.target.closest("[data-open]");
      if (o) { openDetail(o.dataset.open); return; }
      if (extra) extra(e);
    });
  }

  // ------------------------------------------------------------------ Übungen
  function sideMatch(side, want) { return want === "all" || side === want || side === "beide"; }
  function libFiltered() {
    const f = S.lib, q = (f.q || "").trim().toLowerCase();
    return allEx().filter((ex) => {
      const m = E.meta(ex);
      if (f.goal === "custom" ? !ex.custom : f.goal !== "all" && ex.goal !== f.goal) return false;
      if (+f.lv && ex.lv !== +f.lv) return false;
      if (f.ablauf !== "all" && m.ablauf !== f.ablauf) return false;
      if (!sideMatch(m.side, f.side)) return false;
      if (f.fav && !S.favs.includes(ex.id)) return false;
      if (q && !(ex.name + " " + ex.d + " " + GOAL[ex.goal].name).toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function renderLibGoals() {
    const el = $("#lib-goals");
    el.innerHTML = [["all", "Alle"], ["custom", "★ Eigene"]].concat(E.GOALS.map((g) => [g.id, g.name]))
      .map(([id, n]) => `<button class="chip ${S.lib.goal === id ? "active" : ""}" data-goal="${id}">${esc(n)}</button>`).join("");
  }
  function renderLib() {
    const list = libFiltered();
    const total = allEx().length;
    $("#lib-count").textContent = list.length === total ? `${total} Übungen` : `${list.length} von ${total} Übungen`;
    const emptyTxt = S.lib.goal === "custom" && !S.custom.length ? "Noch keine eigenen Übungen. Tippe auf „+ Eigene Übung“ oder kopiere eine vorhandene Übung mit ⧉ als Vorlage."
      : S.lib.fav && !S.favs.length ? "Noch keine Favoriten. Tippe bei einer Übung auf ☆." : "Keine Übung passt zu diesen Filtern.";
    $("#lib-list").innerHTML = list.length ? list.map((ex) => exCard(ex)).join("") : `<li class="empty">${emptyTxt}</li>`;
    $("#lib-fav").classList.toggle("active", !!S.lib.fav);
  }
  function initLib() {
    renderLibGoals();
    $("#lib-search").value = S.lib.q || "";
    $("#lib-lv").value = S.lib.lv; $("#lib-ablauf").value = S.lib.ablauf; $("#lib-side").value = S.lib.side;
    $("#lib-goals").addEventListener("click", (e) => {
      const b = e.target.closest("[data-goal]"); if (!b) return;
      S.lib.goal = b.dataset.goal; save(); renderLibGoals(); renderLib();
    });
    $("#lib-search").addEventListener("input", (e) => { S.lib.q = e.target.value; renderLib(); });
    $("#lib-search").addEventListener("change", save);
    for (const [id, k] of [["#lib-lv", "lv"], ["#lib-ablauf", "ablauf"], ["#lib-side", "side"]]) {
      $(id).addEventListener("change", (e) => { S.lib[k] = e.target.value; save(); renderLib(); });
    }
    $("#lib-fav").addEventListener("click", () => { S.lib.fav = !S.lib.fav; save(); renderLib(); });
    bindListClicks($("#lib-list"));
    $("#lib-new").addEventListener("click", () => openEditor(null));
    renderLib();
  }

  // ------------------------------------------------------------------ Übungsansicht
  let detailEx = null, detailActive = 0;
  function openDetail(id) {
    detailEx = BY_ID[id]; detailActive = S.startWith || 0;
    const el = $("#detail");
    raise(el);
    renderDetail();
    el.classList.remove("hidden"); el.scrollTop = 0; updateLock();
    pushLayer(closeDetail);
  }
  function closeDetail() {
    stopAnim();
    $("#detail").classList.add("hidden"); $("#detail").innerHTML = ""; detailEx = null; updateLock();
    renderLib(); renderDiceRes();
  }
  function renderDetail() {
    const ex = detailEx; if (!ex) return;
    const m = E.meta(ex), h = handsFor(detailActive), nm = namesFor(detailActive), d = E.describe(ex, h, nm);
    const fav = S.favs.includes(ex.id);
    const lines = d.lines.map((l, i) => `<li><span class="seq-no ${l.who === "A" ? "a" : "b"}">${i + 1}</span><span class="seq-txt"><strong>${esc(l.name)}:</strong> ${esc(l.stroke)}<small>${esc(l.target)}</small></span></li>`).join("");
    const el = $("#detail");
    const scroll = el.scrollTop;
    el.innerHTML = `<div class="page-head"><button class="back-btn" data-back aria-label="Zurück">‹</button><h1>${esc(ex.name)}</h1><button class="fav-btn ${fav ? "on" : ""}" id="d-fav" aria-label="Favorit">${fav ? "★" : "☆"}</button></div>
      <div class="page-body">
        <div class="tags">${ex.custom ? '<span class="tag own">Eigene</span>' : ""}<span class="tag goal">${esc(GOAL[ex.goal].name)}</span><span class="tag">${E.LEVELS[ex.lv]}</span><span class="tag">${E.ABLAUF_NAME[m.ablauf]}</span><span class="tag">${SIDE_TXT[m.side]}</span></div>
        <p class="lead">${esc(ex.d)}</p>
        <div class="detail-grid">
          <div class="diagram-card">
            <button class="swap-btn" id="d-swap">⇅ Rollen</button>
            ${diagramSVG(ex, h, nm)}
            <div class="diagram-legend"><span><b style="background:${COL_A}"></b>${esc(nm.A)} (aktiv)</span><span><b style="background:${COL_B}"></b>${esc(nm.B)}</span></div>
            <p class="swap-hint">Diagramm antippen: Rollen tauschen</p>
          </div>
          <div>
            <div class="panel"><h2>Ablauf</h2><ol class="seq">${lines}</ol><p class="seq-tail">${esc(d.tail)}</p></div>
            ${ex.t ? `<div class="panel"><h2>Worauf achten</h2><p class="tip">${esc(ex.t)}</p></div>` : ""}
            <div class="panel">
              <div class="dur-row">
                <div><strong>Dauer je Durchgang</strong><br><span class="muted small">${S.settings.both ? "Danach Rollenwechsel" : "Ein Durchgang"}</span></div>
                <div class="stepper"><button class="icon-action" id="d-minus" aria-label="Kürzer">−</button><span><strong id="d-dur">${durOf(ex)}</strong><small>Minuten</small></span><button class="icon-action" id="d-plus" aria-label="Länger">+</button></div>
              </div>
              <button class="fire-btn" id="d-start">▶ Übung starten</button>
              <div class="row-buttons top-gap"><button class="secondary-btn" id="d-unit">+ Zur Einheit</button><button class="secondary-btn" id="d-plan">📅 Planen</button></div>
              <div class="row-buttons top-gap">${ex.custom ? `<button class="secondary-btn" id="d-edit">✎ Bearbeiten</button><button class="secondary-btn danger" id="d-del">Löschen</button>` : `<button class="secondary-btn" id="d-copy">⧉ Als Vorlage für eigene Übung</button>`}</div>
            </div>
          </div>
        </div>
      </div>`;
    el.scrollTop = scroll;
    $("[data-back]", el).onclick = back;
    $("#d-fav").onclick = (e) => { const on = toggleFav(ex.id); e.currentTarget.classList.toggle("on", on); e.currentTarget.textContent = on ? "★" : "☆"; };
    const swap = () => { detailActive = 1 - detailActive; renderDetail(); };
    $(".diagram", el).onclick = swap; $("#d-swap").onclick = swap;
    const setDur = (v) => { v = Math.max(1, Math.min(30, v)); if (v === E.meta(ex).dur) delete S.dur[ex.id]; else S.dur[ex.id] = v; save(); $("#d-dur").textContent = v; thumbCache.clear(); };
    $("#d-minus").onclick = () => setDur(durOf(ex) - 1);
    $("#d-plus").onclick = () => setDur(durOf(ex) + 1);
    $("#d-start").onclick = () => startRun([ex.id], null, detailActive);
    $("#d-plan").onclick = () => pickDateSheet("Zum Plan hinzufügen", (date) => { addToPlan(date, [ex.id]); toast(`Für ${niceDate(date)} geplant`); });
    $("#d-unit").onclick = () => {
      if (S.diceRes.includes(ex.id)) { toast("Ist schon in der Einheit"); return; }
      S.diceRes.push(ex.id); save(); renderDiceRes(); toast(`In der Einheit (${S.diceRes.length} Übung${S.diceRes.length > 1 ? "en" : ""})`);
    };
    const on = (id, fn) => { const b = $(id, el); if (b) b.onclick = fn; };
    on("#d-edit", () => openEditor(ex.id));
    on("#d-copy", () => openEditor(null, ex));
    on("#d-del", () => deleteCustom(ex.id));
    playAnim($(".diagram", el), ex, h);
  }

  // ------------------------------------------------------------------ Würfel
  const PHASE = { kontrolle: 0, bein: 1, eroeffnung: 2, kurz: 2, tempo: 2, abwehr: 2, aufschlag: 3, spielnah: 4 };
  function recentIds() {
    const s = new Set();
    S.log.slice(-3).forEach((l) => (l.items || []).forEach((it) => s.add(it.id)));
    return s;
  }
  function dicePool() {
    const d = S.dice;
    return allEx().filter((ex) => {
      const m = E.meta(ex);
      if (d.goals.length && !d.goals.includes(ex.goal)) return false;
      if (+d.lv && ex.lv !== +d.lv) return false;
      if (d.ablauf !== "all" && !(d.ablauf === "reg" ? m.ablauf !== "unreg" : m.ablauf === "unreg")) return false;
      if (!sideMatch(m.side, d.side)) return false;
      return true;
    });
  }
  function pickOne(pool, exclude, goal) {
    let cand = pool.filter((e) => !exclude.has(e.id));
    if (goal) { const g = cand.filter((e) => e.goal === goal); if (g.length) cand = g; }
    const rec = recentIds(), fresh = cand.filter((e) => !rec.has(e.id));
    if (fresh.length) cand = fresh;
    return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
  }
  function rollAll() {
    const pool = dicePool();
    if (!pool.length) { $("#dice-status").textContent = "Keine Übung passt zu dieser Auswahl. Bitte Optionen lockern."; return; }
    $("#dice-status").textContent = "";
    const goals = S.dice.goals.slice().sort(() => Math.random() - 0.5);
    const res = [], used = new Set();
    for (let k = 0; k < S.dice.count; k++) {
      const p = pickOne(pool, used, goals.length ? goals[k % goals.length] : null);
      if (!p) break;
      res.push(p.id); used.add(p.id);
    }
    res.sort((a, b) => PHASE[BY_ID[a].goal] - PHASE[BY_ID[b].goal] || BY_ID[a].lv - BY_ID[b].lv);
    S.diceRes = res; S.unitFrom = null; save();
    const ico = $("#dice-ico"); ico.classList.remove("rolling"); void ico.offsetWidth; ico.classList.add("rolling");
    ico.textContent = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][Math.floor(Math.random() * 6)];
    if (res.length < S.dice.count) $("#dice-status").textContent = `Nur ${res.length} passende Übung${res.length === 1 ? "" : "en"} gefunden.`;
    renderDiceRes();
  }
  function sessionMinutes(ids) {
    const rounds = S.settings.both ? 2 : 1;
    const work = ids.reduce((a, id) => a + durOf(BY_ID[id]) * rounds, 0);
    const pauses = Math.max(0, ids.length * rounds - 1) * S.settings.pause / 60;
    return Math.round(work + pauses);
  }
  function renderDiceRes() {
    S.diceRes = (S.diceRes || []).filter((id) => BY_ID[id]);
    const ids = S.diceRes;
    const dice = S.unitMode === "dice";
    $("#dice-panel").classList.toggle("hidden", !dice);
    $("#build-panel").classList.toggle("hidden", dice);
    const box = $("#dice-result");
    box.classList.toggle("hidden", dice && !ids.length);
    const from = S.unitFrom && S.units.find((u) => u.id === S.unitFrom);
    $("#unit-title").textContent = from ? from.name : "Deine Einheit";
    $("#dice-list").innerHTML = ids.length ? ids.map((id, i) => exCard(BY_ID[id], { ctl: i, n: ids.length })).join("")
      : `<li class="empty">Noch keine Übung in der Einheit.</li>`;
    $("#dice-sum").textContent = ids.length ? `${ids.length} Übung${ids.length > 1 ? "en" : ""} · ca. ${sessionMinutes(ids)} Minuten${S.settings.both ? " (jeder einmal aktiv)" : ""}` : "";
    $("#unit-actions").classList.toggle("hidden", !ids.length);
    $("#unit-clear").classList.toggle("hidden", !ids.length);
    $("#unit-add2").classList.toggle("hidden", !dice);
    renderUnits();
  }
  function renderUnits() {
    $("#units-panel").classList.toggle("hidden", !S.units.length);
    $("#units-list").innerHTML = S.units.map((u) => {
      const ids = u.ex.filter((id) => BY_ID[id]);
      return `<li><div class="u-info"><strong>${esc(u.name)}</strong><span>${ids.length} Übung${ids.length === 1 ? "" : "en"} · ca. ${sessionMinutes(ids)} Min · ${esc(ids.map((id) => BY_ID[id].name).join(", "))}</span></div>
        <button class="icon-action" data-urun="${u.id}" aria-label="Starten">▶</button><button class="icon-action" data-uedit="${u.id}" aria-label="Bearbeiten">✎</button><button class="icon-action" data-udel="${u.id}" aria-label="Löschen">🗑</button></li>`;
    }).join("");
  }
  function pickerSheet() {
    let goal = "all", q = "";
    sheet(`<div class="sheet-head"><h2>Übung hinzufügen</h2><button class="icon-action" data-close aria-label="Fertig">✓</button></div>
      <div class="search-row"><input type="search" id="pk-q" placeholder="Übung suchen …" autocomplete="off"></div>
      <div class="chip-row" id="pk-goals"></div>
      <ul class="ex-list compact" id="pk-list"></ul>
      <button class="fire-btn top-gap" data-close>Fertig</button>`, (el) => {
      const draw = () => {
        $("#pk-goals", el).innerHTML = [["all", "Alle"], ["fav", "★ Favoriten"], ["custom", "Eigene"]].concat(E.GOALS.map((g) => [g.id, g.name]))
          .map(([id, n]) => `<button class="chip ${goal === id ? "active" : ""}" data-g="${id}">${esc(n)}</button>`).join("");
        const ql = q.trim().toLowerCase();
        const list = allEx().filter((ex) => (goal === "all" || (goal === "fav" ? S.favs.includes(ex.id) : goal === "custom" ? ex.custom : ex.goal === goal)) && (!ql || ex.name.toLowerCase().includes(ql)));
        $("#pk-list", el).innerHTML = list.length ? list.map((ex) => exCard(ex, { add: true })).join("") : `<li class="empty">Keine Übung gefunden.</li>`;
      };
      draw();
      $("#pk-q", el).addEventListener("input", (e) => { q = e.target.value; draw(); });
      $("#pk-goals", el).addEventListener("click", (e) => { const b = e.target.closest("[data-g]"); if (b) { goal = b.dataset.g; draw(); } });
      bindListClicks($("#pk-list", el), (e) => {
        const b = e.target.closest("[data-add]"); if (!b) return;
        const id = b.dataset.add, k = S.diceRes.indexOf(id);
        if (k >= 0) S.diceRes.splice(k, 1); else S.diceRes.push(id);
        save(); renderDiceRes();
        b.classList.toggle("on", k < 0); b.textContent = k < 0 ? "✓" : "+";
      });
    });
  }
  function saveUnitSheet() {
    const from = S.unitFrom && S.units.find((u) => u.id === S.unitFrom);
    sheet(`<div class="sheet-head"><h2>Einheit speichern</h2><button class="icon-action" data-close aria-label="Schließen">✕</button></div>
      <label class="field"><span>Name</span><input type="text" id="us-name" maxlength="40" value="${esc(from ? from.name : "")}" placeholder="z. B. Dienstag Beinarbeit"></label>
      <div class="stack">${from ? `<button class="fire-btn" id="us-over">Änderungen speichern</button><button class="secondary-btn" id="us-new">Als neue Einheit speichern</button>` : `<button class="fire-btn" id="us-new">Speichern</button>`}</div>`, (el) => {
      const nameOf = () => $("#us-name", el).value.trim() || `Einheit ${S.units.length + 1}`;
      const over = $("#us-over", el);
      if (over) over.onclick = () => { from.name = nameOf(); from.ex = S.diceRes.slice(); save(); renderDiceRes(); back(); toast("Gespeichert"); };
      $("#us-new", el).onclick = () => {
        const u = { id: "e" + Date.now().toString(36), name: nameOf(), ex: S.diceRes.slice() };
        S.units.push(u); S.unitFrom = u.id; save(); renderDiceRes(); back(); toast("Gespeichert");
      };
    });
  }
  function initDice() {
    const d = S.dice;
    const renderGoals = () => {
      $("#dice-goals").innerHTML = E.GOALS.map((g) => `<button class="chip ${d.goals.includes(g.id) ? "active" : ""}" data-goal="${g.id}">${esc(g.name)}</button>`).join("");
    };
    renderGoals();
    $("#dice-goals").addEventListener("click", (e) => {
      const b = e.target.closest("[data-goal]"); if (!b) return;
      const i = d.goals.indexOf(b.dataset.goal);
      if (i >= 0) d.goals.splice(i, 1); else d.goals.push(b.dataset.goal);
      save(); renderGoals();
    });
    segHTML($("#dice-count"), [[1, "1"], [2, "2"], [3, "3"]], d.count, (v) => { d.count = +v; save(); });
    segHTML($("#dice-lv"), [[0, "Alle"], [1, "Leicht"], [2, "Mittel"], [3, "Schwer"]], d.lv, (v) => { d.lv = +v; save(); });
    segHTML($("#dice-ablauf"), [["all", "Alle"], ["reg", "Regelmäßig"], ["unreg", "Unregelmäßig"]], d.ablauf, (v) => { d.ablauf = v; save(); });
    segHTML($("#dice-side"), [["all", "Alle"], ["VH", "Vorhand"], ["RH", "Rückhand"]], d.side, (v) => { d.side = v; save(); });
    $("#dice-roll").addEventListener("click", rollAll);
    segHTML($("#unit-mode"), [["dice", "⚄ Würfeln"], ["build", "✎ Selbst bauen"]], S.unitMode, (v) => { S.unitMode = v; save(); renderDiceRes(); });
    $("#unit-add").addEventListener("click", pickerSheet);
    $("#unit-add2").addEventListener("click", pickerSheet);
    $("#unit-save").addEventListener("click", saveUnitSheet);
    $("#unit-clear").addEventListener("click", () => { S.diceRes = []; S.unitFrom = null; save(); renderDiceRes(); });
    bindListClicks($("#dice-list"), (e) => {
      const b = e.target.closest("[data-reroll],[data-up],[data-down],[data-rm]"); if (!b) return;
      const R = S.diceRes;
      if (b.dataset.reroll != null) {
        const i = +b.dataset.reroll, cur = BY_ID[R[i]];
        const p = pickOne(dicePool(), new Set(R), cur.goal) || pickOne(dicePool(), new Set(R), null);
        if (!p) { toast("Keine weitere passende Übung"); return; }
        R[i] = p.id;
      } else if (b.dataset.up != null) { const i = +b.dataset.up; if (i > 0) [R[i - 1], R[i]] = [R[i], R[i - 1]]; }
      else if (b.dataset.down != null) { const i = +b.dataset.down; if (i < R.length - 1) [R[i + 1], R[i]] = [R[i], R[i + 1]]; }
      else if (b.dataset.rm != null) R.splice(+b.dataset.rm, 1);
      save(); renderDiceRes();
    });
    $("#units-list").addEventListener("click", (e) => {
      const b = e.target.closest("[data-urun],[data-uedit],[data-udel]"); if (!b) return;
      const id = b.dataset.urun || b.dataset.uedit || b.dataset.udel, u = S.units.find((x) => x.id === id); if (!u) return;
      if (b.dataset.urun) startRun(u.ex.slice(), null, S.startWith);
      else if (b.dataset.uedit) { S.diceRes = u.ex.filter((x) => BY_ID[x]); S.unitFrom = u.id; S.unitMode = "build"; save(); segHTML($("#unit-mode"), [["dice", "⚄ Würfeln"], ["build", "✎ Selbst bauen"]], S.unitMode, (v) => { S.unitMode = v; save(); renderDiceRes(); }); renderDiceRes(); window.scrollTo(0, 0); }
      else sheet(`<div class="sheet-head"><h2>„${esc(u.name)}“ löschen?</h2></div><div class="stack"><button class="secondary-btn danger" id="ud-yes">Löschen</button><button class="fire-btn" data-close>Abbrechen</button></div>`, (el) => {
        $("#ud-yes", el).onclick = () => { S.units = S.units.filter((x) => x !== u); if (S.unitFrom === u.id) S.unitFrom = null; save(); renderDiceRes(); back(); };
      });
    });
    $("#dice-start").addEventListener("click", () => { if (S.diceRes.length) startRun(S.diceRes.slice(), null, S.startWith); });
    $("#dice-plan").addEventListener("click", () => pickDateSheet("Einheit planen", (date) => { addToPlan(date, S.diceRes.slice()); toast(`Für ${niceDate(date)} geplant`); }));
    renderDiceRes();
  }

  // ------------------------------------------------------------------ Plan
  function addToPlan(date, ids) {
    const p = S.plan[date] || { ex: [], done: false };
    ids.forEach((id) => { if (!p.ex.includes(id)) p.ex.push(id); });
    p.done = false;
    S.plan[date] = p; save(); renderPlan();
  }
  function pickDateSheet(title, onPick) {
    sheet(`<div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-action" data-close aria-label="Schließen">✕</button></div>
      <div class="chip-row" id="ds-quick"></div>
      <label class="field"><span>Oder Datum wählen</span><input type="date" id="ds-date" value="${today()}"></label>
      <button class="fire-btn" id="ds-ok">Übernehmen</button>`, (el) => {
      const q = $("#ds-quick", el), now = new Date();
      q.innerHTML = [0, 1, 2, 3, 4, 5, 6].map((k) => { const s = dstr(addDays(now, k)); return `<button class="chip" data-d="${s}">${niceDate(s)}</button>`; }).join("");
      q.onclick = (e) => { const b = e.target.closest("[data-d]"); if (b) { $("#ds-date", el).value = b.dataset.d; $$(".chip", q).forEach((c) => c.classList.toggle("active", c === b)); } };
      $("#ds-ok", el).onclick = () => { const v = $("#ds-date", el).value; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast("Bitte ein Datum wählen"); return; } back(); onPick(v); };
    });
  }
  const logsOn = (date) => S.log.filter((l) => l.d === date && inEntry(l, myId()));
  const trainedDates = (pid) => new Set(S.log.filter((l) => inEntry(l, pid || myId())).map((l) => l.d));
  function weekCount(mon, pid) {
    const days = trainedDates(pid); let n = 0;
    for (let k = 0; k < 7; k++) if (days.has(dstr(addDays(mon, k)))) n++;
    return n;
  }
  let calMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
  function renderPlan() {
    const mon = monday(new Date()), n = weekCount(mon), goal = S.weekGoal;
    $("#goal-val").textContent = goal;
    $("#week-text").textContent = n >= goal ? `${n} Trainingstag${n === 1 ? "" : "e"} – Wochenziel erreicht ✓` : `${n} von ${goal} Trainingstagen`;
    $("#week-bar").innerHTML = Array.from({ length: goal }, (_, k) => `<i class="${k < n ? "on" : ""}"></i>`).join("");
    // Kalender
    $("#cal-month").textContent = `${MONTHS[calMonth.getMonth()]} ${calMonth.getFullYear()}`;
    const start = monday(calMonth), days = trainedDates(), t = today();
    let html = WD.map((w) => `<div class="cal-dow">${w}</div>`).join("");
    for (let k = 0; k < 42; k++) {
      const d = addDays(start, k), s = dstr(d);
      if (k >= 35 && d.getMonth() !== calMonth.getMonth()) break;
      const p = S.plan[s], done = days.has(s) || (p && p.done);
      const planned = p && p.ex.length && !done;
      const cls = ["cal-day", d.getMonth() !== calMonth.getMonth() ? "out" : "", s === t ? "today" : "", done ? "done" : ""].join(" ");
      html += `<button class="${cls}" data-day="${s}" aria-label="${longDate(s)}">${d.getDate()}<span class="mk">${planned ? '<i class="plan"></i>' : ""}${done ? '<i class="done"></i>' : ""}</span></button>`;
    }
    $("#cal-grid").innerHTML = html;
    // Als Nächstes
    const next = Object.keys(S.plan).filter((s) => s >= t && S.plan[s].ex.length && !S.plan[s].done && !days.has(s)).sort().slice(0, 5);
    $("#next-list").innerHTML = next.length ? next.map((s) => `<li><span class="when">${niceDate(s)}</span><span class="what">${S.plan[s].ex.map((id) => esc(BY_ID[id] ? BY_ID[id].name : id)).join(" · ")}</span><button class="icon-action" data-run="${s}" aria-label="Starten">▶</button></li>`).join("")
      : `<li class="muted small">Nichts geplant. Tippe auf einen Tag im Kalender oder plane eine gewürfelte Einheit.</li>`;
  }
  function daySheet(date) {
    const p = S.plan[date], logs = logsOn(date), past = date <= today();
    const manual = logs.find((l) => l.manual);
    let html = `<div class="sheet-head"><h2>${longDate(date)}</h2><button class="icon-action" data-close aria-label="Schließen">✕</button></div>`;
    if (p && p.ex.length) {
      html += `<h3>Geplant (ca. ${sessionMinutes(p.ex)} Min)</h3><ul class="ex-list compact" id="dy-list">${p.ex.filter((id) => BY_ID[id]).map((id) => exCard(BY_ID[id], { noFav: true })).join("")}</ul>
        <div class="stack top-gap"><button class="fire-btn" id="dy-run">▶ Training starten</button>
        <div class="row-buttons"><button class="secondary-btn" id="dy-roll">⚄ Neu würfeln</button><button class="secondary-btn danger" id="dy-del">Plan löschen</button></div></div>`;
    } else {
      html += `<p class="muted small">Für diesen Tag ist noch nichts geplant.</p><div class="stack"><button class="fire-btn" id="dy-roll">⚄ Einheit würfeln</button>` +
        (S.diceRes.length ? `<button class="secondary-btn" id="dy-take">Aktuelle Einheit übernehmen</button>` : "") +
        (S.units.length ? `<button class="secondary-btn" id="dy-units">Gespeicherte Einheit wählen</button>` : "") + `</div>`;
    }
    if (logs.length) {
      html += `<h3>Trainiert</h3><ul class="log-list">${logs.map((l) => `<li><span class="when">${l.manual ? "✓" : Math.round(l.sec / 60) + " Min"}</span><span class="what">${l.manual ? "von Hand abgehakt" : esc(uniqNames(l))}</span></li>`).join("")}</ul>`;
    }
    if (past) html += `<div class="stack top-gap"><button class="secondary-btn" id="dy-check">${manual ? "Abhaken zurücknehmen" : "✓ Als trainiert abhaken"}</button></div>`;
    sheet(html, (el) => {
      const list = $("#dy-list", el); if (list) bindListClicks(list);
      const on = (id, fn) => { const b = $(id, el); if (b) b.onclick = fn; };
      on("#dy-run", () => backThen(() => startRun(p.ex.slice(), date, S.startWith)));
      on("#dy-del", () => { delete S.plan[date]; save(); renderPlan(); back(); });
      on("#dy-units", () => sheet(`<div class="sheet-head"><h2>Einheit wählen</h2><button class="icon-action" data-close aria-label="Schließen">✕</button></div>
        <ul class="unit-list">${S.units.map((u) => `<li><div class="u-info"><strong>${esc(u.name)}</strong><span>${u.ex.length} Übungen · ca. ${sessionMinutes(u.ex.filter((x) => BY_ID[x]))} Min</span></div><button class="icon-action" data-pick="${u.id}">✓</button></li>`).join("")}</ul>`, (e2) => {
        e2.addEventListener("click", (ev) => {
          const b = ev.target.closest("[data-pick]"); if (!b) return;
          const u = S.units.find((x) => x.id === b.dataset.pick);
          S.plan[date] = { ex: u.ex.filter((x) => BY_ID[x]), done: false }; save(); renderPlan(); history.go(-2); toast("Geplant");
        });
      }));
      on("#dy-take", () => { S.plan[date] = { ex: S.diceRes.slice(), done: false }; save(); renderPlan(); back(); toast("Übernommen"); });
      on("#dy-roll", () => {
        const pool = dicePool(); const used = new Set(); const res = [];
        const goals = S.dice.goals.slice().sort(() => Math.random() - 0.5);
        for (let k = 0; k < S.dice.count; k++) { const x = pickOne(pool, used, goals.length ? goals[k % goals.length] : null); if (!x) break; res.push(x.id); used.add(x.id); }
        if (!res.length) { toast("Keine Übung passt zu den Würfel-Einstellungen"); return; }
        res.sort((a, b) => PHASE[BY_ID[a].goal] - PHASE[BY_ID[b].goal] || BY_ID[a].lv - BY_ID[b].lv);
        S.plan[date] = { ex: res, done: false }; save(); renderPlan(); backThen(() => daySheet(date));
      });
      on("#dy-check", () => {
        if (manual) S.log = S.log.filter((l) => l !== manual);
        else { S.log.push({ lid: rid("l"), d: date, ts: Date.now(), items: [], sec: 0, manual: true, pids: [S.players[0].id, S.players[1].id], by: myId() }); if (S.plan[date]) S.plan[date].done = true; }
        save(); renderPlan(); back();
      });
    });
  }
  function uniqNames(l) { return [...new Set((l.items || []).map((it) => (BY_ID[it.id] ? BY_ID[it.id].name : it.id)))].join(" · "); }
  function initPlan() {
    $("#cal-prev").onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderPlan(); };
    $("#cal-next").onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderPlan(); };
    $("#goal-minus").onclick = () => { S.weekGoal = Math.max(1, S.weekGoal - 1); save(); renderPlan(); };
    $("#goal-plus").onclick = () => { S.weekGoal = Math.min(7, S.weekGoal + 1); save(); renderPlan(); };
    $("#cal-grid").addEventListener("click", (e) => { const b = e.target.closest("[data-day]"); if (b) daySheet(b.dataset.day); });
    $("#next-list").addEventListener("click", (e) => { const b = e.target.closest("[data-run]"); if (b) startRun(S.plan[b.dataset.run].ex.slice(), b.dataset.run, S.startWith); });
    renderPlan();
  }

  // ------------------------------------------------------------------ Fortschritt
  function streakWeeks(pid) {
    let mon = monday(new Date()), n = 0;
    if (weekCount(mon, pid) < S.weekGoal) mon = addDays(mon, -7);
    while (weekCount(mon, pid) >= S.weekGoal && n < 520) { n++; mon = addDays(mon, -7); }
    return n;
  }
  function statPeople() {
    const ids = [myId(), S.players[1].id];
    S.log.forEach((l) => entryPids(l).forEach((pid) => { if (!ids.includes(pid) && S.people[pid]) ids.push(pid); }));
    return ids;
  }
  function renderStats() {
    const people = statPeople();
    if (!people.includes(S.statsFor)) S.statsFor = myId();
    const who = S.statsFor;
    $("#stat-who").innerHTML = people.map((id) => `<button class="chip ${id === who ? "active" : ""}" data-who="${id}">${esc(personName(id))}${id === myId() ? " (du)" : ""}</button>`).join("");
    const partner = S.players[1];
    const last = S.lastSync[partner.id];
    $("#sync-info").textContent = partner.local ? "Noch nicht mit dem Partner abgeglichen." : last ? `Zuletzt abgeglichen mit ${pName(1)}: ${niceDate(dstr(new Date(last)))}` : `Gekoppelt mit ${pName(1)}`;
    const mine = S.log.filter((l) => inEntry(l, who));
    const days = trainedDates(who), mon = monday(new Date());
    const totalSec = mine.reduce((a, l) => a + (l.items || []).filter((it) => it.pid === who).reduce((b, it) => b + (it.sec || 0), 0), 0);
    const tiles = [
      [days.size, "Trainingstage"],
      [`${weekCount(mon, who)}/${S.weekGoal}`, "diese Woche"],
      [streakWeeks(who), "Wochen in Folge Ziel erreicht"],
      [Math.round(totalSec / 60), "Minuten aktiv geübt"],
    ];
    $("#stat-tiles").innerHTML = tiles.map(([v, t]) => `<div class="tile"><strong>${v}</strong><span>${t}</span></div>`).join("");
    const byGoal = Object.fromEntries(E.GOALS.map((g) => [g.id, 0]));
    const count = {};
    mine.forEach((l) => {
      const seen = new Set();
      (l.items || []).forEach((it) => {
        if (it.pid !== who) return;
        const ex = BY_ID[it.id]; if (!ex) return;
        byGoal[ex.goal] += it.sec || 0;
        if (!seen.has(it.id)) { count[it.id] = (count[it.id] || 0) + 1; seen.add(it.id); }
      });
    });
    const max = Math.max(1, ...Object.values(byGoal));
    $("#stat-goals").innerHTML = E.GOALS.map((g) => `<div class="bar-row"><span>${esc(g.name)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round((byGoal[g.id] / max) * 100)}%"></span></span><span class="val">${Math.round(byGoal[g.id] / 60)} Min</span></div>`).join("");
    const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 5);
    $("#stat-top").innerHTML = top.length ? top.map(([id, c]) => `<li>${esc(BY_ID[id] ? BY_ID[id].name : "gelöschte Übung")} <span>· ${c}×</span></li>`).join("") : `<li class="muted small" style="list-style:none;margin-left:-20px">Noch keine Trainings gespeichert.</li>`;
    const recent = mine.slice().sort((a, b) => b.ts - a.ts).slice(0, 10);
    const withTxt = (l) => { const o = entryPids(l).filter((x) => x !== who).map(personName); return o.length ? ` · mit ${esc(o.join(", "))}` : ""; };
    $("#stat-log").innerHTML = recent.length ? recent.map((l) => `<li><span class="when">${niceDate(l.d)}</span><span class="what">${l.manual ? "von Hand abgehakt" : `${Math.round(l.sec / 60)} Min · ${esc(uniqNames(l))}`}${withTxt(l)}</span></li>`).join("")
      : `<li class="muted small">Nach dem ersten Training erscheint es hier.</li>`;
  }

  // ------------------------------------------------------------------ Lauf-Modus
  let RUN = null, runTimer = 0;
  function startRun(ids, planDate, firstActive, remote) {
    ensureAudio();
    let q = [], lid, pause, lead;
    if (remote) {
      (remote.custom || []).forEach((c) => { if (c && c.id && !BY_ID[c.id] && !S.delEx.includes(c.id)) S.custom.push(c); });
      customCache.clear();
      q = (remote.q || []).filter((x) => BY_ID[x.id]).map((x) => ({ id: x.id, p: x.pid === myId() ? 0 : 1, sec: x.sec }));
      lid = remote.lid; pause = remote.pause; lead = remote.lead;
    } else {
      ids = ids.filter((id) => BY_ID[id]);
      ids.forEach((id) => {
        const sec = durOf(BY_ID[id]) * 60;
        const fa = firstActive ? 1 : 0;
        q.push({ id, p: fa, sec });
        if (S.settings.both) q.push({ id, p: 1 - fa, sec });
      });
      lid = rid("l"); pause = S.settings.pause; lead = Math.max(3, S.settings.lead);
    }
    if (!q.length) return;
    RUN = { q, i: 0, phase: "lead", end: Date.now() + lead * 1000, dur: lead, paused: false, rem: 0, done: [], planDate, closing: false, lastBeep: -1,
      lid, pause, live: !!LIVE, host: !remote };
    if (LIVE && !remote) {
      liveSend({ t: "start", lid, pause, lead, q: q.map((x) => ({ id: x.id, pid: S.players[x.p].id, sec: x.sec })),
        custom: [...new Set(q.map((x) => x.id))].filter((id) => !BUILT_BY_ID[id]).map((id) => S.custom.find((c) => c.id === id)).filter(Boolean) });
    }
    const el = $("#run"); raise(el); el.classList.remove("hidden"); updateLock();
    stopAnim();
    pushLayer(runBack);
    renderRun();
    clearInterval(runTimer); runTimer = setInterval(tick, 200);
    requestWake();
  }
  function runBack() {
    if (!RUN || RUN.closing || RUN.phase === "done") { closeRun(); return; }
    pushLayer(runBack);
    askExit();
  }
  function closeRun() {
    releaseWake();
    clearInterval(runTimer); RUN = null; stopAnim();
    const el = $("#run"); el.classList.add("hidden"); el.innerHTML = "";
    updateLock();
    if (detailEx) renderDetail();
    renderPlan(); renderStats();
  }
  function workDone() { return RUN.done.reduce((a, d) => a + d.sec, 0); }
  function askExit() {
    const was = RUN.paused; if (!was) togglePause();
    const has = workDone() + (RUN.phase === "work" ? (RUN.q[RUN.i].sec - remaining()) : 0) >= 30;
    sheet(`<div class="sheet-head"><h2>Training beenden?</h2></div>
      <div class="stack"><button class="fire-btn" id="ex-cont">Weiter trainieren</button>
      ${has ? `<button class="secondary-btn" id="ex-save">Beenden und Zeit speichern</button>` : ""}
      <button class="secondary-btn danger" id="ex-quit">Beenden ohne Speichern</button></div>`, (el) => {
      $("#ex-cont", el).onclick = () => { back(); if (!was && RUN && RUN.paused) togglePause(); };
      const sv = $("#ex-save", el);
      if (sv) sv.onclick = () => {
        creditPartial(); writeLog(false);
        if (RUN.live && LIVE) liveSend({ t: "end", lid: RUN.lid, entry: S.log.find((l) => l.lid === RUN.lid) || null });
        RUN.closing = true; history.go(-2);
      };
      $("#ex-quit", el).onclick = () => { if (RUN.live && LIVE) liveSend({ t: "quit", lid: RUN.lid }); RUN.closing = true; history.go(-2); };
    });
  }
  function remaining() { return RUN.paused ? RUN.rem : (RUN.end - Date.now()) / 1000; }
  function creditPartial() {
    if (RUN.phase !== "work") return;
    const it = RUN.q[RUN.i], sec = Math.round(Math.max(0, it.sec - remaining()));
    if (sec > 0) RUN.done.push({ id: it.id, p: it.p, pid: S.players[it.p].id, sec });
  }
  function writeLog(full) {
    const sec = workDone();
    if (sec < 30) return false;
    if (!S.log.some((l) => l.lid === RUN.lid)) S.log.push({ lid: RUN.lid, d: today(), ts: Date.now(), items: RUN.done.map((d) => ({ id: d.id, p: d.p, pid: d.pid, sec: d.sec })), sec, by: myId() });
    if (full && RUN.planDate && S.plan[RUN.planDate]) S.plan[RUN.planDate].done = true;
    if (full && S.plan[today()]) {
      const ids = new Set(RUN.done.map((d) => d.id));
      if (S.plan[today()].ex.every((id) => ids.has(id))) S.plan[today()].done = true;
    }
    save();
    return true;
  }
  function setPhase(phase, sec) {
    RUN.phase = phase; RUN.dur = sec; RUN.end = Date.now() + sec * 1000; RUN.paused = false; RUN.lastBeep = -1;
    renderRun();
  }
  function nextPhase(skipped) {
    const it = RUN.q[RUN.i];
    if (RUN.phase === "lead") { startSignal(); setPhase("work", it.sec); return; }
    if (RUN.phase === "work") {
      const sec = skipped ? Math.round(Math.max(0, it.sec - remaining())) : it.sec;
      if (sec > 0) RUN.done.push({ id: it.id, p: it.p, pid: S.players[it.p].id, sec });
      if (!skipped) endSignal();
      if (RUN.i >= RUN.q.length - 1) { finishRun(null, skipped); return; }
      if (RUN.pause > 0) setPhase("break", RUN.pause);
      else { RUN.i++; startSignal(); setPhase("work", RUN.q[RUN.i].sec); }
      return;
    }
    if (RUN.phase === "break") { RUN.i++; startSignal(); setPhase("work", RUN.q[RUN.i].sec); }
  }
  function finishRun(remoteEntry, bySkip) {
    clearInterval(runTimer);
    let saved = true;
    if (remoteEntry) RUN.done = (remoteEntry.items || []).map((d) => ({ id: d.id, pid: d.pid, p: d.pid === myId() ? 0 : 1, sec: d.sec }));
    else {
      saved = writeLog(true);
      if (RUN.live && LIVE && (RUN.host || bySkip)) liveSend({ t: "end", lid: RUN.lid, entry: S.log.find((l) => l.lid === RUN.lid) || null });
    }
    RUN.phase = "done";
    stopAnim();
    const el = $("#run");
    el.className = "playmode";
    const mins = Math.round(workDone() / 60);
    const names = [...new Set(RUN.done.map((d) => (BY_ID[d.id] ? BY_ID[d.id].name : "Übung")))];
    el.innerHTML = `<div class="pm-done"><div class="big">🏓</div><h2>Training geschafft!</h2>
      <p>${mins} Minute${mins === 1 ? "" : "n"} Übungszeit${saved ? " · gespeichert" : ""}</p>
      <ul>${names.map((n) => `<li>✓ ${esc(n)}</li>`).join("")}</ul></div>
      <button class="pm-btn main" id="pm-fin">Fertig</button>`;
    $("#pm-fin").onclick = () => { RUN.closing = true; back(); };
  }
  function togglePause() {
    if (!RUN || RUN.phase === "done") return;
    if (RUN.paused) { RUN.paused = false; RUN.end = Date.now() + RUN.rem * 1000; }
    else { RUN.rem = remaining(); RUN.paused = true; }
    renderRun();
    liveSnapSend();
  }
  function skipNow() {
    ensureAudio();
    if (RUN.paused) { RUN.paused = false; RUN.end = Date.now() + RUN.rem * 1000; }
    nextPhase(true);
    liveSnapSend();
  }
  function tick() {
    if (!RUN || RUN.paused || RUN.phase === "done") return;
    const r = remaining();
    const t = $("#pm-time"); if (t) t.textContent = fmt(r);
    const bar = $("#pm-bar"); if (bar) bar.style.width = `${Math.min(100, Math.max(0, (1 - r / RUN.dur) * 100))}%`;
    const whole = Math.ceil(r);
    if (whole <= 3 && whole >= 1 && whole !== RUN.lastBeep) { RUN.lastBeep = whole; beep(RUN.phase === "work" ? 740 : 880, 110, 0.22); }
    if (r <= 0) { nextPhase(false); if (RUN && RUN.host) liveSnapSend(); }
  }
  function renderRun() {
    if (!RUN || RUN.phase === "done") return;
    const el = $("#run");
    const it = RUN.q[RUN.i];
    const showIt = RUN.phase === "break" ? RUN.q[RUN.i + 1] : it;
    const ex = BY_ID[showIt.id], nm = namesFor(showIt.p), h = handsFor(showIt.p);
    const flip = RUN.live && showIt.p === 1;
    const exNo = [...new Set(RUN.q.map((x) => x.id))].indexOf(showIt.id) + 1, exTotal = new Set(RUN.q.map((x) => x.id)).size;
    const roundNo = RUN.q.filter((x, k) => x.id === showIt.id && k <= RUN.q.indexOf(showIt)).length;
    const rounds = RUN.q.filter((x) => x.id === showIt.id).length;
    const phaseTxt = RUN.paused ? "Pausiert" : RUN.phase === "lead" ? "Gleich geht's los" : RUN.phase === "break" ? (showIt.id === it.id ? "Rollenwechsel" : "Nächste Übung") : "Läuft";
    el.className = "playmode" + (RUN.paused ? " is-paused" : RUN.phase === "break" ? " is-break" : "");
    el.innerHTML = `<div class="pm-top"><span class="pm-count">Übung ${exNo}/${exTotal}${rounds > 1 ? ` · Durchgang ${roundNo}/${rounds}` : ""}</span><button class="pm-x" id="pm-x" aria-label="Beenden">✕</button></div>
      <h2 class="pm-title">${esc(ex.name)}</h2>
      <div class="pm-who"><span class="pm-badge">${esc(nm.A)} aktiv</span><span>gegen ${esc(nm.B)}</span></div>
      <div class="pm-phase">${phaseTxt}</div>
      <div class="pm-time" id="pm-time">${fmt(remaining())}</div>
      <div class="pm-progress"><i id="pm-bar"></i></div>
      <div class="pm-diagram">${diagramSVG(ex, h, nm, { cls: "diagram run-dg", flip })}</div>
      ${RUN.phase === "break" ? `<p class="pm-next">${showIt.id === it.id ? `Jetzt ist ${esc(nm.A)} dran.` : "Kurz trinken, dann geht's weiter."}</p>` : ""}
      <div class="pm-controls"><button class="pm-btn" id="pm-pause">${RUN.paused ? "▶ Weiter" : "⏸ Pause"}</button><button class="pm-btn main" id="pm-skip">${RUN.phase === "work" ? "Fertig ⏭" : "Jetzt starten"}</button></div>
      <p class="pm-hint">${RUN.live ? (LIVE ? `ᛒ Live mit ${esc(LIVE.name)} · Pause und Weiter gelten für beide` : "Live-Verbindung getrennt · läuft hier weiter") : (HAS_BT || navigator.wakeLock ? "Nach links wischen: weiter · Display bleibt an" : "Nach links wischen: weiter")}</p>`;
    $("#pm-x").onclick = () => back();
    $("#pm-pause").onclick = togglePause;
    $("#pm-skip").onclick = skipNow;
    tick();
    playAnim($(".run-dg", el), ex, h);
  }
  (function swipe() {
    let x0 = null, y0 = null;
    const el = $("#run");
    el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener("touchend", (e) => {
      if (x0 == null || !RUN || RUN.phase === "done") return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (dx < -70 && Math.abs(dy) < 60) skipNow();
    }, { passive: true });
  })();

  // ------------------------------------------------------------------ Spieler & Einstellungen
  function renderPlayersLabel() { $("#players-label").textContent = `${pName(0)} · ${pName(1)}`; }
  function playersSheet(first) {
    const P = S.players;
    let pick = P[1].id;                       // gewählter Partner
    const draft = { me: { name: P[0].name, hand: P[0].hand }, nw: { name: "", hand: "R" } };
    const partners = () => {
      const ids = Object.keys(S.people).filter((id) => id !== P[0].id);
      if (!ids.includes(P[1].id)) ids.unshift(P[1].id);
      return ids;
    };
    const info = (id) => S.people[id] || (id === P[1].id ? { name: P[1].name, hand: P[1].hand, local: !!P[1].local } : { name: "", hand: "R", local: true });
    sheet(`<div class="sheet-head"><h2>${first ? "Willkommen!" : "Spieler"}</h2>${first ? "" : '<button class="icon-action" data-close aria-label="Schließen">✕</button>'}</div>
      ${first ? `<p class="lead">Diese App ist für das Training zu zweit. Gib deinen Namen ein und mit welcher Hand ihr spielt – alle Diagramme passen sich daran an, auch für Links-Rechts-Paare.</p>` : ""}
      <h3>Du (dieses Handy)</h3>
      <div class="player-edit"><label class="field" style="margin:0"><span>Name</span><input type="text" id="pl-n0" maxlength="20" value="${esc(P[0].name)}"></label><div class="seg" id="pl-h0"></div></div>
      <h3>Trainingspartner</h3>
      <div class="chip-row" id="pl-partners"></div>
      <div id="pl-partner"></div>
      <h3>Wer ist zuerst aktiv?</h3>
      <div class="seg" id="pl-first"></div>
      <button class="fire-btn top-gap" id="pl-ok">${first ? "Los geht's" : "Speichern"}</button>`, (el) => {
      segHTML($("#pl-h0", el), [["R", "Rechts"], ["L", "Links"]], draft.me.hand, (v) => { draft.me.hand = v; });
      $("#pl-n0", el).oninput = (e) => { draft.me.name = e.target.value; drawFirst(); };
      const drawFirst = () => {
        const pn = pick === "new" ? draft.nw.name || "Partner" : info(pick).name || "Partner";
        segHTML($("#pl-first", el), [[0, esc(draft.me.name.trim() || "Du")], [1, esc(pn)]], S.startWith, (v) => { S.startWith = +v; });
      };
      const draw = () => {
        $("#pl-partners", el).innerHTML = partners().map((id) => `<button class="chip ${pick === id ? "active" : ""}" data-pp="${id}">${esc(info(id).name || "Partner")}${info(id).local ? "" : " ✓"}</button>`).join("") +
          `<button class="chip ${pick === "new" ? "active" : ""}" data-pp="new">+ Neu</button>`;
        const cur = pick === "new" ? Object.assign({ local: true }, draft.nw) : info(pick);
        $("#pl-partner", el).innerHTML = cur.local
          ? `<div class="player-edit"><label class="field" style="margin:0"><span>Name</span><input type="text" id="pl-n1" maxlength="20" value="${esc(cur.name)}" placeholder="Name des Partners"></label><div class="seg" id="pl-h1"></div></div>
             <p class="muted small">Hat dein Partner die App auch? Dann gleicht euch ab, damit jeder seine Statistik bekommt.</p>
             ${first ? "" : `<button class="secondary-btn wide" id="pl-bt">${HAS_BT ? "ᛒ Per Bluetooth koppeln und abgleichen" : "⇄ Per Code abgleichen"}</button>`}`
          : `<p class="partner-line"><strong>${esc(cur.name)}</strong> · ${cur.hand === "L" ? "Linkshänder" : "Rechtshänder"}<br><span class="muted small">Gekoppelt – Name und Hand kommen von seinem Handy.</span></p>`;
        const h1 = $("#pl-h1", el);
        if (h1) {
          segHTML(h1, [["R", "Rechts"], ["L", "Links"]], cur.hand, (v) => { if (pick === "new") draft.nw.hand = v; else { S.people[pick] = Object.assign({}, info(pick), { hand: v }); } });
          $("#pl-n1", el).oninput = (e) => { if (pick === "new") draft.nw.name = e.target.value; else S.people[pick] = Object.assign({}, info(pick), { name: e.target.value }); drawFirst(); };
        }
        const bt = $("#pl-bt", el);
        if (bt) bt.onclick = () => { commit(); backThen(() => (HAS_BT ? syncSheet("sync") : codeSheet())); };
        drawFirst();
      };
      $("#pl-partners", el).onclick = (e) => { const b = e.target.closest("[data-pp]"); if (b) { pick = b.dataset.pp; draw(); } };
      const commit = () => {
        P[0].name = draft.me.name.trim() || "Spieler 1"; P[0].hand = draft.me.hand;
        if (pick === "new") {
          const id = rid("p");
          S.people[id] = { name: draft.nw.name.trim() || "Partner", hand: draft.nw.hand, local: true };
          pick = id;
        }
        const i = info(pick);
        S.players[1] = { id: pick, name: (i.name || "Partner").trim() || "Partner", hand: i.hand || "R", local: !!i.local };
        S.people[pick] = { name: S.players[1].name, hand: S.players[1].hand, local: S.players[1].local };
        S.onboarded = true; save(); thumbCache.clear(); renderPlayersLabel(); renderLib(); renderDiceRes(); renderStats();
      };
      $("#pl-ok", el).onclick = () => { commit(); back(); };
      draw();
    });
  }

  // ------------------------------------------------------------------ Bluetooth-Abgleich
  const BTB = () => window.TTBT || null;
  function placeholderHasLogs() {
    const p = S.players[1];
    return p.local && S.log.some((l) => inEntry(l, p.id));
  }
  function syncPayload(useAlias) {
    const people = {};
    Object.entries(S.people).forEach(([id, x]) => { if (!x.local) people[id] = { name: x.name, hand: x.hand }; });
    return JSON.stringify({
      app: "tttraining", v: 1,
      me: { id: myId(), name: pName(0), hand: S.players[0].hand },
      alias: useAlias && S.players[1].local ? S.players[1].id : null,
      log: S.log, custom: S.custom, del: S.delEx, people,
    });
  }
  function applySync(txt, useAlias) {
    const o = JSON.parse(txt);
    if (!o || o.app !== "tttraining" || !o.me || !o.me.id) throw new Error("Unbekannte Daten empfangen");
    const me = myId();
    if (o.me.id === me) throw new Error("Beide Handys haben dieselbe Spieler-Kennung (gleiche Sicherung eingespielt?)");
    const ph = useAlias && S.players[1].local ? S.players[1].id : null;
    // 1. Bisherige Trainings mit dem Platzhalter gehören jetzt dem echten Partner
    if (ph) {
      S.log.forEach((l) => {
        (l.items || []).forEach((it) => { if (it.pid === ph) it.pid = o.me.id; });
        if (l.pids) l.pids = l.pids.map((x) => (x === ph ? o.me.id : x));
      });
      delete S.people[ph];
    }
    // 2. Trainings des Partners übernehmen; sein Platzhalter für mich wird zu meiner Kennung
    const have = new Set(S.log.map((l) => l.lid));
    let added = 0;
    (Array.isArray(o.log) ? o.log : []).forEach((l) => {
      if (!l || !l.lid || have.has(l.lid) || !l.d) return;
      const c = JSON.parse(JSON.stringify(l));
      (c.items || []).forEach((it) => { if (o.alias && it.pid === o.alias) it.pid = me; });
      if (c.pids) c.pids = c.pids.map((x) => (o.alias && x === o.alias ? me : x));
      S.log.push(c); have.add(c.lid); added++;
    });
    // 3. Eigene Übungen beider Seiten
    (Array.isArray(o.del) ? o.del : []).forEach((id) => { if (!S.delEx.includes(id)) S.delEx.push(id); });
    let exNew = 0;
    (Array.isArray(o.custom) ? o.custom : []).forEach((c) => {
      if (!c || !c.id || S.delEx.includes(c.id) || BUILT_BY_ID[c.id]) return;
      const k = S.custom.findIndex((x) => x.id === c.id);
      if (k < 0) { S.custom.push(c); exNew++; }
      else if ((c.upd || 0) > (S.custom[k].upd || 0)) S.custom[k] = c;
    });
    S.custom = S.custom.filter((c) => !S.delEx.includes(c.id));
    customCache.clear(); thumbCache.clear();
    // 4. Personen und Partner
    Object.entries(o.people || {}).forEach(([id, x]) => { if (id !== me && !S.people[id] && x && x.name) S.people[id] = { name: x.name, hand: x.hand || "R" }; });
    S.people[o.me.id] = { name: o.me.name || "Partner", hand: o.me.hand || "R" };
    S.players[1] = { id: o.me.id, name: o.me.name || "Partner", hand: o.me.hand || "R" };
    S.lastSync[o.me.id] = Date.now();
    save();
    renderPlayersLabel(); renderLib(); renderDiceRes(); renderPlan(); renderStats();
    return { added, exNew, name: o.me.name || "Partner" };
  }

  function syncSheet(kind) {
    const live = kind === "live";
    let timer = 0, mode = "idle", payload = "", useAlias = true, target = "", applied = false;
    const stopAll = () => { clearInterval(timer); timer = 0; if (live && LIVE) return; const b = BTB(); if (b) { try { b.stop(); } catch (e) { /* egal */ } } };
    sheet(`<div class="sheet-head"><h2>${live ? "ᛒ Live-Training" : "ᛒ Mit Partner abgleichen"}</h2><button class="icon-action" data-close aria-label="Schließen">✕</button></div><div id="sy-body"></div>`, (el) => {
      const body = $("#sy-body", el);
      const help = `<details class="help"><summary>Erstes Mal? So koppelt ihr die Handys</summary><ol class="small">
          <li>Auf beiden Handys Bluetooth einschalten.</li>
          <li>Auf einem Handy <b>Einstellungen → Verbindungen → Bluetooth</b> öffnen und das andere Handy in der Liste antippen. Den Code auf beiden Handys bestätigen.</li>
          <li>Das müsst ihr nur einmal machen. Danach erscheint das Handy hier in der Liste.</li></ol></details>`;
      const show = (html) => { body.innerHTML = html; };
      const poll = (fn, ms) => { clearInterval(timer); timer = setInterval(fn, ms || 400); };
      const check = () => {
        const b = BTB();
        if (live && LIVE) {
          show(`<div class="sy-done"><div class="big">ᛒ</div><h3>Live verbunden mit ${esc(LIVE.name)}</h3><p class="muted small">Jede Übung, die einer von euch startet, läuft auf beiden Handys.</p></div>
            <div class="stack"><button class="fire-btn" data-close>OK</button><button class="secondary-btn danger" id="sy-stop">Verbindung trennen</button></div>`);
          $("[data-close]", body).onclick = back;
          $("#sy-stop", body).onclick = () => { liveStop(); back(); };
          return;
        }
        if (!b) { show(`<p class="lead">Bluetooth funktioniert nur in der installierten App, nicht in der Vorschau im Browser.</p>`); return; }
        let perm = 0, st = 1;
        try { perm = b.perm(); st = b.state(); } catch (e) { show(`<p class="lead err-text">Bluetooth-Funktion nicht verfügbar: ${esc(e.message || e)}</p>`); return; }
        if (perm !== 0) {
          show(`<p class="lead">Die App braucht die Erlaubnis für <b>„Geräte in der Nähe“</b>, um sich mit dem Handy deines Partners zu verbinden. Es werden nur eure Trainingsdaten ausgetauscht.</p>
            <button class="fire-btn" id="sy-perm">Erlauben</button>`);
          $("#sy-perm", body).onclick = () => { try { b.ask(); } catch (e) { /* */ } poll(() => { try { if (b.perm() === 0) check(); } catch (e) { /* */ } }, 600); };
          return;
        }
        if (st === -1) { show(`<p class="lead">Dieses Handy hat kein Bluetooth.</p>`); return; }
        if (st === 0) {
          show(`<p class="lead">Bluetooth ist ausgeschaltet.</p><button class="fire-btn" id="sy-on">Bluetooth einschalten</button>`);
          $("#sy-on", body).onclick = () => { try { b.enable(); } catch (e) { /* */ } poll(() => { try { if (b.state() === 1) check(); } catch (e) { /* */ } }, 600); };
          return;
        }
        ready();
      };
      const listen = () => {
        const b = BTB();
        try { b.stop(); } catch (e) { /* */ }
        payload = syncPayload(useAlias);
        mode = "server"; applied = false;
        if (live) b.liveListen(); else b.listen(payload);
        poll(watch);
      };
      const ready = () => {
        const b = BTB();
        let raw = "";
        try { raw = b.devices(); } catch (e) { raw = "!" + (e.message || e); }
        const devs = raw && raw[0] === "!" ? null : raw.split("\n").filter(Boolean).map((l) => { const [n, a] = l.split("\t"); return { name: n && n !== "null" ? n : a, addr: a }; }).filter((d) => d.addr);
        const ph = placeholderHasLogs();
        show(`<div class="sy-status" id="sy-status"><span class="sy-dot"></span><span id="sy-text">Bereit – wartet auf den Partner …</span></div>
          <p class="lead">${live ? "Verbindet euch vor dem Training: Öffnet diesen Bildschirm auf <b>beiden</b> Handys, dann tippt einer das andere Handy an. Danach läuft jede Übung auf beiden Handys gleichzeitig – mit Timer, Pause und Rollenwechsel." : "Öffnet diesen Bildschirm auf <b>beiden</b> Handys. Dann tippt einer von euch das andere Handy an."}</p>
          ${ph ? `<label class="switch-row"><span>Bisherige Trainings mit „${esc(pName(1))}“ diesem Partner zuordnen</span><span class="switch"><input type="checkbox" id="sy-alias" ${useAlias ? "checked" : ""}><i></i></span></label>` : ""}
          <h3>Gekoppelte Geräte</h3>
          ${devs === null ? `<p class="small err-text">Geräteliste nicht lesbar: ${esc(raw.slice(1))}</p>` : devs.length ? `<ul class="dev-list">${devs.map((d) => `<li><button class="dev-btn" data-addr="${esc(d.addr)}" data-name="${esc(d.name)}"><span class="dev-ico">📱</span><span class="dev-name">${esc(d.name)}</span><span class="dev-go">Verbinden ›</span></button></li>`).join("")}</ul>` : `<p class="small muted">Noch kein Gerät gekoppelt.</p>`}
          <button class="secondary-btn wide top-gap" id="sy-refresh">⟳ Liste aktualisieren</button>
          ${help}`);
        const al = $("#sy-alias", body);
        if (al) al.onchange = (e) => { useAlias = e.target.checked; listen(); };
        $("#sy-refresh", body).onclick = ready;
        body.querySelectorAll("[data-addr]").forEach((btn) => {
          btn.onclick = () => {
            target = btn.dataset.name;
            try { b.stop(); } catch (e) { /* */ }
            payload = syncPayload(useAlias);
            mode = "client"; applied = false;
            setStatus("busy", `Verbinde mit ${target} …`);
            body.querySelectorAll("[data-addr]").forEach((x) => { x.disabled = true; });
            if (live) b.liveConnect(btn.dataset.addr); else b.connect(btn.dataset.addr, payload);
            poll(watch);
          };
        });
        listen();
      };
      const setStatus = (cls, text) => {
        const box = $("#sy-status", body);
        if (!box) return;
        box.className = "sy-status " + cls;
        $("#sy-text", body).textContent = text;
      };
      const watch = () => {
        const b = BTB();
        let st = "";
        try { st = b.status() || ""; } catch (e) { return; }
        if (st === "wait") setStatus("", "Bereit – wartet auf den Partner …");
        else if (st === "conn") setStatus("busy", "Verbunden – Daten werden ausgetauscht …");
        else if (live && st === "live" && !applied) {
          applied = true; clearInterval(timer); timer = 0;
          liveStart(useAlias);
          show(`<div class="sy-done"><div class="big">ᛒ</div><h3>Live verbunden</h3><p>Startet jetzt eine Übung oder Einheit – sie läuft auf beiden Handys.</p></div>
            <button class="fire-btn" data-close>Los geht's</button>`);
          $("[data-close]", body).onclick = back;
        }
        else if (st === "done" && !applied) {
          applied = true; clearInterval(timer);
          let r;
          try {
            const txt = b.take();
            r = applySync(txt, useAlias);
          } catch (e) {
            show(`<p class="lead err-text">Abgleich fehlgeschlagen: ${esc(e.message || e)}</p><button class="fire-btn" id="sy-again">Nochmal versuchen</button>`);
            $("#sy-again", body).onclick = () => ready();
            return;
          }
          const parts = [r.added ? `${r.added} neue${r.added === 1 ? "s" : ""} Training${r.added === 1 ? "" : "s"} übernommen` : "Alles war schon auf dem neuesten Stand"];
          if (r.exNew) parts.push(`${r.exNew} eigene Übung${r.exNew === 1 ? "" : "en"} von ${r.name} dazugekommen`);
          show(`<div class="sy-done"><div class="big">✓</div><h3>Abgleich mit ${esc(r.name)} fertig</h3><p>${esc(parts.join(" · "))}.</p>
            <p class="muted small">Unter „Fortschritt“ seht ihr jetzt beide eure eigene Statistik und die des anderen.</p></div>
            <button class="fire-btn" id="sy-fin">Fertig</button>`);
          $("#sy-fin", body).onclick = () => backThen(() => showTab("stats"));
        } else if (st.startsWith("err:")) {
          if (mode === "client") {
            clearInterval(timer);
            setStatus("err", `Keine Verbindung zu ${target}. Ist dort der Abgleich-Bildschirm offen?`);
            body.querySelectorAll("[data-addr]").forEach((x) => { x.disabled = false; });
            setTimeout(() => { if (timer === 0 && document.body.contains(body)) listen(); }, 1500);
          } else {
            clearInterval(timer);
            setStatus("err", "Bluetooth-Fehler: " + st.slice(4));
            setTimeout(() => { if (timer === 0 && document.body.contains(body)) listen(); }, 3000);
          }
          timer = 0;
        }
      };
      check();
    }, stopAll);
  }
  function applyTheme() {
    const t = S.settings.theme;
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }
  function settingsSheet() {
    const st = S.settings;
    const sw = (id, label, on) => `<label class="switch-row"><span>${label}</span><span class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><i></i></span></label>`;
    sheet(`<div class="sheet-head"><h2>Einstellungen</h2><button class="icon-action" data-close aria-label="Schließen">✕</button></div>
      <h3>Training</h3>
      ${sw("st-both", "Jede Übung zweimal (Rollenwechsel)", st.both)}
      <div class="dur-row top-gap"><span>Pause beim Wechsel</span><div class="stepper"><button class="icon-action" id="st-pm">−</button><span><strong id="st-pv">${st.pause}</strong><small>Sekunden</small></span><button class="icon-action" id="st-pp">+</button></div></div>
      <div class="dur-row"><span>Vorlauf vor dem Start</span><div class="stepper"><button class="icon-action" id="st-lm">−</button><span><strong id="st-lv">${st.lead}</strong><small>Sekunden</small></span><button class="icon-action" id="st-lp">+</button></div></div>
      <h3>Signale</h3>
      ${sw("st-sound", "Ton am Ende jeder Übung", st.sound)}
      ${sw("st-vib", "Vibration", st.vib)}
      <button class="secondary-btn" id="st-test">Signal testen</button>
      <h3>Darstellung</h3>
      <div class="seg" id="st-theme"></div>
      <h3>Daten</h3>
      <p class="muted small">Alles bleibt nur auf diesem Handy. Mit „Sichern" bekommst du einen Text, den du z. B. in eine Notiz kopierst. Nach einer Neuinstallation fügst du ihn bei „Wiederherstellen" ein.</p>
      <div class="row-buttons"><button class="secondary-btn" id="st-exp">Sichern</button><button class="secondary-btn" id="st-imp">Wiederherstellen</button></div>
      <div class="row-buttons top-gap"><button class="secondary-btn danger" id="st-reset">Alle Daten löschen</button></div>
      <p class="muted small top-gap">TT Training ${VERSION} · ${BUILTIN.length} Übungen für zwei Spieler, jede Schlagfolge automatisch auf Logik geprüft (Schnitt, Länge, Seite, Laufweg).</p>`, (el) => {
      const bind = (id, k) => { $(id, el).onchange = (e) => { st[k] = e.target.checked; save(); if (k === "both") { renderDiceRes(); if (detailEx) renderDetail(); } }; };
      bind("#st-both", "both"); bind("#st-sound", "sound"); bind("#st-vib", "vib");
      const step = (m, p, v, k, min, max, d) => {
        $(m, el).onclick = () => { st[k] = Math.max(min, st[k] - d); $(v, el).textContent = st[k]; save(); renderDiceRes(); };
        $(p, el).onclick = () => { st[k] = Math.min(max, st[k] + d); $(v, el).textContent = st[k]; save(); renderDiceRes(); };
      };
      step("#st-pm", "#st-pp", "#st-pv", "pause", 0, 180, 5);
      step("#st-lm", "#st-lp", "#st-lv", "lead", 3, 30, 1);
      $("#st-test", el).onclick = () => { ensureAudio(); endSignal(); };
      segHTML($("#st-theme", el), [["auto", "Automatisch"], ["light", "Hell"], ["dark", "Dunkel"]], st.theme, (v) => { st.theme = v; save(); applyTheme(); });
      $("#st-exp", el).onclick = exportSheet;
      $("#st-imp", el).onclick = importSheet;
      $("#st-reset", el).onclick = () => sheet(`<div class="sheet-head"><h2>Wirklich alles löschen?</h2></div><p class="lead">Spieler, Favoriten, Plan und alle gespeicherten Trainings werden gelöscht.</p>
        <div class="stack"><button class="secondary-btn danger" id="rs-yes">Ja, alles löschen</button><button class="fire-btn" data-close>Abbrechen</button></div>`, (e2) => {
        $("#rs-yes", e2).onclick = () => { try { localStorage.removeItem(KEY); } catch (e) { /* egal */ } location.reload(); };
      });
    });
  }
  function exportSheet() {
    const txt = JSON.stringify({ app: "tttraining", v: 1, data: S });
    sheet(`<div class="sheet-head"><h2>Daten sichern</h2><button class="icon-action" data-close aria-label="Schließen">✕</button></div>
      <p class="muted small">Diesen Text kopieren und gut aufheben.</p>
      <label class="field"><span>Sicherung</span><textarea id="ex-txt" readonly></textarea></label>
      <button class="fire-btn" id="ex-copy">Kopieren</button>`, (el) => {
      const ta = $("#ex-txt", el); ta.value = txt;
      $("#ex-copy", el).onclick = async () => {
        let ok = false;
        try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(txt); ok = true; } } catch (e) { ok = false; }
        if (!ok) { ta.focus(); ta.select(); try { ok = document.execCommand("copy"); } catch (e) { ok = false; } }
        toast(ok ? "Kopiert" : "Bitte den Text markieren und kopieren");
      };
    });
  }
  function importSheet() {
    sheet(`<div class="sheet-head"><h2>Wiederherstellen</h2><button class="icon-action" data-close aria-label="Schließen">✕</button></div>
      <p class="muted small">Gesicherten Text einfügen. Die aktuellen Daten werden ersetzt.</p>
      <label class="field"><span>Sicherung</span><textarea id="im-txt"></textarea></label>
      <button class="fire-btn" id="im-ok">Übernehmen</button>`, (el) => {
      $("#im-ok", el).onclick = () => {
        try {
          const o = JSON.parse($("#im-txt", el).value);
          if (!o || o.app !== "tttraining" || !isObj(o.data)) throw new Error("x");
          S = merge(DEFAULT(), o.data); save(); location.reload();
        } catch (e) { toast("Das ist keine gültige Sicherung"); }
      };
    });
  }

  // ------------------------------------------------------------------ Eigene Übungen
  const STROKE_GROUPS = [
    ["Aufschlag (nur 1. Ball)", ["AS-US", "AS-SS", "AS-OS", "AS-LE"]],
    ["Kurzes Spiel", ["ABL", "FL", "SCH"]],
    ["Lange Bälle", ["TS", "KO", "BL"]],
    ["Abwehr", ["AB", "BA", "SM"]],
  ];
  const BUILT_SIGS = (() => { const m = new Map(); BUILTIN.forEach((ex) => E.signature(ex).forEach((v) => { if (!m.has(v)) m.set(v, ex.name); })); return m; })();
  let ED = null;
  function edFromEx(ex) {
    const st = E.parse(ex);
    return {
      first: st[0].p, from: st[0].from || "RH",
      steps: st.map((x) => ({ st: x.st, side: x.side, to: x.to.map((t) => t.z), short: x.to.some((t) => t.short) })),
    };
  }
  function openEditor(id, template) {
    const src = id ? S.custom.find((c) => c.id === id) : null;
    const base = src ? customToEx(src) : template || null;
    ED = {
      id: src ? src.id : null,
      name: src ? src.name : template ? template.name + " (eigene)" : "",
      goal: base ? base.goal : "kontrolle", lv: base ? base.lv : 1, dur: base ? (src ? src.dur : durOf(template)) : 5,
      end: base ? base.end : "loop", d: src ? src.d || "" : template ? template.d : "", t: src ? src.t || "" : template ? template.t : "",
      first: "A", from: "RH",
      steps: [{ st: "KO", side: "VH", to: ["VH"], short: false }, { st: "KO", side: "VH", to: ["VH"], short: false }],
      dirty: !!template, saved: false,
    };
    if (base) Object.assign(ED, edFromEx(base));
    const el = $("#editor"); raise(el);
    renderEditor();
    el.classList.remove("hidden"); el.scrollTop = 0; updateLock();
    pushLayer(editorBack);
  }
  function editorBack() {
    if (!ED || ED.saved || !ED.dirty) { closeEditor(); return; }
    pushLayer(editorBack);
    sheet(`<div class="sheet-head"><h2>Änderungen verwerfen?</h2></div><div class="stack"><button class="fire-btn" data-close>Weiter bearbeiten</button><button class="secondary-btn danger" id="ed-discard">Verwerfen</button></div>`, (el) => {
      $("#ed-discard", el).onclick = () => { ED.saved = true; history.go(-2); };
    });
  }
  function closeEditor() {
    stopAnim(); ED = null;
    const el = $("#editor"); el.classList.add("hidden"); el.innerHTML = ""; updateLock();
    if (detailEx) { detailEx = BY_ID[detailEx.id] || null; if (detailEx) renderDetail(); }
  }
  function edHitter(i) { return (i % 2 === 0) === (ED.first === "A") ? "A" : "B"; }
  function edRecord() {
    const s = ED.steps.map((x, i) => {
      const to = (x.to.length ? x.to : ["MI"]).map((z) => z + (x.short ? "k" : "")).join("|");
      const from = i === 0 && ED.end !== "loop" ? "@" + ED.from : "";
      return `${edHitter(i)} ${x.side}-${x.st}${from}>${to}`;
    });
    return { id: ED.id || "u" + Date.now().toString(36), name: ED.name.trim() || "Eigene Übung", goal: ED.goal, lv: ED.lv, dur: ED.dur, end: ED.end, s, d: ED.d.trim(), t: ED.t.trim() };
  }
  function edCheck(rec) {
    const ex = Object.assign({}, rec, { d: rec.d || "x", t: rec.t || "x" });
    let errs;
    try { errs = E.validate(ex); } catch (e) { errs = ["Ablauf nicht lesbar"]; }
    errs = [...new Set(errs)];
    let same = null;
    if (!errs.length) { for (const v of E.signature(ex)) if (BUILT_SIGS.has(v)) { same = BUILT_SIGS.get(v); break; } }
    return { errs, same, ex };
  }
  function renderEditor() {
    const el = $("#editor");
    const goals = E.GOALS.map((g) => `<option value="${g.id}" ${g.id === ED.goal ? "selected" : ""}>${esc(g.name)}</option>`).join("");
    el.innerHTML = `<div class="page-head"><button class="back-btn" data-back aria-label="Zurück">‹</button><h1>${ED.id ? "Übung bearbeiten" : "Eigene Übung"}</h1><button class="page-save" id="ed-save">Speichern</button></div>
      <div class="page-body">
        <div class="panel">
          <label class="field"><span>Name</span><input type="text" id="ed-name" maxlength="50" value="${esc(ED.name)}" placeholder="z. B. Mein Falkenberg"></label>
          <label class="field"><span>Trainingsziel</span><select id="ed-goal">${goals}</select></label>
          <p class="seg-label">Stufe</p><div class="seg" id="ed-lv"></div>
          <div class="dur-row top-gap"><span>Dauer je Durchgang</span><div class="stepper"><button class="icon-action" id="ed-dm">−</button><span><strong id="ed-dv">${ED.dur}</strong><small>Minuten</small></span><button class="icon-action" id="ed-dp">+</button></div></div>
        </div>
        <div class="detail-grid">
          <div class="diagram-card ed-preview" id="ed-preview"></div>
          <div>
            <div class="panel">
              <h2>Ablauf</h2>
              <p class="seg-label">Nach dem letzten Schritt</p><div class="seg" id="ed-end"></div>
              <p class="seg-label">Wer spielt den 1. Ball?</p><div class="seg" id="ed-first"></div>
              <div id="ed-from-wrap"><p class="seg-label">Wo steht er dabei?</p><div class="seg" id="ed-from"></div></div>
              <p class="muted small">Gelb = aktiver Spieler, weiß = Partner. Die Spieler wechseln sich automatisch ab. Ziel = Stelle in der Hälfte des anderen; mehrere Ziele = unregelmäßig.</p>
              <div id="ed-steps"></div>
              <div class="row-buttons"><button class="secondary-btn" id="ed-add">+ Schritt</button><button class="secondary-btn" id="ed-add2">+ 2 Schritte</button></div>
            </div>
            <div class="panel"><h2>Prüfung</h2><ul class="check" id="ed-check"></ul><ol class="ed-desc" id="ed-desc"></ol></div>
            <div class="panel">
              <label class="field"><span>Beschreibung (optional)</span><textarea id="ed-d" maxlength="400" style="font-family:inherit;font-size:.95rem;min-height:80px">${esc(ED.d)}</textarea></label>
              <label class="field"><span>Worauf achten (optional)</span><textarea id="ed-t" maxlength="400" style="font-family:inherit;font-size:.95rem;min-height:80px">${esc(ED.t)}</textarea></label>
            </div>
            <button class="fire-btn" id="ed-save2">Übung speichern</button>
          </div>
        </div>
      </div>`;
    const dirty = () => { ED.dirty = true; };
    $("[data-back]", el).onclick = back;
    $("#ed-name", el).oninput = (e) => { ED.name = e.target.value; dirty(); };
    $("#ed-d", el).oninput = (e) => { ED.d = e.target.value; dirty(); };
    $("#ed-t", el).oninput = (e) => { ED.t = e.target.value; dirty(); };
    $("#ed-goal", el).onchange = (e) => { ED.goal = e.target.value; dirty(); };
    segHTML($("#ed-lv", el), [[1, "Leicht"], [2, "Mittel"], [3, "Schwer"]], ED.lv, (v) => { ED.lv = +v; dirty(); });
    const setDur = (v) => { ED.dur = Math.max(1, Math.min(30, v)); $("#ed-dv", el).textContent = ED.dur; dirty(); };
    $("#ed-dm", el).onclick = () => setDur(ED.dur - 1);
    $("#ed-dp", el).onclick = () => setDur(ED.dur + 1);
    segHTML($("#ed-end", el), [["loop", "Wiederholen"], ["frei", "Frei weiter"], ["neu", "Neu starten"]], ED.end, (v) => { ED.end = v; dirty(); edRefresh(); });
    segHTML($("#ed-first", el), [["A", "Aktiver"], ["B", "Partner"]], ED.first, (v) => { ED.first = v; dirty(); edRefresh(); });
    segHTML($("#ed-from", el), [["RH", "RH-Seite"], ["MI", "Mitte"], ["VH", "VH-Seite"]], ED.from, (v) => { ED.from = v; dirty(); edRefresh(); });
    $("#ed-add", el).onclick = () => { edAddStep(); edRefresh(); };
    $("#ed-add2", el).onclick = () => { edAddStep(); edAddStep(); edRefresh(); };
    $("#ed-save", el).onclick = edSave; $("#ed-save2", el).onclick = edSave;
    $("#ed-steps", el).addEventListener("click", edStepClick);
    $("#ed-steps", el).addEventListener("change", (e) => {
      const sel = e.target.closest("select[data-st]"); if (!sel) return;
      const x = ED.steps[+sel.dataset.st]; x.st = sel.value;
      if (E.STROKES[x.st].serve && x.side === "*") x.side = "VH";
      if (E.STROKES[x.st].tgt === "short") x.short = true;
      if (E.STROKES[x.st].tgt === "long") x.short = false;
      dirty(); edRefresh();
    });
    edRefresh();
  }
  function edAddStep() {
    const last = ED.steps[ED.steps.length - 1];
    let st = "KO";
    if (last) { const out = E.STROKES[last.st].out; st = out === "US" ? (last.short ? "SCH" : "TS") : out === "HO" ? "SM" : out === "SS" || out === "LE" ? "SCH" : "BL"; }
    const from = last ? last.to : [ED.from];
    const side = from.length === 1 && from[0] !== "MI" ? from[0] : "*";
    ED.steps.push({ st, side: st === "SM" ? "VH" : side, to: ["RH"], short: false });
    ED.dirty = true;
  }
  function edStepClick(e) {
    const b = e.target.closest("button"); if (!b) return;
    const i = +b.dataset.i, x = ED.steps[i];
    if (b.dataset.act === "rm") { ED.steps.splice(i, 1); }
    else if (b.dataset.act === "side") { x.side = b.dataset.v; }
    else if (b.dataset.act === "zone") { const z = b.dataset.v, k = x.to.indexOf(z); if (k >= 0) { if (x.to.length > 1) x.to.splice(k, 1); } else x.to.push(z); x.to.sort((a, c) => ["VH", "MI", "RH"].indexOf(a) - ["VH", "MI", "RH"].indexOf(c)); }
    else if (b.dataset.act === "short") { x.short = !x.short; }
    else return;
    ED.dirty = true; edRefresh();
  }
  function edRefresh() {
    const el = $("#editor");
    $("#ed-from-wrap", el).classList.toggle("hidden", ED.end === "loop");
    const h = handsFor(0), nm = namesFor(0);
    $("#ed-steps", el).innerHTML = ED.steps.map((x, i) => {
      const who = edHitter(i), name = who === "A" ? nm.A : nm.B;
      const opts = STROKE_GROUPS.filter(([g]) => !(g.startsWith("Aufschlag") && (i > 0 || ED.end === "loop"))).map(([g, list]) =>
        `<optgroup label="${g}">${list.map((k) => `<option value="${k}" ${k === x.st ? "selected" : ""}>${esc(E.STROKES[k].name.charAt(0).toUpperCase() + E.STROKES[k].name.slice(1))}</option>`).join("")}</optgroup>`).join("");
      const serve = E.STROKES[x.st].serve;
      const sides = (serve ? [["VH", "Vorhand"], ["RH", "Rückhand"]] : [["VH", "Vorhand"], ["RH", "Rückhand"], ["*", "passend"]])
        .map(([v, t]) => `<button type="button" class="seg-btn ${x.side === v ? "active" : ""}" data-act="side" data-i="${i}" data-v="${v}">${t}</button>`).join("");
      const zones = [["VH", "VH"], ["MI", "Mitte"], ["RH", "RH"]].map(([v, t]) => `<button type="button" class="chip ${x.to.includes(v) ? "active" : ""}" data-act="zone" data-i="${i}" data-v="${v}">${t}</button>`).join("");
      return `<div class="ed-step"><div class="ed-step-head"><span class="seq-no ${who === "A" ? "a" : "b"}">${i + 1}</span><strong>${esc(name)}</strong>${ED.steps.length > 1 ? `<button class="icon-action" data-act="rm" data-i="${i}" aria-label="Schritt löschen">✕</button>` : ""}</div>
        <select data-st="${i}" aria-label="Schlag">${opts}</select>
        <div class="seg">${sides}</div>
        <p class="ed-row-label">Ziel beim ${who === "A" ? "Partner" : "aktiven Spieler"}</p>
        <div class="zone-chips">${zones}<button type="button" class="chip short ${x.short ? "active" : ""}" data-act="short" data-i="${i}">kurz</button></div></div>`;
    }).join("");
    const rec = edRecord(), chk = edCheck(rec);
    const items = chk.errs.length ? chk.errs.map((m) => `<li class="err">${esc(m)}</li>`) : [`<li class="ok">Ablauf ist stimmig (Schnitt, Länge, Seite und Laufweg passen)</li>`];
    if (chk.same) items.push(`<li class="info">Entspricht der vorhandenen Übung „${esc(chk.same)}“</li>`);
    $("#ed-check", el).innerHTML = items.join("");
    let desc = "";
    try { const d = E.describe(chk.ex, h, nm); desc = d.lines.map((l) => `<li><strong>${esc(l.name)}:</strong> ${esc(l.stroke)} – ${esc(l.target)}</li>`).join("") + `<li class="muted">${esc(d.tail)}</li>`; } catch (e) { desc = ""; }
    $("#ed-desc", el).innerHTML = desc;
    try {
      $("#ed-preview", el).innerHTML = diagramSVG(chk.ex, h, nm) + `<div class="diagram-legend"><span><b style="background:${COL_A}"></b>${esc(nm.A)} (aktiv)</span><span><b style="background:${COL_B}"></b>${esc(nm.B)}</span></div>`;
      playAnim($(".diagram", el), chk.ex, h);
    } catch (e) { $("#ed-preview", el).innerHTML = `<p class="swap-hint">Vorschau nicht möglich</p>`; }
  }
  function edSave() {
    const rec = edRecord(), chk = edCheck(rec);
    const doSave = () => {
      rec.upd = Date.now();
      const k = S.custom.findIndex((c) => c.id === rec.id);
      if (k >= 0) S.custom[k] = rec; else S.custom.push(rec);
      delete S.dur[rec.id];
      save(); thumbCache.clear(); ED.saved = true;
      renderLib(); renderDiceRes();
      toast("Übung gespeichert");
    };
    if (!rec.name || !ED.name.trim()) { toast("Bitte einen Namen eingeben"); $("#ed-name").focus(); return; }
    if (chk.errs.length) {
      sheet(`<div class="sheet-head"><h2>Prüfung nicht bestanden</h2></div><p class="lead">${chk.errs.length} Hinweis${chk.errs.length > 1 ? "e" : ""}: ${esc(chk.errs[0])}${chk.errs.length > 1 ? " …" : ""}</p>
        <div class="stack"><button class="fire-btn" data-close>Weiter bearbeiten</button><button class="secondary-btn" id="ed-force">Trotzdem speichern</button></div>`, (el) => {
        $("#ed-force", el).onclick = () => { doSave(); history.go(-2); };
      });
      return;
    }
    doSave(); back();
  }
  function deleteCustom(id) {
    const c = S.custom.find((x) => x.id === id); if (!c) return;
    sheet(`<div class="sheet-head"><h2>„${esc(c.name)}“ löschen?</h2></div><p class="lead">Die Übung verschwindet auch aus Einheiten und Plänen. Gespeicherte Trainingszeiten bleiben.</p>
      <div class="stack"><button class="secondary-btn danger" id="dc-yes">Löschen</button><button class="fire-btn" data-close>Abbrechen</button></div>`, (el) => {
      $("#dc-yes", el).onclick = () => {
        S.custom = S.custom.filter((x) => x.id !== id);
        if (!S.delEx.includes(id)) S.delEx.push(id);
        S.favs = S.favs.filter((x) => x !== id);
        S.diceRes = S.diceRes.filter((x) => x !== id);
        S.units.forEach((u) => { u.ex = u.ex.filter((x) => x !== id); });
        Object.values(S.plan).forEach((p) => { p.ex = p.ex.filter((x) => x !== id); });
        delete S.dur[id]; customCache.delete(id);
        save(); history.go(-2); renderLib(); renderDiceRes(); renderPlan(); toast("Gelöscht");
      };
    });
  }

  // ------------------------------------------------------------------ Live-Training
  let LIVE = null, livePoll = 0;
  function liveSend(o) {
    if (!LIVE) return false;
    let ok = 0;
    try { ok = BTB().send(JSON.stringify(o)); } catch (e) { ok = 0; }
    if (ok !== 1) { liveLost(); return false; }
    return true;
  }
  function liveSnap() {
    return { t: "st", lid: RUN.lid, i: RUN.i, phase: RUN.phase, dur: RUN.dur, rem: remaining(), paused: RUN.paused,
      done: RUN.done.map((d) => ({ id: d.id, pid: d.pid, sec: d.sec })) };
  }
  function liveSnapSend() { if (RUN && RUN.live && LIVE && RUN.phase !== "done") liveSend(liveSnap()); }
  function liveStart(useAlias) {
    LIVE = { name: "Partner", alias: useAlias };
    clearInterval(livePoll); livePoll = setInterval(liveTick, 120);
    liveSend({ t: "hello", sync: syncPayload(useAlias) });
    renderLiveBar();
  }
  function liveTick() {
    const b = BTB();
    if (!b || !LIVE) return;
    for (let k = 0; k < 50 && LIVE; k++) {
      let m = null;
      try { m = b.recv(); } catch (e) { m = null; }
      if (m == null) break;
      let o;
      try { o = JSON.parse(m); } catch (e) { continue; }
      try { liveHandle(o); } catch (e) { console.error(e); }
    }
    if (!LIVE) return;
    let st = "";
    try { st = b.status() || ""; } catch (e) { st = ""; }
    if (st !== "live") liveLost();
  }
  function liveEnd(msg) {
    const n = LIVE ? LIVE.name : "Partner";
    LIVE = null; clearInterval(livePoll); livePoll = 0;
    const b = BTB(); if (b) { try { b.stop(); } catch (e) { /* egal */ } }
    renderLiveBar();
    if (RUN && RUN.phase !== "done") renderRun();
    toast(msg.replace("%s", n));
  }
  const liveLost = () => { if (LIVE) liveEnd("Live-Verbindung zu %s getrennt"); };
  function liveStop() { if (LIVE) { liveSend({ t: "bye" }); liveEnd("Live-Verbindung beendet"); } }
  function closeRunNow() {
    const idx = stack.lastIndexOf(runBack);
    if (!RUN) return;
    RUN.closing = true;
    if (idx >= 0) history.go(-(stack.length - idx)); else closeRun();
  }
  function liveHandle(o) {
    if (o.t === "hello") {
      try { applySync(o.sync, LIVE.alias); } catch (e) { toast("Abgleich fehlgeschlagen: " + (e.message || e)); }
      LIVE.name = pName(1);
      renderLiveBar();
      toast(`Live verbunden mit ${LIVE.name}`);
    } else if (o.t === "start") {
      if (RUN && RUN.phase !== "done") { toast(`${LIVE.name} hat ein Training gestartet – erst dieses beenden`); return; }
      if (RUN) { RUN.closing = true; backThen(() => startRun(null, null, 0, o)); }
      else startRun(null, null, 0, o);
    } else if (o.t === "st") {
      if (!RUN || RUN.lid !== o.lid || RUN.phase === "done") return;
      const before = RUN.phase + RUN.i;
      RUN.i = Math.max(0, Math.min(RUN.q.length - 1, o.i | 0));
      RUN.phase = o.phase; RUN.dur = o.dur; RUN.paused = !!o.paused; RUN.lastBeep = -1;
      if (RUN.paused) RUN.rem = o.rem; else RUN.end = Date.now() + o.rem * 1000;
      RUN.done = (o.done || []).map((d) => ({ id: d.id, pid: d.pid, p: d.pid === myId() ? 0 : 1, sec: d.sec }));
      if (before !== RUN.phase + RUN.i && RUN.phase === "work") startSignal();
      renderRun();
    } else if (o.t === "end") {
      if (o.entry && o.entry.lid) {
        const k = S.log.findIndex((l) => l.lid === o.entry.lid);
        if (k >= 0) S.log[k] = o.entry; else S.log.push(o.entry);
        save(); renderPlan(); renderStats();
      }
      if (RUN && RUN.lid === o.lid) {
        if (RUN.phase !== "done" && o.entry) { endSignal(); finishRun(o.entry); }
        else if (RUN.phase !== "done") { toast(`${LIVE.name} hat das Training beendet`); closeRunNow(); }
        else if (o.entry) finishRun(o.entry);
      }
    } else if (o.t === "quit") {
      if (RUN && RUN.lid === o.lid && RUN.phase !== "done") { toast(`${LIVE.name} hat das Training ohne Speichern beendet`); closeRunNow(); }
    } else if (o.t === "bye") {
      liveEnd("%s hat die Live-Verbindung beendet");
    }
  }
  function renderLiveBar() {
    const bar = $("#live-bar");
    bar.classList.toggle("hidden", !LIVE);
    if (LIVE) bar.innerHTML = `<span class="sy-dot"></span><span class="lb-txt"><b>Live mit ${esc(LIVE.name)}</b> · Trainings starten auf beiden Handys</span><button class="lb-btn" id="lb-stop">Trennen</button>`;
    const btn = $("#lb-stop"); if (btn) btn.onclick = liveStop;
    $("#players-btn").classList.toggle("is-live", !!LIVE);
    $("#live-btn2").textContent = LIVE ? `ᛒ Live mit ${LIVE.name} – Verbindung verwalten` : "ᛒ Zu zweit mit zwei Handys? Live verbinden";
    $("#live-btn").textContent = LIVE ? `ᛒ Live mit ${LIVE.name} – Verbindung verwalten` : "ᛒ Live-Training verbinden (beide Handys zeigen dasselbe)";
  }

  // ------------------------------------------------------------------ Abgleich per Code (auch iPhone <-> Android)
  const HAS_BT = !!window.TTBT;
  const b64u = {
    enc(bytes) {
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    dec(str) {
      str = str.replace(/-/g, "+").replace(/_/g, "/");
      while (str.length % 4) str += "=";
      const bin = atob(str), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    },
  };
  async function packCode(txt) {
    const raw = new TextEncoder().encode(txt);
    if (window.CompressionStream) {
      try {
        const out = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer();
        return "TTS1:" + b64u.enc(new Uint8Array(out));
      } catch (e) { /* ohne Kompression */ }
    }
    return "TTS0:" + b64u.enc(raw);
  }
  async function unpackCode(text) {
    const m = /TTS([01]):([A-Za-z0-9_-]+)/.exec((text || "").replace(/\s+/g, ""));
    if (!m) throw new Error("Kein gültiger Code gefunden. Der Code beginnt mit „TTS“.");
    let bytes;
    try { bytes = b64u.dec(m[2]); } catch (e) { throw new Error("Der Code ist unvollständig."); }
    if (m[1] === "1") {
      if (!window.DecompressionStream) throw new Error("Dieses Gerät kann den Code nicht entpacken (Software zu alt).");
      try { bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()); }
      catch (e) { throw new Error("Der Code ist unvollständig oder beschädigt."); }
    }
    return new TextDecoder().decode(bytes);
  }
  async function copyText(txt, ta) {
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(txt); ok = true; } } catch (e) { ok = false; }
    if (!ok) {
      const t = ta || document.createElement("textarea");
      if (!ta) { t.value = txt; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); }
      t.focus(); t.select();
      try { t.setSelectionRange(0, txt.length); } catch (e) { /* egal */ }
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      if (!ta) t.remove();
    }
    return ok;
  }
  function codeSheet() {
    let useAlias = true;
    const ph = placeholderHasLogs();
    sheet(`<div class="sheet-head"><h2>⇄ Abgleich per Code</h2><button class="icon-action" data-close aria-label="Schließen">✕</button></div>
      <p class="lead">Geht zwischen allen Handys, auch iPhone und Android. Jeder schickt dem anderen seinen Code, zum Beispiel per WhatsApp, und fügt den Code des anderen hier ein.</p>
      ${ph ? `<label class="switch-row"><span>Bisherige Trainings mit „${esc(pName(1))}“ dem Partner zuordnen, von dem der Code kommt</span><span class="switch"><input type="checkbox" id="cd-alias" checked><i></i></span></label>` : ""}
      <h3>1. Deinen Code schicken</h3>
      <button class="fire-btn" id="cd-make">${navigator.share ? "Code teilen …" : "Code kopieren"}</button>
      <textarea id="cd-out" class="code-out hidden" readonly></textarea>
      <p class="muted small" id="cd-info"></p>
      <h3>2. Code vom Partner einfügen</h3>
      <label class="field"><textarea id="cd-in" class="code-in" placeholder="Code hier einfügen (beginnt mit TTS…)" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></label>
      <div class="row-buttons">${navigator.clipboard && navigator.clipboard.readText && window.isSecureContext ? `<button class="secondary-btn" id="cd-paste">Einfügen</button>` : ""}<button class="fire-btn" id="cd-apply">Übernehmen</button></div>
      <div id="cd-res"></div>`, (el) => {
      const al = $("#cd-alias", el);
      if (al) al.onchange = (e) => { useAlias = e.target.checked; };
      $("#cd-make", el).onclick = async () => {
        const code = await packCode(syncPayload(useAlias));
        const msg = `TT Training – Abgleich-Code von ${pName(0)}:\n${code}`;
        const out = $("#cd-out", el);
        out.value = msg;
        let done = false;
        if (navigator.share) {
          try { await navigator.share({ text: msg }); done = true; $("#cd-info", el).textContent = "Geteilt. Dein Partner fügt den Code bei sich unter „Abgleich per Code“ ein."; }
          catch (e) { done = e && e.name === "AbortError"; }
        }
        if (!done) {
          out.classList.remove("hidden");
          const ok = await copyText(msg, out);
          $("#cd-info", el).textContent = ok ? "Kopiert. Jetzt z. B. in WhatsApp einfügen und an deinen Partner schicken."
            : "Kopieren nicht möglich – bitte den Text oben lange antippen und kopieren.";
        }
      };
      const pb = $("#cd-paste", el);
      if (pb) pb.onclick = async () => {
        try { $("#cd-in", el).value = await navigator.clipboard.readText(); } catch (e) { toast("Bitte lange in das Feld tippen → Einfügen"); }
      };
      $("#cd-apply", el).onclick = async () => {
        const res = $("#cd-res", el);
        let r;
        try {
          const txt = await unpackCode($("#cd-in", el).value);
          r = applySync(txt, useAlias);
        } catch (e) {
          res.innerHTML = `<p class="small err-text">${esc(e.message || e)}</p>`;
          return;
        }
        const parts = [r.added ? `${r.added} neue${r.added === 1 ? "s" : ""} Training${r.added === 1 ? "" : "s"} übernommen` : "Alles war schon auf dem neuesten Stand"];
        if (r.exNew) parts.push(`${r.exNew} eigene Übung${r.exNew === 1 ? "" : "en"} von ${r.name} dazugekommen`);
        res.innerHTML = `<div class="sy-done"><div class="big">✓</div><h3>Abgleich mit ${esc(r.name)} fertig</h3><p>${esc(parts.join(" · "))}.</p>
          <p class="muted small">Damit ${esc(r.name)} auch deine Trainings bekommt, schick ihm deinen Code (Schritt 1).</p></div>`;
        $("#cd-in", el).value = "";
        const al2 = $("#cd-alias", el); if (al2) al2.closest(".switch-row").remove();
      };
    });
  }

  // ------------------------------------------------------------------ Web-App (iPhone): Bildschirm wach, Installation
  let wake = null;
  async function requestWake() {
    if (HAS_BT || !navigator.wakeLock) return;
    try { wake = await navigator.wakeLock.request("screen"); } catch (e) { wake = null; }
  }
  function releaseWake() { try { if (wake) wake.release(); } catch (e) { /* egal */ } wake = null; }
  const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const STANDALONE = !!(navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches));
  function renderInstallHint() {
    const box = $("#install-hint");
    if (!box) return;
    const show = !HAS_BT && IS_IOS && !STANDALONE && !S.iosHintHidden;
    box.classList.toggle("hidden", !show);
    if (show) {
      box.innerHTML = `<div><strong>App aufs iPhone holen</strong><br><span class="small">Unten auf <b>Teilen</b> <span class="share-ico">⬆︎</span> tippen, dann <b>„Zum Home-Bildschirm“</b>. Danach läuft die App offline direkt auf dem iPhone.</span></div><button class="icon-action" id="ih-x" aria-label="Ausblenden">✕</button>`;
      $("#ih-x").onclick = () => { S.iosHintHidden = true; save(); renderInstallHint(); };
    }
  }

  // ------------------------------------------------------------------ Tabs & Start
  function showTab(id) {
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === id));
    $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + id));
    if (id === "plan") renderPlan();
    if (id === "stats") renderStats();
    window.scrollTo(0, 0);
  }
  function init() {
    applyTheme();
    history.replaceState({ d: 0 }, "");
    $("#tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) showTab(b.dataset.tab); });
    $("#players-btn").addEventListener("click", () => playersSheet(false));
    $("#settings-btn").addEventListener("click", settingsSheet);
    $("#sync-btn").addEventListener("click", () => syncSheet("sync"));
    $("#live-btn").addEventListener("click", () => syncSheet("live"));
    $("#live-btn2").addEventListener("click", () => syncSheet("live"));
    $("#code-btn").addEventListener("click", codeSheet);
    if (!HAS_BT) {
      ["#sync-btn", "#live-btn", "#live-btn2"].forEach((q) => $(q).classList.add("hidden"));
      $("#code-btn").className = "fire-btn wide top-gap";
    }
    renderInstallHint();
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(() => {});
    if (!HAS_BT && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    $("#stat-who").addEventListener("click", (e) => { const b = e.target.closest("[data-who]"); if (b) { S.statsFor = b.dataset.who; save(); renderStats(); } });
    renderPlayersLabel();
    initLib(); initDice(); initPlan(); renderStats();
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopAnim(); else if (RUN && RUN.phase !== "done") { renderRun(); requestWake(); } else if (detailEx) renderDetail(); });
    if (!S.onboarded) playersSheet(true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
