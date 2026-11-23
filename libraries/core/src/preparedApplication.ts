export type PreparedApplication = {
  masterCv: string;
  resume: string;
  coverLetter: string;
  changes: Array<{
    wording: string;
    requirement: string;
    evidence: string;
    reason: string;
  }>;
  unsupported: string[];
  answers: Array<{ question: string; answer: string }>;
};
