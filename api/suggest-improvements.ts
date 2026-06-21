import type { VercelRequest, VercelResponse } from '@vercel/node';
import { suggestImprovements } from '../src/lib/gemini.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const { text, type } = req.body || {};
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'O texto fornecido é obrigatório para melhoria.' });
  }

  try {
    const suggestion = await suggestImprovements(text, type);
    return res.json({ suggestion });
  } catch (error: any) {
    console.error('[api/suggest-improvements]', error);
    return res.status(500).json({ error: 'Erro ao gerar sugestões do Gemini.', details: error.message });
  }
}
