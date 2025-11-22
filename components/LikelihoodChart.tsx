
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import { Hypothesis, BayesianStats } from '../types';

interface Props {
  data: {
      id: string;
      title?: string; // Optional title for tooltip
      lrs: Record<string, number>;
      stats?: Record<string, BayesianStats>;
  };
  hypotheses: Hypothesis[];
  height?: number;
}

const LikelihoodChart: React.FC<Props> = ({ data: evidenceData, hypotheses, height = 192 }) => {
  // Transform data for recharts
  const chartData = hypotheses.map(h => {
    const lr = evidenceData.lrs[h.id] || 1;
    return {
      id: h.id,
      name: h.id,
      lr: lr,
      logLr: Math.log10(lr),
      fullTitle: h.title
    };
  });

  return (
    <div className="w-full bg-slate-900/50 rounded-lg p-2 border border-slate-700" style={{ height: `${height}px` }}>
      <p className="text-xs text-slate-400 mb-2 text-center">Likelihood Ratio (Log Scale)</p>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <XAxis type="number" hide domain={[-2, 2]} /> 
          <YAxis type="category" dataKey="name" width={30} stroke="#94a3b8" fontSize={12} />
          <Tooltip 
            cursor={{fill: 'transparent'}}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload;
                const stat = evidenceData.stats?.[d.id];
                const supportText = d.lr > 1 ? "Supports" : d.lr < 1 ? "Refutes" : "Neutral";
                return (
                  <div className="bg-slate-800 border border-slate-600 p-3 rounded shadow-xl text-xs z-50">
                    <p className="font-bold text-slate-200 mb-1">{d.fullTitle}</p>
                    <p className="text-emerald-400 font-mono">LR: {d.lr.toFixed(2)} ({supportText})</p>
                    {stat && (
                        <div className="mt-2 pt-2 border-t border-slate-700 space-y-1 text-slate-400">
                            <div className="flex justify-between gap-4">
                                <span>P(E|H):</span>
                                <span className="text-slate-200">{stat.p_e_h.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span>P(E|~H):</span>
                                <span className="text-slate-200">{stat.p_e_not_h.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span>Prior P(H):</span>
                                <span className="text-slate-200">{stat.p_h.toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />
          <ReferenceLine x={0} stroke="#64748b" strokeDasharray="3 3" />
          <Bar dataKey="logLr" barSize={20}>
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.logLr > 0 ? '#10b981' : entry.logLr < 0 ? '#ef4444' : '#64748b'} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-between text-[10px] text-slate-500 px-4">
        <span>Refutes H</span>
        <span>Neutral</span>
        <span>Supports H</span>
      </div>
    </div>
  );
};

export default LikelihoodChart;
