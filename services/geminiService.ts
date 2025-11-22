
import { GoogleGenAI, Schema, Type } from "@google/genai";
import { AnalysisReport, Evidence, EvidenceCluster, RubricAssessment, BayesianStats } from "../types";

// --- SCHEMAS ---

const rubricDimensionSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        score: { type: Type.NUMBER, description: "Score from 1.0 to 4.0" },
        justification: { type: Type.STRING },
        strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
        improvements: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["score", "justification", "strengths", "improvements"]
};

// Phase 2 Schema (Structuring)
const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING, description: "The main topic or article title being analyzed." },
    k0: {
      type: Type.OBJECT,
      properties: {
        assumptions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of explicit assumptions made before analysis." },
        potential_biases: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of potential cognitive or institutional biases." },
        context: { type: Type.STRING, description: "Brief context setting the stage." }
      },
      required: ["assumptions", "potential_biases", "context"]
    },
    hypotheses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "Unique ID like H1, H2, H0" },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["primary", "secondary", "catch-all"] }
        },
        required: ["id", "title", "description", "type"]
      }
    },
    evidence_clusters: {
      type: Type.ARRAY,
      description: "Groups of dependent evidence (Thematic Clusters).",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING, description: "Name of the cluster (e.g., 'Inflation Data', 'Political Rhetoric')" },
          description: { type: Type.STRING, description: "Description of the dependency or theme shared by these items." },
          lrs_array: { 
            type: Type.ARRAY, 
            description: "PLACEHOLDER ONLY. Set value to 1.0. Values will be calculated in the next phase.",
            items: {
              type: Type.OBJECT,
              properties: {
                hypothesis_id: { type: Type.STRING },
                value: { type: Type.NUMBER }
              },
              required: ["hypothesis_id", "value"]
            }
          },
          items: {
             type: Type.ARRAY,
             items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    description: { type: Type.STRING, description: "The factual piece of evidence." },
                    source: { type: Type.STRING, description: "Origin of the evidence (e.g. NYT, BLS Report). Use 'General Context' if not specified." },
                    explanation: { type: Type.STRING, description: "Why this supports the cluster theme." }
                },
                required: ["id", "description", "source", "explanation"]
             }
          }
        },
        required: ["id", "name", "description", "lrs_array", "items"]
      }
    },
    rubric_assessment: {
        type: Type.OBJECT,
        description: "Grading based on Intellectual Honesty Assessment Framework.",
        properties: {
            evidence_handling: rubricDimensionSchema,
            argument_structure: rubricDimensionSchema,
            methodological_transparency: rubricDimensionSchema,
            reflexivity_revision: rubricDimensionSchema,
            total_score: { type: Type.NUMBER, description: "Weighted average (1.0 - 4.0)" },
            overall_assessment: { type: Type.STRING, description: "Brief summary of intellectual honesty level." }
        },
        required: ["evidence_handling", "argument_structure", "methodological_transparency", "reflexivity_revision", "total_score", "overall_assessment"]
    },
    reflexive_review: { type: Type.STRING, description: "Analysis of how the evidence challenged initial assumptions (K0)." },
    synthesis: { type: Type.STRING, description: "Synthesis of the findings." },
    final_conclusion: { type: Type.STRING, description: "Final verdict based on the evidence matrix." }
  },
  required: ["topic", "k0", "hypotheses", "evidence_clusters", "rubric_assessment", "reflexive_review", "synthesis", "final_conclusion"]
};

// Phase 3 Schema (Bayesian Scoring)
const bayesianScoringSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    clusters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          cluster_id: { type: Type.STRING },
          analysis: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                hypothesis_id: { type: Type.STRING },
                reasoning: { type: Type.STRING, description: "Concise logic linking evidence to hypothesis." },
                Q_i: { type: Type.NUMBER, description: "Prior Plausibility Ratio" },
                U_i: { type: Type.NUMBER, description: "Relative Likelihood" }
              },
              required: ["hypothesis_id", "reasoning", "Q_i", "U_i"]
            }
          }
        },
        required: ["cluster_id", "analysis"]
      }
    }
  },
  required: ["clusters"]
};

// --- TYPES FOR BAYESIAN LOGIC ---

interface BayesianPromptInput {
  topic: string;
  hypotheses: { id: string; description: string }[];
  clusters: { id: string; description: string }[];
}

interface CalculationResult {
  hypothesis_id: string;
  prior_P_H: number;         
  likelihood_P_E_H: number;  
  catchall_P_E_NotH: number; 
  LR: number;                
}

// --- UTILITIES ---

/**
 * Helper function to handle API rate limits (429) and server errors (503)
 * with exponential backoff.
 */
async function generateWithRetry(
    callFn: () => Promise<any>, 
    retries = 3, 
    delay = 2000
): Promise<any> {
    try {
        return await callFn();
    } catch (e: any) {
        const isRetryable = 
            e.status === 429 || 
            e.status === 503 || 
            (e.message && (e.message.includes('429') || e.message.includes('503') || e.message.includes('Resource has been exhausted')));

        if (retries > 0 && isRetryable) {
            console.warn(`Gemini API Rate Limit hit. Retrying in ${delay}ms... (${retries} left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return generateWithRetry(callFn, retries - 1, delay * 2);
        }
        throw e;
    }
}

const extractTextFromHtml = (html: string): string => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const junk = doc.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript');
        junk.forEach(el => el.remove());
        let text = doc.body.textContent || "";
        text = text.replace(/\s+/g, ' ').trim();
        return text;
    } catch (e) {
        console.warn("Failed to parse HTML", e);
        return "";
    }
};

const fetchUrlContent = async (url: string): Promise<string | null> => {
    try {
        console.log(`Attempting to fetch content for: ${url}`);
        const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
        const data = await response.json();
        
        if (data && data.contents) {
            const text = extractTextFromHtml(data.contents);
            if (text.length > 200) {
                console.log(`Successfully scraped ${text.length} chars.`);
                return text;
            }
        }
        return null;
    } catch (e) {
        console.warn("CORS proxy fetch failed, failing back to standard LLM retrieval.", e);
        return null;
    }
};

// --- BAYESIAN MATH IMPLEMENTATION ---

function processBayesianConfirmation(analysisData: { hypothesis_id: string, Q_i: number, U_i: number }[]): CalculationResult[] {
  const M = analysisData.length;

  // 1. Compute P(H_i) from Q_i
  // Formula: P(H_i) = Q_i / SUM(Q_j)
  const sumQ = analysisData.reduce((sum, item) => sum + item.Q_i, 0);
  // Avoid div by zero if all Q are 0 (unlikely from LLM)
  const safeSumQ = sumQ === 0 ? 1 : sumQ;
  
  const priors = analysisData.map(item => ({
    id: item.hypothesis_id,
    val: item.Q_i / safeSumQ
  }));

  const results: CalculationResult[] = [];

  for (let i = 0; i < M; i++) {
    const currentH = analysisData[i];
    const P_Hi = priors[i].val;
    const U_i = currentH.U_i;

    // 3. Compute U_~i (The weighted average of competing likelihoods)
    // Formula: SUM(w_j,i * U_j; j <> i)
    // where w_j,i = P(H_j) / (1 - P(H_i))
    
    let U_not_i = 0;
    
    const weightDenominator = 1 - P_Hi;

    if (weightDenominator <= 0.0001) {
        // If Prior is effectively 1, LR is undefined or 1. 
        // We default to 1.0 (neutral) to avoid breaking the chart.
      results.push({
        hypothesis_id: currentH.hypothesis_id,
        prior_P_H: P_Hi,
        likelihood_P_E_H: U_i,
        catchall_P_E_NotH: 0,
        LR: 1.0 
      });
      continue;
    }

    for (let j = 0; j < M; j++) {
      if (i === j) continue; // Skip self

      const P_Hj = priors[j].val;
      const U_j = analysisData[j].U_i;

      const w_j_i = P_Hj / weightDenominator;
      U_not_i += (w_j_i * U_j);
    }

    // 4. Compute LR(H_i; E)
    // Prevent div by zero
    const safe_U_not_i = U_not_i === 0 ? 0.001 : U_not_i;
    let LR = U_i / safe_U_not_i;
    
    // Cap LRs to reasonable bounds for the UI (e.g., 0.01 to 100)
    LR = Math.min(Math.max(LR, 0.001), 1000);

    results.push({
      hypothesis_id: currentH.hypothesis_id,
      prior_P_H: P_Hi,
      likelihood_P_E_H: U_i,
      catchall_P_E_NotH: U_not_i,
      LR: LR
    });
  }

  return results;
}

// --- MAIN ANALYSIS FLOW ---

export const analyzeTopic = async (input: string): Promise<AnalysisReport> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key is missing");

  const ai = new GoogleGenAI({ apiKey });

  // DETECT URL & ATTEMPT FETCH
  const isUrl = /^(http|https):\/\/[^ "]+$/.test(input);
  let scrapedContent = "";
  
  if (isUrl) {
      scrapedContent = (await fetchUrlContent(input)) || "";
  }

  // STEP 1: RESEARCH PHASE
  const researchSystemPrompt = `
    You are an expert analyst practicing "Intellectual Honesty". 
    Your goal is to critique a news article or analyze a topic using Bayesian process tracing and hermeneutics.
    
    ${scrapedContent ? 
      `CRITICAL INSTRUCTION: The user has provided a URL. 
       I have successfully retrieved the FULL TEXT of the article for you. 
       You MUST base your critique primarily on the following text content:
       
       --- BEGIN ARTICLE CONTENT ---
       ${scrapedContent.substring(0, 25000)}
       --- END ARTICLE CONTENT ---
       
       Use 'googleSearch' only to verify facts *external* to the article.` 
      : 
      `If the given topic is a URL, use 'googleSearch' to find the current date and try to retrieve details about the article. If it is a general topic, perform a DEEP DIVE investigation.`
    }
    
    Perform a DEEP DIVE investigation, reasoning as deeply as you can, step-by-step.
    
    REQUIRED OUTPUT STRUCTURE (Markdown):
    
    # 1. BACKGROUND (K0)
    - Assumptions: ...
    - Biases: ...
    - Context: ...
    
    # 2. HYPOTHESES (Mutually Exclusive & Exhaustive)
    - H1 (Primary): [Description]
    - H2 (Secondary): [Description]
    - H0 (Catch-all): [Description]
    
    # 3. EVIDENCE CLUSTERS (Crucial Section)
    (Group all found evidence into thematic clusters. Do NOT list isolated facts. Group them by theme.)
    
    ## Cluster: [Name, e.g., "Economic Indicators"]
    - Description: [Why these items are related/dependent]
    - EVIDENCE ITEMS:
       * [Source Name]: [Specific Fact/Quote/Stat] - [Explanation]
    
    # 4. INTELLECTUAL HONESTY RUBRIC GRADING
    (Grade the source/topic based on these 4 dimensions. Scale 1.0 to 4.0)
    1. Evidence Handling
    2. Argument Structure
    3. Methodological Transparency
    4. Reflexivity & Revision
    
    # 5. SYNTHESIS & CONCLUSION
    - Reflexive Review: Did we prove K0 wrong?
    - Final Verdict: ...
  `;

  let researchText = "";
  
  try {
      const researchResponse = await generateWithRetry(() => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Perform a comprehensive intellectual honesty analysis on the following topic: "${input}"`, 
        config: {
          systemInstruction: researchSystemPrompt,
          tools: [{ googleSearch: {} }],
        },
      }));
      researchText = researchResponse.text || "";
  } catch (e: any) {
      console.error("Research Phase Error:", e);
      throw new Error(`Phase 1 Failed: ${e.message || "Unknown API Error"}`);
  }

  if (!researchText) throw new Error("Failed to gather intelligence from Gemini (Empty Response).");

  // STEP 2: STRUCTURING PHASE
  // Note: We strictly separate Math from this phase. We just want the structure.
  const structuringPrompt = `
    You are a data formatter. Your job is to convert the provided RESEARCH REPORT into a structured JSON format.
    
    SOURCE REPORT:
    ${researchText}
    
    INSTRUCTIONS:
    1. Map "Background" to 'k0'.
    2. Map "Hypotheses" to 'hypotheses'.
    3. Map "Evidence Clusters" to 'evidence_clusters'. 
    4. IMPORTANT: Set all 'lrs_array' values to 1.0 for now. We will calculate them using a dedicated Bayesian engine in the next step.
    5. RUBRIC ASSESSMENT: Extract scores, justifications, strengths, and improvements.
    
    Return ONLY valid JSON matching the schema.
  `;

  let initialReport: AnalysisReport;
  try {
      const structureResponse = await generateWithRetry(() => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: structuringPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: analysisSchema,
        },
      }));
      
      const rawData = JSON.parse(structureResponse.text || "{}");
      
      // Transform lrs_array back to Record<string, number> and sanitize
      const evidence_clusters: EvidenceCluster[] = rawData.evidence_clusters?.map((cluster: any) => {
        const clusterLrs: Record<string, number> = {};
        // Placeholder init
        if (cluster.lrs_array) {
            cluster.lrs_array.forEach((lr: any) => clusterLrs[lr.hypothesis_id] = 1.0);
        }
        
        const items: Evidence[] = cluster.items?.map((item: any) => ({
            id: item.id || Math.random().toString(36).substr(2, 9),
            description: item.description || "No description",
            source: item.source || "Unknown Source",
            url: item.url,
            explanation: item.explanation || "",
            lrs: {} // Items inherit from cluster usually, leave empty for now
        })) || [];

        return {
            id: cluster.id || Math.random().toString(36).substr(2, 9),
            name: cluster.name || "Unnamed Cluster",
            description: cluster.description || "",
            lrs: clusterLrs,
            items: items
        };
    }) || [];

    const defaultDimension = { score: 2.5, justification: "Not evaluated", strengths: [], improvements: [] };
    const rubric: RubricAssessment = rawData.rubric_assessment || {
        evidence_handling: defaultDimension,
        argument_structure: defaultDimension,
        methodological_transparency: defaultDimension,
        reflexivity_revision: defaultDimension,
        total_score: 0,
        overall_assessment: "Assessment not available."
    };

    initialReport = {
      topic: rawData.topic || input,
      original_query: input,
      k0: rawData.k0 || { assumptions: [], potential_biases: [], context: "" },
      hypotheses: rawData.hypotheses || [],
      evidence_clusters: evidence_clusters,
      rubric_assessment: rubric,
      reflexive_review: rawData.reflexive_review || "No review generated.",
      synthesis: rawData.synthesis || "No synthesis generated.",
      final_conclusion: rawData.final_conclusion || "No conclusion generated.",
      generated_at: new Date().toISOString()
    };

  } catch (e: any) {
      console.error("Structuring Phase Error:", e);
      throw new Error(`Phase 2 Failed: ${e.message || "Unknown API Error"}`);
  }

  // STEP 3: BAYESIAN SCORING PHASE (Fitelson's Metric)
  try {
      const hypothesesList = initialReport.hypotheses
        .map((h) => `   - ID: "${h.id}"\n     Description: "${h.title} - ${h.description}"`)
        .join("\n\n");

      const clustersList = initialReport.evidence_clusters
        .map((c) => `   - Cluster ID: "${c.id}"\n     Name: "${c.name}"\n     Evidence Description: "${c.description}"`)
        .join("\n\n");

      const bayesianSystemPrompt = `
        You are an expert Bayesian Epistemologist engine. Your task is to evaluate a set of Evidence Clusters against a set of mutually exclusive Hypotheses.

        You will NOT calculate probabilities. You will assign raw semantic weights (Q and U) which will be processed by an external deterministic engine using Branden Fitelson's Confirmation Theory framework.

        ### THE INPUTS
        **Topic:** ${initialReport.topic}

        **Hypotheses (H_i):**
        ${hypothesesList}

        **Evidence Clusters (E_k):**
        ${clustersList}

        ---

        ### YOUR TASK
        For EACH Evidence Cluster provided above, evaluate it against EACH Hypothesis.
        
        ### DEFINITIONS AND SCALES

        #### 1. Q_i (Prior Plausibility Ratio)
        Represents the relative plausibility of the hypothesis *before* seeing this specific evidence cluster, compared to a generic baseline.
        *   **Scale:**
            *   1.0 = Standard / Plausible baseline.
            *   > 1.0 = Privileged prior (e.g., 2.0 is twice as plausible).
            *   < 1.0 = Implausible prior (e.g., 0.1 is unlikely).

        #### 2. U_i (Relative Likelihood)
        Represents P(E|H_i)/P_ref. This asks: "If this hypothesis were true, how expected is this evidence as compared to a reference P_ref?"
        *   **Scale:**
            *   **High (> 1.0):** The hypothesis strictly predicts this evidence. (e.g., 3 = Strong Prediction, 10 = Smoking Gun).
            *   **Neutral (1.0):** The evidence is irrelevant to the hypothesis.
            *   **Low (< 1.0):** The hypothesis makes this evidence surprising or anomalous. (e.g., 0.3 = Surprising, 0.01 = Falsifies).

        ### OUTPUT FORMAT
        Return JSON containing a list of clusters, where each cluster contains an analysis list for every hypothesis.
      `;

      const scoringResponse = await generateWithRetry(() => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Generate the Bayesian Q and U values for all clusters.",
        config: {
          systemInstruction: bayesianSystemPrompt,
          responseMimeType: "application/json",
          responseSchema: bayesianScoringSchema,
        },
      }));

      const scoringData = JSON.parse(scoringResponse.text || "{}");
      
      // Apply deterministic math and update report
      if (scoringData.clusters) {
          initialReport.evidence_clusters.forEach(cluster => {
              const clusterAnalysis = scoringData.clusters.find((c: any) => c.cluster_id === cluster.id);
              if (clusterAnalysis && clusterAnalysis.analysis) {
                  const mathResults = processBayesianConfirmation(clusterAnalysis.analysis);
                  
                  // Initialize Stats
                  cluster.stats = {};

                  // Update Cluster LRs and Stats
                  mathResults.forEach(res => {
                      cluster.lrs[res.hypothesis_id] = res.LR;
                      
                      // Populate intermediate stats for UI
                      if (cluster.stats) {
                        cluster.stats[res.hypothesis_id] = {
                            h_id: res.hypothesis_id,
                            p_h: res.prior_P_H,
                            p_e_h: res.likelihood_P_E_H,
                            p_e_not_h: res.catchall_P_E_NotH,
                            lr: res.LR
                        };
                      }
                  });

                  // Update item LRs to match cluster (context inheritance)
                  cluster.items.forEach(item => {
                      item.lrs = { ...cluster.lrs };
                  });
              }
          });
      }

  } catch (e: any) {
      console.error("Bayesian Scoring Phase Error:", e);
      // We do not throw here. If scoring fails, we return the report with neutral LRs (1.0).
      console.warn("Returning report with neutral Likelihood Ratios due to scoring failure.");
  }

  return initialReport;
};

export const chatWithAnalyst = async (context: AnalysisReport, history: {role: string, parts: {text: string}[]}[], newMessage: string) => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key is missing");
  
    const ai = new GoogleGenAI({ apiKey });
    
    const scores: Record<string, number> = {};
    context.evidence_clusters.forEach(cluster => {
        Object.entries(cluster.lrs).forEach(([hId, val]) => {
            scores[hId] = (scores[hId] || 1) * val;
        });
    });
    
    const contextPrompt = `
      You are an intellectually honest analyst discussing a specific report.
      
      REPORT CONTEXT:
      Topic: ${context.topic}
      Rubric Score: ${context.rubric_assessment?.total_score.toFixed(2) || 'N/A'}/4.0
      
      Hypotheses: 
      ${context.hypotheses.map(h => `- ${h.id}: ${h.title}`).join("\n")}
      
      Evidence Clusters & LRs (Fitelson Metric):
      ${context.evidence_clusters.map(c => `- ${c.name}: ${JSON.stringify(c.lrs)}`).join("\n")}
      
      Key Findings: ${context.final_conclusion}
      Cumulative Scores: ${JSON.stringify(scores)}
      
      USER QUERY: ${newMessage}
    `;

    const response = await generateWithRetry(async () => {
        const chat = ai.chats.create({
            model: "gemini-2.5-flash",
            config: { systemInstruction: contextPrompt },
            history: history
        });
        return await chat.sendMessage({ message: newMessage });
    });

    return response.text;
}
