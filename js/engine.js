/* TT Training – Übungs-Engine: Schlagfolgen lesen, prüfen, beschreiben, zeichnen.
   Wird von der App und vom Prüfskript (Node) gemeinsam benutzt. */
(function (root) {
  "use strict";

  const GOALS = [
    { id: "kontrolle", name: "Kontrolle", desc: "Sicherheit und Rhythmus: konstante Bälle ohne leichte Fehler" },
    { id: "bein", name: "Beinarbeit", desc: "Laufwege, Sidestep, Umlaufen und Rückfedern" },
    { id: "eroeffnung", name: "Eröffnung", desc: "Topspin gegen Unterschnitt und das Nachziehen danach" },
    { id: "aufschlag", name: "Aufschlag & Rückschlag", desc: "Die ersten drei Bälle: Aufschlag, Annahme, dritter Ball" },
    { id: "kurz", name: "Kurzes Spiel", desc: "Ablegen, Flip und das Spiel über dem Tisch" },
    { id: "tempo", name: "Tempo & Gegenspiel", desc: "Block, Konter, Gegenziehen und Steigerung" },
    { id: "abwehr", name: "Abwehr", desc: "Unterschnitt-Abwehr, Ballon und das Spiel dagegen" },
    { id: "spielnah", name: "Spielnähe", desc: "Unregelmäßige Abläufe und freies Spiel wie im Wettkampf" },
  ];
  const LEVELS = ["", "Leicht", "Mittel", "Schwer"];

  // out: Schnitt, den der Ball danach hat. on: erlaubter ankommender Schnitt.
  // len: "short" = ankommender Ball muss kurz sein, "long" = muss lang sein.
  // tgt: "short"/"long" = wohin der Schlag gespielt werden muss.
  const STROKES = {
    "AS-US": { name: "Unterschnitt-Aufschlag", out: "US", serve: true },
    "AS-SS": { name: "Seitschnitt-Aufschlag", out: "SS", serve: true },
    "AS-OS": { name: "schneller Oberschnitt-Aufschlag", out: "OS", serve: true, tgt: "long" },
    "AS-LE": { name: "Aufschlag ohne Schnitt", out: "LE", serve: true },
    SCH: { name: "Schupf", out: "US", on: ["US", "SS", "LE"], starter: true },
    ABL: { name: "kurz ablegen", out: "US", on: ["US", "SS", "LE"], len: "short", tgt: "short" },
    FL: { name: "Flip", out: "OS", on: ["US", "SS", "LE"], len: "short", tgt: "long" },
    TS: { name: "Topspin", out: "OS", on: ["US", "SS", "LE", "OS"], len: "long", tgt: "long" },
    KO: { name: "Konter", out: "OS", on: ["OS", "LE"], len: "long", tgt: "long", starter: true },
    BL: { name: "Block", out: "OS", on: ["OS"], len: "long", tgt: "long" },
    AB: { name: "Unterschnitt-Abwehr", out: "US", on: ["OS"], len: "long", tgt: "long" },
    BA: { name: "Ballon", out: "HO", on: ["OS"], len: "long", tgt: "long" },
    SM: { name: "Schmetterball", out: "OS", on: ["HO"], len: "long", tgt: "long" },
  };
  const ZONE_NAME = { VH: "die Vorhand", RH: "die Rückhand", MI: "die Mitte (Ellbogen)" };
  const ZONE_SHORT = { VH: "VH", RH: "RH", MI: "Mitte" };

  const STEP_RE = /^(A|B) (VH|RH|\*)-(AS-US|AS-SS|AS-OS|AS-LE|SCH|ABL|FL|TS|KO|BL|AB|BA|SM)(?:@(VH|MI|RH))?>([A-Zk|]+)$/;

  function parseStep(s) {
    const m = STEP_RE.exec(s.trim());
    if (!m) throw new Error("Schritt nicht lesbar: " + s);
    const to = m[5].split("|").map((t) => {
      const mm = /^(VH|MI|RH)(k?)$/.exec(t);
      if (!mm) throw new Error("Ziel nicht lesbar: " + s);
      return { z: mm[1], short: mm[2] === "k" };
    });
    return { p: m[1], side: m[2], st: m[3], from: m[4] || null, to, raw: s };
  }

  function parse(ex) {
    if (ex._steps) return ex._steps;
    ex._steps = ex.s.map(parseStep);
    return ex._steps;
  }

  // ---------------------------------------------------------------------
  // Prüfung
  // ---------------------------------------------------------------------
  function sideOk(side, zone) {
    if (side === "*") return { ok: true };
    if (side === "RH" && zone === "VH") return { ok: false, why: "Rückhand aus der Vorhand-Ecke" };
    if (side === "VH" && zone === "RH") return { ok: true, around: true };
    return { ok: true };
  }

  function validate(ex) {
    const errs = [];
    let steps;
    try { steps = parse(ex); } catch (e) { return [e.message]; }
    const n = steps.length;
    if (!n) return ["keine Schritte"];
    if (!GOALS.some((g) => g.id === ex.goal)) errs.push("unbekanntes Ziel " + ex.goal);
    if (![1, 2, 3].includes(ex.lv)) errs.push("Stufe fehlt");
    if (!["loop", "frei", "neu"].includes(ex.end)) errs.push("Ende fehlt");
    for (let i = 1; i < n; i++) if (steps[i].p === steps[i - 1].p) errs.push(`Schritt ${i + 1}: gleicher Spieler zweimal`);
    if (ex.end === "loop") {
      if (n % 2) errs.push("Schleife mit ungerader Länge");
      if (steps[0].p === steps[n - 1].p) errs.push("Schleife schließt nicht");
    } else {
      const f = steps[0];
      const S = STROKES[f.st];
      if (!S.serve && !S.starter) errs.push("Ablauf beginnt nicht mit Aufschlag oder Zuspiel");
      if (!f.from) errs.push("Startposition (@) fehlt");
    }
    steps.forEach((st, i) => {
      const S = STROKES[st.st];
      if (S.serve && i !== 0) errs.push(`Schritt ${i + 1}: Aufschlag mitten im Ballwechsel`);
      if (S.serve && ex.end === "loop") errs.push("Aufschlag in einer Schleife");
      for (const t of st.to) {
        if (S.tgt === "long" && t.short) errs.push(`Schritt ${i + 1}: ${S.name} kann nicht kurz sein`);
        if (S.tgt === "short" && !t.short) errs.push(`Schritt ${i + 1}: ${S.name} muss kurz sein`);
      }
      if (S.serve && st.side === "*") errs.push(`Schritt ${i + 1}: Aufschlagseite fehlt`);
      // ankommender Ball
      let prev = null;
      if (i > 0) prev = steps[i - 1];
      else if (ex.end === "loop") prev = steps[n - 1];
      if (!prev) {
        const z = st.from;
        const so = sideOk(st.side, z);
        if (!so.ok) errs.push(`Schritt ${i + 1}: ${so.why}`);
        return;
      }
      if (st.from) errs.push(`Schritt ${i + 1}: Startposition nur beim ersten Ball`);
      const PS = STROKES[prev.st];
      for (const t of prev.to) {
        if (S.on && !S.on.includes(PS.out)) errs.push(`Schritt ${i + 1}: ${S.name} passt nicht auf ${PS.name}`);
        if (S.len === "short" && !t.short) errs.push(`Schritt ${i + 1}: ${S.name} braucht einen kurzen Ball`);
        if (S.len === "long" && t.short) errs.push(`Schritt ${i + 1}: ${S.name} auf kurzen Ball`);
        const so = sideOk(st.side, t.z);
        if (!so.ok) errs.push(`Schritt ${i + 1}: ${so.why}`);
      }
      if (prev.to.length > 1 && st.side !== "*" && st.side !== "VH") {
        if (prev.to.some((t) => t.z === "VH")) errs.push(`Schritt ${i + 1}: feste Seite nach unregelmäßigem Ball`);
      }
    });
    if (!ex.name || !ex.d || !ex.t) errs.push("Text fehlt");
    return errs;
  }

  // Abgeleitete Eigenschaften
  function meta(ex) {
    if (ex._meta) return ex._meta;
    const steps = parse(ex);
    const irregular = steps.some((s) => s.to.length > 1);
    const ablauf = irregular ? "unreg" : ex.end === "frei" ? "frei" : "reg";
    const sides = new Set();
    steps.filter((s) => s.p === "A" && !STROKES[s.st].serve).forEach((s) => {
      if (s.side === "*") { sides.add("VH"); sides.add("RH"); } else sides.add(s.side);
    });
    const side = sides.size === 1 ? [...sides][0] : "beide";
    ex._meta = { ablauf, side, dur: ex.dur || 5 };
    return ex._meta;
  }
  const ABLAUF_NAME = { reg: "regelmäßig", unreg: "unregelmäßig", frei: "mit freiem Spiel" };

  // ---------------------------------------------------------------------
  // Geometrie (Draufsicht, aktiver Spieler unten)
  // ---------------------------------------------------------------------
  const G = { w: 200, h: 320, tx: 25, ty: 30, tw: 150, tl: 260 };
  G.net = G.ty + G.tl / 2;

  // x-Anteil der Zone für einen Spieler (unten/oben, Rechts-/Linkshänder)
  function zoneX(z, bottom, lefty) {
    let f = z === "MI" ? 0.5 : z === "VH" ? 0.8 : 0.2; // unten, Rechtshänder: VH rechts
    if (!bottom) f = 1 - f;
    if (lefty) f = 1 - f;
    return G.tx + G.tw * f;
  }
  function landY(bottom, short) {
    if (bottom) return short ? G.net + 34 : G.ty + G.tl - 26;
    return short ? G.net - 34 : G.ty + 26;
  }
  function hitY(bottom, short) {
    if (bottom) return short ? G.net + 58 : G.ty + G.tl + 12;
    return short ? G.net - 58 : G.ty - 12;
  }

  // Bahnen für einen Durchlauf. hands: { A: 'R'|'L', B: 'R'|'L' }
  function paths(ex, hands) {
    const steps = parse(ex);
    const n = steps.length;
    const lastTo = ex.end === "loop" ? steps[n - 1].to : null;
    const out = [];
    steps.forEach((st, i) => {
      const bottom = st.p === "A"; // A steht unten
      const fromOpts = i === 0 ? (lastTo || [{ z: st.from, short: false }]) : steps[i - 1].to;
      const recvLefty = (bottom ? hands.B : hands.A) === "L";
      const hitLefty = (bottom ? hands.A : hands.B) === "L";
      const serve = STROKES[st.st].serve;
      const segs = [];
      for (const f of fromOpts) {
        for (const t of st.to) {
          const x1 = zoneX(f.z, bottom, hitLefty);
          const y1 = serve ? (bottom ? G.ty + G.tl + 10 : G.ty - 10) : hitY(bottom, f.short);
          const x2 = zoneX(t.z, !bottom, recvLefty);
          const y2 = landY(!bottom, t.short);
          segs.push({ x1, y1, x2, y2, from: f, to: t });
        }
      }
      out.push({ step: st, idx: i, segs, active: bottom });
    });
    return out;
  }

  function direction(seg, bottom) {
    if (seg.from.z === "MI" || seg.to.z === "MI") return "";
    const left1 = seg.x1 < G.tx + G.tw / 2;
    const left2 = seg.x2 < G.tx + G.tw / 2;
    return left1 === left2 ? "parallel" : "diagonal";
  }

  // ---------------------------------------------------------------------
  // Beschreibung
  // ---------------------------------------------------------------------
  function strokeLabel(st, prev, fromZones) {
    const S = STROKES[st.st];
    const sidePre = st.side === "*" ? "" : st.side + "-";
    let name = S.name;
    if (st.st === "TS" && prev) {
      if (prev.st === "TS") name = "Topspin (gegenziehen)";
      else if (["US", "SS", "LE"].includes(STROKES[prev.st].out)) name = "Topspin gegen Unterschnitt";
    }
    let qual = "";
    if (st.st === "SCH") {
      const allShort = st.to.every((t) => t.short);
      const fromShort = fromZones && fromZones.every((f) => f.short);
      if (allShort) qual = " (kurz)";
      else if (fromShort && !st.to.some((t) => t.short)) qual = " (lang)";
    }
    if (S.serve) {
      const sh = st.to.every((t) => t.short), lg = st.to.every((t) => !t.short);
      const pre = st.st === "AS-OS" ? "" : sh ? "kurzer " : lg ? "langer " : "";
      name = pre + S.name + (st.side === "RH" ? " mit der Rückhand" : "");
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    const verb = st.st === "ABL";
    if (st.side === "*") {
      const base = verb ? "Kurz ablegen" : name + qual;
      return base + " (VH oder RH)";
    }
    let around = "";
    if (st.side === "VH" && fromZones && fromZones.every((f) => f.z === "RH")) around = " – umlaufen";
    return (verb ? st.side + " " + name : sidePre + name + qual) + around;
  }

  function targetText(st, dir) {
    const t = st.to;
    if (t.length > 1) {
      const zs = t.map((x) => (x.short ? "kurz " : "") + ZONE_SHORT[x.z]);
      return "unregelmäßig: " + zs.join(" / ");
    }
    const x = t[0];
    return (dir ? dir + " " : "") + (x.short ? "kurz " : "") + "in " + ZONE_NAME[x.z];
  }

  function describe(ex, hands, names) {
    const steps = parse(ex);
    const P = paths(ex, hands);
    const n = steps.length;
    const lines = steps.map((st, i) => {
      const prev = i > 0 ? steps[i - 1] : ex.end === "loop" ? steps[n - 1] : null;
      const fromZones = i > 0 ? steps[i - 1].to : ex.end === "loop" ? steps[n - 1].to : [{ z: st.from, short: false }];
      const seg = P[i].segs[0];
      const dir = st.to.length === 1 && fromZones.length === 1 ? direction(seg, st.p === "A") : "";
      let where = "";
      if (i === 0 && st.from && STROKES[st.st].serve) where = st.from === "MI" ? " (aus der Mitte)" : st.from === "VH" ? " (aus der Vorhand-Seite)" : " (aus der Rückhand-Seite)";
      return { who: st.p, name: st.p === "A" ? names.A : names.B, stroke: strokeLabel(st, prev, fromZones) + where, target: targetText(st, dir) };
    });
    let tail = "";
    if (ex.end === "loop") tail = "Dann beginnt der Ablauf von vorn.";
    else if (ex.end === "frei") tail = "Danach wird der Ballwechsel frei ausgespielt.";
    else tail = "Ball fangen, kurz durchatmen und neu beginnen.";
    return { lines, tail };
  }

  // Kanonische Form zum Finden doppelter Übungen (inkl. Rollentausch und Drehung)
  function signature(ex) {
    const steps = parse(ex).map((s) => `${s.p} ${s.side}-${s.st}${s.from ? "@" + s.from : ""}>${s.to.map((t) => t.z + (t.short ? "k" : "")).join("|")}`);
    const variants = [];
    const swap = (arr) => arr.map((s) => (s[0] === "A" ? "B" : "A") + s.slice(1));
    const base = [steps, swap(steps)];
    for (const b of base) {
      if (ex.end === "loop") for (let r = 0; r < b.length; r++) variants.push(b.slice(r).concat(b.slice(0, r)).join(";"));
      else variants.push(b.join(";") + "#" + ex.end);
    }
    return variants;
  }

  const api = { GOALS, LEVELS, STROKES, ZONE_NAME, ABLAUF_NAME, G, parse, validate, meta, paths, describe, signature, direction };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TTEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
