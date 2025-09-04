/**
 * .NET domain types and schemas
 */

import { z } from 'zod';

export const DotNetProjectTypeSchema = z.object({
  primary: z.enum(['web', 'console', 'library', 'desktop', 'service', 'blazor']),
  framework: z.enum(['aspnetcore', 'mvc', 'webapi', 'blazor', 'wpf', 'winforms', 'worker']),
  hosting_model: z.enum(['kestrel', 'iis', 'selfhost', 'serverless']),
  modern_alternatives: z.array(z.string()),
});

export type DotNetProjectType = z.infer<typeof DotNetProjectTypeSchema>;

export const DotNetBuildSystemSchema = z.object({
  sdk_style: z.boolean(),
  package_management: z.enum(['packagereference', 'packagesconfig', 'paket']),
  build_optimizations: z.array(z.string()),
  containerization_features: z.array(z.string()),
});

export type DotNetBuildSystem = z.infer<typeof DotNetBuildSystemSchema>;

export const DotNetDependenciesSchema = z.object({
  nuget_packages: z.array(z.string()),
  framework_dependencies: z.array(z.string()),
  security_sensitive: z.array(z.string()),
  outdated: z.array(z.string()),
  container_relevant: z.array(z.string()),
});

export type DotNetDependencies = z.infer<typeof DotNetDependenciesSchema>;

export const ApplicationCharacteristicsSchema = z.object({
  startup_type: z.enum(['fast', 'slow', 'lazy']),
  memory_profile: z.enum(['low', 'medium', 'high']),
  cpu_profile: z.enum(['light', 'moderate', 'intensive']),
  io_profile: z.enum(['network', 'disk', 'both', 'minimal']),
  scaling_pattern: z.enum(['horizontal', 'vertical', 'both']),
  state_management: z.enum(['stateless', 'stateful', 'session']),
});

export type ApplicationCharacteristics = z.infer<typeof ApplicationCharacteristicsSchema>;

export const RuntimeOptimizationsSchema = z.object({
  gc_settings: z.string(),
  runtime_config: z.string(),
  globalization: z.string(),
});

export type RuntimeOptimizations = z.infer<typeof RuntimeOptimizationsSchema>;

export const ContainerizationRecommendationsSchema = z.object({
  base_image_preferences: z.array(z.string()),
  runtime_optimizations: RuntimeOptimizationsSchema,
  multi_stage_strategy: z.string(),
  layer_optimization: z.array(z.string()),
  aot_compilation: z.string(),
});

export type ContainerizationRecommendations = z.infer<typeof ContainerizationRecommendationsSchema>;

export const SecurityConsiderationsSchema = z.object({
  dotnet_security: z.array(z.string()),
  dependency_security: z.array(z.string()),
  runtime_security: z.array(z.string()),
  https_configuration: z.array(z.string()),
});

export type SecurityConsiderations = z.infer<typeof SecurityConsiderationsSchema>;

export const PerformanceOptimizationsSchema = z.object({
  build_time: z.array(z.string()),
  startup_time: z.array(z.string()),
  runtime_performance: z.array(z.string()),
  memory_optimization: z.array(z.string()),
});

export type PerformanceOptimizations = z.infer<typeof PerformanceOptimizationsSchema>;

export const CloudNativeFeaturesSchema = z.object({
  configuration: z.array(z.string()),
  logging: z.array(z.string()),
  health_checks: z.array(z.string()),
  metrics: z.array(z.string()),
  service_discovery: z.array(z.string()),
});

export type CloudNativeFeatures = z.infer<typeof CloudNativeFeaturesSchema>;

export const MigrationRecommendationsSchema = z.object({
  framework_migration: z.string(),
  modernization_opportunities: z.array(z.string()),
  breaking_changes: z.array(z.string()),
});

export type MigrationRecommendations = z.infer<typeof MigrationRecommendationsSchema>;

export const DotNetAnalysisSchema = z.object({
  dotnet_version: z.string(),
  target_framework: z.enum(['net6.0', 'net7.0', 'net8.0', 'netframework4.8']),
  project_type: DotNetProjectTypeSchema,
  build_system: DotNetBuildSystemSchema,
  dependencies: DotNetDependenciesSchema,
  application_characteristics: ApplicationCharacteristicsSchema,
  containerization_recommendations: ContainerizationRecommendationsSchema,
  security_considerations: SecurityConsiderationsSchema,
  performance_optimizations: PerformanceOptimizationsSchema,
  cloud_native_features: CloudNativeFeaturesSchema,
  migration_recommendations: MigrationRecommendationsSchema,
});

export type DotNetAnalysis = z.infer<typeof DotNetAnalysisSchema>;
