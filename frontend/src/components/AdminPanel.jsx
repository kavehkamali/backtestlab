import { useState, useEffect, useMemo } from 'react';
import { Loader2, Users, Eye, Globe, Monitor, Smartphone, Clock, LogOut, RefreshCw, Mail, CheckCircle, XCircle, Filter, Plus, X, Copy, Send } from 'lucide-react';
import { Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line } from 'recharts';
import { adminLogin, fetchAdminStats, saveAdminExcludedIps, toggleAdminExcludedIp, fetchAdminUsers, updateAdminUser, deleteAdminUser, previewAdminNewsletter, sendAdminNewsletter, fetchAdminNewsletterHistory } from '../api';
import AdminArticlesTab from './AdminArticlesTab';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const LLM_INSTRUCTIONS = {
  newsletter: `You are helping draft an HTML email for Equilima (a product for investors).

Write a single cohesive HTML fragment for the email body (no full <html> document required; use simple tags like <p>, <h2>, <ul>, <a href="...">). Tone: professional, concise, trustworthy.

Include:
- A short subject line suggestion on the first line as: Subject: ...
- Then the HTML body only.

Use these placeholders where personalization is needed (the server will replace them): {{name}}, {{email}}, {{first_name}}

Topics to cover this send (fill in by the admin elsewhere): product updates, market insight, or community news.`,
  welcome: `You are helping draft a welcome HTML email for a new Equilima user.

Write a single cohesive HTML fragment for the email body (no full <html> document required). Tone: warm, clear, onboarding-focused.

Include:
- Subject line on the first line as: Subject: ...
- Then the HTML body with a welcome message, what they can do next, and support contact if relevant.

Placeholders for the server: {{name}}, {{email}}, {{first_name}}`,
  other: `You are drafting a one-off HTML email from the Equilima team.

Write:
- Subject line on the first line as: Subject: ...
- Then the HTML body (fragment with <p>, <h2>, <ul>, links as needed).

Placeholders: {{name}}, {{email}}, {{first_name}}

Follow the admin's intent (announcement, reminder, survey, etc.) in a professional tone.`,
};

function StatCard({ label, value, sub, icon: Icon, color = 'text-indigo-600' }) {
  return (
    <div className="bg-white shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
        {Icon && <Icon className={`w-4 h-4 ${color}`} />}
      </div>
      <div className="text-2xl font-bold text-zinc-900">{value?.toLocaleString() ?? '—'}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-[10px]">
      <p className="text-zinc-500 mb-1">{label}</p>
      {payload.map((p, i) => {
        const v = p.value;
        const isPct = p.dataKey === 'retention_pct';
        const text = isPct && v != null ? `${v}%` : v;
        return (
          <p key={i} style={{ color: p.color || '#818cf8' }}>
            {p.name}: {text}
          </p>
        );
      })}
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <div className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

const ADMIN_TIME_ZONE = 'America/New_York';

function parseAdminUtcTimestamp(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatAdminEt(value, { includeYear = true, includeZone = true } = {}) {
  const d = parseAdminUtcTimestamp(value);
  if (!d) return value || '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ADMIN_TIME_ZONE,
    year: includeYear ? '2-digit' : undefined,
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: includeZone ? 'short' : undefined,
  }).format(d);
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
      <div className="bg-white shadow-sm ring-1 ring-zinc-200/70 rounded-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <img
            src="/logo-mark.svg"
            alt=""
            width={32}
            height={32}
            className="w-8 h-8 mx-auto mb-2"
            aria-hidden
          />
          <h2 className="text-lg font-bold text-zinc-900">Admin Dashboard</h2>
          <p className="text-xs text-zinc-500">Enter admin credentials</p>
        </div>
        <div className="space-y-3" onKeyDown={e => e.key === 'Enter' && handleSubmit()}>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username"
            className="w-full bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-4 py-2.5 text-zinc-900 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/80" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
            className="w-full bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-4 py-2.5 text-zinc-900 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/80" />
          {error && <p className="text-red-600 text-xs">{error}</p>}
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
  const [ipTableDays, setIpTableDays] = useState(30);
  const [ipTableLimit, setIpTableLimit] = useState(200);
  const [ipToggleBusy, setIpToggleBusy] = useState(null);
  const [ipDirectoryCityFilter, setIpDirectoryCityFilter] = useState('');
  const [recentCityFilter, setRecentCityFilter] = useState('');
  const [ignoredDraft, setIgnoredDraft] = useState([]);
  const [newIp, setNewIp] = useState('');
  const [ipFilterSaving, setIpFilterSaving] = useState(false);
  const [ipFilterError, setIpFilterError] = useState(null);
  const [adminTab, setAdminTab] = useState('analytics'); // analytics | users | email | articles
  const [usersQ, setUsersQ] = useState('');
  const [usersData, setUsersData] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);

  const [mailKind, setMailKind] = useState('newsletter'); // newsletter | welcome | other
  const [mailAudience, setMailAudience] = useState('newsletter_subscribers');
  const [mailSelectedIds, setMailSelectedIds] = useState(() => new Set());
  const [mailSubject, setMailSubject] = useState('');
  const [mailHtml, setMailHtml] = useState('');
  const [mailPreviewCount, setMailPreviewCount] = useState(null);
  const [mailPreviewRecipients, setMailPreviewRecipients] = useState([]);
  const [mailPreviewTruncated, setMailPreviewTruncated] = useState(false);
  const [mailPreviewLoading, setMailPreviewLoading] = useState(false);
  const [mailSendLoading, setMailSendLoading] = useState(false);
  const [mailSendError, setMailSendError] = useState(null);
  const [mailSendResult, setMailSendResult] = useState(null);
  const [mailHistory, setMailHistory] = useState([]);
  const [mailHistoryLoading, setMailHistoryLoading] = useState(false);
  const [mailCopyHint, setMailCopyHint] = useState(null);

  const load = async (d) => {
    setLoading(true);
    try {
      const stats = await fetchAdminStats({
        days: d || days,
        recentDays,
        recentLimit,
        ipTableDays,
        ipTableLimit,
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

  const loadNewsletterHistory = async () => {
    setMailHistoryLoading(true);
    try {
      const d = await fetchAdminNewsletterHistory(40);
      setMailHistory(d.sends || []);
    } catch (e) {
      if (e.message === 'Session expired') setAuthed(false);
    } finally {
      setMailHistoryLoading(false);
    }
  };

  const mailSelectionKey = useMemo(
    () => `${mailAudience}:${[...mailSelectedIds].sort((a, b) => a - b).join(',')}`,
    [mailAudience, mailSelectedIds],
  );

  useEffect(() => {
    setMailPreviewCount(null);
    setMailPreviewRecipients([]);
    setMailPreviewTruncated(false);
  }, [mailSelectionKey]);

  const runMailPreview = async () => {
    setMailPreviewLoading(true);
    setMailSendError(null);
    try {
      const ids = mailAudience === 'selected' ? [...mailSelectedIds] : undefined;
      const d = await previewAdminNewsletter({ audience: mailAudience, user_ids: ids });
      setMailPreviewCount(d.count);
      setMailPreviewRecipients(Array.isArray(d.recipients) ? d.recipients : []);
      setMailPreviewTruncated(Boolean(d.truncated));
    } catch (e) {
      setMailPreviewCount(null);
      setMailPreviewRecipients([]);
      setMailPreviewTruncated(false);
      setMailSendError(e.message || 'Preview failed');
    } finally {
      setMailPreviewLoading(false);
    }
  };

  const copyLlmInstruction = async () => {
    try {
      await navigator.clipboard.writeText(LLM_INSTRUCTIONS[mailKind]);
      setMailCopyHint('Copied to clipboard');
      setTimeout(() => setMailCopyHint(null), 2500);
    } catch {
      setMailCopyHint('Could not copy');
      setTimeout(() => setMailCopyHint(null), 2500);
    }
  };

  const handleSendMail = async () => {
    setMailSendError(null);
    setMailSendResult(null);
    let count = mailPreviewCount;
    if (count == null) {
      try {
        const ids = mailAudience === 'selected' ? [...mailSelectedIds] : undefined;
        const d = await previewAdminNewsletter({ audience: mailAudience, user_ids: ids });
        count = d.count;
        setMailPreviewCount(count);
        setMailPreviewRecipients(Array.isArray(d.recipients) ? d.recipients : []);
        setMailPreviewTruncated(Boolean(d.truncated));
      } catch (e) {
        setMailSendError(e.message || 'Could not resolve recipients');
        return;
      }
    }
    if (!count) {
      setMailSendError('No recipients match the current filters.');
      return;
    }
    if (!mailSubject.trim()) {
      setMailSendError('Add a subject line.');
      return;
    }
    if (!mailHtml.trim()) {
      setMailSendError('Add HTML body content.');
      return;
    }
    if (!window.confirm(`Send this email to ${count} recipient(s)?`)) return;
    setMailSendLoading(true);
    try {
      const ids = mailAudience === 'selected' ? [...mailSelectedIds] : undefined;
      const res = await sendAdminNewsletter({
        kind: mailKind,
        subject: mailSubject.trim(),
        html_body: mailHtml,
        audience: mailAudience,
        user_ids: ids,
      });
      setMailSendResult(res);
      await loadNewsletterHistory();
    } catch (e) {
      if (e.message === 'Session expired') setAuthed(false);
      else setMailSendError(e.message || 'Send failed');
    } finally {
      setMailSendLoading(false);
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

  const handleIpDirectoryToggle = async (ip, nextIgnored) => {
    setIpToggleBusy(ip);
    setIpFilterError(null);
    try {
      const r = await toggleAdminExcludedIp(ip, nextIgnored);
      if (!nextIgnored && r.still_filtered) {
        setIpFilterError('That IP is still excluded by a subnet or wildcard rule. Adjust advanced rules below.');
      }
      await load();
    } catch (e) {
      if (e.message === 'Session expired') setAuthed(false);
      else setIpFilterError(e.message || 'Update failed');
    } finally {
      setIpToggleBusy(null);
    }
  };

  const ignoreRecentIp = async (ip) => {
    setIpFilterError(null);
    try {
      await toggleAdminExcludedIp(ip, true);
      await load();
    } catch (e) {
      if (e.message === 'Session expired') setAuthed(false);
      else setIpFilterError(e.message || 'Could not ignore IP');
    }
  };

  if (!authed) return <AdminLogin onLogin={() => { setAuthed(true); }} />;
  if (loading && !data) return <div className="flex items-center justify-center h-64 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading analytics...</div>;
  if (!data) return null;

  const mailEligible = (usersData || []).filter((u) => u.active && u.email_verified && !u.is_admin);

  const s = data.summary;
  const recentRows = (data.recent_visitors || []).filter((v) => {
    const q = recentCityFilter.trim().toLowerCase();
    if (!q) return true;
    const city = (v.city || '').toLowerCase();
    const country = (v.country || '').toLowerCase();
    const loc = city && country ? `${city}, ${country}` : (city || country);
    return loc.includes(q);
  });

  const ipDirectoryRows = (data.ip_directory || []).filter((row) => {
    const q = ipDirectoryCityFilter.trim().toLowerCase();
    if (!q) return true;
    const city = (row.city || '').toLowerCase();
    return city.includes(q);
  });

  const dailyChart = (data.daily || []).map((d) => ({
    ...d,
    returning: typeof d.returning === 'number' ? d.returning : 0,
  }));

  return (
    <div className="space-y-5">
      {/* Header: title + logout; then section switch; analytics-only date range on its own row */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              {adminTab === 'analytics'
                ? 'Analytics'
                : adminTab === 'users'
                  ? 'User management'
                  : adminTab === 'articles'
                    ? 'Articles & Learn hub'
                    : 'Email & newsletters'}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {adminTab === 'analytics'
                ? (
                    <>
                      Visitor tracking and insights. Dates, “today”, and hourly buckets use{' '}
                      <span className="text-zinc-500">
                        {data.analytics_tz_abbrev ? `${data.analytics_tz_abbrev} (${data.analytics_timezone || 'America/New_York'})` : (data.analytics_timezone || 'US Eastern')}
                      </span>
                      — daylight saving included.
                    </>
                  )
                : adminTab === 'users'
                  ? 'Search accounts, verify email, enable or disable users'
                  : adminTab === 'articles'
                    ? 'SEO articles at /learn — hub-and-spoke clusters, meta, JSON-LD, sitemap'
                    : 'Draft with ChatGPT using the instructions below, choose recipients, send and verify delivery'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-600 hover:bg-zinc-100 shrink-0"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          {/* Own row so Analytics range controls never squeeze the tab strip (third tab was clipping on narrow viewports with overflow-x-hidden). */}
          <div
            className="flex flex-wrap gap-0.5 bg-zinc-100 rounded-lg p-0.5 w-full sm:w-fit max-w-full"
            role="tablist"
            aria-label="Admin section"
          >
            {[
              { id: 'analytics', label: 'Analytics' },
              { id: 'users', label: 'Users' },
              { id: 'email', label: 'Newsletters' },
              { id: 'articles', label: 'Articles' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={adminTab === t.id}
                onClick={() => {
                  setAdminTab(t.id);
                  if (t.id === 'users') loadUsers();
                  if (t.id === 'email') {
                    loadUsers();
                    loadNewsletterHistory();
                  }
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium min-w-[5.5rem] flex-1 sm:flex-none text-center ${
                  adminTab === t.id ? 'bg-indigo-500/20 text-indigo-700' : 'text-zinc-500 hover:text-zinc-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {adminTab === 'analytics' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wide">Range</span>
              <div className="flex gap-0.5 bg-zinc-100 rounded-lg p-0.5">
                {[7, 14, 30, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handlePeriod(d)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-medium ${
                      days === d ? 'bg-indigo-500/20 text-indigo-700' : 'text-zinc-500 hover:text-zinc-600'
                    }`}
                  >
                    {d}D
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => load()}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                title="Refresh analytics"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {adminTab === 'users' && (
        <Section title="User Management" right={<Users className="w-3.5 h-3.5 text-zinc-500" />}>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-3">
            <input
              value={usersQ}
              onChange={(e) => setUsersQ(e.target.value)}
              placeholder="Search by email or name"
              className="flex-1 bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-xs placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/80"
            />
            <button
              type="button"
              onClick={loadUsers}
              className="px-3 py-2 rounded-lg bg-zinc-100 ring-1 ring-zinc-200/80 text-xs text-zinc-600 hover:bg-zinc-200/60"
            >
              Refresh
            </button>
          </div>
          {usersError && <p className="text-xs text-red-600 mb-2">{usersError}</p>}
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-zinc-100">
                <tr className="text-zinc-500 border-b border-zinc-200/80">
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
                  <tr key={u.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="py-1.5 px-2 text-zinc-500 font-mono">#{u.id}</td>
                    <td className="py-1.5 px-2 text-zinc-700 font-mono">{u.email}</td>
                    <td className="py-1.5 px-2 text-zinc-600">{u.name || '—'}</td>
                    <td className="py-1.5 px-2 text-center">{u.email_verified ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mx-auto" /> : <XCircle className="w-3.5 h-3.5 text-zinc-600 mx-auto" />}</td>
                    <td className="py-1.5 px-2 text-center">{u.active ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mx-auto" /> : <XCircle className="w-3.5 h-3.5 text-red-600 mx-auto" />}</td>
                    <td className="py-1.5 px-2 text-center">{u.newsletter ? <Mail className="w-3.5 h-3.5 text-indigo-600 mx-auto" /> : <span className="text-zinc-700">—</span>}</td>
                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={async () => { await updateAdminUser(u.id, { email_verified: !u.email_verified }); await loadUsers(); }}
                        className="px-2 py-1 rounded bg-zinc-100 ring-1 ring-zinc-200/80 text-[10px] text-zinc-600 hover:bg-zinc-200/60 mr-2"
                      >
                        {u.email_verified ? 'Unverify' : 'Verify'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => { await updateAdminUser(u.id, { active: !u.active }); await loadUsers(); }}
                        className="px-2 py-1 rounded bg-zinc-100 ring-1 ring-zinc-200/80 text-[10px] text-zinc-600 hover:bg-zinc-200/60 mr-2"
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
            {usersLoading && <p className="text-xs text-zinc-600 text-center py-4">Loading users…</p>}
            {!usersLoading && (!usersData || usersData.length === 0) && <p className="text-xs text-zinc-600 text-center py-4">No users found</p>}
          </div>
        </Section>
      )}

      {adminTab === 'email' && (
        <div className="space-y-4">
          <Section title="Message type" right={<Mail className="w-3.5 h-3.5 text-zinc-500" />}>
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { id: 'newsletter', label: 'Newsletter' },
                { id: 'welcome', label: 'Welcome' },
                { id: 'other', label: 'Other' },
              ].map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setMailKind(k.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    mailKind === k.id
                      ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-700'
                      : 'bg-zinc-100 border-zinc-200/80 text-zinc-500 hover:text-zinc-600'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500 mb-2">
              Copy the block below into ChatGPT (or another LLM). Use the reply as your HTML body; set the subject line in the next section. The server replaces{' '}
              <code className="text-zinc-500">{'{{name}}'}</code>, <code className="text-zinc-500">{'{{email}}'}</code>, and{' '}
              <code className="text-zinc-500">{'{{first_name}}'}</code> for each user.
            </p>
            <textarea
              readOnly
              value={LLM_INSTRUCTIONS[mailKind]}
              rows={10}
              className="w-full bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-[11px] text-zinc-600 font-mono leading-relaxed resize-y min-h-[140px]"
            />
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button
                type="button"
                onClick={copyLlmInstruction}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-200/60 ring-1 ring-zinc-200/80 text-xs text-zinc-700 hover:bg-white/15"
              >
                <Copy className="w-3.5 h-3.5" /> Copy instructions
              </button>
              {mailCopyHint && <span className="text-[10px] text-emerald-600">{mailCopyHint}</span>}
            </div>
          </Section>

          <Section title="Subject & HTML body">
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Subject</label>
            <input
              type="text"
              value={mailSubject}
              onChange={(e) => setMailSubject(e.target.value)}
              placeholder="e.g. April update from Equilima"
              className="w-full bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-sm placeholder:text-zinc-400 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-200/80"
            />
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">HTML body</label>
            <textarea
              value={mailHtml}
              onChange={(e) => setMailHtml(e.target.value)}
              placeholder="<p>Hi {{first_name}},</p><p>...</p>"
              rows={12}
              className="w-full bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-[11px] text-zinc-700 font-mono leading-relaxed resize-y min-h-[180px] focus:outline-none focus:border-indigo-500/50"
            />
          </Section>

          <Section title="Recipients">
            <div className="space-y-2 mb-3">
              {[
                { id: 'newsletter_subscribers', label: 'Newsletter subscribers', sub: 'Opted in, verified, active (excludes admins)' },
                { id: 'all_active', label: 'All verified users', sub: 'Every active verified non-admin account' },
                { id: 'selected', label: 'Selected users only', sub: 'Pick accounts below (verified, active, non-admin)' },
              ].map((a) => (
                <label
                  key={a.id}
                  className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${
                    mailAudience === a.id ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-zinc-200/80 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="mailAudience"
                    checked={mailAudience === a.id}
                    onChange={() => setMailAudience(a.id)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-xs text-zinc-700 block">{a.label}</span>
                    <span className="text-[10px] text-zinc-500">{a.sub}</span>
                  </span>
                </label>
              ))}
            </div>

            {mailAudience === 'selected' && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setMailSelectedIds(new Set(mailEligible.map((u) => u.id)))}
                    className="text-[10px] px-2 py-1 rounded bg-zinc-100 ring-1 ring-zinc-200/80 text-zinc-500 hover:text-zinc-700"
                  >
                    Select all listed
                  </button>
                  <button
                    type="button"
                    onClick={() => setMailSelectedIds(new Set())}
                    className="text-[10px] px-2 py-1 rounded bg-zinc-100 ring-1 ring-zinc-200/80 text-zinc-500 hover:text-zinc-700"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto ring-1 ring-zinc-200/80 rounded-lg p-2 space-y-1">
                  {usersLoading && <p className="text-[10px] text-zinc-500">Loading users…</p>}
                  {!usersLoading &&
                    mailEligible.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-[11px] text-zinc-600 cursor-pointer hover:bg-zinc-100 rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={mailSelectedIds.has(u.id)}
                          onChange={() => {
                            setMailSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(u.id)) next.delete(u.id);
                              else next.add(u.id);
                              return next;
                            });
                          }}
                        />
                        <span className="font-mono text-zinc-500">#{u.id}</span>
                        <span className="text-zinc-700">{u.email}</span>
                        {u.name ? <span className="text-zinc-500 truncate">({u.name})</span> : null}
                      </label>
                    ))}
                  {!usersLoading && mailEligible.length === 0 && (
                    <p className="text-[10px] text-zinc-500">No eligible users. Refresh the user list from the Users tab or adjust accounts.</p>
                  )}
                </div>
                <p className="text-[10px] text-zinc-600 mt-1">Selected: {mailSelectedIds.size}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runMailPreview}
                disabled={mailPreviewLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-200/60 ring-1 ring-zinc-200/80 text-xs text-zinc-700 hover:bg-white/15 disabled:opacity-50"
              >
                {mailPreviewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {'Refresh list & count'}
              </button>
              <span className="text-xs text-zinc-500">
                {mailPreviewCount != null ? (
                  <>
                    <strong className="text-zinc-900">{mailPreviewCount}</strong> recipient(s) match
                  </>
                ) : (
                  'Click refresh to load the recipient list and count'
                )}
              </span>
            </div>

            <div className="mt-4 max-w-2xl w-full">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Who will receive this send</p>
              <div className="h-72 max-h-[min(18rem,50vh)] overflow-y-auto overflow-x-hidden rounded-xl ring-1 ring-zinc-200/80 bg-zinc-100 p-2 sm:p-3 shadow-inner">
                {mailPreviewRecipients.length === 0 ? (
                  <p className="text-[11px] text-zinc-600 text-center py-8 px-2">
                    Choose an audience above, then click <span className="text-zinc-500">Refresh list & count</span> to see every email address for the current option.
                  </p>
                ) : (
                  <ul className="space-y-1 text-[11px]">
                    {mailPreviewRecipients.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-zinc-100 pb-1 last:border-0 last:pb-0"
                      >
                        <span className="font-mono text-zinc-500 shrink-0">#{r.id}</span>
                        <span className="text-zinc-700 font-mono break-all">{r.email}</span>
                        {r.name ? <span className="text-zinc-500 truncate">({r.name})</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {mailPreviewTruncated && (
                <p className="text-[10px] text-amber-400/90 mt-2">
                  List shows the first 5,000 addresses; total count above is complete. Reduce audience or export from Users if you need the full list in one view.
                </p>
              )}
            </div>
            {mailSendError && <p className="text-xs text-red-600 mt-2">{mailSendError}</p>}
          </Section>

          <Section title="Send" right={<Send className="w-3.5 h-3.5 text-zinc-500" />}>
            <p className="text-[11px] text-zinc-500 mb-3">
              Sends use your configured SMTP (same as verification emails). Each recipient gets a personalized body if you used placeholders. After sending, check the result and the history table for success vs failure counts.
            </p>
            <button
              type="button"
              onClick={handleSendMail}
              disabled={mailSendLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white"
            >
              {mailSendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send email
            </button>
            {mailSendResult && (
              <div
                className={`mt-4 p-3 rounded-lg border text-[11px] ${
                  mailSendResult.verified
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                }`}
              >
                <p className="font-medium mb-1">
                  {mailSendResult.verified ? 'Send completed — all deliveries reported OK' : 'Send finished with some failures'}
                </p>
                <p className="text-zinc-600">
                  Log #{mailSendResult.log_id}: {mailSendResult.ok_count} ok / {mailSendResult.fail_count} failed of{' '}
                  {mailSendResult.recipient_count} recipients.
                </p>
                {mailSendResult.failures?.length > 0 && (
                  <ul className="mt-2 list-disc list-inside text-amber-200/90 space-y-0.5">
                    {mailSendResult.failures.map((f, i) => (
                      <li key={i}>
                        {f.email}: {f.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Section>

          <Section title="Recent sends (verification)">
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={loadNewsletterHistory}
                disabled={mailHistoryLoading}
                className="text-[10px] px-2 py-1 rounded bg-zinc-100 ring-1 ring-zinc-200/80 text-zinc-500 hover:text-zinc-700"
              >
                {mailHistoryLoading ? 'Loading…' : 'Refresh history'}
              </button>
            </div>
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-zinc-100">
                  <tr className="text-zinc-500 border-b border-zinc-200/80">
                    <th className="text-left py-2 px-2 font-medium">When</th>
                    <th className="text-left py-2 px-2 font-medium">Kind</th>
                    <th className="text-left py-2 px-2 font-medium">Subject</th>
                    <th className="text-left py-2 px-2 font-medium">Audience</th>
                    <th className="text-right py-2 px-2 font-medium">OK / Fail</th>
                  </tr>
                </thead>
                <tbody>
                  {(mailHistory || []).map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100">
                      <td className="py-1.5 px-2 text-zinc-500 whitespace-nowrap">{formatAdminEt(row.sent_at)}</td>
                      <td className="py-1.5 px-2 text-zinc-600">{row.kind}</td>
                      <td className="py-1.5 px-2 text-zinc-700 max-w-[200px] truncate" title={row.subject}>
                        {row.subject}
                      </td>
                      <td className="py-1.5 px-2 text-zinc-500">{row.audience}</td>
                      <td className="py-1.5 px-2 text-right">
                        <span className="text-emerald-600">{row.ok_count}</span>
                        <span className="text-zinc-600"> / </span>
                        <span className={row.fail_count > 0 ? 'text-amber-400' : 'text-zinc-500'}>{row.fail_count}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!mailHistoryLoading && (!mailHistory || mailHistory.length === 0) && (
                <p className="text-xs text-zinc-600 text-center py-6">No sends logged yet</p>
              )}
            </div>
          </Section>
        </div>
      )}

      {adminTab === 'articles' && <AdminArticlesTab setAuthed={setAuthed} />}

      {adminTab !== 'analytics' ? null : (
        <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="Today Views" value={s.today_views} icon={Eye} color="text-indigo-600" />
        <StatCard label="Today Visitors" value={s.today_visitors} icon={Users} color="text-emerald-600" />
        <StatCard label="New Users Today" value={s.new_users_today} icon={Users} color="text-cyan-400" />
        <StatCard label={`${days}D Views`} value={s.total_views} icon={Eye} color="text-indigo-600" />
        <StatCard label={`${days}D Visitors`} value={s.unique_visitors} icon={Globe} color="text-emerald-600" />
        <StatCard label="Sessions" value={s.unique_sessions} icon={Clock} color="text-yellow-400" />
        <StatCard label="Registered Users" value={s.registered_users} icon={Users} color="text-pink-400" />
      </div>

      {ipFilterError && (
        <div className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {ipFilterError}
        </div>
      )}

      {/* Views, visitors, returning — shared left Y-axis (counts) */}
      <Section title="Views, Visitors & Returning Visitors Over Time">
        <p className="text-[10px] text-zinc-500 mb-3 leading-relaxed">
          Returning visitors is the count of unique IPs on that calendar day who also had at least one visit on an earlier day within this date range. The first day in the range is often lower because there is no prior day in the window.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={dailyChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#555' }} interval="preserveStartEnd" />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 9, fill: '#555' }}
              allowDecimals={false}
              width={40}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              verticalAlign="top"
              height={28}
              wrapperStyle={{ fontSize: '10px', color: '#888' }}
              formatter={(value) => <span className="text-zinc-500">{value}</span>}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="views"
              stroke="#6366f1"
              fill="url(#adg1)"
              strokeWidth={2}
              name="Views"
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="visitors"
              stroke="#22c55e"
              fill="url(#adg2)"
              strokeWidth={2}
              name="Visitors"
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="returning"
              stroke="#c084fc"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: '#c084fc' }}
              name="Returning visitors"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>

      {/* Hourly + Pages row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Hourly Distribution (24h, 2h bins ET)">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.hourly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="hour" tick={{ fontSize: 7, fill: '#555' }} interval={0} angle={-25} textAnchor="end" height={52} />
              <YAxis tick={{ fontSize: 9, fill: '#555' }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="views" fill="#6366f1" radius={[3, 3, 0, 0]} name="Views" />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Top Pages">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.top_tabs} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
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
                  <span className="text-xs text-zinc-500">{d.name}</span>
                  <span className="text-xs text-zinc-900 font-medium">{d.value}</span>
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
                  <span className="text-xs text-zinc-500">{d.name}</span>
                  <span className="text-xs text-zinc-900 font-medium">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Top Countries">
          <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
            {data.top_countries.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-zinc-600 flex-1">{c.country}</span>
                <span className="text-[10px] text-zinc-500">{c.visitors} visitors</span>
                <span className="text-xs text-zinc-900 font-medium w-12 text-right">{c.views}</span>
              </div>
            ))}
            {data.top_countries.length === 0 && <p className="text-xs text-zinc-600">No data yet</p>}
          </div>
        </Section>
      </div>

      {/* Top Cities + Referrers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Top Cities">
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {data.top_cities.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-600 flex-1">{c.city}, {c.country}</span>
                <span className="text-zinc-500">{c.visitors} visitors</span>
                <span className="text-zinc-900 font-medium w-10 text-right">{c.views}</span>
              </div>
            ))}
            {data.top_cities.length === 0 && <p className="text-xs text-zinc-600">No data yet</p>}
          </div>
        </Section>

        <Section title="Top Referrers">
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {data.top_referrers.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-600 flex-1 truncate">{r.referer}</span>
                <span className="text-zinc-900 font-medium w-10 text-right">{r.views}</span>
              </div>
            ))}
            {data.top_referrers.length === 0 && <p className="text-xs text-zinc-600">No referrer data yet</p>}
          </div>
        </Section>
      </div>

      {/* Live visitor log */}
      {/* Registered Users */}
      <Section title={`Registered Users (${data.users?.length || 0})`}>
        <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-zinc-100">
              <tr className="text-zinc-500 border-b border-zinc-200/80">
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
                <tr key={u.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-1.5 px-2 text-zinc-500 font-mono">#{u.id}</td>
                  <td className="py-1.5 px-2 text-zinc-900 font-medium">{u.name || '—'}</td>
                  <td className="py-1.5 px-2 text-zinc-600">{u.email}</td>
                  <td className="py-1.5 px-2 text-zinc-500 whitespace-nowrap">{formatAdminEt(u.created_at)}</td>
                  <td className="py-1.5 px-2 text-zinc-500 whitespace-nowrap">{u.last_login ? formatAdminEt(u.last_login) : 'Never'}</td>
                  <td className="py-1.5 px-2 text-center">
                    {u.newsletter ? <Mail className="w-3.5 h-3.5 text-indigo-600 mx-auto" /> : <span className="text-zinc-700">—</span>}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {u.active ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mx-auto" /> : <XCircle className="w-3.5 h-3.5 text-red-600 mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!data.users || data.users.length === 0) && <p className="text-xs text-zinc-600 text-center py-4">No registered users yet</p>}
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
              className="w-44 bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-2.5 py-1.5 text-zinc-900 text-[11px] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/80"
            />
            <select
              value={recentDays}
              onChange={(e) => { const v = Number(e.target.value); setRecentDays(v); load(); }}
              className="bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-2 py-1.5 text-zinc-900 text-[11px] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/80"
              title="Show recent visitors from last N days"
            >
              {[1, 2, 3, 7, 14, 30, 90].map((d) => (
                <option key={d} value={d}>{d}D</option>
              ))}
            </select>
            <select
              value={recentLimit}
              onChange={(e) => { const v = Number(e.target.value); setRecentLimit(v); load(); }}
              className="bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-2 py-1.5 text-zinc-900 text-[11px] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/80"
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
            <thead className="sticky top-0 bg-zinc-100">
              <tr className="text-zinc-500 border-b border-zinc-200/80">
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
                <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-1.5 px-2 text-zinc-500 whitespace-nowrap">{formatAdminEt(v.timestamp, { includeYear: false })}</td>
                  <td className="py-1.5 px-2 text-zinc-500 font-mono">
                    <button
                      type="button"
                      onClick={() => ignoreRecentIp(v.ip)}
                      className="text-left hover:text-zinc-900"
                      title="Exclude this IP from all analytics (same as the directory below)"
                    >
                      {v.ip}
                    </button>
                  </td>
                  <td className="py-1.5 px-2 text-zinc-600">
                    {v.city && v.country ? `${v.city}, ${v.country}` : v.country || '—'}
                  </td>
                  <td className="py-1.5 px-2">
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 text-[9px] font-medium">{v.tab || v.path}</span>
                  </td>
                  <td className="py-1.5 px-2 text-zinc-500">
                    {v.device === 'Mobile' ? <Smartphone className="w-3 h-3 inline" /> : <Monitor className="w-3 h-3 inline" />}
                    <span className="ml-1">{v.device}</span>
                  </td>
                  <td className="py-1.5 px-2 text-zinc-500">{v.user_id ? `#${v.user_id}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentRows.length === 0 && (
            <p className="text-xs text-zinc-600 text-center py-4">No recent visitors match that city filter</p>
          )}
        </div>
      </Section>

      <Section
        title="Unique IPs & filters"
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              type="text"
              value={ipDirectoryCityFilter}
              onChange={(e) => setIpDirectoryCityFilter(e.target.value)}
              placeholder="Search city (partial)"
              className="w-36 sm:w-44 bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-2.5 py-1.5 text-zinc-900 text-[11px] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/80"
              title="Match any substring in the city name (case-insensitive)"
            />
            <select
              value={ipTableDays}
              onChange={(e) => { const v = Number(e.target.value); setIpTableDays(v); load(); }}
              className="bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-2 py-1.5 text-zinc-900 text-[11px] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/80"
              title="Look back N days for unique IPs"
            >
              {[1, 2, 3, 7, 14, 30, 90].map((d) => (
                <option key={d} value={d}>{d}D</option>
              ))}
            </select>
            <select
              value={ipTableLimit}
              onChange={(e) => { const v = Number(e.target.value); setIpTableLimit(v); load(); }}
              className="bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-2 py-1.5 text-zinc-900 text-[11px] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/80"
              title="Max unique IPs (sorted by last visit)"
            >
              {[50, 200, 500, 1000, 2000].map((n) => (
                <option key={n} value={n}>{n} IPs</option>
              ))}
            </select>
          </div>
        }
      >
        <p className="text-[11px] text-zinc-500 mb-3">
          One row per IP in the window below (included and excluded). Check <strong className="text-zinc-500 font-normal">Ignore</strong> to drop that address from all dashboard totals and charts. Last visit is the most recent page view in Eastern time. City search matches partial text (e.g. <span className="font-mono text-zinc-500">rich</span> finds Richmond).
        </p>
        <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-zinc-100">
              <tr className="text-zinc-500 border-b border-zinc-200/80">
                <th className="text-center py-2 px-2 font-medium w-14">Ignore</th>
                <th className="text-left py-2 px-2 font-medium">IP</th>
                <th className="text-left py-2 px-2 font-medium">Location</th>
                <th className="text-right py-2 px-2 font-medium">Visits</th>
                <th className="text-left py-2 px-2 font-medium">Last visit</th>
              </tr>
            </thead>
            <tbody>
              {ipDirectoryRows.map((row) => (
                <tr key={row.ip} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-1.5 px-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!row.ignored}
                      disabled={ipToggleBusy === row.ip}
                      onChange={(e) => handleIpDirectoryToggle(row.ip, e.target.checked)}
                      className="accent-indigo-500 cursor-pointer disabled:opacity-40"
                      title={row.ignored ? 'Excluded from analytics (uncheck to include)' : 'Included in analytics (check to ignore)'}
                      aria-label={row.ignored ? `Stop ignoring ${row.ip}` : `Ignore ${row.ip}`}
                    />
                  </td>
                  <td className="py-1.5 px-2 text-zinc-500 font-mono">{row.ip}</td>
                  <td className="py-1.5 px-2 text-zinc-600">
                    {row.city && row.country ? `${row.city}, ${row.country}` : row.country || row.city || '—'}
                  </td>
                  <td className="py-1.5 px-2 text-right text-zinc-900 font-medium">{row.visits?.toLocaleString?.() ?? row.visits}</td>
                  <td className="py-1.5 px-2 text-zinc-500 whitespace-nowrap">{formatAdminEt(row.last_visit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!data.ip_directory || data.ip_directory.length === 0) && (
            <p className="text-xs text-zinc-600 text-center py-4">No page views in this window</p>
          )}
          {(data.ip_directory || []).length > 0 && ipDirectoryRows.length === 0 && (
            <p className="text-xs text-zinc-600 text-center py-4">No rows match that city search</p>
          )}
        </div>
      </Section>

      <Section
        title="Advanced: subnets & wildcards"
        right={<Filter className="w-3.5 h-3.5 text-zinc-500" />}
      >
        <p className="text-[11px] text-zinc-500 mb-3">
          CIDR ranges and <span className="font-mono text-zinc-500">a.b.c.*</span> rules are edited here and replace the full list when you save. Single-IP ignore/unignore is faster from the table above.
        </p>
        {Array.isArray(data.ignored_canonical) && data.ignored_canonical.length > 0 && (
          <p className="text-[10px] text-zinc-600 font-mono mb-2">
            Literal IPs compared as: {data.ignored_canonical.join(', ')}
          </p>
        )}
        <div className="flex flex-wrap gap-2 mb-3">
          {ignoredDraft.length === 0 && <span className="text-xs text-zinc-600">No rules yet</span>}
          {ignoredDraft.map((ip) => (
            <span
              key={ip}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-zinc-100 ring-1 ring-zinc-200/80 text-xs text-zinc-700 font-mono"
            >
              {ip}
              <button
                type="button"
                onClick={() => setIgnoredDraft((p) => p.filter((x) => x !== ip))}
                className="p-0.5 rounded hover:bg-zinc-200/60 text-zinc-500 hover:text-zinc-900"
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
            placeholder="e.g. 203.0.113.0/24 or 203.0.113.*"
            className="flex-1 bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-xs font-mono placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/80"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addIgnoredIp}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-100 ring-1 ring-zinc-200/80 text-xs text-zinc-600 hover:bg-zinc-200/60"
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
              Save rules
            </button>
          </div>
        </div>
      </Section>
        </>
      )}
    </div>
  );
}
