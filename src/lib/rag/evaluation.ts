/**
 * Retrieval metrics. Pure functions, computed from actual retrieval output —
 * nothing here is ever estimated or hard-coded.
 */

function matches(retrieved: string, expected: string): boolean {
  const a = retrieved.toLowerCase();
  const b = expected.toLowerCase().trim();
  if (!b) return false;
  return a === b || a.endsWith(`/${b}`) || a.includes(b) || b.includes(a);
}

export interface RetrievalMetrics {
  hit: boolean;
  recall_at_k: number;
  precision_at_k: number;
  mrr: number;
}

export function computeRetrievalMetrics(
  retrievedPaths: string[],
  expectedPaths: string[],
): RetrievalMetrics {
  if (expectedPaths.length === 0) {
    return { hit: false, recall_at_k: 0, precision_at_k: 0, mrr: 0 };
  }

  const found = expectedPaths.filter((expected) =>
    retrievedPaths.some((retrieved) => matches(retrieved, expected)),
  );

  const relevantRetrieved = retrievedPaths.filter((retrieved) =>
    expectedPaths.some((expected) => matches(retrieved, expected)),
  );

  let mrr = 0;
  for (let i = 0; i < retrievedPaths.length; i++) {
    if (expectedPaths.some((expected) => matches(retrievedPaths[i]!, expected))) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  return {
    hit: found.length > 0,
    recall_at_k: found.length / expectedPaths.length,
    precision_at_k: retrievedPaths.length === 0 ? 0 : relevantRetrieved.length / retrievedPaths.length,
    mrr,
  };
}

export function average(values: (number | null | undefined)[]): number {
  const nums = values.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
