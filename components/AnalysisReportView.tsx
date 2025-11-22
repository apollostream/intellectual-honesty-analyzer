
import React, { useState, useRef, useEffect } from 'react';
import { AnalysisReport, RubricDimension } from '../types';
import { CheckCircle, AlertTriangle, Brain, Scale, Download, MessageSquare, Share2, Users, Send, Loader2, ClipboardCheck, MinusCircle, PlusCircle, X } from 'lucide-react';
import EvidenceMatrix from './EvidenceMatrix';
import ReactMarkdown from 'react-markdown';
import { chatWithAnalyst } from '../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip as RechartsTooltip } from 'recharts';
import { jsPDF } from "jspdf";

interface Props {
  report: AnalysisReport;
  onExport: () => void;
}

const RubricCard: React.FC<{ title: string, weight: string, data: RubricDimension }> = ({ title, weight, data }) => {
    const getScoreColor = (s: number) => {
        if (s >= 3.5) return 'bg-emerald-500 text-emerald-950';
        if (s >= 2.5) return 'bg-blue-500 text-blue-950';
        if (s >= 1.5) return 'bg-amber-500 text-amber-950';
        return 'bg-red-500 text-red-950';
    };
    
    const getBarColor = (s: number) => {
        if (s >= 3.5) return 'bg-emerald-500';
        if (s >= 2.5) return 'bg-blue-500';
        if (s >= 1.5) return 'bg-amber-500';
        return 'bg-red-500';
    }

    return (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wide">{title}</h3>
                    <span className="text-xs text-slate-500 font-mono">Weight: {weight}</span>
                </div>
                <div className={`px-2 py-1 rounded font-bold text-sm ${getScoreColor(data.score)}`}>
                    {data.score.toFixed(1)}/4.0
                </div>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full h-2 bg-slate-700 rounded-full mb-4 overflow-hidden">
                <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(data.score / 4) * 100}%` }}
                    className={`h-full rounded-full ${getBarColor(data.score)}`}
                />
            </div>

            <p className="text-sm text-slate-300 mb-4 flex-grow">{data.justification}</p>

            <div className="grid grid-cols-1 gap-3 mt-auto">
                {data.strengths.length > 0 && (
                    <div>
                        <h4 className="text-[10px] text-emerald-400 uppercase font-bold mb-1 flex items-center gap-1">
                            <PlusCircle size={10}/> Strengths
                        </h4>
                        <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
                            {data.strengths.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                    </div>
                )}
                {data.improvements.length > 0 && (
                    <div>
                        <h4 className="text-[10px] text-amber-400 uppercase font-bold mb-1 flex items-center gap-1">
                            <MinusCircle size={10}/> Improvements
                        </h4>
                        <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
                            {data.improvements.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

const AnalysisReportView: React.FC<Props> = ({ report, onExport }) => {
  const [activeTab, setActiveTab] = useState<'k0' | 'hypotheses' | 'evidence' | 'rubric' | 'synthesis' | 'collaboration'>('k0');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<{role: string, parts: {text: string}[]}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Collaboration State
  const [showShareModal, setShowShareModal] = useState(false);
  const [comments, setComments] = useState<{user: string, text: string, time: string}[]>([]);
  const [commentInput, setCommentInput] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  
  // Calculate Hypothesis Scores for Radar Chart based on CLUSTERS
  const radarData = report.hypotheses.map(h => {
    // Calculate cumulative product of LRs for this hypothesis using CLUSTERS
    let score = 1;
    report.evidence_clusters.forEach(cluster => {
        const lr = cluster.lrs[h.id] || 1;
        score *= lr;
    });
    return {
        subject: h.id,
        fullTitle: h.title,
        // Log scale for visualization: Log10(0.01) = -2. Shift by +2 to make 0.01 => 0.
        // 1.0 => 2. 100 => 4.
        A: Math.max(0, Math.log10(Math.max(score, 0.01)) + 2), 
        rawScore: score
    };
  });

  // PDF Generation Logic
  const handleGeneratePDF = async () => {
    setIsExporting(true);
    
    try {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);

        let currentY = margin;

        // --- Helper Functions ---

        const addText = (
            text: string, 
            fontSize: number = 12, 
            isBold: boolean = false, 
            color: string = '#1e293b', 
            indent: number = 0
        ) => {
            doc.setFontSize(fontSize);
            doc.setFont("helvetica", isBold ? "bold" : "normal");
            doc.setTextColor(color);
            
            const maxTextWidth = contentWidth - indent;
            const lines = doc.splitTextToSize(text, maxTextWidth);
            const lineHeight = fontSize * 0.3527 * 1.2; 
            const blockHeight = lines.length * lineHeight;

            if (currentY + blockHeight > pageHeight - margin) {
                doc.addPage();
                currentY = margin;
            }

            doc.text(lines, margin + indent, currentY);
            currentY += blockHeight + 2; 
        };

        const addVerticalSpace = (mm: number) => {
             currentY += mm;
             if (currentY > pageHeight - margin) {
                 doc.addPage();
                 currentY = margin;
             }
        };

        const ensureSpace = (mm: number) => {
            if (currentY + mm > pageHeight - margin) {
                doc.addPage();
                currentY = margin;
            }
        };

        // --- SECTION TRACKING FOR TOC ---
        const sectionPages: Record<string, number> = {};

        // --- PAGE 1: TITLE PAGE ---
        currentY = 60;
        
        doc.setFontSize(14);
        doc.setTextColor('#10b981'); // Emerald
        doc.setFont("helvetica", "bold");
        doc.text("INTELLECTUAL HONESTY ASSESSMENT", pageWidth / 2, currentY, { align: 'center' });
        
        currentY += 20;
        
        doc.setFontSize(24);
        doc.setTextColor('#1e293b');
        const titleLines = doc.splitTextToSize(report.topic, contentWidth);
        doc.text(titleLines, pageWidth / 2, currentY, { align: 'center' });
        currentY += (titleLines.length * 10) + 10;
        
        doc.setFontSize(12);
        doc.setTextColor('#64748b');
        doc.setFont("helvetica", "normal");
        doc.text(`Generated: ${new Date(report.generated_at).toLocaleDateString()}`, pageWidth / 2, currentY, { align: 'center' });
        currentY += 8;
        doc.text(`Analyst: ${localStorage.getItem('analysis_user') || 'Guest User'}`, pageWidth / 2, currentY, { align: 'center' });

        // --- PAGE 2: TOC PLACEHOLDER ---
        doc.addPage();
        const tocPageNumber = 2;
        
        // --- CONTENT GENERATION ---

        // 1. Executive Summary
        doc.addPage();
        sectionPages['1. Executive Summary'] = doc.getNumberOfPages();
        currentY = margin;
        addText("1. Executive Summary", 16, true, '#10b981');
        addVerticalSpace(5);

        addText("Hypothesis Support (Cumulative Likelihood)", 14, true, '#334155');
        report.hypotheses.forEach(h => {
             let score = 1;
             report.evidence_clusters.forEach(cluster => {
                 const lr = cluster.lrs[h.id] || 1;
                 score *= lr;
             });
             addText(`${h.id}: ${score.toFixed(2)} - ${h.title}`, 11, false, '#475569', 5);
        });
        addVerticalSpace(5);
        
        addText("Rubric Overview", 14, true, '#334155');
        addText(`Total Score: ${report.rubric_assessment.total_score.toFixed(2)} / 4.0`, 12, true, '#10b981');
        addText(report.rubric_assessment.overall_assessment, 11, false, '#334155');
        addVerticalSpace(5);
        
        addText("Final Verdict", 14, true, '#334155');
        addText(report.final_conclusion, 11, false, '#334155');

        // 2. Background
        doc.addPage();
        sectionPages['2. Background & Context'] = doc.getNumberOfPages();
        currentY = margin;
        addText("2. Background & Context", 16, true, '#10b981');
        addVerticalSpace(5);

        addText("Original Prompt", 12, true, '#64748b');
        doc.setFont("courier", "normal");
        doc.setFontSize(10);
        const promptLines = doc.splitTextToSize(report.original_query || report.topic, contentWidth - 10);
        const boxHeight = (promptLines.length * 4) + 6;
        
        ensureSpace(boxHeight);
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, currentY, contentWidth, boxHeight, 'F');
        doc.setTextColor('#334155');
        doc.text(promptLines, margin + 5, currentY + 5);
        currentY += boxHeight + 10;

        addText("Explicit Assumptions (K0)", 12, true, '#334155');
        report.k0.assumptions.forEach((a, i) => {
            addText(`${i+1}. ${a}`, 11, false, '#475569', 5);
        });
        addVerticalSpace(5);
        
        addText("Context", 12, true, '#334155');
        addText(report.k0.context, 11, false, '#475569');

        // 3. Hypotheses
        doc.addPage();
        sectionPages['3. Hypotheses'] = doc.getNumberOfPages();
        currentY = margin;
        addText("3. Hypotheses", 16, true, '#10b981');
        addVerticalSpace(5);

        report.hypotheses.forEach(h => {
            ensureSpace(30);
            addText(`${h.id}: ${h.title}`, 13, true, '#1e293b');
            addText(`Type: ${h.type}`, 10, false, '#64748b');
            addText(h.description, 11, false, '#475569', 5);
            addVerticalSpace(5);
        });

        // 4. Evidence Matrix
        doc.addPage();
        sectionPages['4. Evidence Matrix'] = doc.getNumberOfPages();
        currentY = margin;
        addText("4. Evidence Matrix", 16, true, '#10b981');
        addVerticalSpace(5);

        report.evidence_clusters.forEach(cluster => {
            ensureSpace(40); 
            
            // Cluster Header
            doc.setFillColor(240, 253, 244); 
            doc.rect(margin, currentY, contentWidth, 8, 'F');
            doc.setTextColor('#064e3b');
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(cluster.name, margin + 2, currentY + 6);
            currentY += 12;

            addText(cluster.description, 11, false, '#334155');
            addVerticalSpace(2);

            // Detailed Stats Table 
            if (cluster.stats) {
                addText("Bayesian Breakdown:", 10, true, '#64748b');
                doc.setFontSize(9);
                doc.setFont("courier", "normal");
                
                const header = "ID    Prior   P(E|H)   P(E|~H)   LR";
                addText(header, 9, true, '#475569', 5);
                
                report.hypotheses.forEach(h => {
                    const s = cluster.stats?.[h.id];
                    if (s) {
                        const line = `${h.id.padEnd(5)} ${s.p_h.toFixed(3).padEnd(7)} ${s.p_e_h.toFixed(2).padEnd(8)} ${s.p_e_not_h.toFixed(2).padEnd(9)} ${s.lr.toFixed(2)}`;
                        addText(line, 9, false, '#334155', 5);
                    }
                });
                addVerticalSpace(3);
            } else {
                addText("Hypothesis Impact:", 10, true, '#64748b');
                Object.entries(cluster.lrs).forEach(([hid, val]) => {
                    addText(`- ${hid}: ${val}`, 10, false, '#475569', 5);
                });
            }
            addVerticalSpace(2);

            addText("Evidence Items:", 10, true, '#64748b');
            cluster.items.forEach(item => {
                addText(`• ${item.description}`, 10, true, '#1e293b', 5);
                addText(`  Source: ${item.source}`, 9, false, '#64748b', 5);
                addText(`  Note: ${item.explanation}`, 9, false, '#475569', 5);
                addVerticalSpace(2);
            });
            
            addVerticalSpace(5);
            doc.setDrawColor(226, 232, 240);
            doc.line(margin, currentY, pageWidth - margin, currentY);
            addVerticalSpace(5);
        });

        // 5. Rubric Assessment
        doc.addPage();
        sectionPages['5. Intellectual Honesty Rubric'] = doc.getNumberOfPages();
        currentY = margin;
        addText("5. Intellectual Honesty Rubric", 16, true, '#10b981');
        addVerticalSpace(5);

        const dimensions = [
            { name: "Evidence Handling", data: report.rubric_assessment.evidence_handling },
            { name: "Argument Structure", data: report.rubric_assessment.argument_structure },
            { name: "Methodological Transparency", data: report.rubric_assessment.methodological_transparency },
            { name: "Reflexivity & Revision", data: report.rubric_assessment.reflexivity_revision },
        ];

        dimensions.forEach(dim => {
            ensureSpace(40);
            addText(`${dim.name}`, 13, true, '#1e293b');
            addText(`Score: ${dim.data.score.toFixed(1)}/4.0`, 11, true, dim.data.score >= 3 ? '#10b981' : '#f59e0b');
            addVerticalSpace(2);
            
            addText("Justification:", 10, true, '#64748b');
            addText(dim.data.justification, 10, false, '#334155', 5);
            
            if (dim.data.strengths.length > 0) {
                addText("Strengths:", 10, true, '#10b981');
                dim.data.strengths.forEach(s => addText(`+ ${s}`, 10, false, '#334155', 5));
            }
            
            if (dim.data.improvements.length > 0) {
                addText("Improvements:", 10, true, '#f59e0b');
                dim.data.improvements.forEach(s => addText(`- ${s}`, 10, false, '#334155', 5));
            }
            
            addVerticalSpace(8);
        });

        // 6. Synthesis
        doc.addPage();
        sectionPages['6. Synthesis & Reflexivity'] = doc.getNumberOfPages();
        currentY = margin;
        addText("6. Synthesis & Reflexivity", 16, true, '#10b981');
        addVerticalSpace(5);
        
        addText("Reflexive Review", 14, true, '#334155');
        addText(report.reflexive_review, 11, false, '#475569');
        addVerticalSpace(5);
        
        addText("Full Synthesis", 14, true, '#334155');
        addText(report.synthesis, 11, false, '#475569');

        // --- FILL TOC ---
        doc.setPage(tocPageNumber);
        currentY = margin;
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.setTextColor('#1e293b');
        doc.text("Table of Contents", margin, currentY);
        currentY += 15;

        Object.entries(sectionPages).forEach(([title, pageNum]) => {
            doc.setFontSize(12);
            doc.setFont("helvetica", "normal");
            doc.textWithLink(title, margin, currentY, { pageNumber: pageNum });
            doc.text(pageNum.toString(), pageWidth - margin, currentY, { align: 'right' });
            doc.setDrawColor(226, 232, 240);
            doc.line(margin, currentY + 2, pageWidth - margin, currentY + 2);
            currentY += 12;
        });

        // --- ADD PAGE NUMBERS ---
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(10);
            doc.setTextColor('#94a3b8');
            doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        }

        doc.save(`Intellectual_Honesty_Report_${new Date().toISOString().slice(0,10)}.pdf`);

    } catch (e) {
        console.error("PDF Generation Error", e);
        alert("Failed to generate PDF. Please try again.");
    } finally {
        setIsExporting(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent | string) => {
    const query = typeof e === 'string' ? e : chatInput;
    if(typeof e !== 'string') e.preventDefault();
    if(!query.trim()) return;

    const userMsg = { role: "user", parts: [{ text: query }] };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setChatInput("");
    setChatLoading(true);

    try {
        const response = await chatWithAnalyst(report, newHistory, query);
        setChatHistory([...newHistory, { role: "model", parts: [{ text: response || "I couldn't generate a response." }] }]);
    } catch (err) {
        console.error(err);
    } finally {
        setChatLoading(false);
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleAddComment = (e: React.FormEvent) => {
      e.preventDefault();
      if(!commentInput.trim()) return;
      setComments([...comments, {
          user: localStorage.getItem('analysis_user') || 'Guest',
          text: commentInput,
          time: new Date().toISOString()
      }]);
      setCommentInput("");
  };

  return (
    <div className="flex flex-col h-full bg-[#0f172a]">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/80 backdrop-blur p-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex-1 min-w-0">
             <h1 className="text-xl font-serif font-bold text-slate-200 truncate pr-4">{report.topic}</h1>
             <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1">
                    <Scale size={12} className="text-emerald-500"/>
                    Rubric Score: {report.rubric_assessment.total_score.toFixed(2)}
                </span>
                <span className="hidden md:inline">{new Date(report.generated_at).toLocaleDateString()}</span>
             </div>
        </div>
        <div className="flex items-center gap-2">
             <button onClick={() => setShowShareModal(true)} className="p-2 text-slate-400 hover:text-emerald-400 transition-colors">
                 <Share2 size={18} />
             </button>
             <button 
                onClick={handleGeneratePDF} 
                disabled={isExporting}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded transition-all"
             >
                {isExporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14} />}
                <span className="hidden md:inline">Export PDF</span>
             </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-700 bg-slate-900 no-scrollbar">
        {[
            { id: 'k0', label: 'Background (K₀)', icon: Brain },
            { id: 'hypotheses', label: 'Hypotheses', icon: Users },
            { id: 'evidence', label: 'Evidence Matrix', icon: Scale },
            { id: 'rubric', label: 'Rubric', icon: ClipboardCheck },
            { id: 'synthesis', label: 'Synthesis', icon: CheckCircle },
            { id: 'collaboration', label: 'Collaboration', icon: MessageSquare },
        ].map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${
                    activeTab === tab.id 
                    ? 'border-emerald-500 text-emerald-400 bg-slate-800/50' 
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
            >
                <tab.icon size={16} />
                {tab.label}
            </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <div className="max-w-6xl mx-auto">
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {activeTab === 'k0' && (
                        <div className="space-y-8">
                             <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl">
                                <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
                                    <Brain className="text-emerald-500"/> Explicit Assumptions (K₀)
                                </h3>
                                <ul className="space-y-3">
                                    {report.k0.assumptions.map((a, i) => (
                                        <li key={i} className="flex gap-3 text-slate-300 bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                                            <span className="text-emerald-500 font-mono">0{i+1}</span>
                                            <span>{a}</span>
                                        </li>
                                    ))}
                                </ul>
                             </div>
                             <div className="grid md:grid-cols-2 gap-6">
                                 <div className="bg-slate-800/30 border border-slate-700 p-6 rounded-xl">
                                     <h4 className="font-bold text-slate-400 mb-3 text-sm uppercase tracking-wider">Context</h4>
                                     <p className="text-slate-300 leading-relaxed">{report.k0.context}</p>
                                 </div>
                                 <div className="bg-slate-800/30 border border-slate-700 p-6 rounded-xl">
                                     <h4 className="font-bold text-amber-500 mb-3 text-sm uppercase tracking-wider flex items-center gap-2">
                                        <AlertTriangle size={14}/> Potential Biases
                                     </h4>
                                     <ul className="list-disc list-inside space-y-2 text-slate-400">
                                         {report.k0.potential_biases.map((b, i) => <li key={i}>{b}</li>)}
                                     </ul>
                                 </div>
                             </div>
                        </div>
                    )}

                    {activeTab === 'hypotheses' && (
                        <div className="space-y-8">
                            <div className="grid md:grid-cols-3 gap-6">
                                {report.hypotheses.map((h) => (
                                    <div key={h.id} className={`p-6 rounded-xl border ${h.type === 'primary' ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-slate-800/50 border-slate-700'}`}>
                                        <div className="flex justify-between items-start mb-3">
                                            <span className="font-mono text-xl font-bold text-slate-200">{h.id}</span>
                                            <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-black/30 text-slate-400">{h.type}</span>
                                        </div>
                                        <h3 className="font-bold text-emerald-100 mb-2">{h.title}</h3>
                                        <p className="text-sm text-slate-400 leading-relaxed">{h.description}</p>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Radar Chart for Overview */}
                            <div className="bg-slate-800/30 p-6 rounded-xl border border-slate-700 flex flex-col items-center">
                                <h3 className="text-slate-400 text-sm font-bold uppercase mb-4">Hypothesis Plausibility Landscape</h3>
                                <div className="w-full h-[300px] max-w-md">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                            <PolarGrid stroke="#334155" />
                                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                            <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                                            <Radar
                                                name="Likelihood Support"
                                                dataKey="A"
                                                stroke="#10b981"
                                                strokeWidth={2}
                                                fill="#10b981"
                                                fillOpacity={0.3}
                                            />
                                            <RechartsTooltip 
                                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                                                formatter={(value: number, name: string, props: any) => [
                                                    `x${props.payload.rawScore.toFixed(2)}`, "Cumulative LR"
                                                ]}
                                            />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                                <p className="text-xs text-slate-500 text-center mt-2">Visualizes the relative strength of evidence supporting each hypothesis.</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'evidence' && (
                        <EvidenceMatrix clusters={report.evidence_clusters} hypotheses={report.hypotheses} />
                    )}

                    {activeTab === 'rubric' && (
                        <div className="space-y-8">
                            <div className="grid md:grid-cols-2 gap-6 h-full">
                                <RubricCard title="Evidence Handling" weight="30%" data={report.rubric_assessment.evidence_handling} />
                                <RubricCard title="Argument Structure" weight="25%" data={report.rubric_assessment.argument_structure} />
                                <RubricCard title="Transparency" weight="25%" data={report.rubric_assessment.methodological_transparency} />
                                <RubricCard title="Reflexivity" weight="20%" data={report.rubric_assessment.reflexivity_revision} />
                            </div>
                            <div className="bg-slate-800/80 p-6 rounded-xl border border-slate-700 text-center">
                                <h3 className="text-slate-200 font-serif font-bold text-lg mb-2">Overall Assessment</h3>
                                <p className="text-slate-400 max-w-3xl mx-auto">{report.rubric_assessment.overall_assessment}</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'synthesis' && (
                        <div className="space-y-6 max-w-4xl mx-auto">
                            <div className="bg-slate-800/50 border border-slate-700 p-8 rounded-xl">
                                <h3 className="text-xl font-serif font-bold text-emerald-400 mb-6">Final Verdict</h3>
                                <div className="prose prose-invert prose-emerald max-w-none">
                                    <ReactMarkdown>{report.final_conclusion}</ReactMarkdown>
                                </div>
                            </div>
                            
                            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
                                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Reflexive Review</h4>
                                <p className="text-slate-300 italic border-l-2 border-emerald-500/50 pl-4">
                                    {report.reflexive_review}
                                </p>
                            </div>

                            <div className="bg-slate-800/30 border border-slate-700 p-6 rounded-xl">
                                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Detailed Synthesis</h4>
                                <div className="prose prose-sm prose-invert max-w-none text-slate-300">
                                    <ReactMarkdown>{report.synthesis}</ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'collaboration' && (
                        <div className="grid md:grid-cols-2 gap-6 h-[600px]">
                            {/* Chat Interface */}
                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl flex flex-col overflow-hidden">
                                <div className="p-4 bg-slate-800 border-b border-slate-700 font-bold text-slate-300 flex items-center gap-2">
                                    <Brain size={16} className="text-emerald-500" /> Query the Analyst
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                    {chatHistory.length === 0 && (
                                        <div className="text-center text-slate-500 text-sm mt-10">
                                            Ask questions about the evidence, priors, or rubric scoring.
                                        </div>
                                    )}
                                    {chatHistory.map((msg, i) => (
                                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                                                <ReactMarkdown>{msg.parts[0].text}</ReactMarkdown>
                                            </div>
                                        </div>
                                    ))}
                                    {chatLoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-slate-700 p-3 rounded-lg flex items-center gap-2">
                                                <Loader2 size={14} className="animate-spin text-slate-400"/>
                                                <span className="text-xs text-slate-400">Thinking...</span>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef}/>
                                </div>
                                <form onSubmit={handleChatSubmit} className="p-3 bg-slate-900 border-t border-slate-700 flex gap-2">
                                    <input 
                                        value={chatInput}
                                        onChange={e => setChatInput(e.target.value)}
                                        placeholder="Ask a question..."
                                        className="flex-1 bg-slate-800 text-slate-200 text-sm px-3 py-2 rounded border border-slate-700 focus:outline-none focus:border-emerald-500"
                                    />
                                    <button type="submit" disabled={chatLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded transition-colors">
                                        <Send size={16} />
                                    </button>
                                </form>
                            </div>

                            {/* Comments / Annotations */}
                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl flex flex-col overflow-hidden">
                                <div className="p-4 bg-slate-800 border-b border-slate-700 font-bold text-slate-300 flex items-center gap-2">
                                    <MessageSquare size={16} className="text-blue-500" /> Team Comments
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                     {comments.length === 0 ? (
                                         <div className="text-center text-slate-600 text-sm mt-10 italic">No comments yet. Be the first to annotate.</div>
                                     ) : (
                                         comments.map((c, i) => (
                                             <div key={i} className="bg-slate-900/50 p-3 rounded border border-slate-700/50">
                                                 <div className="flex justify-between items-center mb-1">
                                                     <span className="text-emerald-500 font-bold text-xs">{c.user}</span>
                                                     <span className="text-[10px] text-slate-600">{new Date(c.time).toLocaleTimeString()}</span>
                                                 </div>
                                                 <p className="text-sm text-slate-300">{c.text}</p>
                                             </div>
                                         ))
                                     )}
                                </div>
                                <form onSubmit={handleAddComment} className="p-3 bg-slate-900 border-t border-slate-700 flex gap-2">
                                    <input 
                                        value={commentInput}
                                        onChange={e => setCommentInput(e.target.value)}
                                        placeholder="Add an annotation..."
                                        className="flex-1 bg-slate-800 text-slate-200 text-sm px-3 py-2 rounded border border-slate-700 focus:outline-none focus:border-emerald-500"
                                    />
                                    <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded transition-colors">
                                        <PlusCircle size={16} />
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
      </div>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-slate-800 p-6 rounded-xl max-w-sm w-full border border-slate-700"
                >
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-200">Share Analysis</h3>
                        <button onClick={() => setShowShareModal(false)} className="text-slate-500 hover:text-white"><X size={18}/></button>
                    </div>
                    <div className="bg-slate-900 p-3 rounded border border-slate-700 text-xs text-slate-400 font-mono break-all mb-4">
                        https://analyzer.app/report/{Math.random().toString(36).substring(7)}
                    </div>
                    <button onClick={() => setShowShareModal(false)} className="w-full py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-500">
                        Copy Link
                    </button>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
      
      {/* Floating Chat Button (for non-collaboration tabs) */}
      {activeTab !== 'collaboration' && (
          <div className="fixed bottom-6 right-6 z-40">
              <AnimatePresence>
                {chatOpen && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        className="absolute bottom-16 right-0 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl flex flex-col h-96 overflow-hidden"
                    >
                        <div className="p-3 bg-slate-900 border-b border-slate-700 font-bold text-slate-300 flex justify-between">
                            <span>Query Engine</span>
                            <button onClick={() => setChatOpen(false)}><X size={14}/></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-800/90 custom-scrollbar">
                            {chatHistory.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[90%] p-2 rounded text-xs ${msg.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                                        <ReactMarkdown>{msg.parts[0].text}</ReactMarkdown>
                                    </div>
                                </div>
                            ))}
                            {chatLoading && <div className="text-xs text-slate-500 animate-pulse">Analyst is thinking...</div>}
                        </div>
                        <form onSubmit={handleChatSubmit} className="p-2 bg-slate-900 border-t border-slate-700 flex gap-2">
                            <input 
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                placeholder="Ask..."
                                className="flex-1 bg-slate-800 text-slate-200 text-xs px-2 py-1.5 rounded border border-slate-700"
                            />
                            <button type="submit" className="bg-emerald-600 text-white p-1.5 rounded"><Send size={12}/></button>
                        </form>
                    </motion.div>
                )}
              </AnimatePresence>
              <button 
                onClick={() => setChatOpen(!chatOpen)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white p-4 rounded-full shadow-lg shadow-emerald-900/20 transition-all hover:scale-110"
              >
                  {chatOpen ? <X size={24} /> : <MessageSquare size={24} />}
              </button>
          </div>
      )}
    </div>
  );
};

export default AnalysisReportView;
