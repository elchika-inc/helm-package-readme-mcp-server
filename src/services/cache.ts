import { logger } from '../utils/logger.js';
import type { CacheEntry, CacheOptions } from '../types/index.js';

export class Cache {
  private data: Map<string, CacheEntry<any>> = new Map();
  private readonly defaultTtl: number;
  private readonly maxSize: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.ttl || 3600000; // 1 hour default
    this.maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB default
    
    // Start cleanup interval every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  get<T>(key: string): T | null {
    const entry = this.data.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now > entry.timestamp + entry.ttl) {
      this.data.delete(key);
      logger.debug(`Cache entry expired: ${key}`);
      return null;
    }

    logger.debug(`Cache hit: ${key}`);
    return entry.data as T;
  }

  set<T>(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const entryTtl = ttl || this.defaultTtl;

    // Check if we need to make space
    this.enforceMaxSize();

    const entry: CacheEntry<T> = {
      data: value,
      timestamp: now,
      ttl: entryTtl,
    };

    this.data.set(key, entry);
    logger.debug(`Cache set: ${key} (TTL: ${entryTtl}ms)`);
  }

  has(key: string): boolean {
    const entry = this.data.get(key);
    
    if (!entry) {
      return false;
    }

    const now = Date.now();
    if (now > entry.timestamp + entry.ttl) {
      this.data.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    const deleted = this.data.delete(key);
    if (deleted) {
      logger.debug(`Cache delete: ${key}`);
    }
    return deleted;
  }

  clear(): void {
    const size = this.data.size;
    this.data.clear();
    logger.debug(`Cache cleared: ${size} entries removed`);
  }

  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.data.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        this.data.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(`Cache cleanup: ${removedCount} expired entries removed`);
    }
  }

  private enforceMaxSize(): void {
    // Simple size estimation based on number of entries
    // In a production system, you'd want more sophisticated size calculation
    const estimatedSize = this.data.size * 10000; // Rough estimate per entry
    
    if (estimatedSize > this.maxSize) {
      const entriesToRemove = Math.ceil(this.data.size * 0.1); // Remove 10%
      const entries = Array.from(this.data.entries());
      
      // Sort by timestamp (oldest first)
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
        const entry = entries[i];
        if (entry) {
          this.data.delete(entry[0]);
        }
      }
      
      logger.debug(`Cache size limit reached, removed ${entriesToRemove} oldest entries`);
    }
  }

  getStats(): {
    size: number;
    estimatedMemoryUsage: number;
    hitRate?: number;
  } {
    return {
      size: this.data.size,
      estimatedMemoryUsage: this.data.size * 10000, // Rough estimate
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
    logger.debug('Cache destroyed');
  }

  // Helper methods for specific cache keys
  generatePackageInfoKey(packageName: string, version?: string): string {
    return `pkg_info:${packageName}:${version || 'latest'}`;
  }

  generatePackageReadmeKey(packageName: string, version?: string): string {
    return `pkg_readme:${packageName}:${version || 'latest'}`;
  }

  generateSearchKey(query: string, limit: number): string {
    // Create a hash-like key for search queries
    const queryHash = Buffer.from(query).toString('base64').substring(0, 16);
    return `search:${queryHash}:${limit}`;
  }

  generateValuesKey(packageName: string, version?: string): string {
    return `pkg_values:${packageName}:${version || 'latest'}`;
  }

  generateChangelogKey(packageName: string, version?: string): string {
    return `pkg_changelog:${packageName}:${version || 'latest'}`;
  }
}

// Create and export a singleton instance
export const cache = new Cache({
  ttl: parseInt(process.env.CACHE_TTL || '3600000'), // 1 hour default
  maxSize: parseInt(process.env.CACHE_MAX_SIZE || '104857600'), // 100MB default
});