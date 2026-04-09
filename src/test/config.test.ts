import { expect } from 'chai';
import { validateConfig, ExtensionConfig, ConfigValidationResult } from '../config';

describe('config', () => {
  describe('validateConfig', () => {
    const validConfig: ExtensionConfig = {
      enabled: true,
      apiEndpoint: 'https://api.example.com/v1/messages',
      model: 'doubao-seed-2.0-lite',
      maxTokens: 100,
      temperature: 0.1,
      debounceMs: 200
    };

    it('should validate a correct configuration', () => {
      const result: ConfigValidationResult = validateConfig(validConfig);

      expect(result.valid).to.be.true;
      expect(result.errors).to.be.empty;
      expect(result.warnings).to.be.empty;
    });

    it('should reject empty API endpoint', () => {
      const config = { ...validConfig, apiEndpoint: '' };
      const result = validateConfig(config);

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('API endpoint is required');
    });

    it('should reject invalid API endpoint URL', () => {
      const config = { ...validConfig, apiEndpoint: 'not-a-valid-url' };
      const result = validateConfig(config);

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('API endpoint must be a valid URL');
    });

    it('should reject empty model name', () => {
      const config = { ...validConfig, model: '' };
      const result = validateConfig(config);

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('Model name is required');
    });

    it('should reject max tokens less than 1', () => {
      const config = { ...validConfig, maxTokens: 0 };
      const result = validateConfig(config);

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('Max tokens must be at least 1');
    });

    it('should warn on very high max tokens', () => {
      const config = { ...validConfig, maxTokens: 5000 };
      const result = validateConfig(config);

      expect(result.valid).to.be.true;
      expect(result.warnings).to.include('Max tokens is very high - consider using a lower value for better performance');
    });

    it('should reject negative temperature', () => {
      const config = { ...validConfig, temperature: -0.5 };
      const result = validateConfig(config);

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('Temperature must be between 0 and 2');
    });

    it('should reject temperature greater than 2', () => {
      const config = { ...validConfig, temperature: 2.5 };
      const result = validateConfig(config);

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('Temperature must be between 0 and 2');
    });

    it('should accept temperature at boundaries', () => {
      const config1 = { ...validConfig, temperature: 0 };
      const config2 = { ...validConfig, temperature: 2 };

      const result1 = validateConfig(config1);
      const result2 = validateConfig(config2);

      expect(result1.valid).to.be.true;
      expect(result2.valid).to.be.true;
    });

    it('should reject negative debounce', () => {
      const config = { ...validConfig, debounceMs: -100 };
      const result = validateConfig(config);

      expect(result.valid).to.be.false;
      expect(result.errors).to.include('Debounce delay cannot be negative');
    });

    it('should warn on very high debounce', () => {
      const config = { ...validConfig, debounceMs: 15000 };
      const result = validateConfig(config);

      expect(result.valid).to.be.true;
      expect(result.warnings).to.include('Debounce delay is very high - completions will feel unresponsive');
    });

    it('should collect multiple errors', () => {
      const config: ExtensionConfig = {
        ...validConfig,
        apiEndpoint: '',
        model: '',
        maxTokens: 0,
        temperature: -1
      };

      const result = validateConfig(config);

      expect(result.valid).to.be.false;
      expect(result.errors).to.have.lengthOf.at.least(3);
    });

    it('should collect warnings alongside valid config', () => {
      const config = {
        ...validConfig,
        maxTokens: 5000,
        debounceMs: 15000
      };

      const result = validateConfig(config);

      expect(result.valid).to.be.true;
      expect(result.errors).to.be.empty;
      expect(result.warnings).to.have.lengthOf(2);
    });
  });
});
