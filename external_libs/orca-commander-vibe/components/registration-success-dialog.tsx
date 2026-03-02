'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Mail, Clock, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface RegistrationSuccessDialogProps {
  open: boolean;
  email: string;
  name: string;
}

export function RegistrationSuccessDialog({
  open,
  email,
  name,
}: RegistrationSuccessDialogProps) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(10);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (open) {
      setIsAnimating(true);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            router.push('/sign-in');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [open, router]);

  const handleContinue = () => {
    router.push('/sign-in');
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-[500px] border-none shadow-2xl">
        <div className="relative overflow-hidden">
          {/* Animated Background Gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 dark:from-green-950/20 dark:via-blue-950/20 dark:to-purple-950/20 animate-gradient" />
          
          {/* Animated Circles */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-green-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000" />

          <div className="relative z-10 py-6">
            {/* Success Icon with Animation */}
            <div className="flex justify-center mb-6">
              <div className={`relative ${isAnimating ? 'animate-scale-in' : ''}`}>
                <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
                <div className="relative bg-gradient-to-br from-green-500 to-emerald-600 rounded-full p-4 shadow-lg">
                  <CheckCircle2 className="h-12 w-12 text-white animate-check" />
                </div>
              </div>
            </div>

            <DialogHeader className="space-y-4 text-center">
              <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
                Welcome Aboard, {name}! 🎉
              </DialogTitle>
              <DialogDescription className="text-base text-gray-600 dark:text-gray-300 space-y-4">
                <p className="text-lg font-medium">
                  Your account has been successfully created!
                </p>
              </DialogDescription>
            </DialogHeader>

            {/* Info Cards */}
            <div className="mt-8 space-y-4">
              {/* Verification Card */}
              <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 border border-blue-200/50 dark:border-blue-800/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-500/10 rounded-full p-2 mt-1">
                    <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                      Account Verification in Progress
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      One of our team members will review and confirm your account shortly.
                    </p>
                  </div>
                </div>
              </div>

              {/* Email Card */}
              <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 border border-purple-200/50 dark:border-purple-800/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="bg-purple-500/10 rounded-full p-2 mt-1">
                    <Mail className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                      Check Your Email
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      We'll notify you at{' '}
                      <span className="font-medium text-purple-600 dark:text-purple-400">
                        {email}
                      </span>{' '}
                      once your account is verified.
                    </p>
                  </div>
                </div>
              </div>

              {/* Timeline Card */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/30 dark:to-blue-950/30 rounded-lg p-4 border border-green-200/50 dark:border-green-800/50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">
                    Typical verification time:
                  </span>
                  <span className="font-bold text-green-600 dark:text-green-400">
                    24-48 hours
                  </span>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="mt-8 space-y-3">
              <Button
                onClick={handleContinue}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]"
                size="lg"
              >
                Continue to Sign In
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>

              {/* Auto-redirect info */}
              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                Auto-redirecting in{' '}
                <span className="font-bold text-blue-600 dark:text-blue-400 text-lg">
                  {countdown}
                </span>{' '}
                seconds...
              </p>
            </div>

            {/* Support Note */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                Need help? Contact us at{' '}
                <a
                  href="mailto:support@orcaventurers.com"
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  support@orcaventurers.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
