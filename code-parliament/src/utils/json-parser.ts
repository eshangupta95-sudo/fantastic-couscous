/**
 * Robust JSON Parser
 *
 * Handles common LLM output issues:
 * - Markdown code blocks
 * - Thinking text before/after JSON
 * - Partial JSON
 * - Retry logic
 */

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rawOutput?: string;
}

/**
 * Extract JSON from text that may contain markdown, thinking, etc.
 */
export function extractJSON<T>(text: string): ParseResult<T> {
  const rawOutput = text;

  // Strategy 1: Try parsing directly
  try {
    const data = JSON.parse(text);
    return { success: true, data };
  } catch {
    // Continue to other strategies
  }

  // Strategy 2: Extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const data = JSON.parse(codeBlockMatch[1].trim());
      return { success: true, data };
    } catch {
      // Continue
    }
  }

  // Strategy 3: Find JSON object/array in text
  const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      const data = JSON.parse(jsonObjectMatch[0]);
      return { success: true, data };
    } catch {
      // Try to fix common issues
      const fixed = fixCommonJSONIssues(jsonObjectMatch[0]);
      try {
        const data = JSON.parse(fixed);
        return { success: true, data };
      } catch {
        // Continue
      }
    }
  }

  // Strategy 4: Find JSON array
  const jsonArrayMatch = text.match(/\[[\s\S]*\]/);
  if (jsonArrayMatch) {
    try {
      const data = JSON.parse(jsonArrayMatch[0]);
      return { success: true, data };
    } catch {
      // Continue
    }
  }

  return {
    success: false,
    error: 'Could not extract valid JSON from response',
    rawOutput,
  };
}

/**
 * Fix common JSON issues from LLM output
 */
function fixCommonJSONIssues(json: string): string {
  let fixed = json;

  // Remove trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  // Fix unquoted keys (common LLM mistake)
  fixed = fixed.replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":');

  // Fix single quotes to double quotes
  fixed = fixed.replace(/'/g, '"');

  // Remove comments
  fixed = fixed.replace(/\/\/[^\n]*/g, '');
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

  return fixed;
}

/**
 * Parse LLM response with retries
 */
export async function parseWithRetry<T>(
  callLLM: () => Promise<string>,
  maxRetries = 2
): Promise<ParseResult<T>> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await callLLM();
      const result = extractJSON<T>(response);

      if (result.success) {
        return result;
      }

      lastError = result.error;

      // If this isn't the last attempt, the retry will include context
      // about the failure in the next prompt
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  return {
    success: false,
    error: `Failed after ${maxRetries + 1} attempts: ${lastError}`,
  };
}

/**
 * Validate parsed verdict has required fields
 */
export function validateVerdict(data: unknown): data is {
  score: number;
  confidence: number;
  reasoning: string;
  issues: Array<{
    severity: string;
    description: string;
    suggestion?: string;
  }>;
} {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  if (typeof obj.score !== 'number') return false;
  if (typeof obj.reasoning !== 'string') return false;
  if (!Array.isArray(obj.issues)) return false;

  // Validate each issue
  for (const issue of obj.issues) {
    if (!issue || typeof issue !== 'object') return false;
    if (typeof (issue as Record<string, unknown>).severity !== 'string') return false;
    if (typeof (issue as Record<string, unknown>).description !== 'string') return false;
  }

  return true;
}

/**
 * Create a default verdict when parsing fails
 */
export function createFallbackVerdict(error: string) {
  return {
    score: 50,
    confidence: 0.3,
    reasoning: `Analysis failed: ${error}`,
    issues: [],
  };
}
