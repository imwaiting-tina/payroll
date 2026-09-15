// 从 kimi_data.js 提取「考勤数据」板块所需字段，生成前端静态数据模块。
// 注意：kimi_data.js 结构为 `const DATA = {...};\nDATA.archive = {...};`
// 因此不能简单用 lastIndexOf('}')，而应只截取首个 `const DATA = {...};` 对象。
const fs = require('fs');

const src = fs.readFileSync('C:/Users/admin/kimi_data.js', 'utf8');
const start = src.indexOf('{');

// 首个对象以 `};` 结束，之后是 `DATA.archive = ...`。以 `DATA.archive` 为分界，
// 截取其之前的字符串，再剥离结尾的 `;` 与空白，得到干净的对象 JSON。
const splitAt = src.indexOf('DATA.archive');
if (splitAt < 0) throw new Error('未找到 DATA.archive 分界');
let objSrc = src.slice(start, splitAt).trim();
if (objSrc.endsWith(';')) objSrc = objSrc.slice(0, -1).trim();

const DATA = JSON.parse(objSrc);

const keys = ['trend', 'empYears', 'balance', 'missOverview', 'missDetail', 'offsys', 'leaveMix'];
const out = {};
for (const k of keys) {
  if (DATA[k] === undefined) {
    console.error('MISSING KEY:', k);
    process.exit(1);
  }
  out[k] = DATA[k];
}

const body = JSON.stringify(out);
const header = `// 历史考勤数据（2021.03–2026.05），数据来源《202103-202605考勤汇总.xlsx》。
// 统计周期跨度较大，历史数据的完整性与准确性可能存在一定偏差，统计结果仅供参考。
/* eslint-disable */
export const ATTENDANCE_HISTORY = `;

const target = 'C:/Users/admin/payroll/frontend/src/pages/attendanceHistoryData.ts';
fs.writeFileSync(target, header + body + ';\n', 'utf8');
console.log('OK wrote', target, 'bytes=', fs.statSync(target).size);
console.log('keys:', Object.keys(out).join(', '));
