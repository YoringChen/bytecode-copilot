// Logger utility
const logger = {
  info: (message: string) => console.log(`[ByteCode Copilot] ${message}`),
  error: (message: string, error?: unknown) => {
    console.error(`[ByteCode Copilot] ${message}`, error);
  },
  warn: (message: string) => console.warn(`[ByteCode Copilot] ${message}`),
  debug: (message: string, _error?: unknown) => console.debug(`[ByteCode Copilot] ${message}`),
};

// Request timeout configuration
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Creates a combined AbortSignal that aborts when either:
 * - The provided external signal aborts, OR
 * - The timeout is reached
 */
function createTimeoutSignal(externalSignal?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  // Set up timeout
  timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, REQUEST_TIMEOUT_MS);

  // Handle external signal
  const handleExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      // If already aborted, abort immediately
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', handleExternalAbort);
    }
  }

  const cleanup = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    if (externalSignal) {
      externalSignal.removeEventListener('abort', handleExternalAbort);
    }
  };

  return { signal: controller.signal, cleanup };
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface APIConfig {
  apiEndpoint: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export class APIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export async function callAnthropicAPI(
  prompt: string,
  apiKey: string,
  config: APIConfig,
  signal?: AbortSignal
): Promise<string> {
  // Validate inputs
  if (!apiKey) {
    throw new APIError('API Key is required. Please set your API Key using the command.');
  }

  if (!config.apiEndpoint) {
    throw new APIError('API endpoint is not configured');
  }

  const requestBody = {
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: false,
    messages: [
      {
        role: 'user' as const,
        content: prompt,
      },
    ],
  };

  logger.debug(`Calling API at ${config.apiEndpoint} with model ${config.model}`);

  try {
    const { signal: combinedSignal, cleanup } = createTimeoutSignal(signal);
    try {
      const response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
        signal: combinedSignal,
      });

      if (!response.ok) {
        let errorMessage: string;
        let errorCode: string | undefined;

        try {
          const errorData = await response.json() as { error?: { message?: string; type?: string } };
          errorMessage = errorData.error?.message || `HTTP ${response.status}`;
          errorCode = errorData.error?.type;
        } catch {
          try {
            errorMessage = await response.text() || `HTTP ${response.status}`;
          } catch {
            errorMessage = `HTTP ${response.status}`;
          }
        }

        logger.error(`API error ${response.status}: ${errorMessage}`);

        // User-friendly error messages based on status code
        if (response.status === 401) {
          throw new APIError(
            'Invalid API Key. Please check your API Key in settings.',
            response.status,
            errorCode
          );
        } else if (response.status === 403) {
          throw new APIError(
            'Access forbidden. Your API Key may not have the required permissions.',
            response.status,
            errorCode
          );
        } else if (response.status === 404) {
          throw new APIError(
            'API endpoint not found. Please check your API endpoint configuration.',
            response.status,
            errorCode
          );
        } else if (response.status === 429) {
          throw new APIError(
            'Rate limit exceeded. Please try again in a few moments.',
            response.status,
            errorCode
          );
        } else if (response.status >= 500) {
          throw new APIError(
            `Server error (${response.status}). Please try again later.`,
            response.status,
            errorCode
          );
        } else {
          throw new APIError(
            `API request failed: ${errorMessage}`,
            response.status,
            errorCode
          );
        }
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch (e) {
        logger.error('Failed to parse API response', e);
        throw new APIError('Failed to parse API response');
      }

      // Validate response structure
      const responseData = data as { content?: Array<{ text?: string }> };
      if (!responseData.content || !Array.isArray(responseData.content)) {
        logger.error('Invalid API response structure', responseData);
        throw new APIError('Invalid response format from API');
      }

      const result = responseData.content[0]?.text || '';
      logger.debug(`API response received: ${result.length} characters`);
      return result;

    } finally {
      cleanup();
    }
  } catch (error) {
    // Re-throw API errors as-is
    if (error instanceof APIError) {
      throw error;
    }

    // Handle timeout errors
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      logger.error('Request timeout', error);
      throw new APIError('Request timed out after 10 seconds. Please try again.');
    }

    // Handle fetch-specific errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      logger.error('Network error', error);
      throw new APIError('Network error: Could not connect to API. Please check your internet connection.');
    }

    // Handle abort errors
    if ((error as Error).name === 'AbortError') {
      logger.debug('Request was aborted');
      throw error;
    }

    // Generic error handler
    logger.error('Unexpected API error', error);
    throw new APIError(
      error instanceof Error ? error.message : 'An unexpected error occurred'
    );
  }
}

export async function streamAnthropicAPI(
  prompt: string,
  apiKey: string,
  config: APIConfig,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const requestBody = {
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: true,
    messages: [
      {
        role: 'user' as const,
        content: prompt,
      },
    ],
  };

  const { signal: combinedSignal, cleanup } = createTimeoutSignal(signal);
  try {
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
      signal: combinedSignal,
    });

    if (!response.ok) {
      let errorText: string;
      try {
        errorText = await response.text();
      } catch {
        errorText = `HTTP ${response.status}`;
      }
      logger.error(`Stream API error ${response.status}: ${errorText}`);
      throw new APIError(`API request failed: ${response.status}`, response.status);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new APIError('No response body from API');
    }

    let fullText = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          if (trimmedLine.startsWith('data: ')) {
            const jsonStr = trimmedLine.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
              const data = JSON.parse(jsonStr) as { type: string; delta?: { text?: string } };
              if (data.type === 'content_block_delta') {
                const chunk = data.delta?.text || '';
                if (chunk) {
                  fullText += chunk;
                  onChunk(chunk);
                }
              }
            } catch (e) {
              logger.debug('Parse error in stream chunk, skipping', e);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.debug('Stream was aborted');
        throw error;
      }
      logger.error('Stream reading error', error);
      throw new APIError('Error reading streaming response');
    }

    return fullText;
  } finally {
    cleanup();
  }
}
