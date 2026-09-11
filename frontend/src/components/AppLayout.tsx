import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Layout, Menu, Typography, Avatar, Dropdown, Button, message, Tag, Input, Modal, Progress } from 'antd';
import {
  TeamOutlined, DollarOutlined, CalculatorOutlined,
  LogoutOutlined, ScheduleOutlined, SyncOutlined,
  UserOutlined, SettingOutlined, SafetyCertificateOutlined, PercentageOutlined, PlusCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { globalRefresh } from '../utils/globalRefresh';
import { useStore } from '../stores/appStore';
import { getRole, ROLE_LABELS, ROLE_COLORS, type Role, isRosterApprover, isAttendanceApprover, isPayrollApprover } from '../utils/permissions';
import { fetchApprovalStatus } from '../utils/approvalStatus';
import { ensureRoster } from '../utils/roster';
import api from '../api/client';

const { Header, Sider, Content } = Layout;

const ALL_MENU = [
  { key: '/', icon: <CalculatorOutlined />, label: '数据总览' },
  { key: '/employees', icon: <TeamOutlined />, label: '员工花名册' },
  { key: '/social', icon: <SafetyCertificateOutlined />, label: '社保管理' },
  { key: '/attendance', icon: <ScheduleOutlined />, label: '考勤管理' },
  { key: '/tax', icon: <PercentageOutlined />, label: '个税扣缴' },
  { key: '/additional', icon: <PlusCircleOutlined />, label: '附加薪酬' },
  { key: '/payroll', icon: <DollarOutlined />, label: '薪资计算' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
];

// 各角色可见菜单（key 列表）
// 三类审批人只是"负责审批的动作不同"，但都能查看所有页面；人事专员/管理员同样全量可见。
const ALL_KEYS = ALL_MENU.map(m => m.key);
const ROLE_MENU: Record<Role, string[]> = {
  admin: ALL_KEYS,
  hr_staff: ALL_KEYS,
  roster_approver: ALL_KEYS,
  attendance_approver: ALL_KEYS,
  payroll_approver: ALL_KEYS,
};

// 根据角色过滤菜单
const getMenuItems = () => {
  const role = getRole();
  const allowed = ROLE_MENU[role] || ROLE_MENU.hr_staff;
  return ALL_MENU.filter(m => allowed.includes(m.key));
};

interface AppLayoutProps {
  children: React.ReactNode;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 220;

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [siderWidth, setSiderWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStep, setRefreshStep] = useState('');
  // 当前月份薪资是否已锁定（薪资审批通过后，全局刷新应禁用）
  const [payrollLockedForPeriod, setPayrollLockedForPeriod] = useState(false);
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);
  // 审批提醒弹窗
  const [approvalAlert, setApprovalAlert] = useState<{ title: string; alerts: { text: string; path: string }[] } | null>(null);
  // 全局月份：所有模块共用，切换不重置
  const currentPeriod = useStore(s => s.currentPeriod);
  const setCurrentPeriod = useStore(s => s.setCurrentPeriod);
  // 当前用户角色
  const role = getRole();
  const roleLabel = ROLE_LABELS[role];

  // 审批提醒：审批人登录/切月时，检测对应模块是否有"已提交审批"，若有则弹醒目提示
  useEffect(() => {
    const checkApprovalAlert = async () => {
      try {
        // 确保花名册已生成，避免拉空
        await ensureRoster(currentPeriod);
        const status = await fetchApprovalStatus(currentPeriod);
        const alerts: { text: string; path: string }[] = [];
        if (isRosterApprover() && status.rosterSubmitted && !status.rosterLocked) {
          alerts.push({ text: '人事专员已提交【员工花名册】的审批', path: '/employees' });
        }
        if (isAttendanceApprover() && status.attendanceSubmitted && !status.attendanceLocked) {
          alerts.push({ text: '人事专员已提交【考勤管理】的审批', path: '/attendance' });
        }
        if (isPayrollApprover() && status.payrollSubmitted && !status.payrollLocked) {
          alerts.push({ text: '人事专员已提交【薪资计算】的审批', path: '/payroll' });
        }
        if (alerts.length > 0) {
          setApprovalAlert({ title: '待审批提醒', alerts });
        }
        // 当前月份薪资是否已锁定（审批通过后）
        setPayrollLockedForPeriod(status.payrollLocked);
      } catch { /* 忽略，不影响使用 */ }
    };
    checkApprovalAlert();
  }, [currentPeriod, role]);

  // 社保管理有两个子页面，需要高亮父菜单
  const selectedKey = location.pathname.startsWith('/social')
    ? '/social'
    : location.pathname;

  const handleLogout = () => {
    localStorage.removeItem('supabase_token');
    navigate('/login');
  };

  // 全局刷新：只刷新【顶部选择的月份】，按 考勤→社保→个税→实习生→薪资 重算
  const handleGlobalRefresh = async () => {
    if (refreshing) return;
    if (!currentPeriod) return;
    setRefreshing(true);
    setRefreshStep('正在准备...');
    try {
      const result = await globalRefresh(currentPeriod, (step, index, total) => {
        setRefreshStep(`正在处理 ${step}（${index + 1}/${total}）...`);
      });
      const lines = result.steps
        .map(s => `${s.step}：成功 ${s.success}${s.skipped > 0 ? `，跳过 ${s.skipped}` : ''}`)
        .join('；');
      message.success(`全局刷新完成｜${lines}`, 6);
    } catch (e: any) {
      message.error(e?.message || '全局刷新失败', 5);
    } finally {
      setRefreshing(false);
      setRefreshStep('');
    }
  };

  // 拖动分隔条调整菜单栏宽度
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = { x: e.clientX, width: siderWidth };
    setDragging(true);

    const onMove = (ev: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const delta = ev.clientX - start.x;
      let next = start.width + delta;
      if (next < MIN_WIDTH) next = MIN_WIDTH;
      if (next > MAX_WIDTH) next = MAX_WIDTH;
      setSiderWidth(next);
    };

    const onUp = () => {
      dragStartRef.current = null;
      setDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [siderWidth]);

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={siderWidth}
        collapsedWidth={64}
        style={{ background: '#001529', position: 'relative', overflow: 'auto' }}
      >
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Typography.Text style={{ color: '#fff', fontSize: collapsed ? 14 : 16, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {collapsed ? '开弈' : '开弈集团薪酬系统'}
          </Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={getMenuItems()}
          onClick={({ key }) => navigate(key)}
        />

        {/* 可拖动分隔条 */}
        <div
          onMouseDown={onDragStart}
          style={{
            position: 'absolute',
            top: 0,
            right: -3,
            width: 6,
            height: '100%',
            cursor: 'col-resize',
            zIndex: 10,
            backgroundColor: dragging ? 'rgba(59,125,216,0.5)' : 'transparent',
            transition: dragging ? 'none' : 'background-color 0.15s',
          }}
          onMouseEnter={(e) => { if (!dragging) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(59,125,216,0.3)'; }}
          onMouseLeave={(e) => { if (!dragging) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
        />
      </Sider>

      <Layout style={{ height: '100%', overflow: 'hidden' }}>
        <Header style={{
          background: '#fff', padding: '0 24px', display: 'flex',
          justifyContent: 'flex-end', alignItems: 'center', gap: 16,
          borderBottom: '1px solid #f0f0f0',
          height: 56,
          flexShrink: 0,
        }}>
          {/* 全局月份选择器：切换后所有模块共用该月份，切模块不重置 */}
          <span style={{ color: '#666' }}>月份：</span>
          <Input type="month" value={currentPeriod} onChange={e => setCurrentPeriod(e.target.value)} style={{ width: 150 }} />
          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={handleGlobalRefresh}
            loading={refreshing}
            disabled={payrollLockedForPeriod}
            title={payrollLockedForPeriod ? '该月薪资已审批通过并冻结，不能全局刷新' : ''}
          >
            全局刷新
          </Button>
          {refreshing && refreshStep && (
            <span style={{ color: '#666', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Progress percent={100} status="active" size="small" style={{ width: 120 }} showInfo={false} />
              {refreshStep}
            </span>
          )}
          <Dropdown menu={{
            items: [
              { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
            ],
            onClick: ({ key }) => { if (key === 'logout') handleLogout(); },
          }}>
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <span>HR</span>
              <Tag color={ROLE_COLORS[role]} style={{ marginInlineEnd: 0 }}>{roleLabel}</Tag>
            </div>
          </Dropdown>
        </Header>

        <Content style={{ margin: 16, padding: '16px 24px', background: '#fff', borderRadius: 8, overflow: 'auto' }}>
          {children}
        </Content>
      </Layout>

      {/* 审批提醒弹窗 */}
      <Modal
        title={approvalAlert?.title}
        open={!!approvalAlert}
        onOk={() => setApprovalAlert(null)}
        onCancel={() => setApprovalAlert(null)}
        footer={[
          <Button key="later" onClick={() => setApprovalAlert(null)}>稍后处理</Button>,
        ]}
      >
        <div style={{ fontSize: 14, color: '#cf1322', fontWeight: 500, marginBottom: 8 }}>
          有 {approvalAlert?.alerts.length} 个模块等待审批：
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {approvalAlert?.alerts.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #ffccc7', borderRadius: 8, padding: '10px 12px', background: '#fff7f6', gap: 12 }}>
              <span style={{ fontSize: 15 }}>{a.text}</span>
              <Button type="primary" size="small" onClick={() => { setApprovalAlert(null); navigate(a.path); }}>
                现在处理
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </Layout>
  );
};

export default AppLayout;
