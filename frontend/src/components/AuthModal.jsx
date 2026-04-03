import { useState } from 'react';
import { X, Loader2, Eye, EyeOff } from 'lucide-react';
import { signup, signin } from '../api';

export default function AuthModal({ onClose, onAuth, mode: initialMode = 'signup', message }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consentPolicy, setConsentPolicy] = useState(false);
  const [consentNewsletter, setConsentNewsletter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!consentPolicy) {
          setError('You must accept the Privacy Policy and Terms of Service');
          setLoading(false);
          return;
        }
        const data = await signup({ email, password, name, consent_policy: consentPolicy, consent_newsletter: consentNewsletter });
        onAuth(data.user);
      } else {
        const data = await signin({ email, password });
        onAuth(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-[#12121a] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
            {message && <p className="text-sm text-indigo-400 mt-2">{message}</p>}
            {!message && <p className="text-sm text-gray-500 mt-1">{mode === 'signup' ? 'Get unlimited access to Equilima' : 'Sign in to your account'}</p>}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500/50" />
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500/50" />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder={mode === 'signup' ? 'Min 8 characters' : 'Your password'}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 pr-10 text-white text-sm focus:outline-none focus:border-indigo-500/50" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Consent checkboxes (signup only) */}
            {mode === 'signup' && (
              <div className="space-y-3 pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <input type="checkbox" checked={consentPolicy} onChange={e => setConsentPolicy(e.target.checked)}
                    className="mt-0.5 accent-indigo-500 w-4 h-4 rounded" />
                  <span className="text-xs text-gray-400 group-hover:text-gray-300 leading-relaxed">
                    I agree to the <a href="/privacy" target="_blank" className="text-indigo-400 hover:underline">Privacy Policy</a> and <a href="/terms" target="_blank" className="text-indigo-400 hover:underline">Terms of Service</a> <span className="text-red-400">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <input type="checkbox" checked={consentNewsletter} onChange={e => setConsentNewsletter(e.target.checked)}
                    className="mt-0.5 accent-indigo-500 w-4 h-4 rounded" />
                  <span className="text-xs text-gray-400 group-hover:text-gray-300 leading-relaxed">
                    I'd like to receive market insights, product updates, and newsletters from Equilima via email
                  </span>
                </label>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {error}
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {mode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          {/* Toggle mode */}
          <div className="text-center mt-4 text-xs text-gray-500">
            {mode === 'signup' ? (
              <>Already have an account? <button onClick={() => { setMode('signin'); setError(null); }} className="text-indigo-400 hover:underline">Sign in</button></>
            ) : (
              <>Don't have an account? <button onClick={() => { setMode('signup'); setError(null); }} className="text-indigo-400 hover:underline">Create one</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
