import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface FileChurnInfo {
    file: string;
    commits: number;
    insertions: number;
    deletions: number;
    churnScore: number;   // insertions + deletions
    lastModified: string; // ISO date
    isHot: boolean;  // top 10% by churn
    isStale: boolean;  // not changed in 6+ months
}

export interface FileChurnResult {
    files: FileChurnInfo[];
    hotFiles: FileChurnInfo[];
    staleFiles: FileChurnInfo[];
    totalFiles: number;
}

/**
 * CP3: Compute per-file churn (add/delete frequency) from git history.
 */
export function runCheckpoint3(workspacePath: string, analysisDir: string): FileChurnResult {
    const fileMap = new Map<string, { commits: number; insertions: number; deletions: number; lastDate: string }>();

    try {
        // Get per-commit file stats
        const raw = execSync(
            'git log --all --numstat --pretty=format:"COMMIT|||%aI"',
            { cwd: workspacePath, encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 }
        );

        let currentDate = '';

        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) { continue; }

            if (trimmed.startsWith('COMMIT|||')) {
                currentDate = trimmed.split('|||')[1];
                continue;
            }

            // numstat format: "insertions\tdeletions\tfilename"
            const parts = trimmed.split('\t');
            if (parts.length >= 3) {
                const ins = parts[0] === '-' ? 0 : parseInt(parts[0]) || 0;
                const del = parts[1] === '-' ? 0 : parseInt(parts[1]) || 0;
                const file = parts.slice(2).join('\t'); // handle filenames with tabs

                const existing = fileMap.get(file) || { commits: 0, insertions: 0, deletions: 0, lastDate: '' };
                existing.commits++;
                existing.insertions += ins;
                existing.deletions += del;
                if (!existing.lastDate || currentDate > existing.lastDate) {
                    existing.lastDate = currentDate;
                }
                fileMap.set(file, existing);
            }
        }
    } catch (err: any) {
        throw new Error(`Git numstat failed in CP3. Details: ${err.message || err}`);
    }

    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();

    const files: FileChurnInfo[] = [];
    for (const [file, data] of fileMap) {
        const churnScore = data.insertions + data.deletions;
        files.push({
            file,
            commits: data.commits,
            insertions: data.insertions,
            deletions: data.deletions,
            churnScore,
            lastModified: data.lastDate,
            isHot: false,  // set below
            isStale: data.lastDate < sixMonthsAgo,
        });
    }

    // Sort by churn and mark top 10% as hot
    files.sort((a, b) => b.churnScore - a.churnScore);
    const hotThreshold = Math.max(1, Math.floor(files.length * 0.1));
    for (let i = 0; i < hotThreshold && i < files.length; i++) {
        files[i].isHot = true;
    }

    const result: FileChurnResult = {
        files,
        hotFiles: files.filter(f => f.isHot),
        staleFiles: files.filter(f => f.isStale),
        totalFiles: files.length,
    };

    const outputPath = path.join(analysisDir, 'file_churn.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`AIL L3-CP3 | ${files.length} files analyzed | ${result.hotFiles.length} hot | ${result.staleFiles.length} stale`);
    return result;
}
