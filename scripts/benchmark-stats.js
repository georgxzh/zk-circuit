export function summarize(values) {
  if (!Array.isArray(values) || values.length === 0 ||
      values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Expected nonempty finite nonnegative observations');
  }
  const sorted = [...values].sort((a, b) => a-b);
  const n = sorted.length;
  const quantile = (q) => {
    const position = (n-1)*q, lower = Math.floor(position), upper = Math.ceil(position);
    return sorted[lower] + (sorted[upper]-sorted[lower])*(position-lower);
  };
  const mean = sorted.reduce((sum, value) => sum+value, 0)/n;
  return { n, min: sorted[0], median: quantile(0.5), mean, max: sorted[n-1],
    iqr: quantile(0.75)-quantile(0.25),
    sampleStdDev: n > 1 ? Math.sqrt(sorted.reduce((sum, value) => sum+(value-mean)**2, 0)/(n-1)) : null };
}

export function summarizeRecords(records, field) {
  return summarize(records.map((record) => record[field]));
}
