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
export function runCheckpoint2(gitRepos: string[], workspacePath: string, analysisDir: string): ContributorResult {
    const contributorMap = new Map<string, ContributorInfo>();

    for (const repoPath of gitRepos) {
        try {
            const raw = execSync(
                'git shortlog -sne --all',
                { cwd: repoPath, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }
            );

            for (const line of raw.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed) { continue; }

                // Format: "  123\tJohn Doe <john@example.com>"
                const match = trimmed.match(/^\s*(\d+)\s+(.+?)\s+<(.+?)>$/);
                if (match) {
                    const commits = parseInt(match[1]);
                    const name = match[2];
                    const email = match[3];
                    const key = email || name;

                    const existing = contributorMap.get(key) || { commits: 0, name, email };
                    existing.commits += commits;
                    contributorMap.set(key, existing);
                }
            }
        } catch (err: any) {
            console.warn(`Git shortlog failed in repo ${repoPath}. Details: ${err.message || err}`);
        }
    }

    // Convert map to array and sort by commits descending
    const contributors = Array.from(contributorMap.values()).sort((a, b) => b.commits - a.commits);

    const result: ContributorResult = {
        contributors,
        totalContributors: contributors.length,
    };

    const outputPath = path.join(analysisDir, 'contributors.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`AIL L3-CP2 | ${contributors.length} contributors | Top: ${contributors[0]?.name || 'unknown'} (${contributors[0]?.commits || 0} commits)`);
    return result;
}
