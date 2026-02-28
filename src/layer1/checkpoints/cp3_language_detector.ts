import * as fs from 'fs';
import * as path from 'path';
import { FileScanResult } from './cp2_filescanner';

// Map extensions to language names
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
    '.py':   'Python',
    '.js':   'JavaScript',
    '.ts':   'TypeScript',
    '.jsx':  'JavaScript',
    '.tsx':  'TypeScript',
    '.java': 'Java',
    '.go':   'Go',
    '.rs':   'Rust',
    '.cpp':  'C++',
    '.c':    'C',
    '.cs':   'C#',
    '.rb':   'Ruby',
    '.php':  'PHP',
    '.swift':'Swift',
    '.kt':   'Kotlin'
};

export interface LanguageInfo {
    name:       string;
    fileCount:  number;
    percentage: number;
    extensions: string[];
}

export interface LanguageResult {
    primary:   string;
    languages: LanguageInfo[];
    totalSourceFiles: number;
}

export function runCheckpoint3(scanResult: FileScanResult, layer1Dir: string): LanguageResult {

    // Group extensions into languages
    const langMap: Record<string, LanguageInfo> = {};

    for (const [ext, count] of Object.entries(scanResult.extensionCounts)) {
        const langName = EXTENSION_TO_LANGUAGE[ext];
        if (!langName) continue; // skip .json, .md, .txt etc

        if (!langMap[langName]) {
            langMap[langName] = {
                name: langName,
                fileCount: 0,
                percentage: 0,
                extensions: []
            };
        }

        langMap[langName].fileCount += count;
        if (!langMap[langName].extensions.includes(ext)) {
            langMap[langName].extensions.push(ext);
        }
    }

    const languages = Object.values(langMap);
    const totalSourceFiles = languages.reduce((sum, l) => sum + l.fileCount, 0);

    // Calculate percentages
    for (const lang of languages) {
        lang.percentage = parseFloat(((lang.fileCount / totalSourceFiles) * 100).toFixed(1));
    }

    // Sort by fileCount descending
    languages.sort((a, b) => b.fileCount - a.fileCount);

    const primary = languages.length > 0 ? languages[0].name : 'Unknown';

    const result: LanguageResult = {
        primary,
        languages,
        totalSourceFiles
    };

    const outputPath = path.join(layer1Dir, 'languages.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`AIL CP3 | Primary: ${primary} | ${languages.length} languages found`);

    return result;
}