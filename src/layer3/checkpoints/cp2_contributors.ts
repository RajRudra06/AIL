import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface ContributorInfo {
    name: string;
    email: string;
    commits: number;
}

export interface ContributorResult {
    contributors: ContributorInfo[];
    totalContributors: number;
}

/**
 * CP2: Extract contributor list with commit counts.
 */
export function runCheckpoint2(workspacePath: string, analysisDir: string): ContributorResult {
    const contributors: ContributorInfo[] = [];

    try {
        const raw = execSync(
            'git shortlog -sne --all',
            { cwd: workspacePath, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }
        );

        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) { continue; }

            // Format: "  123\tJohn Doe <john@example.com>"
            const match = trimmed.match(/^\s*(\d+)\s+(.+?)\s+<(.+?)>$/);
            if (match) {
                contributors.push({
                    commits: parseInt(match[1]),
                    name: match[2],
                    email: match[3],
                });
            }
        }
    } catch (err: any) {
        throw new Error(`Git shortlog failed in CP2. Details: ${err.message || err}`);
    }

    const result: ContributorResult = {
        contributors,
        totalContributors: contributors.length,
    };

    const outputPath = path.join(analysisDir, 'contributors.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`AIL L3-CP2 | ${contributors.length} contributors | Top: ${contributors[0]?.name || 'unknown'} (${contributors[0]?.commits || 0} commits)`);
    return result;
}
