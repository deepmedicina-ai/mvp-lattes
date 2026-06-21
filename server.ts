/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

// Carrega variáveis de ambiente
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Configuração de limite de body para suportar arquivos em base64 grandes (PDF, imagens)
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));

// Inicializa a API do Google AI Studio se a chave estiver disponível
const getGenAIClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("ADVERTÊNCIA: GEMINI_API_KEY não está definida nas variáveis de ambiente!");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Endpoint para extrair dados acadêmicos de arquivos base64 (Imagens ou PDFs)
 * utilizando o modelo Gemini 2.5 Flash de forma segura no backend (Server-side)
 */
app.post('/api/extract', async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName } = req.body;

    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: 'Os parâmetros fileBase64 e mimeType são obrigatórios.' });
    }

    const ai = getGenAIClient();
    if (!ai) {
      return res.status(500).json({ error: 'Chave de API do Gemini não configurada no servidor.' });
    }

    // Limpa o cabeçalho base64 caso esteja presente (ex: data:application/pdf;base64,...)
    const cleanBase64 = fileBase64.replace(/^data:.*?;base64,/, '');

    const prompt = `Você é um Arquiteto de Dados Acadêmicos especialista no Currículo Lattes brasileiro.
Sua missão é ler o documento fornecido (que pode ser um certificado, diploma, histórico acadêmico ou currículo antigo) e extrair os dados acadêmicos e profissionais estruturando-os rigorosamente no formato JSON abaixo.

DIRETRIZES DE EXTRAÇÃO:
1. Extraia o máximo de informações reais encontradas no documento. Nunca invente dados.
2. Formate as datas para anos de 4 dígitos sempre que possível.
3. Se um campo não for identificado no documento, mantenha-o com string vazia "" ou array vazio [] nos moldes definidos, garantindo integridade de tipo.
4. "personalInfo.fullName": tente extrair o nome do estudante/profissional.
5. "personalInfo.biography": crie um pequeno parágrafo profissional/acadêmico elegante com base nas informações.
6. "education": liste graus acadêmicos (Graduação, Mestrado, Doutorado, Ensino Médio, Especialização). Defina "status" como 'Concluído', 'Em andamento' ou 'Incompleto' conforme indicado.
7. "certifications": liste cursos extracurriculares, workshops ou certificados de atividades variadas.
8. "experience": liste experiências profissionais, estágios ou monitorias.
9. "publications": se houver, extraia publicações ou trabalhos de pesquisa.
10. "languages": idiomas com proficiência ('Básico', 'Intermediário', 'Avançado', 'Fluente').

Sua resposta DEVE ser estritamente o objeto JSON, sem markdown de bloco extra (como \`\`\`json) se possível, ou retorne apenas JSON válido.

ESTRUTURA CONFIGURADA DO JSON RETORNADO:
{
  "personalInfo": {
    "fullName": "Nome Completo",
    "biography": "Biografia resumida elegante",
    "location": "Cidade/Estado ou País se detectado"
  },
  "education": [
    {
      "degree": "Tipo de grau (ex: Graduação, Especialização)",
      "institution": "Nome da Instituição",
      "fieldOfStudy": "Área de estudo ou curso",
      "startYear": "Ano de início",
      "endYear": "Ano de término ou 'Atual'",
      "status": "Concluído"
    }
  ],
  "certifications": [
    {
      "name": "Nome do curso/certificado",
      "issuer": "Instituição emissora",
      "hours": "Carga horária se houver, ex '40h'",
      "year": "Ano de emissão"
    }
  ],
  "experience": [
    {
      "role": "Cargo ou função",
      "organization": "Empresa ou Instituição",
      "startDate": "Ano de início",
      "endDate": "Ano de término ou 'Atual'",
      "description": "Breve sumário das atribuições"
    }
  ],
  "publications": [
    {
      "title": "Título do artigo/trabalho",
      "venue": "Revista, Conferência ou Evento",
      "authors": "Autores listados",
      "year": "Ano de publicação",
      "doi": "DOI se houver"
    }
  ],
  "languages": [
    {
      "language": "Idioma",
      "proficiency": "Intermediário"
    }
  ],
  "skills": ["Skill 1", "Skill 2"]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: cleanBase64,
            mimeType: mimeType
          }
        },
        prompt
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1 // Temperatura baixa para garantir estabilidade e rigidez na extração estruturada
      }
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error("Resposta vazia da API do Gemini.");
    }

    // Tenta fazer o parse para validar que é um JSON íntegro antes de retransmitir
    const jsonParsed = JSON.parse(outputText.trim());
    return res.json(jsonParsed);

  } catch (error: any) {
    console.error('Erro ao processar extração de arquivo no backend:', error);
    return res.status(500).json({
      error: 'Falha interna na extração pelo modelo de IA.',
      details: error.message || error
    });
  }
});

/**
 * Endpoint de Tutoria Lateral (Career Coach)
 * Recebe o contexto do perfil atual do usuário, sua persona escolhida, vaga-alvo
 * e o histórico do chat para gerar um feedback tático de alta qualidade.
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, persona, targetJob, academicProfile } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Formato de histórico de mensagens inválido.' });
    }

    const ai = getGenAIClient();
    if (!ai) {
      return res.status(500).json({ error: 'Chave de API do Gemini não configurada no servidor.' });
    }

    // Formata o histórico do chat para o Gemini
    // Mapeia mensagens para o formato de chat do SDK do GoogleGenAI
    const chatContents = messages.map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    // Constrói a instrução do sistema baseada na persona escolhida
    let personaGuideline = '';
    switch (persona) {
      case 'aprendiz':
        personaGuideline = `Você é um mentor especialista para estudantes iniciantes e aprendizes. Seu tom é inspirador, didático e motivador. Foque em indicar como eles podem valorizar projetos práticos, trabalhos voluntários, cursos livres e soft skills em seu currículo, compensando a falta de experiência oficial.`;
        break;
      case 'recem_formado':
        personaGuideline = `Você é um consultor de carreira focado em recém-graduados que buscam cargos júnior ou trainee. Dê conselhos práticos de como evidenciar o Trabalho de Conclusão de Curso (TCC), projetos de extensão universitária, iniciação científica e estágios. Ajude-os a adotar termos corporativos robustos.`;
        break;
      case 'transicao':
        personaGuideline = `Você é um especialista em transição de carreira de alta performance. Seu foco é ajudar profissionais de outras áreas a migrar de setor. Destaque habilidades transferíveis (metodologias, liderança, processos de negócios, resolução de problemas) e como enquadrar o histórico antigo de forma atraente para a nova vaga-alvo.`;
        break;
      case 'senior':
        personaGuideline = `Você é um headhunter e coach de executivos sênior. Seu tom é altamente pragmático, estratégico e focado em métricas de impacto, liderança técnica ou de pessoas, arquitetura de sistemas e contribuições de negócio reais.`;
        break;
      default:
        personaGuideline = `Você é um Career Coach e Arquiteto Acadêmico Lattes de alta performance. Seu papel é aconselhar o usuário de forma profissional, atrativa e ética.`;
    }

    const systemInstruction = `Você é o "Career Coach IA" integrado ao MVP-Lattes.
${personaGuideline}

INSTRUÇÕES DO CONTEXTO DO USUÁRIO:
- Vaga-alvo desejada: "${targetJob || 'Não informada'}"
- Persona atual: "${persona || 'Geral'}"

CONTEXTO DO CURRÍCULO EXTRAÍDO DO USUÁRIO ATÉ O MOMENTO (JSON format):
${academicProfile ? JSON.stringify(academicProfile, null, 2) : 'Nenhum currículo ou certificado enviado ou processado ainda.'}

DIRETRIZES DO ATENDIMENTO:
1. Responda em Português do Brasil de forma extremamente amigável, clara e objetiva. Use formatação em Markdown (sublinhados, tópicos, negrito) para tornar as dicas fáceis de ler.
2. Dê conselhos acionáveis de currículo, recomendando cursos, certificações específicas para a vaga-alvo e como descrever conquistas no Lattes ou LinkedIn.
3. Se o usuário perguntar o que falta no currículo dele para atingir a vaga-alvo, analise criticamente a seção "skills" e "experience" do currículo enviado acima e compare com as exigências tradicionais da vaga "${targetJob || 'a definir'}".
4. Seja conciso e evite respostas excessivamente longas desnecessárias, prezando por parágrafos curtos e impacto prático.`;

    // Realiza a chamada enviando a systemInstruction nas configurações do modelo
    const lastMessage = chatContents[chatContents.length - 1];
    
    // Podemos preparar o array de contents, incluindo a instrução de sistema ou passando nas configurações
    // Para simplificar e garantir a adesão às diretrizes, incluímos como instrução de sistema na chamada
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: chatContents.length > 0 ? chatContents : [{ role: 'user', parts: [{ text: 'Olá!' }] }],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7
      }
    });

    const assistantResponse = response.text || "Desculpe, não consegui processar uma resposta no momento.";
    return res.json({ response: assistantResponse });

  } catch (error: any) {
    console.error('Erro na rota de API de Chat do Career Coach:', error);
    return res.status(500).json({
      error: 'Falha ao processar o chat com o coach de carreira.',
      details: error.message || error
    });
  }
});

/**
 * Endpoint para buscar perfis públicos do Currículo Lattes via Google Search
 * e retornar os dados estruturados para preencher o perfil do usuário
 */
app.post('/api/search-lattes', async (req, res) => {
  try {
    const { researcherName } = req.body;

    if (!researcherName || researcherName.trim().length === 0) {
      return res.status(400).json({ error: 'O nome do pesquisador é obrigatório.' });
    }

    const ai = getGenAIClient();
    if (!ai) {
      return res.status(500).json({ error: 'Chave de API do Gemini não configurada no servidor.' });
    }

    const prompt = `Você é um robô sênior de busca e extração de dados acadêmicos especializado na Plataforma Lattes CNPq do Brasil.
Use a busca do Google para localizar o Currículo Lattes público oficial do(a) pesquisador(a) chamado(a): "${researcherName}".
Identifique os dados biográficos, as universidades pelas quais passou (formação), os artigos publicados e a atuação profissional (atividades).

Sua missão é extrair esses metadados reais, sem inventar nada, e retornar estritamente um objeto JSON com formato idêntico ao abaixo.
Caso uma lista ou campo esteja vazio, retorne-o como array ou string vazios.

FORMATO RETORNADO (Sua resposta DEVE ser apenas o JSON válido):
{
  "found": true,
  "lattesUrl": "Link completo do currículo Lattes encontrado (ex: http://lattes.cnpq.br/...)",
  "researcherName": "Nome extraído e verificado",
  "profile": {
    "personalInfo": {
      "fullName": "Nome Completo",
      "biography": "Biografia detalhada resumindo as conquistas principais encontradas na busca no Lattes",
      "location": "Local de atuação ou residência"
    },
    "education": [
      {
        "degree": "Tipo de grau (ex: Graduação, Mestrado, Doutorado, Especialização, Pós-Doutorado)",
        "institution": "Nome da Instituição",
        "fieldOfStudy": "Curso ou Área",
        "startYear": "Ano de início (ex: '2015')",
        "endYear": "Ano de término ou 'Atual'",
        "status": "Concluído"
      }
    ],
    "certifications": [
      {
        "name": "Nome da certificação ou prêmio",
        "issuer": "Emissor",
        "hours": "Carga horária ex: '40h'",
        "year": "Ano ex: '2020'"
      }
    ],
    "experience": [
      {
        "role": "Função ou Cargo",
        "organization": "Instituição ou Empresa",
        "startDate": "Ano de início",
        "endDate": "Ano de término ou 'Atual'",
        "description": "Atividades principais executadas"
      }
    ],
    "publications": [
      {
        "title": "Título oficial da publicação ou artigo",
        "venue": "Revista, Caderno ou Local de Publicação",
        "authors": "Lista de autores",
        "year": "Ano da publicação",
        "doi": "DOI se disponível"
      }
    ],
    "languages": [
      {
        "language": "Idioma",
        "proficiency": "Ex: Fluente, Avançado, Intermediário, Básico"
      }
    ],
    "skills": ["Skill 1", "Skill 2"]
  }
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error("Lattes Search: Resposta do modelo vazia.");
    }

    const data = JSON.parse(outputText.trim());
    return res.json(data);

  } catch (error: any) {
    console.error('Erro na extração de perfil Lattes por busca:', error);
    return res.status(550).json({
      error: 'Falha ao buscar currículo Lattes público ou processar dados.',
      details: error.message || error
    });
  }
});

/**
 * Endpoint para sugerir melhorias na escrita acadêmica
 * utilizando o modelo Gemini 3.5 Flash
 */
app.post('/api/suggest-improvements', async (req, res) => {
  try {
    const { text, type } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'O texto fornecido é obrigatório para melhoria.' });
    }

    const ai = getGenAIClient();
    if (!ai) {
      return res.status(500).json({ error: 'Chave de API do Gemini não configurada no servidor.' });
    }

    const typeLabel = type === 'biography' ? 'biografia acadêmica/pessoal' : 'descrição de atividade profissional/pesquisa';
    const prompt = `Você é um consultor sênior de escrita científica e formatação do Currículo Lattes CNPq.
Abaixo está o rascunho de um texto de um candidato para sua ${typeLabel}:
------------------
${text}
------------------

Reescreva esse texto para torná-lo altamente profissional, elegante, escolástico e acadêmico, usando termos técnicos adequados, voz ativa nas realizações, e preservando estritamente a verdade dos fatos fornecidos.
Sua resposta DEVE ser estritamente o texto melhorado pronto para ser colado, em português formal brasileiro, sem conversas adicionais, preâmbulos, comentários explicativos ou markdown extra. Caso queira sugerir apenas uma versão ideal, retorne apenas o texto da sugestão na primeira pessoa do singular ou voz passiva formal acadêmica.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        temperature: 0.3
      }
    });

    const suggestion = response.text?.trim() || '';
    return res.json({ suggestion });
  } catch (error: any) {
    console.error('Erro na rota de sugestão de melhorias:', error);
    return res.status(500).json({ error: 'Erro ao gerar sugestões do Gemini.', details: error.message });
  }
});

/**
 * Endpoint para gerar um SVG de capa personalizado baseado no perfil e cargo-alvo
 * usando o Gemini 3.5 Flash para desenhar padrões vetoriais modernos
 */
app.post('/api/generate-cover', async (req, res) => {
  try {
    const { targetJob, skills } = req.body;
    const skillsList = Array.isArray(skills) ? skills : [];

    const ai = getGenAIClient();
    if (!ai) {
      return res.status(500).json({ error: 'Chave de API do Gemini não configurada no servidor.' });
    }

    const prompt = `Crie um design vetorial SVG elegante e sofisticado para servir como imagem de capa (capa de perfil) para um candidato acadêmico que busca a posição de: "${targetJob || 'Pesquisador/Desenvolvedor'}".
Habilidades chave do usuário: "${skillsList.slice(0, 5).join(', ') || 'Inovação Científica, Metodologia'}"

O SVG deve obedecer aos seguintes requisitos estritos:
1. Ter viewBox="0 0 800 200" responsivo com proporção fixa e preencher o espaço de forma fluida.
2. Usar fundos e gradientes abstratos modernos (azuis profundos, roxos, toques de neon teal ou dourados elegantes, adequados tanto para visual light quanto dark de alta performance).
3. Conter elementos gráficos elegantes: ondas fractais de dados, constelações de conexões de nós, ou curvas de fluxo dinâmicas representando evolução acadêmica e tecnológica.
4. Escrever o cargo-alvo "${targetJob || 'Foco Profissional'}" discretamente integrada ao design no canto esquerdo ou direito em uma tipografia sans-serif elegante, limpa e com excelente legibilidade e taxa de contraste.
5. Inserir elementos de grid, bolhas ou pontos digitais sutis, transmitindo a atmosfera de inteligência analítica.
6. A resposta DEVE conter exclusivamente o código XML/SVG puro, sem qualquer markdown, sem blocos de código tipo \`\`\`xml ou \`\`\`svg, sem explicações extras. Deve iniciar precisamente com "<svg" e terminar com "</svg>".`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        temperature: 0.4
      }
    });

    let svgRaw = response.text?.trim() || '';
    
    // Higienização completa contra envelopes Markdown de código
    svgRaw = svgRaw.replace(/^```[a-zA-Z0-9]*\s*/g, '');
    svgRaw = svgRaw.replace(/\s*```$/g, '');
    svgRaw = svgRaw.trim();

    if (!svgRaw.startsWith('<svg')) {
      // Fallback estilizado caso ocorra algum problema de geração
      svgRaw = `<svg viewBox="0 0 800 200" xmlns="http://www.w3.org/2000/svg" style="background: linear-gradient(135deg, #1e1b4b 0%, #311042 100%);">
        <rect width="100%" height="100%" fill="url(#grad)" />
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#818cf8;stop-opacity:1" />
          </linearGradient>
        </defs>
        <text x="50" y="110" fill="#ffffff" font-family="'Space Grotesk', sans-serif" font-size="28" font-weight="900" letter-spacing="1">${(targetJob || 'Perfil Acadêmico').toUpperCase()}</text>
        <text x="50" y="145" fill="#93c5fd" font-family="'JetBrains Mono', sans-serif" font-size="12" font-weight="bold">LATTES AI POWERED PROFILE COVER</text>
      </svg>`;
    }

    return res.json({ svg: svgRaw });
  } catch (error: any) {
    console.error('Erro na rota de geração de capa:', error);
    return res.status(500).json({ error: 'Erro ao desenhar capa SVG personalizada.', details: error.message });
  }
});

/**
 * Endpoint para sugerir novas competências estratégicas baseadas no cargo alvo
 */
app.post('/api/recommend-skills', async (req, res) => {
  try {
    const { targetJob, currentSkills } = req.body;
    const skillsList = Array.isArray(currentSkills) ? currentSkills : [];

    const ai = getGenAIClient();
    if (!ai) {
      return res.status(500).json({ error: 'Chave de API do Gemini não configurada no servidor.' });
    }

    const prompt = `Analise a intenção de carreira profissional de um acadêmico/cientista que deseja atuar como: "${targetJob || 'Cientista de Dados'}"
Habilidades já dominadas por ele no momento: "${skillsList.join(', ') || 'Metodologias de Ensino, Escrita Científica'}"

Sua missão é sugerir exatamente de 4 a 5 novas competências estratégicas altamente valorizadas no mercado para esse cargo, com foco especial em transição saudável de carreira ou transposição de competências da academia para o ambiente corporativo se aplicável.
Para cada sugestão, forneça:
1. O nome exato da habilidade ("skill").
2. Uma justificativa orientada a carreira ("reason").
3. Um plano de ação imediato prático ou certificação ("action").

Sua resposta DEVE ser estritamente no formato de JSON, sem preâmbulos ou pós-textos. Não envelopes com blocos de código tipo \`\`\`json. Responda apenas o payload JSON estrito correspondente ao seguinte esquema:
{
  "recommendations": [
    {
      "skill": "Nome curto da Habilidade",
      "reason": "Por que é indispensável para o cargo alvo, conectando com as tendências reais de mercado.",
      "action": "Como desenvolver (indicar curso conhecido, leitura de livros, ou projeto prático simples)."
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        temperature: 0.3
      }
    });

    let rawJson = response.text?.trim() || '';
    rawJson = rawJson.replace(/^```[a-zA-Z0-9]*\s*/g, '');
    rawJson = rawJson.replace(/\s*```$/g, '');
    rawJson = rawJson.trim();

    const result = JSON.parse(rawJson);
    return res.json(result);
  } catch (error: any) {
    console.error('Erro na rota de recomendação de habilidades:', error);
    return res.status(500).json({ error: 'Não foi possível analisar competências mercadológicas.', details: error.message });
  }
});

// Configuração correspondente para servir o frontend React no ambiente de Container
// No modo de desenvolvimento, monta o middleware do Vite para Hot Module Replacement e compilação em tempo real
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    // Monta o middleware do Vite
    app.use(vite.middlewares);
  } else {
    // No modo de produção, serve arquivos estáticos gerados em /dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor Express rodando com sucesso no endereço http://localhost:${PORT}`);
  });
}

startServer();
