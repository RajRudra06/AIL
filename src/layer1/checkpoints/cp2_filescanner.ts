import * as fs from 'fs';
import * as path from 'path';

// Folders to skip — these are never part of source code
const EXCLUDE_DIRS = new Set([
    'node_modules', '.git', 'venv', '.venv',
    '__pycache__', 'dist', 'build', '.next',
    'out', 'target', '.ail', 'AIL_analysis'
]);

export interface ScannedFile {
    relativePath: string;
    extension:    string;
    sizeBytes:    number;
}

export interface FileScanResult {
    totalFiles:      number;
    files:           ScannedFile[];
    extensionCounts: Record<string, number>; // { '.py': 23, '.js': 10 }
}

export function runCheckpoint2(workspacePath: string, layer1Dir: string): FileScanResult {

    const files: ScannedFile[] = [];

    // Recursive walk
    function walk(dirPath: string) {
        let entries: fs.Dirent[];

        try {
            entries = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch {
            return; // skip folders we can't read
        }

        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!EXCLUDE_DIRS.has(entry.name)) {
                    walk(path.join(dirPath, entry.name));
                }
            } else if (entry.isFile()) {
                const fullPath     = path.join(dirPath, entry.name);
                const relativePath = path.relative(workspacePath, fullPath);
                const extension    = path.extname(entry.name).toLowerCase();
                const sizeBytes    = fs.statSync(fullPath).size;

                files.push({ relativePath, extension, sizeBytes });
            }
        }
    }

    walk(workspacePath);

    // Count by extension
    const extensionCounts: Record<string, number> = {};
    for (const file of files) {
        const ext = file.extension || '(no extension)';
        extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
    }

    const result: FileScanResult = {
        totalFiles: files.length,
        files,
        extensionCounts
    };

    // Save to file
    const outputPath = path.join(layer1Dir, 'file_scan.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`AIL CP2 | Found ${files.length} files | Saved file_scan.json`);

    return result; // orchestrator needs this for CP3 onwards
}