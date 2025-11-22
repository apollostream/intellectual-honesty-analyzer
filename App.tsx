
import React, { useState, useEffect } from 'react';
import { AnalysisPhase, AnalysisReport, RubricAssessment } from './types';
import { analyzeTopic } from './services/geminiService';
import AnalysisReportView from './components/AnalysisReportView';
import { Search, Loader2, AlertCircle, FileText, History, User, LogOut, ChevronRight, Menu } from 'lucide-react';
import { jsPDF } from "jspdf";
import { AnimatePresence, motion } from 'framer-motion';

const App: React.FC = () => {
  const [phase, setPhase] = useState<AnalysisPhase>(AnalysisPhase.INPUT);
  const [topic, setTopic] = useState('');
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<AnalysisReport[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');

  // Helper to migrate legacy data
  const migrateHistory = (data: any[]): AnalysisReport[] => {
    return data.map(item => {
        let clusters = item.evidence_clusters;
        
        // Legacy migration 1: flatten matrix into a single dummy cluster
        if (!clusters) {
            const legacyItems = (item as any).evidence_matrix || [];
            clusters = [{
                id: "legacy_cluster",
                name: "Legacy Evidence Set",
                description: "Data imported from previous version without thematic clustering.",
                lrs: {}, 
                items: legacyItems
            }];
        }
        
        // Legacy migration 2: add dummy rubric if missing
        let rubric = item.rubric_assessment;
        if (!rubric) {
            const dummyDimension = { score: 0, justification: "Legacy report - Rubric not available.", strengths: [], improvements: [] };
            rubric = {
                evidence_handling: dummyDimension,
                argument_structure: dummyDimension,
                methodological_transparency: dummyDimension,
                reflexivity_revision: dummyDimension,
                total_score: 0,
                overall_assessment: "This analysis was generated before the Intellectual Honesty Rubric feature was added."
            } as RubricAssessment;
        }

        return {
            ...item,
            evidence_clusters: clusters,
            rubric_assessment: rubric
        } as AnalysisReport;
    });
  };

  // Load history and user from local storage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('analysis_history');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        setHistory(migrateHistory(parsed));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
    const savedUser = localStorage.getItem('analysis_user');
    if (savedUser) setUser(savedUser);
  }, []);

  // Save history whenever it changes
  useEffect(() => {
    localStorage.setItem('analysis_history', JSON.stringify(history));
  }, [history]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameInput.trim()) {
      setUser(usernameInput);
      localStorage.setItem('analysis_user', usernameInput);
      setShowLogin(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('analysis_user');
    setHistory([]); 
    localStorage.removeItem('analysis_history');
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setPhase(AnalysisPhase.LOADING);
    setError('');

    try {
      const result = await analyzeTopic(topic);
      setReport(result);
      setPhase(AnalysisPhase.REPORT);
      // Add to history
      setHistory(prev => [result, ...prev].slice(0, 10)); // Keep last 10
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred.');
      setPhase(AnalysisPhase.ERROR);
    }
  };

  const loadFromHistory = (item: AnalysisReport) => {
    setReport(item);
    setPhase(AnalysisPhase.REPORT);
    setShowHistory(false);
  };

  const handleExport = () => {
    if (!report) return;
    const doc = new jsPDF();
    doc.setFont("times", "bold");
    doc.setFontSize(20);
    doc.text("Intellectual Honesty Report", 10, 20);
    
    doc.setFontSize(16);
    doc.text(report.topic, 10, 30);
    
    doc.setFontSize(12);
    doc.setFont("times", "normal");
    
    doc.text(`Rubric Score: ${report.rubric_assessment?.total_score.toFixed(2) || 'N/A'}/4.0`, 10, 40);
    
    const splitConclusion = doc.splitTextToSize(report.final_conclusion, 180);
    doc.text(splitConclusion, 10, 50);
    
    doc.save("analysis_report.pdf");
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans selection:bg-emerald-500/30 flex overflow-hidden">
      
      {/* Login Modal */}
      <AnimatePresence>
        {showLogin && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-slate-800 p-8 rounded-xl border border-slate-700 w-full max-w-md"
            >
              <h2 className="text-2xl font-serif font-bold text-white mb-4">Analyst Login</h2>
              <p className="text-slate-400 mb-6">Enter your name to access history and collaboration features.</p>
              <form onSubmit={handleLogin}>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Your Name"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white mb-4 focus:outline-none focus:border-emerald-500 transition-colors"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowLogin(false)} className="flex-1 px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300">Cancel</button>
                  <button type="submit" className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold">Access System</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Sidebar */}
      <motion.div 
        initial={{ width: 0 }}
        animate={{ width: showHistory ? 300 : 0 }}
        className="bg-slate-900 border-r border-slate-800 flex-shrink-0 overflow-hidden h-screen relative z-20"
      >
        <div className="w-[300px] h-full flex flex-col">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
             <h3 className="font-serif font-bold text-slate-200 flex items-center gap-2">
               <History size={18} className="text-emerald-500" /> History
             </h3>
             <button onClick={() => setShowHistory(false)} className="text-slate-500 hover:text-slate-300">
               <ChevronRight size={20} />
             </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
             {history.length === 0 ? (
               <div className="text-center text-slate-600 text-sm mt-10">No analysis history found.</div>
             ) : (
               history.map((item, idx) => (
                 <div 
                   key={idx} 
                   onClick={() => loadFromHistory(item)}
                   className="p-3 rounded-lg hover:bg-slate-800 cursor-pointer border border-transparent hover:border-slate-700 transition-all group"
                 >
                   <div className="text-sm font-medium text-slate-300 line-clamp-2 group-hover:text-emerald-400 transition-colors">
                     {item.topic}
                   </div>
                   <div className="text-[10px] text-slate-500 mt-2">
                     {new Date(item.generated_at).toLocaleDateString()} • {item.hypotheses.length} Hypotheses
                   </div>
                 </div>
               ))
             )}
          </div>
          {user && (
             <div className="p-4 border-t border-slate-800 bg-slate-900">
               <div className="flex items-center gap-3 mb-3">
                 <div className="w-8 h-8 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-400 font-bold border border-emerald-500/20">
                   {user.charAt(0).toUpperCase()}
                 </div>
                 <div className="flex-1 overflow-hidden">
                   <div className="text-sm font-medium text-slate-200 truncate">{user}</div>
                   <div className="text-xs text-emerald-500">Analyst</div>
                 </div>
               </div>
               <button 
                 onClick={handleLogout}
                 className="w-full flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-red-400 py-2 hover:bg-red-500/10 rounded transition-colors"
               >
                 <LogOut size={14} /> Sign Out
               </button>
             </div>
          )}
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        
        {/* Top Navigation Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 pointer-events-none">
           <div className="pointer-events-auto">
             {!showHistory && (
               <button 
                 onClick={() => setShowHistory(true)}
                 className="p-2 bg-slate-800/80 backdrop-blur hover:bg-slate-700 rounded-lg border border-slate-700 text-slate-300 shadow-lg transition-all"
                 title="View History"
               >
                 <Menu size={20} />
               </button>
             )}
           </div>
           <div className="pointer-events-auto">
             {!user ? (
               <button 
                 onClick={() => setShowLogin(true)}
                 className="px-4 py-2 bg-emerald-600/90 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg shadow-lg backdrop-blur transition-all flex items-center gap-2"
               >
                 <User size={16} /> Login / Sign Up
               </button>
             ) : (
               phase !== AnalysisPhase.INPUT && (
                 <button
                   onClick={() => { setPhase(AnalysisPhase.INPUT); setReport(null); }}
                   className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 shadow-lg backdrop-blur transition-all"
                 >
                   New Analysis
                 </button>
               )
             )}
           </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {phase === AnalysisPhase.INPUT && (
            <div className="flex flex-col items-center justify-center min-h-screen px-4 py-20">
              <div className="max-w-2xl w-full text-center space-y-8">
                <div className="space-y-4">
                  <div className="mx-auto w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 mb-6">
                     <FileText className="text-emerald-400" size={32} />
                  </div>
                  <h1 className="text-4xl md:text-5xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">
                    Intellectual Honesty Analyzer
                  </h1>
                  <p className="text-slate-400 text-lg leading-relaxed">
                    Critique news and topics using rigorous Bayesian process tracing and hermeneutic principles.
                    Escape the false binaries.
                  </p>
                </div>

                <form onSubmit={handleAnalyze} className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="Paste an article URL or enter a complex topic..."
                      className="flex-grow bg-transparent px-6 py-4 text-lg focus:outline-none text-slate-100 placeholder-slate-500"
                    />
                    <button 
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 rounded-md font-medium transition-colors flex items-center gap-2"
                    >
                      Analyze <Search size={18} />
                    </button>
                  </div>
                </form>

                {!user && (
                  <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 text-sm text-slate-400">
                    <span className="text-emerald-400 font-bold">Tip:</span> Log in to save your analysis history and collaborate.
                  </div>
                )}

                <div className="flex gap-4 justify-center text-sm text-slate-500">
                  <span>• Exhaustive Hypotheses</span>
                  <span>• Evidence Clusters</span>
                  <span>• Bayesian LRs</span>
                </div>
              </div>
            </div>
          )}

          {phase === AnalysisPhase.LOADING && (
            <div className="flex flex-col items-center justify-center min-h-screen">
              <Loader2 className="text-emerald-500 animate-spin mb-4" size={48} />
              <h2 className="text-xl font-medium text-slate-300">Conducting Intellectual Inquiry...</h2>
              <div className="mt-4 space-y-2 text-sm text-slate-500 text-center">
                <p className="animate-pulse">Mapping K₀ Assumptions...</p>
                <p className="animate-pulse delay-75">Generating Mutually Exclusive Hypotheses...</p>
                <p className="animate-pulse delay-150">Clustering Dependent Evidence...</p>
                <p className="animate-pulse delay-200">Grading Intellectual Honesty...</p>
              </div>
            </div>
          )}

          {phase === AnalysisPhase.ERROR && (
            <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
              <AlertCircle className="text-red-500 mb-4" size={48} />
              <h2 className="text-2xl font-bold text-slate-200 mb-2">Analysis Failed</h2>
              <p className="text-slate-400 max-w-md mb-8">{error}</p>
              <button 
                onClick={() => setPhase(AnalysisPhase.INPUT)}
                className="bg-slate-800 hover:bg-slate-700 px-6 py-3 rounded-lg text-slate-200 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {phase === AnalysisPhase.REPORT && report && (
            <AnalysisReportView report={report} onExport={handleExport} />
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
