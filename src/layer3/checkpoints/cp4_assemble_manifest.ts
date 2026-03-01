import * as fs from 'fs';
import * as path from 'path';
import { CommitHistoryResult } from './cp1_commit_history';
import { ContributorResult } from './cp2_contributors';
import { FileChurnResult } from './cp3_file_churn';

export interface Layer3Manifest {
    version: string;
    timestamp: string;
    commitHistory: CommitHistoryResult;
    contributors: ContributorResult;
    fileChurn: FileChurnResult;
    summary: {
        totalCommits: number;
        totalContributors: number;
        totalFilesAnalyzed: number;
        hotFileCount: number;
        staleFileCount: number;
        dateRange: { first: string; last: string };
    };
}

/**
 * CP4: Assemble Layer 3 manifest.
 */
export function runCheckpoint4(
    commitResult: CommitHistoryResult,
    contribResult: ContributorResult,
    churnResult: FileChurnResult,
    layer3Dir: string
): Layer3Manifest {

    const manifest: Layer3Manifest = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        commitHistory: commitResult,
        contributors: contribResult,
        fileChurn: churnResult,
        summary: {
            totalCommits: commitResult.totalCommits,
            totalContributors: contribResult.totalContributors,
            totalFilesAnalyzed: churnResult.totalFiles,
            hotFileCount: churnResult.hotFiles.length,
            staleFileCount: churnResult.staleFiles.length,
            dateRange: commitResult.dateRange,
        },
    };

    const outputPath = path.join(layer3Dir, 'meta-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

    console.log('AIL L3-CP4 | Layer 3 meta-data.json assembled');
    return manifest;
}
