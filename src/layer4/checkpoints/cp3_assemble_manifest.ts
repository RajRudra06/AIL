import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeGraphResult } from './cp1_build_graph';
import { ArchitectureSummary } from './cp2_generate_summary';

export interface Layer4Manifest {
    version: string;
    timestamp: string;
    graph: KnowledgeGraphResult;
    summary: ArchitectureSummary;
    stats: {
        totalNodes: number;
        totalEdges: number;
        languages: string[];
        fileCount: number;
        entityCount: number;
        coreModules: number;
    };
}

/**
 * CP3: Assemble Layer 4 manifest.
 */
export function runCheckpoint3(
    graph: KnowledgeGraphResult,
    summary: ArchitectureSummary,
    layer4Dir: string
): Layer4Manifest {

    const manifest: Layer4Manifest = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        graph,
        summary,
        stats: {
            totalNodes: graph.stats.totalNodes,
            totalEdges: graph.stats.totalEdges,
            languages: summary.languages,
            fileCount: summary.fileCount,
            entityCount: summary.entityCount,
            coreModules: summary.coreModules.length,
        },
    };

    const outputPath = path.join(layer4Dir, 'meta-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

    console.log('AIL L4-CP3 | Layer 4 meta-data.json assembled');
    return manifest;
}
