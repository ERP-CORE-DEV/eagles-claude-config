import type { IProvider } from "./types.js";

export class ProviderRegistry {
  private readonly _providers: Map<string, IProvider> = new Map();

  register(provider: IProvider): void {
    this._providers.set(provider.name, provider);
  }

  get(name: string): IProvider | null {
    return this._providers.get(name) ?? null;
  }

  list(): IProvider[] {
    return Array.from(this._providers.values());
  }

  remove(name: string): boolean {
    return this._providers.delete(name);
  }

  getAvailable(): IProvider[] {
    return this.list().filter((provider) => provider.isAvailable());
  }
}
