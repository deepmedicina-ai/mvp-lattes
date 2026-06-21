/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Award, BookOpen, Briefcase, GraduationCap, Percent } from 'lucide-react';
import { AcademicProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface ActivityChartProps {
  profile: AcademicProfile;
}

export default function ActivityChart({ profile }: ActivityChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const educationCount = profile.education?.length || 0;
  const publicationsCount = profile.publications?.length || 0;
  const certificationsCount = profile.certifications?.length || 0;
  const experienceCount = profile.experience?.length || 0;

  const total = educationCount + publicationsCount + certificationsCount + experienceCount;

  const data = [
    { name: 'Formações', count: educationCount, color: '#6366f1', icon: GraduationCap, label: 'Educação' },     // indigo-500
    { name: 'Publicações', count: publicationsCount, color: '#06b6d4', icon: BookOpen, label: 'Artigos' },      // cyan-500
    { name: 'Certificações', count: certificationsCount, color: '#10b981', icon: Award, label: 'Cursos' },     // emerald-500
    { name: 'Atividades', count: experienceCount, color: '#f59e0b', icon: Briefcase, label: 'Trabalho' }       // amber-550
  ];

  // Filtra itens com count > 0 para exibição ideal
  const chartData = data.filter(item => item.count > 0);

  // Calcula fatias para o gráfico de pizza SVG (D3-inspired Polar geometry)
  let accumulatedAngle = 0;
  const slices = chartData.map(item => {
    const percentage = total > 0 ? (item.count / total) : 0;
    const angle = percentage * 360;
    const startAngle = accumulatedAngle;
    const endAngle = accumulatedAngle + angle;
    accumulatedAngle = endAngle;
    return { ...item, startAngle, endAngle, percentage };
  });

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  const getArcPath = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
    // Caso de círculo completo para evitar bug de coordenada coincidente no SVG
    if (endAngle - startAngle >= 359.99) {
      return [
        "M", x, y - radius,
        "A", radius, radius, 0, 1, 1, x - 0.01, y - radius,
        "Z"
      ].join(" ");
    }
    
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
      "M", x, y,
      "L", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
      "Z"
    ].join(" ");
  };

  return (
    <div id="activity-chart-card" className="bg-white border-2 border-slate-200 rounded-3xl p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-xs font-black text-slate-800 tracking-widest uppercase flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
          Gráfico de Atividades Lattes (D3)
        </h3>
        <p className="text-[10px] text-slate-500 font-bold mt-0.5">
          Distribuição dos registros estruturados no perfil acadêmico.
        </p>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 px-4 border border-dashed border-slate-150 rounded-2xl bg-slate-50/50">
          <Percent className="w-8 h-8 text-slate-350 animate-bounce mb-2" />
          <p className="text-[10px] text-slate-450 uppercase font-black tracking-wider text-center">
            Sem dados acadêmicos extraídos para gerar gráficos no momento
          </p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Pizza SVG Render */}
          <div className="relative w-36 h-36 shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90">
              <circle cx="60" cy="60" r="50" fill="#f8fafc" />
              {slices.map((slice, idx) => {
                const path = getArcPath(60, 60, 48, slice.startAngle, slice.endAngle);
                const isHovered = hoveredIdx === idx;
                return (
                  <motion.path
                    id={`pie-slice-${idx}`}
                    key={slice.name}
                    d={path}
                    fill={slice.color}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ 
                      scale: isHovered ? 1.05 : 1, 
                      opacity: hoveredIdx === null || isHovered ? 1 : 0.65 
                    }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="cursor-pointer stroke-white stroke-2"
                  />
                );
              })}
              {/* Buraco no centro para estilo Donut elegante */}
              <circle cx="60" cy="60" r="24" fill="#ffffff" />
            </svg>

            {/* Texto centralizador no donut */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-black text-slate-900 leading-none">{total}</span>
              <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest leading-none mt-0.5">itens</span>
            </div>
          </div>

          {/* Legenda Dinâmica Interativa */}
          <div className="flex-1 space-y-2.5 w-full">
            {data.map((item, idx) => {
              const count = item.count;
              const percentage = total > 0 ? (count / total) * 100 : 0;
              const isHovered = hoveredIdx === chartData.findIndex(cd => cd.name === item.name);
              const ItemIcon = item.icon;

              return (
                <div 
                  key={item.name}
                  onMouseEnter={() => {
                    const cdIdx = chartData.findIndex(cd => cd.name === item.name);
                    if (cdIdx !== -1) setHoveredIdx(cdIdx);
                  }}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`flex items-center justify-between p-1.5 rounded-xl transition-all ${
                    isHovered ? 'bg-slate-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div 
                      className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: count > 0 ? item.color : '#e2e8f0' }}
                    >
                      <ItemIcon className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-wide truncate ${
                      count > 0 ? 'text-slate-800' : 'text-slate-400'
                    }`}>
                      {item.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                    <span className={`font-black ${count > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                      {count}
                    </span>
                    <span className="text-slate-350">|</span>
                    <span className="text-slate-500 font-bold min-w-[32px] text-right">
                      {percentage.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
