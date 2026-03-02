'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthAPI, AuthError } from '@/lib/api/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Lock, Eye, EyeOff, Loader2, Waves } from 'lucide-react';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);

  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken) {
      setToken(urlToken);
    }
  }, [searchParams]);

  const validatePassword = (): boolean => {
    if (!newPassword) {
      toast.error('Password required', {
        description: 'Please enter a new password.',
      });
      return false;
    }

    if (newPassword.length < 8) {
      toast.error('Password too short', {
        description: 'Password must be at least 8 characters long.',
      });
      return false;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords don\'t match', {
        description: 'Please make sure both passwords match.',
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validatePassword()) return;

    if (!token) {
      toast.error('No reset token', {
        description: 'Missing password reset token. Please use the link from your email.',
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = await AuthAPI.resetPassword(token, newPassword);
      
      setPasswordResetSuccess(true);
      toast.success('Password Reset! ✓', {
        description: result.message,
        duration: 5000,
      });

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/sign-in?reset=true');
      }, 2000);

    } catch (error) {
      if (error instanceof AuthError) {
        const message = error.message;
        
        if (message.includes('expired')) {
          toast.error('Link Expired', {
            description: 'This reset link has expired. Please request a new one.',
            duration: 6000,
          });
        } else if (message.includes('invalid')) {
          toast.error('Invalid Link', {
            description: 'This reset link is invalid. Please request a new one.',
            duration: 6000,
          });
        } else {
          toast.error('Reset Failed', {
            description: message,
            duration: 5000,
          });
        }
      } else {
        toast.error('Unexpected Error', {
          description: 'An unexpected error occurred. Please try again.',
        });
      }
    } finally {
      setIsLoading(false);
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
        {/* Back button */}
        <Link 
          href="/sign-in"
          className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors duration-200 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>

        {/* Glass morphism card */}
        <div className="backdrop-blur-2xl bg-black/40 border border-white/20 rounded-2xl shadow-2xl p-8 space-y-6">
          
          {!passwordResetSuccess ? (
            <>
              {/* Header */}
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-white/20 blur-2xl rounded-full" />
                    <div className="relative bg-gradient-to-b from-black via-slate-900 to-black p-4 rounded-2xl border-2 border-white/30 shadow-lg">
                      <Waves className="h-12 w-12 text-white" />
                    </div>
                  </div>
                </div>
                
                <div>
                  <h1 className="text-3xl font-bold text-white mb-2">
                    Reset Password
                  </h1>
                  <p className="text-white/70">
                    Enter your new password below
                  </p>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* New Password */}
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-white font-medium">
                    New Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                    <Input
                      id="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="pl-10 pr-12 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-white focus:ring-white/30 backdrop-blur-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  <p className="text-white/50 text-xs">
                    Minimum 8 characters
                  </p>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-white font-medium">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="pl-10 pr-12 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-white focus:ring-white/30 backdrop-blur-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-white text-black hover:bg-white/90 font-bold py-6 rounded-xl shadow-lg shadow-white/20 transition-all duration-300 hover:shadow-white/30 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed border border-white/30"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resetting Password...
                    </span>
                  ) : (
                    'Reset Password'
                  )}
                </Button>
              </form>
            </>
          ) : (
            /* Success State */
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full" />
                  <div className="relative bg-gradient-to-b from-black via-slate-900 to-black p-4 rounded-2xl border-2 border-green-500/50 shadow-lg">
                    <Lock className="h-12 w-12 text-green-400" />
                  </div>
                </div>
              </div>
              
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Password Reset! ✓
                </h1>
                <p className="text-white/70">
                  Your password has been successfully reset.
                </p>
              </div>

              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <p className="text-green-400 font-medium text-sm">
                  Redirecting to login page...
                </p>
              </div>

              <Button
                onClick={() => router.push('/sign-in?reset=true')}
                className="w-full bg-white text-black hover:bg-white/90 font-bold py-6 rounded-xl"
              >
                Go to Login
              </Button>
            </div>
          )}

          {/* Additional Info */}
          <div className="pt-4 border-t border-white/10">
            <p className="text-white/60 text-sm text-center">
              Remember your password?{' '}
              <Link href="/sign-in" className="text-white hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-cyan-950 via-blue-950 to-black">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
