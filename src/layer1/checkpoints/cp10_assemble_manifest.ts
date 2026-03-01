import * as fs from 'fs';
import * as path from 'path';
import { FileScanResult }           from './cp2_filescanner';
import { LanguageResult }           from './cp3_language_detector';
import { FrameworkResult }          from './cp4_framework_scanner';
import { EntryPointResult }         from './cp5_entrypoint_finder';
import { MetricsResult }            from './cp6_metrics';
import { ExecutionModelResult }     from './cp7_execution_model';
import { DependencyManifestResult } from './cp8_dependency_manifest';
import { DepthResult }              from './cp9_dependency_depth';

// ── Slim summaries for meta-data.json ──────────────────────────
interface DependencySummary {
    totalDirect:     number;
    totalTransitive: number;
    totalAll:        number;
    manifestsFound:  string[];
    lockFilesFound:  string[];
    directList:      string[]; // names only, no versions
}

interface DepthSummary {
    maxDepth:        number;
    avgDepth:        number;
    riskLevel:       'low' | 'medium' | 'high';
    riskReason:      string;
    transitiveRatio: number;
}

export interface Layer1Manifest {
    version:         string;
    timestamp:       string;
    workspacePath:   string;
    primaryLanguage: string;
    extensionCounts: Record<string, number>;
    executionModel:  ExecutionModelResult;
    languages:       LanguageResult;
    frameworks:      FrameworkResult;
    entryPoints:     EntryPointResult;
    metrics:         MetricsResult;
    dependencies:    DependencySummary;   // ← slim, not full list
    dependencyDepth: DepthSummary;        // ← slim, not full breakdown
}

export function runCheckpoint10(
    workspacePath:  string,
    scanResult:     FileScanResult,
    langResult:     LanguageResult,
    fwResult:       FrameworkResult,
    epResult:       EntryPointResult,
    metricsResult:  MetricsResult,
    execModel:      ExecutionModelResult,
    depManifest:    DependencyManifestResult,
    depDepth:       DepthResult,
    layer1Dir:      string
): Layer1Manifest {

    // Build slim dependency summary
    const dependencySummary: DependencySummary = {
        totalDirect:     depManifest.totalDirect,
        totalTransitive: depManifest.totalTransitive,
        totalAll:        depManifest.totalAll,
        manifestsFound:  depManifest.manifestsFound,
        lockFilesFound:  depManifest.lockFilesFound,
        directList:      depManifest.direct.map(d => d.name)  // names only
    };

    // Build slim depth summary
    const depthSummary: DepthSummary = {
        maxDepth:        depDepth.maxDepth,
        avgDepth:        depDepth.avgDepth,
        riskLevel:       depDepth.riskLevel,
        riskReason:      depDepth.riskReason,
        transitiveRatio: depDepth.transitiveRatio
    };

    const manifest: Layer1Manifest = {
        version:         '1.0.0',
        timestamp:       new Date().toISOString(),
        workspacePath,
        primaryLanguage: langResult.primary,
        extensionCounts: scanResult.extensionCounts,
        executionModel:  execModel,
        languages:       langResult,
        frameworks:      fwResult,
        entryPoints:     epResult,
        metrics:         metricsResult,
        dependencies:    dependencySummary,
        dependencyDepth: depthSummary
    };

    const outputPath = path.join(layer1Dir, 'meta-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

    console.log('AIL CP10 | meta-data.json assembled → .ail/layer1/meta-data.json');

    return manifest;
}