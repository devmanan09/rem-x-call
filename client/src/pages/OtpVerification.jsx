import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Logo from '../components/Logo';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';

const PW_RESET_TOKEN_KEY = 'remxcall_pw_reset_token';

const OtpVerification = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email;

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const inputs = useRef([]);

  const isComplete = useMemo(() => otp.every((d) => d !== ''), [otp]);

  useEffect(() => {
    if (!email) {
      navigate('/forgot-password', { replace: true });
    }
  }, [email, navigate]);

  const handleChange = (e, index) => {
    const value = e.target.value;
    if (isNaN(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);

    if (value && index < 5) {
      inputs.current[index + 1].focus();
    }
    setError('');
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1].focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newOtp = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i += 1) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);
    setError('');
    const focusAt = Math.min(pasted.length, 5);
    requestAnimationFrame(() => {
      inputs.current[focusAt]?.focus();
    });
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const otpString = otp.join('');
    if (otpString.length < 6) {
      setError('Incorrect code. Please try again.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post('/auth/verify-reset-otp', { email, otp: otpString });
      if (data?.resetToken) {
        sessionStorage.setItem(PW_RESET_TOKEN_KEY, data.resetToken);
      }
      navigate('/change-password');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSuccessMsg('Code resent! Check your email.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="w-full animate-in fade-in zoom-in duration-300 flex flex-col items-center">
      <div className="text-center mb-8 w-full">
        <Logo />
        <h1 className="text-[36px] font-display font-[900] leading-[1.1] tracking-[-0.04em] text-[#1a1a1a] mb-5">OTP Verification</h1>
        <p className="text-[14px] text-gray-500 font-medium max-w-[280px] mx-auto leading-relaxed">
          Enter the 6-digit code sent to your email <br />
          <span className="font-bold text-gray-900 mt-1 inline-block break-all">{email || ''}</span>
        </p>
      </div>

      <form onSubmit={handleVerify} className="w-full space-y-8">
        <div>
          <div className="flex justify-between gap-2 mb-2 w-full">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputs.current[index] = el)}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(e, index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onPaste={handlePaste}
                className={`w-[48px] h-[52px] text-center text-[22px] font-bold border ${
                  error
                    ? 'border-red-500 bg-red-50/50'
                    : digit
                      ? 'border-[#ADF808] bg-[#f6ffe8]'
                      : 'border-gray-200 bg-gray-50'
                } rounded-xl focus:ring-2 focus:ring-[#ADF808]/50 focus:border-[#ADF808] transition-colors placeholder-gray-300 text-gray-900`}
                placeholder="-"
              />
            ))}
          </div>
          {error && <p className="text-xs text-red-500 text-center font-medium">{error}</p>}
          {successMsg && (
            <p className="text-xs text-green-600 text-center font-semibold mt-1 animate-in fade-in duration-300">
              ✓ {successMsg}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className={`w-full mt-2 font-bold text-[15px] py-3.5 px-4 rounded-xl transition-all duration-300 ease-in-out disabled:opacity-60 shadow-sm ${
            isComplete
              ? 'bg-gradient-to-r from-[#ADF808] to-[#5AD43D] hover:opacity-90 text-[#1c4714]'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Verify Code
        </button>

        <p className="text-center text-[13px] text-gray-500 mt-4 font-medium">
          Didn't receive code?{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="text-[#1c4714] font-bold hover:underline ml-1 disabled:opacity-60"
          >
            Resend Code
          </button>
        </p>
      </form>
    </div>
  );
};

export default OtpVerification;

