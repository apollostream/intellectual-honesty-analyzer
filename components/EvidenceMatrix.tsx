
import React, { useState } from 'react';
import { EvidenceCluster, Hypothesis } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, ExternalLink, Layers, ChevronRight, BarChart2 } from 'lucide-react';
import LikelihoodChart from './LikelihoodChart';

interface Props {
  clusters: EvidenceCluster[];
  hypotheses: Hypothesis[];
}

const EvidenceMatrix: React.FC<Props> = ({ clusters, hypotheses }) => {
  // Track expanded clusters
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set(clusters.map(c => c.id)));

  const toggleCluster = (id: string) => {
    const newSet = new Set(expandedClusters);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedClusters(newSet);
  };

  const getLRColor = (lr: number) => {
    if (lr >= 10) return 'bg-emerald-500 text-emerald-950 font-bold'; // Strong Support
    if (lr >= 2) return 'bg-emerald-500/50 text-emerald-100'; // Moderate Support
    if (lr <= 0.1) return 'bg-red-500 text-red-950 font-bold'; // Strong Refute
    if (lr <= 0.5) return 'bg-red-500/50 text-red-100'; // Moderate Refute
    return 'bg-slate-700 text-slate-400'; // Neutral
  };

  const getLRLabel = (lr: number) => {
    if (lr >= 10) return '++';
    if (lr >= 2) return '+';
    if (lr <= 0.1) return '--';
    if (lr <= 0.5) return '-';
    return '0';
  };

  return (
    <div className="w-full space-y-4">
        {/* Matrix Header */}
        <div className="flex items-center border-b border-slate-700 pb-2 px-2">
             <div className="flex-1 font-bold text-slate-400 text-xs uppercase tracking-wider">Evidence Clusters & Items</div>
             <div className="flex gap-2">
                 {hypotheses.map(h => (
                     <div key={h.id} className="w-10 text-center group relative cursor-help">
                         <span className="text-xs font-serif font-bold text-slate-300">{h.id}</span>
                         <div className="absolute bottom-full mb-2 hidden group-hover:block w-32 bg-black text-white text-xs p-2 rounded z-50 shadow-lg border border-slate-600 -translate-x-1/2 left-1/2">
                            {h.title}
                         </div>
                     </div>
                 ))}
             </div>
        </div>

        {clusters.map((cluster) => (
            <div key={cluster.id} className="bg-slate-800/40 rounded-lg border border-slate-700/50 overflow-hidden">
                {/* Cluster Header */}
                <div 
                    onClick={() => toggleCluster(cluster.id)}
                    className="p-4 bg-slate-800/80 hover:bg-slate-800 cursor-pointer flex flex-col md:flex-row gap-4 md:items-center transition-colors"
                >
                    <div className="flex items-start gap-3 flex-1">
                        {expandedClusters.has(cluster.id) ? <ChevronDown size={18} className="text-emerald-500 mt-1" /> : <ChevronRight size={18} className="text-slate-500 mt-1" />}
                        <div>
                            <div className="flex items-center gap-2">
                                <Layers size={16} className="text-emerald-400" />
                                <h3 className="font-bold text-slate-200 text-sm">{cluster.name}</h3>
                                <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 rounded-full">{cluster.items.length} items</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1 line-clamp-1">{cluster.description}</p>
                        </div>
                    </div>
                    
                    {/* Cluster Aggregate LRs */}
                    <div className="flex gap-2 justify-end">
                        {hypotheses.map(h => {
                            const lr = cluster.lrs[h.id] || 1;
                            return (
                                <div 
                                    key={h.id}
                                    className={`w-10 h-8 rounded-md flex items-center justify-center text-xs border border-white/5 ${getLRColor(lr)}`}
                                    title={`Cluster Impact on ${h.id}: ${lr}`}
                                >
                                    {getLRLabel(lr)}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Expanded Content */}
                <AnimatePresence>
                    {expandedClusters.has(cluster.id) && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-slate-700/50"
                        >
                            {/* Visualization for Cluster */}
                            <div className="p-4 bg-slate-900/30 flex flex-col md:flex-row gap-6 border-b border-slate-800/50">
                                <div className="flex-1">
                                    <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-2">Cluster Logic</h4>
                                    <p className="text-sm text-slate-300 leading-relaxed mb-4">{cluster.description}</p>
                                    
                                    {/* Stats Table */}
                                    {cluster.stats && (
                                        <div className="mt-4">
                                            <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-2 flex items-center gap-1">
                                                <BarChart2 size={12} /> Bayesian Breakdown
                                            </h4>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs text-left text-slate-400 border border-slate-700 rounded-lg overflow-hidden">
                                                    <thead className="bg-slate-800 text-slate-300">
                                                        <tr>
                                                            <th className="px-3 py-2">Hypothesis</th>
                                                            <th className="px-3 py-2 text-right" title="Prior Plausibility">Prior P(H)</th>
                                                            <th className="px-3 py-2 text-right" title="Likelihood P(E|H)">P(E|H)</th>
                                                            <th className="px-3 py-2 text-right" title="Likelihood P(E|~H)">P(E|~H)</th>
                                                            <th className="px-3 py-2 text-right text-emerald-400">LR</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-700">
                                                        {hypotheses.map(h => {
                                                            const s = cluster.stats?.[h.id];
                                                            if (!s) return null;
                                                            return (
                                                                <tr key={h.id} className="hover:bg-slate-800/30">
                                                                    <td className="px-3 py-1.5 font-medium text-slate-300">{h.id}</td>
                                                                    <td className="px-3 py-1.5 text-right font-mono">{s.p_h.toFixed(3)}</td>
                                                                    <td className="px-3 py-1.5 text-right font-mono">{s.p_e_h.toFixed(2)}</td>
                                                                    <td className="px-3 py-1.5 text-right font-mono">{s.p_e_not_h.toFixed(2)}</td>
                                                                    <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-400">{s.lr.toFixed(2)}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="w-full md:w-1/3">
                                    <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-1">Cluster Impact</h4>
                                    <LikelihoodChart data={cluster} hypotheses={hypotheses} height={180} />
                                </div>
                            </div>

                            {/* Evidence Items List */}
                            <div className="p-2 space-y-1">
                                {cluster.items.map((item) => (
                                    <div key={item.id} className="flex gap-4 p-3 rounded hover:bg-white/5 transition-colors ml-2 border-l-2 border-slate-700 pl-4">
                                        <div className="flex-1">
                                            <div className="text-sm text-slate-300 font-medium">{item.description}</div>
                                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                                                <span>{item.source}</span>
                                                {item.url && <ExternalLink size={10} />}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1 italic">
                                                "{item.explanation}"
                                            </div>
                                        </div>
                                        {/* Item LRs (Small/Muted) */}
                                        <div className="flex gap-2 items-center opacity-50 grayscale hover:grayscale-0 transition-all">
                                            {hypotheses.map(h => {
                                                const lr = item.lrs[h.id] || 1;
                                                return (
                                                    <div 
                                                        key={h.id}
                                                        className={`w-10 h-1 rounded flex items-center justify-center ${lr > 1 ? 'bg-emerald-500' : lr < 1 ? 'bg-red-500' : 'bg-slate-600'}`}
                                                        title={`Individual Item Context: ${lr}`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        ))}
    </div>
  );
};

export default EvidenceMatrix;
