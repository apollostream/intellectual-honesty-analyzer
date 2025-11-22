
export interface Hypothesis {
  id: string;
  title: string;
  description: string;
  type: 'primary' | 'secondary' | 'catch-all';
}

export interface BayesianStats {
  h_id: string;
  p_h: number;      // Prior P(H)
  p_e_h: number;    // P(E|H) - The semantic likelihood
  p_e_not_h: number;// P(E|~H) - The weighted average of competing likelihoods
  lr: number;       // The resulting ratio
}

export interface Evidence {
  id: string;
  description: string;
  source: string;
  url?: string;
  // Map hypothesis ID to a Likelihood Ratio value (e.g., 0.1 to 10)
  // For items within a cluster, this is context, not the main math driver.
  lrs: Record<string, number>; 
  explanation: string;
}

export interface EvidenceCluster {
  id: string;
  name: string;
  description: string;
  // The aggregate Likelihood Ratios for this cluster of dependent evidence
  lrs: Record<string, number>; 
  // Detailed intermediate stats from Fitelson Metric
  stats?: Record<string, BayesianStats>;
  items: Evidence[];
}

export interface BackgroundKnowledge {
  assumptions: string[];
  potential_biases: string[];
  context: string;
}

export interface RubricDimension {
  score: number;
  justification: string;
  strengths: string[];
  improvements: string[];
}

export interface RubricAssessment {
  evidence_handling: RubricDimension;
  argument_structure: RubricDimension;
  methodological_transparency: RubricDimension;
  reflexivity_revision: RubricDimension;
  total_score: number;
  overall_assessment: string;
}

export interface AnalysisReport {
  topic: string;
  original_query: string; // The verbatim input prompt
  k0: BackgroundKnowledge;
  hypotheses: Hypothesis[];
  evidence_clusters: EvidenceCluster[];
  rubric_assessment: RubricAssessment;
  reflexive_review: string;
  synthesis: string;
  final_conclusion: string;
  generated_at: string;
}

export enum AnalysisPhase {
  INPUT = 'INPUT',
  LOADING = 'LOADING',
  REPORT = 'REPORT',
  ERROR = 'ERROR'
}
