/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { auth } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { LogIn, UserPlus, ShieldAlert, Sparkles, GraduationCap } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onLoginSuccess();
    } catch (err: any) {
      console.error(err);
      let formattedError = 'Ocorreu um erro ao processar sua solicitação.';
      if (err.code === 'auth/wrong-password') formattedError = 'Senha incorreta.';
      else if (err.code === 'auth/user-not-found') formattedError = 'E-mail não cadastrado.';
      else if (err.code === 'auth/email-already-in-use') formattedError = 'Este e-mail já está em uso.';
      else if (err.code === 'auth/weak-password') formattedError = 'A senha deve conter pelo menos 6 caracteres.';
      else if (err.code === 'auth/invalid-email') formattedError = 'E-mail inválido.';
      
      setErrorMsg(formattedError);
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setErrorMsg('');
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      onLoginSuccess();
    } catch (err: any) {
      console.error(err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMsg('Falha ao autenticar com o Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-container" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 selection:bg-indigo-500 selection:text-white relative overflow-hidden">
      {/* Decorações do Canvas de Fundo */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none md:block hidden animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-slate-300/20 rounded-full blur-3xl pointer-events-none md:block hidden"></div>

      <motion.div 
        id="login-card"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md bg-white border-2 border-slate-200 rounded-3xl shadow-xl p-8 relative z-10"
      >
        <div className="text-center mb-8">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-indigo-100">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-950 tracking-tighter uppercase italic leading-none">
            MVP-Lattes <span className="text-indigo-600">.v1</span>
          </h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-2">
            Extração de Documentos Acadêmicos & Career Coaching com IA
          </p>
        </div>

        {errorMsg && (
          <motion.div 
            id="login-error-alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-3 text-rose-600 text-xs font-bold"
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">E-mail</label>
            <input 
              type="email" 
              required
              placeholder="exemplo@universidade.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 text-sm font-bold focus:outline-none focus:border-indigo-600 transition-colors placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">Senha</label>
            <input 
              type="password" 
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 text-sm font-bold focus:outline-none focus:border-indigo-600 transition-colors placeholder:text-slate-400"
            />
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-indigo-600 hover:bg-slate-900 active:bg-slate-950 disabled:bg-slate-100 disabled:text-slate-400 rounded-xl text-white font-black text-xs uppercase tracking-widest transition-all duration-200 shadow-md flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : isSignUp ? (
              <>
                <UserPlus className="w-4 h-4" />
                Criar Conta de Pesquisador
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Acessar Plataforma
              </>
            )}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t-2 border-slate-150"></span>
          </div>
          <div className="relative flex justify-center text-xs uppercase font-black tracking-widest text-slate-400">
            <span className="px-3 bg-white">ou continue com</span>
          </div>
        </div>

        <button
          id="login-google-btn"
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-800 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
          </svg>
          Conta Google
        </button>

        <div className="text-center mt-6">
          <button
            id="login-toggle-signup"
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-indigo-650 hover:text-indigo-805 font-black transition-colors underline bg-transparent border-0 cursor-pointer"
          >
            {isSignUp ? 'Já possui uma conta? Entre' : 'Não tem conta? Cadastre-se gratis'}
          </button>
        </div>
      </motion.div>

      <div className="text-slate-400 text-[10px] mt-8 text-center max-w-xs font-bold uppercase tracking-wider">
        Seus dados acadêmicos e analíticos são persistidos com segurança no Google Cloud Firestore.
      </div>
    </div>
  );
}
