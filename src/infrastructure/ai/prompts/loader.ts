/**
 * Prompt template loader with caching and file watching
 */

import { readFile, readdir } from 'fs/promises'
import { existsSync, watch } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import type { Logger } from '../../domain/types/index.js'
import { PromptTemplateSchema, type PromptTemplateType } from '../types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface LoaderOptions {
  cacheEnabled?: boolean
  watchFiles?: boolean
}

/**
 * Template loader with caching and validation
 */
export class PromptTemplateLoader {
  private readonly templateDir: string
  private readonly logger: Logger
  private readonly options: Required<LoaderOptions>
  private readonly cache: Map<string, PromptTemplateType> = new Map()
  private readonly fileWatchers: Map<string, any> = new Map()
  private loadedCount: number = 0

  constructor(templateDir: string | undefined, logger: Logger, options: LoaderOptions = {}) {
    this.templateDir = templateDir || join(__dirname, 'templates')
    this.logger = logger.child({ component: 'PromptTemplateLoader' })
    this.options = {
      cacheEnabled: options.cacheEnabled !== false,
      watchFiles: options.watchFiles || false
    }
  }

  /**
   * Load a prompt template
   */
  async load(templateId: string): Promise<PromptTemplateType> {
    // Check cache first
    if (this.options.cacheEnabled && this.cache.has(templateId)) {
      this.logger.debug({ templateId }); // Fixed logger call
      return this.cache.get(templateId)!
    }

    try {
      // Load from filesystem
      const template = await this.loadFromFile(templateId)

      // Cache and watch if enabled
      if (this.options.cacheEnabled) {
        this.cache.set(templateId, template)

        if (this.options.watchFiles) {
          await this.watchTemplate(templateId)
        }
      }

      this.loadedCount++
      return template

    } catch (error) {
      this.logger.error({
        templateId,
        error: (error as Error).message
      }, 'Failed to load template')
      throw error
    }
  }

  /**
   * Load template from file system
   */
  private async loadFromFile(templateId: string): Promise<PromptTemplateType> {
    const possiblePaths = [
      join(this.templateDir, `${templateId}.yaml`),
      join(this.templateDir, `${templateId}.yml`),
      join(this.templateDir, templateId, 'template.yaml'),
      join(this.templateDir, templateId, 'template.yml')
    ]

    for (const templatePath of possiblePaths) {
      if (!existsSync(templatePath)) {
        continue
      }

      try {
        const content = await readFile(templatePath, 'utf8')
        const parsed = yaml.load(content) as any

        const validated = PromptTemplateSchema.parse({
          ...parsed,
          id: templateId
        })

        this.logger.info({
          templateId,
          path: templatePath,
          version: validated.version,
          variables: validated.variables?.length || 0
        }, 'Loaded prompt template')

        return validated

      } catch (error) {
        if ((error as any).name === 'ZodError') {
          this.logger.error({
            templateId,
            path: templatePath,
            errors: (error as any).errors
          }, 'Template validation failed')
          throw new Error(`Invalid template structure for ${templateId}: ${(error as Error).message}`)
        }

        this.logger.warn({
          templateId,
          path: templatePath,
          error: (error as Error).message
        }, 'Failed to parse template file')
      }
    }

    throw new Error(`Template not found: ${templateId}`)
  }

  /**
   * Watch template file for changes
   */
  private async watchTemplate(templateId: string): Promise<void> {
    const templatePath = join(this.templateDir, `${templateId}.yaml`)

    if (!existsSync(templatePath)) {
      return
    }

    try {
      const watcher = watch(templatePath, (eventType, _filename) => {
        if (eventType === 'change') {
          this.logger.info({ templateId }); // Fixed logger call
          this.cache.delete(templateId)

          // Reload asynchronously
          this.load(templateId).catch((error) => {
            this.logger.error({
              templateId,
              error: (error as Error).message
            }, 'Failed to reload template on file change')
          })
        }
      })

      this.fileWatchers.set(templateId, watcher)
      this.logger.debug({ templateId }); // Fixed logger call

    } catch (error) {
      this.logger.warn({
        templateId,
        error: (error as Error).message
      }, 'Failed to watch template file')
    }
  }

  /**
   * Preload all templates in directory
   */
  async preloadAll(): Promise<void> {
    try {
      const files = await readdir(this.templateDir)
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))

      const results = await Promise.allSettled(
        yamlFiles.map(file => {
          const templateId = file.replace(/\.(yaml|yml)$/, '')
          return this.load(templateId)
        })
      )

      const loaded = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      this.logger.info({
        loaded,
        failed,
        total: yamlFiles.length,
        cacheSize: this.cache.size
      }, 'Templates preloaded successfully')

    } catch (error) {
      this.logger.error({
        error: (error as Error).message
      }, 'Failed to preload templates')
    }
  }

  /**
   * Get all loaded template IDs
   */
  getLoadedTemplates(): string[] {
    return Array.from(this.cache.keys())
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
    this.logger.info('Template cache cleared')
  }

  /**
   * Dispose and cleanup
   */
  async dispose(): Promise<void> {
    // Stop watching files
    for (const [id, watcher] of this.fileWatchers) {
      try {
        // Close watcher if it has a close method
        if (watcher && typeof watcher.close === 'function') {
          await watcher.close()
        }
      } catch (error) {
        this.logger.warn({
          templateId: id,
          error: (error as Error).message
        }, 'Failed to close file watcher')
      }
    }

    this.fileWatchers.clear()
    this.cache.clear()

    this.logger.info('Template loader disposed')
  }

  /**
   * Get loader statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      loadedCount: this.loadedCount,
      watchedFiles: this.fileWatchers.size,
      cacheEnabled: this.options.cacheEnabled,
      watchFiles: this.options.watchFiles
    }
  }
}


