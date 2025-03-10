// Interfaces for Go benchmark data
export interface BenchmarkMetadata {
  goos: string;
  goarch: string;
  pkg: string;
  cpu: string;
}

export interface BenchmarkResult {
  name: string;
  runs: BenchmarkRun[];
}

export interface Metric {
  name: string;
  value: number;
}

export interface BenchmarkRun {
  iterations: number;
  metrics?: Metric[];
  params: Map<string, string | undefined>;
}

/**
 * Parses Go benchmark output into structured data
 * @param content The raw benchmark output text
 * @returns Parsed benchmark data
 */
export function parseGoBenchmarkOutput(content: string): { metadata: BenchmarkMetadata, results: BenchmarkResult[] } {
  const lines = content.split('\n');

  // Parse metadata (goos, goarch, pkg, cpu)
  const metadata: BenchmarkMetadata = {
    goos: '',
    goarch: '',
    pkg: '',
    cpu: ''
  };

  // Map to group benchmark runs by name
  const benchmarkMap = new Map<string, BenchmarkResult>();

  // Process each line
  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    // Parse metadata lines
    if (line.startsWith('goos:')) {
      metadata.goos = line.replace('goos:', '').trim();
      continue
    }

    if (line.startsWith('goarch:')) {
      metadata.goarch = line.replace('goarch:', '').trim();
      continue
    }

    if (line.startsWith('pkg:')) {
      metadata.pkg = line.replace('pkg:', '').trim();
      continue
    }
    if (line.startsWith('cpu:')) {
      metadata.cpu = line.replace('cpu:', '').trim();
      continue
    }
    // Skip "PASS" or "FAIL" lines
    if (line.startsWith('PASS') || line.startsWith('FAIL') || line.startsWith('ok')) {
      continue;
    }
    // Parse benchmark result lines
    if (line.startsWith('Benchmark')) {
      // Example: BenchmarkTest/1-16  	63453842	        19.34 ns/op	         1.000 size	       1 B/op	       1 allocs/op
      const parts = line.trim().split(/\s+/);

      const fullName = parts[0];
      const iterations = parseInt(parts[1].replace(/,/g, ''), 10);

      // Extract the base name and parameters from the benchmark name
      // Format is typically: BenchmarkName/param1/param2-N where N is GOMAXPROCS
      const nameMatch = fullName.match(/^(Benchmark[^/]+)\/(.*)-(.*)$/);
      const baseName = nameMatch ? nameMatch[1] : fullName;

      // Create a new benchmark result if not exists
      if (!benchmarkMap.has(baseName)) {
        benchmarkMap.set(baseName, {
          name: baseName,
          runs: []
        });
      }

      // Parse the metrics
      const run: BenchmarkRun = {
        iterations: iterations,
        metrics: [],
        params: new Map<string, string>()
      };

      // Process the remaining parts to extract the metrics
      for (let i = 2; i < parts.length; i += 2) {
        run.metrics?.push({
          name: parts[i + 1],
          value: parseFloat(parts[i])
        })
      }

      // Extract parameters if any (like "1" in BenchmarkTest/1-16)
      run.params.set("name", nameMatch?.[2])
      run.params.set("cpus", nameMatch?.[3])

      // Add this run to the appropriate benchmark
      benchmarkMap.get(baseName)?.runs.push(run);
    }
  }

  // Convert the map to an array
  const results = Array.from(benchmarkMap.values());

  return { metadata, results };
}