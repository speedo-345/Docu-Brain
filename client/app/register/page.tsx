'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { authService } from '@/services/authService';

import  { useRouter } from 'next/navigation';;



export default function RegisterPage() {
  const router= useRouter()
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string |null>(null);



  const handleRegister=async(e: React.FormEvent)=>{
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try{
      const response= await authService.register({username, email, password});

      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response));
     
      router.push('/upload')
    }catch(err: any){
      setError(err.response?.data?.error || 'Login failed')
    }finally{
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
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl glass-glow mb-4">
            <div className="text-white text-2xl font-bold">◆</div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2 text-white">
           Docu Brain
          </h1>
          <p className="text-foreground-secondary text-sm">Intelligent Document Analysis</p>
        </div>

        {/* Form Card */}
        <div className="glass-glow p-8 rounded-xl space-y-6 animate-fadeInUp">
          <form onSubmit={handleRegister} className="space-y-5">
            {/* Username Field */}
            <div className="space-y-2">
              <label htmlFor="username" className="block text-sm font-medium text-foreground">
                Username
              </label>
              <input
                id="username"
                type="text"
                placeholder="magicBoy"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg glass-dark text-foreground placeholder-gray-600 focus-glow transition-all"
              />
            </div>

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


            {/* Register Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-lg font-semibold bg-white text-black hover:bg-white/90 hover:shadow-lg hover:shadow-white/10 transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-transparent border-t-black rounded-full animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                'Sign Up'
              )}
            </button>
          </form> 
        </div>

        
        

        {/* Footer Text */}
        <p className="text-center text-foreground-tertiary text-xs mt-8">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
