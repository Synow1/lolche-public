#!/usr/bin/env node
/**
 * build_power.py (Python) 와 site/src/360_power.js (JS) 의 boardPower() 계산 일치 검사.
 * site/power_top.json 에 저장된 Python 계산 결과(val, pw, pred)와
 * 360_power.js 의 boardPower() 결과를 모든 샘플 보드에 대해 대조한다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const MODELS = [
  ['power.json', 'power_top.json'],
  ['power_s19.json', 'power_top_s19.json'],
];
const JS_SRC = fs.readFileSync(path.join(SITE, 'src', '360_power.js'), 'utf8');
const start = JS_SRC.indexOf('function pwKey');
const end = JS_SRC.indexOf('function pwClsP');
if (start < 0 || end < 0) {
  console.error('오류: 360_power.js 에서 boardPower 계산 블록을 찾지 못했습니다.');
  process.exit(1);
}
const snippet = JS_SRC.slice(start, end) + '\n;({ boardPower, pwKey });';

let totalChecked = 0;
const mismatches = [];

for (const [pFile, tFile] of MODELS) {
  const pPath = path.join(SITE, pFile), tPath = path.join(SITE, tFile);
  if (!fs.existsSync(pPath) || !fs.existsSync(tPath)) continue;
  const POWER = JSON.parse(fs.readFileSync(pPath, 'utf8'));
  const TOP = JSON.parse(fs.readFileSync(tPath, 'utf8'));
  if (POWER.off) continue;
  const sandbox = {
    POWER,
    POWER_S19: null,
    apiUnit: () => null,
    Math,
    Object,
    String,
    Array,
  };
  const { boardPower } = vm.runInNewContext(snippet, sandbox);
  let checked = 0;
  for (const [band, rows] of Object.entries(TOP.top || {})) {
    if (!Array.isArray(rows)) continue;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const units = (r.u || []).map(([character_id, tier, itemNames]) => ({
        character_id,
        tier,
        itemNames: itemNames || [],
      }));
      const traits = (r.tr || []).map(([name, tier_current, num_units]) => ({
        name,
        tier_current,
        num_units,
      }));
      const got = boardPower(units, traits, r.lv);
      checked++; totalChecked++;
      if (!got) {
        mismatches.push(`${pFile}:${band}[${i}] (${r.who}): boardPower returned null`);
        continue;
      }
      const valDiff = Math.abs((got.val || 0) - (r.val || 0));
      const pwDiff = Math.abs((got.power || 0) - (r.pw || 0));
      const predDiff = Math.abs(Math.round((got.pred || 0) * 10) / 10 - (r.pred || 0));
      if (valDiff > 0 || pwDiff > 1 || predDiff > 0.11) {
        mismatches.push(
          `${pFile}:${band}[${i}] (${r.who}): val py=${r.val} js=${got.val} | pw py=${r.pw} js=${got.power} | pred py=${r.pred} js=${got.pred.toFixed(2)}`
        );
      }
    }
  }
  if (checked === 0) {
    console.error(`오류: 검사할 샘플 보드가 없습니다 (${tFile} 확인).`);
    process.exit(1);
  }
}

if (mismatches.length) {
  console.error(`덱파워 Python-JS 불일치 ${mismatches.length}/${totalChecked}건:`);
  mismatches.slice(0, 10).forEach((m) => console.error('  - ' + m));
  process.exit(1);
}

console.log(`덱파워 Python-JS 일치 검사 통과 (${totalChecked}개 보드 대조 완료)`);
