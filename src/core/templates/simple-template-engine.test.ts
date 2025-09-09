/**
 * Tests for SimpleTemplateEngine
 */

import { SimpleTemplateEngine } from './simple-template-engine';
import { createLogger } from '../../lib/logger';

describe('SimpleTemplateEngine', () => {
  let engine: SimpleTemplateEngine;
  let logger: any;

  beforeEach(() => {
    logger = createLogger({ name: 'test', level: 'error' });
    engine = new SimpleTemplateEngine(logger);
  });

  describe('basic template rendering', () => {
    it('should render simple variables', () => {
      engine.registerTemplate({
        name: 'test-simple',
        content: 'Hello {{name}}! You are {{age}} years old.',
      });

      const result = engine.render('test-simple', { name: 'John', age: 30 });

      expect(result.ok).toBe(true);
      expect(result.value).toBe('Hello John! You are 30 years old.');
    });

    it('should handle missing variables', () => {
      engine.registerTemplate({
        name: 'test-missing',
        content: 'Hello {{name}}! Missing: {{missing}}',
      });

      const result = engine.render('test-missing', { name: 'John' });

      expect(result.ok).toBe(true);
      expect(result.value).toBe('Hello John! Missing: ');
    });

    it('should handle conditional blocks', () => {
      engine.registerTemplate({
        name: 'test-conditional',
        content: 'Hello {{name}}!{{#framework}} Framework: {{framework}}{{/framework}}',
      });

      // With framework
      const result1 = engine.render('test-conditional', { name: 'John', framework: 'React' });
      expect(result1.isSuccess()).toBe(true);
      expect(result1.value).toBe('Hello John! Framework: React');

      // Without framework
      const result2 = engine.render('test-conditional', { name: 'John' });
      expect(result2.isSuccess()).toBe(true);
      expect(result2.value).toBe('Hello John!');
    });
  });

  describe('dockerfile template', () => {
    it('should render dockerfile template correctly', () => {
      engine.registerTemplate({
        name: 'dockerfile-test',
        content: `FROM {{language}}:{{version}}

WORKDIR /app
{{#framework}}
# Framework: {{framework}}
{{/framework}}
COPY package.json ./
EXPOSE {{port}}

CMD ["node", "{{entryPoint}}"]`,
      });

      const result = engine.render('dockerfile-test', {
        language: 'node',
        version: '18-slim',
        framework: 'express',
        port: '3000',
        entryPoint: 'server.js',
      });

      expect(result.ok).toBe(true);
      const dockerfile = result.value;
      expect(dockerfile).toContain('FROM node:18-slim');
      expect(dockerfile).toContain('# Framework: express');
      expect(dockerfile).toContain('EXPOSE 3000');
      expect(dockerfile).toContain('CMD ["node", "server.js"]');
    });
  });

  describe('template management', () => {
    it('should list templates', () => {
      engine.registerTemplate({ name: 'test1', content: 'content1' });
      engine.registerTemplate({ name: 'test2', content: 'content2', description: 'Test 2' });

      const templates = engine.listTemplates();

      expect(templates).toHaveLength(2);
      expect(templates[0]).toEqual({ name: 'test1', description: undefined });
      expect(templates[1]).toEqual({ name: 'test2', description: 'Test 2' });
    });

    it('should check template existence', () => {
      engine.registerTemplate({ name: 'exists', content: 'content' });

      expect(engine.hasTemplate('exists')).toBe(true);
      expect(engine.hasTemplate('not-exists')).toBe(false);
    });

    it('should return template info', () => {
      const template = { name: 'info-test', content: 'content', description: 'Test desc' };
      engine.registerTemplate(template);

      const info = engine.getTemplateInfo('info-test');
      expect(info).toEqual(template);

      const missing = engine.getTemplateInfo('missing');
      expect(missing).toBeNull();
    });

    it('should handle missing templates gracefully', () => {
      const result = engine.render('missing-template', { name: 'test' });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Template not found: missing-template');
    });
  });
});