import { getRemoteConfig } from 'firebase-admin/remote-config';
import { firebaseAdmin } from './firebaseAdmin';

interface CacheEntry {
  value: boolean;
  expiry: number;
}

class RemoteConfigService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute

  /**
   * Check if display name conflict checking is enabled
   * Default is false (disabled) - can be enabled via Remote Config
   */
  async isDisplayNameCheckEnabled(): Promise<boolean> {
    return this.getBoolean('display_name_conflict_check_enabled', false);
  }

  private async getBoolean(key: string, defaultValue: boolean): Promise<boolean> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiry) {
      return cached.value;
    }

    // If Firebase is not initialized, return default
    if (!firebaseAdmin) {
      return defaultValue;
    }

    try {
      const remoteConfig = getRemoteConfig();
      const template = await remoteConfig.getServerTemplate();
      const config = template.evaluate();
      const value = config.getBoolean(key);

      this.cache.set(key, { value, expiry: Date.now() + this.CACHE_TTL });
      return value;
    } catch (error) {
      console.error('Remote Config fetch failed:', error);
      return defaultValue;
    }
  }
}

export const remoteConfigService = new RemoteConfigService();
