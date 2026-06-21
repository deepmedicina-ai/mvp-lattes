/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Sparkles, 
  Bot, 
  User, 
  ChevronRight, 
  Brain, 
  HelpCircle,
  Briefcase,
  Target,
  Sparkle
} from 'lucide-react';
import { ChatMessage, CareerPersona, AcademicProfile } from '../types';
import { motion } from 'motion/react';
import GapAnalysis from './GapAnalysis';

interface CoachTutorProps {
  messages: ChatMessage[];
  persona: CareerPersona;
  targetJob: string;
  academicProfile?: AcademicProfile;
  onChangePersona: (p: CareerPersona) => void;
  onChangeTargetJob: (job: string) => void;
  onSendMessage: (text: string) => Promise<void>;
  loading: boolean;
}

export default function CoachTutor({
  messages,
  persona,
  targetJob,
  academicProfile,
  onChangePersona,
  onChangeTargetJob,
  onSendMessage,
  loading
}: CoachTutorProps) {
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Rolagem automática inteligente de chat ao receber mensagens
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && !loading) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  // Perguntas pré-configuradas baseados em metas reais do Currículo Lattes brasileiro
  const quickPrompts = [
    { label: "O que falta para a vaga?", text: "Analisando meu currículo atual extraído e a minha vaga-alvo, quais as principais lacunas acadêmicas ou profissionais que preciso preencher para ser um candidato competitivo?" },
    { label: "Sugira melhorias para Lattes", text: "Como posso reescrever minha biografia pessoal e descrição de atividades para deixar o meu Currículo Lattes muito mais impactante para avaliadores de bolsas ou recrutadores?" },
    { label: "Quais cursos recomendados?", text: "Recomende 3 cursos avançados livres ou certificações gratuitas do mercado que fariam o meu currículo se destacar para a minha vaga-alvo." }
  ];

  return (
    <div id="coach-tutor" className="bg-slate-950 border-2 border-slate-800 rounded-3xl p-5 flex flex-col h-full relative overflow-hidden">
      
      {/* Elementos de Brilho Estilizados */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none"></div>

      {/* Cabeçalho do Coach */}
      <div className="border-b-2 border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
            <Brain className="w-6 h-6 animate-pulse text-white" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white flex items-center gap-1.5 font-sans uppercase tracking-wider">
              Career Coach & Mentor Lattes IA
              <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-1">
              Coaching de Carreira adaptativo guiado por IA Generativa
            </p>
          </div>
        </div>
      </div>

      {/* Painel de Configurações da Persona de Carreira */}
      <div id="coach-settings" className="bg-slate-900/60 border-2 border-slate-800 rounded-2xl p-4 space-y-3.5 mb-4">
        <div>
          <label className="text-[9px] uppercase tracking-widest font-black text-slate-400 flex items-center gap-1.5 mb-2">
            <Target className="w-3.5 h-3.5 text-indigo-500 shrink-0" /> Persona de Carreira
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'aprendiz', label: 'Estudante / Iniciação' },
              { id: 'recem_formado', label: 'Recém-formado' },
              { id: 'transicao', label: 'Transição' },
              { id: 'senior', label: 'Pesquisador / Sênior' }
            ].map((p) => {
              const active = persona === p.id;
              return (
                <button
                  id={`persona-btn-${p.id}`}
                  key={p.id}
                  type="button"
                  onClick={() => onChangePersona(p.id as CareerPersona)}
                  className={`px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                    active 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                      : 'bg-slate-950 hover:bg-slate-800/60 text-slate-400 hover:text-slate-100 border border-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-[9px] uppercase tracking-widest font-black text-slate-400 flex items-center gap-1.5 mb-2">
            <Briefcase className="w-3.5 h-3.5 text-indigo-500 shrink-0" /> Vaga ou Objetivo Alvo
          </label>
          <input
            id="target-job-input"
            type="text"
            value={targetJob}
            onChange={(e) => onChangeTargetJob(e.target.value)}
            placeholder="Ex: Cientista de Dados Júnior, Bolsista de Iniciação Científica..."
            className="w-full px-3 py-2 bg-slate-950 border-2 border-slate-800 text-xs rounded-xl text-white placeholder:text-slate-650 focus:outline-none focus:border-indigo-600 font-sans font-bold"
          />
        </div>
      </div>

      {/* Análise de Lacunas Automática */}
      <div className="mb-4">
        <GapAnalysis targetJob={targetJob} academicProfile={academicProfile} />
      </div>

      {/* Chat Area */}
      <div id="coach-messages-area" className="flex-1 min-h-[200px] max-h-[380px] overflow-y-auto space-y-4 mb-4 pr-1 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2.5">
            <Bot className="w-8 h-8 text-slate-500 mt-2" />
            <p className="text-xs font-bold leading-relaxed max-w-[200px]">
              Escreva uma pergunta ou selecione uma das sugestões rápidas abaixo para analisar seu currículo!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div 
                key={msg.id}
                className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {/* Avatar */}
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-indigo-900 border border-indigo-700 text-indigo-300 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`p-3.5 rounded-2xl text-xs max-w-[85%] leading-relaxed ${
                  isUser 
                    ? 'bg-indigo-650 text-white font-extrabold rounded-tr-none' 
                    : 'bg-slate-900 text-slate-150 border-2 border-slate-800 font-bold rounded-tl-none shadow-sm'
                }`}>
                  <div className="space-y-1.5 font-sans whitespace-pre-wrap select-text">
                    {msg.text}
                  </div>
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 border border-slate-700">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Indicador de carregamento */}
        {loading && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-7 h-7 rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-400 flex items-center justify-center shrink-0 animate-spin">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="bg-slate-900 text-slate-300 px-3.5 py-2.5 border-2 border-slate-800 rounded-2xl rounded-tl-none text-[11px] font-bold animate-pulse">
              Mentor IA está analisando seu perfil...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Prompts Rápidos de Atalho */}
      <div className="mb-4">
        <label className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-2 flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-indigo-500" /> Sugestões de Diagnósticos
        </label>
        <div className="grid grid-cols-1 gap-2">
          {quickPrompts.map((prompt, idx) => (
            <button
              id={`quick-prompt-btn-${idx}`}
              key={idx}
              type="button"
              onClick={() => {
                if (!loading) onSendMessage(prompt.text);
              }}
              disabled={loading}
              className="text-left w-full px-3 py-2 bg-slate-900 hover:bg-indigo-900 border-2 border-slate-800 rounded-xl hover:border-indigo-700 text-slate-300 hover:text-white text-[10px] font-black uppercase tracking-wider transition-all truncate cursor-pointer"
            >
              🚀 {prompt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Campo de Entrada de Mensagem do Chat */}
      <form onSubmit={handleSubmit} className="mt-auto pt-4 border-t-2 border-slate-800 flex gap-2">
        <input
          id="coach-chat-input"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={loading}
          placeholder="Pergunte ao Career Coach..."
          className="flex-1 px-3.5 py-2.5 bg-slate-950 border-2 border-slate-800 text-xs rounded-xl focus:outline-none focus:border-indigo-600 text-white placeholder:text-slate-600 font-bold"
        />
        <button
          id="coach-send-btn"
          type="submit"
          disabled={loading || !inputText.trim()}
          className="px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-900 text-white font-black rounded-xl flex items-center justify-center transition-colors cursor-pointer"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </form>

    </div>
  );
}
