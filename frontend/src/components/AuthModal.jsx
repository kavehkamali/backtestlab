import { useState } from 'react';
import { X, Loader2, Eye, EyeOff, Check, AlertCircle, Mail } from 'lucide-react';
import { signup, signin, forgotPassword, resetPassword, verifyEmail, resendVerification, resendVerificationPublic } from '../api';

function Req({ met, children }) {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${met ? 'text-[var(--eq-gain)]' : 'text-[var(--eq-text3)]'}`}>
      {met ? <Check className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full ring-1 ring-[var(--eq-border2)]" />}
      {children}
    </div>
  );
}

function CustomCheck({ checked, onChange, children }) {
  return (
    <div className="flex items-start gap-2.5 cursor-pointer group" onClick={() => onChange(!checked)}>
      <div className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ring-1 ${
        checked ? 'bg-[var(--eq-accent)] ring-[var(--eq-accent)]' : 'bg-[var(--eq-card)] ring-[var(--eq-border2)] group-hover:ring-[var(--eq-text3)]'
      }`}>
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>
      <span className="select-none text-xs leading-relaxed text-[var(--eq-text2)] group-hover:text-[var(--eq-text)]">{children}</span>
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
        <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
        <div className="eq-card eq-fade-up relative mx-4 w-full max-w-sm p-6 text-center !shadow-[var(--eq-shadow-pop)]">
          <Mail className="mx-auto mb-3 h-10 w-10 text-[var(--eq-text3)]" />
          <h2 className="mb-2 text-lg font-semibold tracking-tight text-[var(--eq-text)]">Email Verification</h2>
          {success && <p className="mb-4 text-sm text-[var(--eq-gain)]">{success}</p>}
          {error && <p className="mb-4 text-sm text-[var(--eq-loss)]">{error}</p>}
          <button onClick={() => { if (onClose) onClose(); else switchMode('signin'); }}
            className="rounded-lg bg-[var(--eq-text)] px-4 py-2 text-sm font-semibold text-[var(--eq-bg)] transition-opacity hover:opacity-85">Continue</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={forced ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />

      <div className="eq-card eq-fade-up relative mx-3 max-h-[90vh] w-full max-w-md overflow-y-auto !shadow-[var(--eq-shadow-pop)] sm:mx-4" onClick={e => e.stopPropagation()}>
        {!forced && onClose && (
          <button onClick={onClose} className="absolute right-4 top-4 text-[var(--eq-text3)] transition-colors hover:text-[var(--eq-text)]">
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="p-6">
          <div className="text-center mb-6">
            {message && (
              <div className="eq-chip eq-chip-gain mx-auto mb-3 !text-[11px] !normal-case !tracking-normal">
                <Check className="h-3.5 w-3.5" /> Free forever tier · No credit card
              </div>
            )}
            <h2 className="text-xl font-semibold tracking-tight text-[var(--eq-text)]">
              {mode === 'signup' ? 'Create your account' : mode === 'signin' ? 'Welcome back' : mode === 'forgot' ? 'Forgot password' : 'Reset password'}
            </h2>
            {message && <p className="mt-2 text-sm text-[var(--eq-text2)]">{message}</p>}
            {!message && mode === 'signup' && <p className="mt-1 text-sm text-[var(--eq-text3)]">Unlimited access is free. No credit card required.</p>}
            {mode === 'forgot' && <p className="mt-1 text-sm text-[var(--eq-text3)]">Enter your email to receive a reset link</p>}
            {mode === 'reset' && <p className="mt-1 text-sm text-[var(--eq-text3)]">Choose a new password</p>}
          </div>

          <div className="space-y-4" onKeyDown={handleKeyDown}>
            {/* Name — signup only */}
            {mode === 'signup' && (
              <div>
                <label className="eq-label mb-1.5 block">Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
                  className="eq-input" />
              </div>
            )}

            {/* Email — signup, signin, forgot */}
            {(mode === 'signup' || mode === 'signin' || mode === 'forgot') && (
              <div>
                <label className="eq-label mb-1.5 block">Email</label>
                <input type="text" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com"
                  className={`eq-input ${email && !emailValid ? '!border-[var(--eq-loss)]' : ''}`} />
                {email && !emailValid && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-[var(--eq-loss)]"><AlertCircle className="w-3 h-3" /> Enter a valid email</p>
                )}
              </div>
            )}

            {/* Password — signup, signin, reset */}
            {(mode === 'signup' || mode === 'signin' || mode === 'reset') && (
              <div>
                <label className="eq-label mb-1.5 block">
                  {mode === 'reset' ? 'New password' : 'Password'}
                </label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password"
                    className="eq-input pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--eq-text3)] hover:text-[var(--eq-text)]">
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
              <button onClick={() => switchMode('forgot')} className="text-[11px] text-[var(--eq-text3)] hover:text-[var(--eq-text2)] hover:underline">
                Forgot your password?
              </button>
            )}

            {/* Consent — signup only */}
            {mode === 'signup' && (
              <div className="space-y-3 pt-1">
                <CustomCheck checked={consentPolicy} onChange={setConsentPolicy}>
                  I agree to the{' '}
                  <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--eq-accent)] hover:underline" onClick={e => e.stopPropagation()}>Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--eq-accent)] hover:underline" onClick={e => e.stopPropagation()}>Privacy Policy</a>
                  {' '}<span className="text-[var(--eq-loss)]">*</span>
                </CustomCheck>
                <CustomCheck checked={consentNewsletter} onChange={setConsentNewsletter}>
                  I'd like to receive market insights and newsletters from Equilima. Unsubscribe anytime.
                </CustomCheck>
              </div>
            )}

            {/* Messages */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-[var(--eq-loss-soft)] p-3 text-xs text-[var(--eq-loss)]">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 rounded-lg bg-[var(--eq-gain-soft)] p-3 text-xs text-[var(--eq-gain)]">
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
                className="eq-btn w-full !py-2.5 disabled:opacity-50"
              >
                {resendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Resend verification email
              </button>
            )}

            {/* Submit */}
            <button onClick={handleSubmit} disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--eq-text)] py-2.5 text-sm font-semibold text-[var(--eq-bg)] transition-opacity hover:opacity-85 disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {mode === 'signup' ? 'Create Account' : mode === 'signin' ? 'Sign In' : mode === 'forgot' ? 'Send Reset Link' : 'Reset Password'}
            </button>
          </div>

          {/* Mode switchers */}
          <div className="mt-4 text-center text-xs text-[var(--eq-text3)]">
            {mode === 'signup' && <>Already have an account? <button onClick={() => switchMode('signin')} className="font-medium text-[var(--eq-accent)] hover:underline">Sign in</button></>}
            {mode === 'signin' && <>Don't have an account? <button onClick={() => switchMode('signup')} className="font-medium text-[var(--eq-accent)] hover:underline">Create one</button></>}
            {mode === 'forgot' && <><button onClick={() => switchMode('signin')} className="font-medium text-[var(--eq-accent)] hover:underline">Back to sign in</button></>}
            {mode === 'reset' && <><button onClick={() => switchMode('signin')} className="font-medium text-[var(--eq-accent)] hover:underline">Back to sign in</button></>}
          </div>
        </div>
      </div>
    </div>
  );
}
