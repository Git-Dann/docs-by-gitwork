export type BriefConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface BriefKeyContact {
  name: string;
  role: string;
}

export interface BriefAnalysis {
  clientName: string | null;
  projectTitle: string | null;
  overview: string | null;
  goals: string[];
  deliverables: string[];
  timeline: string | null;
  budget: string | null;
  targetAudience: string | null;
  technicalRequirements: string[];
  successCriteria: string[];
  keyContacts: BriefKeyContact[];
  constraints: string[];
  confidence: BriefConfidence;
}

export interface AnalyseBriefRequest {
  brief: string;
}

export interface AnalyseBriefResponse {
  analysis: BriefAnalysis;
}
