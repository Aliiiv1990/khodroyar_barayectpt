/// PocketBase migration: initial Khodroyar collections and access rules.
/// Apply with the PocketBase CLI after reviewing the target instance and backup state.

migrate((app) => {
  const users = new Collection({
    name: "users",
    type: "auth",
    listRule: '@request.auth.role = "admin"',
    viewRule: '@request.auth.id = id || @request.auth.role = "admin"',
    authRule: "enabled = true",
    createRule: '@request.auth.role = "admin"',
    updateRule: '(@request.auth.id = id && @request.body.role = role && @request.body.enabled = enabled) || @request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { name: "role", type: "select", required: true, maxSelect: 1, values: ["admin", "colleague"] },
      { name: "display_name", type: "text", required: true, max: 120 },
      { name: "enabled", type: "bool" },
    ],
    passwordAuth: { enabled: true, identityFields: ["email"] },
  });
  app.save(users);

  const listings = new Collection({
    name: "listings",
    type: "base",
    listRule: "is_active = true || @request.auth.role = \"admin\"",
    viewRule: "is_active = true || @request.auth.role = \"admin\"",
    createRule: '@request.auth.id != "" && @request.body.created_by = @request.auth.id',
    updateRule: '@request.auth.id != "" && @request.body.revision > revision',
    deleteRule: '@request.auth.role = "admin" || created_by = @request.auth.id',
    fields: [
      { name: "legacy_id", type: "text", max: 160 },
      { name: "type", type: "select", required: true, maxSelect: 1, values: ["sale", "buy_request"] },
      { name: "title", type: "text", required: true, max: 240 },
      { name: "brand", type: "text", max: 120 },
      { name: "model", type: "text", max: 160 },
      { name: "year", type: "number" },
      { name: "has_explicit_year", type: "bool" },
      { name: "price", type: "number" },
      { name: "price_formatted", type: "text", max: 80 },
      { name: "mileage", type: "number" },
      { name: "mileage_formatted", type: "text", max: 80 },
      { name: "color", type: "text", max: 80 },
      { name: "gearbox", type: "text", max: 80 },
      { name: "body_condition", type: "text", max: 120 },
      { name: "fuel_type", type: "text", max: 80 },
      { name: "city", type: "text", max: 120 },
      { name: "description", type: "text", max: 5000 },
      { name: "file_description", type: "text", max: 1000 },
      { name: "source", type: "select", maxSelect: 1, values: ["admin", "user"] },
      { name: "creator_name", type: "text", max: 120 },
      { name: "import_batch", type: "text", max: 200 },
      { name: "import_date", type: "text", max: 40 },
      { name: "is_text_only", type: "bool" },
      { name: "is_edited", type: "bool" },
      { name: "is_active", type: "bool" },
      { name: "revision", type: "number" },
      { name: "created_by", type: "text", max: 64 },
      { name: "photos", type: "file", maxSelect: 20, maxSize: 12582912, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"], thumbs: ["640x480"] },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_listings_legacy_id ON listings (legacy_id) WHERE legacy_id != ''",
      "CREATE INDEX idx_listings_type_active_created ON listings (type, is_active, created)",
      "CREATE INDEX idx_listings_brand_model ON listings (brand, model)",
      "CREATE INDEX idx_listings_city ON listings (city)",
      "CREATE INDEX idx_listings_import_batch ON listings (import_batch)",
    ],
  });
  app.save(listings);

  const contacts = new Collection({
    name: "listing_contacts",
    type: "base",
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.role = "admin" || owner_id = @request.auth.id',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
    fields: [
      { name: "listing_id", type: "text", required: true, max: 160 },
      { name: "phone_number", type: "text", max: 40 },
      { name: "owner_id", type: "text", required: true, max: 64 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_listing_contacts_listing_id ON listing_contacts (listing_id)"],
  });
  app.save(contacts);

  const batches = new Collection({
    name: "import_batches",
    type: "base",
    listRule: '@request.auth.role = "admin"',
    viewRule: '@request.auth.role = "admin"',
    createRule: '@request.auth.role = "admin"',
    updateRule: '@request.auth.role = "admin"',
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      { name: "batch_name", type: "text", required: true, max: 200 },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["pending", "processing", "completed", "failed", "rolled_back"] },
      { name: "record_count", type: "number" },
      { name: "processed_count", type: "number" },
      { name: "error_summary", type: "text", max: 5000 },
      { name: "source_file", type: "text", max: 255 },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_import_batches_name ON import_batches (batch_name)",
      "CREATE INDEX idx_import_batches_status_created ON import_batches (status, created)"],
  });
  app.save(batches);

  const audit = new Collection({
    name: "audit_logs",
    type: "base",
    listRule: '@request.auth.role = "admin"',
    viewRule: '@request.auth.role = "admin"',
    createRule: 'actor_id = @request.auth.id',
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "actor_id", type: "text", max: 64 },
      { name: "action", type: "text", required: true, max: 80 },
      { name: "collection_name", type: "text", max: 80 },
      { name: "record_id", type: "text", max: 64 },
      { name: "summary", type: "text", max: 1000 },
    ],
    indexes: ["CREATE INDEX idx_audit_logs_created ON audit_logs (created)"],
  });
  return app.save(audit);
}, (app) => {
  for (const name of ["audit_logs", "import_batches", "listing_contacts", "listings", "users"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  }
});
