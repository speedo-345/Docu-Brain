'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { authService } from '@/services/authService';
import {docsService} from '@/services/docsService';

import { useRouter } from 'next/navigation';


export default function LoginPage() {
  const router = useRouter()
  
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Check for existing documents — returning users go straight to viewer
      docsService.getMyDocuments().then((docs: any[]) => {
        if (docs.length > 0) {
          const lastDoc = docs[0]; // sorted by createdAt desc
          router.push(`/viewer?docId=${lastDoc._id}&file=${encodeURIComponent(lastDoc.filename)}`);
        } else {
          router.push('/upload');
        }
      }).catch(() => router.push('/upload'));
    }
  }, [router]);

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);



  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const response = await authService.login({ email, password });
      
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response));
      let docs=await docsService.getMyDocuments();
      if(docs.length==0){
        router.push('/upload')
      }
      else{
        const lastDoc = docs[0];
        router.push(`/viewer?docId=${lastDoc._id}&file=${encodeURIComponent(lastDoc.filename)}`);
      }

    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center">
      {/* Background */}
      <div className="absolute inset-0 bg-background pointer-events-none" />

      {/* Subtle ambient orbs — white only, very low opacity */}
      <div
        className="absolute top-20 right-20 w-72 h-72 rounded-full opacity-[0.04] blur-3xl animate-float pointer-events-none"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-20 left-20 w-72 h-72 rounded-full opacity-[0.03] blur-3xl animate-float pointer-events-none"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)', animationDelay: '1.5s' }}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-4 sm:px-0">
        {/* Logo/Title Area */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl glass-glow mb-4 overflow-hidden">
            <img src="/favicon.ico" alt="DocuBrain Logo" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2 text-white">
            Docu Brain
          </h1>
          <p className="text-foreground-secondary text-sm">Intelligent Document Analysis</p>
        </div>

        {/* Form Card */}
        <div className="glass-glow p-8 rounded-xl space-y-6 animate-fadeInUp">
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg text-center">
                {error}
              </div>
            )}
            
            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-foreground">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg glass-dark text-foreground placeholder-gray-600 focus-glow transition-all"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-lg glass-dark text-foreground placeholder-gray-600 focus-glow transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-secondary hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                className="w-4 h-4 rounded cursor-pointer accent-white"
              />
              <label htmlFor="remember" className="text-sm text-foreground-secondary cursor-pointer">
                Remember me
              </label>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-lg font-semibold bg-white text-black hover:bg-white/90 hover:shadow-lg hover:shadow-white/10 transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-transparent border-t-black rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-transparent text-foreground-tertiary">or</span>
            </div>
          </div>

          {/* Demo Mode
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setTimeout(() => {
                window.location.href = '/upload';
              }, 300);
            }}
            className="w-full py-3 px-4 rounded-lg font-semibold text-foreground glass hover:bg-white/10 transition-all duration-200 hover:scale-[1.02]"
          >
            Try Demo
          </button> */}
        </div>

        {/* Sign Up Link */}
        <div className="mt-6 text-center text-foreground-secondary">
          <span>Don&apos;t have an account? </span>
          <Link
            href="/register" className="text-white hover:text-white/80 font-semibold transition-colors underline underline-offset-2">
            Sign up
          </Link>
        </div>


      </div>
    </div>
  );
}
