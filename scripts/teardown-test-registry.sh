#!/bin/bash

# Teardown Test Registry Script
# Stops and removes the local Docker registry used for integration testing

set -e  # Exit on any error

REGISTRY_NAME="test-registry"
REGISTRY_PORT="5000"
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
    if ! command -v docker &> /dev/null; then
        log_warning "Docker is not installed or not in PATH, skipping container cleanup"
        return 1
    fi
    
    if ! docker info &> /dev/null; then
        log_warning "Docker daemon is not running or not accessible, skipping container cleanup"
        return 1
    fi
    
    return 0
}

# Stop and remove registry container
stop_registry() {
    log_info "Stopping and removing registry container..."
    
    # Check if container exists
    if docker ps -a --format "table {{.Names}}" | grep -q "^${REGISTRY_NAME}$"; then
        log_info "Found registry container '${REGISTRY_NAME}'"
        
        # Stop if running
        if docker ps --format "table {{.Names}}" | grep -q "^${REGISTRY_NAME}$"; then
            log_info "Stopping running registry container..."
            docker stop "${REGISTRY_NAME}"
        fi
        
        # Remove container
        log_info "Removing registry container..."
        docker rm "${REGISTRY_NAME}"
        
        log_success "Registry container removed"
    else
        log_info "Registry container '${REGISTRY_NAME}' not found"
    fi
}

# Clean up registry volume (optional)
cleanup_volume() {
    local cleanup_volume="${1:-false}"
    
    if [[ "$cleanup_volume" == "true" ]]; then
        log_info "Cleaning up registry volume..."
        
        local volume_name="${REGISTRY_NAME}-data"
        if docker volume ls --format "table {{.Name}}" | grep -q "^${volume_name}$"; then
            log_info "Removing volume '${volume_name}'..."
            docker volume rm "${volume_name}"
            log_success "Registry volume removed"
        else
            log_info "Registry volume '${volume_name}' not found"
        fi
    else
        log_info "Keeping registry volume for future use (use --clean-volume to remove)"
    fi
}

# Clean up test images from registry
cleanup_test_images() {
    log_info "Looking for test images to clean up..."
    
    # Remove any local images that were pushed to test registry
    local test_images=$(docker images --format "table {{.Repository}}:{{.Tag}}" | grep "localhost:${REGISTRY_PORT}" || true)
    
    if [[ -n "$test_images" ]]; then
        log_info "Found test images to clean up:"
        echo "$test_images"
        
        echo "$test_images" | while read -r image; do
            if [[ -n "$image" && "$image" != "REPOSITORY:TAG" ]]; then
                log_info "Removing image: $image"
                docker rmi "$image" 2>/dev/null || log_warning "Could not remove image $image"
            fi
        done
        
        log_success "Test image cleanup complete"
    else
        log_info "No test images found to clean up"
    fi
}

# Check if port is still in use
check_port_freed() {
    log_info "Checking if port ${REGISTRY_PORT} is freed..."
    
    if lsof -Pi :${REGISTRY_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
        log_warning "Port ${REGISTRY_PORT} is still in use:"
        lsof -Pi :${REGISTRY_PORT} -sTCP:LISTEN
    else
        log_success "Port ${REGISTRY_PORT} is now available"
    fi
}

# Remove test environment file
cleanup_env_file() {
    local env_file="${PROJECT_ROOT}/.env.test"
    
    if [[ -f "$env_file" ]]; then
        log_info "Removing test environment file..."
        rm "$env_file"
        log_success "Test environment file removed"
    fi
}

# Show cleanup summary
show_summary() {
    log_info "🧹 Registry teardown complete!"
    log_info ""
    log_info "What was cleaned up:"
    log_info "  ✅ Registry container stopped and removed"
    log_info "  ✅ Test images cleaned up"
    log_info "  ✅ Port ${REGISTRY_PORT} freed"
    
    if [[ "${CLEAN_VOLUME:-false}" == "true" ]]; then
        log_info "  ✅ Registry volume removed"
    else
        log_info "  📦 Registry volume preserved (use --clean-volume to remove)"
    fi
    
    log_info ""
    log_info "To set up the registry again:"
    log_info "  ${SCRIPT_DIR}/setup-test-registry.sh"
}

# Show usage information
show_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Stops and removes the local Docker registry used for integration testing"
    echo ""
    echo "Options:"
    echo "  --help, -h          Show this help message"
    echo "  --clean-volume      Remove registry data volume (default: keep)"
    echo "  --clean-images      Remove test images (default: true)"
    echo "  --name NAME         Use custom container name (default: test-registry)"
    echo "  --port PORT         Use custom port (default: 5000)"
    echo ""
    echo "Environment variables:"
    echo "  REGISTRY_PORT       Registry port (default: 5000)"
    echo "  REGISTRY_NAME       Registry container name (default: test-registry)"
    echo "  CLEAN_VOLUME        Remove volume if 'true' (default: false)"
    echo ""
    echo "Examples:"
    echo "  $0                  # Basic teardown, keep volume"
    echo "  $0 --clean-volume   # Remove everything including volume"
}

# Main execution
main() {
    log_info "🛑 Tearing down test registry..."
    
    if ! check_docker; then
        log_warning "Docker not available, limited cleanup possible"
        cleanup_env_file
        return 0
    fi
    
    # Run cleanup steps
    stop_registry
    cleanup_volume "${CLEAN_VOLUME:-false}"
    cleanup_test_images
    check_port_freed
    cleanup_env_file
    show_summary
    
    log_success "Registry teardown complete!"
}

# Parse command line arguments
CLEAN_VOLUME="false"
CLEAN_IMAGES="true"

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_usage
            exit 0
            ;;
        --clean-volume)
            CLEAN_VOLUME="true"
            shift
            ;;
        --no-clean-images)
            CLEAN_IMAGES="false"
            shift
            ;;
        --name)
            REGISTRY_NAME="$2"
            shift 2
            ;;
        --port)
            REGISTRY_PORT="$2"
            shift 2
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Execute main function
main "$@"
