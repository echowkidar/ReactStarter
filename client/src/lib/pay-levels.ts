export const PAY_LEVELS = [
  "L-1", "L-2", "L-3", "L-4", "L-5", "L-6", "L-7", "L-8", "L-9", "L-10", "AL-10", "L-11",
"AL-11", "L-12", "AL-12", "L-13", "L-13A", "L-14", "AL-14", "L-0" // Default level
] as const;

export type PayLevel = typeof PAY_LEVELS[number];

// Function to get pay level order for sorting (higher levels first)
export function getPayLevelOrder(payLevel: string | null): number {
  if (!payLevel || payLevel === "L-0") return 0; // Lowest priority for null or L-0
  
  // Try to match the pattern L-XX
  const match = payLevel.match(/L-(\d+)/);
  if (match) {
    return parseInt(match[1]); // Return the numeric part
  }
  
  // Fallback to array index-based lookup
  const index = PAY_LEVELS.indexOf(payLevel as any);
  return index === -1 ? 0 : PAY_LEVELS.length - index;
}

