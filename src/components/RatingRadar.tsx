import React, { useId } from 'react';
import { RATING_DIMENSIONS, isRating } from '../lib/ratings';
import type { TeacherRatingDimensions } from '../types';

export function RatingRadar({ dimensions }: { dimensions: Partial<TeacherRatingDimensions> }) {
  const titleId = useId();
  const point = (index: number, radius: number) => {
    const angle = -Math.PI / 2 + index * Math.PI / 3;
    return [160 + Math.cos(angle) * radius, 152 + Math.sin(angle) * radius];
  };
  const polygon = (radius: number) => RATING_DIMENSIONS.map((_, i) => point(i, radius).join(',')).join(' ');
  const complete = RATING_DIMENSIONS.every(d => isRating(dimensions[d.key]));
  return <div className="rating-radar rounded-2xl border border-indigo-100 bg-indigo-50/30 p-2">
    <svg viewBox="0 0 320 308" className="block w-full max-w-md mx-auto" role="img" aria-labelledby={titleId}>
      <title id={titleId}>教师六维评分，越靠外分数越高。{RATING_DIMENSIONS.map(d => `${d.label}：${isRating(dimensions[d.key]) ? dimensions[d.key]!.toFixed(1) : '暂无数据'}`).join('，')}</title>
      {[1,2,3,4,5].map(level => <polygon key={level} points={polygon(level*19)} fill={level===5?'#eef2ff':'none'} stroke="#c7d2fe" strokeWidth="1" />).reverse()}
      {RATING_DIMENSIONS.map((d,i) => {
        const [x,y] = point(i,95);
        return <line key={d.key} x1="160" y1="152" x2={x} y2={y} stroke="#c7d2fe" />;
      })}
      {[1,2,3,4,5].map(level=><text key={level} x="165" y={155-level*19} fontSize="9" fill="#64748b">{level}</text>)}
      {complete && <polygon points={RATING_DIMENSIONS.map((d,i)=>point(i,dimensions[d.key]!*19).join(',')).join(' ')} fill="#6366f1" fillOpacity="0.22" stroke="#4f46e5" strokeWidth="2" />}
      {RATING_DIMENSIONS.map((d,i) => {
        const value = dimensions[d.key];
        const [x,y] = point(i,126);
        const [px,py] = point(i,isRating(value)?value*19:0);
        return <g key={d.key}>
          {isRating(value) && <circle cx={px} cy={py} r="3.5" fill="#4f46e5" />}
          <text x={x} y={y-3} textAnchor="middle" fill="#334155" fontSize="11" fontWeight="600">{d.label}</text>
          <text x={x} y={y+13} textAnchor="middle" fill="#4f46e5" fontSize="12">{isRating(value)?`${value.toFixed(1)} 分`:'暂无数据'}</text>
        </g>;
      })}
    </svg>
    <p className="text-center text-xs text-slate-500 pb-2">越靠外，评价越好 · 满分 5 分</p>
  </div>;
}
