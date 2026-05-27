#!/usr/bin/env bash

# delete-firebase-services.sh
# A highly robust utility script to programmatically delete all deployed Firebase Cloud Functions 
# for a specified project.

# Safety first: Exit on unexpected errors, but handle expected steps gracefully
set -eo pipefail

# Get script directory to resolve paths relatively
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define beautiful ANSI colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Helper logging functions for premium feedback
log_info() {
    echo -e "${CYAN}${BOLD}[ℹ]${NC} ${CYAN}$1${NC}"
}

log_success() {
    echo -e "${GREEN}${BOLD}[✔]${NC} ${GREEN}$1${NC}"
}

log_warning() {
    echo -e "${YELLOW}${BOLD}[⚠]${NC} ${YELLOW}${BOLD}$1${NC}"
}

log_error() {
    echo -e "${RED}${BOLD}[✖]${NC} ${RED}${BOLD}$1${NC}"
}

# Display help menu
show_help() {
    echo -e "${BOLD}Usage:${NC} $0 [options]"
    echo ""
    echo -e "${BOLD}Options:${NC}"
    echo -e "  -p, --project <project_id>   Specify the target Firebase project ID"
    echo -e "  -f, --force                  Bypass confirmation prompts (useful for automation/CI)"
    echo -e "  --all                        Select all cleanup targets (local, artifacts, firestore, functions, gallery)"
    echo -e "  -l, --local                  Clean up local build/deploy caches (.firebase/, lib/ folders)"
    echo -e "  -g, --gallery                Delete gallery folders (gallery-functions/, gallery-app/) in aiquebonito"
    echo -e "  -a, --artifacts              Delete the gcf-artifacts repository from Artifact Registry"
    echo -e "  -s, --firestore              Delete all Firestore collections and documents"
    echo -e "  -cf, --functions             Delete all deployed Cloud Functions and Cloud Run services"
    echo -e "  -h, --help                   Show this help message and exit"
    echo ""
    echo -e "${BOLD}Description:${NC}"
    echo "  This script cleans up specified Firebase services for the target project."
}

# Parse command line arguments
PROJECT_ID="aimadre"
FORCE=false
CLEAN_LOCAL=false
CLEAN_ARTIFACTS=false
CLEAN_FIRESTORE=false
CLEAN_FUNCTIONS=false
CLEAN_GALLERY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--project)
            PROJECT_ID="$2"
            shift 2
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        --all)
            CLEAN_LOCAL=true
            CLEAN_ARTIFACTS=true
            CLEAN_FIRESTORE=true
            CLEAN_FUNCTIONS=true
            CLEAN_GALLERY=true
            shift
            ;;
        -l|--local)
            CLEAN_LOCAL=true
            shift
            ;;
        -g|--gallery)
            CLEAN_GALLERY=true
            shift
            ;;
        -a|--artifacts)
            CLEAN_ARTIFACTS=true
            shift
            ;;
        -s|--firestore)
            CLEAN_FIRESTORE=true
            shift
            ;;
        -cf|--functions)
            CLEAN_FUNCTIONS=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            # If positional argument is provided, treat it as the project ID
            if [ -z "$PROJECT_ID" ]; then
                PROJECT_ID="$1"
                shift
            else
                log_error "Unknown argument: $1"
                show_help
                exit 1
            fi
            ;;
    esac
done

echo -e "${BLUE}${BOLD}====================================================${NC}"
echo -e "${BLUE}${BOLD}      Firebase Functions Cleanup & Teardown Tool    ${NC}"
echo -e "${BLUE}${BOLD}====================================================${NC}"

# 1. Prerequisite Checks
log_info "Verifying environment prerequisites..."

# Check Node.js (needed for bulletproof JSON parsing of firebase CLI output)
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Node.js is required to parse JSON output resiliently."
    exit 1
fi

# Check Firebase CLI
if ! command -v firebase &> /dev/null; then
    log_error "Firebase CLI ('firebase') could not be found."
    echo -e "Please install it using: ${BOLD}npm install -g firebase-tools${NC}"
    exit 1
fi

log_success "Prerequisites verified successfully."

# 2. Project ID Resolution
if [ -z "$PROJECT_ID" ]; then
    log_info "No project ID specified via arguments. Detecting from local configuration..."
    
    # Attempt to read default project from .firebaserc using Node.js
    DETECTED_PROJECT=$(node -e '
        try {
            const fs = require("fs");
            if (fs.existsSync(".firebaserc")) {
                const rc = JSON.parse(fs.readFileSync(".firebaserc", "utf8"));
                const project = rc.projects && rc.projects.default;
                if (project) {
                    console.log(project);
                    process.exit(0);
                }
            }
        } catch (e) {}
        process.exit(1);
    ' 2>/dev/null || true)

    if [ -n "$DETECTED_PROJECT" ]; then
        PROJECT_ID="$DETECTED_PROJECT"
        log_info "Detected active project from .firebaserc: ${BOLD}$PROJECT_ID${NC}"
    else
        log_warning "Could not detect active project from local config files."
        echo -en "${BOLD}Please enter your Firebase Project ID:${NC} "
        read -r PROJECT_ID
        if [ -z "$PROJECT_ID" ]; then
            log_error "Project ID cannot be empty."
            exit 1
        fi
    fi
fi

# Double check that we have a project ID
if [ -z "$PROJECT_ID" ]; then
    log_error "No project ID target established. Exiting."
    exit 1
fi

# 2.5. Target Validation
if [ "$CLEAN_FUNCTIONS" = false ] && [ "$CLEAN_LOCAL" = false ] && [ "$CLEAN_ARTIFACTS" = false ] && [ "$CLEAN_FIRESTORE" = false ] && [ "$CLEAN_GALLERY" = false ]; then
    log_warning "No cleanup targets specified. Nothing to do."
    echo -e "Use ${BOLD}--all${NC} to select all targets, or individual flags: ${BOLD}-cf${NC}, ${BOLD}-s${NC}, ${BOLD}-l${NC}, ${BOLD}-a${NC}, or ${BOLD}-g${NC}."
    echo -e "Run ${BOLD}$0 --help${NC} for all options."
    exit 0
fi

# 3. Interactive Confirmation (unless force flag is provided)
if [ "$FORCE" = false ]; then
    echo ""
    log_warning "CRITICAL TEARDOWN WARNING"
    echo -e "${RED}This script is about to perform the following destructive actions on project:${NC} ${BOLD}$PROJECT_ID${NC}"
    if [ "$CLEAN_FUNCTIONS" = true ]; then
        echo -e "  - Programmatically identify and ${BOLD}DELETE ALL${NC} deployed Cloud Functions."
    fi
    if [ "$CLEAN_LOCAL" = true ]; then
        echo -e "  - Delete local build and deploy caches (${BOLD}.firebase/${NC}, ${BOLD}lib/${NC} folders)."
    fi
    if [ "$CLEAN_ARTIFACTS" = true ]; then
        echo -e "  - Delete the ${BOLD}gcf-artifacts${NC} repository from Artifact Registry in region us-central1."
    fi
    if [ "$CLEAN_FIRESTORE" = true ]; then
        echo -e "  - Delete ${BOLD}ALL collections and documents${NC} in the Firestore database."
    fi
    if [ "$CLEAN_GALLERY" = true ]; then
        echo -e "  - Delete ${BOLD}gallery-functions/${NC} and ${BOLD}gallery-app/${NC} directories in aiquebonito project."
    fi
    echo ""
    echo -e "These changes are permanent and cannot be undone."
    echo ""
    echo -en "${YELLOW}${BOLD}Are you absolutely sure you want to proceed? (yes/no):${NC} "
    read -r CONFIRMATION
    if [ "$CONFIRMATION" != "yes" ]; then
        log_info "Teardown cancelled by user."
        exit 0
    fi
fi

# 3.5. Local Cleanup
if [ "$CLEAN_LOCAL" = true ]; then
    echo ""
    echo -e "${BLUE}${BOLD}--- Cleaning Local Caches & Build Output ---${NC}"
    log_info "Deleting .firebase/ directory..."
    rm -rf .firebase
    
    log_info "Deleting compiled 'lib/' directories..."
    rm -rf prompter-functions/lib gallery-functions/lib
    
    log_success "Local caches and compiled outputs cleaned successfully."
fi

# 3.6. Artifact Registry Cleanup
if [ "$CLEAN_ARTIFACTS" = true ]; then
    echo ""
    echo -e "${BLUE}${BOLD}--- Purging Artifact Registry ---${NC}"
    log_info "Deleting 'gcf-artifacts' repository in region us-central1..."
    if gcloud artifacts repositories delete gcf-artifacts --location=us-central1 --project="$PROJECT_ID" --quiet; then
        log_success "Artifact Registry repository 'gcf-artifacts' deleted successfully."
    else
        log_warning "Artifact Registry repository 'gcf-artifacts' was not found or could not be deleted."
    fi
fi

# 3.7. Firestore Cleanup
if [ "$CLEAN_FIRESTORE" = true ]; then
    echo ""
    echo -e "${BLUE}${BOLD}--- Deleting Firestore Data ---${NC}"
    log_info "Deleting all collections and documents in Firestore database..."
    if firebase firestore:delete --all-collections --project "$PROJECT_ID" --force; then
        log_success "Firestore data deleted successfully."
    else
        log_error "Failed to delete Firestore data."
    fi
fi

# 3.8. Gallery Cleanup
if [ "$CLEAN_GALLERY" = true ]; then
    echo ""
    echo -e "${BLUE}${BOLD}--- Deleting Gallery Directories in aiquebonito ---${NC}"
    AIQUEBONITO_DIR="$SCRIPT_DIR/../aiquebonito"
    if [ -d "$AIQUEBONITO_DIR" ]; then
        log_info "Deleting gallery folders from $AIQUEBONITO_DIR..."
        if [ -d "$AIQUEBONITO_DIR/gallery-functions" ] || [ -d "$AIQUEBONITO_DIR/gallery-app" ]; then
            if [ -d "$AIQUEBONITO_DIR/gallery-functions" ]; then
                rm -rf "$AIQUEBONITO_DIR/gallery-functions"
                log_success "Deleted: gallery-functions"
            fi
            if [ -d "$AIQUEBONITO_DIR/gallery-app" ]; then
                rm -rf "$AIQUEBONITO_DIR/gallery-app"
                log_success "Deleted: gallery-app"
            fi
        else
            log_info "No gallery folders found in $AIQUEBONITO_DIR."
        fi
    else
        log_warning "aiquebonito project directory not found at $AIQUEBONITO_DIR."
    fi
fi

# 4. Deleting Cloud Functions
if [ "$CLEAN_FUNCTIONS" = true ]; then
    echo ""
    echo -e "${BLUE}${BOLD}--- Deleting Deployed Cloud Functions ---${NC}"
    log_info "Fetching deployed functions list from Firebase... (this may take a few seconds)"
    
    # Fetch list of functions in JSON format
    RAW_FUNCTIONS_JSON=$(firebase functions:list --json --project "$PROJECT_ID" 2>/dev/null || echo "[]")
    
    # Parse JSON to extract function names using robust inline Node script
    FUNCTION_IDS=$(echo "$RAW_FUNCTIONS_JSON" | node -e '
        const fs = require("fs");
        try {
            const raw = fs.readFileSync(0, "utf8");
            const jsonStart = raw.indexOf("[");
            const jsonStartObj = raw.indexOf("{");
            let startIndex = -1;
            if (jsonStart !== -1 && jsonStartObj !== -1) {
                startIndex = Math.min(jsonStart, jsonStartObj);
            } else {
                startIndex = jsonStart !== -1 ? jsonStart : jsonStartObj;
            }
            
            if (startIndex === -1) {
                console.log("");
                process.exit(0);
            }
            
            const parsed = JSON.parse(raw.substring(startIndex));
            let list = [];
            if (Array.isArray(parsed)) {
                list = parsed;
            } else if (parsed && Array.isArray(parsed.result)) {
                list = parsed.result;
            } else if (parsed && Array.isArray(parsed.functions)) {
                list = parsed.functions;
            } else if (parsed && typeof parsed === "object") {
                list = [parsed];
            }
            
            const ids = list
                .map(f => {
                    if (f.id) return f.id;
                    if (f.fullName) {
                        const parts = f.fullName.split("/");
                        return parts[parts.length - 1];
                    }
                    if (f.name) {
                        const parts = f.name.split("/");
                        return parts[parts.length - 1];
                    }
                    return null;
                })
                .filter(Boolean);
            
            // Remove duplicates and exclude those starting with "pb" or "PB" (case-insensitive)
            const uniqueIds = [...new Set(ids)].filter(id => !/^pb/i.test(id));
            console.log(uniqueIds.join(" "));
        } catch (e) {
            console.log("");
        }
    ')
    
    if [ -z "$FUNCTION_IDS" ]; then
        log_success "No deployed Cloud Functions found on project: ${BOLD}$PROJECT_ID${NC}"
    else
        # Count functions found
        count=$(echo "$FUNCTION_IDS" | wc -w | tr -d ' ')
        log_warning "Found $count deployed function(s) scheduled for deletion:"
        for id in $FUNCTION_IDS; do
            echo -e "  - ${RED}$id${NC}"
        done
        
        echo ""
        log_info "Initiating batch deletion..."
        # We execute functions:delete with --force since we already did our confirmation step
        # This deletes the specified functions in all regions
        if firebase functions:delete $FUNCTION_IDS --project "$PROJECT_ID" --force; then
            log_success "All functions deleted successfully."
        else
            log_error "Failed to delete one or more functions. Please check the error output above."
        fi
    fi
    
    # 4.5. Robust Direct gcloud Deletion Sweep
    echo ""
    echo -e "${BLUE}${BOLD}--- Performing Direct gcloud Deletion Sweep ---${NC}"
    log_info "Checking for any remaining/dangling functions directly via gcloud (excluding those starting with 'pb'/'PB')..."
    GCLOUD_FUNCTIONS=""
    for f_name in $(gcloud functions list --project="$PROJECT_ID" --regions=us-central1 --format="value(name)" 2>/dev/null || echo ""); do
        func_base=$(basename "$f_name")
        if [[ ! "$func_base" =~ ^[Pp][Bb] ]]; then
            GCLOUD_FUNCTIONS="${GCLOUD_FUNCTIONS:+$GCLOUD_FUNCTIONS }$f_name"
        fi
    done
    
    if [ -n "$GCLOUD_FUNCTIONS" ]; then
        # Count dangling functions
        dangling_count=$(echo "$GCLOUD_FUNCTIONS" | wc -w | tr -d ' ')
        log_warning "Found $dangling_count remaining/dangling Cloud Function(s) via gcloud:"
        for f_name in $GCLOUD_FUNCTIONS; do
            func_base=$(basename "$f_name")
            echo -e "  - ${RED}$func_base${NC}"
        done
        
        echo ""
        log_info "Initiating direct gcloud deletions..."
        for f_name in $GCLOUD_FUNCTIONS; do
            func_base=$(basename "$f_name")
            log_info "Deleting function '$func_base' in us-central1..."
            if gcloud functions delete "$func_base" --region=us-central1 --project="$PROJECT_ID" --quiet; then
                log_success "Function '$func_base' deleted successfully."
            else
                log_error "Failed to delete function '$func_base'."
            fi
        done
    else
        log_success "No remaining dangling functions found via gcloud."
    fi
    
    # 4.6. Cloud Run Service Cleanup Sweep
    echo ""
    log_info "Checking for any remaining Cloud Run services directly (excluding those starting with 'pb'/'PB')..."
    GCLOUD_RUN_SERVICES=""
    for svc in $(gcloud run services list --project="$PROJECT_ID" --region=us-central1 --format="value(SERVICE)" 2>/dev/null || echo ""); do
        if [[ ! "$svc" =~ ^[Pp][Bb] ]]; then
            GCLOUD_RUN_SERVICES="${GCLOUD_RUN_SERVICES:+$GCLOUD_RUN_SERVICES }$svc"
        fi
    done
    
    if [ -n "$GCLOUD_RUN_SERVICES" ]; then
        for svc in $GCLOUD_RUN_SERVICES; do
            log_warning "Found leftover Cloud Run service: $svc"
            log_info "Deleting Cloud Run service '$svc'..."
            if gcloud run services delete "$svc" --region=us-central1 --project="$PROJECT_ID" --quiet; then
                log_success "Cloud Run service '$svc' deleted successfully."
            else
                log_error "Failed to delete Cloud Run service '$svc'."
            fi
        done
        log_success "Cloud Run service cleanup sweep completed."
    fi
fi


# 5. Complete Summary
echo ""
echo -e "${GREEN}${BOLD}====================================================${NC}"
echo -e "${GREEN}${BOLD}             Cleanup Actions Completed              ${NC}"
echo -e "${GREEN}${BOLD}====================================================${NC}"
echo -e "Target Project: ${BOLD}$PROJECT_ID${NC}"
if [ "$CLEAN_FUNCTIONS" = true ]; then
    echo -e "  - Cloud Functions:   ${GREEN}Removed${NC}"
fi
if [ "$CLEAN_FIRESTORE" = true ]; then
    echo -e "  - Firestore Data:    ${GREEN}Deleted${NC}"
fi
if [ "$CLEAN_LOCAL" = true ]; then
    echo -e "  - Local Caches:      ${GREEN}Cleaned${NC}"
fi
if [ "$CLEAN_ARTIFACTS" = true ]; then
    echo -e "  - Artifact Registry: ${GREEN}Purged${NC}"
fi
if [ "$CLEAN_GALLERY" = true ]; then
    echo -e "  - Gallery Folders:   ${GREEN}Deleted${NC}"
fi
echo -e "${GREEN}${BOLD}====================================================${NC}"
echo "Cleanup completed successfully!"
