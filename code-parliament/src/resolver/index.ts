import { AgentVerdict, FileVerdict, Issue, Debate, DebateMessage } from '../cache/types.js';
import { ParliamentConfig } from '../config/index.js';
import {
  AgentVerdicts,
  VotingResult,
  calculateWeightedScore,
  mergeIssues,
  generateSuggestions,
} from './voting.js';
import { logger } from '../utils/logger.js';

const log = logger.child('resolver');

export interface ResolverResult {
  verdict: FileVerdict;
  debate?: Debate;
  iterations: number;
}

export class ConflictResolver {
  private config: ParliamentConfig;

  constructor(config: ParliamentConfig) {
    this.config = config;
  }

  resolve(
    filePath: string,
    fileHash: string,
    verdicts: AgentVerdicts
  ): FileVerdict {
    const votingResult = calculateWeightedScore(verdicts, this.config.weights);
    const issues = mergeIssues(verdicts);
    const suggestions = generateSuggestions(verdicts, this.config);

    // Check for deadlock (extreme disagreement)
    const isDeadlock = this.detectDeadlock(verdicts);

    if (isDeadlock) {
      log.warn(`Deadlock detected for ${filePath}, using ${this.config.safeguards.deadlockResolution} as tiebreaker`);
      return this.resolveDeadlock(filePath, fileHash, verdicts, issues, suggestions);
    }

    return {
      filePath,
      fileHash,
      architect: verdicts.architect,
      critic: verdicts.critic,
      pragmatist: verdicts.pragmatist,
      finalScore: votingResult.finalScore,
      finalVerdict: votingResult.finalVerdict,
      suggestions,
    };
  }

  private detectDeadlock(verdicts: AgentVerdicts): boolean {
    const scores = [
      verdicts.architect.score,
      verdicts.critic.score,
      verdicts.pragmatist.score,
    ];

    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    // Deadlock if spread is more than 40 points
    return maxScore - minScore > 40;
  }

  private resolveDeadlock(
    filePath: string,
    fileHash: string,
    verdicts: AgentVerdicts,
    issues: Issue[],
    suggestions: string[]
  ): FileVerdict {
    const tiebreaker = this.config.safeguards.deadlockResolution;
    const tiebreakerVerdict = verdicts[tiebreaker];

    // Weight the tiebreaker's opinion more heavily
    const adjustedScore = Math.round(
      (tiebreakerVerdict.score * 0.5 +
        verdicts.architect.score * 0.2 +
        verdicts.critic.score * 0.2 +
        verdicts.pragmatist.score * 0.1)
    );

    return {
      filePath,
      fileHash,
      architect: verdicts.architect,
      critic: verdicts.critic,
      pragmatist: verdicts.pragmatist,
      finalScore: adjustedScore,
      finalVerdict: `Deadlock resolved by ${tiebreaker}. ${tiebreakerVerdict.reasoning}`,
      suggestions: [
        `[Deadlock] Agents disagreed significantly. ${tiebreaker} was used as tiebreaker.`,
        ...suggestions,
      ],
    };
  }

  generateDebate(
    filePath: string,
    topic: string,
    verdicts: AgentVerdicts
  ): Debate {
    const transcript: DebateMessage[] = [];
    const now = new Date().toISOString();

    // Opening statements
    transcript.push({
      agent: 'architect',
      message: `As the Architect, I rate this ${verdicts.architect.score}/100. ${verdicts.architect.reasoning}`,
      timestamp: now,
    });

    transcript.push({
      agent: 'critic',
      message: `As the Critic, I rate this ${verdicts.critic.score}/100. ${verdicts.critic.reasoning}`,
      timestamp: now,
    });

    transcript.push({
      agent: 'pragmatist',
      message: `As the Pragmatist, I rate this ${verdicts.pragmatist.score}/100. ${verdicts.pragmatist.reasoning}`,
      timestamp: now,
    });

    // Rebuttals based on disagreements
    const avgScore =
      (verdicts.architect.score + verdicts.critic.score + verdicts.pragmatist.score) / 3;

    if (verdicts.architect.score > avgScore + 10) {
      transcript.push({
        agent: 'critic',
        message: `I disagree with the Architect's optimism. They're overlooking potential issues.`,
        timestamp: now,
      });
    }

    if (verdicts.critic.score < avgScore - 10) {
      transcript.push({
        agent: 'pragmatist',
        message: `The Critic is being too harsh. This code works and is maintainable.`,
        timestamp: now,
      });
    }

    if (verdicts.pragmatist.score > verdicts.architect.score + 10) {
      transcript.push({
        agent: 'architect',
        message: `The Pragmatist is dismissing important architectural concerns.`,
        timestamp: now,
      });
    }

    // Resolution
    const votingResult = calculateWeightedScore(verdicts, this.config.weights);
    const resolution = votingResult.consensus
      ? 'The Parliament has reached consensus.'
      : `Resolution by weighted voting: ${votingResult.finalScore}/100`;

    return {
      filePath,
      topic,
      transcript,
      resolution,
    };
  }

  updateConfig(config: ParliamentConfig): void {
    this.config = config;
  }
}

export * from './voting.js';
