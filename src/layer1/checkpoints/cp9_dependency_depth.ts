import * as fs from 'fs';
import * as path from 'path';
import { DependencyManifestResult, Dependency } from './cp8_dependency_manifest';

export interface DepthResult {
    maxDepth:        number;
    avgDepth:        number;
    riskLevel:       'low' | 'medium' | 'high';
    riskReason:      string;
    depthBreakdown:  Record<number, number>; // { 1: 23, 2: 45, 3: 12 } — count of deps at each depth
    deepestChains:   { name: string; depth: number }[]; // top 5 deepest
    transitiveRatio: number; // transitive / total (higher = more indirect deps)
}

export function runCheckpoint9(
    depResult:  DependencyManifestResult,
    analysisDir: string
): DepthResult {

    const directNames  = new Set(depResult.direct.map(d => d.name));
    const allDeps      = [...depResult.direct, ...depResult.transitive];
    const depthMap:    Record<string, number> = {};
    const depthBreakdown: Record<number, number> = {};

    // ----------------------------------------------------------------
    // Assign depths
    // Direct deps = depth 1
    // Transitive deps = depth 2+ (we don't have full tree from lock files
    // for all languages, so we use a heuristic based on available data)
    // ----------------------------------------------------------------

    for (const dep of depResult.direct) {
        depthMap[dep.name] = 1;
    }

    // For JS: package-lock.json has requires/dependencies structure
    // For others: transitive deps get depth 2 by default (conservative estimate)
    for (const dep of depResult.transitive) {
        if (!depthMap[dep.name]) {
            depthMap[dep.name] = 2;
        }
    }

    // Try to build deeper chains from package-lock.json if available
    // by checking if any transitive dep appears in another's dependencies
    if (depResult.transitive.length > 0) {
        let changed = true;
        let iterations = 0;

        // Simple iterative depth propagation (max 10 passes)
        while (changed && iterations < 10) {
            changed = false;
            iterations++;

            for (const dep of depResult.transitive) {
                const currentDepth = depthMap[dep.name] || 2;
                // If this dep is depended on by something at depth N,
                // it should be at depth N+1
                // (conservative — we use source field as a proxy)
                if (dep.source && depthMap[dep.source]) {
                    const newDepth = depthMap[dep.source] + 1;
                    if (newDepth > currentDepth) {
                        depthMap[dep.name] = newDepth;
                        changed = true;
                    }
                }
            }
        }
    }

    // Build depth breakdown
    for (const depth of Object.values(depthMap)) {
        depthBreakdown[depth] = (depthBreakdown[depth] || 0) + 1;
    }

    // Calculate stats
    const depths   = Object.values(depthMap);
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
    const avgDepth = depths.length > 0
        ? parseFloat((depths.reduce((a, b) => a + b, 0) / depths.length).toFixed(2))
        : 0;

    // Top 5 deepest chains
    const deepestChains = Object.entries(depthMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, depth]) => ({ name, depth }));

    // Transitive ratio
    const transitiveRatio = depResult.totalAll > 0
        ? parseFloat((depResult.totalTransitive / depResult.totalAll).toFixed(2))
        : 0;

    // Risk assessment
    let riskLevel:  'low' | 'medium' | 'high';
    let riskReason: string;

    if (maxDepth >= 6 || transitiveRatio >= 0.8) {
        riskLevel  = 'high';
        riskReason = maxDepth >= 6
            ? `Dependency chain reaches depth ${maxDepth} — deeply nested dependencies are fragile`
            : `${Math.round(transitiveRatio * 100)}% of dependencies are transitive — high indirect exposure`;
    } else if (maxDepth >= 4 || transitiveRatio >= 0.5) {
        riskLevel  = 'medium';
        riskReason = maxDepth >= 4
            ? `Dependency chain reaches depth ${maxDepth} — moderate nesting`
            : `${Math.round(transitiveRatio * 100)}% of dependencies are transitive`;
    } else {
        riskLevel  = 'low';
        riskReason = `Dependency chain depth of ${maxDepth} is shallow and manageable`;
    }

    const result: DepthResult = {
        maxDepth,
        avgDepth,
        riskLevel,
        riskReason,
        depthBreakdown,
        deepestChains,
        transitiveRatio
    };

    const outputPath = path.join(analysisDir, 'dependency_depth.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`AIL CP9 | Max depth: ${maxDepth} | Avg: ${avgDepth} | Risk: ${riskLevel}`);

    return result;
}