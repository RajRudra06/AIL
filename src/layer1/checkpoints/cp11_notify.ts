import * as vscode from 'vscode';
import { Layer1Manifest } from './cp10_assemble_manifest';  // ← already correct

export function runCheckpoint11(manifest: Layer1Manifest): void {  // ← cp9 → cp11

    const langList = manifest.languages.languages
        .map(l => `${l.name} ${l.percentage}%`)
        .join(', ');

    const fwList = manifest.frameworks.frameworks
        .map(f => f.name)
        .join(', ') || 'none detected';

    const summary = [
        `✓ Layer 1 complete`,
        `Language: ${langList}`,
        `Frameworks: ${fwList}`,
        `Entry point: ${manifest.entryPoints.primaryEntry ?? 'not found'}`,
        `Total LOC: ${manifest.metrics.totalLines.toLocaleString()}`
    ].join(' · ');
    // Console log only to prevent noisy UI toasts
    // vscode.window.showInformationMessage(summary);

    console.log('AIL CP11 |', summary);  // ← CP8 → CP11
}