"use strict";
/* ====================================================================
   巡視記録アプリ（モックアップ） v0.1
   - 同じフォルダの zyunshi.json を読み込んで動作（fetch）。読めない環境（file:// 等）ではファイル選択で代替
   - 入力は端末内（localStorage）に自動保存。「保存」でセッションJSONを書き出す（元のJSONは書き換えない）
   ==================================================================== */
const APP_VER = "mock-0.1";
const JSON_NAMES = ["zyunshi.json", "substation_patrol_all.json"];

/* ---------- util ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const hw = (s) =>
  s == null
    ? ""
    : String(s).replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) - 0xfee0),
      );
const tidy = (s) =>
  hw(s)
    .replace(/[\s\u3000]+/g, " ")
    .trim();
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fyOf = (s) => {
  const [y, m] = s.split("-").map(Number);
  return m >= 4 ? y : y - 1;
};
const monthOf = (s) => +s.split("-")[1];
const halfOf = (s) => {
  const m = monthOf(s);
  return m >= 4 && m <= 9 ? "H1" : "H2";
};
const halfJp = (h) => (h === "H1" ? "上期" : "下期");
const wdOf = (s) => "日月火水木金土"[new Date(s + "T00:00:00").getDay()];
const md = (s) => {
  const [, m, d] = s.split("-").map(Number);
  return `${m}/${d}`;
};
const jd = (s) => `${s.slice(0, 4)}/${md(s)}(${wdOf(s)})`;
const fmt = (n, d = 3) =>
  n == null || Number.isNaN(n)
    ? "–"
    : Number(n).toLocaleString("ja-JP", { maximumFractionDigits: d });
const sgn = (n) => (n >= 0 ? "+" : "") + fmt(n);
const clone = (o) => JSON.parse(JSON.stringify(o));
const nowHM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
function parseNum(s) {
  if (s == null || s === "") return null;
  const t = hw(String(s)).replace(/[,\s]/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
}

/* ---------- storage ---------- */
const K = {
  draft: "patrolApp.draft.v1",
  sessions: "patrolApp.sessions.v1",
  dev: "patrolApp.dev",
  demo: "patrolApp.demo",
  insp: "patrolApp.lastInspector",
};
const ls = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      return false;
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
  },
};
const DEV = (() => {
  let d = ls.get(K.dev, null);
  if (!d) {
    d = "iph" + (Math.floor(Math.random() * 90) + 10);
    ls.set(K.dev, d);
  }
  return d;
})();

/* ---------- state ---------- */
let DATA = null,
  SRC = "",
  IDX = {};
const S = {
  tab: "home",
  trend: "meas",
  trendItem: null,
  pMeter: "3",
  pFY: null,
  draft: null,
  waType: "number",
};
const M = () => DATA.master;

/* ---------- demo（架空の重点項目） ---------- */
const DEMO = {
  items: [
    {
      watchItemId: "PW-DEMO-01",
      _demo: true,
      priorityKind: "other",
      target: { equipmentId: 8489, name: "６１ＣＢ", part: null },
      label: "ガス圧",
      valueType: "number",
      unit: "MPa",
      decimals: 2,
      choiceSetId: null,
      criteria: null,
      periods: [
        {
          startDate: "2025-10-15",
          startedBy: "巡視者A",
          startReason:
            "定期巡視でガス圧の低下傾向を確認。トレンド監視のため追加",
          endDate: null,
          endedBy: null,
          endReason: null,
        },
      ],
      displayOrder: 1,
      legacy: { inputClass: null, slot: null },
    },
    {
      watchItemId: "PW-DEMO-02",
      _demo: true,
      priorityKind: "oil",
      target: {
        equipmentId: 8477,
        name: "配電用Ａ変圧器",
        part: "ブッシング取付部",
      },
      label: "油にじみの進展",
      valueType: "choice",
      unit: null,
      decimals: null,
      choiceSetId: "progress",
      criteria: null,
      periods: [
        {
          startDate: "2025-10-15",
          startedBy: "巡視者A",
          startReason: "ブッシング取付部に油にじみを確認。進展有無を監視",
          endDate: "2026-07-09",
          endedBy: "巡視者B",
          endReason: "進展なしが続き、補修完了のため重点管理から外す",
        },
      ],
      displayOrder: 2,
      legacy: { inputClass: null, slot: null },
    },
  ],
  obs: [
    {
      observationId: "OB-DEMO-1",
      _demo: true,
      watchItemId: "PW-DEMO-01",
      date: "2026-01-20",
      status: "recorded",
      valueNumber: 0.5,
    },
    {
      observationId: "OB-DEMO-2",
      _demo: true,
      watchItemId: "PW-DEMO-01",
      date: "2026-04-21",
      status: "recorded",
      valueNumber: 0.49,
    },
    {
      observationId: "OB-DEMO-3",
      _demo: true,
      watchItemId: "PW-DEMO-01",
      date: "2026-07-09",
      status: "recorded",
      valueNumber: 0.47,
      note: "低下傾向が継続",
    },
    {
      observationId: "OB-DEMO-4",
      _demo: true,
      watchItemId: "PW-DEMO-02",
      date: "2026-01-20",
      status: "skipped",
      skipReason: "積雪のため近接確認不可",
    },
    {
      observationId: "OB-DEMO-5",
      _demo: true,
      watchItemId: "PW-DEMO-02",
      date: "2026-04-21",
      status: "recorded",
      valueChoice: "stable",
    },
    {
      observationId: "OB-DEMO-6",
      _demo: true,
      watchItemId: "PW-DEMO-02",
      date: "2026-07-09",
      status: "recorded",
      valueChoice: "stable",
    },
  ],
};
function setDemo(on) {
  const W = DATA.priorityWatch;
  W.items = W.items.filter((i) => !i._demo);
  W.observations = W.observations.filter((o) => !o._demo);
  if (on) {
    DEMO.items.forEach((i) => W.items.push(clone(i)));
    DEMO.obs.forEach((o) => W.observations.push(clone(o)));
  }
  ls.set(K.demo, !!on);
}

/* ---------- index ---------- */
function buildIndex() {
  const m = M();
  IDX.eq = Object.fromEntries(m.equipment.map((e) => [e.equipmentId, e]));
  IDX.items = [...m.measurementItems].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
  IDX.itemById = Object.fromEntries(IDX.items.map((i) => [i.itemId, i]));
  IDX.chk = Object.fromEntries(m.checklistItems.map((c) => [c.checkId, c]));
  IDX.grp = Object.fromEntries(m.seasonalGroups.map((g) => [g.groupId, g]));
  const recs = Object.values(DATA.records);
  IDX.patrols = recs
    .flatMap((r) => r.patrols)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.patrolId.localeCompare(b.patrolId),
    );
  IDX.pm = Object.fromEntries(IDX.patrols.map((p) => [p.patrolId, p]));
  IDX.sessions = recs
    .flatMap((r) => r.measurementSessions)
    .map((s) => ({
      ...s,
      date: (IDX.pm[s.patrolId] || {}).date || s.patrolId.slice(0, 10),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  IDX.inspectors = [...IDX.patrols]
    .reverse()
    .map((p) => p.regular.inspector)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}

/* ---------- master helpers ---------- */
const kinds = () => {
  const out = [];
  for (const [k, v] of Object.entries(M().codeTables.patrolKinds))
    for (const [s, lab] of Object.entries(v.sub)) {
      if (s === "reserved") continue;
      out.push({
        key: k + "." + s,
        group: v.label,
        label: lab.split("（")[0],
        full: lab,
      });
    }
  return out;
};
const kindLabel = (kind, sub) => {
  const v = M().codeTables.patrolKinds[kind];
  return v ? (v.sub[sub] || sub).split("（")[0] : sub;
};
const planned = (month) =>
  M()
    .checklistItems.filter((c) => c.monthlyPlan[String(month)])
    .sort((a, b) => a.displayOrder - b.displayOrder);
const chkByAction = (w) => M().checklistItems.find((c) => c.action.includes(w));
const isMeasMonth = (month) => {
  const c = chkByAction("測定巡視");
  return !!(c && c.monthlyPlan[String(month)]);
};
function nextMeasMonth(m) {
  const c = chkByAction("測定巡視");
  if (!c) return null;
  const ms = Object.keys(c.monthlyPlan)
    .map(Number)
    .filter((x) => x !== m);
  if (!ms.length) return null;
  return ms.sort((a, b) => ((a - m + 12) % 12) - ((b - m + 12) % 12))[0];
}
function seasonDir(month) {
  const c = chkByAction("季節対策");
  const t = c && c.monthlyPlan[String(month)];
  if (!t) return null;
  return t.includes("夏季→冬季")
    ? "winter"
    : t.includes("冬季→夏季")
      ? "summer"
      : null;
}
const recStatus = (checkId, date) => {
  const r = ((DATA.records[fyOf(date)] || {}).checklistResults || []).find(
    (x) => x.checkId === checkId && x.month === monthOf(date),
  );
  return r ? r.status : "";
};
function seasonDone(id, season, fy) {
  for (const r of Object.values(DATA.records))
    for (const x of r.seasonalResults || [])
      if (x.seasonalId === id && x.season === season && fyOf(x.doneDate) === fy)
        return x.doneDate;
  return null;
}
const measItems = () =>
  IDX.items.filter((i) => i.applicableHalf.includes(halfOf(S.draft.date)));
function prevMeas(itemId, date) {
  for (let i = IDX.sessions.length - 1; i >= 0; i--) {
    const s = IDX.sessions[i];
    if (s.date < date) {
      const v = s.values.find((x) => x.itemId === itemId);
      if (v) return { value: v.value, date: s.date };
    }
  }
  return null;
}
function ctrlRange(it) {
  const m = /管理値[：:]\s*([\d.]+)\s*[A-Za-z]*\s*[～~〜]\s*([\d.]+)/.exec(
    hw(it.note || ""),
  );
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}
function evalMeas(it, raw) {
  const r = { state: "empty", msgs: [], v: null, diff: null };
  if (raw === "" || raw == null) return r;
  if (it.inputType === "select") {
    r.v = Number(raw);
    r.state = "ok";
    return r;
  }
  const v = parseNum(raw);
  if (Number.isNaN(v)) {
    r.state = "err";
    r.msgs.push("数値で入力してください");
    return r;
  }
  r.v = v;
  const val = it.validation || {};
  if ((val.min != null && v < val.min) || (val.max != null && v > val.max)) {
    r.state = "err";
    r.msgs.push(`${fmt(val.min)}〜${fmt(val.max)} の範囲で入力`);
    return r;
  }
  const dec = (String(hw(raw)).split(".")[1] || "").length;
  if (val.decimals != null && dec > val.decimals) {
    r.state = "err";
    r.msgs.push(`小数は${val.decimals}桁まで`);
    return r;
  }
  r.state = "ok";
  const pv = prevMeas(it.itemId, S.draft.date);
  if (pv) {
    r.diff = v - pv.value;
    if (it.diffFromPrevious && v < pv.value) {
      r.state = "warn";
      r.msgs.push("前回より小さい値です（機器交換・桁あふれ？）");
    }
  }
  const rg = ctrlRange(it);
  if (rg && (v < rg[0] || v > rg[1])) {
    r.state = "err";
    r.msgs.push(`管理値外です（${rg[0]}〜${rg[1]}）`);
  }
  return r;
}
const optLabel = (it, v) => {
  const o = (it.options || []).find((o) => String(o.value) === String(v));
  return o ? hw(o.label) : String(v);
};
const valText = (it, v) =>
  it.inputType === "select" ? optLabel(it, v) : fmt(v, 3);

/* ---------- 所内電力 ---------- */
function powerSeries(meterId) {
  const mt = M().powerMeters.find((x) => x.meterId === meterId);
  const all = Object.values(DATA.powerMeterReadings.readingsByFiscalYear)
    .flat()
    .filter((r) => r.meterId === meterId)
    .map((r) => ({ ...r }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const cap = Math.pow(10, mt.digits);
  all.forEach((r, i) => {
    if (i === 0) {
      r.usage = null;
      r.gap = null;
      return;
    }
    const p = all[i - 1].reading;
    r.rolled = r.reading < p;
    r.usage =
      (r.reading >= p ? r.reading - p : r.reading + cap - p) * mt.multiplier;
    r.gap = Math.round(
      (new Date(r.date) - new Date(all[i - 1].date)) / 86400000,
    );
  });
  all.forEach((r, i) => {
    r.yoy =
      i >= 12 && r.usage != null && all[i - 12].usage && !(r.gap > 45)
        ? (r.usage / all[i - 12].usage) * 100
        : null;
  });
  return all;
}
function powCalc(mt, raw) {
  const out = { state: "empty" };
  const ser = powerSeries(mt.meterId).filter((r) => r.date < S.draft.date);
  out.prev = ser[ser.length - 1] || null;
  if (raw === "" || raw == null) return out;
  const cap = Math.pow(10, mt.digits),
    v = parseNum(raw);
  if (Number.isNaN(v) || v < 0 || v >= cap || !Number.isInteger(v)) {
    out.state = "err";
    out.msg = `0〜${fmt(cap - 1)} の整数で入力`;
    return out;
  }
  out.v = v;
  out.state = "ok";
  if (out.prev) {
    out.rolled = v < out.prev.reading;
    out.usage =
      (out.rolled ? v + cap - out.prev.reading : v - out.prev.reading) *
      mt.multiplier;
    out.gap = Math.round(
      (new Date(S.draft.date) - new Date(out.prev.date)) / 86400000,
    );
    const base = ser.length >= 12 ? ser[ser.length - 12] : null;
    if (base && base.usage && out.gap <= 45)
      out.yoy = (out.usage / base.usage) * 100;
  }
  out.warn = [];
  if (out.gap > 45)
    out.warn.push(
      `前回の読値から${out.gap}日あいています（月次ではないため前年比は計算しません）`,
    );
  if (out.rolled)
    out.warn.push(`メーターが一巡した扱いで計算しています（${mt.digits}桁）`);
  if (out.yoy != null && (out.yoy >= 120 || out.yoy <= 80))
    out.warn.push(`前年比 ${fmt(out.yoy, 1)}%（120%以上 / 80%以下は要確認）`);
  if (out.warn.length) out.state = "warn";
  return out;
}

/* ---------- 重点巡視 ---------- */
function applyEv(items, ev) {
  if (ev.type === "add") {
    if (items.some((i) => i.watchItemId === ev.watchItemId)) return;
    const p = ev.payload;
    items.push({
      watchItemId: ev.watchItemId,
      priorityKind: p.priorityKind,
      target: p.target,
      label: p.label,
      valueType: p.valueType,
      unit: p.unit || null,
      decimals: p.decimals ?? null,
      choiceSetId: p.valueType === "choice" ? "progress" : null,
      criteria: null,
      periods: [
        {
          startDate: ev.date,
          startedBy: ev.by,
          startReason: p.reason,
          endDate: null,
          endedBy: null,
          endReason: null,
        },
      ],
      displayOrder: items.length + 1,
      legacy: { inputClass: null, slot: null },
    });
  } else if (ev.type === "end") {
    const it = items.find((i) => i.watchItemId === ev.watchItemId);
    if (it) {
      const pr = it.periods[it.periods.length - 1];
      pr.endDate = ev.date;
      pr.endedBy = ev.by;
      pr.endReason = ev.payload.reason;
    }
  }
}
const watchEff = () => {
  const items = clone(DATA.priorityWatch.items);
  (S.draft ? S.draft.watchEvents : []).forEach((ev) => applyEv(items, ev));
  return items;
};
const activeFor = (date) =>
  watchEff().filter((it) =>
    it.periods.some(
      (p) => p.startDate <= date && (!p.endDate || date <= p.endDate),
    ),
  );
const obsOf = (id) =>
  DATA.priorityWatch.observations
    .filter((o) => o.watchItemId === id)
    .sort((a, b) => a.date.localeCompare(b.date));
const choiceSet = (it) =>
  M().codeTables.watchChoiceSets[it.choiceSetId] || { options: [] };
function obsLabel(it, o) {
  if (!o) return "–";
  if (o.status === "skipped") return "未確認";
  if (it.valueType === "number")
    return (
      fmt(o.valueNumber, it.decimals ?? 3) + (it.unit ? " " + it.unit : "")
    );
  if (it.valueType === "choice")
    return (
      (choiceSet(it).options.find((x) => x.code === o.valueChoice) || {})
        .label || "–"
    );
  return o.valueText || "–";
}
const kindJp = (k) =>
  (M().codeTables.patrolKinds.priority.sub[k] || k).split("（")[0];

/* ---------- draft ---------- */
function newDraft() {
  const d = {
    v: 1,
    date: ymd(new Date()),
    inspector: ls.get(K.insp, ""),
    companions: "",
    result: "異常無し",
    cats: { "regular.normal": true },
    remarksText: "",
    incidentNote: "",
    meas: {},
    checks: {},
    seasonal: {},
    power: {},
    watchObs: {},
    watchEvents: [],
    startedAt: new Date().toISOString(),
  };
  syncPlan(d);
  return d;
}
function syncPlan(d) {
  const m = monthOf(d.date);
  d.cats["regular.measurement"] = isMeasMonth(m);
  d.checks = {};
  planned(m).forEach((c) => {
    d.checks[c.checkId] = recStatus(c.checkId, d.date);
  });
}
function touch() {
  if (!S.draft) return;
  S.draft.updatedAt = new Date().toISOString();
  ls.set(K.draft, S.draft);
  const el = $("#draftStat");
  if (el) el.innerHTML = `下書きを自動保存しました <b>${nowHM()}</b>`;
}
function ensureDraft() {
  if (!S.draft) {
    S.draft = newDraft();
    touch();
  }
  return S.draft;
}

/* ---------- 取り込み（保存済みセッションを再現） ---------- */
function mergeSession(ss) {
  const fy = ss.fiscalYear,
    key = String(fy);
  const rec =
    DATA.records[key] ||
    (DATA.records[key] = {
      fiscalYear: fy,
      patrols: [],
      measurementSessions: [],
      checklistResults: [],
      checklistMonthDates: {},
      seasonalResults: [],
    });
  let pid = ss.date,
    n = 1;
  const all = Object.values(DATA.records).flatMap((r) => r.patrols);
  while (all.some((p) => p.patrolId === pid)) {
    n++;
    pid = `${ss.date}-${n}`;
  }
  rec.patrols.push({
    patrolId: pid,
    date: ss.date,
    fiscalYear: fy,
    categories: ss.categories,
    regular: ss.regular,
    priority: { result: null, inspectors: ss.priority.inspectors },
    temporary: { result: null, inspectors: [] },
    legacyRemarkLines: [],
    remarksText: ss.remarksText,
    incidentNote: ss.incidentNote,
    _local: ss.sessionId,
  });
  if (ss.measurements.length)
    rec.measurementSessions.push({
      patrolId: pid,
      fiscalYear: fy,
      half: ss.half,
      values: ss.measurements.map((x) => ({
        itemId: x.itemId,
        value: x.value,
      })),
      _local: ss.sessionId,
    });
  ss.checklist.forEach((c) => {
    const x = rec.checklistResults.find(
      (r) => r.checkId === c.checkId && r.month === c.month,
    );
    if (x) x.status = c.status;
    else rec.checklistResults.push({ ...c });
  });
  if (ss.checklist.length) rec.checklistMonthDates[monthOf(ss.date)] = ss.date;
  ss.seasonal.forEach((s) => {
    if (
      !rec.seasonalResults.some(
        (r) => r.seasonalId === s.seasonalId && r.season === s.season,
      )
    )
      rec.seasonalResults.push({ ...s });
  });
  (ss.powerReadings || []).forEach((p) => {
    const L = DATA.powerMeterReadings.readingsByFiscalYear;
    (L[fy] || (L[fy] = [])).push({
      meterId: p.meterId,
      date: p.date,
      fiscalYear: fy,
      reading: p.reading,
    });
  });
  (ss.watchlistEvents || []).forEach((ev) =>
    applyEv(DATA.priorityWatch.items, ev),
  );
  (ss.priorityObservations || []).forEach((o) =>
    DATA.priorityWatch.observations.push({
      observationId: `OB-${ss.sessionId}-${o.watchItemId}`,
      patrolId: pid,
      date: ss.date,
      ...o,
    }),
  );
}

/* ---------- 書き出し ---------- */
function reviewData() {
  const d = S.draft,
    blocks = [],
    warns = [];
  let missing = 0,
    measN = 0,
    measTotal = 0;
  if (!d.inspector.trim()) blocks.push("巡視者が未入力です");
  if (d.result === "異常あり" && !d.remarksText.trim())
    blocks.push("「異常あり」のため、記事欄に内容を記入してください");
  if ([...d.remarksText].length > 500)
    blocks.push("記事欄が500字を超えています");
  if (IDX.patrols.some((p) => p.date === d.date))
    warns.push(
      `${jd(d.date)} の巡視は既に記録されています（別の巡視として追加されます）`,
    );
  if (d.cats["regular.measurement"]) {
    const items = measItems();
    measTotal = items.length;
    items.forEach((it) => {
      const raw = d.meas[it.itemId] ?? "",
        ev = evalMeas(it, raw),
        nm = `${IDX.eq[it.equipmentId].nameKey} ${it.labelKey}`;
      if (ev.state === "empty") {
        missing++;
        return;
      }
      measN++;
      if (ev.state === "err") blocks.push(`${nm}: ${ev.msgs.join(" / ")}`);
      if (ev.state === "warn") warns.push(`${nm}: ${ev.msgs.join(" / ")}`);
    });
  }
  M().powerMeters.forEach((mt) => {
    const r = powCalc(mt, d.power[mt.meterId] ?? "");
    if (r.state === "err") blocks.push(`${hw(mt.label)}: ${r.msg}`);
    if (r.state === "warn")
      r.warn.forEach((w) => warns.push(`${hw(mt.label)}: ${w}`));
  });
  activeFor(d.date).forEach((it) => {
    const o = d.watchObs[it.watchItemId];
    if (!o) return;
    if (
      (o.status || "recorded") === "recorded" &&
      it.valueType === "number" &&
      o.valueNumber !== "" &&
      o.valueNumber != null &&
      Number.isNaN(parseNum(o.valueNumber))
    )
      blocks.push(`重点: ${it.label} は数値で入力してください`);
  });
  return { blocks, warns, missing, measN, measTotal };
}
function buildSession() {
  const d = S.draft,
    date = d.date,
    fy = fyOf(date),
    month = monthOf(date),
    half = halfOf(date);
  const categories = Object.entries(d.cats)
    .filter(([, v]) => v)
    .map(([k]) => {
      const [kind, sub] = k.split(".");
      return { kind, sub, count: 1, rawFlag: "●" };
    });
  const measurements = [];
  if (d.cats["regular.measurement"])
    measItems().forEach((it) => {
      const ev = evalMeas(it, d.meas[it.itemId] ?? "");
      if (ev.v != null && !Number.isNaN(ev.v))
        measurements.push({ itemId: it.itemId, value: ev.v });
    });
  const checks = { ...d.checks };
  const c6 = chkByAction("測定巡視");
  if (
    c6 &&
    c6.monthlyPlan[String(month)] &&
    measurements.length &&
    !checks[c6.checkId]
  )
    checks[c6.checkId] = "done";
  const checklist = Object.entries(checks)
    .filter(([, v]) => v)
    .map(([checkId, status]) => ({ checkId, month, status }));
  const dir = seasonDir(month);
  const seasonal = dir
    ? Object.entries(d.seasonal)
        .filter(([, v]) => v)
        .map(([seasonalId]) => ({ seasonalId, season: dir, doneDate: date }))
    : [];
  const powerReadings = [];
  M().powerMeters.forEach((mt) => {
    const r = powCalc(mt, d.power[mt.meterId] ?? "");
    if (r.v != null)
      powerReadings.push({ meterId: mt.meterId, date, reading: r.v });
  });
  const priorityObservations = [];
  activeFor(date).forEach((it) => {
    const o = d.watchObs[it.watchItemId];
    if (!o) return;
    const st = o.status || "recorded",
      rec = { watchItemId: it.watchItemId, status: st };
    if (it._demo) rec.demo = true;
    if (st === "skipped") {
      if (!o.skipReason) return;
      rec.skipReason = o.skipReason;
    } else if (it.valueType === "number") {
      const v = parseNum(o.valueNumber);
      if (v == null || Number.isNaN(v)) return;
      rec.valueNumber = v;
    } else if (it.valueType === "choice") {
      if (!o.valueChoice) return;
      rec.valueChoice = o.valueChoice;
    } else {
      if (!o.valueText) return;
      rec.valueText = o.valueText;
    }
    if (o.note) rec.note = o.note;
    priorityObservations.push(rec);
  });
  const comp = d.companions
    .split(/[、,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const t = new Date();
  return {
    schemaVersion: "0.3-draft",
    kind: "patrolSession",
    appVersion: APP_VER,
    sessionId: `${date.replace(/-/g, "")}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}-${DEV}`,
    site: DATA.site.name,
    date,
    fiscalYear: fy,
    half,
    categories,
    regular: { result: d.result, inspector: d.inspector.trim() },
    priority: { inspectors: comp },
    remarksText: d.remarksText.trim() || null,
    incidentNote: d.incidentNote.trim() || null,
    measurements,
    checklist,
    seasonal,
    powerReadings,
    watchlistEvents: d.watchEvents,
    priorityObservations,
    createdAt: t.toISOString(),
  };
}
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
async function shareOrDownload(name, text) {
  try {
    const f = new File([text], name, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f], title: name });
      return "shared";
    }
  } catch (e) {
    if (e && e.name === "AbortError") return "aborted";
  }
  download(name, text);
  return "downloaded";
}

/* ====================================================================
   画面（HTML文字列を返す）
   ==================================================================== */
const ICON = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  patrol:
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8.5 11l2 2 4-4"/><path d="M8.5 17h7"/>',
  watch:
    '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  trend: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M7 15l4-4 3 3 5-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
};
const TABS = [
  ["home", "ホーム"],
  ["patrol", "巡視"],
  ["watch", "重点"],
  ["trend", "トレンド"],
  ["settings", "設定"],
];

function renderChrome() {
  const sub = {
    home: `${DATA.site.name}（${hw(DATA.site.group)}）`,
    patrol: S.draft
      ? `${jd(S.draft.date)} ・ ${fyOf(S.draft.date)}年度 ${halfJp(halfOf(S.draft.date))}`
      : "巡視入力",
    watch: "重点巡視の項目管理",
    trend: "測定値・所内電力の推移",
    settings: "データと端末",
  }[S.tab];
  const ttl = {
    home: "巡視記録",
    patrol: "巡視入力",
    watch: "重点巡視",
    trend: "トレンド",
    settings: "設定",
  }[S.tab];
  $("#appbar").innerHTML =
    `<div class="t"><h1>${ttl}</h1><div class="sub">${esc(sub)}</div></div><span class="mock">MOCK</span>`;
  $("#tabbar").innerHTML = TABS.map(
    ([k, l]) =>
      `<button class="tab ${S.tab === k ? "on" : ""}" data-act="tab" data-k="${k}"><svg viewBox="0 0 24 24">${ICON[k === "settings" ? "gear" : k]}</svg>${l}${k === "patrol" && S.draft ? " ●" : ""}</button>`,
  ).join("");
  $("#tabbar").hidden = false;
  const ab = $("#actbar");
  if (S.tab === "patrol" && S.draft) {
    ab.hidden = false;
    ab.innerHTML = `<div class="sv" id="draftStat">${S.draft.updatedAt ? `下書きを自動保存しました <b>${nowHM()}</b>` : "入力は端末に自動保存されます"}</div><button class="btn pri" data-act="review">保存へ進む</button>`;
  } else ab.hidden = true;
  document.documentElement.style.setProperty(
    "--abh",
    $("#appbar").offsetHeight + "px",
  );
}
function render(keepScroll) {
  const y = window.scrollY;
  renderChrome();
  const v = $("#view");
  v.className = S.tab === "patrol" && S.draft ? "has-act" : "";
  v.innerHTML = {
    home: viewHome,
    patrol: viewPatrol,
    watch: viewWatch,
    trend: viewTrend,
    settings: viewSettings,
  }[S.tab]();
  if (S.tab === "patrol" && S.draft) updProg();
  window.scrollTo(0, keepScroll ? y : 0);
}

/* ---------- ホーム ---------- */
function viewHome() {
  const today = ymd(new Date()),
    fy = fyOf(today),
    m = monthOf(today),
    h = halfOf(today),
    d = S.draft;
  const last = IDX.patrols[IDX.patrols.length - 1],
    pl = planned(m),
    nm = nextMeasMonth(m),
    dir = seasonDir(m);
  const stBadge = (c) => {
    const s = recStatus(c.checkId, today);
    return s === "done"
      ? '<i class="badge ok">済み</i>'
      : s === "notRequired"
        ? '<i class="badge">実施不要</i>'
        : '<i class="badge warn">未</i>';
  };
  const lastPow = Object.values(DATA.powerMeterReadings.readingsByFiscalYear)
    .flat()
    .map((r) => r.date)
    .sort()
    .pop();
  return `
  <section class="card hero">
    <div class="hs">${esc(DATA.site.name)}</div><div class="hd">${jd(today)}</div><div class="hs">${fy}年度 ${halfJp(h)}</div>
    <button class="btn pri block lg" data-act="start">${d ? `下書きを再開（${jd(d.date)}）` : "巡視を開始"}</button>
  </section>
  <section class="card"><h2>今月（${m}月）の予定</h2>
    <div class="kv"><span>測定巡視</span><b>${isMeasMonth(m) ? "今月が計画月" : `計画なし（次回 ${nm}月）`}</b></div>
    <div class="kv"><span>季節対策</span><b>${dir ? (dir === "winter" ? "向寒対策（夏季→冬季）" : "向暑対策（冬季→夏季）") : "計画なし"}</b></div>
    ${pl.map((c) => `<div class="kv"><span>${esc(tidy(c.area))}／${esc(tidy(c.action))}</span><b>${esc(c.monthlyPlan[String(m)])} ${stBadge(c)}</b></div>`).join("")}
  </section>
  ${
    last
      ? `<section class="card"><h2>前回の巡視</h2>
    <div class="kv"><span>日付</span><b>${jd(last.date)}</b></div>
    <div class="kv"><span>巡視者</span><b>${esc(last.regular.inspector)}</b></div>
    <div class="kv"><span>結果</span><b>${esc(last.regular.result || "–")}</b></div>
    ${last.remarksText ? `<div class="kv"><span>記事</span><b style="text-align:left;font-weight:500">${esc(last.remarksText)}</b></div>` : ""}
  </section>`
      : ""
  }
  <section class="card"><h2>お知らせ</h2>
    <div class="kv"><span>所内電力の最終読値</span><b>${lastPow ? jd(lastPow) : "–"}</b></div>
    <div class="kv"><span>重点巡視の監視中項目</span><b>${watchEff().filter((i) => !i.periods[i.periods.length - 1].endDate).length}件</b></div>
  </section>
  <section class="card"><h2>巡視履歴 <span class="prog">${IDX.patrols.length}件</span></h2>
    <div class="plist">${[...IDX.patrols]
      .reverse()
      .map(
        (p) => `
      <button class="p" data-act="detail" data-id="${esc(p.patrolId)}">
        <span class="d">${md(p.date)}</span>
        <span><b>${esc(p.regular.inspector || "–")}</b><br><span class="s">${esc(p.categories.map((c) => kindLabel(c.kind, c.sub)).join("・"))}${p._local ? " ・端末内保存" : ""}</span></span>
        <span class="badge ${p.regular.result === "異常無し" ? "ok" : "err"}">${esc(p.regular.result || "–")}</span>
      </button>`,
      )
      .join("")}</div>
  </section>
  <p class="footnote">元データ: ${esc(SRC)}（${esc(DATA.schemaVersion)}）</p>`;
}

/* ---------- 巡視入力 ---------- */
function viewPatrol() {
  const d = S.draft;
  if (!d)
    return `<section class="card"><h2>巡視入力</h2><p class="mut">巡視を開始すると、今月の計画に合わせて入力項目が表示されます。</p><button class="btn pri block lg" data-act="start">巡視を開始</button></section>`;
  const nav = [
    ["basic", "基本"],
    ["meas", "測定"],
    ["chk", "外確認"],
    ["sea", "季節"],
    ["pow", "電力"],
    ["wat", "重点"],
    ["rem", "記事"],
  ];
  return `<div class="secnav">${nav.map(([k, l]) => `<button class="chip sm" data-act="goto" data-k="${k}">${l}<i id="pg-${k}"></i></button>`).join("")}</div>
    ${secBasic()}${secMeas()}${secChk()}${secSea()}${secPow()}${secWat()}${secRem()}`;
}
function hintDate() {
  const d = S.draft,
    m = monthOf(d.date),
    nm = nextMeasMonth(m);
  return `${fyOf(d.date)}年度 ${halfJp(halfOf(d.date))} ／ 測定巡視: ${isMeasMonth(m) ? "今月が計画月" : `今月は計画なし（次回 ${nm}月）`}`;
}
function secBasic() {
  const d = S.draft,
    ks = kinds(),
    groups = [...new Set(ks.map((k) => k.group))];
  return `<section class="card" id="sec-basic"><h2>基本情報</h2>
    <label class="fl" for="f-date">巡視日</label><input type="date" id="f-date" data-f="date" value="${d.date}">
    <div class="hint" id="dateHint" style="margin-top:6px">${esc(hintDate())}</div>
    <label class="fl" for="f-insp">巡視者</label><input id="f-insp" data-f="inspector" placeholder="氏名" value="${esc(d.inspector)}" autocomplete="off">
    <div class="chips">${IDX.inspectors
      .slice(0, 5)
      .map(
        (n) =>
          `<button class="chip sm" data-act="pickInsp" data-n="${esc(n)}">${esc(n)}</button>`,
      )
      .join("")}</div>
    <label class="fl" for="f-comp">同行者（任意・読点区切り）</label><input id="f-comp" data-f="companions" value="${esc(d.companions)}" autocomplete="off">
    <div class="fl">巡視区分</div>
    ${groups
      .map(
        (g) =>
          `<div class="kgroup"><span class="gl">${g}</span><div class="chips">${ks
            .filter((k) => k.group === g)
            .map(
              (k) =>
                `<button class="chip ${d.cats[k.key] ? "on" : ""}" data-act="kind" data-k="${k.key}">${esc(k.label)}</button>`,
            )
            .join("")}</div></div>`,
      )
      .join("")}
    <div class="fl">巡視結果</div>
    <div class="seg two"><button class="${d.result === "異常無し" ? "on ok" : ""}" data-act="result" data-v="異常無し">異常無し</button><button class="${d.result === "異常あり" ? "on ng" : ""}" data-act="result" data-v="異常あり">異常あり</button></div>
  </section>`;
}
function measMeta(it) {
  const raw = S.draft.meas[it.itemId] ?? "",
    ev = evalMeas(it, raw),
    pv = prevMeas(it.itemId, S.draft.date);
  let h = pv
    ? `前回 <b>${esc(valText(it, pv.value))}</b> (${md(pv.date)})`
    : "前回値なし";
  if (it.diffFromPrevious && ev.diff != null)
    h += ` ・ 差 <b class="${ev.diff < 0 ? "neg" : ""}">${sgn(ev.diff)}</b>`;
  ev.msgs.forEach((t) => {
    h += `<div class="msg ${ev.state}">${esc(t)}</div>`;
  });
  if (it.note) h += `<div class="note">${esc(hw(it.note))}</div>`;
  return { html: h, state: ev.state };
}
function measRow(it, hideLabel) {
  const e = IDX.eq[it.equipmentId],
    raw = S.draft.meas[it.itemId] ?? "",
    mt = measMeta(it),
    sel = it.inputType === "select";
  const ctl = sel
    ? `<div class="seg n${it.options.length}">${it.options.map((o) => `<button class="${String(raw) === String(o.value) ? "on" : ""}" data-act="measSel" data-id="${it.itemId}" data-v="${o.value}">${esc(hw(o.label))}</button>`).join("")}</div>`
    : `<div class="inp"><input class="num" inputmode="${it.unit === "回" ? "numeric" : "decimal"}" enterkeyhint="next" autocomplete="off" data-meas="${it.itemId}" value="${esc(raw)}" placeholder="–" aria-label="${esc(e.nameKey + " " + it.labelKey)}"><span class="u">${esc(hw(it.unit || ""))}</span></div>`;
  return `<div class="row ${sel ? "wide " : ""}${mt.state}" id="r-${it.itemId}"><div class="rl"><b>${esc(e.nameKey)}</b>${hideLabel ? "" : `<span>${esc(it.labelKey)}</span>`}</div>${ctl}<div class="meta" id="m-${it.itemId}">${mt.html}</div></div>`;
}
function secMeas() {
  const d = S.draft;
  if (!d.cats["regular.measurement"])
    return `<section class="card" id="sec-meas"><h2>測定値 <span class="badge">今回は対象外</span></h2><p class="hint">${esc(hintDate().split("／ ")[1])}。計画月以外でも測定する場合は下のボタンで入力できます。</p><button class="btn ghost block" data-act="kind" data-k="regular.measurement">測定巡視として入力する</button></section>`;
  const items = measItems(),
    cats = [...new Set(items.map((i) => IDX.eq[i.equipmentId].category))];
  return `<section class="card" id="sec-meas"><h2>測定値 <span class="prog" id="p-meas"></span></h2>
    <p class="hint">${halfJp(halfOf(d.date))}の測定対象 ${items.length}項目。前回値と比べて、異常な入力を警告します。</p>
    ${cats
      .map((c) => {
        const its = items.filter((i) => IDX.eq[i.equipmentId].category === c),
          labs = [...new Set(its.map((i) => i.labelKey))],
          same = labs.length === 1 && its.length > 1;
        return `<h3>${esc(c)}${same ? " ／ " + esc(labs[0]) : ""}</h3>${its.map((i) => measRow(i, same)).join("")}`;
      })
      .join("")}</section>`;
}
function chkRow(c) {
  const v = S.draft.checks[c.checkId] || "",
    m = monthOf(S.draft.date),
    isMeas = c.action.includes("測定巡視");
  return `<div class="row wide"><div class="rl"><b>${esc(tidy(c.area))}</b><span>${esc(tidy(c.action))}${isMeas ? "（測定値を保存すると自動で「済み」）" : ""}</span><span><i class="badge pri">${esc(c.monthlyPlan[String(m)])}</i></span></div>
    <div class="seg n3">${[
      ["", "未"],
      ["done", "済み"],
      ["notRequired", "実施不要"],
    ]
      .map(
        ([k, l]) =>
          `<button class="${v === k ? "on " + (k === "done" ? "ok" : "") : ""}" data-act="chk" data-id="${c.checkId}" data-v="${k}">${l}</button>`,
      )
      .join("")}</div></div>`;
}
function secChk() {
  const m = monthOf(S.draft.date),
    list = planned(m);
  return `<section class="card" id="sec-chk"><h2>巡視外確認（${m}月） <span class="prog" id="p-chk"></span></h2>
    ${list.length ? list.map(chkRow).join("") : '<p class="mut">今月の計画項目はありません。</p>'}</section>`;
}
function secSea() {
  const d = S.draft,
    m = monthOf(d.date),
    dir = seasonDir(m),
    fy = fyOf(d.date);
  if (!dir) {
    const c = chkByAction("季節対策");
    return `<section class="card" id="sec-sea"><h2>季節管理 <span class="badge">今月は対象外</span></h2><p class="hint">計画月: ${
      c
        ? Object.entries(c.monthlyPlan)
            .map(([k, v]) => `${k}月 ${esc(v)}`)
            .join("、")
        : "–"
    }</p></section>`;
  }
  const sw = M().seasonalItems.filter((s) => s.type === "seasonalSwitch"),
    fixed = M().seasonalItems.filter((s) => s.type === "fixedCheck");
  const groups = M().seasonalGroups.filter((g) =>
    sw.some((s) => s.groupId === g.groupId),
  );
  return `<section class="card" id="sec-sea"><h2>季節管理 <span class="prog" id="p-sea"></span></h2>
    <p class="hint">${dir === "winter" ? "向寒対策（夏季→冬季）" : "向暑対策（冬季→夏季）"}：切替が済んだ項目をタップ</p>
    ${groups
      .map(
        (g) =>
          `<h3>${esc(tidy(g.location))}</h3>${sw
            .filter((s) => s.groupId === g.groupId)
            .map((s) => {
              const done = seasonDone(s.seasonalId, dir, fy),
                on = !!d.seasonal[s.seasonalId],
                st = dir === "winter" ? s.winterState : s.summerState;
              return `<button class="tgl ${on ? "on" : ""} ${done ? "done" : ""}" data-act="sea" data-id="${s.seasonalId}" ${done ? "disabled" : ""}>
        <span class="rl"><b>${esc(tidy(s.target))}</b><span>${esc(tidy(s.operation || ""))}${s.remarks ? " ／ " + esc(tidy(s.remarks)) : ""}</span></span>
        <span class="st">${done ? `<i class="badge ok">${md(done)} 済</i>` : `→ <b>${esc(st)}</b>`}<span class="box">✓</span></span></button>`;
            })
            .join("")}`,
      )
      .join("")}
    <details><summary>固定確認 ${fixed.length}件（記録対象外・確認のみ）</summary>
      <ul class="list">${fixed.map((s) => `<li>${esc(tidy(s.target))}${s.operation ? "：" + esc(tidy(s.operation)) : ""} — ${esc(tidy(s.fixedCheck))}</li>`).join("")}</ul></details></section>`;
}
function powMeta(mt) {
  const raw = S.draft.power[mt.meterId] ?? "",
    r = powCalc(mt, raw);
  let h = r.prev
    ? `前回 <b>${fmt(r.prev.reading, 0)}</b> (${md(r.prev.date)})`
    : "前回値なし";
  if (r.state === "err") h += `<div class="msg err">${esc(r.msg)}</div>`;
  else if (r.v != null) {
    if (r.usage != null) h += ` ・ 使用量 <b>${fmt(r.usage, 0)}</b>`;
    if (r.yoy != null) h += ` ・ 前年比 <b>${fmt(r.yoy, 1)}%</b>`;
    (r.warn || []).forEach((w) => {
      h += `<div class="msg warn">${esc(w)}</div>`;
    });
  }
  return { html: h, state: r.state };
}
function secPow() {
  return `<section class="card" id="sec-pow"><h2>所内電力 読値 <span class="prog" id="p-pow"></span></h2><p class="hint">月次の積算電力量計の読値（任意）</p>
    ${M()
      .powerMeters.map((mt) => {
        const p = powMeta(mt);
        return `<div class="row wide ${p.state}" id="pw-${mt.meterId}"><div class="rl"><b>${esc(hw(mt.label))}</b><span>${esc(hw(mt.location))} ・ 倍率 ${mt.multiplier}</span></div>
      <div class="inp"><input class="num" inputmode="numeric" autocomplete="off" data-pow="${mt.meterId}" value="${esc(S.draft.power[mt.meterId] ?? "")}" placeholder="読値"><span class="u">${mt.digits}桁</span></div>
      <div class="meta" id="pm-${mt.meterId}">${p.html}</div></div>`;
      })
      .join("")}</section>`;
}
function watchObsRow(it) {
  const d = S.draft,
    o = d.watchObs[it.watchItemId] || {},
    st = o.status || "recorded";
  const p = it.periods[it.periods.length - 1],
    base = p.startDate === d.date;
  const hist = obsOf(it.watchItemId).filter((x) => x.date < d.date),
    last = hist[hist.length - 1];
  let ctl = "";
  if (st === "skipped")
    ctl = `<label class="fl">未確認の理由</label><input data-w="${it.watchItemId}" data-k="skipReason" value="${esc(o.skipReason || "")}" placeholder="例: 積雪のため近接確認不可">`;
  else if (it.valueType === "number")
    ctl = `<div class="inp" style="margin-top:8px"><input class="num" inputmode="decimal" data-w="${it.watchItemId}" data-k="valueNumber" value="${esc(o.valueNumber ?? "")}" placeholder="${base ? "基準値（任意）" : "測定値"}"><span class="u">${esc(it.unit || "")}</span></div>`;
  else if (it.valueType === "choice")
    ctl = `<div class="seg n${choiceSet(it).options.length || 2}" style="margin-top:8px">${choiceSet(
      it,
    )
      .options.map(
        (op) =>
          `<button class="${o.valueChoice === op.code ? "on" : ""}" data-act="wchoice" data-id="${it.watchItemId}" data-v="${op.code}">${esc(op.label)}</button>`,
      )
      .join("")}</div>`;
  else
    ctl = `<textarea rows="2" style="margin-top:8px" data-w="${it.watchItemId}" data-k="valueText" placeholder="状態を記入">${esc(o.valueText || "")}</textarea>`;
  return `<div class="wcard" id="w-${it.watchItemId}">
    <div class="wh"><div><b>${esc(hw(it.target.name))}${it.target.part ? " / " + esc(it.target.part) : ""}</b>${it._demo ? '<span class="demo">DEMO</span>' : ""}<div class="ws">${esc(it.label)} ・ ${esc(kindJp(it.priorityKind))} ・ ${md(it.periods[0].startDate)}〜</div></div>
      <button class="btn sm" data-act="watchEnd" data-id="${it.watchItemId}">終了</button></div>
    <div class="meta" style="font-size:12.5px;color:var(--mut);margin-top:4px">${last ? `前回 <b style="color:var(--tx)">${esc(obsLabel(it, last))}</b> (${md(last.date)})` : "前回値なし"}${base ? " ・ 今回追加（基準値は任意）" : ""}${p.endDate === d.date ? " ・ <b>今回で終了</b>" : ""}</div>
    <div class="seg n2" style="margin-top:8px"><button class="${st === "recorded" ? "on" : ""}" data-act="wstat" data-id="${it.watchItemId}" data-v="recorded">記録する</button><button class="${st === "skipped" ? "on" : ""}" data-act="wstat" data-id="${it.watchItemId}" data-v="skipped">未確認</button></div>
    ${ctl}
    <input style="margin-top:8px" data-w="${it.watchItemId}" data-k="note" value="${esc(o.note || "")}" placeholder="メモ（任意）"></div>`;
}
function secWat() {
  const act = activeFor(S.draft.date);
  return `<section class="card" id="sec-wat"><h2>重点巡視 <span class="prog" id="p-wat"></span></h2>
    <p class="hint">普段は記録しない設備・部位を、定期巡視のたびに記録して傾向を監視します。</p>
    ${act.length ? act.map(watchObsRow).join("") : '<p class="mut">監視中の重点項目はありません（この変電所は対象なし）。</p>'}
    <div class="btnrow"><button class="btn ghost" data-act="watchAdd">＋ 重点項目を追加</button></div></section>`;
}
function secRem() {
  const d = S.draft;
  return `<section class="card" id="sec-rem"><h2>記事欄 <span class="cnt" id="remCnt">${[...d.remarksText].length}/500</span></h2>
    <textarea id="f-rem" data-f="remarksText" rows="6" maxlength="500" placeholder="巡視結果・気づいた点を記入（最大500字）">${esc(d.remarksText)}</textarea>
    <label class="fl" for="f-inc">事故・障害（任意）</label><input id="f-inc" data-f="incidentNote" value="${esc(d.incidentNote)}">
    <p class="hint" style="margin-top:8px">旧様式の記事欄は6行で、約200〜240字が目安でした（推定）。</p></section>`;
}

/* ---------- 重点タブ ---------- */
function watchCard(it, ended) {
  const ob = obsOf(it.watchItemId),
    p = it.periods[it.periods.length - 1],
    last = ob[ob.length - 1];
  let vis = "";
  if (
    it.valueType === "number" &&
    ob.filter((o) => o.status === "recorded").length >= 2
  )
    vis = lineSvg(
      ob
        .filter((o) => o.status === "recorded")
        .map((o) => ({ x: md(o.date), y: o.valueNumber })),
      it.decimals ?? 2,
    );
  else if (ob.length)
    vis = `<div class="chips">${ob.map((o) => `<span class="chip sm">${md(o.date)} ${esc(obsLabel(it, o))}</span>`).join("")}</div>`;
  return `<div class="wcard">
    <div class="wh"><div><b>${esc(hw(it.target.name))}${it.target.part ? " / " + esc(it.target.part) : ""}</b>${it._demo ? '<span class="demo">DEMO</span>' : ""}
      <div class="ws">${esc(it.label)}（${esc(M().codeTables.watchValueTypes[it.valueType].split("（")[0])}${it.unit ? "・" + esc(it.unit) : ""}） ・ ${esc(kindJp(it.priorityKind))}</div></div>
      <span class="badge ${ended ? "" : "ok"}">${ended ? "終了" : "監視中"}</span></div>
    ${vis}
    <div class="kv"><span>追加</span><b>${jd(it.periods[0].startDate)}</b></div>
    <div class="kv"><span>追加理由</span><b style="text-align:left;font-weight:500">${esc(p.startReason || "–")}</b></div>
    ${last ? `<div class="kv"><span>最新</span><b>${esc(obsLabel(it, last))}（${md(last.date)}）</b></div>` : ""}
    ${
      ended
        ? `<div class="kv"><span>終了</span><b>${jd(p.endDate)}</b></div><div class="kv"><span>終了理由</span><b style="text-align:left;font-weight:500">${esc(p.endReason || "–")}</b></div>`
        : `<div class="btnrow"><button class="btn sm" data-act="watchEnd" data-id="${it.watchItemId}">重点管理から外す</button></div>`
    }
  </div>`;
}
function viewWatch() {
  const items = watchEff(),
    act = items.filter((i) => !i.periods[i.periods.length - 1].endDate),
    end = items.filter((i) => i.periods[i.periods.length - 1].endDate);
  return `<section class="card"><h2>重点巡視とは</h2>
    <p class="hint" style="margin:0">${esc(M().priorityWatchDefinition.concept)}</p>
    <div class="btnrow"><button class="btn pri" data-act="watchAdd">＋ 重点項目を追加</button></div></section>
  <section class="card"><h2>監視中 <span class="prog">${act.length}件</span></h2>
    ${
      act.length
        ? act.map((i) => watchCard(i, false)).join("")
        : `<p class="mut">監視中の項目はありません。</p>
      <p class="hint">この変電所は重点巡視の対象がありません。動きを確認したい場合は、下のボタンで架空のサンプルを表示できます。</p>
      <button class="btn ghost block" data-act="demoOn">デモ用サンプルを表示（架空データ）</button>`
    }</section>
  ${end.length ? `<section class="card"><h2>終了済み <span class="prog">${end.length}件</span></h2>${end.map((i) => watchCard(i, true)).join("")}</section>` : ""}`;
}

/* ---------- グラフ ---------- */
const fx = (v, d) =>
  Number(v).toLocaleString("ja-JP", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
function lineSvg(pts, dec = 2) {
  if (!pts.length) return '<p class="mut">データなし</p>';
  const W = 340,
    H = 170,
    L = 46,
    R = 30,
    T = 22,
    B = 28;
  const ys = pts.map((p) => p.y);
  let lo = Math.min(...ys),
    hi = Math.max(...ys);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pd = (hi - lo) * 0.18;
  lo -= pd;
  hi += pd;
  const X = (i) =>
      pts.length === 1
        ? (L + W - R) / 2
        : L + ((W - L - R) * i) / (pts.length - 1),
    Y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const lab = pts.length <= 8;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="推移グラフ">
    <line class="gr" x1="${L}" x2="${W - R}" y1="${Y(hi)}" y2="${Y(hi)}"/><line class="gr" x1="${L}" x2="${W - R}" y1="${Y(lo)}" y2="${Y(lo)}"/>
    <text x="${L - 5}" y="${Y(hi) + 3}" text-anchor="end">${fx(hi, dec)}</text><text x="${L - 5}" y="${Y(lo) + 3}" text-anchor="end">${fx(lo, dec)}</text>
    <polyline class="ln" points="${pts.map((p, i) => `${X(i)},${Y(p.y)}`).join(" ")}"/>
    ${pts
      .map(
        (
          p,
          i,
        ) => `<circle class="dot" cx="${X(i)}" cy="${Y(p.y)}" r="3.5"/>${lab ? `<text class="v" x="${X(i)}" y="${Y(p.y) - 8}" text-anchor="middle">${fx(p.y, dec)}</text>` : ""}
      ${lab || i === 0 || i === pts.length - 1 ? `<text x="${X(i)}" y="${H - 9}" text-anchor="middle">${esc(p.x)}</text>` : ""}`,
      )
      .join("")}</svg>`;
}
function barSvg(rows) {
  const W = 340,
    H = 170,
    L = 40,
    R = 8,
    T = 14,
    B = 26,
    n = rows.length,
    bw = (W - L - R) / n;
  const mx = Math.max(1, ...rows.flatMap((r) => [r.cur || 0, r.prev || 0])),
    Y = (v) => T + (H - T - B) * (1 - v / mx);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="月別使用量">
    <line class="gr" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/><line class="gr" x1="${L}" x2="${W - R}" y1="${Y(mx)}" y2="${Y(mx)}"/>
    <text x="${L - 4}" y="${Y(mx) + 3}" text-anchor="end">${fmt(mx, 0)}</text><text x="${L - 4}" y="${Y(0) + 3}" text-anchor="end">0</text>
    ${rows
      .map((r, i) => {
        const x = L + bw * i,
          w = bw * 0.36;
        return `${r.prev ? `<rect class="b0" x="${x + bw * 0.1}" y="${Y(r.prev)}" width="${w}" height="${Y(0) - Y(r.prev)}"/>` : ""}
      ${r.cur ? `<rect class="${r.flag ? "bw" : "b1"}" x="${x + bw * 0.1 + w + 1}" y="${Y(r.cur)}" width="${w}" height="${Y(0) - Y(r.cur)}"/>` : ""}
      <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${r.m}</text>`;
      })
      .join("")}</svg>`;
}

/* ---------- トレンド ---------- */
function viewTrend() {
  return `<div class="seg n2 top"><button class="${S.trend === "meas" ? "on" : ""}" data-act="trendTab" data-v="meas">測定値</button><button class="${S.trend === "pow" ? "on" : ""}" data-act="trendTab" data-v="pow">所内電力</button></div>
    ${S.trend === "meas" ? trendMeas() : trendPow()}`;
}
function itemHistory(itemId) {
  const out = [];
  IDX.sessions.forEach((s) => {
    const v = s.values.find((x) => x.itemId === itemId);
    if (v)
      out.push({
        date: s.date,
        value: v.value,
        legacy: v.legacyDiffFromPrevious,
      });
  });
  return out;
}
function trendMeas() {
  const items = IDX.items.filter((i) => itemHistory(i.itemId).length);
  if (!S.trendItem || !IDX.itemById[S.trendItem])
    S.trendItem = (
      items.find((i) => i.itemId === "8477-96") ||
      items[0] ||
      {}
    ).itemId;
  const it = IDX.itemById[S.trendItem];
  if (!it) return '<p class="mut">測定データがありません。</p>';
  const hist = itemHistory(it.itemId),
    cats = [...new Set(items.map((i) => IDX.eq[i.equipmentId].category))];
  return `<section class="card"><label class="fl" style="margin-top:0" for="trSel">測定項目</label>
    <select id="trSel" data-trend="item">${cats
      .map(
        (c) =>
          `<optgroup label="${esc(c)}">${items
            .filter((i) => IDX.eq[i.equipmentId].category === c)
            .map(
              (i) =>
                `<option value="${i.itemId}" ${i.itemId === S.trendItem ? "selected" : ""}>${esc(IDX.eq[i.equipmentId].nameKey + " " + i.labelKey)}</option>`,
            )
            .join("")}</optgroup>`,
      )
      .join("")}</select>
    ${
      it.inputType === "select"
        ? ""
        : lineSvg(
            hist.map((h) => ({ x: md(h.date), y: h.value })),
            it.unit === "回" ? 0 : 2,
          )
    }
    <table class="t"><tr><th>測定日</th><th>値${it.unit ? "(" + esc(hw(it.unit)) + ")" : ""}</th>${it.diffFromPrevious ? "<th>前回差</th>" : ""}</tr>
    ${hist
      .map((h, i) => {
        const dv = i > 0 ? h.value - hist[i - 1].value : (h.legacy ?? null);
        return `<tr><td>${jd(h.date)}</td><td>${esc(valText(it, h.value))}</td>${it.diffFromPrevious ? `<td>${dv == null ? "–" : i === 0 ? `<i>${sgn(dv)}</i>` : sgn(dv)}</td>` : ""}</tr>`;
      })
      .join("")}</table>
    ${it.diffFromPrevious ? '<p class="hint" style="margin-top:8px">斜体は元の表に残っていた値（比較元の記録がない最初の測定）。</p>' : ""}
    ${it.note ? `<p class="hint">${esc(hw(it.note))}</p>` : ""}</section>`;
}
function trendPow() {
  const mts = M().powerMeters,
    fys = Object.keys(DATA.powerMeterReadings.readingsByFiscalYear)
      .map(Number)
      .sort((a, b) => a - b);
  if (!mts.some((m) => m.meterId === S.pMeter)) S.pMeter = mts[0].meterId;
  if (!S.pFY || !fys.includes(S.pFY)) S.pFY = fys[fys.length - 1];
  const ser = powerSeries(S.pMeter),
    order = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  const byFY = (fy) => ser.filter((r) => r.fiscalYear === fy);
  const cur = byFY(S.pFY),
    prv = byFY(S.pFY - 1);
  const rows = order.map((m) => {
    const c = cur.find((r) => monthOf(r.date) === m),
      p = prv.find((r) => monthOf(r.date) === m);
    return {
      m,
      cur: c && c.usage,
      prev: p && p.usage,
      flag: c && c.yoy != null && (c.yoy >= 120 || c.yoy <= 80),
      rec: c,
    };
  });
  return `<section class="card">
    <div class="seg n${mts.length} top" style="margin-bottom:8px">${mts.map((m) => `<button class="${S.pMeter === m.meterId ? "on" : ""}" data-act="pmeter" data-v="${m.meterId}">${esc(hw(m.label).replace("メーター値", "").trim())}</button>`).join("")}</div>
    <label class="fl" style="margin-top:0" for="pfy">年度</label>
    <select id="pfy" data-trend="fy">${[...fys]
      .reverse()
      .map(
        (f) =>
          `<option value="${f}" ${f === S.pFY ? "selected" : ""}>${f}年度</option>`,
      )
      .join("")}</select>
    <p class="hint" style="margin-top:8px">月別使用量（青=${S.pFY}年度、灰=前年度、橙=前年比120%以上/80%以下）</p>
    ${barSvg(rows)}
    <table class="t"><tr><th>月</th><th>測定日</th><th>読値</th><th>使用量</th><th>前年比</th></tr>
    ${
      rows
        .filter((r) => r.rec)
        .map(
          (r) =>
            `<tr><td>${r.m}月</td><td>${md(r.rec.date)}</td><td>${fmt(r.rec.reading, 0)}</td><td class="${r.rec.gap > 45 ? "g" : ""}">${r.rec.usage == null ? "–" : fmt(r.rec.usage, 0)}${r.rec.rolled ? "*" : ""}${r.rec.gap > 45 ? "†" : ""}</td><td class="${r.flag ? "w" : ""}">${r.rec.yoy == null ? "–" : fmt(r.rec.yoy, 1) + "%"}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="5" class="mut" style="text-align:center">この年度の読値はありません</td></tr>'
    }</table>
    <p class="hint" style="margin-top:8px">* メーターが一巡（5桁）した月。使用量は元の表と同じ計算式（一巡補正あり）。<br>† 前回の読値から45日を超えているため、前年比は計算していません。</p></section>`;
}

/* ---------- 設定 ---------- */
function viewSettings() {
  const sess = ls.get(K.sessions, []),
    demo = ls.get(K.demo, false);
  return `<section class="card"><h2>データ</h2>
    <div class="kv"><span>読み込み元</span><b>${esc(SRC)}</b></div>
    <div class="kv"><span>スキーマ</span><b>${esc(DATA.schemaVersion)}</b></div>
    <div class="kv"><span>生成日時</span><b>${esc((DATA.generatedAt || "").replace("T", " ").slice(0, 16))}</b></div>
    <div class="kv"><span>巡視 / 測定</span><b>${IDX.patrols.length}件 / ${IDX.sessions.length}回</b></div>
    <div class="kv"><span>設備 / 測定項目</span><b>${M().equipment.length}台 / ${M().measurementItems.length}項目</b></div>
    <p class="hint" style="margin-top:8px">このJSONは読み取り専用です。入力した内容は書き換えず、巡視ごとの別ファイルとして書き出します。</p></section>
  <section class="card"><h2>この端末の保存データ</h2>
    <div class="kv"><span>下書き</span><b>${S.draft ? `${jd(S.draft.date)}（作成中）` : "なし"}</b></div>
    <div class="kv"><span>保存済みセッション</span><b>${sess.length}件</b></div>
    <div class="btnrow"><button class="btn sm" data-act="exportAll" ${sess.length ? "" : "disabled"}>保存済みを全て書き出し</button>
    <button class="btn sm danger" data-act="discard" ${S.draft ? "" : "disabled"}>下書きを破棄</button>
    <button class="btn sm danger" data-act="resetAll">端末内データを全消去</button></div>
    <p class="hint" style="margin-top:8px">iPhoneのSafariは、ホーム画面に追加していないサイトの端末内データを約7日間操作がないと削除することがあります。</p></section>
  <section class="card"><h2>デモ</h2>
    <div class="kv"><span>重点巡視のサンプル（架空）</span><b>${demo ? "ON" : "OFF"}</b></div>
    <div class="btnrow"><button class="btn sm" data-act="${demo ? "demoOff" : "demoOn"}">${demo ? "サンプルを消す" : "サンプルを表示"}</button></div></section>
  <section class="card"><h2>別のJSONを読み込む</h2>
    <label class="filebtn" style="margin:6px 0 0;padding:14px"><input type="file" accept=".json,application/json" data-file="1">JSONファイルを選択</label></section>
  <p class="footnote">巡視記録アプリ ${APP_VER} ／ 端末ID ${DEV}</p>`;
}

/* ---------- シート ---------- */
function openSheet(html, full) {
  $("#sheet").className = full ? "full" : "";
  $("#sheet").innerHTML = html;
  $("#sheetWrap").hidden = false;
  document.body.classList.add("lock");
}
function closeSheet() {
  $("#sheetWrap").hidden = true;
  $("#sheet").innerHTML = "";
  document.body.classList.remove("lock");
}
function toast(t) {
  const el = $("#toast");
  el.textContent = t;
  el.classList.add("on");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("on"), 2200);
}

function sheetDetail(pid) {
  const p = IDX.pm[pid];
  if (!p) return;
  const s = IDX.sessions.find((x) => x.patrolId === pid),
    fy = p.fiscalYear,
    m = monthOf(p.date);
  const chk = ((DATA.records[fy] || {}).checklistResults || []).filter(
    (x) => x.month === m,
  );
  let meas = "";
  if (s) {
    const cats = [
      ...new Set(
        s.values.map(
          (v) => IDX.eq[IDX.itemById[v.itemId].equipmentId].category,
        ),
      ),
    ];
    meas = `<section class="card"><h2>測定値 <span class="prog">${s.values.length}項目</span></h2>${cats
      .map((c) => {
        const vs = s.values.filter(
          (v) => IDX.eq[IDX.itemById[v.itemId].equipmentId].category === c,
        );
        return `<h3>${esc(c)}</h3><table class="t">${vs
          .map((v) => {
            const it = IDX.itemById[v.itemId],
              pv = prevMeas(v.itemId, s.date);
            const dv = it.diffFromPrevious
              ? pv
                ? v.value - pv.value
                : (v.legacyDiffFromPrevious ?? null)
              : null;
            return `<tr><td>${esc(IDX.eq[it.equipmentId].nameKey)} <span class="mut">${esc(it.labelKey)}</span></td><td>${esc(valText(it, v.value))}${it.unit ? '<span class="mut"> ' + esc(hw(it.unit)) + "</span>" : ""}</td><td>${dv == null ? "" : pv ? sgn(dv) : `<i>${sgn(dv)}</i>`}</td></tr>`;
          })
          .join("")}</table>`;
      })
      .join("")}</section>`;
  }
  openSheet(
    `<div class="sh-h"><b>${jd(p.date)} の巡視</b><button data-act="closeSheet" aria-label="閉じる">✕</button></div><div class="sh-b">
    <section class="card"><h2>基本情報</h2>
      <div class="kv"><span>巡視者</span><b>${esc(p.regular.inspector || "–")}</b></div>
      <div class="kv"><span>結果</span><b>${esc(p.regular.result || "–")}</b></div>
      <div class="kv"><span>区分</span><b>${esc(p.categories.map((c) => kindLabel(c.kind, c.sub)).join("・") || "–")}</b></div>
      ${(p.priority.inspectors || []).length ? `<div class="kv"><span>同行者（重点欄の氏名）</span><b>${esc(p.priority.inspectors.join("、"))}</b></div>` : ""}
      <div class="kv"><span>記事欄</span><b style="text-align:left;font-weight:500">${esc(p.remarksText || "（記載なし）")}</b></div>
      ${p.incidentNote ? `<div class="kv"><span>事故・障害</span><b>${esc(p.incidentNote)}</b></div>` : ""}</section>
    ${meas}
    ${chk.length ? `<section class="card"><h2>巡視外確認（${m}月）</h2>${chk.map((c) => `<div class="kv"><span>${esc(tidy(IDX.chk[c.checkId].area))}／${esc(tidy(IDX.chk[c.checkId].action))}</span><b>${esc(M().codeTables.checkStatus[c.status] || c.status)}</b></div>`).join("")}</section>` : ""}
    </div>`,
    true,
  );
}
function sheetReview() {
  const r = reviewData(),
    d = S.draft;
  const cats = Object.keys(d.cats)
    .filter((k) => d.cats[k])
    .map((k) => kindLabel(...k.split(".")));
  const act = activeFor(d.date),
    nObs = act.filter((i) => {
      const o = d.watchObs[i.watchItemId];
      return (
        o && (o.valueNumber || o.valueChoice || o.valueText || o.skipReason)
      );
    }).length;
  openSheet(`<div class="sh-h"><b>保存の確認</b><button data-act="closeSheet" aria-label="閉じる">✕</button></div><div class="sh-b">
    <section class="card"><h2>内容</h2>
      <div class="kv"><span>巡視日</span><b>${jd(d.date)}</b></div><div class="kv"><span>巡視者</span><b>${esc(d.inspector || "（未入力）")}</b></div>
      <div class="kv"><span>区分</span><b>${esc(cats.join("・") || "–")}</b></div><div class="kv"><span>結果</span><b>${esc(d.result)}</b></div>
      ${d.cats["regular.measurement"] ? `<div class="kv"><span>測定値</span><b>${r.measN}/${r.measTotal}項目</b></div>` : ""}
      <div class="kv"><span>巡視外確認</span><b>${buildSession().checklist.length}件</b></div>
      <div class="kv"><span>季節管理</span><b>${Object.values(d.seasonal).filter(Boolean).length}件</b></div>
      <div class="kv"><span>所内電力</span><b>${M().powerMeters.filter((mt) => (d.power[mt.meterId] ?? "") !== "").length}件</b></div>
      <div class="kv"><span>重点の記録 / 変更</span><b>${nObs}件 / ${d.watchEvents.length}件</b></div>
      <div class="kv"><span>記事欄</span><b>${[...d.remarksText].length}字</b></div></section>
    ${r.blocks.length ? `<section class="card"><h2>修正が必要 <span class="badge err">${r.blocks.length}</span></h2><ul class="list err">${r.blocks.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></section>` : ""}
    ${r.warns.length || r.missing ? `<section class="card"><h2>確認してください <span class="badge warn">${r.warns.length + (r.missing ? 1 : 0)}</span></h2><ul class="list warn">${r.missing ? `<li>測定値が未入力の項目が ${r.missing}件あります</li>` : ""}${r.warns.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></section>` : ""}
    </div><div class="sh-f"><button class="btn" data-act="closeSheet">戻る</button><button class="btn pri" data-act="submit" ${r.blocks.length ? "disabled" : ""}>保存して書き出し</button></div>`);
}
function sheetDone(ss, text, name) {
  openSheet(`<div class="sh-h"><b>保存しました</b><button data-act="closeSheet" aria-label="閉じる">✕</button></div><div class="sh-b">
    <section class="card"><h2>書き出しファイル</h2><div class="kv"><span>ファイル名</span><b style="word-break:break-all">${esc(name)}</b></div><div class="kv"><span>サイズ</span><b>${fmt(new Blob([text]).size / 1024, 1)} KB</b></div>
      <p class="hint" style="margin-top:8px">元のJSONは書き換えていません。このファイルをBoxの受信箱へ保存すると、PC側で集約できます。</p>
      <div class="btnrow"><button class="btn pri" data-act="share">共有 / ダウンロード</button><button class="btn" data-act="copy">コピー</button></div>
      <details><summary>書き出し内容を見る</summary><pre>${esc(text)}</pre></details></section>
    <p class="hint">この端末では「巡視履歴」と前回値に反映済みです。</p></div>
    <div class="sh-f"><button class="btn pri" data-act="doneClose">閉じる</button></div>`);
  window.__last = { text, name };
}
function sheetWatchAdd() {
  const kinds_ = Object.entries(M().codeTables.patrolKinds.priority.sub).filter(
    ([k]) => k !== "reserved",
  );
  openSheet(`<div class="sh-h"><b>重点項目を追加</b><button data-act="closeSheet" aria-label="閉じる">✕</button></div><div class="sh-b">
    <p class="hint" style="margin-top:0">例: 定期巡視で61CBのガス圧の低下傾向を確認 → 次回以降の巡視で記録してトレンドを監視</p>
    <label class="fl" for="wa-kind">重点区分</label><select id="wa-kind">${kinds_.map(([k, v]) => `<option value="${k}" ${k === "other" ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
    <label class="fl" for="wa-eq">対象機器</label><select id="wa-eq"><option value="">（機器マスタにない・手入力）</option>${M()
      .equipment.map(
        (e) =>
          `<option value="${e.equipmentId}">${esc(e.nameKey)}（${esc(e.category)}）</option>`,
      )
      .join("")}</select>
    <input id="wa-name" placeholder="機器名（機器マスタにない場合）" style="margin-top:6px">
    <label class="fl" for="wa-part">部位（任意）</label><input id="wa-part" placeholder="例: ブッシング取付部">
    <label class="fl" for="wa-label">観測項目</label><input id="wa-label" placeholder="例: ガス圧">
    <div class="fl">記録の型</div>
    <div class="seg n3" id="wa-type">${[
      ["number", "数値"],
      ["choice", "進展の有無"],
      ["text", "テキスト"],
    ]
      .map(
        ([k, l]) =>
          `<button class="${S.waType === k ? "on" : ""}" data-act="waType" data-v="${k}">${l}</button>`,
      )
      .join("")}</div>
    <div id="wa-unitrow" ${S.waType === "number" ? "" : "hidden"}><label class="fl" for="wa-unit">単位</label><input id="wa-unit" placeholder="例: MPa"></div>
    <label class="fl" for="wa-reason">追加理由</label><textarea id="wa-reason" rows="2" placeholder="例: ガス圧の低下傾向を確認"></textarea>
    <div class="msg err" id="wa-err" style="margin-top:8px"></div></div>
    <div class="sh-f"><button class="btn" data-act="closeSheet">キャンセル</button><button class="btn pri" data-act="watchAddSubmit">追加</button></div>`);
}
function sheetWatchEnd(id) {
  const it = watchEff().find((i) => i.watchItemId === id);
  if (!it) return;
  openSheet(`<div class="sh-h"><b>重点管理から外す</b><button data-act="closeSheet" aria-label="閉じる">✕</button></div><div class="sh-b">
    <p style="margin:0 0 4px"><b>${esc(hw(it.target.name))}${it.target.part ? " / " + esc(it.target.part) : ""}</b><br><span class="mut">${esc(it.label)}</span></p>
    <p class="hint">項目は削除されず、終了日が入ります（履歴は残ります）。</p>
    <div class="chips">${["問題が解消", "傾向なし", "機器更新", "補修完了"].map((t) => `<button class="chip sm" data-act="endReason" data-t="${t}">${t}</button>`).join("")}</div>
    <label class="fl" for="we-reason">終了理由</label><textarea id="we-reason" rows="3" placeholder="終了の理由を記入"></textarea>
    <div class="msg err" id="we-err" style="margin-top:8px"></div></div>
    <div class="sh-f"><button class="btn" data-act="closeSheet">キャンセル</button><button class="btn pri" data-act="watchEndSubmit" data-id="${id}">終了する</button></div>`);
}

/* ====================================================================
   画面の部分更新・イベント・起動
   ==================================================================== */
let RAW = "";
function updProg() {
  const d = S.draft;
  if (!d) return;
  const set = (k, t, ok) => {
    const a = $("#p-" + k);
    if (a) {
      a.textContent = t;
      a.classList.toggle("ok", !!ok);
    }
    const b = $("#pg-" + k);
    if (b) b.textContent = t ? " " + t : "";
  };
  if (d.cats["regular.measurement"]) {
    const mi = measItems(),
      f = mi.filter((i) => (d.meas[i.itemId] ?? "") !== "").length;
    set("meas", `${f}/${mi.length}`, f === mi.length);
  } else set("meas", "");
  const pl = planned(monthOf(d.date)),
    cf = pl.filter((c) => d.checks[c.checkId]).length;
  set(
    "chk",
    pl.length ? `${cf}/${pl.length}` : "",
    pl.length && cf === pl.length,
  );
  const dir = seasonDir(monthOf(d.date));
  if (dir) {
    const sw = M().seasonalItems.filter(
        (s) =>
          s.type === "seasonalSwitch" &&
          !seasonDone(s.seasonalId, dir, fyOf(d.date)),
      ),
      n = sw.filter((s) => d.seasonal[s.seasonalId]).length;
    set("sea", `${n}/${sw.length}`, sw.length && n === sw.length);
  } else set("sea", "");
  const pn = M().powerMeters.filter(
    (mt) => (d.power[mt.meterId] ?? "") !== "",
  ).length;
  set(
    "pow",
    pn ? `${pn}/${M().powerMeters.length}` : "",
    pn === M().powerMeters.length,
  );
  const act = activeFor(d.date).filter(
    (i) => i.periods[i.periods.length - 1].startDate !== d.date,
  );
  const wn = act.filter((i) => {
    const o = d.watchObs[i.watchItemId];
    return o && (o.valueNumber || o.valueChoice || o.valueText || o.skipReason);
  }).length;
  set(
    "wat",
    act.length ? `${wn}/${act.length}` : "",
    act.length && wn === act.length,
  );
  const rl = [...d.remarksText].length;
  set("rem", rl ? `${rl}字` : "");
}
function updMeas(id) {
  const it = IDX.itemById[id],
    row = $("#r-" + id);
  if (!it || !row) return;
  const mt = measMeta(it);
  row.classList.remove("warn", "err", "ok", "empty");
  row.classList.add(mt.state);
  $("#m-" + id).innerHTML = mt.html;
  updProg();
}
function updPow(mid) {
  const mt = M().powerMeters.find((x) => x.meterId === mid),
    row = $("#pw-" + mid);
  if (!mt || !row) return;
  const p = powMeta(mt);
  row.classList.remove("warn", "err", "ok", "empty");
  row.classList.add(p.state);
  $("#pm-" + mid).innerHTML = p.html;
  updProg();
}
function updRem() {
  const n = [...S.draft.remarksText].length,
    el = $("#remCnt");
  if (el) {
    el.textContent = `${n}/500`;
    el.classList.toggle("over", n > 500);
  }
  updProg();
}

/* ---------- イベント ---------- */
document.addEventListener("input", (e) => {
  const t = e.target,
    d = S.draft;
  if (!d || !t.dataset) return;
  if (t.dataset.meas) {
    d.meas[t.dataset.meas] = t.value;
    updMeas(t.dataset.meas);
    touch();
    return;
  }
  if (t.dataset.pow) {
    d.power[t.dataset.pow] = t.value;
    updPow(t.dataset.pow);
    touch();
    return;
  }
  if (t.dataset.w) {
    const o = d.watchObs[t.dataset.w] || (d.watchObs[t.dataset.w] = {});
    o[t.dataset.k] = t.value;
    updProg();
    touch();
    return;
  }
  if (t.dataset.f && t.dataset.f !== "date") {
    d[t.dataset.f] = t.value;
    if (t.dataset.f === "remarksText") updRem();
    touch();
  }
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "f-date" && S.draft && t.value) {
    S.draft.date = t.value;
    syncPlan(S.draft);
    touch();
    render(true);
    return;
  }
  if (t.dataset && t.dataset.trend === "item") {
    S.trendItem = t.value;
    render(true);
    return;
  }
  if (t.dataset && t.dataset.trend === "fy") {
    S.pFY = +t.value;
    render(true);
    return;
  }
  if (t.dataset && t.dataset.file && t.files && t.files[0])
    readFile(t.files[0]);
});
$("#sheetWrap").addEventListener("click", (e) => {
  if (e.target.id === "sheetWrap") closeSheet();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#sheetWrap").hidden) closeSheet();
});

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act]");
  if (!t || t.disabled) return;
  const a = t.dataset.act,
    d = S.draft,
    ds = t.dataset;
  switch (a) {
    case "tab":
      S.tab = ds.k;
      render();
      break;
    case "start":
      ensureDraft();
      S.tab = "patrol";
      render();
      break;
    case "goto": {
      const el = $("#sec-" + ds.k);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      break;
    }
    case "pickInsp":
      d.inspector = ds.n;
      {
        const i = $("#f-insp");
        if (i) i.value = ds.n;
      }
      touch();
      break;
    case "kind":
      d.cats[ds.k] = !d.cats[ds.k];
      touch();
      render(true);
      break;
    case "result":
      d.result = ds.v;
      touch();
      render(true);
      break;
    case "measSel": {
      const it = IDX.itemById[ds.id];
      d.meas[ds.id] = String(d.meas[ds.id]) === ds.v ? "" : Number(ds.v);
      const row = $("#r-" + ds.id);
      if (row) row.outerHTML = measRow(it);
      updProg();
      touch();
      break;
    }
    case "chk":
      d.checks[ds.id] = ds.v;
      touch();
      render(true);
      break;
    case "sea":
      d.seasonal[ds.id] = !d.seasonal[ds.id];
      touch();
      render(true);
      break;
    case "wstat":
      d.watchObs[ds.id] = { ...(d.watchObs[ds.id] || {}), status: ds.v };
      touch();
      render(true);
      break;
    case "wchoice":
      d.watchObs[ds.id] = { ...(d.watchObs[ds.id] || {}), valueChoice: ds.v };
      touch();
      render(true);
      break;
    case "review":
      sheetReview();
      break;
    case "closeSheet":
      closeSheet();
      break;
    case "submit":
      doSubmit();
      break;
    case "share": {
      const r = await shareOrDownload(window.__last.name, window.__last.text);
      toast(
        r === "shared"
          ? "共有しました"
          : r === "downloaded"
            ? "ダウンロードしました"
            : "キャンセルしました",
      );
      break;
    }
    case "copy":
      copyText(window.__last.text);
      break;
    case "doneClose":
      closeSheet();
      break;
    case "detail":
      sheetDetail(ds.id);
      break;
    case "trendTab":
      S.trend = ds.v;
      render();
      break;
    case "pmeter":
      S.pMeter = ds.v;
      render(true);
      break;
    case "demoOn":
      setDemo(true);
      render(true);
      toast("架空のサンプルを表示しました");
      break;
    case "demoOff":
      setDemo(false);
      render(true);
      break;
    case "discard":
      if (confirm("下書きを破棄しますか？")) {
        S.draft = null;
        ls.del(K.draft);
        render();
      }
      break;
    case "resetAll":
      if (
        confirm(
          "この端末内の下書き・保存済みセッションをすべて消去します。よろしいですか？",
        )
      ) {
        [K.draft, K.sessions, K.demo].forEach(ls.del);
        S.draft = null;
        loadData(RAW, SRC);
        toast("消去しました");
      }
      break;
    case "exportAll": {
      const all = ls.get(K.sessions, []);
      const name = `sessions_${ymd(new Date()).replace(/-/g, "")}_${DEV}.json`;
      const r = await shareOrDownload(name, JSON.stringify(all, null, 2));
      toast(r === "aborted" ? "キャンセルしました" : "書き出しました");
      break;
    }
    case "watchAdd":
      ensureDraft();
      sheetWatchAdd();
      break;
    case "waType":
      S.waType = ds.v;
      $$("#wa-type button").forEach((b) =>
        b.classList.toggle("on", b.dataset.v === ds.v),
      );
      {
        const u = $("#wa-unitrow");
        if (u) u.hidden = ds.v !== "number";
      }
      break;
    case "watchAddSubmit":
      doWatchAdd();
      break;
    case "watchEnd":
      ensureDraft();
      sheetWatchEnd(ds.id);
      break;
    case "endReason": {
      const r = $("#we-reason");
      if (r) r.value = ds.t;
      break;
    }
    case "watchEndSubmit":
      doWatchEnd(ds.id);
      break;
  }
});

function doSubmit() {
  const d = S.draft,
    r = reviewData();
  if (r.blocks.length) return;
  const ss = buildSession(),
    text = JSON.stringify(ss, null, 2),
    name = `session_${ss.date.replace(/-/g, "")}_${DEV}.json`;
  const all = ls.get(K.sessions, []);
  all.push(ss);
  ls.set(K.sessions, all);
  ls.set(K.insp, d.inspector.trim());
  mergeSession(ss);
  buildIndex();
  S.draft = null;
  ls.del(K.draft);
  S.tab = "home";
  render();
  sheetDone(ss, text, name);
}
function doWatchAdd() {
  const d = S.draft,
    v = (id) => ($("#" + id) || {}).value || "";
  const eqId = v("wa-eq"),
    name = eqId ? IDX.eq[+eqId].name : v("wa-name").trim(),
    label = v("wa-label").trim(),
    part = v("wa-part").trim(),
    reason = v("wa-reason").trim();
  const err = !name
    ? "対象機器を選択するか、機器名を入力してください"
    : !label
      ? "観測項目を入力してください"
      : !reason
        ? "追加理由を入力してください"
        : "";
  if (err) {
    $("#wa-err").textContent = err;
    return;
  }
  const n = d.watchEvents.filter((x) => x.type === "add").length + 1,
    dd = d.date.replace(/-/g, "");
  d.watchEvents.push({
    eventId: `EV-${dd}-${DEV}-${d.watchEvents.length + 1}`,
    type: "add",
    at: new Date().toISOString(),
    by: d.inspector.trim() || "(未入力)",
    date: d.date,
    watchItemId: `PW-${dd}-${DEV}-${n}`,
    payload: {
      priorityKind: v("wa-kind"),
      target: { equipmentId: eqId ? +eqId : null, name, part: part || null },
      label,
      valueType: S.waType,
      unit: S.waType === "number" ? v("wa-unit").trim() || null : null,
      decimals: null,
      reason,
    },
  });
  touch();
  closeSheet();
  render(true);
  toast("重点項目を追加しました（保存時に書き出されます）");
}
function doWatchEnd(id) {
  const d = S.draft,
    reason = (($("#we-reason") || {}).value || "").trim();
  if (!reason) {
    $("#we-err").textContent = "終了理由を入力してください";
    return;
  }
  d.watchEvents.push({
    eventId: `EV-${d.date.replace(/-/g, "")}-${DEV}-${d.watchEvents.length + 1}`,
    type: "end",
    at: new Date().toISOString(),
    by: d.inspector.trim() || "(未入力)",
    date: d.date,
    watchItemId: id,
    payload: { reason },
  });
  touch();
  closeSheet();
  render(true);
  toast("重点管理から外しました（保存時に書き出されます）");
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("コピーしました");
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast("コピーしました");
    } catch (_) {
      toast("コピーできませんでした");
    }
    ta.remove();
  }
}

/* ---------- 起動 ---------- */
function showLoader(msg) {
  $("#appbar").innerHTML =
    '<div class="t"><h1>巡視記録</h1><div class="sub">データの読み込み</div></div><span class="mock">MOCK</span>';
  $("#tabbar").hidden = true;
  $("#actbar").hidden = true;
  $("#view").className = "";
  $("#view").innerHTML =
    `<div class="loader card"><h1>JSONを読み込めませんでした</h1>
    <p class="mut">${esc(msg || `同じフォルダの ${JSON_NAMES[0]} を自動で読み込めませんでした。HTMLファイルを直接開いた場合など、ブラウザの制限で起こります。`)}</p>
    <label class="filebtn"><input type="file" accept=".json,application/json" data-file="1">JSONファイルを選択<br><span style="font-weight:400;font-size:12.5px">${esc(JSON_NAMES[0])}</span></label>
    <p class="hint">Webサーバー（社内サイトなど）に同じフォルダで置いた場合は、選択なしで自動的に読み込まれます。</p></div>`;
}
function readFile(f) {
  const r = new FileReader();
  r.onload = () => loadData(String(r.result), f.name);
  r.onerror = () => showLoader("ファイルを読み込めませんでした");
  r.readAsText(f);
}
function loadData(text, src) {
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    showLoader("JSONとして読み込めませんでした: " + e.message);
    return;
  }
  if (!j.master || !j.records) {
    showLoader(
      "このJSONは巡視記録の統合ファイルではありません（master / records がありません）",
    );
    return;
  }
  DATA = j;
  SRC = src;
  RAW = text;
  DATA.priorityWatch = DATA.priorityWatch || { items: [], observations: [] };
  DATA.powerMeterReadings = DATA.powerMeterReadings || {
    readingsByFiscalYear: {},
  };
  if (ls.get(K.demo, false)) setDemo(true);
  buildIndex();
  ls.get(K.sessions, []).forEach(mergeSession);
  buildIndex();
  S.draft = ls.get(K.draft, null);
  if (S.draft && S.draft.v !== 1) S.draft = null;
  render();
}
async function boot() {
  for (const n of JSON_NAMES) {
    try {
      const r = await fetch(n, { cache: "no-store" });
      if (r.ok) {
        loadData(await r.text(), n);
        return;
      }
    } catch (e) {}
  }
  showLoader();
}
boot();
