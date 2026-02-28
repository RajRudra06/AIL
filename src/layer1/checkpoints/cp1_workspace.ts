import * as fs from 'fs';
import * as path from 'path';

export function runCheckpoint1(workspacePath: string, layer1Dir: string): void {
    const data = {
        workspace_dir: workspacePath
    };

    const outputPath = path.join(layer1Dir, 'workspace_directory.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    console.log('AIL CP1 | Saved workspace_directory.json');
}