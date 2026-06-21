import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractAcademicData } from '../src/lib/gemini.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const { fileBase64, mimeType } = req.body || {};
  if (!fileBase64 || !mimeType) {
    return res.status(400).json({ error: 'Os parâmetros fileBase64 e mimeType são obrigatórios.' });
  }

  try {
    const data = await extractAcademicData(fileBase64, mimeType);
    return res.json(data);
  } catch (error: any) {
    console.error('[api/extract]', error);
    return res.status(500).json({ error: 'Falha interna na extração pelo modelo de IA.', details: error.message });
  }
}
