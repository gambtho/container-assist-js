// Test setup for Jest
console.log('Setting up tests for Container Kit MCP JavaScript implementation')

// Test setup - no global jest timeout set here as it's not available in setup

// Mock console methods to reduce noise in tests unless explicitly needed
const originalLog = console.log
const originalWarn = console.warn
const originalError = console.error

// Only show test progress logs, not verbose component logs
console.log = (...args) => {
  const message = args.join(' ')
  if (message.includes('✓') || message.includes('⚠') || message.includes('ℹ') || 
      message.includes('Docker')) {
    originalLog(...args)
  }
}

console.warn = (...args) => {
  const message = args.join(' ')
  if (message.includes('Docker') || message.includes('Trivy')) {
    originalWarn(...args)
  }
}

// Always show errors
console.error = originalError