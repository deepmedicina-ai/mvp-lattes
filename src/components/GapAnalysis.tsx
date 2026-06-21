/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { AcademicProfile } from '../types';
import { 
  Target, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle, 
  ChevronRight, 
  Sparkles,
  Award,
  BookOpen,
  Briefcase,
  GraduationCap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GapAnalysisProps {
  targetJob: string;
  academicProfile?: AcademicProfile;
}

interface SkillGap {
  skill: string;
  userScore: number;
  requiredScore: number;
  gap: number;
  status: 'match' | 'gap';
  evidence: string;
  icon: React.ElementType;
}

export default function GapAnalysis({ targetJob, academicProfile }: GapAnalysisProps) {
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  const analysisResult = useMemo(() => {
    if (!targetJob) return null;

    const jobNormalized = targetJob.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Determinar conjunto de competências exigidas com base no cargo
    let requiredSkills: Array<{ skill: string; required: number; keywords: string[]; icon: React.ElementType }> = [];

    if (
      jobNormalized.includes('data') || 
      jobNormalized.includes('dados') || 
      jobNormalized.includes('inteligencia') || 
      jobNormalized.includes('python') || 
      jobNormalized.includes('machine') || 
      jobNormalized.includes('ia') || 
      jobNormalized.includes('ai') || 
      jobNormalized.includes('analytics')
    ) {
      requiredSkills = [
        { skill: 'Programação (Python ou R)', required: 85, keywords: ['python', 'r', 'programming', 'programacao', 'desenvolvimento', 'computacao'], icon: Award },
        { skill: 'Estatística & Analytics', required: 80, keywords: ['estatistica', 'statistics', 'analise', 'modelagem', 'analytics', 'math'], icon: TrendingUp },
        { skill: 'Bancos de Dados & SQL', required: 75, keywords: ['sql', 'nosql', 'banco de dados', 'database', 'postgres', 'mysql', 'mongodb'], icon: Target },
        { skill: 'Machine Learning & IA', required: 75, keywords: ['machine learning', 'ia', 'ai', 'aprendizado de maquina', 'deep learning', 'nlp'], icon: Sparkles },
        { skill: 'Visualização de Dados (BI)', required: 70, keywords: ['dashboard', 'bi', 'power bi', 'tableau', 'matplotlib', 'seaborn', 'visualizacao'], icon: BookOpen }
      ];
    } else if (
      jobNormalized.includes('dev') || 
      jobNormalized.includes('programador') || 
      jobNormalized.includes('desenvolvedor') || 
      jobNormalized.includes('frontend') || 
      jobNormalized.includes('backend') || 
      jobNormalized.includes('fullstack') || 
      jobNormalized.includes('software') || 
      jobNormalized.includes('web') || 
      jobNormalized.includes('computacao')
    ) {
      requiredSkills = [
        { skill: 'Arquitetura de Softwares & APIs', required: 85, keywords: ['api', 'rest', 'arquitetura', 'design patterns', 'clean code', 'mvc'], icon: Target },
        { skill: 'Desenvolvimento Frontend/Backend', required: 80, keywords: ['react', 'node', 'javascript', 'typescript', 'html', 'css', 'express', 'framework'], icon: Award },
        { skill: 'Estruturas de Dados & Algoritmos', required: 75, keywords: ['algoritmo', 'logica', 'data structure', 'complexidade', 'leetcode'], icon: TrendingUp },
        { skill: 'Bancos de Dados & SQL', required: 70, keywords: ['sql', 'banco de dados', 'database', 'query', 'mysql', 'postgresql'], icon: BookOpen },
        { skill: 'Controle de Versão (Git/GitHub)', required: 80, keywords: ['git', 'github', 'versionamento', 'ci', 'cd', 'deploy'], icon: Sparkles }
      ];
    } else if (
      jobNormalized.includes('professor') || 
      jobNormalized.includes('docente') || 
      jobNormalized.includes('aula') || 
      jobNormalized.includes('pedag') || 
      jobNormalized.includes('ensino') || 
      jobNormalized.includes('educa') || 
      jobNormalized.includes('licenciatura')
    ) {
      requiredSkills = [
        { skill: 'Didática & Metodologias Ativas', required: 90, keywords: ['didatica', 'pedagogia', 'aula', 'ensino', 'aprendizagem', 'educacao'], icon: Award },
        { skill: 'Oratória & Apresentação', required: 85, keywords: ['comunicacao', 'oratoria', 'apresentacao', 'palestra', 'pitch', 'expressao'], icon: Sparkles },
        { skill: 'Planejamento de Cursos', required: 80, keywords: ['plano de aula', 'curriculo', 'ementa', 'planejamento', 'avaliacao'], icon: Target },
        { skill: 'Tecnologia Educacional', required: 75, keywords: ['ead', 'moodle', 'google classroom', 'gamificacao', 'tecnologia', 'slide'], icon: BookOpen },
        { skill: 'Escrita & Orientação Científica', required: 70, keywords: ['pesquisa', 'tcc', 'orientacao', 'artigo', 'metodologia', 'cientifica'], icon: GraduationCap }
      ];
    } else if (
      jobNormalized.includes('medico') || 
      jobNormalized.includes('medicina') || 
      jobNormalized.includes('enfer') || 
      jobNormalized.includes('saude') || 
      jobNormalized.includes('clinical') || 
      jobNormalized.includes('clinico') || 
      jobNormalized.includes('hospital') || 
      jobNormalized.includes('farma') || 
      jobNormalized.includes('biomed')
    ) {
      requiredSkills = [
        { skill: 'Biossegurança & Ética Clínica', required: 90, keywords: ['etica', 'bioetica', 'regulamentacao', 'biosseguranca', 'anvisa', 'comite de etica'], icon: Target },
        { skill: 'Metodologia de Pesquisa Clínica', required: 85, keywords: ['ensaio clinico', 'pesquisa clinica', 'epidemiologia', 'estudo de caso', 'coorte'], icon: Award },
        { skill: 'Prática Baseada em Evidências', required: 80, keywords: ['revisao sistematica', 'metanalise', 'evidencia', 'diagnostico', 'terapeutica'], icon: BookOpen },
        { skill: 'Redação Científica em Saúde', required: 75, keywords: ['pubmed', 'scielo', 'escrita cientifica', 'redacao', 'artigo', 'publicacao'], icon: GraduationCap },
        { skill: 'Comunicação Multidisciplinar', required: 85, keywords: ['empatia', 'comunicacao', 'lideranca', 'trabalho em equipe', 'paciente', 'prontuario'], icon: Sparkles }
      ];
    } else if (
      jobNormalized.includes('pesquisador') || 
      jobNormalized.includes('cientista') || 
      jobNormalized.includes('bolsista') || 
      jobNormalized.includes('pos-doc') || 
      jobNormalized.includes('mestre') || 
      jobNormalized.includes('doutor') || 
      jobNormalized.includes('academia') || 
      jobNormalized.includes('academico') || 
      jobNormalized.includes('cnpq') || 
      jobNormalized.includes('fapesp')
    ) {
      requiredSkills = [
        { skill: 'Redação Científica Avançada', required: 90, keywords: ['escrita cientifica', 'redacao', 'paper', 'artigo', 'publicacao', 'writing'], icon: GraduationCap },
        { skill: 'Metodologia Científica & Estatística', required: 90, keywords: ['metodologia', 'survey', 'coleta', 'estatistica', 'experimental', 'hipotese'], icon: Award },
        { skill: 'Publicação Qualis/JCR', required: 85, keywords: ['qualis', 'jcr', 'scopus', 'web of science', 'revista', 'periodico', 'revisao por pares'], icon: Target },
        { skill: 'Apresentação Internacional', required: 80, keywords: ['congresso', 'simposio', 'oral', 'apresentacao', 'ingles', 'palestrante'], icon: Sparkles },
        { skill: 'Gestão de Fomento & Projetos', required: 75, keywords: ['fomento', 'financiamento', 'cnpq', 'fapesp', 'projeto', 'bolsa', 'orcamento'], icon: BookOpen }
      ];
    } else if (
      jobNormalized.includes('gerente') || 
      jobNormalized.includes('gestor') || 
      jobNormalized.includes('projeto') || 
      jobNormalized.includes('lider') || 
      jobNormalized.includes('lideranca') || 
      jobNormalized.includes('coord') || 
      jobNormalized.includes('admin') || 
      jobNormalized.includes('analista')
    ) {
      requiredSkills = [
        { skill: 'Gestão de Projetos & Prazos', required: 85, keywords: ['scrum', 'agile', 'kanban', 'planejamento', 'cronograma', 'entregas', 'projetos'], icon: Target },
        { skill: 'Liderança & Facilitação', required: 80, keywords: ['lideranca', 'gestao de pessoas', 'conflitos', 'facilitacao', 'coaching', 'mentoria'], icon: Sparkles },
        { skill: 'Comunicação Organizacional', required: 80, keywords: ['comunicacao', 'oratoria', 'apresentacao', 'stakeholders', 'negociacao'], icon: Award },
        { skill: 'Análise de KPIs (Métricas)', required: 75, keywords: ['kpi', 'metrica', 'dashboard', 'okr', 'indicadores', 'relatorio', 'bi'], icon: TrendingUp },
        { skill: 'Planejamento Estratégico', required: 75, keywords: ['estrategia', 'swot', 'fofa', 'plano de acao', 'orcamento', 'budget'], icon: BookOpen }
      ];
    } else {
      // Default / Acadêmico Geral
      requiredSkills = [
        { skill: 'Redação e Escrita Acadêmica', required: 80, keywords: ['escrita', 'redacao', 'cientifica', 'academic', 'writing', 'paper', 'artigo'], icon: GraduationCap },
        { skill: 'Metodologia de Pesquisa', required: 75, keywords: ['metodologia', 'pesquisa', 'coleta de dados', 'qualitativa', 'quantitativa'], icon: Award },
        { skill: 'Gestão de Projetos e Prazos', required: 70, keywords: ['projetos', 'cronograma', 'planejamento', 'prazos', 'organizacao'], icon: Target },
        { skill: 'Análise de Dados Estruturados', required: 65, keywords: ['analise', 'planilha', 'excel', 'estatistica', 'dados', 'r', 'python'], icon: TrendingUp },
        { skill: 'Aparelhagem e Didática / Slides', required: 70, keywords: ['apresentacao', 'didatica', 'slides', 'comunicacao', 'seminario', 'oratoria'], icon: Sparkles }
      ];
    }

    if (!academicProfile) {
      // Se não houver perfil carregado, as notas do usuário são 0
      return requiredSkills.map(req => ({
        skill: req.skill,
        userScore: 0,
        requiredScore: req.required,
        gap: req.required,
        status: 'gap' as const,
        evidence: 'Adicione informações ao seu perfil arrastando um arquivo Lattes.',
        icon: req.icon
      }));
    }

    // 2. Calcular a nota do usuário baseada em evidências no currículo
    const gaps: SkillGap[] = requiredSkills.map(req => {
      let score = 15; // Base mínima de presença por ter o currículo
      let evidenceType = '';

      // Textos para busca (limpos de acentos e em minúsculas)
      const cleanString = (s: string) => 
        s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const userSkills = (academicProfile.skills || []).map(cleanString);
      const bio = cleanString(academicProfile.personalInfo?.biography || '');
      
      const educationText = (academicProfile.education || []).map(e => 
        cleanString(`${e.degree} ${e.institution} ${e.fieldOfStudy || ''}`)
      ).join(' ');

      const experienceText = (academicProfile.experience || []).map(ex => 
        cleanString(`${ex.role} ${ex.organization} ${ex.description || ''}`)
      ).join(' ');

      const certificationsText = (academicProfile.certifications || []).map(c => 
        cleanString(`${c.name} ${c.issuer}`)
      ).join(' ');

      const publicationsText = (academicProfile.publications || []).map(p => 
        cleanString(`${p.title} ${p.venue || ''}`)
      ).join(' ');

      // Algoritmo de busca por palavras-chave
      for (const kw of req.keywords) {
        const cleanedKw = cleanString(kw);
        
        if (userSkills.some(s => s.includes(cleanedKw))) {
          score += 45;
          evidenceType = 'skills';
        }
        if (certificationsText.includes(cleanedKw)) {
          score += 35;
          if (!evidenceType || evidenceType === 'bio') evidenceType = 'certifications';
        }
        if (experienceText.includes(cleanedKw)) {
          score += 35;
          if (!evidenceType || evidenceType === 'bio' || evidenceType === 'certifications') {
            evidenceType = 'experience';
          }
        }
        if (publicationsText.includes(cleanedKw)) {
          score += 30;
          if (!evidenceType) evidenceType = 'publications';
        }
        if (educationText.includes(cleanedKw)) {
          score += 25;
          if (!evidenceType) evidenceType = 'education';
        }
        if (bio.includes(cleanedKw)) {
          score += 20;
          if (!evidenceType) evidenceType = 'bio';
        }
      }

      // Limitar pontuação máxima em 100
      const finalScore = Math.min(score, 100);
      const isMatch = finalScore >= req.required;
      
      let evidenceMsg = '';
      if (evidenceType === 'skills') {
        evidenceMsg = 'Identificado diretamente nas suas habilidades declaradas.';
      } else if (evidenceType === 'certifications') {
        evidenceMsg = 'Evidenciado por cursos ou certificados extraídos no seu perfil.';
      } else if (evidenceType === 'experience') {
        evidenceMsg = 'Validado por sua experiência profissional ou cargos exercidos.';
      } else if (evidenceType === 'publications') {
        evidenceMsg = 'Comprovado por meio de suas publicações ou artigos acadêmicos listados.';
      } else if (evidenceType === 'education') {
        evidenceMsg = 'Construído durante sua formação acadêmica registrada.';
      } else if (evidenceType === 'bio') {
        evidenceMsg = 'Mencionado em sua apresentação/biografia pessoal do Lattes.';
      } else {
        evidenceMsg = 'Lacuna sugerida. Insira certificações, experiências ou habilidades adicionais nesta área.';
      }

      return {
        skill: req.skill,
        userScore: finalScore,
        requiredScore: req.required,
        gap: isMatch ? 0 : req.required - finalScore,
        status: isMatch ? 'match' : 'gap',
        evidence: evidenceMsg,
        icon: req.icon
      };
    });

    // 3. Match Geral (Média das notas ponderadas ou simples)
    const matchSum = gaps.reduce((acc, curr) => acc + (curr.userScore >= curr.requiredScore ? 100 : (curr.userScore / curr.requiredScore) * 100), 0);
    const overallMatch = Math.round(matchSum / gaps.length);

    return {
      gaps,
      overallMatch
    };

  }, [targetJob, academicProfile]);

  if (!targetJob) {
    return (
      <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500">
        <Target className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
        <p className="text-[10px] font-black uppercase tracking-wider">Metas Profissionais</p>
        <p className="text-[9px] font-bold text-slate-500 max-w-[180px] mt-1">
          Defina uma "Vaga ou Objetivo Alvo" acima para ativar a análise profissional de competências.
        </p>
      </div>
    );
  }

  const result = analysisResult;
  if (!result) return null;

  return (
    <div id="gap-analysis-card" className="bg-slate-900/60 border-2 border-slate-800 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[#818cf8] flex items-center gap-1.5">
            <Target className="w-4 h-4 shrink-0 text-indigo-400" />
            Gap Analysis de Competências
          </h3>
          <p className="text-[9px] text-slate-400 font-extrabold uppercase mt-0.5 max-w-[210px] truncate" title={targetJob}>
            Alvo: {targetJob}
          </p>
        </div>

        {/* Circular Gauge para o Match de Carreira */}
        <div id="overall-match-badge" className="relative w-12 h-12 flex items-center justify-center shrink-0">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="24" cy="24" r="21" fill="transparent" stroke="#1e293b" strokeWidth="3" />
            <circle 
              cx="24" 
              cy="24" 
              r="21" 
              fill="transparent" 
              stroke={result.overallMatch >= 75 ? '#10b981' : result.overallMatch >= 50 ? '#f59e0b' : '#ef4444'} 
              strokeWidth="3" 
              strokeDasharray={2 * Math.PI * 21}
              strokeDashoffset={2 * Math.PI * 21 * (1 - result.overallMatch / 100)}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <span className="text-[11px] font-black mt-0.5 leading-none">{result.overallMatch}%</span>
            <span className="text-[6px] uppercase tracking-widest text-slate-400 font-black leading-none mt-0.5">MATCH</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {result.gaps.map((g, idx) => {
          const Icon = g.icon;
          const isSelected = selectedSkill === g.skill;
          return (
            <div 
              key={g.skill}
              onClick={() => setSelectedSkill(isSelected ? null : g.skill)}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                isSelected 
                  ? 'bg-slate-950 border-indigo-500/55 shadow-md shadow-indigo-650/5' 
                  : 'bg-slate-900 hover:bg-slate-850/80 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    g.status === 'match' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase text-slate-200 truncate pr-1">{g.skill}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[8px] font-black uppercase tracking-wide py-0.5 px-1.5 rounded-md ${
                        g.status === 'match' 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : 'bg-amber-550/10 text-amber-400'
                      }`}>
                        {g.status === 'match' ? 'Adequado' : 'Lacuna'}
                      </span>
                      {g.gap > 0 && (
                        <span className="text-[8px] font-mono text-slate-450 uppercase font-extrabold">
                          Déficit: -{Math.round(g.gap)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0 font-mono text-[9px] text-slate-400">
                  <span className="font-extrabold text-slate-200">Seu: {g.userScore}%</span>
                  <span className="text-[8px] text-slate-500">Exigido: {g.requiredScore}%</span>
                </div>
              </div>

              {/* Barra de Progresso Comparativa Complexa */}
              <div className="w-full h-1.5 rounded-full bg-slate-950 mt-2.5 relative overflow-hidden">
                {/* Linha pontilhada no required score */}
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10"
                  style={{ left: `${g.requiredScore}%` }}
                  title={`Nível Requerido: ${g.requiredScore}%`}
                />
                {/* Preenchimento da pontuação do usuário */}
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ${
                    g.status === 'match' 
                      ? 'bg-gradient-to-r from-emerald-600/90 to-emerald-400' 
                      : 'bg-gradient-to-r from-amber-600/90 to-amber-400'
                  }`}
                  style={{ width: `${g.userScore}%` }}
                />
              </div>

              {/* Evidence/Acordo Detail */}
              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mt-2 pt-2 border-t border-slate-800/60"
                  >
                    <div className="space-y-1.5">
                      <p className="text-[9px] text-slate-350 leading-relaxed font-bold uppercase tracking-wide flex items-start gap-1">
                        {g.status === 'match' ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                        )}
                        <span>{g.evidence}</span>
                      </p>
                      
                      {g.status === 'gap' && (
                        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/50 mt-1">
                          <p className="text-[8px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5 text-indigo-400 fill-indigo-400" />
                            Preenchimento sugerido:
                          </p>
                          <p className="text-[8px] text-slate-400 font-bold mt-0.5 leading-relaxed">
                            Adicione cursos livres, projetos estruturados de extensão ou artigos científicos correlatos que comprovem conhecimento em <span className="text-white">"{g.skill}"</span>.
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest text-center">
        💡 Toque em um item para ver detalhes e sugestões de plano de ação
      </p>
    </div>
  );
}
