'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthAPI, AuthError } from '@/lib/api/auth-api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2, Mail, Waves } from 'lucide-react';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided');
      return;
    }

    handleVerifyEmail(token);
  }, [searchParams]);

  const handleVerifyEmail = async (token: string) => {
    try {
      const result = await AuthAPI.verifyEmail(token);
      
      setStatus('success');
      setMessage(result.message);
      
      toast.success('Email Verified! 🎉', {
        description: 'You can now sign in to your account.',
        duration: 5000,
      });

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/sign-in?verified=true');
      }, 3000);

    } catch (error) {
      setStatus('error');
      
      if (error instanceof AuthError) {
        setMessage(error.message);
        toast.error('Verification Failed', {
          description: error.message,
          duration: 6000,
        });
      } else {
        setMessage('An unexpected error occurred');
        toast.error('Verification Failed', {
          description: 'An unexpected error occurred. Please try again.',
        });
      }
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      toast.error('Email Required', {
        description: 'Please enter your email address.',
      });
      return;
    }

    try {
      await AuthAPI.resendVerificationEmail(email);
      
      toast.success('Email Sent!', {
        description: 'Check your inbox for a new verification link.',
        duration: 6000,
      });

    } catch (error) {
      if (error instanceof AuthError) {
        toast.error('Resend Failed', {
          description: error.message,
        });
      }
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden p-4">
      {/* Ocean Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-950 via-blue-950 to-black" />
      
      {/* Underwater light rays */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-[20%] w-[200px] h-[650px] bg-gradient-to-b from-cyan-400/25 to-transparent -rotate-6 blur-2xl animate-pulse" style={{ animationDuration: '5s' }} />
        <div className="absolute top-0 left-[60%] w-[200px] h-[640px] bg-gradient-to-b from-blue-300/20 to-transparent -rotate-12 blur-2xl animate-pulse" style={{ animationDuration: '5.5s' }} />
      </div>

      {/* Content */}
      <div className="relative w-full max-w-md z-10">
        {/* Glass morphism card */}
        <div className="backdrop-blur-2xl bg-black/40 border border-white/20 rounded-2xl shadow-2xl p-8 space-y-6">
          
          {status === 'verifying' && (
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full animate-pulse" />
                  <div className="relative bg-gradient-to-b from-black via-slate-900 to-black p-4 rounded-2xl border-2 border-white/30 shadow-lg">
                    <Loader2 className="h-12 w-12 text-white animate-spin" />
                  </div>
                </div>
              </div>
              
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Verifying Email
                </h1>
                <p className="text-white/70">
                  Please wait while we verify your email address...
                </p>
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full" />
                  <div className="relative bg-gradient-to-b from-black via-slate-900 to-black p-4 rounded-2xl border-2 border-green-500/50 shadow-lg">
                    <CheckCircle2 className="h-12 w-12 text-green-400" />
                  </div>
                </div>
              </div>
              
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Email Verified! ✓
                </h1>
                <p className="text-white/70">
                  {message || 'Your email has been successfully verified.'}
                </p>
              </div>

              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-green-400 font-medium text-sm">
                  Redirecting to login page...
                </p>
              </div>

              <Button
                onClick={() => router.push('/sign-in?verified=true')}
                className="w-full bg-white text-black hover:bg-white/90 font-bold py-6 rounded-xl"
              >
                Go to Login
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-red-500/20 blur-2xl rounded-full" />
                    <div className="relative bg-gradient-to-b from-black via-slate-900 to-black p-4 rounded-2xl border-2 border-red-500/50 shadow-lg">
                      <XCircle className="h-12 w-12 text-red-400" />
                    </div>
                  </div>
                </div>
                
                <div>
                  <h1 className="text-3xl font-bold text-white mb-2">
                    Verification Failed
                  </h1>
                  <p className="text-white/70">
                    {message || 'We couldn\'t verify your email address.'}
                  </p>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-red-400 font-medium text-sm mb-3">
                  Common reasons:
                </p>
                <ul className="text-white/60 text-sm space-y-1 list-disc list-inside">
                  <li>Verification link has expired (24 hours)</li>
                  <li>Link has already been used</li>
                  <li>Invalid or corrupted link</li>
                </ul>
              </div>

              {/* Resend verification */}
              <div className="space-y-3">
                <p className="text-white/70 text-sm text-center">
                  Request a new verification email:
                </p>
                
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                </div>

                <Button
                  onClick={handleResendVerification}
                  className="w-full bg-white text-black hover:bg-white/90 font-bold py-6 rounded-xl"
                >
                  Resend Verification Email
                </Button>
              </div>

              <div className="pt-4 border-t border-white/10">
                <p className="text-white/60 text-sm text-center">
                  Already verified?{' '}
                  <Link href="/sign-in" className="text-white hover:underline font-medium">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Help text */}
        <div className="mt-6 text-center">
          <p className="text-white/50 text-sm">
            Need help?{' '}
            <a href="mailto:support@orca.com" className="text-white hover:underline">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-cyan-950 via-blue-950 to-black">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
