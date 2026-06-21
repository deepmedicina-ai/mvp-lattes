import type { VercelRequest, VercelResponse } from '@vercel/node';
import { recommendSkills } from '../src/lib/gemini.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const { targetJob, currentSkills } = req.body || {};
  const skillsList = Array.isArray(currentSkills) ? currentSkills : [];

  try {
    const result = await recommendSkills(targetJob, skillsList);
    return res.json(result);
  } catch (error: any) {
    console.error('[api/recommend-skills]', error);
    return res.status(500).json({ error: 'Não foi possível analisar competências mercadológicas.', details: error.message });
  }
}
