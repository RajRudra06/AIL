import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigUtils {
    /**
     * Resolves the Groq API Key based on priority:
     * 1. Workspace .env files (checks all workspace folders) - SOLE TRUTH
     * 2. process.env (as fallback for environments where .env is pre-loaded)
     */
    public static getGroqApiKey(type: 'general' | 'func' = 'general'): string | undefined {
        let apiKey: string | undefined;

        // 1. Check ALL Workspace .env files (Primary Truth)
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

        // 2. Check process.env (Secondary Truth)
        if (!apiKey) {
            apiKey = (type === 'func') ? process.env.FUNC_CHAT_GROQ_API_KEY : process.env.GROQ_API_KEY;
        }

        // Removed VSCode settings fallback to ensure .env is the absolute source of truth
        return (apiKey && apiKey.trim() !== '') ? apiKey.trim() : undefined;
    }
}

// yes proceed but keep in mind i need all fuc nodes liek some func coudl be indepemnet right no chidl and no parent so for those nodes i want a drop down in teh FUNC CALL VIEW saying RELATIOHSIP BASED NODES and then INDEPNED NODES and lest say 30 indepenedt nodes or fun cexist dont jsut dump all of them have some sort of cirteria so that some come at a time and in the same vertical flowhcart way but shoudlnt have any edges since no relationship seodnly all features from FUNC GRPAH relatioship of hovering to see meta data of func or slecting teh func to ask chat bot about it or clicking on it to open teh file window of clicking multipke func to see the chain functioning those shoudl be in both teh DROPDOWN VIEW 