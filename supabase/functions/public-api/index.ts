import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    // Initialize Supabase admin client to bypass RLS for API key validation
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate the API key (assuming key_hash logic was implemented, but here we just check raw token for demo)
    // In production, you would hash the incoming token and check against api_keys.key_hash
    // We will do a basic lookup for demonstration
    const { data: apiKeyRow, error: apiError } = await supabase
      .from("api_keys")
      .select("*")
      .eq("key_hash", token) // simplistic check
      .is("revoked_at", null)
      .single();

    if (apiError || !apiKeyRow) {
      return new Response(JSON.stringify({ error: "Invalid or revoked API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update last_used_at
    await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKeyRow.id);

    // Parse URL for routing
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop(); // Simplistic routing (e.g. /public-api/assets)

    if (req.method === "GET" && path === "assets") {
      const { data, error } = await supabase.from("assets").select("id, code, name, status, current_value");
      if (error) throw error;
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "GET" && path === "events") {
      const { data, error } = await supabase.from("events").select("id, name, start_at, end_at, status");
      if (error) throw error;
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
