import { GoogleGenAI } from '@google/genai';

export function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no servidor.');
  return new GoogleGenAI({ apiKey });
}

export async function extractAcademicData(fileBase64: string, mimeType: string): Promise<unknown> {
  const ai = getGenAIClient();
  const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, '');

  const prompt = `Você é um Arquiteto de Dados Acadêmicos especialista no Currículo Lattes brasileiro.
Sua missão é ler o documento fornecido (que pode ser um certificado, diploma, histórico acadêmico ou currículo antigo) e extrair os dados acadêmicos e profissionais estruturando-os rigorosamente no formato JSON abaixo.

DIRETRIZES DE EXTRAÇÃO:
1. Extraia o máximo de informações reais encontradas no documento. Nunca invente dados.
2. Formate as datas para anos de 4 dígitos sempre que possível.
3. Se um campo não for identificado no documento, mantenha-o com string vazia "" ou array vazio [].
4. "personalInfo.fullName": tente extrair o nome do estudante/profissional.
5. "personalInfo.biography": crie um pequeno parágrafo profissional/acadêmico elegante com base nas informações.
6. "education": liste graus acadêmicos. Defina "status" como 'Concluído', 'Em andamento' ou 'Incompleto'.
7. "certifications": liste cursos extracurriculares, workshops ou certificados.
8. "experience": liste experiências profissionais, estágios ou monitorias.
9. "publications": se houver, extraia publicações ou trabalhos de pesquisa.
10. "languages": idiomas com proficiência ('Básico', 'Intermediário', 'Avançado', 'Fluente').

Sua resposta DEVE ser estritamente o objeto JSON válido.

ESTRUTURA DO JSON:
{
  "personalInfo": { "fullName": "", "biography": "", "location": "" },
  "education": [{ "degree": "", "institution": "", "fieldOfStudy": "", "startYear": "", "endYear": "", "status": "Concluído" }],
  "certifications": [{ "name": "", "issuer": "", "hours": "", "year": "" }],
  "experience": [{ "role": "", "organization": "", "startDate": "", "endDate": "", "description": "" }],
  "publications": [{ "title": "", "venue": "", "authors": "", "year": "", "doi": "" }],
  "languages": [{ "language": "", "proficiency": "" }],
  "skills": []
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ inlineData: { data: cleanBase64, mimeType } }, prompt],
    config: { responseMimeType: 'application/json', temperature: 0.1 },
  });

  const text = response.text;
  if (!text) throw new Error('Resposta vazia da API do Gemini.');
  return JSON.parse(text.trim());
}

export async function chatWithCoach(
  messages: Array<{ sender: string; text: string }>,
  persona: string,
  targetJob: string,
  academicProfile: unknown
): Promise<string> {
  const ai = getGenAIClient();

  const personaMap: Record<string, string> = {
    aprendiz: `Você é um mentor especialista para estudantes iniciantes e aprendizes. Seu tom é inspirador, didático e motivador. Foque em como valorizar projetos práticos, trabalhos voluntários, cursos livres e soft skills.`,
    recem_formado: `Você é um consultor de carreira focado em recém-graduados que buscam cargos júnior ou trainee. Dê conselhos práticos de como evidenciar TCC, projetos de extensão, iniciação científica e estágios.`,
    transicao: `Você é um especialista em transição de carreira de alta performance. Foque em habilidades transferíveis e como enquadrar o histórico antigo de forma atraente para a nova vaga-alvo.`,
    senior: `Você é um headhunter e coach de executivos sênior. Tom altamente pragmático, estratégico e focado em métricas de impacto, liderança e contribuições de negócio reais.`,
  };

  const systemInstruction = `Você é o "Career Coach IA" integrado ao MVP-Lattes.
${personaMap[persona] || 'Você é um Career Coach e Arquiteto Acadêmico Lattes de alta performance.'}

CONTEXTO DO USUÁRIO:
- Vaga-alvo: "${targetJob || 'Não informada'}"
- Persona: "${persona || 'Geral'}"
- Currículo extraído: ${academicProfile ? JSON.stringify(academicProfile, null, 2) : 'Nenhum currículo enviado ainda.'}

DIRETRIZES:
1. Responda em Português do Brasil, amigável e objetivo. Use Markdown para organizar.
2. Dê conselhos acionáveis: cursos, certificações, como descrever conquistas.
3. Se perguntado sobre lacunas, compare "skills" e "experience" com a vaga "${targetJob || 'a definir'}".
4. Seja conciso — parágrafos curtos e impacto prático.`;

  const chatContents = messages.map((msg) => ({
    role: msg.sender === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }],
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: chatContents.length > 0 ? chatContents : [{ role: 'user', parts: [{ text: 'Olá!' }] }],
    config: { systemInstruction, temperature: 0.7 },
  });

  return response.text || 'Desculpe, não consegui processar uma resposta no momento.';
}

export async function searchLattesProfile(researcherName: string): Promise<unknown> {
  const ai = getGenAIClient();

  const prompt = `Você é um robô sênior de busca e extração de dados acadêmicos especializado na Plataforma Lattes CNPq do Brasil.
Use a busca do Google para localizar o Currículo Lattes público oficial do(a) pesquisador(a): "${researcherName}".
Extraia os dados biográficos, formação, publicações e atuação profissional reais. Nunca invente dados.

Retorne estritamente o JSON abaixo:
{
  "found": true,
  "lattesUrl": "",
  "researcherName": "",
  "profile": {
    "personalInfo": { "fullName": "", "biography": "", "location": "" },
    "education": [{ "degree": "", "institution": "", "fieldOfStudy": "", "startYear": "", "endYear": "", "status": "" }],
    "certifications": [],
    "experience": [{ "role": "", "organization": "", "startDate": "", "endDate": "", "description": "" }],
    "publications": [{ "title": "", "venue": "", "authors": "", "year": "", "doi": "" }],
    "languages": [],
    "skills": []
  }
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: prompt,
    config: { tools: [{ googleSearch: {} }], responseMimeType: 'application/json', temperature: 0.1 },
  });

  const text = response.text;
  if (!text) throw new Error('Lattes Search: Resposta do modelo vazia.');
  return JSON.parse(text.trim());
}

export async function suggestImprovements(text: string, type: string): Promise<string> {
  const ai = getGenAIClient();
  const typeLabel = type === 'biography' ? 'biografia acadêmica/pessoal' : 'descrição de atividade profissional/pesquisa';

  const prompt = `Você é um consultor sênior de escrita científica e formatação do Currículo Lattes CNPq.
Abaixo está o rascunho de um texto para a ${typeLabel}:
------------------
${text}
------------------

Reescreva-o tornando-o altamente profissional, elegante e acadêmico. Preserve estritamente a verdade dos fatos.
Responda apenas o texto melhorado, em português formal brasileiro, sem preâmbulos ou markdown extra.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: prompt,
    config: { temperature: 0.3 },
  });

  return response.text?.trim() || '';
}

export async function generateCover(targetJob: string, skills: string[]): Promise<string> {
  const ai = getGenAIClient();
  const skillsList = skills.slice(0, 5).join(', ') || 'Inovação Científica, Metodologia';

  const prompt = `Crie um design vetorial SVG elegante para servir como imagem de capa de perfil acadêmico para a posição de: "${targetJob || 'Pesquisador/Desenvolvedor'}".
Habilidades chave: "${skillsList}"

Requisitos:
1. viewBox="0 0 800 200", responsivo.
2. Gradientes abstratos modernos (azuis profundos, roxos, neon teal ou dourados elegantes).
3. Elementos gráficos: ondas fractais, constelações de nós, ou curvas de fluxo.
4. Escreva o cargo "${targetJob || 'Foco Profissional'}" integrado ao design com tipografia sans-serif elegante.
5. Elementos sutis de grid ou pontos digitais transmitindo inteligência analítica.
6. Responda APENAS o XML/SVG puro — inicie com "<svg" e termine com "</svg>". Sem markdown.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: prompt,
    config: { temperature: 0.4 },
  });

  let svg = response.text?.trim() || '';
  svg = svg.replace(/^```[a-zA-Z0-9]*\s*/g, '').replace(/\s*```$/g, '').trim();

  if (!svg.startsWith('<svg')) {
    svg = `<svg viewBox="0 0 800 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#3b82f6"/>
          <stop offset="100%" style="stop-color:#818cf8"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <text x="50" y="110" fill="#fff" font-family="sans-serif" font-size="28" font-weight="900">${(targetJob || 'Perfil Acadêmico').toUpperCase()}</text>
      <text x="50" y="145" fill="#93c5fd" font-family="monospace" font-size="12">LATTES AI POWERED PROFILE COVER</text>
    </svg>`;
  }

  return svg;
}

export async function recommendSkills(targetJob: string, currentSkills: string[]): Promise<unknown> {
  const ai = getGenAIClient();

  const prompt = `Analise a intenção de carreira de um acadêmico que deseja atuar como: "${targetJob || 'Cientista de Dados'}"
Habilidades atuais: "${currentSkills.join(', ') || 'Metodologias de Ensino, Escrita Científica'}"

Sugira de 4 a 5 novas competências estratégicas altamente valorizadas no mercado para esse cargo.
Para cada uma, forneça "skill" (nome), "reason" (justificativa de carreira) e "action" (plano de ação ou certificação).

Responda APENAS o JSON válido no formato:
{ "recommendations": [{ "skill": "", "reason": "", "action": "" }] }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: prompt,
    config: { temperature: 0.3 },
  });

  let raw = response.text?.trim() || '';
  raw = raw.replace(/^```[a-zA-Z0-9]*\s*/g, '').replace(/\s*```$/g, '').trim();
  return JSON.parse(raw);
}
