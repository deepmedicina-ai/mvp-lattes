/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signOut, 
  User,
  signInWithPopup,
  GoogleAuthProvider
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
  serverTimestamp 
} from 'firebase/firestore';
import { auth, db, OperationType, handleFirestoreError } from './firebase';
import { 
  UserFile, 
  AcademicProfile, 
  ChatMessage, 
  CareerPersona 
} from './types';
import LoginScreen from './components/LoginScreen';
import UploadDashboard from './components/UploadDashboard';
import ResultPanel from './components/ResultPanel';
import CoachTutor from './components/CoachTutor';
import ActivityChart from './components/ActivityChart';
import { 
  GraduationCap, 
  LogOut, 
  User as UserIcon, 
  Loader2, 
  BrainCircuit, 
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle,
  X,
  Sun,
  Moon,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Estados dos Dados do Usuário Persistidos no Firestore
  const [files, setFiles] = useState<UserFile[]>([]);
  const [careerPersona, setCareerPersona] = useState<CareerPersona>('aprendiz');
  const [targetJob, setTargetJob] = useState('Cientista de Dados');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeProfile, setActiveProfile] = useState<AcademicProfile>({
    personalInfo: { fullName: '', biography: '', location: '' },
    education: [],
    certifications: [],
    experience: [],
    publications: [],
    languages: [],
    skills: []
  });

  const [selectedFileId, setSelectedFileId] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [driveToken, setDriveToken] = useState<string | null>(null);

  // Estados de Tema de Acessibilidade
  const [theme, setTheme] = useState<'dark' | 'light' | 'high-contrast'>(() => {
    return (localStorage.getItem('mvp-lattes-theme') as 'dark' | 'light' | 'high-contrast') || 'dark';
  });

  const toggleTheme = (newTheme: 'dark' | 'light' | 'high-contrast') => {
    setTheme(newTheme);
    localStorage.setItem('mvp-lattes-theme', newTheme);
  };

  // Sistema de Notificações Toast do MVP-Lattes
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto remove após 4.5 segundos
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  // Estados dos Perfis Públicos Compartilhados
  const [publicProfileId, setPublicProfileId] = useState<string | null>(null);
  const [publicProfileData, setPublicProfileData] = useState<AcademicProfile | null>(null);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicError, setPublicError] = useState('');

  // 0. Verifica se há parâmetro 'p' na URL para visualizar perfil público
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pId = params.get('p');
    if (pId) {
      setPublicProfileId(pId);
      setPublicLoading(true);
      setPublicError('');
      
      const docRef = doc(db, 'public_profiles', pId);
      getDoc(docRef)
        .then((docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.academicProfile) {
              setPublicProfileData(data.academicProfile);
            } else {
              setPublicError('O perfil público foi criado de forma incompleta.');
            }
          } else {
            setPublicError('Currículo público não encontrado. O link pode ter sido desativado pelo usuário.');
          }
        })
        .catch((err) => {
          console.error('Erro ao buscar perfil público no Firestore:', err);
          handleFirestoreError(err, OperationType.GET, `public_profiles/${pId}`);
          setPublicError('Ocorreu um erro ao carregar o currículo público compartilhado.');
        })
        .finally(() => {
          setPublicLoading(false);
        });
    }
  }, []);

  // 1. Escuta o estado de autenticação do Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Escuta os dados do usuário em tempo real do Firestore ao logar
  useEffect(() => {
    if (!currentUser) {
      setFiles([]);
      setMessages([]);
      return;
    }

    const userId = currentUser.uid;

    // A. Escuta arquivos em tempo real
    const filesQuery = query(
      collection(db, 'users', userId, 'files'),
      orderBy('uploadedAt', 'desc')
    );
    const unsubFiles = onSnapshot(filesQuery, (snapshot) => {
      const fileList: UserFile[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        fileList.push({
          id: docSnap.id,
          name: data.name || '',
          size: data.size || 0,
          type: data.type || '',
          uploadedAt: data.uploadedAt || serverTimestamp(),
          status: data.status || 'pending',
          extractedData: data.extractedData,
          error: data.error
        });
      });
      setFiles(fileList);

      // Se nenhum arquivo estiver selecionado, seleciona o mais recente concluído ou qualquer um
      if (fileList.length > 0) {
        const completedFile = fileList.find(f => f.status === 'completed');
        if (completedFile) {
          setActiveProfile(completedFile.extractedData!);
          setSelectedFileId(completedFile.id);
        } else if (!selectedFileId) {
          setSelectedFileId(fileList[0].id);
        }
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${userId}/files`);
    });

    // B. Recupera configurações do Perfil de Carreira
    const profileRef = doc(db, 'users', userId, 'profile', 'settings');
    getDoc(profileRef).then((docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.persona) setCareerPersona(data.persona as CareerPersona);
        if (data.targetJob) setTargetJob(data.targetJob);
        if (data.academicProfile) setActiveProfile(data.academicProfile);
      } else {
        // Inicializa perfil default se não existir
        setDoc(profileRef, {
          persona: 'aprendiz',
          targetJob: 'Cientista de Dados',
          academicProfile: activeProfile,
          updatedAt: serverTimestamp()
        }).catch((err) => {
          handleFirestoreError(err, OperationType.CREATE, `users/${userId}/profile/settings`);
        });
      }
    }).catch((err) => {
      handleFirestoreError(err, OperationType.GET, `users/${userId}/profile/settings`);
    });

    // C. Escuta conversas do Chat Coach
    const msgQuery = query(
      collection(db, 'users', userId, 'messages'),
      orderBy('timestamp', 'asc')
    );
    const unsubMsgs = onSnapshot(msgQuery, (snapshot) => {
      const msgList: ChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        msgList.push({
          id: docSnap.id,
          sender: data.sender || 'assistant',
          text: data.text || '',
          timestamp: data.timestamp
        });
      });
      setMessages(msgList);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${userId}/messages`);
    });

    return () => {
      unsubFiles();
      unsubMsgs();
    };
  }, [currentUser]);

  // Handler para Deslogar
  const handleSignOut = async () => {
    await signOut(auth);
  };

  // 3. Funções de Manipulação do Repositório de Arquivos (Universal Receptor)
  const handleAddFile = async (newFileData: Omit<UserFile, 'id' | 'uploadedAt' | 'status'>): Promise<string> => {
    if (!currentUser) throw new Error('Não há usuário logado.');

    const userId = currentUser.uid;
    try {
      const docRef = await addDoc(collection(db, 'users', userId, 'files'), {
        ...newFileData,
        uploadedAt: serverTimestamp(),
        status: 'pending'
      });

      return docRef.id;
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, `users/${userId}/files`);
      throw err;
    }
  };

  const handleRemoveFile = async (id: string) => {
    if (!currentUser) return;
    const userId = currentUser.uid;
    try {
      await deleteDoc(doc(db, 'users', userId, 'files', id));
      if (selectedFileId === id) {
        setSelectedFileId('');
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}/files/${id}`);
      setGeneralError('Não foi possível remover o arquivo.');
    }
  };

  const handleSelectFile = (file: UserFile) => {
    setSelectedFileId(file.id);
    if (file.extractedData) {
      setActiveProfile(file.extractedData);
    }
  };

  // 4. Integração do Processamento com o backend Express + Gemini API (/api/extract)
  const handleProcessFile = async (id: string, base64: string, mimeType: string, name: string) => {
    if (!currentUser) return;

    const userId = currentUser.uid;
    const fileDocRef = doc(db, 'users', userId, 'files', id);

    // Atualiza status local para 'processing'
    try {
      await updateDoc(fileDocRef, { status: 'processing' });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/files/${id}`);
      return;
    }

    try {
      // Faz o POST seguro na Rota de API do nosso backend Express
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType,
          fileName: name
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Erro na extração de dados.');
      }

      const extractedProfile: AcademicProfile = await res.json();

      // Grava os dados extraídos retornados pelo Gemini no documento do arquivo no Firestore
      try {
        await updateDoc(fileDocRef, {
          status: 'completed',
          extractedData: extractedProfile
        });
      } catch (fErr: any) {
        handleFirestoreError(fErr, OperationType.UPDATE, `users/${userId}/files/${id}`);
      }

      // Define como Perfil Ativo imediatamente para o usuário usá-lo ou salvá-lo
      setActiveProfile(extractedProfile);
      
      // Atualiza também o perfil unificado do usuário
      try {
        const profileSettingsRef = doc(db, 'users', userId, 'profile', 'settings');
        await updateDoc(profileSettingsRef, {
          academicProfile: extractedProfile,
          updatedAt: serverTimestamp()
        });
      } catch (pErr: any) {
        handleFirestoreError(pErr, OperationType.UPDATE, `users/${userId}/profile/settings`);
      }

      showToast(`Dados de "${name}" extraídos com sucesso pelo Gemini!`, 'success');

    } catch (err: any) {
      console.error('Falha no processamento pelo Gemini:', err);
      try {
        await updateDoc(fileDocRef, {
          status: 'failed',
          error: err.message || 'Erro desconhecido.'
        });
      } catch (fErr: any) {
        handleFirestoreError(fErr, OperationType.UPDATE, `users/${userId}/files/${id}`);
      }
      setGeneralError(`Extração de "${name}" falhou: ${err.message || 'Erro no servidor'}`);
      setTimeout(() => setGeneralError(''), 5000);
      showToast(`Falha na extração do arquivo "${name}": ${err.message || 'Erro no servidor'}`, 'error');
    }
  };

  // 5. Salva as edições do formulário no Perfil de Carreira Geral
  const handleSaveAcademicProfile = async (updatedProfile: AcademicProfile) => {
    if (!currentUser) return;
    const userId = currentUser.uid;

    try {
      // Grava no perfil geral
      const profileSettingsRef = doc(db, 'users', userId, 'profile', 'settings');
      try {
        await updateDoc(profileSettingsRef, {
          academicProfile: updatedProfile,
          updatedAt: serverTimestamp()
        });
      } catch (pErr: any) {
        handleFirestoreError(pErr, OperationType.UPDATE, `users/${userId}/profile/settings`);
      }

      // E se tiver um arquivo associado selecionado, atualiza ele também para persistir as edições sincronizadas
      if (selectedFileId) {
        const fileDocRef = doc(db, 'users', userId, 'files', selectedFileId);
        let docSnap;
        try {
          docSnap = await getDoc(fileDocRef);
        } catch (gErr: any) {
          handleFirestoreError(gErr, OperationType.GET, `users/${userId}/files/${selectedFileId}`);
        }
        if (docSnap && docSnap.exists() && docSnap.data().status === 'completed') {
          try {
            await updateDoc(fileDocRef, {
              extractedData: updatedProfile
            });
          } catch (uErr: any) {
            handleFirestoreError(uErr, OperationType.UPDATE, `users/${userId}/files/${selectedFileId}`);
          }
        }
      }

      setActiveProfile(updatedProfile);
      showToast('Perfil acadêmico salvo com sucesso no Firestore!', 'success');
    } catch (err: any) {
      console.error(err);
      showToast('Falha ao salvar as edições do perfil acadêmico.', 'error');
      throw new Error('Erro ao salvar edições no Firestore.');
    }
  };

  const handleImportProfile = async (importedProfile: AcademicProfile) => {
    setActiveProfile(importedProfile);
    if (!currentUser) return;
    const userId = currentUser.uid;
    try {
      const profileSettingsRef = doc(db, 'users', userId, 'profile', 'settings');
      await updateDoc(profileSettingsRef, {
        academicProfile: importedProfile,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      console.error('Erro ao atualizar perfil importado do Lattes:', err);
    }
  };

  // 6. Atualização de Persona e Metas de Carreira no Firestore
  const handlePersonaChange = async (newPersona: CareerPersona) => {
    setCareerPersona(newPersona);
    if (!currentUser) return;
    const userId = currentUser.uid;
    const profileSettingsRef = doc(db, 'users', userId, 'profile', 'settings');
    try {
      await updateDoc(profileSettingsRef, { 
        persona: newPersona,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/profile/settings`);
    }
  };

  const handleTargetJobChange = async (newJob: string) => {
    setTargetJob(newJob);
    if (!currentUser) return;
    const userId = currentUser.uid;
    const profileSettingsRef = doc(db, 'users', userId, 'profile', 'settings');
    try {
      await updateDoc(profileSettingsRef, { 
        targetJob: newJob,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}/profile/settings`);
    }
  };

  // 7. Envio de Mensagem para o Career Coach (/api/chat) com proteção de chave no backend
  const handleSendChatMessage = async (text: string) => {
    if (!currentUser) return;
    const userId = currentUser.uid;
    setChatLoading(true);

    try {
      // 1. Grava no Firestore a mensagem de usuário
      try {
        await addDoc(collection(db, 'users', userId, 'messages'), {
          sender: 'user',
          text,
          timestamp: serverTimestamp()
        });
      } catch (err: any) {
        handleFirestoreError(err, OperationType.CREATE, `users/${userId}/messages`);
      }

      // Cria histórico local atualizado de mensagens para passar ao backend Express
      const updatedMessages = [
        ...messages,
        { id: 'temp-user', sender: 'user' as const, text, timestamp: new Date() }
      ];

      // 2. Chama backend Express
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: updatedMessages,
          persona: careerPersona,
          targetJob: targetJob,
          academicProfile: activeProfile
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Falha na resposta do Coach.');
      }

      const resData = await res.json();
      const botText = resData.response;

      // 3. Grava resposta do Coach Assistente no Firestore
      try {
        await addDoc(collection(db, 'users', userId, 'messages'), {
          sender: 'assistant',
          text: botText,
          timestamp: serverTimestamp()
        });
      } catch (err: any) {
        handleFirestoreError(err, OperationType.CREATE, `users/${userId}/messages`);
      }

    } catch (err: any) {
      console.error(err);
      // Fallback em caso de erro no backend para manter usabilidade
      try {
        await addDoc(collection(db, 'users', userId, 'messages'), {
          sender: 'assistant',
          text: `⚠️ Desculpe, não consegui me conectar ao serviço de tutoria da IA para dar o feedback: ${err.message || 'Verifique sua conexão ou variáveis de ambiente.'}`,
          timestamp: serverTimestamp()
        });
      } catch (fErr: any) {
        handleFirestoreError(fErr, OperationType.CREATE, `users/${userId}/messages`);
      }
    } finally {
      setChatLoading(false);
    }
  };

  // Renderiza tela de carregamento inicial
  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-350">
        <Loader2 className="w-10 h-10 animate-spin text-teal-400 mb-3" />
        <p className="text-sm font-medium">Carregando MVP-Lattes...</p>
      </div>
    );
  }

  // Se houver ID de perfil público compartilhado na URL, processa a visualização pública
  if (publicProfileId) {
    if (publicLoading) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-350">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-400 mb-3" />
          <p className="text-sm font-medium">Buscando perfil acadêmico compartilhado...</p>
        </div>
      );
    }

    if (publicError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md space-y-4">
            <span className="text-4xl">🔍</span>
            <h2 className="text-lg font-black text-slate-200">Acesso Restrito ou Perfil Inexistente</h2>
            <p className="text-xs text-slate-400 leading-relaxed">{publicError}</p>
            <button
              onClick={() => {
                setPublicProfileId(null);
                setPublicProfileData(null);
                setPublicError('');
                window.history.pushState({}, '', window.location.pathname);
              }}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
            >
              Criar meu Currículo Lattes
            </button>
          </div>
        </div>
      );
    }

    if (publicProfileData) {
      return (
        <div id="app-root" className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white theme-${theme}`}>
          <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
            <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-400 to-indigo-500 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
                    MVP-Lattes <span className="text-[9px] bg-indigo-550 bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold font-mono">Compartilhado</span>
                  </h1>
                  <p className="text-xs text-slate-400">Currículo acadêmico estruturado e verificado por IA</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Seletor de Tema Compacto para Acessibilidade */}
                <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 shrink-0">
                  <button
                    onClick={() => toggleTheme('light')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${theme === 'light' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    title="Tema Claro"
                  >
                    <Sun className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => toggleTheme('dark')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${theme === 'dark' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    title="Tema Escuro"
                  >
                    <Moon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => toggleTheme('high-contrast')}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${theme === 'high-contrast' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    title="Alto Contraste"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => {
                    setPublicProfileId(null);
                    setPublicProfileData(null);
                    window.history.pushState({}, '', window.location.pathname);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors cursor-pointer shadow-md shrink-0"
                >
                  Voltar / Criar Meu Currículo
                </button>
              </div>
            </div>
          </header>
          <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6">
            <ResultPanel
              initialProfile={publicProfileData}
              onSave={async () => {}}
              isReadOnly={true}
              targetJob={targetJob}
              showToast={showToast}
            />
          </main>
          <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-slate-600 text-xs mt-12">
            <p>© 2026 MVP-Lattes SaaS. Desenvolvido com segurança com Google GenAI (Gemini) e Firebase.</p>
          </footer>
        </div>
      );
    }
  }

  // Se não estiver logado, foca na tela de Login/Cadastro
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={() => {}} />;
  }

  return (
    <div id="app-root" className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-slate-950 theme-${theme}`}>
      
      {/* Header / Barra Superior */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-55 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-400 to-indigo-500 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-100 tracking-tight">MVP-Lattes</h1>
                <span className="text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/30 px-2 py-0.5 rounded-full font-semibold">SaaS MVP</span>
              </div>
              <p className="text-xs text-slate-400">Automatização de Atividades Acadêmicas & Coaching com IA</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Seletor de Tema para Acessibilidade */}
            <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1">
              <button
                onClick={() => toggleTheme('light')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${theme === 'light' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                title="Visual Claro"
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => toggleTheme('dark')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${theme === 'dark' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                title="Visual Escuro"
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => toggleTheme('high-contrast')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${theme === 'high-contrast' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                title="Alto Contraste Acessível (Preto & Verde)"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800/80 rounded-lg px-3 py-1.5">
              <UserIcon className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-xs text-slate-300 font-mono truncate max-w-[160px]" title={currentUser.email || ''}>
                {currentUser.email}
              </span>
            </div>

            <button
              id="header-logout-btn"
              onClick={handleSignOut}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-slate-800 hover:border-rose-500/20"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        
        {generalError && (
          <motion.div 
            id="workspace-error-toast"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2.5"
          >
            <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping shrink-0" />
            <span>{generalError}</span>
          </motion.div>
        )}

        {/* Dashboard / Workspace Layout split into multi-panel view */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Lado Esquerdo: Uploads de Certificados e Tutor lateral */}
          <div className="lg:col-span-4 space-y-6">
            
            {/*receptor universal */}
            <UploadDashboard
              files={files}
              onAddFile={handleAddFile}
              onRemoveFile={handleRemoveFile}
              onSelectFile={handleSelectFile}
              onProcessFile={handleProcessFile}
              selectedFileId={selectedFileId}
              driveToken={driveToken}
              onSetDriveToken={setDriveToken}
              onImportProfile={handleImportProfile}
            />

            {/* Gráfico D3 de Atividades Acadêmicas */}
            <ActivityChart profile={activeProfile} />

            {/* career coach panel */}
            <CoachTutor
              messages={messages}
              persona={careerPersona}
              targetJob={targetJob}
              academicProfile={activeProfile}
              onChangePersona={handlePersonaChange}
              onChangeTargetJob={handleTargetJobChange}
              onSendMessage={handleSendChatMessage}
              loading={chatLoading}
            />

          </div>

          {/* Lado Direito: Editor Estruturado Lattes Larga */}
          <div className="lg:col-span-8 h-full">
            <ResultPanel
              initialProfile={activeProfile}
              onSave={handleSaveAcademicProfile}
              targetJob={targetJob}
              showToast={showToast}
            />
          </div>

        </div>

      </main>

      {/* Footer minimalista de base */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-slate-600 text-xs mt-12">
        <p>© 2026 MVP-Lattes SaaS. Desenvolvido com segurança com Google GenAI (Gemini) e Firebase.</p>
        <p className="mt-1 text-[10px] text-slate-700">Versão 1.1 - Extração estrita de certificados e modelagem estruturada em JSON.</p>
      </footer>

      {/* Toast Notifications System */}
      <div id="toast-container" className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              id={`toast-${toast.id}`}
              key={toast.id}
              initial={{ opacity: 0, y: 50, scale: 0.3 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={`p-4 rounded-2xl shadow-xl flex items-start gap-3 border pointer-events-auto backdrop-blur-md ${
                toast.type === 'success' 
                  ? 'bg-emerald-950/95 border-emerald-800 text-emerald-100' 
                  : toast.type === 'error' 
                  ? 'bg-rose-950/95 border-rose-800 text-rose-100' 
                  : 'bg-slate-900/95 border-slate-700 text-slate-100'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {toast.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : toast.type === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                ) : (
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                )}
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-0.5">
                  {toast.type === 'success' ? 'Sucesso' : toast.type === 'error' ? 'Falha ou Erro' : 'Notificação'}
                </p>
                <p className="text-xs font-semibold leading-relaxed font-sans">{toast.message}</p>
              </div>
              <button
                id={`toast-close-${toast.id}`}
                onClick={() => {
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                }}
                className="shrink-0 text-slate-400 hover:text-white p-0.5 rounded-lg hover:bg-slate-800/55 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </div>
  );
}
