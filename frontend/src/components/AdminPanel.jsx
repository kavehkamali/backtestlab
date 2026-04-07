import { useState, useEffect } from 'react';
import { Loader2, Users, Eye, Globe, Monitor, Smartphone, Clock, BarChart3, LogOut, RefreshCw, Mail, CheckCircle, XCircle, Filter, Plus, X } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { adminLogin, fetchAdminStats, saveAdminExcludedIps, fetchAdminUsers, updateAdminUser, deleteAdminUser } from '../api';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

function StatCard({ label, value, sub, icon: Icon, color = 'text-indigo-400' }) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
        {Icon && <Icon className={`w-4 h-4 ${color}`} />}
      </div>
      <div className="text-2xl font-bold text-white">{value?.toLocaleString() ?? '—'}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-[10px]">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color || '#818cf8' }}>{p.name}: {p.value}</p>)}
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

// ─── Login Screen ───
function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await adminLogin(username, password);
      onLogin();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <BarChart3 className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
          <h2 className="text-lg font-bold text-white">Admin Dashboard</h2>
          <p className="text-xs text-gray-500">Enter admin credentials</p>
        </div>
        <div className="space-y-3" onKeyDown={e => e.key === 'Enter' && handleSubmit()}>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500/50" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500/50" />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button onClick={handleSubmit} disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Login
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───
export default function AdminPanel() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('eq_admin_token'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [recentDays, setRecentDays] = useState(7);
  const [recentLimit, setRecentLimit] = useState(200);
  const [recentCityFilter, setRecentCityFilter] = useState('');
  const [ignoredDraft, setIgnoredDraft] = useState([]);
  const [newIp, setNewIp] = useState('');
  const [ipFilterSaving, setIpFilterSaving] = useState(false);
  const [ipFilterError, setIpFilterError] = useState(null);
  const [adminTab, setAdminTab] = useState('analytics'); // analytics | users
  const [usersQ, setUsersQ] = useState('');
  const [usersData, setUsersData] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);

  const load = async (d) => {
    setLoading(true);
    try {
      const stats = await fetchAdminStats({
        days: d || days,
        recentDays,
        recentLimit,
      });
      setData(stats);
      setIgnoredDraft(Array.isArray(stats.ignored_ips) ? [...stats.ignored_ips] : []);
      setIpFilterError(null);
    } catch (e) {
      if (e.message === 'Session expired') setAuthed(false);
    }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (authed) load();
  }, [authed]);

  const handlePeriod = (d) => { setDays(d); load(d); };
  const handleLogout = () => { localStorage.removeItem('eq_admin_token'); setAuthed(false); setData(null); };

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const d = await fetchAdminUsers(usersQ, 500);
      setUsersData(d.users || []);
    } catch (e) {
      if (e.message === 'Session expired') setAuthed(false);
      else setUsersError(e.message || 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  };

  const addIgnoredIp = () => {
    const v = newIp.trim();
    if (!v) return;
    if (ignoredDraft.includes(v)) {
      setNewIp('');
      return;
    }
    setIgnoredDraft((prev) => [...prev, v]);
    setNewIp('');
  };

  const saveIgnoredIps = async () => {
    setIpFilterSaving(true);
    setIpFilterError(null);
    try {
      await saveAdminExcludedIps(ignoredDraft);
      await load();
    } catch (e) {
      setIpFilterError(e.message || 'Save failed');
    } finally {
      setIpFilterSaving(false);
    }
  };

  if (!authed) return <AdminLogin onLogin={() => { setAuthed(true); }} />;
  if (loading && !data) return <div className="flex items-center justify-center h-64 text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading analytics...</div>;
  if (!data) return null;

  const s = data.summary;
  const recentRows = (data.recent_visitors || []).filter((v) => {
    const q = recentCityFilter.trim().toLowerCase();
    if (!q) return true;
    const city = (v.city || '').toLowerCase();
    const country = (v.country || '').toLowerCase();
    const loc = city && country ? `${city}, ${country}` : (city || country);
    return loc.includes(q);
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Analytics Dashboard</h2>
          <p className="text-xs text-gray-500">Visitor tracking and insights</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
            {[
              { id: 'analytics', label: 'Analytics' },
              { id: 'users', label: 'Users' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => { setAdminTab(t.id); if (t.id === 'users') loadUsers(); }}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium ${adminTab === t.id ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
            {[7, 14, 30, 90].map(d => (
              <button key={d} onClick={() => handlePeriod(d)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium ${days === d ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-500 hover:text-gray-300'}`}>
                {d}D
              </button>
            ))}
          </div>
          <button onClick={() => load()} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleLogout} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-white/5" title="Logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {adminTab === 'users' && (
        <Section title="User Management" right={<Users className="w-3.5 h-3.5 text-gray-500" />}>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-3">
            <input
              value={usersQ}
              onChange={(e) => setUsersQ(e.target.value)}
              placeholder="Search by email or name"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500/50"
            />
            <button
              type="button"
              onClick={loadUsers}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
          {usersError && <p className="text-xs text-red-400 mb-2">{usersError}</p>}
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#0d0d14]">
                <tr className="text-gray-500 border-b border-white/5">
                  <th className="text-left py-2 px-2 font-medium">ID</th>
                  <th className="text-left py-2 px-2 font-medium">Email</th>
                  <th className="text-left py-2 px-2 font-medium">Name</th>
                  <th className="text-center py-2 px-2 font-medium">Verified</th>
                  <th className="text-center py-2 px-2 font-medium">Active</th>
                  <th className="text-center py-2 px-2 font-medium">Newsletter</th>
                  <th className="text-right py-2 px-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(usersData || []).map((u) => (
                  <tr key={u.id} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                    <td className="py-1.5 px-2 text-gray-500 font-mono">#{u.id}</td>
                    <td className="py-1.5 px-2 text-gray-200 font-mono">{u.email}</td>
                    <td className="py-1.5 px-2 text-gray-300">{u.name || '—'}</td>
                    <td className="py-1.5 px-2 text-center">{u.email_verified ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mx-auto" /> : <XCircle className="w-3.5 h-3.5 text-gray-600 mx-auto" />}</td>
                    <td className="py-1.5 px-2 text-center">{u.active ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mx-auto" /> : <XCircle className="w-3.5 h-3.5 text-red-400 mx-auto" />}</td>
                    <td className="py-1.5 px-2 text-center">{u.newsletter ? <Mail className="w-3.5 h-3.5 text-indigo-400 mx-auto" /> : <span className="text-gray-700">—</span>}</td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={async () => { await updateAdminUser(u.id, { email_verified: !u.email_verified }); await loadUsers(); }}
                        className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] text-gray-300 hover:bg-white/10 mr-2"
                      >
                        {u.email_verified ? 'Unverify' : 'Verify'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => { await updateAdminUser(u.id, { active: !u.active }); await loadUsers(); }}
                        className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] text-gray-300 hover:bg-white/10 mr-2"
                      >
                        {u.active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => { if (!confirm(`Delete user ${u.email}?`)) return; await deleteAdminUser(u.id); await loadUsers(); }}
                        className="px-2 py-1 rounded bg-red-600/80 hover:bg-red-600 text-[10px] text-white"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {usersLoading && <p className="text-xs text-gray-600 text-center py-4">Loading users…</p>}
            {!usersLoading && (!usersData || usersData.length === 0) && <p className="text-xs text-gray-600 text-center py-4">No users found</p>}
          </div>
        </Section>
      )}

      {adminTab !== 'analytics' ? null : (
        <>
      {/* IP filters — excluded from all analytics & not tracked */}
      <Section
        title="Ignored IPs"
        right={<Filter className="w-3.5 h-3.5 text-gray-500" />}
      >
        <p className="text-[11px] text-gray-500 mb-3">
          Each address you save is removed from <strong className="text-gray-400 font-normal">all</strong> dashboard totals and charts (same as Recent Visitors). Paste from the IP column so it matches what the server stored.
          If a city still has traffic, those rows are almost always a <em className="text-gray-400 not-italic">different</em> IP than the one you ignored (common when the ISP rotates the last number). Optional:{' '}
          <span className="font-mono text-gray-400">a.b.c.*</span> or CIDR for a whole subnet.
        </p>
        {Array.isArray(data.ignored_canonical) && data.ignored_canonical.length > 0 && (
          <p className="text-[10px] text-gray-600 font-mono mb-2">
            Compared as: {data.ignored_canonical.join(', ')}
          </p>
        )}
        <div className="flex flex-wrap gap-2 mb-3">
          {ignoredDraft.length === 0 && <span className="text-xs text-gray-600">No IPs ignored yet</span>}
          {ignoredDraft.map((ip) => (
            <span
              key={ip}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-200 font-mono"
            >
              {ip}
              <button
                type="button"
                onClick={() => setIgnoredDraft((p) => p.filter((x) => x !== ip))}
                className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-white"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="text"
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addIgnoredIp()}
            placeholder="e.g. 203.0.113.42 (paste from Recent Visitors)"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500/50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addIgnoredIp}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300 hover:bg-white/10"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
            <button
              type="button"
              onClick={saveIgnoredIps}
              disabled={ipFilterSaving}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs text-white font-medium"
            >
              {ipFilterSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save filters
            </button>
          </div>
        </div>
        {ipFilterError && <p className="text-xs text-red-400 mt-2">{ipFilterError}</p>}
      </Section>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="Today Views" value={s.today_views} icon={Eye} color="text-indigo-400" />
        <StatCard label="Today Visitors" value={s.today_visitors} icon={Users} color="text-emerald-400" />
        <StatCard label="New Users Today" value={s.new_users_today} icon={Users} color="text-cyan-400" />
        <StatCard label={`${days}D Views`} value={s.total_views} icon={Eye} color="text-indigo-400" />
        <StatCard label={`${days}D Visitors`} value={s.unique_visitors} icon={Globe} color="text-emerald-400" />
        <StatCard label="Sessions" value={s.unique_sessions} icon={Clock} color="text-yellow-400" />
        <StatCard label="Registered Users" value={s.registered_users} icon={Users} color="text-pink-400" />
      </div>

      {/* Views chart */}
      <Section title="Views & Visitors Over Time">
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={data.daily}>
            <defs>
              <linearGradient id="adg1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="adg2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#555' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: '#555' }} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="views" stroke="#6366f1" fill="url(#adg1)" strokeWidth={2} name="Views" />
            <Area type="monotone" dataKey="visitors" stroke="#22c55e" fill="url(#adg2)" strokeWidth={2} name="Visitors" />
          </AreaChart>
        </ResponsiveContainer>
      </Section>

      {/* Hourly + Pages row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Hourly Distribution (24h)">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.hourly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
              <XAxis dataKey="hour" tick={{ fontSize: 8, fill: '#555' }} />
              <YAxis tick={{ fontSize: 9, fill: '#555' }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="views" fill="#6366f1" radius={[3, 3, 0, 0]} name="Views" />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Top Pages">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.top_tabs} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
              <XAxis type="number" tick={{ fontSize: 9, fill: '#555' }} />
              <YAxis type="category" dataKey="tab" tick={{ fontSize: 10, fill: '#888' }} width={80} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="views" fill="#22c55e" radius={[0, 3, 3, 0]} name="Views" />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* Devices + Browsers + Countries */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Section title="Devices">
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={120} height={120}>
              <PieChart>
                <Pie data={data.devices} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50}>
                  {data.devices.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {data.devices.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-gray-400">{d.name}</span>
                  <span className="text-xs text-white font-medium">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Browsers">
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={120} height={120}>
              <PieChart>
                <Pie data={data.browsers} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50}>
                  {data.browsers.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {data.browsers.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[(i + 2) % COLORS.length] }} />
                  <span className="text-xs text-gray-400">{d.name}</span>
                  <span className="text-xs text-white font-medium">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Top Countries">
          <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
            {data.top_countries.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-300 flex-1">{c.country}</span>
                <span className="text-[10px] text-gray-500">{c.visitors} visitors</span>
                <span className="text-xs text-white font-medium w-12 text-right">{c.views}</span>
              </div>
            ))}
            {data.top_countries.length === 0 && <p className="text-xs text-gray-600">No data yet</p>}
          </div>
        </Section>
      </div>

      {/* Top Cities + Referrers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Top Cities">
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {data.top_cities.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-gray-300 flex-1">{c.city}, {c.country}</span>
                <span className="text-gray-500">{c.visitors} visitors</span>
                <span className="text-white font-medium w-10 text-right">{c.views}</span>
              </div>
            ))}
            {data.top_cities.length === 0 && <p className="text-xs text-gray-600">No data yet</p>}
          </div>
        </Section>

        <Section title="Top Referrers">
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {data.top_referrers.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-gray-300 flex-1 truncate">{r.referer}</span>
                <span className="text-white font-medium w-10 text-right">{r.views}</span>
              </div>
            ))}
            {data.top_referrers.length === 0 && <p className="text-xs text-gray-600">No referrer data yet</p>}
          </div>
        </Section>
      </div>

      {/* Live visitor log */}
      {/* Registered Users */}
      <Section title={`Registered Users (${data.users?.length || 0})`}>
        <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[#0d0d14]">
              <tr className="text-gray-500 border-b border-white/5">
                <th className="text-left py-2 px-2 font-medium">ID</th>
                <th className="text-left py-2 px-2 font-medium">Name</th>
                <th className="text-left py-2 px-2 font-medium">Email</th>
                <th className="text-left py-2 px-2 font-medium">Signed Up</th>
                <th className="text-left py-2 px-2 font-medium">Last Login</th>
                <th className="text-center py-2 px-2 font-medium">Newsletter</th>
                <th className="text-center py-2 px-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data.users || []).map(u => (
                <tr key={u.id} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                  <td className="py-1.5 px-2 text-gray-500 font-mono">#{u.id}</td>
                  <td className="py-1.5 px-2 text-white font-medium">{u.name || '—'}</td>
                  <td className="py-1.5 px-2 text-gray-300">{u.email}</td>
                  <td className="py-1.5 px-2 text-gray-400 whitespace-nowrap">{u.created_at?.slice(0, 16)}</td>
                  <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">{u.last_login?.slice(0, 16) || 'Never'}</td>
                  <td className="py-1.5 px-2 text-center">
                    {u.newsletter ? <Mail className="w-3.5 h-3.5 text-indigo-400 mx-auto" /> : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {u.active ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mx-auto" /> : <XCircle className="w-3.5 h-3.5 text-red-400 mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!data.users || data.users.length === 0) && <p className="text-xs text-gray-600 text-center py-4">No registered users yet</p>}
        </div>
      </Section>

      {/* Recent Visitors */}
      <Section
        title="Recent Visitors (Live)"
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              type="text"
              value={recentCityFilter}
              onChange={(e) => setRecentCityFilter(e.target.value)}
              placeholder="Filter by city (e.g. richmond)"
              className="w-44 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-[11px] focus:outline-none focus:border-indigo-500/50"
            />
            <select
              value={recentDays}
              onChange={(e) => { const v = Number(e.target.value); setRecentDays(v); load(); }}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none focus:border-indigo-500/50"
              title="Show recent visitors from last N days"
            >
              {[1, 2, 3, 7, 14, 30, 90].map((d) => (
                <option key={d} value={d}>{d}D</option>
              ))}
            </select>
            <select
              value={recentLimit}
              onChange={(e) => { const v = Number(e.target.value); setRecentLimit(v); load(); }}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none focus:border-indigo-500/50"
              title="Max rows to show"
            >
              {[50, 200, 500, 1000, 2000].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        }
      >
        <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[#0d0d14]">
              <tr className="text-gray-500 border-b border-white/5">
                <th className="text-left py-2 px-2 font-medium">Time</th>
                <th className="text-left py-2 px-2 font-medium">IP</th>
                <th className="text-left py-2 px-2 font-medium">Location</th>
                <th className="text-left py-2 px-2 font-medium">Page</th>
                <th className="text-left py-2 px-2 font-medium">Device</th>
                <th className="text-left py-2 px-2 font-medium">User</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.map((v, i) => (
                <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                  <td className="py-1.5 px-2 text-gray-400 whitespace-nowrap">{v.timestamp?.slice(5, 16)}</td>
                  <td className="py-1.5 px-2 text-gray-500 font-mono">
                    <button
                      type="button"
                      onClick={() => setIgnoredDraft((p) => (p.includes(v.ip) ? p : [...p, v.ip]))}
                      className="text-left hover:text-white"
                      title="Click to add this IP to Ignored IPs draft"
                    >
                      {v.ip}
                    </button>
                  </td>
                  <td className="py-1.5 px-2 text-gray-300">
                    {v.city && v.country ? `${v.city}, ${v.country}` : v.country || '—'}
                  </td>
                  <td className="py-1.5 px-2">
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[9px] font-medium">{v.tab || v.path}</span>
                  </td>
                  <td className="py-1.5 px-2 text-gray-400">
                    {v.device === 'Mobile' ? <Smartphone className="w-3 h-3 inline" /> : <Monitor className="w-3 h-3 inline" />}
                    <span className="ml-1">{v.device}</span>
                  </td>
                  <td className="py-1.5 px-2 text-gray-500">{v.user_id ? `#${v.user_id}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentRows.length === 0 && (
            <p className="text-xs text-gray-600 text-center py-4">No recent visitors match that city filter</p>
          )}
        </div>
      </Section>
        </>
      )}
    </div>
  );
}
