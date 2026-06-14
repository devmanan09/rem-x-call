import React, { useEffect, useState } from 'react';
import { Mail, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../lib/apiError';
import { homePathForRole } from '../lib/roles';

const Login = () => {
  const navigate = useNavigate();
  const { login, isReady } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Show message if redirected due to company deactivation
  useEffect(() => {
    const msg = sessionStorage.getItem('remxcall_login_error');
    if (msg) {
      setFormError(msg);
      sessionStorage.removeItem('remxcall_login_error');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEmailError('');
    setPasswordError('');
    setFormError('');

    if (!email.includes('@')) {
      setEmailError('Please enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await login(email, password);
      const role = data?.user?.role;
      navigate(homePathForRole(role), { replace: true });
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full animate-in fade-in zoom-in duration-300">
      <div className="text-center mb-10">
        <Logo />
        <h1 className="text-[32px] font-[790] leading-[28px] tracking-[-0.04em] text-[#1a1a1a] mb-3 font-['SF_Compact',_system-ui,_sans-serif]">Welcome to RemXCall</h1>
        <p className="text-[15px] text-gray-500 font-medium">Connect Instantly with clients</p>
      </div>

      <form onSubmit={handleSubmit} autoComplete="off" className="space-y-5">
        {formError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-600">
            {formError}
          </p>
        )}
        <div>
          <label className="block text-[13px] font-semibold text-gray-700 mb-1.5 ml-1">Email</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Mail className={`h-4 w-4 ${emailError ? 'text-red-400' : 'text-gray-400'}`} />
            </div>
            <input
              type="text"
              className={`block w-full pl-10 pr-3 py-3 border ${emailError ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200 focus:ring-[#7ae230] focus:border-[#7ae230]'} rounded-xl text-sm bg-[#f8f9fb] transition-all`}
              placeholder="Enter Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {emailError && <p className="mt-1.5 text-xs text-red-500 ml-1 font-medium">{emailError}</p>}
        </div>

        <div>
           <label className="block text-[13px] font-semibold text-gray-700 mb-1.5 ml-1">Password</label>
           <div className="relative">
             <input
               type={showPassword ? 'text' : 'password'}
               className={`block w-full px-3.5 py-3 border ${passwordError ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-200 focus:ring-[#7ae230] focus:border-[#7ae230]'} rounded-xl text-sm bg-[#f8f9fb] transition-all`}
               placeholder="Enter Password"
               value={password}
               onChange={(e) => setPassword(e.target.value)}
             />
             <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
               <button
                 type="button"
                 onClick={() => setShowPassword(!showPassword)}
                 className="text-gray-400 hover:text-gray-600 focus:outline-none"
               >
                 {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
               </button>
             </div>
           </div>
           {passwordError && <p className="mt-1.5 text-xs text-red-500 ml-1 font-medium">{passwordError}</p>}
           
           <div className="flex justify-end mt-2">
             <Link to="/forgot-password" className="text-[13px] font-bold text-gray-900 hover:text-gray-600 transition-colors">
               Forgot Password?
             </Link>
           </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !isReady}
          className="w-full mt-8 bg-gradient-to-r from-[#ADF808] to-[#5AD43D] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 text-[#1c4714] font-bold text-[15px] py-3.5 px-4 rounded-xl transition duration-200 ease-in-out shadow-sm"
        >
          {isSubmitting ? 'Signing in…' : 'Login'}
        </button>
      </form>
    </div>
  );
};

export default Login;
