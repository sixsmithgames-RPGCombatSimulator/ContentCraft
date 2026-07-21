# GMC canon library bundles

GMC libraries can be moved between local and hosted tenants with a versioned
JSON bundle. Open **Library Collections**, select a collection, and choose
**Export Library**. From the collection list, choose **Import Library** and
select the exported `.gmc-library.json` file.

## Format

The current schema identifier is `gmc-canon-library-bundle/v1`. A bundle
contains:

- collection metadata and membership;
- every member entity;
- related library entities required by member relationships;
- retrieval chunks without embeddings.

Exports omit tenant IDs, project links, audit trails, and vector embeddings.
Imports regenerate deterministic library, collection, and chunk IDs, assign
the authenticated tenant, and rebuild relationship IDs. Embeddings are
provider-specific and can be regenerated separately.

## API

```text
GET  /api/canon/collections/{collectionId}/export
POST /api/canon/collections/import
```

The import endpoint accepts the bundle as an `application/json` request body.
It validates the complete bundle before writing, refuses cross-tenant ID
collisions, rejects unresolved relationships, and safely upserts records owned
by the authenticated tenant. A repeated import updates the same entities and
replaces their retrieval chunks instead of creating duplicates.

Limits are 10 MB per HTTP request, 2,000 entities, 20,000 chunks, 1,000 claims
per entity, and 2,000 collection members.
