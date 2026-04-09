import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ByteCodeCompletionProvider } from '../completion-provider';
import * as configModule from '../config';
import * as promptBuilderModule from '../prompt-builder';
import * as apiClientModule from '../api-client';

// Mock VS Code API with type assertions
const mockContext = {
  secrets: {
    get: sinon.stub(),
    store: sinon.stub(),
    delete: sinon.stub(),
    keys: sinon.stub(),
    onDidChange: sinon.stub()
  } as unknown as vscode.SecretStorage
} as unknown as vscode.ExtensionContext;

const mockDocument = {
  fileName: 'test.ts',
  languageId: 'typescript',
  getText: sinon.stub(),
  lineAt: sinon.stub() as unknown as ((line: number) => vscode.TextLine) & ((position: vscode.Position) => vscode.TextLine),
  lineCount: 10
} as unknown as vscode.TextDocument;

const mockPosition = {
  line: 5,
  character: 10
} as vscode.Position;

const mockToken = {
  isCancellationRequested: false,
  onCancellationRequested: sinon.stub()
} as unknown as vscode.CancellationToken;

const mockInlineCompletionContext = {
  triggerKind: vscode.InlineCompletionTriggerKind.Invoke,
  selectedCompletionInfo: undefined
} as vscode.InlineCompletionContext;

describe('completion-provider', () => {
  let provider: ByteCodeCompletionProvider;
  let getConfigStub: sinon.SinonStub;
  let getApiKeyStub: sinon.SinonStub;
  let validateConfigStub: sinon.SinonStub;
  let buildPromptStub: sinon.SinonStub;
  let callAnthropicAPIStub: sinon.SinonStub;
  let getPrefixSuffixStub: sinon.SinonStub;

  beforeEach(() => {
    // Create stubs
    getConfigStub = sinon.stub(configModule, 'getConfig');
    getApiKeyStub = sinon.stub(configModule, 'getApiKey');
    validateConfigStub = sinon.stub(configModule, 'validateConfig');
    buildPromptStub = sinon.stub(promptBuilderModule, 'buildPrompt');
    callAnthropicAPIStub = sinon.stub(apiClientModule, 'callAnthropicAPI');
    getPrefixSuffixStub = sinon.stub(promptBuilderModule, 'getPrefixSuffix');

    // Default stub returns
    getConfigStub.returns({
      enabled: true,
      apiEndpoint: 'https://api.example.com',
      model: 'test-model',
      maxTokens: 100,
      temperature: 0.1,
      debounceMs: 200
    });
    getApiKeyStub.resolves('test-api-key');
    validateConfigStub.returns({ valid: true, errors: [], warnings: [] });
    buildPromptStub.returns('test prompt');
    callAnthropicAPIStub.resolves('test completion');
    getPrefixSuffixStub.returns({ prefix: 'const x = ', suffix: ';' });

    // Create provider instance
    provider = new ByteCodeCompletionProvider(mockContext as vscode.ExtensionContext);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('initialization', () => {
    it('should create an instance', () => {
      expect(provider).to.be.instanceOf(ByteCodeCompletionProvider);
    });

    it('should have clearCache method', () => {
      expect(typeof provider.clearCache).to.equal('function');
    });
  });

  describe('provideInlineCompletionItems', () => {
    it('should return undefined when disabled', async () => {
      getConfigStub.returns({
        enabled: false,
        apiEndpoint: 'https://api.example.com',
        model: 'test-model',
        maxTokens: 100,
        temperature: 0.1,
        debounceMs: 200
      });

      const result = await provider.provideInlineCompletionItems(
        mockDocument as vscode.TextDocument,
        mockPosition as vscode.Position,
        mockInlineCompletionContext as vscode.InlineCompletionContext,
        mockToken as vscode.CancellationToken
      );

      expect(result).to.be.undefined;
    });

    it('should return undefined when no API key', async () => {
      getApiKeyStub.resolves('');

      const result = await provider.provideInlineCompletionItems(
        mockDocument as vscode.TextDocument,
        mockPosition as vscode.Position,
        mockInlineCompletionContext as vscode.InlineCompletionContext,
        mockToken as vscode.CancellationToken
      );

      expect(result).to.be.undefined;
    });

    it('should return undefined when config is invalid', async () => {
      validateConfigStub.returns({ valid: false, errors: ['Invalid config'], warnings: [] });

      const result = await provider.provideInlineCompletionItems(
        mockDocument as vscode.TextDocument,
        mockPosition as vscode.Position,
        mockInlineCompletionContext as vscode.InlineCompletionContext,
        mockToken as vscode.CancellationToken
      );

      expect(result).to.be.undefined;
    });

    it('should return completion when everything is valid', async () => {
      const result = await provider.provideInlineCompletionItems(
        mockDocument as vscode.TextDocument,
        mockPosition as vscode.Position,
        mockInlineCompletionContext as vscode.InlineCompletionContext,
        mockToken as vscode.CancellationToken
      );

      expect(result).not.to.be.undefined;
      expect(result?.items).to.have.lengthOf(1);
      expect(result?.items[0].insertText).to.equal('test completion');
    });
  });

  describe('cache functionality', () => {
    it('should cache completions', async () => {
      // First call
      await provider.provideInlineCompletionItems(
        mockDocument as vscode.TextDocument,
        mockPosition as vscode.Position,
        mockInlineCompletionContext as vscode.InlineCompletionContext,
        mockToken as vscode.CancellationToken
      );

      // Second call (should use cache)
      callAnthropicAPIStub.resetHistory();
      await provider.provideInlineCompletionItems(
        mockDocument as vscode.TextDocument,
        mockPosition as vscode.Position,
        mockInlineCompletionContext as vscode.InlineCompletionContext,
        mockToken as vscode.CancellationToken
      );

      // API should not be called the second time
      expect(callAnthropicAPIStub.called).to.be.false;
    });

    it('should clear cache when clearCache is called', async () => {
      // First call to cache
      await provider.provideInlineCompletionItems(
        mockDocument as vscode.TextDocument,
        mockPosition as vscode.Position,
        mockInlineCompletionContext as vscode.InlineCompletionContext,
        mockToken as vscode.CancellationToken
      );

      // Clear cache
      provider.clearCache();

      // Second call should hit API again
      callAnthropicAPIStub.resetHistory();
      await provider.provideInlineCompletionItems(
        mockDocument as vscode.TextDocument,
        mockPosition as vscode.Position,
        mockInlineCompletionContext as vscode.InlineCompletionContext,
        mockToken as vscode.CancellationToken
      );

      expect(callAnthropicAPIStub.calledOnce).to.be.true;
    });
  });
});
