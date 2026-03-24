import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigUtils {
    /**
     * Resolves the Groq API Key based on priority:
     * 1. Workspace .env files (checks all workspace folders)
     * 2. process.env
     * 3. VSCode Configuration (fallback)
     */
    public static getGroqApiKey(type: 'general' | 'func' = 'general'): string | undefined {
        let apiKey: string | undefined;

        // 1. Check ALL Workspace .env files
        const wsFolders = vscode.workspace.workspaceFolders;
        if (wsFolders) {
            for (const folder of wsFolders) {
                const envPath = path.join(folder.uri.fsPath, '.env');
                if (fs.existsSync(envPath)) {
                    try {
                        const envContent = fs.readFileSync(envPath, 'utf8');
                        const varName = (type === 'func') ? 'FUNC_CHAT_GROQ_API_KEY' : 'GROQ_API_KEY';

                        const lines = envContent.split(/\r?\n/);
                        for (const line of lines) {
                            const trimmedLine = line.trim();
                            if (trimmedLine.startsWith('#') || !trimmedLine.includes('=')) continue;

                            const [key, ...valueParts] = trimmedLine.split('=');
                            if (key.trim() === varName) {
                                let value = valueParts.join('=').trim();
                                value = value.split('#')[0].trim();
                                value = value.replace(/^['"]|['"]$/g, '');
                                if (value) {
                                    apiKey = value;
                                    break;
                                }
                            }
                        }
                    } catch (e) {
                        console.error("[ConfigUtils] Error reading .env:", e);
                    }
                }
                if (apiKey) break;
            }
        }

        // 2. Check process.env if not found in .env files
        if (!apiKey) {
            apiKey = (type === 'func') ? process.env.FUNC_CHAT_GROQ_API_KEY : process.env.GROQ_API_KEY;
        }

        // 3. Fallback to VSCode settings
        if (!apiKey) {
            const config = vscode.workspace.getConfiguration('ail');
            apiKey = config.get<string>('groqApiKey') || config.get<string>('geminiApiKey');
        }

        return (apiKey && apiKey.trim() !== '') ? apiKey.trim() : undefined;
    }
}

