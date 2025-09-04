import { renderTemplate, type EscapeContext } from '../../../../src/infrastructure/ai/requests';

describe('renderTemplate', () => {
  describe('security validations', () => {
    it('should reject templates with triple backticks', () => {
      const template = 'Hello {{name}}\n```bash\nrm -rf /\n```';
      expect(() => renderTemplate(template, { name: 'world' })).toThrow(
        'Template contains prohibited triple backticks'
      );
    });

    it('should reject templates with non-printable characters', () => {
      const template = 'Hello {{name}}\x00\x1F';
      expect(() => renderTemplate(template, { name: 'world' })).toThrow(
        'Template contains non-printable characters'
      );
    });

    it('should strip non-printable characters from variable outputs', () => {
      const template = 'Value: {{data}}';
      const result = renderTemplate(template, { data: 'clean\x00\x1Fdirty' });
      expect(result).toBe('Value: cleandirty');
    });
  });

  describe('dotted path support', () => {
    it('should resolve simple dotted paths', () => {
      const template = 'User: {{user.name}}';
      const variables = { user: { name: 'Alice' } };
      const result = renderTemplate(template, variables);
      expect(result).toBe('User: Alice');
    });

    it('should resolve nested dotted paths', () => {
      const template = 'Address: {{user.address.city}}';
      const variables = { user: { address: { city: 'New York' } } };
      const result = renderTemplate(template, variables);
      expect(result).toBe('Address: New York');
    });

    it('should handle missing dotted path gracefully', () => {
      const template = 'Missing: {{user.missing.path}}';
      const variables = { user: { name: 'Alice' } };
      const result = renderTemplate(template, variables);
      expect(result).toBe('Missing:');
    });

    it('should work with dotted paths in conditionals', () => {
      const template = '{{#if user.isActive}}Active User: {{user.name}}{{/if}}';
      const variables = { user: { name: 'Alice', isActive: true } };
      const result = renderTemplate(template, variables);
      expect(result).toBe('Active User: Alice');
    });
  });

  describe('hyphenated key support', () => {
    it('should resolve hyphenated keys', () => {
      const template = 'Build arg: {{build-arg}}';
      const variables = { 'build-arg': 'production' };
      const result = renderTemplate(template, variables);
      expect(result).toBe('Build arg: production');
    });

    it('should resolve mixed hyphen-dot paths', () => {
      const template = 'Config: {{app-config.database.host}}';
      const variables = { 'app-config': { database: { host: 'localhost' } } };
      const result = renderTemplate(template, variables);
      expect(result).toBe('Config: localhost');
    });

    it('should work with hyphens in conditionals', () => {
      const template = '{{#if build-env}}Environment: {{build-env}}{{/if}}';
      const variables = { 'build-env': 'production' };
      const result = renderTemplate(template, variables);
      expect(result).toBe('Environment: production');
    });
  });

  describe('context-aware escaping', () => {
    const testData = {
      simple: 'hello',
      withQuotes: 'say "hello"',
      withNewlines: 'line1\nline2',
      withSpecialChars: 'key: value | array[0]',
      withShellChars: "it's a test & more",
    };

    describe('yaml context', () => {
      it('should escape YAML special characters', () => {
        const template = 'value: {{withSpecialChars}}';
        const result = renderTemplate(template, testData, 'yaml');
        expect(result).toBe('value: "key: value | array[0]"');
      });

      it('should quote strings with newlines', () => {
        const template = 'multiline: {{withNewlines}}';
        const result = renderTemplate(template, testData, 'yaml');
        expect(result).toBe('multiline: "line1\\nline2"');
      });

      it('should leave simple strings unquoted', () => {
        const template = 'simple: {{simple}}';
        const result = renderTemplate(template, testData, 'yaml');
        expect(result).toBe('simple: hello');
      });
    });

    describe('shell context', () => {
      it('should single-quote all strings', () => {
        const template = 'echo {{simple}}';
        const result = renderTemplate(template, testData, 'shell');
        expect(result).toBe("echo 'hello'");
      });

      it('should escape embedded single quotes', () => {
        const template = 'echo {{withShellChars}}';
        const result = renderTemplate(template, testData, 'shell');
        expect(result).toBe("echo 'it'\\''s a test & more'");
      });
    });

    describe('dockerfile context', () => {
      it('should escape quotes and backslashes', () => {
        const template = 'ENV MSG={{withQuotes}}';
        const result = renderTemplate(template, testData, 'dockerfile');
        expect(result).toBe('ENV MSG=say \\"hello\\"');
      });

      it('should handle backslashes correctly', () => {
        const template = 'COPY {{path}}';
        const result = renderTemplate(template, { path: 'C:\\Users\\test' }, 'dockerfile');
        expect(result).toBe('COPY C:\\\\Users\\\\test');
      });
    });

    describe('none context', () => {
      it('should not escape anything', () => {
        const template = 'raw: {{withQuotes}}';
        const result = renderTemplate(template, testData, 'none');
        expect(result).toBe('raw: say "hello"');
      });
    });
  });

  describe('legacy compatibility', () => {
    it('should maintain backward compatibility with simple word keys', () => {
      const template = 'Hello {{name}}!';
      const result = renderTemplate(template, { name: 'world' });
      expect(result).toBe('Hello world!');
    });

    it('should work with conditionals using simple keys', () => {
      const template = '{{#if enabled}}Feature is enabled{{/if}}';
      const result = renderTemplate(template, { enabled: true });
      expect(result).toBe('Feature is enabled');
    });

    it('should handle empty conditionals', () => {
      const template = '{{#if missing}}This should not appear{{/if}}Default content';
      const result = renderTemplate(template, {});
      expect(result).toBe('Default content');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined variables', () => {
      const template = 'Value: {{missing}}';
      const result = renderTemplate(template, {});
      expect(result).toBe('Value:');
    });

    it('should handle null variables', () => {
      const template = 'Value: {{nullValue}}';
      const result = renderTemplate(template, { nullValue: null });
      expect(result).toBe('Value:');
    });

    it('should handle numeric variables', () => {
      const template = 'Port: {{port}}';
      const result = renderTemplate(template, { port: 8080 });
      expect(result).toBe('Port: 8080');
    });

    it('should handle boolean variables', () => {
      const template = 'Debug: {{debug}}';
      const result = renderTemplate(template, { debug: true });
      expect(result).toBe('Debug: true');
    });

    it('should trim whitespace from final result', () => {
      const template = '  {{value}}  ';
      const result = renderTemplate(template, { value: 'test' });
      expect(result).toBe('test');
    });
  });
});