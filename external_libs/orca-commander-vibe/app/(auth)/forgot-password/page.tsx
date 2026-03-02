'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthAPI, AuthError } from '@/lib/api/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Mail, Waves } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate email
    if (!email) {
      toast.error('Email required', {
        description: 'Please enter your email address.',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Invalid email', {
        description: 'Please enter a valid email address.',
      });
      return;
    }

    setIsLoading(true);

    try {
      await AuthAPI.requestPasswordReset(email);
      setEmailSent(true);
      toast.success('Email sent! 📧', {
        description: 'Check your inbox for password reset instructions.',
        duration: 6000,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        toast.error('Request Failed', {
          description: error.message,
          duration: 5000,
        });
      } else {
        toast.error('Unexpected Error', {
          description: 'An unexpected error occurred. Please try again.',
          duration: 5000,
        });
      }
      console.error('Password reset error:', error);
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
                {emailSent 
                  ? 'Check your email for reset instructions'
                  : 'Enter your email to receive a password reset link'
                }
              </p>
            </div>
          </div>

          {!emailSent ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Input */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-white focus:ring-white/30 backdrop-blur-sm"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-white text-black hover:bg-white/90 font-bold py-6 rounded-xl shadow-lg shadow-white/20 transition-all duration-300 hover:shadow-white/30 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed border border-white/30"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Sending...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                <p className="text-green-400 font-medium">
                  ✓ Email sent successfully!
                </p>
                <p className="text-white/70 text-sm mt-2">
                  We've sent a password reset link to <strong className="text-white">{email}</strong>
                </p>
              </div>

              <div className="text-center space-y-3">
                <p className="text-white/60 text-sm">
                  Didn't receive the email?
                </p>
                <Button
                  onClick={() => setEmailSent(false)}
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-white/10"
                >
                  Try again
                </Button>
              </div>
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
