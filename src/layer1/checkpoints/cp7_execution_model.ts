import * as fs from 'fs';
import * as path from 'path';
import { FrameworkResult }  from './cp4_framework_scanner';
import { EntryPointResult } from './cp5_entrypoint_finder';

export interface ExecutionModelResult {
    model:      string;
    confidence: 'high' | 'medium' | 'low';
    reasoning:  string;
    signals:    string[];
    tags:       string[]; // all applicable categories (a project can be web + worker + ml)
}

export function runCheckpoint7(
    fwResult:      FrameworkResult,
    epResult:      EntryPointResult,
    workspacePath: string,
    analysisDir:   string
): ExecutionModelResult {

    const frameworks = fwResult.frameworks.map(f => f.name.toLowerCase());
    const entryTypes = epResult.entryPoints.map(e => e.type);
    const signals:   string[] = [];
    const tags:      string[] = [];

    // ================================================================
    // SIGNAL DETECTION
    // ================================================================

    // --- Web ---
    const isWebBackend = frameworks.some(f =>
        ['fastapi', 'flask', 'django', 'express', 'nestjs', 'fastify', 'spring', 'tornado', 'aiohttp', 'sanic', 'koa', 'hapi'].includes(f)
    );
    const isFrontend = frameworks.some(f =>
        ['react', 'vue', 'angular', 'svelte', 'solid-js'].includes(f)
    );
    const isFullstack = frameworks.some(f =>
        ['next.js', 'nuxt', 'remix'].includes(f)
    );

    // --- Worker / Queue ---
    const isWorker = frameworks.some(f =>
        ['celery', 'rq', 'dramatiq', 'huey', 'arq'].includes(f)
    );

    // --- CLI ---
    const isCLI = frameworks.some(f =>
        ['click', 'typer', 'argparse'].includes(f)
    );

    // --- ML / AI ---
    const isML = frameworks.some(f =>
        ['torch', 'tensorflow', 'sklearn', 'transformers', 'keras', 'xgboost', 'lightgbm', 'catboost'].includes(f)
    );
    const isAI = frameworks.some(f =>
        ['langchain', 'openai', 'anthropic', 'llamaindex', 'haystack', 'semantic-kernel'].includes(f)
    );

    // --- Data Pipeline ---
    const isDataPipeline = frameworks.some(f =>
        ['airflow', 'prefect', 'dagster', 'luigi', 'dbt', 'great-expectations', 'pandas', 'polars', 'pyspark'].includes(f)
    );

    // --- API Type ---
    const isGraphQL = frameworks.some(f =>
        ['graphql', 'strawberry', 'ariadne', 'graphene'].includes(f)
    );
    const isGRPC = frameworks.some(f =>
        ['grpc', 'protobuf', 'betterproto'].includes(f)
    );

    // --- Database Layer ---
    const hasDatabase = frameworks.some(f =>
        ['sqlalchemy', 'prisma', 'mongoose', 'typeorm', 'drizzle-orm', 'alembic', 'pymongo', 'motor', 'psycopg2', 'redis'].includes(f)
    );

    // --- Testing ---
    const isTestSuite = frameworks.some(f =>
        ['pytest', 'jest', 'vitest', 'cypress', 'playwright'].includes(f)
    );

    // --- Mobile ---
    const isMobile = frameworks.some(f =>
        ['react-native', 'expo', 'capacitor', 'ionic'].includes(f)
    );

    // --- Infrastructure / DevOps ---
    const isInfra = frameworks.some(f =>
        ['terraform', 'pulumi', 'cdk', 'ansible', 'boto3'].includes(f)
    );

    // --- Entry point signals ---
    const hasWebEntry    = entryTypes.includes('web_app');
    const hasWorkerEntry = entryTypes.includes('worker');
    const hasCLIEntry    = entryTypes.includes('cli');
    const hasServerEntry = entryTypes.includes('server');

    // --- File signals ---
    const hasSetupPy     = fs.existsSync(path.join(workspacePath, 'setup.py'));
    const hasPyproject   = fs.existsSync(path.join(workspacePath, 'pyproject.toml'));
    const hasManagePy    = fs.existsSync(path.join(workspacePath, 'manage.py'));
    const hasDockerfile  = fs.existsSync(path.join(workspacePath, 'Dockerfile')) ||
                           fs.existsSync(path.join(workspacePath, 'docker-compose.yml')) ||
                           fs.existsSync(path.join(workspacePath, 'docker-compose.yaml'));
    const hasNotebook    = (() => {
        // Check if any .ipynb files exist
        function hasIpynb(dir: string): boolean {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const e of entries) {
                    if (e.isFile() && e.name.endsWith('.ipynb')) { return true; }
                    if (e.isDirectory() && !['node_modules','.git','venv','.venv'].includes(e.name)) {
                        if (hasIpynb(path.join(dir, e.name))) { return true; }
                    }
                }
            } catch { /* skip */ }
            return false;
        }
        return hasIpynb(workspacePath);
    })();

    // ================================================================
    // SIGNAL COLLECTION (human readable)
    // ================================================================

    if (isWebBackend)   { signals.push(`web backend: ${frameworks.filter(f => ['fastapi','flask','django','express','nestjs','fastify','spring','tornado','aiohttp','sanic','koa','hapi'].includes(f)).join(', ')}`); }
    if (isFrontend)     { signals.push(`frontend: ${frameworks.filter(f => ['react','vue','angular','svelte','solid-js'].includes(f)).join(', ')}`); }
    if (isFullstack)    { signals.push(`fullstack: ${frameworks.filter(f => ['next.js','nuxt','remix'].includes(f)).join(', ')}`); }
    if (isWorker)       { signals.push(`task queue: ${frameworks.filter(f => ['celery','rq','dramatiq','huey','arq'].includes(f)).join(', ')}`); }
    if (isCLI)          { signals.push(`CLI: ${frameworks.filter(f => ['click','typer','argparse'].includes(f)).join(', ')}`); }
    if (isML)           { signals.push(`ML: ${frameworks.filter(f => ['torch','tensorflow','sklearn','transformers','keras','xgboost','lightgbm','catboost'].includes(f)).join(', ')}`); }
    if (isAI)           { signals.push(`AI/LLM: ${frameworks.filter(f => ['langchain','openai','anthropic','llamaindex','haystack','semantic-kernel'].includes(f)).join(', ')}`); }
    if (isDataPipeline) { signals.push(`data pipeline: ${frameworks.filter(f => ['airflow','prefect','dagster','luigi','dbt','pandas','polars','pyspark'].includes(f)).join(', ')}`); }
    if (isGraphQL)      { signals.push(`GraphQL API: ${frameworks.filter(f => ['graphql','strawberry','ariadne','graphene'].includes(f)).join(', ')}`); }
    if (isGRPC)         { signals.push(`gRPC service: ${frameworks.filter(f => ['grpc','protobuf','betterproto'].includes(f)).join(', ')}`); }
    if (hasDatabase)    { signals.push(`database layer: ${frameworks.filter(f => ['sqlalchemy','prisma','mongoose','typeorm','drizzle-orm','alembic','pymongo','motor','psycopg2','redis'].includes(f)).join(', ')}`); }
    if (isTestSuite)    { signals.push(`test suite: ${frameworks.filter(f => ['pytest','jest','vitest','cypress','playwright'].includes(f)).join(', ')}`); }
    if (isMobile)       { signals.push(`mobile: ${frameworks.filter(f => ['react-native','expo','capacitor','ionic'].includes(f)).join(', ')}`); }
    if (isInfra)        { signals.push(`infrastructure: ${frameworks.filter(f => ['terraform','pulumi','cdk','ansible','boto3'].includes(f)).join(', ')}`); }
    if (hasWebEntry)    { signals.push(`web entry point: ${epResult.entryPoints.find(e => e.type === 'web_app')?.file}`); }
    if (hasWorkerEntry) { signals.push(`worker entry point: ${epResult.entryPoints.find(e => e.type === 'worker')?.file}`); }
    if (hasCLIEntry)    { signals.push(`CLI entry point: ${epResult.entryPoints.find(e => e.type === 'cli')?.file}`); }
    if (hasDockerfile)  { signals.push('Dockerfile/docker-compose found'); }
    if (hasNotebook)    { signals.push('.ipynb notebooks found'); }
    if (hasSetupPy || hasPyproject) { signals.push('setup.py/pyproject.toml found'); }

    // ================================================================
    // TAG COLLECTION (all applicable labels)
    // ================================================================

    if (isWebBackend || hasWebEntry || hasServerEntry) { tags.push('Web Service'); }
    if (isFrontend)     { tags.push('Frontend App'); }
    if (isFullstack)    { tags.push('Fullstack App'); }
    if (isWorker || hasWorkerEntry) { tags.push('Worker'); }
    if (isCLI || hasCLIEntry)       { tags.push('CLI Tool'); }
    if (isML)           { tags.push('ML Project'); }
    if (isAI)           { tags.push('AI/LLM Project'); }
    if (isDataPipeline) { tags.push('Data Pipeline'); }
    if (isGraphQL)      { tags.push('GraphQL API'); }
    if (isGRPC)         { tags.push('gRPC Service'); }
    if (isMobile)       { tags.push('Mobile App'); }
    if (isInfra)        { tags.push('Infrastructure'); }
    if (hasNotebook)    { tags.push('Notebook / Research'); }
    if (isTestSuite && tags.length === 0) { tags.push('Test Suite'); }

    // ================================================================
    // PRIMARY MODEL CLASSIFICATION (priority order)
    // ================================================================

    let model:      string;
    let confidence: 'high' | 'medium' | 'low';
    let reasoning:  string;

    if (isMobile) {
        model      = 'Mobile App';
        confidence = 'high';
        reasoning  = `Mobile framework detected: ${frameworks.filter(f => ['react-native','expo','capacitor','ionic'].includes(f)).join(', ')}`;
    }
    else if (isFullstack) {
        model      = 'Fullstack App';
        confidence = 'high';
        reasoning  = `Fullstack framework detected: ${frameworks.filter(f => ['next.js','nuxt','remix'].includes(f)).join(', ')}`;
    }
    else if (isWebBackend && isFrontend) {
        model      = 'Fullstack App';
        confidence = 'high';
        reasoning  = 'Both web backend and frontend frameworks detected in same repo';
    }
    else if (isGRPC) {
        model      = 'gRPC Service';
        confidence = 'high';
        reasoning  = 'gRPC/protobuf framework detected';
    }
    else if (isGraphQL && isWebBackend) {
        model      = 'GraphQL API';
        confidence = 'high';
        reasoning  = 'GraphQL framework + web backend detected';
    }
    else if (isWebBackend || hasWebEntry || hasServerEntry || hasManagePy) {
        model      = 'Web Service';
        confidence = isWebBackend || hasManagePy ? 'high' : 'medium';
        reasoning  = isWebBackend
            ? `Web framework detected: ${frameworks.filter(f => ['fastapi','flask','django','express','nestjs','fastify','spring','tornado','aiohttp','sanic','koa','hapi'].includes(f)).join(', ')}`
            : hasManagePy ? 'Django manage.py found'
            : `Web entry point found: ${epResult.entryPoints.find(e => e.type === 'web_app' || e.type === 'server')?.file}`;
    }
    else if (isFrontend) {
        model      = 'Frontend App';
        confidence = 'high';
        reasoning  = `Frontend framework detected: ${frameworks.filter(f => ['react','vue','angular','svelte','solid-js'].includes(f)).join(', ')}`;
    }
    else if (isInfra) {
        model      = 'Infrastructure / DevOps';
        confidence = 'high';
        reasoning  = `Infrastructure framework detected: ${frameworks.filter(f => ['terraform','pulumi','cdk','ansible','boto3'].includes(f)).join(', ')}`;
    }
    else if (isDataPipeline) {
        model      = 'Data Pipeline';
        confidence = 'high';
        reasoning  = `Data pipeline framework detected: ${frameworks.filter(f => ['airflow','prefect','dagster','luigi','dbt','pandas','polars','pyspark'].includes(f)).join(', ')}`;
    }
    else if (isML || isAI) {
        model      = hasNotebook ? 'ML Research / Notebook' : 'ML / AI Service';
        confidence = 'high';
        reasoning  = isML
            ? `ML framework detected: ${frameworks.filter(f => ['torch','tensorflow','sklearn','transformers','keras'].includes(f)).join(', ')}`
            : `AI/LLM framework detected: ${frameworks.filter(f => ['langchain','openai','anthropic','llamaindex'].includes(f)).join(', ')}`;
    }
    else if (hasNotebook) {
        model      = 'Notebook / Research';
        confidence = 'medium';
        reasoning  = '.ipynb notebooks found with no web or service frameworks';
    }
    else if (isWorker || hasWorkerEntry) {
        model      = 'Worker / Task Processor';
        confidence = 'high';
        reasoning  = isWorker
            ? `Task queue framework detected: ${frameworks.filter(f => ['celery','rq','dramatiq','huey','arq'].includes(f)).join(', ')}`
            : 'Worker entry point found';
    }
    else if (isCLI || hasCLIEntry) {
        model      = 'CLI Tool';
        confidence = 'high';
        reasoning  = isCLI
            ? `CLI framework detected: ${frameworks.filter(f => ['click','typer','argparse'].includes(f)).join(', ')}`
            : 'CLI entry point found';
    }
    else if ((hasSetupPy || hasPyproject) && !hasWebEntry && !hasCLIEntry) {
        model      = 'Library / Package';
        confidence = 'medium';
        reasoning  = 'setup.py/pyproject.toml found with no web, CLI, or service entry points';
    }
    else if (isTestSuite) {
        model      = 'Test Suite';
        confidence = 'medium';
        reasoning  = `Only testing frameworks detected: ${frameworks.filter(f => ['pytest','jest','vitest','cypress','playwright'].includes(f)).join(', ')}`;
    }
    else {
        model      = 'Unknown';
        confidence = 'low';
        reasoning  = 'Not enough signals to classify project type';
    }

    const result: ExecutionModelResult = { model, confidence, reasoning, signals, tags };

    const outputPath = path.join(analysisDir, 'execution_model.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`AIL CP7 | Model: ${model} (${confidence}) | Tags: ${tags.join(', ')}`);

    return result;
}