/**
 * Parser for benchstat output format
 */

// Define interfaces for benchstat data
export interface BenchstatMetadata {
    pkg: string;
    goarch: string;
    goos: string;
    note?: string;
}

export interface BenchstatImplementation {
    name: string;
    isBase: boolean;
}

export interface BenchstatMetric {
    name: string;
    unit: string;
}

export interface BenchmarkValueWithStats {
    value: number;
    unit: string; // e.g., n, µ, Mi, Gi
    uncertainty?: number; // e.g., ± 2%
    baselineDelta?: number; // e.g., -63.29%
    confidence?: string; // e.g., (p=0.000 n=10)
}

export interface BenchstatSizeResult {
    size: string; // e.g., "15", "1kB"
    values: {
        [metricName: string]: { // e.g., "sec/op", "B/s"
            [implementation: string]: BenchmarkValueWithStats;
        };
    };
}

export interface BenchstatData {
    metadata: BenchstatMetadata;
    implementations: string[]; // List of implementation names
    baseImplementation: string; // Name of the baseline implementation
    metrics: string[]; // List of metric names (e.g., "sec/op", "B/s")
    results: BenchstatSizeResult[];
}

/**
 * Parses benchstat output into structured data
 * @param content The raw benchstat output text
 * @returns Parsed benchstat data
 */
export function parseBenchstatOutput(content: string): BenchstatData {
    const lines = content.split('\n');
    
    // Initialize metadata
    const metadata: BenchstatMetadata = {
        pkg: '',
        goarch: '',
        goos: '',
        note: ''
    };
    
    // Initialize other data structures
    const implementations: string[] = [];
    const metrics: string[] = [];
    const results: BenchstatSizeResult[] = [];
    
    let currentLine = 0;
    let currentMetric = '';
    
    // Parse metadata lines
    while (currentLine < lines.length && !lines[currentLine].includes('│')) {
        const line = lines[currentLine].trim();
        if (line.startsWith('pkg:')) {
            metadata.pkg = line.replace('pkg:', '').trim();
        } else if (line.startsWith('goarch:')) {
            metadata.goarch = line.replace('goarch:', '').trim();
        } else if (line.startsWith('goos:')) {
            metadata.goos = line.replace('goos:', '').trim();
        } else if (line.startsWith('note:')) {
            metadata.note = line.replace('note:', '').trim();
        }
        currentLine++;
    }
    
    // Process the file section by section
    while (currentLine < lines.length) {
        // Skip empty lines
        if (lines[currentLine].trim() === '') {
            currentLine++;
            continue;
        }
        
        // Check if this is a header line (contains │)
        if (lines[currentLine].includes('│')) {
            // This is a header line, followed by a units line
            const headerLine = lines[currentLine++];
            const unitsLine = lines[currentLine++];
            
            // Extract implementation names from the header line
            const implNames = extractImplementationNames(headerLine);
            
            // If this is the first header we're processing, set the implementations
            if (implementations.length === 0) {
                implementations.push(...implNames);
            }
            
            // Extract metric names from the units line
            const metricUnits = extractColumnValues(unitsLine);
            
            // Set the current metric
            if (metricUnits.length > 0) {
                currentMetric = metricUnits[0].trim();
                
                // Add metric to the metrics list if it's not already there
                if (!metrics.includes(currentMetric)) {
                    metrics.push(currentMetric);
                }
            }
            
            continue;
        }
        
        // If we're not in a header line, this is a data line
        const line = lines[currentLine++];
        
        // Skip geomean lines
        if (line.trim().startsWith('geomean')) {
            continue;
        }
        
        // Parse the data line
        // First part is usually the size (like "15", "1kB")
        // Rest of the line contains values for each implementation
        
        // Extract the size
        const size = line.trim().split(/\s+/)[0];
        if (!size) continue;
        
        // Find or create a result for this size
        let sizeResult = results.find(r => r.size === size);
        if (!sizeResult) {
            sizeResult = {
                size,
                values: {}
            };
            results.push(sizeResult);
        }
        
        // Ensure we have an entry for the current metric
        if (!sizeResult.values[currentMetric]) {
            sizeResult.values[currentMetric] = {};
        }
        
        // For benchstat format, we need a different approach to extract values
        // The data line looks something like:
        // 15        44.40n ± 2%   16.30n ± 2%  -63.29% (p=0.000 n=10)     35.60n ± 1%    -19.82% (p=0.000 n=10)
        
        // First, let's split the line by the size to get everything after it
        const afterSize = line.substring(line.indexOf(size) + size.length).trim();
        
        // Now parse the implementation values
        const implValues = parseImplementationValuesFromLine(afterSize, implementations);
        
        // Add the parsed values to our result
        Object.entries(implValues).forEach(([impl, value]) => {
            if (value) {
                sizeResult!.values[currentMetric][impl] = value;
            }
        });
    }
    
    return {
        metadata,
        implementations,
        // First implementation is considered the baseline
        baseImplementation: implementations.length > 0 ? implementations[0] : '',
        metrics,
        results
    };
}

/**
 * Extracts implementation names from the header line
 * @param headerLine The header line containing implementation names
 * @returns Array of implementation names
 */
function extractImplementationNames(headerLine: string): string[] {
    const implementations: string[] = [];
    const parts = headerLine.split('│');
    
    // Skip the first empty part
    for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim();
        if (part !== '') {
            // In benchstat, each implementation typically spans multiple columns
            // Example: "IEEE" spans 1 column, "Castagnoli" spans 2 columns (for value and delta)
            // We need to extract the implementation name without duplicates
            
            // Skip if this implementation is already added
            // (implementation names are centered in their columns)
            if (!implementations.includes(part)) {
                implementations.push(part);
            }
        }
    }
    
    return implementations;
}

/**
 * Extracts column values from a header line
 * @param line Header line with column separators (│)
 * @returns Array of column values
 */
function extractColumnValues(line: string): string[] {
    const columns: string[] = [];
    const parts = line.split('│');
    
    // Skip the first part (before the first │) as it's usually empty
    for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim();
        if (part !== '') {
            columns.push(part);
        }
    }
    
    return columns;
}

/**
 * Parses implementation values from a data line after the size
 * @param dataLine Line of data after the size 
 * @param implementations List of implementation names
 * @returns Object mapping implementation names to their parsed values
 */
function parseImplementationValuesFromLine(
    dataLine: string, 
    implementations: string[]
): Record<string, BenchmarkValueWithStats | null> {
    const result: Record<string, BenchmarkValueWithStats | null> = {};
    
    // Initialize all implementations to null
    implementations.forEach(impl => {
        result[impl] = null;
    });
    
    // For benchstat format, we have multiple implementation measurements on each line
    // We need to carefully extract each one
    
    // Regex to match a value measurement with uncertainty
    // Examples: "44.40n ± 2%", "16.30n ± 2%", "1.218µ ± 2%"
    const valueRegex = /(\d+(?:\.\d+)?)([nµm]|Mi|Gi|Ti|Ki)(?:\s*±\s*(\d+)%)?/g;
    
    // Regex to match a delta percentage (+/- followed by number and %)
    // Examples: "-63.29%", "+172.18%"
    const deltaRegex = /([+-]\d+(?:\.\d+)?)%/g;
    
    // Regex to match confidence info in parentheses
    // Example: "(p=0.000 n=10)"
    const confidenceRegex = /\(([^)]+)\)/g;
    
    // Find all value matches
    const valueMatches = [...dataLine.matchAll(valueRegex)];
    
    // Find all delta matches
    const deltaMatches = [...dataLine.matchAll(deltaRegex)];
    
    // Find all confidence matches
    const confidenceMatches = [...dataLine.matchAll(confidenceRegex)];
    
    // The first value is for the first implementation (base)
    if (implementations.length > 0 && valueMatches.length > 0) {
        // Get the base implementation's value
        const baseMatch = valueMatches[0];
        const baseValue = parseFloat(baseMatch[1]);
        const baseUnit = baseMatch[2];
        const baseUncertainty = baseMatch[3] ? parseFloat(baseMatch[3]) : undefined;
        
        result[implementations[0]] = {
            value: baseValue,
            unit: baseUnit,
            uncertainty: baseUncertainty
        };
        
        // Get the other implementations' values
        // In benchstat, they appear in sequence, with deltaIndex matching the implementation index
        let deltaIndex = 0;
        
        for (let i = 1; i < implementations.length && i < valueMatches.length; i++) {
            const valueMatch = valueMatches[i];
            const value = parseFloat(valueMatch[1]);
            const unit = valueMatch[2];
            const uncertainty = valueMatch[3] ? parseFloat(valueMatch[3]) : undefined;
            
            // Find delta and confidence for this implementation
            let delta: number | undefined = undefined;
            let confidence: string | undefined = undefined;
            
            // Match delta with implementation (each non-base impl has 1 delta)
            if (deltaIndex < deltaMatches.length) {
                delta = parseFloat(deltaMatches[deltaIndex][1]);
                deltaIndex++;
            }
            
            // Match confidence with implementation (each non-base impl has 1 confidence)
            if (i - 1 < confidenceMatches.length) {
                confidence = confidenceMatches[i - 1][1];
            }
            
            // Store the value
            result[implementations[i]] = {
                value,
                unit,
                uncertainty,
                baselineDelta: delta,
                confidence
            };
        }
    }
    
    return result;
}
