'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthAPI, AuthError } from '@/lib/api/auth-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Clock, Mail, Waves } from 'lucide-react';

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Show success messages from URL params
  useEffect(() => {
    const verified = searchParams.get('verified');
    const reset = searchParams.get('reset');
    
    if (verified === 'true') {
      toast.success('Email Verified! ✓', {
        description: 'Your email has been verified. You can now sign in.',
        duration: 6000,
      });
    }
    
    if (reset === 'true') {
      toast.success('Password Reset! ✓', {
        description: 'Your password has been reset. Please sign in with your new password.',
        duration: 6000,
      });
    }
  }, [searchParams]);
  
  // Orca dragging and autonomous movement state
  const [orcaPosition, setOrcaPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [bubbles, setBubbles] = useState<Array<{ id: number; x: number; y: number; size: number }>>([]);
  const orcaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bubbleIdRef = useRef(0);
  const autonomousMovementRef = useRef<NodeJS.Timeout | null>(null);
  const [orcaRotation, setOrcaRotation] = useState(0);
  const [showWaitingMessage, setShowWaitingMessage] = useState(false);

  useEffect(() => {
    // Check if user just registered
    const registered = searchParams.get('registered');
    if (registered === 'true') {
      setShowWaitingMessage(true);
    }
  }, [searchParams]);

  // Handle orca dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (orcaRef.current) {
      setIsDragging(true);
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      
      // Keep orca within bounds
      const boundedX = Math.max(10, Math.min(90, x));
      const boundedY = Math.max(10, Math.min(90, y));
      
      setOrcaPosition({ x: boundedX, y: boundedY });
      
      // Create bubbles while dragging
      if (Math.random() > 0.7) {
        const newBubble = {
          id: bubbleIdRef.current++,
          x: boundedX + (Math.random() - 0.5) * 10,
          y: boundedY + (Math.random() - 0.5) * 10,
          size: Math.random() * 20 + 10,
        };
        setBubbles(prev => [...prev, newBubble]);
        
        // Remove bubble after animation
        setTimeout(() => {
          setBubbles(prev => prev.filter(b => b.id !== newBubble.id));
        }, 2000);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Autonomous orca movement
  useEffect(() => {
    if (!isDragging) {
      autonomousMovementRef.current = setInterval(() => {
        setOrcaPosition(prev => {
          const time = Date.now() / 1000;
          // Smooth figure-8 swimming pattern
          const newX = 50 + Math.sin(time * 0.3) * 25;
          const newY = 50 + Math.sin(time * 0.6) * 20;
          
          // Calculate rotation based on movement direction
          const dx = newX - prev.x;
          const dy = newY - prev.y;
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          setOrcaRotation(angle);
          
          // Occasionally create bubbles while swimming
          if (Math.random() > 0.85) {
            const newBubble = {
              id: bubbleIdRef.current++,
              x: newX + (Math.random() - 0.5) * 15,
              y: newY + (Math.random() - 0.5) * 15,
              size: Math.random() * 15 + 8,
            };
            setBubbles(prev => [...prev, newBubble]);
            
            setTimeout(() => {
              setBubbles(prev => prev.filter(b => b.id !== newBubble.id));
            }, 2000);
          }
          
          return { x: newX, y: newY };
        });
      }, 50);
    } else {
      if (autonomousMovementRef.current) {
        clearInterval(autonomousMovementRef.current);
      }
    }
    
    return () => {
      if (autonomousMovementRef.current) {
        clearInterval(autonomousMovementRef.current);
      }
    };
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('🚀 SIGN IN BUTTON CLICKED!', { email, password: '***' });
    
    // Validate inputs
    if (!email || !password) {
      toast.error('Missing credentials', {
        description: 'Please enter both email and password.',
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Invalid email', {
        description: 'Please enter a valid email address.',
      });
      return;
    }

    setIsLoading(true);
    
    // Show loading feedback
    toast.loading('Signing in...', { id: 'signin' });

    try {
      console.log('📝 Starting signin for:', email);
      
      const result = await AuthAPI.signin({ email, password });
      
      console.log('✅ Signin successful:', result);
      
      // Dismiss loading toast
      toast.dismiss('signin');
      
      // Show personalized welcome message
      const userName = result.user?.name || 'back';
      toast.success(`Welcome ${userName}! 🎉`, {
        description: 'Redirecting to dashboard...',
        duration: 3000,
      });
      
      console.log('🚀 Redirecting to dashboard in 500ms');
      
      // Smooth transition to dashboard
      setTimeout(() => {
        router.push('/dashboard');
      }, 500);
    } catch (error) {
      // Dismiss loading toast
      toast.dismiss('signin');
      
      console.error('❌ Signin error:', error);
      
      // Handle AuthError with user-friendly messages
      if (error instanceof AuthError) {
        const message = error.message;
        
        // Show specific error messages with appropriate styling
        if (message.includes('Invalid email or password')) {
          toast.error('Invalid Credentials', {
            description: message,
            duration: 5000,
          });
        } else if (message.includes('pending approval')) {
          toast.warning('Account Pending', {
            description: message,
            duration: 6000,
          });
        } else if (message.includes('deactivated')) {
          toast.error('Account Deactivated', {
            description: message,
            duration: 6000,
          });
        } else if (message.includes('not found')) {
          toast.error('Account Not Found', {
            description: message,
            duration: 5000,
          });
        } else if (message.includes('Unable to connect')) {
          toast.error('Connection Error', {
            description: message,
            duration: 5000,
          });
        } else {
          toast.error('Sign In Failed', {
            description: message,
            duration: 5000,
          });
        }
      } else {
        // Fallback for unexpected errors
        toast.error('Unexpected Error', {
          description: 'An unexpected error occurred. Please try again.',
          duration: 5000,
        });
      }
      
      console.error('Sign in error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden p-4 pt-32">
      {/* Natural Ocean Background */}
      <div ref={containerRef} className="absolute inset-0">
        {/* Deep ocean gradient - realistic water colors */}
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-950 via-blue-950 to-black" />
        
        {/* Underwater light rays from surface - More dramatic */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-[5%] w-[250px] h-[700px] bg-gradient-to-b from-cyan-400/25 to-transparent rotate-12 blur-2xl animate-pulse" style={{ animationDuration: '4s' }} />
          <div className="absolute top-0 left-[20%] w-[200px] h-[650px] bg-gradient-to-b from-blue-400/20 to-transparent -rotate-6 blur-2xl animate-pulse" style={{ animationDuration: '5s' }} />
          <div className="absolute top-0 left-[40%] w-[220px] h-[680px] bg-gradient-to-b from-cyan-300/25 to-transparent rotate-3 blur-2xl animate-pulse" style={{ animationDuration: '4.5s' }} />
          <div className="absolute top-0 left-[60%] w-[200px] h-[640px] bg-gradient-to-b from-blue-300/20 to-transparent -rotate-12 blur-2xl animate-pulse" style={{ animationDuration: '5.5s' }} />
          <div className="absolute top-0 left-[80%] w-[240px] h-[700px] bg-gradient-to-b from-cyan-400/25 to-transparent rotate-8 blur-2xl animate-pulse" style={{ animationDuration: '4.2s' }} />
        </div>
        
        {/* Underwater caustics effect */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-cyan-400/10 via-transparent to-blue-400/10 animate-pulse" style={{ animationDuration: '3s' }} />
        </div>
        
        {/* Water surface shimmer effect */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-cyan-200/10 via-blue-300/5 to-transparent" />
        
        {/* Deep water darkness */}
        <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-black via-black/80 to-transparent" />
        
        {/* Volcanic Ocean Floor - SVG Approach */}
        <div className="absolute bottom-0 inset-x-0 h-80 pointer-events-none overflow-hidden">
          {/* SVG Volcanic Scene */}
          <svg className="absolute bottom-0 w-full h-full" viewBox="0 0 1400 320" preserveAspectRatio="none">
            <defs>
              {/* Lava glow gradient */}
              <radialGradient id="lavaGlow">
                <stop offset="0%" stopColor="#ffeb3b" stopOpacity="1" />
                <stop offset="30%" stopColor="#ff9800" stopOpacity="0.9" />
                <stop offset="60%" stopColor="#ff5722" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#d32f2f" stopOpacity="0" />
              </radialGradient>
              
              {/* Lava flow gradient */}
              <linearGradient id="lavaFlow" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#ffeb3b" stopOpacity="1" />
                <stop offset="40%" stopColor="#ff9800" stopOpacity="0.95" />
                <stop offset="70%" stopColor="#ff5722" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#d32f2f" stopOpacity="0.3" />
              </linearGradient>
              
              {/* Rock texture */}
              <linearGradient id="rockTexture" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1a1a1a" stopOpacity="0" />
                <stop offset="50%" stopColor="#2d2d2d" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#0a0a0a" stopOpacity="1" />
              </linearGradient>
            </defs>
            
            {/* Ocean floor terrain */}
            <path
              d="M 0 280 Q 200 260, 400 270 T 800 275 Q 1000 280, 1200 265 L 1400 270 L 1400 320 L 0 320 Z"
              fill="url(#rockTexture)"
              opacity="0.95"
            />
            
            {/* Volcanic mountains/vents */}
            <path d="M 150 280 L 200 220 L 250 280 Z" fill="#1a1a1a" opacity="0.8" />
            <path d="M 450 280 L 520 200 L 590 280 Z" fill="#1a1a1a" opacity="0.8" />
            <path d="M 850 280 L 900 230 L 950 280 Z" fill="#1a1a1a" opacity="0.8" />
            <path d="M 1150 280 L 1210 210 L 1270 280 Z" fill="#1a1a1a" opacity="0.8" />
            
            {/* Lava pools at base */}
            <ellipse cx="200" cy="285" rx="35" ry="8" fill="url(#lavaGlow)" opacity="0.9">
              <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
            </ellipse>
            <ellipse cx="520" cy="285" rx="45" ry="10" fill="url(#lavaGlow)" opacity="0.9">
              <animate attributeName="opacity" values="0.8;1;0.8" dur="2.5s" repeatCount="indefinite" />
            </ellipse>
            <ellipse cx="900" cy="285" rx="38" ry="9" fill="url(#lavaGlow)" opacity="0.9">
              <animate attributeName="opacity" values="0.75;1;0.75" dur="2.2s" repeatCount="indefinite" />
            </ellipse>
            <ellipse cx="1210" cy="285" rx="42" ry="10" fill="url(#lavaGlow)" opacity="0.9">
              <animate attributeName="opacity" values="0.7;1;0.7" dur="2.8s" repeatCount="indefinite" />
            </ellipse>
            
            {/* Animated lava streams */}
            <path d="M 200 220 Q 198 250, 200 280" stroke="url(#lavaFlow)" strokeWidth="4" fill="none" opacity="0.8">
              <animate attributeName="stroke-width" values="3;5;3" dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0.9;0.6" dur="1.5s" repeatCount="indefinite" />
            </path>
            <path d="M 520 200 Q 518 240, 520 280" stroke="url(#lavaFlow)" strokeWidth="6" fill="none" opacity="0.85">
              <animate attributeName="stroke-width" values="4;7;4" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.7;1;0.7" dur="1.8s" repeatCount="indefinite" />
            </path>
            <path d="M 900 230 Q 898 255, 900 280" stroke="url(#lavaFlow)" strokeWidth="4" fill="none" opacity="0.8">
              <animate attributeName="stroke-width" values="3;5;3" dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.65;0.9;0.65" dur="1.6s" repeatCount="indefinite" />
            </path>
            <path d="M 1210 210 Q 1208 245, 1210 280" stroke="url(#lavaFlow)" strokeWidth="5" fill="none" opacity="0.85">
              <animate attributeName="stroke-width" values="3;6;3" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.7;0.95;0.7" dur="2s" repeatCount="indefinite" />
            </path>
            
            {/* Eruption particles */}
            {[...Array(16)].map((_, i) => {
              const vents = [200, 200, 200, 200, 520, 520, 520, 520, 900, 900, 900, 900, 1210, 1210, 1210, 1210];
              const delays = [0, 0.5, 1, 1.5, 0.2, 0.7, 1.2, 1.7, 0.3, 0.8, 1.3, 1.8, 0.4, 0.9, 1.4, 1.9];
              return (
                <circle
                  key={`particle-${i}`}
                  cx={vents[i]}
                  cy="280"
                  r="3"
                  fill="#ffeb3b"
                  opacity="0"
                >
                  <animate
                    attributeName="cy"
                    values="280;180;280"
                    dur="3s"
                    begin={`${delays[i]}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;0.9;0.7;0"
                    dur="3s"
                    begin={`${delays[i]}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="r"
                    values="2;4;3;1"
                    dur="3s"
                    begin={`${delays[i]}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              );
            })}
          </svg>
          
          {/* Atmospheric glow effects */}
          <div className="absolute bottom-0 left-[10%] w-40 h-64 bg-orange-500/30 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '2s' }} />
          <div className="absolute bottom-0 left-[33%] w-56 h-80 bg-red-500/35 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '2.5s' }} />
          <div className="absolute bottom-0 left-[58%] w-44 h-64 bg-orange-500/30 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '2.2s' }} />
          <div className="absolute bottom-0 left-[82%] w-52 h-72 bg-red-500/35 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '2.8s' }} />
          
          {/* Ambient volcanic glow */}
          <div className="absolute bottom-0 inset-x-0 h-96 bg-gradient-to-t from-orange-800/25 via-red-900/15 to-transparent" />
        </div>
        
        {/* Animated Fish Schools - Diverse Species */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Tropical Fish - Colorful and round */}
          {[...Array(8)].map((_, i) => {
            const bottom = 100 + (i * 18.75);
            const duration = 120 + (i * 15);
            const delay = i * 5;
            return (
            <div
              key={`tropical-fish-${i}`}
              className="absolute"
              style={{
                left: `${-10 + (i * 20)}%`,
                bottom: `${bottom}px`,
                animation: `swim-horizontal ${duration}s linear infinite`,
                animationDelay: `${delay}s`,
              }}
            >
              <svg width="45" height="35" viewBox="0 0 45 35" className="opacity-70">
                {/* Round body */}
                <ellipse cx="22" cy="17" rx="15" ry="12" fill="#ff6b9d" opacity="0.8" />
                <ellipse cx="22" cy="17" rx="12" ry="9" fill="#ff8fab" opacity="0.9" />
                {/* Stripes */}
                <path d="M 15 10 Q 22 17, 15 24" stroke="#ffffff" strokeWidth="1.5" fill="none" opacity="0.6" />
                <path d="M 20 8 Q 22 17, 20 26" stroke="#ffffff" strokeWidth="1.5" fill="none" opacity="0.6" />
                {/* Tail */}
                <path d="M 7 17 L 2 12 L 2 22 Z" fill="#ff6b9d" opacity="0.7" />
                {/* Top fin */}
                <path d="M 22 5 L 20 12 L 24 12 Z" fill="#ff8fab" opacity="0.8" />
                {/* Bottom fin */}
                <path d="M 22 29 L 20 22 L 24 22 Z" fill="#ff8fab" opacity="0.8" />
                {/* Eye */}
                <circle cx="30" cy="15" r="2.5" fill="#000000" />
                <circle cx="31" cy="14" r="1" fill="#ffffff" opacity="0.9" />
              </svg>
            </div>
            );
          })}
          
          {/* Angelfish - Tall and elegant */}
          {[...Array(6)].map((_, i) => {
            const top = 25 + (i * 5.83);
            const duration = 150 + (i * 20);
            const delay = i * 8;
            return (
            <div
              key={`angelfish-${i}`}
              className="absolute"
              style={{
                left: `${-10 + (i * 25)}%`,
                top: `${top}%`,
                animation: `swim-horizontal ${duration}s linear infinite`,
                animationDelay: `${delay}s`,
              }}
            >
              <svg width="40" height="55" viewBox="0 0 40 55" className="opacity-65">
                {/* Tall triangular body */}
                <path d="M 20 5 L 35 27 L 20 50 L 5 27 Z" fill="#ffd700" opacity="0.8" />
                <path d="M 20 10 L 30 27 L 20 45 L 10 27 Z" fill="#ffed4e" opacity="0.9" />
                {/* Stripes */}
                <line x1="15" y1="15" x2="15" y2="40" stroke="#ff6b35" strokeWidth="2" opacity="0.7" />
                <line x1="20" y1="12" x2="20" y2="43" stroke="#ff6b35" strokeWidth="2" opacity="0.7" />
                <line x1="25" y1="15" x2="25" y2="40" stroke="#ff6b35" strokeWidth="2" opacity="0.7" />
                {/* Fins */}
                <path d="M 5 27 L 0 20 L 0 34 Z" fill="#ffd700" opacity="0.7" />
                <path d="M 20 5 L 18 0 L 22 0 Z" fill="#ffed4e" opacity="0.8" />
                <path d="M 20 50 L 18 55 L 22 55 Z" fill="#ffed4e" opacity="0.8" />
                {/* Eye */}
                <circle cx="28" cy="25" r="2" fill="#000000" />
                <circle cx="29" cy="24" r="0.8" fill="#ffffff" />
              </svg>
            </div>
            );
          })}
          
          {/* Clownfish - Orange with white stripes */}
          {[...Array(7)].map((_, i) => {
            const top = 10 + (i * 4.29);
            const duration = 140 + (i * 18);
            const delay = i * 6;
            return (
            <div
              key={`clownfish-${i}`}
              className="absolute"
              style={{
                left: `${-10 + (i * 22)}%`,
                top: `${top}%`,
                animation: `swim-horizontal ${duration}s linear infinite`,
                animationDelay: `${delay}s`,
              }}
            >
              <svg width="50" height="30" viewBox="0 0 50 30" className="opacity-70">
                {/* Body */}
                <ellipse cx="25" cy="15" rx="18" ry="11" fill="#ff6600" opacity="0.85" />
                <ellipse cx="25" cy="15" rx="15" ry="9" fill="#ff8533" opacity="0.9" />
                {/* White stripes */}
                <ellipse cx="15" cy="15" rx="3" ry="10" fill="#ffffff" opacity="0.9" />
                <ellipse cx="25" cy="15" rx="2.5" ry="9" fill="#ffffff" opacity="0.9" />
                <ellipse cx="33" cy="15" rx="2" ry="8" fill="#ffffff" opacity="0.9" />
                {/* Tail */}
                <path d="M 7 15 L 2 10 L 2 20 Z" fill="#ff6600" opacity="0.8" />
                {/* Fins */}
                <ellipse cx="25" cy="6" rx="8" ry="4" fill="#ff8533" opacity="0.7" />
                <ellipse cx="25" cy="24" rx="8" ry="4" fill="#ff8533" opacity="0.7" />
                {/* Eye */}
                <circle cx="37" cy="13" r="2.5" fill="#000000" />
                <circle cx="38" cy="12" r="1" fill="#ffffff" opacity="0.9" />
              </svg>
            </div>
            );
          })}
          
          {/* Blue Tang - Dory-style fish */}
          {[...Array(5)].map((_, i) => {
            const top = 35 + (i * 6);
            const duration = 180 + (i * 25);
            const delay = i * 10;
            return (
            <div
              key={`tang-${i}`}
              className="absolute"
              style={{
                left: `${-10 + (i * 30)}%`,
                top: `${top}%`,
                animation: `swim-horizontal ${duration}s linear infinite`,
                animationDelay: `${delay}s`,
              }}
            >
              <svg width="55" height="40" viewBox="0 0 55 40" className="opacity-75">
                {/* Body */}
                <ellipse cx="27" cy="20" rx="20" ry="14" fill="#4169e1" opacity="0.85" />
                <ellipse cx="27" cy="20" rx="16" ry="11" fill="#5a7fd1" opacity="0.9" />
                {/* Yellow accent */}
                <path d="M 7 20 L 12 15 L 12 25 Z" fill="#ffd700" opacity="0.9" />
                {/* Tail */}
                <path d="M 7 20 L 2 14 L 2 26 Z" fill="#4169e1" opacity="0.8" />
                {/* Top fin */}
                <path d="M 27 6 Q 25 12, 27 18" stroke="#ffd700" strokeWidth="8" fill="none" opacity="0.7" />
                {/* Bottom fin */}
                <path d="M 27 34 Q 25 28, 27 22" stroke="#ffd700" strokeWidth="8" fill="none" opacity="0.7" />
                {/* Black markings */}
                <path d="M 15 12 Q 20 20, 15 28" stroke="#000000" strokeWidth="2" fill="none" opacity="0.6" />
                {/* Eye */}
                <circle cx="42" cy="18" r="3" fill="#000000" />
                <circle cx="43" cy="17" r="1.2" fill="#ffffff" opacity="0.9" />
              </svg>
            </div>
            );
          })}
          
          {/* Pufferfish - Round and cute */}
          {[...Array(4)].map((_, i) => {
            const bottom = 150 + (i * 25);
            const duration = 200 + (i * 30);
            const delay = i * 12;
            return (
            <div
              key={`puffer-${i}`}
              className="absolute"
              style={{
                left: `${-10 + (i * 35)}%`,
                bottom: `${bottom}px`,
                animation: `swim-horizontal ${duration}s linear infinite`,
                animationDelay: `${delay}s`,
              }}
            >
              <svg width="48" height="48" viewBox="0 0 48 48" className="opacity-70">
                {/* Round body */}
                <circle cx="24" cy="24" r="18" fill="#98d8c8" opacity="0.85" />
                <circle cx="24" cy="24" r="15" fill="#b8e8d8" opacity="0.9" />
                {/* Spots */}
                <circle cx="18" cy="18" r="2.5" fill="#6b9080" opacity="0.6" />
                <circle cx="28" cy="16" r="2" fill="#6b9080" opacity="0.6" />
                <circle cx="22" cy="28" r="2.2" fill="#6b9080" opacity="0.6" />
                <circle cx="30" cy="26" r="1.8" fill="#6b9080" opacity="0.6" />
                {/* Fins */}
                <ellipse cx="6" cy="24" rx="4" ry="6" fill="#98d8c8" opacity="0.7" />
                <ellipse cx="24" cy="6" rx="6" ry="4" fill="#98d8c8" opacity="0.7" />
                <ellipse cx="24" cy="42" rx="6" ry="4" fill="#98d8c8" opacity="0.7" />
                {/* Eyes */}
                <circle cx="32" cy="20" r="3.5" fill="#000000" />
                <circle cx="33" cy="19" r="1.5" fill="#ffffff" opacity="0.9" />
                {/* Mouth */}
                <path d="M 35 26 Q 37 28, 35 30" stroke="#000000" strokeWidth="1.5" fill="none" opacity="0.7" />
              </svg>
            </div>
            );
          })}
          
          {/* Octopus - Intelligent and graceful */}
          {[...Array(3)].map((_, i) => {
            const bottom = 80 + (i * 40);
            const duration = 250 + (i * 40);
            const delay = i * 20;
            return (
            <div
              key={`octopus-${i}`}
              className="absolute"
              style={{
                left: `${-10 + (i * 45)}%`,
                bottom: `${bottom}px`,
                animation: `swim-horizontal ${duration}s linear infinite`,
                animationDelay: `${delay}s`,
              }}
            >
              <svg width="65" height="70" viewBox="0 0 65 70" className="opacity-75">
                {/* Head/Mantle */}
                <ellipse cx="32" cy="20" rx="22" ry="18" fill="#d946ef" opacity="0.85" />
                <ellipse cx="32" cy="20" rx="18" ry="14" fill="#e879f9" opacity="0.9" />
                {/* Eyes */}
                <ellipse cx="25" cy="18" rx="5" ry="6" fill="#ffffff" opacity="0.9" />
                <ellipse cx="39" cy="18" rx="5" ry="6" fill="#ffffff" opacity="0.9" />
                <circle cx="25" cy="19" r="3" fill="#000000" />
                <circle cx="39" cy="19" r="3" fill="#000000" />
                <circle cx="26" cy="18" r="1.2" fill="#ffffff" opacity="0.9" />
                <circle cx="40" cy="18" r="1.2" fill="#ffffff" opacity="0.9" />
                {/* Tentacles - 8 wavy arms */}
                <path d="M 20 35 Q 15 45, 12 55 Q 10 60, 8 65" stroke="#d946ef" strokeWidth="4" fill="none" opacity="0.8" />
                <path d="M 24 35 Q 20 48, 18 58 Q 17 62, 15 68" stroke="#d946ef" strokeWidth="4" fill="none" opacity="0.8" />
                <path d="M 28 36 Q 25 50, 24 60 Q 23 65, 22 70" stroke="#d946ef" strokeWidth="4" fill="none" opacity="0.8" />
                <path d="M 32 36 Q 32 52, 32 62 Q 32 66, 32 70" stroke="#d946ef" strokeWidth="4.5" fill="none" opacity="0.85" />
                <path d="M 36 36 Q 39 50, 40 60 Q 41 65, 42 70" stroke="#d946ef" strokeWidth="4" fill="none" opacity="0.8" />
                <path d="M 40 35 Q 44 48, 46 58 Q 47 62, 49 68" stroke="#d946ef" strokeWidth="4" fill="none" opacity="0.8" />
                <path d="M 44 35 Q 49 45, 52 55 Q 54 60, 56 65" stroke="#d946ef" strokeWidth="4" fill="none" opacity="0.8" />
                <path d="M 38 35 Q 42 46, 45 56 Q 47 61, 50 66" stroke="#d946ef" strokeWidth="3.5" fill="none" opacity="0.75" />
                {/* Suction cups on tentacles */}
                <circle cx="10" cy="60" r="1.5" fill="#c026d3" opacity="0.6" />
                <circle cx="18" cy="63" r="1.5" fill="#c026d3" opacity="0.6" />
                <circle cx="24" cy="65" r="1.5" fill="#c026d3" opacity="0.6" />
                <circle cx="40" cy="65" r="1.5" fill="#c026d3" opacity="0.6" />
                <circle cx="47" cy="63" r="1.5" fill="#c026d3" opacity="0.6" />
                <circle cx="54" cy="60" r="1.5" fill="#c026d3" opacity="0.6" />
              </svg>
            </div>
            );
          })}
          
          {/* Seahorse - Vertical swimmers */}
          {[...Array(4)].map((_, i) => {
            const left = 15 + (i * 25);
            const duration = 220 + (i * 35);
            const delay = i * 15;
            return (
            <div
              key={`seahorse-${i}`}
              className="absolute"
              style={{
                left: `${left}%`,
                bottom: `${-10 + (i * 15)}%`,
                animation: `swim-horizontal ${duration}s linear infinite`,
                animationDelay: `${delay}s`,
              }}
            >
              <svg width="35" height="60" viewBox="0 0 35 60" className="opacity-70">
                {/* Head */}
                <path d="M 18 8 Q 25 8, 28 12 Q 30 16, 28 20 L 22 20" fill="#fbbf24" opacity="0.85" />
                {/* Snout */}
                <path d="M 28 12 L 32 10 L 32 14 Z" fill="#f59e0b" opacity="0.8" />
                {/* Eye */}
                <circle cx="26" cy="12" r="2" fill="#000000" />
                <circle cx="26.5" cy="11.5" r="0.8" fill="#ffffff" opacity="0.9" />
                {/* Crown */}
                <path d="M 20 8 L 18 4 L 20 6 L 22 2 L 22 6 L 24 3 L 24 7" stroke="#f59e0b" strokeWidth="1.5" fill="none" opacity="0.8" />
                {/* Neck and body curve */}
                <path d="M 22 20 Q 20 25, 18 30 Q 16 40, 18 50" stroke="#fbbf24" strokeWidth="8" fill="none" opacity="0.85" />
                <path d="M 22 20 Q 20 25, 18 30 Q 16 40, 18 50" stroke="#fde047" strokeWidth="5" fill="none" opacity="0.9" />
                {/* Dorsal fin */}
                <path d="M 20 25 Q 15 25, 15 30 Q 15 35, 16 40" stroke="#f59e0b" strokeWidth="3" fill="none" opacity="0.7" />
                {/* Tail */}
                <path d="M 18 50 Q 20 54, 18 58 Q 15 56, 16 52" fill="#fbbf24" opacity="0.8" />
                {/* Belly pouch */}
                <ellipse cx="19" cy="42" rx="3" ry="5" fill="#f59e0b" opacity="0.6" />
              </svg>
            </div>
            );
          })}
          
          {/* Jellyfish - Floating gracefully */}
          {[...Array(5)].map((_, i) => {
            const top = 5 + (i * 15);
            const duration = 280 + (i * 45);
            const delay = i * 18;
            return (
            <div
              key={`jellyfish-${i}`}
              className="absolute"
              style={{
                left: `${-10 + (i * 28)}%`,
                top: `${top}%`,
                animation: `swim-horizontal ${duration}s linear infinite`,
                animationDelay: `${delay}s`,
              }}
            >
              <svg width="50" height="70" viewBox="0 0 50 70" className="opacity-65">
                {/* Bell/Head */}
                <ellipse cx="25" cy="18" rx="18" ry="15" fill="#ec4899" opacity="0.7" />
                <ellipse cx="25" cy="18" rx="14" ry="11" fill="#f9a8d4" opacity="0.8" />
                <ellipse cx="25" cy="20" rx="10" ry="8" fill="#fce7f3" opacity="0.6" />
                {/* Oral arms - shorter */}
                <path d="M 20 30 Q 18 40, 16 48" stroke="#ec4899" strokeWidth="3" fill="none" opacity="0.6" />
                <path d="M 25 32 Q 25 42, 25 52" stroke="#ec4899" strokeWidth="3.5" fill="none" opacity="0.65" />
                <path d="M 30 30 Q 32 40, 34 48" stroke="#ec4899" strokeWidth="3" fill="none" opacity="0.6" />
                {/* Tentacles - long and flowing */}
                <path d="M 15 30 Q 12 45, 10 60 Q 9 65, 8 68" stroke="#f472b6" strokeWidth="1.5" fill="none" opacity="0.5" />
                <path d="M 18 31 Q 15 46, 13 61 Q 12 66, 11 69" stroke="#f472b6" strokeWidth="1.5" fill="none" opacity="0.5" />
                <path d="M 22 32 Q 20 47, 18 62 Q 17 67, 16 70" stroke="#f472b6" strokeWidth="1.5" fill="none" opacity="0.5" />
                <path d="M 28 32 Q 30 47, 32 62 Q 33 67, 34 70" stroke="#f472b6" strokeWidth="1.5" fill="none" opacity="0.5" />
                <path d="M 32 31 Q 35 46, 37 61 Q 38 66, 39 69" stroke="#f472b6" strokeWidth="1.5" fill="none" opacity="0.5" />
                <path d="M 35 30 Q 38 45, 40 60 Q 41 65, 42 68" stroke="#f472b6" strokeWidth="1.5" fill="none" opacity="0.5" />
                {/* Bioluminescent spots */}
                <circle cx="20" cy="16" r="2" fill="#fce7f3" opacity="0.8" />
                <circle cx="25" cy="14" r="2.5" fill="#fce7f3" opacity="0.9" />
                <circle cx="30" cy="16" r="2" fill="#fce7f3" opacity="0.8" />
              </svg>
            </div>
            );
          })}
          
          {/* Stingray - Gliding majestically */}
          {[...Array(3)].map((_, i) => {
            const top = 20 + (i * 25);
            const duration = 300 + (i * 50);
            const delay = i * 25;
            return (
            <div
              key={`stingray-${i}`}
              className="absolute"
              style={{
                left: `${-10 + (i * 50)}%`,
                top: `${top}%`,
                animation: `swim-horizontal ${duration}s linear infinite`,
                animationDelay: `${delay}s`,
              }}
            >
              <svg width="80" height="55" viewBox="0 0 80 55" className="opacity-70">
                {/* Body disc - diamond shape */}
                <path d="M 40 10 L 10 30 L 40 45 L 70 30 Z" fill="#8b7355" opacity="0.8" />
                <path d="M 40 15 L 15 30 L 40 42 L 65 30 Z" fill="#a0826d" opacity="0.85" />
                {/* Central ridge */}
                <path d="M 40 15 L 40 42" stroke="#6b5444" strokeWidth="2" opacity="0.7" />
                {/* Wing patterns */}
                <path d="M 25 25 Q 30 28, 35 30" stroke="#6b5444" strokeWidth="1.5" fill="none" opacity="0.6" />
                <path d="M 45 30 Q 50 28, 55 25" stroke="#6b5444" strokeWidth="1.5" fill="none" opacity="0.6" />
                <path d="M 20 28 Q 25 32, 30 34" stroke="#6b5444" strokeWidth="1.5" fill="none" opacity="0.6" />
                <path d="M 50 34 Q 55 32, 60 28" stroke="#6b5444" strokeWidth="1.5" fill="none" opacity="0.6" />
                {/* Eyes on top */}
                <circle cx="35" cy="22" r="2.5" fill="#000000" opacity="0.8" />
                <circle cx="45" cy="22" r="2.5" fill="#000000" opacity="0.8" />
                <circle cx="35.5" cy="21.5" r="1" fill="#ffffff" opacity="0.7" />
                <circle cx="45.5" cy="21.5" r="1" fill="#ffffff" opacity="0.7" />
                {/* Tail - long and whip-like */}
                <path d="M 40 45 Q 40 50, 38 54" stroke="#8b7355" strokeWidth="3" fill="none" opacity="0.8" />
                {/* Tail barb */}
                <path d="M 38 50 L 36 52 L 38 51" fill="#6b5444" opacity="0.7" />
              </svg>
            </div>
            );
          })}
        </div>
        
        {/* Stunning Artistic Killer Whale - Interactive */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div 
            ref={orcaRef}
            className="absolute pointer-events-auto cursor-grab active:cursor-grabbing"
            style={{
              left: `${orcaPosition.x}%`,
              top: `${orcaPosition.y}%`,
              transform: `translate(-50%, -50%) rotate(${orcaRotation}deg)`,
              width: '85%',
              maxWidth: '1000px',
              zIndex: 10,
              transition: isDragging ? 'none' : 'transform 0.5s ease-out',
            }}
            onMouseDown={handleMouseDown}
          >
            <svg 
              viewBox="0 0 1400 700" 
              className="w-full h-auto"
              style={{ 
                filter: `drop-shadow(0 25px 50px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 30px rgba(100, 200, 255, ${isDragging ? '0.6' : '0.3'}))`,
                transform: 'translateZ(0)',
                transition: isDragging ? 'none' : 'filter 0.3s ease',
              }}
            >
              {/* Advanced Gradient Definitions */}
              <defs>
                {/* Body with subtle blue highlights */}
                <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style={{ stopColor: '#0a1929', stopOpacity: 1 }} />
                  <stop offset="30%" style={{ stopColor: '#000000', stopOpacity: 1 }} />
                  <stop offset="70%" style={{ stopColor: '#000000', stopOpacity: 1 }} />
                  <stop offset="100%" style={{ stopColor: '#0d1b2a', stopOpacity: 1 }} />
                </linearGradient>
                
                {/* Glossy white belly */}
                <radialGradient id="bellyGradient" cx="40%" cy="30%">
                  <stop offset="0%" style={{ stopColor: '#ffffff', stopOpacity: 1 }} />
                  <stop offset="50%" style={{ stopColor: '#f8f9fa', stopOpacity: 1 }} />
                  <stop offset="100%" style={{ stopColor: '#e9ecef', stopOpacity: 1 }} />
                </radialGradient>
                
                {/* Fin with depth */}
                <linearGradient id="finGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{ stopColor: '#1a1a2e', stopOpacity: 1 }} />
                  <stop offset="50%" style={{ stopColor: '#000000', stopOpacity: 1 }} />
                  <stop offset="100%" style={{ stopColor: '#0f0f1e', stopOpacity: 1 }} />
                </linearGradient>
                
                {/* Underwater light reflection */}
                <radialGradient id="lightReflection" cx="30%" cy="20%">
                  <stop offset="0%" style={{ stopColor: '#4dd0e1', stopOpacity: 0.4 }} />
                  <stop offset="50%" style={{ stopColor: '#26c6da', stopOpacity: 0.2 }} />
                  <stop offset="100%" style={{ stopColor: '#00acc1', stopOpacity: 0 }} />
                </radialGradient>
                
                {/* Eye shine */}
                <radialGradient id="eyeShine">
                  <stop offset="0%" style={{ stopColor: '#ffffff', stopOpacity: 0.9 }} />
                  <stop offset="100%" style={{ stopColor: '#cccccc', stopOpacity: 0.3 }} />
                </radialGradient>
              </defs>
              
              {/* STUNNING ARTISTIC ORCA */}
              
              {/* Main Body - Smooth and powerful */}
              <path 
                d="M 250 350
                   C 220 345, 200 350, 185 365
                   C 170 385, 170 410, 185 435
                   C 205 460, 240 475, 290 485
                   C 400 500, 580 505, 750 500
                   C 880 496, 980 485, 1050 465
                   C 1100 450, 1135 425, 1145 395
                   C 1155 360, 1145 330, 1120 310
                   C 1080 280, 1010 265, 920 255
                   C 800 242, 650 238, 500 245
                   C 380 250, 280 265, 250 350 Z"
                fill="url(#bodyGradient)"
                opacity="0.95"
              />
              
              {/* Underwater light reflection on body */}
              <ellipse 
                cx="600" 
                cy="320" 
                rx="350" 
                ry="120" 
                fill="url(#lightReflection)"
                opacity="0.6"
              />
              
              {/* Glossy White Belly - Prominent and beautiful */}
              <path 
                d="M 200 400
                   C 215 420, 245 435, 290 445
                   C 400 460, 580 468, 750 465
                   C 880 463, 980 453, 1040 435
                   C 1080 423, 1110 405, 1125 385
                   C 1135 372, 1135 358, 1125 345
                   C 1020 365, 820 385, 650 390
                   C 480 395, 320 385, 220 370
                   C 205 380, 200 390, 200 400 Z"
                fill="url(#bellyGradient)"
                opacity="0.98"
              />
              
              {/* Belly highlight for glossy effect */}
              <ellipse 
                cx="650" 
                cy="400" 
                rx="280" 
                ry="45" 
                fill="#ffffff"
                opacity="0.25"
              />
              
              {/* Head - Beautifully rounded melon */}
              <path
                d="M 250 350
                   C 225 342, 205 345, 190 360
                   C 175 378, 172 400, 180 425
                   C 188 450, 205 470, 230 480
                   C 250 488, 275 490, 300 485
                   C 310 455, 312 420, 308 385
                   C 304 355, 285 345, 250 350 Z"
                fill="url(#bodyGradient)"
              />
              
              {/* Head highlight */}
              <ellipse 
                cx="220" 
                cy="390" 
                rx="45" 
                ry="55" 
                fill="url(#lightReflection)"
                opacity="0.3"
              />
              
              {/* Eye Patch - Striking white marking */}
              <path
                d="M 260 365
                   C 248 358, 240 360, 238 368
                   C 236 382, 248 400, 272 408
                   C 298 416, 325 412, 340 398
                   C 355 384, 355 368, 342 355
                   C 328 342, 305 340, 280 345
                   C 268 348, 260 355, 260 365 Z"
                fill="#ffffff"
                opacity="0.98"
              />
              
              {/* Eye with realistic detail */}
              <circle cx="285" cy="380" r="11" fill="#000000" />
              <circle cx="288" cy="377" r="5" fill="url(#eyeShine)" />
              <circle cx="290" cy="375" r="2" fill="#ffffff" opacity="0.9" />
              
              {/* Lower Jaw White Patch */}
              <path
                d="M 185 415
                   C 185 422, 192 428, 205 432
                   C 220 436, 235 437, 248 434
                   C 260 431, 268 425, 268 416
                   C 268 407, 260 401, 248 398
                   C 235 395, 220 396, 205 400
                   C 192 404, 185 410, 185 415 Z"
                fill="#ffffff"
                opacity="0.95"
              />
              
              {/* Majestic Dorsal Fin - Tall and curved */}
              <path 
                d="M 650 255
                   C 658 220, 668 165, 675 110
                   C 678 85, 682 65, 688 50
                   C 692 45, 700 42, 708 45
                   C 712 55, 716 75, 720 100
                   C 725 150, 732 210, 740 250
                   C 742 262, 736 270, 726 275
                   C 710 282, 685 280, 665 272
                   C 655 268, 650 260, 650 255 Z"
                fill="url(#finGradient)"
                opacity="0.95"
              />
              
              {/* Fin edge highlight */}
              <path 
                d="M 708 45
                   C 712 55, 716 75, 720 100
                   C 725 150, 732 210, 740 250"
                stroke="rgba(100, 200, 255, 0.2)"
                strokeWidth="2"
                fill="none"
              />
              
              {/* Saddle Patch - Subtle gray marking */}
              <ellipse
                cx="750"
                cy="280"
                rx="110"
                ry="28"
                fill="#6c757d"
                opacity="0.5"
              />
              <ellipse
                cx="750"
                cy="275"
                rx="90"
                ry="18"
                fill="#9ca3af"
                opacity="0.3"
              />
              
              {/* Pectoral Fin - Large and elegant */}
              <path
                d="M 420 455
                   C 380 448, 340 455, 310 470
                   C 280 485, 265 505, 272 525
                   C 280 545, 300 555, 330 558
                   C 370 562, 415 555, 450 540
                   C 485 525, 510 505, 515 480
                   C 520 465, 500 458, 475 460
                   C 460 462, 440 465, 420 455 Z"
                fill="url(#finGradient)"
                transform="rotate(-28 400 500)"
                opacity="0.92"
              />
              
              {/* Fin highlight */}
              <ellipse 
                cx="380" 
                cy="490" 
                rx="60" 
                ry="35" 
                fill="url(#lightReflection)"
                opacity="0.2"
                transform="rotate(-28 380 490)"
              />
              
              {/* Tail Peduncle - Powerful */}
              <path
                d="M 1120 395
                   C 1150 392, 1180 390, 1210 392
                   C 1225 393, 1232 396, 1232 402
                   C 1232 408, 1225 411, 1210 413
                   C 1180 415, 1150 414, 1120 411
                   C 1112 410, 1110 405, 1110 399
                   C 1110 395, 1115 393, 1120 395 Z"
                fill="url(#bodyGradient)"
              />
              
              {/* Tail Flukes - Majestic and powerful */}
              {/* Upper Fluke */}
              <path
                d="M 1210 402
                   C 1240 395, 1270 380, 1295 360
                   C 1320 340, 1340 318, 1348 310
                   C 1355 305, 1365 305, 1368 312
                   C 1370 325, 1360 345, 1340 365
                   C 1315 390, 1280 408, 1245 418
                   C 1230 422, 1220 418, 1215 410
                   C 1212 405, 1210 402, 1210 402 Z"
                fill="url(#finGradient)"
                opacity="0.95"
              />
              
              {/* Lower Fluke */}
              <path
                d="M 1210 402
                   C 1240 409, 1270 424, 1295 444
                   C 1320 464, 1340 486, 1348 494
                   C 1355 499, 1365 499, 1368 492
                   C 1370 479, 1360 459, 1340 439
                   C 1315 414, 1280 396, 1245 386
                   C 1230 382, 1220 386, 1215 394
                   C 1212 399, 1210 402, 1210 402 Z"
                fill="url(#finGradient)"
                opacity="0.95"
              />
              
              {/* Fluke highlights */}
              <ellipse 
                cx="1280" 
                cy="380" 
                rx="45" 
                ry="25" 
                fill="url(#lightReflection)"
                opacity="0.25"
                transform="rotate(-35 1280 380)"
              />
              <ellipse 
                cx="1280" 
                cy="424" 
                rx="45" 
                ry="25" 
                fill="url(#lightReflection)"
                opacity="0.25"
                transform="rotate(35 1280 424)"
              />
            </svg>
          </div>
        </div>
        
        {/* Dynamic Bubble Trail */}
        {bubbles.map(bubble => (
          <div
            key={bubble.id}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: `${bubble.x}%`,
              top: `${bubble.y}%`,
              width: `${bubble.size}px`,
              height: `${bubble.size}px`,
              background: `radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9), rgba(200, 230, 255, 0.5))`,
              border: '2px solid rgba(255, 255, 255, 0.4)',
              boxShadow: 'inset -2px -2px 6px rgba(0, 50, 100, 0.3), 0 0 15px rgba(200, 230, 255, 0.6)',
              animation: 'bubble-rise 2s ease-out forwards',
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}
        
        {/* Natural Underwater Particles */}
        <div className="absolute inset-0">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full animate-float-particle"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                width: `${Math.random() * 4 + 1}px`,
                height: `${Math.random() * 4 + 1}px`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${Math.random() * 10 + 8}s`,
                opacity: Math.random() * 0.4 + 0.1,
                background: `rgba(${200 + Math.random() * 55}, ${230 + Math.random() * 25}, 255, ${Math.random() * 0.5 + 0.3})`,
              }}
            />
          ))}
        </div>
        
        {/* Realistic Water Bubbles */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full animate-bubble"
              style={{
                left: `${Math.random() * 100}%`,
                width: `${Math.random() * 20 + 8}px`,
                height: `${Math.random() * 20 + 8}px`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${Math.random() * 12 + 10}s`,
                background: `radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.8), rgba(200, 230, 255, 0.4))`,
                border: '1px solid rgba(255, 255, 255, 0.3)',
                boxShadow: 'inset -2px -2px 4px rgba(0, 50, 100, 0.2), 0 0 8px rgba(200, 230, 255, 0.4)',
              }}
            />
          ))}
        </div>
        
        {/* Larger Natural Bubbles */}
        <div className="absolute inset-0">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full animate-bubble"
              style={{
                left: `${10 + Math.random() * 80}%`,
                width: `${Math.random() * 35 + 20}px`,
                height: `${Math.random() * 35 + 20}px`,
                animationDelay: `${Math.random() * 4}s`,
                animationDuration: `${Math.random() * 15 + 12}s`,
                background: `radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.6), rgba(180, 220, 255, 0.3))`,
                border: '1.5px solid rgba(255, 255, 255, 0.25)',
                boxShadow: 'inset -3px -3px 6px rgba(0, 80, 150, 0.15), 0 0 12px rgba(180, 220, 255, 0.3)',
              }}
            />
          ))}
        </div>
      </div>

      {/* OrcaVentures Branding - Top */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 text-center">
        <h1 className="text-5xl md:text-6xl font-black text-white drop-shadow-2xl tracking-tight mb-2">
          Orca Venturers
        </h1>
        <p className="text-lg md:text-xl text-white/80 font-medium drop-shadow-lg italic">
          Navigate the depths of success
        </p>
      </div>

      <div className="relative w-full max-w-md z-10">
        {/* Glass morphism card */}
        <div className="backdrop-blur-2xl bg-black/40 border border-white/20 rounded-2xl shadow-2xl p-8 space-y-6">
          {/* Orca Logo/Title */}
          <div className="text-center space-y-4">
            {/* Orca Icon - Black & White */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-white/20 blur-2xl rounded-full" />
                <div className="relative bg-gradient-to-b from-black via-slate-900 to-black p-4 rounded-2xl border-2 border-white/30 shadow-lg">
                  <Waves className="h-12 w-12 text-white" />
                </div>
              </div>
            </div>
            
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">
                Welcome Back
              </h1>
              <p className="text-white/70 text-sm">
                Dive back into Orca Ventures
              </p>
            </div>
          </div>

          {/* Waiting for Approval Message */}
          {showWaitingMessage && (
            <div className="bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl p-4 space-y-3 animate-fade-in-up">
              <div className="flex items-center gap-2 text-white">
                <Clock className="h-5 w-5 animate-pulse" />
                <h3 className="font-semibold">Account Under Review</h3>
              </div>
              <p className="text-sm text-white/70">
                Your account is pending verification by our team. You'll receive an email notification once your account has been approved and you can sign in.
              </p>
              <div className="flex items-center gap-2 text-sm text-white/80 bg-white/5 rounded-lg p-2 border border-white/20">
                <Mail className="h-4 w-4" />
                <span>Keep an eye on your inbox for updates</span>
              </div>
            </div>
          )}

          {/* Sign In Form */}
          <form onSubmit={handleSignIn} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-white focus:ring-white/30 backdrop-blur-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-white font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-white focus:ring-white/30 backdrop-blur-sm"
              />
            </div>

            {/* Forgot Password Link */}
            <div className="flex justify-end">
              <Link 
                href="/forgot-password" 
                className="text-sm text-white/70 hover:text-white transition-colors duration-200 hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full bg-white text-black hover:bg-white/90 font-bold py-6 rounded-xl shadow-lg shadow-white/20 transition-all duration-300 hover:shadow-white/30 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed border border-white/30"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Diving in...
                </span>
              ) : (
                'Dive In'
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/20" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-black/50 backdrop-blur-sm px-3 py-1 text-white/70 rounded-full border border-white/20">
                Don't have an account?
              </span>
            </div>
          </div>

          {/* Sign Up Link */}
          <div className="text-center">
            <Link
              href="/sign-up"
              className="text-sm text-white hover:text-white/80 font-medium transition-colors inline-flex items-center gap-1 group"
            >
              <span>Create a new account</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-white/50 mt-6 backdrop-blur-sm bg-black/20 rounded-full px-4 py-2 border border-white/10">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>

      {/* Custom CSS for animations */}
      <style jsx global>{`
        @keyframes orca-swim {
          0% { transform: translateX(-10%) translateY(0px) rotate(0deg); }
          25% { transform: translateX(5%) translateY(-30px) rotate(2deg); }
          50% { transform: translateX(10%) translateY(0px) rotate(0deg); }
          75% { transform: translateX(5%) translateY(30px) rotate(-2deg); }
          100% { transform: translateX(-10%) translateY(0px) rotate(0deg); }
        }
        
        @keyframes float-particle {
          0%, 100% { transform: translate(0, 0); opacity: 0.1; }
          25% { transform: translate(10px, -10px); opacity: 0.3; }
          50% { transform: translate(-5px, -20px); opacity: 0.2; }
          75% { transform: translate(-10px, -10px); opacity: 0.3; }
        }
        
        @keyframes bubble {
          0% { transform: translateY(100vh) scale(0); opacity: 0; }
          10% { opacity: 0.3; }
          90% { opacity: 0.3; }
          100% { transform: translateY(-20vh) scale(1.2); opacity: 0; }
        }
        
        .animate-orca-swim {
          animation: orca-swim 20s ease-in-out infinite;
        }
        
        .animate-float-particle {
          animation: float-particle linear infinite;
        }
        
        .animate-bubble {
          animation: bubble linear infinite;
        }
        
        .animate-fade-in-up {
          animation: fadeInUp 0.5s ease-out;
        }
        
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-cyan-950 via-blue-950 to-black">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}
