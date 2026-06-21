/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// User career persona
export type CareerPersona = 'aprendiz' | 'recem_formado' | 'transicao' | 'senior';

// Academic Profile for Lattes standard extraction
export interface AcademicProfile {
  personalInfo: {
    fullName: string;
    biography: string;
    location?: string;
  };
  education: Array<{
    degree: string; // Graduação, Mestrado, Doutorado, etc.
    institution: string;
    fieldOfStudy?: string;
    startYear: string;
    endYear: string;
    status: 'Concluído' | 'Em andamento' | 'Incompleto';
  }>;
  certifications: Array<{
    name: string; // Curso, workshop, certificado
    issuer: string;
    hours?: string;
    year: string;
  }>;
  experience: Array<{
    role: string;
    organization: string;
    startDate: string;
    endDate: string; // ou "Atual"
    description?: string;
  }>;
  publications: Array<{
    title: string;
    venue?: string; // Revista, Evento, Anais
    authors?: string;
    year: string;
    doi?: string;
  }>;
  languages: Array<{
    language: string;
    proficiency: 'Básico' | 'Intermediário' | 'Avançado' | 'Fluente';
  }>;
  skills: string[];
  coverImage?: string;
}

export interface UserFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: any; // Firestore Timestamp
  status: 'pending' | 'processing' | 'completed' | 'failed';
  extractedData?: AcademicProfile;
  error?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: any; // Timestamp or ISO string
}

export interface UserProfile {
  uid: string;
  email: string;
  persona: CareerPersona;
  targetJob: string;
  updatedAt: any;
}
