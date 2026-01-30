/**
 * Core modules for Trellis workflow
 *
 * Re-exports from all core submodules for convenient access.
 */

// Path utilities
export * from "./paths.js";

// Developer management
export * from "./developer/index.js";

// Git operations
export * from "./git/index.js";

// Task management
export * from "./task/index.js";

// Session management
export * from "./session/index.js";

// Platform adapters
export * from "./platforms/index.js";

// Pipeline orchestration
export * from "./pipeline/index.js";
