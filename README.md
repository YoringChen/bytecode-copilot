# ByteCode Copilot

VSCode extension that provides inline code completion using ByteDance Code Planning API.

## Features

- 🚀 Real-time inline code completion
- ⚙️ Fully configurable API endpoint, model, and parameters
- 🔒 Secure API key storage in VSCode settings
- 💾 Smart caching to reduce API calls
- ⏱️ Debounced requests for better performance

## Configuration

Configure in VSCode Settings (`Cmd+,` or `Ctrl+,`):

```json
{
  "bytecodeCopilot.enabled": true,
  "bytecodeCopilot.apiEndpoint": "https://ark.cn-beijing.volces.com/api/coding/v1/messages",
  "bytecodeCopilot.apiKey": "your-api-key",
  "bytecodeCopilot.model": "doubao-seed-2.0-lite",
  "bytecodeCopilot.maxTokens": 100,
  "bytecodeCopilot.temperature": 0.1,
  "bytecodeCopilot.debounceMs": 200
}
```

## Installation

### Development Mode

1. Open this folder in VSCode
2. Press `F5` to launch the Extension Development Host window
3. The extension will be active in the new window

### Build and Install

```bash
npm install
npm run compile
```

Then use `vsce package` to create a `.vsix` file for installation.

## Project Structure

```
bytecode-copilot/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── completion-provider.ts # Inline completion provider
│   ├── api-client.ts         # Anthropic API client
│   ├── prompt-builder.ts     # Prompt construction
│   └── config.ts             # Configuration management
├── package.json
└── tsconfig.json
```

## Usage

Just start typing code in any file. The extension will automatically provide inline suggestions as you type.

You can also manually trigger suggestions with the default VSCode inline completion shortcut (usually `Ctrl+Space` or `Cmd+I`).

## License

MIT
