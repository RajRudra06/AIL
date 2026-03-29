import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigUtils {
    private static readWorkspaceEnvVariable(varNames: string[]): string | undefined {
        const wsFolders = vscode.workspace.workspaceFolders;
        if (!wsFolders) {
            return undefined;
        }

        for (const folder of wsFolders) {
            const envPath = path.join(folder.uri.fsPath, '.env');
            if (!fs.existsSync(envPath)) {
                continue;
            }

            try {
                const envContent = fs.readFileSync(envPath, 'utf8');
                const lines = envContent.split(/\r?\n/);

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('#') || !trimmedLine.includes('=')) {
                        continue;
                    }

                    const [key, ...valueParts] = trimmedLine.split('=');
                    const normalizedKey = key.trim();
                    if (!varNames.includes(normalizedKey)) {
                        continue;
                    }

                    let value = valueParts.join('=').trim();
                    value = value.split('#')[0].trim();
                    value = value.replace(/^['"]|['"]$/g, '');

                    if (value) {
                        return value;
                    }
                }
            } catch (e) {
                console.error('[ConfigUtils] Error reading .env:', e);
            }
        }

        return undefined;
    }

    private static readProcessEnvVariable(varNames: string[]): string | undefined {
        for (const name of varNames) {
            const value = process.env[name];
            if (value && value.trim() !== '') {
                return value.trim();
            }
        }
        return undefined;
    }

    /**
     * Resolves the Groq API Key based on priority:
     * 1. Workspace .env files (checks all workspace folders) - SOLE TRUTH
     * 2. process.env (as fallback for environments where .env is pre-loaded)
     */
    public static getGroqApiKey(type: 'general' | 'func' = 'general'): string | undefined {
        const envVarNames = type === 'func'
            ? ['FUNC_CHAT_GROQ_API_KEY', 'GROQ_API_KEY']
            : ['GROQ_API_KEY'];

        const workspaceValue = this.readWorkspaceEnvVariable(envVarNames);
        if (workspaceValue) {
            return workspaceValue;
        }

        return this.readProcessEnvVariable(envVarNames);
    }

    /**
     * Resolves Gemini API key with the following priority:
     * 1. Workspace .env values (GEMINI_API_KEY, GOOGLE_API_KEY, AIL_GEMINI_API_KEY)
     * 2. process.env fallback
     * 3. VS Code setting ail.geminiApiKey
     */
    public static getGeminiApiKey(): string | undefined {
        const envVarNames = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'AIL_GEMINI_API_KEY'];

        const workspaceValue = this.readWorkspaceEnvVariable(envVarNames);
        if (workspaceValue) {
            return workspaceValue;
        }

        const processValue = this.readProcessEnvVariable(envVarNames);
        if (processValue) {
            return processValue;
        }

        const settingsValue = vscode.workspace.getConfiguration('ail').get<string>('geminiApiKey');
        if (settingsValue && settingsValue.trim() !== '') {
            return settingsValue.trim();
        }

        return undefined;
    }
}

// yes proceed but keep in mind i need all fuc nodes liek some func coudl be indepemnet right no chidl and no parent so for those nodes i want a drop down in teh FUNC CALL VIEW saying RELATIOHSIP BASED NODES and then INDEPNED NODES and lest say 30 indepenedt nodes or fun cexist dont jsut dump all of them have some sort of cirteria so that some come at a time and in the same vertical flowhcart way but shoudlnt have any edges since no relationship seodnly all features from FUNC GRPAH relatioship of hovering to see meta data of func or slecting teh func to ask chat bot about it or clicking on it to open teh file window of clicking multipke func to see the chain functioning those shoudl be in both teh DROPDOWN VIEW 