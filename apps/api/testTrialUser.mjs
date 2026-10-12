import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "http://127.0.0.1:54321",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
);

const email = process.argv[2] || "trial-test@example.com";
const { data: existing } = await supabase.auth.admin.listUsers();
const found = existing.users.find((u) => u.email === email);
if (found) await supabase.auth.admin.deleteUser(found.id);

const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
if (error) {
  console.error(error);
  process.exit(1);
}
console.log("email:", email);
console.log("action_link:", data.properties.action_link);
console.log("user_id:", data.user.id);
console.log("created_at:", data.user.created_at);
