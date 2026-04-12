import { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2, Save, ExternalLink, BookOpen } from 'lucide-react';
import {
  fetchAdminArticles,
  fetchAdminArticle,
  createAdminArticle,
  patchAdminArticle,
  deleteAdminArticle,
} from '../api';

function ASection({ title, children, right }) {
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

const emptyForm = {
  slug: '',
  title: '',
  meta_description: '',
  excerpt: '',
  body_html: '',
  og_image_url: '',
  author_name: 'Equilima',
  cluster_key: '',
  status: 'draft',
  published_at: '',
};

export default function AdminArticlesTab({ setAuthed }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchAdminArticles({ q, status: statusFilter });
      setList(d.articles || []);
    } catch (e) {
      if (e.message === 'Session expired') setAuthed(false);
      else setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditingId('new');
    setForm({ ...emptyForm });
    setErr(null);
  };

  const openEdit = async (id) => {
    setErr(null);
    try {
      const a = await fetchAdminArticle(id);
      setEditingId(id);
      setForm({
        slug: a.slug,
        title: a.title,
        meta_description: a.meta_description || '',
        excerpt: a.excerpt || '',
        body_html: a.body_html || '',
        og_image_url: a.og_image_url || '',
        author_name: a.author_name || 'Equilima',
        cluster_key: a.cluster_key || '',
        status: a.status,
        published_at: a.published_at || '',
      });
    } catch (e) {
      if (e.message === 'Session expired') setAuthed(false);
      else setErr(e.message);
    }
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        slug: form.slug.trim(),
        title: form.title.trim(),
        meta_description: form.meta_description.trim(),
        excerpt: form.excerpt.trim(),
        body_html: form.body_html,
        og_image_url: form.og_image_url.trim(),
        author_name: form.author_name.trim() || 'Equilima',
        cluster_key: form.cluster_key.trim(),
        status: form.status,
        published_at: form.published_at.trim() || undefined,
      };
      if (editingId === 'new') {
        const r = await createAdminArticle(payload);
        setEditingId(r.id);
        await load();
      } else if (editingId != null) {
        await patchAdminArticle(editingId, payload);
        await load();
      }
    } catch (e) {
      if (e.message === 'Session expired') setAuthed(false);
      else setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (editingId === 'new' || editingId == null) return;
    if (!window.confirm('Delete this article permanently?')) return;
    setSaving(true);
    setErr(null);
    try {
      await deleteAdminArticle(editingId);
      setEditingId(null);
      setForm({ ...emptyForm });
      await load();
    } catch (e) {
      if (e.message === 'Session expired') setAuthed(false);
      else setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteArticleById = async (id, titleHint) => {
    if (!window.confirm(`Delete “${titleHint || 'this article'}” permanently?`)) return;
    setSaving(true);
    setErr(null);
    try {
      await deleteAdminArticle(id);
      if (editingId === id) {
        setEditingId(null);
        setForm({ ...emptyForm });
      }
      await load();
    } catch (e) {
      if (e.message === 'Session expired') setAuthed(false);
      else setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = (slug) => `${window.location.origin}/learn/${encodeURIComponent(slug)}`;

  return (
    <div className="space-y-4">
      <ASection
        title="Articles — Learn hub & SEO"
        right={<BookOpen className="w-3.5 h-3.5 text-zinc-500" />}
      >
        <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">
          Hub-and-spoke: use <span className="text-zinc-500">cluster key</span> to group topics. Put internal links in HTML to{' '}
          <code className="text-zinc-500">/learn/other-slug</code> and to product areas. Set{' '}
          <span className="text-zinc-500">EQUILIMA_PUBLIC_URL</span> on the server for canonical URLs and{' '}
          <code className="text-zinc-500">/api/sitemap-articles.xml</code> for crawlers.
        </p>
        <p className="text-[11px] text-zinc-600 mb-3 leading-relaxed border-l-2 border-indigo-500/40 pl-3">
          The bundled AI agent Learn series is imported <strong className="text-zinc-500 font-medium">once per database</strong>. Edit or delete any article here; deletions stay gone after restarts.
          To re-import that series from disk, remove the <code className="text-zinc-500">learn_ai_agent_series_v1</code> row from the{' '}
          <code className="text-zinc-500">eq_app_seeds</code> table (advanced / SQLite), then restart the API.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or slug"
            className="flex-1 bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-xs"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <button
            type="button"
            onClick={load}
            className="px-3 py-2 rounded-lg bg-zinc-200/60 ring-1 ring-zinc-200/80 text-xs text-zinc-700"
          >
            Search
          </button>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        </div>
        {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
        <div className="overflow-x-auto max-h-56 overflow-y-auto ring-1 ring-zinc-200/80 rounded-lg">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-zinc-100">
              <tr className="text-zinc-500 border-b border-zinc-200/80">
                <th className="text-left py-2 px-2">Slug</th>
                <th className="text-left py-2 px-2">Title</th>
                <th className="text-left py-2 px-2">Status</th>
                <th className="text-right py-2 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="border-b border-zinc-100">
                  <td className="py-1.5 px-2 font-mono text-zinc-500">{a.slug}</td>
                  <td className="py-1.5 px-2 text-zinc-700">{a.title}</td>
                  <td className="py-1.5 px-2 text-zinc-500">{a.status}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(a.id)}
                      disabled={saving}
                      className="text-indigo-600 hover:text-indigo-700 disabled:opacity-40 mr-3"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteArticleById(a.id, a.title)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 text-red-600/90 hover:text-red-600 disabled:opacity-40"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <p className="text-center text-zinc-600 py-4 text-xs">Loading…</p>}
          {!loading && list.length === 0 && <p className="text-center text-zinc-600 py-4 text-xs">No articles</p>}
        </div>
      </ASection>

      {editingId != null && (
        <ASection title={editingId === 'new' ? 'New article' : `Edit #${editingId}`} right={null}>
          <div className="space-y-3 max-w-4xl">
            {form.slug && (
              <a
                href={publicUrl(form.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-700 mb-2"
              >
                <ExternalLink className="w-3 h-3" /> Open public page (if published)
              </a>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-[10px] text-zinc-500 uppercase">
                Slug (lowercase-kebab)
                <input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  className="mt-1 w-full bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-sm font-mono"
                />
              </label>
              <label className="block text-[10px] text-zinc-500 uppercase">
                Cluster key (hub topic)
                <input
                  value={form.cluster_key}
                  onChange={(e) => setForm((f) => ({ ...f, cluster_key: e.target.value }))}
                  placeholder="e.g. backtesting-basics"
                  className="mt-1 w-full bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-sm"
                />
              </label>
            </div>
            <label className="block text-[10px] text-zinc-500 uppercase">
              Title (H1)
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="mt-1 w-full bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-sm"
              />
            </label>
            <label className="block text-[10px] text-zinc-500 uppercase">
              Meta description
              <textarea
                value={form.meta_description}
                onChange={(e) => setForm((f) => ({ ...f, meta_description: e.target.value }))}
                rows={2}
                className="mt-1 w-full bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-sm"
              />
            </label>
            <label className="block text-[10px] text-zinc-500 uppercase">
              Excerpt (listing card)
              <textarea
                value={form.excerpt}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                rows={2}
                className="mt-1 w-full bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-sm"
              />
            </label>
            <label className="block text-[10px] text-zinc-500 uppercase">
              Body HTML (trusted — link to /learn/… and app paths)
              <textarea
                value={form.body_html}
                onChange={(e) => setForm((f) => ({ ...f, body_html: e.target.value }))}
                rows={22}
                className="mt-1 w-full bg-zinc-200/50 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-700 text-xs font-mono min-h-[280px]"
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-[10px] text-zinc-500 uppercase">
                OG image URL (optional)
                <input
                  value={form.og_image_url}
                  onChange={(e) => setForm((f) => ({ ...f, og_image_url: e.target.value }))}
                  className="mt-1 w-full bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-sm"
                />
              </label>
              <label className="block text-[10px] text-zinc-500 uppercase">
                Author name
                <input
                  value={form.author_name}
                  onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))}
                  className="mt-1 w-full bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-sm"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-2 py-1.5 text-zinc-900 text-xs"
                >
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                Published at (optional ISO / SQLite time)
                <input
                  value={form.published_at}
                  onChange={(e) => setForm((f) => ({ ...f, published_at: e.target.value }))}
                  placeholder="auto when publishing if empty"
                  className="bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg px-2 py-1.5 text-zinc-900 text-xs font-mono flex-1 min-w-[12rem]"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
              {editingId !== 'new' && (
                <button
                  type="button"
                  onClick={del}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white text-sm"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => { setEditingId(null); setForm({ ...emptyForm }); }}
                className="px-4 py-2 rounded-lg bg-zinc-100 ring-1 ring-zinc-200/80 text-sm text-zinc-600"
              >
                Close editor
              </button>
            </div>
          </div>
        </ASection>
      )}
    </div>
  );
}
