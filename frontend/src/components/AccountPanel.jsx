import { useEffect, useState } from 'react';
import { Loader2, Save, Shield, Trash2, KeyRound } from 'lucide-react';
import { fetchMe, updateMe, changePassword, deleteAccount, signout } from '../api';

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

export default function AccountPanel({ onSignedOut }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const [name, setName] = useState('');
  const [newsletter, setNewsletter] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');

  const [deletePw, setDeletePw] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchMe();
      setMe(d);
      setName(d.name || '');
      setNewsletter(!!d.consent_newsletter);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      await updateMe({ name, consent_newsletter: newsletter });
      setOk('Saved');
      await load();
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const doChangePassword = async () => {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      await changePassword(currentPw, newPw);
      setOk('Password updated');
      setCurrentPw('');
      setNewPw('');
    } catch (e) {
      setError(e.message || 'Password change failed');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    setError(null);
    setOk(null);
    try {
      await deleteAccount({ password: deletePw, confirm: deleteConfirm });
      signout();
      onSignedOut?.();
    } catch (e) {
      setError(e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading account...</div>;
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}
      {ok && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
          {ok}
        </div>
      )}

      <Section title="Account" right={<Shield className="w-4 h-4 text-gray-500" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Email</label>
            <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono">
              {me?.email || '—'}
            </div>
            <div className="text-[11px] mt-1 text-gray-500">
              Email verification: <span className={me?.email_verified ? 'text-emerald-400' : 'text-yellow-400'}>{me?.email_verified ? 'Verified' : 'Not verified'}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
              placeholder="Your name"
            />
            <div className="text-[11px] mt-1 text-gray-500">Created: {me?.created_at?.slice(0, 16) || '—'}</div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            checked={newsletter}
            onChange={(e) => setNewsletter(e.target.checked)}
            className="mt-1"
          />
          <div>
            <div className="text-sm text-gray-200">Newsletter</div>
            <div className="text-xs text-gray-500">Receive market insights and product updates. You can unsubscribe anytime.</div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={saveProfile}
            disabled={saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm text-white font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </button>
        </div>
      </Section>

      <Section title="Security" right={<KeyRound className="w-4 h-4 text-gray-500" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Current password</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">New password</label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={doChangePassword}
            disabled={saving || !currentPw || !newPw}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50 text-sm text-gray-200 font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Change password
          </button>
        </div>
      </Section>

      <Section title="Danger zone" right={<Trash2 className="w-4 h-4 text-red-400" />}>
        <p className="text-xs text-gray-500 mb-3">
          Delete your account and remove your user record. Your past analytics events will be de-linked from your user id.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500/40"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Type DELETE to confirm</label>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-red-500/40"
              placeholder="DELETE"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={doDelete}
            disabled={deleting || !deletePw || deleteConfirm.toUpperCase() !== 'DELETE'}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-sm text-white font-medium"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete my account
          </button>
        </div>
      </Section>
    </div>
  );
}

