/**
 * 唯一值生成 — 姓名 + 发薪公司简称 + 入职日期 的 SHA256 前 16 位十六进制。
 * 发薪公司用简称（保证"开弈中国"和"开弈中国-美元"分开），入职日期不可变。
 */

/** 把各种日期格式统一成 YYYY-MM-DD，空值返回空字符串 */
function normalizeDate(d: any): string {
  if (!d) return '';
  const s = String(d).trim();
  // 匹配 YYYY-MM-DD（可能带时间）
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // 匹配 YYYY/M/D 斜杠格式（Excel raw:false 会读出 2026/6/1，无补零）
  const slash = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slash) return `${slash[1]}-${String(slash[2]).padStart(2, '0')}-${String(slash[3]).padStart(2, '0')}`;
  // 匹配 YYYY-M-D 无补零横杠
  const shortDash = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (shortDash) return `${shortDash[1]}-${String(shortDash[2]).padStart(2, '0')}-${String(shortDash[3]).padStart(2, '0')}`;
  // 匹配 Excel 日期序列号（纯数字，如 44927）
  if (/^\d{5}$/.test(s)) {
    const date = new Date(Date.UTC(1899, 11, 30) + parseInt(s, 10) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  return s;
}

export async function genUniqueHash(name: string, payCompanyShortName: string, entryDate?: any): Promise<string> {
  const ed = normalizeDate(entryDate);
  const text = `${name}|${payCompanyShortName}|${ed}`;
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // 取前 8 字节 = 16 位十六进制
  return hashArray
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 同步版本（纯 JS 兜底，非 Web Crypto） */
export function genUniqueHashSync(name: string, payCompanyShortName: string, entryDate?: any): string {
  const ed = normalizeDate(entryDate);
  const text = `${name}|${payCompanyShortName}|${ed}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 16);
}
