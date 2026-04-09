import * as vscode from 'vscode';
import { getConfig, getApiKey, validateConfig } from './config';
import { buildPrompt, getPrefixSuffix } from './prompt-builder';
import { callAnthropicAPI } from './api-client';

interface CacheEntry {
  completion: string;
  timestamp: number;
  lastAccessed: number;
}

// Logger utility
const logger = {
  info: (message: string) => console.log(`[ByteCode Copilot] ${message}`),
  error: (message: string, error?: unknown) => {
    console.error(`[ByteCode Copilot] ${message}`, error);
  },
  warn: (message: string) => console.warn(`[ByteCode Copilot] ${message}`),
  debug: (message: string) => console.debug(`[ByteCode Copilot] ${message}`),
};

export class ByteCodeCompletionProvider implements vscode.InlineCompletionItemProvider {
  private debounceTimer: NodeJS.Timeout | null = null;
  private currentAbortController: AbortController | null = null;
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 30000; // 30 seconds
  private readonly MAX_CACHE_SIZE = 50; // Increased cache size
  private context: vscode.ExtensionContext;
  private errorShown = false;
  private lastErrorTime = 0;
  private readonly ERROR_COOLDOWN_MS = 60000; // 1 minute

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList | undefined> {
    const config = getConfig();
    const apiKey = await getApiKey(this.context);

    if (!config.enabled) {
      return undefined;
    }

    if (!apiKey) {
      if (!this.errorShown || Date.now() - this.lastErrorTime > this.ERROR_COOLDOWN_MS) {
        logger.warn('API Key not configured');
        this.errorShown = true;
        this.lastErrorTime = Date.now();
      }
      return undefined;
    }

    // Validate configuration
    const validation = validateConfig(config);
    if (!validation.valid) {
      logger.warn(`Invalid config: ${validation.errors.join(', ')}`);
      return undefined;
    }

    // Cancel any pending request
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // For automatic trigger, use debounce
    if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
      return new Promise((resolve) => {
        let resolved = false;
        let cancellationDisposable: vscode.Disposable | null = null;

        const wrappedResolve = (value: vscode.InlineCompletionList | undefined) => {
          if (!resolved) {
            resolved = true;
            cancellationDisposable?.dispose();
            resolve(value);
          }
        };

        this.debounceTimer = setTimeout(() => {
          this.getCompletion(document, position, token)
            .then(wrappedResolve)
            .catch((err) => {
              logger.error('Completion promise error', err);
              wrappedResolve(undefined);
            });
        }, config.debounceMs);

        cancellationDisposable = token.onCancellationRequested(() => {
          logger.debug('Completion cancelled by token');
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
          }
          wrappedResolve(undefined);
        });
      });
    }

    // For manual trigger, request immediately
    return this.getCompletion(document, position, token);
  }

  private async getCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList | undefined> {
    const config = getConfig();
    const apiKey = await getApiKey(this.context);
    const { prefix, suffix } = getPrefixSuffix(document, position);

    // Check cache
    const cacheKey = this.getCacheKey(prefix, document.fileName);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.debug('Cache hit');
      // LRU: Delete and re-add to move to end (most recent)
      this.cache.delete(cacheKey);
      cached.lastAccessed = Date.now();
      this.cache.set(cacheKey, cached);
      return this.createCompletionList(cached.completion, document, position);
    }

    // Build prompt
    const prompt = buildPrompt({
      prefix,
      suffix,
      fileName: document.fileName,
      language: document.languageId,
    });

    // Create abort controller
    this.currentAbortController = new AbortController();
    const abortSignal = this.currentAbortController.signal;

    // Listen for cancellation - store disposable to clean up later
    const cancellationDisposable = token.onCancellationRequested(() => {
      logger.debug('Cancellation requested');
      this.currentAbortController?.abort();
    });

    try {
      logger.debug('Requesting completion...');
      const completion = await callAnthropicAPI(prompt, apiKey, config, abortSignal);
      logger.debug(`Received completion: ${completion.length} chars`);

      if (!completion || !completion.trim()) {
        logger.debug('Empty completion received from API');
        return undefined;
      }

      // Clean up completion
      const cleanedCompletion = this.cleanCompletion(completion);

      const finalCompletion = cleanedCompletion.trim() ? cleanedCompletion : completion.trim();

      // Cache the result (always cache the original if we use fallback)
      this.setCache(cacheKey, finalCompletion);

      const result = this.createCompletionList(finalCompletion, document, position);
      logger.debug(`Returning ${result.items.length} completion item(s)`);
      return result;
    } catch (error) {
      if ((error as Error).name === 'AbortError' || (error as Error).message.includes('aborted')) {
        logger.debug('Request aborted');
        return undefined;
      }

      logger.error('Completion error', error);

      // Show user-friendly error messages occasionally
      if (!this.errorShown || Date.now() - this.lastErrorTime > this.ERROR_COOLDOWN_MS) {
        this.errorShown = true;
        this.lastErrorTime = Date.now();

        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showWarningMessage(
          `ByteCode Copilot: ${errorMsg}`,
          'Set API Key'
        ).then(selection => {
          if (selection === 'Set API Key') {
            vscode.commands.executeCommand('bytecodeCopilot.setApiKey');
          }
        });
      }

      return undefined;
    } finally {
      cancellationDisposable.dispose();
      this.currentAbortController = null;
    }
  }

  private createCompletionList(
    text: string,
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.InlineCompletionList {
    // Find the word start position before the cursor
    const lineText = document.lineAt(position.line).text;
    let wordStart = position.character;
    while (wordStart > 0 && /[\w$]/.test(lineText[wordStart - 1])) {
      wordStart--;
    }
    const range = new vscode.Range(
      position.line, wordStart,
      position.line, position.character
    );
    const item = new vscode.InlineCompletionItem(text);
    item.insertText = text;
    item.range = range;
    return new vscode.InlineCompletionList([item]);
  }

  private cleanCompletion(text: string): string {
    // Remove any leading/trailing whitespace
    let cleaned = text.trim();

    // Remove markdown code blocks if present
    if (cleaned.startsWith('```')) {
      const lines = cleaned.split('\n');
      if (lines.length > 1) {
        // Remove first line (```lang) and last line (```) if it exists
        const lastLine = lines[lines.length - 1];
        if (lastLine.trim() === '```') {
          cleaned = lines.slice(1, -1).join('\n');
        } else {
          cleaned = lines.slice(1).join('\n');
        }
      } else {
        // Just remove the backticks if it's a single line
        cleaned = cleaned.replace(/^```+|```+$/g, '');
      }
    }

    // Stop at common stop sequences - but be more conservative
    const stopSequences = ['\n\n\n', '</code>'];
    for (const seq of stopSequences) {
      const idx = cleaned.indexOf(seq);
      if (idx !== -1) {
        cleaned = cleaned.slice(0, idx);
      }
    }

    return cleaned.trim();
  }

  private getCacheKey(prefix: string, fileName: string): string {
    // Use last 200 chars of prefix for cache key
    const keyPrefix = prefix.slice(-200);
    return `${fileName}:${keyPrefix}`;
  }

  private setCache(key: string, completion: string): void {
    // First, perform cache cleanup
    this.cleanupCache();

    // LRU: If key already exists, delete it first to refresh position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict LRU entries if cache is too big
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictLRU();
    }

    this.cache.set(key, {
      completion,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
    });

    logger.debug(`Cache size: ${this.cache.size}/${this.MAX_CACHE_SIZE}`);
  }

  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      logger.debug('Evicting LRU cache entry');
      this.cache.delete(oldestKey);
    }
  }

  private cleanupCache(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      logger.debug(`Cleaned up ${expiredCount} expired cache entries`);
    }
  }

  // Public method to clear cache (can be called from extension)
  public clearCache(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }
}
