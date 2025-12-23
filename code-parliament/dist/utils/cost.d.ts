export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
}
export interface CostResult {
    inputCost: number;
    outputCost: number;
    totalCost: number;
}
export declare function calculateCost(model: string, usage: TokenUsage): CostResult;
export declare function formatCost(cost: number): string;
//# sourceMappingURL=cost.d.ts.map