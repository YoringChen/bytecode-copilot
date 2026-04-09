import * as vscode from 'vscode';

export interface PromptContext {
  prefix: string;
  suffix: string;
  fileName: string;
  language: string;
}

const MAX_PREFIX_CHARS = 4000;
const MAX_SUFFIX_CHARS = 2000;

export function buildPrompt(context: PromptContext): string {
  const { prefix, suffix, fileName, language } = context;

  const truncatedPrefix = truncatePrefix(prefix);
  const truncatedSuffix = truncateSuffix(suffix);

  return `You are an expert code completion model. Your sole task is to generate precise code completions at the cursor position.

STRICT RULES - FOLLOW THESE EXACTLY:
1. OUTPUT ONLY THE CODE THAT BELONGS AT THE CURSOR POSITION - NO EXPLANATIONS
2. DO NOT include markdown, comments, or any text that isn't code
3. DO NOT repeat the code before or after the cursor
4. DO NOT wrap output in code blocks or backticks
5. Continue the code logically based on the surrounding context
6. Stop at the first natural completion point (e.g., end of line, closing bracket, semicolon)
7. Match the existing indentation and coding style
8. Prioritize correctness and readability

CONTEXT:
- File: ${fileName}
- Language: ${language}

=== CODE BEFORE CURSOR ===
${truncatedPrefix}

=== CURSOR POSITION - INSERT HERE ===

=== CODE AFTER CURSOR ===
${truncatedSuffix}

=== YOUR CODE COMPLETION ===`;
}

function truncatePrefix(prefix: string): string {
  if (prefix.length <= MAX_PREFIX_CHARS) {
    return prefix;
  }
  return '...[truncated]...\n' + prefix.slice(-MAX_PREFIX_CHARS);
}

function truncateSuffix(suffix: string): string {
  if (suffix.length <= MAX_SUFFIX_CHARS) {
    return suffix;
  }
  return suffix.slice(0, MAX_SUFFIX_CHARS) + '\n...[truncated]...';
}

export function getPrefixSuffix(
  document: vscode.TextDocument,
  position: vscode.Position
): { prefix: string; suffix: string } {
  const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
  const suffix = document.getText(new vscode.Range(position, document.lineAt(document.lineCount - 1).range.end));
  return { prefix, suffix };
}
