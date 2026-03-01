import * as vscode from 'vscode';
import { Layer2Manifest } from './cp7_assemble_manifest';

/**
 * CP8: Show a VS Code notification summarizing Layer 2 results.
 */
export function runCheckpoint8(manifest: Layer2Manifest): void {

    const summary = [
        `✓ Layer 2 complete`,
        `${manifest.summary.totalEntities} entities`,
        `${manifest.summary.totalCallEdges} call edges`,
        `${manifest.summary.totalImportEdges} imports`,
        `${manifest.summary.totalRelationships} relationships`,
        `Avg complexity: ${manifest.summary.avgComplexity}`,
        manifest.summary.complexFunctionCount > 0
            ? `⚠ ${manifest.summary.complexFunctionCount} complex functions`
            : 'No high-complexity functions',
    ].join(' · ');

    vscode.window.showInformationMessage(summary);

    console.log('AIL CP8 |', summary);
}
