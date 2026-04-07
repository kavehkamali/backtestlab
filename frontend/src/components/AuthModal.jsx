import { useState } from 'react';
import { X, Loader2, Eye, EyeOff, Check, AlertCircle, Mail } from 'lucide-react';
import { signup, signin, forgotPassword, resetPassword, verifyEmail, resendVerification, resendVerificationPublic } from '../api';

function Req({ met, children }) {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${met ? 'text-emerald-400' : 'text-gray-500'}`}>
      {met ? <Check className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-gray-600" />}
      {children}
    </div>
  );
}

function CustomCheck({ checked, onChange, children }) {
  return (
    <div className="flex items-start gap-2.5 cursor-pointer group" onClick={() => onChange(!checked)}>
      <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
        checked ? 'bg-indigo-500 border-indigo-500' : 'border-gray-600 group-hover:border-gray-400'
      }`}>
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      <span className="text-xs text-gray-400 group-hover:text-gray-300 leading-relaxed select-none">{children}</span>
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
        setTimeout(() => onAuth(data.user), 1500);
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

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSubmit(); };

  const switchMode = (m) => { setMode(m); setError(null); setSuccess(null); };

  // Verify mode — just show result
  if (mode === 'verify') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative bg-[#12121a] border border-white/10 rounded-2xl w-full max-w-sm mx-4 p-6 text-center">
          <Mail className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white mb-2">Email Verification</h2>
          {success && <p className="text-emerald-400 text-sm mb-4">{success}</p>}
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button onClick={() => { if (onClose) onClose(); else switchMode('signin'); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Continue</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={forced ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative bg-[#12121a] border border-white/10 rounded-2xl w-full max-w-md mx-3 sm:mx-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {!forced && onClose && (
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="p-6">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white">
              {mode === 'signup' ? 'Create your account' : mode === 'signin' ? 'Welcome back' : mode === 'forgot' ? 'Forgot password' : 'Reset password'}
            </h2>
            {message && <p className="text-sm text-indigo-400 mt-2">{message}</p>}
            {!message && mode === 'signup' && <p className="text-sm text-gray-500 mt-1">Get unlimited access to Equilima</p>}
            {mode === 'forgot' && <p className="text-sm text-gray-500 mt-1">Enter your email to receive a reset link</p>}
            {mode === 'reset' && <p className="text-sm text-gray-500 mt-1">Choose a new password</p>}
          </div>

          <div className="space-y-4" onKeyDown={handleKeyDown}>
            {/* Name — signup only */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500/50" />
              </div>
            )}

            {/* Email — signup, signin, forgot */}
            {(mode === 'signup' || mode === 'signin' || mode === 'forgot') && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email</label>
                <input type="text" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com"
                  className={`w-full bg-white/5 border rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none transition-colors ${
                    email && !emailValid ? 'border-red-500/50' : 'border-white/10 focus:border-indigo-500/50'
                  }`} />
                {email && !emailValid && (
                  <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Enter a valid email</p>
                )}
              </div>
            )}

            {/* Password — signup, signin, reset */}
            {(mode === 'signup' || mode === 'signin' || mode === 'reset') && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {mode === 'reset' ? 'New password' : 'Password'}
                </label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 pr-10 text-white text-sm focus:outline-none focus:border-indigo-500/50" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
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
              <button onClick={() => switchMode('forgot')} className="text-[11px] text-indigo-400 hover:underline">
                Forgot your password?
              </button>
            )}

            {/* Consent — signup only */}
            {mode === 'signup' && (
              <div className="space-y-3 pt-1">
                <CustomCheck checked={consentPolicy} onChange={setConsentPolicy}>
                  I agree to the{' '}
                  <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline" onClick={e => e.stopPropagation()}>Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline" onClick={e => e.stopPropagation()}>Privacy Policy</a>
                  {' '}<span className="text-red-400">*</span>
                </CustomCheck>
                <CustomCheck checked={consentNewsletter} onChange={setConsentNewsletter}>
                  I'd like to receive market insights and newsletters from Equilima. Unsubscribe anytime.
                </CustomCheck>
              </div>
            )}

            {/* Messages */}
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}
            {success && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
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
                className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50 text-gray-200 font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                {resendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Resend verification email
              </button>
            )}

            {/* Submit */}
            <button onClick={handleSubmit} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {mode === 'signup' ? 'Create Account' : mode === 'signin' ? 'Sign In' : mode === 'forgot' ? 'Send Reset Link' : 'Reset Password'}
            </button>
          </div>

          {/* Mode switchers */}
          <div className="text-center mt-4 text-xs text-gray-500">
            {mode === 'signup' && <>Already have an account? <button onClick={() => switchMode('signin')} className="text-indigo-400 hover:underline">Sign in</button></>}
            {mode === 'signin' && <>Don't have an account? <button onClick={() => switchMode('signup')} className="text-indigo-400 hover:underline">Create one</button></>}
            {mode === 'forgot' && <><button onClick={() => switchMode('signin')} className="text-indigo-400 hover:underline">Back to sign in</button></>}
            {mode === 'reset' && <><button onClick={() => switchMode('signin')} className="text-indigo-400 hover:underline">Back to sign in</button></>}
          </div>
        </div>
      </div>
    </div>
  );
}
