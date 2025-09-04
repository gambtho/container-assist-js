#!/bin/bash

# Setup Test Registry Script
# Sets up a local Docker registry for integration testing

set -e  # Exit on any error

REGISTRY_NAME="test-registry"
REGISTRY_PORT="5000"
REGISTRY_HOST="localhost:${REGISTRY_PORT}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is available
check_docker() {
    log_info "Checking Docker availability..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running or not accessible"
        log_info "Please start Docker and ensure your user has permissions to access Docker socket"
        exit 1
    fi
    
    log_success "Docker is available"
}

# Check if registry is already running
check_existing_registry() {
    log_info "Checking for existing registry..."
    
    # Check if container exists and is running
    if docker ps --format "table {{.Names}}" | grep -q "^${REGISTRY_NAME}$"; then
        log_warning "Registry container '${REGISTRY_NAME}' is already running"
        
        # Test if it's responding
        if curl -f -s "http://${REGISTRY_HOST}/v2/" > /dev/null; then
            log_success "Existing registry is healthy at http://${REGISTRY_HOST}"
            return 0
        else
            log_warning "Existing registry is not responding, will restart"
            docker stop "${REGISTRY_NAME}" || true
            docker rm "${REGISTRY_NAME}" || true
        fi
    fi
    
    # Check if container exists but is stopped
    if docker ps -a --format "table {{.Names}}" | grep -q "^${REGISTRY_NAME}$"; then
        log_info "Found stopped registry container, removing..."
        docker rm "${REGISTRY_NAME}" || true
    fi
    
    return 1
}

# Check if port is available
check_port() {
    log_info "Checking if port ${REGISTRY_PORT} is available..."
    
    if lsof -Pi :${REGISTRY_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
        log_error "Port ${REGISTRY_PORT} is already in use by another process"
        log_info "Please stop the service using port ${REGISTRY_PORT} or change REGISTRY_PORT in this script"
        lsof -Pi :${REGISTRY_PORT} -sTCP:LISTEN
        exit 1
    fi
    
    log_success "Port ${REGISTRY_PORT} is available"
}

# Start the registry container
start_registry() {
    log_info "Starting Docker registry container..."
    
    # Create a volume for registry data (optional, for persistence during tests)
    docker volume create "${REGISTRY_NAME}-data" 2>/dev/null || true
    
    # Start registry with proper configuration for testing
    docker run -d \
        --name "${REGISTRY_NAME}" \
        --restart=unless-stopped \
        -p "${REGISTRY_PORT}:5000" \
        -v "${REGISTRY_NAME}-data:/var/lib/registry" \
        -e REGISTRY_STORAGE_DELETE_ENABLED=true \
        -e REGISTRY_HTTP_ADDR=0.0.0.0:5000 \
        -e REGISTRY_LOG_LEVEL=info \
        registry:2
    
    log_success "Registry container started"
}

# Wait for registry to be ready
wait_for_registry() {
    log_info "Waiting for registry to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "http://${REGISTRY_HOST}/v2/" > /dev/null; then
            log_success "Registry is ready at http://${REGISTRY_HOST}"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts - Registry not ready yet, waiting..."
        sleep 2
        ((attempt++))
    done
    
    log_error "Registry failed to become ready after $max_attempts attempts"
    log_info "Container logs:"
    docker logs "${REGISTRY_NAME}" --tail 20
    exit 1
}

# Configure insecure registry (for local testing)
configure_insecure_registry() {
    log_info "Checking Docker daemon configuration for insecure registry..."
    
    # This is informational - users need to configure this themselves
    local daemon_config="/etc/docker/daemon.json"
    local user_daemon_config="$HOME/.docker/daemon.json"
    
    log_info "To use this registry for testing, you may need to configure Docker to allow insecure registries:"
    log_info "Add the following to your Docker daemon.json file:"
    log_info "{"
    log_info "  \"insecure-registries\": [\"${REGISTRY_HOST}\"]"
    log_info "}"
    log_info ""
    log_info "Possible daemon.json locations:"
    log_info "- System-wide: ${daemon_config}"
    log_info "- User-specific: ${user_daemon_config}"
    log_info ""
    log_warning "Note: Docker daemon restart may be required after configuration changes"
}

# Test registry functionality
test_registry() {
    log_info "Testing registry functionality..."
    
    # Test basic API endpoints
    log_info "Testing registry API..."
    
    # Test /v2/ endpoint
    if ! curl -f -s "http://${REGISTRY_HOST}/v2/" > /dev/null; then
        log_error "Registry API test failed"
        return 1
    fi
    
    # Test catalog endpoint
    local catalog_response=$(curl -f -s "http://${REGISTRY_HOST}/v2/_catalog")
    if [[ $? -eq 0 ]]; then
        log_info "Registry catalog: $catalog_response"
    else
        log_warning "Could not access registry catalog (this is normal for a new registry)"
    fi
    
    log_success "Registry is responding correctly"
}

# Create environment file for tests
create_env_file() {
    log_info "Creating test environment configuration..."
    
    local env_file="${PROJECT_ROOT}/.env.test"
    
    cat > "$env_file" << EOF
# Test Registry Configuration
TEST_REGISTRY_HOST=${REGISTRY_HOST}
USE_LOCAL_REGISTRY=true
DOCKER_REGISTRY_INSECURE=true

# Integration Test Settings
SKIP_INTEGRATION_TESTS=false
DOCKER_AVAILABLE=true
REGISTRY_AVAILABLE=true
EOF
    
    log_success "Created test environment file: $env_file"
    log_info "You can source this file or copy settings to your main .env file"
}

# Show usage information
show_usage() {
    log_info "Registry setup complete!"
    log_info ""
    log_info "🐳 Registry URL: http://${REGISTRY_HOST}"
    log_info "🔧 Container Name: ${REGISTRY_NAME}"
    log_info "📊 Management Commands:"
    log_info "   - View logs: docker logs ${REGISTRY_NAME}"
    log_info "   - Stop registry: docker stop ${REGISTRY_NAME}"
    log_info "   - Start registry: docker start ${REGISTRY_NAME}"
    log_info "   - Remove registry: docker rm -f ${REGISTRY_NAME}"
    log_info ""
    log_info "🧪 Test Commands:"
    log_info "   - Run registry tests: npm run test:integration:registry"
    log_info "   - Test push/pull: docker tag alpine:latest ${REGISTRY_HOST}/test:latest"
    log_info "   - List images: curl http://${REGISTRY_HOST}/v2/_catalog"
    log_info ""
    log_info "🛑 To stop the registry:"
    log_info "   ${SCRIPT_DIR}/teardown-test-registry.sh"
}

# Main execution
main() {
    log_info "🚀 Setting up test registry..."
    log_info "Registry will be available at: http://${REGISTRY_HOST}"
    
    # Run all setup steps
    check_docker
    
    if check_existing_registry; then
        log_info "Registry already running and healthy, skipping setup"
    else
        check_port
        start_registry
        wait_for_registry
        test_registry
    fi
    
    configure_insecure_registry
    create_env_file
    show_usage
    
    log_success "✅ Test registry setup complete!"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo ""
        echo "Sets up a local Docker registry for integration testing"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --port PORT    Use custom port (default: 5000)"
        echo "  --name NAME    Use custom container name (default: test-registry)"
        echo ""
        echo "Environment variables:"
        echo "  REGISTRY_PORT  Registry port (default: 5000)"
        echo "  REGISTRY_NAME  Registry container name (default: test-registry)"
        exit 0
        ;;
    --port)
        REGISTRY_PORT="$2"
        REGISTRY_HOST="localhost:${REGISTRY_PORT}"
        shift 2
        ;;
    --name)
        REGISTRY_NAME="$2"
        shift 2
        ;;
esac

# Execute main function
main "$@"