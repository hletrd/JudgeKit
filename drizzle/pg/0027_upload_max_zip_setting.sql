-- Expose uploadMaxZipDecompressedSizeBytes (the decompressed-ZIP ceiling used as
-- zip-bomb protection in the file-upload path) as an admin-configurable setting.
-- Idempotent (production builds the schema via `drizzle-kit push`; from-scratch
-- migrate() must also replay cleanly): the column may already exist.
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "upload_max_zip_decompressed_size_bytes" integer;
