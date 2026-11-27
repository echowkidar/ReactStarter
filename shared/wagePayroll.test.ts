// Run: npx tsx --test shared/wagePayroll.test.ts
// Fixtures: the Accounts Section's November 2026 wage sheet (test data.xlsx). EPF / MAS on or off
// as in that sheet. The Semi-skilled row is checked at the notified 494 + 300 (the sheet had 498 + 304).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateLine, DEFAULT_STATUTORY, DEFAULT_WAGE_RATES, inForceOn, categoryFromDesignation,
  validateWageRates, validateStatutory, type WageCategory,
} from "./wagePayroll";

const S = DEFAULT_STATUTORY[0];
const R = DEFAULT_WAGE_RATES[0];
const CAT: Record<string, WageCategory> = { "UNSKILLED": "unskilled", "CLERICAL/SKILLED": "clerical_skilled", "SEMI SKILLED": "semi_skilled" };

// epid, sheet designation, days, EPF on, MAS on, expected gross, EPF, MAS, net, employer EPF
const ROWS: [string, string, number, boolean, boolean, number, number, number, number, number][] = [
  ["R0018", "UNSKILLED", 30, true, false, 21120, 2535, 0, 18585, 2746],
  ["R0019", "CLERICAL/SKILLED", 30, false, false, 27990, 0, 0, 27990, 0],
  ["R0020", "UNSKILLED", 30, true, false, 21120, 2535, 0, 18585, 2746],
  ["R0021", "UNSKILLED", 30, true, false, 21120, 2535, 0, 18585, 2746],
  ["R0022", "UNSKILLED", 30, true, false, 21120, 2535, 0, 18585, 2746],
  ["R0023", "UNSKILLED", 30, true, false, 21120, 2535, 0, 18585, 2746],
  ["R0024", "UNSKILLED", 30, true, false, 21120, 2535, 0, 18585, 2746],
  ["R0025", "UNSKILLED", 30, true, false, 21120, 2535, 0, 18585, 2746],
  ["R0026", "UNSKILLED", 30, true, false, 21120, 2535, 0, 18585, 2746],
  ["R0027", "UNSKILLED", 30, true, false, 21120, 2535, 0, 18585, 2746],
  ["R0028", "UNSKILLED", 30, true, false, 21120, 2535, 0, 18585, 2746],
  ["R0029", "UNSKILLED", 25, true, false, 17600, 2112, 0, 15488, 2288],
  ["R0030", "UNSKILLED", 29, true, false, 20416, 2450, 0, 17966, 2655],
  ["R0031", "UNSKILLED", 22, true, false, 15488, 1859, 0, 13629, 2014],
  ["R0001", "CLERICAL/SKILLED", 30, false, false, 27990, 0, 0, 27990, 0],
  ["R0002", "CLERICAL/SKILLED", 30, false, false, 27990, 0, 0, 27990, 0],
  ["R0003", "CLERICAL/SKILLED", 30, false, false, 27990, 0, 0, 27990, 0],
  ["R0004", "UNSKILLED", 30, true, false, 21120, 2535, 0, 18585, 2746],
  ["R0005", "CLERICAL/SKILLED", 26, false, false, 24258, 0, 0, 24258, 0],
  ["R0084", "CLERICAL/SKILLED", 30, true, true, 27990, 3000, 125, 24865, 3250],
  ["R0085", "CLERICAL/SKILLED", 30, true, true, 27990, 3000, 125, 24865, 3250],
  ["R0086", "SEMI SKILLED", 30, false, true, 23820, 0, 125, 23695, 0], // sheet: 24060 / 23935 at 498+304
  ["R0087", "CLERICAL/SKILLED", 30, true, false, 27990, 3000, 0, 24990, 3250],
  ["R0088", "UNSKILLED", 30, true, true, 21120, 2535, 125, 18460, 2746],
  ["R0082", "CLERICAL/SKILLED", 30, true, true, 27990, 3000, 125, 24865, 3250],
  ["R0083", "CLERICAL/SKILLED", 30, true, false, 27990, 3000, 0, 24990, 3250],
];

test("reproduces the Accounts Section's November 2026 sheet", () => {
  for (const [epid, desig, days, epf, mas, gross, eEpf, eMas, net, erEpf] of ROWS) {
    const rate = R[CAT[desig]];
    const r = calculateLine({ basic: rate.basic, vda: rate.vda, days, epf, esi: false, mas }, S);
    assert.equal(r.gross, gross, `${epid} gross`);
    assert.equal(r.epf, eEpf, `${epid} EPF`);
    assert.equal(r.esi, 0, `${epid} ESI`);
    assert.equal(r.mas, eMas, `${epid} MAS`);
    assert.equal(r.net, net, `${epid} net`);
    assert.equal(r.erEpfTotal, erEpf, `${epid} employer EPF`);
  }
});

test("EPF is capped at the ₹25,000 ceiling", () => {
  const r = calculateLine({ basic: 579, vda: 354, days: 31, epf: true, esi: false, mas: false }, S);
  assert.equal(r.gross, 28923);
  assert.equal(r.epfBase, 25000);
  assert.equal(r.epf, 3000);
  assert.equal(r.erEpfTotal, 3250);
  assert.equal(r.erEps, 2083);           // 8.33% of 25,000 = 2,082.50 → up
  assert.equal(r.erEps + r.erEpf, 3000); // employer 12% split EPS + EPF
});

test("ESI: 0.75% / 3.25% within the ₹21,000 ceiling, only if covered above it", () => {
  const within = calculateLine({ basic: 437, vda: 267, days: 29, epf: false, esi: true, mas: false }, S); // 20,416
  assert.equal(within.esi, 154);   // 153.12 → up
  assert.equal(within.erEsi, 664); // 663.52 → up
  const above = calculateLine({ basic: 437, vda: 267, days: 30, epf: false, esi: true, mas: false }, S); // 21,120
  assert.equal(above.esi, 0);
  assert.equal(above.esiAboveCeiling, true);
  const covered = calculateLine({ basic: 437, vda: 267, days: 30, epf: false, esi: true, esiCovered: true, mas: false }, S);
  assert.equal(covered.esi, 159);  // 158.40 → up
  assert.equal(covered.erEsi, 687);
});

test("nearest-rupee rounding when chosen", () => {
  const r = calculateLine({ basic: 437, vda: 267, days: 30, epf: true, esi: false, mas: false }, { ...S, rounding: "nearest" });
  assert.equal(r.epf, 2534);       // 2,534.40 → 2,534
  assert.equal(r.erEpfTotal, 2746);
});

test("no days → nothing", () => {
  const r = calculateLine({ basic: 579, vda: 354, days: 0, epf: true, esi: true, mas: true }, S);
  assert.deepEqual([r.gross, r.epf, r.esi, r.mas, r.net], [0, 0, 0, 0, 0]);
});

test("rates in force by date", () => {
  const sets = [{ ...R, from: "2026-11-01" }, { ...R, from: "2027-04-01", unskilled: { basic: 450, vda: 280 } }];
  assert.equal(inForceOn(sets, "2026-12-01")!.unskilled.basic, 437);
  assert.equal(inForceOn(sets, "2027-04-01")!.unskilled.basic, 450);
  assert.equal(inForceOn(sets, "2026-01-01")!.from, "2026-11-01"); // before all → earliest
});

test("category from designation", () => {
  assert.equal(categoryFromDesignation("DAILY WAGE (UN-SKILLED)"), "unskilled");
  assert.equal(categoryFromDesignation("Semi Skilled"), "semi_skilled");
  assert.equal(categoryFromDesignation("CLERICAL/SKILLED"), "clerical_skilled");
  assert.equal(categoryFromDesignation("ASSISTANT"), null);
});

test("settings validation", () => {
  assert.equal(validateWageRates(DEFAULT_WAGE_RATES), null);
  assert.equal(validateStatutory(DEFAULT_STATUTORY), null);
  assert.match(validateWageRates([{ from: "x" }])!, /From date/);
  assert.match(validateStatutory([{ ...S, rounding: "down" }])!, /Rounding/);
});

test("fixed monthly wages: full month pays the full amount, fewer days pro rata", () => {
  const base = { basic: 0, vda: 0, epf: true, esi: false, mas: false, monthlyFixed: 18000, daysInMonth: 30 };
  const full = calculateLine({ ...base, days: 30 }, S);
  assert.equal(full.gross, 18000);
  assert.equal(full.epf, 2160); // 12% of 18,000
  assert.equal(full.ratePerDay, 600);
  const part = calculateLine({ ...base, days: 28 }, S);
  assert.equal(part.gross, 16800); // 18,000 × 28 / 30
  // 31-day month, 30 days worked: 18,000 × 30 / 31 = 17,419.35 → rounded up
  assert.equal(calculateLine({ ...base, days: 30, daysInMonth: 31 }, S).gross, 17420);
  // no fixed amount → day rate as before
  assert.equal(calculateLine({ ...base, monthlyFixed: null, basic: 437, vda: 267, days: 10 }, S).gross, 7040);
});
