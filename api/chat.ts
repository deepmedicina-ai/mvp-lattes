import type { VercelRequest, VercelResponse } from '@vercel/node';
import { chatWithCoach } from '../src/lib/gemini.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const { messages, persona, targetJob, academicProfile } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Formato de histórico de mensagens inválido.' });
  }

  try {
    const response = await chatWithCoach(messages, persona, targetJob, academicProfile);
    return res.json({ response });
  } catch (error: any) {
    console.error('[api/chat]', error);
    return res.status(500).json({ error: 'Falha ao processar o chat com o coach de carreira.', details: error.message });
  }
}
