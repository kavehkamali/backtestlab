import { useState } from 'react';
import { X, Loader2, Eye, EyeOff, Check, AlertCircle, Mail } from 'lucide-react';
import { signup, signin, forgotPassword, resetPassword, verifyEmail, resendVerification, resendVerificationPublic } from '../api';

function Req({ met, children }) {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${met ? 'text-emerald-700' : 'text-zinc-500'}`}>
      {met ? <Check className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full ring-1 ring-zinc-300" />}
      {children}
    </div>
  );
}

function CustomCheck({ checked, onChange, children }) {
  return (
    <div className="flex items-start gap-2.5 cursor-pointer group" onClick={() => onChange(!checked)}>
      <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ring-1 ${
        checked ? 'bg-zinc-800 ring-zinc-800 dark:bg-zinc-200 dark:ring-zinc-200' : 'ring-zinc-300 group-hover:ring-zinc-400 bg-white dark:bg-zinc-800 dark:ring-zinc-600'
      }`}>
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      <span className="text-xs text-zinc-600 group-hover:text-zinc-800 leading-relaxed select-none dark:text-zinc-400 dark:group-hover:text-zinc-200">{children}</span>
    </div>
  );
}

export default function AuthModal({ onClose, onAuth, mode: initialMode = 'signup', message, forced = false }) {
  const [mode, setMode] = useState(initialMode); // signup | signin | forgot | reset | verify
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consentPolicy, setConsentPolicy] = useState(false);
  const [consentNewsletter, setConsentNewsletter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [resetToken, setResetToken] = useState('');
  const [resendLoading, setResendLoading] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 8;
  const passwordHasUpper = /[A-Z]/.test(password);
  const passwordHasNumber = /[0-9]/.test(password);

  // Check URL for verify/reset tokens on mount
  useState(() => {
    const hash = window.location.hash;
    if (hash.includes('verify?token=')) {
      const token = hash.split('token=')[1];
      if (token) {
        setMode('verify');
        verifyEmail(token).then(d => {
          setSuccess(d.message || 'Email verified!');
          window.location.hash = '';
        }).catch(e => setError(e.message));
      }
    }
    if (hash.includes('reset?token=')) {
      const token = hash.split('token=')[1];
      if (token) {
        setMode('reset');
        setResetToken(token);
        window.location.hash = '';
      }
    }
  });

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (mode === 'forgot') {
      if (!emailValid) { setError('Enter a valid email'); return; }
      setLoading(true);
      try {
        const d = await forgotPassword(email);
        setSuccess(d.message);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
      return;
    }

    if (mode === 'reset') {
      if (!passwordValid) { setError('Password must be at least 8 characters'); return; }
      setLoading(true);
      try {
        const d = await resetPassword(resetToken, password);
        setSuccess(d.message + ' Redirecting to sign in...');
        setTimeout(() => { setMode('signin'); setSuccess(null); }, 2000);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
      return;
    }

    if (!emailValid) { setError('Please enter a valid email address'); return; }

    if (mode === 'signup') {
      if (!passwordValid) { setError('Password must be at least 8 characters'); return; }
      if (!consentPolicy) { setError('You must accept the Privacy Policy and Terms of Service'); return; }
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const data = await signup({ email, password, name, consent_policy: consentPolicy, consent_newsletter: consentNewsletter });
        if (data.email_sent === false) {
          setSuccess('Account created, but verification email could not be sent. You can resend after signing in.');
        } else {
          setSuccess('Account created! Check your email to verify your account.');
        }
        const pw = password;
        setTimeout(() => onAuth(data.user, { password: pw, mode: 'signup' }), 1500);
      } else {
        const data = await signin({ email, password });
        onAuth(data.user, { password, mode: 'signin' });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSubmit(); };

  const switchMode = (m) => { setMode(m); setError(null); setSuccess(null); };

  // Verify mode — just show result
  if (mode === 'verify') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" />
        <div className="relative bg-white rounded-2xl w-full max-w-sm mx-4 p-6 text-center shadow-xl shadow-zinc-900/10 ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:ring-zinc-700 dark:shadow-black/30">
          <Mail className="w-10 h-10 text-zinc-500 mx-auto mb-3 dark:text-zinc-400" />
          <h2 className="text-lg font-bold text-zinc-900 mb-2 dark:text-zinc-100">Email Verification</h2>
          {success && <p className="text-emerald-700 text-sm mb-4 dark:text-emerald-400">{success}</p>}
          {error && <p className="text-red-600 text-sm mb-4 dark:text-red-400">{error}</p>}
          <button onClick={() => { if (onClose) onClose(); else switchMode('signin'); }}
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">Continue</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={forced ? undefined : onClose}>
      <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" />

      <div className="relative bg-white rounded-2xl w-full max-w-md mx-3 sm:mx-4 shadow-xl shadow-zinc-900/10 ring-1 ring-zinc-200/80 max-h-[90vh] overflow-y-auto dark:bg-zinc-900 dark:ring-zinc-700 dark:shadow-black/30" onClick={e => e.stopPropagation()}>
        {!forced && onClose && (
          <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-800 transition-colors dark:hover:text-zinc-200">
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="p-6">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {mode === 'signup' ? 'Create your account' : mode === 'signin' ? 'Welcome back' : mode === 'forgot' ? 'Forgot password' : 'Reset password'}
            </h2>
            {message && <p className="text-sm text-zinc-600 mt-2 dark:text-zinc-300">{message}</p>}
            {!message && mode === 'signup' && <p className="text-sm text-zinc-500 mt-1 dark:text-zinc-400">Get unlimited access to Equilima</p>}
            {mode === 'forgot' && <p className="text-sm text-zinc-500 mt-1 dark:text-zinc-400">Enter your email to receive a reset link</p>}
            {mode === 'reset' && <p className="text-sm text-zinc-500 mt-1 dark:text-zinc-400">Choose a new password</p>}
          </div>

          <div className="space-y-4" onKeyDown={handleKeyDown}>
            {/* Name — signup only */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1 dark:text-zinc-400">Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
                  className="w-full bg-zinc-50 rounded-lg px-4 py-2.5 text-zinc-900 text-sm ring-1 ring-zinc-200/80 focus:outline-none focus:ring-2 focus:ring-zinc-300/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600 dark:focus:ring-zinc-500/80" />
              </div>
            )}

            {/* Email — signup, signin, forgot */}
            {(mode === 'signup' || mode === 'signin' || mode === 'forgot') && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1 dark:text-zinc-400">Email</label>
                <input type="text" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com"
                  className={`w-full bg-zinc-50 rounded-lg px-4 py-2.5 text-zinc-900 text-sm focus:outline-none transition-shadow ring-1 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600 ${
                    email && !emailValid ? 'ring-red-300' : 'ring-zinc-200/80 focus:ring-2 focus:ring-zinc-300/80 dark:focus:ring-zinc-500/80'
                  }`} />
                {email && !emailValid && (
                  <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Enter a valid email</p>
                )}
              </div>
            )}

            {/* Password — signup, signin, reset */}
            {(mode === 'signup' || mode === 'signin' || mode === 'reset') && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1 dark:text-zinc-400">
                  {mode === 'reset' ? 'New password' : 'Password'}
                </label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password"
                    className="w-full bg-zinc-50 rounded-lg px-4 py-2.5 pr-10 text-zinc-900 text-sm ring-1 ring-zinc-200/80 focus:outline-none focus:ring-2 focus:ring-zinc-300/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-600 dark:focus:ring-zinc-500/80" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {(mode === 'signup' || mode === 'reset') && password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <Req met={passwordValid}>At least 8 characters</Req>
                    <Req met={passwordHasUpper}>One uppercase letter</Req>
                    <Req met={passwordHasNumber}>One number</Req>
                  </div>
                )}
              </div>
            )}

            {/* Forgot password link — signin only */}
            {mode === 'signin' && (
              <button onClick={() => switchMode('forgot')} className="text-[11px] text-zinc-600 hover:underline dark:text-zinc-400">
                Forgot your password?
              </button>
            )}

            {/* Consent — signup only */}
            {mode === 'signup' && (
              <div className="space-y-3 pt-1">
                <CustomCheck checked={consentPolicy} onChange={setConsentPolicy}>
                  I agree to the{' '}
                  <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-zinc-700 hover:underline dark:text-zinc-300" onClick={e => e.stopPropagation()}>Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-zinc-700 hover:underline dark:text-zinc-300" onClick={e => e.stopPropagation()}>Privacy Policy</a>
                  {' '}<span className="text-red-400">*</span>
                </CustomCheck>
                <CustomCheck checked={consentNewsletter} onChange={setConsentNewsletter}>
                  I'd like to receive market insights and newsletters from Equilima. Unsubscribe anytime.
                </CustomCheck>
              </div>
            )}

            {/* Messages */}
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-800 text-xs flex items-start gap-2 ring-1 ring-red-200/80 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900/50">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}
            {success && (
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 text-xs flex items-start gap-2 ring-1 ring-emerald-200/80 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900/40">
                <Check className="w-4 h-4 shrink-0 mt-0.5" /><span>{success}</span>
              </div>
            )}

            {/* Resend verification helper */}
            {mode === 'signin' && (
              <button
                type="button"
                disabled={resendLoading}
                onClick={async () => {
                  setResendLoading(true);
                  setError(null);
                  setSuccess(null);
                  try {
                    // Prefer public resend so it works even if signin requires verification.
                    if (!emailValid) throw new Error('Enter a valid email');
                    const r = await resendVerificationPublic(email);
                    setSuccess(r.message || 'Verification email sent');
                  } catch (e) {
                    setError(e.message || 'Failed to resend verification');
                  } finally {
                    setResendLoading(false);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200/80 disabled:opacity-50 text-zinc-800 font-medium py-2.5 rounded-lg transition-colors text-sm ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:ring-zinc-600"
              >
                {resendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Resend verification email
              </button>
            )}

            {/* Submit */}
            <button onClick={handleSubmit} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {mode === 'signup' ? 'Create Account' : mode === 'signin' ? 'Sign In' : mode === 'forgot' ? 'Send Reset Link' : 'Reset Password'}
            </button>
          </div>

          {/* Mode switchers */}
          <div className="text-center mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            {mode === 'signup' && <>Already have an account? <button onClick={() => switchMode('signin')} className="text-zinc-700 hover:underline dark:text-zinc-300">Sign in</button></>}
            {mode === 'signin' && <>Don't have an account? <button onClick={() => switchMode('signup')} className="text-zinc-700 hover:underline dark:text-zinc-300">Create one</button></>}
            {mode === 'forgot' && <><button onClick={() => switchMode('signin')} className="text-zinc-700 hover:underline dark:text-zinc-300">Back to sign in</button></>}
            {mode === 'reset' && <><button onClick={() => switchMode('signin')} className="text-zinc-700 hover:underline dark:text-zinc-300">Back to sign in</button></>}
          </div>
        </div>
      </div>
    </div>
  );
}
