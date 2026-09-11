/**
 * 数据统计 Summary 导出 PDF
 * 生成一个 PDF 文件，包含两页：按公司汇总 + 按部门汇总
 *
 * 中文乱码解决方案：不用 jsPDF 的字体（对 CFF 字体支持差），
 * 而是用 html2canvas 把表格渲染成图片，再放进 PDF —— 浏览器自己画中文，永不乱码。
 */
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export interface SummaryRow {
  group: string;
  count: number;
  net: number;
  company_welfare: number;
  personal_welfare: number;
  perf_comm: number;
  attendance_adjust: number;
  insurance: number;
  provision: number;
  total_cost: number;
}

const money = (v: number): string => {
  if (v === undefined || v === null || Number(v) === 0) return '—';
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** 生成一张汇总表 HTML（用于渲染成图片） */
function buildTableHtml(title: string, subtitle: string, groupLabel: string, rows: SummaryRow[]): string {
  const columns = [groupLabel, '人数', '实收工资', '公司福利', '个人福利', '绩效&佣金', '考勤调整', '商保金额', '预提福利费', '人力成本总计'];
  const sum = (key: keyof SummaryRow) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

  const headCells = columns.map(c => `<th>${c}</th>`).join('');

  const bodyRows = rows.map(r => `
    <tr>
      <td class="left">${r.group}</td>
      <td class="center">${r.count || 0}</td>
      <td class="right">${money(r.net)}</td>
      <td class="right">${money(r.company_welfare)}</td>
      <td class="right">${money(r.personal_welfare)}</td>
      <td class="right">${money(r.perf_comm)}</td>
      <td class="right">${money(r.attendance_adjust)}</td>
      <td class="right">${money(r.insurance)}</td>
      <td class="right">${money(r.provision)}</td>
      <td class="right">${money(r.total_cost)}</td>
    </tr>`).join('');

  const totalRow = `
    <tr class="total">
      <td class="left">合计</td>
      <td class="center">${sum('count')}</td>
      <td class="right">${money(sum('net'))}</td>
      <td class="right">${money(sum('company_welfare'))}</td>
      <td class="right">${money(sum('personal_welfare'))}</td>
      <td class="right">${money(sum('perf_comm'))}</td>
      <td class="right">${money(sum('attendance_adjust'))}</td>
      <td class="right">${money(sum('insurance'))}</td>
      <td class="right">${money(sum('provision'))}</td>
      <td class="right">${money(sum('total_cost'))}</td>
    </tr>`;

  return `
    <div style="font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif; padding: 20px; background: #fff;">
      <div style="font-size: 18px; font-weight: 700; color: #1f2937; margin-bottom: 4px;">${title}</div>
      <div style="font-size: 12px; color: #888; margin-bottom: 12px;">${subtitle}</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background: #1e3a5f; color: #fff;">${headCells}</tr>
        </thead>
        <tbody>
          ${bodyRows}
          ${totalRow}
        </tbody>
      </table>
      <style>
        th, td { border: 1px solid #e6e9ef; padding: 6px 8px; }
        th { font-weight: 600; }
        .left { text-align: left; }
        .center { text-align: center; }
        .right { text-align: right; font-variant-numeric: tabular-nums; }
        .total td { background: #f5f7fa; font-weight: 700; }
      </style>
    </div>`;
}

async function tableToImage(doc: jsPDF, html: string): Promise<{ imgData: string; width: number; height: number }> {
  // 离屏容器渲染
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '1200px';
  container.style.background = '#fff';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });
    const imgData = canvas.toDataURL('image/png');
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    // 图片按页面宽度适配，保留边距
    const margin = 10;
    const maxW = pageW - margin * 2;
    const ratio = canvas.height / canvas.width;
    const width = maxW;
    const height = width * ratio;
    return { imgData, width, height };
  } finally {
    document.body.removeChild(container);
  }
}

export async function exportSummaryPdf(companyRows: SummaryRow[], deptRows: SummaryRow[], period: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const subtitle = `数据期间：${period}　·　金额单位：元`;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;

  // 第一页：按公司
  const img1 = await tableToImage(doc, buildTableHtml('数据统计 Summary — 按公司', subtitle, '发薪公司', companyRows));
  let x = (pageW - img1.width) / 2;
  let y = margin;
  // 如果图太高，等比缩到一页内
  if (img1.height > pageH - margin * 2) {
    const scale = (pageH - margin * 2) / img1.height;
    const w2 = img1.width * scale;
    x = (pageW - w2) / 2;
    doc.addImage(img1.imgData, 'PNG', x, y, w2, img1.height * scale);
  } else {
    doc.addImage(img1.imgData, 'PNG', x, y, img1.width, img1.height);
  }

  // 第二页：按部门
  doc.addPage();
  const img2 = await tableToImage(doc, buildTableHtml('数据统计 Summary — 按部门', subtitle, '成本中心/部门', deptRows));
  let x2 = (pageW - img2.width) / 2;
  if (img2.height > pageH - margin * 2) {
    const scale = (pageH - margin * 2) / img2.height;
    const w2 = img2.width * scale;
    x2 = (pageW - w2) / 2;
    doc.addImage(img2.imgData, 'PNG', x2, margin, w2, img2.height * scale);
  } else {
    doc.addImage(img2.imgData, 'PNG', x2, margin, img2.width, img2.height);
  }

  doc.save(`数据统计Summary_${period}.pdf`);
}
