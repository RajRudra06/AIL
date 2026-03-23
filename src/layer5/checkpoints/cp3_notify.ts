import * as vscode from 'vscode';
import { Layer5Manifest } from './cp2_assemble_manifest';

/**
 * CP3: Notify completion of Layer 5 index.
 */
export function runCheckpoint3(manifest: Layer5Manifest): void {
    console.log('AIL L5-CP3 | GraphRAG Engine ready.');

    console.log('AIL L5-CP3 | GraphRAG Engine ready. Indexed ' + manifest.embedStats.embeddedNodes + ' semantic nodes for Chat.');
    
    // vscode.window.showInformationMessage(
    //    `AIL: Layer 5 GraphRAG Ready. Indexed ${manifest.embedStats.embeddedNodes} semantic nodes for Chat.`
    // );
}
