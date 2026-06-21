import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateCover } from '../src/lib/gemini.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const { targetJob, skills } = req.body || {};
  const skillsList = Array.isArray(skills) ? skills : [];

  try {
    const svg = await generateCover(targetJob, skillsList);
    return res.json({ svg });
  } catch (error: any) {
    console.error('[api/generate-cover]', error);
    return res.status(500).json({ error: 'Erro ao desenhar capa SVG personalizada.', details: error.message });
  }
}
