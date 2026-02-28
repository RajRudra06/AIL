import * as fs from 'fs';
import * as path from 'path';
import { LanguageResult } from './cp3_language_detector';

export interface FrameworkInfo {
    name:     string;
    type:     string;
    language: string;
    source:   string;
}

export interface FrameworkResult {
    frameworks:     FrameworkInfo[];
    totalFound:     number;
    manifestsFound: string[];
}

const PYTHON_FRAMEWORKS: Record<string, { type: string }> = {
    'fastapi':    { type: 'web' },
    'flask':      { type: 'web' },
    'django':     { type: 'web' },
    'tornado':    { type: 'web' },
    'pytest':     { type: 'testing' },
    'celery':     { type: 'task-queue' },
    'sqlalchemy': { type: 'database' },
    'pydantic':   { type: 'validation' },
    'uvicorn':    { type: 'server' },
    'starlette':  { type: 'web' }
};

const JS_FRAMEWORKS: Record<string, { type: string }> = {
    'react':   { type: 'frontend' },
    'vue':     { type: 'frontend' },
    'angular': { type: 'frontend' },
    'express': { type: 'backend' },
    'next':    { type: 'fullstack' },
    'nuxt':    { type: 'fullstack' },
    'nestjs':  { type: 'backend' },
    'jest':    { type: 'testing' },
    'vite':    { type: 'build-tool' }
};

const JAVA_FRAMEWORKS: Record<string, { type: string }> = {
    'spring':    { type: 'backend' },
    'hibernate': { type: 'database' },
    'junit':     { type: 'testing' }
};

const EXCLUDE_DIRS = new Set([
    'node_modules', '.git', '__pycache__', 'dist',
    'build', '.next', 'out', 'target', '.ail'
]);

// Recursively find all files matching a filename
function findFiles(dirPath: string, targetFilename: string, results: string[] = []): string[] {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (!EXCLUDE_DIRS.has(entry.name)) {
                findFiles(path.join(dirPath, entry.name), targetFilename, results);
            }
        } else if (entry.isFile() && entry.name === targetFilename) {
            results.push(path.join(dirPath, entry.name));
        }
    }

    return results;
}

// Scan a text content for known framework keywords
function scanContentForFrameworks(
    content: string,
    frameworkMap: Record<string, { type: string }>,
    language: string,
    sourceFile: string,
    existing: FrameworkInfo[]
): FrameworkInfo[] {
    const found: FrameworkInfo[] = [];
    const lower = content.toLowerCase();

    for (const [name, info] of Object.entries(frameworkMap)) {
        const alreadyFound = existing.some(f => f.name.toLowerCase() === name) ||
                             found.some(f => f.name.toLowerCase() === name);
        if (!alreadyFound && lower.includes(name)) {
            found.push({
                name:     name.charAt(0).toUpperCase() + name.slice(1),
                type:     info.type,
                language,
                source:   sourceFile
            });
        }
    }

    return found;
}

// Also scan .py source files directly for import statements
function scanPythonImports(
    workspacePath: string,
    existing: FrameworkInfo[]
): FrameworkInfo[] {
    const found: FrameworkInfo[] = [];

    // Find all .py files
    function walkPy(dirPath: string) {
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
        catch { return; }

        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!EXCLUDE_DIRS.has(entry.name)) {
                    walkPy(path.join(dirPath, entry.name));
                }
            } else if (entry.isFile() && entry.name.endsWith('.py')) {
                try {
                    const content = fs.readFileSync(
                        path.join(dirPath, entry.name), 'utf-8'
                    ).toLowerCase();

                    // Look for import fastapi / from fastapi import ...
                    for (const [name, info] of Object.entries(PYTHON_FRAMEWORKS)) {
                        const alreadyFound =
                            existing.some(f => f.name.toLowerCase() === name) ||
                            found.some(f => f.name.toLowerCase() === name);

                        if (!alreadyFound) {
                            const importPatterns = [
                                `import ${name}`,
                                `from ${name}`,
                                `from ${name}.`
                            ];
                            if (importPatterns.some(p => content.includes(p))) {
                                found.push({
                                    name:     name.charAt(0).toUpperCase() + name.slice(1),
                                    type:     info.type,
                                    language: 'Python',
                                    source:   `import in ${entry.name}`
                                });
                            }
                        }
                    }
                } catch { /* skip unreadable files */ }
            }
        }
    }

    walkPy(workspacePath);
    return found;
}

export function runCheckpoint4(
    workspacePath: string,
    langResult: LanguageResult,
    layer1Dir: string
): FrameworkResult {

    const frameworks:     FrameworkInfo[] = [];
    const manifestsFound: string[]        = [];
    const detectedLangs = langResult.languages.map(l => l.name);

    // --- Python ---
    if (detectedLangs.includes('Python')) {

        // 1. Search for requirements.txt anywhere in the project
        const reqFiles = findFiles(workspacePath, 'requirements.txt');
        for (const reqPath of reqFiles) {
            const relPath = path.relative(workspacePath, reqPath);
            manifestsFound.push(relPath);
            const content = fs.readFileSync(reqPath, 'utf-8');
            const found   = scanContentForFrameworks(content, PYTHON_FRAMEWORKS, 'Python', relPath, frameworks);
            frameworks.push(...found);
        }

        // 2. Search for pyproject.toml anywhere
        const pyprojFiles = findFiles(workspacePath, 'pyproject.toml');
        for (const pyprojPath of pyprojFiles) {
            const relPath = path.relative(workspacePath, pyprojPath);
            manifestsFound.push(relPath);
            const content = fs.readFileSync(pyprojPath, 'utf-8');
            const found   = scanContentForFrameworks(content, PYTHON_FRAMEWORKS, 'Python', relPath, frameworks);
            frameworks.push(...found);
        }

        // 3. Search for setup.py anywhere
        const setupFiles = findFiles(workspacePath, 'setup.py');
        for (const setupPath of setupFiles) {
            const relPath = path.relative(workspacePath, setupPath);
            manifestsFound.push(relPath);
            const content = fs.readFileSync(setupPath, 'utf-8');
            const found   = scanContentForFrameworks(content, PYTHON_FRAMEWORKS, 'Python', relPath, frameworks);
            frameworks.push(...found);
        }

        // 4. Fallback: scan actual .py import statements
        const importFound = scanPythonImports(workspacePath, frameworks);
        frameworks.push(...importFound);
    }

    // --- JavaScript / TypeScript ---
    if (detectedLangs.includes('JavaScript') || detectedLangs.includes('TypeScript')) {
        const pkgFiles = findFiles(workspacePath, 'package.json');

        for (const pkgPath of pkgFiles) {
            // skip node_modules package.json files
            if (pkgPath.includes('node_modules')) continue;

            const relPath = path.relative(workspacePath, pkgPath);
            manifestsFound.push(relPath);

            try {
                const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                const allDeps = {
                    ...pkg.dependencies    || {},
                    ...pkg.devDependencies || {}
                };

                for (const [name, info] of Object.entries(JS_FRAMEWORKS)) {
                    const alreadyFound = frameworks.some(f => f.name.toLowerCase() === name);
                    if (!alreadyFound && allDeps[name]) {
                        frameworks.push({
                            name:     name.charAt(0).toUpperCase() + name.slice(1),
                            type:     info.type,
                            language: 'JavaScript/TypeScript',
                            source:   relPath
                        });
                    }
                }
            } catch { /* skip malformed package.json */ }
        }
    }

    // --- Java ---
    if (detectedLangs.includes('Java')) {
        const pomFiles = findFiles(workspacePath, 'pom.xml');

        for (const pomPath of pomFiles) {
            const relPath = path.relative(workspacePath, pomPath);
            manifestsFound.push(relPath);
            const content = fs.readFileSync(pomPath, 'utf-8');
            const found   = scanContentForFrameworks(content, JAVA_FRAMEWORKS, 'Java', relPath, frameworks);
            frameworks.push(...found);
        }
    }

    const result: FrameworkResult = {
        frameworks,
        totalFound:     frameworks.length,
        manifestsFound: [...new Set(manifestsFound)] // dedupe
    };

    const outputPath = path.join(layer1Dir, 'frameworks.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`AIL CP4 | Found ${frameworks.length} frameworks | Sources: ${result.manifestsFound.join(', ')}`);

    return result;
}