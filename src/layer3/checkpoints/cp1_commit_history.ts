import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface CommitInfo {
    hash: string;
    author: string;
    email: string;
    date: string;
    message: string;
    filesChanged: number;
    insertions: number;
    deletions: number;
}

export interface CommitHistoryResult {
    commits: CommitInfo[];
    totalCommits: number;
    dateRange: { first: string; last: string };
}

/**
 * CP1: Extract recent git commit history.
 */
export function runCheckpoint1(workspacePath: string, analysisDir: string): CommitHistoryResult {
    const commits: CommitInfo[] = [];

    try {
        // Get last 200 commits with stats
        const raw = execSync(
            'git log -200 --pretty=format:"%H|||%an|||%ae|||%aI|||%s" --shortstat',
            { cwd: workspacePath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
        );

        const lines = raw.split('\n');
        let currentCommit: Partial<CommitInfo> | null = null;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) { continue; }

            if (trimmed.includes('|||')) {
                // Save previous commit
                if (currentCommit && currentCommit.hash) {
                    commits.push(currentCommit as CommitInfo);
                }

                const parts = trimmed.split('|||');
                currentCommit = {
                    hash: parts[0],
                    author: parts[1],
                    email: parts[2],
                    date: parts[3],
                    message: parts[4] || '',
                    filesChanged: 0,
                    insertions: 0,
                    deletions: 0,
                };
            } else if (currentCommit && trimmed.includes('changed')) {
                // Parse shortstat line: "3 files changed, 12 insertions(+), 5 deletions(-)"
                const filesMatch = trimmed.match(/(\d+) files? changed/);
                const insertMatch = trimmed.match(/(\d+) insertions?/);
                const deleteMatch = trimmed.match(/(\d+) deletions?/);
                currentCommit.filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0;
                currentCommit.insertions = insertMatch ? parseInt(insertMatch[1]) : 0;
                currentCommit.deletions = deleteMatch ? parseInt(deleteMatch[1]) : 0;
            }
        }

        // Don't forget the last commit
        if (currentCommit && currentCommit.hash) {
            commits.push(currentCommit as CommitInfo);
        }
    } catch (err: any) {
        throw new Error(`Git log failed in CP1. Is this a Git repository? Details: ${err.message || err}`);
    }

    const result: CommitHistoryResult = {
        commits,
        totalCommits: commits.length,
        dateRange: {
            first: commits.length > 0 ? commits[commits.length - 1].date : '',
            last: commits.length > 0 ? commits[0].date : '',
        },
    };

    const outputPath = path.join(analysisDir, 'commit_history.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`AIL L3-CP1 | ${commits.length} commits | ${result.dateRange.first?.slice(0, 10)} → ${result.dateRange.last?.slice(0, 10)}`);
    return result;
}
