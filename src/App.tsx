/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  onAuthStateChanged,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, OperationType, handleFirestoreError } from './firebase';
import { UserFile, AcademicProfile, ChatMessage, CareerPersona } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark' | 'contrast';
type Screen = 'login' | 'app';
type AuthMode = 'login' | 'signup';
type ResultMode = 'read' | 'edit' | 'json';
type EditCategory = 'personal' | 'experience' | 'publications' | 'education' | 'certifications' | 'langskills';

interface Toast {
  id: string;
  message: string;
  kind: 'success' | 'error' | 'info';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const emptyProfile = (): AcademicProfile => ({
  personalInfo: { fullName: '', biography: '', location: '' },
  education: [],
  certifications: [],
  experience: [],
  publications: [],
  languages: [],
  skills: [],
});

function clean(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ─── Gap Analysis ─────────────────────────────────────────────────────────────

function requiredSkills(job: string) {
  const j = clean(job);
  if (/(data|dados|inteligencia|python|machine| ia| ai|analytics|cientista)/.test(j)) return [
    { skill: 'Programação (Python ou R)', required: 85, keywords: ['python', 'r', 'programacao', 'desenvolvimento'] },
    { skill: 'Estatística & Analytics', required: 80, keywords: ['estatistica', 'analise', 'modelagem', 'analytics'] },
    { skill: 'Bancos de Dados & SQL', required: 75, keywords: ['sql', 'banco de dados', 'database', 'postgres'] },
    { skill: 'Machine Learning & IA', required: 75, keywords: ['machine learning', 'ia', 'ai', 'deep learning'] },
    { skill: 'Visualização de Dados (BI)', required: 70, keywords: ['dashboard', 'bi', 'power bi', 'tableau', 'visualizacao'] },
  ];
  if (/(professor|docente|ensino|educa)/.test(j)) return [
    { skill: 'Didática & Metodologias Ativas', required: 90, keywords: ['didatica', 'pedagogia', 'ensino', 'educacao'] },
    { skill: 'Oratória & Apresentação', required: 85, keywords: ['comunicacao', 'oratoria', 'apresentacao'] },
    { skill: 'Planejamento de Cursos', required: 80, keywords: ['plano de aula', 'curriculo', 'planejamento'] },
  ];
  return [
    { skill: 'Redação Científica', required: 80, keywords: ['escrita', 'redacao', 'cientifica', 'artigo'] },
    { skill: 'Metodologia de Pesquisa', required: 75, keywords: ['metodologia', 'pesquisa', 'qualitativa', 'quantitativa'] },
    { skill: 'Gestão de Projetos', required: 70, keywords: ['projetos', 'cronograma', 'planejamento'] },
  ];
}

function computeGap(profile: AcademicProfile, targetJob: string) {
  if (!targetJob) return null;
  const req = requiredSkills(targetJob);
  const hasData = profile.personalInfo.fullName || profile.publications.length || profile.skills.length;
  if (!hasData) return { gaps: req.map(r => ({ ...r, userScore: 0, gap: r.required, isMatch: false, evidence: 'Adicione dados ao perfil.' })), overall: 0 };

  const userSkills = (profile.skills || []).map(s => clean(s));
  const bio = clean(profile.personalInfo.biography);
  const exp = (profile.experience || []).map(e => clean(e.role + ' ' + e.description)).join(' ');
  const pub = (profile.publications || []).map(x => clean(x.title + ' ' + (x.venue || ''))).join(' ');

  const gaps = req.map(r => {
    let score = 15;
    r.keywords.forEach(kw => {
      const k = clean(kw);
      if (userSkills.some(s => s.includes(k))) score += 45;
      if (exp.includes(k)) score += 30;
      if (pub.includes(k)) score += 25;
      if (bio.includes(k)) score += 15;
    });
    const final = Math.min(score, 100);
    const isMatch = final >= r.required;
    return { skill: r.skill, userScore: final, requiredScore: r.required, gap: isMatch ? 0 : r.required - final, isMatch };
  });
  const sum = gaps.reduce((a, c) => a + (c.userScore >= c.requiredScore ? 100 : (c.userScore / c.requiredScore) * 100), 0);
  return { gaps, overall: Math.round(sum / gaps.length) };
}

// ─── Polar / Arc for donut chart ──────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, s: number, e: number) {
  if (e - s >= 359.99) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  const a = polar(cx, cy, r, e), b = polar(cx, cy, r, s);
  const big = e - s <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${big} 0 ${b.x.toFixed(2)} ${b.y.toFixed(2)} Z`;
}

// ─── Inline Styles ────────────────────────────────────────────────────────────

const S = {
  app: { minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' } as React.CSSProperties,
  masthead: { background: 'var(--surface)', borderBottom: '1px solid var(--line)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky' as const, top: 0, zIndex: 100 },
  brand: { fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' },
  tag: { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 4, padding: '2px 6px' },
  workspace: { display: 'grid', gridTemplateColumns: '360px 1fr', gap: 0, minHeight: 'calc(100vh - 49px)' },
  leftPanel: { borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column' as const, background: 'var(--surface)' },
  rightPanel: { background: 'var(--paper)', display: 'flex', flexDirection: 'column' as const },
  section: { borderBottom: '1px solid var(--line)', padding: '16px' },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--ink-3)' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' as const, transition: 'all 0.12s' } as React.CSSProperties,
  btnAccent: { background: 'var(--accent)', color: 'var(--accent-ink)', border: '1px solid var(--accent)', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.12s' } as React.CSSProperties,
  input: { background: 'var(--field)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--ink)', padding: '7px 10px', fontSize: 13, width: '100%', outline: 'none', fontFamily: 'var(--font-sans)' } as React.CSSProperties,
  textarea: { background: 'var(--field)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--ink)', padding: '7px 10px', fontSize: 13, width: '100%', outline: 'none', fontFamily: 'var(--font-sans)', resize: 'vertical' as const, minHeight: 70 } as React.CSSProperties,
};

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);

  // Auth
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Theme
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('evoluai-theme') as Theme) || 'light'
  );

  // Firestore data
  const [files, setFiles] = useState<UserFile[]>([]);
  const [activeProfile, setActiveProfile] = useState<AcademicProfile>(emptyProfile());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [careerPersona, setCareerPersona] = useState<CareerPersona>('aprendiz');
  const [targetJob, setTargetJob] = useState('Cientista de Dados');
  const [selectedFileId, setSelectedFileId] = useState('');

  // UI state
  const [resultMode, setResultMode] = useState<ResultMode>('read');
  const [editCategory, setEditCategory] = useState<EditCategory>('personal');
  const [dragActive, setDragActive] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<{ name: string; profile: AcademicProfile } | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [newSkill, setNewSkill] = useState('');
  const [bioSuggestion, setBioSuggestion] = useState('');
  const [bioSuggesting, setBioSuggesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'unsaved' | 'saving' | 'saved'>('idle');
  const [jsonCopied, setJsonCopied] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Apply theme
  useEffect(() => {
    if (rootRef.current) {
      rootRef.current.className = `theme-${theme}`;
    }
    localStorage.setItem('evoluai-theme', theme);
  }, [theme]);

  // Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      setCurrentUser(user);
      setAuthChecking(false);
    });
  }, []);

  // Firestore subscriptions
  useEffect(() => {
    if (!currentUser) { setFiles([]); setMessages([]); return; }
    const uid = currentUser.uid;

    const uq = query(collection(db, 'users', uid, 'files'), orderBy('uploadedAt', 'desc'));
    const unsubFiles = onSnapshot(uq, snap => {
      const list: UserFile[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({ id: d.id, name: data.name || '', size: data.size || 0, type: data.type || '', uploadedAt: data.uploadedAt, status: data.status || 'pending', extractedData: data.extractedData, error: data.error });
      });
      setFiles(list);
      if (list.length > 0 && !selectedFileId) {
        const done = list.find(f => f.status === 'completed');
        if (done?.extractedData) { setActiveProfile(done.extractedData); setSelectedFileId(done.id); }
      }
    }, err => handleFirestoreError(err, OperationType.LIST, `users/${uid}/files`));

    const mq = query(collection(db, 'users', uid, 'messages'), orderBy('timestamp', 'asc'));
    const unsubMsgs = onSnapshot(mq, snap => {
      const list: ChatMessage[] = [];
      snap.forEach(d => { const data = d.data(); list.push({ id: d.id, sender: data.sender, text: data.text, timestamp: data.timestamp }); });
      setMessages(list);
    }, err => handleFirestoreError(err, OperationType.LIST, `users/${uid}/messages`));

    getDoc(doc(db, 'users', uid, 'profile', 'settings')).then(d => {
      if (d.exists()) {
        const data = d.data();
        if (data.persona) setCareerPersona(data.persona);
        if (data.targetJob) setTargetJob(data.targetJob);
        if (data.academicProfile) setActiveProfile(data.academicProfile);
      } else {
        setDoc(doc(db, 'users', uid, 'profile', 'settings'), { persona: 'aprendiz', targetJob: 'Cientista de Dados', academicProfile: emptyProfile(), updatedAt: serverTimestamp() });
      }
    });

    return () => { unsubFiles(); unsubMsgs(); };
  }, [currentUser]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Toast
  const toast = useCallback((message: string, kind: Toast['kind'] = 'info') => {
    const id = 't' + Math.random().toString(36).slice(2, 8);
    setToasts(prev => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4200);
  }, []);

  // ─── Auth handlers ──────────────────────────────────────────────────────────

  const handleEmailAuth = async () => {
    if (!email.trim()) { setAuthError('Informe um e-mail.'); return; }
    setAuthLoading(true); setAuthError('');
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (e: any) {
      setAuthError(e.message || 'Erro de autenticação.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthLoading(true); setAuthError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e: any) {
      setAuthError(e.message || 'Erro com Google OAuth.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = () => signOut(auth);

  // ─── File handlers ──────────────────────────────────────────────────────────

  const addFile = async (name: string, size: number, type: string) => {
    if (!currentUser) return '';
    const uid = currentUser.uid;
    const ref = await addDoc(collection(db, 'users', uid, 'files'), { name, size, type, uploadedAt: serverTimestamp(), status: 'pending' });
    return ref.id;
  };

  const pickFile = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*,application/pdf';
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      const id = await addFile(f.name, f.size, f.type || 'application/octet-stream');
      if (id) processFile(id, f);
    };
    inp.click();
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    const f = e.dataTransfer?.files?.[0]; if (!f) return;
    const id = await addFile(f.name, f.size, f.type || 'application/octet-stream');
    if (id) processFile(id, f);
  };

  const processFile = async (id: string, file: File) => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    const fileRef = doc(db, 'users', uid, 'files', id);
    await updateDoc(fileRef, { status: 'processing' });
    try {
      const reader = new FileReader();
      const base64: string = await new Promise(res => { reader.onload = () => res((reader.result as string).split(',')[1]); reader.readAsDataURL(file); });
      const resp = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileBase64: base64, mimeType: file.type, fileName: file.name }) });
      if (!resp.ok) throw new Error((await resp.json()).error || 'Erro na extração.');
      const extracted: AcademicProfile = await resp.json();
      await updateDoc(fileRef, { status: 'completed', extractedData: extracted });
      setActiveProfile(extracted);
      setSelectedFileId(id);
      const settRef = doc(db, 'users', uid, 'profile', 'settings');
      await updateDoc(settRef, { academicProfile: extracted, updatedAt: serverTimestamp() });
      toast(`"${file.name}" extraído com sucesso pela IA.`, 'success');
    } catch (err: any) {
      await updateDoc(fileRef, { status: 'failed', error: err.message });
      toast(`Extração falhou: ${err.message}`, 'error');
    }
  };

  const removeFile = async (id: string) => {
    if (!currentUser) return;
    await deleteDoc(doc(db, 'users', currentUser.uid, 'files', id));
    if (selectedFileId === id) setSelectedFileId('');
  };

  // ─── Lattes search ──────────────────────────────────────────────────────────

  const runSearch = async () => {
    if (!searchName.trim()) return;
    setSearchLoading(true); setSearchResult(null);
    try {
      const resp = await fetch('/api/search-lattes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ researcherName: searchName }) });
      if (!resp.ok) throw new Error('Erro na busca.');
      const data = await resp.json();
      setSearchResult({ name: searchName, profile: data });
    } catch {
      toast('Não foi possível buscar no Lattes.', 'error');
    } finally {
      setSearchLoading(false);
    }
  };

  const importLattes = async () => {
    if (!searchResult) return;
    setActiveProfile(searchResult.profile);
    setSearchResult(null); setSearchName('');
    if (currentUser) {
      const settRef = doc(db, 'users', currentUser.uid, 'profile', 'settings');
      await updateDoc(settRef, { academicProfile: searchResult.profile, updatedAt: serverTimestamp() });
    }
    toast('Currículo Lattes importado.', 'success');
  };

  // ─── Profile editing ────────────────────────────────────────────────────────

  const patchPersonal = (field: string, value: string) => {
    setActiveProfile(p => ({ ...p, personalInfo: { ...p.personalInfo, [field]: value } }));
    setSaveStatus('unsaved');
  };

  const patchArray = (key: keyof AcademicProfile, index: number, field: string, value: string) => {
    setActiveProfile(p => {
      const arr = [...(p[key] as any[])];
      arr[index] = { ...arr[index], [field]: value };
      return { ...p, [key]: arr };
    });
    setSaveStatus('unsaved');
  };

  const addRow = (key: keyof AcademicProfile, row: any) => {
    setActiveProfile(p => ({ ...p, [key]: [...(p[key] as any[]), row] }));
    setSaveStatus('unsaved');
  };

  const removeRow = (key: keyof AcademicProfile, index: number) => {
    setActiveProfile(p => ({ ...p, [key]: (p[key] as any[]).filter((_, i) => i !== index) }));
    setSaveStatus('unsaved');
  };

  const addSkill = () => {
    const v = newSkill.trim(); if (!v) return;
    if (activeProfile.skills.includes(v)) { setNewSkill(''); return; }
    setActiveProfile(p => ({ ...p, skills: [...p.skills, v] }));
    setNewSkill(''); setSaveStatus('unsaved');
  };

  const removeSkill = (name: string) => {
    setActiveProfile(p => ({ ...p, skills: p.skills.filter(x => x !== name) }));
    setSaveStatus('unsaved');
  };

  const saveProfile = async () => {
    if (!currentUser) return;
    setSaveStatus('saving');
    try {
      const settRef = doc(db, 'users', currentUser.uid, 'profile', 'settings');
      await updateDoc(settRef, { academicProfile: activeProfile, updatedAt: serverTimestamp() });
      setSaveStatus('saved');
      toast('Perfil acadêmico salvo.', 'success');
      setTimeout(() => setSaveStatus('idle'), 2200);
    } catch {
      setSaveStatus('unsaved');
      toast('Falha ao salvar perfil.', 'error');
    }
  };

  // ─── AI bio ─────────────────────────────────────────────────────────────────

  const suggestBio = async () => {
    const cur = activeProfile.personalInfo.biography;
    if (!cur?.trim()) { toast('Escreva um rascunho antes.', 'error'); return; }
    setBioSuggesting(true); setBioSuggestion('');
    try {
      const resp = await fetch('/api/suggest-improvements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: cur, type: 'biography' }) });
      if (!resp.ok) throw new Error('Erro na sugestão.');
      const data = await resp.json();
      setBioSuggestion(data.suggestion || data.text || '');
    } catch {
      toast('Falha na sugestão de IA.', 'error');
    } finally {
      setBioSuggesting(false);
    }
  };

  const applyBio = () => {
    patchPersonal('biography', bioSuggestion);
    setBioSuggestion('');
    toast('Biografia atualizada.', 'success');
  };

  // ─── Chat ────────────────────────────────────────────────────────────────────

  const sendChat = async (text: string) => {
    const t = text.trim(); if (!t || chatLoading || !currentUser) return;
    const uid = currentUser.uid;
    setChatLoading(true); setChatInput('');
    try {
      await addDoc(collection(db, 'users', uid, 'messages'), { sender: 'user', text: t, timestamp: serverTimestamp() });
      const updatedMsgs = [...messages, { id: 'tmp', sender: 'user' as const, text: t, timestamp: new Date() }];
      const resp = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: updatedMsgs, persona: careerPersona, targetJob, academicProfile: activeProfile }) });
      const resData = resp.ok ? await resp.json() : { response: '⚠️ Serviço indisponível.' };
      await addDoc(collection(db, 'users', uid, 'messages'), { sender: 'assistant', text: resData.response || resData.error, timestamp: serverTimestamp() });
    } catch (err: any) {
      await addDoc(collection(db, 'users', uid, 'messages'), { sender: 'assistant', text: `⚠️ Erro: ${err.message}`, timestamp: serverTimestamp() });
    } finally {
      setChatLoading(false);
    }
  };

  // ─── Export ──────────────────────────────────────────────────────────────────

  const slug = () => (activeProfile.personalInfo.fullName || 'perfil').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  const buildTxt = () => {
    const p = activeProfile;
    let t = `CURRÍCULO ACADÊMICO — ${(p.personalInfo.fullName || 'Pesquisador').toUpperCase()}\n${'='.repeat(60)}\n\n`;
    if (p.personalInfo.biography) t += `RESUMO\n------\n${p.personalInfo.biography}\n\n`;
    if (p.experience.length) { t += 'EXPERIÊNCIA\n-----------\n'; p.experience.forEach(e => { t += `- ${e.role} @ ${e.organization} (${e.startDate} – ${e.endDate})\n`; }); t += '\n'; }
    if (p.publications.length) { t += 'PUBLICAÇÕES\n-----------\n'; p.publications.forEach((x, i) => { t += `${i + 1}. "${x.title}" — ${x.venue || ''} (${x.year})\n`; }); t += '\n'; }
    if (p.skills.length) t += `COMPETÊNCIAS\n------------\n${p.skills.join(', ')}\n`;
    return t;
  };

  const download = (name: string, text: string, mime: string) => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const isEmpty = !activeProfile.personalInfo.fullName && !activeProfile.experience.length && !activeProfile.publications.length;

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const gapData = computeGap(activeProfile, targetJob);
  const circ = 2 * Math.PI * 20;

  const chartData = [
    { key: 'edu', label: 'Educação', count: activeProfile.education.length, color: '#4C6B57' },
    { key: 'art', label: 'Artigos', count: activeProfile.publications.length, color: '#CF4A22' },
    { key: 'cur', label: 'Cursos', count: activeProfile.certifications.length, color: '#C99A3A' },
    { key: 'tra', label: 'Trabalho', count: activeProfile.experience.length, color: '#3A506B' },
  ];
  const chartTotal = chartData.reduce((a, c) => a + c.count, 0);

  let accDeg = 0;
  const slices = chartData.filter(d => d.count > 0).map(d => {
    const ang = (d.count / chartTotal) * 360;
    const s = accDeg; const e = accDeg + ang; accDeg = e;
    return { key: d.key, color: d.color, d: arc(60, 60, 48, s, e) };
  });

  const personaDefs = [
    { k: 'aprendiz', l: 'Estudante / IC' }, { k: 'recem_formado', l: 'Recém-formado' },
    { k: 'transicao', l: 'Transição' }, { k: 'senior', l: 'Pesquisador Sênior' },
  ];

  // ─── Loading ─────────────────────────────────────────────────────────────────

  if (authChecking) {
    return (
      <div ref={rootRef} className={`theme-${theme}`} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⟳</div>
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Carregando EvoluAI…</p>
        </div>
      </div>
    );
  }

  // ─── Login Screen ─────────────────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <div ref={rootRef} className={`theme-${theme}`} style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 440px', background: 'var(--paper)', fontFamily: 'var(--font-sans)' }}>
        {/* Hero */}
        <div style={{ padding: '48px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid var(--line)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 24 }}>EvoluAI — Plataforma Acadêmica</p>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 96, fontWeight: 400, lineHeight: 0.92, color: 'var(--ink)', letterSpacing: '-0.03em', marginBottom: 40 }}>
            Lattes<br /><em style={{ fontStyle: 'italic' }}>reinventado</em>
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 420 }}>
            {[
              { icon: '◎', title: 'Extração', desc: 'Gemini AI lê PDFs e imagens do Lattes e estrutura seus dados automaticamente.' },
              { icon: '◈', title: 'Análise', desc: 'Gap Analysis inteligente compara seu perfil com a vaga-alvo e aponta lacunas reais.' },
              { icon: '◆', title: 'Coaching', desc: 'Coach adaptativo por persona guia sua evolução com sugestões personalizadas.' },
            ].map(f => (
              <div key={f.icon} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 18, color: 'var(--accent)', marginTop: 1, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 3, color: 'var(--ink)' }}>{f.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Auth Card */}
        <div style={{ padding: '48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--surface)' }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
            {authMode === 'login' ? 'Acesso de pesquisador' : 'Novo cadastro'}
          </p>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 600, color: 'var(--ink)', marginBottom: 28, letterSpacing: '-0.01em' }}>
            {authMode === 'login' ? 'Entrar na plataforma' : 'Criar sua conta'}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <p style={{ ...S.label, marginBottom: 5 }}>E-mail acadêmico</p>
              <input style={S.input} type="email" placeholder="seu@email.edu.br" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} />
            </div>
            <div>
              <p style={{ ...S.label, marginBottom: 5 }}>Senha</p>
              <input style={S.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} />
            </div>
            {authError && <p style={{ fontSize: 12, color: 'var(--accent)', padding: '6px 10px', background: 'rgba(210,69,30,0.08)', borderRadius: 5 }}>{authError}</p>}
            <button style={{ ...S.btnAccent, width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 13 }} onClick={handleEmailAuth} disabled={authLoading}>
              {authLoading ? 'Aguarde…' : authMode === 'login' ? 'Acessar plataforma' : 'Criar conta'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>ou</span>
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>
            <button style={{ ...S.btn, width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 13 }} onClick={handleGoogleAuth} disabled={authLoading}>
              <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continuar com Google
            </button>
            <button style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--ink-3)', cursor: 'pointer', textAlign: 'center', padding: '4px 0' }} onClick={() => { setAuthMode(m => m === 'login' ? 'signup' : 'login'); setAuthError(''); }}>
              {authMode === 'login' ? 'Não tem conta? Cadastre-se grátis' : 'Já possui conta? Entre'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── App Screen ────────────────────────────────────────────────────────────

  return (
    <div ref={rootRef} className={`theme-${theme}`} style={{ ...S.app, display: 'flex', flexDirection: 'column' }}>

      {/* Masthead */}
      <header style={S.masthead}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={S.brand}>EvoluAI</span>
          <span style={S.tag}>Beta</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Theme switcher */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--field)', borderRadius: 6, padding: 3, border: '1px solid var(--line)' }}>
            {([['light', '☀', 'Claro'], ['dark', '☾', 'Escuro'], ['contrast', '◐', 'Alto contraste']] as [Theme, string, string][]).map(([t, g, l]) => (
              <button key={t} title={l} onClick={() => setTheme(t)}
                style={{ width: 26, height: 26, borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme === t ? 'var(--accent)' : 'transparent', color: theme === t ? 'var(--accent-ink)' : 'var(--ink-3)', transition: 'all 0.12s' }}>
                {g}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{currentUser.email}</span>
          <button style={{ ...S.btn, padding: '5px 10px', fontSize: 11 }} onClick={handleSignOut}>Sair</button>
        </div>
      </header>

      {/* Two-panel workspace */}
      <div style={{ ...S.workspace, flex: 1 }}>

        {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
        <div style={S.leftPanel}>

          {/* Document receptor */}
          <div style={S.section}>
            <p style={{ ...S.label, marginBottom: 10 }}>Receptor de Documentos</p>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={pickFile}
              style={{ border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, padding: '20px 12px', textAlign: 'center', cursor: 'pointer', background: dragActive ? 'var(--surface-2)' : 'var(--field)', transition: 'all 0.15s', marginBottom: 10 }}>
              <div style={{ fontSize: 22, color: 'var(--ink-3)', marginBottom: 6 }}>↑</div>
              <p style={{ fontSize: 12, color: 'var(--ink-2)' }}>Arraste PDF ou imagem aqui</p>
              <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>ou clique para selecionar</p>
            </div>

            {/* Demo buttons */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button style={{ ...S.btn, flex: 1, justifyContent: 'center', fontSize: 11 }} onClick={async () => {
                const id = await addFile('demonstracao_lattes.png', 1480000, 'image/png');
                toast('Arquivo demo adicionado. Clique em Extrair.', 'info');
              }}>Demo Lattes</button>
              <button style={{ ...S.btn, flex: 1, justifyContent: 'center', fontSize: 11 }} onClick={async () => {
                const id = await addFile('certificado_demo.pdf', 92160, 'application/pdf');
                toast('Certificado demo adicionado. Clique em Extrair.', 'info');
              }}>Demo Cert.</button>
            </div>

            {/* Lattes CNPq search */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input style={{ ...S.input, flex: 1 }} placeholder="Buscar pesquisador no Lattes" value={searchName}
                onChange={e => setSearchName(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} />
              <button style={{ ...S.btn, flexShrink: 0 }} onClick={runSearch}>{searchLoading ? '…' : 'Buscar'}</button>
            </div>
            {searchResult && (
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '8px 10px', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink-2)' }}>{searchResult.name}</span>
                <button style={{ ...S.btnAccent, padding: '4px 10px', fontSize: 11 }} onClick={importLattes}>Importar</button>
              </div>
            )}

            {/* File list */}
            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                <p style={{ ...S.label, marginBottom: 4 }}>Repositório ({files.length})</p>
                {files.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: selectedFileId === f.id ? 'var(--surface-2)' : 'transparent', border: `1px solid ${selectedFileId === f.id ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 6, cursor: 'pointer' }}
                    onClick={() => { setSelectedFileId(f.id); if (f.extractedData) setActiveProfile(f.extractedData); }}>
                    <span style={{ fontSize: 14, color: f.status === 'completed' ? 'var(--positive)' : f.status === 'processing' ? 'var(--accent)' : 'var(--ink-3)' }}>
                      {f.status === 'completed' ? '✓' : f.status === 'processing' ? '◴' : f.status === 'failed' ? '!' : '⧉'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                      <p style={{ fontSize: 10, color: 'var(--ink-3)' }}>{(f.size / 1024).toFixed(1)} KB · {f.status === 'completed' ? 'Extraído' : f.status === 'processing' ? 'Processando…' : f.status === 'failed' ? 'Erro' : 'Pendente'}</p>
                    </div>
                    {(f.status === 'pending' || f.status === 'failed') && (
                      <button style={{ ...S.btnAccent, padding: '3px 8px', fontSize: 10 }} onClick={e => { e.stopPropagation(); pickFile(); }}>Extrair</button>
                    )}
                    <button style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }} onClick={e => { e.stopPropagation(); removeFile(f.id); }} title="Remover">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Chart */}
          <div style={S.section}>
            <p style={{ ...S.label, marginBottom: 10 }}>Índice de Atividade</p>
            {chartTotal > 0 ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <svg width="120" height="120" viewBox="0 0 120 120">
                  {slices.map(sl => (
                    <path key={sl.key} d={sl.d} fill={sl.color}
                      opacity={hoveredSlice === null || hoveredSlice === sl.key ? 1 : 0.4}
                      onMouseEnter={() => setHoveredSlice(sl.key)} onMouseLeave={() => setHoveredSlice(null)} />
                  ))}
                  <circle cx="60" cy="60" r="28" fill="var(--surface)" />
                  <text x="60" y="64" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--ink)" fontFamily="var(--font-sans)">{chartTotal}</text>
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {chartData.map(d => (
                    <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', padding: '2px 4px', borderRadius: 4, background: hoveredSlice === d.key ? 'var(--surface-2)' : 'transparent' }}
                      onMouseEnter={() => setHoveredSlice(d.key)} onMouseLeave={() => setHoveredSlice(null)}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.count > 0 ? d.color : 'var(--line)', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: d.count > 0 ? 'var(--ink)' : 'var(--ink-3)' }}>{d.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}>{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', padding: '20px 0' }}>Extraia um documento para ver as estatísticas.</p>
            )}
          </div>

          {/* Career Coach */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--coach-bg)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <p style={{ ...S.label, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>Career Coach IA</p>

              {/* Persona */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 10 }}>
                {personaDefs.map(p => (
                  <button key={p.k} onClick={async () => { setCareerPersona(p.k as CareerPersona); if (currentUser) { await updateDoc(doc(db, 'users', currentUser.uid, 'profile', 'settings'), { persona: p.k }); } }}
                    style={{ padding: '5px 0', fontSize: 11, border: `1px solid ${careerPersona === p.k ? 'var(--accent)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 5, background: careerPersona === p.k ? 'var(--accent)' : 'transparent', color: careerPersona === p.k ? 'var(--accent-ink)' : 'rgba(255,255,255,0.65)', cursor: 'pointer' }}>
                    {p.l}
                  </button>
                ))}
              </div>

              {/* Target Job */}
              <input style={{ ...S.input, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}
                placeholder="Vaga-alvo (ex: Cientista de Dados)" value={targetJob}
                onChange={async e => { setTargetJob(e.target.value); if (currentUser) { await updateDoc(doc(db, 'users', currentUser.uid, 'profile', 'settings'), { targetJob: e.target.value }); } }} />
            </div>

            {/* Gap Analysis */}
            {gapData && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
                    <svg width="48" height="48" viewBox="0 0 48 48" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
                      <circle cx="24" cy="24" r="20" fill="none" stroke={gapData.overall >= 75 ? '#5A9B68' : gapData.overall >= 50 ? '#D4922A' : '#E05530'}
                        strokeWidth="4" strokeDasharray={`${circ} ${circ}`}
                        strokeDashoffset={circ * (1 - gapData.overall / 100)} strokeLinecap="round" />
                    </svg>
                    <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{gapData.overall}%</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>Alinhamento com a vaga</p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{targetJob}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {gapData.gaps.map(g => (
                    <div key={g.skill} style={{ cursor: 'pointer' }} onClick={() => setSelectedSkill(selectedSkill === g.skill ? null : g.skill)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', flex: 1 }}>{g.skill}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: g.isMatch ? '#5A9B68' : '#D4922A', padding: '1px 5px', border: `1px solid ${g.isMatch ? '#5A9B68' : '#D4922A'}`, borderRadius: 3 }}>{g.isMatch ? 'OK' : `-${Math.round(g.gap)}%`}</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: g.userScore + '%', background: g.isMatch ? '#5A9B68' : '#D4922A', borderRadius: 2 }} />
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: g.requiredScore + '%', width: 1, background: 'rgba(255,255,255,0.3)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chat messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.length === 0 && (
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', margin: 'auto' }}>Inicie uma conversa com o Coach.</p>
              )}
              {messages.map(m => {
                const isUser = m.sender === 'user';
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '85%', padding: '7px 10px', borderRadius: 8, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: isUser ? 'var(--accent)' : 'rgba(255,255,255,0.05)', color: isUser ? 'var(--accent-ink)' : 'rgba(255,255,255,0.85)', border: isUser ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
                      {m.text}
                    </div>
                  </div>
                );
              })}
              {chatLoading && <div style={{ display: 'flex', justifyContent: 'flex-start' }}><div style={{ padding: '7px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>…</div></div>}
              <div ref={chatEndRef} />
            </div>

            {/* Quick prompts */}
            <div style={{ padding: '8px 16px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {['O que falta para a vaga?', 'Sugira melhorias', 'Cursos recomendados?'].map(q => (
                <button key={q} onClick={() => sendChat(q)}
                  style={{ padding: '3px 8px', fontSize: 10, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}>
                  {q}
                </button>
              ))}
            </div>

            {/* Chat input */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8 }}>
              <input style={{ ...S.input, flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}
                placeholder="Pergunte ao Coach…" value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat(chatInput)} />
              <button style={{ ...S.btnAccent, flexShrink: 0, padding: '0 14px' }} onClick={() => sendChat(chatInput)}>↑</button>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL — O Manuscrito ──────────────────────────────────────── */}
        <div style={S.rightPanel}>

          {/* Manuscript header */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>O Manuscrito</span>
            <span style={{ fontSize: 11, color: saveStatus === 'unsaved' ? 'var(--warn)' : saveStatus === 'saved' ? 'var(--positive)' : 'var(--ink-3)' }}>
              {saveStatus === 'idle' ? 'Sincronizado' : saveStatus === 'unsaved' ? 'Não salvo' : saveStatus === 'saving' ? 'Salvando…' : 'Salvo ✓'}
            </span>

            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 2, background: 'var(--field)', borderRadius: 6, padding: 3 }}>
              {(['read', 'edit', 'json'] as ResultMode[]).map(m => (
                <button key={m} onClick={() => setResultMode(m)}
                  style={{ padding: '4px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', background: resultMode === m ? 'var(--ink)' : 'transparent', color: resultMode === m ? 'var(--surface)' : 'var(--ink-3)', fontWeight: resultMode === m ? 600 : 400 }}>
                  {m === 'read' ? 'Leitura' : m === 'edit' ? 'Edição' : 'JSON'}
                </button>
              ))}
            </div>

            {/* Export buttons */}
            <div style={{ display: 'flex', gap: 5 }}>
              <button style={{ ...S.btn, fontSize: 11 }} onClick={() => { if (isEmpty) { toast('Nada para exportar.', 'error'); return; } download(`perfil_${slug()}.txt`, buildTxt(), 'text/plain'); toast('TXT exportado.', 'success'); }}>TXT</button>
              <button style={{ ...S.btn, fontSize: 11 }} onClick={() => { if (isEmpty) { toast('Nada para exportar.', 'error'); return; } download(`lattes_${slug()}.json`, JSON.stringify(activeProfile, null, 2), 'application/json'); toast('JSON exportado.', 'success'); }}>JSON</button>
              <button style={{ ...S.btn, fontSize: 11 }} onClick={() => { if (!currentUser) return; const url = `${window.location.origin}?p=${currentUser.uid}`; navigator.clipboard?.writeText(url); toast('Link copiado!', 'success'); }}>Compartilhar</button>
              <button style={{ ...S.btnAccent, fontSize: 11 }} onClick={saveProfile}>Salvar</button>
            </div>
          </div>

          {/* Manuscript content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
            {isEmpty && (
              <div style={{ textAlign: 'center', paddingTop: 60 }}>
                <p style={{ fontSize: 40, marginBottom: 16 }}>📄</p>
                <p style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--ink-2)', marginBottom: 8 }}>Nenhum dado ainda</p>
                <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Extraia um documento ou busque um pesquisador para começar.</p>
              </div>
            )}

            {/* READ MODE */}
            {!isEmpty && resultMode === 'read' && (
              <div style={{ maxWidth: 720, margin: '0 auto' }}>
                {/* Cover / Header */}
                <div style={{ marginBottom: 36, paddingBottom: 28, borderBottom: '2px solid var(--line)' }}>
                  <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 40, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 6 }}>
                    {activeProfile.personalInfo.fullName || 'Pesquisador'}
                  </h1>
                  {activeProfile.personalInfo.location && <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 12 }}>📍 {activeProfile.personalInfo.location}</p>}
                  {activeProfile.personalInfo.biography && <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.7 }}>{activeProfile.personalInfo.biography}</p>}
                </div>

                {/* Experience */}
                {activeProfile.experience.length > 0 && (
                  <Section title="Experiência Profissional">
                    {activeProfile.experience.map((e, i) => (
                      <div key={i} style={{ marginBottom: 16 }}>
                        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{e.role}</p>
                        <p style={{ fontSize: 12, color: 'var(--ink-2)' }}>{e.organization} · {e.startDate} — {e.endDate}</p>
                        {e.description && <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.6 }}>{e.description}</p>}
                      </div>
                    ))}
                  </Section>
                )}

                {/* Education */}
                {activeProfile.education.length > 0 && (
                  <Section title="Formação Acadêmica">
                    {activeProfile.education.map((e: any, i: number) => (
                      <div key={i} style={{ marginBottom: 12 }}>
                        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{e.degree}{e.fieldOfStudy ? ` em ${e.fieldOfStudy}` : ''}</p>
                        <p style={{ fontSize: 12, color: 'var(--ink-2)' }}>{e.institution} · {e.startYear || ''}–{e.endYear || ''}</p>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Publications */}
                {activeProfile.publications.length > 0 && (
                  <Section title={`Produção Bibliográfica (${activeProfile.publications.length})`}>
                    {activeProfile.publications.map((x, i) => (
                      <div key={i} style={{ marginBottom: 14, paddingLeft: 24, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, top: 0, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</span>
                        <p style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.4, marginBottom: 2 }}>"{x.title}"</p>
                        <p style={{ fontSize: 11, color: 'var(--ink-3)' }}>{x.authors && x.authors + ' · '}{x.venue && x.venue + ' · '}{x.year}</p>
                        {x.doi && <p style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>DOI: {x.doi}</p>}
                      </div>
                    ))}
                  </Section>
                )}

                {/* Certifications */}
                {activeProfile.certifications.length > 0 && (
                  <Section title="Certificações">
                    {activeProfile.certifications.map((c: any, i: number) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{c.name}</p>
                        <p style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.issuer}{c.year ? ` · ${c.year}` : ''}{c.hours ? ` · ${c.hours}h` : ''}</p>
                      </div>
                    ))}
                  </Section>
                )}

                {/* Languages & Skills */}
                {(activeProfile.languages.length > 0 || activeProfile.skills.length > 0) && (
                  <Section title="Idiomas & Competências">
                    {activeProfile.languages.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ ...S.label, marginBottom: 6 }}>Idiomas</p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {activeProfile.languages.map((l: any, i: number) => (
                            <span key={i} style={{ padding: '3px 10px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 4, fontSize: 12 }}>{l.language} — {l.proficiency}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {activeProfile.skills.length > 0 && (
                      <div>
                        <p style={{ ...S.label, marginBottom: 6 }}>Competências</p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {activeProfile.skills.map((sk, i) => (
                            <span key={i} style={{ padding: '3px 10px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 4, fontSize: 12 }}>{sk}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </Section>
                )}
              </div>
            )}

            {/* EDIT MODE */}
            {!isEmpty && resultMode === 'edit' && (
              <div style={{ maxWidth: 720, margin: '0 auto' }}>
                {/* Edit tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
                  {([['personal', 'Pessoal'], ['experience', 'Experiência'], ['publications', 'Publicações'], ['education', 'Formação'], ['certifications', 'Certificações'], ['langskills', 'Idiomas & Skills']] as [EditCategory, string][]).map(([k, l]) => (
                    <button key={k} onClick={() => setEditCategory(k)}
                      style={{ padding: '6px 12px', fontSize: 12, borderRadius: 5, border: `1px solid ${editCategory === k ? 'var(--ink)' : 'var(--line)'}`, background: editCategory === k ? 'var(--ink)' : 'var(--surface)', color: editCategory === k ? 'var(--surface)' : 'var(--ink-2)', cursor: 'pointer', fontWeight: editCategory === k ? 600 : 400 }}>
                      {l}
                    </button>
                  ))}
                </div>

                {editCategory === 'personal' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Field label="Nome completo"><input style={S.input} value={activeProfile.personalInfo.fullName} onChange={e => patchPersonal('fullName', e.target.value)} /></Field>
                    <Field label="Localização"><input style={S.input} value={activeProfile.personalInfo.location} onChange={e => patchPersonal('location', e.target.value)} /></Field>
                    <Field label="Biografia">
                      <textarea style={S.textarea} rows={5} value={activeProfile.personalInfo.biography} onChange={e => patchPersonal('biography', e.target.value)} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button style={{ ...S.btn, fontSize: 11 }} onClick={suggestBio}>{bioSuggesting ? 'Gerando…' : 'Sugerir com IA'}</button>
                      </div>
                      {bioSuggestion && (
                        <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 6 }}>
                          <p style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 8 }}>{bioSuggestion}</p>
                          <button style={{ ...S.btnAccent, fontSize: 11 }} onClick={applyBio}>Aplicar sugestão</button>
                        </div>
                      )}
                    </Field>
                  </div>
                )}

                {editCategory === 'experience' && (
                  <div>
                    {activeProfile.experience.map((e, i) => (
                      <EditCard key={i} onRemove={() => removeRow('experience', i)}>
                        <Field label="Cargo"><input style={S.input} value={e.role} onChange={ev => patchArray('experience', i, 'role', ev.target.value)} /></Field>
                        <Field label="Organização"><input style={S.input} value={e.organization} onChange={ev => patchArray('experience', i, 'organization', ev.target.value)} /></Field>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <Field label="Início"><input style={S.input} value={e.startDate} onChange={ev => patchArray('experience', i, 'startDate', ev.target.value)} /></Field>
                          <Field label="Fim"><input style={S.input} value={e.endDate} onChange={ev => patchArray('experience', i, 'endDate', ev.target.value)} /></Field>
                        </div>
                        <Field label="Descrição"><textarea style={S.textarea} value={e.description} onChange={ev => patchArray('experience', i, 'description', ev.target.value)} /></Field>
                      </EditCard>
                    ))}
                    <button style={{ ...S.btn, fontSize: 12 }} onClick={() => addRow('experience', { role: '', organization: '', startDate: '', endDate: 'Atual', description: '' })}>+ Adicionar experiência</button>
                  </div>
                )}

                {editCategory === 'publications' && (
                  <div>
                    {activeProfile.publications.map((x, i) => (
                      <EditCard key={i} onRemove={() => removeRow('publications', i)}>
                        <Field label="Título"><input style={S.input} value={x.title} onChange={ev => patchArray('publications', i, 'title', ev.target.value)} /></Field>
                        <Field label="Periódico / Evento"><input style={S.input} value={x.venue || ''} onChange={ev => patchArray('publications', i, 'venue', ev.target.value)} /></Field>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <Field label="Ano"><input style={S.input} value={x.year} onChange={ev => patchArray('publications', i, 'year', ev.target.value)} /></Field>
                          <Field label="DOI"><input style={S.input} value={x.doi || ''} onChange={ev => patchArray('publications', i, 'doi', ev.target.value)} /></Field>
                        </div>
                      </EditCard>
                    ))}
                    <button style={{ ...S.btn, fontSize: 12 }} onClick={() => addRow('publications', { title: '', venue: '', authors: '', year: '', doi: '' })}>+ Adicionar publicação</button>
                  </div>
                )}

                {editCategory === 'education' && (
                  <div>
                    {activeProfile.education.map((e: any, i: number) => (
                      <EditCard key={i} onRemove={() => removeRow('education', i)}>
                        <Field label="Grau"><input style={S.input} value={e.degree} onChange={ev => patchArray('education', i, 'degree', ev.target.value)} /></Field>
                        <Field label="Área"><input style={S.input} value={e.fieldOfStudy || ''} onChange={ev => patchArray('education', i, 'fieldOfStudy', ev.target.value)} /></Field>
                        <Field label="Instituição"><input style={S.input} value={e.institution} onChange={ev => patchArray('education', i, 'institution', ev.target.value)} /></Field>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <Field label="Início"><input style={S.input} value={e.startYear} onChange={ev => patchArray('education', i, 'startYear', ev.target.value)} /></Field>
                          <Field label="Fim"><input style={S.input} value={e.endYear} onChange={ev => patchArray('education', i, 'endYear', ev.target.value)} /></Field>
                        </div>
                      </EditCard>
                    ))}
                    <button style={{ ...S.btn, fontSize: 12 }} onClick={() => addRow('education', { degree: 'Graduação', institution: '', fieldOfStudy: '', startYear: '', endYear: '', status: 'Em andamento' })}>+ Adicionar formação</button>
                  </div>
                )}

                {editCategory === 'certifications' && (
                  <div>
                    {activeProfile.certifications.map((c: any, i: number) => (
                      <EditCard key={i} onRemove={() => removeRow('certifications', i)}>
                        <Field label="Nome"><input style={S.input} value={c.name} onChange={ev => patchArray('certifications', i, 'name', ev.target.value)} /></Field>
                        <Field label="Emissor"><input style={S.input} value={c.issuer} onChange={ev => patchArray('certifications', i, 'issuer', ev.target.value)} /></Field>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <Field label="Ano"><input style={S.input} value={c.year || ''} onChange={ev => patchArray('certifications', i, 'year', ev.target.value)} /></Field>
                          <Field label="Carga horária"><input style={S.input} value={c.hours || ''} onChange={ev => patchArray('certifications', i, 'hours', ev.target.value)} /></Field>
                        </div>
                      </EditCard>
                    ))}
                    <button style={{ ...S.btn, fontSize: 12 }} onClick={() => addRow('certifications', { name: '', issuer: '', hours: '', year: '' })}>+ Adicionar certificação</button>
                  </div>
                )}

                {editCategory === 'langskills' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <p style={{ ...S.label, marginBottom: 10 }}>Idiomas</p>
                      {activeProfile.languages.map((l: any, i: number) => (
                        <EditCard key={i} onRemove={() => removeRow('languages', i)}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <Field label="Idioma"><input style={S.input} value={l.language} onChange={ev => patchArray('languages', i, 'language', ev.target.value)} /></Field>
                            <Field label="Nível"><input style={S.input} value={l.proficiency} onChange={ev => patchArray('languages', i, 'proficiency', ev.target.value)} /></Field>
                          </div>
                        </EditCard>
                      ))}
                      <button style={{ ...S.btn, fontSize: 12 }} onClick={() => addRow('languages', { language: '', proficiency: 'Intermediário' })}>+ Adicionar idioma</button>
                    </div>

                    <div>
                      <p style={{ ...S.label, marginBottom: 10 }}>Competências</p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        {activeProfile.skills.map((sk, i) => (
                          <span key={i} style={{ padding: '4px 10px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 20, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                            {sk}
                            <button style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }} onClick={() => removeSkill(sk)}>×</button>
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input style={S.input} placeholder="Nova competência…" value={newSkill}
                          onChange={e => setNewSkill(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSkill()} />
                        <button style={{ ...S.btn, flexShrink: 0 }} onClick={addSkill}>+ Adicionar</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* JSON MODE */}
            {!isEmpty && resultMode === 'json' && (
              <div style={{ maxWidth: 720, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                  <button style={{ ...S.btn, fontSize: 11 }} onClick={() => { navigator.clipboard?.writeText(JSON.stringify(activeProfile, null, 2)); setJsonCopied(true); setTimeout(() => setJsonCopied(false), 1800); }}>
                    {jsonCopied ? 'Copiado ✓' : 'Copiar JSON'}
                  </button>
                </div>
                <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: 20, overflowX: 'auto', lineHeight: 1.6 }}>
                  {JSON.stringify(activeProfile, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast notifications */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 }}>
        {toasts.map(t => (
          <div key={t.id} style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--surface)', border: `1px solid ${t.kind === 'success' ? 'var(--positive)' : t.kind === 'error' ? 'var(--accent)' : 'var(--line)'}`, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 14, flexShrink: 0, color: t.kind === 'success' ? 'var(--positive)' : t.kind === 'error' ? 'var(--accent)' : 'var(--ink-3)' }}>
              {t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : 'ℹ'}
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 2 }}>
                {t.kind === 'success' ? 'Sucesso' : t.kind === 'error' ? 'Atenção' : 'Notificação'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.4 }}>{t.message}</p>
            </div>
            <button style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Small layout components ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 5 }}>{label}</p>
      {children}
    </div>
  );
}

function EditCard({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '14px', marginBottom: 12, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {children}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }} onClick={onRemove}>Remover</button>
      </div>
    </div>
  );
}
