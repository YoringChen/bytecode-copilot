import * as vscode from 'vscode';
import { ByteCodeCompletionProvider } from './completion-provider';
import { setApiKey, deleteApiKey, getApiKey, getConfig, validateConfig } from './config';

let statusBarItem: vscode.StatusBarItem | undefined;

// Logger utility
const logger = {
  info: (message: string) => console.log(`[ByteCode Copilot] ${message}`),
  error: (message: string, error?: unknown) => {
    console.error(`[ByteCode Copilot] ${message}`, error);
  },
  warn: (message: string) => console.warn(`[ByteCode Copilot] ${message}`),
};

export function activate(context: vscode.ExtensionContext) {
  logger.info('Activating extension...');

  // Validate configuration on startup
  const config = getConfig();
  const validation = validateConfig(config);
  if (!validation.valid) {
    validation.errors.forEach(err => logger.warn(`Config warning: ${err}`));
  }

  const provider = new ByteCodeCompletionProvider(context);

  // Register for all languages
  const disposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    provider
  );

  context.subscriptions.push(disposable);

  // Register status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  statusBarItem.text = '$(sparkle) ByteCode';
  statusBarItem.tooltip = 'ByteCode Copilot is active';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register command to set API Key
  const setApiKeyCommand = vscode.commands.registerCommand('bytecodeCopilot.setApiKey', async () => {
    try {
      const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter your ByteCode Copilot API Key',
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'sk-...'
      });

      if (apiKey !== undefined) {
        if (apiKey.trim()) {
          await setApiKey(context, apiKey.trim());
          vscode.window.showInformationMessage('✓ API Key saved successfully!');
          logger.info('API Key updated');
        } else {
          await deleteApiKey(context);
          vscode.window.showInformationMessage('API Key cleared');
          logger.info('API Key cleared');
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to save API Key: ${errorMsg}`);
      logger.error('Failed to save API Key', error);
    }
  });
  context.subscriptions.push(setApiKeyCommand);

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('bytecodeCopilot')) {
        logger.info('Configuration changed');
        const newConfig = getConfig();
        const newValidation = validateConfig(newConfig);
        if (!newValidation.valid) {
          vscode.window.showWarningMessage(
            `ByteCode Copilot configuration issues:\n${newValidation.errors.join('\n')}`
          );
        }
        const apiKey = await getApiKey(context);
        if (!apiKey) {
          vscode.window.showWarningMessage(
            'ByteCode Copilot: Please set your API Key using the "ByteCode: Set API Key" command.'
          );
        }
      }
    })
  );

  // Check if API Key is set on activation
  (async () => {
    try {
      const apiKey = await getApiKey(context);
      if (!apiKey) {
        logger.warn('API Key not set');
        vscode.window.showWarningMessage(
          'ByteCode Copilot: Please set your API Key using the "ByteCode: Set API Key" command.'
        );
      } else {
        logger.info('API Key is configured');
      }
    } catch (error) {
      logger.error('Error checking API Key', error);
    }
  })();

  logger.info('Extension activated successfully');
}

export function deactivate() {
  logger.info('Deactivating extension...');
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = undefined;
  }
  logger.info('Extension deactivated');
}
