/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { AcademicProfile } from '../types';
import { 
  Copy, 
  Download, 
  Save, 
  Code, 
  Eye, 
  Plus, 
  Trash2, 
  GraduationCap, 
  Award, 
  Briefcase, 
  BookOpen, 
  Globe, 
  Tag, 
  User,
  Sparkles,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Share2,
  ExternalLink,
  Link
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, OperationType, handleFirestoreError } from '../firebase';
import { doc, setDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';

interface ResultPanelProps {
  initialProfile?: AcademicProfile;
  onSave: (updatedProfile: AcademicProfile) => Promise<void>;
  isReadOnly?: boolean;
  targetJob?: string;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function ResultPanel({ 
  initialProfile, 
  onSave, 
  isReadOnly = false,
  targetJob = 'Cientista de Dados',
  showToast
}: ResultPanelProps) {
  const [profile, setProfile] = useState<AcademicProfile>({
    personalInfo: { fullName: '', biography: '', location: '' },
    education: [],
    certifications: [],
    experience: [],
    publications: [],
    languages: [],
    skills: []
  });
  
  const [activeMode, setActiveMode] = useState<'read' | 'form' | 'json'>('read');
  const [activeCategory, setActiveCategory] = useState<'personal' | 'education' | 'certifications' | 'experience' | 'publications' | 'languages_skills'>('personal');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [copyStatus, setCopyStatus] = useState(false);

  // Estados de compartilhamento público (Gerar Link Público)
  const [isSharing, setIsSharing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [publicLinkCreated, setPublicLinkCreated] = useState(false);
  const [sharedUrl, setSharedUrl] = useState('');
  const [shareError, setShareError] = useState<string | null>(null);
  const [copyShareStatus, setCopyShareStatus] = useState(false);

  // Estados e auxiliares para assistente de escrita acadêmica IA do Gemini
  const [focusedField, setFocusedField] = useState<{ type: 'biography' | 'experience'; index?: number; value: string } | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  // Estados e auxiliares para Geração de Capa IA e Recomendação de Habilidades Gemini
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [recommendedSkills, setRecommendedSkills] = useState<Array<{ skill: string; reason: string; action: string }>>([]);
  const [isRecommendingSkills, setIsRecommendingSkills] = useState(false);
  const [recommendError, setRecommendError] = useState<string | null>(null);

  const generateCover = async () => {
    setIsGeneratingCover(true);
    setCoverError(null);
    try {
      const response = await fetch('/api/generate-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetJob,
          skills: profile.skills || []
        })
      });
      const data = await response.json();
      if (response.ok && data.svg) {
        const updated = { ...profile, coverImage: data.svg };
        setProfile(updated);
        await onSave(updated);
        if (showToast) showToast('Capa de perfil personalizada com IA criada!', 'success');
      } else {
        setCoverError(data.error || 'Erro ao gerar capa.');
        if (showToast) showToast(data.error || 'Falha ao gerar capa.', 'error');
      }
    } catch (err: any) {
      console.error(err);
      setCoverError('Falha ao conectar com o serviço de capas.');
      if (showToast) showToast('Erro de conexão ao gerar capa.', 'error');
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const recommendSkills = async () => {
    setIsRecommendingSkills(true);
    setRecommendError(null);
    setRecommendedSkills([]);
    try {
      const response = await fetch('/api/recommend-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetJob,
          currentSkills: profile.skills || []
        })
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data.recommendations)) {
        const filtered = data.recommendations.filter(
          (rec: any) => !profile.skills.some(s => s.toLowerCase() === rec.skill.toLowerCase())
        );
        if (filtered.length === 0) {
          setRecommendError('Você já possui todas as competências sugeridas.');
          if (showToast) showToast('Você é totalmente competitivo para este cargo!', 'info');
        } else {
          setRecommendedSkills(filtered);
          if (showToast) showToast('Competências sugeridas mapeadas!', 'success');
        }
      } else {
        setRecommendError(data.error || 'Falha ao gerar recomendações de habilidades.');
      }
    } catch (err: any) {
      console.error(err);
      setRecommendError('Erro de conexão ao sugerir competências.');
    } finally {
      setIsRecommendingSkills(false);
    }
  };

  const addRecommendedSkill = async (skillName: string) => {
    if (profile.skills.some(s => s.toLowerCase() === skillName.toLowerCase())) {
      setRecommendedSkills(prev => prev.filter(r => r.skill !== skillName));
      return;
    }
    const updatedSkills = [...profile.skills, skillName];
    const updatedProfile = { ...profile, skills: updatedSkills };
    setProfile(updatedProfile);
    await onSave(updatedProfile);
    setRecommendedSkills(prev => prev.filter(r => r.skill !== skillName));
    if (showToast) showToast(`"${skillName}" adicionada com sucesso!`, 'success');
  };

  const addAllRecommendedSkills = async () => {
    if (recommendedSkills.length === 0) return;
    const skillsToAdd = recommendedSkills.map(r => r.skill).filter(
      name => !profile.skills.some(s => s.toLowerCase() === name.toLowerCase())
    );
    if (skillsToAdd.length === 0) {
      setRecommendedSkills([]);
      return;
    }
    const updatedSkills = [...profile.skills, ...skillsToAdd];
    const updatedProfile = { ...profile, skills: updatedSkills };
    setProfile(updatedProfile);
    await onSave(updatedProfile);
    setRecommendedSkills([]);
    if (showToast) showToast(`${skillsToAdd.length} habilidades adicionadas com sucesso!`, 'success');
  };

  const generateAiSuggestion = async () => {
    if (!focusedField || !focusedField.value.trim()) {
      setSuggestionError('Por favor digite algum rascunho primeiro para que a IA possa sugerir melhorias.');
      return;
    }
    setIsGeneratingSuggestion(true);
    setSuggestionError(null);
    setAiSuggestion('');
    try {
      const response = await fetch('/api/suggest-improvements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: focusedField.value,
          type: focusedField.type
        })
      });
      const data = await response.json();
      if (response.ok && data.suggestion) {
        setAiSuggestion(data.suggestion);
      } else {
        setSuggestionError(data.error || 'Não foi possível obter sugestão da IA.');
      }
    } catch (err: any) {
      console.error('Erro na chamada da API de escrita:', err);
      setSuggestionError('Erro ao comunicar com o servidor de sugestão IA.');
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  const applyAiSuggestion = (type: 'biography' | 'experience', index?: number) => {
    if (!aiSuggestion) return;
    if (type === 'biography') {
      updatePersonalInfo('biography', aiSuggestion);
    } else if (type === 'experience' && index !== undefined) {
      updateExperience(index, 'description', aiSuggestion);
    }
    setFocusedField(null);
    setAiSuggestion('');
  };

  const isDirty = useRef(false);

  // Se for somente leitura, força o modo de leitura
  useEffect(() => {
    if (isReadOnly) {
      setActiveMode('read');
    }
  }, [isReadOnly]);

  // Efeito para verificar se o link público existe no Firestore
  useEffect(() => {
    if (isReadOnly) return;
    const checkPublicLinkStatus = async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const docRef = doc(db, 'public_profiles', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setPublicLinkCreated(true);
          const generatedUrl = `${window.location.origin}${window.location.pathname}?p=${user.uid}`;
          setSharedUrl(generatedUrl);
        }
      } catch (err: any) {
        console.error('Erro ao verificar status público do Lattes:', err);
        handleFirestoreError(err, OperationType.GET, `public_profiles/${user.uid}`);
      }
    };
    checkPublicLinkStatus();
  }, [isReadOnly, profile?.personalInfo?.fullName]);

  const handleCreatePublicLink = async () => {
    const user = auth.currentUser;
    if (!user) {
      setShareError('Você precisa estar logado para gerar um link público.');
      return;
    }

    setIsSharing(true);
    setShareError(null);

    try {
      const docRef = doc(db, 'public_profiles', user.uid);
      await setDoc(docRef, {
        uid: user.uid,
        researcherName: profile.personalInfo?.fullName || 'Pesquisador',
        academicProfile: profile,
        createdAt: serverTimestamp()
      });

      setPublicLinkCreated(true);
      const generatedUrl = `${window.location.origin}${window.location.pathname}?p=${user.uid}`;
      setSharedUrl(generatedUrl);
      isDirty.current = false;
    } catch (err: any) {
      console.error('Erro ao criar link público:', err);
      setShareError('Erro de permissão ou conexão ao gerar o link público.');
      handleFirestoreError(err, OperationType.CREATE, `public_profiles/${user.uid}`);
    } finally {
      setIsSharing(false);
    }
  };

  const handleDeletePublicLink = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setIsSharing(true);
    setShareError(null);

    try {
      const docRef = doc(db, 'public_profiles', user.uid);
      await deleteDoc(docRef);
      setPublicLinkCreated(false);
      setSharedUrl('');
    } catch (err: any) {
      console.error('Erro ao remover link público:', err);
      setShareError('Erro de permissão ou conexão ao remover o link público.');
      handleFirestoreError(err, OperationType.DELETE, `public_profiles/${user.uid}`);
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyShareLink = () => {
    if (!sharedUrl) return;
    navigator.clipboard.writeText(sharedUrl);
    setCopyShareStatus(true);
    setTimeout(() => {
      setCopyShareStatus(false);
    }, 2500);
  };

  // Carrega / Sincroniza o profile extraído selecionado
  useEffect(() => {
    if (initialProfile) {
      isDirty.current = false;
      setProfile(initialProfile);
    }
  }, [initialProfile]);

  // Motor de Salvamento Automático (Debounced)
  useEffect(() => {
    if (!isDirty.current) return;

    setSaveStatus('saving');
    const delayDebounce = setTimeout(async () => {
      try {
        await onSave(profile);
        setSaveStatus('saved');
        const clearStatus = setTimeout(() => {
          setSaveStatus('idle');
        }, 3000);
        isDirty.current = false;
        return () => clearTimeout(clearStatus);
      } catch (err) {
        console.error('Erro no salvamento automático:', err);
        setSaveStatus('error');
      }
    }, 1000); // 1 segundo de debounce para edições suaves

    return () => clearTimeout(delayDebounce);
  }, [profile, onSave]);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  const handleDownloadJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profile, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `lattes_extraido_${profile.personalInfo?.fullName?.toLowerCase().replace(/\s+/g, '_') || 'perfil'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleDownloadTxt = () => {
    let txt = `CURRÍCULO ACADÊMICO - ${profile.personalInfo?.fullName?.toUpperCase() || 'PESQUISADOR'}\n`;
    txt += `=======================================================================\n\n`;
    
    if (profile.personalInfo?.biography) {
      txt += `RESUMO PROFISSIONAL\n`;
      txt += `-------------------\n`;
      txt += `${profile.personalInfo.biography}\n\n`;
    }
    
    if (profile.personalInfo?.location) {
      txt += `Localização: ${profile.personalInfo.location}\n\n`;
    }
    
    if (profile.education && profile.education.length > 0) {
      txt += `FORMAÇÃO ACADÊMICA\n`;
      txt += `------------------\n`;
      profile.education.forEach(edu => {
        txt += `- ${edu.degree} em ${edu.fieldOfStudy || ''} (${edu.startYear} - ${edu.endYear}) - ${edu.status}\n`;
        txt += `  Instituição: ${edu.institution}\n`;
      });
      txt += `\n`;
    }

    if (profile.certifications && profile.certifications.length > 0) {
      txt += `CERTIFICAÇÕES EXTRA CURRICULARES\n`;
      txt += `--------------------------------\n`;
      profile.certifications.forEach(cert => {
        txt += `- ${cert.name} (${cert.year})${cert.hours ? ` - Carga Horária: ${cert.hours}` : ''}\n`;
        txt += `  Emissor: ${cert.issuer}\n`;
      });
      txt += `\n`;
    }

    if (profile.experience && profile.experience.length > 0) {
      txt += `EXPERIÊNCIA PROFISSIONAL / ATIVIDADES\n`;
      txt += `------------------------------------\n`;
      profile.experience.forEach(exp => {
        txt += `- ${exp.role} na ${exp.organization} (${exp.startDate} - ${exp.endDate})\n`;
        if (exp.description) txt += `  Descrição: ${exp.description}\n`;
      });
      txt += `\n`;
    }

    if (profile.publications && profile.publications.length > 0) {
      txt += `PUBLICAÇÕES E ARTIGOS\n`;
      txt += `---------------------\n`;
      profile.publications.forEach(pub => {
        txt += `- "${pub.title}" - ${pub.venue || ''} (${pub.year})\n`;
        if (pub.authors) txt += `  Autores: ${pub.authors}\n`;
        if (pub.doi) txt += `  DOI: ${pub.doi}\n`;
      });
      txt += `\n`;
    }

    if (profile.languages && profile.languages.length > 0) {
      txt += `IDIOMAS\n`;
      txt += `-------\n`;
      profile.languages.forEach(lang => {
        txt += `- ${lang.language}: ${lang.proficiency}\n`;
      });
      txt += `\n`;
    }

    if (profile.skills && profile.skills.length > 0) {
      txt += `HABILIDADES E COMPETÊNCIAS METRIZADAS\n`;
      txt += `------------------------------------\n`;
      txt += profile.skills.join(', ') + '\n';
    }

    const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(txt);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `perfil_academico_${profile.personalInfo?.fullName?.toLowerCase().replace(/\s+/g, '_') || 'perfil'}.txt`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleDownloadPdf = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const marginX = 20;
    let posY = 20;
    const pageHeight = 297;
    const printableWidth = 210 - (marginX * 2);

    const checkPageOverflow = (neededHeight: number) => {
      if (posY + neededHeight > pageHeight - 20) {
        doc.addPage();
        posY = 20;
        doc.setFont("Helvetica", "oblique");
        doc.setFontSize(8);
        doc.setTextColor(140, 140, 140);
        doc.text(`Currículo Acadêmico - ${profile.personalInfo?.fullName || 'Pesquisador'}`, marginX, 12);
        doc.line(marginX, 14, 210 - marginX, 14);
        doc.setFont("Helvetica", "normal");
      }
    };

    // 1. Cabeçalho
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59); // Slate-800
    const name = profile.personalInfo?.fullName || 'Pesquisador';
    const splitName = doc.splitTextToSize(name, printableWidth);
    doc.text(splitName, marginX, posY);
    posY += (splitName.length * 8) + 2;

    if (profile.personalInfo?.location) {
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // Slate-500
      doc.text(profile.personalInfo.location, marginX, posY);
      posY += 6;
    }

    // Divisor
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.line(marginX, posY, 210 - marginX, posY);
    posY += 8;

    // Resumo
    if (profile.personalInfo?.biography) {
      doc.setFont("Helvetica", "italic");
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105); // Slate-600
      const bioText = doc.splitTextToSize(profile.personalInfo.biography, printableWidth);
      checkPageOverflow(bioText.length * 5);
      doc.text(bioText, marginX, posY);
      posY += (bioText.length * 5) + 8;
    }

    const drawSectionTitle = (title: string) => {
      checkPageOverflow(15);
      posY += 2;
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(79, 70, 229); // Indigo-600
      doc.text(title, marginX, posY);
      posY += 3;
      doc.setDrawColor(199, 210, 254);
      doc.line(marginX, posY, 210 - marginX, posY);
      posY += 6;
    };

    // Formação
    if (profile.education && profile.education.length > 0) {
      drawSectionTitle("FORMAÇÃO ACADÊMICA");
      profile.education.forEach(edu => {
        checkPageOverflow(18);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        const degreeLine = `${edu.degree} em ${edu.fieldOfStudy || ''}`;
        doc.text(degreeLine, marginX, posY);

        doc.setFont("Helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        const period = `(${edu.startYear} - ${edu.endYear || 'Atual'}) — ${edu.status || 'Concluído'}`;
        const periodWidth = doc.getTextWidth(period);
        doc.text(period, 210 - marginX - periodWidth, posY);
        posY += 4.5;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(edu.institution, marginX, posY);
        posY += 6.5;
      });
      posY += 2;
    }

    // Experiência
    if (profile.experience && profile.experience.length > 0) {
      drawSectionTitle("HISTÓRICO PROFISSIONAL");
      profile.experience.forEach(exp => {
        checkPageOverflow(20);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        doc.text(exp.role, marginX, posY);

        doc.setFont("Helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        const periodStr = `${exp.startDate} - ${exp.endDate || 'Atual'}`;
        const periodWidth = doc.getTextWidth(periodStr);
        doc.text(periodStr, 210 - marginX - periodWidth, posY);
        posY += 4.5;

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(exp.organization, marginX, posY);
        posY += 4.5;

        if (exp.description) {
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(100, 116, 139);
          const descText = doc.splitTextToSize(exp.description, printableWidth);
          checkPageOverflow(descText.length * 4);
          doc.text(descText, marginX, posY);
          posY += (descText.length * 4);
        }
        posY += 5.5;
      });
      posY += 2;
    }

    // Certificações
    if (profile.certifications && profile.certifications.length > 0) {
      drawSectionTitle("CERTIFICAÇÕES & TÍTULOS ADICIONAIS");
      profile.certifications.forEach(cert => {
        checkPageOverflow(14);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        doc.text(cert.name, marginX, posY);

        doc.setFont("Helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        const yr = cert.year ? String(cert.year) : '';
        const yrWidth = doc.getTextWidth(yr);
        doc.text(yr, 210 - marginX - yrWidth, posY);
        posY += 4.5;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        const detail = `${cert.issuer}${cert.hours ? ` | Carga Horária: ${cert.hours}` : ''}`;
        doc.text(detail, marginX, posY);
        posY += 6.5;
      });
      posY += 2;
    }

    // Publicações
    if (profile.publications && profile.publications.length > 0) {
      drawSectionTitle("PRODUÇÃO BIBLIOGRÁFICA");
      profile.publications.forEach(pub => {
        const titleLines = doc.splitTextToSize(`"${pub.title}"`, printableWidth);
        const detail = `${pub.authors} (${pub.year}). ${pub.venue || ''}${pub.doi ? ` | DOI: ${pub.doi}` : ''}`;
        const detailLines = doc.splitTextToSize(detail, printableWidth);
        
        checkPageOverflow((titleLines.length * 4) + (detailLines.length * 3.5) + 4);
        
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.text(titleLines, marginX, posY);
        posY += (titleLines.length * 4);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text(detailLines, marginX, posY);
        posY += (detailLines.length * 3.5) + 4;
      });
      posY += 2;
    }

    // Idiomas & Habilidades
    if ((profile.languages && profile.languages.length > 0) || (profile.skills && profile.skills.length > 0)) {
      drawSectionTitle("IDIOMAS & COMPETÊNCIAS ADICIONAIS");
      
      if (profile.languages && profile.languages.length > 0) {
        checkPageOverflow(15);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        doc.text("Idiomas:", marginX, posY);
        posY += 4.5;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        const langs = profile.languages.map(l => `${l.language} (${l.proficiency})`).join(', ');
        const splitLangs = doc.splitTextToSize(langs, printableWidth);
        doc.text(splitLangs, marginX, posY);
        posY += (splitLangs.length * 4) + 4;
      }

      if (profile.skills && profile.skills.length > 0) {
        checkPageOverflow(15);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        doc.text("Habilidades & Áreas de Domínio:", marginX, posY);
        posY += 4.5;

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        const skillsLine = profile.skills.join(', ');
        const splitSkills = doc.splitTextToSize(skillsLine, printableWidth);
        doc.text(splitSkills, marginX, posY);
        posY += (splitSkills.length * 4) + 4;
      }
    }

    const pageCount = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(`Página ${i} de ${pageCount}`, 105, 287, { align: "center" });
    }

    const nameSlug = profile.personalInfo?.fullName?.toLowerCase().replace(/\s+/g, '_') || 'cv';
    doc.save(`curriculo_lattes_${nameSlug}.pdf`);
  };

  const handleSaveProfile = async () => {
    isDirty.current = false;
    setSaveStatus('saving');
    try {
      await onSave(profile);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // Funções Utilitárias para Edição Rápida
  const updatePersonalInfo = (field: string, value: string) => {
    isDirty.current = true;
    setProfile(prev => ({
      ...prev,
      personalInfo: {
        ...prev.personalInfo,
        [field]: value
      }
    }));
  };

  // Educação
  const addEducation = () => {
    isDirty.current = true;
    setProfile(prev => ({
      ...prev,
      education: [...prev.education, { degree: 'Graduação', institution: '', fieldOfStudy: '', startYear: '', endYear: '', status: 'Concluído' }]
    }));
  };

  const updateEducation = (index: number, field: string, value: string) => {
    isDirty.current = true;
    setProfile(prev => {
      const updated = [...prev.education];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, education: updated };
    });
  };

  const removeEducation = (index: number) => {
    isDirty.current = true;
    setProfile(prev => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index)
    }));
  };

  // Certificados
  const addCertification = () => {
    isDirty.current = true;
    setProfile(prev => ({
      ...prev,
      certifications: [...prev.certifications, { name: '', issuer: '', hours: '', year: '' }]
    }));
  };

  const updateCertification = (index: number, field: string, value: string) => {
    isDirty.current = true;
    setProfile(prev => {
      const updated = [...prev.certifications];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, certifications: updated };
    });
  };

  const removeCertification = (index: number) => {
    isDirty.current = true;
    setProfile(prev => ({
      ...prev,
      certifications: prev.certifications.filter((_, i) => i !== index)
    }));
  };

  // Experiências
  const addExperience = () => {
    isDirty.current = true;
    setProfile(prev => ({
      ...prev,
      experience: [...prev.experience, { role: '', organization: '', startDate: '', endDate: 'Atual', description: '' }]
    }));
  };

  const updateExperience = (index: number, field: string, value: string) => {
    isDirty.current = true;
    setProfile(prev => {
      const updated = [...prev.experience];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, experience: updated };
    });
  };

  const removeExperience = (index: number) => {
    isDirty.current = true;
    setProfile(prev => ({
      ...prev,
      experience: prev.experience.filter((_, i) => i !== index)
    }));
  };

  // Publicações
  const addPublication = () => {
    isDirty.current = true;
    setProfile(prev => ({
      ...prev,
      publications: [...prev.publications, { title: '', venue: '', authors: '', year: '', doi: '' }]
    }));
  };

  const updatePublication = (index: number, field: string, value: string) => {
    isDirty.current = true;
    setProfile(prev => {
      const updated = [...prev.publications];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, publications: updated };
    });
  };

  const removePublication = (index: number) => {
    isDirty.current = true;
    setProfile(prev => ({
      ...prev,
      publications: prev.publications.filter((_, i) => i !== index)
    }));
  };

  // Idiomas
  const addLanguage = () => {
    isDirty.current = true;
    setProfile(prev => ({
      ...prev,
      languages: [...prev.languages, { language: '', proficiency: 'Intermediário' }]
    }));
  };

  const updateLanguage = (index: number, field: string, value: string) => {
    isDirty.current = true;
    setProfile(prev => {
      const updated = [...prev.languages];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, languages: updated };
    });
  };

  const removeLanguage = (index: number) => {
    isDirty.current = true;
    setProfile(prev => ({
      ...prev,
      languages: prev.languages.filter((_, i) => i !== index)
    }));
  };

  // Habilidades de Tags
  const [newSkill, setNewSkill] = useState('');
  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSkill.trim() && !profile.skills.includes(newSkill.trim())) {
      isDirty.current = true;
      setProfile(prev => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()]
      }));
      setNewSkill('');
    }
  };

  const removeSkill = (skillToRemove: string) => {
    isDirty.current = true;
    setProfile(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skillToRemove)
    }));
  };

  return (
    <div id="results-panel" className="bg-white border-2 border-slate-200 rounded-3xl p-6 flex flex-col h-full shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5 pb-4 border-b-2 border-slate-100">
        <div>
          <h2 className="text-lg font-black text-slate-950 font-sans flex items-center gap-2 uppercase tracking-tight">
            <Sparkles className="w-5 h-5 text-indigo-600 shrink-0" />
            Dados Extraídos & Formulário Lattes
          </h2>
          <p className="text-xs text-slate-550 font-bold mt-1">
            Revise, complemente as seções do Lattes ou exporte em formato JSON estrito para integração.
          </p>
        </div>

        {/* Variadores de visualização e status de salvamento */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Badge de Salvamento Automático */}
          {!isReadOnly && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-slate-100 bg-slate-50">
              {saveStatus === 'saving' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-600">Salvando...</span>
                </>
              ) : saveStatus === 'saved' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 animate-bounce" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Salvo</span>
                </>
              ) : saveStatus === 'error' ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-rose-600">Erro ao salvar</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-slate-350" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Sincronizado</span>
                </>
              )}
            </div>
          )}

          {!isReadOnly && (
            <div className="p-0.5 bg-slate-100 rounded-xl border border-slate-200 flex">
              <button
                id="mode-read-btn"
                onClick={() => setActiveMode('read')}
                className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeMode === 'read' 
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" /> Leitura
              </button>
              <button
                id="mode-form-btn"
                onClick={() => setActiveMode('form')}
                className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeMode === 'form' 
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> Edição
              </button>
              <button
                id="mode-json-btn"
                onClick={() => setActiveMode('json')}
                className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeMode === 'json' 
                    ? 'bg-white text-indigo-700 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Code className="w-3.5 h-3.5" /> JSON Estrito
              </button>
            </div>
          )}

          {/* Exportadores */}
          <button
            id="lattes-download-pdf-btn"
            onClick={handleDownloadPdf}
            className="p-2 bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 rounded-xl hover:text-indigo-600 transition-colors cursor-pointer flex items-center gap-1"
            title="Exportar Perfil como PDF formatado (.pdf)"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            <span className="text-[9px] font-black uppercase tracking-wider px-0.5">PDF</span>
          </button>

          <button
            id="lattes-download-txt-btn"
            onClick={handleDownloadTxt}
            className="p-2 bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 rounded-xl hover:text-indigo-600 transition-colors cursor-pointer flex items-center gap-1"
            title="Exportar Perfil como Documento de Texto (.txt)"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span className="text-[9px] font-black uppercase tracking-wider px-0.5">TXT</span>
          </button>

          <button
            id="lattes-download-btn"
            onClick={handleDownloadJson}
            className="p-2 bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 rounded-xl hover:text-indigo-600 transition-colors cursor-pointer flex items-center gap-1"
            title="Download JSON do Perfil"
          >
            <Download className="w-4 h-4 text-indigo-500" />
            <span className="text-[9px] font-black uppercase tracking-wider px-0.5">JSON</span>
          </button>

          {!isReadOnly && (
            <>
              <button
                id="lattes-copy-btn"
                onClick={handleCopyJson}
                className="p-2 bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 rounded-xl hover:text-indigo-600 transition-colors cursor-pointer"
                title="Copiar JSON"
              >
                <Copy className={`w-4 h-4 ${copyStatus ? 'text-green-600' : ''}`} />
              </button>

              <button
                id="lattes-share-btn"
                onClick={() => setShowShareModal(true)}
                className="p-2 bg-gradient-to-tr from-indigo-50 to-indigo-100/90 hover:from-indigo-100 hover:to-indigo-200 border-2 border-indigo-200 text-indigo-700 rounded-xl hover:text-indigo-900 transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                title="Compartilhar Link Público do Currículo"
              >
                <Share2 className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-[9px] font-black uppercase tracking-wider px-0.5">Compartilhar</span>
              </button>

              <button
                id="lattes-save-btn"
                onClick={handleSaveProfile}
                disabled={saveStatus === 'saving'}
                className="px-4 py-2 bg-indigo-600 hover:bg-slate-900 disabled:bg-slate-100 text-white disabled:text-slate-400 font-black rounded-xl text-xs uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'saved' ? 'Salvo!' : 'Salvar'}
              </button>
            </>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeMode}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.25 }}
          className="flex-1 flex flex-col"
        >
          {activeMode === 'json' ? (
            <div className="flex-1 min-h-[400px] bg-slate-950 border-2 border-slate-900 rounded-2xl p-4 font-mono text-xs text-slate-300 overflow-auto relative select-all">
              <button
                id="json-inner-copy-btn"
                onClick={handleCopyJson}
                className="absolute top-3 right-3 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 rounded-lg text-[10px] font-black uppercase text-slate-400 flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3 h-3" /> {copyStatus ? 'Copiado!' : 'Copiar'}
              </button>
              <pre className="whitespace-pre-wrap">{JSON.stringify(profile, null, 2)}</pre>
            </div>
          ) : activeMode === 'read' ? (
            <div id="cv-reading-mode" className="flex-1 min-h-[400px] bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-6 shadow-sm overflow-y-auto max-h-[800px]">
              
              {/* Cabeçalho Visual: Capa de Perfil IA do Gemini */}
              <div className="w-full h-44 rounded-2xl overflow-hidden relative border-2 border-slate-100 bg-slate-900 group shadow-md flex items-center justify-center">
                {profile.coverImage ? (
                  <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:object-cover" dangerouslySetInnerHTML={{ __html: profile.coverImage }} />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-6 text-center">
                    <Sparkles className="w-8 h-8 text-indigo-400 mb-2 animate-bounce fill-indigo-500/20" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Capa de Perfil Científico IA</p>
                    <p className="text-[9px] text-slate-400 font-bold max-w-sm mt-1">
                      Mapeie suas habilidades e o cargo de <span className="text-teal-400 font-black">{targetJob}</span> para desenhar uma capa vetorial sob medida.
                    </p>
                  </div>
                )}

                {isGeneratingCover && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-10 transition-all">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 animate-pulse">Desenhando capa com Gemini 3.5...</span>
                  </div>
                )}

                {coverError && (
                  <div className="absolute top-2 left-2 right-2 p-2 bg-rose-900/90 text-rose-100 rounded-xl text-[9px] font-bold border border-rose-700 backdrop-blur-sm z-10">
                    {coverError}
                  </div>
                )}

                {!isReadOnly && !isGeneratingCover && (
                  <button
                    type="button"
                    onClick={generateCover}
                    className="absolute bottom-3 right-3 px-3 py-1.5 bg-slate-950/75 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-500 rounded-xl text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-lg cursor-pointer backdrop-blur"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    {profile.coverImage ? 'Recriar Capa IA' : 'Gerar Capa IA'}
                  </button>
                )}
              </div>

              {/* Header */}
              <div className="border-b border-slate-100 pb-5">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">
                  {profile.personalInfo?.fullName || 'Pesquisador sem Nome'}
                </h2>
                {profile.personalInfo?.location && (
                  <p className="text-xs text-slate-450 font-bold uppercase tracking-wider mt-1.5 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-500" /> {profile.personalInfo.location}
                  </p>
                )}
                {profile.personalInfo?.biography && (
                  <p className="text-xs text-slate-600 leading-relaxed font-normal italic mt-4 bg-slate-50 p-4 rounded-xl border-l-[3.5px] border-indigo-400">
                    "{profile.personalInfo.biography}"
                  </p>
                )}
              </div>

              {/* Formações */}
              {profile.education && profile.education.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 border-b border-indigo-100 pb-1.5">
                    <GraduationCap className="w-4 h-4" /> Formação Acadêmica
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profile.education.map((edu, idx) => (
                      <div key={idx} className="p-4 bg-slate-50/50 rounded-xl border border-slate-150 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="text-xs font-black text-slate-850 uppercase leading-snug">
                              {edu.degree} em {edu.fieldOfStudy || 'Área não definida'}
                            </h4>
                            <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 border border-emerald-100">
                              {edu.status || 'Concluído'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-550 font-semibold mt-1">{edu.institution}</p>
                        </div>
                        <span className="text-[10px] font-mono text-slate-450 mt-3 block font-bold">
                          {edu.startYear} — {edu.endYear || 'Atual'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Atividades Profissionais */}
              {profile.experience && profile.experience.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 border-b border-indigo-100 pb-1.5">
                    <Briefcase className="w-4 h-4" /> Histórico Profissional
                  </h3>
                  <div className="space-y-4">
                    {profile.experience.map((exp, idx) => (
                      <div key={idx} className="relative pl-5 border-l-2 border-slate-200 pb-1 last:pb-0">
                        <div className="absolute w-2.5 h-2.5 bg-slate-300 rounded-full -left-[6px] top-1.5 border border-white" />
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                            {exp.role} <span className="text-indigo-600 normal-case font-extrabold">@ {exp.organization}</span>
                          </h4>
                          <span className="text-[10px] text-slate-450 font-mono font-bold shrink-0">
                            {exp.startDate} — {exp.endDate || 'Atual'}
                          </span>
                        </div>
                        {exp.description && (
                          <p className="text-xs text-slate-500 leading-relaxed mt-1.5 font-normal max-w-2xl">
                            {exp.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Certificações */}
              {profile.certifications && profile.certifications.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 border-b border-indigo-100 pb-1.5">
                    <Award className="w-4 h-4" /> Certificações e Títulos
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {profile.certifications.map((cert, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-105 flex justify-between items-center gap-3">
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-slate-800 truncate uppercase">{cert.name}</h4>
                          <p className="text-[10px] text-slate-550 font-semibold truncate leading-normal">{cert.issuer}</p>
                        </div>
                        <div className="text-right shrink-0">
                          {cert.hours && (
                            <span className="text-[8px] font-mono font-black text-indigo-750 bg-indigo-50 px-1.5 py-0.5 rounded-md uppercase tracking-wider block mb-1">
                              {cert.hours}
                            </span>
                          )}
                          {cert.year && (
                            <span className="text-[10px] text-slate-450 font-mono font-bold block">{cert.year}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Produção Bibliográfica */}
              {profile.publications && profile.publications.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 border-b border-indigo-100 pb-1.5">
                    <BookOpen className="w-4 h-4" /> Produção Bibliográfica
                  </h3>
                  <ul className="space-y-3.5 list-none pl-0">
                    {profile.publications.map((pub, idx) => (
                      <li key={idx} className="text-xs text-slate-655 leading-relaxed font-normal bg-slate-50/30 hover:bg-slate-50 p-3 rounded-xl border border-slate-150 transition-colors">
                        <span className="font-extrabold text-slate-800">{pub.authors}</span> ({pub.year}). 
                        <span className="font-semibold text-indigo-950"> "{pub.title}"</span>. 
                        {pub.venue && <span className="italic text-slate-500 font-semibold">  {pub.venue}.</span>}
                        {pub.doi && (
                          <span className="block text-[10px] font-mono text-slate-450 mt-1 font-bold">
                            DOI: <span className="text-indigo-500 select-all">{pub.doi}</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Idiomas & Skills */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Idiomas */}
                {profile.languages && profile.languages.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 border-b border-indigo-100 pb-1.5">
                      <Globe className="w-4 h-4" /> Idiomas
                    </h3>
                    <div className="space-y-2">
                      {profile.languages.map((lang, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="font-extrabold text-slate-700">{lang.language}</span>
                          <span className="text-[10px] font-mono font-bold text-slate-450 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wider">{lang.proficiency}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Habilidades */}
                {profile.skills && profile.skills.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2 border-b border-indigo-100 pb-1.5">
                      <Tag className="w-4 h-4" /> Habilidades e Expertises
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.skills.map((skill, idx) => (
                        <span key={idx} className="text-[10px] bg-slate-900 text-white font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-6">
              {/* Opção de visualizar/gerar capa também no editor */}
              <div className="w-full h-24 rounded-2xl overflow-hidden relative border border-slate-200 bg-slate-900 shadow-sm flex items-center justify-center">
                {profile.coverImage ? (
                  <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:object-cover" dangerouslySetInnerHTML={{ __html: profile.coverImage }} />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-4 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Capa do Perfil Acadêmico</p>
                    <p className="text-[9px] text-slate-400 font-bold max-w-sm mt-0.5">
                      Nenhuma capa gerada para o seu cargo-alvo de <span className="text-indigo-400 font-extrabold">{targetJob}</span>.
                    </p>
                  </div>
                )}

                {isGeneratingCover && (
                  <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-10 transition-all">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mb-1" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-indigo-300 animate-pulse">Criando Capa...</span>
                  </div>
                )}

                {!isReadOnly && !isGeneratingCover && (
                  <button
                    type="button"
                    onClick={generateCover}
                    className="absolute bottom-2 right-2 px-2.5 py-1 bg-slate-950/75 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-500 rounded-lg text-white text-[8px] font-extrabold uppercase tracking-wider flex items-center gap-1 transition-all shadow-md cursor-pointer backdrop-blur"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    {profile.coverImage ? 'Re-gerar Capa' : 'Criar Capa Lattes IA'}
                  </button>
                )}
              </div>

              <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-[400px]">
          {/* Menu Lateral de Seções Acadêmicas */}
          <div className="w-full md:w-52 shrink-0 flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-2 md:pb-0 border-b md:border-b-0 md:border-r-2 border-slate-100 pr-1">
            <button
              id="cat-personal-btn"
              onClick={() => setActiveCategory('personal')}
              className={`w-full text-left px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                activeCategory === 'personal' 
                  ? 'bg-indigo-50 text-indigo-700 font-black' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <User className="w-4 h-4" /> Dados Pessoais
            </button>
            <button
              id="cat-education-btn"
              onClick={() => setActiveCategory('education')}
              className={`w-full text-left px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                activeCategory === 'education' 
                  ? 'bg-indigo-50 text-indigo-700 font-black' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-4 h-4" /> Formação ({profile.education.length})
            </button>
            <button
              id="cat-certifications-btn"
              onClick={() => setActiveCategory('certifications')}
              className={`w-full text-left px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                activeCategory === 'certifications' 
                  ? 'bg-indigo-50 text-indigo-700 font-black' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Award className="w-4 h-4" /> Certificações ({profile.certifications.length})
            </button>
            <button
              id="cat-experience-btn"
              onClick={() => setActiveCategory('experience')}
              className={`w-full text-left px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                activeCategory === 'experience' 
                  ? 'bg-indigo-50 text-indigo-700 font-black' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Briefcase className="w-4 h-4" /> Atividades ({profile.experience.length})
            </button>
            <button
              id="cat-publications-btn"
              onClick={() => setActiveCategory('publications')}
              className={`w-full text-left px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                activeCategory === 'publications' 
                  ? 'bg-indigo-50 text-indigo-700 font-black' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4" /> Publicações ({profile.publications.length})
            </button>
            <button
              id="cat-langskills-btn"
              onClick={() => setActiveCategory('languages_skills')}
              className={`w-full text-left px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-2 shrink-0 transition-all cursor-pointer ${
                activeCategory === 'languages_skills' 
                  ? 'bg-indigo-50 text-indigo-700 font-black' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Globe className="w-4 h-4" /> Idiomas & Skills
            </button>
          </div>

          {/* Form Content Visualizer */}
          <div className="flex-1 overflow-y-auto max-h-[500px] pr-2">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeCategory}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {activeCategory === 'personal' && (
              <div id="form-personal-section" className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Dados Pessoais & Resumo Acadêmico</h3>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">Nome Completo</label>
                  <input
                    type="text"
                    value={profile.personalInfo.fullName}
                    onChange={(e) => updatePersonalInfo('fullName', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600 placeholder:text-slate-400"
                    placeholder="Ex: Dr. Roberto Silveira"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">Cidade / País</label>
                  <input
                    type="text"
                    value={profile.personalInfo.location || ''}
                    onChange={(e) => updatePersonalInfo('location', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600 placeholder:text-slate-400"
                    placeholder="Ex: Rio de Janeiro, Brasil"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">Mini Biografia Acadêmica (para apresentação no Lattes)</label>
                  <textarea
                    rows={4}
                    value={profile.personalInfo.biography}
                    onChange={(e) => {
                      updatePersonalInfo('biography', e.target.value);
                      if (focusedField?.type === 'biography') {
                        setFocusedField({ type: 'biography', value: e.target.value });
                      }
                    }}
                    onFocus={() => {
                      setFocusedField({ type: 'biography', value: profile.personalInfo.biography });
                      setSuggestionError(null);
                      setAiSuggestion('');
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600 placeholder:text-slate-400 leading-relaxed resize-none"
                    placeholder="Faça uma introdução sobre o seu foco de estudo, conquistas de destaque ou objetivos científicos."
                  />

                  {/* Assistente de Escrita Acadêmica IA para Biografia */}
                  <AnimatePresence>
                    {focusedField && focusedField.type === 'biography' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0, y: -5 }} 
                        animate={{ opacity: 1, height: 'auto', y: 0 }} 
                        exit={{ opacity: 0, height: 0, y: -5 }} 
                        className="mt-2.5 p-3.5 bg-indigo-50/50 border-2 border-indigo-100 rounded-2xl space-y-2.5 overflow-hidden"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-indigo-700">
                            <Sparkles className="w-4 h-4 text-indigo-600 fill-indigo-200" />
                            Assistente de Escrita Acadêmica Lattes IA
                          </div>
                          <button 
                            type="button"
                            onClick={() => setFocusedField(null)} 
                            className="p-1 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {!aiSuggestion && !isGeneratingSuggestion && (
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-indigo-100/60">
                            <p className="text-[10px] text-slate-600 font-bold leading-relaxed">
                              Deseja otimizar sua biografia utilizando o padrão de excelência científica da Plataforma Lattes?
                            </p>
                            <button
                              type="button"
                              onClick={generateAiSuggestion}
                              className="w-full sm:w-auto px-3.5 py-2 bg-indigo-600 hover:bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest rounded-xl shrink-0 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-indigo-600/10"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-white" /> Aprimorar com IA
                            </button>
                          </div>
                        )}

                        {isGeneratingSuggestion && (
                          <div className="py-1 flex items-center gap-2 text-[10px] font-black text-indigo-700 uppercase animate-pulse">
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                            Refinando rascunho com o Gemini...
                          </div>
                        )}

                        {suggestionError && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-[10px] font-black flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                            {suggestionError}
                          </div>
                        )}

                        {aiSuggestion && (
                          <div className="space-y-2.5">
                            <div className="p-3 bg-white border border-indigo-150 rounded-xl text-xs leading-relaxed text-slate-700 font-bold select-text shadow-sm whitespace-pre-wrap">
                              {aiSuggestion}
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => setAiSuggestion('')}
                                className="px-3 py-1.5 text-[9px] font-black text-slate-500 hover:text-slate-700 uppercase tracking-wider cursor-pointer"
                              >
                                Refazer / Descartar
                              </button>
                              <button
                                type="button"
                                onClick={() => applyAiSuggestion('biography')}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-md shadow-emerald-600/10"
                              >
                                ✓ Aplicar Sugestão
                              </button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {activeCategory === 'education' && (
              <div id="form-education-section" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Formação Acadêmica / Titulação</h3>
                  <button
                    id="add-edu-btn"
                    onClick={addEducation}
                    className="px-3.5 py-1.5 text-[10px] bg-indigo-600 hover:bg-slate-900 text-white rounded-full font-black uppercase tracking-widest flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" /> Adicionar Formação
                  </button>
                </div>

                {profile.education.length === 0 ? (
                  <p className="text-xs text-slate-400 font-bold text-center py-6 uppercase tracking-wider">Nenhuma formação cadastrada. Clique em adicionar.</p>
                ) : (
                  profile.education.map((edu, idx) => (
                    <div key={idx} className="p-4 border-2 border-slate-100 rounded-2xl bg-slate-50 relative space-y-4 shadow-sm">
                      <button
                        id={`del-edu-${idx}`}
                        onClick={() => removeEducation(idx)}
                        className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-rose-650 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pr-6">
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Grau Acadêmico</label>
                          <input
                            type="text"
                            value={edu.degree}
                            onChange={(e) => updateEducation(idx, 'degree', e.target.value)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                            placeholder="Graduação, Mestrado, Especialização..."
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Curso / Área</label>
                          <input
                            type="text"
                            value={edu.fieldOfStudy || ''}
                            onChange={(e) => updateEducation(idx, 'fieldOfStudy', e.target.value)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                            placeholder="Ciência da Computação, Administração..."
                          />
                        </div>
                        <div className="col-span-1 sm:col-span-2">
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Instituição de Ensino</label>
                          <input
                            type="text"
                            value={edu.institution}
                            onChange={(e) => updateEducation(idx, 'institution', e.target.value)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                            placeholder="Universidade Federal do Rio de Janeiro"
                          />
                        </div>
                        <div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-655 mb-1">Ano Início</label>
                              <input
                                type="text"
                                value={edu.startYear}
                                onChange={(e) => updateEducation(idx, 'startYear', e.target.value)}
                                className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-655 mb-1">Ano Fim</label>
                              <input
                                type="text"
                                value={edu.endYear}
                                onChange={(e) => updateEducation(idx, 'endYear', e.target.value)}
                                className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                              />
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Status</label>
                          <select
                            value={edu.status}
                            onChange={(e) => updateEducation(idx, 'status', e.target.value as any)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-800 font-bold focus:outline-none focus:border-indigo-600"
                          >
                            <option value="Concluído">Concluído</option>
                            <option value="Em andamento">Em andamento</option>
                            <option value="Incompleto">Incompleto</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeCategory === 'certifications' && (
              <div id="form-certs-section" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Certificações & Cursos Complementares</h3>
                  <button
                    id="add-cert-btn"
                    onClick={addCertification}
                    className="px-3.5 py-1.5 text-[10px] bg-indigo-600 hover:bg-slate-900 text-white rounded-full font-black uppercase tracking-widest flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" /> Adicionar Certificado
                  </button>
                </div>

                {profile.certifications.length === 0 ? (
                  <p className="text-xs text-slate-400 font-bold text-center py-6 uppercase tracking-wider">Nenhuma certificação extraída. Adicione para atualizar.</p>
                ) : (
                  profile.certifications.map((cert, idx) => (
                    <div key={idx} className="p-4 border-2 border-slate-100 rounded-2xl bg-slate-50 relative space-y-4 shadow-sm">
                      <button
                        id={`del-cert-${idx}`}
                        onClick={() => removeCertification(idx)}
                        className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-rose-650 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pr-6">
                        <div className="col-span-1 sm:col-span-2">
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Nome do Curso / Certificado</label>
                          <input
                            type="text"
                            value={cert.name}
                            onChange={(e) => updateCertification(idx, 'name', e.target.value)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                            placeholder="Machine Learning Avançado"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Instituição Emissora</label>
                          <input
                            type="text"
                            value={cert.issuer}
                            onChange={(e) => updateCertification(idx, 'issuer', e.target.value)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                            placeholder="Google Cloud / Alura"
                          />
                        </div>
                        <div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-655 mb-1">Carga Horária</label>
                              <input
                                type="text"
                                value={cert.hours || ''}
                                onChange={(e) => updateCertification(idx, 'hours', e.target.value)}
                                className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                                placeholder="ex: 40h"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-655 mb-1">Ano Emissão</label>
                              <input
                                type="text"
                                value={cert.year}
                                onChange={(e) => updateCertification(idx, 'year', e.target.value)}
                                className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                                placeholder="ex: 2026"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeCategory === 'experience' && (
              <div id="form-exp-section" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Experiência Profissional / Extra-classe</h3>
                  <button
                    id="add-exp-btn"
                    onClick={addExperience}
                    className="px-3.5 py-1.5 text-[10px] bg-indigo-600 hover:bg-slate-900 text-white rounded-full font-black uppercase tracking-widest flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" /> Adicionar Atividade
                  </button>
                </div>

                {profile.experience.length === 0 ? (
                  <p className="text-xs text-slate-400 font-bold text-center py-6 uppercase tracking-wider">Nenhuma experiência extraída do arquivo.</p>
                ) : (
                  profile.experience.map((exp, idx) => (
                    <div key={idx} className="p-4 border-2 border-slate-100 rounded-2xl bg-slate-50 relative space-y-4 shadow-sm">
                      <button
                        id={`del-exp-${idx}`}
                        onClick={() => removeExperience(idx)}
                        className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-rose-650 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pr-6">
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Cargo / Atividade</label>
                          <input
                            type="text"
                            value={exp.role}
                            onChange={(e) => updateExperience(idx, 'role', e.target.value)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                            placeholder="Desenvolvedor Bolsista / Estagiário"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Empresa ou Órgão Acadêmico</label>
                          <input
                            type="text"
                            value={exp.organization}
                            onChange={(e) => updateExperience(idx, 'organization', e.target.value)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                            placeholder="PET-Computação / Lab de Química"
                          />
                        </div>
                        <div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-655 mb-1">Ano Início</label>
                              <input
                                type="text"
                                value={exp.startDate}
                                onChange={(e) => updateExperience(idx, 'startDate', e.target.value)}
                                className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-655 mb-1">Ano Término</label>
                              <input
                                type="text"
                                value={exp.endDate}
                                onChange={(e) => updateExperience(idx, 'endDate', e.target.value)}
                                className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="col-span-1 sm:col-span-2">
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Descrição Curta das Atividades</label>
                          <textarea
                            rows={2}
                            value={exp.description || ''}
                            onChange={(e) => {
                              updateExperience(idx, 'description', e.target.value);
                              if (focusedField?.type === 'experience' && focusedField?.index === idx) {
                                setFocusedField({ type: 'experience', index: idx, value: e.target.value });
                              }
                            }}
                            onFocus={() => {
                              setFocusedField({ type: 'experience', index: idx, value: exp.description || '' });
                              setSuggestionError(null);
                              setAiSuggestion('');
                            }}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600 resize-none leading-relaxed"
                            placeholder="Auxílio direto em pesquisa científica, catalogação..."
                          />

                          {/* Assistente de Escrita Acadêmica IA para Experiência */}
                          <AnimatePresence>
                            {focusedField && focusedField.type === 'experience' && focusedField.index === idx && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0, y: -5 }} 
                                animate={{ opacity: 1, height: 'auto', y: 0 }} 
                                exit={{ opacity: 0, height: 0, y: -5 }} 
                                className="mt-2 p-3.5 bg-indigo-50/50 border-2 border-indigo-100 rounded-2xl space-y-2 overflow-hidden"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-indigo-700">
                                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 fill-indigo-200" />
                                    Aprimorador de Atividades Acadêmicas Lattes IA
                                  </div>
                                  <button 
                                    type="button"
                                    onClick={() => setFocusedField(null)} 
                                    className="p-1 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>

                                {!aiSuggestion && !isGeneratingSuggestion && (
                                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-white p-2.5 rounded-xl border border-indigo-100/60">
                                    <p className="text-[9px] text-slate-600 font-bold leading-relaxed">
                                      Gostaria de tornar a descrição desta atuação mais técnica e recomendada para concursos, seleções de bolsas ou empregos?
                                    </p>
                                    <button
                                      type="button"
                                      onClick={generateAiSuggestion}
                                      className="w-full sm:w-auto px-2.5 py-1.5 bg-indigo-650 hover:bg-slate-900 text-white text-[8px] font-black uppercase tracking-widest rounded-lg shrink-0 flex items-center justify-center gap-1 transition-all cursor-pointer shadow-md shadow-indigo-600/10"
                                    >
                                      <Sparkles className="w-3 h-3 text-white" /> Otimizar com IA
                                    </button>
                                  </div>
                                )}

                                {isGeneratingSuggestion && (
                                  <div className="py-1 flex items-center gap-2 text-[9px] font-black text-indigo-700 uppercase animate-pulse">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                                    Refinando atividades com o Gemini...
                                  </div>
                                )}

                                {suggestionError && (
                                  <div className="p-2 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg text-[9px] font-black flex items-center gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                                    {suggestionError}
                                  </div>
                                )}

                                {aiSuggestion && (
                                  <div className="space-y-2">
                                    <div className="p-2.5 bg-white border border-indigo-150 rounded-xl text-[11px] leading-relaxed text-slate-700 font-bold select-text shadow-sm whitespace-pre-wrap">
                                      {aiSuggestion}
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        type="button"
                                        onClick={() => setAiSuggestion('')}
                                        className="px-2.5 py-1 text-[8px] font-black text-slate-500 hover:text-slate-700 uppercase tracking-widest cursor-pointer"
                                      >
                                        Refazer / Descartar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => applyAiSuggestion('experience', idx)}
                                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[8px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer shadow-md shadow-emerald-600/10"
                                      >
                                        ✓ Aplicar Atividade
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeCategory === 'publications' && (
              <div id="form-publications-section" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Publicações & Trabalhos Bibliográficos</h3>
                  <button
                    id="add-pub-btn"
                    onClick={addPublication}
                    className="px-3.5 py-1.5 text-[10px] bg-indigo-600 hover:bg-slate-900 text-white rounded-full font-black uppercase tracking-widest flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" /> Adicionar Trabalho
                  </button>
                </div>

                {profile.publications.length === 0 ? (
                  <p className="text-xs text-slate-400 font-bold text-center py-6 uppercase tracking-wider">Nenhum trabalho científico catalogado.</p>
                ) : (
                  profile.publications.map((pub, idx) => (
                    <div key={idx} className="p-4 border-2 border-slate-100 rounded-2xl bg-slate-50 relative space-y-4 shadow-sm">
                      <button
                        id={`del-pub-${idx}`}
                        onClick={() => removePublication(idx)}
                        className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-rose-650 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pr-6">
                        <div className="col-span-1 sm:col-span-2">
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Título do Trabalho</label>
                          <input
                            type="text"
                            value={pub.title}
                            onChange={(e) => updatePublication(idx, 'title', e.target.value)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                            placeholder="Análise Exploratória do Clima Nordestino..."
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Veículo (Revista acadêmica ou Anais do Evento)</label>
                          <input
                            type="text"
                            value={pub.venue || ''}
                            onChange={(e) => updatePublication(idx, 'venue', e.target.value)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                            placeholder="SBC Congress / Nature Journal"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Autores</label>
                          <input
                            type="text"
                            value={pub.authors || ''}
                            onChange={(e) => updatePublication(idx, 'authors', e.target.value)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                            placeholder="Silveira, F.; Souza, R."
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">Ano de Publicação</label>
                          <input
                            type="text"
                            value={pub.year}
                            onChange={(e) => updatePublication(idx, 'year', e.target.value)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-650 mb-1">DOI (Identificador Digital)</label>
                          <input
                            type="text"
                            value={pub.doi || ''}
                            onChange={(e) => updatePublication(idx, 'doi', e.target.value)}
                            className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                            placeholder="ex: 10.1016/j.envsoft.2025..."
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeCategory === 'languages_skills' && (
              <div id="form-langskills-section" className="space-y-6">
                
                {/* IDIOMAS */}
                <div>
                  <div className="flex items-center justify-between mb-3 border-b-2 border-slate-100 pb-2">
                    <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase">Idiomas Catalogados</h3>
                    <button
                      id="add-lang-btn"
                      onClick={addLanguage}
                      className="px-3 py-1 text-[9px] bg-slate-900 text-white hover:bg-indigo-600 rounded-full font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-2.5 h-2.5" /> Adicionar Idioma
                    </button>
                  </div>

                  {profile.languages.length === 0 ? (
                    <p className="text-xs text-slate-400 font-bold py-2 uppercase tracking-wide">Nenhum idioma listado.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {profile.languages.map((lang, idx) => (
                        <div key={idx} className="p-3 border-2 border-slate-100 rounded-xl bg-slate-50 relative flex items-center gap-2">
                          <input
                            type="text"
                            value={lang.language}
                            onChange={(e) => updateLanguage(idx, 'language', e.target.value)}
                            className="bg-white border-2 border-slate-200 rounded-xl text-xs px-2.5 py-1.5 w-32 text-slate-950 font-bold focus:outline-none focus:border-indigo-600"
                            placeholder="Inglês, Alemão..."
                          />
                          <select
                            value={lang.proficiency}
                            onChange={(e) => updateLanguage(idx, 'proficiency', e.target.value)}
                            className="bg-white border-2 border-slate-200 rounded-xl text-xs px-2 py-1.5 text-slate-800 font-bold focus:outline-none focus:border-indigo-600 flex-1"
                          >
                            <option value="Básico">Básico</option>
                            <option value="Intermediário">Intermediário</option>
                            <option value="Avançado">Avançado</option>
                            <option value="Fluente">Fluente</option>
                          </select>
                          <button
                            id={`del-lang-${idx}`}
                            onClick={() => removeLanguage(idx)}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* HARD SKILLS */}
                <div className="border-t-2 border-slate-100 pt-5">
                  <h3 className="text-xs font-black text-slate-800 tracking-wider uppercase mb-3">Hard / Soft Skills Identificadas</h3>
                  
                  <form onSubmit={handleAddSkill} className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      className="flex-1 px-3.5 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:border-indigo-600"
                      placeholder="Adicione habilidade, ex: React, D3.js, Estatística..."
                    />
                    <button
                      id="save-new-skill-btn"
                      type="submit"
                      className="px-4 bg-slate-950 hover:bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-colors"
                    >
                      Inserir
                    </button>
                  </form>

                  {profile.skills.length === 0 ? (
                    <p className="text-xs text-slate-400 font-bold py-2 uppercase tracking-wide">Nenhuma habilidade cadastrada.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {profile.skills.map((skill, idx) => (
                        <div 
                          key={idx}
                          className="px-3 py-1.5 bg-indigo-50 border-2 border-indigo-100 rounded-xl text-xs text-indigo-900 font-black flex items-center gap-1.5"
                        >
                          <Tag className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>{skill}</span>
                          <button
                            id={`del-skill-${idx}`}
                            type="button"
                            onClick={() => removeSkill(skill)}
                            className="text-indigo-400 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SUGERIR HABILIDADES RECOMENDADAS PELO GEMINI */}
                <div className="border-t border-slate-100 pt-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <div>
                      <h4 className="text-xs font-black text-slate-850 uppercase tracking-wide flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        Sugerir Competências para {targetJob}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase mt-0.5">Analise lacunas em relação ao seu cargo alvo com Inteligência Artificial</p>
                    </div>
                    <button
                      type="button"
                      onClick={recommendSkills}
                      disabled={isRecommendingSkills}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-slate-900 disabled:bg-slate-100 text-white disabled:text-slate-400 font-black rounded-xl text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-sm"
                    >
                      {isRecommendingSkills ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Analisando...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          Sugerir Habilidades
                        </>
                      )}
                    </button>
                  </div>

                  {recommendError && (
                    <div className="p-3 bg-red-50 border border-red-150 text-red-700 rounded-xl text-xs font-semibold">
                      {recommendError}
                    </div>
                  )}

                  {recommendedSkills.length > 0 && (
                    <div className="bg-white border-2 border-dashed border-slate-200 p-4 rounded-xl space-y-3 animate-fade-in">
                      <div className="flex items-center justify-between animate-fade-in">
                        <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">Habilidades recomendadas pelo Gemini (+ {recommendedSkills.length})</span>
                        <button
                          type="button"
                          onClick={addAllRecommendedSkills}
                          className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest cursor-pointer hover:underline"
                        >
                          Adicionar Todas
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5">
                        {recommendedSkills.map((rec, index) => (
                          <div key={index} className="flex justify-between items-start gap-4 p-3 bg-slate-50 hover:bg-slate-100/55 rounded-xl border border-slate-150 transition-colors">
                            <div className="space-y-1">
                              <span className="text-xs font-black text-slate-850 uppercase">{rec.skill}</span>
                              <p className="text-[10px] text-slate-600 leading-relaxed font-semibold">{rec.reason}</p>
                              {rec.action && (
                                <p className="text-[9px] text-indigo-500 font-extrabold uppercase tracking-wider">Sugestão: {rec.action}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => addRecommendedSkill(rec.skill)}
                              className="px-2.5 py-1.5 bg-white hover:bg-indigo-600 text-slate-700 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer border-2 border-slate-200 hover:border-indigo-600"
                            >
                              + Adicionar
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
    </div>
  )}
        </motion.div>
      </AnimatePresence>

      {/* Modal de Compartilhamento de Link Público */}
      <AnimatePresence>
        {showShareModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="bg-white rounded-2xl border border-slate-250 shadow-2xl max-w-md w-full p-6 text-slate-800 space-y-4 relative"
            >
              <button
                onClick={() => setShowShareModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-lg p-1 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-850">Compartilhar Currículo</h3>
                  <p className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider">Link Público no Firestore</p>
                </div>
              </div>

              <div className="text-xs text-slate-600 leading-relaxed font-normal">
                {publicLinkCreated ? (
                  <span>Seu currículo acadêmico está atualmente <strong className="text-indigo-600">público e acessível</strong> para qualquer pessoa com o link abaixo. Compartilhe-o em suas redes sociais, e-mail ou portfólios acadêmicos!</span>
                ) : (
                  <span>Crie um link de visualização pública dinâmico para este currículo estruturado. Qualquer pessoa poderá visualizar sua formação, publicações, certificados de forma organizada e limpa.</span>
                )}
              </div>

              {shareError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{shareError}</span>
                </div>
              )}

              {publicLinkCreated && sharedUrl ? (
                <div className="space-y-3 pt-1">
                  <div className="flex gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2 items-center">
                    <Link className="w-4 h-4 text-indigo-500 shrink-0 ml-1" />
                    <input
                      type="text"
                      readOnly
                      value={sharedUrl}
                      className="bg-transparent border-none outline-none text-xs text-slate-700 font-mono w-full select-all px-1"
                    />
                    <button
                      onClick={handleCopyShareLink}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold uppercase rounded-lg text-[9px] tracking-wider shrink-0 transition-colors cursor-pointer"
                    >
                      {copyShareStatus ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1.5 justify-between">
                    <button
                      onClick={handleDeletePublicLink}
                      disabled={isSharing}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold uppercase rounded-xl text-[10px] tracking-wider transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" /> Desativar Link
                    </button>

                    <div className="flex gap-2">
                      <button
                        onClick={handleCreatePublicLink}
                        disabled={isSharing}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase rounded-xl text-[10px] tracking-wider transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Sincroniza o link público com as mudanças mais recentes do seu perfil"
                      >
                        {isSharing ? 'Atualizando...' : 'Atualizar Link'}
                      </button>
                      
                      <a
                        href={sharedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold uppercase rounded-xl text-[10px] tracking-wider transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" /> Abrir Link
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pt-2">
                  <button
                    onClick={handleCreatePublicLink}
                    disabled={isSharing}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase rounded-xl text-xs tracking-wider transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {isSharing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" /> Gerando Link...
                      </>
                    ) : (
                      <>
                        <Share2 className="w-4 h-4 shrink-0" /> Gerar Link Público
                      </>
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
</div>
  );
}
