// Shared types for the study agent pipeline

export interface PlanQuestion {
  text: string;
  personaIds: string[];
  turnType: "single" | "sequenced_flow";
  rationale: string;
}

export interface ResearchPlanOutput {
  questions: PlanQuestion[];
}

export interface PersonaInterviewResponse {
  spoken: string;
  sentiment: "positive" | "neutral" | "negative" | "frustrated" | "confused" | "delighted";
  painPoints: string[];
  delights: string[];
  confusionPoints: string[];
}

export interface FollowUp {
  question: string;
  rationale: string;
}

export interface FollowUpsOutput {
  followUps: FollowUp[];
}

// A single exchange: question + response + optional follow-ups
export interface TurnExchange {
  question: string;
  response: PersonaInterviewResponse;
  isFollowUp: boolean;
  depth: number;
}

export interface TurnSynthesis {
  summary: string;
  keyInsights: string[];
  sentimentDistribution: Record<string, number>;
  commonPainPoints: string[];
  commonDelights: string[];
}

export interface StudyTurn {
  questionText: string;
  exchanges: TurnExchange[];
  synthesis?: TurnSynthesis;
}

export interface SessionSynthesis {
  personaId: string;
  personaName: string;
  overallSentiment: string;
  keyThemes: string[];
  topPainPoints: string[];
  topDelights: string[];
  notableQuotes: string[];
  summary: string;
}

export interface StudyReportSection {
  title: string;
  content: string;
}

export interface StudyReportPayload {
  executiveSummary: string;
  keyFindings: string[];
  themes: Array<{ theme: string; description: string; personaIds: string[] }>;
  perPersonaFindings: Array<{
    personaId: string;
    personaName: string;
    summary: string;
    topInsights: string[];
  }>;
  recommendations: Array<{ title: string; rationale: string; priority: "HIGH" | "MEDIUM" | "LOW" }>;
  openQuestions: string[];
}

// Shape stored in StudySession.transcriptData
export interface SessionTranscript {
  sessionId: string;
  personaId: string;
  personaName: string;
  status: "pending" | "running" | "completed" | "failed";
  turns: StudyTurn[];
  synthesis?: SessionSynthesis;
}
