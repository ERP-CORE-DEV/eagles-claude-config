# Performance Rules

- Single entity operations < 100ms
- Batch operations < 2s for 100 items
- Use async/await for all I/O operations
- Cache frequently accessed data (IMemoryCache or Redis)
- Monitor CosmosDB RU consumption per operation
- Use pagination for list endpoints (default 20, max 100)
- Lazy load related data (no eager loading by default)
- Compress API responses (gzip/brotli)
- Use connection pooling for database connections
- Profile before optimizing (no premature optimization)
