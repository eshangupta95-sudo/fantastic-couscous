import { AgentVerdict, Issue } from '../cache/types.js';
import { ParliamentConfig } from '../config/index.js';

export interface AgentVerdicts {
  architect: AgentVerdict;
  critic: AgentVerdict;
  pragmatist: AgentVerdict;
}

export interface VotingResult {
  finalScore: number;
  finalVerdict: string;
  consensus: boolean;
  dissent: string[];
  weightedScores: {
    architect: number;
    critic: number;
    pragmatist: number;
  };
}

export function calculateWeightedScore(
  verdicts: AgentVerdicts,
  weights: ParliamentConfig['weights']
): VotingResult {
  const totalWeight = weights.architect + weights.critic + weights.pragmatist;

  const weightedScores = {
    architect: verdicts.architect.score * weights.architect,
    critic: verdicts.critic.score * weights.critic,
    pragmatist: verdicts.pragmatist.score * weights.pragmatist,
  };

  const finalScore = Math.round(
    (weightedScores.architect + weightedScores.critic + weightedScores.pragmatist) /
      totalWeight
  );

  // Check for consensus (all agents within 15 points of each other)
  const scores = [
    verdicts.architect.score,
    verdicts.critic.score,
    verdicts.pragmatist.score,
  ];
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const consensus = maxScore - minScore <= 15;

  // Find dissenting opinions
  const dissent: string[] = [];
  const avgScore = (scores[0] + scores[1] + scores[2]) / 3;

  if (Math.abs(verdicts.architect.score - avgScore) > 15) {
    dissent.push(
      `Architect ${verdicts.architect.score > avgScore ? 'more optimistic' : 'more critical'}: ${verdicts.architect.reasoning}`
    );
  }
  if (Math.abs(verdicts.critic.score - avgScore) > 15) {
    dissent.push(
      `Critic ${verdicts.critic.score > avgScore ? 'more lenient' : 'more harsh'}: ${verdicts.critic.reasoning}`
    );
  }
  if (Math.abs(verdicts.pragmatist.score - avgScore) > 15) {
    dissent.push(
      `Pragmatist ${verdicts.pragmatist.score > avgScore ? 'more positive' : 'more negative'}: ${verdicts.pragmatist.reasoning}`
    );
  }

  // Generate final verdict
  const finalVerdict = generateVerdict(finalScore, verdicts, consensus);

  return {
    finalScore,
    finalVerdict,
    consensus,
    dissent,
    weightedScores,
  };
}

function generateVerdict(
  score: number,
  verdicts: AgentVerdicts,
  consensus: boolean
): string {
  let verdict = '';

  if (score >= 95) {
    verdict = 'Excellent code. Parliament approves unanimously.';
  } else if (score >= 85) {
    verdict = 'Good code with minor suggestions.';
  } else if (score >= 70) {
    verdict = 'Acceptable code but improvements recommended.';
  } else if (score >= 50) {
    verdict = 'Code needs attention before shipping.';
  } else {
    verdict = 'Significant issues found. Refactoring recommended.';
  }

  if (!consensus) {
    verdict += ' (Agents disagree - see dissenting opinions)';
  }

  return verdict;
}

export function mergeIssues(verdicts: AgentVerdicts): Issue[] {
  const allIssues: Issue[] = [
    ...verdicts.architect.issues.map((i) => ({ ...i, agent: 'architect' })),
    ...verdicts.critic.issues.map((i) => ({ ...i, agent: 'critic' })),
    ...verdicts.pragmatist.issues.map((i) => ({ ...i, agent: 'pragmatist' })),
  ];

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Deduplicate similar issues (by category and similar description)
  const seen = new Set<string>();
  const unique: Issue[] = [];

  for (const issue of allIssues) {
    const key = `${issue.category}-${issue.line || 'no-line'}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(issue);
    }
  }

  return unique;
}

export function generateSuggestions(
  verdicts: AgentVerdicts,
  config: ParliamentConfig
): string[] {
  const suggestions: string[] = [];
  const allIssues = mergeIssues(verdicts);

  // Get top issues by severity
  const criticalIssues = allIssues.filter((i) => i.severity === 'critical');
  const highIssues = allIssues.filter((i) => i.severity === 'high');

  for (const issue of [...criticalIssues, ...highIssues].slice(0, 5)) {
    if (issue.suggestion) {
      suggestions.push(issue.suggestion);
    }
  }

  // Add agent-specific suggestions if they agree
  const scores = [
    { agent: 'architect', score: verdicts.architect.score },
    { agent: 'critic', score: verdicts.critic.score },
    { agent: 'pragmatist', score: verdicts.pragmatist.score },
  ];

  const lowestScorer = scores.sort((a, b) => a.score - b.score)[0];

  if (lowestScorer.score < 70) {
    const verdict = verdicts[lowestScorer.agent as keyof AgentVerdicts];
    if (verdict.issues.length > 0 && verdict.issues[0].suggestion) {
      const topSuggestion = `[${lowestScorer.agent}] ${verdict.issues[0].suggestion}`;
      if (!suggestions.includes(topSuggestion)) {
        suggestions.unshift(topSuggestion);
      }
    }
  }

  return suggestions.slice(0, 5);
}
