# LLM Logic: Provider Selection \u0026 Gemini Models

In the AIL extension, the LLM provider selection and model configuration is handled primarily in `src/extension.ts` using VS Code's native UI components.

## 1. Provider Selection
When the AIL analysis is triggered, the extension prompts the user to select an AI provider via `vscode.window.showQuickPick`:
- The choices presented are **Google Gemini API** (`gemini`) and **Azure OpenAI Service** (`azure`).
- The choice is saved into the global workspace configuration (`ail.aiProvider`).

## 2. Gemini Configuration Flow
If the user selects **Gemini** (`provider === 'gemini'`):
1. **API Key Check**: The extension checks for an existing `ail.geminiApiKey` in the settings.
2. **Setup Prompt**: If no key is found, it uses `vscode.window.showInputBox` to securely prompt for the key and saves it globally.
3. **Model Discovery**: With the API key, the extension makes an HTTP `fetch` request to the Gemini `models` endpoint:
   `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`
4. **Filtering Models**: The response is filtered to only include models that support the `generateContent` method.
5. **Model Selection UI**: The filtered models are mapped into quick pick items (showing the model's display name and description) and presented to the user via another `showQuickPick`.
6. **Saving the Choice**: The selected model string (e.g., `gemini-2.0-flash`) is saved to the `ail.geminiModel` config.

## 3. Query Execution
During execution (e.g., in `src/llm/llm_client.ts` or `src/layer5/rag/rag_engine.ts`), the system reads the chosen provider, retrieves the saved `geminiApiKey` and `geminiModel`, and then constructs the payload to communicate directly with Google's APIs.
    