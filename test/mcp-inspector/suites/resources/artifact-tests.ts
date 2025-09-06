/**
 * MCP Inspector Artifact Management Tests
 * 
 * Tests for validating artifact publishing and resource management
 */

import type { TestCase, MCPTestRunner, TestResult } from '../../infrastructure/test-runner.js';
import { ARTIFACT_SCHEMES } from '../../../../src/mcp/resources/artifact-schemes.js';

export const createArtifactTests = (testRunner: MCPTestRunner): TestCase[] => {
  const client = testRunner.getClient();

  return [
    {
      name: 'artifact-publishing',
      category: 'resource-management',
      description: 'Verify artifacts are published with correct URIs',
      tags: ['artifacts', 'resources', 'publishing'],
      timeout: 60000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `artifact-${Date.now()}`;
        
        try {
          // Execute workflow
          await client.callTool({
            name: 'execute-workflow',
            arguments: {
              sessionId,
              repoPath: './test/fixtures/node-express',
              phases: ['analysis', 'dockerfile_generation']
            }
          });
          
          // Check for published artifacts
          const expectedArtifacts = [
            `${ARTIFACT_SCHEMES.ANALYSIS}://${sessionId}/summary`,
            `${ARTIFACT_SCHEMES.ANALYSIS}://${sessionId}/graph`,
            `${ARTIFACT_SCHEMES.DOCKERFILE}://${sessionId}/candidate/1`,
            `${ARTIFACT_SCHEMES.DOCKERFILE}://${sessionId}/candidate/2`,
            `${ARTIFACT_SCHEMES.DOCKERFILE}://${sessionId}/candidate/3`,
            `${ARTIFACT_SCHEMES.DOCKERFILE}://${sessionId}/winner`
          ];
          
          const artifactChecks = await Promise.all(
            expectedArtifacts.map(async (uri) => {
              try {
                const resource = await client.readResource({ uri });
                return {
                  uri,
                  exists: !resource.isError && resource.content?.length > 0
                };
              } catch (error) {
                return {
                  uri,
                  exists: false
                };
              }
            })
          );
          
          const allPublished = artifactChecks.every(check => check.exists);
          
          return {
            success: allPublished,
            duration: performance.now() - start,
            message: allPublished ? 'All artifacts published' : 'Missing artifacts',
            details: { artifactChecks }
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    },
    
    {
      name: 'artifact-size-limits',
      category: 'resource-management',
      description: 'Verify artifacts respect size limits',
      tags: ['artifacts', 'resources', 'limits'],
      timeout: 30000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `size-limit-${Date.now()}`;
        
        try {
          // Try to publish oversized artifact
          const result = await client.callTool({
            name: 'publish-artifact',
            arguments: {
              uri: `test://${sessionId}/large`,
              content: 'x'.repeat(6 * 1024 * 1024), // 6MB
              maxSize: 5 * 1024 * 1024 // 5MB limit
            }
          });
          
          const response = JSON.parse(result.content[0].text);
          
          const limitEnforced = 
            !response.success &&
            response.error?.includes('Resource too large');
          
          return {
            success: limitEnforced,
            duration: performance.now() - start,
            message: limitEnforced ? 'Size limit enforced' : 'Size limit not enforced',
            details: response
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    },
    
    {
      name: 'artifact-uri-parsing',
      category: 'resource-management',
      description: 'Verify artifact URI parsing works correctly',
      tags: ['artifacts', 'uri', 'parsing'],
      timeout: 15000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        
        try {
          // Test URI parsing
          const testUris = [
            `${ARTIFACT_SCHEMES.ANALYSIS}://session123/summary`,
            `${ARTIFACT_SCHEMES.DOCKERFILE}://session456/candidate/1`,
            `${ARTIFACT_SCHEMES.BUILD}://session789/image/abc123`,
            `${ARTIFACT_SCHEMES.SCAN}://session000/report`
          ];
          
          const parseResults = await Promise.all(
            testUris.map(async (uri) => {
              const result = await client.callTool({
                name: 'parse-artifact-uri',
                arguments: { uri }
              });
              return {
                uri,
                parsed: JSON.parse(result.content[0].text)
              };
            })
          );
          
          // Verify all URIs parsed correctly
          const allParsed = parseResults.every(result => 
            result.parsed.scheme &&
            result.parsed.sessionId &&
            result.parsed.type
          );
          
          return {
            success: allParsed,
            duration: performance.now() - start,
            message: allParsed ? 'All URIs parsed correctly' : 'URI parsing failed',
            details: { parseResults }
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    },
    
    {
      name: 'artifact-retrieval',
      category: 'resource-management',
      description: 'Verify artifacts can be retrieved after publishing',
      tags: ['artifacts', 'retrieval', 'persistence'],
      timeout: 45000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `retrieval-${Date.now()}`;
        
        try {
          const testData = {
            analysis: { language: 'javascript', framework: 'express' },
            dockerfile: 'FROM node:18\nWORKDIR /app\nCOPY . .\nRUN npm install',
            build: { imageId: 'test:latest', size: 100000000 }
          };
          
          // Publish artifacts
          const publishResults = await Promise.all([
            client.callTool({
              name: 'publish-artifact',
              arguments: {
                uri: `${ARTIFACT_SCHEMES.ANALYSIS}://${sessionId}/data`,
                content: JSON.stringify(testData.analysis)
              }
            }),
            client.callTool({
              name: 'publish-artifact',
              arguments: {
                uri: `${ARTIFACT_SCHEMES.DOCKERFILE}://${sessionId}/content`,
                content: testData.dockerfile
              }
            }),
            client.callTool({
              name: 'publish-artifact',
              arguments: {
                uri: `${ARTIFACT_SCHEMES.BUILD}://${sessionId}/result`,
                content: JSON.stringify(testData.build)
              }
            })
          ]);
          
          // Retrieve artifacts
          const retrieveResults = await Promise.all([
            client.readResource({ 
              uri: `${ARTIFACT_SCHEMES.ANALYSIS}://${sessionId}/data` 
            }),
            client.readResource({ 
              uri: `${ARTIFACT_SCHEMES.DOCKERFILE}://${sessionId}/content` 
            }),
            client.readResource({ 
              uri: `${ARTIFACT_SCHEMES.BUILD}://${sessionId}/result` 
            })
          ]);
          
          // Verify content matches
          const contentMatches = 
            JSON.stringify(JSON.parse(retrieveResults[0].content as string)) === JSON.stringify(testData.analysis) &&
            retrieveResults[1].content === testData.dockerfile &&
            JSON.stringify(JSON.parse(retrieveResults[2].content as string)) === JSON.stringify(testData.build);
          
          return {
            success: contentMatches,
            duration: performance.now() - start,
            message: contentMatches ? 'Artifacts retrieved successfully' : 'Content mismatch',
            details: { 
              published: publishResults.map(r => JSON.parse(r.content[0].text)),
              retrieved: retrieveResults.map(r => r.content)
            }
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    },
    
    {
      name: 'artifact-listing',
      category: 'resource-management',
      description: 'Verify artifacts can be listed by session',
      tags: ['artifacts', 'listing', 'discovery'],
      timeout: 30000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `listing-${Date.now()}`;
        
        try {
          // Publish multiple artifacts
          await Promise.all([
            client.callTool({
              name: 'publish-artifact',
              arguments: {
                uri: `${ARTIFACT_SCHEMES.ANALYSIS}://${sessionId}/item1`,
                content: 'content1'
              }
            }),
            client.callTool({
              name: 'publish-artifact',
              arguments: {
                uri: `${ARTIFACT_SCHEMES.ANALYSIS}://${sessionId}/item2`,
                content: 'content2'
              }
            }),
            client.callTool({
              name: 'publish-artifact',
              arguments: {
                uri: `${ARTIFACT_SCHEMES.DOCKERFILE}://${sessionId}/item3`,
                content: 'content3'
              }
            })
          ]);
          
          // List artifacts for session
          const listResult = await client.callTool({
            name: 'list-artifacts',
            arguments: { sessionId }
          });
          
          const artifacts = JSON.parse(listResult.content[0].text);
          
          // Should have all 3 artifacts
          const hasAllArtifacts = 
            artifacts.length === 3 &&
            artifacts.some((a: any) => a.uri.includes('item1')) &&
            artifacts.some((a: any) => a.uri.includes('item2')) &&
            artifacts.some((a: any) => a.uri.includes('item3'));
          
          return {
            success: hasAllArtifacts,
            duration: performance.now() - start,
            message: hasAllArtifacts ? 'All artifacts listed' : 'Missing artifacts in listing',
            details: { artifacts }
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    },
    
    {
      name: 'artifact-cleanup',
      category: 'resource-management',
      description: 'Verify artifacts can be cleaned up by session',
      tags: ['artifacts', 'cleanup', 'lifecycle'],
      timeout: 30000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `cleanup-${Date.now()}`;
        
        try {
          // Publish artifacts
          await client.callTool({
            name: 'publish-artifact',
            arguments: {
              uri: `${ARTIFACT_SCHEMES.ANALYSIS}://${sessionId}/temp`,
              content: 'temporary data'
            }
          });
          
          // Verify artifact exists
          const beforeCleanup = await client.readResource({
            uri: `${ARTIFACT_SCHEMES.ANALYSIS}://${sessionId}/temp`
          });
          
          // Clean up session artifacts
          await client.callTool({
            name: 'cleanup-artifacts',
            arguments: { sessionId }
          });
          
          // Verify artifact is gone
          let afterCleanup;
          try {
            afterCleanup = await client.readResource({
              uri: `${ARTIFACT_SCHEMES.ANALYSIS}://${sessionId}/temp`
            });
          } catch (error) {
            afterCleanup = { isError: true };
          }
          
          const cleanupWorked = 
            !beforeCleanup.isError && 
            afterCleanup.isError;
          
          return {
            success: cleanupWorked,
            duration: performance.now() - start,
            message: cleanupWorked ? 'Artifacts cleaned up successfully' : 'Cleanup failed',
            details: { 
              beforeCleanup: !beforeCleanup.isError,
              afterCleanup: afterCleanup.isError
            }
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    }
  ];
};