import * as vscode from 'vscode';
import { Layer3Manifest } from './cp4_assemble_manifest';

/**
 * CP5: VS Code notification for Layer 3 completion.
 */
export function runCheckpoint5(manifest: Layer3Manifest): void {
    const s = manifest.summary;
    const msg = [
        `✓ Layer 3 complete`,
        `${s.totalCommits} commits`,
        `${s.totalContributors} contributors`,
        `${s.hotFileCount} hot files`,
        `${s.staleFileCount} stale files`,
    ].join(' · ');

    vscode.window.showInformationMessage(msg);
    console.log('AIL L3-CP5 |', msg);
}
