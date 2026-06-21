import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchLattesProfile } from '../src/lib/gemini.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const { researcherName } = req.body || {};
  if (!researcherName || researcherName.trim().length === 0) {
    return res.status(400).json({ error: 'O nome do pesquisador é obrigatório.' });
  }

  try {
    const data = await searchLattesProfile(researcherName);
    return res.json(data);
  } catch (error: any) {
    console.error('[api/search-lattes]', error);
    return res.status(550).json({ error: 'Falha ao buscar currículo Lattes público.', details: error.message });
  }
}
