import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  User as UserIcon,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  KeyRound,
  UserPlus,
  LogIn,
} from 'lucide-react';
import {
  authService,
  User,
  validatePassword,
  validateEmail,
} from '../services/auth-service';

interface AuthPageProps {
  onAuthSuccess: (user: User) => void;
  initialMode?: 'login' | 'signup';
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onAuthSuccess,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Real-time validations
  const passValidation = validatePassword(password);
  const isEmailValid = email.length > 0 ? validateEmail(email) : true;
  const passwordsMatch =
    password.length > 0 && confirmPassword.length > 0
      ? password === confirmPassword
      : true;

  const handleSwitchMode = (newMode: 'login' | 'signup') => {
    setMode(newMode);
    setError(null);
    setSuccessNotice(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!validateEmail(email)) {
      setError('Please enter a valid email format (e.g. user@domain.com).');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const user = await authService.login({ email, password });
      onAuthSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    // Front-end validations before submitting
    if (!name.trim() || name.trim().length < 2) {
      setError('Please enter your full name (minimum 2 characters).');
      return;
    }
    if (!email.trim() || !validateEmail(email)) {
      setError('Please provide a valid email address.');
      return;
    }
    if (!passValidation.hasMinLength) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!passValidation.hasUppercase || !passValidation.hasLowercase || !passValidation.hasNumber) {
      setError('Password must include uppercase, lowercase, and numeric characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }
    if (!agreeTerms) {
      setError('Please acknowledge the Security Operations policy before creating an account.');
      return;
    }

    setLoading(true);
    try {
      const newUser = await authService.signUp({
        name,
        email,
        password,
        confirmPassword,
      });
      setSuccessNotice(`Account created successfully for ${newUser.name}! Logging you in...`);
      setTimeout(() => {
        onAuthSuccess(newUser);
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans relative overflow-hidden">
      {/* Background cyber grid & glow accents */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8 space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 shadow-lg shadow-cyan-950 mb-2">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            ProbMail Security
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
            Intelligent Email Protection &amp; Bayesian Threat Analytics
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden">
          {/* Tab switch header */}
          <div className="grid grid-cols-2 border-b border-slate-800 bg-slate-950/50">
            <button
              type="button"
              onClick={() => handleSwitchMode('login')}
              className={`py-3.5 text-xs font-semibold flex items-center justify-center space-x-2 transition ${
                mode === 'login'
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-900/80'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Log In</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('signup')}
              className={`py-3.5 text-xs font-semibold flex items-center justify-center space-x-2 transition ${
                mode === 'signup'
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-900/80'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Sign Up</span>
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-5">
            {/* Alert banner if error */}
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start space-x-2.5 animate-fadeIn">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{error}</div>
              </div>
            )}

            {/* Success notification */}
            {successNotice && (
              <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center space-x-2.5 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex-1 font-medium">{successNotice}</div>
              </div>
            )}

            {/* LOGIN FORM */}
            {mode === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="email"
                      required
                      placeholder="analyst@security.org"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-300">
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Requirement Callout */}
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 flex items-start space-x-2">
                  <AlertCircle className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    New user? You must <strong className="text-cyan-400">Sign Up</strong> first. Login is restricted strictly to registered accounts.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-cyan-500/20 active:scale-98 disabled:opacity-50"
                >
                  {loading ? (
                    <span>Authenticating...</span>
                  ) : (
                    <>
                      <span>Sign In to ProbMail</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <p className="text-xs text-slate-400">
                    Don't have an account yet?{' '}
                    <button
                      type="button"
                      onClick={() => handleSwitchMode('signup')}
                      className="text-cyan-400 hover:underline font-semibold ml-1"
                    >
                      Create an account
                    </button>
                  </p>
                </div>
              </form>
            )}

            {/* SIGNUP FORM */}
            {mode === 'signup' && (
              <form onSubmit={handleSignupSubmit} className="space-y-4">
                {/* Full Name */}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-300">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-medium text-slate-300">
                      Work / Security Email
                    </label>
                    {email.length > 0 && !isEmailValid && (
                      <span className="text-[10px] text-rose-400">Invalid format</span>
                    )}
                  </div>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type="email"
                      required
                      placeholder="analyst@security.org"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950/80 border text-xs text-white placeholder-slate-500 focus:outline-none transition ${
                        email.length > 0 && !isEmailValid
                          ? 'border-rose-500 focus:border-rose-500'
                          : 'border-slate-800 focus:border-cyan-500'
                      }`}
                    />
                  </div>
                </div>



                {/* Password with Strength Meter */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-medium text-slate-300">
                      Password
                    </label>
                    {password.length > 0 && (
                      <span
                        className="text-[10px] font-semibold uppercase font-mono"
                        style={{ color: passValidation.strengthColor }}
                      >
                        {passValidation.strengthLabel}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Min 8 characters (mixed case, digit)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password Strength Indicator Bar */}
                  {password.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full transition-all duration-300 rounded-full"
                          style={{
                            width: `${passValidation.strengthScore}%`,
                            backgroundColor: passValidation.strengthColor,
                          }}
                        />
                      </div>

                      {/* Requirement checklist */}
                      <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400 pt-1 font-sans">
                        <div className="flex items-center space-x-1">
                          {passValidation.hasMinLength ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <XCircle className="w-3 h-3 text-slate-600" />
                          )}
                          <span className={passValidation.hasMinLength ? 'text-slate-200' : ''}>
                            8+ characters
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {passValidation.hasUppercase ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <XCircle className="w-3 h-3 text-slate-600" />
                          )}
                          <span className={passValidation.hasUppercase ? 'text-slate-200' : ''}>
                            Uppercase (A-Z)
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {passValidation.hasLowercase ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <XCircle className="w-3 h-3 text-slate-600" />
                          )}
                          <span className={passValidation.hasLowercase ? 'text-slate-200' : ''}>
                            Lowercase (a-z)
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {passValidation.hasNumber ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <XCircle className="w-3 h-3 text-slate-600" />
                          )}
                          <span className={passValidation.hasNumber ? 'text-slate-200' : ''}>
                            Number (0-9)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-medium text-slate-300">
                      Confirm Password
                    </label>
                    {confirmPassword.length > 0 && (
                      <span
                        className={`text-[10px] ${
                          passwordsMatch ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-950/80 border text-xs text-white placeholder-slate-500 focus:outline-none transition ${
                        confirmPassword.length > 0 && !passwordsMatch
                          ? 'border-rose-500 focus:border-rose-500'
                          : 'border-slate-800 focus:border-cyan-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Terms checkbox */}
                <div className="flex items-start space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
                  />
                  <label htmlFor="terms" className="text-[11px] text-slate-400 leading-tight">
                    I acknowledge that access credentials will be securely stored and required for all subsequent logins.
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-cyan-500/20 active:scale-98 disabled:opacity-50"
                >
                  {loading ? (
                    <span>Registering Account...</span>
                  ) : (
                    <>
                      <span>Complete Registration &amp; Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <p className="text-xs text-slate-400">
                    Already registered?{' '}
                    <button
                      type="button"
                      onClick={() => handleSwitchMode('login')}
                      className="text-cyan-400 hover:underline font-semibold ml-1"
                    >
                      Log in here
                    </button>
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Security watermark footer */}
        <div className="text-center mt-6 text-[11px] text-slate-500 space-y-1">
          <p>End-to-End Cryptographic Password Hashing (SHA-256 with Unique Salt)</p>
          <p>ProbMail Threat Management Engine</p>
        </div>
      </div>
    </div>
  );
};
