import * as fs from 'fs';
import * as path from 'path';

export interface Dependency {
    name:    string;
    version: string;
    type:    'direct' | 'transitive';
    source:  string;
}

export interface DependencyManifestResult {
    direct:          Dependency[];
    transitive:      Dependency[];
    totalDirect:     number;
    totalTransitive: number;
    totalAll:        number;
    manifestsFound:  string[];
    lockFilesFound:  string[];
}

// ================================================================
// PYTHON PARSERS
// ================================================================

function parsePythonRequirements(filePath: string, source: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;

            // Handle: flask==2.0.1, flask>=2.0.0, flask~=2.0, flask, flask[async]==2.0.1
            const match = trimmed.match(/^([a-zA-Z0-9._-]+)(?:\[.*?\])?([>=<!~^]*)([\d.*]*)/);
            if (match) {
                deps.push({
                    name:    match[1].toLowerCase().trim(),
                    version: match[3] || '*',
                    type:    'direct',
                    source
                });
            }
        }
    } catch { /* skip */ }
    return deps;
}

function parsePyprojectToml(filePath: string, source: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Extract dependencies section (handles both Poetry and PEP 621)
        const sections = [
            /\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\[|$)/,
            /\[project\]\s[\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/,
            /\[tool\.poetry\.dev-dependencies\]([\s\S]*?)(?=\[|$)/,
        ];

        for (const regex of sections) {
            const match = content.match(regex);
            if (!match) continue;

            const block = match[1];
            // Match: flask = "^2.0.1" or "flask>=2.0.0"
            const lineMatches = block.matchAll(/["']?([a-zA-Z0-9._-]+)["']?\s*[=:]\s*["'^~>=<!]*([\d.*]*)/g);
            for (const m of lineMatches) {
                if (m[1].toLowerCase() === 'python') continue;
                deps.push({
                    name:    m[1].toLowerCase(),
                    version: m[2] || '*',
                    type:    'direct',
                    source
                });
            }
        }
    } catch { /* skip */ }
    return deps;
}

function parsePipfile(filePath: string, source: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const sections = [
            /\[packages\]([\s\S]*?)(?=\[|$)/,
            /\[dev-packages\]([\s\S]*?)(?=\[|$)/
        ];

        for (const regex of sections) {
            const match = content.match(regex);
            if (!match) continue;

            const block = match[1];
            const lineMatches = block.matchAll(/([a-zA-Z0-9._-]+)\s*=\s*["']([^"']*)/g);
            for (const m of lineMatches) {
                deps.push({
                    name:    m[1].toLowerCase(),
                    version: m[2] || '*',
                    type:    'direct',
                    source
                });
            }
        }
    } catch { /* skip */ }
    return deps;
}

function parseSetupPy(filePath: string, source: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Match install_requires=['flask>=2.0', 'requests']
        const block = content.match(/install_requires\s*=\s*\[([\s\S]*?)\]/);
        if (!block) return deps;

        const matches = block[1].matchAll(/["']([a-zA-Z0-9._-]+)([>=<!~^]*[\d.*]*)?["']/g);
        for (const m of matches) {
            deps.push({
                name:    m[1].toLowerCase(),
                version: m[2] || '*',
                type:    'direct',
                source
            });
        }
    } catch { /* skip */ }
    return deps;
}

// ================================================================
// JAVASCRIPT PARSERS
// ================================================================

function parsePackageJson(filePath: string, source: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const pkg = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const allDeps = {
            ...pkg.dependencies    || {},
            ...pkg.devDependencies || {},
            ...pkg.peerDependencies || {}
        };

        for (const [name, version] of Object.entries(allDeps)) {
            deps.push({
                name:    name.toLowerCase(),
                version: (version as string).replace(/[\^~>=<]/, '') || '*',
                type:    'direct',
                source
            });
        }
    } catch { /* skip */ }
    return deps;
}

function parsePackageLockJson(filePath: string, existingDirect: Set<string>): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const lock = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const packages = lock.packages || lock.dependencies || {};

        for (const [name, data] of Object.entries(packages as Record<string, any>)) {
            const cleanName = name.replace('node_modules/', '').toLowerCase();
            if (!cleanName || existingDirect.has(cleanName)) continue;
            deps.push({
                name:    cleanName,
                version: data.version || '*',
                type:    'transitive',
                source:  'package-lock.json'
            });
        }
    } catch { /* skip */ }
    return deps;
}

function parseYarnLock(filePath: string, existingDirect: Set<string>): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const matches = content.matchAll(/^"?([a-zA-Z0-9@/_.-]+)@/gm);
        const seen = new Set<string>();

        for (const m of matches) {
            const name = m[1].toLowerCase();
            if (!existingDirect.has(name) && !seen.has(name)) {
                seen.add(name);
                deps.push({
                    name,
                    version: '*',
                    type:    'transitive',
                    source:  'yarn.lock'
                });
            }
        }
    } catch { /* skip */ }
    return deps;
}

// ================================================================
// JAVA PARSERS
// ================================================================

function parsePomXml(filePath: string, source: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const matches = content.matchAll(/<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>(?:\s*<version>([^<]+)<\/version>)?/g);

        for (const m of matches) {
            deps.push({
                name:    `${m[1].trim()}:${m[2].trim()}`.toLowerCase(),
                version: m[3]?.trim() || '*',
                type:    'direct',
                source
            });
        }
    } catch { /* skip */ }
    return deps;
}

function parseBuildGradle(filePath: string, source: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Match: implementation 'group:artifact:version' or implementation "group:artifact:version"
        const matches = content.matchAll(/(?:implementation|api|compile|testImplementation)\s+["']([^"']+):([^"']+):([^"']+)["']/g);

        for (const m of matches) {
            deps.push({
                name:    `${m[1]}:${m[2]}`.toLowerCase(),
                version: m[3],
                type:    'direct',
                source
            });
        }
    } catch { /* skip */ }
    return deps;
}

// ================================================================
// GO PARSERS
// ================================================================

function parseGoMod(filePath: string, source: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Match: require github.com/gin-gonic/gin v1.9.1
        const matches = content.matchAll(/^\s*([a-zA-Z0-9./_-]+)\s+(v[\d.]+)/gm);

        for (const m of matches) {
            if (m[1] === 'go') continue;
            deps.push({
                name:    m[1].toLowerCase(),
                version: m[2],
                type:    'direct',
                source
            });
        }
    } catch { /* skip */ }
    return deps;
}

// ================================================================
// RUST PARSERS
// ================================================================

function parseCargoToml(filePath: string, source: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const block   = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/);
        if (!block) return deps;

        const matches = block[1].matchAll(/([a-zA-Z0-9_-]+)\s*=\s*["']([^"']+)["']/g);
        for (const m of matches) {
            deps.push({
                name:    m[1].toLowerCase(),
                version: m[2],
                type:    'direct',
                source
            });
        }
    } catch { /* skip */ }
    return deps;
}

// ================================================================
// RUBY PARSERS
// ================================================================

function parseGemfile(filePath: string, source: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const matches = content.matchAll(/^\s*gem\s+["']([^"']+)["'](?:,\s*["']([^"']+)["'])?/gm);

        for (const m of matches) {
            deps.push({
                name:    m[1].toLowerCase(),
                version: m[2] || '*',
                type:    'direct',
                source
            });
        }
    } catch { /* skip */ }
    return deps;
}

// ================================================================
// PHP PARSERS
// ================================================================

function parseComposerJson(filePath: string, source: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const composer = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const allDeps  = {
            ...composer.require     || {},
            ...composer['require-dev'] || {}
        };

        for (const [name, version] of Object.entries(allDeps)) {
            if (name === 'php') continue;
            deps.push({
                name:    name.toLowerCase(),
                version: (version as string) || '*',
                type:    'direct',
                source
            });
        }
    } catch { /* skip */ }
    return deps;
}

// ================================================================
// RECURSIVE FILE FINDER
// ================================================================

const EXCLUDE_DIRS = new Set([
    'node_modules', '.git', 'venv', '.venv', '__pycache__',
    'dist', 'build', '.next', 'out', 'target', '.ail', 'env', 'AutoAI_ENV'
]);

function findFile(workspacePath: string, filename: string): string | null {
    function walk(dir: string): string | null {
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return null; }

        for (const e of entries) {
            if (e.isFile() && e.name === filename) {
                return path.join(dir, e.name);
            }
            if (e.isDirectory() && !EXCLUDE_DIRS.has(e.name)) {
                const result = walk(path.join(dir, e.name));
                if (result) return result;
            }
        }
        return null;
    }
    return walk(workspacePath);
}

// ================================================================
// MAIN FUNCTION
// ================================================================

export function runCheckpoint8(
    workspacePath: string,
    analysisDir:   string
): DependencyManifestResult {

    const direct:         Dependency[] = [];
    const transitive:     Dependency[] = [];
    const manifestsFound: string[]     = [];
    const lockFilesFound: string[]     = [];

    // ---- Python ----
    const reqTxt    = findFile(workspacePath, 'requirements.txt');
    const pyproject = findFile(workspacePath, 'pyproject.toml');
    const pipfile   = findFile(workspacePath, 'Pipfile');
    const setupPy   = findFile(workspacePath, 'setup.py');

    if (reqTxt)    { manifestsFound.push('requirements.txt');  direct.push(...parsePythonRequirements(reqTxt, 'requirements.txt')); }
    if (pyproject) { manifestsFound.push('pyproject.toml');    direct.push(...parsePyprojectToml(pyproject, 'pyproject.toml')); }
    if (pipfile)   { manifestsFound.push('Pipfile');           direct.push(...parsePipfile(pipfile, 'Pipfile')); }
    if (setupPy)   { manifestsFound.push('setup.py');          direct.push(...parseSetupPy(setupPy, 'setup.py')); }

    // ---- JavaScript / TypeScript ----
    const pkgJson  = findFile(workspacePath, 'package.json');
    const pkgLock  = findFile(workspacePath, 'package-lock.json');
    const yarnLock = findFile(workspacePath, 'yarn.lock');
    const pnpmLock = findFile(workspacePath, 'pnpm-lock.yaml');

    if (pkgJson) {
        manifestsFound.push('package.json');
        direct.push(...parsePackageJson(pkgJson, 'package.json'));
    }

    const directNames = new Set(direct.map(d => d.name));

    if (pkgLock)  { lockFilesFound.push('package-lock.json'); transitive.push(...parsePackageLockJson(pkgLock, directNames)); }
    if (yarnLock) { lockFilesFound.push('yarn.lock');          transitive.push(...parseYarnLock(yarnLock, directNames)); }
    if (pnpmLock) { lockFilesFound.push('pnpm-lock.yaml'); } // structure too complex, just note it exists

    // ---- Java ----
    const pomXml      = findFile(workspacePath, 'pom.xml');
    const buildGradle = findFile(workspacePath, 'build.gradle') || findFile(workspacePath, 'build.gradle.kts');

    if (pomXml)      { manifestsFound.push('pom.xml');       direct.push(...parsePomXml(pomXml, 'pom.xml')); }
    if (buildGradle) { manifestsFound.push('build.gradle');  direct.push(...parseBuildGradle(buildGradle, 'build.gradle')); }

    // ---- Go ----
    const goMod = findFile(workspacePath, 'go.mod');
    const goSum = findFile(workspacePath, 'go.sum');

    if (goMod) { manifestsFound.push('go.mod'); direct.push(...parseGoMod(goMod, 'go.mod')); }
    if (goSum) { lockFilesFound.push('go.sum'); } // go.sum is large and binary-ish, just note it exists

    // ---- Rust ----
    const cargoToml = findFile(workspacePath, 'Cargo.toml');
    const cargoLock = findFile(workspacePath, 'Cargo.lock');

    if (cargoToml) { manifestsFound.push('Cargo.toml'); direct.push(...parseCargoToml(cargoToml, 'Cargo.toml')); }
    if (cargoLock) { lockFilesFound.push('Cargo.lock'); }

    // ---- Ruby ----
    const gemfile     = findFile(workspacePath, 'Gemfile');
    const gemfileLock = findFile(workspacePath, 'Gemfile.lock');

    if (gemfile)     { manifestsFound.push('Gemfile');      direct.push(...parseGemfile(gemfile, 'Gemfile')); }
    if (gemfileLock) { lockFilesFound.push('Gemfile.lock'); }

    // ---- PHP ----
    const composerJson = findFile(workspacePath, 'composer.json');
    const composerLock = findFile(workspacePath, 'composer.lock');

    if (composerJson) { manifestsFound.push('composer.json'); direct.push(...parseComposerJson(composerJson, 'composer.json')); }
    if (composerLock) { lockFilesFound.push('composer.lock'); }

    // Deduplicate direct deps by name
    const seen     = new Set<string>();
    const dedupedDirect = direct.filter(d => {
        if (seen.has(d.name)) return false;
        seen.add(d.name);
        return true;
    });

    const result: DependencyManifestResult = {
        direct:          dedupedDirect,
        transitive,
        totalDirect:     dedupedDirect.length,
        totalTransitive: transitive.length,
        totalAll:        dedupedDirect.length + transitive.length,
        manifestsFound,
        lockFilesFound
    };

    const outputPath = path.join(analysisDir, 'dependency_manifest.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`AIL CP8 | Direct: ${dedupedDirect.length} | Transitive: ${transitive.length} | Manifests: ${manifestsFound.join(', ')}`);

    return result;
}