/**
 * Generate embeddings for all existing skills and files.
 *
 * Usage: npx tsx scripts/generate-all-embeddings.ts
 *
 * Requires OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { EMBEDDING_MODEL, generateEmbeddings } from "@/lib/embeddings";
import { buildSkillSearchText, type SkillRow } from "@/lib/skills/service";
import { buildFileSearchText, shouldEmbedFile } from "@/lib/files/service";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY environment variable is required");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BATCH_SIZE = 50;

async function embedSkills() {
  console.log("\n=== Skills ===");

  const { data: skills, error } = await supabase.from("skills").select("*");
  if (error) {
    console.error("Failed to fetch skills:", error.message);
    return;
  }

  if (!skills || skills.length === 0) {
    console.log("No skills found.");
    return;
  }

  console.log(`Found ${skills.length} skills`);
  let upserted = 0;

  for (let i = 0; i < skills.length; i += BATCH_SIZE) {
    const batch = skills.slice(i, i + BATCH_SIZE) as SkillRow[];
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(skills.length / BATCH_SIZE);

    console.log(`  Batch ${batchNum}/${totalBatches} (${batch.length} skills)...`);

    const texts = batch.map((s) => buildSkillSearchText(s));
    const embeddings = await generateEmbeddings(texts);
    if (embeddings.length !== texts.length) {
      console.error(`  Embedding count mismatch, skipping batch`);
      continue;
    }

    const rows = batch.map((skill, j) => ({
      skill_id: skill.id,
      name: skill.name,
      description: skill.description,
      search_text: texts[j],
      embedding: `[${embeddings[j].join(",")}]`,
      model: EMBEDDING_MODEL,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("skill_embeddings")
      .upsert(rows, { onConflict: "skill_id" });

    if (upsertError) {
      console.error(`  Batch error:`, upsertError.message);
    } else {
      upserted += rows.length;
    }
  }

  console.log(`  Done! Upserted ${upserted} skill embeddings.`);
}

async function embedFiles() {
  console.log("\n=== Files ===");

  const { data: files, error } = await supabase
    .from("files")
    .select("id, path, name, is_folder, mime_type, content, metadata")
    .eq("is_folder", false);

  if (error) {
    console.error("Failed to fetch files:", error.message);
    return;
  }

  if (!files || files.length === 0) {
    console.log("No files found.");
    return;
  }

  // Filter to embeddable files
  const embeddable = files.filter(shouldEmbedFile);
  console.log(`Found ${files.length} files, ${embeddable.length} embeddable`);

  let upserted = 0;

  for (let i = 0; i < embeddable.length; i += BATCH_SIZE) {
    const batch = embeddable.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(embeddable.length / BATCH_SIZE);

    console.log(`  Batch ${batchNum}/${totalBatches} (${batch.length} files)...`);

    const texts = batch.map((f) => buildFileSearchText(f));
    const embeddings = await generateEmbeddings(texts);
    if (embeddings.length !== texts.length) {
      console.error(`  Embedding count mismatch, skipping batch`);
      continue;
    }

    const rows = batch.map((file, j) => ({
      file_id: file.id,
      path: file.path,
      name: file.name,
      search_text: texts[j],
      embedding: `[${embeddings[j].join(",")}]`,
      model: EMBEDDING_MODEL,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("file_embeddings")
      .upsert(rows, { onConflict: "file_id" });

    if (upsertError) {
      console.error(`  Batch error:`, upsertError.message);
    } else {
      upserted += rows.length;
    }
  }

  console.log(`  Done! Upserted ${upserted} file embeddings.`);
}

async function main() {
  console.log("Generating embeddings for all skills and files...");
  await embedSkills();
  await embedFiles();
  console.log("\nAll done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
