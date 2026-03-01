import * as fs from 'fs';
import * as path from 'path';
import { EntityResult } from './cp2_entity_extractor';
import { ImportResult } from './cp3_import_mapper';
import { CallGraphResult } from './cp4_call_graph';
import { RelationshipResult } from './cp5_relationships';
import { ComplexityResult } from './cp6_complexity';

export interface Layer2Manifest {
    version: string;
    timestamp: string;
    entities: EntityResult;
    imports: ImportResult;
    callGraph: CallGraphResult;
    relationships: RelationshipResult;
    complexity: ComplexityResult;
    summary: {
        totalEntities: number;
        totalCallEdges: number;
        totalImportEdges: number;
        totalRelationships: number;
        avgComplexity: number;
        complexFunctionCount: number;
        externalDepsCount: number;
    };
}

/**
 * CP7: Assemble all Layer 2 checkpoint outputs into a single manifest.
 */
export function runCheckpoint7(
    entityResult: EntityResult,
    importResult: ImportResult,
    callGraphResult: CallGraphResult,
    relationshipResult: RelationshipResult,
    complexityResult: ComplexityResult,
    layer2Dir: string
): Layer2Manifest {

    const manifest: Layer2Manifest = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        entities: entityResult,
        imports: importResult,
        callGraph: callGraphResult,
        relationships: relationshipResult,
        complexity: complexityResult,
        summary: {
            totalEntities: entityResult.totalCount,
            totalCallEdges: callGraphResult.totalEdges,
            totalImportEdges: importResult.totalEdges,
            totalRelationships: relationshipResult.totalCount,
            avgComplexity: complexityResult.avgCyclomatic,
            complexFunctionCount: complexityResult.complexFunctions.length,
            externalDepsCount: importResult.externalDeps.length,
        },
    };

    const outputPath = path.join(layer2Dir, 'meta-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

    console.log('AIL CP7 | Layer 2 meta-data.json assembled → .ail/layer2/meta-data.json');

    return manifest;
}
