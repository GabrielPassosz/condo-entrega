import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function applyMigration(db, filename) {
  const sql = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

test("migra um banco existente preservando dados e ativando os controles SaaS", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  await applyMigration(db, "0000_fancy_sumo.sql");
  db.exec(`
    INSERT INTO condominiums (name) VALUES ('Residencial Teste');
    INSERT INTO profiles (condominium_id, email, display_name, role)
      VALUES (1, 'admin@example.com', 'Admin', 'admin');
    INSERT INTO residents (
      condominium_id, unit, name, phone, normalized_name, normalized_unit
    ) VALUES (1, '101', 'Ana', '5541999999999', 'ana', '101');
    INSERT INTO packages (
      condominium_id, resident_id, photo_key, photo_mime, pickup_code,
      registered_by, received_at
    ) VALUES (
      1, 1, 'legacy-photo', 'image/jpeg', '123456', 'Admin',
      '2026-01-01T00:00:00.000Z'
    );
  `);

  await applyMigration(db, "0001_condemned_maelstrom.sql");
  await applyMigration(db, "0002_watery_stark_industries.sql");

  const legacyPackage = db.prepare(`
    SELECT photo_expires_at, idempotency_key, pickup_code_encrypted
    FROM packages WHERE id = 1
  `).get();
  assert.equal(legacyPackage.photo_expires_at, null);
  assert.equal(legacyPackage.idempotency_key, "");
  assert.equal(legacyPackage.pickup_code_encrypted, "");
  assert.equal(db.prepare("SELECT slug FROM condominiums WHERE id = 1").get().slug, "");

  db.exec(`
    INSERT INTO condominiums (name, slug, updated_at)
      VALUES ('Outro', 'outro', CURRENT_TIMESTAMP);
    INSERT INTO profiles (condominium_id, email, display_name, role)
      VALUES (2, 'admin@example.com', 'Mesmo usuário', 'admin');
    INSERT INTO notification_jobs (condominium_id, package_id)
      VALUES (1, 1);
    INSERT INTO audit_logs (
      condominium_id, actor_profile_id, actor_email, action, entity_type,
      entity_id
    ) VALUES (1, 1, 'admin@example.com', 'test', 'package', '1');
  `);

  assert.equal(
    db.prepare("SELECT count(*) AS value FROM profiles WHERE email = ?")
      .get("admin@example.com").value,
    2,
  );
  assert.equal(
    db.prepare("SELECT count(*) AS value FROM notification_jobs").get().value,
    1,
  );
  assert.equal(
    db.prepare("SELECT count(*) AS value FROM audit_logs").get().value,
    1,
  );
  assert.ok(
    db
      .prepare("PRAGMA index_list('packages')")
      .all()
      .some((index) => index.name === "packages_whatsapp_message_idx"),
  );
  db.close();
});
