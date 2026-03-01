import * as vscode from 'vscode';
import { Layer4Manifest } from './cp3_assemble_manifest';

/**
 * CP4: Final notification — full pipeline complete.
 */
export function runCheckpoint4(manifest: Layer4Manifest): void {
    const s = manifest.stats;
    const msg = [
        '✓ AIL Pipeline Complete!',
        `${s.totalNodes} graph nodes`,
        `${s.totalEdges} edges`,
        `${s.entityCount} entities`,
        `${s.languages.join(', ')}`,
    ].join(' · ');

    vscode.window.showInformationMessage(msg);
    console.log('AIL L4-CP4 |', msg);
}
