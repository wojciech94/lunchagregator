import fc from 'fast-check';

// Configure fast-check with minimum 100 iterations per property test
fc.configureGlobal({
  numRuns: 100,
  verbose: fc.VerbosityLevel.VeryVerbose,
});

export { fc };
