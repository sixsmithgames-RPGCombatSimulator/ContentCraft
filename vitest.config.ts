import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Bound competing transforms/fixtures on high-core development hosts.
    // Keep the default test timeouts and the complete discovered test set.
    maxWorkers: 4,
  },
});
