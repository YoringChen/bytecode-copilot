import { expect } from 'chai';
import { buildPrompt, PromptContext } from '../prompt-builder';

describe('prompt-builder', () => {
  describe('buildPrompt', () => {
    const basicContext: PromptContext = {
      prefix: 'const x = 1;',
      suffix: 'console.log(x);',
      fileName: 'test.ts',
      language: 'typescript'
    };

    it('should build a prompt with basic context', () => {
      const prompt = buildPrompt(basicContext);

      expect(prompt).to.include('You are an expert code completion model');
      expect(prompt).to.include('File: test.ts');
      expect(prompt).to.include('Language: typescript');
      expect(prompt).to.include('const x = 1;');
      expect(prompt).to.include('console.log(x);');
    });

    it('should include strict rules in the prompt', () => {
      const prompt = buildPrompt(basicContext);

      expect(prompt).to.include('OUTPUT ONLY THE CODE THAT BELONGS AT THE CURSOR POSITION');
      expect(prompt).to.include('DO NOT include markdown, comments, or any text that isn\'t code');
      expect(prompt).to.include('DO NOT wrap output in code blocks or backticks');
    });

    it('should not truncate short prefix and suffix', () => {
      const shortContext: PromptContext = {
        prefix: 'a'.repeat(100),
        suffix: 'b'.repeat(100),
        fileName: 'short.ts',
        language: 'javascript'
      };

      const prompt = buildPrompt(shortContext);

      expect(prompt).to.include('a'.repeat(100));
      expect(prompt).to.include('b'.repeat(100));
      expect(prompt).not.to.include('...[truncated]...');
    });

    it('should truncate long prefix', () => {
      const longPrefix = 'a'.repeat(5000);
      const context: PromptContext = {
        prefix: longPrefix,
        suffix: 'test',
        fileName: 'long-prefix.ts',
        language: 'javascript'
      };

      const prompt = buildPrompt(context);

      expect(prompt).to.include('...[truncated]...');
      // Should include the end of the prefix
      expect(prompt).to.include('a'.repeat(100));
    });

    it('should truncate long suffix', () => {
      const longSuffix = 'b'.repeat(3000);
      const context: PromptContext = {
        prefix: 'test',
        suffix: longSuffix,
        fileName: 'long-suffix.ts',
        language: 'javascript'
      };

      const prompt = buildPrompt(context);

      expect(prompt).to.include('...[truncated]...');
      // Should include the beginning of the suffix
      expect(prompt).to.include('b'.repeat(100));
    });

    it('should handle empty prefix and suffix', () => {
      const context: PromptContext = {
        prefix: '',
        suffix: '',
        fileName: 'empty.ts',
        language: 'javascript'
      };

      const prompt = buildPrompt(context);

      expect(prompt).to.include('File: empty.ts');
      expect(prompt).to.include('=== CODE BEFORE CURSOR ===');
      expect(prompt).to.include('=== CODE AFTER CURSOR ===');
    });

    it('should include correct section markers', () => {
      const prompt = buildPrompt(basicContext);

      expect(prompt).to.include('=== CODE BEFORE CURSOR ===');
      expect(prompt).to.include('=== CURSOR POSITION - INSERT HERE ===');
      expect(prompt).to.include('=== CODE AFTER CURSOR ===');
      expect(prompt).to.include('=== YOUR CODE COMPLETION ===');
    });
  });
});
