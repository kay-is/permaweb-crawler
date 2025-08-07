export interface StoragePort<Entity> {
  load(key: string): Promise<Entity>
}
