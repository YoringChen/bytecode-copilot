import * as vscode from 'vscode';

// Logger utility
const logger = {
  info: (message: string) => console.log(`[ByteCode Copilot] ${message}`),
  error: (message: string, error?: unknown) => {
    console.error(`[ByteCode Copilot] ${message}`, error);
  },
  warn: (message: string) => console.warn(`[ByteCode Copilot] ${message}`),
  debug: (message: string) => console.debug(`[ByteCode Copilot] ${message}`),
};

export interface ExtensionConfig {
  enabled: boolean;
  apiEndpoint: string;
  model: string;
  maxTokens: number;
  temperature: number;
  debounceMs: number;
}

const SECRET_KEY = 'bytecodeCopilot.apiKey';

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('bytecodeCopilot');
  return {
    enabled: config.get<boolean>('enabled', true),
    apiEndpoint: config.get<string>('apiEndpoint', 'https://ark.cn-beijing.volces.com/api/coding/v1/messages'),
    model: config.get<string>('model', 'doubao-seed-2.0-lite'),
    maxTokens: config.get<number>('maxTokens', 200),
    temperature: config.get<number>('temperature', 0.1),
    debounceMs: config.get<number>('debounceMs', 150),
  };
}

export async function getApiKey(context: vscode.ExtensionContext): Promise<string> {
  try {
    // First try to get from secret storage (preferred method)
    const secretKey = await context.secrets.get(SECRET_KEY);
    if (secretKey) {
      return secretKey;
    }
  } catch (error) {
    logger.error('Failed to get API key from secret storage', error);
  }

  // Fallback to config for backward compatibility (deprecated)
  try {
    const config = vscode.workspace.getConfiguration('bytecodeCopilot');
    const deprecatedKey = config.get<string>('apiKey', '');
    if (deprecatedKey) {
      logger.warn('Using deprecated API key from configuration - please use the command to set it securely');
      // Migrate the key to secret storage automatically
      try {
        await context.secrets.store(SECRET_KEY, deprecatedKey);
        logger.info('Automatically migrated API key to secret storage');
        // Clear the deprecated config
        await config.update('apiKey', undefined, vscode.ConfigurationTarget.Global);
      } catch (migrateError) {
        logger.error('Failed to migrate API key to secret storage', migrateError);
      }
    }
    return deprecatedKey;
  } catch (error) {
    logger.error('Failed to get API key from config', error);
    return '';
  }
}

export async function setApiKey(context: vscode.ExtensionContext, apiKey: string): Promise<void> {
  try {
    if (apiKey && apiKey.trim()) {
      logger.debug('Storing API key in secret storage');
      await context.secrets.store(SECRET_KEY, apiKey.trim());
    } else {
      await deleteApiKey(context);
    }
  } catch (error) {
    logger.error('Failed to set API key', error);
    throw new Error('Failed to save API Key. Please try again.');
  }
}

export async function deleteApiKey(context: vscode.ExtensionContext): Promise<void> {
  try {
    logger.debug('Deleting API key from secret storage');
    await context.secrets.delete(SECRET_KEY);
  } catch (error) {
    logger.error('Failed to delete API key', error);
    throw new Error('Failed to clear API Key. Please try again.');
  }
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateConfig(config: ExtensionConfig): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.apiEndpoint) {
    errors.push('API endpoint is required');
  } else {
    try {
      new URL(config.apiEndpoint);
    } catch {
      errors.push('API endpoint must be a valid URL');
    }
  }

  if (!config.model) {
    errors.push('Model name is required');
  }

  if (config.maxTokens < 1) {
    errors.push('Max tokens must be at least 1');
  } else if (config.maxTokens > 4096) {
    warnings.push('Max tokens is very high - consider using a lower value for better performance');
  }

  if (config.temperature < 0 || config.temperature > 2) {
    errors.push('Temperature must be between 0 and 2');
  }

  if (config.debounceMs < 0) {
    errors.push('Debounce delay cannot be negative');
  } else if (config.debounceMs > 10000) {
    warnings.push('Debounce delay is very high - completions will feel unresponsive');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
