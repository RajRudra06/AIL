import * as vscode from 'vscode';
import { Layer3Manifest } from './cp4_assemble_manifest';

/**
 * CP7: VS Code notification for Layer 3 completion (formerly CP5).
 */
export function runCheckpoint7(manifest: Layer3Manifest): void {
    const s = manifest.summary;
    const msg = [
        `✓ Layer 3 complete`,
        `${s.totalCommits} commits`,
        `${s.totalContributors} contributors`,
        `${s.hotFileCount} hot files`,
        `${s.stronglyCoupledPairs} coupled pairs`,
        `avg blast radius: ${s.avgBlastRadius}`,
    ].join(' · ');
    // Console log only
    // vscode.window.showInformationMessage(msg);
    console.log('AIL L3-CP7 |', msg);
}
